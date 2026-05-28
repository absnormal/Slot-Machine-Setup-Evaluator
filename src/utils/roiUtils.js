/**
 * roiUtils.js — ROI 座標轉換工具
 *
 * 集中管理百分比 ROI → 像素座標的轉換邏輯，
 * 以及從 Canvas 裁切 ROI 區域的通用函式。
 */

/**
 * ROI 百分比座標轉換為像素座標
 * @param {number} sourceWidth - 來源寬度 (px)
 * @param {number} sourceHeight - 來源高度 (px) 
 * @param {{ x: number, y: number, w: number, h: number }} roi - 百分比 ROI
 * @returns {{ x: number, y: number, w: number, h: number }} 像素座標
 */
export function roiToPixels(sourceWidth, sourceHeight, roi) {
    return {
        x: Math.floor(sourceWidth * (roi.x / 100)),
        y: Math.floor(sourceHeight * (roi.y / 100)),
        w: Math.floor(sourceWidth * (roi.w / 100)),
        h: Math.floor(sourceHeight * (roi.h / 100)),
    };
}

/**
 * 從 canvas 裁切 ROI 區域到新 canvas
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {{ x: number, y: number, w: number, h: number }} roi - 百分比 ROI
 * @param {number} [targetW] - 目標寬度，預設為 ROI 實際寬度
 * @param {number} [targetH] - 目標高度，預設為 ROI 實際高度
 * @returns {HTMLCanvasElement}
 */
export function cropROIToCanvas(sourceCanvas, roi, targetW, targetH) {
    const { x: sx, y: sy, w: sw, h: sh } = roiToPixels(sourceCanvas.width, sourceCanvas.height, roi);
    const c = document.createElement('canvas');
    c.width = targetW || Math.round(sw);
    c.height = targetH || Math.round(sh);
    const ctx = c.getContext('2d');
    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
}
