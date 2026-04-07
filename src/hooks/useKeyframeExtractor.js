import { useState, useRef, useCallback, useEffect } from 'react';
import { createWorker } from 'tesseract.js';

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
const SAMPLE_SIZE = 128;        // ROI 降採尺寸 (128x128)
const DEDUP_THRESHOLD = 8;      // 去重 MAE 閾值（低於此值視為相同幀）
const MIN_MOTION_RATIO = 0.25;  // 窗口中至少 25% 的幀有動態，才算「之前有動過」
const STABLE_RATIO = 0.3;       // diff < μ×STABLE_RATIO 視為穩定
const POST_STABLE_FRAMES = 2;   // 穩定後再等 N 幀才截圖（避免假停輪）

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
 * Best-of-N 取樣策略
 *
 * 盤面停止後，在 0~sampleWindow 秒內取樣 N 張快照：
 * 1. 裁切 WIN ROI → 快速 OCR 讀數字
 * 2. 過濾特效幀（亮度異常 / OCR 亂碼）
 * 3. 挑出贏分最大且連續出現 ≥2 次的幀 → 回傳最佳截圖時間
 * 4. 若沒有有效取樣 → fallback 用固定延遲
 */
async function bestOfNCapture(video, winROI, ocrWorker, reelStopTime, sampleWindow, step, decimalPlaces) {
    const SAMPLE_INTERVAL = Math.max(0.05, Math.min(step, 0.15));  // 0.05 ~ 0.15 秒，高頻動態取樣
    const maxT = Math.min(reelStopTime + sampleWindow, video.duration);
    const samples = []; // { time, ocrValue, winDiff }
    let baseWinGray = null;

    for (let t = reelStopTime; t <= maxT; t += SAMPLE_INTERVAL) {
        video.currentTime = t;
        await waitForSeek(video);
        await yieldToMain(15);

        // 視覺峰值追蹤
        const currentWinGray = extractROIGray(video, winROI);
        if (!baseWinGray && currentWinGray) baseWinGray = currentWinGray;
        const winDiff = currentWinGray && baseWinGray ? computeMAE(baseWinGray, currentWinGray) : 0;

        // 快速 OCR（如果有 worker）
        let ocrValue = '';
        if (ocrWorker) {
            const tempCanvas = captureFullFrame(video);
            ocrValue = await cropAndOCR(tempCanvas, winROI, ocrWorker, decimalPlaces);
        }

        samples.push({ time: t, ocrValue, winDiff });
    }

    // 挑最佳：找最大 + 穩定的 OCR 值
    const validSamples = samples.filter(s => s.ocrValue !== '' && s.ocrValue !== '0' && s.ocrValue !== 'Err');
    const maxDiffSample = samples.reduce((max, cur) => cur.winDiff > max.winDiff ? cur : max, samples[0] || { winDiff: 0 });
    
    console.log(`[Diagnostic] bestOfNCapture(0~${sampleWindow}s): 取樣 ${samples.length} 幀, 有效OCR ${validSamples.length} 幀. 最大視覺變化: ${maxDiffSample.winDiff.toFixed(1)} @ ${maxDiffSample.time?.toFixed(2)}s`);

    if (validSamples.length === 0) {
        // 沒有有效 OCR 取樣 → 視覺巔峰備案 (Peak Visual Diff Fallback)
        if (samples.length > 0 && maxDiffSample.winDiff > 10) { // 確保真的有明確的畫面變化
            const captureTime = Math.min(maxDiffSample.time + 0.2, video.duration); // 巔峰後延遲 0.2s 讓畫面穩定
            console.log(`👁️ OCR全滅！啟動視覺巔峰備案：峰值在 ${maxDiffSample.time.toFixed(2)}s (diff: ${maxDiffSample.winDiff.toFixed(1)}), 截圖延遲至 ${captureTime.toFixed(2)}s`);
            return { captureTime, delayReason: 'visual_diff_fallback', sampleCount: samples.length };
        }
        
        // 老招 fallback
        const fallbackTime = Math.min(reelStopTime + 0.5, video.duration);
        console.log(`[Diagnostic] OCR失敗且無明顯視覺變化 (maxDiff=${maxDiffSample.winDiff.toFixed(1)})，使用 0.5s 盲截。`);
        return { captureTime: fallbackTime, delayReason: 'no_valid_sample', sampleCount: samples.length };
    }

    // 找穩定的最大值：相同 ocrValue 出現 ≥2 次
    const valueCounts = {};
    for (const s of validSamples) {
        if (!valueCounts[s.ocrValue]) valueCounts[s.ocrValue] = [];
        valueCounts[s.ocrValue].push(s);
    }

    // 優先選出現 ≥2 次的最大值
    let bestSample = null;
    let bestValue = -1;

    for (const [val, arr] of Object.entries(valueCounts)) {
        const numVal = parseFloat(val) || 0;
        if (arr.length >= 2 && numVal > bestValue) {
            bestValue = numVal;
            bestSample = arr[arr.length - 1]; // 取最後一張（動畫更完整）
        }
    }

    // 沒有重複的 → 取數值最大的那張
    if (!bestSample) {
        bestSample = validSamples.reduce((best, cur) => {
            const curVal = parseFloat(cur.ocrValue) || 0;
            const bestVal = parseFloat(best.ocrValue) || 0;
            return curVal > bestVal ? cur : best;
        }, validSamples[0]);
    }

    return {
        captureTime: bestSample.time,
        delayReason: 'best_of_n',
        sampleCount: samples.length,
        effectCount: 0,
        bestOcrValue: bestSample.ocrValue
    };
}


