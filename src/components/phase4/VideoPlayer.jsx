import React, { useState, useRef, useEffect } from 'react';
import { Video, Play, Pause, Clock, RefreshCw, Monitor, StopCircle, Cpu, Download, Upload, Eye, EyeOff, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import usePhase4Store from '../../stores/usePhase4Store';
import SettingTooltip from './SettingTooltip';
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
    balDecimalPlaces,
    setBalDecimalPlaces,
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
    const spinButtonROI = usePhase4Store(s => s.spinButtonROI);
    const clickTargets = usePhase4Store(s => s.clickTargets);
    const setClickTarget = usePhase4Store(s => s.setClickTarget);
    const removeClickTarget = usePhase4Store(s => s.removeClickTarget);
    const platformName = usePhase4Store(s => s.platformName);
    const setPlatformClickTarget = usePhase4Store(s => s.setPlatformClickTarget);
    const removePlatformClickTarget = usePhase4Store(s => s.removePlatformClickTarget);
    const getPlatformClickTargets = usePhase4Store(s => s.getPlatformClickTargets);
    const exportAllROIs = usePhase4Store(s => s.exportAllROIs);
    const importAllROIs = usePhase4Store(s => s.importAllROIs);
    const importFileRef = useRef(null);

    // ── 群組相關 ──
    const roiGroups = usePhase4Store(s => s.roiGroups);
    const visibleGroups = usePhase4Store(s => s.visibleGroups);
    const toggleGroupVisibility = usePhase4Store(s => s.toggleGroupVisibility);
    const fixedRoiGroups = usePhase4Store(s => s.fixedRoiGroups);
    const addRoiGroup = usePhase4Store(s => s.addRoiGroup);
    const renameRoiGroup = usePhase4Store(s => s.renameRoiGroup);
    const removeRoiGroup = usePhase4Store(s => s.removeRoiGroup);

    // ── ROI 匯入處理 ──
    const handleImportROI = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            importAllROIs(data);
            alert(`✅ 已匯入 ROI 設定（${file.name}）`);
        } catch (err) {
            alert(`❌ 匯入失敗: ${err.message}`);
        } finally {
            if (importFileRef.current) importFileRef.current.value = '';
        }
    };

    // ── 本地狀態 ──
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [roiMode, setRoiMode] = useState('reel');
    const [roiPanelOpen, setRoiPanelOpen] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState(['game']); // 預設展開 game
    const [addRoiTarget, setAddRoiTarget] = useState(null); // { groupId, category } or null
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

    // ── 群組展開切換 ──
    const toggleExpand = (groupId) => {
        setExpandedGroups(prev =>
            prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]
        );
    };

    // ── 建構所有 ROI 項目（含群組資訊）──
    const fixedRoiDefs = [
        { roi: reelROI, mode: 'reel', hex: '#f59e0b', label: 'REEL', showGrid: true, category: 'detection', fixedKey: 'reel' },
        { roi: winROI, mode: 'win', hex: '#10b981', label: 'WIN', category: 'ocr', fixedKey: 'win' },
        { roi: balanceROI, mode: 'balance', hex: '#38bdf8', label: 'BAL', category: 'ocr', fixedKey: 'balance' },
        { roi: betROI, mode: 'bet', hex: '#22d3ee', label: 'BET', category: 'ocr', fixedKey: 'bet' },
        { roi: orderIdROI, mode: 'orderId', hex: '#a855f7', label: 'ID', category: 'ocr', fixedKey: 'orderId' },
        ...(showMultiplier ? [{ roi: multiplierROI, mode: 'multiplier', hex: '#f43f5e', label: 'MULT', category: 'ocr', fixedKey: 'multiplier' }] : []),
        { roi: spinButtonROI, mode: 'spinButton', hex: '#16a34a', label: 'SPIN', category: 'control', fixedKey: 'spinButton' },
    ].map(r => ({ ...r, group: fixedRoiGroups[r.fixedKey] || 'game', isFixed: true }));

    const dynamicRoiDefs = Object.entries(clickTargets).map(([name, roi]) => {
        // 面板內顯示短名（去掉群組前綴），例如 "遊戲介面-設定" → "設定"
        const gLabel = roiGroups.find(g => g.id === (roi.group || 'card'))?.label || '';
        const shortLabel = gLabel && name.startsWith(`${gLabel}-`) ? name.slice(gLabel.length + 1) : name;
        return {
            roi, mode: `custom:${name}`, name,
            hex: roi.category === 'ocr' ? '#06b6d4' : '#ec4899',
            label: shortLabel, fullName: name,
            category: roi.category || 'control',
            group: roi.group || 'card', isFixed: false,
        };
    });

    const allRoiDefs = [...fixedRoiDefs, ...dynamicRoiDefs];

    // ── 新增 ROI 的狀態 ──
    const [addRoiName, setAddRoiName] = useState('');

    const handleAddRoi = (shortName, groupId, category) => {
        // 自動加群組前綴，確保不同群組的命名空間獨立
        const gLabel = roiGroups.find(g => g.id === groupId)?.label || groupId;
        const fullName = `${gLabel}-${shortName}`;
        const scope = platformName ? confirm(`存為「${platformName}」平台通用？\n\n確定 = 🌐 平台通用\n取消 = 🎮 本遊戲`) : false;
        const roi = { x: 45, y: 45, w: 10, h: 10, category, group: groupId };
        if (scope) { setPlatformClickTarget(fullName, roi); }
        setClickTarget(fullName, roi);
        setRoiMode(`custom:${fullName}`);
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
                {/* ROI 切換器 — 可收合，分組 */}
                <div className="absolute top-4 right-4 z-40 flex flex-col items-end gap-1">
                    {/* 收合按鈕 */}
                    <button onClick={() => setRoiPanelOpen(p => !p)}
                        className="bg-slate-900/80 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/20 shadow-xl text-xs font-bold text-slate-300 hover:text-white transition-all flex items-center gap-1.5 active:scale-95 self-end"
                    >
                        {roiPanelOpen ? '▶ 收合' : '◀ ROI'}
                    </button>
                {roiPanelOpen && (
                <div className="bg-slate-900/80 backdrop-blur-md p-1.5 rounded-lg border border-white/20 shadow-xl flex flex-col gap-0.5 max-h-[70vh] overflow-y-auto min-w-[200px]"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 transparent' }}>

                    {/* ── 各群組 ── */}
                    {roiGroups.map(group => {
                        const isExpanded = expandedGroups.includes(group.id);
                        const isVisible = visibleGroups.includes(group.id);
                        const groupRois = allRoiDefs.filter(r => r.group === group.id);
                        const count = groupRois.length;

                        return (
                            <div key={group.id} className="flex flex-col">
                                {/* 群組 Header */}
                                <div className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-slate-700/50 transition-colors">
                                    <button onClick={() => toggleExpand(group.id)} className="flex items-center gap-1 flex-1 text-left">
                                        {isExpanded
                                            ? <ChevronDown size={10} className="text-slate-400 shrink-0" />
                                            : <ChevronRight size={10} className="text-slate-400 shrink-0" />}
                                        <span className="text-[10px] font-bold text-slate-300 select-none truncate">{group.label}</span>
                                        <span className="text-[9px] text-slate-500 select-none">({count})</span>
                                    </button>
                                    {/* 👁️ 顯示/隱藏開關 */}
                                    <button onClick={() => toggleGroupVisibility(group.id)}
                                        className={`p-0.5 rounded transition-colors ${isVisible ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-600 hover:text-slate-400'}`}
                                        title={isVisible ? '隱藏此群組的框' : '顯示此群組的框'}>
                                        {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                                    </button>
                                </div>

                                {/* 群組內容（展開時） */}
                                {isExpanded && (
                                    <div className="flex gap-1 items-center flex-wrap pl-3 pb-1">
                                        {groupRois.map(r => {
                                            const isActive = roiMode === r.mode;
                                            return (
                                                <button key={r.mode} onClick={() => setRoiMode(r.mode)}
                                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95 group/btn ${isActive
                                                        ? 'text-white ring-1 ring-offset-1'
                                                        : 'bg-white/90 text-slate-600 border border-slate-300 hover:bg-white'}`}
                                                    style={isActive ? { backgroundColor: r.hex, boxShadow: `0 0 0 1px white, 0 0 0 3px ${r.hex}` } : {}}
                                                >
                                                    {/* 特殊控件 */}
                                                    {r.fixedKey === 'orderId' && (
                                                        <input type="checkbox" checked={enableOrderId}
                                                            onChange={(e) => { e.stopPropagation(); setEnableOrderId(e.target.checked); }}
                                                            className="cursor-pointer h-3 w-3 rounded accent-purple-500" title="勾選以進行注單號擷取與 OCR"
                                                        />
                                                    )}
                                                    {r.fixedKey === 'balance' && (
                                                        <SettingTooltip title="💰 總分小數位數" desc="設定 BALANCE (總分) OCR 結果保留的小數位數"
                                                            usage="依遊戲幣值精度選擇，例如日幣選整數、美金選 2 位"
                                                            tech="影響 BAL ROI 的 OCR 解析精度與數值格式化" position="bottom">
                                                            <select value={balDecimalPlaces}
                                                                onChange={(e) => { e.stopPropagation(); setBalDecimalPlaces(parseInt(e.target.value, 10)); }}
                                                                className="cursor-pointer h-4 text-[9px] bg-transparent border border-white/30 rounded px-0.5 outline-none"
                                                                title="總分小數位數" onClick={(e) => e.stopPropagation()}>
                                                                <option value={0} className="bg-white text-slate-800">.0</option>
                                                                <option value={1} className="bg-white text-slate-800">.1</option>
                                                                <option value={2} className="bg-white text-slate-800">.2</option>
                                                                <option value={3} className="bg-white text-slate-800">.3</option>
                                                            </select>
                                                        </SettingTooltip>
                                                    )}
                                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isActive ? 'white' : r.hex }} />
                                                    {r.label}
                                                    {/* 動態 ROI 刪除鈕 */}
                                                    {!r.isFixed && (
                                                        <span onClick={(e) => { e.stopPropagation(); if (confirm(`刪除「${r.name}」？`)) removeClickTarget(r.name); }}
                                                            className="ml-0.5 text-[10px] opacity-0 group-hover/btn:opacity-100 hover:text-red-400 cursor-pointer">✕</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                        {/* ＋ 新增讀取區 */}
                                        <button onClick={() => setAddRoiTarget(prev => prev?.groupId === group.id && prev?.category === 'ocr' ? null : { groupId: group.id, category: 'ocr' })}
                                            className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-cyan-800/50 text-cyan-300 hover:bg-cyan-700/50 hover:text-cyan-200 transition-all"
                                            title="新增讀取區域 (OCR)">+👁️</button>
                                        {/* ＋ 新增操作區 */}
                                        <button onClick={() => setAddRoiTarget(prev => prev?.groupId === group.id && prev?.category === 'control' ? null : { groupId: group.id, category: 'control' })}
                                            className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-pink-800/50 text-pink-300 hover:bg-pink-700/50 hover:text-pink-200 transition-all"
                                            title="新增點擊目標 (Control)">+🎯</button>
                                        {/* 新增表單（inline，避免巢狀元件 remount 問題） */}
                                        {addRoiTarget?.groupId === group.id && (
                                            <div className="flex items-center gap-1 mt-1" onClick={e => e.stopPropagation()}>
                                                <input className="bg-slate-800 border border-slate-500 rounded px-1.5 py-0.5 text-[10px] text-white outline-none w-20"
                                                    value={addRoiName} onChange={e => setAddRoiName(e.target.value)}
                                                    placeholder="名稱" autoFocus
                                                    onMouseDown={e => e.stopPropagation()}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' && addRoiName.trim()) { handleAddRoi(addRoiName.trim(), group.id, addRoiTarget.category); setAddRoiName(''); setAddRoiTarget(null); }
                                                        if (e.key === 'Escape') { setAddRoiName(''); setAddRoiTarget(null); }
                                                    }}
                                                />
                                                <button onClick={() => { if (addRoiName.trim()) { handleAddRoi(addRoiName.trim(), group.id, addRoiTarget.category); setAddRoiName(''); setAddRoiTarget(null); }}}
                                                    className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                                                >確定</button>
                                                <button onClick={() => { setAddRoiName(''); setAddRoiTarget(null); }}
                                                    className="px-1 py-0.5 rounded text-[10px] bg-slate-700 text-slate-400 hover:text-white transition-colors">✕</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* ── 分隔線 ── */}
                    <div className="h-px bg-slate-600/50 my-0.5" />

                    {/* ── 群組管理 + 匯出匯入 ── */}
                    <div className="flex gap-1 items-center flex-wrap px-1">
                        {/* 新增群組 */}
                        <button onClick={() => {
                            const name = prompt('輸入新群組名稱');
                            if (name?.trim()) addRoiGroup(name.trim());
                        }}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white transition-all flex items-center gap-0.5"
                            title="新增 ROI 群組">
                            <Plus size={10} /> 群組
                        </button>
                        <button onClick={exportAllROIs}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-400 hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-1 active:scale-95"
                            title="匯出所有 ROI 區域設定為 JSON">
                            <Download size={10} /> 匯出
                        </button>
                        <input ref={importFileRef} type="file" accept=".json" onChange={handleImportROI} className="hidden" />
                        <button onClick={() => importFileRef.current?.click()}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-1 active:scale-95"
                            title="從 JSON 檔匯入 ROI 區域設定">
                            <Upload size={10} /> 匯入
                        </button>
                    </div>
                    </div>
                )}
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

                    {/* ROI 框（依群組過濾） */}
                    {allRoiDefs
                        .filter(r => {
                            // 正在編輯的 ROI 永遠顯示
                            if (roiMode === r.mode) return true;
                            // 依群組過濾
                            return visibleGroups.includes(r.group);
                        })
                        .map(r => {
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
                            {/* ROI 標籤 */}
                            {(() => {
                                const showOnTop = r.roi.y > 5;
                                const pos = showOnTop ? { bottom: '100%', marginBottom: '4px' } : { top: '100%', marginTop: '4px' };
                                return isActive ? (
                                    <div className="absolute left-0 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-md whitespace-nowrap pointer-events-none"
                                        style={{ backgroundColor: r.hex, ...pos }}>{r.label}</div>
                                ) : (
                                    <div className="absolute left-0 flex items-center gap-1 group/label pointer-events-none"
                                        style={pos}>
                                        <div className="w-2.5 h-2.5 rounded-full border border-white/80 shadow-sm shrink-0"
                                            style={{ backgroundColor: r.hex }} />
                                        <div className="text-white text-[9px] px-1 py-px rounded font-bold shadow-sm opacity-0 group-hover/label:opacity-100 transition-opacity whitespace-nowrap"
                                            style={{ backgroundColor: r.hex }}>{r.label}</div>
                                    </div>
                                );
                            })()}
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
