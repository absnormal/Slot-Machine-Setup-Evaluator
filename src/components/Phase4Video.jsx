import React, { useState, useRef, useEffect } from 'react';
import { Video, Scan, Play, Pause, Trash2, Send, Settings2, Sparkles, ChevronDown, ChevronUp, Image as ImageIcon, CheckCircle2, AlertCircle, X, History, Clock } from 'lucide-react';
import { toPx, toPct } from '../utils/helpers';

const Phase4Video = ({ 
    isPhase4Minimized, setIsPhase4Minimized,
    videoSrc, videoRef, handleVideoUpload,
    isAutoDetecting, setIsAutoDetecting,
    sensitivity, setSensitivity,
    capturedImages, removeCapturedImage, clearAllCaptures,
    reelROI, setReelROI,
    winROI, setWinROI,
    captureCurrentFrame,
    onTransferToPhase3,
    setTemplateMessage,
    debugData
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [showDebug, setShowDebug] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [dragState, setDragState] = useState(null);
    const containerRef = useRef(null);

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
    }, [videoSrc, videoRef]);

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
        if (!containerRef.current || !videoRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        const video = videoRef.current;
        
        // Use container rect as reference
        const x = (e.clientX - rect.left) / rect.width * 100;
        const y = (e.clientY - rect.top) / rect.height * 100;
        return { x, y };
    };

    const handleMouseDown = (e, type) => {
        const pos = getMousePos(e);
        const roi = type === 'reel' ? reelROI : winROI;
        
        // Simple handle check (bottom right 5%)
        const handleSize = 5;
        const isOverHandle = pos.x >= roi.x + roi.w - handleSize && pos.x <= roi.x + roi.w && 
                             pos.y >= roi.y + roi.h - handleSize && pos.y <= roi.y + roi.h;
        
        setDragState({
            type,
            action: isOverHandle ? 'resize' : 'move',
            startX: pos.x,
            startY: pos.y,
            initObj: { ...roi }
        });
    };

    const handleMouseMove = (e) => {
        if (!dragState) return;
        const pos = getMousePos(e);
        const dx = pos.x - dragState.startX;
        const dy = pos.y - dragState.startY;
        
        const setter = dragState.type === 'reel' ? setReelROI : setWinROI;
        
        if (dragState.action === 'move') {
            setter({
                ...dragState.initObj,
                x: Math.max(0, Math.min(100 - dragState.initObj.w, dragState.initObj.x + dx)),
                y: Math.max(0, Math.min(100 - dragState.initObj.h, dragState.initObj.y + dy))
            });
        } else {
            setter({
                ...dragState.initObj,
                w: Math.max(5, Math.min(100 - dragState.initObj.x, dragState.initObj.w + dx)),
                h: Math.max(5, Math.min(100 - dragState.initObj.y, dragState.initObj.h + dy))
            });
        }
    };

    const handleMouseUp = () => setDragState(null);

    if (isPhase4Minimized) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setIsPhase4Minimized(false)}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                            <Video size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Phase 4: 影片自動偵測截圖</h2>
                            <p className="text-xs text-slate-500">從遊戲錄影中自動辨識並擷取每一局的盤面 (免手動截圖)</p>
                        </div>
                    </div>
                    <ChevronDown className="text-slate-400" />
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Header */}
            <div className="bg-slate-800 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Video size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">Phase 4: 影片自動偵測截圖</h2>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-1.5 py-0.5 rounded border border-indigo-500/30 font-bold uppercase tracking-wider">Experimental</span>
                            <p className="text-xs text-slate-300">本地影片處理，無需上傳，高效精準</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowDebug(!showDebug)}
                        className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold ${showDebug ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:text-white'}`}
                    >
                        <Settings2 size={16} /> 除錯儀表板: {showDebug ? 'ON' : 'OFF'}
                    </button>
                    {videoSrc && (
                        <label className="p-2 px-3 rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors flex items-center gap-2 text-xs font-bold cursor-pointer">
                            <Video size={16} /> 更換影片
                            <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                        </label>
                    )}
                    <button onClick={() => setIsPhase4Minimized(true)} className="p-2 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors">
                        <ChevronUp size={20} />
                    </button>
                </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Video Player Area */}
                <div className="lg:col-span-8 space-y-4">
                    {!videoSrc ? (
                        <div className="aspect-video bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center p-12 transition-all hover:bg-slate-50 hover:border-indigo-300 group">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md mb-6 group-hover:scale-110 transition-transform">
                                <Video size={32} className="text-indigo-500" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-700 mb-2">上傳遊戲錄影影片</h3>
                            <p className="text-slate-500 text-center mb-8 max-w-sm">支援 MP4, WebM 格式。系統會自動偵測滾輪轉動並擷取停止後的盤面。</p>
                            <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 cursor-pointer transition-all active:scale-95">
                                選擇影片檔案
                                <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                            </label>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="relative rounded-2xl shadow-2xl bg-slate-900 group flex flex-col items-center overflow-visible">
                                <div 
                                    className="relative inline-block bg-black shadow-inner"
                                    ref={containerRef}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                                >
                                    <video 
                                        ref={videoRef}
                                        src={videoSrc}
                                        className="max-w-full max-h-[75vh] block"
                                        onClick={togglePlay}
                                    />
                                    
                                    {/* Overlay ROI Layers - 這裡會對準影片內容 */}
                                    <div className="absolute inset-0 pointer-events-none" style={{ pointerEvents: dragState ? 'auto' : 'none' }}>
                                        {/* Reel ROI - Now Secondary (Reference only) */}
                                        <div 
                                            className="absolute border border-dashed border-white/30 bg-white/5 pointer-events-auto cursor-move opacity-60 hover:opacity-100"
                                            style={{ left: `${reelROI.x}%`, top: `${reelROI.y}%`, width: `${reelROI.w}%`, height: `${reelROI.h}%` }}
                                            onMouseDown={(e) => handleMouseDown(e, 'reel')}
                                        >
                                            <div className="absolute top-0 left-0 bg-white/20 text-white/60 text-[8px] px-1 py-0.5 font-bold uppercase">
                                                截圖範圍 (Reels)
                                            </div>
                                        </div>
                                        
                                        {/* Win/Balance ROI - Now PRIMARY Driver */}
                                        <div 
                                            className={`absolute border-2 border-indigo-500 bg-indigo-500/10 pointer-events-auto cursor-move transition-opacity ${isAutoDetecting ? 'opacity-40' : 'opacity-100'}`}
                                            style={{ left: `${winROI.x}%`, top: `${winROI.y}%`, width: `${winROI.w}%`, height: `${winROI.h}%` }}
                                            onMouseDown={(e) => handleMouseDown(e, 'win')}
                                        >
                                            <div className="absolute top-0 left-0 bg-indigo-500 text-white text-[10px] px-1.5 py-0.5 font-bold flex items-center gap-1 shadow-md whitespace-nowrap">
                                                <Scan size={10} /> 偵測基準: 總分/贏分區 (Auto Trigger)
                                            </div>
                                            <div className="absolute bottom-0 right-0 w-4 h-4 bg-indigo-500 cursor-se-resize flex items-center justify-center">
                                                <div className="w-1.5 h-1.5 border-r border-b border-white" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Custom Video Control Panel */}
                                <div className="w-full bg-slate-800 p-3 px-5 flex items-center gap-4 border-t border-slate-700">
                                    <button 
                                        onClick={togglePlay}
                                        className="text-white hover:text-indigo-400 transition-colors"
                                    >
                                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                                    </button>
                                    
                                    <div className="flex-1 flex items-center gap-3">
                                        <span className="text-[10px] font-mono text-slate-400 w-10">{formatTime(currentTime)}</span>
                                        <input 
                                            type="range"
                                            min="0"
                                            max={duration || 0}
                                            step="0.1"
                                            value={currentTime}
                                            onChange={handleSeek}
                                            className="flex-1 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-400 hover:accent-indigo-300 transition-all"
                                        />
                                        <span className="text-[10px] font-mono text-slate-400 w-10">{formatTime(duration)}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${isAutoDetecting ? 'bg-rose-500 animate-pulse' : 'bg-slate-600'}`} />
                                        <span className="text-[10px] font-bold text-slate-400 tracking-wider">AUTO-DETECTOR: {isAutoDetecting ? 'ON' : 'OFF'}</span>
                                    </div>
                                </div>
                                
                                {/* Status Indicator */}
                                {isAutoDetecting && (
                                    <div className="absolute top-4 right-4 bg-rose-600 text-white px-3 py-1.5 rounded-full flex items-center gap-2 font-bold text-xs animate-pulse shadow-lg z-10">
                                        <div className="w-2 h-2 bg-white rounded-full" />
                                        WATCHING BALANCE...
                                    </div>
                                )}


                                {/* Debug Overlay Panel */}
                                {showDebug && (
                                    <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md text-white p-3 rounded-xl border border-white/20 z-30 font-mono text-[10px] space-y-1 shadow-2xl min-w-[160px]">
                                        <div className="flex justify-between border-b border-white/10 pb-1 mb-1 font-bold text-indigo-400">
                                            <span>VISUAL DEBUGGER</span>
                                            <span className="animate-pulse">●</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">STATUS:</span>
                                            <span className={`${debugData.status?.includes('Seeking') ? 'text-amber-400' : 'text-green-400'}`}>{debugData.status}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400 font-bold">OCR VALUE:</span>
                                            <span className="text-indigo-400 font-bold bg-indigo-500/10 px-1 rounded border border-indigo-500/30">
                                                [{debugData.ocrText || '...'}]
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-t border-white/5 pt-1 mt-1">
                                            <span className="text-slate-400 text-[9px]">DENSITY:</span>
                                            <span className="text-slate-500 text-[9px]">{debugData.density}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">THRESHOLD:</span>
                                            <span className="text-indigo-300 font-bold">{sensitivity}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">COOLDOWN:</span>
                                            <span className="text-slate-300">0.4s</span>
                                        </div>
                                        <div className="h-1 bg-slate-700 rounded-full overflow-hidden mt-1">
                                            <div 
                                                className="h-full bg-indigo-500 transition-all duration-200" 
                                                style={{ width: `${Math.min(100, (parseFloat(debugData.diff) / sensitivity) * 50)}%` }} 
                                            />
                                        </div>
                                        {debugData.isGhost && (
                                            <div className="bg-rose-500/20 border border-rose-500/50 text-rose-300 p-1 mt-2 rounded flex items-center gap-1">
                                                <AlertCircle size={10} />影格未就緒 (Ghost)
                                            </div>
                                        )}
                                        {debugData.lastCapture && (
                                            <div className="text-indigo-300 pt-1 mt-1 border-t border-white/10">
                                                Last Capture: {debugData.lastCapture}s
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {/* Player Controls */}
                            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="flex-1 space-y-2">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-xs font-bold text-slate-600 flex items-center gap-2">
                                            <Settings2 size={14} /> 偵測靈敏度: <span className="text-indigo-600">{sensitivity}</span>
                                        </label>
                                        <span className="text-[10px] text-slate-400">若總分跳動時未偵測請調低；若沒動卻誤抓請調高</span>
                                    </div>
                                    <input 
                                        type="range" min="1" max="50" step="1" 
                                        value={sensitivity} onChange={(e) => setSensitivity(parseInt(e.target.value))}
                                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                </div>
                                <div className="h-10 w-px bg-slate-200" />
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => {
                                            const video = videoRef.current;
                                            if (!video) return;
                                            if (isAutoDetecting) video.pause();
                                            else video.play();
                                        }}
                                        className={`px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md ${isAutoDetecting ? 'bg-rose-100 text-rose-600 border border-rose-200 hover:bg-rose-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}`}
                                    >
                                        {isAutoDetecting ? <Pause size={18} /> : <Play size={18} />}
                                        {isAutoDetecting ? '停止自動偵測' : '開啟自動偵測'}
                                    </button>
                                    <button 
                                        onClick={captureCurrentFrame}
                                        className="p-2.5 bg-white border border-indigo-200 text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors shadow-sm font-bold flex items-center gap-1.5"
                                        title="手動擷取當前畫面"
                                    >
                                        <ImageIcon size={18} /> 快照
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Capture History & Actions */}
                <div className="lg:col-span-4 flex flex-col h-full max-h-[600px]">
                    <div className="bg-slate-50 rounded-2xl border border-slate-200 flex flex-col h-full overflow-hidden">
                        <div className="p-4 border-b bg-white flex items-center justify-between sticky top-0 z-10">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <History size={18} className="text-indigo-500" /> 偵測擷取清單
                                <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-xs">{capturedImages.length}</span>
                            </h3>
                            {capturedImages.length > 0 && (
                                <button onClick={clearAllCaptures} className="text-slate-400 hover:text-rose-500 p-1.5 transition-colors" title="清空全部">
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {capturedImages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-slate-400 opacity-60">
                                    <History size={40} className="mb-2 stroke-1" />
                                    <p className="text-sm">尚未有偵測截圖</p>
                                    <p className="text-[10px] text-center px-4">啟動偵測並播放影片，系統將自動擷取滾輪停止瞬間</p>
                                </div>
                            ) : (
                                capturedImages.map((img, idx) => (
                                    <div key={img.id} className="group relative bg-white rounded-xl border border-slate-200 p-2 shadow-sm hover:border-indigo-300 transition-all hover:shadow-md animate-in slide-in-from-right-2">
                                        <div className="flex gap-3">
                                            <div className="w-24 h-16 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-100">
                                                <img src={img.previewUrl} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="flex-1 min-w-0 pr-6">
                                                <p className="text-xs font-bold text-slate-800 truncate">第 {idx + 1} 局自動截圖</p>
                                                <p className="text-[10px] text-indigo-500 flex items-center gap-1 mt-1">
                                                    <Clock size={10} /> {img.timestamp}s
                                                </p>
                                                <p className="text-[10px] text-slate-400 truncate mt-0.5">{img.file.name}</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => removeCapturedImage(img.id)}
                                            className="absolute top-2 right-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-4 bg-white border-t space-y-3">
                            <button 
                                onClick={onTransferToPhase3}
                                disabled={capturedImages.length === 0}
                                className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${capturedImages.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}`}
                            >
                                <Send size={18} />
                                送往 Phase 3 進行批量辨識
                            </button>
                            <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                                點擊按鈕將自動把上述截圖匯入 AI 視覺批次處理區。<br />
                                影片處理不消耗 AI API 額度。
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Phase4Video;
