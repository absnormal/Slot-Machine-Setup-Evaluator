/**
 * localBoardRecognizer.js — 純本地端盤面辨識引擎 v2
 * 
 * 改良版原理：
 * 1. 根據 reelROI + gridRows × gridCols 把盤面切成格子
 * 2. 每個格子先做「灰階 + 正規化 + 截尾 MSE」比對（免疫特效/發光）
 * 3. 若前兩名分數接近，再用 RGB 色彩做決勝（保留顏色判斷力）
 * 
 * 完全不需要任何 API，100% 在瀏覽器本地計算
 */

const MATCH_SIZE = 64; // 統一縮放到 64x64 做比對

// ── 灰階 & 正規化工具 ──

/**
 * 將 ImageData 轉為灰階 Uint8Array 並正規化到 0~255 全範圍
 * 正規化公式：normalized = (gray - min) / (max - min) * 255
 * 這樣即使整張圖因發光而偏亮，正規化後形狀輪廓會被保留
 */
function toNormalizedGray(imageData) {
    const d = imageData.data;
    const len = d.length / 4;
    const gray = new Float32Array(len);

    let min = 255, max = 0;
    for (let i = 0; i < len; i++) {
        const idx = i * 4;
        const g = d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114;
        gray[i] = g;
        if (g < min) min = g;
        if (g > max) max = g;
    }

    const range = max - min || 1; // 防止除零
    const result = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        result[i] = Math.round((gray[i] - min) / range * 255);
    }
    return result;
}

// ── 截尾 MSE（Trimmed MSE）──

/**
 * 計算兩個灰階陣列的截尾 MSE
 * 將所有像素差異排序，丟掉最差的 trimRatio（預設 20%），
 * 只用剩下的 80% 計算。閃電/發光等局部異常值會被截掉。
 */
const TRIM_RATIO = 0.20; // 丟掉最差 20% 的像素

function computeTrimmedGrayMSE(grayA, grayB) {
    const len = grayA.length;
    const diffs = new Float32Array(len);

    for (let i = 0; i < len; i++) {
        const d = grayA[i] - grayB[i];
        diffs[i] = d * d;
    }

    // 排序取前 80%
    diffs.sort();
    const keepCount = Math.floor(len * (1 - TRIM_RATIO));
    let sum = 0;
    for (let i = 0; i < keepCount; i++) {
        sum += diffs[i];
    }
    return sum / keepCount;
}

/**
 * 計算兩張 ImageData 之間的 RGB MSE（用於 Pass 2 色彩決勝）
 */
function computeRgbMSE(a, b) {
    const d1 = a.data;
    const d2 = b.data;
    const len = d1.length;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < len; i += 4) {
        const diffR = d1[i] - d2[i];
        const diffG = d1[i + 1] - d2[i + 1];
        const diffB = d1[i + 2] - d2[i + 2];
        sum += (diffR * diffR) + (diffG * diffG) + (diffB * diffB);
        count += 3;
    }
    return sum / count;
}

// ── 參考索引建立 ──

/**
 * 預處理符號參考圖：同時儲存 RGB ImageData 和灰階正規化版本
 * @param {Object} symbolImagesAll - { symbolName: [dataUrl1, dataUrl2, ...], ... }
 * @returns {Promise<Map<string, { rgb: ImageData, gray: Uint8Array }[]>>}
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
        const refList = [];
        for (const url of urls) {
            try {
                const img = await loadImage(url);
                const canvas = document.createElement('canvas');
                canvas.width = MATCH_SIZE;
                canvas.height = MATCH_SIZE;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, MATCH_SIZE, MATCH_SIZE);
                const rgb = ctx.getImageData(0, 0, MATCH_SIZE, MATCH_SIZE);
                const gray = toNormalizedGray(rgb);
                refList.push({ rgb, gray });
            } catch (e) {
                console.warn(`[LocalRecognizer] 載入符號 ${symbol} 參考圖失敗`, e);
            }
        }
        if (refList.length > 0) {
            index.set(symbol, refList);
        }
    }

    console.log(`[LocalRecognizer] 參考索引建立完成：${index.size} 個符號，共 ${[...index.values()].reduce((s, v) => s + v.length, 0)} 張參考圖（含灰階正規化）`);
    return index;
}

// ── 格子擷取 ──

/**
 * 從盤面截圖中切出一個格子
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

// ── 雙層比對 ──

const TIEBREAK_THRESHOLD = 0.15; // Top1 與 Top2 差距 < 15% 時啟動 RGB 決勝

/**
 * 辨識單一格子（雙層比對）
 * Pass 1: 灰階 + 正規化 + 截尾 MSE（免疫特效）
 * Pass 2: 若前兩名接近，用 RGB MSE 決勝（保留顏色判斷力）
 */
function matchCell(cellImageData, referenceIndex) {
    const cellGray = toNormalizedGray(cellImageData);

    // Pass 1: 灰階截尾 MSE — 收集所有候選分數
    const candidates = [];
    for (const [symbol, refList] of referenceIndex) {
        for (const ref of refList) {
            const grayMSE = computeTrimmedGrayMSE(cellGray, ref.gray);
            candidates.push({ symbol, grayMSE, ref });
        }
    }

    // 按灰階 MSE 排序
    candidates.sort((a, b) => a.grayMSE - b.grayMSE);

    if (candidates.length === 0) {
        return { symbol: '?', confidence: 0, mse: Infinity };
    }

    const top1 = candidates[0];
    let bestSymbol = top1.symbol;
    let bestMSE = top1.grayMSE;

    // Pass 2: 若前兩名接近（且不是同一個符號），用 RGB 決勝
    if (candidates.length >= 2) {
        const top2 = candidates[1];
        if (top1.symbol !== top2.symbol && top1.grayMSE > 0) {
            const gap = (top2.grayMSE - top1.grayMSE) / top1.grayMSE;
            if (gap < TIEBREAK_THRESHOLD) {
                // 用 RGB MSE 在 Top1 和 Top2 之間做決勝
                const rgbMSE1 = computeRgbMSE(cellImageData, top1.ref.rgb);
                const rgbMSE2 = computeRgbMSE(cellImageData, top2.ref.rgb);
                if (rgbMSE2 < rgbMSE1) {
                    bestSymbol = top2.symbol;
                    bestMSE = top2.grayMSE;
                }
            }
        }
    }

    const confidence = Math.max(0, 100 - (bestMSE / 50));
    return { symbol: bestSymbol, confidence: parseFloat(confidence.toFixed(1)), mse: parseFloat(bestMSE.toFixed(2)) };
}

// ── 盤面辨識 ──

/**
 * 辨識整個盤面
 * @param {HTMLCanvasElement} boardCanvas - 完整截圖的 canvas
 * @param {Object} reelROI - { x, y, width, height }
 * @param {number} gridRows
 * @param {number} gridCols
 * @param {Map} referenceIndex - 來自 buildReferenceIndex
 * @returns {{ grid: string[][], details: Object[][] }}
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
