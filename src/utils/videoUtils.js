/**
 * videoUtils.js — 影片處理基礎工具函式
 *
 * 提供 ROI 灰階擷取、MAE 計算、離屏 Canvas 快取等純函式。
 * 無任何 React 依賴，可被任何模組 import 使用。
 */

// ── 常數 ──
export const SAMPLE_SIZE = 128;               // ROI 降採尺寸 (128x128)
export const DEDUP_THRESHOLD = 8;             // 去重 MAE 閾值（低於此值視為相同幀）

/**
 * 取代 setTimeout 的不降速讓步函數，解決網頁在背景執行時被降速至 1FPS 的問題
 */
export function yieldToMain(delayMs = 15) {
    return new Promise(resolve => {
        if (document.hidden) {
            const ch = new MessageChannel();
            ch.port1.onmessage = resolve;
            ch.port2.postMessage(null);
        } else {
            setTimeout(resolve, delayMs);
        }
    });
}

/** 等待 video.currentTime seek 完成 */
export function waitForSeek(video) {
    return new Promise((resolve) => {
        if (video.seeking) {
            video.addEventListener('seeked', resolve, { once: true });
        } else {
            resolve();
        }
    });
}

/** 取得/重用離屏 canvas */
let _cachedCanvas = null;
let _cachedCtx = null;
export function getCachedCanvas() {
    if (!_cachedCanvas) {
        _cachedCanvas = document.createElement('canvas');
        _cachedCanvas.width = SAMPLE_SIZE;
        _cachedCanvas.height = SAMPLE_SIZE;
        _cachedCtx = _cachedCanvas.getContext('2d', { willReadFrequently: true });
    }
    return { canvas: _cachedCanvas, ctx: _cachedCtx };
}

/**
 * 從影片中裁切 ROI → 降採至 128×128 → 轉灰階
 * @returns {Uint8Array} 灰階像素陣列 (長度 SAMPLE_SIZE^2)
 */
export function extractROIGray(video, roi) {
    const { canvas, ctx } = getCachedCanvas();
    const sx = (roi.x / 100) * video.videoWidth;
    const sy = (roi.y / 100) * video.videoHeight;
    const sw = (roi.w / 100) * video.videoWidth;
    const sh = (roi.h / 100) * video.videoHeight;

    if (sw <= 1 || sh <= 1) return null;

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;

    const gray = new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE);
    for (let i = 0; i < gray.length; i++) {
        // 快速灰階轉換 (integer approximation)
        gray[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8;
    }
    return gray;
}

/**
 * 計算兩個灰階幀的 MAE (Mean Absolute Error)
 * @returns {number} 0~255 的平均差異
 */
export function computeMAE(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let total = 0;
    for (let i = 0; i < a.length; i++) {
        total += Math.abs(a[i] - b[i]);
    }
    return total / a.length;
}

/**
 * 亮度定位 + 局部 OCR：自動偵測乘倍區域中亮起的段落並讀取其文字
 *
 * 演算法：
 *   1. 裁切 ROI 區域
 *   2. 計算水平亮度剖面（逐列平均亮度）
 *   3. 以 mean + 0.8×σ 為動態閾值，找出亮區的左右邊界
 *   4. 裁切亮區（含 padding）→ 放大 3x → 高對比預處理
 *   5. PaddleOCR 辨識 → 正則提取 xN 格式
 *
 * @param {HTMLCanvasElement|HTMLVideoElement} source
 * @param {{ x: number, y: number, w: number, h: number }} roi - 百分比座標
 * @param {Object} ocrWorker - PaddleOCR worker instance
 * @returns {Promise<string|null>} 'x2', 'x5' 等，或 null
 */
// ── 乘倍位置快取：{positionBucket: ocrText}，同位置不重複 OCR ──
const _multiplierCache = new Map();

