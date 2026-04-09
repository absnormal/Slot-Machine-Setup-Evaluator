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
 * @returns {{ isAllStopped, isFullyStill, isAnimationOnly, spinningCount, avgMAE, maxMAE, sliceMAEs }}
 */
export function analyzeSlicePattern(bandMAEs) {
    if (!bandMAEs || bandMAEs.length === 0) {
        return { isAllStopped: false, isFullyStill: false, isAnimationOnly: false, spinningCount: 0, avgMAE: 0, maxMAE: 0, sliceMAEs: [] };
    }

    const sliceMAEs = bandMAEs.map(b => b.full); // 向下相容
    const max = Math.max(...sliceMAEs);
    const avg = sliceMAEs.reduce((a, b) => a + b, 0) / sliceMAEs.length;

    // 判定：有任何一軸的 diff 極高（仍在旋轉）
    // 條件：整片 diff > 均值3倍 且 diff > 8
    let spinningCount = 0;

    for (let i = 0; i < bandMAEs.length; i++) {
        const d = bandMAEs[i].full;
        const blocks = bandMAEs[i].blocks;

        if (d > avg * 3 && d > 8) {
            // [抗飛行動畫過濾]：如果整片平均看起來在動，我們檢查 4 個區塊
            // 如果是一顆金幣往上飛，只會有 1~2 個區塊的 MAE 飆高，其他區塊 (背景殘留影像) 是靜止的。
            // 真正的轉輪是整條瀑布往下刷，4 個區塊都應該要有劇烈變化。
            // 我們容忍 1 個區塊可能剛好特徵不明顯，所以判定門檻為： >= 3 個區塊的 MAE 都大於 4 (顯著動態)
            const activeBlocks = blocks.filter(bDiff => bDiff > 4).length;

            if (activeBlocks >= 3) {
                spinningCount++;
            } else {
                console.log(`🛡️ [防干擾] 軸 ${i + 1} 整體誤差 ${d.toFixed(1)} 達標，但全高 4區段 中只有 ${activeBlocks} 區段在動 [${blocks.map(x => x.toFixed(1)).join(', ')}]，成功攔截為【飛行動畫局部干擾】!`);
            }
        }
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
