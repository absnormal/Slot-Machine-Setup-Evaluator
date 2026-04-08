import { useState, useRef, useCallback, useEffect } from 'react';
import Ocr from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web';

/**
 * useKeyframeExtractor — 自適應關鍵幀提取器
 *
 * 核心原理：用 μ±σ 動態閾值取代所有固定參數 (Coverage/V-Line/Sensitivity/motionDelay)
 * 
 * 演算法：
 * 1. 逐幀計算盤面 ROI 的灰階 MAE (Mean Absolute Error)
 * 2. 滑動窗口統計 (均值 μ + 標準差 σ)
 * 3. 偵測「動→靜」轉折 → 產出候選幀
 * 4. 相似幀去重
 *
 * 不需要 motionCoverageMin、vLineThreshold、sensitivity 等參數
 */

// ── 常數 ──
const SAMPLE_SIZE = 128;               // ROI 降採尺寸 (128x128)
const DEDUP_THRESHOLD = 8;             // 去重 MAE 閾值（低於此值視為相同幀）
const MIN_MOTION_RATIO = 0.25;         // 窗口中至少 25% 的幀有動態，才算「之前有動過」
const STABLE_RATIO = 0.3;              // diff < μ×STABLE_RATIO 視為穩定
const POST_STABLE_FRAMES = 2;          // 穩定後再等 N 幀才截圖（避免假停輪）
const ANIMATION_TIMEOUT_FRAMES = 3;    // 動畫備援：衰減後維持 3 幀（約 0.3s @10fps）即觸發
const DECAY_RATIO = 0.3;               // MAE 降到旋轉高峰的 30% 以下視為「大幅衰減」
const MIN_CONSECUTIVE = 2;             // 跑分緩衝：連續 N 次相同 OCR 才視為數字穩定

/**
 * 取代 setTimeout 的不降速讓步函數，解決網頁在背景執行時被降速至 1FPS 的問題
 */
function yieldToMain(delayMs = 15) {
    return new Promise(resolve => {
        if (document.hidden) {
            const ch = new MessageChannel();
            ch.port1.onmessage = resolve;
            ch.port2.postMessage(null);
        } else {
            setTimeout(resolve, delayMs);
        }
    });
}

// ── 工具函式 ──

/** 等待 video.currentTime seek 完成 */
function waitForSeek(video) {
    return new Promise((resolve) => {
        if (video.seeking) {
            video.addEventListener('seeked', resolve, { once: true });
        } else {
            resolve();
        }
    });
}

/** 取得/重用離屏 canvas */
let _cachedCanvas = null;
let _cachedCtx = null;
function getCachedCanvas() {
    if (!_cachedCanvas) {
        _cachedCanvas = document.createElement('canvas');
        _cachedCanvas.width = SAMPLE_SIZE;
        _cachedCanvas.height = SAMPLE_SIZE;
        _cachedCtx = _cachedCanvas.getContext('2d', { willReadFrequently: true });
    }
    return { canvas: _cachedCanvas, ctx: _cachedCtx };
}

/**
 * 從影片中裁切 ROI → 降採至 128×128 → 轉灰階
 * @returns {Uint8Array} 灰階像素陣列 (長度 SAMPLE_SIZE^2)
 */
function extractROIGray(video, roi) {
    const { canvas, ctx } = getCachedCanvas();
    const sx = (roi.x / 100) * video.videoWidth;
    const sy = (roi.y / 100) * video.videoHeight;
    const sw = (roi.w / 100) * video.videoWidth;
    const sh = (roi.h / 100) * video.videoHeight;

    if (sw <= 1 || sh <= 1) return null;

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;

    const gray = new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE);
    for (let i = 0; i < gray.length; i++) {
        // 快速灰階轉換 (integer approximation)
        gray[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8;
    }
    return gray;
}

/**
 * 計算兩個灰階幀的 MAE (Mean Absolute Error)
 * @returns {number} 0~255 的平均差異
 */
function computeMAE(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let total = 0;
    for (let i = 0; i < a.length; i++) {
        total += Math.abs(a[i] - b[i]);
    }
    return total / a.length;
}

// ══════════════════════════════════════
// V-Line Scanner — 垂直切片引擎
// ══════════════════════════════════════

