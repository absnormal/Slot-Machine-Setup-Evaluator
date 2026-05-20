/**
 * flowRunner.js — Flow 執行引擎（核心調度）
 *
 * 讀取 Flow JSON 定義，逐步執行積木樹。
 * 支援：迴圈、條件分支、變數空間、暫停/繼續/停止。
 *
 * 設計：
 *   - 積木邏輯拆分至 blocks/ 子模組（controlBlocks, ocrBlocks 等）
 *   - 本檔負責調度、狀態管理、變數系統、表達式求值
 *   - 執行時透過 EventTarget 發出事件，供 UI 監聽
 */
import { evalConditionStr, evalArithStr } from './exprEvaluator';
import { findText } from './actions/findTextAction';
import {
    execForEachRow, execAppendResult, execExportResults,
    execReadRow, execClearResults,
} from './actions/tableAction';

// ── 積木處理器（從 blocks/ 子模組匯入）──
import { execClick, execWait, execKeyPress, execTypeText, execHotkey, execWaitStable, execWaitChange } from './blocks/controlBlocks';
import { execOcrBatch, execOcrRead, execCapture } from './blocks/ocrBlocks';
import { execRecord, execRecognizeGrid } from './blocks/recordBlocks';
import { execLoop, execIfThen, execSubFlow } from './blocks/flowBlocks';
import { execSetVar, execLog, execVarReplace, execVarExtractNumber } from './blocks/varBlocks';

// ═══════════════════════════════════════
// 全形→半形 正規化工具
// 使用 Unicode NFKC 相容分解，將全形 ASCII（Ａ-Ｚ、（）、０-９ 等）
// 自動轉為對應的半形字元，消除中文輸入法或 OCR 帶來的全/半形差異。
// 不影響中文字、日文假名、韓文等本體字元。
// ═══════════════════════════════════════
const normalizeStr = (str) =>
    typeof str === 'string' ? str.normalize('NFKC') : str;

// ═══════════════════════════════════════
// 執行狀態
// ═══════════════════════════════════════
export const RunState = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    STOPPED: 'stopped',
};

// ═══════════════════════════════════════
// 事件名稱
// ═══════════════════════════════════════
export const FlowEvent = {
    STATE_CHANGE: 'stateChange',    // { state: RunState }
    BLOCK_START: 'blockStart',      // { block, depth }
    BLOCK_END: 'blockEnd',          // { block, depth, result }
    VAR_UPDATE: 'varUpdate',        // { name, value }
    LOG: 'log',                     // { message }
    SPIN_RECORDED: 'spinRecorded',  // { spinIndex, ocrData }
    LOOP_PROGRESS: 'loopProgress',  // { blockId, current, total }
    ERROR: 'error',                 // { block, error }
};

// ═══════════════════════════════════════
// 積木處理器查表
// ═══════════════════════════════════════
const BLOCK_HANDLERS = {
    click_roi:          execClick,
    wait:               execWait,
    wait_stable:        execWaitStable,
    wait_change:        execWaitChange,
    ocr_batch:          execOcrBatch,
    ocr_read:           execOcrRead,
    capture_frame:      execCapture,
    record_spin:        execRecord,
    recognize_grid:     execRecognizeGrid,
    loop:               execLoop,
    if_then:            execIfThen,
    sub_flow:           execSubFlow,
    set_var:            execSetVar,
    log:                execLog,
    var_replace:        execVarReplace,
    var_extract_number: execVarExtractNumber,
    key_press:          execKeyPress,
    type_text:          execTypeText,
    hotkey:             execHotkey,
    // 表格積木（委派至 actions/tableAction.js）
    for_each_row:       (runner, block, depth) => execForEachRow(block, depth, runner),
    append_result:      (runner, block) => execAppendResult(block, runner),
    export_results:     (runner, block) => execExportResults(block, runner),
    read_row:           (runner, block) => execReadRow(block, runner),
    clear_results:      (runner, block) => execClearResults(block, runner),
};

