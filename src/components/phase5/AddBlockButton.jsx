import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { BLOCK_META, NEW_BLOCK_TEMPLATES, genId } from './blockDefs';

/**
 * AddBlockButton — 新增積木下拉選單
 *
 * 兩種模式：
 *   - 預設模式（底部按鈕）：顯示「＋ 新增積木」文字按鈕
 *   - inline 模式（插入線）：積木之間的細線，hover 時浮現 ＋ 按鈕
 *
 * 使用 createPortal 渲染到 body，避免被父容器 overflow 裁切。
 */
const AddBlockButton = ({ depth, onAdd, inline = false }) => {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const menuRef = useRef(null);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0, openUp: false });

    // 計算選單位置
    useEffect(() => {
        if (!open || !btnRef.current) return;
        const rect = btnRef.current.getBoundingClientRect();
        const menuHeight = 300; // 預估選單高度
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < menuHeight && rect.top > menuHeight;

        setMenuPos({
            left: rect.left,
            top: openUp ? rect.top - menuHeight : rect.bottom + 4,
            openUp,
        });
    }, [open]);

    // 點擊外部關閉（排除按鈕和選單本身）
    useEffect(() => {
        if (!open) return;
        const handleClick = (e) => {
            if (btnRef.current?.contains(e.target)) return;
            if (menuRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const handleAdd = (template) => {
        const newBlock = { ...template, id: genId(), params: { ...template.params } };
        if (template.children) newBlock.children = [];
        if (template.elseChildren) newBlock.elseChildren = [];
        onAdd(newBlock);
        setOpen(false);
    };

    // ── 選單 Portal ──
    const menu = open && createPortal(
        <div
            ref={menuRef}
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
    );

    // ── inline 模式：插入線 ──
    if (inline) {
        return (
            <div style={{ marginLeft: depth * 20 }} className="group/insert relative flex items-center h-3 -my-0.5">
                {/* 虛線 */}
                <div className="absolute inset-x-3 top-1/2 border-t border-dashed border-slate-700/0 group-hover/insert:border-slate-600 transition-colors" />
                {/* ＋ 按鈕 */}
                <button
                    ref={btnRef}
                    onClick={() => setOpen(!open)}
                    className="relative z-10 mx-auto flex items-center justify-center w-5 h-5 rounded-full
                               bg-slate-800 border border-slate-700 text-slate-600
                               opacity-0 group-hover/insert:opacity-100
                               hover:border-indigo-500 hover:text-indigo-400 hover:bg-slate-900
                               transition-all duration-150 scale-75 group-hover/insert:scale-100"
                    title="在此插入積木"
                >
                    <Plus size={12} />
                </button>
                {menu}
            </div>
        );
    }

    // ── 預設模式：底部文字按鈕 ──
    return (
        <div style={{ marginLeft: depth * 20 }}>
            <button ref={btnRef} onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-400 px-3 py-1.5 transition-colors">
                <Plus size={14}/> 新增積木
            </button>
            {menu}
        </div>
    );
};

export default AddBlockButton;
