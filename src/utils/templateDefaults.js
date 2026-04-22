/**
 * 模板設定欄位的集中式預設值 — Single Source of Truth
 *
 * 當新增 Q&A 設定或偵測參數時，只需在此處加一行預設值，
 * 載入/存檔/匯出/重置會自動套用。
 */

export const TEMPLATE_FIELD_DEFAULTS = {
    // ── Q&A 設定 ──
    hasDoubleSymbol:          false,
    hasMultiplierReel:        false,
    hasDynamicMultiplier:     false,
    multiplierCalcType:       'none',
    hasCashCollectFeature:    false,
    requiresCollectToWin:     true,
    hasJackpot:               false,
    hasBidirectionalPaylines: false,
    hasAdjustableLines:       false,
    // ── Phase 4 偵測參數 ──
    motionCoverageMin:        60,
    vLineThreshold:           0.25,
    ocrDecimalPlaces:         2,
};

/**
 * 將模板資料與預設值合併：有值用模板值，無值用預設值
 * @param {object} data — 從雲端讀取的原始模板資料
 * @returns {object} — 合併後的完整資料（不修改原始物件）
 */
export function applyDefaults(data) {
    const result = { ...data };

    // --- 向後兼容：舊版模板並未存儲 hasJackpot 與 hasCashCollectFeature ---
    if (result.hasJackpot === undefined && result.jpConfig) {
        result.hasJackpot = Object.keys(result.jpConfig).some(k => result.jpConfig[k] !== '');
    }

    if (result.hasCashCollectFeature === undefined) {
        const reqCollect = result.requiresCollectToWin !== undefined ? String(result.requiresCollectToWin).toLowerCase() === 'true' : true;
        const isJpActive = result.jpConfig ? Object.keys(result.jpConfig).some(k => result.jpConfig[k] !== '') : false;
        result.hasCashCollectFeature = isJpActive || reqCollect === false;
    }
    // -------------------------------------------------------------------------

    for (const [key, defaultVal] of Object.entries(TEMPLATE_FIELD_DEFAULTS)) {
        if (result[key] === undefined || result[key] === null) {
            result[key] = defaultVal;
        }
    }

    // --- 歷史共業校正：若未開啟動態乘倍，強制將計算方式設為 'none' ---
    // (解決舊存檔強制綁定 'product' 導致 UI 按鈕亮起錯誤的問題)
    if (result.hasDynamicMultiplier === false) {
        result.multiplierCalcType = 'none';
    }

    return result;
}
