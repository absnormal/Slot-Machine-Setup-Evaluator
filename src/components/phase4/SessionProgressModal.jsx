import React from 'react';
import { Loader2, FolderOpen, FileDown } from 'lucide-react';

/**
 * SessionProgressModal — 匯入/匯出進度條 Modal
 *
 * Props:
 *   progress: null | { type: 'import'|'export', phase: string, current: number, total: number, detail: string, startTime: number }
 */
const SessionProgressModal = ({ progress }) => {
    if (!progress) return null;

    const { type, phase, current, total, detail, startTime } = progress;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const elapsed = startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : '0.0';

    const isImport = type === 'import';
    const Icon = isImport ? FolderOpen : FileDown;
    const title = isImport ? '📥 匯入歷史資料中...' : '📤 匯出報告中...';
    const accentColor = isImport ? '#3b82f6' : '#8b5cf6';
    const gradientFrom = isImport ? '#3b82f6' : '#8b5cf6';
    const gradientTo = isImport ? '#06b6d4' : '#ec4899';

    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="px-6 pt-6 pb-3 flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm animate-pulse"
                        style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
                    >
                        <Icon size={20} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                        <p className="text-xs text-slate-400">請勿關閉頁面</p>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="px-6 pb-2">
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <div
                            className="h-full rounded-full transition-all duration-300 ease-out"
                            style={{
                                width: `${percent}%`,
                                background: `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`,
                                boxShadow: `0 0 12px ${accentColor}40`
                            }}
                        />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs font-bold text-slate-500">{percent}%</span>
                        <span className="text-xs font-mono text-slate-400">{current} / {total}</span>
                    </div>
                </div>

                {/* Detail */}
                <div className="px-6 pb-5 space-y-2">
                    {/* Phase */}
                    <div className="flex items-center gap-2">
                        <Loader2 size={14} className="text-slate-400 animate-spin" />
                        <span className="text-sm font-bold text-slate-600">{phase || '準備中...'}</span>
                    </div>

                    {/* Current file */}
                    {detail && (
                        <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                            <p className="text-[11px] text-slate-400 font-mono truncate" title={detail}>
                                {detail}
                            </p>
                        </div>
                    )}

                    {/* Elapsed time */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span>⏱</span>
                        <span>已耗時 {elapsed}s</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SessionProgressModal;