export async function detectLitMultiplier(source, roi, ocrWorker) {
    if (!source || !roi || !ocrWorker) return null;

    const sourceW = source.videoWidth || source.width;
    const sourceH = source.videoHeight || source.height;
    if (!sourceW || !sourceH) return null;

    // ── Step 1: 裁切 ROI 區域 ──
    const sx = Math.floor((roi.x / 100) * sourceW);
    const sy = Math.floor((roi.y / 100) * sourceH);
    const sw = Math.floor((roi.w / 100) * sourceW);
    const sh = Math.floor((roi.h / 100) * sourceH);
    if (sw <= 0 || sh <= 0) return null;

    const roiCanvas = document.createElement('canvas');
    roiCanvas.width = sw;
    roiCanvas.height = sh;
    const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });
    roiCtx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);

    const imgData = roiCtx.getImageData(0, 0, sw, sh);
    const data = imgData.data;

    // ── Step 2: 水平亮度剖面（逐列平均灰階） ──
    const profile = new Float32Array(sw);
    for (let col = 0; col < sw; col++) {
        let sum = 0;
        for (let row = 0; row < sh; row++) {
            const idx = (row * sw + col) * 4;
            sum += (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
        }
        profile[col] = sum / sh;
    }

    // ── Step 3: 動態閾值 (mean + 0.8σ) 找亮區 ──
    let mean = 0;
    for (let i = 0; i < sw; i++) mean += profile[i];
    mean /= sw;

    let variance = 0;
    for (let i = 0; i < sw; i++) variance += (profile[i] - mean) ** 2;
    const std = Math.sqrt(variance / sw);

    // 若整體亮度變化極小（σ < 5），表示沒有明顯亮區 → 回傳 null
    if (std < 5) return null;

    const threshold = mean + 0.8 * std;

    let left = -1, right = -1;
    for (let i = 0; i < sw; i++) {
        if (profile[i] > threshold) {
            if (left === -1) left = i;
            right = i;
        }
    }
    if (left === -1) return null;

    // ── Step 3.5: 位置快取查詢 ──
    // 將亮區中心位置量化為百分比 bucket（精度 5%），作為快取 key
    const centerRatio = Math.round(((left + right) / 2 / sw) * 20); // 0-20 的整數
    const cacheKey = `${roi.x}_${roi.y}_${roi.w}_${centerRatio}`;
    if (_multiplierCache.has(cacheKey)) {
        return _multiplierCache.get(cacheKey);
    }

    // ── Step 4: 裁切亮區 + 放大 + 高對比預處理 ──
    const pad = Math.max(4, Math.floor((right - left) * 0.15));
    const cropX = Math.max(0, left - pad);
    const cropW = Math.min(sw, right + pad + 1) - cropX;
    if (cropW <= 0) return null;

    const SCALE = 3;
    const PADDING = 20;
    const outW = Math.floor(cropW * SCALE) + PADDING * 2;
    const outH = Math.floor(sh * SCALE) + PADDING * 2;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext('2d');

    // 黑色背景 + 高對比濾鏡
    outCtx.fillStyle = '#000000';
    outCtx.fillRect(0, 0, outW, outH);
    outCtx.filter = 'contrast(1.8) brightness(1.2)';
    outCtx.drawImage(roiCanvas, cropX, 0, cropW, sh, PADDING, PADDING, cropW * SCALE, sh * SCALE);
    outCtx.filter = 'none';

    // ── Step 5: PaddleOCR 辨識 → 正則提取 ──
    try {
        const detectedLines = await ocrWorker.detect(outCanvas.toDataURL('image/png'));
        const rawText = (detectedLines || []).map(t => t.text).join(' ').trim();
        if (!rawText) return null;

        // 匹配 x5, X3, ×10, 2, 15 等各種格式
        const match = rawText.match(/[x×]?\s*(\d+(?:\.\d+)?)/i);
        if (match) {
            const result = `x${match[1]}`;
            // 存入位置快取，後續同位置直接回傳
            _multiplierCache.set(cacheKey, result);
            return result;
        }
        return null;
    } catch (err) {
        console.warn('[detectLitMultiplier] OCR failed:', err);
        return null;
    }
}