/**
 * 裁切 ROI → 放大 → 二值化 → OCR
 */
async function cropAndOCR(canvas, roi, ocrWorker, decimalPlaces) {
    if (!roi || !ocrWorker || !canvas) return '';
    try {
        const cropCanvas = document.createElement('canvas');
        const cw = Math.floor(canvas.width * (roi.w / 100));
        const ch = Math.floor(canvas.height * (roi.h / 100));
        const cx = Math.floor(canvas.width * (roi.x / 100));
        const cy = Math.floor(canvas.height * (roi.y / 100));
        if (cw < 2 || ch < 2) return '';

        const scale = 3;
        cropCanvas.width = cw * scale;
        cropCanvas.height = ch * scale;
        const ctx = cropCanvas.getContext('2d');
        ctx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw * scale, ch * scale);

        // 二值化
        const imgData = ctx.getImageData(0, 0, cw * scale, ch * scale);
        const data = imgData.data;
        let totalGray = 0;
        for (let i = 0; i < data.length; i += 4) {
            totalGray += (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11);
        }
        const avgGray = totalGray / (cw * scale * ch * scale);
        const threshold = Math.max(100, Math.min(180, avgGray + 30));
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
            const v = gray > threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = v;
        }
        ctx.putImageData(imgData, 0, 0);

        const { data: { text } } = await ocrWorker.recognize(cropCanvas);

        // 後處理
        const numberBlocks = text.match(/[0-9.,]+/g);
        let validText = numberBlocks && numberBlocks.length > 0 ? numberBlocks[numberBlocks.length - 1] : '';

        if (decimalPlaces > 0) {
            let digits = validText.replace(/[^0-9]/g, '');
            if (digits && digits.length > 0) {
                if (digits.length <= decimalPlaces) digits = digits.padStart(decimalPlaces + 1, '0');
                const intPart = digits.slice(0, -decimalPlaces);
                const decPart = digits.slice(-decimalPlaces);
                return `${intPart}.${decPart}`;
            } else {
                return '0';
            }
        } else {
            return validText.replace(/,/g, '').replace(/^\.+|\.+$/g, '') || '0';
        }
    } catch (err) {
        console.warn('Quick OCR error:', err);
        return '';
    }
}

/**
 * 掃描完立刻對所有候選幀跑 OCR（本地 Tesseract，零 API 成本）
 */
