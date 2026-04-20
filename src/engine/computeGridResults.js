import { isScatterSymbol, isCollectSymbol, isWildSymbol, isCashSymbol, getCashValue, isJpSymbol, getSymbolCount, isDoubleSymbol, getBaseSymbol, getSymbolMultiplier, getCollectValue } from '../utils/symbolUtils';
import Big from 'big.js';

// === 安全數學輔助函數 (從根本解決 IEEE 754 浮點數飄移) ===
const safeMul = (...args) => args.reduce((acc, val) => acc.times(val !== null && val !== undefined && val !== false ? val : 1), Big(1)).toNumber();
const safeAdd = (...args) => args.reduce((acc, val) => acc.plus(val || 0), Big(0)).toNumber();

/**
 * 核心結算引擎：根據模板、盤面與押注計算線獎結果
 * @param {Object} template - 模板物件 { rows, cols, lines, paytable, symbolImages }
 * @param {Array} targetGrid - 二維盤面陣列
 * @param {number} betAmount - 押注金額
 * @returns {{ results: Object|null, error: string }}
 */
export function computeGridResults(template, targetGrid, betAmount, options = {}) {
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

        const activeLineCount = options.activeLineCount || evalTemplate.linesCount || 1;
        const lineBet = (evalTemplate.hasAdjustableLines && activeLineCount > 0) ? (parsedBet / activeLineCount) : parsedBet;

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
                        const base = getBaseSymbol(sym, evalTemplate.jpConfig);
                        if (base === targetSymbol || isWildSymbol(sym)) {
                            matchCount++;
                            colCoords.push({ row, col });
                        }
                    }
                    if (matchCount === 0) break;
                    
                    ways *= matchCount;
                    winCoords.push(...colCoords);
                    
                    // xN Multiplier logic for All Ways
                    colCoords.forEach(coord => {
                        const sym = safeGrid[coord.row][coord.col];
                        const m = getSymbolMultiplier(sym);
                        if (m > 1) {
                            if (template.multiplierCalcType === 'sum') lineMultiplierMultiplier = safeAdd(lineMultiplierMultiplier, m);
                            else lineMultiplierMultiplier = safeMul(lineMultiplierMultiplier, m);
                        }
                    });
                }

                // 扣除「純 WILD 路線」：計算每行中僅有 WILD 的數量之連乘積
                // 若非 WILD 符號本身，需將純 WILD 路線從 ways 中扣除
                let pureWildDeducted = false;
                if (!isWildSymbol(targetSymbol)) {
                    let pureWildWays = 1;
                    let pureWildPossible = true;
                    for (let col = 0; col < evalTemplate.cols; col++) {
                        let wildOnlyCount = 0;
                        let colHasAnyMatch = false;
                        for (let row = 0; row < evalTemplate.rows; row++) {
                            const sym = safeGrid[row][col];
                            if (!sym) continue;
                            const base = getBaseSymbol(sym, evalTemplate.jpConfig);
                            if (base === targetSymbol || isWildSymbol(sym)) colHasAnyMatch = true;
                            if (isWildSymbol(sym) && base !== targetSymbol) wildOnlyCount++;
                        }
                        if (!colHasAnyMatch) break; // 同步中斷點
                        if (wildOnlyCount === 0) { pureWildPossible = false; break; }
                        pureWildWays *= wildOnlyCount;
                    }
                    if (pureWildPossible) {
                        ways -= pureWildWays;
                        pureWildDeducted = true;
                    }
                }

                // 過濾 winCoords：若有扣除純 WILD 路線，且 target 僅存在於 1 個行，
                // 則從該行移除 WILD 座標（因為所有合法路線都必須經過那唯一一個 target）
                let finalWinCoords = winCoords;
                if (pureWildDeducted) {
                    const colsWithTarget = new Set();
                    for (const coord of winCoords) {
                        const sym = safeGrid[coord.row][coord.col];
                        const base = getBaseSymbol(sym, evalTemplate.jpConfig);
                        if (base === targetSymbol && !isWildSymbol(sym)) colsWithTarget.add(coord.col);
                    }
                    // 只有當 target 僅在 1 個行出現時，才從該行移除 WILD
                    // 若 target 存在於 2+ 個行，WILD 仍可透過其他行的 target 形成合法路線
                    if (colsWithTarget.size === 1) {
                        finalWinCoords = winCoords.filter(coord => {
                            const sym = safeGrid[coord.row][coord.col];
                            return !(isWildSymbol(sym) && colsWithTarget.has(coord.col));
                        });
                    }
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
                let hasTargetSymbol = false;
                for (let col = 0; col < evalTemplate.cols; col++) {
                    let foundMatchInCol = false;
                    let maxUnitsInCol = 0; 
                    for (let row = 0; row < evalTemplate.rows; row++) {
                        const sym = safeGrid[row][col];
                        if (getBaseSymbol(sym, evalTemplate.jpConfig) === targetSymbol || isWildSymbol(sym)) {
                            foundMatchInCol = true;
                            maxUnitsInCol = Math.max(maxUnitsInCol, getSymbolCount(sym));
                            if (getBaseSymbol(sym, evalTemplate.jpConfig) === targetSymbol) hasTargetSymbol = true;
                        }
                    }
                    if (!foundMatchInCol) break;
                    reelsReached++;
                    totalUnits += maxUnitsInCol;
                }

                if (reelsReached >= 2 && (isWildSymbol(targetSymbol) || hasTargetSymbol)) {
                    const payArray = evalTemplate.paytable[targetSymbol];
                    // Map totalUnits to paytable index (e.g. 5 units -> index 4)
                    const payIndex = Math.min(totalUnits - 1, payArray.length - 1);
                    const payoutMult = payIndex >= 0 ? payArray[payIndex] : 0;

                    if (payoutMult > 0) {
                        const finalLineMult = (template.multiplierCalcType === 'sum' ? Math.max(1, lineMultiplierMultiplier) : lineMultiplierMultiplier);
                        const payout = safeMul(payoutMult, lineBet, ways, finalLineMult);
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
                            winCoords: finalWinCoords
                        });
                        totalWin = safeAdd(totalWin, payout);
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
                                if (template.multiplierCalcType === 'sum') lineMultiplierMultiplier = safeAdd(lineMultiplierMultiplier, m);
                                else lineMultiplierMultiplier = safeMul(lineMultiplierMultiplier, m);
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
                        const payout = safeMul(payoutMult, lineBet, finalLineMult);
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
                        totalWin = safeAdd(totalWin, payout);
                    }
                }
            }
        } else {
            // === 固定線獎計算 ===
            Object.entries(evalTemplate.lines).forEach(([lineIdStr, positions]) => {
                const lineId = parseInt(lineIdStr);

                // 若指定 activeLineCount，僅計算前 N 條線
                if (options.activeLineCount && lineId > options.activeLineCount) return;

                const symbolsOnLine = positions.map((row, colIndex) => {
                    const rIndex = row - 1;
                    if (rIndex < 0 || rIndex >= evalTemplate.rows || !safeGrid[rIndex]) {
                        throw new Error(`結算錯誤：線獎編號 ${lineId} 包含無效列數「${row}」，但盤面最大只有 ${evalTemplate.rows} 列。請至 Phase 1 修正。`);
                    }
                    return safeGrid[rIndex][colIndex];
                });

                // --- 共用的單方向掃描函數 ---
                const scanDirection = (syms) => {
                    let dirBestPayout = 0;
                    let dirBestSymbol = null;
                    let dirBestCount = 0;
                    let dirBestLineMult = 1;

                    for (const targetSymbol of allPaySymbols) {
                        if (isScatterSymbol(targetSymbol)) continue;
                        if (isCashSymbol(targetSymbol, evalTemplate.jpConfig)) continue;
                        if (isCollectSymbol(targetSymbol) && !isWildSymbol(targetSymbol)) continue;

                        let currentCount = 0;
                        let hasTargetSymbol = false;
                        let lineMultiplierMultiplier = (template.multiplierCalcType === 'sum' ? 0 : 1);

                        for (let i = 0; i < syms.length; i++) {
                            const sym = syms[i];
                            if (!sym) break;
                            const symBase = getBaseSymbol(sym, evalTemplate.jpConfig);

                            if (symBase === targetSymbol || isWildSymbol(sym)) {
                                currentCount += getSymbolCount(sym);
                                if (symBase === targetSymbol) hasTargetSymbol = true;
                                const m = getSymbolMultiplier(sym);
                                if (m > 1) {
                                    if (template.multiplierCalcType === 'sum') lineMultiplierMultiplier = safeAdd(lineMultiplierMultiplier, m);
                                    else lineMultiplierMultiplier = safeMul(lineMultiplierMultiplier, m);
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
                            const payout = safeMul(payoutMult, lineBet, finalLineMult);

                            if (payout > dirBestPayout) {
                                dirBestPayout = payout;
                                dirBestSymbol = targetSymbol;
                                dirBestCount = currentCount;
                                dirBestLineMult = finalLineMult;
                            }
                        }
                    }
                    return { bestPayout: dirBestPayout, bestSymbol: dirBestSymbol, bestCount: dirBestCount, bestLineMult: dirBestLineMult };
                };

                // --- 左至右掃描 ---
                const ltr = scanDirection(symbolsOnLine);
                let bestPayout = ltr.bestPayout;
                let bestSymbol = ltr.bestSymbol;
                let bestCount = ltr.bestCount;
                let bestLineMult = ltr.bestLineMult;
                let isRtl = false;

                // --- 右至左掃描（若啟用雙向連線）---
                if (options.enableBidirectional) {
                    const rtl = scanDirection([...symbolsOnLine].reverse());
                    if (rtl.bestPayout > bestPayout) {
                        bestPayout = rtl.bestPayout;
                        bestSymbol = rtl.bestSymbol;
                        bestCount = rtl.bestCount;
                        bestLineMult = rtl.bestLineMult;
                        isRtl = true;
                    }
                }

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
                    if (isRtl) {
                        // 右至左：座標從最後一格往前數
                        let cumulativeIdx = 0;
                        for (let i = symbolsOnLine.length - 1; i >= 0; i--) {
                            const sym = symbolsOnLine[i];
                            cumulativeIdx += getSymbolCount(sym);
                            winCoords.push({ row: positions[i] - 1, col: i });
                            if (cumulativeIdx >= bestCount) break;
                        }
                    } else {
                        let cumulativeIdx = 0;
                        for (let i = 0; i < symbolsOnLine.length; i++) {
                            const sym = symbolsOnLine[i];
                            cumulativeIdx += getSymbolCount(sym);
                            winCoords.push({ row: positions[i] - 1, col: i });
                            if (cumulativeIdx >= bestCount) break;
                        }
                    }
                }

                if (!isScatterSymbol(bestSymbol) && !isCashSymbol(bestSymbol, evalTemplate.jpConfig)) {
                    const dirLabel = isRtl ? '(右至左) ' : '';
                    calculatedResults.push({
                        lineId,
                        symbol: bestSymbol,
                        count: bestCount,
                        payoutMult: bestPayout > 0 ? evalTemplate.paytable[bestSymbol][bestCount - 1] : 0,
                        winAmount: bestPayout,
                        multiplier: bestLineMult > 1 ? bestLineMult : null,
                        symbolsOnLine,
                        positions: [`${dirLabel}${positions.join(', ')}`, ...(bestLineMult > 1 ? [`x${bestLineMult}`] : [])],
                        winCoords
                    });
                    totalWin = safeAdd(totalWin, bestPayout);
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
                const payout = safeMul(payoutMult, parsedBet);

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

                totalWin = safeAdd(totalWin, payout);
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
                            symPayout = safeMul(val, parsedBet);
                        } else {
                            symPayout = val;
                        }
                        totalCashWinValue = safeAdd(totalCashWinValue, symPayout);
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
            const totalCollectionFactor = safeMul(effectiveCollectCount, finalOtherMult);
            const payout = safeMul(totalCashWinValue, totalCollectionFactor);

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
            totalWin = safeAdd(totalWin, payout);
        }

        // === 乘倍處理 ===
        if (activeMultiplier > 1 && totalWin > 0) {
            totalWin = safeMul(totalWin, activeMultiplier);
            calculatedResults.forEach(res => {
                res.winAmount = safeMul(res.winAmount, activeMultiplier);
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
