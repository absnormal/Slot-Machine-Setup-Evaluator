import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Scan, Play, Pause, Trash2, Send, Settings2, Sparkles, ChevronDown, ChevronUp, Image as ImageIcon, History, Clock, X, AlertCircle } from 'lucide-react';

const Phase4Video = ({ 
    isPhase4Minimized, setIsPhase4Minimized,
    videoSrc, videoRef, handleVideoUpload,
    isAutoDetecting, setIsAutoDetecting,
    sensitivity, setSensitivity,
    motionCoverageMin, setMotionCoverageMin,
    motionDelay, setMotionDelay,
    capturedImages, removeCapturedImage, clearAllCaptures,
    reelROI, setReelROI,
    winROI, setWinROI,
    balanceROI, setBalanceROI,
    captureCurrentFrame,
    onTransferToPhase3,
    setTemplateMessage,
    template,
    debugData
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [showDebug, setShowDebug] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [dragState, setDragState] = useState(null);
    const [roiMode, setRoiMode] = useState('reel'); // 'reel' | 'win' | 'balance'
    const containerRef = useRef(null);
    const listEndRef = useRef(null);

    // 自動滾動清單到底部
    useEffect(() => {
        if (listEndRef.current) {
            listEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [capturedImages.length]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const updateTime = () => setCurrentTime(video.currentTime);
        const updateDuration = () => setDuration(video.duration);
        const handlePlay = () => {
            setIsPlaying(true);
            setIsAutoDetecting(true);
        };
        const handlePause = () => {
            setIsPlaying(false);
            setIsAutoDetecting(false);
        };

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
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Minimized Header / Toggle Bar */}
            <div 
                className={`p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors ${!isPhase4Minimized ? 'bg-slate-800' : 'bg-white'}`}
                onClick={() => setIsPhase4Minimized(!isPhase4Minimized)}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${!isPhase4Minimized ? 'bg-amber-500 text-white shadow-amber-500/20' : 'bg-indigo-100 text-indigo-600'}`}>
                        {isPhase4Minimized ? <Video size={20} /> : <Scan size={20} />}
                    </div>
                    <div>
                        <h2 className={`text-lg font-bold ${!isPhase4Minimized ? 'text-white' : 'text-slate-800'}`}>
                            Phase 4: 影片動態自動擷取
                        </h2>
                        <p className={`text-xs ${!isPhase4Minimized ? 'text-slate-400' : 'text-slate-500'}`}>
                            {isPhase4Minimized ? '格點動態偵測模式 (已最小化)' : '基於盤面格點位移覆蓋率 (Coverage) 偵測轉動與停止'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isPhase4Minimized && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setShowDebug(!showDebug); }}
                            className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold ${showDebug ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300 hover:text-white'}`}
                        >
                            <Settings2 size={16} /> 除錯儀表板: {showDebug ? 'ON' : 'OFF'}
                        </button>
                    )}
                    {isPhase4Minimized ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-white/60" />}
                </div>
            </div>

            {/* Main Content Area - Hidden Display but keeps Video in DOM */}
            <div className={`p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 ${isPhase4Minimized ? 'hidden' : ''}`}>
                <div className="lg:col-span-8 space-y-4">
                    {!videoSrc ? (
                        <div className="aspect-video bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center p-12 transition-all hover:bg-slate-50 hover:border-amber-300 group">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md mb-6 group-hover:scale-110 transition-transform">
                                <Video size={32} className="text-amber-500" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-700 mb-2">上傳影片以開始偵測</h3>
                            <label className="bg-amber-500 hover:bg-amber-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-amber-200 cursor-pointer transition-all active:scale-95 mt-4">
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
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${roiMode === 'reel' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        盤面
                                    </button>
                                    <button 
                                        onClick={() => setRoiMode('win')}
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${roiMode === 'win' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        贏分
                                    </button>
                                    <button 
                                        onClick={() => setRoiMode('balance')}
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${roiMode === 'balance' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        總分
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
                                </div>

                                <div className="w-full bg-slate-900/90 backdrop-blur p-3 px-5 flex items-center gap-4 border-t border-white/10">
                                    <button onClick={togglePlay} className="text-white hover:text-amber-400 transition-colors">
                                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                                    </button>
                                    <div className="flex-1 flex items-center gap-3">
                                        <span className="text-[10px] font-mono text-slate-400">{formatTime(currentTime)}</span>
                                        <input type="range" min="0" max={duration || 0} step="0.1" value={currentTime} onChange={handleSeek} className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                                        <span className="text-[10px] font-mono text-slate-400">{formatTime(duration)}</span>
                                    </div>
                                    <button 
                                        onClick={togglePlay}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isAutoDetecting ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-700 text-slate-300'}`}
                                    >
                                        {isAutoDetecting ? '偵測進行中...' : '啟動偵測'}
                                    </button>
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
                                                <span className="text-slate-500">DELAY:</span>
                                                <span className="text-amber-300">{motionDelay}ms</span>
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
                                    <input type="range" min="1" max="50" value={sensitivity} onChange={(e) => setSensitivity(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 flex justify-between">
                                        覆蓋率門檻 (COVERAGE) <span>{motionCoverageMin}%</span>
                                    </label>
                                    <input type="range" min="10" max="95" value={motionCoverageMin} onChange={(e) => setMotionCoverageMin(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 flex justify-between">
                                        判定延遲 (DELAY) <span>{motionDelay}ms</span>
                                    </label>
                                    <input type="range" min="100" max="1000" step="50" value={motionDelay} onChange={(e) => setMotionDelay(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-4 flex flex-col h-[600px]">
                    <div className="bg-slate-50 rounded-2xl border border-slate-200 flex flex-col h-full overflow-hidden">
                        <div className="p-4 border-b bg-white flex items-center justify-between sticky top-0 z-10 shadow-sm">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                <History size={16} className="text-amber-500" /> 自動擷取歷史庫
                                <span className="bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full text-[10px]">{capturedImages.length}</span>
                            </h3>
                            {capturedImages.length > 0 && (
                                <button onClick={clearAllCaptures} className="text-slate-400 hover:text-rose-500 p-1 transition-colors" title="清除全部">
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {capturedImages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-300 opacity-60">
                                    <History size={48} className="mb-4 stroke-[1px]" />
                                    <p className="text-xs">尚無動態擷取紀錄</p>
                                </div>
                            ) : (
                                capturedImages.map((img, idx) => (
                                    <div key={img.id} className="group relative bg-white rounded-xl border border-slate-200 p-2 shadow-sm hover:border-amber-300 transition-all hover:shadow-md animate-in slide-in-from-bottom-2">
                                        <div className="flex gap-3">
                                            <div className="w-20 h-14 bg-slate-100 rounded-lg overflow-hidden shrink-0">
                                                <img src={img.previewUrl} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="flex-1 min-w-0 pr-6">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold text-slate-800 truncate max-w-[100px]">{img.file.name}</span>
                                                    <span className="text-[10px] text-slate-400">#{idx + 1}</span>
                                                </div>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <Clock size={10} className="text-slate-400" />
                                                    <span className="text-[10px] font-mono text-slate-500">{img.timestamp}s</span>
                                                </div>
                                                {/* OCR 數據展示 */}
                                                <div className="grid grid-cols-2 gap-1 mt-1.5 pt-1.5 border-t border-slate-50">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] text-slate-400 font-medium lowercase">win</span>
                                                        <span className={`text-[10px] font-bold ${img.extractedWin === "..." ? "text-slate-300 animate-pulse" : "text-emerald-600"}`}>
                                                            {img.extractedWin || "0"}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] text-slate-400 font-medium lowercase">total</span>
                                                        <span className={`text-[10px] font-bold ${img.extractedBalance === "..." ? "text-slate-300 animate-pulse" : "text-sky-600"}`}>
                                                            {img.extractedBalance || "0"}
                                                        </span>
                                                    </div>
                                                </div>
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
                                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${capturedImages.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'}`}
                            >
                                <Send size={18} /> 送往 Phase 3 批量辨識
                            </button>
                            <p className="text-[9px] text-slate-400 text-center">
                                將自動擷取的影格傳送至 Phase 3 進行批量連線辨識
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Phase4Video;