/**
 * Flow 執行引擎
 */
export class FlowRunner extends EventTarget {
    constructor() {
        super();
        this.state = RunState.IDLE;
        this.variables = {};        // 變數空間 { $win: '500', $balance: '12345', ... }
        this._ws = null;            // WebSocket 連線
        this._videoEl = null;       // video 元素
        this._ocrWorker = null;     // 前端 PaddleOCR Worker（DBNet 全套）
        this._getCandidates = null; // 取得候選幀列表
        this._onSmartDedup = null;  // smartDedup 回呼
        this._cancelRef = { current: false };
        this._pausePromise = null;
        this._pauseResolve = null;
    }

    // ═══════════════════════════════════════
    // 公開 API
    // ═══════════════════════════════════════

    /**
     * 執行 Flow（獨立模式，不依賴 P4 即時偵測）
     * @param {Object} flow - Flow JSON 定義
     * @param {Object} context - 執行環境
     * @param {WebSocket} context.ws
     * @param {HTMLVideoElement} context.videoEl
     * @param {Function} [context.setCandidates] - 推送候選幀至 P4 顯示
     * @param {Object} [context.reelROI] - 轉輪 ROI（用於截圖縮圖）
     */
    async run(flow, context) {
        if (this.state === RunState.RUNNING) {
            throw new Error('Flow 正在執行中');
        }

        this._ws = context.ws;
        this._videoEl = context.videoEl;
        this._setCandidates = context.setCandidates;
        this._reelROI = context.reelROI;
        this._ocrWorker = context.ocrWorker || null;
        this._recognizeLocal = context.recognizeLocal || null;
        this._subFlowResolver = context.subFlowResolver || null;
        this._appStore = context.appStore || null;
        this._p4Export = context.p4Export || null;
        this._p4Clear = context.p4Clear || null;
        this._cancelRef = { current: false };
        this._spinCount = 0;
        this.variables = {};

        // 預注入所有已上傳表格的行數，供表達式直接引用
        if (this._appStore) {
            const tables = this._appStore.getState().dataTables;
            for (const [name, data] of Object.entries(tables)) {
                this.variables[`$${name}._count`] = data.rows.length;
                this._emit(FlowEvent.VAR_UPDATE, { name: `$${name}._count`, value: data.rows.length });
            }
        }

        this._setState(RunState.RUNNING);

        try {
            await this._executeBlocks(flow.blocks, 0);
            this._emit(FlowEvent.LOG, { message: '✅ Flow 執行完成' });
        } catch (e) {
            if (e.message === 'cancelled' || e.message === 'stopped') {
                this._emit(FlowEvent.LOG, { message: '⏹ Flow 已停止' });
            } else {
                this._emit(FlowEvent.ERROR, { block: null, error: e });
                this._emit(FlowEvent.LOG, { message: `❌ 執行錯誤: ${e.message}` });
            }
        } finally {
            this._setState(RunState.STOPPED);
            setTimeout(() => this._setState(RunState.IDLE), 500);
        }
    }

    /** 暫停 */
    pause() {
        if (this.state !== RunState.RUNNING) return;
        this._setState(RunState.PAUSED);
        this._pausePromise = new Promise(resolve => {
            this._pauseResolve = resolve;
        });
    }

    /** 繼續 */
    resume() {
        if (this.state !== RunState.PAUSED) return;
        this._setState(RunState.RUNNING);
        if (this._pauseResolve) {
            this._pauseResolve();
            this._pauseResolve = null;
            this._pausePromise = null;
        }
    }

    /** 停止 */
    stop() {
        this._cancelRef.current = true;
        if (this.state === RunState.PAUSED) {
            this.resume(); // 解除暫停以便正常退出
        }
    }

    // ═══════════════════════════════════════
    // 內部：積木執行
    // ═══════════════════════════════════════

