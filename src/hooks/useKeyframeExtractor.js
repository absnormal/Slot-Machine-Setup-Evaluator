import { useState, useRef, useCallback, useEffect } from 'react';
import { OcrWorkerBridge } from '../engine/ocrWorkerBridge';

// -- Modularized imports --
import { extractROIGray, computeMAE, measureSegmentBrightness } from '../utils/videoUtils';
import { extractSliceGrays, computeSliceMAEs, analyzeSlicePattern, windowStats, computeBoardVariance } from '../engine/vlineScanner';
import { captureFullFrame, generateThumbUrl, cropAndOCR } from '../engine/ocrPipeline';

async function detectMultiplier(canvas, roi, worker, ocrOptions) {
    if (ocrOptions.multiplierDetectMode === 'brightness') {
        const values = ocrOptions.multiplierBrightnessValues || ['x1', 'x2', 'x3', 'x5'];
        const brightness = measureSegmentBrightness(canvas, roi, values.length);
        const maxIdx = brightness.indexOf(Math.max(...brightness));
        const result = values[maxIdx];
        console.log(`[OCR RAW - MULTIPLIER] 亮度偵測: [${brightness.map(b=>b.toFixed(0)).join(', ')}] → ${result}`);
        return result;
    }
    return cropAndOCR(canvas, roi, worker, 0, 'MULTIPLIER');
}

/**
 * useKeyframeExtractor -- Adaptive Keyframe Extractor (Modularized)
 *
 * Module Architecture:
 *   videoUtils.js    -- Gray extraction, MAE calc, Canvas cache
 *   vlineScanner.js  -- V-Line vertical slice engine
 *   ocrPipeline.js   -- Screenshot, thumbnail, PaddleOCR pipeline
 *   This file        -- React Hook (Live Detection + WIN Agent + Smart Dedup)
 */

// -- Hook-specific constants --
const MIN_MOTION_RATIO = 0.25;
const STABLE_RATIO = 0.3;
const POST_STABLE_FRAMES = 2;
const ANIMATION_TIMEOUT_FRAMES = 3;
const DECAY_RATIO = 0.3;

