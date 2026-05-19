import React from 'react';
import { AVAILABLE_ROIS } from '../../engine/roiResolver';
import usePhase4Store from '../../stores/usePhase4Store';
import useAppStore from '../../stores/useAppStore';

/**
 * BlockParams — 積木參數行內編輯
 *
 * 根據積木類型渲染對應的輸入控件。
 */

const MINI = 'bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors';
const SEL  = 'bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-slate-200 outline-none focus:border-indigo-500';

// OCR ROI 多選（勾選框式）
const OCR_ROIS = AVAILABLE_ROIS.filter(r => r.category === 'ocr').map(r => r.name);

// ROI 名稱 → 實際變數名稱的映射（和 flowRunner._execOcrBatch 一致）
const ROI_TO_VAR = {
    'WIN': '$win', 'BAL': '$balance', 'BALANCE': '$balance',
    'BET': '$bet', 'ORDER_ID': '$orderId', 'ORDERID': '$orderId',
    'MULT': '$multiplier', 'MULTIPLIER': '$multiplier',
};
const roiVarLabel = (name) => ROI_TO_VAR[name.toUpperCase()] || `$${name.toLowerCase()}`;

const BlockParams = ({ block, onUpdate, allFlows }) => {
    const p = block.params || {};

    const set = (key, val) => {
        onUpdate({ ...block, params: { ...p, [key]: val } });
    };

    switch (block.type) {
        case 'click_roi':
            return (
                <div className="flex items-center gap-1.5">
                    <ClickTargetSelect value={p.roi} onChange={v => set('roi', v)} />
                </div>
            );

        case 'wait':
            return (
                <div className="flex items-center gap-1.5">
                    <NumInput value={p.seconds ?? 1} onChange={v => set('seconds', v)} min={0} step={0.5} />
                    <span className="text-slate-500 text-[10px]">秒</span>
                </div>
            );

        case 'wait_stable':
            return (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <RoiSelect value={p.roi} onChange={v => set('roi', v)} />
                    <span className="text-slate-500 text-[10px]">×</span>
                    <NumInput value={p.stableCount ?? 3} onChange={v => set('stableCount', v)} min={1} max={20} w="w-10" />
                    <span className="text-slate-500 text-[10px]">間隔</span>
                    <NumInput value={p.interval ?? 200} onChange={v => set('interval', v)} min={50} step={50} w="w-14" />
                    <span className="text-slate-500 text-[10px]">ms</span>
                </div>
            );

        case 'wait_change':
            return (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <RoiSelect value={p.roi} onChange={v => set('roi', v)} filter="ocr" />
                    <span className="text-slate-500 text-[10px]">×</span>
                    <NumInput value={p.changeCount ?? 2} onChange={v => set('changeCount', v)} min={1} max={20} w="w-10" />
                    <NumInput value={p.interval ?? 200} onChange={v => set('interval', v)} min={50} step={50} w="w-14" />
                    <span className="text-slate-500 text-[10px]">ms</span>
                    <span className="text-slate-500 text-[10px]">逾時</span>
                    <NumInput value={p.timeout == null ? 30 : p.timeout} onChange={v => set('timeout', v)} min={0} step={1} w="w-12" />
                    <span className="text-slate-500 text-[10px]">秒</span>
                </div>
            );

        case 'ocr_batch': {
            const dynamicTargets = Object.entries(usePhase4Store(s => s.clickTargets) || {})
                .filter(([, v]) => v.category === 'ocr')
                .map(([name]) => name);
            const allOcrNames = [...OCR_ROIS, ...dynamicTargets];
            const selected = p.rois || [];
            const available = allOcrNames.filter(n => !selected.includes(n));
            return (
                <div className="flex items-center gap-1 flex-wrap">
                    {selected.map(name => (
                        <span key={name} className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${
                            OCR_ROIS.includes(name) ? 'bg-cyan-500/15 text-cyan-300' : 'bg-amber-500/15 text-amber-300'
                        }`}>
                            {OCR_ROIS.includes(name) ? roiVarLabel(name) : `📐 ${name}`}
                            <button className="hover:text-rose-400 ml-0.5" onClick={e => {
                                e.stopPropagation();
                                set('rois', selected.filter(r => r !== name));
                            }}>×</button>
                        </span>
                    ))}
                    {available.length > 0 && (
                        <select className={`${SEL} text-[10px] w-16`} value=""
                            onChange={e => { if (e.target.value) set('rois', [...selected, e.target.value]); }}
                            onClick={e => e.stopPropagation()}>
                            <option value="">+</option>
                            {available.map(name => (
                                <option key={name} value={name}>{OCR_ROIS.includes(name) ? roiVarLabel(name) : `📐 ${name}`}</option>
                            ))}
                        </select>
                    )}
                </div>
            );
        }

        case 'ocr_read':
            return (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <RoiSelect value={p.roi} onChange={v => set('roi', v)} filter="ocr" />
                    <span className="text-slate-500 text-[10px]">→</span>
                    <input className={`${MINI} min-w-[80px] flex-1`} value={p.varName || ''} placeholder="$var"
                        onChange={e => set('varName', e.target.value)} />
                    {/* 模式切換：數字 / 文字 */}
                    {['number', 'text'].map(m => (
                        <button key={m}
                            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                (p.mode || 'number') === m
                                    ? m === 'text' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                                   : 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                            }`}
                            onClick={e => { e.stopPropagation(); set('mode', m); }}>
                            {m === 'number' ? '123' : 'ABC'}
                        </button>
                    ))}
                    {/* 即時模式：直接從畫面讀，不需截圖 */}
                    <button
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                            p.live ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                   : 'text-slate-500 hover:text-slate-300 border border-transparent'
                        }`}
                        onClick={e => { e.stopPropagation(); set('live', !p.live); }}
                        title="即時模式：直接從畫面讀取，不需要先截圖">
                        🔴即時
                    </button>
                </div>
            );

        case 'loop':
            return (
                <div className="flex items-center gap-1.5">
                    <NumInput value={p.count ?? ''} onChange={v => set('count', v)} min={0} placeholder="次數" w="w-16" />
                    <span className="text-slate-500 text-[10px]">次</span>
                </div>
            );

        case 'set_var':
            return (
                <div className="flex items-center gap-1.5">
                    <input className={`${MINI} min-w-[80px] flex-1`} value={p.name || ''} placeholder="$name"
                        onChange={e => set('name', e.target.value)} />
                    <select className={`${SEL} w-12 text-center`} value={p.op || '='}
                        onChange={e => set('op', e.target.value)}>
                        <option value="=">=</option>
                        <option value="+=">+=</option>
                        <option value="-=">-=</option>
                        <option value="*=">*=</option>
                        <option value="/=">/=</option>
                        <option value="%=">%=</option>
                    </select>
                    <input className={`${MINI} min-w-[80px] flex-1`} value={p.value ?? ''} placeholder="值"
                        onChange={e => set('value', e.target.value)} />
                </div>
            );

        case 'var_replace':
            return (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <input className={`${MINI} w-24`} value={p.varName || ''} placeholder="$var"
                        onChange={e => set('varName', e.target.value)}
                        onClick={e => e.stopPropagation()} />
                    <span className="text-slate-500 text-[10px]">找</span>
                    <input className={`${MINI} min-w-[60px] flex-1`} value={p.find || ''} placeholder="搜尋（支援 $var）"
                        onChange={e => set('find', e.target.value)}
                        onClick={e => e.stopPropagation()} />
                    <span className="text-slate-500 text-[10px]">→</span>
                    <input className={`${MINI} min-w-[40px] flex-1`} value={p.replace ?? ''} placeholder="取代"
                        onChange={e => set('replace', e.target.value)}
                        onClick={e => e.stopPropagation()} />
                </div>
            );

        case 'var_extract_number':
            return (
                <div className="flex items-center gap-1.5">
                    <input className={`${MINI} w-28`} value={p.varName || ''} placeholder="$var"
                        onChange={e => set('varName', e.target.value)}
                        onClick={e => e.stopPropagation()} />
                    <span className="text-slate-500 text-[10px]">→ 純數字</span>
                </div>
            );

        case 'log':
            return (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input className={`${MINI} flex-1 min-w-0`} value={p.message || ''} placeholder="訊息（支援 $var）"
                        onChange={e => set('message', e.target.value)} />
                </div>
            );

        case 'key_press':
            return (
                <div className="flex items-center gap-1.5">
                    <input className={`${MINI} w-20`} value={p.key || ''} placeholder="按鍵"
                        onChange={e => set('key', e.target.value)} />
                </div>
            );

        case 'stop':
            return (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input className={`${MINI} flex-1 min-w-0`} value={p.reason || ''} placeholder="終止原因"
                        onChange={e => set('reason', e.target.value)} />
                </div>
            );

        case 'break_loop':
            return null; // 不需要參數

        case 'type_text':
            return (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input className={`${MINI} flex-1 min-w-0`} value={p.text || ''} placeholder="文字（支援 $var）"
                        onChange={e => set('text', e.target.value)} />
                </div>
            );

        case 'hotkey':
            return (
                <div className="flex items-center gap-1.5">
                    <input className={`${MINI} w-28`} value={p.keys || ''} placeholder="ctrl+a"
                        onChange={e => set('keys', e.target.value)} />
                </div>
            );

        case 'if_then':
            return (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-slate-500 text-[10px] shrink-0">如果</span>
                    <input className={`${MINI} flex-1 min-w-0`} value={p.condition || ''} placeholder="$win > 0"
                        onChange={e => set('condition', e.target.value)} />
                </div>
            );

        case 'sub_flow': {
            const sourceLabel = (f) => f._source === 'preset' ? '預設' : f._source === 'cloud' ? '雲端' : '本地';
            // 雲端 listFlows 只有摘要（無 blocks），不能用 blocks.length 過濾
            const available = (allFlows || []).filter(f =>
                (f.blocks && f.blocks.length > 0) || f._source === 'cloud'
            );
            return (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <select className={`${SEL} flex-1 min-w-0`}
                        value={p.flowId || ''}
                        onChange={e => {
                            const id = e.target.value;
                            const found = available.find(f => f.id === id);
                            onUpdate({ ...block, params: { ...p, flowId: id, label: found?.name || '' } });
                        }}
                    >
                        <option value="">— 選擇子流程 —</option>
                        {available.map(f => {
                            const countBlocks = (bs) => (bs || []).reduce((n, b) => n + 1 + countBlocks(b.children) + countBlocks(b.elseChildren), 0);
                            const total = countBlocks(f.blocks);
                            return (
                                <option key={f.id} value={f.id}>
                                    [{sourceLabel(f)}] {f.name || f.id}{total ? ` (${total} 積木)` : ''}
                                </option>
                            );
                        })}
                    </select>
                </div>
            );
        }

        case 'record_spin': {
            const RECORD_FIELDS = ['WIN', 'BAL', 'BET', 'ORDER_ID', 'MULT'];
            return (
                <div className="flex items-center gap-1 flex-wrap">
                    {RECORD_FIELDS.map(name => {
                        const checked = (p.fields || RECORD_FIELDS).includes(name);
                        return (
                            <label key={name} className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                                checked ? 'bg-rose-500/15 text-rose-300' : 'text-slate-500 hover:text-slate-300'
                            }`}>
                                <input type="checkbox" checked={checked}
                                    className="w-3 h-3 accent-rose-500"
                                    onChange={() => {
                                        const fields = checked
                                            ? (p.fields || RECORD_FIELDS).filter(f => f !== name)
                                            : [...(p.fields || RECORD_FIELDS), name];
                                        set('fields', fields);
                                    }} />
                                {roiVarLabel(name)}
                            </label>
                        );
                    })}
                </div>
            );
        }
        case 'capture_frame':
            return null; // 無參數

        case 'for_each_row': {
            const tables = useAppStore(s => s.dataTables);
            const tableNames = Object.keys(tables);
            const isVar = (p.table || '').startsWith('$');
            // 若是已知表格名稱，顯示欄位提示
            const knownTable = !isVar ? tables[p.table] : null;
            return (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <TableInput id={`for_each_row_${block?.id}`}
                        value={p.table || ''} tableNames={tableNames}
                        onChange={v => set('table', v)} />
                    <span className="text-slate-500 text-[10px]">→</span>
                    <input className={`${MINI} w-16`} value={p.rowVar || '$row'} placeholder="$row"
                        onChange={e => set('rowVar', e.target.value)}
                        onClick={e => e.stopPropagation()} />
                    {knownTable && (
                        <span className="text-[10px] text-slate-600">
                            欄位: {knownTable.headers.slice(0, 4).join(', ')}{knownTable.headers.length > 4 ? '...' : ''}
                        </span>
                    )}
                    {isVar && (
                        <span className="text-[10px] text-amber-500/70">⚡ 變數表格</span>
                    )}
                </div>
            );
        }

        case 'append_result': {
            const cols = p.columns || {};
            const colEntries = Object.entries(cols);
            return (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-[10px]">結果表:</span>
                        <input className={`${MINI} w-20`} value={p.table || 'results'} placeholder="results"
                            onChange={e => set('table', e.target.value)}
                            onClick={e => e.stopPropagation()} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {colEntries.map(([colName, varExpr], i) => (
                            <div key={i} className="flex items-center gap-0.5 bg-slate-800/50 rounded px-1 py-0.5">
                                <input className="bg-transparent text-[10px] text-emerald-400 w-12 outline-none" value={colName}
                                    placeholder="欄名"
                                    onChange={e => {
                                        const newCols = { ...cols };
                                        const val = newCols[colName];
                                        delete newCols[colName];
                                        newCols[e.target.value] = val;
                                        set('columns', newCols);
                                    }}
                                    onClick={e => e.stopPropagation()} />
                                <span className="text-slate-600 text-[10px]">=</span>
                                <input className="bg-transparent text-[10px] text-cyan-400 w-20 outline-none" value={varExpr}
                                    placeholder="$row.col"
                                    onChange={e => set('columns', { ...cols, [colName]: e.target.value })}
                                    onClick={e => e.stopPropagation()} />
                                <button className="text-slate-600 hover:text-rose-400 text-[10px]"
                                    onClick={e => { e.stopPropagation(); const c = { ...cols }; delete c[colName]; set('columns', c); }}>×</button>
                            </div>
                        ))}
                        <button className="text-[10px] text-slate-500 hover:text-emerald-400 px-1.5 py-0.5 rounded border border-dashed border-slate-700 hover:border-emerald-500/50 transition-colors"
                            onClick={e => { e.stopPropagation(); set('columns', { ...cols, [`欄${colEntries.length + 1}`]: '' }); }}>
                            + 欄位
                        </button>
                    </div>
                </div>
            );
        }

        case 'export_results':
            return (
                <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 text-[10px]">結果表:</span>
                    <input className={`${MINI} w-20`} value={p.table || 'results'} placeholder="results"
                        onChange={e => set('table', e.target.value)}
                        onClick={e => e.stopPropagation()} />
                    <span className="text-slate-500 text-[10px]">檔名:</span>
                    <input className={`${MINI} w-24`} value={p.filename || ''} placeholder="報告"
                        onChange={e => set('filename', e.target.value)}
                        onClick={e => e.stopPropagation()} />
                </div>
            );

        case 'read_row': {
            const tables = useAppStore(s => s.dataTables);
            const tableNames = Object.keys(tables);
            const isVar = (p.table || '').startsWith('$');
            return (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <TableInput id={`read_row_${block?.id}`}
                        value={p.table || ''} tableNames={tableNames}
                        onChange={v => set('table', v)} />
                    {isVar && (
                        <span className="text-[10px] text-amber-500/70">⚡ 變數表格</span>
                    )}
                    <span className="text-slate-500 text-[10px]">[</span>
                    <input className={`${MINI} min-w-[100px] flex-1`} value={p.indexExpr || '0'} placeholder="索引表達式"
                        onChange={e => set('indexExpr', e.target.value)}
                        onClick={e => e.stopPropagation()} />
                    <span className="text-slate-500 text-[10px]">]</span>
                    <span className="text-slate-500 text-[10px]">→</span>
                    <input className={`${MINI} w-16`} value={p.rowVar || '$item'} placeholder="$item"
                        onChange={e => set('rowVar', e.target.value)}
                        onClick={e => e.stopPropagation()} />
                </div>
            );
        }

        case 'clear_results':
            return (
                <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 text-[10px]">結果表:</span>
                    <input className={`${MINI} w-20`} value={p.table || 'results'} placeholder="results"
                        onChange={e => set('table', e.target.value)}
                        onClick={e => e.stopPropagation()} />
                </div>
            );

        default:
            return null;
    }
};

