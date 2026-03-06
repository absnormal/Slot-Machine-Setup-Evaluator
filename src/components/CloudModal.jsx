import React from 'react';
import { Cloud, X, RefreshCw, Loader2, Settings, Trophy, Trash2, Download, Database } from 'lucide-react';
import { GAS_URL } from '../utils/constants';

export default function CloudModal({
    show, onClose,
    cloudTemplates, isLoadingCloud, isBackgroundSyncing,
    downloadingId, deletingId, localUserId,
    onForceRefresh, onLoadTemplate, onDeleteTemplate, setDeletingId
}) {
    if (!show) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold flex items-center space-x-2 text-slate-800">
                            <Cloud className="text-indigo-500" />
                            <span>Google Sheets 模板庫</span>
                        </h2>
                        {isBackgroundSyncing ? (
                            <span className="flex items-center gap-1.5 text-[10px] bg-indigo-50 text-indigo-500 border border-indigo-100 px-2 py-1 rounded-full font-bold animate-pulse">
                                <RefreshCw size={10} className="animate-spin" /> 同步最新資料中...
                            </span>
                        ) : (
                            <button onClick={onForceRefresh} className="flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 px-2 py-1 rounded-full font-bold transition-colors" title="強制繞過快取重新整理">
                                <RefreshCw size={10} /> 重新整理
                            </button>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
                </div>
                <div className="p-4 overflow-y-auto flex-1 bg-slate-50/50 custom-scrollbar relative">
                    {!GAS_URL ? (
                        <div className="text-center py-12 text-slate-500">
                            <Database className="mx-auto mb-3 opacity-30 text-rose-500" size={48} />
                            <p className="font-bold text-slate-700">尚未綁定資料庫</p>
                            <p className="text-sm mt-2">請在原始碼中設定您的 GAS_URL 來啟用雲端功能。</p>
                        </div>
                    ) : isLoadingCloud ? (
                        <div className="text-center py-12 text-slate-500 flex flex-col items-center">
                            <Loader2 className="animate-spin mb-3 text-indigo-500" size={32} />
                            <p>正在從試算表載入列表...</p>
                        </div>
                    ) : cloudTemplates.length === 0 ? (
                        <div className="text-center py-12 text-slate-500"><Cloud className="mx-auto mb-3 opacity-20" size={48} /><p>您的試算表上還沒有任何共享模板喔！</p></div>
                    ) : (
                        <div className="space-y-3">
                            {cloudTemplates.map(t => (
                                <div key={t.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-800">{t.name || '未命名模板'}</h3>
                                        <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                            {(t.platformName || t.gameName) && <span className="font-semibold text-indigo-600">{[t.platformName, t.gameName].filter(Boolean).join(' - ')}</span>}
                                            <span className="flex items-center gap-1"><Settings size={14} /> {t.gridRows}x{t.gridCols} 盤面</span>
                                            <span className="flex items-center gap-1"><Trophy size={14} /> {t.linesCount !== undefined ? t.linesCount : (t.extractResults?.length || 0)} 條連線</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        {t.creatorId === localUserId && (
                                            deletingId === t.id ? (
                                                <div className="flex gap-1 bg-rose-50 p-1 rounded-lg border border-rose-100">
                                                    <button onClick={() => onDeleteTemplate(t.id)} className="px-3 py-2 bg-rose-600 text-white text-xs font-bold rounded">刪除</button>
                                                    <button onClick={() => setDeletingId(null)} className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded">取消</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setDeletingId(t.id)} className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg" disabled={downloadingId === t.id}><Trash2 size={18} /></button>
                                            )
                                        )}
                                        <button
                                            onClick={() => onLoadTemplate(t)}
                                            disabled={downloadingId === t.id}
                                            className={`px-5 py-2.5 bg-indigo-50 text-indigo-700 font-bold rounded-lg flex items-center space-x-2 border border-indigo-200 transition-colors
                                ${downloadingId === t.id ? 'opacity-70 cursor-not-allowed' : 'hover:bg-indigo-600 hover:text-white hover:border-indigo-600'}`}
                                        >
                                            {downloadingId === t.id ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                            <span>{downloadingId === t.id ? '載入中...' : '套用此模板'}</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
