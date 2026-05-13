import React from 'react';
import { Gamepad2, ChevronUp, ChevronDown } from 'lucide-react';
import { StatusDot } from './ui';

/**
 * StatusBar — 固定底部狀態列
 *
 * 永遠可見的連線/偵測/遊玩狀態 + 數據快報 + 展開按鈕
 */
const StatusBar = ({
    isConnected, isDetecting, isPlaying,
    stateColor, stateLabel,
    actualSpins, derived, candidateCount,
    isExpanded, setIsExpanded,
}) => {
    return (
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
                        <span>幀 <span className="text-slate-300 font-bold">{candidateCount}</span></span>
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
    );
};

export default StatusBar;
