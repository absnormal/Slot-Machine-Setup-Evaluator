/**
 * localBoardRecognizer.js — OpenCV ORB 版盤面辨識引擎
 *
 * 完全改用特徵點（Keypoints）算法，能夠無視大面積反灰、發光或遮擋特效。
 */
import cv from '@techstark/opencv-js';

const MATCH_SIZE = 150; 

// ── OpenCV 初始化防呆 ──
export const ensureOpenCV = () => {
    return new Promise((resolve) => {
        if (cv.getBuildInformation) {
            resolve();
            return;
        }
        cv.onRuntimeInitialized = resolve;
        
        const fallback = setInterval(() => {
            if (cv.getBuildInformation) {
                clearInterval(fallback);
                resolve();
            }
        }, 100);
    });
};

/**
 * 預處理符號參考圖：建立 OpenCV ORB 特徵點與 Descriptors
 */
export async function buildReferenceIndex(symbolImagesAll) {
    await ensureOpenCV();
    const index = new Map();

    const loadImage = (url) => new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });

    const orb = new cv.ORB(500);

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
                
                const mat = cv.matFromImageData(imageData);
                const gray = new cv.Mat();
                cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY, 0);

                const keypoints = new cv.KeyPointVector();
                const descriptors = new cv.Mat();
                
                orb.detectAndCompute(gray, new cv.Mat(), keypoints, descriptors);
                
                refList.push({ 
                    rgb: imageData,
                    kpCount: keypoints.size(),
                    descriptors: descriptors.clone(),
                });
                
                mat.delete();
                gray.delete();
                keypoints.delete();
                descriptors.delete();
            } catch (e) {
                console.warn(`[LocalRecognizer] 載入符號 ${symbol} 參考圖失敗`, e);
            }
        }
        if (refList.length > 0) {
            index.set(symbol, refList);
        }
    }
    orb.delete();
    console.log(`[LocalRecognizer] ORB 參考索引建立完成：${index.size} 個符號`);
    return index;
}

export function cleanupReferenceIndex(index) {
    if (!index) return;
    for (const [symbol, refList] of index) {
        for (const ref of refList) {
            try {
                if (ref.descriptors) ref.descriptors.delete();
            } catch(e) {}
        }
    }
    index.clear();
}

// ── 格子擷取 ──
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
 * 辨識單一格子（OpenCV ORB 匹配）
 */
export function matchCell(cellImageData, referenceIndex, r, c) {
    const mat = cv.matFromImageData(cellImageData);
    const gray = new cv.Mat();
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY, 0);

    const orb = new cv.ORB(500);
    const keypoints = new cv.KeyPointVector();
    const targetDesc = new cv.Mat();
    
    orb.detectAndCompute(gray, new cv.Mat(), keypoints, targetDesc);
    const targetKpCount = keypoints.size();

    const candidates = [];
    const bf = new cv.BFMatcher(cv.NORM_HAMMING, true); 

    for (const [symbol, refList] of referenceIndex) {
        let bestScoreForSymbol = -1;
        
        for (const ref of refList) {
            if (targetDesc.rows === 0 || ref.descriptors.rows === 0) continue;
            
            const matches = new cv.DMatchVector();
            bf.match(targetDesc, ref.descriptors, matches);
            
            let goodMatches = 0;
            for (let i = 0; i < matches.size(); i++) {
                if (matches.get(i).distance < 60) {
                    goodMatches++;
                }
            }
            
            const minKp = Math.min(targetKpCount, ref.kpCount);
            let matchRate = minKp > 0 ? (goodMatches / minKp) : 0;
            
            // 權重調整：若特徵點太少，容易出現 1/1 = 100% 的極端，用數量打折
            matchRate = matchRate * Math.min(1.0, goodMatches / 10.0);

            if (matchRate > bestScoreForSymbol) {
                bestScoreForSymbol = matchRate;
            }
            matches.delete();
        }
        candidates.push({ symbol, score: bestScoreForSymbol });
    }

    mat.delete();
    gray.delete();
    orb.delete();
    keypoints.delete();
    targetDesc.delete();
    bf.delete();

    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
        return { symbol: '?', confidence: 0, rawScore: 0 };
    }

    const top1 = candidates[0];
    const top2 = candidates.length > 1 ? candidates[1] : null;

    // 將 0~1 的 matchRate 放大到 0~100 confidence
    const confidence = Math.max(0, Math.min(100, Math.max(0, top1.score) * 120)); // ORB features Rarely hit 100%, 120x multiplier helps readability

    return { 
        symbol: top1.symbol, 
        confidence: parseFloat(confidence.toFixed(1)), 
        rawScore: parseFloat(top1.score.toFixed(3)) 
    };
}

export function recognizeBoard(boardCanvas, reelROI, gridRows, gridCols, referenceIndex) {
    const grid = [];
    const details = [];
    const logRows = [];

    for (let r = 0; r < gridRows; r++) {
        const gridRow = [];
        const detailRow = [];
        const logSymbolRows = [];
        const logScoreRows = [];
        for (let c = 0; c < gridCols; c++) {
            const cellData = extractCell(boardCanvas, reelROI, r, c, gridRows, gridCols);
            const match = matchCell(cellData, referenceIndex, r, c);
            gridRow.push(match.symbol);
            detailRow.push(match);
            
            // 計算中英文字串長度（簡單抓個 10 寬度 padding）
            let sym = match.symbol;
            if(sym.length < 10) sym = sym + ' '.repeat(10 - sym.length);
            
            let score = `(${match.rawScore.toFixed(2)})`;
            if(score.length < 10) score = score + ' '.repeat(10 - score.length);

            logSymbolRows.push(sym);
            logScoreRows.push(score);
        }
        grid.push(gridRow);
        details.push(detailRow);
        logRows.push(logSymbolRows.join(' | '));
        logRows.push(logScoreRows.join(' | '));
        logRows.push(''); // 分行確保閱讀體驗
    }

    console.log(`\n=== 盤面辨識結果 (OpenCV ORB) ===\n${logRows.join('\n')}==============================================\n`);

    return { grid, details };
}
