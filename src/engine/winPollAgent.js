/**
 * winPollAgent.js — WIN 追蹤特工（生產者/消費者模式）
 *
 * 從 useKeyframeExtractor 的 startLiveDetection 內部抽離。
 * 負責在 Reel Stop 後持續以 20fps 截圖並輪詢 WIN ROI，偵測贏分變化。
 *
 * 設計為純函式模組（非 React Hook），接收所有依賴，回傳控制介面。
 */
import { captureFullFrame, generateThumbUrl, cropAndOCR } from './ocrPipeline';

/**
 * 偵測 Multiplier（亮度模式或 OCR 模式）
 * 從 useKeyframeExtractor 頂層搬入，供 mergeWinData 使用
 */
export async function detectMultiplier(canvas, roi, worker, ocrOptions) {
    if (ocrOptions.multiplierDetectMode === 'brightness') {
        // 動態引入避免循環依賴
        const { measureSegmentBrightness } = await import('../utils/videoUtils');
        const values = ocrOptions.multiplierBrightnessValues || ['x1', 'x2', 'x3', 'x5'];
        const brightness = measureSegmentBrightness(canvas, roi, values.length);
        const maxIdx = brightness.indexOf(Math.max(...brightness));
        return values[maxIdx];
    }
    return cropAndOCR(canvas, roi, worker, 0, 'MULTIPLIER');
}

/**
 * 啟動 WIN 追蹤特工
 *
 * @param {Object} params
 * @param {HTMLVideoElement} params.video - 影片元素
 * @param {Object} params.roi - 盤面 ROI
 * @param {Object} params.ocrOptions - OCR 選項（含各 ROI + 偵測模式）
 * @param {Object} params.candidate - 原始 Reel Stop 候選幀
 * @param {Object} params.state - liveStateRef.current（共享狀態）
 * @param {Object} params.liveCancelRef - 全域取消 ref
 * @param {Object} params.mainWorker - 主 OCR Worker
 * @param {Object} params.pollWorker - 輪詢專用 OCR Worker
 * @param {Function} params.setCandidates - 候選幀 setter
 */
