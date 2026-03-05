import { isScatterSymbol, isCollectSymbol, isWildSymbol, isCashSymbol, getCashValue } from '../utils/symbolUtils';

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
        const safeGrid = targetGrid;
        const parsedBet = parseFloat(betAmount);
        if (isNaN(parsedBet) || parsedBet <= 0) throw new Error('押注金額必須為大於 0 的有效數字。');

        const calculatedResults = [];
        let totalWin = 0;
        const allPaySymbols = Object.keys(template.paytable);

        // === 線獎計算 ===
        Object.entries(template.lines).forEach(([lineIdStr, positions]) => {
            const lineId = parseInt(lineIdStr);

            const symbolsOnLine = positions.map((row, colIndex) => {
                const rIndex = row - 1;
                if (rIndex < 0 || rIndex >= template.rows || !safeGrid[rIndex]) {
                    throw new Error(`結算錯誤：線獎編號 ${lineId} 包含無效列數「${row}」，但盤面最大只有 ${template.rows} 列。請至 Phase 1 修正。`);
                }
                return safeGrid[rIndex][colIndex];
            });

            let bestPayout = 0;
            let bestSymbol = null;
            let bestCount = 0;

            for (const targetSymbol of allPaySymbols) {
                if (isScatterSymbol(targetSymbol)) continue;
                if (isCashSymbol(targetSymbol, template.jpConfig)) continue;
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
                    const payoutMult = template.paytable[targetSymbol][currentCount - 1] || 0;
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
                    if (isScatterSymbol(symbolsOnLine[i]) || isCashSymbol(symbolsOnLine[i], template.jpConfig) || (isCollectSymbol(symbolsOnLine[i]) && !isWildSymbol(symbolsOnLine[i]))) break;

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

            if (!isScatterSymbol(bestSymbol) && !isCashSymbol(bestSymbol, template.jpConfig)) {
                calculatedResults.push({
                    lineId,
                    symbol: bestSymbol,
                    count: bestCount,
                    payoutMult: bestPayout > 0 ? template.paytable[bestSymbol][bestCount - 1] : 0,
                    winAmount: bestPayout,
                    symbolsOnLine,
                    positions,
                    winCoords
                });
                totalWin = parseFloat((totalWin + bestPayout).toFixed(8));
            }
        });

        // === SCATTER 計算 ===
        const scatterSymbols = allPaySymbols.filter(isScatterSymbol);
        for (const scatterSymbol of scatterSymbols) {
            let scatterCount = 0;
            const scatterCoords = [];

            for (let r = 0; r < template.rows; r++) {
                for (let c = 0; c < template.cols; c++) {
                    if (safeGrid[r][c] === scatterSymbol) {
                        scatterCount++;
                        scatterCoords.push({ row: r, col: c });
                    }
                }
            }

            if (scatterCount > 0) {
                const payArray = template.paytable[scatterSymbol];
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
                    winCoords: scatterCoords
                });

                totalWin = parseFloat((totalWin + payout).toFixed(8));
            }
        }

        // === CASH/COLLECT 計算 ===
        let collectCount = 0;
        const collectCoords = [];
        const cashCoords = [];
        let totalCashValue = 0;

        for (let r = 0; r < template.rows; r++) {
            for (let c = 0; c < template.cols; c++) {
                const sym = safeGrid[r][c];
                if (isCollectSymbol(sym)) {
                    collectCount++;
                    collectCoords.push({ row: r, col: c });
                }
                if (isCashSymbol(sym, template.jpConfig)) {
                    const val = getCashValue(sym, template.jpConfig);
                    if (val > 0) {
                        totalCashValue += val;
                        cashCoords.push({ row: r, col: c });
                    }
                }
            }
        }

        if (collectCount > 0 && totalCashValue > 0) {
            const totalPayout = totalCashValue * collectCount;
            const payout = parseFloat((totalPayout * parsedBet).toFixed(8)); // CASH value is multiplier of Bet

            calculatedResults.push({
                lineId: `COLLECT_FEATURE`,
                symbol: `CASH`,
                count: cashCoords.length,
                payoutMult: totalCashValue,
                winAmount: payout,
                symbolsOnLine: Array(collectCount).fill('COLLECT').concat(cashCoords.map(coord => safeGrid[coord.row][coord.col])),
                positions: [`收集 x${collectCount}`],
                winCoords: [...collectCoords, ...cashCoords]
            });
            totalWin = parseFloat((totalWin + payout).toFixed(8));
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
            results: { details: calculatedResults, totalWin, panel: safeGrid },
            error: ''
        };

    } catch (err) {
        return { results: null, error: err.message };
    }
}
