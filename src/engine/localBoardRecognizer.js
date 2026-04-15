/**
 * localBoardRecognizer.js — 純本地端盤面辨識引擎
 * 
 * 原理：
 * 1. 根據 reelROI + gridRows × gridCols 把盤面切成格子
 * 2. 每個格子跟 Phase 1 的所有符號參考圖做像素比對
 * 3. 選擇 MAE (Mean Absolute Error) 最低的符號
 * 
 * 完全不需要任何 API，100% 在瀏覽器本地計算
 */

const MATCH_SIZE = 64; // 統一縮放到 64x64 做比對（提高細節解析度，區分字體）

/**
 * 預處理符號參考圖：把每張圖載入 canvas 並縮放到 MATCH_SIZE
 * @param {Object} symbolImagesAll - { symbolName: [dataUrl1, dataUrl2, ...], ... }
 * @returns {Promise<Map<string, ImageData[]>>} symbol -> [ImageData, ...] 字典
 */
export async function buildReferenceIndex(symbolImagesAll) {
    const index = new Map();

    const loadImage = (url) => new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });

    for (const [symbol, urls] of Object.entries(symbolImagesAll)) {
        const imageDataList = [];
        for (const url of urls) {
            try {
                const img = await loadImage(url);
                const canvas = document.createElement('canvas');
                canvas.width = MATCH_SIZE;
                canvas.height = MATCH_SIZE;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, MATCH_SIZE, MATCH_SIZE);
                const imageData = ctx.getImageData(0, 0, MATCH_SIZE, MATCH_SIZE);
                imageDataList.push(imageData);
            } catch (e) {
                console.warn(`[LocalRecognizer] 載入符號 ${symbol} 參考圖失敗`, e);
            }
        }
        if (imageDataList.length > 0) {
            index.set(symbol, imageDataList);
        }
    }

    console.log(`[LocalRecognizer] 參考索引建立完成：${index.size} 個符號，共 ${[...index.values()].reduce((s, v) => s + v.length, 0)} 張參考圖`);
    return index;
}

/**
 * 計算兩張 ImageData 之間的 MSE（Mean Squared Error）
 * 取代 MAE，因為平方誤差會「放大」局部巨大色差（例如：文字 vs 背景），
 * 就算 Crown 長得一模一樣，底下的字一旦不一樣，MSE 會劇烈飆升。
 */
function computeMSE(a, b) {
    const d1 = a.data;
    const d2 = b.data;
    const len = d1.length;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < len; i += 4) {
        const diffR = d1[i] - d2[i];
        const diffG = d1[i + 1] - d2[i + 1];
        const diffB = d1[i + 2] - d2[i + 2];
        
        // 為了讓黑邊/背景不那麼影響結果，我們引入 Alpha channel 或簡單的像素加權
        // 但這裡最直接的方式是平方相加
        sum += (diffR * diffR) + (diffG * diffG) + (diffB * diffB);
        count += 3;
    }
    return sum / count;
}

/**
 * 從盤面截圖中切出一個格子（內縮裁切：只取中心 70% 面積）
 * @param {HTMLCanvasElement} boardCanvas - 盤面截圖
 * @param {Object} roi - { x, y, width, height } 由 reelROI 定義
 * @param {number} row - 行 index
 * @param {number} col - 列 index
 * @param {number} totalRows
 * @param {number} totalCols
 * @returns {ImageData} 縮放到 MATCH_SIZE 的格子 ImageData
 */
const CELL_PADDING_RATIO = 0.15; // 每邊內縮 15%，只取中心 70%

function extractCell(boardCanvas, roi, row, col, totalRows, totalCols) {
    const cellW = roi.width / totalCols;
    const cellH = roi.height / totalRows;

    // 先算出完整格子位置
    const rawX = roi.x + col * cellW;
    const rawY = roi.y + row * cellH;

    // 內縮裁切：跳過外圍 padding，只取中心區域
    const padX = cellW * CELL_PADDING_RATIO;
    const padY = cellH * CELL_PADDING_RATIO;
    const sx = rawX + padX;
    const sy = rawY + padY;
    const sw = cellW - padX * 2;
    const sh = cellH - padY * 2;

    const canvas = document.createElement('canvas');
    canvas.width = MATCH_SIZE;
    canvas.height = MATCH_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(boardCanvas, sx, sy, sw, sh, 0, 0, MATCH_SIZE, MATCH_SIZE);
    return ctx.getImageData(0, 0, MATCH_SIZE, MATCH_SIZE);
}

