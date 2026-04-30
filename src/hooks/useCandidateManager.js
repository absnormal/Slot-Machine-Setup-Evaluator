import { useState, useCallback } from 'react';

/**
 * useCandidateManager — 候選幀 CRUD 管理
 *
 * 從 useKeyframeExtractor 抽離。管理候選幀清單的基礎增刪改操作。
 *
 * 職責：
 *   - candidates state + setCandidates
 *   - removeCandidate / clearCandidates（刪）
 *   - updateCandidate（通用更新）
 *   - updateCandidateOcr（OCR 數值更新 + 人工標記）
 *
 * 注意：addManualCandidate 因依賴 OCR Worker，仍保留在 useKeyframeExtractor 中。
 */
export function useCandidateManager() {
    const [candidates, setCandidates] = useState([]);

    // 移除單一候選幀
    const removeCandidate = useCallback((id) => {
        setCandidates(prev => prev.filter(c => c.id !== id));
    }, []);

    // 清空所有候選幀
    const clearCandidates = useCallback(() => {
        setCandidates([]);
    }, []);

    // 更新候選幀狀態（辨識完成時呼叫）
    const updateCandidate = useCallback((id, updates) => {
        setCandidates(prev => prev.map(c =>
            c.id === id ? { ...c, ...updates } : c
        ));
    }, []);

    // 手動更新單張卡片的 OCR 數值（WIN/BET/BAL）並加上人工修改標記
    const updateCandidateOcr = useCallback((candidateId, field, value) => {
        setCandidates(prev => prev.map(c => {
            if (c.id === candidateId) {
                // 如果已經有 ocrData，就覆寫；沒有就建一個預設空的
                const oldOcr = c.ocrData || { win: '0', balance: '0', bet: '0', orderId: '' };
                const prevOverrides = c.manualOverrides || {};
                return {
                    ...c,
                    ocrData: {
                        ...oldOcr,
                        [field]: value
                    },
                    manualOverrides: {
                        ...prevOverrides,
                        [field]: true
                    },
                    status: 'pending' // 重置狀態讓它重新算分
                };
            }
            return c;
        }));
    }, []);

    return {
        candidates, setCandidates,
        removeCandidate, clearCandidates,
        updateCandidate, updateCandidateOcr,
    };
}
