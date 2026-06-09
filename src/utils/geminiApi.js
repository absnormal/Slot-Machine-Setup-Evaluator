import { fetchWithRetry } from './helpers';

/**
 * 呼叫 AI Vision API（支援 Gemini 雲端 / OpenAI-compatible 地端）
 *
 * @param {object} params
 * @param {string} params.apiKey          - Gemini API key
 * @param {string} params.model           - Gemini model name (e.g., 'gemini-2.5-flash')
 * @param {Array}  params.parts           - Content parts (images + text)
 * @param {object} params.generationConfig - Gemini generation config
 * @param {string} [params.systemInstruction] - Optional system instruction
 * @param {'gemini'|'local'} [params.provider='gemini'] - API provider
 * @param {string} [params.localEndpoint] - Local model base URL
 * @param {string} [params.localModel]    - Local model name
 * @param {string} [params.localApiKey]   - Local model API key
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
}) {
    if (provider === 'local') {
        return callOpenAICompat({ localEndpoint, localModel, localApiKey, parts, systemInstruction });
    }
    return callGeminiNative({ apiKey, model, parts, generationConfig, systemInstruction });
}

// ── Gemini native（原有邏輯不變）──────────────────────────────
async function callGeminiNative({ apiKey, model, parts, generationConfig, systemInstruction }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ role: 'user', parts }],
        generationConfig,
    };

    if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

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