// ── 小型數字輸入 ──
const NumInput = ({ value, onChange, min, max, step, placeholder, w = 'w-16' }) => (
    <input type="number" className={`${MINI} ${w}`}
        value={value ?? ''} placeholder={placeholder}
        min={min} max={max} step={step || 1}
        onChange={e => {
            const v = e.target.value === '' ? '' : Number(e.target.value);
            onChange(v);
        }}
        onClick={e => e.stopPropagation()}
    />
);

// ── ROI 下拉選單（包含動態 OCR 目標）──
const RoiSelect = ({ value, onChange, filter }) => {
    const options = filter
        ? AVAILABLE_ROIS.filter(r => r.category === filter)
        : AVAILABLE_ROIS;

    // 如果是 OCR filter，也加入動態 OCR 目標
    const dynamicOcr = filter === 'ocr'
        ? Object.entries(usePhase4Store(s => s.clickTargets) || {})
            .filter(([, v]) => v.category === 'ocr')
            .map(([name]) => ({ name, label: `📐 ${name}` }))
        : [];

    return (
        <select className={SEL} value={value || options[0]?.name || ''} onChange={e => onChange(e.target.value)}
            onClick={e => e.stopPropagation()}>
            {options.map(r => (
                <option key={r.name} value={r.name}>{r.label}</option>
            ))}
            {dynamicOcr.length > 0 && (
                <optgroup label="自訂讀取區">
                    {dynamicOcr.map(r => (
                        <option key={r.name} value={r.name}>{r.label}</option>
                    ))}
                </optgroup>
            )}
        </select>
    );
};

