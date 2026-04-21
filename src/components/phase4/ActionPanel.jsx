import React from 'react';
import { RefreshCw, Square, Sparkles, Monitor, ImageIcon, FolderOpen, X, CheckCircle2, Send } from 'lucide-react';

/**
 * ActionPanel — Phase4 底部動作區
 *
 * 包含：智慧標記/刪除、辨識按鈕組、自動存檔區塊、匯出/匯入
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
    // 自動存檔
    rootSaveDirHandle,
    saveDirHandle,
    saveCount,
    saveFormat,
    setSaveFormat,
    handlePickSaveDir,
    setRootSaveDirHandle,
    setSaveDirHandle,
    // 匯出 & 匯入
    exportHTMLReport,
    onImportSession,
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

            {/* 自動存檔區塊 */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
                {!rootSaveDirHandle ? (
                    <button onClick={handlePickSaveDir}
                        className="w-full py-3 rounded-xl font-black flex flex-col items-center justify-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 border border-orange-600 transition-all active:scale-95 text-sm shadow-lg shadow-orange-500/30 animate-pulse-slow">
                        <div className="flex items-center gap-2"><FolderOpen size={16} /> 設定靜默存檔目錄</div>
                        <div className="text-[10px] font-normal opacity-90">(必選，點開始分析自動建子資料夾)</div>
                    </button>
                ) : (
                    <div className="flex flex-col gap-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                            <div className="flex items-center gap-1">
                                <CheckCircle2 size={14} />
                                <span>根目錄綁定成功</span>
                            </div>
                            <span className="truncate max-w-[120px] bg-white px-2 py-0.5 rounded shadow-sm border border-emerald-100" title={rootSaveDirHandle.name}>{rootSaveDirHandle.name}</span>
                        </div>
                        {saveDirHandle && (
                            <div className="text-[10px] text-emerald-600 flex justify-between items-center bg-white/50 px-2 rounded">
                                <span>↳ 本局目標：{saveDirHandle.name}</span>
                                <span>(已存 {saveCount} 張)</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                            <select
                                value={saveFormat}
                                onChange={e => setSaveFormat(e.target.value)}
                                className="flex-1 bg-white border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg px-2 py-1.5 outline-none cursor-pointer">
                                <option value="jpeg">JPEG (省空間)</option>
                                <option value="png">PNG (無損)</option>
                            </select>
                            <button onClick={handlePickSaveDir}
                                className="flex-1 py-1.5 rounded-lg font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-all text-xs text-center shadow-sm" title="更換根目錄">
                                更換根目錄
                            </button>
                            <button onClick={() => { setRootSaveDirHandle(null); setSaveDirHandle(null); }}
                                className="flex items-center justify-center min-w-[32px] h-[32px] rounded-lg bg-white border border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer shadow-sm" title="取消綁定並停止存檔">
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 匯出 & 傳送 */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex gap-2">
                    <button onClick={() => exportHTMLReport(candidates, template?.name || 'slot_analysis', saveDirHandle)}
                        disabled={!candidates.some(c => c.ocrData || c.recognitionResult)}
                        className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all ${!candidates.some(c => c.ocrData || c.recognitionResult) ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 active:scale-95'}`}>
                        <ImageIcon size={14} /> 匯出報告 + JSON
                    </button>
                </div>
                <div className="flex gap-2">
                    <button onClick={onImportSession}
                        className="flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 text-xs transition-all bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-200 active:scale-95">
                        <FolderOpen size={14} /> 匯入歷史資料（選取資料夾）
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ActionPanel;
