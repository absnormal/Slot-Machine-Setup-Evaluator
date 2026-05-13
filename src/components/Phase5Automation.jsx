import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Gamepad2, ChevronDown, ChevronUp, Play, Pause, Square, Settings, BarChart3, AlertTriangle, Zap } from 'lucide-react';
import usePhase4Store from '../stores/usePhase4Store';
import useSpinGroupAnalysis from '../hooks/useSpinGroupAnalysis';
import { useAutoPlay } from '../hooks/useAutoPlay';
import AutoPlayPanel from './phase4/AutoPlayPanel';

/**
 * Phase5Automation — 自動化控制平台
 *
 * P5 = 操控遊戲的雙手
 * P4 = 偵測結果的眼睛
 *
 * 兩者共用 videoRef、candidates、useNativeCapture
 * P5 透過 callback 呼叫 P4 的 startLiveDetection / smartDedup
 */
const Phase5Automation = ({
    isPhase5Minimized,
    onToggle,
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

    // ── Live detection 橋接（P5 開啟/關閉 P4 偵測）──
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

    // ── 分局分析（從 candidates 計算，用於顯示局數）──
    const { groupsWithMath } = useSpinGroupAnalysis(candidates);

    // ══════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════
    const isConnected = nativeCapture?.isConnected;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Header */}
            <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors bg-white" onClick={onToggle}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center shadow-sm">
                        <Gamepad2 size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Phase 5: 自動化控制</h2>
                        <p className="text-xs text-slate-500">
                            {isPhase5Minimized ? '遊戲操控 · 排程執行 · 數據收集 (已最小化)' : '自動遊玩 · 動作排程 · 即時監控'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* 連線狀態燈號 */}
                    {!isPhase5Minimized && (
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isConnected
                                ? 'bg-emerald-100 text-emerald-600'
                                : 'bg-slate-100 text-slate-400'
                        }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            {isConnected ? '已連線' : '未連線'}
                        </span>
                    )}
                    {autoPlay.isPlaying && (
                        <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse">
                            <Zap size={10} className="inline mr-0.5" />
                            運行中
                        </span>
                    )}
                    <div className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                        {isPhase5Minimized ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-slate-400" />}
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className={`${isPhase5Minimized ? 'hidden' : ''}`}>
                <div className="p-6 space-y-4">

                    {/* ── 狀態總覽 ── */}
                    <div className="grid grid-cols-3 gap-3">
                        <StatusCard
                            icon={<Gamepad2 size={16} />}
                            label="後端連線"
                            value={isConnected ? '已連線' : '未連線'}
                            color={isConnected ? 'emerald' : 'slate'}
                        />
                        <StatusCard
                            icon={<BarChart3 size={16} />}
                            label="偵測狀態"
                            value={isLiveActive ? '偵測中' : '待機'}
                            color={isLiveActive ? 'amber' : 'slate'}
                        />
                        <StatusCard
                            icon={<Zap size={16} />}
                            label="自動遊玩"
                            value={autoPlay.isPlaying ? (autoPlay.isPaused ? '暫停' : '運行中') : '停止'}
                            color={autoPlay.isPlaying ? (autoPlay.isPaused ? 'amber' : 'purple') : 'slate'}
                        />
                    </div>

                    {/* ── 前置條件檢查 ── */}
                    {!isConnected && (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs">
                            <AlertTriangle size={14} />
                            <span>請先在 <strong>Phase 4</strong> 中啟動 Python 後端擷取（Native Capture）以建立連線。P5 將共用該畫面來源進行操控。</span>
                        </div>
                    )}

                    {isConnected && !spinButtonROI && (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs">
                            <AlertTriangle size={14} />
                            <span>請先在 Phase 4 的 ROI 設定中標記 <strong>SPIN 按鈕</strong>位置。</span>
                        </div>
                    )}

                    {/* ── 未來：動作排程器 UI ── */}
                    {isConnected && (
                        <div className="bg-gradient-to-br from-slate-50 to-purple-50/30 border border-slate-200 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Settings size={14} className="text-purple-500" />
                                <span className="text-sm font-bold text-slate-700">動作排程器</span>
                                <span className="text-[10px] bg-purple-100 text-purple-500 px-1.5 py-0.5 rounded-full font-bold">即將推出</span>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                將支援可組合的動作佇列：Click → Wait Stop → Wait OCR → Record → Loop，
                                並可儲存為流程範本，靈活排程不同的遊戲操作策略。
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── 自動遊玩浮動控制台 (Portal → body) ── */}
            {isNativeMode && (
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
            )}
        </div>
    );
};

// ── 狀態卡片 ──
const StatusCard = ({ icon, label, value, color = 'slate' }) => {
    const colorMap = {
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
        amber: 'bg-amber-50 text-amber-600 border-amber-200',
        purple: 'bg-purple-50 text-purple-600 border-purple-200',
        slate: 'bg-slate-50 text-slate-400 border-slate-200',
    };
    return (
        <div className={`flex items-center gap-2 p-3 rounded-xl border ${colorMap[color] || colorMap.slate}`}>
            {icon}
            <div>
                <div className="text-[10px] opacity-70 font-bold">{label}</div>
                <div className="text-xs font-bold">{value}</div>
            </div>
        </div>
    );
};

export default Phase5Automation;
