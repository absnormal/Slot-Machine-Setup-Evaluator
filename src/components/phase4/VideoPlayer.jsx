import React, { useState, useRef, useEffect } from 'react';
import { Video, Play, Pause, Clock, RefreshCw, Monitor, StopCircle, Cpu } from 'lucide-react';
import usePhase4Store from '../../stores/usePhase4Store';
import useROIDrag from '../../hooks/useROIDrag';

/**
 * VideoPlayer — 影片播放器 + ROI 覆蓋層 + 播放控制列
 * 從 Phase4Video 抽離的獨立元件
 */
const VideoPlayer = ({
    videoSrc,
    videoRef,
    isStreamMode,
    handleVideoUpload,
    handleStartScreenCapture,
    handleStopScreenCapture,
    isNativeMode,
    handleStartNativeCapture,
    handleStopNativeCapture,
    nativeCapture,
    isLiveActive,
    enableOrderId,
    setEnableOrderId,
    template,
    propGridRows,
    propGridCols,
    propHasMultiplierReel,
    onVideoEnded,
}) => {
    // ── ROI 從 Zustand Store 取得（唯讀，用於繪製覆蓋層）──
    const reelROI = usePhase4Store(s => s.reelROI);
    const winROI = usePhase4Store(s => s.winROI);
    const balanceROI = usePhase4Store(s => s.balanceROI);
    const betROI = usePhase4Store(s => s.betROI);
    const orderIdROI = usePhase4Store(s => s.orderIdROI);
    const multiplierROI = usePhase4Store(s => s.multiplierROI);

    // ── 本地狀態 ──
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [roiMode, setRoiMode] = useState('reel');
    const containerRef = useRef(null);

    // ── ROI 拖曳 ──
    const { handleMouseDown, handleMouseMove, handleMouseUp } = useROIDrag(containerRef, roiMode);

    // ── 串流計時器 ──
    const [streamElapsed, setStreamElapsed] = useState(0);
    const streamTimerRef = useRef(null);
    useEffect(() => {
        if (isStreamMode) {
            setStreamElapsed(0);
            streamTimerRef.current = setInterval(() => setStreamElapsed(prev => prev + 1), 1000);
        } else {
            if (streamTimerRef.current) clearInterval(streamTimerRef.current);
            streamTimerRef.current = null;
        }
        return () => { if (streamTimerRef.current) clearInterval(streamTimerRef.current); };
    }, [isStreamMode]);

    // ── 影片事件 ──
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTime = () => setCurrentTime(video.currentTime);
        const onDuration = () => setDuration(video.duration);
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => { setIsPlaying(false); onVideoEnded?.(); };

        video.addEventListener('timeupdate', onTime);
        video.addEventListener('loadedmetadata', onDuration);
        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('ended', onEnded);
        return () => {
            video.removeEventListener('timeupdate', onTime);
            video.removeEventListener('loadedmetadata', onDuration);
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('ended', onEnded);
        };
    }, [videoSrc, videoRef, onVideoEnded]);

    // ── 播放控制 ──
    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) videoRef.current.pause();
        else videoRef.current.play();
    };
    const handleSeek = (e) => {
        const t = parseFloat(e.target.value);
        if (videoRef.current) videoRef.current.currentTime = t;
        setCurrentTime(t);
    };
    const formatTime = (t) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

    const showMultiplier = template ? template.hasMultiplierReel : propHasMultiplierReel;
    // ── 格線繪製 ──
    const renderGridLines = () => {
        const rows = template?.rows || propGridRows || 3;
        const cols = template?.cols || propGridCols || 5;
        const lines = [];
        for (let i = 1; i < cols; i++) {
            lines.push(<div key={`v-${i}`} className="absolute h-full border-r-2 border-amber-400/60" style={{ left: `${(i / cols) * 100}%` }} />);
        }
        for (let i = 1; i < rows; i++) {
            lines.push(<div key={`h-${i}`} className="absolute w-full border-b-2 border-amber-400/60" style={{ top: `${(i / rows) * 100}%` }} />);
        }
        return lines;
    };

    // ══════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════
    if (!videoSrc) {
        return (
            <div className="aspect-video bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center p-12 transition-all hover:bg-slate-50 hover:border-indigo-300 group">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md mb-6 group-hover:scale-110 transition-transform">
                    <Video size={32} className="text-indigo-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-700 mb-2">選擇影像來源開始分析</h3>
                <p className="text-sm text-slate-400 mb-6">上傳影片檔案或即時擷取螢幕畫面</p>
                <div className="flex gap-3">
                    <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 cursor-pointer transition-all active:scale-95 flex items-center gap-2">
                        <Video size={18} /> 選擇影片檔案
                        <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                    </label>
                    <button onClick={handleStartScreenCapture}
                        className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-violet-500/20 cursor-pointer transition-all active:scale-95 flex items-center gap-2">
                        <Monitor size={18} /> 螢幕擷取
                    </button>
                    <button onClick={handleStartNativeCapture}
                        className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-teal-500/20 cursor-pointer transition-all active:scale-95 flex items-center gap-2">
                        <Cpu size={18} /> 本地擷取
                    </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">本地擷取需先啟動 screen-capture-server，可穩定擷取原生遊戲視窗</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* 影片 + ROI */}
            <div className="relative rounded-2xl shadow-2xl bg-black flex flex-col items-center overflow-hidden no-invert">
                {/* ROI 切換器 */}
                <div className="absolute top-4 right-4 z-40 bg-slate-900/80 backdrop-blur-md p-1 rounded-lg border border-white/20 shadow-xl flex gap-1">
                    {[
                        { key: 'reel', label: 'REEL', hex: '#f59e0b' },
                        { key: 'win', label: 'WIN', hex: '#10b981' },
                        { key: 'balance', label: 'BAL', hex: '#38bdf8' },
                        { key: 'bet', label: 'BET', hex: '#22d3ee' },
                        { key: 'orderId', label: 'ID', hex: '#a855f7' },
                        ...(showMultiplier ? [{ key: 'multiplier', label: 'MULT', hex: '#f43f5e' }] : [])
                    ].map(r => (
                        <button key={r.key} onClick={() => setRoiMode(r.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${roiMode === r.key
                                ? 'text-white ring-2 ring-offset-2'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                } ${r.key === 'orderId' && !enableOrderId ? 'opacity-50 grayscale' : ''}`}
                            style={roiMode === r.key ? { backgroundColor: r.hex, ringColor: r.hex, boxShadow: `0 0 0 2px white, 0 0 0 4px ${r.hex}` } : {}}
                        >
                            {r.key === 'orderId' && (
                                <input 
                                    type="checkbox" 
                                    checked={enableOrderId} 
                                    onChange={(e) => { e.stopPropagation(); setEnableOrderId(e.target.checked); }} 
                                    className="cursor-pointer h-3 w-3 rounded accent-purple-500" 
                                    title="勾選以進行注單號擷取與 OCR"
                                />
                            )}
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: roiMode === r.key ? 'white' : r.hex }} />
                            {r.label}
                        </button>
                    ))}
                </div>




                {/* 即時模式指示器 */}
                {isLiveActive && (
                    <div className="absolute top-4 left-4 z-40 bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 animate-pulse shadow-lg">
                        <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                        LIVE 偵測中
                    </div>
                )}

                <div className="relative inline-block" ref={containerRef}
                    onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onMouseDown={handleMouseDown}>
                    <video ref={videoRef} src={isStreamMode ? undefined : videoSrc} autoPlay={isStreamMode} muted={isStreamMode} className="max-w-full max-h-[70vh] block" />

                    {/* ROI 框 */}
                    {[
                        { roi: reelROI, mode: 'reel', hex: '#f59e0b', label: '盤面', showGrid: true },
                        { roi: winROI, mode: 'win', hex: '#10b981', label: '贏分' },
                        { roi: balanceROI, mode: 'balance', hex: '#38bdf8', label: '總分' },
                        { roi: betROI, mode: 'bet', hex: '#22d3ee', label: '押分' },
                        { roi: orderIdROI, mode: 'orderId', hex: '#a855f7', label: '單號' },
                        ...(showMultiplier ? [{ roi: multiplierROI, mode: 'multiplier', hex: '#f43f5e', label: '乘倍' }] : [])
                    ].map(r => {
                        const isActive = roiMode === r.mode;
                        return (
                        <div key={r.mode}
                            className={`absolute transition-opacity ${isActive ? 'pointer-events-auto cursor-move' : 'pointer-events-none'}`}
                            style={{
                                left: `${r.roi.x}%`, top: `${r.roi.y}%`, width: `${r.roi.w}%`, height: `${r.roi.h}%`,
                                zIndex: isActive ? 20 : 10,
                                border: `3px solid ${r.hex}`,
                                backgroundColor: isActive ? `${r.hex}15` : 'transparent',
                                opacity: isActive ? 1 : 0.5,
                                boxShadow: isActive ? `0 0 12px ${r.hex}60, inset 0 0 20px ${r.hex}10` : 'none'
                            }}
                            onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e); }}
                        >
                            {r.showGrid && renderGridLines()}
                            {isActive && (
                                <div className="absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-full border-2 border-white pointer-events-auto cursor-nwse-resize shadow-lg"
                                    style={{ backgroundColor: r.hex }} />
                            )}
                            <div className="absolute left-0 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-md"
                                style={{ backgroundColor: r.hex, top: '-22px' }}>{r.label}</div>
                        </div>
                        );
                    })}
                </div>

                {/* 播放控制列 */}
                {isStreamMode ? (
                    /* 串流模式：簡化狀態列 */
                    <div className="w-full bg-slate-900/90 backdrop-blur p-3 px-5 flex items-center gap-4 border-t border-white/10">
                        <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${isNativeMode ? 'bg-teal-500' : 'bg-rose-500'}`} />
                            <span className={`text-xs font-bold ${isNativeMode ? 'text-teal-400' : 'text-rose-400'}`}>
                                {isNativeMode ? '本地擷取中' : '串流中'}
                            </span>
                            {isNativeMode && nativeCapture?.frameCount > 0 && (
                                <span className="text-[10px] text-slate-500 font-mono">#{nativeCapture.frameCount}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400">
                            <Clock size={12} />
                            <span className="text-xs font-mono">{formatTime(streamElapsed)}</span>
                        </div>
                        <div className="flex-1" />
                        <button onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'video/*'; input.onchange = handleVideoUpload; input.click(); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-bold transition-all border border-slate-600 active:scale-95">
                            <RefreshCw size={12} /> 切換影片
                        </button>
                        <button onClick={isNativeMode ? handleStopNativeCapture : handleStopScreenCapture}
                            className={`flex items-center gap-1.5 px-4 py-1.5 text-white rounded-lg text-xs font-bold transition-all active:scale-95 shadow-sm ${isNativeMode ? 'bg-teal-600 hover:bg-teal-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                            <StopCircle size={14} /> 結束{isNativeMode ? '擷取' : '串流'}
                        </button>
                    </div>
                ) : (
                    /* 影片模式：正常播放控制 */
                    <div className="w-full bg-slate-900/90 backdrop-blur p-3 px-5 flex items-center gap-4 border-t border-white/10">
                        <button onClick={togglePlay} className="text-white hover:text-amber-400 transition-colors">
                            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                        </button>
                        <button onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'video/*'; input.onchange = handleVideoUpload; input.click(); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all border border-slate-200 active:scale-95">
                            <RefreshCw size={12} /> 換片
                        </button>
                        <button onClick={handleStartScreenCapture}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-lg text-xs font-bold transition-all border border-violet-200 active:scale-95">
                            <Monitor size={12} /> 螢幕
                        </button>
                        <button onClick={handleStartNativeCapture}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-100 hover:bg-teal-200 text-teal-700 rounded-lg text-xs font-bold transition-all border border-teal-200 active:scale-95">
                            <Cpu size={12} /> 本地
                        </button>
                        <div className="flex-1 flex items-center gap-3">
                            <span className="text-[10px] font-mono text-slate-400">{formatTime(currentTime)}</span>
                            <input type="range" min="0" max={duration || 0} step="0.1" value={currentTime} onChange={handleSeek}
                                className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                            <span className="text-[10px] font-mono text-slate-400">{formatTime(duration)}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VideoPlayer;
