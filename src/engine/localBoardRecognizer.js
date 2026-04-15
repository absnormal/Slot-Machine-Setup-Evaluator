/**
 * localBoardRecognizer.js — 純本地端盤面辨識引擎 v3 (HOG)
 * 
 * 三層比對架構：
 * Layer 1 (主力): HOG 特徵比對 — 只看邊緣方向，天生免疫色彩/亮度特效
 * Layer 2 (決勝): 灰階正規化截尾 MSE — 形狀相似時用亮度紋理區分
 * Layer 3 (色彩): RGB MSE — 最終色彩決勝（紅寶石 vs 藍寶石）
 * 
 * 完全不需要任何 API 或外部函式庫，100% 在瀏覽器本地計算
 */

const MATCH_SIZE = 64; // 統一縮放到 64x64

// ════════════════════════════════════════════
// HOG (Histogram of Oriented Gradients) 實作
// ════════════════════════════════════════════

const HOG_CELL_SIZE = 8;   // 每個 cell 8x8 像素
const HOG_NUM_BINS = 9;    // 9 個方向區間 (0°~180°, 每 20°)
const HOG_CELLS_PER_DIM = MATCH_SIZE / HOG_CELL_SIZE; // 64/8 = 8
const HOG_BLOCK_SIZE = 2;  // 2x2 cells 為一個 block 做正規化
const HOG_BLOCKS_PER_DIM = HOG_CELLS_PER_DIM - HOG_BLOCK_SIZE + 1; // 7

/**
 * 從 ImageData 提取 HOG 特徵向量
 * @param {ImageData} imageData
 * @returns {Float32Array} HOG 描述子（已正規化）
 */
function extractHOG(imageData) {
    const d = imageData.data;
    const W = MATCH_SIZE;
    const H = MATCH_SIZE;

    // Step 1: 轉灰階
    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
        const idx = i * 4;
        gray[i] = d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114;
    }

    // Step 2: 計算梯度 (Gx, Gy)
    const mag = new Float32Array(W * H);
    const dir = new Float32Array(W * H);

    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const gx = gray[y * W + (x + 1)] - gray[y * W + (x - 1)];
            const gy = gray[(y + 1) * W + x] - gray[(y - 1) * W + x];
            mag[y * W + x] = Math.sqrt(gx * gx + gy * gy);
            // unsigned gradient: 0~180°
            let angle = Math.atan2(gy, gx) * (180 / Math.PI);
            if (angle < 0) angle += 180;
            if (angle >= 180) angle = 0;
            dir[y * W + x] = angle;
        }
    }

    // Step 3: 建立每個 cell 的方向直方圖
    const cellHistograms = new Array(HOG_CELLS_PER_DIM * HOG_CELLS_PER_DIM);
    const binWidth = 180 / HOG_NUM_BINS; // 20°

    for (let cy = 0; cy < HOG_CELLS_PER_DIM; cy++) {
        for (let cx = 0; cx < HOG_CELLS_PER_DIM; cx++) {
            const hist = new Float32Array(HOG_NUM_BINS);
            const startX = cx * HOG_CELL_SIZE;
            const startY = cy * HOG_CELL_SIZE;

            for (let py = startY; py < startY + HOG_CELL_SIZE; py++) {
                for (let px = startX; px < startX + HOG_CELL_SIZE; px++) {
                    const m = mag[py * W + px];
                    const angle = dir[py * W + px];

                    // 雙線性插值到相鄰 bin
                    const binF = angle / binWidth;
                    const bin0 = Math.floor(binF) % HOG_NUM_BINS;
                    const bin1 = (bin0 + 1) % HOG_NUM_BINS;
                    const weight1 = binF - Math.floor(binF);
                    const weight0 = 1 - weight1;

                    hist[bin0] += m * weight0;
                    hist[bin1] += m * weight1;
                }
            }
            cellHistograms[cy * HOG_CELLS_PER_DIM + cx] = hist;
        }
    }

    // Step 4: Block 正規化 (2x2 cells per block, L2-norm)
    const descriptor = [];

    for (let by = 0; by < HOG_BLOCKS_PER_DIM; by++) {
        for (let bx = 0; bx < HOG_BLOCKS_PER_DIM; bx++) {
            // 收集 block 內所有 cell 的 histogram
            const blockVec = [];
            for (let dy = 0; dy < HOG_BLOCK_SIZE; dy++) {
                for (let dx = 0; dx < HOG_BLOCK_SIZE; dx++) {
                    const hist = cellHistograms[(by + dy) * HOG_CELLS_PER_DIM + (bx + dx)];
                    for (let b = 0; b < HOG_NUM_BINS; b++) {
                        blockVec.push(hist[b]);
                    }
                }
            }

            // L2 正規化
            let norm = 0;
            for (let i = 0; i < blockVec.length; i++) norm += blockVec[i] * blockVec[i];
            norm = Math.sqrt(norm) + 1e-6; // 防除零
            for (let i = 0; i < blockVec.length; i++) {
                descriptor.push(blockVec[i] / norm);
            }
        }
    }

    return new Float32Array(descriptor);
}

/**
 * 計算兩個 HOG 描述子之間的歐氏距離
 */
function hogDistance(hogA, hogB) {
    let sum = 0;
    for (let i = 0; i < hogA.length; i++) {
        const d = hogA[i] - hogB[i];
        sum += d * d;
    }
    return Math.sqrt(sum);
}

