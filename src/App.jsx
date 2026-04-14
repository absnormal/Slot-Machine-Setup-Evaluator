import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { apiKey } from './utils/constants';
import { computeGridResults } from './engine/computeGridResults';

import AppHeader from './components/AppHeader';
import ToastMessage from './components/ToastMessage';
import SettingsModal from './components/SettingsModal';
import CloudModal from './components/CloudModal';
import ErrorBoundary from './components/ErrorBoundary';
import Phase1Setup from './components/Phase1Setup';
import Phase2Manual from './components/Phase2Manual';
import Phase3Vision from './components/Phase3Vision';
import Phase4Video from './components/Phase4Video';

// Modals (從 App.jsx 抽離)
import PtConfirmModal from './components/modals/PtConfirmModal';
import BuildErrorModal from './components/modals/BuildErrorModal';
import PtCropModal from './components/modals/PtCropModal';
import OverwriteConfirmModal from './components/modals/OverwriteConfirmModal';

// Hooks
import { useCloud } from './hooks/useCloud';
import { useGeminiVision } from './hooks/useGeminiVision';
import { useTemplateBuilder } from './hooks/useTemplateBuilder';
import { useSlotEngine } from './hooks/useSlotEngine';
import { useKeyframeExtractor } from './hooks/useKeyframeExtractor';
import { useAutoRecognition } from './hooks/useAutoRecognition';
import { useReportGenerator } from './hooks/useReportGenerator';
import { useTemplateIO } from './hooks/useTemplateIO';
import useAppStore from './stores/useAppStore';

