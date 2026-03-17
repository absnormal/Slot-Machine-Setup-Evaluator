import React, { useState, useMemo } from 'react';
import { Cloud, X, RefreshCw, Loader2, Settings, Trophy, Trash2, Download, Database, Search, Filter } from 'lucide-react';
import { GAS_URL } from '../utils/constants';

export default function CloudModal({
    show, onClose,
    cloudTemplates, isLoadingCloud, isBackgroundSyncing,
    downloadingId, deletingId, localUserId,
    onForceRefresh, onLoadTemplate, onDeleteTemplate, setDeletingId,
    currentPlatformName
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('ALL');

    // 自動從模板提取所有不重複的平台名
    const platforms = useMemo(() => {
        const pSet = new Set();
        cloudTemplates.forEach(t => {
            if (t.platformName) pSet.add(t.platformName.toUpperCase());
        });
        return Array.from(pSet).sort();
    }, [cloudTemplates]);

    const [confirmDeleteId, setConfirmDeleteId] = useState(null);

    // 當 Modal 開啟時，重置搜尋與刪除確認狀態
    React.useEffect(() => {
        if (show) {
            setSearchTerm('');
            setConfirmDeleteId(null);
        }
    }, [show]);

    // 當 Modal 開啟或平台變動時，自動切換到對應分頁
    React.useEffect(() => {
        if (show && currentPlatformName) {
            const upper = currentPlatformName.toUpperCase();
            if (platforms.includes(upper)) {
                setActiveTab(upper);
            } else {
                setActiveTab('ALL');
            }
        }
    }, [show, currentPlatformName, platforms]);

    // 過濾邏輯：分頁 + 搜尋
    const filteredTemplates = useMemo(() => {
        return cloudTemplates.filter(t => {
            const matchTab = activeTab === 'ALL' || (t.platformName && t.platformName.toUpperCase() === activeTab);
            const term = searchTerm.toLowerCase();
            const matchSearch = !searchTerm ||
                (t.name && t.name.toLowerCase().includes(term)) ||
                (t.gameName && t.gameName.toLowerCase().includes(term)) ||
                (t.platformName && t.platformName.toLowerCase().includes(term));
            return matchTab && matchSearch;
        });
    }, [cloudTemplates, activeTab, searchTerm]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold flex items-center space-x-2 text-slate-800">
                            <Cloud className="text-indigo-500" />
                            <span>Google Sheets 模板庫</span>
                        </h2>
                        {isBackgroundSyncing ? (
                            <span className="flex items-center gap-1.5 text-[10px] bg-indigo-50 text-indigo-500 border border-indigo-100 px-2 py-1 rounded-full font-bold animate-pulse">
                                <RefreshCw size={10} className="animate-spin" /> 同步中...
                            </span>
                        ) : (
                            <button onClick={onForceRefresh} className="flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 px-2 py-1 rounded-full font-bold transition-colors" title="強制繞過快取重新整理">
                                <RefreshCw size={10} /> 重新整理
                            </button>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
                </div>

                {/* 搜尋 + 平台分頁 */}
                <div className="px-5 py-3 border-b border-slate-100 space-y-3 bg-white">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="搜尋名稱、平台或遊戲..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        />
                    </div>
                    {platforms.length > 0 && (
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                            <Filter size={14} className="text-slate-400 shrink-0" />
                            <button
                                onClick={() => setActiveTab('ALL')}
                                className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${activeTab === 'ALL' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'}`}
                            >
                                全部 ({cloudTemplates.length})
                            </button>
                            {platforms.map(p => {
                                const count = cloudTemplates.filter(t => t.platformName && t.platformName.toUpperCase() === p).length;
                                return (
                                    <button
                                        key={p}
                                        onClick={() => setActiveTab(p)}
                                        className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${activeTab === p ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'}`}
                                    >
                                        {p} ({count})
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Content */}
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
                    ) : filteredTemplates.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <Cloud className="mx-auto mb-3 opacity-20" size={48} />
                            <p>{searchTerm ? '找不到符合的模板' : (activeTab !== 'ALL' ? '此平台下沒有模板' : '您的試算表上還沒有任何共享模板喔！')}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredTemplates.map(t => (
                                <div key={t.id} className="group bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-bold text-lg text-slate-800 truncate">{t.name || '未命名模板'}</h3>
                                            {t.id === downloadingId && <Loader2 size={16} className="animate-spin text-indigo-500" />}
                                        </div>
                                        <div className="text-sm text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                                            {t.hasMultiplierReel && (
                                                <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[11px] border border-rose-200 flex items-center gap-1 shadow-sm">
                                                    ✨ 乘倍輪
                                                </span>
                                            )}
                                            {(t.hasDoubleSymbol === true || t.hasDoubleSymbol === 1 || String(t.hasDoubleSymbol).toUpperCase() === 'TRUE') && (
                                                <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-[11px] border border-indigo-200 flex items-center gap-1 shadow-sm">
                                                    👥 雙重
                                                </span>
                                            )}
                                            {t.hasCash && (
                                                <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[11px] border border-amber-200 flex items-center gap-1 shadow-sm">
                                                    💰 CASH
                                                </span>
                                            )}
                                            {t.hasJp && (
                                                <span className="font-bold text-fuchsia-600 bg-fuchsia-50 px-2 py-0.5 rounded text-[11px] border border-fuchsia-200 flex items-center gap-1 shadow-sm">
                                                    🏆 JP
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1">
                                                <Settings size={14} />
                                                {t.gridRows}x{t.gridCols} 盤面
                                            </span>
                                            {(t.lineMode === 'allways' || t.linesCount === 0) ? (
                                                <span className="flex items-center gap-1 text-purple-600 font-bold bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                                                    <Trophy size={14} /> {Math.pow(t.gridRows || 3, t.gridCols || 5)} Ways
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 font-medium"><Trophy size={14} /> {t.linesCount !== undefined ? t.linesCount : (t.extractResults?.length || 0)} 條連線</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center shrink-0">
                                        {t.creatorId === localUserId && (
                                            confirmDeleteId === t.id ? (
                                                <div className="flex gap-1 bg-rose-50 p-1 rounded-lg border border-rose-100 animate-in fade-in slide-in-from-right-2 duration-200">
                                                    <button 
                                                        onClick={() => onDeleteTemplate(t.id)} 
                                                        disabled={deletingId === t.id}
                                                        className={`px-3 py-2 text-white text-xs font-bold rounded flex items-center gap-1 ${deletingId === t.id ? 'bg-rose-400 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-700'}`}
                                                    >
                                                        {deletingId === t.id && <Loader2 size={12} className="animate-spin" />}
                                                        {deletingId === t.id ? '刪除中' : '刪除'}
                                                    </button>
                                                    <button 
                                                        onClick={() => setConfirmDeleteId(null)} 
                                                        disabled={deletingId === t.id}
                                                        className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded hover:bg-slate-300 disabled:opacity-50"
                                                    >
                                                        取消
                                                    </button>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => setConfirmDeleteId(t.id)} 
                                                    className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" 
                                                    disabled={downloadingId === t.id || (deletingId && deletingId !== t.id)} 
                                                    title="刪除此模板"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )
                                        )}
                                        <button
                                            onClick={() => onLoadTemplate(t)}
                                            disabled={downloadingId === t.id}
                                            className={`px-5 py-2.5 rounded-lg flex items-center space-x-2 border transition-all font-bold
                                                ${downloadingId === t.id
                                                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                                    : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 hover:shadow-lg active:scale-95'}`}
                                        >
                                            {downloadingId === t.id ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                            <span>{downloadingId === t.id ? '載入中...' : '套用模板'}</span>
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
