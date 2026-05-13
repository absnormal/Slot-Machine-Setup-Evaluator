import React, { useState, useCallback } from 'react';
import { Play, Pause, Square, Plus, Trash2, GripVertical, ChevronRight, ChevronDown, Copy, Download, Upload } from 'lucide-react';
import { useFlowRunner } from '../../hooks/useFlowRunner';
import { AVAILABLE_ROIS } from '../../engine/roiResolver';

// 積木圖示 + 顏色
const BLOCK_META = {
    click_roi:    { icon: '🎮', label: '點擊', color: 'border-emerald-500/30 bg-emerald-500/5' },
    wait:         { icon: '⏱️', label: '等待', color: 'border-blue-500/30 bg-blue-500/5' },
    wait_stable:  { icon: '👁️', label: '等待穩定', color: 'border-amber-500/30 bg-amber-500/5' },
    ocr_batch:    { icon: '📊', label: '批次讀取', color: 'border-cyan-500/30 bg-cyan-500/5' },
    ocr_read:     { icon: '📖', label: '讀取', color: 'border-cyan-500/30 bg-cyan-500/5' },
    capture_frame:{ icon: '📸', label: '截圖', color: 'border-purple-500/30 bg-purple-500/5' },
    record_spin:  { icon: '💾', label: '記錄結果', color: 'border-pink-500/30 bg-pink-500/5' },
    loop:         { icon: '🔁', label: '迴圈', color: 'border-indigo-500/30 bg-indigo-500/5' },
    if_then:      { icon: '❓', label: '條件', color: 'border-yellow-500/30 bg-yellow-500/5' },
    set_var:      { icon: '📝', label: '設定變數', color: 'border-slate-500/30 bg-slate-500/5' },
    log:          { icon: '📋', label: '記錄', color: 'border-slate-500/30 bg-slate-500/5' },
    key_press:    { icon: '⌨️', label: '按鍵', color: 'border-emerald-500/30 bg-emerald-500/5' },
};

const NEW_BLOCK_TEMPLATES = [
    { type: 'click_roi', params: { roi: 'SPIN' } },
    { type: 'wait', params: { ms: 500 } },
    { type: 'wait_stable', params: { roi: 'REEL', stableCount: 3, interval: 200 } },
    { type: 'ocr_batch', params: { rois: ['WIN', 'BAL', 'BET', 'ORDER_ID'] } },
    { type: 'record_spin', params: {} },
    { type: 'loop', params: { count: 100 }, children: [] },
    { type: 'set_var', params: { name: '$totalWin', value: 0 } },
    { type: 'log', params: { message: '第 $loopIndex 局完成' } },
    { type: 'capture_frame', params: {} },
    { type: 'key_press', params: { key: 'space' } },
];

let _blockIdCounter = 0;
const genId = () => `blk_${Date.now()}_${_blockIdCounter++}`;

