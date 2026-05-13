/**
 * waitChangeAction.js — 像素變化偵測原子動作
 *
 * 與 waitStable 相反：等待指定 ROI 區域發生像素變化後才繼續。
 * 適用於偵測「開始旋轉」或「畫面更新」等情境。
 */
import { resolveROI } from '../roiResolver';
import { computePixelHash } from './captureAction';

/**
 * 等待指定 ROI 區域發生像素變化
 * @param {HTMLVideoElement} videoEl - video 元素
 * @param {string|Object} roiOrName - ROI 名稱或座標
 * @param {Object} [options]
 * @param {number} [options.changeCount=2] - 需要連續偵測到變化的次數（防閃爍誤判）
 * @param {number} [options.interval=200] - 輪詢間隔（ms）
 * @param {number} [options.timeout=30000] - 超時（ms）
 * @param {{ current: boolean }} [options.cancelRef] - 取消旗標
 * @returns {Promise<{ changed: boolean, elapsed: number }>}
 */
export async function waitChange(videoEl, roiOrName, options = {}) {
    const {
        changeCount = 2,
        interval = 200,
        timeout = 30000,
        cancelRef,
    } = options;

    const roi = typeof roiOrName === 'string'
        ? resolveROI(roiOrName)
        : roiOrName;

    if (!roi) {
        throw new Error(`[waitChange] 無法解析 ROI: ${JSON.stringify(roiOrName)}`);
    }

    const startTime = Date.now();
    // 先取一個基準 hash
    const baselineHash = computePixelHash(videoEl, roi);
    let consecutiveChanges = 0;

    while (Date.now() - startTime < timeout) {
        if (cancelRef?.current) {
            throw new Error('cancelled');
        }

        await new Promise(r => setTimeout(r, interval));

        const currentHash = computePixelHash(videoEl, roi);

        if (currentHash && currentHash !== baselineHash) {
            consecutiveChanges++;
            if (consecutiveChanges >= changeCount) {
                return {
                    changed: true,
                    elapsed: Date.now() - startTime,
                };
            }
        } else {
            consecutiveChanges = 0;
        }
    }

    // 超時
    console.warn(`[waitChange] 超時 ${timeout}ms，未偵測到變化`);
    return {
        changed: false,
        elapsed: Date.now() - startTime,
    };
}
