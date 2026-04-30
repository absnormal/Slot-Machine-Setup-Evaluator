import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Scan, ChevronDown, ChevronUp } from 'lucide-react';
import VideoPlayer from './phase4/VideoPlayer';
import DetectionControlBar from './phase4/DetectionControlBar';
import SavePanel from './phase4/SavePanel';
import DiagnosticDashboard from './phase4/DiagnosticDashboard';
import SpinGroupList from './phase4/SpinGroupList';
import ActionPanel from './phase4/ActionPanel';
import PreviewLightbox from './phase4/PreviewLightbox';
import usePhase4Store from '../stores/usePhase4Store';
import useAutoSave from '../hooks/useAutoSave';
import useSpinGroupAnalysis from '../hooks/useSpinGroupAnalysis';

const Phase4Video = ({
    isPhase4Minimized,
    onToggle,
    // Keyframe Extractor
    candidates,
    startLiveDetection, stopLiveDetection,
    removeCandidate, clearCandidates, addManualCandidate, smartDedup, confirmDedup, healBreaks, setManualBestCandidate,
    updateCandidateOcr, updateCandidate,
    // Auto Recognition
    isRecognizing, isStopping, recognitionProgress,
    recognizeBatch, recognizeLocalBatch, cancelRecognition,
    // Report
    stats, exportHTMLReport,
    // Video
    videoSrc, videoRef, handleVideoUpload,
    isStreamMode, handleStartScreenCapture, handleStopScreenCapture,
    isNativeMode, handleStartNativeCapture, handleStopNativeCapture, nativeCapture,
    onTransferToPhase3,
    onImportSession,
    setTemplateMessage,
    template,
    gameName,
    gridRows: propGridRows, gridCols: propGridCols, hasMultiplierReel: propHasMultiplierReel,
    hasRollingWin, setHasRollingWin,
}) => {
    // ── 從 Zustand Store 取得 ROI 與偵測參數 ──
    const reelROI = usePhase4Store(s => s.reelROI);
    const winROI = usePhase4Store(s => s.winROI);
    const balanceROI = usePhase4Store(s => s.balanceROI);
    const betROI = usePhase4Store(s => s.betROI);
    const orderIdROI = usePhase4Store(s => s.orderIdROI);
    const multiplierROI = usePhase4Store(s => s.multiplierROI);
    const multiplierDetectMode = usePhase4Store(s => s.multiplierDetectMode);
    const multiplierBrightnessValues = usePhase4Store(s => s.multiplierBrightnessValues);
    const ocrDecimalPlaces = usePhase4Store(s => s.ocrDecimalPlaces);
    const balDecimalPlaces = usePhase4Store(s => s.balDecimalPlaces);
    const enableBidirectional = usePhase4Store(s => s.enableBidirectional);
    const setEnableBidirectional = usePhase4Store(s => s.setEnableBidirectional);
    const enableWinTracker = usePhase4Store(s => s.enableWinTracker);
    const setEnableWinTracker = usePhase4Store(s => s.setEnableWinTracker);
    const enableEmptyBoardFilter = usePhase4Store(s => s.enableEmptyBoardFilter);
    const setEnableEmptyBoardFilter = usePhase4Store(s => s.setEnableEmptyBoardFilter);

    // ── 本地狀態 ──
    const [isLiveActive, setIsLiveActive] = useState(false);
    const listEndRef = useRef(null);
    const [lastAddedManualId, setLastAddedManualId] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [enableOrderId, setEnableOrderId] = useState(true);
    const [editingOcr, setEditingOcr] = useState(null);
    const [useWinFrame, setUseWinFrame] = useState(true);

    // ── 卡片點擊：影片模式=跳轉時間點，串流模式/無影片=開圖片預覽 ──
    const handleCardClick = useCallback((kf) => {
        if (isStreamMode || !videoSrc) {
            const reelUrl = kf.canvas ? kf.canvas.toDataURL('image/jpeg', 0.9) : kf.thumbUrl;
            const winUrl = kf.winPollCanvas ? kf.winPollCanvas.toDataURL('image/jpeg', 0.9) : (kf.winPollThumbUrl || null);
            setPreviewImage({
                url: reelUrl,
                url2: winUrl,
                time: kf.reelStopTime || kf.time,
                time2: kf.winPollTime || null
            });
        } else {
            if (videoRef.current) {
                const showingWin = kf.useWinFrame !== false;
                videoRef.current.currentTime = (showingWin && kf.winPollTime) ? kf.winPollTime : kf.time;
            }
        }
    }, [isStreamMode, videoSrc, videoRef]);

    // ── 自動存檔 (hook) ──
    const {
        rootSaveDirHandle, setRootSaveDirHandle,
        saveDirHandle, setSaveDirHandle,
        saveCount,
        saveFormat, setSaveFormat,
        savedIdsRef,
        handlePickSaveDir,
        handleConfirmDedup,
    } = useAutoSave(candidates, confirmDedup);

    // ── VideoPlayer 影片結束回呼 ──
    const handleVideoEnded = useCallback(() => {
        setIsLiveActive(false);
        stopLiveDetection();
    }, [stopLiveDetection]);

    // ── 操作處理 ──
    const scanOpts = { winROI, balanceROI, betROI, orderIdROI: enableOrderId ? orderIdROI : null, multiplierROI: template?.hasMultiplierReel ? multiplierROI : null, ocrDecimalPlaces, balDecimalPlaces, multiplierDetectMode, multiplierBrightnessValues, requireStableWin: false, sliceCols: template?.cols || propGridCols || 5, hasRollingWin, enableWinTracker, enableEmptyBoardFilter };

    const handleStartLive = async () => {
        if (!videoRef.current || !reelROI) return;
        if (rootSaveDirHandle) {
            try {
                const now = new Date();
                const ts = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}`;
                const gameSuffix = (gameName || template?.name) ? `_${gameName || template.name}` : '';
                const folderName = `Session_${ts}${gameSuffix}`;
                const newSaveHandle = await rootSaveDirHandle.getDirectoryHandle(folderName, { create: true });
                setSaveDirHandle(newSaveHandle);
                savedIdsRef.current.clear();
                setTemplateMessage?.(`📁 已自動建立存檔資料夾：${folderName}`);
            } catch (err) {
                console.error("無法建立子資料夾", err);
            }
        }
        setIsLiveActive(true);
        if (videoRef.current.paused) videoRef.current.play();
        startLiveDetection(videoRef.current, reelROI, (candidate) => {
            setTemplateMessage?.(`📸 即時偵測到停輪 @ ${candidate.time.toFixed(1)}s`);
        }, { ...scanOpts });
    };

    const handleStopLive = () => {
        setIsLiveActive(false);
        stopLiveDetection();
    };

    const handleManualCapture = () => {
        const newId = addManualCandidate(videoRef.current, reelROI, scanOpts);
        if (newId) setLastAddedManualId(newId);
    };

    const handleToggleUseWinFrame = () => {
        const val = !useWinFrame;
        setUseWinFrame(val);
        candidates.forEach(kf => updateCandidate(kf.id, { useWinFrame: val }));
    };

    // ── 統計數據 ──
    const recognizedCount = candidates.filter(c => c.status === 'recognized').length;
    const pendingCount = candidates.filter(c => c.status === 'pending').length;
    const errorCount = candidates.filter(c => c.status === 'error').length;
    const winPendingCount = candidates.filter(c =>
        (c.status === 'pending' || c.status === 'error') &&
        c.ocrData?.win && parseFloat(c.ocrData.win) > 0
    ).length;

    // ── 新卡片滾動邏輯 ──
    const prevLengthRef = useRef(candidates.length);
    useEffect(() => {
        if (candidates.length > prevLengthRef.current) {
            if (lastAddedManualId) {
                setTimeout(() => {
                    const el = document.getElementById(`kf-card-${lastAddedManualId}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'auto', block: 'center' });
                        el.classList.add('ring-4', 'ring-amber-400', 'ring-offset-2', 'transition-all', 'duration-500');
                        setTimeout(() => el.classList.remove('ring-4', 'ring-amber-400', 'ring-offset-2'), 1500);
                    }
                    setLastAddedManualId(null);
                }, 100);
            } else if (isLiveActive && listEndRef.current) {
                listEndRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            }
        }
        prevLengthRef.current = candidates.length;
    }, [candidates.length, isLiveActive, lastAddedManualId]);

    // ── 分局與連續性計算 (hook) ──
    const {
        groupsWithMath,
        brokenGroupIds,
        diagnosticStats,
        wrongWinGroupIds,
        nonZeroWinGroupIds,
        scrollToNextBreak,
        scrollToNextWrongWin,
        scrollToNextNonZeroWin,
        currentBreakIndex,
        currentWrongWinIndex,
        currentNonZeroWinIndex,
    } = useSpinGroupAnalysis(candidates);

    const handleHealBreaksGlobally = () => {
        if (brokenGroupIds.length === 0) return;
        healBreaks(brokenGroupIds, scanOpts);
    };

    // ══════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Header */}
            <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors bg-white" onClick={onToggle}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                        {isPhase4Minimized ? <Video size={20} /> : <Scan size={20} />}
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Phase 4: 影片智慧分析</h2>
                        <p className="text-xs text-slate-500">
                            {isPhase4Minimized ? '自適應關鍵幀提取 + AI 辨識 (已最小化)' : '零參數動態掃描 · 三種操作模式'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isPhase4Minimized && candidates.length > 0 && (
                        <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            {candidates.length} 幀
                        </span>
                    )}
                    <div className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                        {isPhase4Minimized ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-slate-400" />}
                    </div>
                </div>
            </div>

            {/* Main */}
            <div className={`${isPhase4Minimized ? 'hidden' : ''}`}>
                <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* ══ 左側：影片預覽 ══ */}
                    <div className="lg:col-span-8 space-y-4">
                        <VideoPlayer
                            videoSrc={videoSrc}
                            videoRef={videoRef}
                            isStreamMode={isStreamMode}
                            handleVideoUpload={handleVideoUpload}
                            handleStartScreenCapture={handleStartScreenCapture}
                            handleStopScreenCapture={handleStopScreenCapture}
                            isNativeMode={isNativeMode}
                            handleStartNativeCapture={handleStartNativeCapture}
                            handleStopNativeCapture={handleStopNativeCapture}
                            nativeCapture={nativeCapture}
                            isLiveActive={isLiveActive}
                            enableOrderId={enableOrderId}
                            setEnableOrderId={setEnableOrderId}
                            balDecimalPlaces={balDecimalPlaces}
                            setBalDecimalPlaces={v => usePhase4Store.getState().setBalDecimalPlaces(v)}
                            template={template}
                            propGridRows={propGridRows}
                            propGridCols={propGridCols}
                            propHasMultiplierReel={propHasMultiplierReel}
                            onVideoEnded={handleVideoEnded}
                        />

                        <DetectionControlBar
                            isLiveActive={isLiveActive}
                            videoSrc={videoSrc}
                            onStartLive={handleStartLive}
                            onStopLive={handleStopLive}
                            onManualCapture={handleManualCapture}
                            useWinFrame={useWinFrame}
                            onToggleUseWinFrame={handleToggleUseWinFrame}
                            enableWinTracker={enableWinTracker}
                            setEnableWinTracker={setEnableWinTracker}
                            hasRollingWin={hasRollingWin}
                            setHasRollingWin={setHasRollingWin}
                            enableEmptyBoardFilter={enableEmptyBoardFilter}
                            setEnableEmptyBoardFilter={setEnableEmptyBoardFilter}
                        />

                        <SavePanel
                            rootSaveDirHandle={rootSaveDirHandle}
                            setRootSaveDirHandle={setRootSaveDirHandle}
                            saveDirHandle={saveDirHandle}
                            setSaveDirHandle={setSaveDirHandle}
                            saveCount={saveCount}
                            saveFormat={saveFormat}
                            setSaveFormat={setSaveFormat}
                            handlePickSaveDir={handlePickSaveDir}
                            candidates={candidates}
                            exportHTMLReport={exportHTMLReport}
                            onImportSession={onImportSession}
                            template={template}
                        />
                    </div>

                    {/* ══ 右側面板 ══ */}
                    <div className="lg:col-span-4 flex flex-col">
                        <div className="bg-slate-50 rounded-xl border border-slate-200 flex flex-col h-full overflow-hidden shadow-sm">

                            <DiagnosticDashboard
                                stats={stats}
                                diagnosticStats={diagnosticStats}
                                wrongWinGroupIds={wrongWinGroupIds}
                                nonZeroWinGroupIds={nonZeroWinGroupIds}
                                scrollToNextBreak={scrollToNextBreak}
                                scrollToNextWrongWin={scrollToNextWrongWin}
                                scrollToNextNonZeroWin={scrollToNextNonZeroWin}
                                currentBreakIndex={currentBreakIndex}
                                currentWrongWinIndex={currentWrongWinIndex}
                                currentNonZeroWinIndex={currentNonZeroWinIndex}
                            />

                            <SpinGroupList
                                candidates={candidates}
                                groupsWithMath={groupsWithMath}
                                clearCandidates={clearCandidates}
                                recognizedCount={recognizedCount}
                                errorCount={errorCount}
                                editingOcr={editingOcr}
                                setEditingOcr={setEditingOcr}
                                updateCandidate={updateCandidate}
                                updateCandidateOcr={updateCandidateOcr}
                                handleCardClick={handleCardClick}
                                onTransferToPhase3={onTransferToPhase3}
                                removeCandidate={removeCandidate}
                                setManualBestCandidate={setManualBestCandidate}
                                recognizeLocalBatch={recognizeLocalBatch}
                                ocrDecimalPlaces={ocrDecimalPlaces}
                                listEndRef={listEndRef}
                            />

                            <ActionPanel
                                candidates={candidates}
                                smartDedup={smartDedup}
                                handleConfirmDedup={handleConfirmDedup}
                                template={template}
                                enableBidirectional={enableBidirectional}
                                setEnableBidirectional={setEnableBidirectional}
                                isRecognizing={isRecognizing}
                                isStopping={isStopping}
                                recognitionProgress={recognitionProgress}
                                recognizeBatch={recognizeBatch}
                                recognizeLocalBatch={recognizeLocalBatch}
                                cancelRecognition={cancelRecognition}
                                ocrDecimalPlaces={ocrDecimalPlaces}
                                winPendingCount={winPendingCount}
                                brokenGroupIds={brokenGroupIds}
                                handleHealBreaksGlobally={handleHealBreaksGlobally}
                            />

            <PreviewLightbox previewImage={previewImage} onClose={() => setPreviewImage(null)} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Phase4Video;