export function useKeyframeExtractor({ setTemplateMessage }) {
    const [candidates, setCandidates] = useState([]);

    // OCR Worker (Web Worker 版，不阻塞主線程)
    const ocrWorkerRef = useRef(null);
    const winPollWorkerRef = useRef(null);
    useEffect(() => {
        let isMounted = true;
        const bridge = new OcrWorkerBridge();
        const pollBridge = new OcrWorkerBridge(); // 第二個 Worker，專給 WIN 輪詢用
        Promise.all([
            bridge.init(),
            pollBridge.init()
        ]).then(() => {
            if (isMounted) {
                ocrWorkerRef.current = bridge;
                winPollWorkerRef.current = pollBridge;
                console.log('[OCR] 雙 Worker 已就緒（Worker A: 初始 OCR，Worker B: WIN 輪詢）');
            } else {
                bridge.destroy();
                pollBridge.destroy();
            }
        }).catch(err => {
            console.error('[OCR] Web Worker 初始化失敗:', err);
        });
        return () => {
            isMounted = false;
            bridge.destroy();
            pollBridge.destroy();
        };
    }, []);

    // 即時模式用的 refs
    const liveStateRef = useRef(null);
    const liveCancelRef = useRef(false);
    const liveRafRef = useRef(null);



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
            hadSpinSinceLastStop: false, // 自上次停輪後是否偵測到新旋轉
            isWinPollActive: false,
            cancelWinPoll: false,
            windowSize: 20,
            lastVideoTime: -1,
            sliceCols,
            lastCascadeConfirmedWin: 0, // 🔗 上一個連鎖盤面確認的累計 WIN（作為輪詢器的門檻）
            lastCaptureWinGray: null,     // 🔗 上一次截圖的 WIN 區域灰階（供 cascade 差異比較）
            cascadeBoardDiffOk: false,    // 🔗 WIN 區域差異是否 ≥ 8（一次性計算結果）
            cascadeBoardDiffChecked: false, // 🔗 是否已計算過 WIN 區域差異（防重算）
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
                    // 取同一條軸，與歷史所有幀比對發生過的最大變化 (以 full 來評估最劇烈那幀)
                    let bestComp = { full: -1, blocks: [0, 0, 0, 0] };
                    for (const compArr of allComparisons) {
                        const comp = compArr[c];
                        if (comp && comp.full > bestComp.full) {
                            bestComp = comp;
                        }
                    }
                    mergedSliceMAEs.push(bestComp);
                }

                const analysis = analyzeSlicePattern(mergedSliceMAEs, now, ocrOptions.enableEmptyBoardFilter);
                const diff = analysis.avgMAE; // 向下相容：用均值餵入 diffWindow

                state.diffWindow.push(diff);
                if (state.diffWindow.length > state.windowSize) state.diffWindow.shift();

                // 追蹤本局動態高峰
                if (diff > state.peakDiff) state.peakDiff = diff;

                // 【打斷機制 v2】：用「連續多幀」確認是真正的新一局旋轉
                // 贏分閃動動畫會讓全軸 MAE 在單一幀內飆高（像是轉輪），但下一幀就會消退
                // 真正的轉輪則會持續維持高 MAE 不墜。所以我們要求「連續 3 幀」才確認打斷！
                if (analysis.spinningCount > 0 && analysis.maxMAE > 25) {
                    state.spinBreakCount = (state.spinBreakCount || 0) + 1;
                    if (state.spinBreakCount >= 3) {
                        state.hadSpinSinceLastStop = true; // 確認有新一局旋轉
                        if (state.isWinPollActive) {
                            console.log(`🌀 [V-Line] 確認新一局旋轉 (連續 ${state.spinBreakCount} 幀, ${analysis.spinningCount}軸在轉, max=${analysis.maxMAE.toFixed(1)})，強行終止上一局的 WIN 特工！ (影片時間：${now.toFixed(3)}s)`);
                            state.cancelWinPoll = true;
                            state.isWinPollActive = false;
                        }
                        state.spinBreakCount = 0;
                    }
                } else {
                    state.spinBreakCount = 0;
                }

                if (state.diffWindow.length >= 10) {
                    const { mean: μ } = windowStats(state.diffWindow);

                    // V-Line 判定：全軸皆停 → 計入穩定
                    // (不再使用 diff < Math.max(μ) 門檻，因為飛行動畫會推高均值，我們全權信任底層 4切塊過濾的 isAllStopped 結果！)
                    const isStrictStable = analysis.isAllStopped;
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

                    if ((isReelStopped || isAnimationFallback) && hadMotion && (now - state.lastCandidateTime) > 0.75) {

                        // 【V-Line 旋轉門檻】：如果自上次停輪以來沒有偵測到任何旋轉，
                        // 代表這只是同一局的動畫衰退，不是新的停輪。跳過！
                        // 🔗 [Cascade 盤面差異旁路] 消除遊戲中，即使沒有偵測到旋轉，盤面也可能因為
                        //    消除動畫而變化（WIN 出現、符號重排）。用像素差異比較來繞過旋轉門檻。
                        let cascadeBypass = false;
                        if (state.lastCandidateTime > 0 && !state.hadSpinSinceLastStop) {
                            if (ocrOptions.enableEmptyBoardFilter && state.lastCaptureWinGray && ocrOptions.winROI) {
                                // 🔗 [Cascade] 只在首次穩定 (stableCount===3) 時計算一次，結果快取
                                if (!state.cascadeBoardDiffChecked && state.stableCount === 3) {
                                    const currentWinGray = extractROIGray(video, ocrOptions.winROI);
                                    if (currentWinGray) {
                                        const winDiff = computeMAE(state.lastCaptureWinGray, currentWinGray);
                                        state.cascadeBoardDiffOk = winDiff >= 8;
                                        state.cascadeBoardDiffChecked = true;
                                        console.log(`🔗 [Cascade WIN差異] MAE=${winDiff.toFixed(1)} ${state.cascadeBoardDiffOk ? '≥ 8 → 放行 ✅' : '< 8 → WIN未變 🚫'} @ ${now.toFixed(3)}s`);
                                    }
                                }
                                if (state.cascadeBoardDiffOk) {
                                    cascadeBypass = true; // 盤面確實變了，繞過旋轉門檻
                                } else if (isReelStopped && state.stableCount === 3 && state.cascadeBoardDiffChecked) {
                                    console.log(`🚫 [Cascade] WIN未變化 (MAE<8)，跳過 @ ${now.toFixed(3)}s`);
                                } else if (isReelStopped && state.stableCount === 3) {
                                    console.log(`🚫 [V-Line] 偵測到穩定但自上次停輪後沒有新旋轉，判定為動畫衰退，跳過 @ ${now.toFixed(3)}s`);
                                }
                            } else {
                                // 非 Cascade 模式 or 第一張截圖（沒有 lastCaptureWinGray）→ 原邏輯
                                if (isReelStopped && state.stableCount === 3) {
                                    console.log(`🚫 [V-Line] 偵測到穩定但自上次停輪後沒有新旋轉，判定為動畫衰退，跳過 @ ${now.toFixed(3)}s`);
                                }
                            }
                        }
                        if (state.lastCandidateTime <= 0 || state.hadSpinSinceLastStop || cascadeBypass) {

                            let boardStd = -1;
                            if (currentSlices) {
                                const { std } = computeBoardVariance(currentSlices);
                                boardStd = std;
                                if (ocrOptions.enableEmptyBoardFilter) {
                                    const blankStdThresh = 35; // 寬鬆的門檻以容納背景紋理
                                    if (std < blankStdThresh) {
                                        console.log(`🚫 [空盤過濾] σ=${std.toFixed(1)} < ${blankStdThresh}，跳過截圖 @ ${now.toFixed(3)}s`);
                                        state.stableCount = 0;
                                        state.decayCount = 0;
                                        state.boardRecoverCount = 0; // 重置恢復計數
                                        // 不重置 peakDiff 和 hadSpinSinceLastStop，讓後續真正的盤面能觸發
                                        liveRafRef.current = requestAnimationFrame(processLiveFrame);
                                        return;
                                    }

                                }
                            }

                            // 如果上一局的 WIN 特工還在上班，因為已經偵測到了「新一局的明確停輪」
                            // 這裡必須直接強制殺死舊特工，不再讓特工蒙蔽主偵測器！
                            if (state.isWinPollActive) {
                                console.log("⚠️ 偵測到強制新停輪，立刻撤銷上一局的 WIN 特工！");
                                state.cancelWinPoll = true;
                            }

                            const triggerReason = isReelStopped ? 'REEL_STOP (極度靜止)' : 'ANIMATION_FALLBACK (全軸停但有動畫)';
                            console.log(`\n========================================`);
                            console.log(`🎯 [V-Line] 觸發『停輪』截圖！`);
                            console.log(`⏰ 影片時間點: ${now.toFixed(3)}s`);
                            console.log(`📊 觸發原因: ${triggerReason} ${boardStd >= 0 ? '(盤面σ=' + boardStd.toFixed(1) + ')' : ''}`);
                            console.log(`📊 切片全域誤差: [${mergedSliceMAEs.map(d => d.full.toFixed(1)).join(', ')}] avg=${diff.toFixed(2)}, peak=${state.peakDiff.toFixed(2)}`);
                            console.log(`========================================\n`);

                            const frameCanvas = captureFullFrame(video);
                            // 🔗 存入 WIN 區域灰階，供下次 cascade 差異比較
                            if (ocrOptions.winROI) {
                                state.lastCaptureWinGray = extractROIGray(video, ocrOptions.winROI);
                            }
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
                                error: '',
                                useWinFrame: true
                            };

                            setCandidates(prev => [...prev, candidate]);
                            if (onCapture) onCapture(candidate);

                            // 非同步跑 OCR（不阻塞即時偵測迴圈）
                            const worker = ocrWorkerRef.current;
                            const { winROI, balanceROI, betROI, orderIdROI, multiplierROI, ocrDecimalPlaces, balDecimalPlaces } = ocrOptions;
                            if (worker && (winROI || balanceROI || betROI || orderIdROI || multiplierROI)) {
                                // ── 初始 OCR：讀取截圖時的 WIN / BAL / BET / ID / MULT ──
                                Promise.allSettled([
                                    cropAndOCR(frameCanvas, winROI, worker, ocrDecimalPlaces ?? 2, 'WIN'),
                                    cropAndOCR(frameCanvas, balanceROI, worker, balDecimalPlaces ?? ocrDecimalPlaces ?? 2, 'BALANCE'),
                                    cropAndOCR(frameCanvas, betROI, worker, 0, 'BET'),
                                    orderIdROI ? cropAndOCR(frameCanvas, orderIdROI, worker, 0, 'ORDER_ID') : Promise.resolve(''),
                                    multiplierROI ? detectMultiplier(frameCanvas, multiplierROI, worker, ocrOptions) : Promise.resolve('')
                                ]).then(([winR, balR, betR, orderIdR, multR]) => {
                                    const win = winR.status === 'fulfilled' ? winR.value : '';
                                    const balance = balR.status === 'fulfilled' ? balR.value : '';
                                    const bet = betR.status === 'fulfilled' ? betR.value : '';
                                    const orderId = orderIdR.status === 'fulfilled' ? orderIdR.value : '';
                                    const multiplier = multR.status === 'fulfilled' ? multR.value : '';
                                    setCandidates(prev => prev.map(c =>
                                        c.id === candidate.id ? { ...c, ocrData: { win, balance, bet, orderId, multiplier } } : c
                                    ));

                                    // 【快速短路機制】：Reel Stop 原圖已有清晰 WIN → 給特工基準線情報
                                    if (win && parseFloat(win) > 0) {
                                        state.reelStopHasWin = true;
                                        state.reelStopWinValue = win;
                                    }
                                });

                                // ── WIN 輪詢：如果啟用，立刻啟動！不等初始 OCR 完成 ──
                                if (ocrOptions.enableWinTracker && winROI) {
                                    if (state.isWinPollActive) {
                                        const oldId = state.winPollAgentId.toString().slice(-4);
                                        console.log(`🕵️‍♂️ [WIN 追蹤特工 #${oldId} (前任)] 被新一局截斷！已強制退場 🪦`);
                                    }
                                    const currentAgentId = Date.now();
                                    const shortId = currentAgentId.toString().slice(-4);
                                    state.winPollAgentId = currentAgentId;
                                    state.isWinPollActive = true;
                                    state.cancelWinPoll = false;
                                    state.reelStopHasWin = false;
                                    state.reelStopWinValue = '';

                                    let lastWin = '';
                                    let confirmCount = 0;
                                    let missCount = 0;
                                    let zeroCount = 0;
                                    let hasSeenRollingWin = false;
                                    let polls = 0;
                                    let winFound = false;
                                    let isDone = false;
                                    let lastBal = '';
                                    let hasOutput = false;

                                    // 【最強記憶機制】：保存最後一次穩定讀到的 WIN 數字與對應截圖（供截圖展示用）
                                    let bestWinCanvas = null;
                                    let bestWinTime = 0;
                                    let bestWinValue = '';

                                    const pollIntervalMs = 50; // 20fps
                                    const MAX_POLLS = 600; // 最多嘗試約 30 秒 (20fps * 30s)
                                    const isRolling = !!ocrOptions.hasRollingWin;
                                    const blinkTolerance = isRolling ? 40 : 10; // 滾動：2秒容忍 vs 穩定：0.5秒
                                    const reelStopId = candidate.id; // 原始 Reel Stop 卡片 ID
                                    let cascadeThreshold = 0;

                                    // 【合併輸出】：把 WIN/BAL/BET 數據寫回原始 Reel Stop 卡片（不建立新卡片）
                                    const mergeWinData = async (triggerLabel) => {
                                        if (hasOutput) return;
                                        hasOutput = true;

                                        const w = winPollWorkerRef.current || ocrWorkerRef.current;
                                        // 全部從 bestWinCanvas（第一次讀到 WIN 的幀）讀取，確保局號一致
                                        const finalBal = balanceROI ? await cropAndOCR(bestWinCanvas, balanceROI, w, ocrOptions.balDecimalPlaces ?? ocrDecimalPlaces ?? 2, 'BAL-FINAL') : '';
                                        const finalBet = betROI ? await cropAndOCR(bestWinCanvas, betROI, w, 0, 'BET-FINAL') : '';
                                        const finalOrderId = orderIdROI ? await cropAndOCR(bestWinCanvas, orderIdROI, w, 0, 'ORDER_ID') : '';
                                        const finalMult = multiplierROI ? await detectMultiplier(bestWinCanvas, multiplierROI, w, ocrOptions) : '';

                                        // 核心：寫回原卡片的 OCR 數據，canvas/thumbUrl 保持乾淨盤面不動！
                                        // 同時保存 WIN 特工截圖（winPollCanvas），讓匯出時兩張圖都有
                                        const winPollThumbUrl = generateThumbUrl(bestWinCanvas, roi);
                                        setCandidates(prev => prev.map(c =>
                                            c.id === reelStopId
                                                ? {
                                                    ...c,
                                                    ocrData: { win: bestWinValue, balance: finalBal, bet: finalBet, orderId: finalOrderId, multiplier: finalMult },
                                                    captureDelay: bestWinTime - c.time,
                                                    reelStopTime: c.time,
                                                    winPollCanvas: bestWinCanvas,
                                                    winPollThumbUrl,
                                                    winPollTime: bestWinTime
                                                }
                                                : c
                                        ));

                                        console.log(`\n========================================`);
                                        console.log(`📝 [贏分合併] WIN=${bestWinValue} 已寫回 Reel Stop 卡片 (${triggerLabel})`);
                                        console.log(`⏰ Reel Stop 時間 → WIN 確認時間: +${(bestWinTime - candidate.time).toFixed(3)}s`);
                                        console.log(`💰 合併數值: WIN=${bestWinValue}, BAL=${finalBal || '(未設定ROI)'}`);
                                        console.log(`========================================\n`);

                                        state.isWinPollActive = false; // 解除鎖定

                                    };

                                    console.log(`🕵️‍♂️ [WIN 追蹤特工 #${shortId}] 啟動！以 20 FPS 持續跟蹤長達 10 秒，數據將合併回 Reel Stop 卡片 (影片時間：${video.currentTime.toFixed(3)}s)`);

                                    const frameQueue = [];
                                    const MAX_QUEUE_SIZE = 30;

                                    // ── 生產者：截取畫面供 OCR 輪詢（cascade 降至 5fps 避免佇列堆積）──
                                    const captureTimer = setInterval(() => {
                                        if (state.winPollAgentId !== currentAgentId || state.cancelWinPoll || isDone || liveCancelRef.current || video.paused || video.ended) {
                                            clearInterval(captureTimer);
                                            return;
                                        }
                                        if (frameQueue.length >= MAX_QUEUE_SIZE) {
                                            frameQueue.shift(); // 踢掉最舊的，確保最新幀永遠進得來
                                        }
                                        frameQueue.push({
                                            canvas: captureFullFrame(video),
                                            time: video.currentTime
                                        });
                                        polls++;
                                    }, pollIntervalMs);

                                    // ── 消費者：依序從佇列取畫面跑 OCR ──
                                    const consumeNext = async () => {
                                        const isObsoleteAgent = state.winPollAgentId !== currentAgentId;

                                        if (isObsoleteAgent || state.cancelWinPoll || isDone || liveCancelRef.current || video.paused || video.ended || polls > MAX_POLLS) {
                                            clearInterval(captureTimer);
                                            if (state.cancelWinPoll || isObsoleteAgent) {
                                                if (bestWinCanvas && !hasOutput) {
                                                    console.log(`🕵️‍♂️ [WIN 追蹤特工 #${shortId}${isObsoleteAgent ? ' (前任)' : ''}] 任務強行中斷，手上有圖 WIN=${bestWinValue}！直接合併...`);
                                                    await mergeWinData('WIN_POLL_FORCED');
                                                } else if (!hasOutput && frameQueue.length > 0) {
                                                    // 「回掃最後 3 幀」：沒有任何截圖時，取佇列最新的 3 幀跑 OCR
                                                    const w = winPollWorkerRef.current || ocrWorkerRef.current;
                                                    const scanFrames = frameQueue.slice(-3).reverse(); // 最新的 3 幀，從新到舊
                                                    console.log(`🕵️‍♂️ [WIN 追蹤特工 #${shortId}${isObsoleteAgent ? ' (前任)' : ''}] 任務中斷，回掃最新 ${scanFrames.length} 幀兄底...`);
                                                    for (const { canvas: sc, time: st } of scanFrames) {
                                                        try {
                                                            const sv = await cropAndOCR(sc, winROI, w, ocrDecimalPlaces ?? 2, 'WIN-SCAN');
                                                            const parsedSv = parseFloat(sv) || 0;
                                                            const currentBest = parseFloat(bestWinValue) || 0;
                                                            console.log(`🔄 [Scan #${shortId}] OCR="${sv || '(空)'}" | 目前高水位=${bestWinValue || '(無)'}`);
                                                            if (parsedSv > 0 && parsedSv >= currentBest) {
                                                                bestWinCanvas = sc;
                                                                bestWinTime = st;
                                                                bestWinValue = sv;
                                                            }
                                                        } catch (e) { /* skip */ }
                                                    }
                                                    if (bestWinCanvas) {
                                                        console.log(`🕵️‍♂️ [WIN 追蹤特工 #${shortId}${isObsoleteAgent ? ' (前任)' : ''}] 回掃得到 WIN=${bestWinValue}！合併...`);
                                                        await mergeWinData('WIN_POLL_FORCED');
                                                    } else {
                                                        console.log(`🕵️‍♂️ [WIN 追蹤特工 #${shortId}${isObsoleteAgent ? ' (前任)' : ''}] 任務中斷，回掃也無效，放棄合併。`);
                                                        if (!isObsoleteAgent) state.isWinPollActive = false;
                                                    }
                                                } else if (!hasOutput) {
                                                    console.log(`🕵️‍♂️ [WIN 追蹤特工 #${shortId}${isObsoleteAgent ? ' (前任)' : ''}] 任務中斷，佇列空，放棄合併。 (影片時間：${video.currentTime.toFixed(3)}s)`);
                                                    if (!isObsoleteAgent) state.isWinPollActive = false;
                                                }
                                            }
                                            return;
                                        }

                                        // 【短路情報處理】：初始 OCR 已有結果
                                        if (state.reelStopHasWin) {
                                            state.reelStopHasWin = false; // 消費掉旗標，只處理一次
                                            const reelStopVal = state.reelStopWinValue || '';
                                            const reelStopNum = parseFloat(reelStopVal) || 0;



                                            if (!isRolling && reelStopNum > cascadeThreshold) {
                                                // ═══ 非滾動模式且 WIN 已超過門檻：直接下班 ═══
                                                clearInterval(captureTimer);
                                                console.log(`🕵️‍♂️ [WIN 追蹤特工 #${shortId}] Reel Stop 原圖已有 WIN=${reelStopVal}${cascadeThreshold > 0 ? ` (門檻=${cascadeThreshold})` : ''}，直接下班 🍻`);
                                                state.isWinPollActive = false;

                                                return;
                                            } else if (isRolling) {
                                                // ═══ 滾動模式：情報注入，繼續追蹤 ═══
                                                console.log(`🕵️‍♂️ [WIN 追蹤特工 #${shortId}] 📡 收到停輪情報 WIN=${reelStopVal}，以此為基準線繼續偵測...`);
                                                lastWin = reelStopVal;
                                                bestWinValue = reelStopVal;
                                                hasSeenRollingWin = true;
                                                // 注意：不設 bestWinCanvas，等確認階段才截清晰圖
                                            } else {
                                                // ═══ Cascade 模式：初始 WIN ≤ 門檻，不短路，繼續追蹤 ═══
                                                console.log(`🕵️ [WIN 特工 #${shortId}] 🔗 Cascade 門檻=${cascadeThreshold}，初始 WIN=${reelStopVal} 未超過，繼續追蹤...`);
                                            }
                                        }

                                        if (frameQueue.length > 0) {
                                            // 【跳幀消費】：跳到佇列最新的一幀，中間舊幀全部丟擁
                                            const { canvas: pollCanvas, time: exactPollTime } = frameQueue[frameQueue.length - 1];
                                            frameQueue.length = 0; // 清空佇列，下次再接最新的
                                            const w = winPollWorkerRef.current || ocrWorkerRef.current;
                                            if (w) {
                                                try {
                                                    if (!winFound) {
                                                        const pollWin = await cropAndOCR(pollCanvas, winROI, w, ocrDecimalPlaces ?? 2, 'WIN-POLL');
                                                        // 【診斷 log】：每幀印一次流水帳（滾動模式）或每 10 幀印一次（穩定模式）
                                                        if (isRolling || missCount % 10 === 0) {
                                                            console.log(`🕵️ [WIN 特工 #${shortId}] ` +
                                                                `t=${exactPollTime.toFixed(2)}s | ` +
                                                                `OCR="${pollWin || '(空)'}" | ` +
                                                                `高水位=${bestWinValue || '(無)'} | ` +
                                                                `miss=${missCount} zero=${zeroCount} confirm=${confirmCount} | ` +
                                                                `佇列=${frameQueue.length} polls=${polls}`);
                                                        }
                                                        const parsedWin = parseFloat(pollWin);

                                                        if (pollWin && parsedWin > cascadeThreshold) {
                                                            missCount = 0;
                                                            zeroCount = 0; // 重置歸零計數

                                                            const numPollWin = parsedWin;
                                                            const numLastWin = parseFloat(lastWin) || 0;

                                                            if (isRolling) {
                                                                // ═══ 滾動模式 ═══
                                                                hasSeenRollingWin = true;

                                                                if (numPollWin > numLastWin) {
                                                                    // 新高 → 更新高水位 + 鎖定首次出現截圖
                                                                    if (isRolling) console.log(`📈 [Rolling #${shortId}] ⬆️上升 | OCR=${pollWin} | 前值=${lastWin} | 高水位→${pollWin} | 📸鎖定首幀`);
                                                                    lastWin = pollWin;
                                                                    bestWinValue = pollWin;
                                                                    bestWinCanvas = pollCanvas; // 首次出現時鎖定截圖
                                                                    bestWinTime = exactPollTime;
                                                                } else if (numPollWin === numLastWin) {
                                                                    // 持平 → 不更新截圖（保留首次出現的幀）
                                                                    if (isRolling) console.log(`📈 [Rolling #${shortId}] ➖持平 | OCR=${pollWin} | 高水位=${bestWinValue} | 截圖不動`);
                                                                }
                                                                // 變小 → OCR 誤讀，忽略
                                                                else {
                                                                    if (isRolling) console.log(`⚠️ [Rolling #${shortId}] ⬇️下降忽略 | OCR=${pollWin} < 高水位=${lastWin}`);
                                                                }

                                                                // 滾動模式不用 confirmCount，改由後續歸零偵測控制
                                                            } else {
                                                                // ═══ 穩定模式（不變）═══
                                                                if (pollWin === lastWin) {
                                                                    confirmCount++;
                                                                } else {
                                                                    lastWin = pollWin;
                                                                    confirmCount = 1;
                                                                    bestWinCanvas = pollCanvas;
                                                                    bestWinTime = exactPollTime;
                                                                    bestWinValue = pollWin;
                                                                }

                                                                // 穩定模式的確認門檻
                                                                const targetCount = 2;
                                                                if (confirmCount >= targetCount) {
                                                                    winFound = true;
                                                                    confirmCount = 0; missCount = 0;
                                                                    console.log(`⏳ WIN=${pollWin} 達標 (${targetCount}次確認)！繼續觀察 BAL 結算...`);
                                                                    frameQueue.length = 0; // 清空佇列，加速進入 BAL 階段
                                                                }
                                                            }
                                                        } else if (pollWin !== '' && !isNaN(parsedWin) && parsedWin === 0) {
                                                            // ── 明確讀到 0 (例如 "0.00", "0") ──
                                                            if (isRolling && hasSeenRollingWin) {
                                                                zeroCount++;
                                                                console.log(`🟢 [Rolling #${shortId}] 歸零偵測 | zeroCount=${zeroCount}/6 | 高水位=${bestWinValue}`);
                                                                if (zeroCount >= 6) {
                                                                    winFound = true;
                                                                    console.log(`✅ [Rolling #${shortId}] WIN 歸零確認！最終 WIN=${bestWinValue} (首次出現幀的截圖)`);
                                                                    frameQueue.length = 0;
                                                                }
                                                            } else {
                                                                missCount++;
                                                            }
                                                        } else {
                                                            // ── OCR 失敗 / 畫面模糊 ("") ──
                                                            zeroCount = 0; // 模糊不是歸零，中斷連續 0 的計數
                                                            missCount++;
                                                            if (isRolling && missCount % 5 === 0) {
                                                                console.log(`🟡 [Rolling #${shortId}] OCR 模糊 | miss=${missCount}/${blinkTolerance} | 高水位=${bestWinValue || '(無)'}`);
                                                            }
                                                            if (missCount >= blinkTolerance) {
                                                                confirmCount = 0;
                                                                if (!isRolling) lastWin = '';
                                                            }
                                                        }
                                                    } else {
                                                        // ── 階段 2：WIN 已穩定，快速讀取 BAL 就完工 ──
                                                        // 數據合併法不需要 BAL 穩定（圖用原圖），讀到即收
                                                        if (!balanceROI) {
                                                            // 沒有 BAL ROI，直接完工
                                                            isDone = true;
                                                            await mergeWinData('WIN_POLL_NO_BAL');
                                                            clearInterval(captureTimer);
                                                            return;
                                                        }
                                                        const pollBal = await cropAndOCR(pollCanvas, balanceROI, w, ocrOptions.balDecimalPlaces ?? ocrDecimalPlaces ?? 2, 'BALANCE-POLL');
                                                        if (pollBal && parseFloat(pollBal) > 0) {
                                                            // 讀到有效 BAL，完工（不更新 bestWinCanvas，統一用最早的幀）
                                                            isDone = true;
                                                            await mergeWinData('WIN_POLL');
                                                            clearInterval(captureTimer);
                                                            return;
                                                        }
                                                        // BAL 讀不到就繼續下一幀
                                                    }
                                                } catch (e) { console.error("WIN Poll error:", e); }
                                            }
                                        }

                                        if (!isDone && !hasOutput) {
                                            setTimeout(consumeNext, 10); // 10ms 快速輪詢佇列
                                        }
                                    };

                                    consumeNext();
                                }


                                // 重置旋轉追蹤：截圖後必須偵測到新旋轉才允許下次截圖
                                state.hadSpinSinceLastStop = false;
                            }
                            // ...啟動 OCR 與輪詢等後續操作，因為太長維持不變
                            state.lastCandidateTime = now;
                            state.stableCount = 0;
                            state.decayCount = 0;
                            state.peakDiff = 0;
                            state.diffWindow.length = 0;
                            state.cascadeBoardDiffOk = false;     // 重置差異判定
                            state.cascadeBoardDiffChecked = false; // 重置計算旗標
                        } // 關閉 hadSpinSinceLastStop 檢查的 else
                    } else if (isReelStopped && state.stableCount === 3) {
                        // 【診斷 log】：看起來停了但沒觸發，到底哪個條件擋住？
                        const timeSinceLast = now - state.lastCandidateTime;
                        console.log(`🔍 [V-Line 診斷] 停輪偵測到但未觸發 @ ${now.toFixed(3)}s | hadMotion=${hadMotion} (peak=${state.peakDiff.toFixed(1)}) | cooldown=${timeSinceLast.toFixed(2)}s (需>0.75) | spinning=${analysis.spinningCount}`);
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
            error: '',
            useWinFrame: true
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
        const { winROI, balanceROI, betROI, orderIdROI, multiplierROI, ocrDecimalPlaces, balDecimalPlaces } = ocrOptions;
        if (worker && (winROI || balanceROI || betROI || orderIdROI || multiplierROI)) {
            Promise.all([
                cropAndOCR(canvas, winROI, worker, ocrDecimalPlaces ?? 2, 'WIN'),
                cropAndOCR(canvas, balanceROI, worker, balDecimalPlaces ?? ocrDecimalPlaces ?? 2, 'BALANCE'),
                cropAndOCR(canvas, betROI, worker, 0, 'BET'),
                orderIdROI ? cropAndOCR(canvas, orderIdROI, worker, 0, 'ORDER_ID') : Promise.resolve(''),
                multiplierROI ? detectMultiplier(canvas, multiplierROI, worker, ocrOptions) : Promise.resolve('')
            ]).then(([win, balance, bet, orderId, multiplier]) => {
                setCandidates(prev => prev.map(c =>
                    c.id === candidate.id ? { ...c, ocrData: { win, balance, bet, orderId, multiplier } } : c
                ));
            }).catch(() => { });
        }
        return candidate.id;
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

            // 自動判定：候選列表中有 isCascadeCapture 標記的幀 → 使用 cascade 合併策略
            const hasCascadeFrames = prev.some(c => c.isCascadeCapture);
            const isCascadeMode = hasCascadeFrames;
            const eps = 0.5; // OCR 容差
            const parse = (v) => parseFloat(v) || 0;

            // 解析每幀的數值
            let frames = prev.map((kf, i) => ({
                idx: i,
                kf,
                win: parse(kf.ocrData?.win),
                bal: parse(kf.ocrData?.balance),
                bet: parse(kf.ocrData?.bet),
            }));

            // 【防禦源頭：淨化贏分殘影 (Ghost Win Purify)】
            // 如果 B 的餘額剛好等於 A 的扣款後餘額 (A.bal + A.win - B.bet)，且 B.win == A.win，
            // 代表 B 其實是剛轉動的新局，只是畫面截到了上一局留下來的 WIN！把它淨化成 0。
            frames.sort((a, b) => a.kf.time - b.kf.time);
            for (let i = 1; i < frames.length; i++) {
                const curr = frames[i];
                if (curr.win > 0) {
                    for (let j = i - 1; j >= 0; j--) {
                        const prevF = frames[j];
                        // 找尋近 15 秒內有沒有上一局的殘影
                        if (curr.kf.time - prevF.kf.time > 15) break;

                        if (Math.abs(curr.win - prevF.win) < eps) {
                            // 【局號防呆】：如果兩幀有不同的局號，代表是不同局的真實贏分，不是殘影
                            const currId = curr.kf.ocrData?.orderId;
                            const prevId = prevF.kf.ocrData?.orderId;
                            if (currId && prevId && currId !== prevId) continue;

                            const expectedNewBal = prevF.bal + prevF.win - curr.bet;
                            if (curr.bet > 0 && Math.abs(curr.bal - expectedNewBal) < eps) {
                                // 抓到了！這是一個剛開始轉的新局，但帶著舊的 WIN 殘影！
                                curr.win = 0; // 功能邏輯同步淨化
                                curr.kf = {
                                    ...curr.kf,
                                    ocrData: { ...curr.kf.ocrData, win: '0' },
                                    error: '🌟 已淨化前局贏分殘影'
                                };
                                break; // 淨化完畢，這局就是新開的空局，不需再往回找
                            }
                        }
                    }
                }
            }

            // 把順序掛回最初的 idx 順序以配合後續 Union-Find 定義
            frames.sort((a, b) => a.idx - b.idx);

            // 100% 嚴格比對 (因為只有數字和連字符，不會有相似混淆)
            const isSimilarStr = (s1, s2) => s1 === s2;

            // 判斷兩幀是否為同一局
            function areSameSpin(frameA, frameB) {
                // 【先鋒判定法則 (Vanguard Rule)：注單號比對】
                const id1 = frameA.kf.ocrData?.orderId;
                const id2 = frameB.kf.ocrData?.orderId;
                const isValidId = (id) => id && id.length >= 5;

                if (isValidId(id1) && isValidId(id2)) {
                    if (isSimilarStr(id1, id2)) {
                        return true; // 身分證高度相似，無條件同局 (解決複雜 FG 算術失效)
                    } else {
                        return false; // 有明確且不同的單號，無條件不同局 (防禦殘影 / 幽冥斷層)
                    }
                }

                // --------- Fallback: 傳統餘額算術比對 ---------
                // 確保 f1 在影片時間上「早於或等於」 f2
                const [f1, f2] = frameA.kf.time <= frameB.kf.time ? [frameA, frameB] : [frameB, frameA];

                // BET 必須一致
                if (Math.abs(f1.bet - f2.bet) > eps && f1.bet > 0 && f2.bet > 0) return false;

                // Case 1: 完全相同 (無關順序)
                if (Math.abs(f1.win - f2.win) < eps && Math.abs(f1.bal - f2.bal) < eps) return true;

                // Case 2: 較早的沒有 WIN，較晚的準備跳 WIN（State 1→2）
                // 嚴格限定：必須是「先沒有贏分 (f1)，後來才有贏分 (f2)」，不能時光倒流！
                if (f1.win < eps && f2.win > eps && Math.abs(f1.bal - f2.bal) < eps) return true;

                // Case 3: 同 WIN, 較晚的 BAL 更新了（State 2→3）
                if (f1.win > eps && f2.win > eps && Math.abs(f1.win - f2.win) < eps) {
                    if (Math.abs(f1.bal + f1.win - f2.bal) < eps) return true;
                }

                // Case 4: 較早的沒有 WIN，較晚的已經結算完畢（State 1→3）
                if (f1.win < eps && f2.win > eps && Math.abs(f1.bal + f2.win - f2.bal) < eps) return true;

                return false;
            }

            // Union-Find 分組
            const parent = frames.map((_, i) => i);
            const groupCode = frames.map(f => {
                const id = f.kf.ocrData?.orderId;
                return (id && id.length >= 5) ? id : null;
            });

            function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }

            function canUnion(a, b) {
                const rootA = find(a);
                const rootB = find(b);
                if (rootA === rootB) return true;
                const idA = groupCode[rootA];
                const idB = groupCode[rootB];
                // 如果兩邊群組都有單號，而且不一樣，就絕對不能縫合！阻止內鬼牽線！
                if (idA && idB && !isSimilarStr(idA, idB)) return false;
                return true;
            }

            function union(a, b) {
                const rootA = find(a);
                const rootB = find(b);
                if (rootA !== rootB) {
                    parent[rootA] = rootB;
                    // 繼承單號血統
                    if (!groupCode[rootB] && groupCode[rootA]) groupCode[rootB] = groupCode[rootA];
                }
            }

            for (let i = 0; i < frames.length; i++) {
                for (let j = i + 1; j < frames.length; j++) {
                    const timeDiff = Math.abs(frames[i].kf.time - frames[j].kf.time);
                    if (timeDiff <= 300 && areSameSpin(frames[i], frames[j])) {

                        // 【終極防呆】：防止 Union-Find 把跨越中獎局的兩個死局縫合
                        // 如果首尾兩張圖都沒有贏分（WIN=0），但它們中間夾了一張有贏分的圖，
                        // 代表這絕對是「跨越了不同局」，不可縫合！
                        let crossWinBoundary = false;
                        if (frames[i].win < eps && frames[j].win < eps) {
                            for (let k = i + 1; k < j; k++) {
                                // 中間只要有任何大於 0 的贏分，這條連線就必須剪斷
                                if (frames[k].win > eps) {
                                    crossWinBoundary = true;
                                    break;
                                }
                            }
                        }

                        if (!crossWinBoundary && canUnion(i, j)) {
                            union(i, j);
                        }
                    }
                }
            }

            // 收集分組
            const groups = {};
            frames.forEach((f, i) => {
                const root = find(i);
                if (!groups[root]) groups[root] = [];
                groups[root].push(f);
            });

            // ==========================================
            // 🔥 [Cascade 智能合併 Pass] 
            // 根據使用者指定的 isCascadeMode 決定合併策略
            // ==========================================
            let finalGroups = Object.values(groups);
            finalGroups.sort((a, b) => a[0].kf.time - b[0].kf.time);

            let foldedGroups = [];

            if (!isCascadeMode) {
                // 完全不做 Cascade 合併
                foldedGroups = finalGroups.map(g => [...g]);
            } else {
                let currentCascade = null;

                for (let i = 0; i < finalGroups.length; i++) {
                    const g = finalGroups[i];
                    let maxWin = -1, rep = g[0];
                    g.forEach(f => { if (f.win > maxWin) { maxWin = f.win; rep = f; } });

                    if (currentCascade) {
                        const prevTime = currentCascade.group[currentCascade.group.length - 1].kf.time;
                        const cascadeBal = currentCascade.rep.bal;
                        const cascadeBet = currentCascade.rep.bet;
                        const cascadeWin = currentCascade.rep.win;
                        
                        const timeDiff = g[0].kf.time - prevTime;

                        const isBelowFrozen = Math.abs(rep.bal - cascadeBal) < eps;
                        const isWinIncreasing = rep.win >= cascadeWin;
                        const isSameBet = rep.bet === cascadeBet && rep.bet > 0;
                        const isTieSpin = Math.abs(cascadeWin - rep.bet) < eps;

                        let shouldMerge = false;

                        if (timeDiff <= 180 && isSameBet) {
                            if (isBelowFrozen && isWinIncreasing) {
                                if (isBelowFrozen && isTieSpin) {
                                    shouldMerge = false; // 平局防呆
                                } else {
                                    shouldMerge = true;
                                }
                            }
                        }

                        if (shouldMerge) {
                            g.forEach(f => f.isCascadeMember = true);
                            g.forEach(f => f.cascadeDeltaWin = rep.win - cascadeWin);
                            currentCascade.group.forEach(f => f.isCascadeMember = true);
                            if(currentCascade.group.length === 1) { 
                                currentCascade.group.forEach(f => f.cascadeDeltaWin = cascadeWin); 
                            }

                            currentCascade.group.push(...g);
                            currentCascade.rep = rep; 
                            continue;
                        } else {
                            foldedGroups.push(currentCascade.group);
                            currentCascade = null;
                        }
                    }

                    if (!currentCascade) {
                        currentCascade = { group: [...g], rep: rep };
                        g.forEach(f => f.cascadeDeltaWin = f.win);
                    }
                }
                if (currentCascade) {
                    foldedGroups.push(currentCascade.group);
                }
            }

            // 把 foldedGroups 內容交接給後續的最佳幀挑選邏輯
            const mergedGroupsList = foldedGroups;

            // 每組標記最佳幀
            const bestIds = new Set();
            let spinGroupCounter = 0;
            const spinGroupMap = {}; // kf.id → spinGroupId

            for (const group of mergedGroupsList) {
                const gid = spinGroupCounter++;
                group.forEach(f => { spinGroupMap[f.kf.id] = { id: gid, isCascadeMember: !!f.isCascadeMember, cascadeDeltaWin: f.cascadeDeltaWin }; });

                if (group.length === 1) {
                    bestIds.add(group[0].kf.id);
                    continue;
                }

                // 🔗 [Cascade 全盤面保留] 連鎖序列中每張盤面都是獨立的消除結果，全部都需要辨識
                const isCascadeGroup = group.some(f => f.isCascadeMember);
                if (isCascadeGroup) {
                    group.forEach(f => { if (f.isCascadeMember) bestIds.add(f.kf.id); });
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

            setTimeout(() => {
                setTemplateMessage?.(`🧹 分析完成：${prev.length} 幀 → ${totalGroups} 局（${multiGroups} 局有重複幀），已標記最佳`);
            }, 0);

            const cleansedMap = {};
            frames.forEach(f => { cleansedMap[f.kf.id] = f.kf; });

            return prev.map(kf => {
                const safeKf = cleansedMap[kf.id] || kf;
                const mapping = spinGroupMap[kf.id];
                return {
                    ...safeKf,
                    spinGroupId: mapping ? mapping.id : 0,
                    isCascadeMember: mapping ? mapping.isCascadeMember : false,
                    cascadeDeltaWin: mapping ? mapping.cascadeDeltaWin : 0,
                    isSpinBest: bestIds.has(kf.id),
                };
            });
        });
    }, [setTemplateMessage]);

    // 手動更新單張卡片的 OCR 數值（WIN/BET/BAL）並加上人工修改標記
    const updateCandidateOcr = useCallback((candidateId, field, value) => {
        setCandidates(prev => prev.map(c => {
            if (c.id === candidateId) {
                // 如果已經有 ocrData，就覆寫；沒有就建一個預設空的
                const oldOcr = c.ocrData || { win: '0', balance: '0', bet: '0', orderId: '' };
                const prevOverrides = c.manualOverrides || {};
                return {
                    ...c,
                    ocrData: {
                        ...oldOcr,
                        [field]: value
                    },
                    manualOverrides: {
                        ...prevOverrides,
                        [field]: true
                    },
                    status: 'pending' // 重置狀態讓它重新算分
                };
            }
            return c;
        }));
    }, []);

    // 智慧刪除：移除未被標記為 isSpinBest 的幀
    const confirmDedup = useCallback(() => {
        setCandidates(prev => {
            const kept = prev.filter(c => c.isSpinBest !== false); // 保留 best 或是還沒被標記過單局的

            setTimeout(() => {
                setTemplateMessage?.(`已刪除 ${prev.length - kept.length} 張重複畫格，剩餘 ${kept.length} 張`);
            }, 0);

            return kept.map(c => ({ ...c, isSpinBest: undefined })); // 清除標記
        });
    }, [setTemplateMessage]);

    // 【新增功能】：手動指定某張卡片為該局的最佳畫格
    const setManualBestCandidate = useCallback((candidateId) => {
        setCandidates(prev => {
            const target = prev.find(c => c.id === candidateId);
            if (!target) return prev;
            const targetGroupId = target.spinGroupId;

            // 只有跑過 smartDedup 的才能指定
            if (targetGroupId === undefined) return prev;

            // 找到同群組的所有卡片
            const sameGroup = prev.filter(c => c.spinGroupId === targetGroupId);
            // 群組內只有一張，不需要切換
            if (sameGroup.length <= 1) return prev;

            // 只切換 isSpinBest 標記，每偵保留自己的 OCR 數據
            // （OCR 數據屬於該偵的截圖時間點，不應搬移）
            return prev.map(c => {
                if (c.spinGroupId === targetGroupId) {
                    return { ...c, isSpinBest: c.id === candidateId };
                }
                return c;
            });
        });
    }, []);

    return {
        candidates, setCandidates,
        startLiveDetection, stopLiveDetection,
        removeCandidate, updateCandidate,
        clearCandidates,
        smartDedup,
        confirmDedup,
        setManualBestCandidate,
        addManualCandidate,
        updateCandidateOcr
    };
}