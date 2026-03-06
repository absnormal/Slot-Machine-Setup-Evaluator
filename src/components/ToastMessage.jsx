import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function ToastMessage({ message }) {
    if (!message) return null;
    return (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-emerald-400 px-5 py-3.5 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.3)] font-bold flex items-center gap-3 animate-in slide-in-from-bottom-5 z-[99999] border border-slate-700">
            <CheckCircle2 size={20} />
            <span>{message}</span>
        </div>
    );
}
