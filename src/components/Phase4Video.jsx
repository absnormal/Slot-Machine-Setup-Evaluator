import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Video, Scan, Play, Pause, Trash2, Send, Settings2, Sparkles, ChevronDown, ChevronUp, Image as ImageIcon, History, Clock, X, AlertCircle, FlaskConical } from 'lucide-react';

const Phase4Video = ({
    isPhase4Minimized, setIsPhase4Minimized,
    onToggle,
    videoSrc, videoRef, handleVideoUpload,
    isAutoDetecting, setIsAutoDetecting,
    sensitivity, setSensitivity,
    motionCoverageMin, setMotionCoverageMin,
    motionDelay, setMotionDelay,
    capturedImages, removeCapturedImage, clearAllCaptures,
    reelROI, setReelROI,
    winROI, setWinROI,
    balanceROI, setBalanceROI,
    betROI, setBetROI,
    captureCurrentFrame,
    onTransferToPhase3,
    setTemplateMessage,
    template,
    debugData,
    vLineThreshold, setVLineThreshold,
    ocrDecimalPlaces, setOcrDecimalPlaces,
    runCalibration
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [showDebug, setShowDebug] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [dragState, setDragState] = useState(null);
    const [roiMode, setRoiMode] = useState('reel'); // 'reel', 'win', 'balance', 'bet'
    const containerRef = useRef(null);
    const listEndRef = useRef(null);

    // OCR 數值交叉驗證
    const captureValidation = useMemo(() => {
        const parseNum = (v) => {
            if (!v || v === '...' || v === 'Err') return null;
            // OCR 端已處理千分號，這裡直接 parseFloat
            const n = parseFloat(String(v));
            return isNaN(n) ? null : n;
        };
        return capturedImages.map((img, idx) => {
            if (idx === 0) return null; // 第一張沒有前一張可比
            const prev = capturedImages[idx - 1];
            const prevTotal = parseNum(prev.extractedBalance);
            const prevWin = parseNum(prev.extractedWin);
            const curTotal = parseNum(img.extractedBalance);
            const curBet = parseNum(img.extractedBet);
            if (prevTotal === null || curTotal === null || curBet === null) return null;

            let expected;
            const prevSource = prev.triggerSource || '';
            if (prevSource.includes('WIN')) {
                // WIN → 任何：期望 = 前總分 + 前贏分 - BET
                if (prevWin === null) return null;
                expected = prevTotal + prevWin - curBet;
            } else {
                // BAL/保底/手動 → 任何：期望 = 前總分 - BET
                expected = prevTotal - curBet;
            }
            const diff = Math.abs(curTotal - expected);
            return { expected, diff, ok: diff < 0.01 };
        });
    }, [capturedImages]);

    // 自動滾動清單到底部 (侷限在容器內)
    useEffect(() => {
        if (listEndRef.current) {
            // 使用 nearest 或手動設定 scrollTop 可避免滾動整個網頁
            listEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [capturedImages.length]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const updateTime = () => setCurrentTime(video.currentTime);
        const updateDuration = () => setDuration(video.duration);
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        video.addEventListener('timeupdate', updateTime);
        video.addEventListener('loadedmetadata', updateDuration);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);

        return () => {
            video.removeEventListener('timeupdate', updateTime);
            video.removeEventListener('loadedmetadata', updateDuration);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
        };
    }, [videoSrc, videoRef, setIsAutoDetecting]);

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) videoRef.current.pause();
        else videoRef.current.play();
    };

    const handleSeek = (e) => {
        const time = parseFloat(e.target.value);
        if (videoRef.current) videoRef.current.currentTime = time;
        setCurrentTime(time);
    };

    const formatTime = (time) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getMousePos = (e) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        return { x, y };
    };

    const handleMouseDown = (e) => {
        const pos = getMousePos(e);
        const handleSize = 5;

        let targetROI, setTargetROI;
        if (roiMode === 'win') { targetROI = winROI; setTargetROI = setWinROI; }
        else if (roiMode === 'balance') { targetROI = balanceROI; setTargetROI = setBalanceROI; }
        else if (roiMode === 'bet') { targetROI = betROI; setTargetROI = setBetROI; }
        else { targetROI = reelROI; setTargetROI = setReelROI; }

        const isOverHandle = pos.x >= targetROI.x + targetROI.w - handleSize && pos.x <= targetROI.x + targetROI.w &&
            pos.y >= targetROI.y + targetROI.h - handleSize && pos.y <= targetROI.y + targetROI.h;

        setDragState({
            action: isOverHandle ? 'resize' : 'move',
            startX: pos.x,
            startY: pos.y,
            initObj: { ...targetROI },
            setter: setTargetROI
        });
    };

    const handleMouseMove = (e) => {
        if (!dragState) return;
        const pos = getMousePos(e);
        const dx = pos.x - dragState.startX;
        const dy = pos.y - dragState.startY;

        if (dragState.action === 'move') {
            dragState.setter({
                ...dragState.initObj,
                x: Math.max(0, Math.min(100 - dragState.initObj.w, dragState.initObj.x + dx)),
                y: Math.max(0, Math.min(100 - dragState.initObj.h, dragState.initObj.y + dy))
            });
        } else if (dragState.action === 'resize') {
            dragState.setter({
                ...dragState.initObj,
                w: Math.max(0.5, Math.min(100 - dragState.initObj.x, dragState.initObj.w + dx)),
                h: Math.max(0.5, Math.min(100 - dragState.initObj.y, dragState.initObj.h + dy))
            });
        }
    };

    const handleMouseUp = () => setDragState(null);

    // 渲染 ROI 內的格線 (2px amber-400)
    const renderGridLines = () => {
        const rows = template?.GridRows || 3;
        const cols = template?.GridCols || 5;
        const lines = [];

        for (let i = 1; i < cols; i++) {
            lines.push(
                <div key={`v-${i}`} className="absolute h-full border-r-2 border-amber-400/60" style={{ left: `${(i / cols) * 100}%` }} />
            );
        }
        for (let i = 1; i < rows; i++) {
            lines.push(
                <div key={`h-${i}`} className="absolute w-full border-b-2 border-amber-400/60" style={{ top: `${(i / rows) * 100}%` }} />
            );
        }
        return lines;
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Minimized Header / Toggle Bar */}
            <div
                className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors bg-white"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                        {isPhase4Minimized ? <Video size={20} /> : <Scan size={20} />}
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">
                            Phase 4: 影片動態自動擷取
                        </h2>
                        <p className="text-xs text-slate-500">
                            {isPhase4Minimized ? '格點動態偵測模式 (已最小化)' : '基於盤面格點位移覆蓋率 (Coverage) 偵測轉動與停止'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isPhase4Minimized && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowDebug(!showDebug); }}
                            className={`p-2 rounded-lg transition-all active:scale-95 flex items-center gap-2 text-xs font-bold shadow-sm ${showDebug ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            <Settings2 size={16} /> 除錯儀表板: {showDebug ? 'ON' : 'OFF'}
                        </button>
                    )}
                    <div className="cursor-pointer p-1 hover:bg-slate-100 rounded-full transition-colors">
                        {isPhase4Minimized ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-slate-400" />}
                    </div>
                </div>
            </div>

            {/* Main Content Area - Hidden Display but keeps Video in DOM */}
            <div className={`p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 ${isPhase4Minimized ? 'hidden' : ''}`}>
                <div className="lg:col-span-8 space-y-4">
                    {!videoSrc ? (
                        <div className="aspect-video bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center p-12 transition-all hover:bg-slate-50 hover:border-indigo-300 group">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md mb-6 group-hover:scale-110 transition-transform">
                                <Video size={32} className="text-indigo-500" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-700 mb-2">上傳影片以開始偵測</h3>
                            <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 cursor-pointer transition-all active:scale-95 mt-4">
                                選擇影片檔案
                                <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                            </label>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="relative rounded-2xl shadow-2xl bg-black group flex flex-col items-center overflow-hidden">
                                {/* 頂部 ROI 切換器 */}
                                <div className="absolute top-4 right-4 z-40 bg-slate-900/80 backdrop-blur-md p-1 rounded-lg border border-white/20 shadow-xl flex gap-1">
                                    <button
                                        onClick={() => setRoiMode('reel')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${roiMode === 'reel' ? 'bg-amber-500 text-white ring-2 ring-amber-300 ring-offset-2' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${roiMode === 'reel' ? 'bg-white' : 'bg-amber-400 animate-pulse'}`}></div>
                                        REEL
                                    </button>
                                    <button
                                        onClick={() => setRoiMode('win')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${roiMode === 'win' ? 'bg-emerald-500 text-white ring-2 ring-emerald-300 ring-offset-2' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${roiMode === 'win' ? 'bg-white' : 'bg-emerald-400 animate-pulse'}`}></div>
                                        WIN
                                    </button>
                                    <button
                                        onClick={() => setRoiMode('balance')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${roiMode === 'balance' ? 'bg-sky-500 text-white ring-2 ring-sky-300 ring-offset-2' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${roiMode === 'balance' ? 'bg-white' : 'bg-sky-400 animate-pulse'}`}></div>
                                        BALANCE
                                    </button>
                                    <button
                                        onClick={() => setRoiMode('bet')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${roiMode === 'bet' ? 'bg-cyan-500 text-white ring-2 ring-cyan-300 ring-offset-2' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${roiMode === 'bet' ? 'bg-white' : 'bg-cyan-400 animate-pulse'}`}></div>
                                        BET
                                    </button>
                                </div>

                                <div
                                    className="relative inline-block"
                                    ref={containerRef}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                                    onMouseDown={handleMouseDown}
                                >
                                    <video ref={videoRef} src={videoSrc} className="max-w-full max-h-[70vh] block" />

                                    {/* 1. 盤面 ROI (Amber) */}
                                    <div
                                        className={`absolute border-2 border-amber-400 transition-opacity ${roiMode === 'reel' ? 'opacity-100 pointer-events-auto cursor-move bg-amber-400/10' : 'opacity-40 pointer-events-none'}`}
                                        style={{
                                            left: `${reelROI.x}%`,
                                            top: `${reelROI.y}%`,
                                            width: `${reelROI.w}%`,
                                            height: `${reelROI.h}%`,
                                            zIndex: roiMode === 'reel' ? 20 : 10
                                        }}
                                        onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e); }}
                                    >
                                        <div className="absolute inset-0 grid grid-cols-5 grid-rows-3">
                                            {[...Array(14)].map((_, i) => (
                                                <div key={i} className="border-[0.5px] border-amber-400/30"></div>
                                            ))}
                                        </div>
                                        {roiMode === 'reel' && <div className="absolute -right-1 -bottom-1 w-4 h-4 bg-amber-500 rounded-full border-2 border-white pointer-events-auto cursor-nwse-resize shadow-md" />}
                                        <div className="absolute -top-5 left-0 bg-amber-500 text-white text-[10px] px-1 rounded shadow-sm">盤面</div>
                                    </div>

                                    {/* 2. 贏分 ROI (Emerald) */}
                                    <div
                                        className={`absolute border-2 border-emerald-400 transition-opacity ${roiMode === 'win' ? 'opacity-100 pointer-events-auto cursor-move bg-emerald-400/10' : 'opacity-40 pointer-events-none'}`}
                                        style={{
                                            left: `${winROI.x}%`,
                                            top: `${winROI.y}%`,
                                            width: `${winROI.w}%`,
                                            height: `${winROI.h}%`,
                                            zIndex: roiMode === 'win' ? 20 : 10
                                        }}
                                        onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e); }}
                                    >
                                        {roiMode === 'win' && <div className="absolute -right-1 -bottom-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white pointer-events-auto cursor-nwse-resize shadow-md" />}
                                        <div className="absolute -top-5 left-0 bg-emerald-500 text-white text-[10px] px-1 rounded shadow-sm">贏分</div>
                                    </div>

                                    {/* 3. 餘額 ROI (Sky) */}
                                    <div
                                        className={`absolute border-2 border-sky-400 transition-opacity ${roiMode === 'balance' ? 'opacity-100 pointer-events-auto cursor-move bg-sky-400/10' : 'opacity-40 pointer-events-none'}`}
                                        style={{
                                            left: `${balanceROI.x}%`,
                                            top: `${balanceROI.y}%`,
                                            width: `${balanceROI.w}%`,
                                            height: `${balanceROI.h}%`,
                                            zIndex: roiMode === 'balance' ? 20 : 10
                                        }}
                                        onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e); }}
                                    >
                                        {roiMode === 'balance' && <div className="absolute -right-1 -bottom-1 w-4 h-4 bg-sky-500 rounded-full border-2 border-white pointer-events-auto cursor-nwse-resize shadow-md" />}
                                        <div className="absolute -top-5 left-0 bg-sky-500 text-white text-[10px] px-1 rounded shadow-sm">總分</div>
                                    </div>

                                    {/* 4. BET ROI (Cyan) */}
                                    <div
                                        className={`absolute border-2 border-cyan-400 transition-opacity ${roiMode === 'bet' ? 'opacity-100 pointer-events-auto cursor-move bg-cyan-400/10' : 'opacity-40 pointer-events-none'}`}
                                        style={{
                                            left: `${betROI.x}%`,
                                            top: `${betROI.y}%`,
                                            width: `${betROI.w}%`,
                                            height: `${betROI.h}%`,
                                            zIndex: roiMode === 'bet' ? 20 : 10
                                        }}
                                        onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e); }}
                                    >
                                        {roiMode === 'bet' && <div className="absolute -right-1 -bottom-1 w-4 h-4 bg-cyan-500 rounded-full border-2 border-white pointer-events-auto cursor-nwse-resize shadow-md" />}
                                        <div className="absolute -top-5 left-0 bg-cyan-500 text-white text-[10px] px-1 rounded shadow-sm">押分</div>
                                    </div>
                                </div>

                                <div className="w-full bg-slate-900/90 backdrop-blur p-3 px-5 flex items-center gap-4 border-t border-white/10">
                                    <button onClick={togglePlay} className="text-white hover:text-amber-400 transition-colors">
                                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                                    </button>

                                    {/* 換影片按鈕 */}
                                    <button
                                        onClick={() => {
                                            const input = document.createElement('input');
                                            input.type = 'file';
                                            input.accept = 'video/*';
                                            input.onchange = handleVideoUpload;
                                            input.click();
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-lg text-xs font-bold transition-all border border-slate-200 active:scale-95"
                                    >
                                        <div className="w-4 h-4 flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 13 5.23 3.41c.33.22.77-.02.77-.41V8c0-.39-.44-.63-.77-.41L16 11V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2z" /></svg>
                                        </div>
                                        換影片
                                    </button>
                                    <div className="flex-1 flex items-center gap-3">
                                        <span className="text-[10px] font-mono text-slate-400">{formatTime(currentTime)}</span>
                                        <input type="range" min="0" max={duration || 0} step="0.1" value={currentTime} onChange={handleSeek} className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                                        <span className="text-[10px] font-mono text-slate-400">{formatTime(duration)}</span>
                                    </div>
                                </div>

                                {showDebug && (
                                    <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md text-white p-3 rounded-xl border border-white/20 z-30 font-mono text-[10px] space-y-1 min-w-[160px] shadow-2xl">
                                        <div className="flex justify-between border-b border-white/10 pb-1 mb-1 font-bold text-amber-400">
                                            <span>MOTION DEBUG</span>
                                            <span className="animate-pulse">●</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">STATUS:</span>
                                            <span className={`${debugData.status === 'IDLE' ? 'text-slate-400' : 'text-amber-400 font-bold'}`}>{debugData.status}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400 text-xs">DIFF (AVG):</span>
                                            <span className="text-amber-400 text-xs font-bold">{debugData.diff}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400 text-xs">COVERAGE:</span>
                                            <span className={`${parseFloat(debugData.coverage) > motionCoverageMin ? 'text-green-400' : 'text-white'} text-xs font-bold`}>{debugData.coverage}%</span>
                                        </div>
                                        <div className="pt-1 mt-1 border-t border-white/10 space-y-1">
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">COVERAGE THRES:</span>
                                                <span className="text-amber-300">{motionCoverageMin}%</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-500 text-[10px]">DELAY:</span>
                                                <span className="text-amber-300 text-[10px]">{motionDelay}ms</span>
                                            </div>
                                            <div className="pt-1 mt-1 border-t border-white/5 space-y-1">
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-slate-500">V-LINE %:</span>
                                                    <span className="text-amber-400 font-mono italic">{debugData.vLineRate}%</span>
                                                </div>
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-slate-500 font-bold">RATIO:</span>
                                                    <span className={`font-mono ${debugData.isBigWin ? 'text-rose-400' : 'text-amber-400'}`}>{debugData.ratio}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[10px]">
                                                    <span className="text-slate-500 uppercase tracking-tighter">BigWin Lock:</span>
                                                    <span className={`px-1 rounded-sm text-[9px] font-black ${debugData.isBigWin ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-700 text-slate-500'}`}>
                                                        {debugData.isBigWin ? 'LOCKED' : 'READY'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="pt-1 mt-1 border-t border-white/5 space-y-1">
                                            <div className="flex justify-between items-center text-[10px]">
                                                <span className="text-slate-500">💰 WIN:</span>
                                                <span className={`px-1 rounded-sm text-[9px] font-black ${debugData.isWinChanged ? 'bg-green-500 text-white animate-pulse' : 'bg-slate-700 text-slate-500'}`}>
                                                    {debugData.isWinChanged ? '●' : '○'} {debugData.winDiff ?? 0}px
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px]">
                                                <span className="text-slate-500">💳 BAL:</span>
                                                <span className={`px-1 rounded-sm text-[9px] font-black ${debugData.isBalChanged ? 'bg-blue-500 text-white animate-pulse' : 'bg-slate-700 text-slate-500'}`}>
                                                    {debugData.isBalChanged ? '●' : '○'} {debugData.balDiff ?? 0}px
                                                </span>
                                            </div>
                                        </div>
                                        {debugData.error && (
                                            <div className="bg-rose-500/20 border border-rose-500/50 text-rose-300 p-1 mt-2 rounded flex items-center gap-1">
                                                <AlertCircle size={10} /> {debugData.error}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 flex justify-between">
                                        位移靈敏度 (DIFF) <span>{sensitivity}%</span>
                                    </label>
                                    <input type="range" min="1" max="50" value={sensitivity} onChange={(e) => setSensitivity(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 flex justify-between">
                                        覆蓋率門檻 (COVERAGE) <span>{motionCoverageMin}%</span>
                                    </label>
                                    <input type="range" min="10" max="95" value={motionCoverageMin} onChange={(e) => setMotionCoverageMin(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 flex justify-between">
                                        判定延遲 (DELAY) <span>{motionDelay}ms</span>
                                    </label>
                                    <input type="range" min="100" max="1000" step="50" value={motionDelay} onChange={(e) => setMotionDelay(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 flex justify-between">
                                        線條消失門檻 (RATIO) <span>{vLineThreshold}</span>
                                    </label>
                                    <input type="range" min="0.1" max="1.0" step="0.05" value={vLineThreshold} onChange={(e) => setVLineThreshold(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 flex justify-between">
                                        OCR 小數位數 <span>{ocrDecimalPlaces === 0 ? '整數' : `${ocrDecimalPlaces}位`}</span>
                                    </label>
                                    <select 
                                        value={ocrDecimalPlaces} 
                                        onChange={(e) => setOcrDecimalPlaces(parseInt(e.target.value))}
                                        className="w-full h-[22px] bg-slate-100 text-slate-700 text-xs rounded border-none cursor-pointer focus:ring-0 px-2"
                                    >
                                        <option value={0}>0 (整數)</option>
                                        <option value={1}>1 位小數</option>
                                        <option value={2}>2 位小數</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-4 flex flex-col">
                    <div className="bg-slate-50 rounded-xl border border-slate-200 flex flex-col h-full overflow-hidden shadow-sm">
                        <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex flex-col gap-3 sticky top-0 z-20 shadow-sm">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="font-bold text-emerald-800 flex items-center gap-2 text-sm">
                                        <FlaskConical size={16} className="text-emerald-500" /> Ground Truth 參數推導
                                    </h3>
                                    <p className="text-[10px] text-emerald-700/80 mt-1 leading-relaxed">
                                        關閉自動偵測時，點擊右下角「手動擷取」收集停輪時刻。<br/>累積數張後，點擊下方按鈕回推完美擷取的最佳參數。
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={runCalibration}
                                disabled={capturedImages.length === 0}
                                className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm ${capturedImages.length === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95'}`}
                            >
                                <FlaskConical size={14} /> 從 ({capturedImages.length}) 張截圖精確推導參數
                            </button>
                        </div>

                        <div className="px-4 py-2 border-b bg-white flex items-center justify-between sticky top-[138px] z-10 shadow-sm">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2 text-xs">
                                <History size={14} className="text-indigo-500" /> 截圖歷史清單
                                <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-[10px]">{capturedImages.length}</span>
                            </h3>
                            {capturedImages.length > 0 && (
                                <button onClick={clearAllCaptures} className="text-slate-400 hover:text-rose-500 p-1 transition-colors" title="清除全部">
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>

                        <div className="overflow-y-auto p-4 space-y-3 custom-scrollbar" style={{ height: '460px' }}>
                            {capturedImages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-300 opacity-60">
                                    <History size={48} className="mb-4 stroke-[1px]" />
                                    <p className="text-xs">尚無動態擷取紀錄</p>
                                </div>
                            ) : (
                                capturedImages.map((img, idx) => (
                                    <div key={img.id} className="group relative bg-white rounded-xl border border-slate-200 p-2 shadow-sm hover:border-indigo-300 transition-all hover:shadow-md animate-in slide-in-from-bottom-2 min-h-[80px] overflow-hidden">
                                        <div className="flex gap-3 h-full items-center">
                                            <div className="w-24 h-16 bg-slate-900 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                                                <img src={img.thumbUrl || img.previewUrl} className="w-full h-full object-contain" />
                                            </div>
                                            <div className="flex-1 min-w-0 pr-6">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold text-slate-800 truncate max-w-[80px]">{img.file.name}</span>
                                                    <div className="flex items-center gap-1">
                                                        {img.triggerSource && img.triggerSource !== '手動' && (
                                                            <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                                                                img.triggerSource.includes('WIN') ? 'bg-emerald-100 text-emerald-700' :
                                                                img.triggerSource.includes('BAL') ? 'bg-blue-100 text-blue-700' :
                                                                'bg-amber-100 text-amber-700'
                                                            }`}>{img.triggerSource}</span>
                                                        )}
                                                        <span className="text-[10px] text-slate-400">#{idx + 1}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <Clock size={10} className="text-slate-400" />
                                                    <span className="text-[10px] font-mono text-slate-500">{img.timestamp}s</span>
                                                </div>
                                                {/* OCR 數據展示 */}
                                                <div className="grid grid-cols-3 gap-1 mt-1.5 pt-1.5 border-t border-slate-50">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] text-slate-400 font-medium lowercase">win</span>
                                                        <span className={`text-[10px] font-bold ${img.extractedWin === "..." ? "text-slate-300 animate-pulse" : "text-emerald-600"}`}>
                                                            {img.extractedWin || "0"}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] text-slate-400 font-medium lowercase">bet</span>
                                                        <span className={`text-[10px] font-bold ${img.extractedBet === "..." ? "text-slate-300 animate-pulse" : "text-cyan-600"}`}>
                                                            {img.extractedBet || "0"}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col text-right">
                                                        <span className="text-[8px] text-slate-400 font-medium lowercase">total</span>
                                                        <span className={`text-[10px] font-bold ${img.extractedBalance === "..." ? "text-slate-300 animate-pulse" : "text-sky-600"}`}>
                                                            {img.extractedBalance || "0"}
                                                        </span>
                                                    </div>
                                                </div>
                                                {/* 驗證結果 */}
                                                {captureValidation[idx] && (
                                                    <div className={`flex items-center justify-between mt-1 pt-1 border-t text-[8px] ${
                                                        captureValidation[idx].ok 
                                                            ? 'border-emerald-100 text-emerald-500' 
                                                            : 'border-rose-100 text-rose-500 bg-rose-50 -mx-1 px-1 rounded'
                                                    }`}>
                                                        <span>{captureValidation[idx].ok ? '✓' : '✗'} 預期: {captureValidation[idx].expected}</span>
                                                        {!captureValidation[idx].ok && (
                                                            <span className="font-bold">差{captureValidation[idx].diff}</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => removeCapturedImage(img.id)} className="absolute top-2 right-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))
                            )}
                            <div ref={listEndRef} />
                        </div>

                        <div className="p-4 bg-white border-t space-y-3">
                            <button
                                onClick={onTransferToPhase3}
                                disabled={capturedImages.length === 0}
                                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${capturedImages.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' : 'bg-emerald-600/10 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'}`}
                            >
                                <Send size={18} /> 送往 Phase 3 批量辨識
                            </button>

                            <button
                                onClick={() => {
                                    setIsAutoDetecting(!isAutoDetecting);
                                    if (!isAutoDetecting && videoRef.current && videoRef.current.paused) {
                                        videoRef.current.play();
                                    }
                                }}
                                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${isAutoDetecting ? 'bg-rose-600 text-white animate-pulse' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'}`}
                            >
                                {isAutoDetecting ? (
                                    <>
                                        <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                                        偵測運行中 (點擊停用)
                                    </>
                                ) : (
                                    <>
                                        <Play size={18} fill="currentColor" /> 啟動感傳自動偵測
                                    </>
                                )}
                            </button>

                            <button
                                onClick={captureCurrentFrame}
                                className="w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 active:scale-95"
                            >
                                <Sparkles size={16} className="text-amber-500" /> 手動擷取即時影格
                            </button>

                            <p className="text-[9px] text-slate-400 text-center">
                                自動擷取基於格點動態，擷取後將同步進行本地 OCR 數值辨識
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Phase4Video;
