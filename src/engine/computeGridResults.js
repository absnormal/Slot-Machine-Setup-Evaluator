import { isScatterSymbol, isCollectSymbol, isWildSymbol, isCashSymbol, getCashValue, isJpSymbol } from '../utils/symbolUtils';

/**
 * 核心結算引擎：根據模板、盤面與押注計算線獎結果
 * @param {Object} template - 模板物件 { rows, cols, lines, paytable, symbolImages }
 * @param {Array} targetGrid - 二維盤面陣列
 * @param {number} betAmount - 押注金額
 * @returns {{ results: Object|null, error: string }}
 */
export function computeGridResults(template, targetGrid, betAmount) {
    if (!template || !targetGrid) {
        return { results: null, error: '' };
    }

    try {
        let safeGrid = targetGrid;
        let evalTemplate = template;
        let activeMultiplier = 1;
        let multiplierSymStr = "";

        if (template.hasMultiplierReel && template.cols > 1) {
            evalTemplate = { ...template, cols: template.cols - 1 };
            safeGrid = targetGrid.map(row => row.slice(0, evalTemplate.cols));
            const midRow = Math.floor(template.rows / 2);
            const rawSym = targetGrid[midRow]?.[template.cols - 1] || "";

            // 支援如 x2, x5, MULT_10 等格式
            const numMatch = String(rawSym).match(/(\d+(?:\.\d+)?)/);
            if (numMatch && /x|mult|✖/i.test(String(rawSym))) {
                activeMultiplier = parseFloat(numMatch[0]);
                multiplierSymStr = `x${activeMultiplier}`;
            }
        }

        const parsedBet = parseFloat(betAmount);
        if (isNaN(parsedBet) || parsedBet <= 0) throw new Error('押注金額必須為大於 0 的有效數字。');

        const calculatedResults = [];
        let totalWin = 0;
        const allPaySymbols = Object.keys(evalTemplate.paytable);

        if (evalTemplate.lineMode === 'allways') {
            // === All Ways 計算 ===
            for (const targetSymbol of allPaySymbols) {
                if (isScatterSymbol(targetSymbol)) continue;
                if (isCashSymbol(targetSymbol, evalTemplate.jpConfig)) continue;
                if (isCollectSymbol(targetSymbol) && !isWildSymbol(targetSymbol)) continue;

                let consecutiveReels = 0;
                let ways = 1;
                const winCoords = [];

                for (let col = 0; col < evalTemplate.cols; col++) {
                    let matchCount = 0;
                    const colCoords = [];
                    for (let row = 0; row < evalTemplate.rows; row++) {
                        const sym = safeGrid[row][col];
                        if (!sym) continue;
                        if (sym === targetSymbol || isWildSymbol(sym)) {
                            matchCount++;
                            colCoords.push({ row, col });
                        }
                    }
                    if (matchCount === 0) break;
                    consecutiveReels++;
                    ways *= matchCount;
                    winCoords.push(...colCoords);
                }

                if (consecutiveReels >= 2) {
                    const payArray = evalTemplate.paytable[targetSymbol];
                    const payIndex = Math.min(consecutiveReels - 1, payArray.length - 1);
                    const payoutMult = payIndex >= 0 ? payArray[payIndex] : 0;

                    if (payoutMult > 0) {
                        const payout = parseFloat((payoutMult * parsedBet * ways).toFixed(8));
                        calculatedResults.push({
                            lineId: `WAYS_${targetSymbol}`,
                            symbol: targetSymbol,
                            count: consecutiveReels,
                            ways,
                            payoutMult,
                            winAmount: payout,
                            symbolsOnLine: [],
                            positions: [`${consecutiveReels} 連 × ${ways} Ways`],
                            winCoords
                        });
                        totalWin = parseFloat((totalWin + payout).toFixed(8));
                    }
                }
            }
        } else {
            // === 固定線獎計算 ===
            Object.entries(evalTemplate.lines).forEach(([lineIdStr, positions]) => {
                const lineId = parseInt(lineIdStr);

                const symbolsOnLine = positions.map((row, colIndex) => {
                    const rIndex = row - 1;
                    if (rIndex < 0 || rIndex >= evalTemplate.rows || !safeGrid[rIndex]) {
                        throw new Error(`結算錯誤：線獎編號 ${lineId} 包含無效列數「${row}」，但盤面最大只有 ${evalTemplate.rows} 列。請至 Phase 1 修正。`);
                    }
                    return safeGrid[rIndex][colIndex];
                });

                let bestPayout = 0;
                let bestSymbol = null;
                let bestCount = 0;

                for (const targetSymbol of allPaySymbols) {
                    if (isScatterSymbol(targetSymbol)) continue;
                    if (isCashSymbol(targetSymbol, evalTemplate.jpConfig)) continue;
                    if (isCollectSymbol(targetSymbol) && !isWildSymbol(targetSymbol)) continue;

                    let currentCount = 0;
                    let hasTargetSymbol = false;

                    for (let i = 0; i < symbolsOnLine.length; i++) {
                        if (!symbolsOnLine[i]) break;

                        if (symbolsOnLine[i] === targetSymbol) {
                            currentCount++;
                            hasTargetSymbol = true;
                        } else if (isWildSymbol(symbolsOnLine[i])) {
                            currentCount++;
                        } else {
                            break;
                        }
                    }

                    if (currentCount > 0 && (isWildSymbol(targetSymbol) || hasTargetSymbol)) {
                        const payoutMult = evalTemplate.paytable[targetSymbol][currentCount - 1] || 0;
                        const payout = parseFloat((payoutMult * parsedBet).toFixed(8));

                        if (payout > bestPayout) {
                            bestPayout = payout;
                            bestSymbol = targetSymbol;
                            bestCount = currentCount;
                        }
                    }
                }

                if (bestPayout === 0) {
                    bestSymbol = symbolsOnLine[0] || '空';
                    if (isWildSymbol(bestSymbol)) {
                        bestSymbol = symbolsOnLine.find(s => !isWildSymbol(s) && s !== '') || bestSymbol;
                    }
                    bestCount = 0;
                    for (let i = 0; i < symbolsOnLine.length; i++) {
                        if (!symbolsOnLine[i]) break;
                        if (isScatterSymbol(symbolsOnLine[i]) || isCashSymbol(symbolsOnLine[i], evalTemplate.jpConfig) || (isCollectSymbol(symbolsOnLine[i]) && !isWildSymbol(symbolsOnLine[i]))) break;

                        if (symbolsOnLine[i] === bestSymbol || isWildSymbol(symbolsOnLine[i])) bestCount++;
                        else break;
                    }
                }

                const winCoords = [];
                if (bestPayout > 0) {
                    for (let i = 0; i < bestCount; i++) {
                        winCoords.push({ row: positions[i] - 1, col: i });
                    }
                }

                if (!isScatterSymbol(bestSymbol) && !isCashSymbol(bestSymbol, evalTemplate.jpConfig)) {
                    calculatedResults.push({
                        lineId,
                        symbol: bestSymbol,
                        count: bestCount,
                        payoutMult: bestPayout > 0 ? evalTemplate.paytable[bestSymbol][bestCount - 1] : 0,
                        winAmount: bestPayout,
                        symbolsOnLine,
                        positions: [...positions],
                        winCoords
                    });
                    totalWin = parseFloat((totalWin + bestPayout).toFixed(8));
                }
            });
        } // end paylines else

        // === SCATTER 計算 ===
        const scatterSymbols = allPaySymbols.filter(isScatterSymbol);
        for (const scatterSymbol of scatterSymbols) {
            let scatterCount = 0;
            const scatterCoords = [];

            for (let r = 0; r < evalTemplate.rows; r++) {
                for (let c = 0; c < evalTemplate.cols; c++) {
                    if (safeGrid[r][c] === scatterSymbol) {
                        scatterCount++;
                        scatterCoords.push({ row: r, col: c });
                    }
                }
            }

            if (scatterCount > 0) {
                const payArray = evalTemplate.paytable[scatterSymbol];
                const payIndex = Math.min(scatterCount - 1, payArray.length - 1);
                const payoutMult = payIndex >= 0 ? payArray[payIndex] : 0;
                const payout = parseFloat((payoutMult * parsedBet).toFixed(8));

                calculatedResults.push({
                    lineId: `SCATTER_${scatterSymbol}`,
                    symbol: scatterSymbol,
                    count: scatterCount,
                    payoutMult: payoutMult,
                    winAmount: payout,
                    symbolsOnLine: Array(scatterCount).fill(scatterSymbol),
                    positions: ['Anywhere'],
                    winCoords: payoutMult > 0 ? scatterCoords : []
                });

                totalWin = parseFloat((totalWin + payout).toFixed(8));
            }
        }

        // === CASH/COLLECT 計算 ===
        let collectCount = 0;
        const collectCoords = [];
        const cashCoords = [];
        let totalCashWinValue = 0;

        for (let r = 0; r < evalTemplate.rows; r++) {
            for (let c = 0; c < evalTemplate.cols; c++) {
                const sym = safeGrid[r][c];
                if (isCollectSymbol(sym)) {
                    collectCount++;
                    collectCoords.push({ row: r, col: c });
                }
                if (isCashSymbol(sym, evalTemplate.jpConfig)) {
                    const val = getCashValue(sym, evalTemplate.jpConfig);
                    if (val > 0) {
                        let symPayout = 0;
                        if (isJpSymbol(sym, evalTemplate.jpConfig)) {
                            symPayout = val * parsedBet;
                        } else {
                            symPayout = val;
                        }
                        totalCashWinValue += symPayout;
                        cashCoords.push({ row: r, col: c });
                    }
                }
            }
        }

        if (collectCount > 0 && totalCashWinValue > 0) {
            const totalPayout = totalCashWinValue * collectCount;
            const payout = parseFloat(totalPayout.toFixed(8));

            calculatedResults.push({
                lineId: `COLLECT_FEATURE`,
                symbol: `CASH`,
                count: cashCoords.length,
                payoutMult: totalCashWinValue,
                winAmount: payout,
                symbolsOnLine: Array(collectCount).fill('COLLECT').concat(cashCoords.map(coord => safeGrid[coord.row][coord.col])),
                positions: [`收集 x${collectCount}`],
                winCoords: [...collectCoords, ...cashCoords]
            });
            totalWin = parseFloat((totalWin + payout).toFixed(8));
        }

        // === 乘倍處理 ===
        if (activeMultiplier > 1 && totalWin > 0) {
            totalWin = parseFloat((totalWin * activeMultiplier).toFixed(8));
            calculatedResults.forEach(res => {
                res.winAmount = parseFloat((res.winAmount * activeMultiplier).toFixed(8));
                if (res.positions && res.positions.length > 0) {
                    res.positions = [...res.positions, multiplierSymStr];
                }
                // Add the multiplier coordinate for highlighting
                const midRow = Math.floor(template.rows / 2);
                const multCol = template.cols - 1;
                if (!res.winCoords.some(c => c.row === midRow && c.col === multCol)) {
                    res.winCoords.push({ row: midRow, col: multCol });
                }
            });
        }

        // === 排序 ===
        calculatedResults.sort((a, b) => {
            const aIsFeature = String(a.lineId).startsWith('SCATTER') || String(a.lineId).startsWith('COLLECT');
            const bIsFeature = String(b.lineId).startsWith('SCATTER') || String(b.lineId).startsWith('COLLECT');
            if (aIsFeature && !bIsFeature) return -1;
            if (!aIsFeature && bIsFeature) return 1;
            if (aIsFeature && bIsFeature) return String(a.lineId).localeCompare(String(b.lineId));
            return a.lineId - b.lineId;
        });

        return {
            results: { details: calculatedResults, totalWin, panel: targetGrid },
            error: ''
        };

    } catch (err) {
        return { results: null, error: err.message };
    }
}
