import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { BLOCK_META, NEW_BLOCK_TEMPLATES, genId } from './blockDefs';

/**
 * AddBlockButton — 新增積木下拉選單
 * 使用 createPortal 渲染到 body，避免被父容器 overflow 裁切。
 */
const AddBlockButton = ({ depth, onAdd }) => {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0, openUp: false });

    // 計算選單位置
    useEffect(() => {
        if (!open || !btnRef.current) return;
        const rect = btnRef.current.getBoundingClientRect();
        const menuHeight = 260; // 預估選單高度
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < menuHeight && rect.top > menuHeight;

        setMenuPos({
            left: rect.left,
            top: openUp ? rect.top - menuHeight : rect.bottom + 4,
            openUp,
        });
    }, [open]);

    // 點擊外部關閉
    useEffect(() => {
        if (!open) return;
        const handleClick = (e) => {
            if (btnRef.current && !btnRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const handleAdd = (template) => {
        const newBlock = { ...template, id: genId(), params: { ...template.params } };
        if (template.children) newBlock.children = [];
        onAdd(newBlock);
        setOpen(false);
    };

    return (
        <div style={{ marginLeft: depth * 20 }}>
            <button ref={btnRef} onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-400 px-3 py-1.5 transition-colors">
                <Plus size={14}/> 新增積木
            </button>

            {open && createPortal(
                <div
                    className="fixed z-[99999] bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-2 w-56 space-y-0.5 max-h-64 overflow-y-auto"
                    style={{ top: menuPos.top, left: menuPos.left }}
                >
                    {NEW_BLOCK_TEMPLATES.map(t => {
                        const m = BLOCK_META[t.type];
                        return (
                            <button key={t.type} onClick={() => handleAdd(t)}
                                className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition-colors">
                                <span className="text-base">{m?.icon}</span> {m?.label}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </div>
    );
};

export default AddBlockButton;