/**
 * 辨識單一格子
 * @param {ImageData} cellImageData - 格子的 ImageData
 * @param {Map<string, ImageData[]>} referenceIndex - 預建索引
 * @returns {{ symbol: string, confidence: number, mae: number }}
 */
function matchCell(cellImageData, referenceIndex) {
    let bestSymbol = '?';
    let bestMSE = Infinity;

    for (const [symbol, imageDataList] of referenceIndex) {
        for (const refImageData of imageDataList) {
            const mse = computeMSE(cellImageData, refImageData);
            if (mse < bestMSE) {
                bestMSE = mse;
                bestSymbol = symbol;
            }
        }
    }

    // 將 MSE 轉化為 0~100 的 confidence (經驗公式：MSE 0=100%, MSE 5000=0%)
    const confidence = Math.max(0, 100 - (bestMSE / 50));
    return { symbol: bestSymbol, confidence: parseFloat(confidence.toFixed(1)), mse: parseFloat(bestMSE.toFixed(2)) };
}

/**
 * 辨識整個盤面
 * @param {HTMLCanvasElement} boardCanvas - 完整截圖的 canvas
 * @param {Object} reelROI - { x, y, width, height }
 * @param {number} gridRows
 * @param {number} gridCols
 * @param {Map<string, ImageData[]>} referenceIndex - 來自 buildReferenceIndex
 * @returns {{ grid: string[][], details: Object[][] }} grid = 符號 2D 陣列, details = 每格詳細數據
 */
export function recognizeBoard(boardCanvas, reelROI, gridRows, gridCols, referenceIndex) {
    const grid = [];
    const details = [];

    for (let r = 0; r < gridRows; r++) {
        const gridRow = [];
        const detailRow = [];
        for (let c = 0; c < gridCols; c++) {
            const cellData = extractCell(boardCanvas, reelROI, r, c, gridRows, gridCols);
            const match = matchCell(cellData, referenceIndex);
            gridRow.push(match.symbol);
            detailRow.push(match);
        }
        grid.push(gridRow);
        details.push(detailRow);
    }

    return { grid, details };
}

/**
 * Auto-Snap：自動微調 ROI 位置，找到與參考圖最吻合的對齊
 * @param {HTMLCanvasElement} boardCanvas - 完整截圖的 canvas
 * @param {Object} currentROI - 目前的 ROI { x, y, w, h } (百分比座標)
 * @param {number} gridRows
 * @param {number} gridCols
 * @param {Map<string, ImageData[]>} referenceIndex
 * @param {Object} options - { searchRange: 搜索範圍(百分比), stepSize: 步進(百分比) }
 * @returns {{ roi: Object, totalMSE: number, improvement: number }}
 */
