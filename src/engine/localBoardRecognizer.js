/**
 * localBoardRecognizer.js — HOG + Hue 融合辨識引擎（含亮度異常遮罩 + CASH OCR）
 *
 * 架構：
 * 前處理: 亮度異常遮罩 — 偵測並移除閃電/發光等特效像素
 * Pass 1: HOG (方向梯度長條圖) — 形狀比對，搭配直方圖等化 + 梯度截尾 + 中心加權
 * Pass 2: Hue (色相直方圖距離) — 色彩比對，區分同形異色符號
 * Pass 3: CASH OCR — 對被辨識為 CASH 的格子讀取數字值
 * 融合: HOG × 0.7 + Color × 0.3
 */

import { parseShorthandValue } from '../utils/symbolUtils';

const MATCH_SIZE = 64; // 統一縮放到 64x64 做比對

// ═══════════════════════════════════════════
// ── 灰階轉換 ──
// ═══════════════════════════════════════════

/**
 * 將 ImageData 轉為灰階 Uint8Array（不做正規化，保留原始灰度資訊給 SSIM）
 */
function toGray(imageData) {
    const d = imageData.data;
    const len = d.length / 4;
    const gray = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        const idx = i * 4;
        gray[i] = Math.round(d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114);
    }
    return gray;
}

/**
 * 直方圖等化 — 將灰階分佈拉伸到 0~255 全範圍
 * 能有效對抗「反灰/變暗」導致的對比度壓縮
 */
function histogramEqualize(gray) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

    const cdf = new Uint32Array(256);
    cdf[0] = hist[0];
    for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];

    const cdfMin = cdf.find(v => v > 0);
    const total = gray.length;
    const result = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i++) {
        result[i] = Math.round(((cdf[gray[i]] - cdfMin) / (total - cdfMin)) * 255);
    }
    return result;
}

// ═══════════════════════════════════════════
// ── HOG (Histogram of Oriented Gradients) ──
// ═══════════════════════════════════════════

const HOG_CELL_SIZE = 8;     // 每個 cell 為 8x8 像素
const HOG_BLOCK_SIZE = 2;    // 每個 block 為 2x2 cells
const HOG_NUM_BINS = 9;      // 梯度方向量化為 9 個 bin (0°–180°)

/**
 * 計算 HOG 特徵向量
 * @param {Uint8Array} gray - 64x64 灰階影像
 * @returns {Float32Array} HOG 特徵向量
 */
