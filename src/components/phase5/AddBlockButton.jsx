import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { BLOCK_META, NEW_BLOCK_TEMPLATES, genId } from './blockDefs';

/**
 * AddBlockButton — 新增積木下拉選單
 * 使用 Portal 避免被 overflow-y 的父容器裁切。
 */
const AddBlockButton = ({ depth, onAdd }) => {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const menuRef = useRef(null);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

    // 計算選單位置（在按鈕上方）
    useEffect(() => {
        if (open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setMenuPos({
                top: rect.top - 4,  // 在按鈕正上方
                left: rect.left,
            });
        }
    }, [open]);

    // 點擊外部關閉
    useEffect(() => {
        if (!open) return;
        const handleClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target) &&
                btnRef.current && !btnRef.current.contains(e.target)) {
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
        <>
            <div style={{ marginLeft: depth * 20 }}>
                <button ref={btnRef} onClick={() => setOpen(!open)}
                    className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-400 px-3 py-1.5 transition-colors">
                    <Plus size={14}/> 新增積木
                </button>
            </div>

            {open && createPortal(
                <div ref={menuRef}
                    className="fixed z-[10000] bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-2 w-56 space-y-0.5 max-h-56 overflow-y-auto"
                    style={{ top: menuPos.top, left: menuPos.left, transform: 'translateY(-100%)' }}
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
        </>
    );
};

export default AddBlockButton;