export function startWinPollAgent({
    video, roi, ocrOptions, candidate, state, liveCancelRef,
    mainWorker, pollWorker, setCandidates
}) {
    const { winROI, balanceROI, betROI, orderIdROI, multiplierROI, ocrDecimalPlaces, balDecimalPlaces } = ocrOptions;
    const currentAgentId = Date.now();
    const shortId = currentAgentId.toString().slice(-4);
    const reelStopId = candidate.id;
    const isRolling = !!ocrOptions.hasRollingWin;
    const blinkTolerance = isRolling ? 40 : 10;
    const pollIntervalMs = 50; // 20fps
    const MAX_POLLS = 600; // 最多約 30 秒
    const MAX_QUEUE_SIZE = 30;

    // 更新共享狀態
    if (state.isWinPollActive) {
        const oldId = state.winPollAgentId.toString().slice(-4);
        console.log(`🕵️‍♂️ [WIN 追蹤特工 #${oldId} (前任)] 被新一局截斷！已強制退場 🪦`);
    }
    state.winPollAgentId = currentAgentId;
    state.isWinPollActive = true;
    state.cancelWinPoll = false;
    state.reelStopHasWin = false;
    state.reelStopWinValue = '';

    // 特工內部狀態
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

    // 【最強記憶機制】：保存最後一次穩定讀到的 WIN 數字與對應截圖
    let bestWinCanvas = null;
    let bestWinTime = 0;
    let bestWinValue = '';

    let cascadeThreshold = 0;

    const frameQueue = [];

    // 【合併輸出】：把 WIN/BAL/BET 數據寫回原始 Reel Stop 卡片
    const mergeWinData = async (triggerLabel) => {
        if (hasOutput) return;
        hasOutput = true;

        const w = pollWorker || mainWorker;
        const finalBal = balanceROI ? await cropAndOCR(bestWinCanvas, balanceROI, w, balDecimalPlaces ?? ocrDecimalPlaces ?? 2, 'BAL-FINAL') : '';
        const finalBet = betROI ? await cropAndOCR(bestWinCanvas, betROI, w, 0, 'BET-FINAL') : '';
        const finalOrderId = orderIdROI ? await cropAndOCR(bestWinCanvas, orderIdROI, w, 0, 'ORDER_ID') : '';
        const finalMult = multiplierROI ? await detectMultiplier(bestWinCanvas, multiplierROI, w, ocrOptions) : '';

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

        state.isWinPollActive = false;
    };

    console.log(`🕵️‍♂️ [WIN 追蹤特工 #${shortId}] 啟動！以 20 FPS 持續跟蹤長達 10 秒，數據將合併回 Reel Stop 卡片 (影片時間：${video.currentTime.toFixed(3)}s)`);

    // ── 生產者：截取畫面供 OCR 輪詢（cascade 降至 5fps 避免佇列堆積）──
    const captureTimer = setInterval(() => {
        if (state.winPollAgentId !== currentAgentId || state.cancelWinPoll || isDone || liveCancelRef.current || video.paused || video.ended) {
            clearInterval(captureTimer);
            return;
        }
        if (frameQueue.length >= MAX_QUEUE_SIZE) {
            frameQueue.shift();
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
                    const w = pollWorker || mainWorker;
                    const scanFrames = frameQueue.slice(-3).reverse();
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
            state.reelStopHasWin = false;
            const reelStopVal = state.reelStopWinValue || '';
            const reelStopNum = parseFloat(reelStopVal) || 0;

            if (!isRolling && reelStopNum > cascadeThreshold) {
                clearInterval(captureTimer);
                console.log(`🕵️‍♂️ [WIN 追蹤特工 #${shortId}] Reel Stop 原圖已有 WIN=${reelStopVal}${cascadeThreshold > 0 ? ` (門檻=${cascadeThreshold})` : ''}，直接下班 🍻`);
                state.isWinPollActive = false;
                return;
            } else if (isRolling) {
                console.log(`🕵️‍♂️ [WIN 追蹤特工 #${shortId}] 📡 收到停輪情報 WIN=${reelStopVal}，以此為基準線繼續偵測...`);
                lastWin = reelStopVal;
                bestWinValue = reelStopVal;
                hasSeenRollingWin = true;
            } else {
                console.log(`🕵️ [WIN 特工 #${shortId}] 🔗 Cascade 門檻=${cascadeThreshold}，初始 WIN=${reelStopVal} 未超過，繼續追蹤...`);
            }
        }

        if (frameQueue.length > 0) {
            const { canvas: pollCanvas, time: exactPollTime } = frameQueue[frameQueue.length - 1];
            frameQueue.length = 0;
            const w = pollWorker || mainWorker;
            if (w) {
                try {
                    if (!winFound) {
                        const pollWin = await cropAndOCR(pollCanvas, winROI, w, ocrDecimalPlaces ?? 2, 'WIN-POLL');
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
                            zeroCount = 0;

                            const numPollWin = parsedWin;
                            const numLastWin = parseFloat(lastWin) || 0;

                            if (isRolling) {
                                // ═══ 滾動模式 ═══
                                hasSeenRollingWin = true;

                                if (numPollWin > numLastWin) {
                                    if (isRolling) console.log(`📈 [Rolling #${shortId}] ⬆️上升 | OCR=${pollWin} | 前值=${lastWin} | 高水位→${pollWin} | 📸鎖定首幀`);
                                    lastWin = pollWin;
                                    bestWinValue = pollWin;
                                    bestWinCanvas = pollCanvas;
                                    bestWinTime = exactPollTime;
                                } else if (numPollWin === numLastWin) {
                                    if (isRolling) console.log(`📈 [Rolling #${shortId}] ➖持平 | OCR=${pollWin} | 高水位=${bestWinValue} | 截圖不動`);
                                } else {
                                    if (isRolling) console.log(`⚠️ [Rolling #${shortId}] ⬇️下降忽略 | OCR=${pollWin} < 高水位=${lastWin}`);
                                }
                            } else {
                                // ═══ 穩定模式 ═══
                                if (pollWin === lastWin) {
                                    confirmCount++;
                                } else {
                                    lastWin = pollWin;
                                    confirmCount = 1;
                                    bestWinCanvas = pollCanvas;
                                    bestWinTime = exactPollTime;
                                    bestWinValue = pollWin;
                                }

                                const targetCount = 2;
                                if (confirmCount >= targetCount) {
                                    winFound = true;
                                    confirmCount = 0; missCount = 0;
                                    console.log(`⏳ WIN=${pollWin} 達標 (${targetCount}次確認)！繼續觀察 BAL 結算...`);
                                    frameQueue.length = 0;
                                }
                            }
                        } else if (pollWin !== '' && !isNaN(parsedWin) && parsedWin === 0) {
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
                            zeroCount = 0;
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
                        if (!balanceROI) {
                            isDone = true;
                            await mergeWinData('WIN_POLL_NO_BAL');
                            clearInterval(captureTimer);
                            return;
                        }
                        const pollBal = await cropAndOCR(pollCanvas, balanceROI, w, balDecimalPlaces ?? ocrDecimalPlaces ?? 2, 'BALANCE-POLL');
                        if (pollBal && parseFloat(pollBal) > 0) {
                            isDone = true;
                            await mergeWinData('WIN_POLL');
                            clearInterval(captureTimer);
                            return;
                        }
                    }
                } catch (e) { console.error("WIN Poll error:", e); }
            }
        }

        if (!isDone && !hasOutput) {
            setTimeout(consumeNext, 10);
        }
    };

    consumeNext();
}