function computeHOG(gray) {
    const W = MATCH_SIZE;
    const H = MATCH_SIZE;
    const cellsX = W / HOG_CELL_SIZE; // 8
    const cellsY = H / HOG_CELL_SIZE; // 8

    // Step 1: 計算每個像素的梯度大小和方向
    const magnitudes = new Float32Array(W * H);
    const angles = new Float32Array(W * H);

    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const gx = gray[y * W + x + 1] - gray[y * W + x - 1];
            const gy = gray[(y + 1) * W + x] - gray[(y - 1) * W + x];
            let mag = Math.sqrt(gx * gx + gy * gy);
            let angle = Math.atan2(gy, gx) * (180 / Math.PI); // -180 ~ 180
            if (angle < 0) angle += 180; // 轉成 unsigned: 0 ~ 180
            magnitudes[y * W + x] = mag;
            angles[y * W + x] = angle;
        }
    }

    // Step 1.5: 梯度截尾 — 把最強的 10% 梯度值壓到 P90 閾值
    // 閃電/發光線的梯度會超級大，壓住之後就不會主導整個 histogram
    const sorted = Float32Array.from(magnitudes).sort();
    const p90Idx = Math.floor(sorted.length * 0.90);
    const magCap = sorted[p90Idx] || 1;
    for (let i = 0; i < magnitudes.length; i++) {
        if (magnitudes[i] > magCap) magnitudes[i] = magCap;
    }

    // Step 1.6: 中心加權 Gaussian — 格子中央的像素權重更高，邊緣特效影響降低
    const sigma = W / 4;
    const cx = W / 2, cy = H / 2;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const dx = x - cx, dy = y - cy;
            const weight = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
            magnitudes[y * W + x] *= weight;
        }
    }

    // Step 2: 為每個 cell 建立 9-bin 直方圖
    const cellHists = new Array(cellsY);
    for (let cy = 0; cy < cellsY; cy++) {
        cellHists[cy] = new Array(cellsX);
        for (let cx = 0; cx < cellsX; cx++) {
            const hist = new Float32Array(HOG_NUM_BINS);
            const startY = cy * HOG_CELL_SIZE;
            const startX = cx * HOG_CELL_SIZE;

            for (let dy = 0; dy < HOG_CELL_SIZE; dy++) {
                for (let dx = 0; dx < HOG_CELL_SIZE; dx++) {
                    const px = startX + dx;
                    const py = startY + dy;
                    const idx = py * W + px;
                    const mag = magnitudes[idx];
                    const ang = angles[idx];

                    // 雙線性插值到相鄰的兩個 bin
                    const binWidth = 180 / HOG_NUM_BINS; // 20°
                    const binFloat = ang / binWidth;
                    const binLow = Math.floor(binFloat) % HOG_NUM_BINS;
                    const binHigh = (binLow + 1) % HOG_NUM_BINS;
                    const ratio = binFloat - Math.floor(binFloat);

                    hist[binLow] += mag * (1 - ratio);
                    hist[binHigh] += mag * ratio;
                }
            }
            cellHists[cy][cx] = hist;
        }
    }

    // Step 3: Block 正規化 (2x2 cells / block, stride=1)
    const blocksX = cellsX - HOG_BLOCK_SIZE + 1; // 7
    const blocksY = cellsY - HOG_BLOCK_SIZE + 1; // 7
    const featureSize = blocksX * blocksY * HOG_BLOCK_SIZE * HOG_BLOCK_SIZE * HOG_NUM_BINS;
    const features = new Float32Array(featureSize);
    let fIdx = 0;

    for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
            // 收集 block 內的所有 cell histogram
            const blockVec = [];
            for (let dy = 0; dy < HOG_BLOCK_SIZE; dy++) {
                for (let dx = 0; dx < HOG_BLOCK_SIZE; dx++) {
                    const h = cellHists[by + dy][bx + dx];
                    for (let b = 0; b < HOG_NUM_BINS; b++) {
                        blockVec.push(h[b]);
                    }
                }
            }

            // L2 正規化 — 這一步是 HOG 能免疫亮度變化的核心
            const eps = 1e-6;
            let norm = 0;
            for (let i = 0; i < blockVec.length; i++) norm += blockVec[i] * blockVec[i];
            norm = Math.sqrt(norm) + eps;
            for (let i = 0; i < blockVec.length; i++) {
                features[fIdx++] = blockVec[i] / norm;
            }
        }
    }

    return features;
}

/**
 * 計算兩個 HOG 向量的餘弦相似度 (Cosine Similarity)
 * 回傳值：-1 ~ 1，1 = 完全相同
 */
function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
}

// ═══════════════════════════════════════════
// ── SSIM (Structural Similarity Index) ──
// ═══════════════════════════════════════════

/**
 * 計算兩張灰階影像的 SSIM
 * 回傳值：-1 ~ 1，1 = 完全相同
 */
function computeSSIM(grayA, grayB) {
    const len = grayA.length;
    let sumA = 0, sumB = 0;
    for (let i = 0; i < len; i++) {
        sumA += grayA[i];
        sumB += grayB[i];
    }
    const muA = sumA / len;
    const muB = sumB / len;

    let varA = 0, varB = 0, covAB = 0;
    for (let i = 0; i < len; i++) {
        const dA = grayA[i] - muA;
        const dB = grayB[i] - muB;
        varA += dA * dA;
        varB += dB * dB;
        covAB += dA * dB;
    }
    varA /= len;
    varB /= len;
    covAB /= len;

    const C1 = 6.5025;  // (0.01 * 255)^2
    const C2 = 58.5225;  // (0.03 * 255)^2
    const numerator = (2 * muA * muB + C1) * (2 * covAB + C2);
    const denominator = (muA * muA + muB * muB + C1) * (varA + varB + C2);
    return numerator / denominator;
}

