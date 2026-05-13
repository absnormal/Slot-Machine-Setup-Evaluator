import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { BLOCK_META, NEW_BLOCK_TEMPLATES, genId } from './blockDefs';

/**
 * AddBlockButton — 新增積木下拉選單
 */
const AddBlockButton = ({ depth, onAdd }) => {
    const [open, setOpen] = useState(false);

    const handleAdd = (template) => {
        const newBlock = { ...template, id: genId(), params: { ...template.params } };
        if (template.children) newBlock.children = [];
        onAdd(newBlock);
        setOpen(false);
    };

    return (
        <div style={{ marginLeft: depth * 20 }} className="relative">
            <button onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-400 px-3 py-1.5 transition-colors">
                <Plus size={14}/> 新增積木
            </button>
            {open && (
                <div className="absolute left-0 bottom-8 z-50 bg-slate-800 border border-slate-600 rounded-xl shadow-xl p-2 w-56 space-y-0.5 max-h-56 overflow-y-auto">
                    {NEW_BLOCK_TEMPLATES.map(t => {
                        const m = BLOCK_META[t.type];
                        return (
                            <button key={t.type} onClick={() => handleAdd(t)}
                                className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition-colors">
                                <span className="text-base">{m?.icon}</span> {m?.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AddBlockButton;
