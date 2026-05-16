/**
 * gridShapeUtils.js — 非方格盤面工具函數
 *
 * 核心設計：透過 reelHeights (每轉軸可見列數) 衍生出 gridMask 遮罩矩陣，
 * 所有消費端統一讀取 mask 來判斷格子是否可見。
 *
 * 向下相容：沒有 reelHeights 或全部等於 rows 時，所有格子都可見。
 */

/**
 * 從 template 計算遮罩矩陣（true = 可見格子）
 * 採用垂直置中：較短轉軸上下留空
 * @param {Object} template - { rows, cols, reelHeights? }
 * @returns {boolean[][]} rows × cols 遮罩矩陣
 */
export function getGridMask(template) {
    const { rows, cols, reelHeights } = template;
    if (!rows || !cols) return [];

    // 如果沒有 reelHeights 或全部等於 rows → 全部可見（向下相容）
    if (!reelHeights || !Array.isArray(reelHeights) || reelHeights.every(h => h >= rows)) {
        return Array.from({ length: rows }, () => Array(cols).fill(true));
    }

    const mask = Array.from({ length: rows }, () => Array(cols).fill(false));
    for (let c = 0; c < cols; c++) {
        const h = Math.min(reelHeights[c] || rows, rows);
        const offset = Math.ceil((rows - h) / 2); // 垂直置中（奇數差時空格在頂部，匹配遊戲視覺）
        for (let r = offset; r < offset + h; r++) {
            mask[r][c] = true;
        }
    }
    return mask;
}

/**
 * 判斷是否為非標準方格盤面
 * @param {Object} template
 * @returns {boolean}
 */
export function isIrregularGrid(template) {
    if (!template?.reelHeights || !Array.isArray(template.reelHeights)) return false;
    return template.reelHeights.some(h => h !== template.rows);
}

/**
 * 取得某轉軸的起始 row offset（垂直置中）
 * @param {Object} template
 * @param {number} col
 * @returns {number}
 */
export function getReelOffset(template, col) {
    if (!template?.reelHeights || !Array.isArray(template.reelHeights)) return 0;
    const h = template.reelHeights[col] || template.rows;
    return Math.ceil((template.rows - h) / 2);
}

/**
 * 取得盤面可見格子總數
 * @param {Object} template
 * @returns {number}
 */
export function getVisibleCellCount(template) {
    if (!template?.reelHeights || !Array.isArray(template.reelHeights)) {
        return (template?.rows || 0) * (template?.cols || 0);
    }
    return template.reelHeights.reduce((sum, h) => sum + Math.min(h, template.rows), 0);
}
