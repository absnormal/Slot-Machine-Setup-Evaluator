import React, { useState } from 'react';
import { Play, Pause, Square, Download, Upload } from 'lucide-react';
import { useFlowRunner } from '../../hooks/useFlowRunner';
import { genId } from './blockDefs';
import BlockRow, { useListDrag } from './BlockRow';
import AddBlockButton from './AddBlockButton';

/**
 * FlowComposer — 排程器主元件
 */
const FlowComposer = ({ ws, videoEl, getCandidates, onSmartDedup, onStartLive, onStopLive }) => {
    const flow = useFlowRunner();
    const { isRunning, isPaused, isIdle, currentBlock, loopProgress, logs, spinCount, variables,
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
    const addBlock = (newBlock) => setBlocks(prev => [...prev, newBlock]);

    // 拖放排序
    const rootDragOps = useListDrag(blocks, setBlocks);

    // 執行
    const handleRun = async () => {
        const flowDef = { name: flowName, version: 1, blocks };
        await runFlow(flowDef, { ws, videoEl, getCandidates, onSmartDedup, onStartLive, onStopLive });
    };

    // 匯出
    const handleExport = () => {
        const data = JSON.stringify({ name: flowName, version: 1, blocks }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `flow_${flowName}.json`; a.click();
        URL.revokeObjectURL(url);
    };

    // 匯入
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
        <div className="flex flex-col h-full gap-3">
            {/* ── 工具列 ── */}
            <div className="flex items-center gap-2 flex-wrap">
                <select value="" onChange={e => { const p = presetFlows.find(f => f.id === e.target.value); if (p) loadPreset(p); }}
                    className="bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-300 px-3 py-1.5 outline-none shrink-0">
                    <option value="">📂 載入模板...</option>
                    {presetFlows.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input value={flowName} onChange={e => setFlowName(e.target.value)}
                    className="bg-transparent border-b border-slate-700 text-sm text-slate-300 font-medium px-1 py-0.5 outline-none focus:border-indigo-500 transition-colors min-w-0 w-32"
                    placeholder="流程名稱" />
                <div className="flex-1" />
                <button onClick={handleImport} className="text-slate-500 hover:text-slate-300 p-1.5" title="匯入"><Upload size={16}/></button>
                <button onClick={handleExport} className="text-slate-500 hover:text-slate-300 p-1.5" title="匯出"><Download size={16}/></button>
                {isIdle ? (
                    <button onClick={handleRun} disabled={!ws || blocks.length === 0}
                        className="px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 active:scale-95 transition-all">
                        <Play size={14} fill="currentColor"/> 執行
                    </button>
                ) : (
                    <>
                        <button onClick={isPaused ? resume : pause}
                            className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 active:scale-95 ${isPaused ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'}`}>
                            {isPaused ? <><Play size={12} fill="currentColor"/> 繼續</> : <><Pause size={12}/> 暫停</>}
                        </button>
                        <button onClick={stop}
                            className="px-3 py-2 rounded-xl text-sm font-bold bg-rose-500 text-white flex items-center gap-1.5 active:scale-95">
                            <Square size={10} fill="currentColor"/> 停止
                        </button>
                    </>
                )}
            </div>

            {/* ── 進度 ── */}
            {isRunning && loopProgress && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>第 {loopProgress.current}{loopProgress.total > 0 ? ` / ${loopProgress.total}` : ''} 局</span>
                    {loopProgress.total > 0 && (
                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                                style={{ width: `${(loopProgress.current / loopProgress.total * 100).toFixed(0)}%` }}/>
                        </div>
                    )}
                    <span className="text-purple-400 font-mono font-bold">#{spinCount}</span>
                </div>
            )}

            {/* ── 積木區域（填滿剩餘空間）── */}
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 bg-slate-950/50 rounded-xl border border-slate-700/50 p-3 space-y-0 overflow-y-auto">
                    {blocks.map((block) => (
                        <BlockRow key={block.id} block={block} depth={0}
                            onDelete={deleteBlock} onUpdate={updateBlock} onDragOps={rootDragOps}
                            currentBlockId={currentBlock?.id} isRunning={isRunning} />
                    ))}
                    {/* 尾部 drop 區域 */}
                    {!isRunning && blocks.length > 0 && (
                        <div
                            className="h-3"
                            onDragOver={(e) => { e.preventDefault(); rootDragOps.onDragOver('__end__', 'end'); }}
                            onDrop={(e) => { e.preventDefault(); rootDragOps.onDrop('__end__', 'end'); }}
                        />
                    )}
                    {blocks.length === 0 && (
                        <div className="text-center text-slate-600 text-sm py-6">從上方選擇預設模板，或點擊「新增積木」開始編排</div>
                    )}
                </div>
                {/* 新增按鈕放在捲動區外面 */}
                {!isRunning && <AddBlockButton depth={0} onAdd={addBlock} />}
            </div>

            {/* ── 變數空間 ── */}
            {Object.keys(variables).length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {Object.entries(variables).map(([k, v]) => (
                        <span key={k} className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 font-mono">
                            <span className="text-cyan-400">{k}</span>
                            <span className="text-slate-500">=</span>
                            <span className="text-slate-300">{String(v).substring(0, 15)}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* ── 執行紀錄 ── */}
            {logs.length > 0 && (
                <div className="max-h-28 overflow-y-auto bg-slate-950 rounded-xl p-2.5 font-mono text-xs text-slate-400 space-y-0.5">
                    {logs.slice(-20).map((log, i) => (
                        <div key={i} className="flex gap-2 px-1.5 py-0.5 hover:bg-slate-800 rounded">
                            <span className="text-slate-600 w-16 shrink-0">{log.time}</span>
                            <span>{log.message}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FlowComposer;
