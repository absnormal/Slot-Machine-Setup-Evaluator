import { isIrregularGrid } from './gridShapeUtils';

/**
 * 在 canvas 上繪製紅色盤面格線
 *
 * 支援：
 * - 標準方格盤面（畫垂直/水平分隔線）
 * - 非方格盤面（reelHeights 不等長時，逐列獨立置中畫格子框）
 * - 乘倍轉軸（hasMultiplierReel 時，最後一欄不畫內部格線，僅畫外框）
 *
 * @param {CanvasRenderingContext2D} ctx - 已定位到 ROI 左上角的 context
 * @param {{ x: number, y: number, w: number, h: number }} roi - 像素座標
 * @param {object} template - SlotTemplate 物件（需 rows, cols, reelHeights?, hasMultiplierReel?）
 */
export function drawGridOverlay(ctx, roi, template) {
    if (!template || !template.rows || !template.cols) return;

    const { w: rw, h: rh } = roi;
    const displayCols = template.cols;
    const cellW = rw / displayCols;
    const cellH = rh / template.rows;

    ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
    ctx.lineWidth = Math.max(2, Math.floor(Math.min(rw, rh) / 200));

    if (isIrregularGrid(template)) {
        // 非方格盤面：逐列置中畫格線
        for (let c = 0; c < displayCols; c++) {
            const h = template.reelHeights[c] || template.rows;
            const offsetY = (rh - h * cellH) / 2;
            for (let r = 0; r < h; r++) {
                ctx.strokeRect(
                    c * cellW,
                    offsetY + r * cellH,
                    cellW, cellH
                );
            }
        }
    } else {
        // 標準方格：畫垂直分隔線
        const lastMainCol = template.hasMultiplierReel ? displayCols - 1 : displayCols;
        for (let c = 1; c < lastMainCol; c++) {
            ctx.beginPath();
            ctx.moveTo(c * cellW, 0);
            ctx.lineTo(c * cellW, rh);
            ctx.stroke();
        }
        // 畫水平分隔線（不含乘倍列區域）
        const mainWidth = template.hasMultiplierReel ? (displayCols - 1) * cellW : rw;
        for (let r = 1; r < template.rows; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * cellH);
            ctx.lineTo(mainWidth, r * cellH);
            ctx.stroke();
        }

        // 乘倍轉軸：只畫外框，不畫內部格線
        if (template.hasMultiplierReel) {
            // 主盤面與乘倍列的分隔線
            const separatorX = (displayCols - 1) * cellW;
            ctx.beginPath();
            ctx.moveTo(separatorX, 0);
            ctx.lineTo(separatorX, rh);
            ctx.stroke();

            // 乘倍列外框（用不同顏色標示）
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
            ctx.strokeRect(separatorX, 0, cellW, rh);
        }
    }
}
