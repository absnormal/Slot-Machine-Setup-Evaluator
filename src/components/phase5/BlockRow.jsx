import React, { useState, useRef } from 'react';
import { Trash2, ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import { BLOCK_META } from './blockDefs';
import AddBlockButton from './AddBlockButton';

/**
 * BlockRow — 單一積木列（支援拖放排序）
 */
const BlockRow = ({ block, depth, onDelete, onUpdate, onDragOps, currentBlockId, isRunning }) => {
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
    const addChild = (newBlock) => {
        onUpdate({ ...block, children: [...(block.children || []), newBlock] });
    };
    const deleteChild = (childId) => {
        onUpdate({ ...block, children: (block.children || []).filter(c => c.id !== childId) });
    };
    const updateChild = (updated) => {
        onUpdate({ ...block, children: (block.children || []).map(c => c.id === updated.id ? updated : c) });
    };

    // 子積木的拖放操作
    const childDragOps = useChildDrag(block, onUpdate);

    return (
        <div style={{ marginLeft: depth * 20 }}>
            {/* 拖放指示線 */}
            <DropIndicator blockId={block.id} position="before" onDragOps={onDragOps} />

            <div
                draggable={!isRunning}
                onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', block.id);
                    onDragOps?.onDragStart(block.id);
                }}
                onDragEnd={() => onDragOps?.onDragEnd()}
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
                <span className="text-base">{meta.icon}</span>
                <span className="text-slate-300 font-semibold">{meta.label}</span>
                <span className="text-slate-500 text-xs truncate flex-1">{paramSummary()}</span>
                {!isRunning && (
                    <button onClick={() => onDelete(block.id)} className="text-slate-600 hover:text-rose-400 p-1">
                        <Trash2 size={14}/>
                    </button>
                )}
            </div>

            {isContainer && expanded && (
                <div className="mt-1 space-y-0">
                    {(block.children || []).map((child) => (
                        <BlockRow key={child.id} block={child} depth={depth + 1}
                            onDelete={deleteChild} onUpdate={updateChild} onDragOps={childDragOps}
                            currentBlockId={currentBlockId} isRunning={isRunning} />
                    ))}
                    {/* 最後一個 drop 區域 */}
                    <DropIndicator blockId="__end__" position="end" onDragOps={childDragOps} />
                    {!isRunning && <AddBlockButton depth={depth + 1} onAdd={addChild} />}
                </div>
            )}
        </div>
    );
};

/**
 * DropIndicator — 拖放位置指示器
 * 當拖曳經過時顯示藍色線條
 */
const DropIndicator = ({ blockId, position, onDragOps }) => {
    const [isOver, setIsOver] = useState(false);

    if (!onDragOps) return null;

    return (
        <div
            className={`transition-all ${isOver ? 'h-2 my-0.5' : 'h-0'}`}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                if (!isOver) setIsOver(true);
                onDragOps.onDragOver(blockId, position);
            }}
            onDragLeave={() => setIsOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOver(false);
                onDragOps.onDrop(blockId, position);
            }}
        >
            <div className={`mx-2 rounded transition-all ${isOver ? 'h-1 bg-indigo-400 shadow-lg shadow-indigo-500/30' : 'h-0'}`} />
        </div>
    );
};

/**
 * useChildDrag — 子積木拖放邏輯 hook
 * 管理一個 block 容器內 children 的排序
 */
function useChildDrag(parentBlock, onUpdateParent) {
    const draggedIdRef = useRef(null);

    return {
        onDragStart: (id) => { draggedIdRef.current = id; },
        onDragEnd: () => { draggedIdRef.current = null; },
        onDragOver: () => {},
        onDrop: (targetBlockId, position) => {
            const draggedId = draggedIdRef.current;
            if (!draggedId) return;

            const children = [...(parentBlock.children || [])];
            const fromIdx = children.findIndex(c => c.id === draggedId);
            if (fromIdx === -1) return;

            // 移除原始位置
            const [moved] = children.splice(fromIdx, 1);

            if (targetBlockId === '__end__') {
                children.push(moved);
            } else {
                // 插入到目標之前
                let toIdx = children.findIndex(c => c.id === targetBlockId);
                if (toIdx === -1) toIdx = children.length;
                children.splice(toIdx, 0, moved);
            }

            onUpdateParent({ ...parentBlock, children });
            draggedIdRef.current = null;
        },
    };
}

export default BlockRow;

/**
 * useRootDrag — 根層級積木拖放 hook（供 FlowComposer 使用）
 */
export function useRootDrag(blocks, setBlocks) {
    const draggedIdRef = useRef(null);

    return {
        onDragStart: (id) => { draggedIdRef.current = id; },
        onDragEnd: () => { draggedIdRef.current = null; },
        onDragOver: () => {},
        onDrop: (targetBlockId, position) => {
            const draggedId = draggedIdRef.current;
            if (!draggedId) return;

            setBlocks(prev => {
                const arr = [...prev];
                const fromIdx = arr.findIndex(b => b.id === draggedId);
                if (fromIdx === -1) return arr;

                const [moved] = arr.splice(fromIdx, 1);

                if (targetBlockId === '__end__') {
                    arr.push(moved);
                } else {
                    let toIdx = arr.findIndex(b => b.id === targetBlockId);
                    if (toIdx === -1) toIdx = arr.length;
                    arr.splice(toIdx, 0, moved);
                }

                return arr;
            });
            draggedIdRef.current = null;
        },
    };
}