/**
 * 計算兩張 RGBA ImageData 之間的色相距離 (Hue Histogram Distance)
 * 專門用來區分「形狀相同但顏色不同」的符號（如檸檬 vs 橘子）
 * 只比對中央 60% 區域，排除邊緣背景色污染
 * 回傳值：0 ~ 1，0 = 完全相同色相分佈
 */
function computeHueHistDistance(imgDataA, imgDataB) {
    const BINS = 36; // 360° / 10°
    const histA = new Float32Array(BINS);
    const histB = new Float32Array(BINS);
    const dA = imgDataA.data;
    const dB = imgDataB.data;
    const W = imgDataA.width;
    const H = imgDataA.height;
    let countA = 0, countB = 0;

    // 中央裁切：只取內部 60%（跳過外圍 20% 邊緣）
    const margin = 0.20;
    const x0 = Math.floor(W * margin);
    const y0 = Math.floor(H * margin);
    const x1 = Math.floor(W * (1 - margin));
    const y1 = Math.floor(H * (1 - margin));

    // RGB → Hue (簡化版)
    const processPixel = (r, g, b) => {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        if (delta < 15 || max < 30) return -1; // 太暗或灰色跳過
        let hue;
        if (max === r) hue = ((g - b) / delta) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue *= 60;
        if (hue < 0) hue += 360;
        return hue;
    };

    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = (y * W + x) * 4;
            const hueA = processPixel(dA[i], dA[i+1], dA[i+2]);
            const hueB = processPixel(dB[i], dB[i+1], dB[i+2]);
            if (hueA >= 0) { histA[Math.floor(hueA / 10) % BINS]++; countA++; }
            if (hueB >= 0) { histB[Math.floor(hueB / 10) % BINS]++; countB++; }
        }
    }

    // 正規化
    if (countA > 0) for (let i = 0; i < BINS; i++) histA[i] /= countA;
    if (countB > 0) for (let i = 0; i < BINS; i++) histB[i] /= countB;

    // Bhattacharyya 距離
    let bc = 0;
    for (let i = 0; i < BINS; i++) bc += Math.sqrt(histA[i] * histB[i]);
    return 1 - bc; // 0 = 完全相同, 1 = 完全不同
}

// ═══════════════════════════════════════════
// ── 參考索引建立 ──
// ═══════════════════════════════════════════

/**
 * 預處理符號參考圖：計算 HOG 特徵向量 + 灰階陣列
 * @param {Object} symbolImagesAll - { symbolName: [dataUrl1, dataUrl2, ...], ... }
 * @returns {Promise<Map<string, { hog: Float32Array, gray: Uint8Array }[]>>}
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
                const imageData = ctx.getImageData(0, 0, MATCH_SIZE, MATCH_SIZE);
                const gray = toGray(imageData);
                const eqGray = histogramEqualize(gray);
                const hog = computeHOG(eqGray);
                refList.push({ hog, gray, eqGray, rgb: imageData });
            } catch (e) {
                console.warn(`[LocalRecognizer] 載入符號 ${symbol} 參考圖失敗`, e);
            }
        }
        if (refList.length > 0) {
            index.set(symbol, refList);
        }
    }

    const totalRefs = [...index.values()].reduce((s, v) => s + v.length, 0);
    console.log(`[LocalRecognizer] HOG 參考索引建立完成：${index.size} 個符號，共 ${totalRefs} 張參考圖`);
    return index;
}

// ═══════════════════════════════════════════
// ── 格子擷取 ──
// ═══════════════════════════════════════════

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
 * 從盤面擷取單一格子的原始解析度 Canvas（供 OCR 使用，不縮放到 64x64）
 */
function extractCellCanvas(boardCanvas, roi, row, col, totalRows, totalCols) {
    const cellW = roi.width / totalCols;
    const cellH = roi.height / totalRows;
    const sx = roi.x + col * cellW;
    const sy = roi.y + row * cellH;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(cellW));
    canvas.height = Math.max(1, Math.floor(cellH));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(boardCanvas, sx, sy, cellW, cellH, 0, 0, canvas.width, canvas.height);
    return canvas;
}

/**
 * 對單一格子執行 PaddleOCR，回傳辨識到的原始文字
 * @param {HTMLCanvasElement} cellCanvas - 格子的原始解析度 Canvas
 * @param {Object} ocrWorker - PaddleOCR Worker 實例
 * @returns {Promise<string>} 辨識到的原始文字，失敗回傳空字串
 */
