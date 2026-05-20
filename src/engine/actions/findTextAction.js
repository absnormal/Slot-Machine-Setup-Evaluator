/**
 * findTextAction.js — 全螢幕文字搜尋原子動作
 *
 * 向 Python 後端發送 find_text 指令，掃描整個遊戲視窗。
 * 回傳匹配文字的百分比座標（與 ROI 系統一致）。
 */

/**
 * 向 Python 後端發送 find_text 指令
 * @param {WebSocket} ws - 已連線的 WebSocket
 * @param {string} text - 要搜尋的文字
 * @param {Object} [options]
 * @param {string} [options.matchMode='contains'] - 匹配模式 (contains | equals)
 * @param {number} [options.timeoutMs=15000] - WebSocket 回應超時
 * @returns {Promise<{found: boolean, text?: string, confidence?: number, roi?: {x,y,w,h}, all: Array}>}
 */
export async function findText(ws, text, options = {}) {
    const { matchMode = 'contains', timeoutMs = 15000 } = options;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('[findText] WebSocket 未連線');
    }

    return new Promise((resolve, reject) => {
        const requestId = `find_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const onMessage = (event) => {
            if (typeof event.data === 'string') {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'control_result' && msg.requestId === requestId) {
                        ws.removeEventListener('message', onMessage);
                        if (msg.success !== false) {
                            resolve(msg);
                        } else {
                            reject(new Error(msg.message || 'find_text 失敗'));
                        }
                    }
                } catch { /* binary frame */ }
            }
        };

        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({
            action: 'find_text',
            text,
            matchMode,
            requestId,
        }));

        // 超時保護
        setTimeout(() => {
            ws.removeEventListener('message', onMessage);
            reject(new Error(`find_text timeout after ${timeoutMs}ms`));
        }, timeoutMs);
    });
}
