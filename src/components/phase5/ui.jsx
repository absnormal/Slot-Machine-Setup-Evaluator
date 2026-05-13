import React from 'react';

// ── 底部列狀態圓點 ──
export const StatusDot = ({ active, color, label }) => {
    const dotColor = {
        emerald: active ? 'bg-emerald-400' : 'bg-slate-600',
        amber: active ? 'bg-amber-400' : 'bg-slate-600',
        purple: active ? 'bg-purple-400' : 'bg-slate-600',
    };
    return (
        <span className={`flex items-center gap-1 text-[11px] ${active ? 'text-slate-300' : 'text-slate-600'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${dotColor[color]} ${active ? 'animate-pulse' : ''}`} />
            {label}
        </span>
    );
};

// ── 深色主題統計格 ──
export const DarkMiniStat = ({ label, value, color }) => {
    const c = color === 'emerald' ? 'text-emerald-400' : color === 'rose' ? 'text-rose-400' : 'text-slate-200';
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-1.5 text-center">
            <div className="text-[9px] text-slate-500 font-bold leading-tight">{label}</div>
            <div className={`text-xs font-bold font-mono ${c} leading-tight mt-0.5`}>{value}</div>
        </div>
    );
};

// ── 深色主題輸入框 ──
export const DarkMiniInput = ({ label, value, onChange, hint, ...props }) => (
    <div>
        <label className="text-[10px] text-slate-400 font-bold">{label}</label>
        <input value={value} onChange={e => onChange(e.target.value)}
            className="w-full mt-0.5 px-2 py-1 rounded-md border border-slate-600 bg-slate-900 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
            {...props} />
        {hint && <div className="text-[9px] text-slate-500">{hint}</div>}
    </div>
);
