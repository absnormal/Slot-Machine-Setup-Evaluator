import React, { useState } from 'react';
import { Trash2, ChevronRight, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { BLOCK_META } from './blockDefs';
import AddBlockButton from './AddBlockButton';

/**
 * BlockRow — 單一積木列（支援巢狀、移動、刪除）
 */
const BlockRow = ({ block, depth, index, siblingCount, onDelete, onUpdate, onMove, currentBlockId, isRunning }) => {
    const [expanded, setExpanded] = useState(true);
    const meta = BLOCK_META[block.type] || { icon: '❔', label: block.type, color: 'border-slate-600 bg-slate-800' };
    const isActive = currentBlockId === block.id;
    const isContainer = block.type === 'loop' || block.type === 'if_then';

    const paramSummary = () => {
        const p = block.params || {};
        switch (block.type) {
            case 'click_roi': return p.roi || '';
            case 'wait': return `${p.ms}ms`;
            case 'wait_stable': return `${p.roi || 'REEL'} ×${p.stableCount || 3}`;
            case 'ocr_batch': return (p.rois || []).join(', ');
            case 'loop': return p.count ? `${p.count} 次` : p.condition || '';
            case 'set_var': return `${p.name} = ${p.value}`;
            case 'log': return p.message?.substring(0, 20) || '';
            case 'key_press': return p.key || '';
            default: return '';
        }
    };

    // 子積木操作
    const addChild = (template) => {
        onUpdate({ ...block, children: [...(block.children || []), template] });
    };
    const deleteChild = (childId) => {
        onUpdate({ ...block, children: (block.children || []).filter(c => c.id !== childId) });
    };
    const updateChild = (updated) => {
        onUpdate({ ...block, children: (block.children || []).map(c => c.id === updated.id ? updated : c) });
    };
    const moveChild = (childIndex, direction) => {
        const arr = [...(block.children || [])];
        const target = childIndex + direction;
        if (target < 0 || target >= arr.length) return;
        [arr[childIndex], arr[target]] = [arr[target], arr[childIndex]];
        onUpdate({ ...block, children: arr });
    };

    return (
        <div style={{ marginLeft: depth * 20 }}>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${meta.color} ${isActive ? 'ring-2 ring-purple-400 shadow-lg shadow-purple-500/10' : ''}`}>
                {isContainer && (
                    <button onClick={() => setExpanded(!expanded)} className="text-slate-500 hover:text-slate-300 p-0.5">
                        {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                    </button>
                )}
                <span className="text-base">{meta.icon}</span>
                <span className="text-slate-300 font-semibold">{meta.label}</span>
                <span className="text-slate-500 text-xs truncate flex-1">{paramSummary()}</span>
                {!isRunning && (
                    <div className="flex items-center gap-0.5">
                        <button onClick={() => onMove(index, -1)} disabled={index === 0}
                            className="text-slate-600 hover:text-slate-300 p-0.5 disabled:opacity-20 disabled:cursor-default">
                            <ArrowUp size={12}/>
                        </button>
                        <button onClick={() => onMove(index, 1)} disabled={index >= siblingCount - 1}
                            className="text-slate-600 hover:text-slate-300 p-0.5 disabled:opacity-20 disabled:cursor-default">
                            <ArrowDown size={12}/>
                        </button>
                        <button onClick={() => onDelete(block.id)} className="text-slate-600 hover:text-rose-400 p-1">
                            <Trash2 size={14}/>
                        </button>
                    </div>
                )}
            </div>

            {isContainer && expanded && (
                <div className="mt-1 space-y-1">
                    {(block.children || []).map((child, ci) => (
                        <BlockRow key={child.id} block={child} depth={depth + 1}
                            index={ci} siblingCount={(block.children || []).length}
                            onDelete={deleteChild} onUpdate={updateChild} onMove={moveChild}
                            currentBlockId={currentBlockId} isRunning={isRunning} />
                    ))}
                    {!isRunning && <AddBlockButton depth={depth + 1} onAdd={addChild} />}
                </div>
            )}
        </div>
    );
};

export default BlockRow;
