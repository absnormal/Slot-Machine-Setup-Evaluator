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
     * 匯出 CSV 檔案（需要 AI 辨識後的盤面資料）
     */
    const exportCSV = useCallback((candidates, gameName = 'slot_analysis') => {
        const recognized = candidates.filter(c => c.status === 'recognized' && c.recognitionResult);
        if (recognized.length === 0) return;

        const BOM = '\uFEFF'; // UTF-8 BOM for Excel
        const headers = ['序號', '時間(s)', '盤面(JSON)', '單號', '餘額', '押注', '贏分(AI計算)', '贏分(OCR)', '備註'];

        const rows = recognized.map((c, i) => {
            const r = c.recognitionResult || {};
            const ocr = c.ocrData || {};
            const gridStr = JSON.stringify(r.grid || []).replace(/"/g, '""');
            return [
                i + 1,
                c.time.toFixed(2),
                `"${gridStr}"`,
                ocr.orderId || '',
                ocr.balance || '',
                ocr.bet || '',
                r.totalWin || 0,
                ocr.win || '',
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

    /**
     * 匯出 OCR-only CSV（不需要 AI 辨識盤面）
     * 適用於即時偵測後，快速匯出 OCR 抓到的財務數據 + 連續性驗算
     */
    const exportOcrCSV = useCallback((candidates, gameName = 'slot_analysis') => {
        // 取有 ocrData 的候選幀（不需要 recognitionResult）
        const withOcr = candidates.filter(c => c.ocrData);
        if (withOcr.length === 0) return;

        // 按 spinGroupId 分組 → 取最佳幀 → 做連續性驗算
        const sorted = [...withOcr].sort((a, b) => a.time - b.time);

        // 如果有分局資訊，整理出每局的最佳幀；沒有則每張都當一局
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
                return group.find(c => c.isSpinBest) || group[0];
            }).sort((a, b) => a.time - b.time);
        } else {
            spins = sorted;
        }

        // 連續性驗算
        const parse = v => parseFloat(v) || 0;
        let currentBase = null;
        const rows = spins.map((c, i) => {
            const ocr = c.ocrData || {};
            const bal = parse(ocr.balance);
            const win = parse(ocr.win);
            const bet = parse(ocr.bet);

            let continuity = '';
            if (bet > 0) {
                if (currentBase === null) {
                    continuity = '首局';
                    currentBase = bal + win;
                } else {
                    const eps = 0.5;
                    if (Math.abs(bal + bet - currentBase) < eps) {
                        continuity = '✓ 連續';
                        currentBase = bal + win;
                    } else if (Math.abs(bal + bet - win - currentBase) < eps) {
                        continuity = '✓ 連續(含贏)';
                        currentBase = bal;
                    } else {
                        const diff = (bal + bet) - currentBase;
                        continuity = `⚠ 斷層(${diff > 0 ? '+' : ''}${diff.toFixed(2)})`;
                        currentBase = bal + win;
                    }
                }
            } else {
                continuity = '(無押注)';
            }

            return [
                i + 1,
                c.time.toFixed(2),
                ocr.orderId || '',
                ocr.balance || '',
                ocr.bet || '',
                ocr.win || '0',
                continuity
            ].join(',');
        });

        // 統計摘要
        const totalBet = spins.reduce((s, c) => s + parse(c.ocrData?.bet), 0);
        const totalWin = spins.reduce((s, c) => s + parse(c.ocrData?.win), 0);
        const rtp = totalBet > 0 ? (totalWin / totalBet * 100).toFixed(2) : '0';
        const hitCount = spins.filter(c => parse(c.ocrData?.win) > 0).length;

        const BOM = '\uFEFF';
        const headers = ['序號', '時間(s)', '單號', '餘額', '押注', '贏分(OCR)', '連續性'];
        const summary = [
            '',
            `總局數,${spins.length}`,
            `總押注,${totalBet.toFixed(2)}`,
            `總贏分,${totalWin.toFixed(2)}`,
            `RTP,${rtp}%`,
            `命中率,${(hitCount / spins.length * 100).toFixed(1)}%`,
            `最大贏分,${Math.max(...spins.map(c => parse(c.ocrData?.win))).toFixed(2)}`
        ];

        const csv = BOM + [headers.join(','), ...rows, ...summary].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${gameName}_OCR_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    /**
     * 匯出 HTML 報告（含截圖 + OCR 數據 + 連續性驗算）
     */
    const exportOcrHTML = useCallback((candidates, gameName = 'slot_analysis') => {
        const withOcr = candidates.filter(c => c.ocrData);
        if (withOcr.length === 0) return;

        const sorted = [...withOcr].sort((a, b) => a.time - b.time);
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
                return group.find(c => c.isSpinBest) || group[0];
            }).sort((a, b) => a.time - b.time);
        } else {
            spins = sorted;
        }

        const parse = v => parseFloat(v) || 0;
        let currentBase = null;
        const totalBet = spins.reduce((s, c) => s + parse(c.ocrData?.bet), 0);
        const totalWin = spins.reduce((s, c) => s + parse(c.ocrData?.win), 0);
        const rtp = totalBet > 0 ? (totalWin / totalBet * 100).toFixed(2) : '0';
        const hitCount = spins.filter(c => parse(c.ocrData?.win) > 0).length;
        const maxWin = Math.max(...spins.map(c => parse(c.ocrData?.win)));
        const dateStr = new Date().toLocaleString('zh-TW');

        const tableRows = spins.map((c, i) => {
            const ocr = c.ocrData || {};
            const bal = parse(ocr.balance);
            const win = parse(ocr.win);
            const bet = parse(ocr.bet);

            let continuity = '', contClass = '';
            if (bet > 0) {
                if (currentBase === null) {
                    continuity = '首局'; contClass = 'first';
                    currentBase = bal + win;
                } else {
                    const eps = 0.5;
                    if (Math.abs(bal + bet - currentBase) < eps) {
                        continuity = '✓ 連續'; contClass = 'ok';
                        currentBase = bal + win;
                    } else if (Math.abs(bal + bet - win - currentBase) < eps) {
                        continuity = '✓ 連續(含贏)'; contClass = 'ok';
                        currentBase = bal;
                    } else {
                        const diff = (bal + bet) - currentBase;
                        continuity = `⚠ 斷層(${diff > 0 ? '+' : ''}${diff.toFixed(2)})`;
                        contClass = 'break';
                        currentBase = bal + win;
                    }
                }
            } else {
                continuity = '(無押注)'; contClass = 'na';
            }

            const thumbSrc = c.thumbUrl || '';
            const winClass = win > 0 ? 'win-positive' : '';

            return `<tr>
                <td class="idx">${i + 1}</td>
                <td class="thumb"><img src="${thumbSrc}" alt="spin-${i + 1}" /></td>
                <td class="time">${c.time.toFixed(2)}s</td>
                <td>${ocr.orderId || '-'}</td>
                <td class="num">${ocr.balance || '-'}</td>
                <td class="num">${ocr.bet || '-'}</td>
                <td class="num ${winClass}">${ocr.win || '0'}</td>
                <td class="cont ${contClass}">${continuity}</td>
            </tr>`;
        }).join('\n');

        const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${gameName} - OCR 分析報告</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Segoe UI', 'Microsoft JhengHei', sans-serif; background:#f1f5f9; color:#334155; padding:24px; }
.report { max-width:1100px; margin:0 auto; background:#fff; border-radius:16px; box-shadow:0 4px 24px rgba(0,0,0,.08); overflow:hidden; }
.header { background:linear-gradient(135deg,#1e293b,#334155); color:#fff; padding:28px 32px; }
.header h1 { font-size:22px; font-weight:700; margin-bottom:4px; }
.header .sub { font-size:13px; color:#94a3b8; }
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; padding:20px 32px; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
.stat { text-align:center; }
.stat .label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:.5px; }
.stat .value { font-size:20px; font-weight:800; color:#1e293b; margin-top:2px; }
.stat .value.rtp { color:${parseFloat(rtp) >= 100 ? '#059669' : '#dc2626'}; }
table { width:100%; border-collapse:collapse; font-size:13px; }
thead { background:#f8fafc; position:sticky; top:0; }
th { padding:10px 12px; text-align:left; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.5px; border-bottom:2px solid #e2e8f0; }
td { padding:8px 12px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
tr:hover { background:#f8fafc; }
.idx { color:#94a3b8; font-weight:600; width:40px; text-align:center; }
.thumb { width:140px; padding:4px 8px; }
.thumb img { width:130px; height:auto; border-radius:6px; border:1px solid #e2e8f0; display:block; }
.time { font-family:monospace; color:#64748b; font-size:12px; }
.num { font-family:monospace; font-weight:600; text-align:right; }
.win-positive { color:#059669; font-weight:800; }
.cont { font-size:12px; font-weight:600; white-space:nowrap; }
.cont.first { color:#6366f1; }
.cont.ok { color:#059669; }
.cont.break { color:#dc2626; background:#fef2f2; border-radius:4px; padding:2px 6px; }
.cont.na { color:#94a3b8; }
.footer { padding:16px 32px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:center; font-size:11px; color:#94a3b8; }
@media print { body { background:#fff; padding:0; } .report { box-shadow:none; } }
</style>
</head>
<body>
<div class="report">
    <div class="header">
        <h1>🎰 ${gameName}</h1>
        <div class="sub">OCR 分析報告 · ${dateStr} · 共 ${spins.length} 局</div>
    </div>
    <div class="stats">
        <div class="stat"><div class="label">總局數</div><div class="value">${spins.length}</div></div>
        <div class="stat"><div class="label">總押注</div><div class="value">${totalBet.toLocaleString()}</div></div>
        <div class="stat"><div class="label">總贏分</div><div class="value">${totalWin.toLocaleString()}</div></div>
        <div class="stat"><div class="label">RTP</div><div class="value rtp">${rtp}%</div></div>
        <div class="stat"><div class="label">命中率</div><div class="value">${(hitCount / spins.length * 100).toFixed(1)}%</div></div>
        <div class="stat"><div class="label">最大贏分</div><div class="value">${maxWin.toLocaleString()}</div></div>
    </div>
    <table>
        <thead>
            <tr><th>#</th><th>截圖</th><th>時間</th><th>單號</th><th>餘額</th><th>押注</th><th>贏分</th><th>連續性</th></tr>
        </thead>
        <tbody>
            ${tableRows}
        </tbody>
    </table>
    <div class="footer">由老虎機線獎辨識工具自動生成</div>
</div>
</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${gameName}_OCR_${new Date().toISOString().slice(0, 10)}.html`;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    return { computeStats, exportCSV, exportOcrCSV, exportOcrHTML };
}