async function runQuickOCR(candidates, rois, worker, decimalPlaces, setCandidates, setTemplateMessage) {
    const { winROI, balanceROI, betROI } = rois;

    for (let i = 0; i < candidates.length; i++) {
        const kf = candidates[i];

        const [win, balance, bet] = await Promise.all([
            cropAndOCR(kf.canvas, winROI, worker, decimalPlaces),
            cropAndOCR(kf.canvas, balanceROI, worker, decimalPlaces),
            cropAndOCR(kf.canvas, betROI, worker, 0)  // 押注不套用小數位數
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

    // OCR Worker (持久化)
    const ocrWorkerRef = useRef(null);
    useEffect(() => {
        let worker = null;
        (async () => {
            worker = await createWorker('eng');
            await worker.setParameters({ tessedit_pageseg_mode: '7' });
            ocrWorkerRef.current = worker;
        })();
        return () => { if (worker) worker.terminate(); };
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
        let prevGray = null;

        // --- NEW: WIN ROI Motion Tracking ---
        const winDiffWindow = [];
        let prevWinGray = null;
        // ------------------------------------

        let lastCandidateTime = -999;
        let stableCount = 0;
        const results = [];

        for (let i = 0; i < totalFrames; i++) {
            const t = i * step;
            if (t >= video.duration) break;

            video.currentTime = t;
            await waitForSeek(video);
            await yieldToMain(20);

            const currentGray = extractROIGray(video, roi);
            if (!currentGray) { prevGray = null; prevWinGray = null; continue; }

            const diff = prevGray ? computeMAE(prevGray, currentGray) : 0;
            diffWindow.push(diff);
            if (diffWindow.length > WINDOW_SIZE) diffWindow.shift();

            // --- WIN ROI 突波偵測 ---
            const currentWinGray = winROI ? extractROIGray(video, winROI) : null;
            let winSpikeDetected = false;
            
            if (currentWinGray && prevWinGray) {
                const winDiff = computeMAE(prevWinGray, currentWinGray);
                winDiffWindow.push(winDiff);
                if (winDiffWindow.length > WINDOW_SIZE) winDiffWindow.shift();
                
                if (winDiffWindow.length >= Math.min(WINDOW_SIZE, 3)) {
                    const { mean: wμ } = windowStats(winDiffWindow.slice(0, -1)); // 排除當前幀
                    
                    // -- 加入深度診斷日誌：紀錄每一次超過基本均值的變化 --
                    if (winDiff > 5) {
                        // console.log(`[Diagnostic] ${t.toFixed(2)}s | diff=${winDiff.toFixed(1)}, prevMean=${wμ.toFixed(1)} (${wμ>0 ? (winDiff/wμ).toFixed(1) : 'INF'}x)`);
                    }

                    // 降低門檻：突波倍率 2.5x 或絕對差異 > 10
                    if (winDiff > Math.max(wμ * 2.5, 10)) {
                        winSpikeDetected = true;
                        console.log(`⚡ WIN突波偵測 @ ${t.toFixed(2)}s | winDiff=${winDiff.toFixed(1)} vs wμ=${wμ.toFixed(1)} (${wμ > 0 ? (winDiff/wμ).toFixed(1) : 'INF'}x)`);
                    }
                }
            }
            // ------------------------

            // ── 盤面穩定性分析 (需要足夠的 diff 歷史) ──
            let isReelStopped = false;
            if (diffWindow.length >= Math.min(WINDOW_SIZE, 10)) {
                const { mean: μ } = windowStats(diffWindow);
                const isStable = diff < Math.max(μ * STABLE_RATIO, 2);

                if (isStable) {
                    stableCount++;
                } else {
                    stableCount = 0;
                }

                const motionThresh = μ * 0.6;
                const motionFrames = diffWindow.filter(d => d > motionThresh).length;
                const hadMotion = motionFrames >= diffWindow.length * MIN_MOTION_RATIO;

                isReelStopped = stableCount >= POST_STABLE_FRAMES && hadMotion && (t - lastCandidateTime) > minGap;
            }

            // ── WIN突波判定（獨立於盤面 diffWindow，不被 reset 擋住）──
            const isWinSpike = winSpikeDetected && (t - lastCandidateTime) > Math.min(0.5, minGap);

            // ── 觸發截圖 ──
            if (isReelStopped || isWinSpike) {
                const triggerReason = isWinSpike ? 'WIN_SPIKE' : 'REEL_STOP';
                console.log(`📸 觸發截圖 @ ${t.toFixed(2)}s | 原因: ${triggerReason}`);

                // ── Best-of-N 取樣：多點取樣挑最佳贏分幀 ──
                let captureTime = t;
                if (winROI) {
                    const worker = ocrWorkerRef.current;
                    const result = await bestOfNCapture(video, winROI, worker, t, winWaitMax, step, ocrDecimalPlaces);
                    captureTime = result.captureTime;
                    console.log(`  → Best-of-N: captureTime=${captureTime.toFixed(2)}s, samples=${result.sampleCount}, bestOcr=${result.bestOcrValue}`);
                    video.currentTime = captureTime;
                    await waitForSeek(video);
                    await yieldToMain(20);
                }

                const frameCanvas = captureFullFrame(video);
                const thumbUrl = generateThumbUrl(frameCanvas, roi);

                results.push({
                    id: `kf_${Date.now()}_${i}`,
                    time: captureTime,
                    reelStopTime: t,
                    captureDelay: captureTime - t,
                    triggerReason,
                    canvas: frameCanvas,
                    thumbUrl,
                    diff: diff.toFixed(2),
                    avgDiff: diffWindow.length > 0 ? windowStats(diffWindow).mean.toFixed(2) : '0',
                    status: 'pending',
                    recognitionResult: null,
                    error: ''
                });

                lastCandidateTime = captureTime;
                stableCount = 0;
                diffWindow.length = 0;
                // 重要：重設 WIN 歷史，避免 bestOfNCapture 跳時間後產生虛假突波
                winDiffWindow.length = 0;

                // 跳過已掃描的延遲區域
                const skipFrames = Math.ceil((captureTime - t) / step);
                if (skipFrames > 0) {
                    i += skipFrames;
                    prevGray = null;
                    prevWinGray = null;  // 重要：同步重設 win 參考幀
                    continue;
                }
            }

            prevGray = currentGray;
            prevWinGray = currentWinGray;

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
        liveStateRef.current = {
            diffWindow: [],
            prevGray: null,
            lastCandidateTime: -999,
            stableCount: 0,
            windowSize: 20
        };

        const processLiveFrame = () => {
            if (liveCancelRef.current) return;
            if (video.paused || video.ended) {
                liveRafRef.current = requestAnimationFrame(processLiveFrame);
                return;
            }

            const state = liveStateRef.current;
            const currentGray = extractROIGray(video, roi);

            if (currentGray && state.prevGray) {
                const diff = computeMAE(state.prevGray, currentGray);
                state.diffWindow.push(diff);
                if (state.diffWindow.length > state.windowSize) state.diffWindow.shift();

                if (state.diffWindow.length >= 10) {
                    const { mean: μ } = windowStats(state.diffWindow);
                    const isStable = diff < Math.max(μ * STABLE_RATIO, 2);

                    if (isStable) {
                        state.stableCount++;
                    } else {
                        state.stableCount = 0;
                    }

                    const motionThresh = μ * 0.6;
                    const motionFrames = state.diffWindow.filter(d => d > motionThresh).length;
                    const hadMotion = motionFrames >= state.diffWindow.length * MIN_MOTION_RATIO;
                    const now = video.currentTime;

                    if (state.stableCount >= 3 && hadMotion && (now - state.lastCandidateTime) > 1.0) {
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
                            Promise.all([
                                cropAndOCR(frameCanvas, winROI, worker, ocrDecimalPlaces ?? 2),
                                cropAndOCR(frameCanvas, balanceROI, worker, ocrDecimalPlaces ?? 2),
                                cropAndOCR(frameCanvas, betROI, worker, 0)
                            ]).then(([win, balance, bet]) => {
                                setCandidates(prev => prev.map(c =>
                                    c.id === candidate.id ? { ...c, ocrData: { win, balance, bet } } : c
                                ));
                            }).catch(() => {});
                        }

                        state.lastCandidateTime = now;
                        state.stableCount = 0;
                        state.diffWindow.length = 0;
                    }
                }
            }

            if (currentGray) state.prevGray = currentGray;
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
                cropAndOCR(canvas, winROI, worker, ocrDecimalPlaces ?? 2),
                cropAndOCR(canvas, balanceROI, worker, ocrDecimalPlaces ?? 2),
                cropAndOCR(canvas, betROI, worker, 0)
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

            const totalGroups = Object.keys(groups).length;
            const multiGroups = Object.values(groups).filter(g => g.length > 1).length;
            setTemplateMessage?.(`🧹 分析完成：${prev.length} 幀 → ${totalGroups} 局（${multiGroups} 局有重複幀），已標記最佳`);

            return prev.map(kf => ({
                ...kf,
                spinGroupId: spinGroupMap[kf.id] ?? 0,
                isSpinBest: bestIds.has(kf.id),
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
