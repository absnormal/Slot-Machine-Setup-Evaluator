import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useAutoPlay — 自動遊玩 Hook (v3)
 *
 * 流程：
 *   點擊 SPIN → 等轉輪停止（新候選幀出現）→ 等 OCR 完成 → 記錄結果
 *   → smartDedup 重新標記 → 等 React 更新 → 讀取實際局數判斷是否達標
 *   → 等待指定延遲 → 下一局
 *
 * SPIN 間隔延遲時間軸：
 *   [結果記錄完成 + smartDedup 完成] ──延遲──→ [點擊 SPIN]
 *   也就是「上一局處理完畢」到「下一局點擊」之間的等待時間。
 */

const GameState = {
    IDLE: 'idle',
    CLICKING_SPIN: 'clicking_spin',
    WAITING_SPIN: 'waiting_spin',
    SPINNING: 'spinning',
    WAITING_RESULT: 'waiting_result',
    RECORDING: 'recording',
    PAUSED: 'paused',
    STOPPED: 'stopped',
    ERROR: 'error',
};

export function useAutoPlay() {
    // ── 狀態 ──
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [gameState, setGameState] = useState(GameState.IDLE);
    const [spinCount, setSpinCount] = useState(0);
    const [stats, setStats] = useState({
        totalSpins: 0,
        totalWin: 0,
        totalBet: 0,
        startBalance: 0,
        currentBalance: 0,
        maxWin: 0,
        hitCount: 0,
    });
    const [logs, setLogs] = useState([]);
    const [error, setError] = useState(null);

    const [config, setConfig] = useState({
        targetSpins: 100,
        spinROI: null,
        spinInterval: 1500,     // 上一局完成 → 下一局點擊 SPIN 的間隔 (ms)
    });

    // ── Refs ──
    const cancelRef = useRef(false);
    const configRef = useRef(config);
    const statsRef = useRef(stats);
    const isPausedRef = useRef(false);

    useEffect(() => { configRef.current = config; }, [config]);
    useEffect(() => { statsRef.current = stats; }, [stats]);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

    /**
     * 向 Python 後端發送控制指令
     */
    const sendCommand = useCallback((ws, command) => {
        return new Promise((resolve, reject) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket 未連線'));
                return;
            }
            try {
                const requestId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                const payload = { ...command, requestId };

                const onMessage = (event) => {
                    if (typeof event.data === 'string') {
                        try {
                            const msg = JSON.parse(event.data);
                            if (msg.type === 'control_result' && msg.requestId === requestId) {
                                ws.removeEventListener('message', onMessage);
                                if (msg.success) resolve(msg);
                                else reject(new Error(msg.message));
                            }
                        } catch { /* 非 JSON */ }
                    }
                };
                ws.addEventListener('message', onMessage);
                ws.send(JSON.stringify(payload));

                setTimeout(() => {
                    ws.removeEventListener('message', onMessage);
                    resolve({ success: true, message: 'timeout - assumed ok' });
                }, 10000);  // OCR 可能耗時較久，加長超時
            } catch (e) {
                reject(e);
            }
        });
    }, []);

    /**
     * 後端批次 OCR：透過 Python 伺服器截取當前畫面並 OCR 多個 ROI
     * 只在 nativeMode (P5) 下使用，繞過瀏覽器端的 winPollAgent + Tesseract
     * @returns {Object} { win, balance, bet, orderId, ... }
     */
    const requestBackendOCR = useCallback(async (ws, ocrRois) => {
        if (!ws || ws.readyState !== WebSocket.OPEN || !ocrRois?.length) return null;
        try {
            const result = await sendCommand(ws, {
                action: 'ocr_rois',
                rois: ocrRois,
            });
            return result?.ocrResults || null;
        } catch (e) {
            console.warn('[AutoPlay] 後端 OCR 失敗:', e);
            return null;
        }
    }, [sendCommand]);

    const clickSpin = useCallback(async (ws) => {
        const cfg = configRef.current;
        if (!cfg.spinROI) throw new Error('未設定 SPIN 按鈕位置');
        await sendCommand(ws, { action: 'click_roi', roi: cfg.spinROI });
    }, [sendCommand]);

    /**
     * 等待新的候選幀出現
     */
    const waitForNewCandidate = useCallback((currentCount, getCandidates, timeoutMs = 45000) => {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const check = () => {
                if (cancelRef.current) { reject(new Error('cancelled')); return; }
                const candidates = getCandidates();
                if (candidates.length > currentCount) {
                    resolve(candidates[candidates.length - 1]);
                    return;
                }
                if (Date.now() - startTime > timeoutMs) {
                    reject(new Error(`等待停輪超時 (${timeoutMs / 1000}s)`));
                    return;
                }
                setTimeout(check, 200);
            };
            check();
        });
    }, []);

    /**
     * 等待候選幀的 OCR 真正完成
     * 
     * 判定邏輯：
     *   1. ocrData 必須存在且 win 不是空字串
     *   2. winPollStatus 必須進入終態（不存在 = 沒開 WIN tracker → 直接過）
     *      - 'polling' → 還在追蹤，繼續等
     *      - 'completed' / 'forced_with_data' / 'forced_empty' → 完成
     */
    const waitForOCR = useCallback((candidateId, getCandidates, timeoutMs = 20000) => {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const check = () => {
                if (cancelRef.current) { resolve(null); return; }
                const candidates = getCandidates();
                const target = candidates.find(c => c.id === candidateId);

                if (!target) {
                    setTimeout(check, 300);
                    return;
                }

                // 條件 1：初始 OCR 已寫入（win 欄位存在且非空）
                const hasOcrData = target.ocrData
                    && target.ocrData.win !== undefined
                    && target.ocrData.win !== '';

                // 條件 2：WIN 追蹤特工已完成（或根本沒啟動）
                const winPollDone = !target.winPollStatus  // 沒開 WIN tracker
                    || target.winPollStatus === 'completed'
                    || target.winPollStatus === 'forced_with_data'
                    || target.winPollStatus === 'forced_empty';

                if (hasOcrData && winPollDone) {
                    resolve(target);
                    return;
                }
                if (Date.now() - startTime > timeoutMs) {
                    console.warn(`[AutoPlay] OCR 等待超時 (${timeoutMs/1000}s)，使用現有資料`, {
                        id: candidateId,
                        hasOcrData,
                        winPollStatus: target.winPollStatus,
                    });
                    resolve(target);
                    return;
                }
                setTimeout(check, 300);
            };
            check();
        });
    }, []);

    /**
     * 等待 smartDedup 標記完成，再計算實際局數
     * 
     * 輪詢機制：smartDedup 呼叫 setCandidates → React 更新 → candidatesRef 同步
     * 我們等到「最新候選幀有 spinGroupId」才算標記完成。
     */
    const getSpinGroupCount = useCallback((getCandidates) => {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const maxWait = 3000; // 最多等 3 秒

            const poll = () => {
                const candidates = getCandidates();
                if (candidates.length === 0) { resolve(0); return; }

                // 檢查最新的候選幀是否已被 smartDedup 標記
                const latest = candidates[candidates.length - 1];
                const isMarked = latest.spinGroupId !== undefined;

                if (isMarked) {
                    const groupIds = new Set(candidates.map(c => c.spinGroupId));
                    resolve(groupIds.size);
                    return;
                }

                if (Date.now() - startTime > maxWait) {
                    // 超時 fallback：用候選幀數量
                    console.warn('[AutoPlay] smartDedup 標記等待超時，使用候選幀數量');
                    resolve(candidates.length);
                    return;
                }

                setTimeout(poll, 150);
            };
            // 先等一個 tick 讓 React 更新
            setTimeout(poll, 100);
        });
    }, []);

    /**
     * 記錄一筆 spin 結果
     */
    const recordSpin = useCallback((candidate, logIndex) => {
        const win = parseFloat(candidate?.ocrData?.win) || 0;
        const bet = parseFloat(candidate?.ocrData?.bet) || 0;
        const balance = parseFloat(candidate?.ocrData?.balance) || 0;

        setStats(prev => {
            const updated = {
                ...prev,
                totalSpins: prev.totalSpins + 1,
                totalWin: prev.totalWin + win,
                totalBet: prev.totalBet + bet,
                currentBalance: balance || prev.currentBalance,
                maxWin: Math.max(prev.maxWin, win),
                hitCount: win > 0 ? prev.hitCount + 1 : prev.hitCount,
            };
            if (prev.totalSpins === 0 && balance > 0) {
                updated.startBalance = balance + bet - win;
            }
            return updated;
        });

        setLogs(prev => [{
            spin: logIndex,
            time: new Date().toLocaleTimeString(),
            win, bet, balance,
            candidateId: candidate?.id,
        }, ...prev].slice(0, 500));
        setSpinCount(prev => prev + 1);
    }, []);

    const addLog = useCallback((message) => {
        setLogs(prev => [{ spin: '-', time: new Date().toLocaleTimeString(), message }, ...prev].slice(0, 500));
    }, []);

    /**
     * 主遊玩循環
     * @param {WebSocket} ws
     * @param {Function} getCandidates
     * @param {Function} onSmartDedup - 每次 SPIN 完成後呼叫，重新標記局數
     * @param {Object} opts - { ocrRois, useBackendOCR }
     */
    const playLoop = useCallback(async (ws, getCandidates, onSmartDedup, opts = {}) => {
        const { ocrRois, useBackendOCR } = opts;
        let loopSpinCount = 0;

        while (!cancelRef.current) {
            // 檢查暫停
            while (isPausedRef.current && !cancelRef.current) {
                setGameState(GameState.PAUSED);
                await new Promise(r => setTimeout(r, 500));
            }
            if (cancelRef.current) break;

            try {
                // 1. 記錄當前候選幀數量
                const beforeCount = getCandidates().length;
                loopSpinCount++;

                // 2. 點擊 SPIN
                setGameState(GameState.CLICKING_SPIN);
                await clickSpin(ws);

                // 3. 等待新候選幀（停輪偵測）
                setGameState(GameState.SPINNING);
                const newCandidate = await waitForNewCandidate(beforeCount, getCandidates, 45000);

                // 4. OCR：後端模式 vs 前端模式
                setGameState(GameState.WAITING_RESULT);
                let finalCandidate;

                if (useBackendOCR && ocrRois?.length) {
                    // ★ 後端快速路徑：Python 截圖 + 原生 PaddleOCR
                    // 等 1 秒讓 WIN 動畫結束
                    await new Promise(r => setTimeout(r, 1000));
                    const ocrResults = await requestBackendOCR(ws, ocrRois);

                    if (ocrResults) {
                        // 將後端 OCR 結果寫回 candidate
                        const candidates = getCandidates();
                        const target = candidates.find(c => c.id === newCandidate.id);
                        if (target) {
                            target.ocrData = {
                                ...target.ocrData,
                                win: ocrResults.win || '0',
                                balance: ocrResults.balance || '',
                                bet: ocrResults.bet || '',
                                orderId: ocrResults.orderId || '',
                            };
                            target.winPollStatus = 'completed';
                        }
                        finalCandidate = target || newCandidate;
                        console.log(`[AutoPlay] 後端 OCR 完成:`, ocrResults);
                    } else {
                        // 後端失敗，回退到前端
                        finalCandidate = await waitForOCR(newCandidate.id, getCandidates, 15000);
                    }
                } else {
                    // 前端模式（原流程）
                    finalCandidate = await waitForOCR(newCandidate.id, getCandidates, 15000);
                }

                // 5. 記錄結果
                setGameState(GameState.RECORDING);
                recordSpin(finalCandidate, loopSpinCount);

                // 6. 執行 smartDedup 重新標記局數
                if (onSmartDedup) {
                    try { onSmartDedup(); } catch (e) { console.warn('[AutoPlay] smartDedup error:', e); }
                }

                // 7. 等待 smartDedup 完成，讀取實際局數判斷是否達標
                const cfg = configRef.current;
                if (cfg.targetSpins > 0) {
                    const actualSpins = await getSpinGroupCount(getCandidates);
                    if (actualSpins >= cfg.targetSpins) {
                        addLog(`🏁 已達目標轉數 (${actualSpins}/${cfg.targetSpins} 局)，自動停止`);
                        break;
                    }
                }

                // 8. SPIN 間隔延遲（上一局完成 → 下一局 SPIN 點擊）
                setGameState(GameState.WAITING_SPIN);
                await new Promise(r => setTimeout(r, cfg.spinInterval));

            } catch (err) {
                if (err.message === 'cancelled') break;
                console.error('[AutoPlay] 循環錯誤:', err);
                setError(err.message);
                setGameState(GameState.ERROR);
                addLog(`❌ 錯誤: ${err.message}`);
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        setGameState(GameState.STOPPED);
        setIsPlaying(false);
        addLog('⏹ 自動遊玩已停止');
    }, [clickSpin, waitForNewCandidate, waitForOCR, recordSpin, addLog, getSpinGroupCount, requestBackendOCR]);

    /**
     * 開始自動遊玩
     */
    const startAutoPlay = useCallback((ws, getCandidates, opts = {}) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            setError('WebSocket 未連線，請先啟動擷取伺服器並開始串流');
            return false;
        }
        if (!configRef.current.spinROI) {
            setError('請先設定 SPIN 按鈕的 ROI 位置');
            return false;
        }

        cancelRef.current = false;
        setIsPlaying(true);
        setIsPaused(false);
        setError(null);
        setGameState(GameState.IDLE);
        addLog('▶ 自動遊玩開始');

        // ★ 自動開啟即時偵測
        if (opts.onStartLive) opts.onStartLive();

        // 啟動遊玩循環（結束後自動關閉即時偵測）
        playLoop(ws, getCandidates, opts.onSmartDedup, {
            ocrRois: opts.ocrRois,
            useBackendOCR: !!opts.ocrRois?.length,
        }).then(() => {
            if (opts.onStopLive) opts.onStopLive();
        });
        return true;
    }, [playLoop, addLog]);

    const togglePause = useCallback(() => {
        setIsPaused(prev => {
            const next = !prev;
            addLog(next ? '⏸ 已暫停' : '▶ 已恢復');
            return next;
        });
    }, [addLog]);

    const stopAutoPlay = useCallback(() => {
        cancelRef.current = true;
        setIsPlaying(false);
        setIsPaused(false);
    }, []);

    const resetStats = useCallback(() => {
        setSpinCount(0);
        setStats({ totalSpins: 0, totalWin: 0, totalBet: 0, startBalance: 0, currentBalance: 0, maxWin: 0, hitCount: 0 });
        setLogs([]);
        setError(null);
    }, []);

    const updateConfig = useCallback((partial) => {
        setConfig(prev => ({ ...prev, ...partial }));
    }, []);

    useEffect(() => {
        return () => { cancelRef.current = true; };
    }, []);

    return {
        isPlaying, isPaused, gameState, spinCount,
        stats, logs, error, config,
        startAutoPlay, stopAutoPlay, togglePause,
        resetStats, updateConfig,
        sendCommand, GameState,
    };
}
