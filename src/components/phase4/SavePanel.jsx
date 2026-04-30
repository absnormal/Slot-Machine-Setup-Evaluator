import React from 'react';
import { FolderOpen, CheckCircle2, X, ImageIcon } from 'lucide-react';

/**
 * SavePanel — 存檔與資料管理區塊
 * 從 Phase4Video.jsx L358-422 抽離
 */
const SavePanel = ({
    // 自動存檔
    rootSaveDirHandle, setRootSaveDirHandle,
    saveDirHandle, setSaveDirHandle,
    saveCount,
    saveFormat, setSaveFormat,
    handlePickSaveDir,
    // 匯出 & 匯入
    candidates,
    exportHTMLReport,
    onImportSession,
    template,
}) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 自動存檔區塊 */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                {!rootSaveDirHandle ? (
                    <button onClick={handlePickSaveDir}
                        className="w-full py-3 rounded-xl font-black flex flex-col items-center justify-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 border border-orange-600 transition-all active:scale-95 text-sm shadow-md animate-pulse-slow">
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
                                <option value="jpeg">JPEG (省)</option>
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

            {/* 匯出 & 傳送區塊 */}
            <div className="flex flex-col gap-2 justify-center">
                <button onClick={() => exportHTMLReport(candidates, template?.name || 'slot_analysis', saveDirHandle)}
                    disabled={!candidates.some(c => c.ocrData || c.recognitionResult)}
                    className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-1.5 text-sm transition-all shadow-sm ${!candidates.some(c => c.ocrData || c.recognitionResult) ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 active:scale-95'}`}>
                    <ImageIcon size={16} /> 匯出報告 + JSON
                </button>
                <button onClick={async () => {
                        const dirHandle = await onImportSession();
                        if (dirHandle) {
                            setSaveDirHandle(dirHandle);
                            setRootSaveDirHandle(dirHandle);
                        }
                    }}
                    className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-1.5 text-sm transition-all bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-200 active:scale-95 shadow-sm">
                    <FolderOpen size={16} /> 匯入歷史資料（選取資料夾）
                </button>
            </div>
        </div>
    );
};

export default SavePanel;
