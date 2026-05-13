import React from 'react';
import {
    Play, Pause, Square, Settings,
    BarChart3, AlertTriangle,
} from 'lucide-react';
import { DarkMiniStat, DarkMiniInput } from './ui';

/**
 * QuickModePanel — 快速模式面板
 *
 * 包含：控制按鈕、進度條、即時統計、設定、紀錄
 */
const QuickModePanel = ({
    // autoPlay 狀態
    isPlaying, isPaused, gameState, GameState,
    stats, logs, error, config,
    // autoPlay 動作
    startAutoPlay, stopAutoPlay, togglePause, resetStats, updateConfig,
    // 外部依賴
    isConnected, spinButtonROI, canStart,
    // 衍生統計
    actualSpins, derived, progress,
    // 開始遊玩
    onStart,
    // 子面板狀態
    showSettings, setShowSettings,
    showLogs, setShowLogs,
}) => {
    return (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
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
                    <button onClick={onStart} disabled={!canStart}
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
    );
};

export default QuickModePanel;
