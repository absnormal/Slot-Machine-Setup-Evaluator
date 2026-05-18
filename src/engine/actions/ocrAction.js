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

/** ROI 名稱 → Python 回傳的 key 名稱（集中管理，ocrBatch 和 ocrRead 共用）*/
function roiToKey(roiName) {
    const upper = roiName.toUpperCase();
    if (upper === 'BAL' || upper === 'BALANCE') return 'balance';
    if (upper === 'ORDER_ID' || upper === 'ORDERID') return 'orderId';
    if (upper === 'MULT' || upper === 'MULTIPLIER') return 'multiplier';
    if (upper === 'WIN') return 'win';
    if (upper === 'BET') return 'bet';
    return roiName.toLowerCase();
}

/**
 * 批次讀取多個 ROI 的 OCR 值
 * @param {WebSocket} ws
 * @param {string[]} roiNames - ROI 名稱陣列（如 ['WIN', 'BAL', 'BET', 'ORDER_ID']）
 * @param {string|null} [imageBase64] - 可選，提供截圖的 base64 JPEG（有值時 Python 不再自行截圖）
 * @returns {Promise<Object>} { win: '500.00', balance: '12345.67', ... }
 */
export async function ocrBatch(ws, roiNames, imageBase64 = null, mode = 'number') {
    const rois = [];

    for (const name of roiNames) {
        const roi = resolveROI(name);
        if (!roi) {
            console.warn(`[ocrAction] 跳過無法解析的 ROI: ${name}`);
            continue;
        }

        rois.push({
            name: roiToKey(name),
            roi,
            decimalPlaces: getDecimalPlaces(name),
            label: name.toUpperCase(),
            mode,
        });
    }

    if (rois.length === 0) {
        throw new Error('[ocrAction] 沒有有效的 ROI 可讀取');
    }

    const cmd = { action: 'ocr_rois', rois };
    if (imageBase64) {
        cmd.image = imageBase64;
    }

    const result = await sendWSCommand(ws, cmd);
    return result.ocrResults || {};
}

/**
 * 讀取單一 ROI 的 OCR 值
 * @param {WebSocket} ws
 * @param {string} roiName - ROI 名稱
 * @returns {Promise<string>} OCR 結果字串
 */
export async function ocrRead(ws, roiName, mode = 'number') {
    const results = await ocrBatch(ws, [roiName], null, mode);
    return results[roiToKey(roiName)] ?? '';
}
