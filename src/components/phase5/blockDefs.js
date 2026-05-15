/**
 * blockDefs.js — 積木定義常數
 */

// 積木圖示 + 顏色（按功能分類）
export const BLOCK_META = {
    // 🎮 操控 — 藍色系
    click_roi:    { icon: '🎮', label: '點擊', color: 'border-blue-400/50 bg-blue-500/15' },
    key_press:    { icon: '⌨️', label: '按鍵', color: 'border-blue-400/50 bg-blue-500/15' },
    // ⏳ 等待 — 琥珀色系
    wait:         { icon: '⏱️', label: '等待', color: 'border-amber-400/50 bg-amber-500/15' },
    wait_stable:  { icon: '👁️', label: '等待穩定', color: 'border-amber-400/50 bg-amber-500/15' },
    wait_change:  { icon: '⚡', label: '等待數字變化', color: 'border-orange-400/50 bg-orange-500/15' },
    // 📊 讀取 — 青色系
    ocr_batch:    { icon: '📊', label: '批次讀取', color: 'border-teal-400/50 bg-teal-500/15' },
    ocr_read:     { icon: '📖', label: '讀取', color: 'border-teal-400/50 bg-teal-500/15' },
    // 📸 記錄 — 玫紅色系
    capture_frame:{ icon: '📸', label: '截圖', color: 'border-rose-400/50 bg-rose-500/15' },
    record_spin:  { icon: '💾', label: '記錄結果', color: 'border-rose-400/50 bg-rose-500/15' },
    recognize_grid:{ icon: '🔍', label: '盤面辨識', color: 'border-teal-400/50 bg-teal-500/15' },
    // 🔁 流程 — 靛色系
    loop:         { icon: '🔁', label: '迴圈', color: 'border-indigo-400/50 bg-indigo-500/15' },
    if_then:      { icon: '❓', label: '條件', color: 'border-violet-400/50 bg-violet-500/15' },
    sub_flow:     { icon: '📦', label: '子流程', color: 'border-cyan-400/50 bg-cyan-500/15' },
    // 🔧 工具 — 灰色系
    set_var:      { icon: '📝', label: '設定變數', color: 'border-slate-400/40 bg-slate-500/10' },
    log:          { icon: '📋', label: '記錄', color: 'border-slate-400/40 bg-slate-500/10' },
    // 🛑 控制 — 紅色系
    stop:         { icon: '🛑', label: '終止流程', color: 'border-red-400/50 bg-red-500/15' },
    break_loop:   { icon: '⏏️', label: '跳出迴圈', color: 'border-red-400/50 bg-red-500/15' },
};

export const NEW_BLOCK_TEMPLATES = [
    { type: 'click_roi', params: { roi: 'SPIN' } },
    { type: 'wait', params: { seconds: 1 } },
    { type: 'wait_stable', params: { roi: 'REEL', stableCount: 3, interval: 200 } },
    { type: 'wait_change', params: { roi: 'WIN', changeCount: 2, interval: 200, timeout: 30 } },
    { type: 'ocr_batch', params: { rois: ['WIN', 'BAL', 'BET', 'ORDER_ID'] } },
    { type: 'ocr_read', params: { roi: 'WIN', varName: '$win' } },
    { type: 'record_spin', params: { fields: ['WIN', 'BAL', 'BET', 'ORDER_ID', 'MULT'] } },
    { type: 'loop', params: { count: 100 }, children: [] },
    { type: 'if_then', params: { condition: '$win > 0' }, children: [], elseChildren: [] },
    { type: 'sub_flow', params: { flowId: '', label: '' } },
    { type: 'set_var', params: { name: '$totalWin', value: 0 } },
    { type: 'log', params: { message: '第 $loopIndex 局完成' } },
    { type: 'capture_frame', params: {} },
    { type: 'recognize_grid', params: {} },
    { type: 'key_press', params: { key: 'space' } },
    { type: 'stop', params: { reason: '手動終止' } },
    { type: 'break_loop', params: {} },
];

let _blockIdCounter = 0;
export const genId = () => `blk_${Date.now()}_${_blockIdCounter++}`;
