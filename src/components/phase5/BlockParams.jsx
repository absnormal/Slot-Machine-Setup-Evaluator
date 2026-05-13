import React from 'react';
import { AVAILABLE_ROIS } from '../../engine/roiResolver';

/**
 * BlockParams — 積木參數行內編輯
 *
 * 根據積木類型渲染對應的輸入控件。
 */

const MINI = 'bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors';
const SEL  = 'bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-slate-200 outline-none focus:border-indigo-500';

// ROI 下拉選項
const ROI_OPTIONS = AVAILABLE_ROIS.map(r => ({ value: r.name, label: `${r.label} (${r.name})` }));

// OCR ROI 多選（勾選框式）
const OCR_ROIS = AVAILABLE_ROIS.filter(r => r.category === 'ocr').map(r => r.name);

const BlockParams = ({ block, onUpdate }) => {
    const p = block.params || {};

    const set = (key, val) => {
        onUpdate({ ...block, params: { ...p, [key]: val } });
    };

    switch (block.type) {
        case 'click_roi':
            return (
                <div className="flex items-center gap-1.5">
                    <RoiSelect value={p.roi} onChange={v => set('roi', v)} filter="control" />
                </div>
            );

        case 'wait':
            return (
                <div className="flex items-center gap-1.5">
                    <NumInput value={p.ms} onChange={v => set('ms', v)} min={0} step={100} />
                    <span className="text-slate-500 text-[10px]">ms</span>
                </div>
            );

        case 'wait_stable':
            return (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <RoiSelect value={p.roi} onChange={v => set('roi', v)} filter="detection" />
                    <span className="text-slate-500 text-[10px]">×</span>
                    <NumInput value={p.stableCount ?? 3} onChange={v => set('stableCount', v)} min={1} max={20} w="w-10" />
                    <span className="text-slate-500 text-[10px]">間隔</span>
                    <NumInput value={p.interval ?? 200} onChange={v => set('interval', v)} min={50} step={50} w="w-14" />
                    <span className="text-slate-500 text-[10px]">ms</span>
                </div>
            );

        case 'ocr_batch':
            return (
                <div className="flex items-center gap-1 flex-wrap">
                    {OCR_ROIS.map(name => {
                        const checked = (p.rois || []).includes(name);
                        return (
                            <label key={name} className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                                checked ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-500 hover:text-slate-300'
                            }`}>
                                <input type="checkbox" checked={checked}
                                    className="w-3 h-3 accent-cyan-500"
                                    onChange={() => {
                                        const rois = checked
                                            ? (p.rois || []).filter(r => r !== name)
                                            : [...(p.rois || []), name];
                                        set('rois', rois);
                                    }} />
                                {name}
                            </label>
                        );
                    })}
                </div>
            );

        case 'ocr_read':
            return (
                <div className="flex items-center gap-1.5">
                    <RoiSelect value={p.roi} onChange={v => set('roi', v)} filter="ocr" />
                    <span className="text-slate-500 text-[10px]">→</span>
                    <input className={`${MINI} w-20`} value={p.varName || ''} placeholder="$var"
                        onChange={e => set('varName', e.target.value)} />
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
                    <input className={`${MINI} w-20`} value={p.name || ''} placeholder="$name"
                        onChange={e => set('name', e.target.value)} />
                    <span className="text-slate-500 text-[10px]">=</span>
                    <input className={`${MINI} w-20`} value={p.value ?? ''} placeholder="值"
                        onChange={e => set('value', e.target.value)} />
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

        case 'record_spin':
        case 'capture_frame':
            return null; // 無參數

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

// ── ROI 下拉選單 ──
const RoiSelect = ({ value, onChange, filter }) => {
    const options = filter
        ? AVAILABLE_ROIS.filter(r => r.category === filter)
        : AVAILABLE_ROIS;

    return (
        <select className={SEL} value={value || ''} onChange={e => onChange(e.target.value)}
            onClick={e => e.stopPropagation()}>
            <option value="">選擇 ROI</option>
            {options.map(r => (
                <option key={r.name} value={r.name}>{r.label}</option>
            ))}
        </select>
    );
};

export default BlockParams;
