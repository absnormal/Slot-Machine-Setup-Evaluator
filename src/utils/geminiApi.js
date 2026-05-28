import { fetchWithRetry } from './helpers';

/**
 * 呼叫 Gemini Vision API
 *
 * 統一封裝 URL 組裝、payload 建構、fetchWithRetry 呼叫、
 * 回應文字擷取等重複邏輯，供所有 hook 共用。
 *
 * @param {object} params
 * @param {string} params.apiKey - API key
 * @param {string} params.model - Model name (e.g., 'gemini-2.5-flash')
 * @param {Array}  params.parts - Content parts (images + text)
 * @param {object} params.generationConfig - Generation config object
 * @param {string} [params.systemInstruction] - Optional system instruction text
 * @returns {Promise<string>} Raw response text from the model
 */
export async function callGeminiAPI({ apiKey, model, parts, generationConfig, systemInstruction }) {
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
