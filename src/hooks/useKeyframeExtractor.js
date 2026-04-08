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

            const currentGray = extractROIGray(video, roi);
            if (!currentGray) { prevGray = null; continue; }

            const diff = prevGray ? computeMAE(prevGray, currentGray) : 0;
            diffWindow.push(diff);
            if (diffWindow.length > WINDOW_SIZE) diffWindow.shift();

            // ── 追蹤旋轉高峰（動畫備援計算用）──
            if (diff > peakDiff) peakDiff = diff;

            // ── 第一層：盤面完全靜止判定 ──
            let isReelStopped = false;
            if (diffWindow.length >= Math.min(WINDOW_SIZE, 10)) {
                const { mean: μ } = windowStats(diffWindow);
                const isStable = diff < Math.max(μ * STABLE_RATIO, 2);

                if (isStable) { stableCount++; } else { stableCount = 0; }

                const motionThresh = μ * 0.6;
                const hadMotion = diffWindow.filter(d => d > motionThresh).length >= diffWindow.length * MIN_MOTION_RATIO;

                isReelStopped = stableCount >= POST_STABLE_FRAMES && hadMotion && (t - lastCandidateTime) > minGap;
            }

            // ── 第二層：動畫備援（永遠在背景追蹤，不受第一層結果影響）──
            // 用途：盤面 MAE 已大幅下降但未完全靜止時，仍然觸發截圖
            // 場景：WILD 擴展動畫、符號變身特效、WIN 值顯示與停輪時機不同步
            let isAnimationFallback = false;
            if (peakDiff > 5 && diff < peakDiff * DECAY_RATIO) {
                decayCount++;
            } else if (diff > peakDiff * 0.5) {
                decayCount = 0; // MAE 回彈，表示真的還在轉
            }
            if (decayCount >= ANIMATION_TIMEOUT_FRAMES && !isReelStopped) {
                const hadMotion2 = diffWindow.filter(d => d > windowStats(diffWindow).mean * 0.6).length >= diffWindow.length * MIN_MOTION_RATIO;
                isAnimationFallback = hadMotion2 && (t - lastCandidateTime) > minGap;
            }

            // ── 觸發截圖（WIN_SPIKE 不再獨立觸發）──
            if (isReelStopped || isAnimationFallback) {
                const triggerReason = isReelStopped ? 'REEL_STOP' : 'ANIMATION_FALLBACK';
                const { mean: trigμ, std: trigσ } = windowStats(diffWindow);

                // ── 詳細判斷依據 ──
                console.log(`\n${'═'.repeat(60)}`);
                console.log(`📸 #${results.length + 1} 觸發截圖 @ ${t.toFixed(2)}s`);
                console.log(`${'─'.repeat(60)}`);
                console.log(`  觸發原因 : ${triggerReason}`);
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
                    prevGray = null;
                    continue;
                }
            }

            prevGray = currentGray;

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
            windowSize: 20,
            // ── 三階段狀態機 ──
            phase: 'SCANNING',       // SCANNING → WAITING_WIN → COOLDOWN → SCANNING
            peakDiff: 0,             // 動畫備援用
            decayCount: 0,
            // ── WAITING_WIN 階段用 ──
            pendingReelCanvas: null, // 停輪瞬間的乾淨盤面
            pendingReelTime: 0,
            pendingThumbUrl: null,
            pendingDiff: '-',
            pendingAvgDiff: '-',
            winBaseGray: null,       // 停輪瞬間 WIN ROI 灰階（基線）
            waitStartTime: 0,
        };

        const WIN_WAIT_MAX = 3.0;     // 最長等 WIN 秒數
        const WIN_CHANGE_THRESH = 10; // WIN ROI MAE 變化超過此值視為 WIN 出現
        const SPIN_RESUME_THRESH = 15; // 盤面 MAE 超過此值視為下一轉開始

        const processLiveFrame = () => {
            if (liveCancelRef.current) return;
            if (video.paused || video.ended) {
                liveRafRef.current = requestAnimationFrame(processLiveFrame);
                return;
            }

            const state = liveStateRef.current;
            const currentGray = extractROIGray(video, roi);
            const now = video.currentTime;

            // ════════════════════════════════════════
            // Phase 1: SCANNING — 偵測盤面停輪
            // ════════════════════════════════════════
            if (state.phase === 'SCANNING') {
                if (currentGray && state.prevGray) {
                    const diff = computeMAE(state.prevGray, currentGray);
                    state.diffWindow.push(diff);
                    if (state.diffWindow.length > state.windowSize) state.diffWindow.shift();
                    if (diff > state.peakDiff) state.peakDiff = diff;

                    if (state.diffWindow.length >= 10) {
                        const { mean: μ } = windowStats(state.diffWindow);
                        const isStable = diff < Math.max(μ * STABLE_RATIO, 2);

                        if (isStable) { state.stableCount++; } else { state.stableCount = 0; }

                        const motionThresh = μ * 0.6;
                        const hadMotion = state.diffWindow.filter(d => d > motionThresh).length >= state.diffWindow.length * MIN_MOTION_RATIO;

                        // 第一層：完全靜止
                        const isReelStopped = state.stableCount >= 3 && hadMotion && (now - state.lastCandidateTime) > 1.0;

                        // 第二層：動畫備援
                        let isAnimFallback = false;
                        if (state.peakDiff > 5 && diff < state.peakDiff * DECAY_RATIO) {
                            state.decayCount++;
                        } else if (diff > state.peakDiff * 0.5) {
                            state.decayCount = 0;
                        }
                        if (!isReelStopped && state.decayCount >= ANIMATION_TIMEOUT_FRAMES && hadMotion && (now - state.lastCandidateTime) > 1.0) {
                            isAnimFallback = true;
                        }

                        if (isReelStopped || isAnimFallback) {
                            // ── 停輪確認！先拍乾淨盤面 ──
                            state.pendingReelCanvas = captureFullFrame(video);
                            state.pendingReelTime = now;
                            state.pendingThumbUrl = generateThumbUrl(state.pendingReelCanvas, roi);
                            state.pendingDiff = diff.toFixed(2);
                            state.pendingAvgDiff = μ.toFixed(2);

                            const { winROI } = ocrOptions;
                            state.winBaseGray = winROI ? extractROIGray(video, winROI) : null;
                            state.waitStartTime = now;
                            state.phase = 'WAITING_WIN';

                            const reason = isReelStopped ? 'REEL_STOP' : 'ANIM_FALLBACK';
                            console.log(`🎰 [${now.toFixed(2)}s] 停輪(${reason}) → 等待 WIN 出現... (最長 ${WIN_WAIT_MAX}s)`);
                        }
                    }
                }
            }

            // ════════════════════════════════════════
            // Phase 2: WAITING_WIN — 等 WIN 顯示或下一轉開始
            // ════════════════════════════════════════
            else if (state.phase === 'WAITING_WIN') {
                const { winROI } = ocrOptions;
                const elapsed = now - state.waitStartTime;

                // 偵測 WIN ROI 有無變化（數字出現）
                let winAppeared = false;
                if (winROI && state.winBaseGray) {
                    const currentWinGray = extractROIGray(video, winROI);
                    if (currentWinGray) {
                        const winDiff = computeMAE(state.winBaseGray, currentWinGray);
                        if (winDiff > WIN_CHANGE_THRESH) winAppeared = true;
                    }
                }

                // 偵測盤面是否重新開始轉動（下一局開始）
                let nextSpinStarted = false;
                if (currentGray && state.prevGray) {
                    const reelDiff = computeMAE(state.prevGray, currentGray);
                    if (reelDiff > SPIN_RESUME_THRESH) nextSpinStarted = true;
                }

                // 是否超時
                const timedOut = elapsed > WIN_WAIT_MAX;

                if (winAppeared || nextSpinStarted || timedOut) {
                    const captureReason = winAppeared ? 'WIN_APPEARED'
                                       : nextSpinStarted ? 'NEXT_SPIN'
                                       : 'WIN_TIMEOUT';

                    // ── 用「現在」的畫面跑 OCR（此時 WIN 應已顯示）──
                    const ocrCanvas = captureFullFrame(video);

                    const candidate = {
                        id: `kf_live_${Date.now()}`,
                        time: state.pendingReelTime,
                        reelStopTime: state.pendingReelTime,
                        canvas: state.pendingReelCanvas,  // 盤面用停輪瞬間的（最乾淨）
                        thumbUrl: state.pendingThumbUrl,
                        diff: state.pendingDiff,
                        avgDiff: state.pendingAvgDiff,
                        triggerReason: captureReason,
                        winWaitDuration: elapsed.toFixed(1),
                        status: 'pending',
                        recognitionResult: null,
                        error: ''
                    };

                    setCandidates(prev => [...prev, candidate]);
                    if (onCapture) onCapture(candidate);

                    // ── OCR：從「後面」的畫面讀取（WIN 已顯示）──
                    // 用 Promise.allSettled 避免單一 ROI 失敗導致全部遺失
                    const worker = ocrWorkerRef.current;
                    const { balanceROI, betROI, ocrDecimalPlaces } = ocrOptions;
                    if (worker && (winROI || balanceROI || betROI)) {
                        Promise.allSettled([
                            cropAndOCR(ocrCanvas, winROI, worker, ocrDecimalPlaces ?? 2),
                            cropAndOCR(ocrCanvas, balanceROI, worker, ocrDecimalPlaces ?? 2),
                            cropAndOCR(ocrCanvas, betROI, worker, 0)
                        ]).then(([winR, balR, betR]) => {
                            const win = winR.status === 'fulfilled' ? winR.value : '';
                            const balance = balR.status === 'fulfilled' ? balR.value : '';
                            const bet = betR.status === 'fulfilled' ? betR.value : '';
                            setCandidates(prev => prev.map(c =>
                                c.id === candidate.id ? { ...c, ocrData: { win, balance, bet } } : c
                            ));
                            console.log(`  💰 OCR: WIN="${win}" BAL="${balance}" BET="${bet}"`);
                        });
                    }

                    console.log(`📸 [${state.pendingReelTime.toFixed(2)}s] 擷取 | ${captureReason} | 等了 ${elapsed.toFixed(1)}s`);

                    state.lastCandidateTime = now;
                    state.phase = 'COOLDOWN';
                    state.pendingReelCanvas = null;
                    state.stableCount = 0;
                    state.peakDiff = 0;
                    state.decayCount = 0;
                    state.diffWindow.length = 0;
                }
            }

            // ════════════════════════════════════════
            // Phase 3: COOLDOWN — 等動態恢復再回去偵測
            // ════════════════════════════════════════
            else if (state.phase === 'COOLDOWN') {
                if (currentGray && state.prevGray) {
                    const diff = computeMAE(state.prevGray, currentGray);
                    // 偵測到新的動態 + 距上次截圖至少 0.5 秒
                    if (diff > 5 && (now - state.lastCandidateTime) > 0.5) {
                        state.phase = 'SCANNING';
                        console.log(`🔄 [${now.toFixed(2)}s] 新轉動偵測 → 回到 SCANNING`);
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
