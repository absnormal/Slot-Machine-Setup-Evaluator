import { useState, useEffect, useCallback, useRef } from 'react';
import usePhase4Store from '../stores/usePhase4Store';

/**
 * usePhaseTransfer — 跨 Phase 資料傳遞 Hook
 *
 * 從 App.jsx 抽離的職責：
 * 1. 辨識觸發器（handleRecognizeBatch / handleRecognizeLocalBatch / recognizeLocalSingle）
 * 2. Phase 4 → Phase 3 傳送（handleTransferPhase4ToPhase3）
 * 3. Session 匯入（handleImportSession + sessionProgress）
 * 4. Vision 結算狀態（visionCalcResults / visionBetInput + useEffect）
 * 5. Phase 3 ↔ Phase 2 盤面傳遞（handleTransferVisionToManual / handleReturnToVision）
 * 6. Phase 3 → Phase 4 存回（handleSaveVisionToPhase4）
 */
export function usePhaseTransfer({
    template,
    autoRecognition,
    keyframeExtractor,
    reportGenerator,
    cloudInstance,
    templateIO,
    showToast,
    setTemplateMessage,
    setTemplateError,
    // Vision hooks
    setVisionImages,
    setActiveVisionId,
    setVisionP1, setVisionP1Mult, setVisionP1Bet,
    setHasBetBox,
    activeVisionImg,
    activeVisionId,
    visionGrid,
    // Phase 2 hooks
    setPanelGrid, setBetInput, betInput, panelGrid,
    computeGridResultsCb,
    // UI state
    setIsPhase2Minimized, setIsPhase3Minimized, setIsPhase4Minimized,
    // Template state
    hasMultiplierReel, gameName,
    ocrDecimalPlaces,
}) {
    // --- 內部 refs ---
    const candidatesRef = useRef([]);
    candidatesRef.current = keyframeExtractor.candidates;

    // --- Session 進度狀態 ---
    const [sessionProgress, setSessionProgress] = useState(null);

    // --- ROIs (直接從 Zustand Store 讀取) ---
    const reelROI = usePhase4Store(s => s.reelROI);
    const winROI = usePhase4Store(s => s.winROI);
    const balanceROI = usePhase4Store(s => s.balanceROI);
    const betROI = usePhase4Store(s => s.betROI);
    const orderIdROI = usePhase4Store(s => s.orderIdROI);
    const multiplierROI = usePhase4Store(s => s.multiplierROI);

    // ========================
    // 1. 辨識觸發器
    // ========================
    const handleRecognizeBatch = useCallback((decimalPlaces) => {
        const rois = { reelROI, winROI, balanceROI, betROI, orderIdROI, multiplierROI };
        autoRecognition.recognizeBatch(
            keyframeExtractor.candidates,
            keyframeExtractor.updateCandidate,
            rois,
            decimalPlaces ?? ocrDecimalPlaces
        );
    }, [autoRecognition, keyframeExtractor, reelROI, winROI, balanceROI, betROI, orderIdROI, multiplierROI, ocrDecimalPlaces]);

    const handleRecognizeLocalBatch = useCallback((decimalPlaces, specificCandidates = null) => {
        const rois = { reelROI, winROI, balanceROI, betROI, orderIdROI, multiplierROI };
        autoRecognition.recognizeLocalBatch(
            specificCandidates || keyframeExtractor.candidates,
            keyframeExtractor.updateCandidate,
            rois,
            decimalPlaces ?? ocrDecimalPlaces
        );
    }, [autoRecognition, keyframeExtractor, reelROI, winROI, balanceROI, betROI, orderIdROI, multiplierROI, ocrDecimalPlaces]);

    // P5 用：單張候選幀本機辨識（接收 candidateId，用 ref 取最新 candidates 避免閉包過期）
    const recognizeLocalSingle = useCallback(async (candidateId) => {
        const kf = candidatesRef.current.find(c => c.id === candidateId);
        if (!kf) {
            console.warn('[recognizeLocalSingle] 找不到候選幀', candidateId, 'candidates:', candidatesRef.current.length);
            return;
        }
        const rois = { reelROI, winROI, balanceROI, betROI, orderIdROI, multiplierROI };
        await autoRecognition.recognizeLocalBatch(
            [kf],
            keyframeExtractor.updateCandidate,
            rois,
            ocrDecimalPlaces
        );
    }, [autoRecognition, keyframeExtractor.updateCandidate, reelROI, winROI, balanceROI, betROI, orderIdROI, multiplierROI, ocrDecimalPlaces]);

    // ========================
    // 2. Phase 4 → Phase 3 傳送
    // ========================
    const handleTransferPhase4ToPhase3 = useCallback(async (specificCandidates) => {
        const kfCandidates = specificCandidates || keyframeExtractor.candidates;
        if (kfCandidates.length === 0) return;

        const transformed = await Promise.all(kfCandidates.map(kf => {
            return new Promise((resolve) => {
                // 盤面辨識一律用停輪幀（WIN 截圖有特效干擾）
                const targetCanvas = kf.canvas;
                const dataUrl = targetCanvas.toDataURL('image/jpeg', 0.8);
                const img = new Image();
                img.onload = () => {
                    resolve({
                        id: `${kf.id}_stop`,
                        file: { name: `Spin-${kf.time.toFixed(1)}s-Stop` },
                        previewUrl: dataUrl,
                        obj: img,
                        grid: kf.recognitionResult?.grid || null,
                        bet: kf.recognitionResult?.betValue || null,
                        multiplier: kf.recognitionResult?.multiplier || null,
                        error: ''
                    });
                };
                img.src = dataUrl;
            });
        }));

        setVisionP1({ ...reelROI });
        setVisionP1Bet({ ...betROI });
        if (template?.hasMultiplierReel || hasMultiplierReel) setVisionP1Mult({ ...multiplierROI });
        setHasBetBox(true);
        setVisionImages(prev => [...prev, ...transformed]);
        setIsPhase4Minimized(true);
        setIsPhase3Minimized(false);
        setTemplateMessage(`✅ 已從影片匯入 ${kfCandidates.length} 張關鍵幀至 Phase 3`);

        if (transformed.length > 0) setActiveVisionId(transformed[0].id);
    }, [keyframeExtractor.candidates, setVisionImages, setTemplateMessage, setActiveVisionId, reelROI, betROI, multiplierROI, template, hasMultiplierReel, setVisionP1, setVisionP1Mult, setVisionP1Bet, setHasBetBox, setIsPhase4Minimized, setIsPhase3Minimized]);

    // ========================
    // 3. Session 匯入
    // ========================
    const handleImportSession = useCallback(async () => {
        const startTime = Date.now();
        setSessionProgress({ type: 'import', phase: '選擇資料夾...', current: 0, total: 0, detail: '', startTime });
        const result = await reportGenerator.importSession((prog) => {
            setSessionProgress(prev => ({ ...prev, ...prog }));
        });
        setSessionProgress(null);
        if (result && result.candidates && result.candidates.length > 0) {
            // 匯入 ROI 座標（若 JSON 中有記錄）
            if (result.rois) {
                const store = usePhase4Store.getState();
                if (result.rois.reel) store.setReelROI(result.rois.reel);
                if (result.rois.win) store.setWinROI(result.rois.win);
                if (result.rois.balance) store.setBalanceROI(result.rois.balance);
                if (result.rois.bet) store.setBetROI(result.rois.bet);
                if (result.rois.orderId) store.setOrderIdROI(result.rois.orderId);
                if (result.rois.multiplier) store.setMultiplierROI(result.rois.multiplier);
            }
            // 若遊戲無乘倍輪，清除匯入資料中殘留的 multiplier key
            const showMult = template?.hasMultiplierReel || hasMultiplierReel;
            const cleaned = showMult ? result.candidates : result.candidates.map(c => {
                if (c.ocrData && 'multiplier' in c.ocrData) {
                    const { multiplier, ...rest } = c.ocrData;
                    return { ...c, ocrData: rest };
                }
                return c;
            });
            keyframeExtractor.setCandidates(prev => [...prev, ...cleaned]);
            setTemplateMessage(`✅ 已匯入 ${cleaned.length} 張歷史關鍵幀${result.rois ? ' (含 ROI 座標)' : ''}`);

            // ── 自動從資料夾名稱比對雲端模板並載入 ──
            if (result.folderName) {
                try {
                    // 解析資料夾名稱：Session_YYYYMMDD_HHMMSS_{gameName}
                    const folderMatch = result.folderName.match(/^Session_\d{8}_\d{6}_(.+)$/);

                    if (folderMatch) {
                        const extractedGameName = folderMatch[1].trim();

                        // 若當前已有模板且遊戲名相同，跳過自動載入
                        const currentGameName = (gameName || template?.name || '').trim();
                        if (template && currentGameName.toUpperCase() === extractedGameName.toUpperCase()) {
                            // 已有對應模板，不需重複載入
                        } else {
                            // 取得雲端模板列表：React state → sessionStorage → 遠端拉取
                            let templates = cloudInstance.cloudTemplates;
                            if (!templates || templates.length === 0) {
                                try {
                                    const cached = sessionStorage.getItem('slot_templates_cache');
                                    if (cached) templates = JSON.parse(cached);
                                } catch (e) {}
                            }
                            if (!templates || templates.length === 0) {
                                // 快取也沒有，等待遠端拉取完成後從 sessionStorage 讀取
                                await cloudInstance.fetchCloudTemplates();
                                try {
                                    const cached = sessionStorage.getItem('slot_templates_cache');
                                    if (cached) templates = JSON.parse(cached);
                                } catch (e) {}
                            }



                            if (templates && templates.length > 0) {
                                const upperName = extractedGameName.toUpperCase();
                                // 優先完全匹配 gameName
                                let match = templates.find(t =>
                                    (t.gameName || '').trim().toUpperCase() === upperName
                                );
                                // 次選：模板名或遊戲名包含目標字串
                                if (!match) {
                                    match = templates.find(t =>
                                        (t.gameName || '').trim().toUpperCase().includes(upperName) ||
                                        upperName.includes((t.gameName || '').trim().toUpperCase())
                                    );
                                }



                                if (match) {
                                    setTemplateMessage(`☁️ 正在自動載入雲端模板：${match.name || match.gameName}...`);
                                    await templateIO.loadCloudTemplate(match);
                                } else {
                                    setTimeout(() => {
                                        setTemplateMessage(`ℹ️ 未找到遊戲「${extractedGameName}」的雲端模板，請手動載入`);
                                    }, 2000);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[AutoTemplate] 自動載入模板失敗（不影響匯入結果）', e);
                }
            }

            return result.dirHandle;
        }
        return null;
    }, [reportGenerator, keyframeExtractor, setTemplateMessage, template, hasMultiplierReel, gameName, cloudInstance, templateIO]);

    // ========================
    // 4. Vision 結算狀態
    // ========================
    const [visionCalcResults, setVisionCalcResults] = useState(null);
    const [visionCalculateError, setVisionCalculateError] = useState('');
    const [visionBetInput, setVisionBetInput] = useState(100);

    useEffect(() => {
        if (activeVisionImg && typeof activeVisionImg.bet === 'number') {
            setVisionBetInput(activeVisionImg.bet);
        }
    }, [activeVisionId, activeVisionImg]);

    const handleVisionBetInputChange = useCallback((newBet) => {
        setVisionBetInput(newBet);
        if (activeVisionId) {
            setVisionImages(prev => prev.map(img =>
                img.id === activeVisionId ? { ...img, bet: newBet } : img
            ));
        }
    }, [activeVisionId, setVisionImages]);

    useEffect(() => {
        if (!visionGrid) {
            setVisionCalcResults(null);
            setVisionCalculateError('');
            return;
        }

        let multVal = null;
        if (template?.hasMultiplierReel && activeVisionImg?.multiplier) {
            multVal = parseFloat(activeVisionImg.multiplier.replace(/[^0-9.]/g, '')) || 1;
        }

        const { results, error } = computeGridResultsCb(visionGrid, visionBetInput, multVal);
        setVisionCalcResults(results);
        setVisionCalculateError(error);
    }, [visionGrid, visionBetInput, computeGridResultsCb, activeVisionImg, template]);

    // ========================
    // 5. Phase 3 ↔ Phase 2 盤面傳遞
    // ========================
    const handleTransferVisionToManual = useCallback(() => {
        if (!activeVisionImg || !activeVisionImg.grid) {
            setIsPhase3Minimized(true);
            setIsPhase2Minimized(false);
            return;
        }
        const newGrid = activeVisionImg.grid.map(row => [...row]);
        setPanelGrid(newGrid);
        setBetInput(visionBetInput);
        setIsPhase3Minimized(true);
        setIsPhase2Minimized(false);
        showToast('✅ 已將 AI 辨識盤面及押注狀態同步傳送至 Phase 2 手動區');
    }, [activeVisionImg, visionBetInput, setPanelGrid, setBetInput, setIsPhase3Minimized, setIsPhase2Minimized, showToast]);

    const handleReturnToVision = useCallback(() => {
        if (activeVisionId) {
            const newGrid = panelGrid.map(row => [...row]);
            setVisionImages(prev => prev.map(img =>
                img.id === activeVisionId ? { ...img, grid: newGrid } : img
            ));
            setVisionBetInput(betInput);
            showToast('✅ 已將手動盤面存回目前 AI 截圖 (Phase 3)');
        }
        setIsPhase2Minimized(true);
        setIsPhase3Minimized(false);
    }, [activeVisionId, panelGrid, betInput, setVisionImages, setIsPhase2Minimized, setIsPhase3Minimized, showToast]);

    // ========================
    // 6. Phase 3 → Phase 4 存回
    // ========================
    const handleSaveVisionToPhase4 = useCallback(() => {
        if (!activeVisionImg || !activeVisionImg.grid || !visionCalcResults) return;
        const originalId = activeVisionId.replace(/_(win|stop)$/, '');

        keyframeExtractor.setCandidates(prev => prev.map(c => {
            if (c.id === originalId) {
                const prevRR = c.recognitionResult || {};
                const prevOverrides = c.manualOverrides || {};
                const newTotalWin = visionCalcResults.totalWin;
                return {
                    ...c,
                    recognitionResult: {
                        ...prevRR,
                        grid: activeVisionImg.grid,
                        totalWin: newTotalWin,
                        expectedWin: newTotalWin,           // 同步更新比對基準
                        settlement: visionCalcResults,       // 同步更新結算明細
                        details: visionCalcResults.details,
                        rawText: activeVisionImg.rawText || (prevRR.rawText || '')
                    },
                    manualOverrides: {
                        ...prevOverrides,
                        grid: true
                    },
                    status: 'recognized'
                };
            }
            return c;
        }));

        showToast('✅ 已將人工修正盤面儲存回 Phase 4 原卡片！');
        setIsPhase3Minimized(true);
        setIsPhase4Minimized(false);
    }, [activeVisionImg, activeVisionId, visionCalcResults, keyframeExtractor.setCandidates, showToast, setIsPhase3Minimized, setIsPhase4Minimized]);

    // ========================
    // Return
    // ========================
    return {
        handleRecognizeBatch,
        handleRecognizeLocalBatch,
        recognizeLocalSingle,
        handleTransferPhase4ToPhase3,
        handleImportSession,
        visionCalcResults,
        visionCalculateError,
        visionBetInput,
        handleVisionBetInputChange,
        handleTransferVisionToManual,
        handleReturnToVision,
        handleSaveVisionToPhase4,
        sessionProgress,
        setSessionProgress,
    };
}
