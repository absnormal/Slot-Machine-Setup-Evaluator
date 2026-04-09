import { useState, useRef, useCallback, useEffect } from 'react';
import Ocr from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web';

// -- Modularized imports --
import { extractROIGray, computeMAE } from '../utils/videoUtils';
import { extractSliceGrays, computeSliceMAEs, analyzeSlicePattern, windowStats } from '../engine/vlineScanner';
import { captureFullFrame, generateThumbUrl, cropAndOCR } from '../engine/ocrPipeline';

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
                        const { winROI, balanceROI, betROI, orderIdROI, ocrDecimalPlaces } = ocrOptions;
                        if (worker && (winROI || balanceROI || betROI || orderIdROI)) {
                            // ── 初始 OCR：讀取截圖時的 BAL / BET / WIN / ID ──
                            Promise.allSettled([
                                cropAndOCR(frameCanvas, winROI, worker, ocrDecimalPlaces ?? 2, 'WIN'),
                                cropAndOCR(frameCanvas, balanceROI, worker, ocrDecimalPlaces ?? 2, 'BALANCE'),
                                cropAndOCR(frameCanvas, betROI, worker, 0, 'BET'),
                                orderIdROI ? cropAndOCR(frameCanvas, orderIdROI, worker, 0, 'ORDER_ID') : Promise.resolve('')
                            ]).then(([winR, balR, betR, orderIdR]) => {
                                const win = winR.status === 'fulfilled' ? winR.value : '';
                                const balance = balR.status === 'fulfilled' ? balR.value : '';
                                const bet = betR.status === 'fulfilled' ? betR.value : '';
                                const orderId = orderIdR.status === 'fulfilled' ? orderIdR.value : '';
                                setCandidates(prev => prev.map(c =>
                                    c.id === candidate.id ? { ...c, ocrData: { win, balance, bet, orderId } } : c
                                ));

                                // 【快速短路機制】：如果 Reel Stop 的畫面中就已經包含了清晰的 WIN！
                                // 立刻通報 WIN 追蹤特工「不需要抓了，直接下班！」
                                if (win && parseFloat(win) > 0) {
                                    state.reelStopHasWin = true;
                                }
                            });

                            // ── WIN 輪詢：立刻啟動！不等初始 OCR 完成 ──
                            if (winROI) {
                                state.isWinPollActive = true;
                                state.cancelWinPoll = false;
                                state.reelStopHasWin = false;

                                let lastWin = '';
                                let confirmCount = 0;
                                let missCount = 0;
                                let polls = 0;
                                let winFound = false;
                                let isDone = false;
                                let lastBal = '';
                                let hasOutput = false;
                                
                                // 【最強記憶機制】：無條件保存最後一次肉眼看到的數字，就算等一下被錢幣擋住，我們也有這張遺照！
                                let bestWinCanvas = null;
                                let bestWinTime = 0;
                                let bestWinValue = '';

                                const targetFps = ocrOptions.fps || 10;
                                const pollIntervalMs = Math.floor(1000 / targetFps);
                                const MAX_POLLS = targetFps * 3; // 最多嘗試約 3 秒
                                const blinkTolerance = Math.max(4, Math.floor(targetFps * 0.5)); // 容忍閃爍約 0.5 秒

                                const outputWinCard = async (triggerLabel) => {
                                    if (hasOutput) return;
                                    hasOutput = true;
                                    
                                    const finalCanvas = bestWinCanvas;
                                    const finalTime = bestWinTime;
                                    const finalWinVal = bestWinValue;
                                    const w = winPollWorkerRef.current || ocrWorkerRef.current;

                                    const finalBal = balanceROI ? await cropAndOCR(finalCanvas, balanceROI, w, ocrDecimalPlaces ?? 2, 'BAL-FINAL') : '';
                                    const finalBet = betROI ? await cropAndOCR(finalCanvas, betROI, w, 0, 'BET-FINAL') : '';
                                    const finalOrderId = orderIdROI ? await cropAndOCR(finalCanvas, orderIdROI, w, 0, 'ORDER_ID') : '';

                                    const winThumbUrl = generateThumbUrl(finalCanvas, roi);
                                    const winCandidate = {
                                        id: `kf_live_win_${Date.now()}`,
                                        time: finalTime,
                                        canvas: finalCanvas,
                                        thumbUrl: winThumbUrl,
                                        diff: '0',
                                        avgDiff: '0',
                                        triggerReason: triggerLabel,
                                        ocrData: { win: finalWinVal, balance: finalBal, bet: finalBet, orderId: finalOrderId },
                                        status: 'pending',
                                        recognitionResult: null,
                                        error: ''
                                    };
                                    setCandidates(prev => [...prev, winCandidate]);
                                    
                                    console.log(`\n========================================`);
                                    console.log(`📸 [贏分結算] 觸發『第二張』候選截圖！(${triggerLabel})`);
                                    console.log(`⏰ 截圖畫面時間: ${finalTime.toFixed(3)}s`);
                                    console.log(`💰 確認數值: WIN=${finalWinVal}, BAL=${finalBal || '(未設定ROI)'}`);
                                    console.log(`========================================\n`);
                                    
                                    state.isWinPollActive = false; // 解除鎖定
                                };

                                console.log(`🕵️‍♂️ [WIN 追蹤特工] 啟動！以 ${targetFps} FPS (${pollIntervalMs}ms) 持續跟蹤長達 3 秒... (影片時間：${video.currentTime.toFixed(3)}s)`);

                                const pollNext = async () => {
                                    polls++;
                                    
                                    // 【打斷與超時判斷】：如果外頭的影片已經開始狂轉下一局，或者是三秒超時，或者原圖已經有贏分
                                    if (state.cancelWinPoll || isDone || liveCancelRef.current || video.paused || video.ended || polls > MAX_POLLS || state.reelStopHasWin) {
                                        
                                        // 如果是因為原圖就已經有 WIN 而被短路下班，那我們什麼遺產都不留（因為原圖已經夠完美了）
                                        if (state.reelStopHasWin) {
                                            console.log(`🕵️‍♂️ [WIN 追蹤特工] 捷報！Reel Stop 原圖就自帶贏分了，特工提早快樂下班，不產出多餘卡片 🍻`);
                                            state.isWinPollActive = false;
                                            return;
                                        }

                                        if (bestWinCanvas && !hasOutput) {
                                            console.log(`🕵️‍♂️ [WIN 追蹤特工] 任務強行中斷，但提取了最後一刻的完美遺產！強制輸出...`);
                                            await outputWinCard('WIN_POLL_FORCED');
                                        } else if (!hasOutput) {
                                            console.log(`🕵️‍♂️ [WIN 追蹤特工] 任務撤銷/超時，未留下任何遺產。`);
                                            state.isWinPollActive = false;
                                        }
                                        return;
                                    }
                                    
                                    const w = winPollWorkerRef.current || ocrWorkerRef.current;
                                    if (!w) return;

                                    const pollCanvas = captureFullFrame(video);
                                    const exactPollTime = video.currentTime; 
                                    
                                    try {
                                        if (!winFound) {
                                            const pollWin = await cropAndOCR(pollCanvas, winROI, w, ocrDecimalPlaces ?? 2, 'WIN-POLL');
                                            
                                            if (pollWin && parseFloat(pollWin) > 0) {
                                                missCount = 0; 
                                                console.log(`🕵️‍♂️ [WIN 追蹤特工] 👀 抓到數字: "${pollWin}" (第 ${polls} 次輪詢)`);
                                                
                                                if (pollWin === lastWin) {
                                                    confirmCount++;
                                                } else {
                                                    lastWin = pollWin;
                                                    confirmCount = 1;
                                                    
                                                    // 【最強記憶】：只存取該數字出現的「第一張」畫面，後續若數字沒變就不再覆寫。
                                                    bestWinCanvas = pollCanvas;
                                                    bestWinTime = exactPollTime;
                                                    bestWinValue = pollWin;
                                                }
                                                
                                                const targetCount = Math.max(3, Math.floor(targetFps * 0.25));
                                                
                                                if (confirmCount >= targetCount) {
                                                    winFound = true;
                                                    confirmCount = 0; 
                                                    missCount = 0;
                                                    console.log(`⏳ WIN=${pollWin} 達標！繼續觀察 BAL 結算...`);
                                                }
                                            } else {
                                                missCount++;
                                                if (missCount >= blinkTolerance) {
                                                    confirmCount = 0;
                                                    lastWin = '';
                                                    // （注意：我們不清除 bestWinCanvas！這樣即使等一下被中斷，我們也有先前的紀錄可交差）
                                                }
                                            }
                                        } else {
                                            // ── 階段 2：WIN 已穩定，觀察 BAL 是否也穩定下來了 ──
                                            let targetBalCount = ocrOptions.requireStableWin ? 3 : 1;
                                            if (!balanceROI) targetBalCount = 0;
                                            else {
                                                const pollBal = await cropAndOCR(pollCanvas, balanceROI, w, ocrDecimalPlaces ?? 2, 'BALANCE-POLL');
                                                if (pollBal && parseFloat(pollBal) > 0) {
                                                    missCount = 0;
                                                    if (pollBal === lastBal) confirmCount++;
                                                    else { lastBal = pollBal; confirmCount = 1; }
                                                } else {
                                                    missCount++;
                                                    if (missCount >= 4) { confirmCount = 0; lastBal = ''; }
                                                }
                                            }

                                            if (confirmCount >= targetBalCount) {
                                                isDone = true;
                                                await outputWinCard('WIN_POLL');
                                                return; 
                                            }
                                        }
                                    } catch (e) {
                                        console.error("WIN Poll error:", e);
                                    }
                                    
                                    if (!isDone && !hasOutput) {
                                        setTimeout(pollNext, pollIntervalMs);
                                    }
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
        const { winROI, balanceROI, betROI, orderIdROI, ocrDecimalPlaces } = ocrOptions;
        if (worker && (winROI || balanceROI || betROI || orderIdROI)) {
            Promise.all([
                cropAndOCR(canvas, winROI, worker, ocrDecimalPlaces ?? 2, 'WIN'),
                cropAndOCR(canvas, balanceROI, worker, ocrDecimalPlaces ?? 2, 'BALANCE'),
                cropAndOCR(canvas, betROI, worker, 0, 'BET'),
                orderIdROI ? cropAndOCR(canvas, orderIdROI, worker, 0, 'ORDER_ID') : Promise.resolve('')
            ]).then(([win, balance, bet, orderId]) => {
                setCandidates(prev => prev.map(c =>
                    c.id === candidate.id ? { ...c, ocrData: { win, balance, bet, orderId } } : c
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
            
            setTimeout(() => {
                setTemplateMessage?.(`🧹 分析完成：${prev.length} 幀 → ${totalGroups} 局（${multiGroups} 局有重複幀），已標記最佳`);
            }, 0);

            const cleansedMap = {};
            frames.forEach(f => { cleansedMap[f.kf.id] = f.kf; });

            return prev.map(kf => {
                const safeKf = cleansedMap[kf.id] || kf;
                return {
                    ...safeKf,
                    spinGroupId: spinGroupMap[kf.id] ?? 0,
                    isSpinBest: bestIds.has(kf.id),
                };
            });
        });
    }, [setTemplateMessage]);

    // 智慧修復：針對指定的 groupId 集合重新 OCR，並自動跑 smartDedup
    const healBreaks = useCallback(async (brokenGroupIds, ocrOptions) => {
        const { winROI, balanceROI, betROI, orderIdROI, ocrDecimalPlaces } = ocrOptions;
        const worker = ocrWorkerRef.current;
        if (!worker || brokenGroupIds.length === 0) return;

        // 整理需要處理的局號 (含發生斷層的當局 & 上一局)
        const targetGroupIds = new Set();
        brokenGroupIds.forEach(id => {
            targetGroupIds.add(id);
            if (id > 0) targetGroupIds.add(id - 1);
        });

        setTemplateMessage?.(`⚡ 正在深度修復 ${targetGroupIds.size} 局斷層資料...`);

        // 讓 React 取得最新 state，執行非同步修復，然後寫回
        setCandidates(prev => {
            const targetCandidates = prev.filter(c => targetGroupIds.has(c.spinGroupId));
            if (targetCandidates.length === 0) {
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
                    const win = winROI ? await cropAndOCR(c.canvas, winROI, worker, ocrDecimalPlaces, 'WIN') : (c.ocrData?.win || '0');
                    const balance = balanceROI ? await cropAndOCR(c.canvas, balanceROI, worker, ocrDecimalPlaces, 'BALANCE') : (c.ocrData?.balance || '0');
                    const bet = betROI ? await cropAndOCR(c.canvas, betROI, worker, 0, 'BET') : (c.ocrData?.bet || '0');
                    const orderId = orderIdROI ? await cropAndOCR(c.canvas, orderIdROI, worker, 0, 'ORDER_ID') : (c.ocrData?.orderId || '');
                    
                    completed++;
                    setTemplateMessage?.(`⚡ 修復進度: ${completed} / ${total}`);
                    
                    // 利用微弱的影像處理差異？目前只要用新 ROI 重跑一次通常就能解，若之後不夠可在此處加 variations
                    updatedTargets.push({
                        ...c,
                        ocrData: { win, balance, bet, orderId },
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
            const kept = prev.filter(c => c.isSpinBest !== false); // 保留 best 或是還沒被標記過單局的
            
            setTimeout(() => {
                setTemplateMessage?.(`已刪除 ${prev.length - kept.length} 張重複畫格，剩餘 ${kept.length} 張`);
            }, 0);

            return kept.map(c => ({...c, isSpinBest: undefined})); // 清除標記
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
        healBreaks
    };
}