    async _executeBlocks(blocks, depth) {
        if (!blocks || blocks.length === 0) return;

        for (const block of blocks) {
            await this._checkPauseAndCancel();
            await this._executeBlock(block, depth);
        }
    }

    async _executeBlock(block, depth) {
        const policy = block.errorPolicy || 'stop';
        const maxRetry = policy === 'retry' ? Math.min(block.retryCount || 3, 10) : 1;

        for (let attempt = 0; attempt < maxRetry; attempt++) {
            this._emit(FlowEvent.BLOCK_START, { block, depth, inSubFlow: this._inSubFlow || false });

            let result;
            try {
                // ── 內聯積木（控制信號，不適合外部處理器）──
                if (block.type === 'stop') {
                    const reason = block.params?.reason || '流程終止';
                    this._emit(FlowEvent.LOG, { message: `🛑 ${reason}` });
                    throw new Error('stopped');
                }
                if (block.type === 'break_loop') {
                    this._emit(FlowEvent.LOG, { message: '⏏️ 跳出迴圈' });
                    throw new Error('break');
                }
                if (block.type === 'find_text') {
                    result = await this._execFindText(block);
                } else if (block.type === 'export_p4_report') {
                    result = await this._execExportP4Report(block);
                } else if (block.type === 'clear_p4_data') {
                    result = this._execClearP4Data(block);
                } else {
                    // ── 查表處理器 ──
                    const handler = BLOCK_HANDLERS[block.type];
                    if (handler) {
                        result = await handler(this, block, depth);
                    } else {
                        console.warn(`[FlowRunner] 未知積木類型: ${block.type}`);
                    }
                }

                this._emit(FlowEvent.BLOCK_END, { block, depth, result });
                return result;

            } catch (e) {
                // 控制信號：直接向上傳播，不受 errorPolicy 影響
                if (e.message === 'cancelled' || e.message === 'stopped' || e.message === 'break') {
                    throw e;
                }

                const isLastAttempt = attempt >= maxRetry - 1;

                if (policy === 'retry' && !isLastAttempt) {
                    this._emit(FlowEvent.LOG, {
                        message: `🔄 ${block.type} 失敗，重試 ${attempt + 1}/${maxRetry}: ${e.message}`
                    });
                    this._sendPythonLog(`🔄 重試 ${attempt + 1}/${maxRetry}: ${e.message}`);
                    await new Promise(r => setTimeout(r, 1000)); // 冷卻 1 秒
                    continue;
                }

                if (policy === 'skip') {
                    this._emit(FlowEvent.LOG, {
                        message: `⏭️ ${block.type} 失敗已跳過: ${e.message}`
                    });
                    this._sendPythonLog(`⏭️ 跳過: ${e.message}`);
                    this._emit(FlowEvent.BLOCK_END, { block, depth, result: null });
                    return null;
                }

                // stop（預設）：發射錯誤事件 + 向上拋出
                this._emit(FlowEvent.ERROR, { block, error: e });
                throw e;
            }
        }
    }

    // ═══════════════════════════════════════
    // 內聯積木（依賴 runner 內部狀態較深，暫不外移）
    // ═══════════════════════════════════════

