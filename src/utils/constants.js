// === 雲端資料庫設定 (Google Apps Script) ===
export const GAS_URL = "https://script.google.com/macros/s/AKfycbz4DvnLW4Xb_xHU499fZfO5ecGSozrTI5zKgxm9AJC3WiH2ztZ6lho5icwZA-KNE-SP/exec";
const GAS_TOKEN = "sme_2026_t1";

/** 組裝 GAS GET URL，自動附加 token */
export function gasUrl(queryString = '') {
    const sep = queryString ? '&' : '';
    return `${GAS_URL}?token=${GAS_TOKEN}${sep}${queryString}`;
}

/** 組裝 GAS POST body，自動附加 token */
export function gasPost(bodyObj) {
    return JSON.stringify({ ...bodyObj, token: GAS_TOKEN });
}

// AI API Key (預設為空，使用者可在設定中自訂)
export const apiKey = "";
