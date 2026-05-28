import React from 'react';
import { Cpu, X } from 'lucide-react';

/**
 * NativeSourceModal — 本地擷取來源選擇 Modal
 * 列出可用的螢幕和應用程式視窗供使用者選擇
 */
export default function NativeSourceModal({ sources, onSelect, onClose }) {
    if (!sources || sources.length === 0) return null;

    const monitors = sources.filter(s => s.type === 'monitor');
    const windows = sources.filter(s => s.type === 'window');

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Cpu size={20} className="text-teal-600" />
                        選擇擷取來源 (本地伺服器)
                    </h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-4 overflow-y-auto flex-1">
                    <div className="space-y-6">
                        {/* 螢幕區塊 */}
                        <div>
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">🖥️ 實體螢幕</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {monitors.map(source => (
                                    <button
                                        key={source.id}
                                        onClick={() => onSelect(source)}
                                        className="text-left px-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-teal-500 hover:shadow-md transition-all group flex flex-col gap-1"
                                    >
                                        <span className="font-bold text-slate-700 group-hover:text-teal-700">{source.label}</span>
                                        <span className="text-xs text-slate-400">{source.width} x {source.height} @ 60fps</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* 視窗區塊 */}
                        <div>
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">🪟 應用程式視窗</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {windows.map(source => (
                                    <button
                                        key={source.id}
                                        onClick={() => onSelect(source)}
                                        className="text-left px-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-indigo-500 hover:shadow-md transition-all group flex flex-col gap-1"
                                    >
                                        <span className="font-bold text-slate-700 group-hover:text-indigo-700 truncate w-full" title={source.label}>{source.label}</span>
                                        <span className="text-xs text-slate-400">{source.rect.width} x {source.rect.height} @ 60fps</span>
                                    </button>
                                ))}
                                {windows.length === 0 && (
                                    <div className="col-span-full p-4 text-center text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        找不到足夠大的可見視窗
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
