import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Video, Scan, Play, Trash2, Send, Sparkles, ChevronDown, ChevronUp, Download, BarChart3, ImageIcon, Square, Camera, Link2, AlertCircle, Star, Monitor, FolderOpen, CheckCircle2, X } from 'lucide-react';
import CandidateCard from './phase4/CandidateCard';
import CardErrorBoundary from './phase4/CardErrorBoundary';
import ActionPanel from './phase4/ActionPanel';
import DiagnosticDashboard from './phase4/DiagnosticDashboard';
import VideoPlayer from './phase4/VideoPlayer';
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
}) => {
    // ── 從 Zustand Store 取得 ROI 與偵測參數 ──
    const reelROI = usePhase4Store(s => s.reelROI);
    const winROI = usePhase4Store(s => s.winROI);
    const balanceROI = usePhase4Store(s => s.balanceROI);
    const betROI = usePhase4Store(s => s.betROI);
    const orderIdROI = usePhase4Store(s => s.orderIdROI);
    const multiplierROI = usePhase4Store(s => s.multiplierROI);
    const ocrDecimalPlaces = usePhase4Store(s => s.ocrDecimalPlaces);
    const enableBidirectional = usePhase4Store(s => s.enableBidirectional);
    const setEnableBidirectional = usePhase4Store(s => s.setEnableBidirectional);
    // ── 本地狀態 ──
    const [isLiveActive, setIsLiveActive] = useState(false);
    const listEndRef = useRef(null);
    const [lastAddedManualId, setLastAddedManualId] = useState(null);
    const [previewImage, setPreviewImage] = useState(null); // { url, url2?, time, time2? }
    const [enableOrderId, setEnableOrderId] = useState(true); // 是否啟用注單號 OCR
    const [editingOcr, setEditingOcr] = useState(null); // { id: string, field: 'win'|'bet'|'balance', value: string }
    const [fgType, setFgType] = useState('A'); // 'A' = 贏分延續型, 'B' = 贏分歸零型, 'none' = 無FG
    const [useWinFrame, setUseWinFrame] = useState(true); // true = 用 WIN 截圖辨識, false = 用停輪截圖辨識

    // ── 卡片點擊：影片模式=跳轉時間點，串流模式/無影片=開圖片預覽 ──
    const handleCardClick = useCallback((kf) => {
        if (isStreamMode || !videoSrc) {
            // 串流模式或無影片來源時：開全幀截圖預覽
            const reelUrl = kf.canvas ? kf.canvas.toDataURL('image/jpeg', 0.9) : kf.thumbUrl;
            const winUrl = kf.winPollCanvas ? kf.winPollCanvas.toDataURL('image/jpeg', 0.9) : (kf.winPollThumbUrl || null);
            setPreviewImage({
                url: reelUrl,
                url2: winUrl,
                time: kf.reelStopTime || kf.time,
                time2: kf.winPollTime || null
            });
        } else {
            // 影片模式：根據當前顯示的截圖類型跳到對應時間點
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

    // ── 卡片渲染已抽離至 CandidateCard 元件 ──
    // ── 影片播放器已抽離至 VideoPlayer 元件 ──
    // ── ROI 拖曳已抽離至 useROIDrag hook ──

    // ── VideoPlayer 影片結束回呼 ──
    const handleVideoEnded = useCallback(() => {
        setIsLiveActive(false);
        stopLiveDetection();
    }, [stopLiveDetection]);

    // ── 操作處理 ──
    const scanOpts = { winROI, balanceROI, betROI, orderIdROI: enableOrderId ? orderIdROI : null, multiplierROI: template?.hasMultiplierReel ? multiplierROI : null, ocrDecimalPlaces, requireStableWin: false, sliceCols: template?.cols || propGridCols || 5 };

    const handleStartLive = async () => {
        if (!videoRef.current || !reelROI) return;
        
        // 如果有綁定根目錄，每次偵測都自動建一個 Timestamp 的子資料夾
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
        // 只有當陣列長度增加（有新卡片加入）時才執行
        if (candidates.length > prevLengthRef.current) {
            if (lastAddedManualId) {
                // 情境 1：手動截圖。滾動到指定卡片，不要滾到底部
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
                // 情境 2：即時偵測。自動追加到底部，視角平滑跟蹤到底部
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

    const handleHealSingleBreak = (gid) => {
        healBreaks([parseInt(gid)], scanOpts);
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
                            template={template}
                            propGridRows={propGridRows}
                            propGridCols={propGridCols}
                            propHasMultiplierReel={propHasMultiplierReel}
                            onVideoEnded={handleVideoEnded}
                        />

                                {/* 影片主控與參數欄 — 始終顯示 */}
                                <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm">
                                    <button onClick={isLiveActive ? handleStopLive : handleStartLive}
                                        disabled={!videoSrc}
                                        className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md ${isLiveActive ? 'bg-rose-600 text-white animate-pulse shadow-rose-200' : !videoSrc ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200 active:scale-95'}`}>
                                        {isLiveActive ? (
                                            <><Square size={16} fill="currentColor" /> 停止偵測</>
                                        ) : (
                                            <><Play size={18} fill="currentColor" /> 開始即時偵測</>
                                        )}
                                    </button>

                                    <button onClick={() => {
                                        const newId = addManualCandidate(videoRef.current, reelROI, scanOpts);
                                        if (newId) setLastAddedManualId(newId);
                                    }}
                                        disabled={!videoSrc}
                                        className="h-full px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-white text-slate-700 hover:bg-slate-100 border-2 border-slate-200 active:scale-95 shadow-sm">
                                        <Camera size={16} className="text-amber-500" /> 手動截圖
                                    </button>

                                    <div className="flex flex-wrap items-center gap-3 ml-auto border-l border-slate-200 pl-4">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[10px] font-bold text-slate-400">辨識來源</span>
                                            <button onClick={() => {
                                                const val = !useWinFrame;
                                                setUseWinFrame(val);
                                                candidates.forEach(kf => updateCandidate(kf.id, { useWinFrame: val }));
                                            }}
                                                className={`h-7 flex items-center gap-1.5 px-3 rounded-lg text-xs font-bold shadow-sm cursor-pointer transition-all active:scale-95 ${
                                                    useWinFrame
                                                        ? 'bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100'
                                                        : 'bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-200'
                                                }`}>
                                                {useWinFrame ? '🏆 WIN截圖' : '🎰 停輪截圖'}
                                            </button>
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[10px] font-bold text-slate-400">FG 模式</span>
                                            <select value={fgType} onChange={e => setFgType(e.target.value)}
                                                className="h-7 px-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold shadow-sm cursor-pointer outline-none">
                                                <option value="A">A 贏分延續</option>
                                                <option value="B">B 贏分歸零</option>
                                                <option value="none">無 FG</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* 存檔與資料管理區塊 (移自 ActionPanel) */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* 自動存檔區塊 */}
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                                        {!rootSaveDirHandle ? (
                                            <button onClick={handlePickSaveDir}
                                                className="w-full py-3 rounded-xl font-black flex flex-col items-center justify-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 border border-orange-600 transition-all active:scale-95 text-sm shadow-md animate-pulse-slow">
                                                <div className="flex items-center gap-2"><FolderOpen size={16} /> 設定靜默存檔目錄</div>
                                                <div className="text-[10px] font-normal opacity-90">(必選，點開始分析自動建子資料夾)</div>
                                            </button>
                                        ) : (
                                            <div className="flex flex-col gap-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                                                <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                                                    <div className="flex items-center gap-1">
                                                        <CheckCircle2 size={14} />
                                                        <span>根目錄綁定成功</span>
                                                    </div>
                                                    <span className="truncate max-w-[120px] bg-white px-2 py-0.5 rounded shadow-sm border border-emerald-100" title={rootSaveDirHandle.name}>{rootSaveDirHandle.name}</span>
                                                </div>
                                                {saveDirHandle && (
                                                    <div className="text-[10px] text-emerald-600 flex justify-between items-center bg-white/50 px-2 rounded">
                                                        <span>↳ 本局目標：{saveDirHandle.name}</span>
                                                        <span>(已存 {saveCount} 張)</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 mt-1">
                                                    <select
                                                        value={saveFormat}
                                                        onChange={e => setSaveFormat(e.target.value)}
                                                        className="flex-1 bg-white border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg px-2 py-1.5 outline-none cursor-pointer">
                                                        <option value="jpeg">JPEG (省)</option>
                                                        <option value="png">PNG (無損)</option>
                                                    </select>
                                                    <button onClick={handlePickSaveDir}
                                                        className="flex-1 py-1.5 rounded-lg font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-all text-xs text-center shadow-sm" title="更換根目錄">
                                                        更換根目錄
                                                    </button>
                                                    <button onClick={() => { setRootSaveDirHandle(null); setSaveDirHandle(null); }}
                                                        className="flex items-center justify-center min-w-[32px] h-[32px] rounded-lg bg-white border border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer shadow-sm" title="取消綁定並停止存檔">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 匯出 & 傳送區塊 */}
                                    <div className="flex flex-col gap-2 justify-center">
                                        <button onClick={() => exportHTMLReport(candidates, template?.name || 'slot_analysis', saveDirHandle)}
                                            disabled={!candidates.some(c => c.ocrData || c.recognitionResult)}
                                            className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-1.5 text-sm transition-all shadow-sm ${!candidates.some(c => c.ocrData || c.recognitionResult) ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 active:scale-95'}`}>
                                            <ImageIcon size={16} /> 匯出報告 + JSON
                                        </button>
                                        <button onClick={onImportSession}
                                            className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-1.5 text-sm transition-all bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-200 active:scale-95 shadow-sm">
                                            <FolderOpen size={16} /> 匯入歷史資料（選取資料夾）
                                        </button>
                                    </div>
                                </div>
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

                            {/* 候選幀列表 Header */}
                            <div className="px-4 py-2 border-b bg-white flex items-center justify-between sticky top-0 z-10 shadow-sm">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2 text-xs">
                                    <Scan size={14} className="text-indigo-500" /> 候選關鍵幀
                                    <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-[10px]">{candidates.length}</span>
                                    {recognizedCount > 0 && <span className="bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full text-[10px]">✓{recognizedCount}</span>}
                                    {errorCount > 0 && <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full text-[10px]">✗{errorCount}</span>}
                                </h3>
                                {candidates.length > 0 && (
                                    <button onClick={clearCandidates} className="text-slate-400 hover:text-rose-500 p-1 transition-colors" title="清除全部">
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>

                            {/* 候選幀列表 */}
                            <div className="overflow-y-auto p-3 space-y-2 custom-scrollbar" style={{ height: '450px' }}>
                                {candidates.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-300 opacity-60">
                                        <Scan size={48} className="mb-4 stroke-[1px]" />
                                        <p className="text-xs text-center">
                                            點擊「開始即時偵測」
                                        </p>
                                    </div>
                                ) : (
                                    (() => {
                                        const groupColorPalette = [
                                            { border: '#818cf8', bg: 'rgba(238,242,255,0.6)' },
                                            { border: '#fbbf24', bg: 'rgba(255,251,235,0.6)' },
                                            { border: '#22d3ee', bg: 'rgba(236,254,255,0.6)' },
                                            { border: '#f472b6', bg: 'rgba(253,242,248,0.6)' },
                                            { border: '#a3e635', bg: 'rgba(247,254,231,0.6)' },
                                        ];

                                        // groupsWithMath 和 brokenGroupIds 已在元件頂層用 useMemo 計算

                                        if (!groupsWithMath) {
                                            return candidates.map((kf, idx) => (
                                                <CandidateCard
                                                    key={kf.id} kf={kf} idx={idx}
                                                    editingOcr={editingOcr} setEditingOcr={setEditingOcr}
                                                    updateCandidate={updateCandidate} updateCandidateOcr={updateCandidateOcr}
                                                    handleCardClick={handleCardClick}
                                                    onTransferToPhase3={onTransferToPhase3}
                                                    removeCandidate={removeCandidate}
                                                />
                                            ));
                                        }

                                        return groupsWithMath.map(({ gid, group, mathValid, mathDiff, expectedBase, nextBase, isFGSequence }, listIndex) => {
                                            const isMulti = group.length > 1;
                                            const parsedGid = parseInt(gid);
                                            const palette = isNaN(parsedGid) 
                                                ? { border: '#cbd5e1', bg: 'rgba(248,250,252,0.6)' } 
                                                : groupColorPalette[parsedGid % groupColorPalette.length];
                                            return (
                                                <div id={`spin-group-${gid}`} key={`spin-${gid}-${listIndex}`}
                                                    className="rounded-xl p-1.5 space-y-1.5"
                                                    style={{ borderLeft: `4px solid ${palette.border}`, backgroundColor: palette.bg }}
                                                >
                                                    <div className="text-[13px] font-bold px-1 flex flex-wrap items-center gap-2 mb-1 pb-1 border-b border-slate-200/50">
                                                        {isFGSequence ? (
                                                            <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded shadow-sm flex items-center gap-1">🔥 免遊序列</span>
                                                        ) : (
                                                            <span className="text-slate-500 opacity-60 bg-slate-100 px-2 py-0.5 rounded shadow-sm">{isMulti ? '同局' : '單局'}</span>
                                                        )}
                                                        
                                                        {expectedBase !== null && (
                                                            mathValid ? (
                                                                <span className="text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm" title={`與上局符合 (推算本局結餘 = ${nextBase?.toFixed(2)})`}>
                                                                    <Link2 size={14} /> 連續
                                                                </span>
                                                            ) : (
                                                                <div className="flex items-center gap-1.5 group/break">
                                                                    <span className="text-rose-600 bg-rose-100/80 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm" title={`預期起始: ${expectedBase.toFixed(2)}`}>
                                                                        <AlertCircle size={14} /> 斷層 {mathDiff !== 0 && `(${mathDiff > 0 ? '+' : ''}${mathDiff.toFixed(2)})`}
                                                                    </span>
                                                                </div>
                                                            )
                                                        )}
                                                        
                                                        <span className="ml-auto text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full shadow-sm">{group.length} 張</span>
                                                        <button onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            const bestKf = group.find(g => g.kf.isSpinBest)?.kf || group[group.length - 1].kf;
                                                            recognizeLocalBatch(ocrDecimalPlaces, [bestKf]); 
                                                        }}
                                                            title="本地辨識這局最佳結果"
                                                            className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-full text-[10px] font-bold border border-indigo-200 transition-all active:scale-95 shadow-sm">
                                                            <Monitor size={10} /> 本地
                                                        </button>
                                                        <button onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            const bestKf = group.find(g => g.kf.isSpinBest)?.kf || group[group.length - 1].kf;
                                                            onTransferToPhase3([bestKf]); 
                                                        }}
                                                            title="送這局最佳結果到 Phase 3"
                                                            className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-full text-[10px] font-bold border border-emerald-200 transition-all active:scale-95 shadow-sm">
                                                            <Send size={10} /> P3
                                                        </button>
                                                    </div>
                                                    {group.map(({ kf, idx }) => {
                                                        const isBest = kf.isSpinBest;
                                                        const hasBeenGrouped = kf.isSpinBest !== undefined; // smartDedup 有跑過
                                                        const isDimmed = isMulti && !isBest;
                                                        return (
                                                            <CardErrorBoundary key={`eb-${kf.id}`}>
                                                            <CandidateCard
                                                                key={kf.id} kf={kf} idx={idx}
                                                                editingOcr={editingOcr} setEditingOcr={setEditingOcr}
                                                                updateCandidate={updateCandidate} updateCandidateOcr={updateCandidateOcr}
                                                                handleCardClick={handleCardClick}
                                                                onTransferToPhase3={onTransferToPhase3}
                                                                removeCandidate={removeCandidate}
                                                                isBest={isBest}
                                                                hasBeenGrouped={hasBeenGrouped}
                                                                isDimmed={isDimmed}
                                                                setManualBestCandidate={setManualBestCandidate}
                                                            />
                                                            </CardErrorBoundary>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        });
                                    })()
                                )}
                                <div ref={listEndRef} />
                            </div>

                                <ActionPanel
                                    candidates={candidates}
                                    smartDedup={smartDedup}
                                    fgType={fgType}
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
