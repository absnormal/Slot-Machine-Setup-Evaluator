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

        if (template.hasMultiplierReel && options.globalMultiplier && options.globalMultiplier > 1) {
            activeMultiplier = options.globalMultiplier;
            multiplierSymStr = `x${activeMultiplier.toFixed(2).replace(/\.00$/, '')}`;
        }

        // ── 金額名詞定義 ──
        // parsedBet = 使用者輸入的「總押注」(Total Bet)
        // lineBet   = 每條線的押注 (hasAdjustableLines 時 = parsedBet / 線數，否則 = parsedBet)
        // bestPayout (下方局部變數) = 已算完的最終贏分金額，命名歷史遺留（容易誤會為倍率）
        const parsedBet = parseFloat(betAmount);
        if (isNaN(parsedBet) || parsedBet <= 0) throw new Error('押注金額必須為大於 0 的有效數字。');

        const activeLineCount = options.activeLineCount || evalTemplate.linesCount || 1;
        const activeExBetMult = options.activeExBetMultiplier || null;
        let lineBet;
        if (activeExBetMult && activeExBetMult > 1) {
            lineBet = parsedBet / activeExBetMult;  // 畫面BET → 原BET
        } else if (evalTemplate.hasAdjustableLines && activeLineCount > 0) {
            lineBet = parsedBet / activeLineCount;
        } else if (evalTemplate.hasLineBetDivisor && evalTemplate.lineBetDivisor > 1) {
            lineBet = parsedBet / evalTemplate.lineBetDivisor;
        } else {
            lineBet = parsedBet;
        }

        const calculatedResults = [];
        let totalWin = 0;
        const allPaySymbols = Object.keys(evalTemplate.paytable);

        if (evalTemplate.lineMode === 'allways') {
            // === All Ways 計算（每條路線獨立計算 xN 乘倍，按乘倍值分組顯示）===

            for (const targetSymbol of allPaySymbols) {
                if (isScatterSymbol(targetSymbol)) continue;
                if (isCashSymbol(targetSymbol, evalTemplate.jpConfig)) continue;
                if (isCollectSymbol(targetSymbol) && !isWildSymbol(targetSymbol)) continue;

                // ── Phase 1: 收集每列匹配資料 ──
                const colMatchData = []; // [{ allMults, wildOnlyMults, coords }]
                const winCoords = [];
                let hasTargetSymbol = false;
                let totalUnits = 0;
                let reelsReached = 0;

                for (let col = 0; col < evalTemplate.cols; col++) {
                    const allMults = [];
                    const wildOnlyMults = [];
                    const colCoords = [];
                    let maxUnitsInCol = 0;

                    for (let row = 0; row < evalTemplate.rows; row++) {
                        const sym = safeGrid[row][col];
                        if (!sym) continue;
                        const base = getBaseSymbol(sym, evalTemplate.jpConfig);
                        if (base === targetSymbol || isWildSymbol(sym)) {
                            const m = getSymbolMultiplier(sym);
                            allMults.push(m);
                            colCoords.push({ row, col });
                            maxUnitsInCol = Math.max(maxUnitsInCol, getSymbolCount(sym));
                            if (base === targetSymbol) hasTargetSymbol = true;
                            if (isWildSymbol(sym) && base !== targetSymbol) wildOnlyMults.push(m);
                        }
                    }
                    if (allMults.length === 0) break;
                    colMatchData.push({ allMults, wildOnlyMults, coords: colCoords });
                    winCoords.push(...colCoords);
                    reelsReached++;
                    totalUnits += maxUnitsInCol;
                }

                if (reelsReached < 2 || (!isWildSymbol(targetSymbol) && !hasTargetSymbol)) continue;

                // ── Phase 2: 結算（賠率查表）──
                const payArray = evalTemplate.paytable[targetSymbol];
                const payIndex = Math.min(totalUnits - 1, payArray.length - 1);
                const payoutMult = payIndex >= 0 ? payArray[payIndex] : 0;
                if (payoutMult <= 0) continue;

                const calcType = template.multiplierCalcType;
                const hasAnyMult = colMatchData.some(c => c.allMults.some(m => m > 1));

                // ── Phase 3: 判斷是否需要純 WILD 扣除 ──
                const isPureWildRoute = (routeCells) => {
                    if (isWildSymbol(targetSymbol)) return false;
                    return routeCells.every(cell => cell.isWild);
                };

                // ── Phase 4: 過濾 winCoords（純 WILD 扣除用）──
                let pureWildDeducted = false;
                if (!isWildSymbol(targetSymbol)) {
                    const pureWildPossible = colMatchData.every(c => c.wildOnlyMults.length > 0);
                    if (pureWildPossible) pureWildDeducted = true;
                }
                let finalWinCoords = winCoords;
                if (pureWildDeducted) {
                    const colsWithTarget = new Set();
                    for (const coord of winCoords) {
                        const sym = safeGrid[coord.row][coord.col];
                        const base = getBaseSymbol(sym, evalTemplate.jpConfig);
                        if (base === targetSymbol && !isWildSymbol(sym)) colsWithTarget.add(coord.col);
                    }
                    if (colsWithTarget.size === 1) {
                        finalWinCoords = winCoords.filter(coord => {
                            const sym = safeGrid[coord.row][coord.col];
                            return !(isWildSymbol(sym) && colsWithTarget.has(coord.col));
                        });
                    }
                }

                // ── Phase 5: 結算 — 無 xN 時聚合，有 xN 時按乘倍分組 ──
                if (!hasAnyMult) {
                    // 無 xN：原始聚合格式
                    let ways = colMatchData.reduce((acc, c) => acc * c.allMults.length, 1);
                    if (pureWildDeducted) {
                        ways -= colMatchData.reduce((acc, c) => acc * c.wildOnlyMults.length, 1);
                    }
                    if (ways <= 0) continue;
                    const payout = safeMul(payoutMult, lineBet, ways);
                    calculatedResults.push({
                        lineId: `WAYS_${targetSymbol}`,
                        symbol: targetSymbol,
                        count: reelsReached,
                        ways,
                        payoutMult,
                        winAmount: payout,
                        multiplier: null,
                        symbolsOnLine: [],
                        positions: [`${reelsReached} 連 × ${ways} Ways`],
                        winCoords: finalWinCoords
                    });
                    totalWin = safeAdd(totalWin, payout);
                } else {
                    // 有 xN：枚舉所有路線，按乘倍值分組
                    // 建立每列的格子資訊 [{ mult, isWild, coord }]
                    const colCells = colMatchData.map((col, colIdx) =>
                        col.allMults.map((m, cellIdx) => {
                            const coord = col.coords[cellIdx];
                            const sym = safeGrid[coord.row][coord.col];
                            const base = getBaseSymbol(sym, evalTemplate.jpConfig);
                            return { mult: m, isWild: isWildSymbol(sym) && base !== targetSymbol, coord };
                        })
                    );

                    // 笛卡爾積枚舉，按乘倍分組 { multKey: { ways, routeMult, coords: Set } }
                    const multGroups = {};
                    const enumerateRoutes = (colIdx, accMult, cells, allWild) => {
                        if (colIdx >= colCells.length) {
                            if (allWild && !isWildSymbol(targetSymbol)) return; // 純 WILD 路線排除
                            const finalMult = calcType === 'sum' ? Math.max(1, accMult) : accMult;
                            const key = finalMult;
                            if (!multGroups[key]) multGroups[key] = { routeMult: finalMult, ways: 0, coordSet: new Set() };
                            multGroups[key].ways++;
                            cells.forEach(c => multGroups[key].coordSet.add(`${c.coord.row},${c.coord.col}`));
                            return;
                        }
                        for (const cell of colCells[colIdx]) {
                            let newAcc;
                            if (calcType === 'sum') {
                                newAcc = cell.mult > 1 ? safeAdd(accMult, cell.mult) : accMult;
                            } else {
                                newAcc = cell.mult > 1 ? safeMul(accMult, cell.mult) : accMult;
                            }
                            enumerateRoutes(colIdx + 1, newAcc, [...cells, cell], allWild && cell.isWild);
                        }
                    };
                    enumerateRoutes(0, calcType === 'sum' ? 0 : 1, [], true);

                    // 按乘倍值排序後輸出
                    const sortedGroups = Object.values(multGroups).sort((a, b) => a.routeMult - b.routeMult);
                    for (const group of sortedGroups) {
                        const groupPayout = safeMul(payoutMult, lineBet, group.ways, group.routeMult);
                        const groupCoords = [...group.coordSet].map(s => { const [r, c] = s.split(','); return { row: +r, col: +c }; });
                        const multLabel = group.routeMult > 1 ? ` ×${group.routeMult}` : '';
                        calculatedResults.push({
                            lineId: `WAYS_${targetSymbol}${group.routeMult > 1 ? `_x${group.routeMult}` : ''}`,
                            symbol: targetSymbol,
                            count: reelsReached,
                            ways: group.ways,
                            payoutMult,
                            winAmount: groupPayout,
                            multiplier: group.routeMult > 1 ? group.routeMult : null,
                            symbolsOnLine: [],
                            positions: [`${reelsReached} 連 × ${group.ways} Ways${multLabel}`],
                            winCoords: groupCoords
                        });
                        totalWin = safeAdd(totalWin, groupPayout);
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
