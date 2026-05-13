/**
 * roiResolver.js — ROI 名稱解析器
 *
 * 將 Flow 積木中的 ROI 名稱（如 "SPIN"、"WIN"）
 * 對應到當前 Zustand store 中的實際座標。
 *
 * 設計原則：
 *   - Flow 只存 ROI 名稱，不存座標
 *   - 實際座標由當前載入的遊戲模板（Phase4Store）提供
 *   - 這個模組是兩者之間的橋接器
 */
import usePhase4Store from '../stores/usePhase4Store';

/**
 * ROI 名稱 → Store 欄位的映射表
 */
const ROI_NAME_MAP = {
    'SPIN':     'spinButtonROI',
    'REEL':     'reelROI',
    'WIN':      'winROI',
    'BAL':      'balanceROI',
    'BALANCE':  'balanceROI',
    'BET':      'betROI',
    'ORDER_ID': 'orderIdROI',
    'ORDERID':  'orderIdROI',
    'MULT':     'multiplierROI',
    'MULTIPLIER': 'multiplierROI',
};

/**
 * 解析單一 ROI 名稱 → 座標物件 {x, y, w, h}
 * @param {string} name - ROI 名稱（大小寫不敏感）
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
export function resolveROI(name) {
    const key = ROI_NAME_MAP[name?.toUpperCase()];
    if (!key) {
        console.warn(`[ROI Resolver] 未知的 ROI 名稱: "${name}"`);
        return null;
    }
    const roi = usePhase4Store.getState()[key];
    if (!roi) {
        console.warn(`[ROI Resolver] ROI "${name}" 在模板中未設定`);
        return null;
    }
    return roi;
}

/**
 * 批次解析多個 ROI 名稱
 * @param {string[]} names - ROI 名稱陣列
 * @returns {Object} { WIN: {x,y,w,h}, BAL: {x,y,w,h}, ... }
 */
export function resolveROIs(names) {
    const result = {};
    for (const name of names) {
        const roi = resolveROI(name);
        if (roi) result[name.toUpperCase()] = roi;
    }
    return result;
}

/**
 * 取得所有已知 ROI 的快照
 * @returns {Object}
 */
export function getAllROIs() {
    return usePhase4Store.getState().getRois();
}

/**
 * ROI 名稱對應的 OCR 小數位數
 * @param {string} name
 * @returns {number}
 */
export function getDecimalPlaces(name) {
    const store = usePhase4Store.getState();
    const upper = name?.toUpperCase();
    if (upper === 'BAL' || upper === 'BALANCE') {
        return store.balDecimalPlaces ?? store.ocrDecimalPlaces ?? 2;
    }
    if (upper === 'BET' || upper === 'ORDER_ID' || upper === 'ORDERID') {
        return 0;
    }
    return store.ocrDecimalPlaces ?? 2;
}

/**
 * 列出所有可用的 ROI 名稱（供 UI 下拉選單使用）
 */
export const AVAILABLE_ROIS = [
    { name: 'SPIN',     label: 'SPIN 按鈕',   category: 'control' },
    { name: 'REEL',     label: '盤面',         category: 'detection' },
    { name: 'WIN',      label: '贏分',         category: 'ocr' },
    { name: 'BAL',      label: '餘額',         category: 'ocr' },
    { name: 'BET',      label: '押注',         category: 'ocr' },
    { name: 'ORDER_ID', label: '注單號',       category: 'ocr' },
    { name: 'MULT',     label: '倍率',         category: 'ocr' },
];
