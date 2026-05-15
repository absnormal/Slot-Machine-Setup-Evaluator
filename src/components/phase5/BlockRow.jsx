import React, { useState, useRef, useEffect } from 'react';
import { Trash2, ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import { BLOCK_META } from './blockDefs';
import AddBlockButton from './AddBlockButton';
import BlockParams from './BlockParams';

/**
 * BlockRow — 單一積木列（拖放排序）
 *
 * 拖放原理：每個積木偵測滑鼠在上半或下半，
 * 上半 = 插入在此積木之前，下半 = 插入在此積木之後。
 */
const BlockRow = ({ block, depth, onDelete, onUpdate, onDragOps, currentBlockId, isRunning, allFlows }) => {
    const [expanded, setExpanded] = useState(true);
    const [dropPosition, setDropPosition] = useState(null); // 'before' | 'after' | null
    const rowRef = useRef(null);

    const meta = BLOCK_META[block.type] || { icon: '❔', label: block.type, color: 'border-slate-600 bg-slate-800' };
    const isActive = currentBlockId === block.id;
    const isContainer = block.type === 'loop' || block.type === 'if_then';

    // 執行中的積木自動滾入可視範圍
    useEffect(() => {
        if (isActive && rowRef.current) {
            rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [isActive]);

    const paramSummary = () => {
        const p = block.params || {};
        switch (block.type) {
            case 'click_roi': return p.roi || '';
            case 'wait': return `${p.ms}ms`;
            case 'wait_stable': return `${p.roi || 'REEL'} ×${p.stableCount || 3}`;
            case 'ocr_batch': return (p.rois || []).join(', ');
            case 'loop': return p.count ? `${p.count} 次` : p.condition || '';
            case 'set_var': return `${p.name} ${p.op || '='} ${p.value}`;
            case 'log': return p.message?.substring(0, 20) || '';
            case 'key_press': return p.key || '';
            case 'if_then': return p.condition || '';
            case 'sub_flow': return p.label || p.flowId || '(未選擇)';
            default: return '';
        }
    };

    // 子積木操作
    const insertChild = (newBlock, index) => {
        const children = block.children || [];
        if (index === undefined || index === null || index >= children.length) {
            onUpdate({ ...block, children: [...children, newBlock] });
        } else {
            const next = [...children];
            next.splice(index, 0, newBlock);
            onUpdate({ ...block, children: next });
        }
    };
    const deleteChild = (childId) => {
        onUpdate({ ...block, children: (block.children || []).filter(c => c.id !== childId) });
    };
    const updateChild = (updated) => {
        onUpdate({ ...block, children: (block.children || []).map(c => c.id === updated.id ? updated : c) });
    };

    // else 子積木操作
    const insertElseChild = (newBlock, index) => {
        const elseChildren = block.elseChildren || [];
        if (index === undefined || index === null || index >= elseChildren.length) {
            onUpdate({ ...block, elseChildren: [...elseChildren, newBlock] });
        } else {
            const next = [...elseChildren];
            next.splice(index, 0, newBlock);
            onUpdate({ ...block, elseChildren: next });
        }
    };
    const deleteElseChild = (childId) => {
        onUpdate({ ...block, elseChildren: (block.elseChildren || []).filter(c => c.id !== childId) });
    };
    const updateElseChild = (updated) => {
        onUpdate({ ...block, elseChildren: (block.elseChildren || []).map(c => c.id === updated.id ? updated : c) });
    };
    const elseChildDragOps = useListDrag(block.elseChildren || [], (newChildren) => {
        onUpdate({ ...block, elseChildren: newChildren });
    });
    const childDragOps = useListDrag(block.children || [], (newChildren) => {
        onUpdate({ ...block, children: newChildren });
    });

    // 拖放事件
    const handleDragStart = (e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', block.id);
        onDragOps?.onStart(block.id);
        // 讓拖曳的影子稍微透明
        setTimeout(() => { if (rowRef.current) rowRef.current.style.opacity = '0.4'; }, 0);
    };
    const handleDragEnd = () => {
        if (rowRef.current) rowRef.current.style.opacity = '1';
        setDropPosition(null);
        onDragOps?.onEnd();
    };
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        if (!rowRef.current || !onDragOps) return;
        // 上半 = before, 下半 = after
        const rect = rowRef.current.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        setDropPosition(e.clientY < mid ? 'before' : 'after');
    };
    const handleDragLeave = () => setDropPosition(null);
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropPosition && onDragOps) {
            onDragOps.onDrop(block.id, dropPosition);
        }
        setDropPosition(null);
    };

    return (
        <div style={{ marginLeft: depth * 20 }} ref={rowRef}>
            {/* 上方 drop 指示線 */}
            {dropPosition === 'before' && (
                <div className="h-1 mx-1 -mb-0.5 rounded bg-indigo-400 shadow-lg shadow-indigo-500/30 transition-all" />
            )}

            <div
                draggable={!isRunning}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${meta.color} ${
                    isActive ? 'ring-2 ring-purple-400 shadow-lg shadow-purple-500/10' : ''
                } ${!isRunning ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
                {!isRunning && (
                    <span className="text-slate-600 hover:text-slate-400 shrink-0">
                        <GripVertical size={14}/>
                    </span>
                )}
                {isContainer && (
                    <button onClick={() => setExpanded(!expanded)} className="text-slate-500 hover:text-slate-300 p-0.5">
                        {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                    </button>
                )}
                <span className="text-base shrink-0">{meta.icon}</span>
                <span className="text-slate-300 font-semibold shrink-0">{meta.label}</span>
                <div className={`flex-1 min-w-0 ${isRunning ? 'pointer-events-none opacity-75' : ''}`}
                    onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                    <BlockParams block={block} onUpdate={onUpdate} allFlows={allFlows} />
                </div>
                {/* 錯誤策略（僅對可能失敗的積木顯示）*/}
                {!isRunning && !['loop', 'if_then', 'set_var', 'log', 'wait'].includes(block.type) && (
                    <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                        <select
                            value={block.errorPolicy || 'stop'}
                            onChange={e => onUpdate({ ...block, errorPolicy: e.target.value })}
                            className="bg-slate-900 border border-slate-700 rounded text-[9px] text-slate-400 px-1 py-0.5 outline-none cursor-pointer hover:border-slate-500"
                            title="失敗時策略"
                        >
                            <option value="stop">⛔ 停止</option>
                            <option value="skip">⏭️ 跳過</option>
                            <option value="retry">🔄 重試</option>
                        </select>
                        {block.errorPolicy === 'retry' && (
                            <input
                                type="number" min={1} max={10}
                                value={block.retryCount || 3}
                                onChange={e => onUpdate({ ...block, retryCount: parseInt(e.target.value) || 3 })}
                                className="bg-slate-900 border border-slate-700 rounded text-[9px] text-slate-400 w-8 px-1 py-0.5 outline-none text-center"
                                title="重試次數"
                            />
                        )}
                    </div>
                )}
                {!isRunning && (
                    <button onClick={() => onDelete(block.id)} className="text-slate-600 hover:text-rose-400 p-1">
                        <Trash2 size={14}/>
                    </button>
                )}
            </div>

            {/* 下方 drop 指示線 */}
            {dropPosition === 'after' && (
                <div className="h-1 mx-1 -mt-0.5 rounded bg-indigo-400 shadow-lg shadow-indigo-500/30 transition-all" />
            )}

            {isContainer && expanded && (
                <div className="mt-1 space-y-0">
                    {(block.children || []).map((child, i) => (
                        <React.Fragment key={child.id}>
                            {!isRunning && (
                                <AddBlockButton depth={depth + 1} inline onAdd={(b) => insertChild(b, i)} />
                            )}
                            <BlockRow block={child} depth={depth + 1}
                                onDelete={deleteChild} onUpdate={updateChild} onDragOps={childDragOps}
                                currentBlockId={currentBlockId} isRunning={isRunning} allFlows={allFlows} />
                        </React.Fragment>
                    ))}
                    {!isRunning && <AddBlockButton depth={depth + 1} onAdd={(b) => insertChild(b)} />}
                </div>
            )}

            {/* else 子積木區 */}
            {block.type === 'if_then' && expanded && (
                <div className="mt-1 space-y-0">
                    <div style={{ marginLeft: (depth + 1) * 20 }}
                        className="text-[10px] text-violet-400 font-bold px-2 py-1 border-l-2 border-violet-500/30 bg-violet-500/5 rounded-r">
                        否則 (else)
                    </div>
                    {(block.elseChildren || []).map((child, i) => (
                        <React.Fragment key={child.id}>
                            {!isRunning && (
                                <AddBlockButton depth={depth + 1} inline onAdd={(b) => insertElseChild(b, i)} />
                            )}
                            <BlockRow block={child} depth={depth + 1}
                                onDelete={deleteElseChild} onUpdate={updateElseChild} onDragOps={elseChildDragOps}
                                currentBlockId={currentBlockId} isRunning={isRunning} allFlows={allFlows} />
                        </React.Fragment>
                    ))}
                    {!isRunning && <AddBlockButton depth={depth + 1} onAdd={(b) => insertElseChild(b)} />}
                </div>
            )}
        </div>
    );
};

/**
 * useListDrag — 通用列表拖放 hook
 * 管理一組 blocks 的拖曳排序。
 * @param {Array} items - 當前項目陣列
 * @param {Function} setItems - 更新項目的函式
 */
export function useListDrag(items, setItems) {
    const draggedIdRef = useRef(null);

    return {
        onStart: (id) => { draggedIdRef.current = id; },
        onEnd: () => { draggedIdRef.current = null; },
        onDrop: (targetId, position) => {
            const draggedId = draggedIdRef.current;
            if (!draggedId || draggedId === targetId) return;

            const arr = [...items];
            const fromIdx = arr.findIndex(b => b.id === draggedId);
            if (fromIdx === -1) return;

            const [moved] = arr.splice(fromIdx, 1);
            let toIdx = arr.findIndex(b => b.id === targetId);
            if (toIdx === -1) toIdx = arr.length;
            if (position === 'after') toIdx++;

            arr.splice(toIdx, 0, moved);
            setItems(arr);
            draggedIdRef.current = null;
        },
    };
}

export default BlockRow;
