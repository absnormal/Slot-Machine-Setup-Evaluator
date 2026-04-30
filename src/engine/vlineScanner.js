/**
 * vlineScanner.js — V-Line 垂直切片引擎
 *
 * 將盤面 ROI 依軸數 (cols) 切成垂直切片，
 * 逐軸計算灰階 MAE 差異，精確判定每條軸的旋轉/停止狀態。
 */

import { SAMPLE_SIZE } from '../utils/videoUtils';

// ── V-Line 專用 Canvas ──

let _sliceCanvas = null;
let _sliceCtx = null;
export function getSliceCanvas() {
    if (!_sliceCanvas) {
        _sliceCanvas = document.createElement('canvas');
        _sliceCanvas.width = SAMPLE_SIZE;
        _sliceCanvas.height = SAMPLE_SIZE;
        _sliceCtx = _sliceCanvas.getContext('2d', { willReadFrequently: true });
    }
    return { canvas: _sliceCanvas, ctx: _sliceCtx };
}

/**
 * 從影片中裁切 ROI → 降採至 128×128 → 依軸數垂直切片 → 每片各自轉灰階
 * @param {HTMLVideoElement} video
 * @param {{ x, y, w, h }} roi  — 百分比座標
 * @param {number} cols         — 軸數（切片數）
 * @returns {Uint8Array[]} 每個切片的灰階像素陣列（長度 = cols）
 */
export function extractSliceGrays(video, roi, cols) {
    const { canvas, ctx } = getSliceCanvas();
    const sx = (roi.x / 100) * video.videoWidth;
    const sy = (roi.y / 100) * video.videoHeight;
    const sw = (roi.w / 100) * video.videoWidth;
    const sh = (roi.h / 100) * video.videoHeight;

    if (sw <= 1 || sh <= 1) return null;

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;

    const sliceWidth = Math.floor(SAMPLE_SIZE / cols);
    const slices = [];

    for (let c = 0; c < cols; c++) {
        const startX = c * sliceWidth;
        const endX = (c === cols - 1) ? SAMPLE_SIZE : (c + 1) * sliceWidth; // 最後一軸吃尾
        const w = endX - startX;
        const gray = new Uint8Array(w * SAMPLE_SIZE);

        for (let y = 0; y < SAMPLE_SIZE; y++) {
            for (let x = startX; x < endX; x++) {
                const srcIdx = (y * SAMPLE_SIZE + x) * 4;
                const dstIdx = y * w + (x - startX);
                gray[dstIdx] = (data[srcIdx] * 77 + data[srcIdx + 1] * 150 + data[srcIdx + 2] * 29) >> 8;
            }
        }
        slices.push(gray);
    }

    return slices;
}

/**
 * 逐軸計算 MAE，並將每條軸分為 4 個水平區塊 (Block)，用以過濾局部飛行動畫
 * @param {Uint8Array[]} prevSlices — 前一幀的 N 個切片
 * @param {Uint8Array[]} currSlices — 當前幀的 N 個切片
 * @returns {{ full: number, blocks: number[] }[]} 每個切片的 MAE 差異值與分塊差異
 */
export function computeSliceMAEs(prevSlices, currSlices) {
    if (!prevSlices || !currSlices || prevSlices.length !== currSlices.length) return null;

    const NUM_BLOCKS = 4;

    return prevSlices.map((prev, i) => {
        const curr = currSlices[i];
        if (!prev || !curr || prev.length !== curr.length) return { full: 0, blocks: Array(NUM_BLOCKS).fill(0) };
        
        let fullTotal = 0;
        const blockTotals = Array(NUM_BLOCKS).fill(0);
        const pixelsPerBlock = prev.length / NUM_BLOCKS;

        for (let j = 0; j < prev.length; j++) {
            const diff = Math.abs(prev[j] - curr[j]);
            fullTotal += diff;
            const blockIdx = Math.floor(j / pixelsPerBlock);
            blockTotals[blockIdx] += diff;
        }
        
        return {
            full: fullTotal / prev.length,
            blocks: blockTotals.map(t => t / pixelsPerBlock)
        };
    });
}

/**
 * 分析切片 MAE 分佈模式，精確判定盤面狀態 (加入 4區塊 動態過濾)
 * @param {{ full: number, blocks: number[] }[]} bandMAEs — 每軸的分塊 MAE 資料
 * @param {number} currentTime — 目前影片時間點 (可選用，用於 Log 顯示)
 * @param {boolean} enableEmptyBoardFilter — 是否啟用空盤過濾（Cascade模式），開啟時將豁免「死寂區段防呆」
 * @returns {{ isAllStopped, isFullyStill, isAnimationOnly, spinningCount, avgMAE, maxMAE, sliceMAEs }}
 */
