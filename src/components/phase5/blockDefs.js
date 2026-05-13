/**
 * blockDefs.js — 積木定義常數
 */

// 積木圖示 + 顏色
export const BLOCK_META = {
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

export const NEW_BLOCK_TEMPLATES = [
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
export const genId = () => `blk_${Date.now()}_${_blockIdCounter++}`;
