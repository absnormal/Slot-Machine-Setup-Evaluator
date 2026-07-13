import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { apiKey } from './utils/constants';

import AppHeader from './components/AppHeader';
import ToastMessage from './components/ToastMessage';
import SettingsModal from './components/SettingsModal';
import CloudModal from './components/CloudModal';
import ErrorBoundary from './components/ErrorBoundary';
import Phase1Setup from './components/Phase1Setup';
import TemplateQuickBar from './components/TemplateQuickBar';
import Phase2Manual from './components/Phase2Manual';
import Phase3Vision from './components/Phase3Vision';
const Phase4Video = React.lazy(() => import('./components/Phase4Video'));
const Phase5Automation = React.lazy(() => import('./components/Phase5Automation'));

// Modals (從 App.jsx 抽離)
import PtConfirmModal from './components/modals/PtConfirmModal';
import BuildErrorModal from './components/modals/BuildErrorModal';
import PtCropModal from './components/modals/PtCropModal';
import OverwriteConfirmModal from './components/modals/OverwriteConfirmModal';
import SessionProgressModal from './components/phase4/SessionProgressModal';
import NativeSourceModal from './components/modals/NativeSourceModal';

// Hooks
import { useCloud } from './hooks/useCloud';
import { useGeminiVision } from './hooks/useGeminiVision';
import { useTemplateBuilder } from './hooks/useTemplateBuilder';
import { useSlotEngine } from './hooks/useSlotEngine';
import { useKeyframeExtractor } from './hooks/useKeyframeExtractor';
import { useAutoRecognition } from './hooks/useAutoRecognition';
import { useReportGenerator } from './hooks/useReportGenerator';
import { useTemplateIO } from './hooks/useTemplateIO';
import { useVideoSource } from './hooks/useVideoSource';
import { usePhaseTransfer } from './hooks/usePhaseTransfer';
import useAppStore from './stores/useAppStore';
import usePhase4Store from './stores/usePhase4Store';

