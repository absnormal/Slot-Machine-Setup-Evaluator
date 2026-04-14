import { useCallback } from 'react';

/**
 * useReportGenerator — 唯一匯出 HTML 報告 + 統計儀表板
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
     * 匯出完整 HTML 報告（包含 OCR 數據與 AI 辨識盤面/贏分）
     */
    const exportHTMLReport = useCallback(async (candidates, gameName = 'slot_analysis', saveDirHandle = null, template = null) => {
        // 過濾出含有 OCR 資料 或 已經被認定的重點影格
        const validCandidates = candidates.filter(c => c.ocrData || c.recognitionResult || c.isSpinBest);
        if (validCandidates.length === 0) return;

        // 建立符號統計字典 symbolStats (key: 分類符號)
        const symbolStats = new Map();
        if (template && template.paytable) {
            Object.entries(template.paytable).forEach(([sym, payouts]) => {
                const countsObj = {};
                payouts.forEach((mult, idx) => {
                    const count = idx + 1;
                    if (mult > 0) {
                        countsObj[count] = { multiplier: mult, hitBets: new Set() };
                    }
                });
                if (Object.keys(countsObj).length > 0) {
                    symbolStats.set(sym, { symbol: sym, counts: countsObj });
                }
            });
        }

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
                // 如果有設定最佳幀就用最佳幀，否則取最後一個（或是取第一張）
                return group.find(c => c.isSpinBest) || group[0];
            }).sort((a, b) => a.time - b.time);
        } else {
            spins = sorted;
        }

        const parse = v => parseFloat(v) || 0;
        let currentBase = null;
        
        // 為了計算統計，主要依照 OCR 或 AI 兩者並行來算
        // 若 AI 辨識成功，以 AI 為準；否則用 OCR 兜底
        let totalBet = 0;
        let totalWin = 0;
        let aiHitCount = 0;
        let maxWin = 0;

        const tableRows = spins.map((c, i) => {
            const ocr = c.ocrData || {};
            const bal = parse(ocr.balance);
            const ocrWin = parse(ocr.win);
            const bet = parse(ocr.bet);

            const aiData = c.recognitionResult;
            const aiWin = aiData ? parse(aiData.totalWin) : null;
            const finalWin = aiData ? aiWin : ocrWin;
            const finalBet = bet;

            totalBet += finalBet;
            totalWin += finalWin;
            if (finalWin > 0) aiHitCount++;
            if (finalWin > maxWin) maxWin = finalWin;

            let continuity = '', contClass = '';
            if (bet > 0) {
                if (currentBase === null) {
                    continuity = '首局'; contClass = 'first';
                    currentBase = bal + ocrWin;
                } else {
                    const eps = 0.5;
                    if (Math.abs(bal + bet - currentBase) < eps) {
                        continuity = '✓ 連續'; contClass = 'ok';
                        currentBase = bal + ocrWin;
                    } else if (Math.abs(bal + bet - ocrWin - currentBase) < eps) {
                        continuity = '✓ 連續(含贏)'; contClass = 'ok';
                        currentBase = bal;
                    } else {
                        const diff = (bal + bet) - currentBase;
                        continuity = `⚠ 斷層(${diff > 0 ? '+' : ''}${diff.toFixed(2)})`;
                        contClass = 'break';
                        currentBase = bal + ocrWin;
                    }
                }
            } else {
                continuity = '(無押注)'; contClass = 'na';
            }

            if (aiWin !== null) {
                if (aiWin === ocrWin) {
                    continuity += `<br/><span style="color:#059669; font-size:10px;">✓ AI吻合</span>`;
                } else {
                    continuity += `<br/><span style="color:#dc2626; font-size:10px; font-weight:bold;">⚠ AI異常</span>`;
                    contClass = 'break';
                }
            }

            if (c.isFGSequence) {
                continuity += `<br/><span style="color:#e11d48; font-size:10px; font-weight:bold;">🔥 FG</span>`;
            }

            const fullSrc = c.canvas ? c.canvas.toDataURL('image/jpeg', 0.92) : (c.thumbUrl || '');
            const displaySrc = c.thumbUrl || fullSrc;
            const winClass = ocrWin > 0 ? 'win-positive' : '';
            const aiWinClass = aiWin > 0 ? 'win-positive' : '';

            const winPollFullSrc = c.winPollCanvas ? c.winPollCanvas.toDataURL('image/jpeg', 0.92) : '';
            const winPollDisplaySrc = c.winPollThumbUrl || winPollFullSrc;

            // 格式化 AI 盤面
            let gridHtml = '';
            if (aiData && aiData.grid) {
                gridHtml = `<div class="grid-table">` + 
                    aiData.grid.map(row => 
                        `<div class="grid-row">${row.map(cell => `<span class="grid-cell">${cell}</span>`).join('')}</div>`
                    ).join('') + 
                `</div>`;
            }

            // 格式化線獎結果
            let linesHtml = '-';
            if (aiData && aiData.settlement && aiData.settlement.details) {
                const winningLines = aiData.settlement.details.filter(d => d.winAmount > 0);
                
                // 將每個獨立的連線計入統計表
                winningLines.forEach(d => {
                    if (!symbolStats.has(d.symbol)) {
                        symbolStats.set(d.symbol, { symbol: d.symbol, counts: {} });
                    }
                    const stat = symbolStats.get(d.symbol);
                    if (!stat.counts[d.count]) {
                        stat.counts[d.count] = { multiplier: d.payoutMult || 0, hitBets: new Set() };
                    }
                    
                    const betValue = parseFloat(aiData.betValue) || parseFloat(c.ocrData?.bet) || 0;
                    if (betValue > 0) {
                        stat.counts[d.count].hitBets.add(betValue);
                    }
                });

                if (winningLines.length > 0) {
                    linesHtml = `<div class="lines-container">` + 
                        winningLines.map(d => {
                            let text = `${d.lineId !== undefined ? d.lineId : ''} ${d.symbol} x${d.count}`.trim();
                            if (d.multiplier && d.multiplier > 1) {
                                text += ` (×${d.multiplier})`;
                            }
                            text += ` = ${parseFloat(d.winAmount.toFixed(2))}`;
                            return `<div class="line-result">${text}</div>`;
                        }).join('') + 
                    `</div>`;
                }
            }

            const errorStr = c.error ? `<div class="error-text">${c.error}</div>` : '';

            const dataAttrs = [contClass === 'break' ? 'data-break="1"' : '', ocrWin > 0 ? 'data-win="1"' : '', c.isFGSequence ? 'data-fg="1"' : ''].filter(Boolean).join(' ');

            return `<tr ${dataAttrs}>
                <td class="idx">${i + 1}</td>
                <td class="thumb">
                    <img src="${displaySrc}" data-full="${fullSrc}" alt="board-${i + 1}" onclick="openLb(this.getAttribute('data-full'))" />
                    ${winPollDisplaySrc ? `<img src="${winPollDisplaySrc}" data-full="${winPollFullSrc}" alt="win-${i + 1}" onclick="openLb(this.getAttribute('data-full'))" style="margin-top:2px;border:2px solid #f59e0b;border-radius:6px;" />` : ''}
                </td>
                <td class="time">${c.time.toFixed(2)}s</td>
                <td>${ocr.orderId ? `<span title="來源：${c.winPollCanvas ? 'WIN 特工幀' : 'Reel Stop 幀'}">${ocr.orderId} <span style="color:${c.winPollCanvas ? '#f59e0b' : '#10b981'};font-size:8px;">●</span></span>` : '-'}</td>
                <td class="num"><span title="來源：Reel Stop 幀（pre-WIN）">${ocr.balance || '-'} ${ocr.balance ? '<span style="color:#10b981;font-size:8px;">●</span>' : ''}</span></td>
                <td class="num">${ocr.bet || '-'}</td>
                <td class="num ${winClass}"><span title="來源：${c.winPollCanvas ? 'WIN 特工幀' : 'Reel Stop 幀'}">${ocr.win || '0'} ${(ocr.win && parseFloat(ocr.win) > 0 && c.winPollCanvas) ? '<span style="color:#f59e0b;font-size:8px;">●</span>' : ''}</span></td>
                <td class="cont ${contClass}">${continuity}</td>
                <td class="num ${aiWinClass}">${aiWin !== null ? `<span style="${aiWin !== ocrWin ? 'color:#dc2626;border-bottom:2px solid #dc2626;' : ''}">${aiWin}</span>` : '-'}</td>
                <td class="lines-cell-container">${linesHtml}</td>
                <td class="grid-cell-container">${gridHtml}</td>
                <td class="memo">${errorStr}</td>
            </tr>`;
        }).join('\n');

        const rtp = totalBet > 0 ? (totalWin / totalBet * 100).toFixed(2) : '0';
        const dateStr = new Date().toLocaleString('zh-TW');

        // ====== 產生統計報表 HTML ======
        let minCount = Infinity;
        let maxCount = -Infinity;
        Array.from(symbolStats.values()).forEach(stat => {
            Object.keys(stat.counts).forEach(cStr => {
                const c = parseInt(cStr);
                if (c < minCount) minCount = c;
                if (c > maxCount) maxCount = c;
            });
        });
        
        // 防呆處理
        if (minCount === Infinity) {
             minCount = 3; maxCount = 5; 
        }

        const countsRange = [];
        for (let i = minCount; i <= maxCount; i++) {
             countsRange.push(i);
        }

        const statsArray = Array.from(symbolStats.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
        
        const statsRowsHtml = statsArray.map(stat => {
            let rowHtml = `<tr>
                <td style="font-weight:700;">${stat.symbol}</td>`;
            
            countsRange.forEach(c => {
                const item = stat.counts[c];
                if (item) {
                    const multStr = item.multiplier;
                    let flowStr = '';
                    if (item.hitBets.size > 0) {
                        const sortedBets = Array.from(item.hitBets).sort((x, y) => x - y);
                        flowStr = `O(${sortedBets.join('、')})`;
                    }
                    // 沒中獎時，直接留白
                    rowHtml += `<td class="num" style="text-align: center;">${multStr}</td>
                                <td style="color:#16a34a; font-weight:700; white-space:nowrap; text-align: center;">${flowStr}</td>`;
                } else {
                    rowHtml += `<td></td><td></td>`; // 不存在的連線數完全留白
                }
            });
            rowHtml += `</tr>`;
            return rowHtml;
        }).join('\n');

        let theadHtml = `<tr>
            <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; position: static;">符號</th>`;
        countsRange.forEach(c => {
            theadHtml += `<th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; position: static;">${c}X</th>
                          <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; position: static;">金流</th>`;
        });
        theadHtml += `</tr>`;

        const statsTableHtml = statsArray.length > 0 ? `
            <div class="stats-section" style="margin-top: 32px;">
                <div class="header" style="background: linear-gradient(135deg, #334155, #64748b); padding: 16px 32px;">
                    <h2 style="font-size: 16px; font-weight: 700; margin: 0; color: #fff;">📊 符號賠率金流統計表</h2>
                    <div style="font-size: 11px; color: #e2e8f0; margin-top: 2px;">橫向展開之陣列格式，支援無縫複製貼上至 Excel</div>
                </div>
                <div style="display: flex; justify-content: center; padding: 24px;">
                    <table class="excel-table" style="border-collapse: collapse; font-size: 13px; width: max-content; min-width: 50%;">
                        <thead style="background: #f8fafc; position: static;">
                            ${theadHtml}
                        </thead>
                        <tbody>
                            ${statsRowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : '';

        const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${gameName} - 完整辨識報告</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Segoe UI', 'Microsoft JhengHei', sans-serif; background:#f1f5f9; color:#334155; padding:24px; min-width: 1200px; }
.report { width:100%; margin:0 auto; background:#fff; border-radius:16px; box-shadow:0 4px 24px rgba(0,0,0,.08); overflow:hidden; }
.header { background:linear-gradient(135deg,#1e293b,#334155); color:#fff; padding:28px 32px; }
.header h1 { font-size:22px; font-weight:700; margin-bottom:4px; }
.header .sub { font-size:13px; color:#94a3b8; }
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; padding:20px 32px; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
.stat { text-align:center; }
.stat .label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:.5px; }
.stat .value { font-size:20px; font-weight:800; color:#1e293b; margin-top:2px; }
.stat .value.rtp { color:${parseFloat(rtp) >= 100 ? '#059669' : '#dc2626'}; }
table { width:100%; border-collapse:collapse; font-size:13px; }
thead { background:#f8fafc; position:sticky; top:0; z-index:10; }
th { padding:10px 12px; text-align:left; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0; }
td { padding:8px 12px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
tr:hover { background:#f8fafc; }
.idx { color:#94a3b8; font-weight:600; width:40px; text-align:center; }
.thumb { width:140px; padding:4px 8px; }
.thumb img { width:130px; height:auto; border-radius:6px; border:1px solid #e2e8f0; display:block; cursor:pointer; transition:transform .15s; }
.thumb img:hover { transform:scale(1.05); box-shadow:0 2px 8px rgba(0,0,0,.15); }
.lightbox { display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.85); backdrop-filter:blur(4px); justify-content:center; align-items:center; cursor:pointer; }
.lightbox.show { display:flex; }
.lightbox img { max-width:90vw; max-height:90vh; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,.4); }
.lightbox .hint { position:absolute; bottom:20px; color:#94a3b8; font-size:13px; }
.time { font-family:monospace; color:#64748b; font-size:12px; }
.num { font-family:monospace; font-weight:600; text-align:right; }
.win-positive { color:#059669; font-weight:800; }
.cont { font-size:12px; font-weight:600; white-space:nowrap; }
.cont.first { color:#6366f1; }
.cont.ok { color:#059669; }
.cont.break { color:#dc2626; background:#fef2f2; border-radius:4px; padding:2px 6px; }
.cont.na { color:#94a3b8; }
.grid-table { display:flex; flex-direction:column; gap:2px; font-family:monospace; font-size:10px; background:#f8fafc; padding:4px; border-radius:4px; border:1px solid #e2e8f0; width:max-content; }
.grid-row { display:flex; gap:2px; }
.grid-cell { background:#fff; border:1px solid #cbd5e1; border-radius:2px; padding:2px 4px; min-width:24px; text-align:center; color:#475569; font-weight:bold; }
.lines-container { display:flex; flex-direction:column; gap:3px; }
.line-result { background:#fff; border:1px solid #e2e8f0; border-radius:4px; padding:2px 6px; font-size:11px; color:#475569; font-weight:600; white-space:nowrap; }
.memo { font-size:11px; color:#64748b; max-width:150px; }
.error-text { color:#dc2626; background:#fef2f2; border:1px solid #fca5a5; padding:2px 4px; border-radius:4px; font-weight:bold; }
.footer { padding:16px 32px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:center; font-size:11px; color:#94a3b8; }
.excel-table th, .excel-table td { border: 1px solid #cbd5e1 !important; padding: 8px 16px; }
.nav-bar { position:fixed; bottom:20px; right:20px; z-index:999; display:flex; gap:6px; background:rgba(30,41,59,.92); backdrop-filter:blur(8px); padding:8px 12px; border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,.3); }
.nav-btn { padding:6px 12px; border:none; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; transition:all .15s; white-space:nowrap; }
.nav-btn:hover { transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,.2); }
.nav-btn.break { background:#fef2f2; color:#dc2626; }
.nav-btn.win { background:#ecfdf5; color:#059669; }
.nav-btn.fg { background:#fff1f2; color:#e11d48; }
.nav-btn.top { background:#f1f5f9; color:#64748b; }
.nav-counter { font-size:10px; color:#94a3b8; align-self:center; padding:0 4px; }
tr.highlight { animation: rowFlash .6s ease; }
@keyframes rowFlash { 0%,100% { background:transparent; } 50% { background:#fef9c3; } }
@media print { body { background:#fff; padding:0; } .report { box-shadow:none; } .nav-bar { display:none; } }
</style>
</head>
<body>
<div class="report">
    <div class="header">
        <h1>🎰 ${gameName}</h1>
        <div class="sub">完整辨識報告 (AI + OCR) · ${dateStr} · 共 ${spins.length} 局</div>
    </div>
    <div class="stats">
        <div class="stat"><div class="label">總局數</div><div class="value">${spins.length}</div></div>
        <div class="stat"><div class="label">總押注</div><div class="value">${totalBet.toLocaleString()}</div></div>
        <div class="stat"><div class="label">總贏分</div><div class="value">${totalWin.toLocaleString()}</div></div>
        <div class="stat"><div class="label">RTP</div><div class="value rtp">${rtp}%</div></div>
        <div class="stat"><div class="label">命中率</div><div class="value">${(aiHitCount / spins.length * 100).toFixed(1)}%</div></div>
        <div class="stat"><div class="label">最大贏分</div><div class="value">${maxWin.toLocaleString()}</div></div>
    </div>
    <table>
        <thead>
            <tr><th>#</th><th>截圖</th><th>時間</th><th>單號</th><th>餘額</th><th>押注</th><th>OCR贏分</th><th>狀態</th><th>AI贏分</th><th>線獎結果</th><th>AI盤面</th><th>備註</th></tr>
        </thead>
        <tbody>
            ${tableRows}
        </tbody>
    </table>
    ${statsTableHtml}
    <div class="footer">由老虎機線獎辨識工具自動生成</div>
</div>
<div class="lightbox" id="lb" onclick="closeLb()">
    <img id="lbImg" src="" alt="preview" />
    <div class="hint">點擊任意處關閉</div>
</div>
<div class="nav-bar">
    <button class="nav-btn top" onclick="window.scrollTo({top:0,behavior:'smooth'})">⬆ 頂部</button>
    <button class="nav-btn break" onclick="navTo('break')">⚠ 斷層</button>
    <span class="nav-counter" id="breakCount"></span>
    <button class="nav-btn win" onclick="navTo('win')">💰 贏分</button>
    <span class="nav-counter" id="winCount"></span>
    <button class="nav-btn fg" onclick="navTo('fg')">🔥 FG</button>
    <span class="nav-counter" id="fgCount"></span>
</div>
<script>
function openLb(src) { const lb=document.getElementById('lb'); document.getElementById('lbImg').src=src; lb.classList.add('show'); }
function closeLb() { document.getElementById('lb').classList.remove('show'); }
document.addEventListener('keydown', e => { if(e.key==='Escape') closeLb(); });

function navTo(type) {
    const rows = Array.from(document.querySelectorAll('tr[data-' + type + ']'));
    if (rows.length === 0) return;
    const viewCenter = window.scrollY + window.innerHeight / 2;
    // 找到第一個在目前畫面中心「之下」的匹配列
    let next = rows.find(r => r.getBoundingClientRect().top + window.scrollY > viewCenter + 10);
    if (!next) next = rows[0]; // 沒有更下面的了，循環回頂部
    next.scrollIntoView({ behavior: 'smooth', block: 'center' });
    next.classList.remove('highlight');
    void next.offsetWidth;
    next.classList.add('highlight');
}
const bc = document.querySelectorAll('tr[data-break]').length;
const wc = document.querySelectorAll('tr[data-win]').length;
const fc = document.querySelectorAll('tr[data-fg]').length;
document.getElementById('breakCount').textContent = bc > 0 ? bc : '';
document.getElementById('winCount').textContent = wc > 0 ? wc : '';
document.getElementById('fgCount').textContent = fc > 0 ? fc : '';
</script>
</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const fileName = `${gameName}_Report_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.html`;

        if (saveDirHandle) {
            try {
                const fileHandle = await saveDirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                alert(`✅ HTML 報告已隨截圖自動儲存至您的資料夾：\n${fileName}`);
            } catch (e) {
                console.error('HTML 報告儲存至資料夾失敗', e);
                alert('⚠️ 報告儲存至資料夾時發生異常，改為瀏覽器直接下載。\n您可以手動將其放進您的資料夾中。');
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
            }
        } else {
            // 沒有選擇資料夾時，觸發瀏覽器下載
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
        }

        window.open(url, '_blank');
    }, []);

    // 回傳統一的 object
    return { computeStats, exportHTMLReport };
}
