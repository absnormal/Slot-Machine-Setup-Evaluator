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

const MATCH_SIZE = 48; // 統一縮放到 48x48 做比對（速度 vs 精度平衡）

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
 * 計算兩張 ImageData 之間的 MAE（Mean Absolute Error）
 * 只看 RGB，不看 Alpha
 */
function computeMAE(a, b) {
    const d1 = a.data;
    const d2 = b.data;
    const len = d1.length;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < len; i += 4) {
        sum += Math.abs(d1[i] - d2[i]);       // R
        sum += Math.abs(d1[i + 1] - d2[i + 1]); // G
        sum += Math.abs(d1[i + 2] - d2[i + 2]); // B
        count += 3;
    }
    return sum / count;
}

/**
 * 從盤面截圖中切出一個格子
 * @param {HTMLCanvasElement} boardCanvas - 盤面截圖
 * @param {Object} roi - { x, y, width, height } 由 reelROI 定義
 * @param {number} row - 行 index
 * @param {number} col - 列 index
 * @param {number} totalRows
 * @param {number} totalCols
 * @returns {ImageData} 縮放到 MATCH_SIZE 的格子 ImageData
 */
function extractCell(boardCanvas, roi, row, col, totalRows, totalCols) {
    const cellW = roi.width / totalCols;
    const cellH = roi.height / totalRows;
    const sx = roi.x + col * cellW;
    const sy = roi.y + row * cellH;

    const canvas = document.createElement('canvas');
    canvas.width = MATCH_SIZE;
    canvas.height = MATCH_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(boardCanvas, sx, sy, cellW, cellH, 0, 0, MATCH_SIZE, MATCH_SIZE);
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
    let bestMAE = Infinity;

    for (const [symbol, imageDataList] of referenceIndex) {
        for (const refImageData of imageDataList) {
            const mae = computeMAE(cellImageData, refImageData);
            if (mae < bestMAE) {
                bestMAE = mae;
                bestSymbol = symbol;
            }
        }
    }

    // confidence: MAE=0 → 100%, MAE=50 → 0%
    const confidence = Math.max(0, 100 - bestMAE * 2);
    return { symbol: bestSymbol, confidence: parseFloat(confidence.toFixed(1)), mae: parseFloat(bestMAE.toFixed(2)) };
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
