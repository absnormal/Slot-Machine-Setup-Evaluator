/**
 * flowRunner.js — Flow 執行引擎
 *
 * 讀取 Flow JSON 定義，逐步執行積木樹。
 * 支援：迴圈、條件分支、變數空間、暫停/繼續/停止。
 *
 * 設計：
 *   - 每個積木呼叫 actionRegistry 中對應的原子動作
 *   - 執行時透過 EventTarget 發出事件，供 UI 監聽
 *   - 執行狀態（running/paused/stopped）透過 ref 控制
 */
import { clickROI } from './actions/clickAction';
import { wait } from './actions/waitAction';
import { ocrBatch, ocrRead } from './actions/ocrAction';
import { evalConditionStr, evalArithStr } from './exprEvaluator';
import { cropAndOCR } from './ocrPipeline';
import { resolveROI, getDecimalPlaces } from './roiResolver';
import { captureFrame } from './actions/captureAction';
import { waitStable } from './actions/waitStableAction';
import { waitChange } from './actions/waitChangeAction';
import {
    execForEachRow, execAppendResult, execExportResults,
    execReadRow, execClearResults,
} from './actions/tableAction';

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
                switch (block.type) {
                    case 'click_roi':
                        result = await this._execClick(block);
                        break;
                    case 'wait':
                        result = await this._execWait(block);
                        break;
                    case 'wait_stable':
                        result = await this._execWaitStable(block);
                        break;
                    case 'wait_change':
                        result = await this._execWaitChange(block);
                        break;
                    case 'ocr_batch':
                        result = await this._execOcrBatch(block);
                        break;
                    case 'ocr_read':
                        result = await this._execOcrRead(block);
                        break;
                    case 'capture_frame':
                        result = await this._execCapture(block);
                        break;
                    case 'record_spin':
                        result = await this._execRecord(block);
                        break;
                    case 'recognize_grid':
                        result = await this._execRecognizeGrid(block);
                        break;
                    case 'loop':
                        result = await this._execLoop(block, depth);
                        break;
                    case 'if_then':
                        result = await this._execIfThen(block, depth);
                        break;
                    case 'sub_flow':
                        result = await this._execSubFlow(block, depth);
                        break;
                    case 'set_var':
                        result = this._execSetVar(block);
                        break;
                    case 'var_replace':
                        result = this._execVarReplace(block);
                        break;
                    case 'var_extract_number':
                        result = this._execVarExtractNumber(block);
                        break;
                    case 'log':
                        result = this._execLog(block);
                        break;
                    case 'key_press':
                        result = await this._execKeyPress(block);
                        break;
                    case 'type_text':
                        result = await this._execTypeText(block);
                        break;
                    case 'hotkey':
                        result = await this._execHotkey(block);
                        break;
                    case 'stop': {
                        const reason = block.params?.reason || '流程終止';
                        this._emit(FlowEvent.LOG, { message: `🛑 ${reason}` });
                        throw new Error('stopped');
                    }
                    case 'break_loop':
                        this._emit(FlowEvent.LOG, { message: '⏏️ 跳出迴圈' });
                        throw new Error('break');
                    case 'for_each_row':
                        result = await this._execForEachRow(block, depth);
                        break;
                    case 'append_result':
                        result = this._execAppendResult(block);
                        break;
                    case 'export_results':
                        result = this._execExportResults(block);
                        break;
                    case 'read_row':
                        result = this._execReadRow(block);
                        break;
                    case 'clear_results':
                        result = this._execClearResults(block);
                        break;
                    default:
                        console.warn(`[FlowRunner] 未知積木類型: ${block.type}`);
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

    // ── 控制積木 ──

    /** 透過 WebSocket 發送 log 訊息到 Python terminal */
    _sendPythonLog(message) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            try { this._ws.send(JSON.stringify({ action: 'log', message })); } catch {}
        }
    }

    async _execClick(block) {
        const { roi, button } = block.params;
        return await clickROI(this._ws, roi, { button });
    }

    async _execWait(block) {
        // 優先用 seconds（新格式），fallback 到 ms（舊格式）
        const ms = block.params.seconds !== undefined
            ? this._evalExpr(block.params.seconds) * 1000
            : this._evalExpr(block.params.ms);
        await wait(ms, { cancelRef: this._cancelRef });
    }

    async _execKeyPress(block) {
        const { key } = block.params;
        const resolvedKey = this._interpolate(String(key || ''));
        const requestId = `key_${Date.now()}`;
        this._emit(FlowEvent.LOG, { message: `⌨️ 按鍵: ${resolvedKey}` });

        const result = await this._sendControl({ action: 'key', key: resolvedKey, requestId });
        if (!result?.success) {
            throw new Error(`按鍵失敗: ${result?.message || 'unknown'}`);
        }
        // 給目標視窗處理時間
        await new Promise(r => setTimeout(r, 100));
    }

    async _execTypeText(block) {
        const { text } = block.params;
        const resolved = this._interpolate(String(text || ''));
        this._emit(FlowEvent.LOG, { message: `💬 輸入: "${resolved}"` });

        const result = await this._sendControl({ action: 'type_text', text: resolved });
        if (!result?.success) {
            throw new Error(`輸入失敗: ${result?.message || 'unknown'}`);
        }
        // 剪貼簿+貼上需要較長處理時間
        await new Promise(r => setTimeout(r, 300));
    }

    async _execHotkey(block) {
        const { keys } = block.params;
        const resolvedKeys = this._interpolate(String(keys || ''));
        const keyList = resolvedKeys.split('+').map(k => k.trim()).filter(Boolean);
        if (keyList.length === 0) return;
        this._emit(FlowEvent.LOG, { message: `🔑 組合鍵: ${keyList.join('+')}` });

        const result = await this._sendControl({ action: 'hotkey', keys: keyList });
        if (!result?.success) {
            throw new Error(`組合鍵失敗: ${result?.message || 'unknown'}`);
        }
        await new Promise(r => setTimeout(r, 200));
    }

    // ── 偵測積木 ──

    async _execWaitStable(block) {
        const { roi, stableCount, interval, timeout } = block.params;
        return await waitStable(this._videoEl, roi, {
            stableCount: stableCount ?? 3,
            interval: interval ?? 200,
            timeout: timeout ?? 30000,
            cancelRef: this._cancelRef,
        });
    }

    async _execWaitChange(block) {
        const { roi, changeCount, interval, timeout } = block.params;
        // waitChange 超時會 throw Error（由外層 errorPolicy 攔截）
        const result = await waitChange(this._ws, roi, {
            changeCount: changeCount ?? 2,
            interval: interval ?? 200,
            timeout: (timeout ?? 30) * 1000,
            cancelRef: this._cancelRef,
        });

        const msg = `⚡ ${roi}: ${result.oldValue} → ${result.newValue} (穩定 ${changeCount ?? 2} 次, ${(result.elapsed / 1000).toFixed(1)}s)`;
        this._emit(FlowEvent.LOG, { message: msg });
        this._sendPythonLog(msg);
        return result;
    }

    // ── 讀取積木 ──

    async _execOcrBatch(block) {
        const { rois } = block.params;
        let results;

        // 有截圖 + 前端 ocrWorker → 用前端 DBNet 全套（準確）
        if (this._lastCapturedCanvas && this._ocrWorker) {
            results = {};
            for (const name of rois) {
                const roi = resolveROI(name);
                if (!roi) {
                    throw new Error(`[ocr_batch] 無法解析 ROI: "${name}"（當前環境未設定此區域）`);
                }
                const upper = name.toUpperCase();
                const key = upper === 'BAL' || upper === 'BALANCE' ? 'balance'
                    : upper === 'ORDER_ID' || upper === 'ORDERID' ? 'orderId'
                    : upper === 'MULT' || upper === 'MULTIPLIER' ? 'multiplier'
                    : name.toLowerCase();
                const dp = getDecimalPlaces(name);
                results[key] = await cropAndOCR(this._lastCapturedCanvas, roi, this._ocrWorker, dp, upper);
            }
            const logMsg = `📊 前端 OCR: ${JSON.stringify(results)}`;
            this._emit(FlowEvent.LOG, { message: logMsg });
            this._sendPythonLog(logMsg);
        } else {
            // 沒截圖 → fallback Python rec-only
            results = await ocrBatch(this._ws, rois);
            this._sendPythonLog(`📊 Python OCR: ${JSON.stringify(results)}`);
        }

        // 自動將結果寫入變數空間
        for (const [key, rawValue] of Object.entries(results)) {
            const value = rawValue;
            const varName = `$${key}`;
            // 空值不覆蓋現有變數（避免子流程清空主流程的值）
            if (value === '' || value === null || value === undefined) {
                if (this.variables[varName] !== undefined) {
                    console.log(`[ocr_batch] 跳過空值覆蓋: ${varName} 保留="${this.variables[varName]}"`);
                    continue;
                }
            }
            this.variables[varName] = value;
            this._emit(FlowEvent.VAR_UPDATE, { name: varName, value });
        }
        console.log('[ocr_batch] variables 快照:', JSON.stringify(this.variables));

        return results;
    }

    async _execOcrRead(block) {
        const { roi, varName, mode = 'number' } = block.params;
        const vName = varName || `$${roi.toLowerCase()}`;
        let value;

        // 有截圖 + 前端 ocrWorker → 用前端 DBNet（優先）
        if (this._lastCapturedCanvas && this._ocrWorker) {
            const roiPct = resolveROI(roi);
            if (!roiPct) throw new Error(`[ocr_read] 無法解析 ROI: "${roi}"`);
            const dp = mode === 'text' ? 0 : getDecimalPlaces(roi);
            value = await cropAndOCR(this._lastCapturedCanvas, roiPct, this._ocrWorker, dp, roi.toUpperCase(), mode);
            this._emit(FlowEvent.LOG, { message: `📖 ${roi}→${vName}: "${value}" (${mode === 'text' ? '文字' : '數字'})` });
        } else {
            // fallback → Python OCR
            value = await ocrRead(this._ws, roi, mode);
        }

        this.variables[vName] = value;
        this._emit(FlowEvent.VAR_UPDATE, { name: vName, value });
        return value;
    }

    async _execCapture(block) {
        const roiPct = block.params?.roi ? resolveROI(block.params.roi) : null;
        const frame = captureFrame(this._videoEl, roiPct);

        // 推送至 P4 候選幀區域
        if (this._setCandidates) {
            let thumbUrl = frame.dataUrl;
            if (!roiPct && this._reelROI) {
                try {
                    const thumb = captureFrame(this._videoEl, this._reelROI);
                    thumbUrl = thumb.dataUrl;
                } catch { /* fallback */ }
            }

            const candidateId = `cap_${Date.now()}`;
            const candidate = {
                id: candidateId,
                time: this._videoEl?.currentTime || 0,
                canvas: frame.canvas,
                thumbUrl,
                status: 'pending',
                ocrData: { win: '', balance: '', bet: '' },
            };
            this._setCandidates(prev => [...prev, candidate]);
            this._lastCaptureId = candidateId; // 供 record_spin 更新用
            this._lastCapturedCanvas = frame.canvas; // 供 ocr_batch 使用截圖做 OCR
            this._emit(FlowEvent.LOG, { message: '📸 截圖已加入候選幀' });
        }

        return frame;
    }

    // ── 記錄積木（更新最後截圖的候選幀，或新建一張）──

    async _execRecord(block) {
        // 勾選的欄位（預設全選）
        const fields = block.params?.fields || ['WIN', 'BAL', 'BET', 'ORDER_ID'];
        const has = (name) => fields.includes(name);

        // 從變數空間搜尋 OCR 資料（支援標準名稱和自訂 ROI 名稱）
        const findVar = (...keys) => {
            for (const k of keys) {
                if (this.variables[k] !== undefined && this.variables[k] !== '') return this.variables[k];
            }
            return undefined;
        };

        const ocrData = {
            win:        findVar('$WIN', '$win', '$道具卡贏分') || '-',
            balance:    findVar('$BALANCE', '$BAL', '$balance') || '-',
            bet:        findVar('$BET', '$bet') || '-',
            orderId:    findVar('$ORDER_ID', '$orderId') || '',
            ...(findVar('$MULT', '$multiplier') ? { multiplier: findVar('$MULT', '$multiplier') } : {}),
        };

        // 如果標準名稱都沒找到，掃描所有變數尋找可能的 win 值
        if (!ocrData.win) {
            for (const [k, v] of Object.entries(this.variables)) {
                if (k.startsWith('$') && v && v !== '0' && !['$balance', '$bet', '$orderId', '$BALANCE', '$BAL', '$BET', '$ORDER_ID'].includes(k)) {
                    // 非標準名稱且有值 → 可能是自訂 win ROI
                    ocrData.win = v;
                    break;
                }
            }
        }

        const spinIndex = this._spinCount++;

        if (this._setCandidates) {
            if (this._lastCaptureId) {
                // 更新 capture_frame 建立的候選幀（補上 OCR + 完成狀態）
                const targetId = this._lastCaptureId;
                console.log('[record_spin] 準備更新候選幀', targetId, 'ocrData=', JSON.stringify(ocrData));
                this._setCandidates(prev => {
                    const found = prev.find(c => c.id === targetId);
                    console.log('[record_spin] prev 中找到目標?', !!found, 'prev.length=', prev.length);
                    if (found) console.log('[record_spin] 更新前 ocrData=', JSON.stringify(found.ocrData));
                    return prev.map(c =>
                        c.id === targetId
                            ? { ...c, ocrData, status: c.status === 'recognized' ? 'recognized' : 'completed', winPollStatus: 'completed' }
                            : c
                    );
                });
                this._sendPythonLog(`📸 更新候選幀 ${this._lastCaptureId}`);
                this._lastCaptureId = null;
                this._lastCapturedCanvas = null;
            } else if (this._videoEl) {
                // 沒有先截圖 → 自行截圖建立候選幀
                const frame = captureFrame(this._videoEl);
                let thumbUrl = frame.dataUrl;
                if (this._reelROI) {
                    try {
                        const thumb = captureFrame(this._videoEl, this._reelROI);
                        thumbUrl = thumb.dataUrl;
                    } catch { /* fallback */ }
                }

                const candidate = {
                    id: `flow_${Date.now()}_${spinIndex}`,
                    time: this._videoEl?.currentTime || 0,
                    canvas: frame.canvas,
                    thumbUrl,
                    status: 'completed',
                    winPollStatus: 'completed',
                    ocrData,
                };
                this._setCandidates(prev => [...prev, candidate]);
            }
        }

        const recordMsg = `📝 #${spinIndex + 1} WIN=${ocrData.win} BAL=${ocrData.balance} BET=${ocrData.bet} ID=${ocrData.orderId}`;
        this._emit(FlowEvent.LOG, { message: recordMsg });
        this._sendPythonLog(recordMsg);

        this._emit(FlowEvent.SPIN_RECORDED, {
            spinIndex,
            ocrData,
        });

        return { success: true, spinIndex };
    }

    // ── 盤面辨識積木 ──

    async _execRecognizeGrid() {
        if (!this._recognizeLocal) {
            throw new Error('盤面辨識未設定（recognizeLocal callback 不存在）');
        }
        if (!this._lastCaptureId) {
            throw new Error('沒有截圖可辨識（請先執行「截圖」積木）');
        }
        this._emit(FlowEvent.LOG, { message: '🔍 盤面辨識中...' });
        await this._recognizeLocal(this._lastCaptureId);
        this._sendPythonLog(`🔍 盤面辨識完成 ${this._lastCaptureId}`);
    }

    // ── 流程積木 ──

    async _execLoop(block, depth) {
        const { count, condition } = block.params;
        const children = block.children || [];

        if (count !== undefined && count !== null) {
            // 固定次數迴圈
            const total = this._evalExpr(count);
            for (let i = 0; i < total; i++) {
                await this._checkPauseAndCancel();
                this.variables['$loopIndex'] = i;
                this._emit(FlowEvent.LOOP_PROGRESS, {
                    blockId: block.id,
                    current: i + 1,
                    total,
                });

                try {
                    await this._executeBlocks(children, depth + 1);
                } catch (e) {
                    if (e.message === 'break') break;
                    throw e;
                }
            }
        } else if (condition) {
            // 條件迴圈
            let i = 0;
            while (this._evalCondition(condition)) {
                await this._checkPauseAndCancel();
                this.variables['$loopIndex'] = i++;
                this._emit(FlowEvent.LOOP_PROGRESS, {
                    blockId: block.id,
                    current: i,
                    total: -1, // 未知總數
                });

                try {
                    await this._executeBlocks(children, depth + 1);
                } catch (e) {
                    if (e.message === 'break') break;
                    throw e;
                }
            }
        }
    }

    async _execIfThen(block, depth) {
        const { condition } = block.params;
        if (this._evalCondition(condition)) {
            await this._executeBlocks(block.children, depth + 1);
        } else if (block.elseChildren) {
            await this._executeBlocks(block.elseChildren, depth + 1);
        }
    }

    async _execSubFlow(block, depth) {
        const MAX_DEPTH = 10;
        if (depth >= MAX_DEPTH) {
            throw new Error(`子流程巢狀深度超過上限 (${MAX_DEPTH})，可能存在循環引用`);
        }

        const { flowId, label } = block.params;
        if (!flowId) {
            throw new Error('子流程未選擇（flowId 為空）');
        }
        if (!this._subFlowResolver) {
            throw new Error('子流程解析器未設定');
        }

        const subFlow = this._subFlowResolver(flowId);
        if (!subFlow || !subFlow.blocks) {
            throw new Error(`找不到子流程: ${label || flowId}`);
        }

        this._emit(FlowEvent.LOG, { message: `📦 進入子流程: ${subFlow.name || label || flowId}` });
        this._sendPythonLog(`📦 子流程: ${subFlow.name || flowId}`);
        this._inSubFlow = (this._inSubFlow || 0) + 1;
        try {
            await this._executeBlocks(subFlow.blocks, depth + 1);
        } finally {
            this._inSubFlow = Math.max(0, (this._inSubFlow || 1) - 1);
        }
        this._emit(FlowEvent.LOG, { message: `📦 離開子流程: ${subFlow.name || label || flowId}` });
    }

    _execSetVar(block) {
        const { name, value, op } = block.params;
        const resolved = this._evalExpr(value);
        const current = this.variables[name] ?? 0;
        let final;
        switch (op) {
            case '+=': final = (parseFloat(current) || 0) + (parseFloat(resolved) || 0); break;
            case '-=': final = (parseFloat(current) || 0) - (parseFloat(resolved) || 0); break;
            case '*=': final = (parseFloat(current) || 0) * (parseFloat(resolved) || 0); break;
            case '/=': final = (parseFloat(resolved) || 0) !== 0 ? (parseFloat(current) || 0) / parseFloat(resolved) : 0; break;
            case '%=': final = (parseFloat(resolved) || 0) !== 0 ? (parseFloat(current) || 0) % parseFloat(resolved) : 0; break;
            default:   final = resolved; break; // '=' 或舊資料沒有 op
        }
        this.variables[name] = final;
        this._emit(FlowEvent.VAR_UPDATE, { name, value: final });
        return final;
    }

    _execLog(block) {
        const msg = this._interpolate(block.params.message);
        this._emit(FlowEvent.LOG, { message: msg });
    }

    /**
     * var_replace — 變數內容取代
     * 將指定變數中的 find 字串取代為 replace 字串（全部取代）
     * find/replace 都支援 $var 變數引用
     */
    _execVarReplace(block) {
        const { varName, find, replace = '' } = block.params;
        const findStr = String(this._interpolate(find));
        const replStr = String(this._interpolate(replace));
        const current = String(this.variables[varName] ?? '');
        // 全部取代（不只第一個）
        const result = current.split(findStr).join(replStr);
        this.variables[varName] = result;
        this._emit(FlowEvent.VAR_UPDATE, { name: varName, value: result });
        this._emit(FlowEvent.LOG, { message: `🔤 ${varName}: "${current}" → "${result}" (剔除"${findStr}")` });
        return result;
    }

    /**
     * var_extract_number — 從變數中提取數字
     * 移除所有非數字字元（保留 0-9 . , -），再清理千分位逗號與多餘小數點
     */
    _execVarExtractNumber(block) {
        const { varName } = block.params;
        const current = String(this.variables[varName] ?? '');
        // ① 只保留數字、小數點、逗號、負號
        let cleaned = current.replace(/[^0-9.,\-]/g, '');
        // ② 移除千分位逗號
        cleaned = cleaned.replace(/,/g, '');
        // ③ 清掉頭尾孤立小數點
        cleaned = cleaned.replace(/^\.+|\.+$/g, '');
        // ④ 多個小數點：只認最後一個為小數點（其他是千分位誤判）
        const dotParts = cleaned.split('.');
        if (dotParts.length > 2) {
            const decimals = dotParts.pop();
            cleaned = dotParts.join('') + '.' + decimals;
        }
        const result = cleaned || '0';
        this.variables[varName] = result;
        this._emit(FlowEvent.VAR_UPDATE, { name: varName, value: result });
        this._emit(FlowEvent.LOG, { message: `🔢 ${varName}: "${current}" → "${result}"` });
        return result;
    }

    // ── 表格積木（委派至 actions/tableAction.js）──

    async _execForEachRow(block, depth) { return execForEachRow(block, depth, this); }
    _execAppendResult(block)            { return execAppendResult(block, this); }
    _execExportResults(block)           { return execExportResults(block, this); }
    _execReadRow(block)                 { return execReadRow(block, this); }
    _execClearResults(block)            { return execClearResults(block, this); }


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

// ═══════════════════════════════════════
// 預設 Flow 模板
// ═══════════════════════════════════════

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
