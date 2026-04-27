import React from 'react';
import { RefreshCw, Square, Sparkles, Monitor } from 'lucide-react';

/**
 * ActionPanel — Phase4 底部動作區
 *
 * 包含：智慧標記/刪除、辨識按鈕組
 */
const ActionPanel = ({
    // 候選幀資料
    candidates,
    // 智慧標記
    smartDedup,
    fgType,
    handleConfirmDedup,
    // 雙向連線
    template,
    enableBidirectional,
    setEnableBidirectional,
    // 辨識
    isRecognizing,
    isStopping,
    recognitionProgress,
    recognizeBatch,
    recognizeLocalBatch,
    cancelRecognition,
    ocrDecimalPlaces,
    winPendingCount,
    // 斷層修復
    brokenGroupIds,
    handleHealBreaksGlobally,
}) => {
    return (
        <div className="p-4 bg-white border-t space-y-2.5">

            {candidates.length >= 2 && (
                candidates.some(c => c.isSpinBest !== undefined) ? (
                    <div className="flex gap-2">
                        <button onClick={() => smartDedup(fgType)}
                            className="flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 active:scale-95">
                            <RefreshCw size={14} /> 重新標記
                        </button>
                        <button onClick={handleConfirmDedup}
                            className="flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 active:scale-95">
                            🧹 智慧刪除 (僅保留最佳)
                        </button>
                    </div>
                ) : (
                    <button onClick={() => smartDedup(fgType)}
                        className="w-full py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 active:scale-95">
                        🧹 智慧標記（辨識同局 → 凸顯最佳）
                    </button>
                )
            )}

            {/* Bi-directional Paylines Runtime Toggle */}
            {template?.hasBidirectionalPaylines && (
                <label className="flex items-center gap-2 cursor-pointer bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                    <input type="checkbox" checked={enableBidirectional} onChange={e => setEnableBidirectional(e.target.checked)} className="w-4 h-4 text-amber-500 border-amber-300 rounded focus:ring-amber-400" />
                    <span className="text-xs font-bold text-amber-700">啟用雙向連線算分</span>
                    <span className="text-[10px] text-amber-500 ml-1">(左至右 + 右至左取最高)</span>
                </label>
            )}

            {/* 辨識按鈕組 */}
            {candidates.length > 0 && (isRecognizing || winPendingCount > 0) && (
                isRecognizing ? (
                    <button onClick={cancelRecognition}
                        className="w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 bg-rose-100 text-rose-600 border border-rose-200 hover:bg-rose-200 transition-all active:scale-95 text-sm">
                        <Square size={16} /> 停止辨識 ({recognitionProgress.current}/{recognitionProgress.total})
                    </button>
                ) : (
                    <div className="space-y-2">
                        <button onClick={() => recognizeLocalBatch(ocrDecimalPlaces)}
                            className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-emerald-600 text-white hover:bg-emerald-500 transition-all active:scale-95 shadow-md shadow-emerald-500/20 text-sm">
                        <Monitor size={18} /> 本地為主：即時辨識盤面（未處理 {winPendingCount} 張）
                    </button>

                        <div className="space-y-1">
                            <button onClick={() => recognizeBatch(ocrDecimalPlaces)}
                                className="w-full py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 bg-violet-50/50 text-violet-600 hover:bg-violet-100 border border-violet-200 transition-all active:scale-95 text-xs">
                                <Sparkles size={14} /> Gemini 為輔：雲端補充辨識（未處理 {winPendingCount} 張）
                            </button>
                            <p className="text-[10px] text-slate-400 text-center">※ 只會辨識 WIN &gt; 0 的盤面，無贏分的可手動送 P3</p>
                        </div>
                    </div>
                )
            )}

        </div>
    );
};

export default ActionPanel;
