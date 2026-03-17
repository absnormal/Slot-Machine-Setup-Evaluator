import React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function ToastMessage({ message, type = 'success' }) {
    if (!message) return null;
    
    const isError = type === 'error';
    const bgColor = isError ? 'bg-rose-950/90' : 'bg-slate-900/95';
    const textColor = isError ? 'text-rose-400' : 'text-emerald-400';
    const borderColor = isError ? 'border-rose-900/50' : 'border-slate-700';

    return (
        <div className={`fixed bottom-6 right-6 ${bgColor} ${textColor} px-5 py-3.5 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.3)] font-bold flex items-center gap-3 animate-in slide-in-from-bottom-5 z-[99999] border ${borderColor} backdrop-blur-sm`}>
            {isError ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            <span>{message}</span>
        </div>
    );
}