function App() {
    // --- Zustand Store ---
    const customApiKey = useAppStore(s => s.customApiKey);
    const setCustomApiKey = useAppStore(s => s.setCustomApiKey);
    const showSettingsModal = useAppStore(s => s.showSettingsModal);
    const setShowSettingsModal = useAppStore(s => s.setShowSettingsModal);

    const isTemplateMinimized = useAppStore(s => s.isTemplateMinimized);
    const isPhase2Minimized = useAppStore(s => s.isPhase2Minimized);
    const isPhase3Minimized = useAppStore(s => s.isPhase3Minimized);
    const isPhase4Minimized = useAppStore(s => s.isPhase4Minimized);
    const setIsTemplateMinimized = useAppStore(s => s.setIsTemplateMinimized);
    const setIsPhase2Minimized = useAppStore(s => s.setIsPhase2Minimized);
    const setIsPhase3Minimized = useAppStore(s => s.setIsPhase3Minimized);
    const setIsPhase4Minimized = useAppStore(s => s.setIsPhase4Minimized);
    const handlePhaseToggle = useAppStore(s => s.handlePhaseToggle);

    const templateMessage = useAppStore(s => s.templateMessage);
    const setTemplateMessage = useAppStore(s => s.setTemplateMessage);

    const totalBalance = useAppStore(s => s.totalBalance);
    const setTotalBalance = useAppStore(s => s.setTotalBalance);
    const isBalanceExpanded = useAppStore(s => s.isBalanceExpanded);
    const setIsBalanceExpanded = useAppStore(s => s.setIsBalanceExpanded);

    const showCloudModal = useAppStore(s => s.showCloudModal);
    const setShowCloudModal = useAppStore(s => s.setShowCloudModal);

    const isDarkMode = useAppStore(s => s.isDarkMode);
    const setIsDarkMode = useAppStore(s => s.setIsDarkMode);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark-theme-active');
        } else {
            document.documentElement.classList.remove('dark-theme-active');
        }
    }, [isDarkMode]);

    // --- Google Sheets 雲端 ---
    const cloudInstance = useCloud();
    const {
        cloudTemplates, isLoadingCloud, isBackgroundSyncing,
        isSaving, deletingId, setDeletingId, downloadingId,
        cloudError, setCloudError,
        cloudMessage,
        fetchCloudTemplates, handleForceRefreshCloud, handleDeleteTemplate
    } = cloudInstance;

    const [linesMode, setLinesMode] = useState('image');

    // --- Template Builder ---
    const templateBuilder = useTemplateBuilder({
        customApiKey, apiKey, setTemplateMessage,
        setIsPhase2Minimized, setIsPhase3Minimized, setIsTemplateMinimized,
        isTemplateMinimized, linesMode
    });

    const {
        lineMode, setLineMode, linesTextInput, setLinesTextInput,
        paytableMode, setPaytableMode, paytableInput, setPaytableInput,
        template, setTemplate, templateError, setTemplateError,
        buildErrorMsg, setBuildErrorMsg, jpConfig, setJpConfig,
        hasJackpot, setHasJackpot, hasMultiplierReel, setHasMultiplierReel,
        requiresCollectToWin, setRequiresCollectToWin,
        hasCashCollectFeature, setHasCashCollectFeature,
        hasDoubleSymbol, setHasDoubleSymbol,
        hasDynamicMultiplier, setHasDynamicMultiplier,
        multiplierCalcType, setMultiplierCalcType,
        lineImages, setLineImages, activeLineImageId, setActiveLineImageId,
        activeLineImage, imageSrc, imageObj,
        patternRows, setPatternRows, patternCols, setPatternCols,
        gridRows, setGridRows, gridCols, setGridCols,
        threshold, setThreshold, startIndex, setStartIndex,
        p1, setP1, pEnd, setPEnd, extractResults, setExtractResults,
        dragState, setDragState, canvasRef, containerRef, layoutStyle, canvasSize,
        linesTabMode, setLinesTabMode,
        ptImages, setPtImages, isPtProcessing, setIsPtProcessing,
        ptResultItems, setPtResultItems, ptCropState, setPtCropState,
        ptEnlargedImg, setPtEnlargedImg, ptCropImageRef,
        handleLineImageUpload, removeLineImage, analyzeImage,
        handleMouseDown, handleMouseMove, handleMouseUp, draw,
        handlePaytableTextChange, handlePtTableChange, handlePtTableDelete, handleAddPtRow, handleRemoveThumb,
        handlePtFileChange, handlePtDrop, processPtFiles, removePtImage, clearPtAll, handlePtExtract,
        performAutoBuild, handleBuildTemplate, resetTemplateBuilder
    } = templateBuilder;


    // --- Phase 4 偵測參數（保留供 templateIO 使用）---
    const [motionCoverageMin, setMotionCoverageMin] = useState(60);
    const [vLineThreshold, setVLineThreshold] = useState(0.25);
    const [ocrDecimalPlaces, setOcrDecimalPlaces] = useState(2);

    // --- Template IO (匯入/匯出/雲端存取) ---
    const templateIO = useTemplateIO({
        setGridRows, setGridCols, setLineMode, setExtractResults,
        setPaytableInput, setPtResultItems, setPaytableMode,
        setJpConfig, setHasJackpot, setHasMultiplierReel,
        setRequiresCollectToWin, setHasCashCollectFeature, setHasDoubleSymbol,
        setHasDynamicMultiplier, setMultiplierCalcType,
        setLineImages, setActiveLineImageId, setLinesTextInput,
        setTemplateError,
        performAutoBuild, resetTemplateBuilder,
        useCloudInstance: cloudInstance,
        platformName: undefined, gameName: undefined,
        gridRows, gridCols, lineMode, extractResults,
        paytableInput, ptResultItems, jpConfig,
        hasJackpot, hasMultiplierReel, requiresCollectToWin, hasCashCollectFeature,
        hasDoubleSymbol, hasDynamicMultiplier, multiplierCalcType,
        motionCoverageMin, vLineThreshold, ocrDecimalPlaces,
        setMotionCoverageMin, setVLineThreshold, setOcrDecimalPlaces,
    });

    const {
        platformName, setPlatformName, gameName, setGameName,
        templateName, setTemplateName, defaultSaveName, localUserId,
        loadCloudTemplate, handleImportLocalTemplate, handleExportLocalTemplate,
        handleClearTemplate, handleSaveToCloud,
        showOverwriteConfirm, setShowOverwriteConfirm,
        pendingOverwriteData, activeSaveAction,
    } = templateIO;

    // --- Slot Engine (Phase 2) ---
    const {
        panelGrid, setPanelGrid, betInput, setBetInput,
        calcResults, setCalcResults, calculateError, setCalculateError,
        hoveredLineId, setHoveredLineId, showAllLines, setShowAllLines,
        panelInputMode, setPanelInputMode, activeBrush, setActiveBrush,
        showPtModal, setShowPtModal, availableSymbols,
        generateRandomPanelGrid, handleRandomizePanel, handleClearPanel,
        getSafeGrid, handleGridPaste, handleCellChange, computeGridResultsCb
    } = useSlotEngine({ template });

    // --- Phase 3 (AI 視覺批次辨識) ---
    const visionCanvasRef = useRef(null);
    const visionContainerRef = useRef(null);

    const {
        visionImages, activeVisionId, activeVisionImg, visionImageObj, visionImageSrc, visionGrid, visionError,
        isVisionProcessing, isVisionStopping, visionBatchProgress,
        setActiveVisionId, setVisionImages, handleVisionMouseDown, handleVisionMouseMove, handleVisionMouseUp,
        handleVisionImageUpload, removeVisionImage, performAIVisionBatchMatching, performLocalVisionBatchMatching, cancelVisionProcessing,
        goToPrevVisionImage, goToNextVisionImage,
        hasBetBox, setHasBetBox,
        setVisionP1, setVisionP1Bet
    } = useGeminiVision({
        template, availableSymbols, customApiKey, setTemplateMessage, setTemplateError,
        visionCanvasRef, isPhase3Minimized
    });

    // --- Phase 4 (影片智慧分析 — 新架構) ---
    const videoRef = useRef(null);
    const [videoSrc, setVideoSrc] = useState(null);
    const [isStreamMode, setIsStreamMode] = useState(false);
    const handleVideoUpload = useCallback((e) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        // 如果目前是串流模式，先清掉串流
        if (isStreamMode) {
            const stream = videoRef.current?.srcObject;
            if (stream) stream.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
            setIsStreamMode(false);
        }
        if (videoSrc && videoSrc !== '__stream__') URL.revokeObjectURL(videoSrc);
        const url = URL.createObjectURL(file);
        setVideoSrc(url);
        setTemplateMessage(`📽️ 已載入影片：${file.name}`);
        setTimeout(() => setTemplateMessage(''), 3000);
    }, [videoSrc, isStreamMode, setTemplateMessage]);

    const pendingStreamRef = useRef(null);
    const handleStartScreenCapture = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 30 } },
                audio: false
            });
            // 使用者按瀏覽器原生「停止分享」時自動清理
            stream.getVideoTracks()[0].onended = () => {
                handleStopScreenCapture();
            };
            // 如果目前有影片，先清掉
            if (videoSrc && videoSrc !== '__stream__') URL.revokeObjectURL(videoSrc);
            // 先暫存 stream，等 React 渲染出 <video> 後再用 useEffect 附加
            pendingStreamRef.current = stream;
            setVideoSrc('__stream__');
            setIsStreamMode(true);
            setTemplateMessage('🖥️ 螢幕擷取已開始');
            setTimeout(() => setTemplateMessage(''), 3000);
        } catch (err) {
            console.log('螢幕擷取已取消', err);
        }
    }, [videoSrc, setTemplateMessage]);

    // 當 isStreamMode 切為 true 且 video 元素已掛載，附加 srcObject
    useEffect(() => {
        if (isStreamMode && pendingStreamRef.current && videoRef.current) {
            videoRef.current.srcObject = pendingStreamRef.current;
            videoRef.current.play().catch(() => {});
            pendingStreamRef.current = null;
        }
    }, [isStreamMode]);

    const handleStopScreenCapture = useCallback(() => {
        const stream = videoRef.current?.srcObject;
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
        pendingStreamRef.current = null;
        setVideoSrc(null);
        setIsStreamMode(false);
        setTemplateMessage('🖥️ 螢幕擷取已結束');
        setTimeout(() => setTemplateMessage(''), 3000);
    }, [setTemplateMessage]);

    // ROI 狀態 (保留手動框選)
    const ROI_CACHE_KEY = 'SLOT_P4_ROI_V2';
    const loadCachedROI = (key, fallback) => {
        try { const saved = JSON.parse(localStorage.getItem(ROI_CACHE_KEY))?.[key]; return saved || fallback; } catch { return fallback; }
    };
    const [reelROI, setReelROIRaw] = useState(() => loadCachedROI('reel', { x: 10, y: 15, w: 80, h: 55 }));
    const [winROI, setWinROIRaw] = useState(() => loadCachedROI('win', { x: 38, y: 72, w: 24, h: 8 }));
    const [balanceROI, setBalanceROIRaw] = useState(() => loadCachedROI('balance', { x: 5, y: 90, w: 24, h: 6 }));
    const [betROI, setBetROIRaw] = useState(() => loadCachedROI('bet', { x: 70, y: 90, w: 24, h: 6 }));
    const [orderIdROI, setOrderIdROIRaw] = useState(() => loadCachedROI('orderId', { x: 40, y: 5, w: 20, h: 5 }));

    // ROI 持久化
    const saveROI = useCallback((key, val) => {
        try {
            const all = JSON.parse(localStorage.getItem(ROI_CACHE_KEY) || '{}');
            all[key] = val;
            localStorage.setItem(ROI_CACHE_KEY, JSON.stringify(all));
        } catch {}
    }, []);
    const setReelROI = useCallback((v) => { setReelROIRaw(v); saveROI('reel', v); }, [saveROI]);
    const setWinROI = useCallback((v) => { setWinROIRaw(v); saveROI('win', v); }, [saveROI]);
    const setBalanceROI = useCallback((v) => { setBalanceROIRaw(v); saveROI('balance', v); }, [saveROI]);
    const setBetROI = useCallback((v) => { setBetROIRaw(v); saveROI('bet', v); }, [saveROI]);
    const setOrderIdROI = useCallback((v) => { setOrderIdROIRaw(v); saveROI('orderId', v); }, [saveROI]);

    // 新 Phase 4 Hooks
    const keyframeExtractor = useKeyframeExtractor({ setTemplateMessage });
    const autoRecognition = useAutoRecognition({
        template, availableSymbols, customApiKey,
        setTemplateMessage, setTemplateError
    });
    const reportGenerator = useReportGenerator();

    // 統計數據
    const phase4Stats = useMemo(() => reportGenerator.computeStats(keyframeExtractor.candidates), [keyframeExtractor.candidates, reportGenerator]);

    // 辨識觸發器（封裝 updateCandidate + rois）
    const handleRecognizeBatch = useCallback((decimalPlaces) => {
        const rois = { reelROI, winROI, balanceROI, betROI, orderIdROI };
        autoRecognition.recognizeBatch(
            keyframeExtractor.candidates,
            keyframeExtractor.updateCandidate,
            rois,
            decimalPlaces ?? ocrDecimalPlaces
        );
    }, [autoRecognition, keyframeExtractor, reelROI, winROI, balanceROI, betROI, ocrDecimalPlaces]);

    const handleRecognizeLocalBatch = useCallback((decimalPlaces, specificCandidates = null) => {
        const rois = { reelROI, winROI, balanceROI, betROI, orderIdROI };
        autoRecognition.recognizeLocalBatch(
            specificCandidates || keyframeExtractor.candidates,
            keyframeExtractor.updateCandidate,
            rois,
            decimalPlaces ?? ocrDecimalPlaces
        );
    }, [autoRecognition, keyframeExtractor, reelROI, winROI, balanceROI, betROI, ocrDecimalPlaces]);

    // --- Phase 間數據傳遞 ---
    const handleTransferPhase4ToPhase3 = useCallback(async (specificCandidates) => {
        const kfCandidates = specificCandidates || keyframeExtractor.candidates;
        if (kfCandidates.length === 0) return;

        const transformed = await Promise.all(kfCandidates.map(kf => {
            return new Promise((resolve) => {
                const targetCanvas = kf.winPollCanvas || kf.canvas;
                const dataUrl = targetCanvas.toDataURL('image/jpeg', 0.8);
                const img = new Image();
                img.onload = () => {
                    resolve({
                        id: kf.id,
                        file: { name: `Spin-${kf.time.toFixed(1)}s` },
                        previewUrl: dataUrl,
                        obj: img,
                        grid: kf.recognitionResult?.grid || null,
                        bet: kf.recognitionResult?.betValue || null,
                        error: ''
                    });
                };
                img.src = dataUrl;
            });
        }));

        setVisionP1({ ...reelROI });
        setVisionP1Bet({ ...betROI });
        setHasBetBox(true);
        setVisionImages(prev => [...prev, ...transformed]);
        setIsPhase4Minimized(true);
        setIsPhase3Minimized(false);
        setTemplateMessage(`✅ 已從影片匯入 ${kfCandidates.length} 張關鍵幀至 Phase 3`);

        if (transformed.length > 0) setActiveVisionId(transformed[0].id);
    }, [keyframeExtractor.candidates, setVisionImages, setTemplateMessage, setActiveVisionId, reelROI, betROI, setVisionP1, setVisionP1Bet, setHasBetBox]);

    // --- 匯入歷史 Session ---
    const handleImportSession = useCallback(async () => {
        const imported = await reportGenerator.importSession();
        if (imported && imported.length > 0) {
            keyframeExtractor.setCandidates(prev => [...prev, ...imported]);
            setTemplateMessage(`✅ 已匯入 ${imported.length} 張歷史關鍵幀`);
        }
    }, [reportGenerator, keyframeExtractor, setTemplateMessage]);

    // --- Vision 結算 ---
    const [visionCalcResults, setVisionCalcResults] = useState(null);
    const [visionCalculateError, setVisionCalculateError] = useState('');
    const [visionBetInput, setVisionBetInput] = useState(100);

    useEffect(() => {
        if (activeVisionImg && typeof activeVisionImg.bet === 'number') {
            setVisionBetInput(activeVisionImg.bet);
        }
    }, [activeVisionId, activeVisionImg]);

    const handleVisionBetInputChange = (newBet) => {
        setVisionBetInput(newBet);
        if (activeVisionId) {
            setVisionImages(prev => prev.map(img =>
                img.id === activeVisionId ? { ...img, bet: newBet } : img
            ));
        }
    };

    useEffect(() => {
        if (!visionGrid) {
            setVisionCalcResults(null);
            setVisionCalculateError('');
            return;
        }
        const { results, error } = computeGridResultsCb(visionGrid, visionBetInput);
        setVisionCalcResults(results);
        setVisionCalculateError(error);
    }, [visionGrid, visionBetInput, computeGridResultsCb]);

    // --- 盤面傳遞 (Phase 3 ↔ Phase 2) ---
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
        setTemplateMessage('✅ 已將 AI 辨識盤面及押注狀態同步傳送至 Phase 2 手動區');
        setTimeout(() => setTemplateMessage(''), 3000);
    }, [activeVisionImg, visionBetInput, setPanelGrid, setBetInput, setIsPhase3Minimized, setIsPhase2Minimized, setTemplateMessage]);

    const handleReturnToVision = useCallback(() => {
        if (activeVisionId) {
            const newGrid = panelGrid.map(row => [...row]);
            setVisionImages(prev => prev.map(img =>
                img.id === activeVisionId ? { ...img, grid: newGrid } : img
            ));
            setVisionBetInput(betInput);
            setTemplateMessage('✅ 已將手動盤面存回目前 AI 截圖 (Phase 3)');
            setTimeout(() => setTemplateMessage(''), 3000);
        }
        setIsPhase2Minimized(true);
        setIsPhase3Minimized(false);
    }, [activeVisionId, panelGrid, betInput, setVisionImages, setVisionBetInput, setIsPhase2Minimized, setIsPhase3Minimized, setTemplateMessage]);

    // --- 快捷鍵 (Enter) ---
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
            if (e.key === 'Enter') {
                if (!isTemplateMinimized) {
                    e.preventDefault();
                    handleBuildTemplate();
                } else if (!isPhase2Minimized) {
                    e.preventDefault();
                    const winAmount = calcResults?.totalWin || 0;
                    setTotalBalance(prev => parseFloat((prev + winAmount).toFixed(4)));
                    setTemplateMessage(`💰 已將贏分 ${winAmount.toLocaleString()} 加入總資產`);
                    setTimeout(() => setTemplateMessage(''), 3000);
                } else if (!isPhase3Minimized) {
                    e.preventDefault();
                    const winAmount = visionCalcResults?.totalWin || 0;
                    setTotalBalance(prev => parseFloat((prev + winAmount).toFixed(4)));
                    setTemplateMessage(`💰 已將 AI 辨識贏分 ${winAmount.toLocaleString()} 加入總資產`);
                    setTimeout(() => setTemplateMessage(''), 3000);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isTemplateMinimized, isPhase2Minimized, isPhase3Minimized, visionGrid, calcResults, visionCalcResults, handleBuildTemplate]);

    // --- 快捷鍵 (方向鍵切換 Phase) ---
    useEffect(() => {
        const phases = ['phase1', 'phase2', 'phase3', 'phase4'];
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();

            const minimizedMap = { phase1: isTemplateMinimized, phase2: isPhase2Minimized, phase3: isPhase3Minimized, phase4: isPhase4Minimized };
            const currentIdx = phases.findIndex(p => !minimizedMap[p]);
            let nextIdx;
            if (e.key === 'ArrowDown') {
                nextIdx = currentIdx < 0 ? 0 : Math.min(currentIdx + 1, phases.length - 1);
            } else {
                nextIdx = currentIdx < 0 ? phases.length - 1 : Math.max(currentIdx - 1, 0);
            }

            const currentPhase = phases[currentIdx];
            const nextPhase = phases[nextIdx];

            if (currentPhase === 'phase2' && nextPhase === 'phase3' && e.key === 'ArrowDown') { handleReturnToVision(); return; }
            if (currentPhase === 'phase3' && nextPhase === 'phase2' && e.key === 'ArrowUp') { handleTransferVisionToManual(); return; }
            handlePhaseToggle(phases[nextIdx]);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isTemplateMinimized, isPhase2Minimized, isPhase3Minimized, isPhase4Minimized, handlePhaseToggle, handleTransferVisionToManual, handleReturnToVision]);

    // --- 雲端 Modal 開啟自動載入 ---
    useEffect(() => {
        if (showCloudModal) fetchCloudTemplates();
    }, [showCloudModal, fetchCloudTemplates]);

    useEffect(() => {
        if (cloudError) {
            const timer = setTimeout(() => setCloudError(''), 4000);
            return () => clearTimeout(timer);
        }
    }, [cloudError, setCloudError]);

    const hasApiKey = !!(customApiKey.trim() || apiKey);

    // ========== RENDER ==========
    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 p-6 font-sans relative">

            <ToastMessage message={templateMessage} />
            <ToastMessage message={cloudMessage} />
            <ToastMessage message={cloudError} type="error" />

            <div className="max-w-7xl mx-auto space-y-6">

                <AppHeader onOpenSettings={() => setShowSettingsModal(true)} />

                <ErrorBoundary label="Phase 1: 模板設定">
                <Phase1Setup
                    handleClearTemplate={handleClearTemplate}
                    templateMessage={templateMessage}
                    isTemplateMinimized={isTemplateMinimized} setIsTemplateMinimized={setIsTemplateMinimized}
                    onToggle={() => handlePhaseToggle('phase1')}
                    template={template} templateError={templateError}
                    showCloudModal={showCloudModal} setShowCloudModal={setShowCloudModal}
                    handleImportLocalTemplate={handleImportLocalTemplate} handleExportLocalTemplate={handleExportLocalTemplate}
                    templateName={templateName} setTemplateName={setTemplateName} defaultSaveName={defaultSaveName}
                    handleSaveToCloud={handleSaveToCloud} isSaving={isSaving} activeSaveAction={activeSaveAction}
                    platformName={platformName} setPlatformName={setPlatformName}
                    gameName={gameName} setGameName={setGameName}
                    lineMode={lineMode} setLineMode={setLineMode}
                    linesMode={linesMode} setLinesMode={setLinesMode}
                    linesTextInput={linesTextInput} setLinesTextInput={setLinesTextInput}
                    extractResults={extractResults} setExtractResults={setExtractResults}
                    gridRows={gridRows} setGridRows={setGridRows}
                    gridCols={gridCols} setGridCols={setGridCols}
                    hasMultiplierReel={hasMultiplierReel} setHasMultiplierReel={setHasMultiplierReel}
                    requiresCollectToWin={requiresCollectToWin} setRequiresCollectToWin={setRequiresCollectToWin}
                    hasCashCollectFeature={hasCashCollectFeature} setHasCashCollectFeature={setHasCashCollectFeature}
                    hasDoubleSymbol={hasDoubleSymbol} setHasDoubleSymbol={setHasDoubleSymbol}
                    hasDynamicMultiplier={hasDynamicMultiplier} setHasDynamicMultiplier={setHasDynamicMultiplier}
                    multiplierCalcType={multiplierCalcType} setMultiplierCalcType={setMultiplierCalcType}
                    lineImages={lineImages} removeLineImage={removeLineImage} activeLineImageId={activeLineImageId} setActiveLineImageId={setActiveLineImageId} handleLineImageUpload={handleLineImageUpload}
                    isPtProcessing={isPtProcessing} handlePtExtract={handlePtExtract} ptImages={ptImages} removePtImage={removePtImage} clearPtAll={clearPtAll} handlePtFileChange={handlePtFileChange} handlePtDrop={handlePtDrop}
                    dragState={dragState} setDragState={setDragState} containerRef={containerRef} layoutStyle={layoutStyle} handleMouseDown={handleMouseDown} handleMouseMove={handleMouseMove} handleMouseUp={handleMouseUp}
                    canvasRef={canvasRef} draw={draw} canvasSize={canvasSize} p1={p1} pEnd={pEnd} analyzeImage={analyzeImage} startIndex={startIndex} setStartIndex={setStartIndex} threshold={threshold} setThreshold={setThreshold}
                    patternRows={patternRows} setPatternRows={setPatternRows} patternCols={patternCols} setPatternCols={setPatternCols} linesTabMode={linesTabMode} setLinesTabMode={setLinesTabMode}
                    activeLineImage={activeLineImage} imageSrc={imageSrc} imageObj={imageObj}
                    paytableMode={paytableMode} setPaytableMode={setPaytableMode} paytableInput={paytableInput} setPaytableInput={setPaytableInput} handlePaytableTextChange={handlePaytableTextChange}
                    ptResultItems={ptResultItems} setPtResultItems={setPtResultItems} ptCropState={ptCropState} setPtCropState={setPtCropState} ptCropImageRef={ptCropImageRef} ptEnlargedImg={ptEnlargedImg} setPtEnlargedImg={setPtEnlargedImg}
                    handlePtTableChange={handlePtTableChange} handlePtTableDelete={handlePtTableDelete} handleAddPtRow={handleAddPtRow} handleRemoveThumb={handleRemoveThumb}
                    hasJackpot={hasJackpot} setHasJackpot={setHasJackpot} jpConfig={jpConfig} setJpConfig={setJpConfig} buildErrorMsg={buildErrorMsg} handleBuildTemplate={handleBuildTemplate}
                    showPtModal={showPtModal} setShowPtModal={setShowPtModal}
                    hasApiKey={hasApiKey}
                />
                </ErrorBoundary>

                <ErrorBoundary label="Phase 2: 手動結算">
                <Phase2Manual
                    template={template}
                    isPhase2Minimized={isPhase2Minimized} setIsPhase2Minimized={setIsPhase2Minimized}
                    onToggle={() => handlePhaseToggle('phase2')}
                    handleRandomizePanel={handleRandomizePanel}
                    panelInputMode={panelInputMode} setPanelInputMode={setPanelInputMode}
                    activeBrush={activeBrush} setActiveBrush={setActiveBrush}
                    availableSymbols={availableSymbols}
                    handleClearPanel={handleClearPanel}
                    hoveredLineId={hoveredLineId} setHoveredLineId={setHoveredLineId}
                    calcResults={calcResults} calculateError={calculateError}
                    showAllLines={showAllLines} setShowAllLines={setShowAllLines}
                    betInput={betInput} setBetInput={setBetInput}
                    panelGrid={panelGrid} handleCellChange={handleCellChange}
                    getSafeGrid={getSafeGrid}
                    onReturn={handleReturnToVision}
                    totalBalance={totalBalance} setTotalBalance={setTotalBalance}
                    setTemplateMessage={setTemplateMessage}
                    isBalanceExpanded={isBalanceExpanded} setIsBalanceExpanded={setIsBalanceExpanded}
                />
                </ErrorBoundary>

                <ErrorBoundary label="Phase 3: AI 辨識">
                <Phase3Vision
                    template={template}
                    isPhase3Minimized={isPhase3Minimized} setIsPhase3Minimized={setIsPhase3Minimized}
                    onToggle={() => handlePhaseToggle('phase3')}
                    visionImages={visionImages} activeVisionId={activeVisionId} setActiveVisionId={setActiveVisionId}
                    removeVisionImage={removeVisionImage} handleVisionImageUpload={handleVisionImageUpload}
                    activeVisionImg={activeVisionImg} visionContainerRef={visionContainerRef} visionCanvasRef={visionCanvasRef}
                    handleVisionMouseDown={handleVisionMouseDown} handleVisionMouseMove={handleVisionMouseMove} handleVisionMouseUp={handleVisionMouseUp}
                    goToPrevVisionImage={goToPrevVisionImage} goToNextVisionImage={goToNextVisionImage}
                    isVisionProcessing={isVisionProcessing} performAIVisionBatchMatching={performAIVisionBatchMatching}
                    performLocalVisionBatchMatching={performLocalVisionBatchMatching} ocrDecimalPlaces={ocrDecimalPlaces}
                    isVisionStopping={isVisionStopping} visionBatchProgress={visionBatchProgress} cancelVisionProcessing={cancelVisionProcessing}
                    visionError={visionError} visionGrid={visionGrid} visionCalcResults={visionCalcResults} visionCalculateError={visionCalculateError}
                    getSafeGrid={getSafeGrid} betInput={visionBetInput} setBetInput={handleVisionBetInputChange}
                    hasBetBox={hasBetBox} setHasBetBox={setHasBetBox}
                    onTransfer={handleTransferVisionToManual}
                    hasApiKey={hasApiKey}
                    totalBalance={totalBalance} setTotalBalance={setTotalBalance}
                    setTemplateMessage={setTemplateMessage}
                    isBalanceExpanded={isBalanceExpanded} setIsBalanceExpanded={setIsBalanceExpanded}
                />
                </ErrorBoundary>

                <ErrorBoundary label="Phase 4: 影片智慧分析">
                <Phase4Video
                    isPhase4Minimized={isPhase4Minimized}
                    onToggle={() => handlePhaseToggle('phase4')}
                    // Keyframe Extractor
                    candidates={keyframeExtractor.candidates}
                    startLiveDetection={keyframeExtractor.startLiveDetection}
                    stopLiveDetection={keyframeExtractor.stopLiveDetection}
                    removeCandidate={keyframeExtractor.removeCandidate}
                    clearCandidates={keyframeExtractor.clearCandidates}
                    addManualCandidate={keyframeExtractor.addManualCandidate}
                    smartDedup={keyframeExtractor.smartDedup}
                    confirmDedup={keyframeExtractor.confirmDedup}
                    updateCandidateOcr={keyframeExtractor.updateCandidateOcr}
                    setManualBestCandidate={keyframeExtractor.setManualBestCandidate}
                    // Auto Recognition
                    isRecognizing={autoRecognition.isRecognizing}
                    isStopping={autoRecognition.isStopping}
                    recognitionProgress={autoRecognition.recognitionProgress}
                    recognizeBatch={handleRecognizeBatch}
                    recognizeLocalBatch={handleRecognizeLocalBatch}
                    cancelRecognition={autoRecognition.cancelRecognition}
                    // Report
                    stats={phase4Stats}
                    exportHTMLReport={(c, game, dir) => reportGenerator.exportHTMLReport(c, gameName || 'slot', dir, template)}
                    // ROI
                    reelROI={reelROI} setReelROI={setReelROI}
                    winROI={winROI} setWinROI={setWinROI}
                    balanceROI={balanceROI} setBalanceROI={setBalanceROI}
                    betROI={betROI} setBetROI={setBetROI}
                    orderIdROI={orderIdROI} setOrderIdROI={setOrderIdROI}
                    // Video
                    videoSrc={videoSrc} videoRef={videoRef} handleVideoUpload={handleVideoUpload}
                    isStreamMode={isStreamMode} handleStartScreenCapture={handleStartScreenCapture} handleStopScreenCapture={handleStopScreenCapture}
                    // Transfer
                    onTransferToPhase3={handleTransferPhase4ToPhase3}
                    onImportSession={handleImportSession}
                    setTemplateMessage={setTemplateMessage}
                    template={template}
                    gridRows={gridRows} gridCols={gridCols}
                    ocrDecimalPlaces={ocrDecimalPlaces} setOcrDecimalPlaces={setOcrDecimalPlaces}
                />
                </ErrorBoundary>

            </div>

            {/* === Modals (抽離為獨立元件) === */}
            <PtConfirmModal
                show={showPtModal}
                onCancel={() => setShowPtModal(false)}
                onConfirm={() => { setShowPtModal(false); handlePtExtract(); }}
            />

            <BuildErrorModal
                message={buildErrorMsg}
                onClose={() => setBuildErrorMsg('')}
            />

            <PtCropModal
                ptCropState={ptCropState}
                setPtCropState={setPtCropState}
                ptImages={ptImages}
                ptResultItems={ptResultItems}
                setPtResultItems={setPtResultItems}
                ptCropImageRef={ptCropImageRef}
                ptEnlargedImg={ptEnlargedImg}
                setPtEnlargedImg={setPtEnlargedImg}
            />

            <OverwriteConfirmModal
                show={showOverwriteConfirm}
                pendingOverwriteData={pendingOverwriteData}
                onOverwrite={(id) => handleSaveToCloud(id)}
                onForceNew={() => handleSaveToCloud('FORCE_NEW')}
                onCancel={() => setShowOverwriteConfirm(false)}
                isSaving={isSaving}
                activeSaveAction={activeSaveAction}
                platformName={platformName}
                gameName={gameName}
            />

            <CloudModal
                show={showCloudModal}
                onClose={() => setShowCloudModal(false)}
                cloudTemplates={cloudTemplates}
                isLoadingCloud={isLoadingCloud}
                isBackgroundSyncing={isBackgroundSyncing}
                downloadingId={downloadingId}
                deletingId={deletingId}
                localUserId={localUserId}
                onForceRefresh={handleForceRefreshCloud}
                onLoadTemplate={loadCloudTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                setDeletingId={setDeletingId}
                currentPlatformName={platformName}
            />

            <SettingsModal
                show={showSettingsModal}
                customApiKey={customApiKey}
                setCustomApiKey={setCustomApiKey}
                isDarkMode={isDarkMode}
                setIsDarkMode={setIsDarkMode}
                onClose={() => setShowSettingsModal(false)}
                onSave={() => {
                    localStorage.setItem('gemini_api_key', customApiKey);
                    setShowSettingsModal(false);
                    setTemplateMessage('✅ 設定已安全儲存至您的瀏覽器！');
                    setTimeout(() => setTemplateMessage(''), 3000);
                }}
            />
        </div>
    );
}

export default App;
