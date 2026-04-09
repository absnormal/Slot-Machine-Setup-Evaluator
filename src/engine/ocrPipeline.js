/**
 * ocrPipeline.js — OCR 管線
 *
 * 負責畫面截圖、ROI 縮圖產生、PaddleOCR 裁切辨識。
 * 透過全域 Queue 保護，確保單一 Worker 不會因高頻調用導致 WASM 記憶體問題。
 */

/**
 * 從 canvas 擷取全幀快照
 */
export function captureFullFrame(video) {
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(video, 0, 0);
    return c;
}

/**
 * 從 canvas 產生盤面 ROI 縮圖 URL
 */
export function generateThumbUrl(canvas, roi) {
    try {
        const tc = document.createElement('canvas');
        const cw = Math.floor(canvas.width * (roi.w / 100));
        const ch = Math.floor(canvas.height * (roi.h / 100));
        const cx = Math.floor(canvas.width * (roi.x / 100));
        const cy = Math.floor(canvas.height * (roi.y / 100));
        tc.width = cw;
        tc.height = ch;
        const tCtx = tc.getContext('2d');
        tCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
        return tc.toDataURL('image/jpeg', 0.6);
    } catch {
        return canvas.toDataURL('image/jpeg', 0.5);
    }
}

// 建立全域排隊機制，確保只有一個 Worker 實例時不會因為高頻調用導致內部 WASM 記憶體擠爆或阻塞
let ocrGlobalQueue = Promise.resolve();

/**
 * 裁切 ROI → 放大 → 原彩影像 → PaddleOCR (透過全域 Queue 保護)
 */
export async function cropAndOCR(canvas, roi, ocrWorker, decimalPlaces, label = '未知') {
    if (!roi || !ocrWorker || !canvas) return '';

    return new Promise((resolve) => {
        ocrGlobalQueue = ocrGlobalQueue.then(async () => {
            try {
                const cropCanvas = document.createElement('canvas');
                const cw = Math.floor(canvas.width * (roi.w / 100));
                const ch = Math.floor(canvas.height * (roi.h / 100));
                const cx = Math.floor(canvas.width * (roi.x / 100));
                const cy = Math.floor(canvas.height * (roi.y / 100));
                if (cw < 2 || ch < 2) return resolve('');

                let scale = 2;
                if (label === 'WIN' && ch >= 20) {
                    scale = 40 / ch; 
                }

                // [關鍵修復] 加上 Padding: DBNet 如果文字太貼齊邊緣，會辨識不到
                const PADDING = 30;
                cropCanvas.width = Math.floor(cw * scale) + (PADDING * 2);
                cropCanvas.height = Math.floor(ch * scale) + (PADDING * 2);
                const ctx = cropCanvas.getContext('2d');
                
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

                ctx.drawImage(canvas, cx, cy, cw, ch, PADDING, PADDING, cw * scale, ch * scale);

                // ⚠️ 彩圖直出：我們不再手動運算灰階二值化，把這項工作全權託付給 Paddle 神經網路
                const detectedLines = await ocrWorker.detect(cropCanvas.toDataURL('image/png'));

                // 將多行字串陣列合併
                const rawText = (detectedLines || []).map(t => t.text).join(' ').trim();

                // 後處理：PaddleOCR 偶爾會誤認背景裝飾為字母 (例如 $ 或 WIN)，
                // 這裡設定嚴密屏障，只保留純數字 (0-9)、小數點 (.) 與千分位逗號 (,)
                const validText = rawText.replace(/[^0-9.,]/g, '');
                // 最後移除逗號以便後續 JavaScript 解析，並清掉頭尾不小心沾到的孤立小數點
                const resultStr = validText.replace(/,/g, '').replace(/^\.+|\.+$/g, '') || "0";

                if (label === 'WIN' || label === 'BALANCE') {
                    // debug logging placeholder
                }

                resolve(resultStr);
            } catch (err) {
                console.warn('Quick PaddleOCR error:', err);
                resolve('');
            }
        }); // 結束 queue.then
    }); // 結束 Promise
}
