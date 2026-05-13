import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Zap, Workflow } from 'lucide-react';
import usePhase4Store from '../stores/usePhase4Store';
import useSpinGroupAnalysis from '../hooks/useSpinGroupAnalysis';
import { useAutoPlay } from '../hooks/useAutoPlay';
import FlowComposer from './phase5/FlowComposer';
import QuickModePanel from './phase5/QuickModePanel';
import StatusBar from './phase5/StatusBar';

/**
 * Phase5Automation — 固定底部狀態列 + 整合控制面板
 *
 * 容器元件：負責膠水邏輯、狀態衍生、佈局。
 * 實際內容委派給子元件：
 *   - StatusBar: 底部狀態列
 *   - QuickModePanel: 快速模式（控制 + 統計 + 設定 + 紀錄）
 *   - FlowComposer: 排程器
 */
const Phase5Automation = ({
    videoRef, candidates, setCandidates,
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
    const [activeTab, setActiveTab] = useState('quick'); // 'quick' | 'composer'

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
                ocrRois,
            });
        }, 100);
    };

    const canStart = isConnected && spinButtonROI && !isPlaying;
    const progress = config.targetSpins > 0 ? Math.min(100, (actualSpins / config.targetSpins) * 100) : 0;

    // 底部列只在 nativeMode 時顯示
    if (!isNativeMode) return null;

    return createPortal(
        <div className="fixed bottom-0 left-0 right-0 z-[9998]" style={{ pointerEvents: 'none' }}>
            {/* ══ 展開面板（左側對齊，避開右側候選幀區域）══ */}
                <div
                    className="ml-4 max-w-lg mb-0 bg-slate-900/95 backdrop-blur-xl rounded-t-2xl border border-b-0 border-slate-700/50 shadow-2xl"
                    style={{ pointerEvents: isExpanded ? 'auto' : 'none', display: isExpanded ? 'block' : 'none' }}
                >
                    <div className="p-5 flex flex-col gap-4 h-[75vh]">
                        {/* ── Tab 切換 ── */}
                        <div className="flex gap-1 bg-slate-800 rounded-xl p-1 shrink-0">
                            <button onClick={() => setActiveTab('quick')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                                    activeTab === 'quick' ? 'bg-indigo-500/20 text-indigo-300 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                                }`}>
                                <Zap size={14}/> 快速模式
                            </button>
                            <button onClick={() => setActiveTab('composer')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                                    activeTab === 'composer' ? 'bg-purple-500/20 text-purple-300 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                                }`}>
                                <Workflow size={14}/> 排程器
                            </button>
                        </div>

                        {/* ── 排程器 Tab ── */}
                        {activeTab === 'composer' && (
                            <div className="flex-1 min-h-0">
                                <FlowComposer
                                    ws={wsRef?.current}
                                    videoEl={videoRef?.current}
                                    setCandidates={setCandidates}
                                    reelROI={reelROI}
                                />
                            </div>
                        )}

                        {/* ── 快速模式 Tab ── */}
                        {activeTab === 'quick' && (
                            <QuickModePanel
                                isPlaying={isPlaying} isPaused={isPaused}
                                gameState={gameState} GameState={GameState}
                                stats={stats} logs={logs} error={error} config={config}
                                startAutoPlay={startAutoPlay} stopAutoPlay={stopAutoPlay}
                                togglePause={togglePause} resetStats={resetStats} updateConfig={updateConfig}
                                isConnected={isConnected} spinButtonROI={spinButtonROI} canStart={canStart}
                                actualSpins={actualSpins} derived={derived} progress={progress}
                                onStart={handleStart}
                                showSettings={showSettings} setShowSettings={setShowSettings}
                                showLogs={showLogs} setShowLogs={setShowLogs}
                            />
                        )}
                </div>
                </div>

            {/* ══ 固定底部列 ══ */}
            <StatusBar
                isConnected={isConnected} isDetecting={isDetecting} isPlaying={isPlaying}
                stateColor={stateColor} stateLabel={stateLabel}
                actualSpins={actualSpins} derived={derived} candidateCount={candidates.length}
                isExpanded={isExpanded} setIsExpanded={setIsExpanded}
            />
        </div>,
        document.body
    );
};

export default Phase5Automation;