export function autoSnapROI(boardCanvas, currentROI, gridRows, gridCols, referenceIndex, options = {}) {
    const { searchRange = 3, stepSize = 0.3 } = options;

    const W = boardCanvas.width;
    const H = boardCanvas.height;

    // 將當前百分比 ROI 轉為像素
    const baseROI = {
        x: Math.floor(W * (currentROI.x / 100)),
        y: Math.floor(H * (currentROI.y / 100)),
        width: Math.floor(W * (currentROI.w / 100)),
        height: Math.floor(H * (currentROI.h / 100)),
    };

    // 搜索範圍轉為像素
    const rangeX = Math.ceil(W * (searchRange / 100));
    const rangeY = Math.ceil(H * (searchRange / 100));
    const stepX = Math.max(1, Math.floor(W * (stepSize / 100)));
    const stepY = Math.max(1, Math.floor(H * (stepSize / 100)));

    let bestMSE = Infinity;
    let bestOffset = { dx: 0, dy: 0, dw: 0, dh: 0 };

    // === Pass 1: 搜索 x, y 位置偏移 ===
    for (let dy = -rangeY; dy <= rangeY; dy += stepY) {
        for (let dx = -rangeX; dx <= rangeX; dx += stepX) {
            const trialROI = {
                x: baseROI.x + dx,
                y: baseROI.y + dy,
                width: baseROI.width,
                height: baseROI.height,
            };
            // 邊界檢查
            if (trialROI.x < 0 || trialROI.y < 0 ||
                trialROI.x + trialROI.width > W ||
                trialROI.y + trialROI.height > H) continue;

            let totalMSE = 0;
            for (let r = 0; r < gridRows; r++) {
                for (let c = 0; c < gridCols; c++) {
                    const cellData = extractCell(boardCanvas, trialROI, r, c, gridRows, gridCols);
                    const match = matchCell(cellData, referenceIndex);
                    totalMSE += match.mse;
                }
            }
            if (totalMSE < bestMSE) {
                bestMSE = totalMSE;
                bestOffset = { dx, dy, dw: 0, dh: 0 };
            }
        }
    }

    // 應用 Pass 1 最佳位置
    const pass1ROI = {
        x: baseROI.x + bestOffset.dx,
        y: baseROI.y + bestOffset.dy,
        width: baseROI.width,
        height: baseROI.height,
    };

    // === Pass 2: 在最佳位置上搜索 width, height 微調 ===
    const rangeW = Math.ceil(W * (searchRange * 0.5 / 100)); // 尺寸搜索範圍較小
    const rangeH = Math.ceil(H * (searchRange * 0.5 / 100));
    let bestMSE2 = bestMSE;
    let bestSizeOffset = { dw: 0, dh: 0 };

    for (let dh = -rangeH; dh <= rangeH; dh += stepY) {
        for (let dw = -rangeW; dw <= rangeW; dw += stepX) {
            const trialROI = {
                x: pass1ROI.x,
                y: pass1ROI.y,
                width: pass1ROI.width + dw,
                height: pass1ROI.height + dh,
            };
            if (trialROI.width < 10 || trialROI.height < 10) continue;
            if (trialROI.x + trialROI.width > W || trialROI.y + trialROI.height > H) continue;

            let totalMSE = 0;
            for (let r = 0; r < gridRows; r++) {
                for (let c = 0; c < gridCols; c++) {
                    const cellData = extractCell(boardCanvas, trialROI, r, c, gridRows, gridCols);
                    const match = matchCell(cellData, referenceIndex);
                    totalMSE += match.mse;
                }
            }
            if (totalMSE < bestMSE2) {
                bestMSE2 = totalMSE;
                bestSizeOffset = { dw, dh };
            }
        }
    }

    // 計算原始 ROI 的 MSE 作為對照
    let originalMSE = 0;
    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            const cellData = extractCell(boardCanvas, baseROI, r, c, gridRows, gridCols);
            const match = matchCell(cellData, referenceIndex);
            originalMSE += match.mse;
        }
    }

    // 最終 ROI 轉回百分比
    const finalROI = {
        x: parseFloat(((pass1ROI.x) / W * 100).toFixed(2)),
        y: parseFloat(((pass1ROI.y) / H * 100).toFixed(2)),
        w: parseFloat(((pass1ROI.width + bestSizeOffset.dw) / W * 100).toFixed(2)),
        h: parseFloat(((pass1ROI.height + bestSizeOffset.dh) / H * 100).toFixed(2)),
    };

    const improvement = originalMSE > 0 ? ((originalMSE - bestMSE2) / originalMSE * 100).toFixed(1) : 0;

    console.log(`[AutoSnap] 原始 MSE: ${originalMSE.toFixed(0)} → 最佳 MSE: ${bestMSE2.toFixed(0)} (改善 ${improvement}%)`);
    console.log(`[AutoSnap] 偏移: dx=${bestOffset.dx}px, dy=${bestOffset.dy}px, dw=${bestSizeOffset.dw}px, dh=${bestSizeOffset.dh}px`);

    return { roi: finalROI, totalMSE: bestMSE2, originalMSE, improvement: parseFloat(improvement) };
}