function App() {
    // --- Zustand Store ---
    const uiMode = useAppStore(s => s.uiMode);
    const setUiMode = useAppStore(s => s.setUiMode);
    const isFullMode = uiMode === 'full';

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
    const showToast = useAppStore(s => s.showToast);

    const totalBalance = useAppStore(s => s.totalBalance);
    const setTotalBalance = useAppStore(s => s.setTotalBalance);
    const isBalanceExpanded = useAppStore(s => s.isBalanceExpanded);
    const setIsBalanceExpanded = useAppStore(s => s.setIsBalanceExpanded);

    const showCloudModal = useAppStore(s => s.showCloudModal);
    const setShowCloudModal = useAppStore(s => s.setShowCloudModal);

    const isDarkMode = useAppStore(s => s.isDarkMode);
    const setIsDarkMode = useAppStore(s => s.setIsDarkMode);

    const apiProvider = useAppStore(s => s.apiProvider);
    const setApiProvider = useAppStore(s => s.setApiProvider);
    const geminiModel = useAppStore(s => s.geminiModel);
    const setGeminiModel = useAppStore(s => s.setGeminiModel);
    const geminiModelResolved = useAppStore(s => s.geminiModelResolved);
    const localEndpoint = useAppStore(s => s.localEndpoint);
    const setLocalEndpoint = useAppStore(s => s.setLocalEndpoint);
    const localModel = useAppStore(s => s.localModel);
    const setLocalModel = useAppStore(s => s.setLocalModel);
    const localApiKey = useAppStore(s => s.localApiKey);
    const setLocalApiKey = useAppStore(s => s.setLocalApiKey);

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
        hasTripleSymbol, setHasTripleSymbol,
        hasRollingWin, setHasRollingWin,
        hasDynamicMultiplier, setHasDynamicMultiplier,
        multiplierCalcType, setMultiplierCalcType,
        hasBidirectionalPaylines, setHasBidirectionalPaylines,
        hasAdjustableLines, setHasAdjustableLines,
        hasExBet, setHasExBet, exBetOptions, setExBetOptions,
        hasLineBetDivisor, setHasLineBetDivisor, lineBetDivisor, setLineBetDivisor,
        reelHeights, setReelHeights,
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
        handleLineImageUpload, pasteLineImageFromClipboard, removeLineImage, analyzeImage,
        handleMouseDown, handleMouseMove, handleMouseUp, draw,
        handlePaytableTextChange, handlePtTableChange, handlePtTableDelete, handleAddPtRow, handleRemoveThumb,
        handlePtFileChange, handlePtDrop, processPtFiles, pastePtImageFromClipboard, removePtImage, clearPtAll, handlePtExtract,
        performAutoBuild, handleBuildTemplate, resetTemplateBuilder
    } = templateBuilder;


    // --- Phase 4 偵測參數 (from Zustand Store) ---
    const motionCoverageMin = usePhase4Store(s => s.motionCoverageMin);
    const setMotionCoverageMin = usePhase4Store(s => s.setMotionCoverageMin);
    const vLineThreshold = usePhase4Store(s => s.vLineThreshold);
    const setVLineThreshold = usePhase4Store(s => s.setVLineThreshold);
    const ocrDecimalPlaces = usePhase4Store(s => s.ocrDecimalPlaces);
    const setOcrDecimalPlaces = usePhase4Store(s => s.setOcrDecimalPlaces);
    const balDecimalPlaces = usePhase4Store(s => s.balDecimalPlaces);
    const setBalDecimalPlaces = usePhase4Store(s => s.setBalDecimalPlaces);
    const enableWinTracker = usePhase4Store(s => s.enableWinTracker);
    const setEnableWinTracker = usePhase4Store(s => s.setEnableWinTracker);
    const enableEmptyBoardFilter = usePhase4Store(s => s.enableEmptyBoardFilter);
    const setEnableEmptyBoardFilter = usePhase4Store(s => s.setEnableEmptyBoardFilter);

    // --- Bi-directional Paylines Runtime Toggle (from Zustand Store) ---
    const enableBidirectional = usePhase4Store(s => s.enableBidirectional);
    const setEnableBidirectional = usePhase4Store(s => s.setEnableBidirectional);

    // --- Template IO (匯入/匯出/雲端存取) ---
    const templateIO = useTemplateIO({
        setGridRows, setGridCols, setLineMode, setExtractResults,
        setPaytableInput, setPtResultItems, setPaytableMode,
        setJpConfig, setHasJackpot, setHasMultiplierReel,
        setRequiresCollectToWin, setHasCashCollectFeature, setHasDoubleSymbol, setHasTripleSymbol,
        setHasDynamicMultiplier, setMultiplierCalcType,
        setHasBidirectionalPaylines,
        setHasAdjustableLines,
        setHasExBet, setExBetOptions,
        setHasLineBetDivisor, setLineBetDivisor,
        setReelHeights,
        setLineImages, setActiveLineImageId, setLinesTextInput,
        setTemplateError,
        performAutoBuild, resetTemplateBuilder,
        useCloudInstance: cloudInstance,
        platformName: undefined, gameName: undefined,
        gridRows, gridCols, lineMode, extractResults,
        paytableInput, ptResultItems, jpConfig,
        hasJackpot, hasMultiplierReel, requiresCollectToWin, hasCashCollectFeature,
        hasDoubleSymbol, hasTripleSymbol, hasRollingWin, hasDynamicMultiplier, multiplierCalcType,
        hasBidirectionalPaylines, hasAdjustableLines,
        hasExBet, exBetOptions,
        hasLineBetDivisor, lineBetDivisor,
        reelHeights,
        motionCoverageMin, vLineThreshold, ocrDecimalPlaces, balDecimalPlaces, enableWinTracker, enableEmptyBoardFilter,
        setMotionCoverageMin, setVLineThreshold, setOcrDecimalPlaces, setBalDecimalPlaces, setEnableWinTracker, setEnableEmptyBoardFilter,
        setReelROI: usePhase4Store(s => s.setReelROI),
        setWinROI: usePhase4Store(s => s.setWinROI),
        setBalanceROI: usePhase4Store(s => s.setBalanceROI),
        setBetROI: usePhase4Store(s => s.setBetROI),
        setOrderIdROI: usePhase4Store(s => s.setOrderIdROI),
        setMultiplierROI: usePhase4Store(s => s.setMultiplierROI),
    });

    const {
        platformName, setPlatformName, gameName, setGameName,
        templateName, setTemplateName, defaultSaveName, localUserId,
        loadCloudTemplate, handleImportLocalJSON,
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
        getSafeGrid, handleGridPaste, handleCellChange, computeGridResultsCb,
        activeLineCount, setActiveLineCount,
        globalMultiplier, setGlobalMultiplier,
        activeExBetMultiplier, setActiveExBetMultiplier
    } = useSlotEngine({ template, enableBidirectional });

    // --- Phase 3 (AI 視覺批次辨識) ---
    const visionCanvasRef = useRef(null);
    const visionContainerRef = useRef(null);

    const {
        visionImages, activeVisionId, activeVisionImg, visionImageObj, visionImageSrc, visionGrid, visionError,
        isVisionProcessing, isVisionStopping, visionBatchProgress,
        setActiveVisionId, setVisionImages, handleVisionMouseDown, handleVisionMouseMove, handleVisionMouseUp,
        handleVisionImageUpload, removeVisionImage, resetVisionImage, performAIVisionBatchMatching, performLocalVisionBatchMatching, cancelVisionProcessing,
        goToPrevVisionImage, goToNextVisionImage,
        hasBetBox, setHasBetBox,
        pasteFromClipboard,
        setVisionP1, setVisionP1Mult, setVisionP1Bet
    } = useGeminiVision({
        template, availableSymbols, customApiKey, setTemplateMessage, setTemplateError,
        visionCanvasRef, isPhase3Minimized
    });

    // --- Video Source Management ---
    const {
        videoRef, videoSrc, setVideoSrc,
        isStreamMode, isNativeMode,
        showNativeSourceModal, setShowNativeSourceModal, nativeSources,
        nativeCapture,
        handleVideoUpload, handleStartScreenCapture, handleStopScreenCapture,
        handleStartNativeCapture, handleSelectNativeSource, handleStopNativeCapture
    } = useVideoSource({ showToast: setTemplateMessage });

    // ROI 狀態 (from Zustand Store — 自動持久化至 localStorage)
    const reelROI = usePhase4Store(s => s.reelROI);
    const winROI = usePhase4Store(s => s.winROI);
    const balanceROI = usePhase4Store(s => s.balanceROI);
    const betROI = usePhase4Store(s => s.betROI);
    const orderIdROI = usePhase4Store(s => s.orderIdROI);
    const multiplierROI = usePhase4Store(s => s.multiplierROI);

    // 新 Phase 4 Hooks
    const keyframeExtractor = useKeyframeExtractor({ setTemplateMessage });
    const autoRecognition = useAutoRecognition({
        template, availableSymbols, customApiKey,
        setTemplateMessage, setTemplateError,
        enableBidirectional
    });
    const reportGenerator = useReportGenerator();

    // 統計數據
    const phase4Stats = useMemo(() => reportGenerator.computeStats(keyframeExtractor.candidates), [keyframeExtractor.candidates, reportGenerator]);

    // --- 跨 Phase 傳遞 (usePhaseTransfer) ---
    const {
        handleRecognizeBatch, handleRecognizeLocalBatch, recognizeLocalSingle,
        handleTransferPhase4ToPhase3, handleImportSession,
        visionCalcResults, visionCalculateError, visionBetInput,
        handleVisionBetInputChange,
        handleTransferVisionToManual, handleReturnToVision, handleSaveVisionToPhase4,
        sessionProgress, setSessionProgress,
    } = usePhaseTransfer({
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
        setVisionImages, setActiveVisionId,
        setVisionP1, setVisionP1Mult, setVisionP1Bet,
        setHasBetBox,
        activeVisionImg, activeVisionId, visionGrid,
        // Phase 2 hooks
        setPanelGrid, setBetInput, betInput, panelGrid,
        computeGridResultsCb,
        // UI state
        setIsPhase2Minimized, setIsPhase3Minimized, setIsPhase4Minimized,
        // Template state
        hasMultiplierReel, gameName,
        ocrDecimalPlaces,
    });

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
                    showToast(`💰 已將贏分 ${winAmount.toLocaleString()} 加入總資產`);
                } else if (!isPhase3Minimized) {
                    e.preventDefault();
                    const winAmount = visionCalcResults?.totalWin || 0;
                    setTotalBalance(prev => parseFloat((prev + winAmount).toFixed(4)));
                    showToast(`💰 已將 AI 辨識贏分 ${winAmount.toLocaleString()} 加入總資產`);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isTemplateMinimized, isPhase2Minimized, isPhase3Minimized, visionGrid, calcResults, visionCalcResults, handleBuildTemplate]);

    // --- 快捷鍵 (方向鍵切換 Phase) ---
    useEffect(() => {
        const phases = isFullMode
            ? ['phase1', 'phase2', 'phase3', 'phase4']
            : ['phase2', 'phase3'];
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
    }, [isFullMode, isTemplateMinimized, isPhase2Minimized, isPhase3Minimized, isPhase4Minimized, handlePhaseToggle, handleTransferVisionToManual, handleReturnToVision]);

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

    const hasApiKey = apiProvider === 'local'
        ? !!(localEndpoint.trim())  // 地端：只要有填 Endpoint 就算 OK
        : !!(customApiKey.trim() || apiKey);  // 雲端：需要 Gemini Key

    // ========== RENDER ==========
    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 p-6 font-sans relative">

            <ToastMessage message={templateMessage} />
            <ToastMessage message={cloudMessage} />
            <ToastMessage message={cloudError} type="error" />

            <div className="max-w-7xl mx-auto space-y-6">

                <AppHeader onOpenSettings={() => setShowSettingsModal(true)} />

                {/* 簡易模式：TemplateQuickBar 取代 P1 */}
                {!isFullMode && (
                    <TemplateQuickBar
                        template={template}
                        gameName={gameName}
                        platformName={platformName}
                        onOpenCloud={() => setShowCloudModal(true)}
                        onEditTemplate={() => { setUiMode('full'); handlePhaseToggle('phase1'); }}
                    />
                )}

                {/* 完整模式：完整 P1 */}
                {isFullMode && (
                <ErrorBoundary label="Phase 1: 模板設定">
                    <Phase1Setup
                        handleClearTemplate={handleClearTemplate}
                        templateMessage={templateMessage}
                        isTemplateMinimized={isTemplateMinimized} setIsTemplateMinimized={setIsTemplateMinimized}
                        onToggle={() => handlePhaseToggle('phase1')}
                        template={template} templateError={templateError}
                        showCloudModal={showCloudModal} setShowCloudModal={setShowCloudModal}

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
                        hasTripleSymbol={hasTripleSymbol} setHasTripleSymbol={setHasTripleSymbol}
                        hasRollingWin={hasRollingWin} setHasRollingWin={setHasRollingWin}
                        hasDynamicMultiplier={hasDynamicMultiplier} setHasDynamicMultiplier={setHasDynamicMultiplier}
                        multiplierCalcType={multiplierCalcType} setMultiplierCalcType={setMultiplierCalcType}
                        hasBidirectionalPaylines={hasBidirectionalPaylines} setHasBidirectionalPaylines={setHasBidirectionalPaylines}
                        hasAdjustableLines={hasAdjustableLines} setHasAdjustableLines={setHasAdjustableLines}
                        hasExBet={hasExBet} setHasExBet={setHasExBet}
                        exBetOptions={exBetOptions} setExBetOptions={setExBetOptions}
                        hasLineBetDivisor={hasLineBetDivisor} setHasLineBetDivisor={setHasLineBetDivisor}
                        lineBetDivisor={lineBetDivisor} setLineBetDivisor={setLineBetDivisor}
                        reelHeights={reelHeights} setReelHeights={setReelHeights}
                        lineImages={lineImages} removeLineImage={removeLineImage} activeLineImageId={activeLineImageId} setActiveLineImageId={setActiveLineImageId} handleLineImageUpload={handleLineImageUpload} pasteLineImageFromClipboard={pasteLineImageFromClipboard}
                        isPtProcessing={isPtProcessing} handlePtExtract={handlePtExtract} ptImages={ptImages} removePtImage={removePtImage} clearPtAll={clearPtAll} handlePtFileChange={handlePtFileChange} handlePtDrop={handlePtDrop} pastePtImageFromClipboard={pastePtImageFromClipboard}
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
                )}

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
                        enableBidirectional={enableBidirectional} setEnableBidirectional={setEnableBidirectional}
                        activeLineCount={activeLineCount} setActiveLineCount={setActiveLineCount}
                        globalMultiplier={globalMultiplier} setGlobalMultiplier={setGlobalMultiplier}
                        activeExBetMultiplier={activeExBetMultiplier} setActiveExBetMultiplier={setActiveExBetMultiplier}
                    />
                </ErrorBoundary>

                <ErrorBoundary label="Phase 3: AI 辨識">
                    <Phase3Vision
                        template={template}
                        isPhase3Minimized={isPhase3Minimized} setIsPhase3Minimized={setIsPhase3Minimized}
                        onToggle={() => handlePhaseToggle('phase3')}
                        visionImages={visionImages} activeVisionId={activeVisionId} setActiveVisionId={setActiveVisionId}
                        removeVisionImage={removeVisionImage} resetVisionImage={resetVisionImage} handleVisionImageUpload={handleVisionImageUpload}
                        activeVisionImg={activeVisionImg} visionContainerRef={visionContainerRef} visionCanvasRef={visionCanvasRef}
                        handleVisionMouseDown={handleVisionMouseDown} handleVisionMouseMove={handleVisionMouseMove} handleVisionMouseUp={handleVisionMouseUp}
                        goToPrevVisionImage={goToPrevVisionImage} goToNextVisionImage={goToNextVisionImage}
                        isVisionProcessing={isVisionProcessing} performAIVisionBatchMatching={performAIVisionBatchMatching}
                        performLocalVisionBatchMatching={performLocalVisionBatchMatching} ocrDecimalPlaces={ocrDecimalPlaces}
                        isVisionStopping={isVisionStopping} visionBatchProgress={visionBatchProgress} cancelVisionProcessing={cancelVisionProcessing}
                        visionError={visionError} visionGrid={visionGrid} visionCalcResults={visionCalcResults} visionCalculateError={visionCalculateError}
                        getSafeGrid={getSafeGrid} betInput={visionBetInput} setBetInput={handleVisionBetInputChange}
                        hasBetBox={hasBetBox} setHasBetBox={setHasBetBox}
                        pasteFromClipboard={pasteFromClipboard}
                        onTransfer={handleTransferVisionToManual}
                        onSaveToPhase4={handleSaveVisionToPhase4}
                        hasApiKey={hasApiKey}
                        totalBalance={totalBalance} setTotalBalance={setTotalBalance}
                        setTemplateMessage={setTemplateMessage}
                        isBalanceExpanded={isBalanceExpanded} setIsBalanceExpanded={setIsBalanceExpanded}
                        activeExBetMultiplier={activeExBetMultiplier} setActiveExBetMultiplier={setActiveExBetMultiplier}
                    />
                </ErrorBoundary>

                {isFullMode && (
                <Suspense fallback={<div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">⏳ 載入 Phase 4...</div>}>
                <ErrorBoundary label="Phase 4: 影片智慧分析">
                    <Phase4Video
                        isPhase4Minimized={isPhase4Minimized}
                        onToggle={() => handlePhaseToggle('phase4')}
                        // Keyframe Extractor
                        candidates={keyframeExtractor.candidates}
                        isDetecting={keyframeExtractor.isDetecting}
                        startLiveDetection={keyframeExtractor.startLiveDetection}
                        stopLiveDetection={keyframeExtractor.stopLiveDetection}
                        removeCandidate={keyframeExtractor.removeCandidate}
                        resetCandidateRecognition={keyframeExtractor.resetCandidateRecognition}
                        clearCandidates={keyframeExtractor.clearCandidates}
                        addManualCandidate={keyframeExtractor.addManualCandidate}
                        smartDedup={keyframeExtractor.smartDedup}
                        confirmDedup={keyframeExtractor.confirmDedup}
                        updateCandidateOcr={keyframeExtractor.updateCandidateOcr}
                        updateCandidate={keyframeExtractor.updateCandidate}
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
                        exportHTMLReport={(c, game, dir, format) => {
                            const startTime = Date.now();
                            setSessionProgress({ type: 'export', phase: '準備中...', current: 0, total: 0, detail: '', startTime });
                            return reportGenerator.exportHTMLReport(c, gameName || 'slot', dir, template, {
                                reel: reelROI, win: winROI, balance: balanceROI, bet: betROI, orderId: orderIdROI
                            }, format || 'jpeg', (prog) => {
                                setSessionProgress(prev => ({ ...prev, ...prog }));
                            }).then(msg => {
                                if (msg) setTemplateMessage(msg);
                            }).finally(() => setSessionProgress(null));
                        }}
                        isSessionBusy={!!sessionProgress}
                        // Video
                        videoSrc={videoSrc} videoRef={videoRef} handleVideoUpload={handleVideoUpload}
                        isStreamMode={isStreamMode} handleStartScreenCapture={handleStartScreenCapture} handleStopScreenCapture={handleStopScreenCapture}
                        isNativeMode={isNativeMode} handleStartNativeCapture={handleStartNativeCapture} handleStopNativeCapture={handleStopNativeCapture}
                        nativeCapture={nativeCapture}
                        // Transfer
                        onTransferToPhase3={handleTransferPhase4ToPhase3}
                        onImportSession={handleImportSession}
                        setTemplateMessage={setTemplateMessage}
                        template={template}
                        gameName={gameName}
                        gridRows={gridRows} gridCols={gridCols} hasMultiplierReel={hasMultiplierReel}
                        hasRollingWin={hasRollingWin} setHasRollingWin={setHasRollingWin}
                    />
                </ErrorBoundary>
                </Suspense>
                )}

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
                    showToast('✅ 設定已安全儲存至您的瀏覽器！');
                }}
                apiProvider={apiProvider}
                setApiProvider={setApiProvider}
                geminiModel={geminiModel}
                setGeminiModel={setGeminiModel}
                geminiModelResolved={geminiModelResolved}
                localEndpoint={localEndpoint}
                setLocalEndpoint={setLocalEndpoint}
                localModel={localModel}
                setLocalModel={setLocalModel}
                localApiKey={localApiKey}
                setLocalApiKey={setLocalApiKey}
            />

            {/* 本地擷取來源選擇 Modal */}
            {showNativeSourceModal && (
                <NativeSourceModal
                    sources={nativeSources}
                    onSelect={handleSelectNativeSource}
                    onClose={() => setShowNativeSourceModal(false)}
                />
            )}

            <SessionProgressModal progress={sessionProgress} />

            {/* === Phase 5: 固定底部列 (不參與手風琴，透過 Portal 渲染在 body) === */}
            {isFullMode && (
            <Suspense fallback={null}>
            <ErrorBoundary label="Phase 5: 自動化控制">
                <Phase5Automation
                    videoRef={videoRef}
                    candidates={keyframeExtractor.candidates}
                    setCandidates={keyframeExtractor.setCandidates}
                    isNativeMode={isNativeMode}
                    nativeCapture={nativeCapture}
                    isDetecting={keyframeExtractor.isDetecting}
                    startLiveDetection={keyframeExtractor.startLiveDetection}
                    stopLiveDetection={keyframeExtractor.stopLiveDetection}
                    smartDedup={keyframeExtractor.smartDedup}
                    template={template}
                    gameName={gameName}
                    setTemplateMessage={setTemplateMessage}
                    reelROI={reelROI}
                    scanOpts={{
                        winROI, balanceROI, betROI,
                        orderIdROI, multiplierROI: template?.hasMultiplierReel ? multiplierROI : null,
                        ocrDecimalPlaces, balDecimalPlaces,
                        requireStableWin: false,
                        sliceCols: template?.cols || gridCols || 5,
                        hasRollingWin, enableWinTracker, enableEmptyBoardFilter,
                    }}
                    recognizeLocal={recognizeLocalSingle}
                />
            </ErrorBoundary>
            </Suspense>
            )}
        </div>
    );
}

export default App;