export function analyzeSlicePattern(bandMAEs, currentTime = 0, enableEmptyBoardFilter = false) {
    if (!bandMAEs || bandMAEs.length === 0) {
        return { isAllStopped: false, isFullyStill: false, isAnimationOnly: false, spinningCount: 0, avgMAE: 0, maxMAE: 0, sliceMAEs: [] };
    }

    const sliceMAEs = bandMAEs.map(b => b.full); // 向下相容
    const max = Math.max(...sliceMAEs);
    const avg = sliceMAEs.reduce((a, b) => a + b, 0) / sliceMAEs.length;

    // 判定：有任何一軸的 diff 大於絕對門檻 (全軸在轉時，大家 diff 都很大，不能用 avg * 3 當判定)
    let spinningCount = 0;
    let anyIntercepted = false;
    let boardParams = [];

    for (let i = 0; i < bandMAEs.length; i++) {
        const d = bandMAEs[i].full;
        const blocks = bandMAEs[i].blocks;
        let isSpinning = false;
        let isIntercepted = false;
        let activeBlocks = 0;
        let gapRatio = 0;

        if (d >= 8) {
            activeBlocks = blocks.filter(bDiff => bDiff > 4).length;
            const sortedBlocks = [...blocks].sort((a, b) => a - b);
            const weakHalfAvg = (sortedBlocks[0] + sortedBlocks[1]) / 2;
            const maxBlock = sortedBlocks[3];
            const minBlock = sortedBlocks[0];
            
            gapRatio = maxBlock / (weakHalfAvg + 1.0);

            // [死寂區段防呆]：如果某個區段完全沒變動 (<1.5)，代表這不可能是整條在刷的轉輪！
            // 🔗 [Cascade] 如果開啟了空盤過濾，代表這是連鎖消除遊戲。碎片掉落時，很多時候只有局部軸在動（其他區段靜止）。
            // 在此模式下，碎片掉落就是轉動，必須完全無視「最少活躍區塊」與「落差比」的防呆限制！
            if (enableEmptyBoardFilter) {
                isSpinning = true;
                spinningCount++;
            } else if (activeBlocks >= 3 && gapRatio <= 5.0 && minBlock >= 1.5) {
                isSpinning = true;
                spinningCount++;
            } else {
                isIntercepted = true;
                anyIntercepted = true;
            }
        }
        boardParams.push({ d, blocks, activeBlocks, gapRatio, isSpinning, isIntercepted });
    }

    // 為了避免洗版，我們只在「確定有發生攔截 (⛔)」的情境下，才印出上帝視角盤面
    if (anyIntercepted) {
        const p = (n) => String(n).padStart(6, ' ');
        let logStr = `\n🛡️ [防干擾盤面 @ ${currentTime.toFixed(3)}s]\n`;
        logStr += `  軸 1   軸 2   軸 3   軸 4   軸 5\n`;
        logStr += `--------------------------------------\n`;
        for (let b = 0; b < 4; b++) {
            logStr += boardParams.map(bp => p(bp.blocks[b].toFixed(1))).join('') + ` | 區段 ${b+1}\n`;
        }
        logStr += `--------------------------------------\n`;
        logStr += boardParams.map(bp => p(bp.d.toFixed(1))).join('') + ` | 總誤差\n`;
        logStr += boardParams.map(bp => p(bp.d >= 8 ? bp.activeBlocks : '-')).join('') + ` | 活躍數\n`;
        logStr += boardParams.map(bp => p(bp.d >= 8 ? bp.gapRatio.toFixed(1) : '-')).join('') + ` | 落差比\n`;
        logStr += boardParams.map(bp => bp.isSpinning ? '  ✅  ' : (bp.isIntercepted ? '  ⛔  ' : '  ➖  ')).join('') + `| 判定\n`;
        console.log(logStr);
    }

    const hasSpinning = spinningCount > 0;

    // 完全靜止：所有軸的 diff 都極低
    const isFullyStill = max < 2;

    return {
        isAllStopped: !hasSpinning,                        // 全軸皆停（含特效與被濾除的飛行動畫）
        isFullyStill,                                       // 完全靜止（無特效）
        isAnimationOnly: !hasSpinning && !isFullyStill,     // 全停但有閃光或飛行動畫
        spinningCount,
        avgMAE: avg,
        maxMAE: max,
        sliceMAEs,
    };
}

/**
 * 計算滑動窗口的均值和標準差
 */
export function windowStats(arr) {
    if (arr.length === 0) return { mean: 0, std: 0 };
    const n = arr.length;
    const mean = arr.reduce((s, v) => s + v, 0) / n;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    return { mean, std: Math.sqrt(variance) };
}

/**
 * 計算所有切片合併後的灰階像素標準差
 * σ 極低 → 畫面近乎純色（空盤面特徵）
 */
export function computeBoardVariance(slices) {
    if (!slices || slices.length === 0) return { mean: 0, std: 0 };
    let sum = 0, count = 0;
    for (const s of slices) {
        for (let i = 0; i < s.length; i++) {
            sum += s[i];
            count++;
        }
    }
    const mean = sum / count;
    let sqSum = 0;
    for (const s of slices) {
        for (let i = 0; i < s.length; i++) {
            sqSum += (s[i] - mean) ** 2;
        }
    }
    return { mean, std: Math.sqrt(sqSum / count) };
}
