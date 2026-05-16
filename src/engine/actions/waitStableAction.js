/**
 * waitStableAction.js — 像素穩定偵測原子動作
 *
 * 輪詢指定 ROI 區域的像素 hash，當連續 N 次結果相同時判定為穩定。
 * 這是 wait_stable 積木的底層實作。
 */
import { resolveROI } from '../roiResolver';
import { computePixelHash } from './captureAction';

/**
 * 等待指定 ROI 區域像素穩定
 * @param {HTMLVideoElement} videoEl - video 元素
 * @param {string|Object} roiOrName - ROI 名稱或座標
 * @param {Object} [options]
 * @param {number} [options.stableCount=3] - 需要連續穩定的次數
 * @param {number} [options.interval=200] - 輪詢間隔（ms）
 * @param {number} [options.timeout=30000] - 超時（ms）
 * @param {{ current: boolean }} [options.cancelRef] - 取消旗標
 * @returns {Promise<{ stable: boolean, elapsed: number }>}
 */
export async function waitStable(videoEl, roiOrName, options = {}) {
    const {
        stableCount = 3,
        interval = 200,
        timeout = 30000,
        cancelRef,
    } = options;

    const roi = typeof roiOrName === 'string'
        ? resolveROI(roiOrName)
        : roiOrName;

    if (!roi) {
        throw new Error(`[waitStable] 無法解析 ROI: ${JSON.stringify(roiOrName)}`);
    }

    const startTime = Date.now();
    let lastHash = '';
    let consecutiveCount = 0;

    while (Date.now() - startTime < timeout) {
        if (cancelRef?.current) {
            throw new Error('cancelled');
        }

        const currentHash = computePixelHash(videoEl, roi);

        if (currentHash && currentHash === lastHash) {
            consecutiveCount++;
            if (consecutiveCount >= stableCount) {
                return {
                    stable: true,
                    elapsed: Date.now() - startTime,
                };
            }
        } else {
            consecutiveCount = 0;
            lastHash = currentHash;
        }

        await new Promise(r => setTimeout(r, interval));
    }

    // 超時 → 拋出錯誤（讓 errorPolicy 機制攔截）
    const err = new Error(`[waitStable] 超時 ${timeout}ms，${JSON.stringify(roiOrName)} 未達穩定`);
    err.waitStableResult = { stable: false, elapsed: Date.now() - startTime };
    throw err;
}
