import { useState, useCallback, useMemo } from 'react';

/**
 * useSpinGroupAnalysis — 分局與連續性計算 hook
 * 從候選幀中計算分局群組、數學驗證、斷層偵測，以及導航功能
 */
const useSpinGroupAnalysis = (candidates) => {
    // ── 分局與連續性計算 ──
    const groupsWithMath = useMemo(() => {
        const hasSpinData = candidates.some(c => c.spinGroupId !== undefined);
        if (!hasSpinData) return null;

        const sortedCandidates = [...candidates].sort((a, b) => a.time - b.time);

        const blocksByGid = new Map();
        
        sortedCandidates.forEach((kf, idx) => {
            const gid = kf.spinGroupId !== undefined ? kf.spinGroupId : `ungrouped_${kf.id}`;
            if (!blocksByGid.has(gid)) {
                blocksByGid.set(gid, []);
            }
            blocksByGid.get(gid).push({ kf, idx });
        });

        const blocksArray = Array.from(blocksByGid.entries()).map(([gid, group]) => ({
            gid,
            group
        }));

        // 依據每個群組的【第一張卡片出現時間】進行排序，讓 UI 邏輯與時間線保持自然
        blocksArray.sort((a, b) => a.group[0].kf.time - b.group[0].kf.time);

        let currentBase = null;
        return blocksArray.map((block) => {
            const { gid, group } = block;
            const bestFrame = group.find(g => g.kf.isSpinBest)?.kf || group[0].kf;
            const parse = v => parseFloat(v) || 0;
            const bal = parse(bestFrame.ocrData?.balance);
            const win = parse(bestFrame.ocrData?.win);
            const bet = parse(bestFrame.ocrData?.bet);
            
            let mathValid = true;
            let mathState = 0; 
            let mathDiff = 0;
            let expectedBase = currentBase;

            const hasData = bestFrame.ocrData && typeof bestFrame.ocrData.balance !== 'undefined' && typeof bestFrame.ocrData.bet !== 'undefined';

            // 由底層 smartDedup 引擎的 isFGSequence 標記驅動，不再用 UI 層啟發式猜測
            const isFGSequence = group.some(c => c.kf?.isFGSequence);

            if (hasData && bet > 0) { 
                if (currentBase === null) {
                    mathState = win > 0 ? 2 : 1;
                    currentBase = bal + win; 
                } else if (isFGSequence) {
                    // FG 模式：不檢查 BAL+BET=上局結餘（因為不扣 BET），直接視為連續
                    mathState = 4; // FG 模式
                    mathValid = true;
                    currentBase = bal + win; // 追蹤 FG 結束後的結餘
                } else {
                    const eps = 0.5;
                    if (Math.abs(bal + bet - currentBase) < eps) {
                        mathState = win > 0 ? 2 : 1;
                        currentBase = bal + win;
                    } else if (Math.abs(bal + bet - win - currentBase) < eps) {
                        mathState = 3;
                        currentBase = bal;
                    } else {
                        mathValid = false;
                        mathDiff = (bal + bet) - currentBase;
                        currentBase = bal + win; 
                    }
                }
            }

            return { gid, group, mathValid, mathState, mathDiff, expectedBase, nextBase: currentBase, isFGSequence };
        });
    }, [candidates]);

    const brokenGroupIds = useMemo(() => {
        if (!groupsWithMath) return [];
        return groupsWithMath.filter(g => !g.mathValid).map(g => parseInt(g.gid));
    }, [groupsWithMath]);

    const diagnosticStats = useMemo(() => {
        if (!groupsWithMath) return null;
        let total = groupsWithMath.length;
        let unbroken = groupsWithMath.filter(g => g.mathValid).length;
        let broken = groupsWithMath.filter(g => !g.mathValid).length;
        return { total, unbroken, broken };
    }, [groupsWithMath]);

    const wrongWinGroupIds = useMemo(() => {
        if (!groupsWithMath) return [];
        return groupsWithMath.filter(g => {
            return g.group.some(c => {
                const kf = c.kf;
                const hasResult = kf.status === 'recognized' && kf.recognitionResult;
                if (!hasResult) return false;
                const ocrWin = kf.ocrData ? Math.floor(parseFloat(kf.ocrData.win) || 0) : 0;
                const aiWin = Math.floor(parseFloat(kf.recognitionResult.totalWin) || 0);
                return ocrWin !== aiWin;
            });
        }).map(g => g.gid);
    }, [groupsWithMath]);

    const nonZeroWinGroupIds = useMemo(() => {
        if (!groupsWithMath) return [];
        return groupsWithMath.filter(g => {
            return g.group.some(c => {
                const kf = c.kf;
                const ocrWin = kf.ocrData ? Math.floor(parseFloat(kf.ocrData.win) || 0) : 0;
                const aiWin = (kf.status === 'recognized' && kf.recognitionResult) ? Math.floor(parseFloat(kf.recognitionResult.totalWin) || 0) : 0;
                return Math.max(ocrWin, aiWin) > 0;
            });
        }).map(g => g.gid);
    }, [groupsWithMath]);

    // ── 導航狀態與函式 ──
    const [lastBreakId, setLastBreakId] = useState(null);
    const currentBreakIndex = useMemo(() => {
        if (!lastBreakId || brokenGroupIds.length === 0) return 0;
        const idx = brokenGroupIds.indexOf(lastBreakId);
        return idx >= 0 ? idx : 0;
    }, [lastBreakId, brokenGroupIds]);

    /** 通用：找出清單中「目前可視區域之後」的下一個項目 index */
    const findNextVisibleIndex = useCallback((ids, lastId, idPrefix = 'spin-group-') => {
        if (ids.length === 0) return -1;
        // 如果有上次記錄，直接循環到下一個
        if (lastId !== null) {
            const lastIdx = ids.indexOf(lastId);
            if (lastIdx >= 0) return (lastIdx + 1) % ids.length;
        }
        // 首次或 lastId 無效：找出第一個在可視區域下方的項目
        const listContainer = document.querySelector('.custom-scrollbar');
        if (listContainer) {
            const containerRect = listContainer.getBoundingClientRect();
            const viewportMid = containerRect.top + containerRect.height / 2;
            for (let i = 0; i < ids.length; i++) {
                const el = document.getElementById(`${idPrefix}${ids[i]}`)
                    || document.getElementById(`kf-card-${String(ids[i]).replace('ungrouped_', '')}`);
                if (el) {
                    const elRect = el.getBoundingClientRect();
                    if (elRect.top >= viewportMid) return i;
                }
            }
        }
        return 0; // fallback：從頭開始
    }, []);

    const highlightAndScroll = useCallback((el, ringColor) => {
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-4', ringColor, 'ring-offset-2', 'transition-all', 'duration-500');
        setTimeout(() => el.classList.remove('ring-4', ringColor, 'ring-offset-2'), 1500);
    }, []);

    const scrollToNextBreak = useCallback(() => {
        if (brokenGroupIds.length === 0) return;
        const nextIdx = findNextVisibleIndex(brokenGroupIds, lastBreakId);
        const gid = brokenGroupIds[nextIdx];
        highlightAndScroll(document.getElementById(`spin-group-${gid}`), 'ring-rose-400');
        setLastBreakId(gid);
    }, [brokenGroupIds, lastBreakId, findNextVisibleIndex, highlightAndScroll]);

    const [lastWrongWinId, setLastWrongWinId] = useState(null);
    const currentWrongWinIndex = useMemo(() => {
        if (!lastWrongWinId || wrongWinGroupIds.length === 0) return 0;
        const idx = wrongWinGroupIds.indexOf(lastWrongWinId);
        return idx >= 0 ? idx : 0;
    }, [lastWrongWinId, wrongWinGroupIds]);

    const scrollToNextWrongWin = useCallback(() => {
        if (wrongWinGroupIds.length === 0) return;
        const nextIdx = findNextVisibleIndex(wrongWinGroupIds, lastWrongWinId);
        const gid = wrongWinGroupIds[nextIdx];
        const el = document.getElementById(`spin-group-${gid}`)
            || document.getElementById(`kf-card-${String(gid).replace('ungrouped_', '')}`);
        highlightAndScroll(el, 'ring-amber-400');
        setLastWrongWinId(gid);
    }, [wrongWinGroupIds, lastWrongWinId, findNextVisibleIndex, highlightAndScroll]);

    const [lastNonZeroWinId, setLastNonZeroWinId] = useState(null);
    const currentNonZeroWinIndex = useMemo(() => {
        if (!lastNonZeroWinId || nonZeroWinGroupIds.length === 0) return 0;
        const idx = nonZeroWinGroupIds.indexOf(lastNonZeroWinId);
        return idx >= 0 ? idx : 0;
    }, [lastNonZeroWinId, nonZeroWinGroupIds]);

    const scrollToNextNonZeroWin = useCallback(() => {
        if (nonZeroWinGroupIds.length === 0) return;
        const nextIdx = findNextVisibleIndex(nonZeroWinGroupIds, lastNonZeroWinId);
        const gid = nonZeroWinGroupIds[nextIdx];
        const el = document.getElementById(`spin-group-${gid}`)
            || document.getElementById(`kf-card-${String(gid).replace('ungrouped_', '')}`);
        highlightAndScroll(el, 'ring-emerald-400');
        setLastNonZeroWinId(gid);
    }, [nonZeroWinGroupIds, lastNonZeroWinId, findNextVisibleIndex, highlightAndScroll]);

    return {
        groupsWithMath,
        brokenGroupIds,
        diagnosticStats,
        wrongWinGroupIds,
        nonZeroWinGroupIds,
        scrollToNextBreak,
        scrollToNextWrongWin,
        scrollToNextNonZeroWin,
        currentBreakIndex,
        currentWrongWinIndex,
        currentNonZeroWinIndex,
    };
};

export default useSpinGroupAnalysis;
