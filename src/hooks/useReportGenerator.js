import { useCallback } from 'react';

/**
 * useReportGenerator — CSV 匯出 + 統計儀表板
 */
export function useReportGenerator() {

    /**
     * 從辨識完成的候選幀計算統計數據
     */
    const computeStats = useCallback((candidates) => {
        const recognized = candidates.filter(c => c.status === 'recognized' && c.recognitionResult);
        if (recognized.length === 0) return null;

        const wins = recognized.map(c => c.recognitionResult.totalWin || 0);
        const bets = recognized.map(c => parseFloat(c.recognitionResult.bet) || 0);

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
            totalSpins: recognized.length,
            totalWin: parseFloat(totalWin.toFixed(2)),
            totalBet: parseFloat(totalBet.toFixed(2)),
            rtp: totalBet > 0 ? parseFloat((totalWin / totalBet * 100).toFixed(2)) : 0,
            maxWin: parseFloat(maxWin.toFixed(2)),
            maxWinBetRatio: bets.length > 0 && bets[wins.indexOf(maxWin)] > 0
                ? parseFloat((maxWin / bets[wins.indexOf(maxWin)]).toFixed(1))
                : 0,
            hitRate: parseFloat((hitCount / recognized.length * 100).toFixed(1)),
            avgWinPerSpin: parseFloat((totalWin / recognized.length).toFixed(2)),
            zeroWinStreak: maxZeroStreak,
            hitCount
        };
    }, []);

    /**
     * 匯出 CSV 檔案
     */
    const exportCSV = useCallback((candidates, gameName = 'slot_analysis') => {
        const recognized = candidates.filter(c => c.status === 'recognized' && c.recognitionResult);
        if (recognized.length === 0) return;

        const BOM = '\uFEFF'; // UTF-8 BOM for Excel
        const headers = ['序號', '時間(s)', '盤面(JSON)', '贏分', 'BET', '餘額', 'WIN(OCR)', '備註'];

        const rows = recognized.map((c, i) => {
            const r = c.recognitionResult;
            return [
                i + 1,
                c.time.toFixed(2),
                `"${JSON.stringify(r.grid).replace(/"/g, '""')}"`,
                r.totalWin || 0,
                r.bet || '',
                r.balance || '',
                r.win || '',
                c.error ? `"${c.error}"` : ''
            ].join(',');
        });

        const csv = BOM + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${gameName}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    return { computeStats, exportCSV };
}
