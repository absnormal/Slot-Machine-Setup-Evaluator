import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Video, Scan, Play, Pause, Trash2, Send, Sparkles, ChevronDown, ChevronUp, X, Clock, Download, BarChart3, ImageIcon, RefreshCw, Square, Camera, Link2, AlertCircle } from 'lucide-react';

const Phase4Video = ({
    isPhase4Minimized,
    onToggle,
    // Keyframe Extractor
    candidates, isScanning, scanProgress, scanStats,
    scanVideo, startLiveDetection, stopLiveDetection,
    removeCandidate, clearCandidates, addManualCandidate, smartDedup, confirmDedup, healBreaks,
    // Auto Recognition
    isRecognizing, isStopping, recognitionProgress,
    recognizeBatch, cancelRecognition,
    // Report
    stats, exportCSV,
    // ROI (手動框選，從舊 Phase 4 保留)
    reelROI, setReelROI,
    winROI, setWinROI,
    balanceROI, setBalanceROI,
    betROI, setBetROI,
    // Video
    videoSrc, videoRef, handleVideoUpload,
    // Transfer
    onTransferToPhase3,
    setTemplateMessage,
    template,
    gridRows: propGridRows, gridCols: propGridCols,
    ocrDecimalPlaces, setOcrDecimalPlaces
}) => {
    // ── 本地狀態 ──
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [roiMode, setRoiMode] = useState('reel');
    const [dragState, setDragState] = useState(null);
    const [scanFps, setScanFps] = useState(20);
    const [isLiveActive, setIsLiveActive] = useState(false);
    const [requireStableWin, setRequireStableWin] = useState(false);

    const containerRef = useRef(null);
    const listEndRef = useRef(null);

    // ── 卡片內容渲染器（共用於平鋪與分組模式）──
    const renderCardContent = (kf, idx) => (
        <div className="flex gap-2.5 items-center">
            <div className="w-20 h-14 bg-slate-900 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                <img src={kf.thumbUrl} className="w-full h-full object-contain" alt="" />
            </div>
            <div className="flex-1 min-w-0 pr-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                        <Clock size={10} className="text-slate-400" />
                        <span className="text-[10px] font-mono text-slate-500">{kf.time.toFixed(1)}s</span>
                        {kf.captureDelay > 0.05 && (
                            <span className="text-[9px] text-amber-500" title={`盤面停於 ${kf.reelStopTime?.toFixed(1)}s，等贏分 +${kf.captureDelay.toFixed(1)}s`}>
                                +{kf.captureDelay.toFixed(1)}s
                            </span>
                        )}
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${kf.status === 'recognized' ? 'bg-emerald-100 text-emerald-700' :
                            kf.status === 'error' ? 'bg-rose-100 text-rose-600' :
                                kf.status === 'recognizing' ? 'bg-indigo-100 text-indigo-600 animate-pulse' :
                                    'bg-slate-100 text-slate-500'
                        }`}>
                        {kf.status === 'recognized' ? '✓ 已辨識' : kf.status === 'error' ? '✗ 失敗' : kf.status === 'recognizing' ? '辨識中...' : `#${idx + 1}`}
                    </span>
                </div>
                {kf.ocrData && (
                    <div className="grid grid-cols-3 gap-1 mt-1 bg-slate-50 rounded-lg px-1.5 py-1">
                        <div className="flex flex-col items-center">
                            <span className="text-[8px] text-slate-400">贏分</span>
                            <span className={`text-[10px] font-bold ${parseFloat(kf.ocrData.win) > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{kf.ocrData.win || '0'}</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[8px] text-slate-400">押注</span>
                            <span className="text-[10px] font-bold text-amber-600">{kf.ocrData.bet || '-'}</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[8px] text-slate-400">總分</span>
                            <span className="text-[10px] font-bold text-sky-600">{kf.ocrData.balance || '-'}</span>
                        </div>
                    </div>
                )}
                {kf.status === 'recognized' && kf.recognitionResult && (
                    <div className="mt-1 pt-1 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-slate-400">結算贏分</span>
                            <span className={`text-xs font-bold ${(kf.recognitionResult.totalWin || 0) > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {(kf.recognitionResult.totalWin || 0).toLocaleString()}
                            </span>
                        </div>
                    </div>
                )}
                {kf.status === 'error' && kf.error && (
                    <div className="text-[9px] text-rose-500 mt-1 truncate">{kf.error}</div>
                )}
            </div>
        </div>
    );

    // ── 影片事件 ──
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTime = () => setCurrentTime(video.currentTime);
        const onDuration = () => setDuration(video.duration);
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => { setIsPlaying(false); setIsLiveActive(false); stopLiveDetection(); };

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
    }, [videoSrc, videoRef]);

    // 自動滾動列表到底部
    useEffect(() => {
        if (listEndRef.current) {
            listEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [candidates.length]);

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

    // ── ROI 拖曳 (從舊 Phase 4 搬來) ──
    const getMousePos = (e) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
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
            startX: pos.x, startY: pos.y,
            initObj: { ...targetROI }, setter: setTargetROI
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
        } else {
            dragState.setter({
                ...dragState.initObj,
                w: Math.max(0.5, Math.min(100 - dragState.initObj.x, dragState.initObj.w + dx)),
                h: Math.max(0.5, Math.min(100 - dragState.initObj.y, dragState.initObj.h + dy))
            });
        }
    };

    const handleMouseUp = () => setDragState(null);

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

    // ── 分局與連續性計算 ──
    const groupsWithMath = useMemo(() => {
        const hasSpinData = candidates.some(c => c.spinGroupId !== undefined);
        if (!hasSpinData) return null;

        const sortedCandidates = [...candidates].sort((a, b) => a.time - b.time);

        const contiguousBlocks = [];
        let currentBlock = null;

        sortedCandidates.forEach((kf, idx) => {
            const gid = kf.spinGroupId !== undefined ? kf.spinGroupId : `ungrouped_${kf.id}`;

            if (!currentBlock || currentBlock.gid !== gid) {
                if (currentBlock) contiguousBlocks.push(currentBlock);
                currentBlock = { gid, group: [] };
            }
            
            currentBlock.group.push({ kf, idx });
        });
        if (currentBlock) contiguousBlocks.push(currentBlock);

        let currentBase = null;
        return contiguousBlocks.map((block) => {
            const { gid, group } = block;
            const bestFrame = group.find(g => g.kf.isSpinBest)?.kf || group[0].kf;
            const parse = v => parseFloat(v) || 0;
            const bal = parse(bestFrame.ocrData?.balance);
            const win = parse(bestFrame.ocrData?.win);
            const bet = parse(bestFrame.ocrData?.bet);
            
            let mathValid = true;
            let mathState = 0; 
            let mathDiff = 0;
            let expectedBase = currentBase;

            const hasData = bestFrame.ocrData && typeof bestFrame.ocrData.balance !== 'undefined' && typeof bestFrame.ocrData.bet !== 'undefined';

            if (hasData && bet > 0) { 
                if (currentBase === null) {
                    mathState = win > 0 ? 2 : 1;
                    currentBase = bal + win; 
                } else {
                    const eps = 0.5;
                    if (Math.abs(bal + bet - currentBase) < eps) {
                        mathState = win > 0 ? 2 : 1;
                        currentBase = bal + win;
                    } else if (Math.abs(bal + bet - win - currentBase) < eps) {
                        mathState = 3;
                        currentBase = bal;
                    } else {
                        mathValid = false;
                        mathDiff = (bal + bet) - currentBase;
                        currentBase = bal + win; 
                    }
                }
            }

            return { gid, group, mathValid, mathState, mathDiff, expectedBase, nextBase: currentBase };
        });
    }, [candidates]);

    const brokenGroupIds = useMemo(() => {
        if (!groupsWithMath) return [];
        return groupsWithMath.filter(g => !g.mathValid).map(g => parseInt(g.gid));
    }, [groupsWithMath]);

    // ── 操作處理 ──
    const scanOpts = { fps: scanFps, winROI, balanceROI, betROI, ocrDecimalPlaces, requireStableWin, sliceCols: template?.cols || propGridCols || 5 };

    const handleHealBreaksGlobally = () => {
        if (brokenGroupIds.length === 0) return;
        healBreaks(brokenGroupIds, scanOpts);
    };

    const handleHealSingleBreak = (gid) => {
        healBreaks([parseInt(gid)], scanOpts);
    };

    const handleScan = () => {
        if (!videoRef.current || !reelROI) return;
        scanVideo(videoRef.current, reelROI, scanOpts);
    };

    const handleOneClick = async () => {
        if (!videoRef.current || !reelROI) return;
        const results = await scanVideo(videoRef.current, reelROI, scanOpts);
        if (results && results.length > 0) {
            recognizeBatch(ocrDecimalPlaces);
        }
    };

    const handleStartLive = () => {
        if (!videoRef.current || !reelROI) return;
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
                        {!videoSrc ? (
                            <div className="aspect-video bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center p-12 transition-all hover:bg-slate-50 hover:border-indigo-300 group">
                                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md mb-6 group-hover:scale-110 transition-transform">
                                    <Video size={32} className="text-indigo-500" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-700 mb-2">上傳影片以開始分析</h3>
                                <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 cursor-pointer transition-all active:scale-95 mt-4">
                                    選擇影片檔案
                                    <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                                </label>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* 影片 + ROI */}
                                <div className="relative rounded-2xl shadow-2xl bg-black flex flex-col items-center overflow-hidden">
                                    {/* ROI 切換器 */}
                                    <div className="absolute top-4 right-4 z-40 bg-slate-900/80 backdrop-blur-md p-1 rounded-lg border border-white/20 shadow-xl flex gap-1">
                                        {[
                                            { key: 'reel', label: 'REEL', hex: '#f59e0b' },
                                            { key: 'win', label: 'WIN', hex: '#10b981' },
                                            { key: 'balance', label: 'BAL', hex: '#38bdf8' },
                                            { key: 'bet', label: 'BET', hex: '#22d3ee' }
                                        ].map(r => (
                                            <button key={r.key} onClick={() => setRoiMode(r.key)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${roiMode === r.key
                                                    ? 'text-white ring-2 ring-offset-2'
                                                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                                    }`}
                                                style={roiMode === r.key ? { backgroundColor: r.hex, ringColor: r.hex, boxShadow: `0 0 0 2px white, 0 0 0 4px ${r.hex}` } : {}}
                                            >
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: roiMode === r.key ? 'white' : r.hex }} />
                                                {r.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* 掃描進度覆蓋 */}
                                    {isScanning && (
                                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
                                            <div className="text-white text-lg font-bold mb-4">🔍 掃描中...</div>
                                            <div className="w-64 h-3 bg-slate-700 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-300"
                                                    style={{ width: `${(scanProgress * 100).toFixed(0)}%` }} />
                                            </div>
                                            <div className="text-slate-400 text-xs mt-2">{(scanProgress * 100).toFixed(0)}%</div>
                                        </div>
                                    )}

                                    {/* 即時模式指示器 */}
                                    {isLiveActive && (
                                        <div className="absolute top-4 left-4 z-40 bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 animate-pulse shadow-lg">
                                            <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                                            LIVE 偵測中
                                        </div>
                                    )}

                                    <div className="relative inline-block" ref={containerRef}
                                        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onMouseDown={handleMouseDown}>
                                        <video ref={videoRef} src={videoSrc} className="max-w-full max-h-[70vh] block" />

                                        {/* ROI 框 */}
                                        {[
                                            { roi: reelROI, mode: 'reel', hex: '#f59e0b', label: '盤面', showGrid: true },
                                            { roi: winROI, mode: 'win', hex: '#10b981', label: '贏分' },
                                            { roi: balanceROI, mode: 'balance', hex: '#38bdf8', label: '總分' },
                                            { roi: betROI, mode: 'bet', hex: '#22d3ee', label: '押分' }
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
                                    <div className="w-full bg-slate-900/90 backdrop-blur p-3 px-5 flex items-center gap-4 border-t border-white/10">
                                        <button onClick={togglePlay} className="text-white hover:text-amber-400 transition-colors">
                                            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                                        </button>
                                        <button onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'video/*'; input.onchange = handleVideoUpload; input.click(); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all border border-slate-200 active:scale-95">
                                            <RefreshCw size={12} /> 換片
                                        </button>
                                        <div className="flex-1 flex items-center gap-3">
                                            <span className="text-[10px] font-mono text-slate-400">{formatTime(currentTime)}</span>
                                            <input type="range" min="0" max={duration || 0} step="0.1" value={currentTime} onChange={handleSeek}
                                                className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                                            <span className="text-[10px] font-mono text-slate-400">{formatTime(duration)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 參數欄 (極簡) */}
                                <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-slate-500">取樣率</span>
                                        <select value={scanFps} onChange={(e) => setScanFps(parseInt(e.target.value))}
                                            className="h-7 bg-white text-slate-700 text-xs rounded-lg border border-slate-200 px-2 cursor-pointer">
                                            <option value={5}>5 fps (快速)</option>
                                            <option value={10}>10 fps (標準)</option>
                                            <option value={15}>15 fps (精細)</option>
                                            <option value={20}>20 fps (極致高頻)</option>
                                            <option value={30}>30 fps (逐格盲抓)</option>
                                        </select>
                                    </div>

                                    {scanStats && (
                                        <div className="text-[10px] text-slate-400 ml-auto">
                                            掃描 {scanStats.totalFrames} 幀 → {scanStats.candidateCount} 候選（去重 {scanStats.removedDuplicates}）
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ══ 右側面板 ══ */}
                    <div className="lg:col-span-4 flex flex-col">
                        <div className="bg-slate-50 rounded-xl border border-slate-200 flex flex-col h-full overflow-hidden shadow-sm">

                            {/* 統計儀表板 */}
                            {stats && (
                                <div className="p-3 bg-gradient-to-r from-indigo-50 to-cyan-50 border-b border-indigo-100">
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div>
                                            <div className="text-[10px] text-slate-500">Spins</div>
                                            <div className="text-sm font-bold text-indigo-700">{stats.totalSpins}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-500">RTP</div>
                                            <div className={`text-sm font-bold ${stats.rtp >= 100 ? 'text-emerald-600' : 'text-rose-600'}`}>{stats.rtp}%</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-500">命中率</div>
                                            <div className="text-sm font-bold text-amber-600">{stats.hitRate}%</div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2 text-center">
                                        <div>
                                            <div className="text-[10px] text-slate-500">最大贏分</div>
                                            <div className="text-xs font-bold text-indigo-600">{stats.maxWin?.toLocaleString()}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-500">總贏分</div>
                                            <div className="text-xs font-bold text-emerald-600">{stats.totalWin?.toLocaleString()}</div>
                                        </div>
                                    </div>
                                </div>
                            )}

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
                                            點擊「開始即時偵測」或「全片掃描」
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
                                                <div key={kf.id}
                                                    className={`group relative bg-white rounded-xl border p-2 shadow-sm hover:shadow-md transition-all cursor-pointer ${kf.status === 'recognized' ? 'border-emerald-200' : kf.status === 'error' ? 'border-rose-200' : kf.status === 'recognizing' ? 'border-indigo-300 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
                                                    onClick={() => { if (videoRef.current) videoRef.current.currentTime = kf.time; }}
                                                >
                                                    {renderCardContent(kf, idx)}
                                                    <button onClick={(e) => { e.stopPropagation(); removeCandidate(kf.id); }}
                                                        className="absolute top-1.5 right-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ));
                                        }

                                        return groupsWithMath.map(({ gid, group, mathValid, mathDiff, expectedBase, nextBase }, listIndex) => {
                                            const isMulti = group.length > 1;
                                            const parsedGid = parseInt(gid);
                                            const palette = isNaN(parsedGid) 
                                                ? { border: '#cbd5e1', bg: 'rgba(248,250,252,0.6)' } 
                                                : groupColorPalette[parsedGid % groupColorPalette.length];
                                            return (
                                                <div key={`spin-${gid}-${listIndex}`}
                                                    className="rounded-xl p-1.5 space-y-1.5"
                                                    style={{ borderLeft: `4px solid ${palette.border}`, backgroundColor: palette.bg }}
                                                >
                                                    <div className="text-[9px] font-bold px-1 flex flex-wrap items-center gap-1.5 mb-1 pb-1 border-b border-slate-200/50">
                                                        <span className="text-slate-500 opacity-60">{isMulti ? '同局' : '單局'}</span>
                                                        <span className="text-emerald-600">W:{group[0].kf.ocrData?.win || '0'}</span>
                                                        <span className="text-sky-600">B:{group[0].kf.ocrData?.balance || '0'}</span>
                                                        <span className="text-amber-600">BET:{group[0].kf.ocrData?.bet || '-'}</span>
                                                        
                                                        {expectedBase !== null && (
                                                            mathValid ? (
                                                                <span className="ml-1 text-emerald-600 bg-emerald-100/80 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm" title={`與上局符合 (推算本局結餘 = ${nextBase?.toFixed(2)})`}>
                                                                    <Link2 size={9} /> 連續
                                                                </span>
                                                            ) : (
                                                                <div className="flex items-center gap-1 ml-1 cursor-help group/break">
                                                                    <span className="text-rose-600 bg-rose-100/80 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm" title={`預期起始: ${expectedBase.toFixed(2)}`}>
                                                                        <AlertCircle size={9} /> 斷層 {mathDiff !== 0 && `(${mathDiff > 0 ? '+' : ''}${mathDiff.toFixed(2)})`}
                                                                    </span>
                                                                    <button onClick={() => handleHealSingleBreak(gid)} className="text-white bg-indigo-500 hover:bg-indigo-600 px-1.5 py-0.5 rounded shadow shadow-indigo-500/20 active:scale-95 transition-all text-[8px] flex items-center gap-0.5">
                                                                        <RefreshCw size={8} /> 修復此局
                                                                    </button>
                                                                </div>
                                                            )
                                                        )}
                                                        
                                                        <span className="ml-auto text-slate-400">{group.length} 張</span>
                                                    </div>
                                                    {group.map(({ kf, idx }) => {
                                                        const isBest = kf.isSpinBest;
                                                        const isDimmed = isMulti && !isBest;
                                                        return (
                                                            <div key={kf.id}
                                                                className={`group relative rounded-xl border p-2 shadow-sm hover:shadow-md transition-all cursor-pointer
                                                                    ${isDimmed ? 'opacity-40 bg-slate-50 border-slate-200' : 'bg-white'}
                                                                    ${isBest && isMulti ? 'ring-2 ring-emerald-400 border-emerald-300' :
                                                                        kf.status === 'recognized' ? 'border-emerald-200' :
                                                                            kf.status === 'error' ? 'border-rose-200' :
                                                                                kf.status === 'recognizing' ? 'border-indigo-300 ring-2 ring-indigo-200' :
                                                                                    'border-slate-200 hover:border-indigo-300'
                                                                    }`}
                                                                onClick={() => { if (videoRef.current) videoRef.current.currentTime = kf.time; }}
                                                            >
                                                                {isBest && isMulti && (
                                                                    <div className="absolute -top-1.5 -left-1.5 bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow z-10">
                                                                        ★ 最佳
                                                                    </div>
                                                                )}
                                                                {kf.isSandwichError && (
                                                                    <div className="absolute -top-1.5 left-1/2 transform -translate-x-1/2 bg-rose-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow z-10 whitespace-nowrap">
                                                                        ⚠️ OCR 誤讀
                                                                    </div>
                                                                )}
                                                                {renderCardContent(kf, idx)}
                                                                <button onClick={(e) => { e.stopPropagation(); removeCandidate(kf.id); }}
                                                                    className="absolute top-1.5 right-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        });
                                    })()
                                )}
                                <div ref={listEndRef} />
                            </div>

                            {/* 底部動作區 */}
                            <div className="p-4 bg-white border-t space-y-2.5">
                                {/* 匯出 & 傳送 */}
                                <div className="flex gap-2">
                                    <button onClick={() => exportCSV(candidates)}
                                        disabled={recognizedCount === 0}
                                        className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all ${recognizedCount === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 active:scale-95'}`}>
                                        <Download size={14} /> CSV
                                    </button>
                                    <button onClick={onTransferToPhase3}
                                        disabled={candidates.length === 0}
                                        className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all ${candidates.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 active:scale-95'}`}>
                                        <Send size={14} /> Phase 3
                                    </button>
                                </div>

                                {/* 掃描設定與主動作按鈕 */}
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 px-1 cursor-pointer">
                                        <input type="checkbox" checked={requireStableWin} onChange={(e) => setRequireStableWin(e.target.checked)} 
                                            className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-offset-0 focus:ring-indigo-200 focus:ring-opacity-50 cursor-pointer" />
                                        <span className={`text-xs font-bold transition-colors ${requireStableWin ? 'text-indigo-600' : 'text-slate-500'}`}>
                                            要求贏分穩定 (停輪後等待跑分動畫)
                                        </span>
                                    </label>
                                    
                                    <button onClick={isLiveActive ? handleStopLive : handleStartLive}
                                        disabled={!videoSrc}
                                        className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${isLiveActive ? 'bg-rose-600 text-white animate-pulse' : !videoSrc ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200 active:scale-95'}`}>
                                        {isLiveActive ? (
                                            <><Square size={16} fill="currentColor" /> 停止偵測</>
                                        ) : (
                                            <><Play size={18} fill="currentColor" /> 開始即時偵測</>
                                        )}
                                    </button>
                                </div>

                                {/* 輔助操作 */}
                                <div className="flex gap-2">
                                    <button onClick={() => addManualCandidate(videoRef.current, reelROI, scanOpts)}
                                        disabled={!videoSrc}
                                        className="flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 active:scale-95">
                                        <Camera size={13} className="text-amber-500" /> 手動截圖
                                    </button>
                                    <button onClick={handleScan}
                                        disabled={isScanning || !videoSrc}
                                        className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all ${isScanning ? 'bg-amber-100 text-amber-700 animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 active:scale-95'}`}>
                                        <Scan size={13} className="text-indigo-500" /> {isScanning ? `${(scanProgress * 100).toFixed(0)}%` : '全片掃描'}
                                    </button>
                                </div>

                                {brokenGroupIds.length > 0 && (
                                    <button onClick={handleHealBreaksGlobally} disabled={isScanning}
                                        className="w-full py-2.5 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 active:scale-95 shadow-sm shadow-indigo-500/10">
                                        <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} /> 智慧修復：針對 {brokenGroupIds.length} 個斷層局重新研判
                                    </button>
                                )}

                                {candidates.length >= 2 && (
                                    candidates.some(c => c.isSpinBest !== undefined) ? (
                                        <div className="flex gap-2">
                                            <button onClick={smartDedup}
                                                className="flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 active:scale-95">
                                                <RefreshCw size={14} /> 重新標記
                                            </button>
                                            <button onClick={confirmDedup}
                                                className="flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 active:scale-95">
                                                🧹 智慧刪除 (僅保留最佳)
                                            </button>
                                        </div>
                                    ) : (
                                        <button onClick={smartDedup}
                                            className="w-full py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 active:scale-95">
                                            🧹 智慧標記（辨識同局 → 凸顯最佳）
                                        </button>
                                    )
                                )}

                                {/* Gemini 盤面辨識 */}
                                {candidates.length > 0 && pendingCount > 0 && (
                                    isRecognizing ? (
                                        <button onClick={cancelRecognition}
                                            className="w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 bg-rose-100 text-rose-600 border border-rose-200 hover:bg-rose-200 transition-all active:scale-95">
                                            <Square size={14} /> 停止辨識 ({recognitionProgress.current}/{recognitionProgress.total})
                                        </button>
                                    ) : (
                                        <button onClick={() => recognizeBatch(ocrDecimalPlaces)}
                                            className="w-full py-2 rounded-xl font-bold flex items-center justify-center gap-2 bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200 transition-all active:scale-95 text-xs">
                                            <Sparkles size={14} /> Gemini 辨識盤面 ({pendingCount} 張)
                                        </button>
                                    )
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Phase4Video;
