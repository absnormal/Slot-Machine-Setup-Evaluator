/**
 * waitChangeAction.js — OCR 數值變化偵測原子動作
 *
 * 流程：
 *   1. 讀取基準 OCR 值 → 轉數字
 *   2. 持續輪詢，等到讀到的數字「與基準不同」
 *   3. 偵測到變化後，該新數字必須「連續穩定 N 次」才算通過
 *      → 防止跑分動畫中間數字一直跳動就提早通過
 *
 * 數字轉換規則：
 *   - 移除逗號後 parseFloat → "0.00" 和 "0" 都變成 0
 *   - 無法轉換的字串視為 NaN，不參與比對（繼續等）
 */
import { ocrRead } from './ocrAction';

/**
 * 將 OCR 字串正規化為數字
 * "1,234.56" → 1234.56 / "0.00" → 0 / "" → 0 / null → 0
 */
function parseOcrNumber(raw) {
    if (raw === null || raw === undefined || raw === '') return 0;
    const cleaned = String(raw).replace(/,/g, '').trim();
    if (cleaned === '') return 0;
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

/**
 * 等待指定 OCR ROI 的數值發生變化，且新值穩定後才繼續
 * @param {WebSocket} ws - WebSocket 連線
 * @param {string} roiName - OCR ROI 名稱（如 'WIN', 'BAL', 'BET'）
 * @param {Object} [options]
 * @param {number} [options.changeCount=2] - 新值需連續穩定的次數
 * @param {number} [options.interval=200] - 輪詢間隔（ms）
 * @param {number} [options.timeout=30000] - 超時（ms）
 * @param {{ current: boolean }} [options.cancelRef] - 取消旗標
 * @returns {Promise<{ changed: boolean, elapsed: number, oldValue: number, newValue: number }>}
 */
export async function waitChange(ws, roiName, options = {}) {
    const {
        changeCount = 2,
        interval = 200,
        timeout = 30000,
        cancelRef,
    } = options;

    const startTime = Date.now();

    // ── Step 1：讀取基準值 ──
    let baselineRaw;
    try {
        baselineRaw = await ocrRead(ws, roiName);
    } catch (e) {
        throw new Error(`[waitChange] 無法讀取基準 OCR (${roiName}): ${e.message}`);
    }
    const baselineNum = parseOcrNumber(baselineRaw);

    // ── Step 2+3：輪詢直到「新數字 ≠ 基準」且「連續穩定 N 次」──
    let stableCount = 0;      // 新值連續穩定計數
    let lastChangedNum = null; // 上一次偵測到的「新值」

    while (Date.now() - startTime < timeout) {
        if (cancelRef?.current) {
            throw new Error('cancelled');
        }

        await new Promise(r => setTimeout(r, interval));

        let currentRaw;
        try {
            currentRaw = await ocrRead(ws, roiName);
        } catch {
            // OCR 暫時失敗 → 重置穩定計數，繼續等
            stableCount = 0;
            lastChangedNum = null;
            continue;
        }

        const currentNum = parseOcrNumber(currentRaw);

        // 與基準相同 → 還沒變化，重置
        if (currentNum === baselineNum) {
            stableCount = 0;
            lastChangedNum = null;
            continue;
        }

        // 與基準不同 → 進入穩定確認階段
        if (currentNum === lastChangedNum) {
            // 新值與上次一樣 → 穩定計數 +1
            stableCount++;
        } else {
            // 新值又跳了（跑分動畫中） → 重新計數
            lastChangedNum = currentNum;
            stableCount = 1;
        }

        if (stableCount >= changeCount) {
            return {
                changed: true,
                elapsed: Date.now() - startTime,
                oldValue: baselineNum,
                newValue: currentNum,
            };
        }
    }

    // 超時
    console.warn(`[waitChange] 超時 ${timeout}ms，OCR 值未穩定變化 (${roiName}: baseline=${baselineNum})`);
    return {
        changed: false,
        elapsed: Date.now() - startTime,
        oldValue: baselineNum,
        newValue: lastChangedNum,
    };
}
