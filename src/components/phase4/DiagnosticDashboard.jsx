import React from 'react';
import { AlertCircle, Star } from 'lucide-react';

/**
 * DiagnosticDashboard — 統計 + 診斷儀表板
 *
 * 純展示型元件，顯示：
 *   - RTP / Spins / 命中率等統計
 *   - 總局數 / 連貫局 / 斷層 / 算分異常
 *   - 導航按鈕（找下個斷點 / 算分異常 / 非零贏分）
 */
const DiagnosticDashboard = ({
    diagnosticStats,
    wrongWinGroupIds,
    nonZeroWinGroupIds,
    // 導航
    scrollToNextBreak,
    scrollToNextWrongWin,
    scrollToNextNonZeroWin,
    currentBreakIndex,
    currentWrongWinIndex,
    currentNonZeroWinIndex,
}) => {
    return (
        <>

            {/* 診斷儀表板 */}
            {diagnosticStats && (
                <div className="p-3 bg-white border-b border-slate-200 shadow-sm relative z-10">
                    <div className="flex items-center justify-between">
                        <div className="flex gap-6 pl-2">
                            <div className="text-center">
                                <div className="text-[10px] text-slate-500 font-bold mb-0.5">總局數</div>
                                <div className="text-xl leading-none font-black text-slate-700">{diagnosticStats.total}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[10px] text-emerald-600 font-bold mb-0.5">連貫局</div>
                                <div className="text-xl leading-none font-black text-emerald-600">{diagnosticStats.unbroken}</div>
                            </div>
                            <div className="text-center relative">
                                <div className="text-[10px] text-rose-600 font-bold mb-0.5">斷層</div>
                                <div className="text-xl leading-none font-black text-rose-600">{diagnosticStats.broken}</div>
                                {diagnosticStats.broken > 0 && <span className="absolute -top-1 -right-2 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span></span>}
                            </div>
                            {(wrongWinGroupIds?.length > 0) && (
                                <div className="text-center relative">
                                    <div className="text-[10px] text-amber-600 font-bold mb-0.5">算分異常</div>
                                    <div className="text-xl leading-none font-black text-amber-600">{wrongWinGroupIds.length}</div>
                                    <span className="absolute -top-1 -right-2 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span></span>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col gap-1.5 items-end">
                            {diagnosticStats.broken > 0 && (
                                <button onClick={scrollToNextBreak} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 rounded-lg text-xs font-bold transition-all border border-rose-200 active:scale-95 shadow-sm">
                                    <AlertCircle size={14} /> 找下個斷點 ({currentBreakIndex + 1}/{diagnosticStats.broken})
                                </button>
                            )}
                            {wrongWinGroupIds?.length > 0 && (
                                <button onClick={scrollToNextWrongWin} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700 rounded-lg text-xs font-bold transition-all border border-amber-200 active:scale-95 shadow-sm">
                                    <AlertCircle size={14} /> 找下個算分異常 ({currentWrongWinIndex + 1}/{wrongWinGroupIds.length})
                                </button>
                            )}
                            {nonZeroWinGroupIds?.length > 0 && (
                                <button onClick={scrollToNextNonZeroWin} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 rounded-lg text-xs font-bold transition-all border border-emerald-200 active:scale-95 shadow-sm">
                                    <Star size={14} /> 找下個非零贏分 ({currentNonZeroWinIndex + 1}/{nonZeroWinGroupIds.length})
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default DiagnosticDashboard;
