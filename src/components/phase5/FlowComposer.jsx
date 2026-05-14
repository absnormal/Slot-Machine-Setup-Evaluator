import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Cloud, Trash2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useFlowRunner } from '../../hooks/useFlowRunner';
import { useFlowStorage } from '../../hooks/useFlowStorage';
import { OcrWorkerBridge } from '../../engine/ocrWorkerBridge';
import { genId } from './blockDefs';
import BlockRow, { useListDrag } from './BlockRow';
import AddBlockButton from './AddBlockButton';

/**
 * FlowComposer — 排程器主元件
 * 整合執行引擎 + 本地/雲端存取
 */
const FlowComposer = ({ ws, videoEl, setCandidates, reelROI, recognizeLocal }) => {
    const flow = useFlowRunner();
    const { isRunning, isPaused, isIdle, currentBlock, loopProgress, logs, spinCount, variables,
        runFlow, pause, resume, stop } = flow;

    const storage = useFlowStorage();
    const { allFlows, hasCloud, isLoading: storageLoading, isSaving: storageSaving,
        error: storageError, message: storageMsg,
        saveToLocal, deleteFromLocal, saveToCloud, deleteFromCloud, fetchCloudFlows } = storage;

    const [blocks, setBlocks] = useState(() => allFlows[0]?.blocks || []);
    const [flowName, setFlowName] = useState(allFlows[0]?.name || '新流程');
    const [currentFlowId, setCurrentFlowId] = useState(null);
    const [currentSource, setCurrentSource] = useState(null); // 'preset' | 'local' | 'cloud'
    const [isLoadingFlow, setIsLoadingFlow] = useState(false);
    const [logsExpanded, setLogsExpanded] = useState(false);

    // 初始化載入雲端
    useEffect(() => { fetchCloudFlows(); }, [fetchCloudFlows]);

    // 載入流程（雲端流程需遠端取得完整資料）
    const loadFlow = async (f) => {
        let blocks = f.blocks;

        // 雲端流程的 listFlows 只有摘要，需用 getFlow 取完整資料
        if (!blocks && f._source === 'cloud' && f.id) {
            setIsLoadingFlow(true);
            setBlocks([]);
            setFlowName(f.name);
            try {
                const { GAS_URL } = await import('../../utils/constants');
                const res = await fetch(`${GAS_URL}?action=getFlow&id=${encodeURIComponent(f.id)}&t=${Date.now()}`);
                const full = await res.json();
                blocks = full.blocks;
            } catch (err) {
                console.error('[FlowComposer] 載入雲端流程失敗', err);
                setIsLoadingFlow(false);
                return;
            }
            setIsLoadingFlow(false);
        }

        if (!blocks) {
            console.warn('[FlowComposer] 流程無 blocks 資料', f);
            return;
        }

        setBlocks(JSON.parse(JSON.stringify(blocks)));
        setFlowName(f.name);
        setCurrentFlowId(f.id);
        setCurrentSource(f._source);
    };

    // 積木操作
    const deleteBlock = (id) => setBlocks(prev => prev.filter(b => b.id !== id));
    const updateBlock = (updated) => setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b));
    const insertBlock = (newBlock, index) => setBlocks(prev => {
        if (index === undefined || index === null || index >= prev.length) {
            return [...prev, newBlock];
        }
        const next = [...prev];
        next.splice(index, 0, newBlock);
        return next;
    });
    const rootDragOps = useListDrag(blocks, setBlocks);

    // 前端 PaddleOCR Worker（懶初始化，首次執行時才載入模型）
    const ocrWorkerRef = useRef(null);

    // 執行
    const handleRun = async () => {
        // 懶載入前端 OCR Worker
        if (!ocrWorkerRef.current) {
            try {
                const bridge = new OcrWorkerBridge();
                await bridge.init();
                ocrWorkerRef.current = bridge;
            } catch (e) {
                console.warn('[FlowComposer] 前端 OCR Worker 初始化失敗，將使用 Python OCR:', e);
            }
        }

        // ── 預先抓取雲端子流程（選項 2：跑整個流程之前先把雲端資料抓下來）──
        const subFlowCache = new Map(); // flowId → { name, blocks, ... }
        const collectSubFlowIds = (blockList) => {
            for (const b of (blockList || [])) {
                if (b.type === 'sub_flow' && b.params?.flowId) {
                    subFlowCache.set(b.params.flowId, null); // 先佔位
                }
                if (b.children) collectSubFlowIds(b.children);
                if (b.elseChildren) collectSubFlowIds(b.elseChildren);
            }
        };
        collectSubFlowIds(blocks);

        // 對每個引用的 flowId，優先從 allFlows 取完整資料，雲端的額外 fetch
        if (subFlowCache.size > 0) {
            const { GAS_URL } = await import('../../utils/constants');
            for (const flowId of subFlowCache.keys()) {
                const local = storage.allFlows.find(f => f.id === flowId);
                if (local?.blocks && local.blocks.length > 0) {
                    // 預設或本地流程：已有完整 blocks
                    subFlowCache.set(flowId, local);
                } else if (GAS_URL && flowId) {
                    // 雲端流程：需 fetch 完整資料
                    try {
                        const res = await fetch(`${GAS_URL}?action=getFlow&id=${encodeURIComponent(flowId)}&t=${Date.now()}`);
                        const full = await res.json();
                        subFlowCache.set(flowId, { name: local?.name || flowId, ...full });
                    } catch (err) {
                        console.error(`[FlowComposer] 預載子流程失敗: ${flowId}`, err);
                    }
                }
            }
        }

        const flowDef = { name: flowName, version: 1, blocks };
        // 子流程解析器：優先從快取查找
        const subFlowResolver = (flowId) => subFlowCache.get(flowId) || storage.allFlows.find(f => f.id === flowId);
        await runFlow(flowDef, { ws, videoEl, setCandidates, reelROI, ocrWorker: ocrWorkerRef.current, recognizeLocal, subFlowResolver });
    };

    // 儲存雲端（含衝突偵測，參考遊戲模板模式）
    const handleSaveCloud = async () => {
        if (!flowName.trim()) { storage.setError('請輸入流程名稱'); return; }

        // 檢查同名衝突
        const existing = storage.cloudFlows.find(f =>
            f.name?.trim().toUpperCase() === flowName.trim().toUpperCase() &&
            f.id !== currentFlowId
        );

        if (existing) {
            const action = confirm(
                `雲端已有同名流程「${existing.name}」\n\n` +
                `確定 → 覆蓋該流程\n取消 → 取消儲存`
            );
            if (!action) return;
            // 覆蓋既有
            await saveToCloud({ _cloudId: existing.id, name: flowName, blocks });
            setCurrentFlowId(existing.id);
            setCurrentSource('cloud');
            return;
        }

        // 當前正在編輯雲端流程 → 直接更新
        if (currentSource === 'cloud' && currentFlowId) {
            await saveToCloud({ _cloudId: currentFlowId, name: flowName, blocks });
            return;
        }

        // 新增
        await saveToCloud({ name: flowName, blocks });
    };

    // 刪除（含確認）
    const handleDelete = () => {
        if (!currentFlowId || currentSource === 'preset') return;
        if (!confirm(`確定刪除「${flowName}」？此操作無法復原。`)) return;
        if (currentSource === 'local') deleteFromLocal(currentFlowId);
        if (currentSource === 'cloud') deleteFromCloud(currentFlowId);
        setBlocks([]);
        setFlowName('新流程');
        setCurrentFlowId(null);
        setCurrentSource(null);
    };

    // 來源標籤
    const sourceLabel = { preset: '📦 預設', local: '💾 本地', cloud: '☁️ 雲端' };

    return (
        <div className="flex flex-col h-full gap-3">
            {/* ── 工具列 ── */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
                {/* 載入選單：分組顯示 */}
                <select value="" onChange={e => {
                    const f = allFlows.find(f => `${f._source}_${f.id}` === e.target.value);
                    if (f) loadFlow(f);
                }} className="bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-300 px-3 py-1.5 outline-none shrink-0 max-w-[180px]">
                    <option value="">📂 載入流程...</option>
                    {storage.presetFlows.length > 0 && <optgroup label="📦 預設">
                        {storage.presetFlows.map(f => <option key={`preset_${f.id}`} value={`preset_${f.id}`}>{f.name}</option>)}
                    </optgroup>}
                    {storage.localFlows.length > 0 && <optgroup label="💾 本地">
                        {storage.localFlows.map(f => <option key={`local_${f.id}`} value={`local_${f.id}`}>{f.name}</option>)}
                    </optgroup>}
                    {storage.cloudFlows.length > 0 && <optgroup label="☁️ 雲端">
                        {storage.cloudFlows.map(f => <option key={`cloud_${f.id}`} value={`cloud_${f.id}`}>{f.name}</option>)}
                    </optgroup>}
                </select>

                {/* 流程名稱 */}
                <input value={flowName} onChange={e => setFlowName(e.target.value)}
                    className="bg-transparent border-b border-slate-700 text-sm text-slate-300 font-medium px-1 py-0.5 outline-none focus:border-indigo-500 transition-colors min-w-0 flex-1"
                    placeholder="流程名稱" />

                {/* 來源標示 */}
                {currentSource && (
                    <span className="text-[10px] text-slate-500 shrink-0">{sourceLabel[currentSource]}</span>
                )}
            </div>

            {/* ── 存取按鈕列 ── */}
            <div className="flex items-center gap-1.5 shrink-0">
                {hasCloud && (
                    <button onClick={handleSaveCloud} disabled={blocks.length === 0 || storageSaving}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
                        title="儲存至雲端">
                        <Cloud size={12} /> {storageSaving ? '儲存中...' : currentSource === 'cloud' && currentFlowId ? '☁️ 更新' : '☁️ 存檔'}
                    </button>
                )}
                {hasCloud && (
                    <button onClick={fetchCloudFlows} disabled={storageLoading}
                        className="text-slate-500 hover:text-slate-300 p-1.5 transition-colors" title="重新整理雲端">
                        <RefreshCw size={12} className={storageLoading ? 'animate-spin' : ''} />
                    </button>
                )}
                <div className="flex-1" />
                {currentFlowId && currentSource !== 'preset' && (
                    <button onClick={handleDelete} className="text-slate-600 hover:text-rose-400 p-1.5" title="刪除此流程"><Trash2 size={14} /></button>
                )}

                {/* 執行控制 */}
                {isIdle ? (
                    <button onClick={handleRun} disabled={!ws || blocks.length === 0}
                        className="px-4 py-1.5 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 active:scale-95 transition-all">
                        <Play size={14} fill="currentColor" /> 執行
                    </button>
                ) : (
                    <>
                        <button onClick={isPaused ? resume : pause}
                            className={`px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-1.5 active:scale-95 ${isPaused ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'}`}>
                            {isPaused ? <><Play size={12} fill="currentColor" /> 繼續</> : <><Pause size={12} /> 暫停</>}
                        </button>
                        <button onClick={stop}
                            className="px-3 py-1.5 rounded-xl text-sm font-bold bg-rose-500 text-white flex items-center gap-1.5 active:scale-95">
                            <Square size={10} fill="currentColor" /> 停止
                        </button>
                    </>
                )}
            </div>

            {/* ── 狀態訊息 ── */}
            {(storageError || storageMsg) && (
                <div className={`text-xs px-2 py-1 rounded-lg shrink-0 ${storageError ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                    {storageError || storageMsg}
                </div>
            )}

            {/* ── 進度 ── */}
            {isRunning && loopProgress && (
                <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                    <span>第 {loopProgress.current}{loopProgress.total > 0 ? ` / ${loopProgress.total}` : ''} 局</span>
                    {loopProgress.total > 0 && (
                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                                style={{ width: `${(loopProgress.current / loopProgress.total * 100).toFixed(0)}%` }} />
                        </div>
                    )}
                    <span className="text-purple-400 font-mono font-bold">#{spinCount}</span>
                </div>
            )}

            {/* ── 積木區域 ── */}
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 bg-slate-950/50 rounded-xl border border-slate-700/50 p-3 space-y-0 overflow-y-auto">
                    {blocks.map((block, i) => (
                        <React.Fragment key={block.id}>
                            {!isRunning && (
                                <AddBlockButton depth={0} inline onAdd={(b) => insertBlock(b, i)} />
                            )}
                            <BlockRow block={block} depth={0}
                                onDelete={deleteBlock} onUpdate={updateBlock} onDragOps={rootDragOps}
                                currentBlockId={currentBlock?.id} isRunning={isRunning} allFlows={allFlows} />
                        </React.Fragment>
                    ))}
                    {!isRunning && blocks.length > 0 && (
                        <div className="h-3"
                            onDragOver={(e) => { e.preventDefault(); rootDragOps.onDragOver('__end__', 'end'); }}
                            onDrop={(e) => { e.preventDefault(); rootDragOps.onDrop('__end__', 'end'); }} />
                    )}
                    {isLoadingFlow && (
                        <div className="text-center text-slate-400 text-sm py-8 flex flex-col items-center gap-2">
                            <RefreshCw size={18} className="animate-spin text-indigo-400" />
                            正在載入雲端流程...
                        </div>
                    )}
                    {!isLoadingFlow && blocks.length === 0 && (
                        <div className="text-center text-slate-600 text-sm py-6">從上方選擇流程，或點擊「新增積木」開始編排</div>
                    )}
                </div>
                {!isRunning && <AddBlockButton depth={0} onAdd={(b) => insertBlock(b)} />}
            </div>

            {/* ── 變數空間 ── */}
            {Object.keys(variables).length > 0 && (
                <div className="flex flex-wrap gap-2 shrink-0">
                    {Object.entries(variables).map(([k, v]) => (
                        <span key={k} className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 font-mono">
                            <span className="text-cyan-400">{k}</span>
                            <span className="text-slate-500">=</span>
                            <span className="text-slate-300">{String(v).substring(0, 15)}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* ── 執行紀錄（可收合）── */}
            {logs.length > 0 && (() => {
                const lastLog = logs[logs.length - 1];
                return (
                    <div className="shrink-0">
                        {/* 最後一行 + 展開按鈕 */}
                        <div className="flex items-center gap-2 bg-slate-950 rounded-lg px-2.5 py-1 cursor-pointer hover:bg-slate-900 transition-colors"
                            onClick={() => setLogsExpanded(prev => !prev)}>
                            <span className="text-slate-600 text-[10px] font-mono w-14 shrink-0">{lastLog.time}</span>
                            <span className="text-xs text-slate-400 font-mono truncate flex-1">{lastLog.message}</span>
                            <span className="text-slate-500 flex items-center gap-1 shrink-0 text-[10px]">
                                {logs.length}
                                {logsExpanded ? <ChevronDown size={12}/> : <ChevronUp size={12}/>}
                            </span>
                        </div>
                        {/* 展開區 */}
                        {logsExpanded && (
                            <div className="max-h-32 overflow-y-auto bg-slate-950 rounded-b-lg px-2.5 pb-2 font-mono text-xs text-slate-400 space-y-0.5 border-t border-slate-800">
                                {logs.slice(-20, -1).map((log, i) => (
                                    <div key={i} className="flex gap-2 px-1.5 py-0.5 hover:bg-slate-800 rounded">
                                        <span className="text-slate-600 w-14 shrink-0">{log.time}</span>
                                        <span>{log.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })()}
        </div>
    );
};

export default FlowComposer;
