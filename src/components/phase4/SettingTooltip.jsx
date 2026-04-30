import { useState } from 'react';

/**
 * 遊戲道具風格的設定說明浮動面板
 * hover 時在按鈕上方顯示功能描述、適用場景、技術原理
 */
export default function SettingTooltip({ children, title, desc, usage, tech, position = 'top' }) {
    const [show, setShow] = useState(false);
    const isBottom = position === 'bottom';
    return (
        <div className="relative flex items-center"
             onMouseEnter={() => setShow(true)}
             onMouseLeave={() => setShow(false)}>
            {children}
            <div className={`absolute ${isBottom ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 -translate-x-1/2
                 w-64 p-3 rounded-xl bg-slate-900/95 text-white text-xs shadow-2xl text-left
                 border border-slate-600 z-50 pointer-events-none backdrop-blur-sm
                 transition-all duration-150 ${isBottom ? 'origin-top' : 'origin-bottom'}
                 ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-95 invisible'}`}>
                <div className="font-bold text-sm mb-1.5 text-white">{title}</div>
                <div className="text-slate-300 leading-relaxed mb-2 whitespace-pre-line">{desc}</div>
                {usage && <div className="text-emerald-400 text-[11px]">⚡ 適用：{usage}</div>}
                {tech && <div className="text-slate-500 mt-1 text-[10px] whitespace-pre-line">🔧 原理：{tech}</div>}
                {/* 小三角箭頭 */}
                {isBottom
                    ? <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-px
                         border-[6px] border-transparent border-b-slate-600" />
                    : <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px
                         border-[6px] border-transparent border-t-slate-600" />
                }
            </div>
        </div>
    );
}
