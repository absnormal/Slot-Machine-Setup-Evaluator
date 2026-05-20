/**
 * presetFlows.js — 預設 Flow 模板
 *
 * 從 flowRunner.js 抽出的純資料，供 FlowComposer 使用。
 */

export const PRESET_FLOWS = [
    {
        id: 'preset_empty',
        name: '空白模板',
        description: '空白流程，從零開始自行組合積木',
        version: 1,
        blocks: [],
    },
    {
        id: 'preset_basic_spin',
        name: '基本自動 SPIN',
        description: '適用於大部分無 Cascade 的標準老虎機',
        version: 1,
        blocks: [
            {
                id: 'b1', type: 'loop', params: { count: 100 },
                children: [
                    { id: 'b2', type: 'click_roi', params: { roi: 'SPIN' } },
                    { id: 'b3', type: 'wait', params: { ms: 500 } },
                    { id: 'b4', type: 'wait_stable', params: { roi: 'REEL', stableCount: 3, interval: 200 } },
                    { id: 'b5', type: 'wait', params: { ms: 1000 } },
                    { id: 'b6', type: 'ocr_batch', params: { rois: ['WIN', 'BAL', 'BET', 'ORDER_ID'] } },
                    { id: 'b7', type: 'record_spin', params: {} },
                    { id: 'b8', type: 'wait', params: { ms: 200 } },
                ],
            },
        ],
    },
    {
        id: 'preset_cascade',
        name: 'Cascade 遊戲',
        description: '適用於有連鎖消除的老虎機（如 Sweet Bonanza）',
        version: 1,
        blocks: [
            {
                id: 'c1', type: 'loop', params: { count: 100 },
                children: [
                    { id: 'c2', type: 'click_roi', params: { roi: 'SPIN' } },
                    { id: 'c3', type: 'set_var', params: { name: '$totalWin', value: 0 } },
                    { id: 'c4', type: 'wait', params: { ms: 500 } },
                    { id: 'c5', type: 'wait_stable', params: { roi: 'REEL', stableCount: 5, interval: 300 } },
                    { id: 'c6', type: 'wait', params: { ms: 1500 } },
                    { id: 'c7', type: 'ocr_batch', params: { rois: ['WIN', 'BAL', 'BET', 'ORDER_ID'] } },
                    { id: 'c8', type: 'record_spin', params: {} },
                    { id: 'c9', type: 'wait', params: { ms: 200 } },
                ],
            },
        ],
    },
    {
        id: 'preset_manual_observe',
        name: '手動觀察（無 SPIN）',
        description: '只偵測畫面穩定並讀取數值，不自動按 SPIN',
        version: 1,
        blocks: [
            {
                id: 'm1', type: 'loop', params: { count: 999 },
                children: [
                    { id: 'm2', type: 'wait_stable', params: { roi: 'REEL', stableCount: 5, interval: 300 } },
                    { id: 'm3', type: 'wait', params: { ms: 500 } },
                    { id: 'm4', type: 'ocr_batch', params: { rois: ['WIN', 'BAL', 'BET', 'ORDER_ID'] } },
                    { id: 'm5', type: 'record_spin', params: {} },
                    { id: 'm6', type: 'log', params: { message: '第 $loopIndex 局: WIN=$win BAL=$balance' } },
                    { id: 'm7', type: 'wait', params: { ms: 1000 } },
                ],
            },
        ],
    },
];
