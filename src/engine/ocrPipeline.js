/**
 * ocrPipeline.js — OCR 管線
 *
 * 負責畫面截圖、ROI 縮圖產生、PaddleOCR 裁切辨識。
 * 透過全域 Queue 保護，確保單一 Worker 不會因高頻調用導致 WASM 記憶體問題。
 */

import { roiToPixels } from '../utils/roiUtils';

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
    if (!canvas) return '';
    try {
        const tc = document.createElement('canvas');
        const { x: cx, y: cy, w: cw, h: ch } = roiToPixels(canvas.width, canvas.height, roi);
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
 * 自動精確裁切 — 找亮色像素的 bounding box
 * 使用者的 ROI 可能框得很大，文字只佔一小部分
 * 這個函式找到實際有內容的區域，回傳 {x, y, w, h}
 */
function autoTightCrop(cropCanvas, brightnessThreshold = 60, paddingRatio = 0.15) {
    const ctx = cropCanvas.getContext('2d');
    const w = cropCanvas.width, h = cropCanvas.height;
    if (w < 2 || h < 2) return { x: 0, y: 0, w, h };

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    let minX = w, minY = h, maxX = 0, maxY = 0;
    let found = false;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const brightness = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
            if (brightness > brightnessThreshold) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
    }

    if (!found) return { x: 0, y: 0, w, h };

    // 加一點 padding（文字邊界的 15%），避免裁切太緊切到筆劃
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const padX = Math.max(2, Math.floor(bw * paddingRatio));
    const padY = Math.max(2, Math.floor(bh * paddingRatio));

    return {
        x: Math.max(0, minX - padX),
        y: Math.max(0, minY - padY),
        w: Math.min(w - Math.max(0, minX - padX), bw + padX * 2),
        h: Math.min(h - Math.max(0, minY - padY), bh + padY * 2),
    };
}

/**
 * 裁切 ROI → 放大 → 原彩影像 → PaddleOCR (透過全域 Queue 保護)
 */
export async function cropAndOCR(canvas, roi, ocrWorker, decimalPlaces, label = '未知', mode = 'number') {
    if (!roi || !ocrWorker || !canvas) return '';

    return new Promise((resolve) => {
        ocrGlobalQueue = ocrGlobalQueue.then(async () => {
            try {
                const { x: cx, y: cy, w: cw, h: ch } = roiToPixels(canvas.width, canvas.height, roi);
                if (cw < 2 || ch < 2) return resolve('');

                // ── Step 1: 初次裁切 ROI ──
                const rawCrop = document.createElement('canvas');
                rawCrop.width = cw; rawCrop.height = ch;
                const rawCtx = rawCrop.getContext('2d');
                rawCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);

                // ── Step 2: 自動精確裁切（找亮色像素邊界框）──
                // 使用者框的 ROI 可能很大，文字只佔一小部分
                // 找到實際文字的 bounding box，只對文字區域放大
                const tightRect = autoTightCrop(rawCrop);
                const tcx = tightRect.x, tcy = tightRect.y;
                const tcw = tightRect.w, tch = tightRect.h;

                if (tcw < 2 || tch < 2) return resolve('');

                // ── Step 3: 放大至神經網路最適高度 ──
                const isSmallText = tch < 25;
                const targetH = isSmallText ? 160 : 48;
                let scale = targetH / tch;
                if (scale < 1) scale = 1;

                // 水平拉寬：CTC 神經網路容易把緊密數字疊合
                const stretchX = isSmallText ? 1.8 : 1.25;
                const finalW = tcw * scale * stretchX;
                const finalH = tch * scale;

                // Padding: DBNet 文字太貼邊會辨識不到
                const PADDING = isSmallText ? 40 : 30;
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = Math.floor(finalW) + (PADDING * 2);
                cropCanvas.height = Math.floor(finalH) + (PADDING * 2);
                const ctx = cropCanvas.getContext('2d');
                
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

                // 小字用更強的對比，補償放大後的模糊
                ctx.filter = isSmallText
                    ? 'contrast(1.5) brightness(1.15) saturate(0)'
                    : 'contrast(1.2) brightness(1.1)';
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // 從精確裁切區域繪製（不是整個 ROI）
                ctx.drawImage(rawCrop, tcx, tcy, tcw, tch, PADDING, PADDING, finalW, finalH);

                // ⚠️ 彩圖直出：我們不再手動運算灰階二值化，把這項工作全權託付給 Paddle 神經網路
                const detectedLines = await ocrWorker.detect(cropCanvas.toDataURL('image/png'));

                // 將多行字串陣列合併
                const rawText = (detectedLines || []).map(t => t.text).join(' ').trim();
                console.log(`[OCR RAW - ${label}]`, rawText);

                // ── 文字模式：直接回傳原始辨識結果（不過濃非數字）──
                if (mode === 'text') {
                    resolve(rawText);
                    return;
                }

                // ── 數字模式（預設）──
                let resultStr = "";
                if (label === 'ORDER_ID') {
                    // 注單號：只保留數字與連字符 (-)
                    resultStr = rawText.replace(/[^0-9\-]/g, '');
                } else {
                    // 餘額/贏分/押分：只保留純數字 (0-9)、小數點 (.) 與千分位逗號 (,)
                    const validText = rawText.replace(/[^0-9.,]/g, '');
                    // 移除逗號，並清掉頭尾不小心沾到的孤立小數點
                    let cleanedText = validText.replace(/,/g, '').replace(/^\.+|\.+$/g, '') || "0";
                    
                    // 【整數模式提前處理】：decimalPlaces=0 時，所有小數點都是千分位誤判，全部移除
                    if (decimalPlaces === 0) {
                        resultStr = cleanedText.replace(/\./g, '') || "0";
                    } else {
                        // 如果 OCR 神經大條把千分位全部當成了小數點 (例如 1.036.022.26)，強制只認最後一個點為小數點
                        const parts = cleanedText.split('.');
                        if (parts.length > 2) {
                            const decimals = parts.pop();
                            resultStr = parts.join('') + '.' + decimals;
                        } else {
                            resultStr = cleanedText;
                        }
                    }

                    // 【小數位數修正】：根據 decimalPlaces 截斷小數部分
                    // decimalPlaces=0 → 無小數（整數）, =2 → 兩位小數
                    if (typeof decimalPlaces === 'number' && decimalPlaces >= 0 && resultStr.includes('.')) {
                        const [intPart, decPart] = resultStr.split('.');
                        if (decimalPlaces === 0) {
                            resultStr = intPart;
                        } else {
                            resultStr = intPart + '.' + (decPart || '').substring(0, decimalPlaces).padEnd(decimalPlaces, '0');
                        }
                    }
                }

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
