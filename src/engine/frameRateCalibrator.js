/**
 * frameRateCalibrator.js — 自動幀率校準邏輯
 *
 * 從 useKeyframeExtractor.js 抽出 (Phase A — SRP 重構)
 * 純函數，無 React 依賴
 */

import { getCachedFrameRate, getGhostThreshold } from '../utils/displayUtils';

/**
 * 建立校準器初始狀態
 * @returns {Object} 校準器狀態物件
 */
export function createCalibrationState() {
    return {
        ghostThresholdSec: getGhostThreshold(),
        isCalibrated: !!getCachedFrameRate(),
        calibrationDone: false,
        rafDeltas: [],
        lastRafTime: -1,
    };
}

/**
 * 處理單一 RAF 幀的校準數據
 * @param {Object} calState - 校準器狀態（會就地修改）
 * @param {number} rafTimestamp - requestAnimationFrame timestamp
 * @returns {boolean} 是否剛完成校準
 */
export function processCalibrationFrame(calState, rafTimestamp) {
    if (calState.isCalibrated || calState.calibrationDone) {
        if (rafTimestamp) calState.lastRafTime = rafTimestamp;
        return false;
    }

    if (rafTimestamp && calState.lastRafTime > 0) {
        calState.rafDeltas.push(rafTimestamp - calState.lastRafTime);
        if (calState.rafDeltas.length >= 30) {
            const sorted = [...calState.rafDeltas].sort((a, b) => a - b);
            const fd = sorted[15]; // 中位數
            calState.ghostThresholdSec = (fd * 0.65) / 1000;
            calState.calibrationDone = true;
            try {
                const hz = Math.round(1000 / fd);
                localStorage.setItem('SLOT_DISPLAY_FRAME_RATE', JSON.stringify({
                    frameDuration: Math.round(fd * 10) / 10,
                    ghostThreshold: Math.round(fd * 0.65 * 10) / 10,
                    hz,
                    calibratedAt: new Date().toISOString()
                }));
                console.log(`🖥️ [幀率校準] 螢幕=${hz}Hz (幀間距=${fd.toFixed(1)}ms) → 幽靈幀閾值=${(fd * 0.65).toFixed(1)}ms`);
            } catch { /* ignore */ }

            if (rafTimestamp) calState.lastRafTime = rafTimestamp;
            return true;
        }
    }

    if (rafTimestamp) calState.lastRafTime = rafTimestamp;
    return false;
}