async function ocrCellRawText(cellCanvas, ocrWorker) {
    try {
        const cw = cellCanvas.width;
        const ch = cellCanvas.height;
        if (cw < 2 || ch < 2) return '';

        let scale = 48 / ch;
        if (scale < 1) scale = 1;

        const finalW = cw * scale;
        const finalH = ch * scale;

        const PADDING = 20;
        const ocrCanvas = document.createElement('canvas');
        ocrCanvas.width = Math.floor(finalW) + (PADDING * 2);
        ocrCanvas.height = Math.floor(finalH) + (PADDING * 2);
        const ctx = ocrCanvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, ocrCanvas.width, ocrCanvas.height);
        ctx.filter = 'contrast(1.8) brightness(1.1)';
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(cellCanvas, 0, 0, cw, ch, PADDING, PADDING, finalW, finalH);

        const detectedLines = await ocrWorker.detect(ocrCanvas.toDataURL('image/png'));
        return (detectedLines || []).map(t => t.text).join(' ').trim();
    } catch (err) {
        console.warn('[LocalOCR] 格子 OCR 失敗:', err);
        return '';
    }
}

/**
 * 將 OCR 原始文字解析為數值（支援 K/M/B 簡寫）
 * @param {string} rawText - OCR 原始文字
 * @returns {number} 解析出的數值，失敗回傳 0
 */
function parseOcrNumericValue(rawText) {
    if (!rawText) return 0;

    // 保留數字、小數點、逗號、K/M/B
    let cleaned = rawText.replace(/[^0-9.,KMBkmb]/g, '');
    if (!cleaned) return 0;

    // 移除逗號
    cleaned = cleaned.replace(/,/g, '');

    // 處理 OCR 將千分位逗號誤判為小數點的情況 (例如 1.036.022)
    const dotParts = cleaned.split('.');
    if (dotParts.length > 2) {
        const decimals = dotParts.pop();
        cleaned = dotParts.join('') + '.' + decimals;
    }

    return parseShorthandValue(cleaned);
}
// ═══════════════════════════════════════════
// ── 亮度異常遮罩 (Brightness Outlier Masking) ──
// ═══════════════════════════════════════════

const BRIGHT_OFFSET = 60; // 亮度超過中位數 + 此值的像素被視為特效

/**
 * 清洗特效像素：偵測異常明亮的像素（閃電/發光/連線動畫）並替換
 * 原理：特效像素不管什麼顏色，都會比正常符號像素明亮很多
 * @param {ImageData} imageData - 原始 RGBA 影像
 * @returns {ImageData} 清洗後的 RGBA 影像（新物件，不修改原始資料）
 */
function cleanEffectPixels(imageData) {
    const d = imageData.data;
    const W = imageData.width;
    const H = imageData.height;
    const len = W * H;

    // Step 1: 計算每個像素的亮度
    const lum = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        const idx = i * 4;
        lum[i] = Math.round(d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114);
    }

    // Step 2: 找亮度中位數
    const sorted = Uint8Array.from(lum).sort();
    const median = sorted[len >> 1];
    const threshold = median + BRIGHT_OFFSET;

    // Step 3: 如果沒有異常像素（正常/反灰盤面），直接返回原圖
    let brightCount = 0;
    for (let i = 0; i < len; i++) {
        if (lum[i] > threshold) brightCount++;
    }
    if (brightCount < len * 0.05) return imageData; // < 5% 異常像素 → 不需清洗

    // Step 4: 建立遮罩 (true = 特效像素)
    const mask = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        mask[i] = lum[i] > threshold ? 1 : 0;
    }

    // Step 5: 計算所有「非特效像素」的 RGB 中位數（代表符號主色調）
    const normalR = [], normalG = [], normalB = [];
    for (let i = 0; i < len; i++) {
        if (!mask[i]) {
            const idx4 = i * 4;
            normalR.push(d[idx4]);
            normalG.push(d[idx4 + 1]);
            normalB.push(d[idx4 + 2]);
        }
    }
    normalR.sort((a, b) => a - b);
    normalG.sort((a, b) => a - b);
    normalB.sort((a, b) => a - b);
    const mid = normalR.length >> 1;
    const medR = normalR[mid] || 128;
    const medG = normalG[mid] || 128;
    const medB = normalB[mid] || 128;

    // Step 6: 用非特效 RGB 中位數替換特效像素（避免引入背景藍色偏差）
    const cleaned = new Uint8ClampedArray(d);
    for (let i = 0; i < len; i++) {
        if (!mask[i]) continue;
        const pIdx = i * 4;
        cleaned[pIdx] = medR;
        cleaned[pIdx + 1] = medG;
        cleaned[pIdx + 2] = medB;
    }

    return new ImageData(cleaned, W, H);
}