    /** 透過 WebSocket 發送 log 訊息到 Python terminal */
    _sendPythonLog(message) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            try { this._ws.send(JSON.stringify({ action: 'log', message })); } catch {}
        }
    }

    // ── 全螢幕文字搜尋 ──

    async _execFindText(block) {
        const { text, matchMode, timeout, interval, targetName, varName } = block.params;
        const resolvedText = this._interpolate(text || '');
        if (!resolvedText) throw new Error('[find_text] 未設定搜尋文字');

        const timeoutMs = (timeout ?? 10) * 1000;
        const intervalMs = interval ?? 1000;
        const name = targetName || '_FOUND';
        const start = Date.now();

        this._emit(FlowEvent.LOG, { message: `🔎 搜尋文字: "${resolvedText}" ...` });

        // 輪詢直到找到或超時
        while (Date.now() - start < timeoutMs) {
            if (this._cancelRef.current) throw new Error('cancelled');

            const result = await findText(this._ws, resolvedText, {
                matchMode: matchMode ?? 'contains',
            });

            if (result.found) {
                // 註冊為動態點擊目標 → click_roi 可直接使用
                this._setDynamicTarget(name, result.roi);

                // 存入變數空間
                this.variables['$_found_text'] = result.text;
                this._emit(FlowEvent.VAR_UPDATE, { name: '$_found_text', value: result.text });
                if (varName) {
                    this.variables[varName] = result.text;
                    this._emit(FlowEvent.VAR_UPDATE, { name: varName, value: result.text });
                }

                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                const msg = `✅ 找到 "${result.text}" → ${name} (信心 ${result.confidence}, ${elapsed}s)`;
                this._emit(FlowEvent.LOG, { message: msg });
                return result;
            }

            await new Promise(r => setTimeout(r, intervalMs));
        }

        const timeoutErr = new Error(`[find_text] 超時 ${timeout}s，未找到 "${resolvedText}"`);
        throw timeoutErr;
    }

    // ── P4 報告匯出 / 資料清除 ──

    async _execExportP4Report(block) {
        if (!this._p4Export) throw new Error('P4 匯出功能未連接');
        const filename = this._interpolate(block.params?.filename || 'report');
        this._emit(FlowEvent.LOG, { message: `📤 匯出 P4 報告: ${filename} ...` });
        await this._p4Export(filename);
        this._emit(FlowEvent.LOG, { message: `✅ P4 報告已匯出: ${filename}` });
    }

    _execClearP4Data(block) {
        if (!this._p4Clear) throw new Error('P4 清除功能未連接');
        this._p4Clear();
        this._emit(FlowEvent.LOG, { message: '🧹 P4 偵測資料已清除' });
    }

    // ═══════════════════════════════════════
    // 動態目標管理
    // ═══════════════════════════════════════

    /** 註冊動態點擊目標（供 find_text 使用，click_roi 可引用）*/
    _setDynamicTarget(name, roi) {
        if (!this._dynamicTargets) this._dynamicTargets = new Map();
        this._dynamicTargets.set(name, roi);
    }

    /** 取得動態點擊目標 */
    _getDynamicTarget(name) {
        return this._dynamicTargets?.get(name) || null;
    }

    // ═══════════════════════════════════════
    // 通訊
    // ═══════════════════════════════════════

    /**
     * 通用控制指令發送（等待 Python 回應）
     * 與 clickAction.js 相同的 requestId 模式
     */
    _sendControl(cmd) {
        const ws = this._ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return Promise.resolve({ success: false, message: 'WebSocket 未連線' });
        }

        const requestId = cmd.requestId || `ctrl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        cmd.requestId = requestId;

        return new Promise((resolve) => {
            const onMessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'control_result' && msg.requestId === requestId) {
                            ws.removeEventListener('message', onMessage);
                            resolve(msg);
                        }
                    } catch { /* 非 JSON (binary frame) */ }
                }
            };
            ws.addEventListener('message', onMessage);
            ws.send(JSON.stringify(cmd));

            // 超時保護（5 秒）— 超時視為失敗，讓呼叫方能正確顯示錯誤
            setTimeout(() => {
                ws.removeEventListener('message', onMessage);
                resolve({ success: false, message: 'control timeout (5s) — Python 未回應，請確認伺服器狀態' });
            }, 5000);
        });
    }

    // ═══════════════════════════════════════
    // 表達式與變數
    // ═══════════════════════════════════════

    /**
     * 簡易表達式求值
     * 支援：數字、字串、變數引用（$var, $row.col）、簡單算術（+, -, *, /, %）
     */
    _evalExpr(expr) {
        if (typeof expr === 'number') return expr;
        if (typeof expr !== 'string') return expr;

        // 純數字
        const num = Number(expr);
        if (!isNaN(num) && expr.trim() !== '') return num;

        // 純變數引用（$var 或 $row.col，不含運算符/空格）
        const pureVarMatch = /^\$[\w\u4e00-\u9fff]+(?:\.[\w\u4e00-\u9fff]+)*$/.test(expr);
        if (pureVarMatch) {
            // 特殊：$tableName._count → 動態查詢 appStore 的表格列數
            // 讓 set_var $帳號數 = $遊戲_設定._count 在 for_each_row 之前也能正確取值
            if (expr.endsWith('._count') && this._appStore) {
                const tableName = expr.slice(1, -7); // 去掉 $ 和 ._count
                const td = this._appStore.getState().dataTables[tableName];
                if (td?.rows) return td.rows.length;
            }
            return this.variables[expr] ?? 0;
        }

        // 簡單算術/字串：替換變數後用安全 evaluator（不使用 Function/eval）
        try {
            const substituted = expr.replace(/\$([\w\u4e00-\u9fff]+(?:\.[\w\u4e00-\u9fff]+)*)/g, (_, name) => {
                // 特殊：tableName._count → 動態查詢表格列數
                if (name.endsWith('._count') && this._appStore) {
                    const tableName = name.slice(0, -7);
                    const td = this._appStore.getState().dataTables[tableName];
                    if (td?.rows) return td.rows.length;
                }
                const val = this.variables[`$${name}`];
                return typeof val === 'number' ? val : parseFloat(val) || 0;
            });
            const result = evalArithStr(substituted);
            // 接受數字結果和字串結果（"..." 解析後去掉引號）
            if (typeof result === 'number' && !isNaN(result)) return result;
            if (typeof result === 'string') return result;
        } catch { /* fall through */ }

        return expr;
    }

    /**
     * 條件求值
     * 支援：$var > 100, $var < 50000, $var === 'text'
     */
    _evalCondition(condition) {
        if (typeof condition === 'boolean') return condition;
        if (typeof condition !== 'string') return !!condition;

        try {
            // 先正規化條件字串本身（條件積木中的全形括號/符號→半形）
            const normalized = normalizeStr(condition);
            const substituted = normalized.replace(/\$([\w\u4e00-\u9fff]+(?:\.[\w\u4e00-\u9fff]+)*)/g, (_, name) => {
                const val = this.variables[`$${name}`];
                if (val === undefined) return '0';
                // 變數值也正規化（消除 OCR / Excel 帶入的全形字元差異）
                const normVal = normalizeStr(String(val));
                return typeof val === 'number' ? normVal : `"${normVal}"`;
            });

            // 使用安全的 token-based evaluator（不使用 Function/eval）
            return evalConditionStr(substituted);
        } catch { /* fall through */ }

        return false;
    }

    /**
     * 字串插值：將 ${$var} 替換為變數值
     */
    _interpolate(template) {
        if (typeof template !== 'string') return String(template);
        const result = template.replace(/\$([\w\u4e00-\u9fff]+(?:\.[\w\u4e00-\u9fff]+)*)/g, (match, name) => {
            return this.variables[`$${name}`] ?? match;
        });
        // 插值後做全形→半形正規化（消除 OCR / Excel 帶入的全形字元差異）
        return normalizeStr(result);
    }

    /**
     * 暫停/取消檢查點
     */
    async _checkPauseAndCancel() {
        if (this._cancelRef.current) {
            throw new Error('cancelled');
        }
        if (this.state === RunState.PAUSED && this._pausePromise) {
            await this._pausePromise;
        }
    }

    _setState(state) {
        this.state = state;
        this._emit(FlowEvent.STATE_CHANGE, { state });
    }

    _emit(eventName, detail) {
        this.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
}
