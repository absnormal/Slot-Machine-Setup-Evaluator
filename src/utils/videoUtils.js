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
 * 將 ROI 水平等分成 N 段，回傳每段平均亮度
 * @param {HTMLCanvasElement|HTMLVideoElement} source
 * @param {{ x: number, y: number, w: number, h: number }} roi - 百分比座標
 * @param {number} segments - 分段數
 * @returns {number[]} 每段平均亮度 (0-255)
 */
export function measureSegmentBrightness(source, roi, segments) {
    if (!source || segments <= 0) return Array(segments).fill(0);
    
    const canvas = document.createElement('canvas');
    const sourceW = source.videoWidth || source.width;
    const sourceH = source.videoHeight || source.height;
    
    if (!sourceW || !sourceH) return Array(segments).fill(0);

    const sx = Math.floor((roi.x / 100) * sourceW);
    const sy = Math.floor((roi.y / 100) * sourceH);
    const sw = Math.floor((roi.w / 100) * sourceW);
    const sh = Math.floor((roi.h / 100) * sourceH);
    
    if (sw <= 0 || sh <= 0) return Array(segments).fill(0);

    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    
    const segW = Math.floor(sw / segments);
    if (segW <= 0) return Array(segments).fill(0);

    const results = [];
    
    for (let i = 0; i < segments; i++) {
        const currentSegW = (i === segments - 1) ? sw - (i * segW) : segW;
        if (currentSegW <= 0) {
            results.push(0);
            continue;
        }
        
        const segX = i * segW;
        const data = ctx.getImageData(segX, 0, currentSegW, sh).data;
        let total = 0;
        const pixelCount = data.length / 4;
        
        for (let p = 0; p < data.length; p += 4) {
            total += (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
        }
        
        results.push(total / pixelCount);
    }
    return results;
}
