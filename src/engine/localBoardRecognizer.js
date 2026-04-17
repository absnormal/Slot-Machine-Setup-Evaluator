/**
 * localBoardRecognizer.js — HOG + Hue 融合辨識引擎（含亮度異常遮罩）
 *
 * 架構：
 * 前處理: 亮度異常遮罩 — 偵測並移除閃電/發光等特效像素
 * Pass 1: HOG (方向梯度長條圖) — 形狀比對，搭配直方圖等化 + 梯度截尾 + 中心加權
 * Pass 2: Hue (色相直方圖距離) — 色彩比對，區分同形異色符號
 * 融合: HOG × 0.7 + Color × 0.3
 *
 * 零依賴：100% 純 JS，無需 OpenCV / WASM
 */

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
 * 回傳值：0 ~ 1，0 = 完全相同色相分佈
 */
function computeHueHistDistance(imgDataA, imgDataB) {
    const BINS = 36; // 360° / 10°
    const histA = new Float32Array(BINS);
    const histB = new Float32Array(BINS);
    const dA = imgDataA.data;
    const dB = imgDataB.data;
    const len = dA.length;
    let countA = 0, countB = 0;

    for (let i = 0; i < len; i += 4) {
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

        const hueA = processPixel(dA[i], dA[i+1], dA[i+2]);
        const hueB = processPixel(dB[i], dB[i+1], dB[i+2]);
        if (hueA >= 0) { histA[Math.floor(hueA / 10) % BINS]++; countA++; }
        if (hueB >= 0) { histB[Math.floor(hueB / 10) % BINS]++; countB++; }
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
                refList.push({ hog, gray, rgb: imageData });
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

    // Step 5: 用 7×7 鄰域內的「正常像素平均 RGB」替換特效像素
    const cleaned = new Uint8ClampedArray(d);
    const R = 3; // 半徑 3 → 7×7 鄰域
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const idx = y * W + x;
            if (!mask[idx]) continue; // 正常像素不動

            let sumR = 0, sumG = 0, sumB = 0, count = 0;
            for (let dy = -R; dy <= R; dy++) {
                for (let dx = -R; dx <= R; dx++) {
                    const ny = y + dy, nx = x + dx;
                    if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
                    const nIdx = ny * W + nx;
                    if (mask[nIdx]) continue; // 跳過其他特效像素
                    const nRgb = nIdx * 4;
                    sumR += cleaned[nRgb];
                    sumG += cleaned[nRgb + 1];
                    sumB += cleaned[nRgb + 2];
                    count++;
                }
            }

            const pIdx = idx * 4;
            if (count > 0) {
                cleaned[pIdx] = Math.round(sumR / count);
                cleaned[pIdx + 1] = Math.round(sumG / count);
                cleaned[pIdx + 2] = Math.round(sumB / count);
            }
            // count === 0: 整個鄰域都是特效 → 保留原值（極端情況）
        }
    }

    return new ImageData(cleaned, W, H);
}

// ═══════════════════════════════════════════
// ── 融合比對 ──
// ═══════════════════════════════════════════

const HOG_WEIGHT = 0.7;   // 形狀權重
const COLOR_WEIGHT = 0.3; // 色彩權重

/**
 * 辨識單一格子（清洗特效 → 融合評分）
 *
 * 1. 先清洗 RGB 原圖（移除閃電/發光等異常亮像素）
 * 2. 在清洗後的圖上跑 HOG（形狀）+ Hue（色彩）
 * 3. 融合評分 = HOG × 0.7 + Color × 0.3
 */
export function matchCell(cellImageData, referenceIndex) {
    // 清洗特效像素
    const cleanedImg = cleanEffectPixels(cellImageData);

    const cellGray = toGray(cleanedImg);
    const cellEqGray = histogramEqualize(cellGray);
    const cellHOG = computeHOG(cellEqGray);

    let bestSymbol = '?';
    let bestScore = -1;
    for (const [symbol, refList] of referenceIndex) {
        for (const ref of refList) {
            const hogScore = cosineSimilarity(cellHOG, ref.hog);
            const hueDist = computeHueHistDistance(cleanedImg, ref.rgb);
            const colorSim = 1 - hueDist;
            const fused = hogScore * HOG_WEIGHT + colorSim * COLOR_WEIGHT;

            if (fused > bestScore) {
                bestScore = fused;
                bestSymbol = symbol;
            }
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
 */
export function recognizeBoard(boardCanvas, reelROI, gridRows, gridCols, referenceIndex) {
    const grid = [];
    const details = [];

    // 輔助函式：計算包含全形字的顯示長度
    const getDispLen = (str) => {
        let len = 0;
        for (let i = 0; i < str.length; i++) len += str.charCodeAt(i) > 255 ? 2 : 1;
        return len;
    };
    const padCenter = (str, targetLen) => {
        const cur = getDispLen(str);
        const pads = Math.max(0, targetLen - cur);
        const left = Math.floor(pads / 2);
        return ' '.repeat(left) + str + ' '.repeat(pads - left);
    };

    const colWidths = Array(gridCols).fill(0);
    const cellSyms = [];
    const cellScores = [];

    for (let r = 0; r < gridRows; r++) {
        const gridRow = [];
        const detailRow = [];
        cellSyms[r] = [];
        cellScores[r] = [];
        for (let c = 0; c < gridCols; c++) {
            const cellData = extractCell(boardCanvas, reelROI, r, c, gridRows, gridCols);
            const match = matchCell(cellData, referenceIndex);
            gridRow.push(match.symbol);
            detailRow.push(match);

            const sym = match.symbol;
            const score = `(${match.rawScore.toFixed(2)})`;
            cellSyms[r][c] = sym;
            cellScores[r][c] = score;
            colWidths[c] = Math.max(colWidths[c], getDispLen(sym), getDispLen(score));
        }
        grid.push(gridRow);
        details.push(detailRow);
    }

    const logRows = [];
    logRows.push('');
    for (let r = 0; r < gridRows; r++) {
        const symRow = [];
        const scoreRow = [];
        for (let c = 0; c < gridCols; c++) {
            symRow.push(padCenter(cellSyms[r][c], colWidths[c]));
            scoreRow.push(padCenter(cellScores[r][c], colWidths[c]));
        }
        logRows.push(symRow.join(' | '));
        logRows.push(scoreRow.join(' | '));
        if (r < gridRows - 1) logRows.push('');
    }

    console.log(`\n=== 盤面辨識結果 (HOG+Hue 融合) ===${logRows.join('\n')}\n==============================================\n`);

    return { grid, details };
}