// ══════════════════════════════════════
// 單一積木列
// ══════════════════════════════════════
const BlockRow = ({ block, depth, onDelete, onUpdate, currentBlockId, isRunning }) => {
    const [expanded, setExpanded] = useState(true);
    const meta = BLOCK_META[block.type] || { icon: '❔', label: block.type, color: 'border-slate-600 bg-slate-800' };
    const isActive = currentBlockId === block.id;
    const hasChildren = block.children && block.children.length > 0;
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

    const addChild = (template) => {
        const newBlock = { ...template, id: genId(), params: { ...template.params } };
        if (template.children) newBlock.children = [];
        onUpdate({ ...block, children: [...(block.children || []), newBlock] });
    };

    const deleteChild = (childId) => {
        onUpdate({ ...block, children: (block.children || []).filter(c => c.id !== childId) });
    };

    const updateChild = (updated) => {
        onUpdate({ ...block, children: (block.children || []).map(c => c.id === updated.id ? updated : c) });
    };

    return (
        <div style={{ marginLeft: depth * 16 }}>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-all ${meta.color} ${isActive ? 'ring-1 ring-purple-400 shadow-lg shadow-purple-500/10' : ''}`}>
                {isContainer && (
                    <button onClick={() => setExpanded(!expanded)} className="text-slate-500 hover:text-slate-300 p-0.5">
                        {expanded ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
                    </button>
                )}
                <span className="text-sm">{meta.icon}</span>
                <span className="text-slate-300 font-medium">{meta.label}</span>
                <span className="text-slate-500 text-[10px] truncate flex-1">{paramSummary()}</span>
                {!isRunning && (
                    <button onClick={() => onDelete(block.id)} className="text-slate-600 hover:text-rose-400 p-0.5">
                        <Trash2 size={10}/>
                    </button>
                )}
            </div>

            {isContainer && expanded && (
                <div className="mt-0.5 space-y-0.5">
                    {(block.children || []).map(child => (
                        <BlockRow key={child.id} block={child} depth={depth + 1}
                            onDelete={deleteChild} onUpdate={updateChild}
                            currentBlockId={currentBlockId} isRunning={isRunning} />
                    ))}
                    {!isRunning && (
                        <AddBlockButton depth={depth + 1} onAdd={addChild} />
                    )}
                </div>
            )}
        </div>
    );
};

// ══════════════════════════════════════
// 新增積木按鈕
// ══════════════════════════════════════
const AddBlockButton = ({ depth, onAdd }) => {
    const [open, setOpen] = useState(false);
    return (
        <div style={{ marginLeft: depth * 16 }} className="relative">
            <button onClick={() => setOpen(!open)}
                className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-indigo-400 px-2 py-0.5 transition-colors">
                <Plus size={10}/> 新增積木
            </button>
            {open && (
                <div className="absolute left-0 bottom-6 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-1.5 w-48 space-y-0.5 max-h-48 overflow-y-auto">
                    {NEW_BLOCK_TEMPLATES.map(t => {
                        const m = BLOCK_META[t.type];
                        return (
                            <button key={t.type} onClick={() => { onAdd(t); setOpen(false); }}
                                className="flex items-center gap-2 w-full text-left px-2 py-1 rounded text-xs text-slate-300 hover:bg-slate-700 transition-colors">
                                <span>{m?.icon}</span> {m?.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ══════════════════════════════════════
// 主元件
// ══════════════════════════════════════
const FlowComposer = ({ ws, videoEl, getCandidates, onSmartDedup, onStartLive, onStopLive }) => {
    const flow = useFlowRunner();
    const { runState, isRunning, isPaused, isIdle, currentBlock, loopProgress, logs, spinCount, variables,
            runFlow, pause, resume, stop, presetFlows } = flow;

    const [blocks, setBlocks] = useState(() => presetFlows[0].blocks);
    const [flowName, setFlowName] = useState(presetFlows[0].name);

    // 載入預設
    const loadPreset = (preset) => {
        setBlocks(JSON.parse(JSON.stringify(preset.blocks)));
        setFlowName(preset.name);
    };

    // 積木操作
    const deleteBlock = (id) => setBlocks(prev => prev.filter(b => b.id !== id));
    const updateBlock = (updated) => setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b));
    const addBlock = (template) => {
        const newBlock = { ...template, id: genId(), params: { ...template.params } };
        if (template.children) newBlock.children = [];
        setBlocks(prev => [...prev, newBlock]);
    };

    // 執行
    const handleRun = async () => {
        const flowDef = { name: flowName, version: 1, blocks };
        await runFlow(flowDef, {
            ws, videoEl, getCandidates, onSmartDedup, onStartLive, onStopLive,
        });
    };

    // 匯出/匯入
    const handleExport = () => {
        const data = JSON.stringify({ name: flowName, version: 1, blocks }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `flow_${flowName}.json`; a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = () => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (data.blocks) { setBlocks(data.blocks); setFlowName(data.name || '匯入的流程'); }
            } catch { /* ignore */ }
        };
        input.click();
    };

    return (
        <div className="space-y-2">
            {/* ── 頂部：預設選擇 + 控制 ── */}
            <div className="flex items-center gap-2 flex-wrap">
                <select value="" onChange={e => { const p = presetFlows.find(f => f.id === e.target.value); if (p) loadPreset(p); }}
                    className="bg-slate-800 border border-slate-600 rounded-lg text-[11px] text-slate-300 px-2 py-1 outline-none">
                    <option value="">📂 預設模板...</option>
                    {presetFlows.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>

                <div className="flex-1" />

                <button onClick={handleImport} className="text-slate-500 hover:text-slate-300 p-1" title="匯入"><Upload size={12}/></button>
                <button onClick={handleExport} className="text-slate-500 hover:text-slate-300 p-1" title="匯出"><Download size={12}/></button>

                {isIdle ? (
                    <button onClick={handleRun} disabled={!ws || blocks.length === 0}
                        className="px-3 py-1 rounded-lg text-[11px] font-bold bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 active:scale-95 transition-all">
                        <Play size={10} fill="currentColor"/> 執行
                    </button>
                ) : (
                    <>
                        <button onClick={isPaused ? resume : pause}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 active:scale-95 ${isPaused ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'}`}>
                            {isPaused ? <><Play size={10} fill="currentColor"/> 繼續</> : <><Pause size={10}/> 暫停</>}
                        </button>
                        <button onClick={stop}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-500 text-white flex items-center gap-1 active:scale-95">
                            <Square size={8} fill="currentColor"/> 停止
                        </button>
                    </>
                )}
            </div>

            {/* ── 進度 ── */}
            {isRunning && loopProgress && (
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>第 {loopProgress.current}{loopProgress.total > 0 ? ` / ${loopProgress.total}` : ''} 局</span>
                    {loopProgress.total > 0 && (
                        <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                                style={{ width: `${(loopProgress.current / loopProgress.total * 100).toFixed(0)}%` }}/>
                        </div>
                    )}
                    <span className="text-purple-400 font-mono">#{spinCount}</span>
                </div>
            )}

            {/* ── 積木列表 ── */}
            <div className="bg-slate-950/50 rounded-xl border border-slate-700/50 p-2 space-y-0.5 max-h-[30vh] overflow-y-auto">
                {blocks.map(block => (
                    <BlockRow key={block.id} block={block} depth={0}
                        onDelete={deleteBlock} onUpdate={updateBlock}
                        currentBlockId={currentBlock?.id} isRunning={isRunning} />
                ))}
                {!isRunning && <AddBlockButton depth={0} onAdd={addBlock} />}
                {blocks.length === 0 && (
                    <div className="text-center text-slate-600 text-xs py-4">從上方選擇預設模板，或點擊「新增積木」開始編排</div>
                )}
            </div>

            {/* ── 變數空間 ── */}
            {Object.keys(variables).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {Object.entries(variables).map(([k, v]) => (
                        <span key={k} className="text-[10px] bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 font-mono">
                            <span className="text-cyan-400">{k}</span>
                            <span className="text-slate-500">=</span>
                            <span className="text-slate-300">{String(v).substring(0, 15)}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* ── 執行紀錄 ── */}
            {logs.length > 0 && (
                <div className="max-h-20 overflow-y-auto bg-slate-950 rounded-lg p-1.5 font-mono text-[10px] text-slate-400 space-y-px">
                    {logs.slice(-20).map((log, i) => (
                        <div key={i} className="flex gap-2 px-1 hover:bg-slate-800 rounded">
                            <span className="text-slate-600 w-14 shrink-0">{log.time}</span>
                            <span>{log.message}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FlowComposer;
