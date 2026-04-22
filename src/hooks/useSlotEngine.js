import { useState, useCallback, useEffect, useMemo } from 'react';
import { isCashSymbol, isWildSymbol } from '../utils/symbolUtils';
import { computeGridResults } from '../engine/computeGridResults';

export function useSlotEngine({ template, enableBidirectional = false }) {
    const defaultPanelGrid = Array.from({ length: 3 }, () => Array(5).fill(''));

    const [panelGrid, setPanelGrid] = useState(defaultPanelGrid);
    const [betInput, setBetInput] = useState(100);
    const [calcResults, setCalcResults] = useState(null);
    const [calculateError, setCalculateError] = useState('');
    const [hoveredLineId, setHoveredLineId] = useState(null);
    const [showAllLines, setShowAllLines] = useState(false);

    // Adjustable line count (null = all lines)
    const [activeLineCount, setActiveLineCount] = useState(null);

    const [panelInputMode, setPanelInputMode] = useState('paint');
    const [activeBrush, setActiveBrush] = useState('');

    const [showPtModal, setShowPtModal] = useState(false);

    const availableSymbols = useMemo(() => {
        if (!template) return [];
        const result = [];
        const added = new Set();

        const addSymbol = (sym) => {
            if (!added.has(sym)) {
                result.push(sym);
                added.add(sym);
            }
        };
        
        // Add base symbols from paytable, grouped with their variants
        if (template.paytable) {
            Object.keys(template.paytable).forEach(sym => {
                // Skip _xN variants in the first pass to group them with their base
                if (sym.endsWith('_xN')) return;

                addSymbol(sym);

                // Add Double variant right after base
                if (template.hasDoubleSymbol && template.symbolImages?.[`${sym}_double`]) {
                    addSymbol(`${sym}_double`);
                }

                // Add _xN variant right after base
                if (template.paytable[`${sym}_xN`]) {
                    addSymbol(`${sym}_xN`);
                }
            });

            // Second pass: catch any remaining symbols (e.g. standalone xN or custom _xN without base)
            Object.keys(template.paytable).forEach(sym => {
                addSymbol(sym);
            });
        }

        if (template.jpConfig) {
            Object.keys(template.jpConfig).forEach(jp => {
                if (jp.trim() !== '' && template.jpConfig[jp] !== '') {
                    const jpSym = jp.toUpperCase();
                    addSymbol(jpSym);
                    if (template.hasDoubleSymbol && template.symbolImages?.[`${jpSym}_double`]) {
                        addSymbol(`${jpSym}_double`);
                    }
                }
            });
        }
        
        return result;
    }, [template]);

    useEffect(() => {
        if (template && template.rows && template.cols) {
            setPanelGrid(prev => {
                const currentRows = prev.length;
                const currentCols = prev[0]?.length || 0;
                if (currentRows !== template.rows || currentCols !== template.cols) {
                    const newGrid = Array.from({ length: template.rows }, () => Array(template.cols).fill(''));
                    if (template.hasMultiplierReel) {
                        const midRow = Math.floor(template.rows / 2);
                        const lastCol = template.cols - 1;
                        if (newGrid[midRow]) newGrid[midRow][lastCol] = "x1";
                    }
                    return newGrid;
                }
                return prev;
            });
        }
    }, [template]);

    useEffect(() => {
        if (template && availableSymbols.length > 0) {
            const isMultiplierBrush = activeBrush && activeBrush.startsWith('x');
            if (activeBrush !== '' && (!availableSymbols.includes(activeBrush) && !isCashSymbol(activeBrush) && !isMultiplierBrush)) {
                setActiveBrush(availableSymbols.includes('WILD') ? 'WILD' : availableSymbols[0]);
            }
        }
    }, [template, availableSymbols, activeBrush]);

    const generateRandomPanelGrid = useCallback((rows, cols, symbols, hasMultiplierReel = false) => {
        if (!symbols || symbols.length === 0) return [];
        const grid = [];
        for (let r = 0; r < rows; r++) {
            const rowArr = [];
            for (let c = 0; c < cols; c++) {
                if (hasMultiplierReel && c === cols - 1) {
                    if (r === Math.floor(rows / 2)) {
                        rowArr.push("x1");
                    } else {
                        rowArr.push("");
                    }
                    continue;
                }
                let sym = symbols[Math.floor(Math.random() * symbols.length)];
                if (sym === 'CASH') {
                    sym = `CASH_${[0.5, 1, 2, 5, 10][Math.floor(Math.random() * 5)]}`;
                }
                rowArr.push(sym);
            }
            grid.push(rowArr);
        }
        return grid;
    }, []);

    const handleRandomizePanel = useCallback(() => {
        if (!template) return;
        const allSymbols = Object.keys(template.paytable);
        setPanelGrid(generateRandomPanelGrid(template.rows, template.cols, allSymbols, template.hasMultiplierReel));
    }, [template, generateRandomPanelGrid]);

    const handleClearPanel = useCallback(() => {
        if (!template) return;
        const grid = Array.from({ length: template.rows }, () => Array(template.cols).fill(''));
        if (template.hasMultiplierReel) {
            const midRow = Math.floor(template.rows / 2);
            const lastCol = template.cols - 1;
            if (grid[midRow]) grid[midRow][lastCol] = "x1";
        }
        setPanelGrid(grid);
    }, [template]);

    const getSafeGrid = useCallback((sourceGrid) => {
        if (!template || (!sourceGrid && !panelGrid)) return [];
        const gridData = sourceGrid || panelGrid;
        const grid = [];
        for (let r = 0; r < template.rows; r++) {
            const rowArr = [];
            for (let c = 0; c < template.cols; c++) {
                rowArr.push(gridData[r]?.[c] || '');
            }
            grid.push(rowArr);
        }
        return grid;
    }, [template, panelGrid]);

    const handleGridPaste = useCallback((e, startRow, startCol) => {
        const pasteData = e.clipboardData.getData('Text');
        if (!pasteData || !template) return;
        e.preventDefault();

        setPanelGrid(prev => {
            const newGrid = prev.map(row => [...row]);
            const pastedRows = pasteData.trim().split(/\r?\n/);

            for (let i = 0; i < pastedRows.length; i++) {
                const r = startRow + i;
                if (r >= template.rows) break;

                let pastedCells;
                if (pastedRows[i].includes('\t')) {
                    pastedCells = pastedRows[i].split('\t');
                } else {
                    pastedCells = pastedRows[i].trim().split(/[\s]+/);
                }

                for (let j = 0; j < pastedCells.length; j++) {
                    const c = startCol + j;
                    if (c >= template.cols) break;

                    if (pastedCells[j] !== undefined) {
                        while (newGrid.length <= r) newGrid.push([]);

                        let targetValue = pastedCells[j];
                        // Allow values in any row of the last column if it's a multiplier reel
                        newGrid[r][c] = targetValue;
                    }
                }
            }
            return newGrid;
        });
    }, [template]);

    const handleCellChange = useCallback((rIndex, cIndex, newValue) => {
        setPanelGrid(prev => {
            const newGrid = prev.map(row => [...row]);
            while (newGrid.length <= rIndex) newGrid.push([]);

            let targetValue = newValue;
            // Allow values in any row of the last column if it's a multiplier reel
            newGrid[rIndex][cIndex] = targetValue;
            return newGrid;
        });
    }, [template]);

    const computeGridResultsCb = useCallback((targetGrid, betAmount) => {
        return computeGridResults(template, targetGrid, betAmount, { enableBidirectional, activeLineCount });
    }, [template, enableBidirectional, activeLineCount]);

    useEffect(() => {
        const { results, error } = computeGridResultsCb(panelGrid, betInput);
        setCalcResults(results);
        setCalculateError(error);
    }, [panelGrid, betInput, computeGridResultsCb]);

    return {
        panelGrid, setPanelGrid,
        betInput, setBetInput,
        calcResults, setCalcResults,
        calculateError, setCalculateError,
        hoveredLineId, setHoveredLineId,
        showAllLines, setShowAllLines,
        panelInputMode, setPanelInputMode,
        activeBrush, setActiveBrush,
        showPtModal, setShowPtModal,
        availableSymbols,
        generateRandomPanelGrid,
        handleRandomizePanel,
        handleClearPanel,
        getSafeGrid,
        handleGridPaste,
        handleCellChange,
        computeGridResultsCb,
        activeLineCount, setActiveLineCount
    };
}
