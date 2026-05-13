/**
 * ocrAction.js — OCR 讀取原子動作
 *
 * 透過 WebSocket 呼叫 Python 後端的 ocr_rois 進行批次 OCR。
 * 支援 ROI 名稱解析與 OCR 參數自動帶入。
 */
import { resolveROI, getDecimalPlaces } from '../roiResolver';

/**
 * 向 Python 後端發送通用指令並等待回應
 * @private
 */
function sendWSCommand(ws, command, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            reject(new Error('[ocrAction] WebSocket 未連線'));
            return;
        }

        const requestId = `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const payload = { ...command, requestId };

        const onMessage = (event) => {
            if (typeof event.data === 'string') {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'control_result' && msg.requestId === requestId) {
                        ws.removeEventListener('message', onMessage);
                        if (msg.success) resolve(msg);
                        else reject(new Error(msg.message));
                    }
                } catch { /* binary frame */ }
            }
        };

        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify(payload));

        setTimeout(() => {
            ws.removeEventListener('message', onMessage);
            reject(new Error(`OCR timeout after ${timeoutMs}ms`));
        }, timeoutMs);
    });
}

/**
 * 批次讀取多個 ROI 的 OCR 值
 * @param {WebSocket} ws
 * @param {string[]} roiNames - ROI 名稱陣列（如 ['WIN', 'BAL', 'BET', 'ORDER_ID']）
 * @returns {Promise<Object>} { WIN: '500.00', BAL: '12345.67', ... }
 */
export async function ocrBatch(ws, roiNames) {
    const rois = [];

    for (const name of roiNames) {
        const roi = resolveROI(name);
        if (!roi) {
            console.warn(`[ocrAction] 跳過無法解析的 ROI: ${name}`);
            continue;
        }

        const upper = name.toUpperCase();
        rois.push({
            name: upper === 'BAL' || upper === 'BALANCE' ? 'balance'
                : upper === 'ORDER_ID' || upper === 'ORDERID' ? 'orderId'
                : upper === 'MULT' || upper === 'MULTIPLIER' ? 'multiplier'
                : name.toLowerCase(),
            roi,
            decimalPlaces: getDecimalPlaces(name),
            label: upper,
        });
    }

    if (rois.length === 0) {
        throw new Error('[ocrAction] 沒有有效的 ROI 可讀取');
    }

    const result = await sendWSCommand(ws, { action: 'ocr_rois', rois });
    return result.ocrResults || {};
}

/**
 * 讀取單一 ROI 的 OCR 值
 * @param {WebSocket} ws
 * @param {string} roiName - ROI 名稱
 * @returns {Promise<string>} OCR 結果字串
 */
export async function ocrRead(ws, roiName) {
    const results = await ocrBatch(ws, [roiName]);
    const key = roiName.toLowerCase();
    return results[key] || '';
}
