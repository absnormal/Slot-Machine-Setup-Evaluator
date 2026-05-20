/**
 * recordBlocks.js — 記錄與辨識類積木
 *
 * 從 FlowRunner 抽出的純函數，接收 runner 實例作為第一參數。
 * 包含：record_spin, recognize_grid
 */
import { captureFrame } from '../actions/captureAction';
import { FlowEvent } from '../flowRunner';

export async function execRecord(runner, block) {
    // 勾選的欄位（預設全選）
    const fields = block.params?.fields || ['WIN', 'BAL', 'BET', 'ORDER_ID'];
    const has = (name) => fields.includes(name);

    // 從變數空間搜尋 OCR 資料（支援標準名稱和自訂 ROI 名稱）
    const findVar = (...keys) => {
        for (const k of keys) {
            if (runner.variables[k] !== undefined && runner.variables[k] !== '') return runner.variables[k];
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
        for (const [k, v] of Object.entries(runner.variables)) {
            if (k.startsWith('$') && v && v !== '0' && !['$balance', '$bet', '$orderId', '$BALANCE', '$BAL', '$BET', '$ORDER_ID'].includes(k)) {
                // 非標準名稱且有值 → 可能是自訂 win ROI
                ocrData.win = v;
                break;
            }
        }
    }

    const spinIndex = runner._spinCount++;

    if (runner._setCandidates) {
        if (runner._lastCaptureId) {
            // 更新 capture_frame 建立的候選幀（補上 OCR + 完成狀態）
            const targetId = runner._lastCaptureId;
            console.log('[record_spin] 準備更新候選幀', targetId, 'ocrData=', JSON.stringify(ocrData));
            runner._setCandidates(prev => {
                const found = prev.find(c => c.id === targetId);
                console.log('[record_spin] prev 中找到目標?', !!found, 'prev.length=', prev.length);
                if (found) console.log('[record_spin] 更新前 ocrData=', JSON.stringify(found.ocrData));
                return prev.map(c =>
                    c.id === targetId
                        ? { ...c, ocrData, status: c.status === 'recognized' ? 'recognized' : 'completed', winPollStatus: 'completed' }
                        : c
                );
            });
            runner._sendPythonLog(`📸 更新候選幀 ${runner._lastCaptureId}`);
            runner._lastCaptureId = null;
            runner._lastCapturedCanvas = null;
        } else if (runner._videoEl) {
            // 沒有先截圖 → 自行截圖建立候選幀
            const frame = captureFrame(runner._videoEl);
            let thumbUrl = frame.dataUrl;
            if (runner._reelROI) {
                try {
                    const thumb = captureFrame(runner._videoEl, runner._reelROI);
                    thumbUrl = thumb.dataUrl;
                } catch { /* fallback */ }
            }

            const candidate = {
                id: `flow_${Date.now()}_${spinIndex}`,
                time: runner._videoEl?.currentTime || 0,
                canvas: frame.canvas,
                thumbUrl,
                status: 'completed',
                winPollStatus: 'completed',
                ocrData,
            };
            runner._setCandidates(prev => [...prev, candidate]);
        }
    }

    const recordMsg = `📝 #${spinIndex + 1} WIN=${ocrData.win} BAL=${ocrData.balance} BET=${ocrData.bet} ID=${ocrData.orderId}`;
    runner._emit(FlowEvent.LOG, { message: recordMsg });
    runner._sendPythonLog(recordMsg);

    runner._emit(FlowEvent.SPIN_RECORDED, {
        spinIndex,
        ocrData,
    });

    return { success: true, spinIndex };
}

export async function execRecognizeGrid(runner) {
    if (!runner._recognizeLocal) {
        throw new Error('盤面辨識未設定（recognizeLocal callback 不存在）');
    }
    if (!runner._lastCaptureId) {
        throw new Error('沒有截圖可辨識（請先執行「截圖」積木）');
    }
    runner._emit(FlowEvent.LOG, { message: '🔍 盤面辨識中...' });
    await runner._recognizeLocal(runner._lastCaptureId);
    runner._sendPythonLog(`🔍 盤面辨識完成 ${runner._lastCaptureId}`);
}
