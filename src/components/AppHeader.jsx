import React from 'react';
import { Trophy, Settings } from 'lucide-react';

export default function AppHeader({ onOpenSettings }) {
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
            <button onClick={onOpenSettings} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors text-sm font-bold text-slate-700 shrink-0">
                <Settings size={18} className="text-slate-500" />
                <span>環境與金鑰設定</span>
            </button>
        </header>
    );
}
