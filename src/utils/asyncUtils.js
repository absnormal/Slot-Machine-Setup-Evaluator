/**
 * asyncUtils.js — 非同步工具函式
 */

/**
 * 受控並行池：以固定並行度處理陣列，支援進度回呼
 *
 * @param {Array} items - 待處理項目
 * @param {Function} fn - 處理函式 (item, index) => Promise<result>
 * @param {number} concurrency - 最大並行數（預設 8）
 * @param {Function} [onProgress] - 進度回呼 ({ current, total, item })
 * @returns {Promise<Array>} 結果陣列（保持原始順序）
 */
export async function parallelMap(items, fn, concurrency = 8, onProgress = null) {
    const results = new Array(items.length);
    let nextIndex = 0;

    const run = async () => {
        while (nextIndex < items.length) {
            const i = nextIndex++;
            results[i] = await fn(items[i], i);
            onProgress?.({ current: i + 1, total: items.length, item: items[i] });
        }
    };

    const workers = Math.min(concurrency, items.length);
    await Promise.all(Array.from({ length: workers }, () => run()));
    return results;
}

/**
 * canvas → blob URL（非同步，比 toDataURL 快 3x）
 * @param {HTMLCanvasElement} canvas
 * @param {string} type - MIME 類型
 * @param {number} quality - 壓縮品質 0~1
 * @returns {Promise<string>} blob URL
 */
export function canvasToBlobUrl(canvas, type = 'image/jpeg', quality = 0.6) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob ? URL.createObjectURL(blob) : '');
        }, type, quality);
    });
}