// ═══════════════════════════════════════════
// ── 融合比對 ──
// ═══════════════════════════════════════════

const HOG_WEIGHT = 0.85;   // 形狀權重
const COLOR_WEIGHT = 0.15; // 色彩權重（降低以減少背景色干擾）
const TIEBREAK_THRESHOLD = 0.03; // 融合分差 < 3% 視為平手，啟動 SSIM 仲裁

/**
 * 辨識單一格子（清洗特效 → 融合評分 → SSIM 仲裁）
 *
 * 1. 先清洗 RGB 原圖（移除閃電/發光等異常亮像素）
 * 2. 在清洗後的圖上跑 HOG（形狀）+ Hue（色彩，僅中央 60%）
 * 3. 融合評分 = HOG × 0.85 + Color × 0.15
 * 4. 若前幾名分數接近（差 < 3%），啟動 SSIM 逐像素結構比對仲裁
 */
export function matchCell(cellImageData, referenceIndex) {
    // 清洗特效像素
    const cleanedImg = cleanEffectPixels(cellImageData);

    const cellGray = toGray(cleanedImg);
    const cellEqGray = histogramEqualize(cellGray);
    const cellHOG = computeHOG(cellEqGray);

    // Round 1: HOG + Hue 融合 — 收集每個符號的最佳分數
    const candidates = [];
    for (const [symbol, refList] of referenceIndex) {
        let bestFused = -1;
        let bestRef = null;
        for (const ref of refList) {
            const hogScore = cosineSimilarity(cellHOG, ref.hog);
            const hueDist = computeHueHistDistance(cleanedImg, ref.rgb);
            const colorSim = 1 - hueDist;
            const fused = hogScore * HOG_WEIGHT + colorSim * COLOR_WEIGHT;
            if (fused > bestFused) {
                bestFused = fused;
                bestRef = ref;
            }
        }
        if (bestRef) candidates.push({ symbol, fused: bestFused, ref: bestRef });
    }

    candidates.sort((a, b) => b.fused - a.fused);

    if (candidates.length === 0) {
        return { symbol: '?', confidence: 0, rawScore: 0 };
    }

    let bestSymbol = candidates[0].symbol;
    let bestScore = candidates[0].fused;

    // Round 2: SSIM Tiebreaker — 分數接近時用結構比對仲裁
    if (candidates.length >= 2) {
        const tieGroup = candidates.filter(c => candidates[0].fused - c.fused < TIEBREAK_THRESHOLD);
        if (tieGroup.length > 1 && tieGroup[0].symbol !== tieGroup[1].symbol) {
            let bestSSIM = -1;
            for (const c of tieGroup) {
                const ssim = computeSSIM(cellEqGray, c.ref.eqGray || c.ref.gray);
                if (ssim > bestSSIM) {
                    bestSSIM = ssim;
                    bestSymbol = c.symbol;
                }
            }
            console.log(`🔬 [SSIM Tiebreaker] ${tieGroup.map(c => `${c.symbol}(${c.fused.toFixed(3)})`).join(' vs ')} → ${bestSymbol} (SSIM=${bestSSIM.toFixed(3)})`);
        }
    }

    const confidence = Math.max(0, Math.min(100, bestScore * 100));
    return {
        symbol: bestSymbol,
        confidence: parseFloat(confidence.toFixed(1)),
        rawScore: parseFloat(bestScore.toFixed(3))
    };
}

// ═══════════════════════════════════════════
// ── 盤面辨識 ──
// ═══════════════════════════════════════════

