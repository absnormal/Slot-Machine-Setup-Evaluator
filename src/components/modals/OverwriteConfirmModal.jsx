import React from 'react';
import { Cloud, Loader2 } from 'lucide-react';

/**
 * 雲端模板重複偵測 → 覆蓋/另存確認 Modal
 */
export default function OverwriteConfirmModal({
    show,
    pendingOverwriteData,
    onOverwrite,
    onForceNew,
    onCancel,
    isSaving,
    activeSaveAction,
    platformName,
    gameName
}) {
    if (!show || !pendingOverwriteData) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 100000 }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Cloud size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">偵測到重複模板</h3>
                    <p className="text-slate-500 mb-6">
                        雲端已存在 <span className="font-bold text-indigo-600">[{platformName} - {gameName}]</span> 的模板資料。<br />
                        您要覆蓋既有模板，還是另存為新模板？
                    </p>
                    <div className="space-y-3">
                        <button
                            onClick={() => onOverwrite(pendingOverwriteData.existing.id)}
                            disabled={isSaving}
                            className={`w-full py-3 text-white font-bold rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 ${isSaving ? 'bg-indigo-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}
                        >
                            {isSaving && activeSaveAction === pendingOverwriteData.existing.id ? <Loader2 className="animate-spin" size={20} /> : null}
                            {isSaving && activeSaveAction === pendingOverwriteData.existing.id ? '處理中...' : '覆蓋更新 (取代舊有)'}
                        </button>
                        <button
                            onClick={onForceNew}
                            disabled={isSaving}
                            className={`w-full py-3 font-bold rounded-xl border transition-colors flex items-center justify-center gap-2 ${isSaving ? 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                        >
                            {isSaving && activeSaveAction === 'FORCE_NEW' ? <Loader2 className="animate-spin" size={20} /> : null}
                            {isSaving && activeSaveAction === 'FORCE_NEW' ? '另存中...' : '另存為新模板'}
                        </button>
                        <button
                            onClick={onCancel}
                            disabled={isSaving}
                            className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            取消
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