/** V-Line 切片用的獨立降採 canvas（避免與整體 MAE 的 cache 衝突）*/
let _sliceCanvas = null;
let _sliceCtx = null;
function getSliceCanvas() {
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
function extractSliceGrays(video, roi, cols) {
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
 * 逐軸計算 MAE
 * @param {Uint8Array[]} prevSlices — 前一幀的 N 個切片
 * @param {Uint8Array[]} currSlices — 當前幀的 N 個切片
 * @returns {number[]} 每個切片的 MAE 差異值
 */
function computeSliceMAEs(prevSlices, currSlices) {
    if (!prevSlices || !currSlices || prevSlices.length !== currSlices.length) return null;

    return prevSlices.map((prev, i) => {
        const curr = currSlices[i];
        if (!prev || !curr || prev.length !== curr.length) return 0;
        let total = 0;
        for (let j = 0; j < prev.length; j++) {
            total += Math.abs(prev[j] - curr[j]);
        }
        return total / prev.length;
    });
}

/**
 * 分析切片 MAE 分佈模式，精確判定盤面狀態
 * @param {number[]} sliceMAEs — 每軸的 MAE
 * @returns {{ isAllStopped, isFullyStill, isAnimationOnly, spinningCount, avgMAE, maxMAE, sliceMAEs }}
 */
function analyzeSlicePattern(sliceMAEs) {
    if (!sliceMAEs || sliceMAEs.length === 0) {
        return { isAllStopped: false, isFullyStill: false, isAnimationOnly: false, spinningCount: 0, avgMAE: 0, maxMAE: 0, sliceMAEs: [] };
    }

    const max = Math.max(...sliceMAEs);
    const min = Math.min(...sliceMAEs);
    const avg = sliceMAEs.reduce((a, b) => a + b, 0) / sliceMAEs.length;

    // 判定：有任何一軸的 diff 極高（仍在旋轉）
    // 條件：diff > 均值3倍 且 diff > 8（絕對門檻，排除微弱噪音）
    const spinningCount = sliceMAEs.filter(d => d > avg * 3 && d > 8).length;
    const hasSpinning = spinningCount > 0;

    // 完全靜止：所有軸的 diff 都極低
    const isFullyStill = max < 2;

    return {
        isAllStopped: !hasSpinning,                        // 全軸皆停（含特效）
        isFullyStill,                                       // 完全靜止（無特效）
        isAnimationOnly: !hasSpinning && !isFullyStill,     // 全停但有閃光特效
        spinningCount,
        avgMAE: avg,
        maxMAE: max,
        sliceMAEs,
    };
}

/**
 * 計算滑動窗口的均值和標準差
 */
function windowStats(arr) {
    if (arr.length === 0) return { mean: 0, std: 0 };
    const n = arr.length;
    const mean = arr.reduce((s, v) => s + v, 0) / n;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    return { mean, std: Math.sqrt(variance) };
}

/**
 * 從 canvas 擷取全幀快照
 */
function captureFullFrame(video) {
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(video, 0, 0);
    return c;
}

/**
 * 從 canvas 產生盤面 ROI 縮圖 URL
 */
function generateThumbUrl(canvas, roi) {
    try {
        const tc = document.createElement('canvas');
        const cw = Math.floor(canvas.width * (roi.w / 100));
        const ch = Math.floor(canvas.height * (roi.h / 100));
        const cx = Math.floor(canvas.width * (roi.x / 100));
        const cy = Math.floor(canvas.height * (roi.y / 100));
        tc.width = cw;
        tc.height = ch;
        const tCtx = tc.getContext('2d');
        tCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
        return tc.toDataURL('image/jpeg', 0.6);
    } catch {
        return canvas.toDataURL('image/jpeg', 0.5);
    }
}

/**
 * Best-of-N 取樣策略（精確版）
 *
 * 盤面停止後，在 0~sampleWindow 秒內每 0.1s 取樣一次 WIN OCR：
 * 1. 連續 MIN_CONSECUTIVE 次讀到相同有效數字 → 判定跑分結束，立即回傳
 * 2. 超過 sampleWindow 秒仍未穩定 → 超時截斷，回傳出現最多次的數字
 * 3. OCR 全滅（無法辨識）→ 使用視覺高峰備案或 0.5s 盲截
 */
async function bestOfNCapture(video, winROI, ocrWorker, reelStopTime, sampleWindow, step, decimalPlaces) {
    const SAMPLE_INTERVAL = Math.max(0.05, Math.min(step, 0.12));  // 0.05 ~ 0.12 秒，高頻取樣
    const maxT = Math.min(reelStopTime + sampleWindow, video.duration);
    const samples = []; // { time, ocrValue }

    let lastOcr = '';
    let consecutiveCount = 0;
    let baseWinGray = null;
    let maxWinDiff = 0;
    let maxWinDiffTime = reelStopTime;

    for (let t = reelStopTime; t <= maxT; t += SAMPLE_INTERVAL) {
        video.currentTime = t;
        await waitForSeek(video);
        await yieldToMain(15);

        // 追蹤 WIN ROI 視覺高峰（OCR 全滅時的備案）
        const currentWinGray = extractROIGray(video, winROI);
        if (!baseWinGray && currentWinGray) baseWinGray = currentWinGray;
        if (currentWinGray && baseWinGray) {
            const winDiff = computeMAE(baseWinGray, currentWinGray);
            if (winDiff > maxWinDiff) { maxWinDiff = winDiff; maxWinDiffTime = t; }
        }

        // OCR
        let ocrValue = '';
        if (ocrWorker) {
            const tempCanvas = captureFullFrame(video);
            ocrValue = await cropAndOCR(tempCanvas, winROI, ocrWorker, decimalPlaces);
        }

        samples.push({ time: t, ocrValue });

        // ── 連續穩定值判定 ──
        if (ocrValue !== '' && ocrValue !== '0') {
            if (ocrValue === lastOcr) {
                consecutiveCount++;
                if (consecutiveCount >= MIN_CONSECUTIVE) {
                    // ✅ 跑分動畫結束，數字穩定
                    console.log(`✅ 跑分穩定! OCR="${ocrValue}" 連續 ${consecutiveCount + 1} 次 @ ${t.toFixed(2)}s`);
                    return {
                        captureTime: t,
                        delayReason: 'ocr_stabilized',
                        sampleCount: samples.length,
                        bestOcrValue: ocrValue,
                        isStabilized: true
                    };
                }
            } else {
                consecutiveCount = 1;
                lastOcr = ocrValue;
            }
        } else {
            // 讀到空值或 0，重置連續計數（跑分數字仍在變動）
            consecutiveCount = 0;
            lastOcr = '';
        }
    }

    // ── 取樣結束仍未穩定：統計出現最多次的有效值 ──
    const validSamples = samples.filter(s => s.ocrValue !== '' && s.ocrValue !== '0');
    console.log(`[Diagnostic] bestOfNCapture 超時截斷(${sampleWindow}s): 取樣 ${samples.length} 幀, 有效OCR ${validSamples.length} 幀`);

    if (validSamples.length === 0) {
        // OCR 全滅 → 視覺高峰備案
        if (maxWinDiff > 10) {
            const captureTime = Math.min(maxWinDiffTime + 0.2, video.duration);
            console.log(`👁️ OCR全滅，視覺巔峰備案: 峰值 ${maxWinDiffTime.toFixed(2)}s, 截圖 → ${captureTime.toFixed(2)}s`);
            return { captureTime, delayReason: 'visual_diff_fallback', sampleCount: samples.length, isStabilized: false };
        }
        const fallbackTime = Math.min(reelStopTime + 0.5, video.duration);
        console.log(`[Diagnostic] OCR全滅且無明顯視覺變化，使用 0.5s 盲截`);
        return { captureTime: fallbackTime, delayReason: 'no_valid_sample', sampleCount: samples.length, isStabilized: false };
    }

    // 找出現次數最多的值（超時截斷時最可靠的估計）
    const valueCounts = {};
    for (const s of validSamples) {
        valueCounts[s.ocrValue] = (valueCounts[s.ocrValue] || 0) + 1;
    }
    const mostFrequentOcr = Object.entries(valueCounts).reduce((a, b) => b[1] > a[1] ? b : a)[0];
    const mostFrequentSample = validSamples.filter(s => s.ocrValue === mostFrequentOcr).at(-1);

    console.log(`⏰ 跑分超時截斷，使用最常出現值 "${mostFrequentOcr}" (${valueCounts[mostFrequentOcr]}次)`);
    return {
        captureTime: mostFrequentSample ? mostFrequentSample.time : Math.min(reelStopTime + 0.5, video.duration),
        delayReason: 'timeout_truncated',
        sampleCount: samples.length,
        bestOcrValue: mostFrequentOcr,
        isStabilized: false
    };
}


// 建立全域排隊機制，確保只有一個 Worker 實例時不會因為高頻調用導致內部 WASM 記憶體擠爆或阻塞
let ocrGlobalQueue = Promise.resolve();

/**
 * 裁切 ROI → 放大 → 原彩影像 → PaddleOCR (透過全域 Queue 保護)
 */
async function cropAndOCR(canvas, roi, ocrWorker, decimalPlaces, label = '未知') {
    if (!roi || !ocrWorker || !canvas) return '';

    return new Promise((resolve) => {
        ocrGlobalQueue = ocrGlobalQueue.then(async () => {
            try {
                const cropCanvas = document.createElement('canvas');
                const cw = Math.floor(canvas.width * (roi.w / 100));
                const ch = Math.floor(canvas.height * (roi.h / 100));
                const cx = Math.floor(canvas.width * (roi.x / 100));
                const cy = Math.floor(canvas.height * (roi.y / 100));
                if (cw < 2 || ch < 2) return resolve('');

                let scale = 2;
                if (label === 'WIN' && ch >= 20) {
                    scale = 40 / ch; 
                }

                // [關鍵修復] 加上 Padding: DBNet 如果文字太貼齊邊緣，會辨識不到
                const PADDING = 30;
                cropCanvas.width = Math.floor(cw * scale) + (PADDING * 2);
                cropCanvas.height = Math.floor(ch * scale) + (PADDING * 2);
                const ctx = cropCanvas.getContext('2d');
                
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

                ctx.drawImage(canvas, cx, cy, cw, ch, PADDING, PADDING, cw * scale, ch * scale);

                const preBinarized = cropCanvas.toDataURL('image/jpeg', 0.8);

                // ⚠️ 彩圖直出：我們不再手動運算灰階二值化，把這項工作全權託付給 Paddle 神經網路
                const detectedLines = await ocrWorker.detect(cropCanvas.toDataURL('image/png'));

                // 將多行字串陣列合併
                const rawText = (detectedLines || []).map(t => t.text).join(' ').trim();

                // 後處理：PaddleOCR 偶爾會誤認背景裝飾為字母 (例如 $ 或 WIN)，
                // 這裡設定嚴密屏障，只保留純數字 (0-9)、小數點 (.) 與千分位逗號 (,)
                const validText = rawText.replace(/[^0-9.,]/g, '');
                // 最後移除逗號以便後續 JavaScript 解析，並清掉頭尾不小心沾到的孤立小數點
                const resultStr = validText.replace(/,/g, '').replace(/^\.+|\.+$/g, '') || "0";

                // console.log(`[OCR 字串追蹤 - ${label}] Paddle原文: "${rawText}" | validText: "${validText}" | 最終結果: "${resultStr}"`);

                if (label === 'WIN' || label === 'BALANCE') {
                    // console.log(
                    //     `%c[${label}]%c ${resultStr || '(空)'}`,
                    //     'background: #2563eb; color: white; padding: 2px 6px; border-radius: 4px;',
                    //     'color: #2563eb; font-weight: bold;'
                    // );
                }

                resolve(resultStr);
            } catch (err) {
                console.warn('Quick PaddleOCR error:', err);
                resolve('');
            }
        }); // 結束 queue.then
    }); // 結束 Promise
}

/**
 * 掃描完立刻對所有候選幀跑 OCR（本地 Tesseract，零 API 成本）
 */
async function runQuickOCR(candidates, rois, worker, decimalPlaces, setCandidates, setTemplateMessage) {
    const { winROI, balanceROI, betROI } = rois;

    for (let i = 0; i < candidates.length; i++) {
        const kf = candidates[i];

        const [win, balance, bet] = await Promise.all([
            cropAndOCR(kf.canvas, winROI, worker, decimalPlaces, 'WIN'),
            cropAndOCR(kf.canvas, balanceROI, worker, decimalPlaces, 'BALANCE'),
            cropAndOCR(kf.canvas, betROI, worker, 0, 'BET')  // 押注不套用小數位數
        ]);

        // 逐張更新（讓 UI 即時看到）
        setCandidates(prev => prev.map(c =>
            c.id === kf.id ? { ...c, ocrData: { win, balance, bet } } : c
        ));
    }

    setTemplateMessage?.(`✅ 掃描完成，已讀取 ${candidates.length} 張候選幀的贏分/押注/總分`);
}


// ══════════════════════════════════════════════
// Hook 本體
// ══════════════════════════════════════════════

export function useKeyframeExtractor({ setTemplateMessage }) {
    const [candidates, setCandidates] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);   // 0~1
    const [scanStats, setScanStats] = useState(null);

    // OCR Worker (持久化) - 負責 BAL / BET 及初始 WIN 讀取
    const ocrWorkerRef = useRef(null);
    // WIN 輪詢專屬 Worker - 獨立隊伍，不與 BAL/BET 共用，確保輪詢能夠即時回應
    const winPollWorkerRef = useRef(null);
    useEffect(() => {
        let isMounted = true;
        (async () => {
            try {
                console.log("[OCR] 啟動 PaddleOCR (KeyframeExtractor) 引擎中...");
                const baseUrl = import.meta.env.BASE_URL;
                ort.env.wasm.wasmPaths = baseUrl;
                ort.env.wasm.numThreads = 1;

                const ocr = await Ocr.create({
                    models: {
                        detectionPath: `${baseUrl}ocr-models/ch_PP-OCRv4_det_infer.onnx`,
                        recognitionPath: `${baseUrl}ocr-models/ch_PP-OCRv4_rec_infer.onnx`,
                        dictionaryPath: `${baseUrl}ocr-models/ppocr_keys_v1.txt`
                    }
                });
                
                // 第二個 Worker 給 WIN 輪詢用（目前 PaddleOCR 也可以共用同一個實例，但為了與舊邏輯相容保留 ref）
                if (isMounted) {
                    ocrWorkerRef.current = ocr;
                    winPollWorkerRef.current = ocr; 
                }
            } catch (err) {
                console.error("[OCR] 初始化 PaddleOCR (Keyframe) 失敗:", err);
            }
        })();
        return () => { isMounted = false; };
    }, []);

    // 即時模式用的 refs
    const liveStateRef = useRef(null);
    const liveCancelRef = useRef(false);
    const liveRafRef = useRef(null);

    // ────────────────────────────────────────
    // 全片掃描 (審核模式 / 一鍵模式)
    // ────────────────────────────────────────

    const scanVideo = useCallback(async (video, roi, options = {}) => {
        const fps = options.fps || 10;
        const minGap = options.minGap || 1.5;
        const winROI = options.winROI || null;
        const balanceROI = options.balanceROI || null;
        const betROI = options.betROI || null;
        const winWaitMax = options.winWaitMax || 5.0;  // Best-of-N 取樣窗口（秒）
        const ocrDecimalPlaces = options.ocrDecimalPlaces ?? 2;

        if (!video || !roi || video.duration <= 0) {
            setTemplateMessage?.('⚠️ 請先載入影片並設定盤面 ROI');
            return [];
        }

        setIsScanning(true);
        setScanProgress(0);
        setCandidates([]);
        setTemplateMessage?.('🔍 開始掃描影片...');
        console.log(`[Diagnostic] 🚀 開始 scanVideo! FPS: ${fps}, winROI:`, winROI, `reelROI:`, roi);

        const wasPlaying = !video.paused;
        if (wasPlaying) video.pause();

        const step = 1 / fps;
        const totalFrames = Math.ceil(video.duration / step);
        const WINDOW_SIZE = Math.max(10, fps * 2);  // 2 秒窗口

        const diffWindow = [];
        const recentSlicesList = []; // 全片掃描的歷史切片庫
        const sliceCols = options.sliceCols || 5;

        // ── 三層觸發所需追蹤變數 ──
        let peakDiff = 0;       // 旋轉期 MAE 高峰（動畫備援用）
        let decayCount = 0;     // 大幅衰減後的持續幀數
        let stableCount = 0;    // 完全穩定的連續幀數
        let lastCandidateTime = -999;
        const results = [];

        for (let i = 0; i < totalFrames; i++) {
            const t = i * step;
            if (t >= video.duration) break;

            video.currentTime = t;
            await waitForSeek(video);
            await yieldToMain(20);

            const currentSlices = extractSliceGrays(video, roi, sliceCols);
            if (!currentSlices) { 
                recentSlicesList.length = 0; 
                continue; 
            }

            let diff = 0;
            let analysis = null;
            let mergedSliceMAEs = null;

            if (recentSlicesList.length > 0) {
                // 【多幀抗壓比對】：全片掃描模式
                const allComparisons = recentSlicesList.map(prev => computeSliceMAEs(prev, currentSlices));
                mergedSliceMAEs = [];
                for (let c = 0; c < sliceCols; c++) {
                    mergedSliceMAEs.push(Math.max(...allComparisons.map(comp => comp[c] || 0)));
                }

                analysis = analyzeSlicePattern(mergedSliceMAEs);
                diff = analysis.avgMAE;
            }

            diffWindow.push(diff);
            if (diffWindow.length > WINDOW_SIZE) diffWindow.shift();

            // ── 追蹤旋轉高峰（動畫備援計算用）──
            if (diff > peakDiff) peakDiff = diff;

            // ── 第一層：V-Line 全軸靜止判定 ──
            let isReelStopped = false;
            if (analysis && diffWindow.length >= Math.min(WINDOW_SIZE, 10)) {
                const { mean: μ } = windowStats(diffWindow);
                const isStable = analysis.isAllStopped && diff < Math.max(μ * STABLE_RATIO, 2);

                if (isStable) { stableCount++; } else { stableCount = 0; }

                const motionThresh = μ * 0.6;
                const hadMotion = diffWindow.filter(d => d > motionThresh).length >= diffWindow.length * MIN_MOTION_RATIO;

                isReelStopped = stableCount >= POST_STABLE_FRAMES && hadMotion && (t - lastCandidateTime) > minGap;
            }

            // ── 第二層：動畫備援（全軸停但有特效閃光）──
            let isAnimationFallback = false;
            if (analysis && analysis.isAllStopped && peakDiff > 5 && diff < peakDiff * DECAY_RATIO) {
                decayCount++;
            } else if (diff > peakDiff * 0.5) {
                decayCount = 0;
            }
            if (decayCount >= ANIMATION_TIMEOUT_FRAMES && !isReelStopped) {
                const hadMotion2 = diffWindow.filter(d => d > windowStats(diffWindow).mean * 0.6).length >= diffWindow.length * MIN_MOTION_RATIO;
                isAnimationFallback = hadMotion2 && (t - lastCandidateTime) > minGap;
            }

            // ── 觸發截圖 ──
            if (isReelStopped || isAnimationFallback) {
                const triggerReason = isReelStopped ? 'REEL_STOP' : 'ANIMATION_FALLBACK';
                const { mean: trigμ, std: trigσ } = windowStats(diffWindow);

                // ── 詳細判斷依據 ──
                console.log(`\n${'═'.repeat(60)}`);
                console.log(`📸 #${results.length + 1} [V-Line] 觸發截圖 @ ${t.toFixed(2)}s`);
                console.log(`${'─'.repeat(60)}`);
                console.log(`  觸發原因 : ${triggerReason}`);
                console.log(`  切片數據 : [${mergedSliceMAEs ? mergedSliceMAEs.map(d => d.toFixed(1)).join(', ') : 'N/A'}]`);
                console.log(`  當前 diff : ${diff.toFixed(2)} (μ=${trigμ.toFixed(2)}, σ=${trigσ.toFixed(2)})`);

                console.log(`  ┌─ 第一層 REEL_STOP ────────────────`);
                console.log(`  │  stableCount : ${stableCount} / ${POST_STABLE_FRAMES} (需 ≥${POST_STABLE_FRAMES})`);
                console.log(`  │  穩定門檻    : diff < ${Math.max(trigμ * STABLE_RATIO, 2).toFixed(2)} (μ×${STABLE_RATIO} or 2)`);
                console.log(`  │  結果        : ${isReelStopped ? '✅ 觸發' : '❌ 未達標'}`);
                console.log(`  ├─ 第二層 ANIMATION_FALLBACK ───────`);
                console.log(`  │  peakDiff    : ${peakDiff.toFixed(2)}`);
                console.log(`  │  衰減門檻    : diff < ${(peakDiff * DECAY_RATIO).toFixed(2)} (peak×${DECAY_RATIO})`);
                console.log(`  │  decayCount  : ${decayCount} / ${ANIMATION_TIMEOUT_FRAMES} (需 ≥${ANIMATION_TIMEOUT_FRAMES})`);
                console.log(`  │  結果        : ${isAnimationFallback ? '✅ 觸發' : '❌ 未達標'}`);
                console.log(`  └─ 間隔檢查 ────────────────────────`);
                console.log(`     距上次截圖  : ${(t - lastCandidateTime).toFixed(2)}s (需 >${minGap}s)`);

                // ── Best-of-N 跑分觀察期 ──
                let captureTime = t;
                let isStabilized = false;
                if (winROI) {
                    const worker = ocrWorkerRef.current;
                    console.log(`  ⏳ 進入 Best-of-N 跑分觀察 (窗口=${winWaitMax}s)...`);
                    const result = await bestOfNCapture(video, winROI, worker, t, winWaitMax, step, ocrDecimalPlaces);
                    captureTime = result.captureTime;
                    isStabilized = result.isStabilized ?? false;
                    console.log(`  ┌─ OCR 跑分結果 ────────────────────`);
                    console.log(`  │  最終數值    : "${result.bestOcrValue || '(無)'}"`);
                    console.log(`  │  穩定狀態    : ${isStabilized ? '✅ 連續穩定確認' : '⚠️ 超時截斷'}`);
                    console.log(`  │  判定原因    : ${result.delayReason}`);
                    console.log(`  │  取樣數      : ${result.sampleCount} 幀`);
                    console.log(`  │  延遲        : ${(captureTime - t).toFixed(2)}s (停輪→截圖)`);
                    console.log(`  └──────────────────────────────────`);
                    video.currentTime = captureTime;
                    await waitForSeek(video);
                    await yieldToMain(20);
                } else {
                    console.log(`  ⚠️ 未設定 WIN ROI，跳過 Best-of-N`);
                }

                const frameCanvas = captureFullFrame(video);
                const thumbUrl = generateThumbUrl(frameCanvas, roi);

                results.push({
                    id: `kf_${Date.now()}_${i}`,
                    time: captureTime,
                    reelStopTime: t,
                    captureDelay: captureTime - t,
                    triggerReason,
                    ocrStabilized: isStabilized,  // true=跑分確認, false=超時截斷
                    canvas: frameCanvas,
                    thumbUrl,
                    diff: diff.toFixed(2),
                    avgDiff: diffWindow.length > 0 ? windowStats(diffWindow).mean.toFixed(2) : '0',
                    status: 'pending',
                    recognitionResult: null,
                    error: ''
                });

                console.log(`  📋 候選幀 #${results.length}: time=${captureTime.toFixed(2)}s, trigger=${triggerReason}, ocrOK=${isStabilized}`);
                console.log(`${'═'.repeat(60)}\n`);

                lastCandidateTime = captureTime;
                stableCount = 0;
                decayCount = 0;
                peakDiff = 0;       // 重置高峰，準備偵測下一局
                diffWindow.length = 0;

                // 跳過已掃描的延遲區域
                const skipFrames = Math.ceil((captureTime - t) / step);
                if (skipFrames > 0) {
                    i += skipFrames;
                    recentSlicesList.length = 0;
                    continue;
                }
            }

            recentSlicesList.push(currentSlices);
            if (recentSlicesList.length > 2) {
                recentSlicesList.shift();
            }

            if (i % 5 === 0) {
                setScanProgress(t / video.duration);
            }
        }

        const deduped = deduplicateCandidates(results, roi);

        setCandidates(deduped);
        setIsScanning(false);
        setScanProgress(1);
        setScanStats({
            totalFrames,
            duration: video.duration,
            candidateCount: deduped.length,
            removedDuplicates: results.length - deduped.length
        });
        setTemplateMessage?.(`✅ 掃描完成：找到 ${deduped.length} 個候選停輪幀，正在讀取數值...`);

        if (deduped.length > 0) {
            video.currentTime = deduped[0].time;
        }

        // ── 掃描完立刻跑 OCR（本地 Tesseract，不吃 token）──
        const hasAnyOcrROI = winROI || balanceROI || betROI;
        const worker = ocrWorkerRef.current;
        console.log('[Phase4] Quick OCR check:', { hasWorker: !!worker, hasAnyOcrROI, candidateCount: deduped.length });
        if (worker && hasAnyOcrROI && deduped.length > 0) {
            try {
                const ocrRois = { winROI, balanceROI, betROI };
                await runQuickOCR(deduped, ocrRois, worker, ocrDecimalPlaces, setCandidates, setTemplateMessage);
            } catch (err) {
                console.warn('[Phase4] Quick OCR failed:', err);
                setTemplateMessage?.(`✅ 掃描完成：找到 ${deduped.length} 個候選幀（OCR 讀取失敗）`);
            }
        } else if (deduped.length > 0) {
            setTemplateMessage?.(`✅ 掃描完成：找到 ${deduped.length} 個候選幀${!worker ? '（OCR 引擎載入中，請稍後重試）' : '（未設定贏分/押注/總分 ROI）'}`);
        }

        return deduped;
    }, [setTemplateMessage]);

    // ────────────────────────────────────────
    // 即時模式 (邊播放邊偵測)
    // ────────────────────────────────────────

    const startLiveDetection = useCallback((video, roi, onCapture, ocrOptions = {}) => {
        if (!video || !roi) return;

        liveCancelRef.current = false;
        const sliceCols = ocrOptions.sliceCols || 5;
        liveStateRef.current = {
            diffWindow: [],
            recentSlices: [], // 改為儲存近 2 幀的歷史切片
            lastCandidateTime: -999,
            stableCount: 0,
            decayCount: 0,
            peakDiff: 0,
            isWinPollActive: false,
            cancelWinPoll: false,
            windowSize: 20,
            lastVideoTime: -1,
            sliceCols,
        };

        const processLiveFrame = () => {
            if (liveCancelRef.current) return;
            if (video.paused || video.ended) {
                liveRafRef.current = requestAnimationFrame(processLiveFrame);
                return;
            }

            // 【防偽停輪機制】：影片時間未前進就跳過
            const now = video.currentTime;
            if (now === liveStateRef.current.lastVideoTime) {
                liveRafRef.current = requestAnimationFrame(processLiveFrame);
                return;
            }
            liveStateRef.current.lastVideoTime = now;

            const state = liveStateRef.current;
            const currentSlices = extractSliceGrays(video, roi, state.sliceCols);

            if (currentSlices && state.recentSlices.length > 0) {
                // 【多幀抗壓比對】：與過去 2 幀分別計算差異，並取該軸在任何歷史比對中的「最大誤差」
                // 這樣即使影片解碼卡頓，給了我們一張跟上一秒完全一樣的複製幀 (diff=0)，
                // 只要它跟「上上幀」不同，就不會被當成真停輪！
                const allComparisons = state.recentSlices.map(prev => computeSliceMAEs(prev, currentSlices));
                
                const mergedSliceMAEs = [];
                for (let c = 0; c < state.sliceCols; c++) {
                    // 取同一條軸，與歷史所有幀比對發生過的最大變化
                    const maxColDiff = Math.max(...allComparisons.map(comp => comp[c] || 0));
                    mergedSliceMAEs.push(maxColDiff);
                }

                const analysis = analyzeSlicePattern(mergedSliceMAEs);
                const diff = analysis.avgMAE; // 向下相容：用均值餵入 diffWindow

                state.diffWindow.push(diff);
                if (state.diffWindow.length > state.windowSize) state.diffWindow.shift();

                // 追蹤本局動態高峰
                if (diff > state.peakDiff) state.peakDiff = diff;

                // 【打斷機制】：有軸在高速旋轉 且 maxMAE 爆表 → 新一局開始
                if (state.isWinPollActive && analysis.spinningCount > 0 && analysis.maxMAE > 25) {
                    console.log(`🌀 [V-Line] 偵測到新一局旋轉 (${analysis.spinningCount}軸在轉, max=${analysis.maxMAE.toFixed(1)})，強行終止上一局的 WIN 特工！ (影片時間：${now.toFixed(3)}s)`);
                    state.cancelWinPoll = true;
                    state.isWinPollActive = false;
                }

                if (state.diffWindow.length >= 10) {
                    const { mean: μ } = windowStats(state.diffWindow);

                    // V-Line 判定：全軸皆停 → 計入穩定
                    const isStrictStable = analysis.isAllStopped && diff < Math.max(μ * STABLE_RATIO, 2);
                    const isDecayed = analysis.isAllStopped && diff < (state.peakDiff * 0.3);

                    if (isStrictStable) {
                        state.stableCount++;
                    } else {
                        state.stableCount = 0;
                    }

                    if (isDecayed) {
                        state.decayCount++;
                    } else {
                        state.decayCount = 0;
                    }

                    const motionThresh = μ * 0.6;
                    const motionFrames = state.diffWindow.filter(d => d > motionThresh).length;
                    const hadMotion = motionFrames >= state.diffWindow.length * MIN_MOTION_RATIO || state.peakDiff > 8;
                    const now = video.currentTime;

                    const isReelStopped = state.stableCount >= 3;
                    const isAnimationFallback = state.decayCount >= 15 && state.peakDiff > 8;

                    if ((isReelStopped || isAnimationFallback) && hadMotion && (now - state.lastCandidateTime) > 1.0) {
                        
                        // 【互斥鎖防連發】：已有特工在跟蹤跑分，只跟過不截圖
                        if (state.isWinPollActive) {
                            // 不截圖，但迴圈繼續跑 (絕對不能 return)
                        } else {

                        const triggerReason = isReelStopped ? 'REEL_STOP (極度靜止)' : 'ANIMATION_FALLBACK (全軸停但有動畫)';
                        console.log(`\n========================================`);
                        console.log(`🎯 [V-Line] 觸發『停輪』截圖！`);
                        console.log(`⏰ 影片時間點: ${now.toFixed(3)}s`);
                        console.log(`📊 觸發原因: ${triggerReason}`);
                        console.log(`📊 切片數據: [${mergedSliceMAEs.map(d => d.toFixed(1)).join(', ')}] avg=${diff.toFixed(2)}, peak=${state.peakDiff.toFixed(2)}`);
                        console.log(`========================================\n`);
                        
                        const frameCanvas = captureFullFrame(video);
                        const thumbUrl = generateThumbUrl(frameCanvas, roi);
                        const candidate = {
                            id: `kf_live_${Date.now()}`,
                            time: now,
                            canvas: frameCanvas,
                            thumbUrl,
                            diff: diff.toFixed(2),
                            avgDiff: μ.toFixed(2),
                            status: 'pending',
                            recognitionResult: null,
                            error: ''
                        };

                        setCandidates(prev => [...prev, candidate]);
                        if (onCapture) onCapture(candidate);

                        // 非同步跑 OCR（不阻塞即時偵測迴圈）
                        const worker = ocrWorkerRef.current;
                        const { winROI, balanceROI, betROI, ocrDecimalPlaces } = ocrOptions;
                        if (worker && (winROI || balanceROI || betROI)) {
                            // ── 初始 OCR：讀取截圖時的 BAL / BET / WIN ──
                            Promise.allSettled([
                                cropAndOCR(frameCanvas, winROI, worker, ocrDecimalPlaces ?? 2, 'WIN'),
                                cropAndOCR(frameCanvas, balanceROI, worker, ocrDecimalPlaces ?? 2, 'BALANCE'),
                                cropAndOCR(frameCanvas, betROI, worker, 0, 'BET')
                            ]).then(([winR, balR, betR]) => {
                                const win = winR.status === 'fulfilled' ? winR.value : '';
                                const balance = balR.status === 'fulfilled' ? balR.value : '';
                                const bet = betR.status === 'fulfilled' ? betR.value : '';
                                setCandidates(prev => prev.map(c =>
                                    c.id === candidate.id ? { ...c, ocrData: { win, balance, bet } } : c
                                ));
                            });

                            // ── WIN 輪詢：立刻啟動！不等初始 OCR 完成 ──
                            if (winROI) {
                                state.isWinPollActive = true;
                                state.cancelWinPoll = false;

                                let lastWin = '';
                                let confirmCount = 0;
                                let missCount = 0;
                                let polls = 0;
                                let winFound = false;
                                let isDone = false;
                                let lastBal = '';
                                
                                // 快照保存機制：保存 WIN 被判定達標時的那一個畫格，避免跑去等 BAL 導致錯過贏分數字畫面
                                let capturedWinCanvas = null;
                                let capturedWinTime = 0;

                                // 動態計算輪詢頻率 (如 fps=20 就是 50ms，以最高效能換取最低延遲)
                                const targetFps = ocrOptions.fps || 10;
                                const pollIntervalMs = Math.floor(1000 / targetFps);
                                const MAX_POLLS = targetFps * 3; // 最多嘗試約 3 秒
                                const blinkTolerance = Math.max(4, Math.floor(targetFps * 0.5)); // 容忍閃爍約 0.5 秒

                                console.log(`🕵️‍♂️ [WIN 追蹤特工] 啟動！以 ${targetFps} FPS (${pollIntervalMs}ms) 持續跟蹤長達 3 秒... (影片時間：${video.currentTime.toFixed(3)}s)`);

                                const pollNext = async () => {
                                    polls++;
                                    
                                    // 【新局打斷鎖】：如果外頭的影片已經開始狂轉下一局了，立刻自殺撤退
                                    if (state.cancelWinPoll) {
                                        state.isWinPollActive = false;
                                        return;
                                    }
                                    
                                    // 只要任務完成、取消、暫停，就徹底終止
                                    if (isDone || liveCancelRef.current || video.paused || video.ended) {
                                        state.isWinPollActive = false;
                                        return;
                                    }
                                    if (polls > MAX_POLLS) {
                                        console.log(`🕵️‍♂️ [WIN 追蹤特工] 取消任務：3秒輪詢超時 (未達所有條件)。`);
                                        state.isWinPollActive = false;
                                        return;
                                    }
                                    
                                    const w = winPollWorkerRef.current || ocrWorkerRef.current;
                                    if (!w) return;

                                    // 只截 WIN 一個欄位！不浪費寶貴的排隊時間去重複讀 BAL/BET
                                    const pollCanvas = captureFullFrame(video);
                                    const exactPollTime = video.currentTime; // 精準備份照相那一瞬間的時間
                                    
                                    try {
                                        if (!winFound) {
                                            const pollWin = await cropAndOCR(pollCanvas, winROI, w, ocrDecimalPlaces ?? 2, 'WIN-POLL');
                                            
                                            if (pollWin && parseFloat(pollWin) > 0) {
                                                missCount = 0; // 成功讀到，重置失敗閃爍計數器
                                                console.log(`🕵️‍♂️ [WIN 追蹤特工] 👀 抓到數字: "${pollWin}" (第 ${polls} 次輪詢)`);
                                                
                                                if (pollWin === lastWin) confirmCount++;
                                                else { lastWin = pollWin; confirmCount = 1; }

                                                const targetCount = ocrOptions.requireStableWin ? Math.max(3, Math.floor(targetFps * 0.3)) : 1;
                                                
                                                if (confirmCount >= targetCount) {
                                                    winFound = true;
                                                    capturedWinCanvas = pollCanvas; // 捕捉畫面！
                                                    capturedWinTime = video.currentTime;
                                                    
                                                    confirmCount = 0; // 重置給第二階段使用
                                                    missCount = 0;
                                                    console.log(`⏳ WIN=${pollWin} 達標！已保存當下畫面，繼續觀察 BAL 結算...`);
                                                }
                                            } else {
                                                // 遇到 0 或空值 (可能是數字正在閃爍)，忍耐半秒 
                                                missCount++;
                                                if (missCount >= blinkTolerance) {
                                                    confirmCount = 0;
                                                    lastWin = '';
                                                }
                                            }
                                        } else {
                                            // ── 階段 2：WIN 已穩定，觀察 BAL 是否也穩定下來了 ──
                                            let targetBalCount = ocrOptions.requireStableWin ? 3 : 1;

                                            // 如果使用者根本沒有畫 BAL 框，那直接當作 BAL 已經就緒！
                                            if (!balanceROI) {
                                                targetBalCount = 0;
                                            } else {
                                                const pollBal = await cropAndOCR(pollCanvas, balanceROI, w, ocrDecimalPlaces ?? 2, 'BALANCE-POLL');
                                                
                                                if (pollBal && parseFloat(pollBal) > 0) {
                                                    missCount = 0;
                                                    if (pollBal === lastBal) {
                                                        confirmCount++;
                                                    } else {
                                                        lastBal = pollBal;
                                                        confirmCount = 1;
                                                    }
                                                } else {
                                                    missCount++;
                                                    if (missCount >= 4) { confirmCount = 0; lastBal = ''; }
                                                }
                                            }

                                            if (confirmCount >= targetBalCount) {
                                                const pollBet = await cropAndOCR(pollCanvas, betROI, w, 0, 'BET');
                                                
                                                // 我們強制使用剛剛在 Phase 1 達標時截取的完美的「贏分照片」
                                                const finalCanvas = capturedWinCanvas || pollCanvas; 
                                                const finalTime = capturedWinTime || exactPollTime;

                                                const winThumbUrl = generateThumbUrl(finalCanvas, roi);
                                                const winCandidate = {
                                                    id: `kf_live_win_${Date.now()}`,
                                                    time: finalTime,
                                                    canvas: finalCanvas,
                                                    thumbUrl: winThumbUrl,
                                                    diff: '0',
                                                    avgDiff: '0',
                                                    triggerReason: 'WIN_POLL',
                                                    ocrData: { win: lastWin, balance: lastBal, bet: pollBet },
                                                    status: 'pending',
                                                    recognitionResult: null,
                                                    error: ''
                                                };
                                                setCandidates(prev => [...prev, winCandidate]);
                                                
                                                console.log(`\n========================================`);
                                                console.log(`📸 [贏分結算] 觸發『第二張』候選截圖！`);
                                                console.log(`⏰ 截圖畫面時間: ${finalTime.toFixed(3)}s`);
                                                console.log(`💰 確認數值: WIN=${lastWin}, BAL=${lastBal || '(未設定ROI)'}`);
                                                console.log(`========================================\n`);

                                                isDone = true; // 正式宣告特工任務完成，下次 tick 就不會再跑
                                                state.isWinPollActive = false; // 解除鎖定
                                                return; // 結束輪詢
                                            }
                                        }
                                    } catch (e) {
                                        console.error("WIN Poll error:", e);
                                    }
                                    
                                    // 序列化等待前一次 OCR 結束後，再排程下一次
                                    setTimeout(pollNext, pollIntervalMs);
                                };

                                pollNext();
                            }
                        }
                        // ...啟動 OCR 與輪詢等後續操作，因為太長維持不變
                        state.lastCandidateTime = now;
                        state.stableCount = 0;
                        state.decayCount = 0;
                        state.peakDiff = 0;
                        state.diffWindow.length = 0;
                        } // ← 對應「互斥鎖」的 else 結尾
                    }
                }
            }

            if (currentSlices) {
                state.recentSlices.push(currentSlices);
                if (state.recentSlices.length > 2) {
                    state.recentSlices.shift(); // 永遠只保留近 2 幀歷史（N-1, N-2）
                }
            }
            liveRafRef.current = requestAnimationFrame(processLiveFrame);
        };

        liveRafRef.current = requestAnimationFrame(processLiveFrame);
    }, []);

    const stopLiveDetection = useCallback(() => {
        liveCancelRef.current = true;
        if (liveRafRef.current) {
            cancelAnimationFrame(liveRafRef.current);
            liveRafRef.current = null;
        }
    }, []);

    // ────────────────────────────────────────
    // 候選幀管理
    // ────────────────────────────────────────

    const removeCandidate = useCallback((id) => {
        setCandidates(prev => prev.filter(c => c.id !== id));
    }, []);

    const clearCandidates = useCallback(() => {
        setCandidates([]);
        setScanStats(null);
    }, []);

    // 手動新增候選幀（從影片當前畫面擷取）
    const addManualCandidate = useCallback((video, roi, ocrOptions = {}) => {
        if (!video) return;
        const canvas = captureFullFrame(video);
        const thumbUrl = generateThumbUrl(canvas, roi);

        const candidate = {
            id: `kf_manual_${Date.now()}`,
            time: video.currentTime,
            canvas,
            thumbUrl,
            diff: '-',
            avgDiff: '-',
            status: 'pending',
            recognitionResult: null,
            error: ''
        };

        setCandidates(prev => {
            const inserted = [...prev, candidate].sort((a, b) => a.time - b.time);
            return inserted;
        });

        if (setTemplateMessage) {
            setTimeout(() => setTemplateMessage(`📸 手動新增候選幀 @ ${video.currentTime.toFixed(1)}s`), 0);
        }

        // 背景排隊執行 OCR 以取得 win, balance, bet，確保後續能夠順利被 smartDedup 分析
        const worker = ocrWorkerRef.current;
        const { winROI, balanceROI, betROI, ocrDecimalPlaces } = ocrOptions;
        if (worker && (winROI || balanceROI || betROI)) {
            Promise.all([
                cropAndOCR(canvas, winROI, worker, ocrDecimalPlaces ?? 2, 'WIN'),
                cropAndOCR(canvas, balanceROI, worker, ocrDecimalPlaces ?? 2, 'BALANCE'),
                cropAndOCR(canvas, betROI, worker, 0, 'BET')
            ]).then(([win, balance, bet]) => {
                setCandidates(prev => prev.map(c =>
                    c.id === candidate.id ? { ...c, ocrData: { win, balance, bet } } : c
                ));
            }).catch(() => {});
        }

        return candidate;
    }, [setTemplateMessage, ocrWorkerRef]);

    // 更新候選幀狀態（辨識完成時呼叫）
    const updateCandidate = useCallback((id, updates) => {
        setCandidates(prev => prev.map(c =>
            c.id === id ? { ...c, ...updates } : c
        ));
    }, []);

    /**
     * 智慧標記：辨識同局幀 → 凸顯最佳、淡化其餘（不刪除）
     *
     * 同局判定（BET 相同時）：
     *   State 1: WIN=0, BAL=B0-BET
     *   State 2: WIN>0, BAL=B0-BET（贏分顯現，餘額尚未更新）
     *   State 3: WIN>0, BAL=B0-BET+WIN（餘額已更新）
     *
     * 選取優先級：State 2 的第一張 > State 2 任一張 > WIN 最大的任一張
     */
    const smartDedup = useCallback(() => {
        setCandidates(prev => {
            if (prev.length <= 1) return prev.map(c => ({ ...c, spinGroupId: 0, isSpinBest: true }));

            const eps = 0.5; // OCR 容差
            const parse = (v) => parseFloat(v) || 0;

            // 解析每幀的數值
            const frames = prev.map((kf, i) => ({
                idx: i,
                kf,
                win: parse(kf.ocrData?.win),
                bal: parse(kf.ocrData?.balance),
                bet: parse(kf.ocrData?.bet),
            }));

            // 判斷兩幀是否為同一局
            function areSameSpin(a, b) {
                // BET 必須一致
                if (Math.abs(a.bet - b.bet) > eps && a.bet > 0 && b.bet > 0) return false;

                // Case 1: 完全相同
                if (Math.abs(a.win - b.win) < eps && Math.abs(a.bal - b.bal) < eps) return true;

                // Case 2: 一方 WIN=0, 另一方 WIN>0, BAL 相同（State 1→2）
                if (a.win < eps && b.win > eps && Math.abs(a.bal - b.bal) < eps) return true;
                if (b.win < eps && a.win > eps && Math.abs(a.bal - b.bal) < eps) return true;

                // Case 3: 同 WIN, BAL 差了一個 WIN（State 2→3）
                if (a.win > eps && b.win > eps && Math.abs(a.win - b.win) < eps) {
                    if (Math.abs(a.bal + a.win - b.bal) < eps) return true;
                    if (Math.abs(b.bal + b.win - a.bal) < eps) return true;
                }

                // Case 4: WIN=0 → State 3（BAL + WIN = newBAL）
                if (a.win < eps && b.win > eps && Math.abs(a.bal + b.win - b.bal) < eps) return true;
                if (b.win < eps && a.win > eps && Math.abs(b.bal + a.win - a.bal) < eps) return true;

                return false;
            }

            // Union-Find 分組
            const parent = frames.map((_, i) => i);
            function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
            function union(a, b) { parent[find(a)] = find(b); }

            for (let i = 0; i < frames.length; i++) {
                for (let j = i + 1; j < frames.length; j++) {
                    if (areSameSpin(frames[i], frames[j])) union(i, j);
                }
            }

            // 收集分組
            const groups = {};
            frames.forEach((f, i) => {
                const root = find(i);
                if (!groups[root]) groups[root] = [];
                groups[root].push(f);
            });

            // 每組標記最佳幀
            const bestIds = new Set();
            let spinGroupCounter = 0;
            const spinGroupMap = {}; // kf.id → spinGroupId

            for (const group of Object.values(groups)) {
                const gid = spinGroupCounter++;
                group.forEach(f => { spinGroupMap[f.kf.id] = gid; });

                if (group.length === 1) {
                    bestIds.add(group[0].kf.id);
                    continue;
                }

                // 找 State 2 幀：WIN>0 且 BAL 是組內最小的（未更新）
                const withWin = group.filter(f => f.win > eps);
                let best = null;

                if (withWin.length > 0) {
                    // 找 BAL 最小的（State 2 = 餘額尚未加上 WIN）
                    const minBal = Math.min(...withWin.map(f => f.bal));
                    const state2 = withWin.filter(f => Math.abs(f.bal - minBal) < eps);

                    if (state2.length > 0) {
                        // State 2 的第一張（最早截到的）
                        best = state2.reduce((a, b) => a.kf.time < b.kf.time ? a : b);
                    } else {
                        // 沒有明確 State 2, 取 WIN 最大的
                        best = withWin.reduce((a, b) => a.win > b.win ? a : b);
                    }
                } else {
                    // 全部 WIN=0, 取第一張
                    best = group.reduce((a, b) => a.kf.time < b.kf.time ? a : b);
                }

                bestIds.add(best.kf.id);
            }

            // 【UI 體驗優化】：三明治異常修復 (Sandwich Healing)
            // 如果某張照片 B 被照片 A 與 C 包夾，而 A 與 C 皆屬於同一個局 (相同 BAL/WIN)，
            // 且時間跨度 < 15 秒，則 B 高機率是因為 OCR 讀錯而脫隊的孤兒。
            // 我們予以強制歸化，使其不會破壞 Phase 4 的群組呈現，並打上標記。
            const timeSortedFrames = [...frames].sort((a,b) => a.kf.time - b.kf.time);
            const sandwichErrors = new Set();
            
            for (let i = 1; i < timeSortedFrames.length - 1; i++) {
                const curId = timeSortedFrames[i].kf.id;
                const curGid = spinGroupMap[curId];
                
                const leftGid = spinGroupMap[timeSortedFrames[i-1].kf.id];
                const leftTime = timeSortedFrames[i-1].kf.time;

                if (curGid !== leftGid) {
                    let rightFound = false;
                    let rightTime = 0;
                    for (let r = i + 1; r < timeSortedFrames.length; r++) {
                        if (spinGroupMap[timeSortedFrames[r].kf.id] === leftGid) {
                            rightFound = true;
                            rightTime = timeSortedFrames[r].kf.time;
                            break;
                        }
                    }
                    
                    // 如果被同一個群組左右包夾，且時間間隔小於 15 秒（合理的一局長度）
                    if (rightFound && (rightTime - leftTime < 15)) {
                        spinGroupMap[curId] = leftGid;
                        sandwichErrors.add(curId);
                    }
                }
            }

            const totalGroups = new Set(Object.values(spinGroupMap)).size;
            setTemplateMessage?.(`🧹 分析完成：已修復 ${sandwichErrors.size} 處孤立區塊，共歸納為 ${totalGroups} 局`);

            return prev.map(kf => ({
                ...kf,
                spinGroupId: spinGroupMap[kf.id] ?? 0,
                isSpinBest: bestIds.has(kf.id),
                isSandwichError: sandwichErrors.has(kf.id),
            }));
        });
    }, [setTemplateMessage]);

    // 智慧修復：針對指定的 groupId 集合重新 OCR，並自動跑 smartDedup
    const healBreaks = useCallback(async (brokenGroupIds, ocrOptions) => {
        const { winROI, balanceROI, betROI, ocrDecimalPlaces } = ocrOptions;
        const worker = ocrWorkerRef.current;
        if (!worker || brokenGroupIds.length === 0) return;

        // 整理需要處理的局號 (含發生斷層的當局 & 上一局)
        const targetGroupIds = new Set();
        brokenGroupIds.forEach(id => {
            targetGroupIds.add(id);
            if (id > 0) targetGroupIds.add(id - 1);
        });

        setIsScanning(true);
        setTemplateMessage?.(`⚡ 正在深度修復 ${targetGroupIds.size} 局斷層資料...`);

        // 讓 React 取得最新 state，執行非同步修復，然後寫回
        setCandidates(prev => {
            const targetCandidates = prev.filter(c => targetGroupIds.has(c.spinGroupId));
            if (targetCandidates.length === 0) {
                setIsScanning(false);
                return prev;
            }

            // 因為 setCandidates 裡不能直接用 await (reducer必須同步)，
            // 所以我們在這裡「觸發」一個非同步流程，並在此次 setState 返回原樣。
            // 非同步流程跑完後會再次呼叫 setCandidates。
            const runHeal = async () => {
                let completed = 0;
                const total = targetCandidates.length;

                const updatedTargets = [];
                for (const c of targetCandidates) {
                    const win = winROI ? await cropAndOCR(c.canvas, winROI, worker, ocrDecimalPlaces) : (c.ocrData?.win || '0');
                    const balance = balanceROI ? await cropAndOCR(c.canvas, balanceROI, worker, ocrDecimalPlaces) : (c.ocrData?.balance || '0');
                    const bet = betROI ? await cropAndOCR(c.canvas, betROI, worker, 0) : (c.ocrData?.bet || '0');
                    
                    completed++;
                    setTemplateMessage?.(`⚡ 修復進度: ${completed} / ${total}`);
                    
                    // 利用微弱的影像處理差異？目前只要用新 ROI 重跑一次通常就能解，若之後不夠可在此處加 variations
                    updatedTargets.push({
                        ...c,
                        ocrData: { win, balance, bet },
                        status: 'pending' // 重置狀態
                    });
                }

                // 更新完候補圖後，把整包丟進第二次 setState
                setCandidates(prev2 => {
                    const next = prev2.map(c => {
                        const updated = updatedTargets.find(uc => uc.id === c.id);
                        return updated ? updated : c;
                    });
                    return next;
                });

                // 然後立刻觸發重新分局 (smartDedup會讀取這最新的數值並重選代表幀!)
                setTimeout(() => {
                    smartDedup();
                    setIsScanning(false);
                    setTemplateMessage?.(`✅ 斷層修復完成：已重新推演連貫性！`);
                }, 100);
            };

            runHeal(); // 啟動非同步任務
            return prev; // 本次不改動，等非同步任務完成
        });
    }, [smartDedup, setTemplateMessage]);

    // 智慧刪除：移除未被標記為 isSpinBest 的幀
    const confirmDedup = useCallback(() => {
        setCandidates(prev => {
            const hasMark = prev.some(c => c.isSpinBest !== undefined);
            if (!hasMark) return prev;
            const kept = prev.filter(c => c.isSpinBest !== false);
            const removed = prev.length - kept.length;
            setTemplateMessage?.(`🗑️ 已清理 ${removed} 張非最佳重複幀`);
            return kept;
        });
    }, [setTemplateMessage]);

    return {
        candidates, setCandidates,
        isScanning, scanProgress, scanStats,
        scanVideo,
        startLiveDetection, stopLiveDetection,
        removeCandidate, clearCandidates,
        addManualCandidate, updateCandidate,
        smartDedup, confirmDedup, healBreaks
    };
}


// ══════════════════════════════════════════════
// 去重演算法
// ══════════════════════════════════════════════

/**
 * 去重：相鄰候選幀太相似的只保留第一張
 * 使用盤面 ROI 區域的灰階 MAE 比對
 */
function deduplicateCandidates(candidates, roi) {
    if (candidates.length <= 1) return candidates;

    const result = [candidates[0]];
    let prevGray = extractGrayFromCanvas(candidates[0].canvas, roi);

    for (let i = 1; i < candidates.length; i++) {
        const curGray = extractGrayFromCanvas(candidates[i].canvas, roi);
        const mae = computeMAE(prevGray, curGray);

        if (mae > DEDUP_THRESHOLD) {
            result.push(candidates[i]);
            prevGray = curGray;
        }
        // else: 太相似，跳過
    }

    return result;
}

/**
 * 從已擷取的 canvas 提取 ROI 灰階（非從 video）
 */
function extractGrayFromCanvas(canvas, roi) {
    const { canvas: sampleCanvas, ctx } = getCachedCanvas();
    const cx = Math.floor(canvas.width * (roi.x / 100));
    const cy = Math.floor(canvas.height * (roi.y / 100));
    const cw = Math.floor(canvas.width * (roi.w / 100));
    const ch = Math.floor(canvas.height * (roi.h / 100));

    ctx.drawImage(canvas, cx, cy, cw, ch, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;

    const gray = new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE);
    for (let i = 0; i < gray.length; i++) {
        gray[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8;
    }
    return gray;
}
