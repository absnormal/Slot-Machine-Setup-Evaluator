/**
 * statsCalculator.js — 從辨識完成的候選幀計算統計數據
 *
 * 從 useReportGenerator.js 抽出 (Phase A — SRP 重構)
 * 純函數，無 React 依賴，可用於 Worker / Node.js 環境
 */

/**
 * 從辨識完成的候選幀計算統計數據
 * @param {Array} candidates - 候選幀陣列
 * @returns {Object|null} 統計物件，無有效資料時回傳 null
 */
export function computeStats(candidates) {
    // 過濾出有基本辨識資料的幀（代表它是有效的截圖）
    const validCandidates = candidates.filter(c => c.ocrData || c.recognitionResult);
    if (validCandidates.length === 0) return null;

    const sorted = [...validCandidates].sort((a, b) => a.time - b.time);
    const hasSpinData = sorted.some(c => c.spinGroupId !== undefined);
    let spins;

    if (hasSpinData) {
        const groups = new Map();
        sorted.forEach(c => {
            const gid = c.spinGroupId !== undefined ? c.spinGroupId : `u_${c.id}`;
            if (!groups.has(gid)) groups.set(gid, []);
            groups.get(gid).push(c);
        });
        spins = Array.from(groups.values()).map(group => {
            // 如果有設定最佳幀就用最佳幀，否則代表這是空局或尚未跑到 WIN 的局，取群組第一張
            return group.find(c => c.isSpinBest) || group[0];
        });
    } else {
        spins = sorted;
    }

    if (spins.length === 0) return null;

    const parse = v => parseFloat(v) || 0;

    const wins = spins.map(c => {
        if (c.recognitionResult && c.recognitionResult.totalWin !== undefined) return parse(c.recognitionResult.totalWin);
        return parse(c.ocrData?.win);
    });

    const bets = spins.map(c => {
        if (c.recognitionResult && c.recognitionResult.bet !== undefined) return parse(c.recognitionResult.bet);
        return parse(c.ocrData?.bet); // 若未填寫 ROI 可能會是 0，防呆
    });

    const totalWin = wins.reduce((s, v) => s + v, 0);
    const totalBet = bets.reduce((s, v) => s + v, 0);
    const maxWin = Math.max(...wins);
    const hitCount = wins.filter(w => w > 0).length;

    // 最長連續無贏分
    let maxZeroStreak = 0, currentStreak = 0;
    for (const w of wins) {
        if (w === 0) { currentStreak++; maxZeroStreak = Math.max(maxZeroStreak, currentStreak); }
        else { currentStreak = 0; }
    }

    return {
        totalSpins: spins.length,
        totalWin: parseFloat(totalWin.toFixed(2)),
        totalBet: parseFloat(totalBet.toFixed(2)),
        rtp: totalBet > 0 ? parseFloat((totalWin / totalBet * 100).toFixed(2)) : 0,
        maxWin: parseFloat(maxWin.toFixed(2)),
        maxWinBetRatio: bets.length > 0 && maxWin > 0 && bets[wins.indexOf(maxWin)] > 0
            ? parseFloat((maxWin / bets[wins.indexOf(maxWin)]).toFixed(1))
            : 0,
        hitRate: parseFloat((hitCount / spins.length * 100).toFixed(1)),
        avgWinPerSpin: parseFloat((totalWin / spins.length).toFixed(2)),
        zeroWinStreak: maxZeroStreak,
        hitCount
    };
}
