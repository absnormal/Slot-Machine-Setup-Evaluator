import { useRef, useCallback, useEffect } from 'react';
import { useSmartDedup } from './useSmartDedup';
import { useCandidateManager } from './useCandidateManager';
import { OcrWorkerBridge } from '../engine/ocrWorkerBridge';

// -- Modularized imports --
import { extractROIGray, computeMAE } from '../utils/videoUtils';
import { extractSliceGrays, computeSliceMAEs, analyzeSlicePattern, windowStats, computeBoardVariance } from '../engine/vlineScanner';
import { captureFullFrame, generateThumbUrl, cropAndOCR } from '../engine/ocrPipeline';
import { startWinPollAgent, detectMultiplier } from '../engine/winPollAgent';



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
    // ── 候選幀 CRUD（已抽離至 useCandidateManager）──
    const { candidates, setCandidates, removeCandidate, clearCandidates, updateCandidate, updateCandidateOcr } = useCandidateManager();

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

                                // ── WIN 輪詢：如果啟用，立刻啟動 WIN 追蹤特工 ──
                                if (ocrOptions.enableWinTracker && winROI) {
                                    startWinPollAgent({
                                        video, roi, ocrOptions, candidate, state,
                                        liveCancelRef,
                                        mainWorker: ocrWorkerRef.current,
                                        pollWorker: winPollWorkerRef.current,
                                        setCandidates
                                    });
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

    // ── 智慧標記 / 去重 / 手動指定最佳幀（已抽離至 useSmartDedup）──
    const { smartDedup, confirmDedup, setManualBestCandidate } = useSmartDedup({ setCandidates, setTemplateMessage });

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