/**
 * recordAction.js — 記錄結果原子動作
 *
 * 將一局的 OCR 結果寫入候選幀資料，
 * 供 P4 結算引擎後續處理。
 */

/**
 * 記錄一局自動遊玩結果
 *
 * @param {Object} params
 * @param {Object} params.ocrData - OCR 結果 { win, balance, bet, orderId, ... }
 * @param {Object} params.candidate - 當前候選幀物件
 * @param {Function} params.getCandidates - 取得候選幀列表的函式
 * @param {Function} [params.onSmartDedup] - 重新標記局數的回呼
 * @returns {{ success: boolean, spinIndex: number }}
 */
export function recordSpin({ ocrData, candidate, getCandidates, onSmartDedup }) {
    if (!candidate) {
        console.warn('[recordAction] 沒有候選幀可記錄');
        return { success: false, spinIndex: -1 };
    }

    // 寫入 OCR 資料
    if (ocrData) {
        candidate.ocrData = {
            ...candidate.ocrData,
            win: ocrData.win ?? ocrData.WIN ?? '0',
            balance: ocrData.balance ?? ocrData.BAL ?? '',
            bet: ocrData.bet ?? ocrData.BET ?? '',
            orderId: ocrData.orderId ?? ocrData.ORDER_ID ?? '',
        };
        candidate.winPollStatus = 'completed';
    }

    // 重新標記局數
    if (typeof onSmartDedup === 'function') {
        onSmartDedup();
    }

    const candidates = getCandidates?.() || [];
    const idx = candidates.findIndex(c => c.id === candidate.id);

    return {
        success: true,
        spinIndex: idx,
    };
}
