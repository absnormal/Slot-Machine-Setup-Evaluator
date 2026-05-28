import React from 'react';
import { Zap } from 'lucide-react';
import { isDynamicMultiplierSymbol } from '../../utils/symbolUtils';

/**
 * 金幣/乘倍數值設定 Modal
 * 從 Phase2Manual.jsx 抽出
 */
const CashValueModal = ({ show, onClose, onConfirm, cashValueInput, setCashValueInput, template, activeBrush }) => {
    if (!show) return null;
    const isDynamic = template?.hasDynamicMultiplier && isDynamicMultiplierSymbol(activeBrush);

    return (
        <div className="modal-overlay">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-700 bg-slate-800/50 flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                        <Zap className="text-indigo-400" size={20} />
                    </div>
                    <div>
                        <h3 className="text-white font-bold">{isDynamic ? "設定乘倍數值" : "設定金幣數值"}</h3>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-slate-400 text-xs font-bold mb-2 uppercase tracking-wider">{isDynamic ? "乘倍倍數" : "實際面額"}</label>
                        <div className="relative">
                            <input
                                autoFocus
                                type="text"
                                value={cashValueInput}
                                onChange={(e) => setCashValueInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (e.nativeEvent) e.nativeEvent.stopImmediatePropagation();
                                        onConfirm();
                                    }
                                    if (e.key === 'Escape') {
                                        e.stopPropagation();
                                        if (e.nativeEvent) e.nativeEvent.stopImmediatePropagation();
                                        onClose();
                                    }
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white text-2xl font-black focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                placeholder={isDynamic ? "例如: 5、10、100" : "例如:10、3.5M、2.5K"}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {[0.5, 1, 2, 5, 10, 20, 50, 100].map(v => (
                            <button
                                key={v}
                                onClick={() => setCashValueInput(String(v))}
                                className="py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-colors border border-slate-600"
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex justify-end gap-3">
                    <button onClick={onClose} className="btn-ghost text-slate-400 hover:text-slate-200">取消</button>
                    <button onClick={onConfirm} className="btn-primary px-8 rounded-xl">確認設定</button>
                </div>
            </div>
        </div>
    );
};

export default CashValueModal;