// ════════════════════════════════════════════
// 灰階正規化 + 截尾 MSE（Layer 2）
// ════════════════════════════════════════════

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
    const range = max - min || 1;
    const result = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        result[i] = Math.round((gray[i] - min) / range * 255);
    }
    return result;
}

const TRIM_RATIO = 0.20;

function computeTrimmedGrayMSE(grayA, grayB) {
    const len = grayA.length;
    const diffs = new Float32Array(len);
    for (let i = 0; i < len; i++) {
        const d = grayA[i] - grayB[i];
        diffs[i] = d * d;
    }
    diffs.sort();
    const keepCount = Math.floor(len * (1 - TRIM_RATIO));
    let sum = 0;
    for (let i = 0; i < keepCount; i++) sum += diffs[i];
    return sum / keepCount;
}

// ════════════════════════════════════════════
// RGB MSE（Layer 3）
// ════════════════════════════════════════════

function computeRgbMSE(a, b) {
    const d1 = a.data;
    const d2 = b.data;
    const len = d1.length;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < len; i += 4) {
        const dR = d1[i] - d2[i];
        const dG = d1[i + 1] - d2[i + 1];
        const dB = d1[i + 2] - d2[i + 2];
        sum += dR * dR + dG * dG + dB * dB;
        count += 3;
    }
    return sum / count;
}

// ════════════════════════════════════════════
// 參考索引建立
// ════════════════════════════════════════════

/**
 * 預處理符號參考圖：同時儲存 RGB、灰階、HOG 三種表示
 * @param {Object} symbolImagesAll - { symbolName: [dataUrl1, ...], ... }
 * @returns {Promise<Map<string, { rgb: ImageData, gray: Uint8Array, hog: Float32Array }[]>>}
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
                const hog = extractHOG(rgb);
                refList.push({ rgb, gray, hog });
            } catch (e) {
                console.warn(`[LocalRecognizer] 載入符號 ${symbol} 參考圖失敗`, e);
            }
        }
        if (refList.length > 0) {
            index.set(symbol, refList);
        }
    }

    const totalRefs = [...index.values()].reduce((s, v) => s + v.length, 0);
    console.log(`[LocalRecognizer] 參考索引建立完成：${index.size} 個符號，共 ${totalRefs} 張參考圖（HOG + 灰階 + RGB）`);
    return index;
}

// ════════════════════════════════════════════
// 格子擷取
// ════════════════════════════════════════════

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

// ════════════════════════════════════════════
// 三層比對引擎
// ════════════════════════════════════════════

const HOG_TIEBREAK = 0.10;  // HOG 前兩名差距 < 10% → 進 Layer 2
const GRAY_TIEBREAK = 0.15; // 灰階前兩名差距 < 15% → 進 Layer 3

/**
 * 辨識單一格子（三層比對）
 * Layer 1: HOG 特徵距離（主力，天生抗特效）
 * Layer 2: 灰階正規化截尾 MSE（形狀細節決勝）
 * Layer 3: RGB MSE（色彩最終決勝）
 */
function matchCell(cellImageData, referenceIndex) {
    const cellHOG = extractHOG(cellImageData);
    const cellGray = toNormalizedGray(cellImageData);

    // Layer 1: HOG 比對 — 收集所有候選分數
    const candidates = [];
    for (const [symbol, refList] of referenceIndex) {
        for (const ref of refList) {
            const dist = hogDistance(cellHOG, ref.hog);
            candidates.push({ symbol, hogDist: dist, ref });
        }
    }

    candidates.sort((a, b) => a.hogDist - b.hogDist);

    if (candidates.length === 0) {
        return { symbol: '?', confidence: 0, mse: Infinity };
    }

    const top1 = candidates[0];
    let bestSymbol = top1.symbol;
    let bestScore = top1.hogDist;

    // Layer 2: 若 HOG 前兩名接近（不同符號），用灰階截尾 MSE 決勝
    if (candidates.length >= 2) {
        const top2 = candidates[1];
        if (top1.symbol !== top2.symbol && top1.hogDist > 0) {
            const hogGap = (top2.hogDist - top1.hogDist) / top1.hogDist;
            if (hogGap < HOG_TIEBREAK) {
                // 進入 Layer 2
                const grayMSE1 = computeTrimmedGrayMSE(cellGray, top1.ref.gray);
                const grayMSE2 = computeTrimmedGrayMSE(cellGray, top2.ref.gray);

                if (grayMSE1 > 0) {
                    const grayGap = Math.abs(grayMSE1 - grayMSE2) / Math.min(grayMSE1, grayMSE2);

                    if (grayGap < GRAY_TIEBREAK) {
                        // 進入 Layer 3: RGB 色彩決勝
                        const rgbMSE1 = computeRgbMSE(cellImageData, top1.ref.rgb);
                        const rgbMSE2 = computeRgbMSE(cellImageData, top2.ref.rgb);
                        if (rgbMSE2 < rgbMSE1) {
                            bestSymbol = top2.symbol;
                            bestScore = top2.hogDist;
                        }
                    } else if (grayMSE2 < grayMSE1) {
                        bestSymbol = top2.symbol;
                        bestScore = top2.hogDist;
                    }
                }
            }
        }
    }

    // confidence: HOG distance 0=100%, 10+=0%
    const confidence = Math.max(0, 100 - (bestScore * 10));
    return { symbol: bestSymbol, confidence: parseFloat(confidence.toFixed(1)), mse: parseFloat(bestScore.toFixed(4)) };
}

// ════════════════════════════════════════════
// 盤面辨識
// ════════════════════════════════════════════

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
