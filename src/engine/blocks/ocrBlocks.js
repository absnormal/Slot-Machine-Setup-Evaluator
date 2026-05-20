/**
 * ocrBlocks.js — OCR 與截圖類積木
 *
 * 從 FlowRunner 抽出的純函數，接收 runner 實例作為第一參數。
 * 包含：ocr_batch, ocr_read, capture_frame
 */
import { ocrBatch, ocrRead } from '../actions/ocrAction';
import { cropAndOCR } from '../ocrPipeline';
import { resolveROI, getDecimalPlaces } from '../roiResolver';
import { captureFrame } from '../actions/captureAction';
import { FlowEvent } from '../flowRunner';

export async function execOcrBatch(runner, block) {
    const { rois } = block.params;
    let results;

    // 有截圖 + 前端 ocrWorker → 用前端 DBNet 全套（準確）
    if (runner._lastCapturedCanvas && runner._ocrWorker) {
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
            results[key] = await cropAndOCR(runner._lastCapturedCanvas, roi, runner._ocrWorker, dp, upper);
        }
        const logMsg = `📊 前端 OCR: ${JSON.stringify(results)}`;
        runner._emit(FlowEvent.LOG, { message: logMsg });
        runner._sendPythonLog(logMsg);
    } else {
        // 沒截圖 → fallback Python rec-only
        results = await ocrBatch(runner._ws, rois);
        runner._sendPythonLog(`📊 Python OCR: ${JSON.stringify(results)}`);
    }

    // 自動將結果寫入變數空間
    for (const [key, rawValue] of Object.entries(results)) {
        const value = rawValue;
        const varName = `$${key}`;
        // 空值不覆蓋現有變數（避免子流程清空主流程的值）
        if (value === '' || value === null || value === undefined) {
            if (runner.variables[varName] !== undefined) {
                console.log(`[ocr_batch] 跳過空值覆蓋: ${varName} 保留="${runner.variables[varName]}"`);
                continue;
            }
        }
        runner.variables[varName] = value;
        runner._emit(FlowEvent.VAR_UPDATE, { name: varName, value });
    }
    console.log('[ocr_batch] variables 快照:', JSON.stringify(runner.variables));

    return results;
}

export async function execOcrRead(runner, block) {
    const { roi, varName, mode = 'number', live = false } = block.params;
    const vName = varName || `$${roi.toLowerCase()}`;
    let value;

    const roiPct = resolveROI(roi);
    if (!roiPct) throw new Error(`[ocr_read] 無法解析 ROI: "${roi}"`);

    // live 模式：直接從 video 即時截取（不存截圖，輕量）
    if (live && runner._videoEl && runner._ocrWorker) {
        const frame = captureFrame(runner._videoEl);
        const dp = mode === 'text' ? 0 : getDecimalPlaces(roi);
        value = await cropAndOCR(frame.canvas, roiPct, runner._ocrWorker, dp, roi.toUpperCase(), mode);
        runner._emit(FlowEvent.LOG, { message: `📖🔴 ${roi}→${vName}: "${value}" (即時${mode === 'text' ? '文字' : '數字'})` });
    }
    // 有截圖 + 前端 ocrWorker → 用前端 DBNet（優先）
    else if (runner._lastCapturedCanvas && runner._ocrWorker) {
        const dp = mode === 'text' ? 0 : getDecimalPlaces(roi);
        value = await cropAndOCR(runner._lastCapturedCanvas, roiPct, runner._ocrWorker, dp, roi.toUpperCase(), mode);
        runner._emit(FlowEvent.LOG, { message: `📖 ${roi}→${vName}: "${value}" (${mode === 'text' ? '文字' : '數字'})` });
    } else {
        // fallback → Python OCR
        value = await ocrRead(runner._ws, roi, mode);
    }

    runner.variables[vName] = value;
    runner._emit(FlowEvent.VAR_UPDATE, { name: vName, value });
    return value;
}

export async function execCapture(runner, block) {
    const roiPct = block.params?.roi ? resolveROI(block.params.roi) : null;
    const frame = captureFrame(runner._videoEl, roiPct);

    // 推送至 P4 候選幀區域
    if (runner._setCandidates) {
        let thumbUrl = frame.dataUrl;
        if (!roiPct && runner._reelROI) {
            try {
                const thumb = captureFrame(runner._videoEl, runner._reelROI);
                thumbUrl = thumb.dataUrl;
            } catch { /* fallback */ }
        }

        const candidateId = `cap_${Date.now()}`;
        const candidate = {
            id: candidateId,
            time: runner._videoEl?.currentTime || 0,
            canvas: frame.canvas,
            thumbUrl,
            status: 'pending',
            ocrData: { win: '', balance: '', bet: '' },
        };
        runner._setCandidates(prev => [...prev, candidate]);
        runner._lastCaptureId = candidateId; // 供 record_spin 更新用
        runner._lastCapturedCanvas = frame.canvas; // 供 ocr_batch 使用截圖做 OCR
        runner._emit(FlowEvent.LOG, { message: '📸 截圖已加入候選幀' });
    }

    return frame;
}
