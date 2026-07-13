import { fetchWithRetry } from './helpers';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GENERATE_METHOD = 'generateContent';

/** 偵測失敗時的內建候選（依序嘗試，優先追蹤 Google 的 -latest 別名） */
export const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

// 模型清單快取（同一把 key 於一個 session 內不重複列）
let _modelCache = { key: null, models: null };

/**
 * 列出這把 key 支援 generateContent 的模型（去掉 models/ 前綴）。
 * @param {string} apiKey
 * @returns {Promise<string[]>}
 */
export async function listGeminiModels(apiKey) {
    if (!apiKey) throw new Error('缺少 Gemini API Key');
    const res = await fetch(`${GEMINI_BASE}/models?key=${apiKey}&pageSize=1000`);
    if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error?.message || `無法取得模型清單 (status ${res.status})`);
    }
    const data = await res.json();
    const models = (data.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes(GENERATE_METHOD))
        .map(m => (m.name || '').replace(/^models\//, ''))
        .filter(Boolean);
    _modelCache = { key: apiKey, models };
    return models;
}

/**
 * 純函式：從清單挑一個視覺模型。
 * 優先序：使用者指定(且清單有) → gemini-flash-latest → 最新 flash 穩定版 → 任一可用。
 * @param {string[]} models
 * @param {string} [preferred]
 * @returns {string|null}
 */
export function pickVisionModel(models, preferred) {
    const list = Array.isArray(models) ? models : [];
    if (preferred && list.includes(preferred)) return preferred;
    if (list.includes('gemini-flash-latest')) return 'gemini-flash-latest';
    const flashes = list.filter(m => /flash/i.test(m) && !/exp|thinking|preview/i.test(m));
    const scored = flashes
        .map(m => ({ m, ver: parseFloat((m.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0') }))
        .sort((a, b) => b.ver - a.ver || b.m.localeCompare(a.m));
    if (scored.length) return scored[0].m;
    return list[0] || null;
}

/** 是否為「模型不存在／不支援」類錯誤（可靠 fallback 觸發條件；不含泛用 400） */
function isModelUnavailableError(err) {
    const msg = String(err?.message || err || '');
    return /not found|not supported|unsupported|does not exist|NOT_FOUND|no longer available|deprecat|status: 404/i.test(msg);
}

/** 決定初始要用的模型：preferred 有值直接用；否則列清單挑一個；列失敗退回內建候選 */
async function resolveModel(apiKey, preferred) {
    if (preferred) return preferred;
    try {
        const models = (_modelCache.key === apiKey && _modelCache.models)
            ? _modelCache.models
            : await listGeminiModels(apiKey);
        return pickVisionModel(models, '') || FALLBACK_MODELS[0];
    } catch {
        return FALLBACK_MODELS[0];
    }
}

/**
 * 呼叫 AI Vision API（支援 Gemini 雲端 / OpenAI-compatible 地端）
 *
 * @param {object} params
 * @param {string} params.apiKey          - Gemini API key
 * @param {string} [params.model]         - Gemini model name（留空＝自動偵測可用視覺模型）
 * @param {Array}  params.parts           - Content parts (images + text)
 * @param {object} params.generationConfig - Gemini generation config
 * @param {string} [params.systemInstruction] - Optional system instruction
 * @param {'gemini'|'local'} [params.provider='gemini'] - API provider
 * @param {string} [params.localEndpoint] - Local model base URL
 * @param {string} [params.localModel]    - Local model name
 * @param {string} [params.localApiKey]   - Local model API key
 * @param {(model:string)=>void} [params.onModelResolved] - 實際使用的模型回呼（供設定快取）
 * @returns {Promise<string>} Raw response text from the model
 */
export async function callGeminiAPI({
    apiKey,
    model,
    parts,
    generationConfig,
    systemInstruction,
    provider = 'gemini',
    localEndpoint,
    localModel,
    localApiKey,
    onModelResolved,
}) {
    if (provider === 'local') {
        return callOpenAICompat({ localEndpoint, localModel, localApiKey, parts, systemInstruction });
    }
    return callGeminiNative({ apiKey, model, parts, generationConfig, systemInstruction, onModelResolved });
}

// ── Gemini native（模型可自動偵測 + 停用時自動換模型重試）──────────────
async function callGeminiNative({ apiKey, model, parts, generationConfig, systemInstruction, onModelResolved }) {
    const useModel = model || await resolveModel(apiKey, '');
    if (!model && useModel) onModelResolved?.(useModel);

    try {
        return await doGenerate({ apiKey, model: useModel, parts, generationConfig, systemInstruction });
    } catch (err) {
        if (!isModelUnavailableError(err)) throw err;

        // 模型停用 → 強制重列一次挑新模型，再退回內建候選逐一嘗試
        let fresh = null;
        try {
            const models = await listGeminiModels(apiKey);
            fresh = pickVisionModel(models, '');
        } catch { /* 列不到就走候選清單 */ }

        const candidates = (fresh && fresh !== useModel ? [fresh] : [])
            .concat(FALLBACK_MODELS.filter(m => m !== useModel && m !== fresh));

        for (const cand of candidates) {
            try {
                const text = await doGenerate({ apiKey, model: cand, parts, generationConfig, systemInstruction });
                onModelResolved?.(cand);
                return text;
            } catch (e2) {
                if (!isModelUnavailableError(e2)) throw e2; // 非模型問題（如安全阻擋）直接拋出
            }
        }
        throw new Error(`Gemini 找不到可用的視覺模型（原始錯誤：${err.message}）。請到 ⚙️ 設定確認 API Key，或按「偵測可用模型」。`);
    }
}

async function doGenerate({ apiKey, model, parts, generationConfig, systemInstruction }) {
    const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;
    const payload = { contents: [{ role: 'user', parts }], generationConfig };
    if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };

    const result = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error('AI 無回應，請確認 API Key 是否正確。');
    }
    return text;
}

// ── OpenAI-compatible（地端模型）──────────────────────────────
async function callOpenAICompat({ localEndpoint, localModel, localApiKey, parts, systemInstruction }) {
    // 偵測 GitHub Pages 環境（HTTPS + 非 localhost），發出警告
    const isGitHubPages =
        typeof window !== 'undefined' &&
        window.location.protocol === 'https:' &&
        !window.location.hostname.includes('localhost') &&
        !window.location.hostname.includes('127.0.0.1');

    if (isGitHubPages && localEndpoint?.startsWith('http://')) {
        throw new Error(
            '⚠️ 地端模型在 GitHub Pages 上無法使用（瀏覽器 Mixed Content 限制）。\n' +
            '請在本機 dev 環境（npm run dev）使用地端模式，或改用 Gemini 雲端模式。'
        );
    }

    // 將 Gemini parts 格式轉換為 OpenAI messages content 格式
    const content = parts.map((p) => {
        if (p.inlineData) {
            // 圖片：base64 → image_url
            return {
                type: 'image_url',
                image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` },
            };
        }
        return { type: 'text', text: p.text ?? '' };
    });

    const messages = [];
    if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content });

    const endpoint = localEndpoint?.replace(/\/$/, ''); // 去掉尾部斜線
    const result = await fetchWithRetry(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localApiKey || ''}`,
        },
        body: JSON.stringify({ model: localModel, messages }),
    });

    const text = result.choices?.[0]?.message?.content;
    if (!text) {
        throw new Error('地端模型無回應，請確認 Endpoint / Model / API Key 設定正確。');
    }
    return stripMarkdownCodeFence(text);
}

/**
 * 從地端模型回應中擷取純 JSON
 * 處理常見的 markdown code fence 包裝：```json { } ``` 或 ``` { } ```
 * 策略：找第一個 { 或 [ 到最後一個 } 或 ]
 */
function stripMarkdownCodeFence(text) {
    if (!text) return text;
    const jsonStart = text.search(/[{[]/);
    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    const jsonEnd = Math.max(lastBrace, lastBracket);
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        return text.slice(jsonStart, jsonEnd + 1);
    }
    return text.trim();
}
