import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Gamepad2, Wifi, WifiOff, Activity, Zap, ZapOff, ChevronUp, ChevronDown } from 'lucide-react';
import usePhase4Store from '../stores/usePhase4Store';
import useSpinGroupAnalysis from '../hooks/useSpinGroupAnalysis';
import { useAutoPlay } from '../hooks/useAutoPlay';
import AutoPlayPanel from './phase4/AutoPlayPanel';

/**
 * Phase5Automation — 固定底部狀態列 + 浮動控制台
 *
 * 不參與手風琴系統，永遠固定在頁面底部。
 * 顯示：連線狀態 / 偵測狀態 / 自動遊玩狀態 / 局數
 * 點擊可展開詳細面板。
 *
 * P5 = 操控遊戲的雙手，P4 = 偵測結果的眼睛
 */
const Phase5Automation = ({
    // 共用：來自 App 的 videoRef & 候選幀
    videoRef,
    candidates,
    // 共用：NativeCapture
    isNativeMode,
    nativeCapture,
    // P4 偵測橋接 (callbacks)
    startLiveDetection,
    stopLiveDetection,
    smartDedup,
    // 環境資訊
    template,
    gameName,
    setTemplateMessage,
    // P4 scanOpts (供 startLiveDetection 使用)
    reelROI,
    scanOpts,
}) => {
    // ── ROI ──
    const spinButtonROI = usePhase4Store(s => s.spinButtonROI);

    // ── 自動遊玩 Hook ──
    const autoPlay = useAutoPlay();

    // ── candidates ref for getCandidates ──
    const candidatesRef = useRef(candidates);
    useEffect(() => { candidatesRef.current = candidates; }, [candidates]);
    const getCandidates = useCallback(() => candidatesRef.current, []);

    // ── Live detection 橋接 ──
    const [isLiveActive, setIsLiveActive] = useState(false);

    const handleStartLive = useCallback(async () => {
        if (!videoRef.current || !reelROI) return;
        setIsLiveActive(true);
        if (videoRef.current.paused) videoRef.current.play();
        startLiveDetection(videoRef.current, reelROI, (candidate) => {
            setTemplateMessage?.(`📸 即時偵測到停輪 @ ${candidate.time.toFixed(1)}s`);
        }, { ...scanOpts });
    }, [videoRef, reelROI, scanOpts, setTemplateMessage, startLiveDetection]);

    const handleStopLive = useCallback(() => {
        setIsLiveActive(false);
        stopLiveDetection();
    }, [stopLiveDetection]);

    // ── 分局分析 ──
    const { groupsWithMath } = useSpinGroupAnalysis(candidates);

    // ── 展開/收合 ──
    const [isExpanded, setIsExpanded] = useState(false);

    const isConnected = nativeCapture?.isConnected;
    const { isPlaying, isPaused } = autoPlay;

    // 底部列只在 nativeMode 時顯示
    if (!isNativeMode) return null;

    return createPortal(
        <div className="fixed bottom-0 left-0 right-0 z-[9998]" style={{ pointerEvents: 'none' }}>
            {/* ── 展開面板 ── */}
            {isExpanded && (
                <div
                    className="mx-auto max-w-2xl mb-1 bg-slate-900/95 backdrop-blur-xl rounded-t-2xl border border-slate-700/50 shadow-2xl p-4 animate-in slide-in-from-bottom-4 duration-300"
                    style={{ pointerEvents: 'auto' }}
                >
                    <div className="space-y-3">
                        {/* 前置條件警告 */}
                        {!isConnected && (
                            <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs">
                                <WifiOff size={13} />
                                <span>請在 Phase 4 啟動 Python 後端擷取以建立連線</span>
                            </div>
                        )}
                        {isConnected && !spinButtonROI && (
                            <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs">
                                <Gamepad2 size={13} />
                                <span>請在 Phase 4 的 ROI 設定中標記 SPIN 按鈕位置</span>
                            </div>
                        )}

                        {/* 狀態卡片 */}
                        <div className="grid grid-cols-3 gap-2">
                            <MiniStatusCard
                                icon={isConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
                                label="後端連線"
                                value={isConnected ? '已連線' : '未連線'}
                                active={isConnected}
                                color={isConnected ? 'emerald' : 'slate'}
                            />
                            <MiniStatusCard
                                icon={<Activity size={13} />}
                                label="即時偵測"
                                value={isLiveActive ? '偵測中' : '待機'}
                                active={isLiveActive}
                                color={isLiveActive ? 'amber' : 'slate'}
                            />
                            <MiniStatusCard
                                icon={isPlaying ? <Zap size={13} /> : <ZapOff size={13} />}
                                label="自動遊玩"
                                value={isPlaying ? (isPaused ? '暫停' : '運行中') : '停止'}
                                active={isPlaying && !isPaused}
                                color={isPlaying ? (isPaused ? 'amber' : 'purple') : 'slate'}
                            />
                        </div>

                        {/* 數據摘要 */}
                        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                            <span>候選幀: <span className="text-slate-200 font-bold">{candidates.length}</span></span>
                            <span>局數: <span className="text-slate-200 font-bold">{groupsWithMath?.length || 0}</span></span>
                            <span>已辨識: <span className="text-slate-200 font-bold">{candidates.filter(c => c.status === 'recognized').length}</span></span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 固定底部列 ── */}
            <div
                className="bg-slate-900/95 backdrop-blur-xl border-t border-slate-700/50 shadow-lg"
                style={{ pointerEvents: 'auto' }}
            >
                <div className="max-w-screen-xl mx-auto px-4 h-10 flex items-center justify-between gap-4">
                    {/* 左側：品牌 + 狀態指示燈 */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <Gamepad2 size={14} className="text-purple-400" />
                            <span className="text-xs font-bold text-slate-300">P5</span>
                        </div>

                        <div className="h-4 w-px bg-slate-700" />

                        {/* 連線狀態 */}
                        <StatusDot active={isConnected} color="emerald" label={isConnected ? '已連線' : '離線'} />

                        {/* 偵測狀態 */}
                        <StatusDot active={isLiveActive} color="amber" label={isLiveActive ? '偵測中' : '待機'} />

                        {/* 自動遊玩狀態 */}
                        {isPlaying ? (
                            <span className={`flex items-center gap-1 text-[11px] font-bold ${isPaused ? 'text-amber-400' : 'text-purple-400'}`}>
                                <Zap size={11} className={isPaused ? '' : 'animate-pulse'} />
                                {isPaused ? '暫停' : '自動遊玩中'}
                            </span>
                        ) : (
                            <StatusDot active={false} color="purple" label="自動遊玩" />
                        )}
                    </div>

                    {/* 中間：數據快報 */}
                    <div className="flex items-center gap-4 text-[11px] text-slate-500">
                        <span>幀 <span className="text-slate-300 font-bold">{candidates.length}</span></span>
                        <span>局 <span className="text-slate-300 font-bold">{groupsWithMath?.length || 0}</span></span>
                    </div>

                    {/* 右側：展開按鈕 */}
                    <button
                        onClick={() => setIsExpanded(v => !v)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800"
                    >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        <span className="hidden sm:inline">{isExpanded ? '收合' : '展開'}</span>
                    </button>
                </div>
            </div>

            {/* ── 自動遊玩浮動控制台 (已有的拖曳面板) ── */}
            <AutoPlayPanel
                autoPlay={autoPlay}
                isNativeConnected={isConnected}
                wsRef={nativeCapture?.wsRef || { current: null }}
                getCandidates={getCandidates}
                spinButtonROI={spinButtonROI}
                spinGroupCount={groupsWithMath?.length || 0}
                isLiveActive={isLiveActive}
                onStartLive={handleStartLive}
                onStopLive={handleStopLive}
                onSmartDedup={smartDedup}
            />
        </div>,
        document.body
    );
};

// ── 迷你狀態卡 (展開面板用) ──
const MiniStatusCard = ({ icon, label, value, active, color = 'slate' }) => {
    const colorMap = {
        emerald: active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-500 border-slate-700',
        amber: active ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800 text-slate-500 border-slate-700',
        purple: active ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-slate-800 text-slate-500 border-slate-700',
        slate: 'bg-slate-800 text-slate-500 border-slate-700',
    };
    return (
        <div className={`flex items-center gap-2 p-2 rounded-lg border ${colorMap[color]}`}>
            {icon}
            <div>
                <div className="text-[9px] opacity-60 font-bold uppercase">{label}</div>
                <div className="text-[11px] font-bold">{value}</div>
            </div>
        </div>
    );
};

// ── 底部列狀態圓點 ──
const StatusDot = ({ active, color, label }) => {
    const dotColor = {
        emerald: active ? 'bg-emerald-400' : 'bg-slate-600',
        amber: active ? 'bg-amber-400' : 'bg-slate-600',
        purple: active ? 'bg-purple-400' : 'bg-slate-600',
    };
    return (
        <span className={`flex items-center gap-1 text-[11px] ${active ? 'text-slate-300' : 'text-slate-600'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${dotColor[color]} ${active ? 'animate-pulse' : ''}`} />
            {label}
        </span>
    );
};

export default Phase5Automation;