// ── 點擊目標下拉選單（SPIN + 動態 control 目標）──
const ClickTargetSelect = ({ value, onChange }) => {
    const allTargets = usePhase4Store(s => s.clickTargets) || {};
    const controlNames = Object.entries(allTargets)
        .filter(([, v]) => v.category !== 'ocr')
        .map(([name]) => name);

    return (
        <select className={SEL} value={value || ''} onChange={e => onChange(e.target.value)}
            onClick={e => e.stopPropagation()}>
            <option value="">選擇點擊目標</option>
            <option value="SPIN">SPIN 按鈕</option>
            {controlNames.map(name => (
                <option key={name} value={name}>{name}</option>
            ))}
        </select>
    );
};
// ── 表格名稱輸入（input + datalist：可直接輸入 $var 或從下拉選現有表格）──
const TableInput = ({ id, value, tableNames, onChange }) => {
    const listId = `tbl-list-${id}`;
    const isVar = (value || '').startsWith('$');
    return (
        <div className="relative flex items-center">
            <input
                className={`${MINI} min-w-[100px] ${isVar ? 'text-amber-300' : ''}`}
                list={listId}
                value={value}
                placeholder="表格名稱 或 $var"
                onChange={e => onChange(e.target.value)}
                onClick={e => e.stopPropagation()}
            />
            <datalist id={listId}>
                {tableNames.map(n => (
                    <option key={n} value={n}>{n}</option>
                ))}
            </datalist>
        </div>
    );
};

export default BlockParams;