/**
 * 辨識整個盤面
 * @param {HTMLCanvasElement} boardCanvas - 完整截圖的 Canvas
 * @param {Object} reelROI - 盤面區域 {x, y, width, height} (像素座標)
 * @param {number} gridRows - 列數
 * @param {number} gridCols - 欄數
 * @param {Map} referenceIndex - HOG 參考索引
 * @param {Object} [options] - 額外選項
 * @param {Object} [options.ocrWorker] - PaddleOCR Worker，傳入後會對 CASH/JP 格子做 OCR
 * @param {boolean} [options.hasCashCollect] - 是否啟用 CASH 收集功能
 * @param {Object} [options.jpConfig] - JP 符號設定 { GRAND: 1000, MAJOR: 500, ... }
 */
export async function recognizeBoard(boardCanvas, reelROI, gridRows, gridCols, referenceIndex, options = {}) {
    const { ocrWorker, hasCashCollect, jpConfig } = options;
    const grid = [];
    const details = [];

    // ── 第一輪：HOG + Hue 形狀辨識 ──
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

    // ── 第二輪：對 CASH / JP 格子執行 OCR，用文字判定符號並提取數值 ──
    // CASH 和 JP 金幣外觀幾乎一模一樣，先用 OCR 讀文字再決定是哪個
    // 若 OCR 完全讀不到 → HOG 可能誤判（如閃電特效讓檸檬看起來像金幣），排除 CASH/JP 重新比對
    if (hasCashCollect && ocrWorker) {
        const jpNames = jpConfig ? Object.keys(jpConfig).map(k => k.toUpperCase()) : [];

        // 預建排除 CASH/JP 的參考索引，供 OCR 失敗時重新比對
        const filteredIndex = new Map(
            [...referenceIndex].filter(([sym]) => {
                const upper = sym.toUpperCase();
                return !upper.startsWith('CASH') && !jpNames.includes(upper);
            })
        );

        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) {
                const sym = grid[r][c];
                if (!sym) continue;

                const upperSym = sym.toUpperCase();
                const isCashLike = upperSym.startsWith('CASH');
                const isJpLike = jpNames.includes(upperSym);

                if (!isCashLike && !isJpLike) continue;

                const cellCanvas = extractCellCanvas(boardCanvas, reelROI, r, c, gridRows, gridCols);
                const rawText = await ocrCellRawText(cellCanvas, ocrWorker);
                console.log(`[LocalOCR] (${r},${c}) 形狀辨識: ${sym}, OCR 文字: "${rawText}"`);

                // 優先比對 JP 文字 — JP 金幣上印有 "GRAND", "MAJOR" 等文字
                if (rawText) {
                    const matchedJp = jpNames.find(jp => rawText.toUpperCase().includes(jp));
                    if (matchedJp) {
                        grid[r][c] = matchedJp;
                        details[r][c] = { ...details[r][c], symbol: matchedJp, ocrText: rawText };
                        console.log(`[LocalOCR] (${r},${c}) ${sym} → ${matchedJp} (JP 文字匹配)`);
                        continue;
                    }

                    // 非 JP → 嘗試解析為 CASH 數值
                    const value = parseOcrNumericValue(rawText);
                    if (value > 0) {
                        const newSymbol = `CASH_${value}`;
                        grid[r][c] = newSymbol;
                        details[r][c] = { ...details[r][c], symbol: newSymbol, ocrValue: value };
                        console.log(`[LocalOCR] (${r},${c}) ${sym} → ${newSymbol}`);
                        continue;
                    }
                }

                // OCR 讀不到 JP 文字也讀不到數字 → HOG 可能誤判（如閃電特效讓普通符號像金幣）
                // 排除 CASH/JP 重新比對，找回正確符號
                if (filteredIndex.size > 0) {
                    const cellData = extractCell(boardCanvas, reelROI, r, c, gridRows, gridCols);
                    const reMatch = matchCell(cellData, filteredIndex);
                    grid[r][c] = reMatch.symbol;
                    details[r][c] = reMatch;
                    console.log(`[LocalOCR] (${r},${c}) ${sym} → ${reMatch.symbol} (OCR 無結果，HOG 重新比對)`);
                }
            }
        }
    }

    console.log(`=== 本地辨識結果 ===`);
    console.table(grid);

    return { grid, details };
}
