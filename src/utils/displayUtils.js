/**
 * displayUtils.js — 螢幕幀率校準工具
 *
 * 使用 requestAnimationFrame 測量螢幕真實刷新間距，
 * 結果存入 localStorage，同一裝置不重複校準。
 * 無任何 React 依賴，可被任何模組 import 使用。
 */

const STORAGE_KEY = 'SLOT_DISPLAY_FRAME_RATE';
const CALIBRATION_FRAMES = 30;
const GHOST_MULTIPLIER = 0.65;  // 幽靈幀閾值 = frameDuration × 0.65

/**
 * 從 localStorage 讀取已校準的幀率資料
 * @returns {{ frameDuration: number, ghostThreshold: number, hz: number, calibratedAt: string } | null}
 */
export function getCachedFrameRate() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

/**
 * 取得幽靈幀閾值（秒）
 * 若有快取直接回傳，否則回傳 60Hz 的保守預設值
 * @returns {number} 閾值（秒），例如 60Hz → ~0.0108
 */
export function getGhostThreshold() {
    const cached = getCachedFrameRate();
    if (cached) return cached.ghostThreshold / 1000;
    return (16.7 * GHOST_MULTIPLIER) / 1000; // 預設 60Hz
}

/**
 * 執行幀率校準：用 RAF 測量 30 幀間距，取中位數
 * 結果自動存入 localStorage
 * @returns {Promise<{ frameDuration: number, ghostThreshold: number, hz: number }>}
 */
export function calibrateFrameRate() {
    return new Promise((resolve) => {
        const deltas = [];
        let lastTime = -1;
        let count = 0;

        const tick = (timestamp) => {
            if (lastTime > 0) {
                deltas.push(timestamp - lastTime);
                count++;
            }
            lastTime = timestamp;

            if (count < CALIBRATION_FRAMES) {
                requestAnimationFrame(tick);
            } else {
                // 取中位數（排除極端值）
                const sorted = [...deltas].sort((a, b) => a - b);
                const frameDuration = sorted[Math.floor(sorted.length / 2)];
                const ghostThreshold = frameDuration * GHOST_MULTIPLIER;
                const hz = Math.round(1000 / frameDuration);

                const result = {
                    frameDuration: Math.round(frameDuration * 10) / 10,
                    ghostThreshold: Math.round(ghostThreshold * 10) / 10,
                    hz,
                    calibratedAt: new Date().toISOString()
                };

                // 存入 localStorage
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
                } catch { /* quota exceeded, ignore */ }

                console.log(`🖥️ [幀率校準] 螢幕=${hz}Hz (幀間距=${result.frameDuration}ms) → 幽靈幀閾值=${result.ghostThreshold}ms`);
                resolve(result);
            }
        };

        requestAnimationFrame(tick);
    });
}
