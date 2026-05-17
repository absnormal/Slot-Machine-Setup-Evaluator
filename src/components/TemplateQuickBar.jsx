import React from 'react';
import { Cloud, Pencil, LayoutGrid, Layers } from 'lucide-react';

/**
 * TemplateQuickBar — 簡易模式下的模板快速載入列
 *
 * 顯示當前模板摘要 + 快速動作按鈕，取代完整模式的 Phase 1。
 * 模板只透過雲端載入，JSON 匯入屬於 Phase 1 完整模式功能。
 */
export default function TemplateQuickBar({
    template,
    gameName,
    platformName,
    onOpenCloud,
    onEditTemplate,
}) {
    const hasTemplate = !!template;

    // 模板摘要資訊
    const summaryParts = [];
    if (template) {
        if (template.rows && template.cols) summaryParts.push(`${template.rows}×${template.cols} 盤面`);
        if (template.lineMode === 'allways') {
            summaryParts.push('AllWays');
        } else if (template.lines?.length) {
            summaryParts.push(`${template.lines.length} 條連線`);
        }
        if (template.hasMultiplierReel) summaryParts.push('乘倍輪');
        if (template.hasJackpot) summaryParts.push('JP');
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="p-5">
                {hasTemplate ? (
                    /* ── 已載入模板 ── */
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <LayoutGrid size={16} className="text-indigo-500 shrink-0" />
                                <h3 className="text-base font-bold text-slate-800 truncate">
                                    {[platformName, gameName].filter(Boolean).join(' · ') || template.name || '未命名模板'}
                                </h3>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {summaryParts.map((part, i) => (
                                    <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                                        {part}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={onOpenCloud}
                                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 shadow-sm"
                            >
                                <Cloud size={15} className="text-indigo-500" />
                                <span>載入模板</span>
                            </button>
                            <button
                                onClick={onEditTemplate}
                                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 shadow-sm"
                            >
                                <Pencil size={15} className="text-amber-500" />
                                <span>編輯</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ── 尚未載入模板 ── */
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <Layers size={16} className="text-slate-400 shrink-0" />
                                <h3 className="text-base font-bold text-slate-500">尚未載入模板</h3>
                            </div>
                            <p className="text-xs text-slate-400 ml-6">
                                請先從雲端載入遊戲模板，再開始測試
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={onOpenCloud}
                                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-bold text-white transition-all active:scale-95 shadow-md shadow-indigo-500/20"
                            >
                                <Cloud size={15} />
                                <span>載入雲端模板</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
