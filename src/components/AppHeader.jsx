import React from 'react';
import { Trophy, Settings, ToggleLeft, ToggleRight } from 'lucide-react';
import useAppStore from '../stores/useAppStore';

export default function AppHeader({ onOpenSettings }) {
    const uiMode = useAppStore(s => s.uiMode);
    const setUiMode = useAppStore(s => s.setUiMode);

    const isSimple = uiMode === 'simple';

    return (
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center space-x-3">
                <div className="p-3 bg-indigo-600 text-white rounded-lg shadow-lg">
                    <Trophy size={28} />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">老虎機線獎辨識工具</h1>
                    <p className="text-slate-500">Slot Machine Setup & Evaluator</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {/* 模式切換 */}
                <button
                    onClick={() => setUiMode(isSimple ? 'full' : 'simple')}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-all text-sm font-bold text-slate-700 shrink-0 active:scale-95"
                    title={isSimple ? '切換至完整模式（含 P1/P4/P5）' : '切換至簡易模式（僅 P2/P3）'}
                >
                    {isSimple
                        ? <><ToggleLeft size={18} className="text-slate-400" /><span>簡易模式</span></>
                        : <><ToggleRight size={18} className="text-indigo-500" /><span>完整模式</span></>
                    }
                </button>
                {/* 設定 */}
                <button
                    onClick={onOpenSettings}
                    className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors text-sm font-bold text-slate-700 shrink-0"
                    title="環境與金鑰設定"
                >
                    <Settings size={18} className="text-slate-500" />
                </button>
            </div>
        </header>
    );
}
