/**
 * captureAction.js — 畫面截取原子動作
 *
 * 從 video 元素截取當前畫面，轉為 Canvas ImageData。
 * 供 record_spin 和 pixel_stable 等積木使用。
 */

/**
 * 從 video 元素截取當前畫面
 * @param {HTMLVideoElement} videoEl - video 元素（P4/P5 的串流畫面）
 * @param {Object} [roiPct] - 可選的 ROI 裁切 {x, y, w, h} (百分比 0-100)
 * @returns {{ canvas: HTMLCanvasElement, dataUrl: string, width: number, height: number }}
 */
export function captureFrame(videoEl, roiPct = null) {
    if (!videoEl || videoEl.videoWidth === 0) {
        throw new Error('[captureAction] video 元素無效或無畫面');
    }

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;

    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (roiPct) {
        sx = Math.round(vw * roiPct.x / 100);
        sy = Math.round(vh * roiPct.y / 100);
        sw = Math.round(vw * roiPct.w / 100);
        sh = Math.round(vh * roiPct.h / 100);
    }

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, sw, sh);

    return {
        canvas,
        dataUrl: canvas.toDataURL('image/jpeg', 0.85),
        width: sw,
        height: sh,
    };
}

/**
 * 計算 ROI 區域的像素 hash（用於穩定性偵測）
 *
 * 將 ROI 區域縮小到 32x32，取灰階值的平均 → 產生簡單的指紋。
 * 速度極快（<1ms），適合高頻輪詢。
 *
 * @param {HTMLVideoElement} videoEl
 * @param {Object} roiPct - {x, y, w, h} 百分比
 * @returns {string} 像素 hash 字串
 */
export function computePixelHash(videoEl, roiPct) {
    if (!videoEl || videoEl.videoWidth === 0) return '';

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    const sx = Math.round(vw * roiPct.x / 100);
    const sy = Math.round(vh * roiPct.y / 100);
    const sw = Math.round(vw * roiPct.w / 100);
    const sh = Math.round(vh * roiPct.h / 100);

    if (sw < 2 || sh < 2) return '';

    // 縮到 32x32 取樣，大幅減少計算量
    const SAMPLE_SIZE = 32;
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;

    // 每 4x4 block 取平均灰階值，產生 8x8 = 64 個值
    const BLOCK = 4;
    const GRID = SAMPLE_SIZE / BLOCK; // 8
    let hash = '';
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            let sum = 0;
            for (let dy = 0; dy < BLOCK; dy++) {
                for (let dx = 0; dx < BLOCK; dx++) {
                    const px = (gy * BLOCK + dy) * SAMPLE_SIZE + (gx * BLOCK + dx);
                    const i = px * 4;
                    sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                }
            }
            const avg = Math.round(sum / (BLOCK * BLOCK));
            hash += avg.toString(16).padStart(2, '0');
        }
    }

    return hash;
}
