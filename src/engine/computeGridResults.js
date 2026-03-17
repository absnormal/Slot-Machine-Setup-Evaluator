import { isScatterSymbol, isCollectSymbol, isWildSymbol, isCashSymbol, getCashValue, isJpSymbol, getSymbolCount, isDoubleSymbol, getBaseSymbol, getSymbolMultiplier } from '../utils/symbolUtils';

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
            // Check the entire last column for multipliers (Global Multiplier)
            multiplierSymStr = "";
            let foundMultipliers = [];
            
            for (let r = 0; r < template.rows; r++) {
                const rawSym = targetGrid[r]?.[template.cols - 1] || "";
                const m = getSymbolMultiplier(rawSym);
                if (m > 1) {
                    if (activeMultiplier === 1) activeMultiplier = m;
                    else activeMultiplier *= m;
                    foundMultipliers.push({ row: r, col: template.cols - 1, m });
                }
            }
            if (activeMultiplier > 1) {
                multiplierSymStr = `x${activeMultiplier.toFixed(2).replace(/\.00$/, '')}`;
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
                let lineMultiplierMultiplier = (template.multiplierCalcType === 'sum' ? 0 : 1);
                const hasMultiplierAtAll = (template.multiplierCalcType === 'sum' ? (m => m > 0) : (m => m > 1));

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
                    
                    // All Ways matching cumulative units
                    let colMatchUnits = 0;
                    for (let row = 0; row < evalTemplate.rows; row++) {
                        const sym = safeGrid[row][col];
                        if (getBaseSymbol(sym, evalTemplate.jpConfig) === targetSymbol || isWildSymbol(sym)) {
                            colMatchUnits += getSymbolCount(sym);
                        }
                    }

                    consecutiveReels += (colMatchUnits / matchCount); // Average units per physical matching symbol in this column
                    ways *= matchCount;
                    winCoords.push(...colCoords);
                    
                    // xN Multiplier logic for All Ways
                    colCoords.forEach(coord => {
                        const sym = safeGrid[coord.row][coord.col];
                        const m = getSymbolMultiplier(sym);
                        if (m > 1) {
                            if (template.multiplierCalcType === 'sum') lineMultiplierMultiplier += m;
                            else lineMultiplierMultiplier *= m;
                        }
                    });
                }

                // Actually, the simpler way for All Ways is to sum up units for the 'count'
                // and use 'matchCount' for the 'ways'.
                // Recalculating consecutiveReels as cumulative units
                let cumulativeUnits = 0;
                let actualConsecutiveReels = 0;
                for (let col = 0; col < evalTemplate.cols; col++) {
                    let colHasMatch = false;
                    let colMaxUnits = 0;
                    for (let row = 0; row < evalTemplate.rows; row++) {
                        const sym = safeGrid[row][col];
                        if (getBaseSymbol(sym, evalTemplate.jpConfig) === targetSymbol || isWildSymbol(sym)) {
                            colHasMatch = true;
                            colMaxUnits = Math.max(colMaxUnits, getSymbolCount(sym));
                        }
                    }
                    if (!colHasMatch) break;
                    actualConsecutiveReels++;
                    cumulativeUnits += colMaxUnits; // This is a simplification, usually games either count reels or sum units. 
                }
                // Standard behavior for double symbols: they count as 2 towards the "N-of-a-kind"
                // So if we have [Double, Single, Single], it's a 4-of-a-kind.
                
                let totalUnits = 0;
                let reelsReached = 0;
                for (let col = 0; col < evalTemplate.cols; col++) {
                    let foundMatchInCol = false;
                    let maxUnitsInCol = 0; 
                    for (let row = 0; row < evalTemplate.rows; row++) {
                        const sym = safeGrid[row][col];
                        if (getBaseSymbol(sym, evalTemplate.jpConfig) === targetSymbol || isWildSymbol(sym)) {
                            foundMatchInCol = true;
                            // In All Ways, we take 1 match from each reel. If any is double, it contributes 2.
                            // But usually, all matches in a reel contribute to ways, and the payoff is based on the "longest" connection.
                            maxUnitsInCol = Math.max(maxUnitsInCol, getSymbolCount(sym));
                        }
                    }
                    if (!foundMatchInCol) break;
                    reelsReached++;
                    totalUnits += maxUnitsInCol;
                }

                if (reelsReached >= 2) {
                    const payArray = evalTemplate.paytable[targetSymbol];
                    // Map totalUnits to paytable index (e.g. 5 units -> index 4)
                    const payIndex = Math.min(totalUnits - 1, payArray.length - 1);
                    const payoutMult = payIndex >= 0 ? payArray[payIndex] : 0;

                    if (payoutMult > 0) {
                        const finalLineMult = (template.multiplierCalcType === 'sum' ? Math.max(1, lineMultiplierMultiplier) : lineMultiplierMultiplier);
                        const payout = parseFloat((payoutMult * parsedBet * ways * finalLineMult).toFixed(8));
                        calculatedResults.push({
                            lineId: `WAYS_${targetSymbol}`,
                            symbol: targetSymbol,
                            count: reelsReached,
                            ways,
                            payoutMult,
                            winAmount: payout,
                            multiplier: finalLineMult > 1 ? finalLineMult : null,
                            symbolsOnLine: [],
                            positions: [`${reelsReached} 連 × ${ways} Ways`],
                            winCoords
                        });
                        totalWin = parseFloat((totalWin + payout).toFixed(8));
                    }
                }
            }
        } else if (evalTemplate.lineMode === 'symbolcount') {
            // === Symbol Count (Pay Anywhere / 消除模式) 計算 ===
            for (const targetSymbol of allPaySymbols) {
                if (isScatterSymbol(targetSymbol)) continue;
                if (isCashSymbol(targetSymbol, evalTemplate.jpConfig)) continue;
                if (isCollectSymbol(targetSymbol) && !isWildSymbol(targetSymbol)) continue;

                let totalCount = 0;
                const winCoords = [];
                let lineMultiplierMultiplier = (template.multiplierCalcType === 'sum' ? 0 : 1);
                let hasLineMultiplier = false;

                for (let r = 0; r < evalTemplate.rows; r++) {
                    for (let c = 0; c < evalTemplate.cols; c++) {
                        const sym = safeGrid[r][c];
                        if (getBaseSymbol(sym, evalTemplate.jpConfig) === targetSymbol || isWildSymbol(sym)) {
                            totalCount += getSymbolCount(sym);
                            winCoords.push({ row: r, col: c });
                            
                            const m = getSymbolMultiplier(sym);
                            if (m > 1) {
                                hasLineMultiplier = true;
                                if (template.multiplierCalcType === 'sum') lineMultiplierMultiplier += m;
                                else lineMultiplierMultiplier *= m;
                            }
                        }
                    }
                }

                if (totalCount > 0) {
                    const payArray = evalTemplate.paytable[targetSymbol];
                    const payIndex = Math.min(totalCount - 1, payArray.length - 1);
                    const payoutMult = payIndex >= 0 ? payArray[payIndex] : 0;

                    if (payoutMult > 0) {
                        const finalLineMult = hasLineMultiplier ? (template.multiplierCalcType === 'sum' ? Math.max(1, lineMultiplierMultiplier) : lineMultiplierMultiplier) : 1;
                        const payout = parseFloat((payoutMult * parsedBet * finalLineMult).toFixed(8));
                        calculatedResults.push({
                            lineId: `COUNT_${targetSymbol}`,
                            symbol: targetSymbol,
                            count: totalCount,
                            payoutMult,
                            winAmount: payout,
                            multiplier: finalLineMult > 1 ? finalLineMult : null,
                            symbolsOnLine: [],
                            positions: [`${totalCount} 消除`],
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
                let bestLineMult = 1;

                for (const targetSymbol of allPaySymbols) {
                    if (isScatterSymbol(targetSymbol)) continue;
                    if (isCashSymbol(targetSymbol, evalTemplate.jpConfig)) continue;
                    if (isCollectSymbol(targetSymbol) && !isWildSymbol(targetSymbol)) continue;

                    let currentCount = 0;
                    let hasTargetSymbol = false;
                    let lineMultiplierMultiplier = (template.multiplierCalcType === 'sum' ? 0 : 1);

                    for (let i = 0; i < symbolsOnLine.length; i++) {
                        const sym = symbolsOnLine[i];
                        if (!sym) break;
                        const symBase = getBaseSymbol(sym, evalTemplate.jpConfig);

                        if (symBase === targetSymbol || isWildSymbol(sym)) {
                            currentCount += getSymbolCount(sym);
                            if (symBase === targetSymbol) hasTargetSymbol = true;
                            
                            // xN Multiplier logic
                            const m = getSymbolMultiplier(sym);
                            if (m > 1) {
                                if (template.multiplierCalcType === 'sum') lineMultiplierMultiplier += m;
                                else lineMultiplierMultiplier *= m;
                            }
                        } else {
                            break;
                        }
                    }

                    if (currentCount > 0 && (isWildSymbol(targetSymbol) || hasTargetSymbol)) {
                        const payArray = evalTemplate.paytable[targetSymbol];
                        const payIndex = Math.min(currentCount - 1, payArray.length - 1);
                        const payoutMult = payIndex >= 0 ? payArray[payIndex] : 0;
                        const finalLineMult = (template.multiplierCalcType === 'sum' ? Math.max(1, lineMultiplierMultiplier) : lineMultiplierMultiplier);
                        const payout = parseFloat((payoutMult * parsedBet * finalLineMult).toFixed(8));

                        if (payout > bestPayout) {
                            bestPayout = payout;
                            bestSymbol = targetSymbol;
                            bestCount = currentCount;
                            bestLineMult = finalLineMult;
                        }
                    }
                }
                
                // Track bestLineMult for the actual result push

                if (bestPayout === 0) {
                    bestSymbol = symbolsOnLine[0] || '空';
                    if (isWildSymbol(bestSymbol)) {
                        bestSymbol = symbolsOnLine.find(s => !isWildSymbol(s) && s !== '') || bestSymbol;
                    }
                    bestCount = 0;
                    for (let i = 0; i < symbolsOnLine.length; i++) {
                        const sym = symbolsOnLine[i];
                        if (!sym) break;
                        if (isScatterSymbol(sym) || isCashSymbol(sym, evalTemplate.jpConfig) || (isCollectSymbol(sym) && !isWildSymbol(sym))) break;

                        if (getBaseSymbol(sym, evalTemplate.jpConfig) === bestSymbol || isWildSymbol(sym)) {
                            bestCount += getSymbolCount(sym);
                        } else break;
                    }
                }

                const winCoords = [];
                if (bestPayout > 0) {
                    let cumulativeIdx = 0;
                    for (let i = 0; i < symbolsOnLine.length; i++) {
                        const sym = symbolsOnLine[i];
                        cumulativeIdx += getSymbolCount(sym);
                        winCoords.push({ row: positions[i] - 1, col: i });
                        if (cumulativeIdx >= bestCount) break;
                    }
                }

                if (!isScatterSymbol(bestSymbol) && !isCashSymbol(bestSymbol, evalTemplate.jpConfig)) {
                    calculatedResults.push({
                        lineId,
                        symbol: bestSymbol,
                        count: bestCount,
                        payoutMult: bestPayout > 0 ? evalTemplate.paytable[bestSymbol][bestCount - 1] : 0,
                        winAmount: bestPayout,
                        multiplier: bestLineMult > 1 ? bestLineMult : null,
                        symbolsOnLine,
                        positions: [...positions, ...(bestLineMult > 1 ? [`x${bestLineMult}`] : [])],
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
                    const sym = safeGrid[r][c];
                    if (getBaseSymbol(sym, evalTemplate.jpConfig) === scatterSymbol) {
                        scatterCount += getSymbolCount(sym);
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
        let totalCollectorMultiplicity = 0;
        const collectCoords = [];
        const cashCoords = [];
        let totalCashWinValue = 0;
        let otherGridMultiplier = (template.multiplierCalcType === 'sum' ? 0 : 1);
        let hasOtherGridMultiplier = false;
        const multiplierCoords = [];

        for (let r = 0; r < evalTemplate.rows; r++) {
            for (let c = 0; c < evalTemplate.cols; c++) {
                const sym = safeGrid[r][c];
                const m = getSymbolMultiplier(sym);
                
                if (isCollectSymbol(sym)) {
                    totalCollectorMultiplicity += Math.max(1, m);
                    collectCoords.push({ row: r, col: c });
                } else if (m > 1) {
                    hasOtherGridMultiplier = true;
                    multiplierCoords.push({ row: r, col: c });
                    if (template.multiplierCalcType === 'sum') otherGridMultiplier += m;
                    else otherGridMultiplier *= m;
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

        const effectiveCollectCount = (evalTemplate.requiresCollectToWin === false) 
            ? Math.max(1, totalCollectorMultiplicity) 
            : totalCollectorMultiplicity;

        if (effectiveCollectCount > 0 && totalCashWinValue > 0) {
            const finalOtherMult = hasOtherGridMultiplier ? (template.multiplierCalcType === 'sum' ? Math.max(1, otherGridMultiplier) : otherGridMultiplier) : 1;
            const totalCollectionFactor = effectiveCollectCount * finalOtherMult;
            const totalPayout = totalCashWinValue * totalCollectionFactor;
            const payout = parseFloat(totalPayout.toFixed(8));

            calculatedResults.push({
                lineId: `COLLECT_FEATURE`,
                symbol: `CASH`,
                count: cashCoords.length,
                payoutMult: totalCashWinValue,
                winAmount: payout,
                symbolsOnLine: Array(Math.max(1, collectCoords.length)).fill('COLLECT').concat(cashCoords.map(coord => safeGrid[coord.row][coord.col])),
                positions: [evalTemplate.requiresCollectToWin === false && totalCollectorMultiplicity === 0 ? "自動收集" : `收集 x${totalCollectionFactor}`],
                winCoords: [...collectCoords, ...cashCoords, ...multiplierCoords]
            });
            totalWin = parseFloat((totalWin + payout).toFixed(8));
        }

        // === 乘倍處理 ===
        if (activeMultiplier > 1 && totalWin > 0) {
            totalWin = parseFloat((totalWin * activeMultiplier).toFixed(8));
            calculatedResults.forEach(res => {
                res.winAmount = parseFloat((res.winAmount * activeMultiplier).toFixed(8));
                if (res.lineId === 'COLLECT_FEATURE') {
                    // 對於收集功能，直接將乘倍反映在「收集 xN」上
                    const match = String(res.positions[0]).match(/收集 x(\d+(?:\.\d+)?)/);
                    if (match) {
                        const currentFactor = parseFloat(match[1]);
                        res.positions[0] = `收集 x${(currentFactor * activeMultiplier).toFixed(2).replace(/\.00$/, '')}`;
                    } else {
                        res.positions.push(multiplierSymStr);
                    }
                } else if (res.positions && res.positions.length > 0) {
                    res.positions = [...res.positions, multiplierSymStr];
                }
                // Add the multiplier coordinate for highlighting
                // Add all multiplier coordinates from the last column for highlighting
                const multCol = template.cols - 1;
                for (let r = 0; r < template.rows; r++) {
                    const rawSym = targetGrid[r]?.[multCol] || "";
                    if (getSymbolMultiplier(rawSym) > 1) {
                        if (!res.winCoords.some(c => c.row === r && c.col === multCol)) {
                            res.winCoords.push({ row: r, col: multCol });
                        }
                    }
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
