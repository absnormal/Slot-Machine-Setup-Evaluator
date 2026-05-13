import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Gamepad2, Wifi, WifiOff, Activity, Zap, ZapOff,
    ChevronUp, ChevronDown, Play, Pause, Square, Settings,
    BarChart3, AlertTriangle
} from 'lucide-react';
import usePhase4Store from '../stores/usePhase4Store';
import useSpinGroupAnalysis from '../hooks/useSpinGroupAnalysis';
import { useAutoPlay } from '../hooks/useAutoPlay';

/**
 * Phase5Automation — 固定底部狀態列 + 整合控制面板
 *
 * 取代獨立的 AutoPlayPanel 浮動視窗。
 * 底部列：永遠可見的狀態指示
 * 展開面板：控制按鈕、統計、設定、紀錄
 */
const Phase5Automation = ({
    videoRef, candidates,
    isNativeMode, nativeCapture, isDetecting,
    startLiveDetection, stopLiveDetection, smartDedup,
    template, gameName, setTemplateMessage,
    reelROI, scanOpts,
}) => {
    // ── ROI ──
    const spinButtonROI = usePhase4Store(s => s.spinButtonROI);

    // ── 自動遊玩 Hook ──
    const autoPlay = useAutoPlay();
    const {
        isPlaying, isPaused, gameState, spinCount,
        stats, logs, error, config, GameState,
        startAutoPlay, stopAutoPlay, togglePause,
        resetStats, updateConfig,
    } = autoPlay;

    // ── candidates ref ──
    const candidatesRef = useRef(candidates);
    useEffect(() => { candidatesRef.current = candidates; }, [candidates]);
    const getCandidates = useCallback(() => candidatesRef.current, []);

    // ── Live detection 橋接 ──
    const handleStartLive = useCallback(async () => {
        if (!videoRef.current || !reelROI) return;
        if (videoRef.current.paused) videoRef.current.play();
        startLiveDetection(videoRef.current, reelROI, (candidate) => {
            setTemplateMessage?.(`📸 即時偵測到停輪 @ ${candidate.time.toFixed(1)}s`);
        }, { ...scanOpts });
    }, [videoRef, reelROI, scanOpts, setTemplateMessage, startLiveDetection]);

    const handleStopLive = useCallback(() => {
        stopLiveDetection();
    }, [stopLiveDetection]);

    // ── 分局分析 ──
    const { groupsWithMath } = useSpinGroupAnalysis(candidates);
    const actualSpins = groupsWithMath?.length || 0;

    // ── 展開/收合 + 子面板 ──
    const [isExpanded, setIsExpanded] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showLogs, setShowLogs] = useState(false);

    const isConnected = nativeCapture?.isConnected;
    const wsRef = nativeCapture?.wsRef || { current: null };

    // ── 衍生統計 ──
    const derived = useMemo(() => {
        const rtp = stats.totalBet > 0 ? ((stats.totalWin / stats.totalBet) * 100).toFixed(1) : '0.0';
        const hitRate = actualSpins > 0 ? ((stats.hitCount / actualSpins) * 100).toFixed(1) : '0.0';
        const netPL = stats.currentBalance - stats.startBalance;
        return { rtp, hitRate, netPL };
    }, [stats, actualSpins]);

    // ── 狀態標籤 ──
    const stateLabel = useMemo(() => {
        const labels = {
            [GameState.IDLE]: '準備中', [GameState.CLICKING_SPIN]: '點擊 SPIN',
            [GameState.WAITING_SPIN]: '等待間隔', [GameState.SPINNING]: '轉輪中...',
            [GameState.WAITING_RESULT]: '等待辨識', [GameState.RECORDING]: '記錄結果',
            [GameState.PAUSED]: '已暫停', [GameState.STOPPED]: '已停止', [GameState.ERROR]: '錯誤',
        };
        return labels[gameState] || gameState;
    }, [gameState, GameState]);

    const stateColor = useMemo(() => {
        if (gameState === GameState.SPINNING) return 'bg-amber-400 animate-pulse';
        if (gameState === GameState.PAUSED) return 'bg-yellow-400';
        if (gameState === GameState.ERROR) return 'bg-red-500';
        if (isPlaying) return 'bg-emerald-400 animate-pulse';
        return 'bg-slate-500';
    }, [gameState, isPlaying, GameState]);

    // ── 開始遊玩 ──
    const handleStart = () => {
        updateConfig({ spinROI: spinButtonROI });

        // 建立後端 OCR 的 ROI 定義
        const ocrRois = [];
        if (scanOpts.winROI) ocrRois.push({ name: 'win', roi: scanOpts.winROI, decimalPlaces: scanOpts.ocrDecimalPlaces ?? 2, label: 'WIN' });
        if (scanOpts.balanceROI) ocrRois.push({ name: 'balance', roi: scanOpts.balanceROI, decimalPlaces: scanOpts.balDecimalPlaces ?? scanOpts.ocrDecimalPlaces ?? 2, label: 'BALANCE' });
        if (scanOpts.betROI) ocrRois.push({ name: 'bet', roi: scanOpts.betROI, decimalPlaces: 0, label: 'BET' });
        if (scanOpts.orderIdROI) ocrRois.push({ name: 'orderId', roi: scanOpts.orderIdROI, decimalPlaces: 0, label: 'ORDER_ID' });

        setTimeout(() => {
            startAutoPlay(wsRef?.current, getCandidates, {
                onStartLive: handleStartLive,
                onStopLive: handleStopLive,
                onSmartDedup: smartDedup,
                ocrRois,  // ← 後端 OCR 路徑
            });
        }, 100);
    };

    const canStart = isConnected && spinButtonROI && !isPlaying;
    const progress = config.targetSpins > 0 ? Math.min(100, (actualSpins / config.targetSpins) * 100) : 0;

    // 底部列只在 nativeMode 時顯示
    if (!isNativeMode) return null;

    return createPortal(
        <div className="fixed bottom-0 left-0 right-0 z-[9998]" style={{ pointerEvents: 'none' }}>
            {/* ══ 展開面板 ══ */}
            {isExpanded && (
                <div
                    className="mx-auto max-w-lg mb-0 bg-slate-900/95 backdrop-blur-xl rounded-t-2xl border border-b-0 border-slate-700/50 shadow-2xl animate-in slide-in-from-bottom-4 duration-200"
                    style={{ pointerEvents: 'auto' }}
                >
                    <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                        {/* ── 錯誤/警告 ── */}
                        {error && (
                            <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-xs">
                                <AlertTriangle size={12} /> {error}
                            </div>
                        )}
                        {!isConnected && (
                            <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs">
                                <AlertTriangle size={12} /> 請先在 Phase 4 啟動擷取伺服器
                            </div>
                        )}
                        {!spinButtonROI && isConnected && (
                            <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs">
                                <AlertTriangle size={12} /> 請在 ROI 設定中標記 SPIN 按鈕
                            </div>
                        )}

                        {/* ── 控制按鈕 ── */}
                        <div className="flex gap-2">
                            {!isPlaying ? (
                                <button onClick={handleStart} disabled={!canStart}
                                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                                        canStart
                                            ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700 active:scale-95'
                                            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                    }`}>
                                    <Play size={14} fill="currentColor" /> 開始遊玩
                                </button>
                            ) : (
                                <>
                                    <button onClick={togglePause}
                                        className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 ${
                                            isPaused ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                                        }`}>
                                        {isPaused ? <><Play size={12} fill="currentColor" /> 恢復</> : <><Pause size={12} /> 暫停</>}
                                    </button>
                                    <button onClick={stopAutoPlay}
                                        className="px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 bg-rose-500 text-white hover:bg-rose-600 active:scale-95">
                                        <Square size={10} fill="currentColor" /> 停止
                                    </button>
                                </>
                            )}
                            <button onClick={() => setShowSettings(v => !v)}
                                className={`px-3 py-2.5 rounded-xl transition-all border active:scale-95 ${
                                    showSettings ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                                }`}>
                                <Settings size={14} />
                            </button>
                        </div>

                        {/* ── 進度條 ── */}
                        {isPlaying && config.targetSpins > 0 && (
                            <div>
                                <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                                    <span>{actualSpins} / {config.targetSpins} 局</span>
                                    <span>{progress.toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                                         style={{ width: `${progress}%` }} />
                                </div>
                            </div>
                        )}

                        {/* ── 即時統計 ── */}
                        {actualSpins > 0 && (
                            <div className="grid grid-cols-4 gap-1.5">
                                <DarkMiniStat label="局數" value={actualSpins} />
                                <DarkMiniStat label="命中率" value={`${derived.hitRate}%`} />
                                <DarkMiniStat label="RTP" value={`${derived.rtp}%`}
                                    color={parseFloat(derived.rtp) >= 96 ? 'emerald' : parseFloat(derived.rtp) < 90 ? 'rose' : null} />
                                <DarkMiniStat label="最大贏" value={stats.maxWin.toFixed(0)} />
                                <DarkMiniStat label="總押注" value={stats.totalBet.toFixed(0)} />
                                <DarkMiniStat label="總贏分" value={stats.totalWin.toFixed(0)} />
                                <DarkMiniStat label="餘額" value={stats.currentBalance.toFixed(0)} />
                                <DarkMiniStat label="損益"
                                    value={`${derived.netPL >= 0 ? '+' : ''}${derived.netPL.toFixed(0)}`}
                                    color={derived.netPL >= 0 ? 'emerald' : 'rose'} />
                            </div>
                        )}

                        {/* ── 設定 ── */}
                        {showSettings && (
                            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <DarkMiniInput label="目標局數" value={config.targetSpins}
                                        onChange={v => updateConfig({ targetSpins: parseInt(v) || 0 })}
                                        type="number" min={0} hint="0=無限" />
                                    <DarkMiniInput label="SPIN 間隔(ms)" value={config.spinInterval}
                                        onChange={v => updateConfig({ spinInterval: parseInt(v) || 500 })}
                                        type="number" min={300}
                                        hint="上一局完成→下一次點擊" />
                                </div>
                                <button onClick={resetStats} disabled={isPlaying}
                                    className="text-[10px] text-rose-400 hover:text-rose-300 underline disabled:opacity-40">
                                    重置統計
                                </button>
                            </div>
                        )}

                        {/* ── 遊玩紀錄 ── */}
                        <button onClick={() => setShowLogs(v => !v)}
                            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-indigo-400 transition-colors w-full">
                            <BarChart3 size={10} /> {showLogs ? '收合' : '展開'}紀錄 ({logs.length})
                        </button>
                        {showLogs && (
                            <div className="max-h-32 overflow-y-auto bg-slate-950 rounded-lg p-2 font-mono text-[10px] text-slate-300 space-y-px">
                                {logs.length === 0 && <div className="text-slate-600 text-center py-3">尚無紀錄</div>}
                                {logs.map((log, i) => (
                                    <div key={i} className="flex gap-2 hover:bg-slate-800 px-1.5 py-px rounded">
                                        <span className="text-slate-600 w-8 shrink-0">{log.spin === '-' ? '-' : `#${log.spin}`}</span>
                                        <span className="text-slate-600 w-16 shrink-0">{log.time}</span>
                                        {log.message ? (
                                            <span className="text-amber-400">{log.message}</span>
                                        ) : (
                                            <>
                                                <span className="text-cyan-400 w-14">B:{log.bet}</span>
                                                <span className={`w-14 ${log.win > 0 ? 'text-emerald-400 font-bold' : 'text-slate-600'}`}>W:{log.win}</span>
                                                <span className="text-slate-400">{log.balance}</span>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══ 固定底部列 ══ */}
            <div
                className="bg-slate-900/95 backdrop-blur-xl border-t border-slate-700/50 shadow-lg"
                style={{ pointerEvents: 'auto' }}
            >
                <div className="max-w-screen-xl mx-auto px-4 h-10 flex items-center justify-between gap-3">
                    {/* 左：品牌 + 狀態指示燈 */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <Gamepad2 size={14} className="text-purple-400" />
                            <span className="text-xs font-bold text-slate-300">P5</span>
                        </div>
                        <div className="h-4 w-px bg-slate-700" />
                        <StatusDot active={isConnected} color="emerald" label={isConnected ? '已連線' : '離線'} />
                        <StatusDot active={isDetecting} color="amber" label={isDetecting ? '偵測中' : '待機'} />
                        {isPlaying ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-purple-400">
                                <div className={`w-2 h-2 rounded-full ${stateColor}`} />
                                {stateLabel}
                            </span>
                        ) : (
                            <StatusDot active={false} color="purple" label="自動遊玩" />
                        )}
                    </div>

                    {/* 中：數據快報 */}
                    <div className="flex items-center gap-4 text-[11px] text-slate-500">
                        {actualSpins > 0 && (
                            <>
                                <span>局 <span className="text-slate-300 font-bold">{actualSpins}</span></span>
                                <span>RTP <span className="text-slate-300 font-bold">{derived.rtp}%</span></span>
                                <span className={`font-bold ${derived.netPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {derived.netPL >= 0 ? '+' : ''}{derived.netPL.toFixed(0)}
                                </span>
                            </>
                        )}
                        {actualSpins === 0 && (
                            <span>幀 <span className="text-slate-300 font-bold">{candidates.length}</span></span>
                        )}
                    </div>

                    {/* 右：展開按鈕 */}
                    <button
                        onClick={() => setIsExpanded(v => !v)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800"
                    >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        <span className="hidden sm:inline">{isExpanded ? '收合' : '控制台'}</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
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

// ── 深色主題統計格 ──
const DarkMiniStat = ({ label, value, color }) => {
    const c = color === 'emerald' ? 'text-emerald-400' : color === 'rose' ? 'text-rose-400' : 'text-slate-200';
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-1.5 text-center">
            <div className="text-[9px] text-slate-500 font-bold leading-tight">{label}</div>
            <div className={`text-xs font-bold font-mono ${c} leading-tight mt-0.5`}>{value}</div>
        </div>
    );
};

// ── 深色主題輸入框 ──
const DarkMiniInput = ({ label, value, onChange, hint, ...props }) => (
    <div>
        <label className="text-[10px] text-slate-400 font-bold">{label}</label>
        <input value={value} onChange={e => onChange(e.target.value)}
            className="w-full mt-0.5 px-2 py-1 rounded-md border border-slate-600 bg-slate-900 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
            {...props} />
        {hint && <div className="text-[9px] text-slate-500">{hint}</div>}
    </div>
);

export default Phase5Automation;
