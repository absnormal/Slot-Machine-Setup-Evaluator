/**
 * clickAction.js — 點擊 ROI 原子動作
 *
 * 透過 WebSocket 向 Python 後端發送點擊指令。
 * 支援 ROI 名稱（由 roiResolver 解析）或直接座標。
 */
import { resolveROI } from '../roiResolver';

/**
 * 點擊指定 ROI
 * @param {WebSocket} ws - 已連線的 WebSocket
 * @param {string|Object} roiOrName - ROI 名稱（如 "SPIN"）或座標物件 {x,y,w,h}
 * @param {Object} [options]
 * @param {string} [options.button='left'] - 滑鼠按鍵
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function clickROI(ws, roiOrName, options = {}) {
    const { button = 'left' } = options;

    // 解析 ROI
    const roi = typeof roiOrName === 'string'
        ? resolveROI(roiOrName)
        : roiOrName;

    if (!roi) {
        throw new Error(`[clickAction] 無法解析 ROI: ${JSON.stringify(roiOrName)}`);
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('[clickAction] WebSocket 未連線');
    }

    return new Promise((resolve, reject) => {
        const requestId = `click_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const onMessage = (event) => {
            if (typeof event.data === 'string') {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'control_result' && msg.requestId === requestId) {
                        ws.removeEventListener('message', onMessage);
                        if (msg.success) resolve(msg);
                        else reject(new Error(msg.message));
                    }
                } catch { /* 非 JSON (binary frame) */ }
            }
        };

        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({
            action: 'click_roi',
            roi,
            button,
            requestId,
        }));

        // 超時保護
        setTimeout(() => {
            ws.removeEventListener('message', onMessage);
            resolve({ success: true, message: 'click timeout - assumed ok' });
        }, 3000);
    });
}
