import { isCashSymbol, isCollectSymbol, isDynamicMultiplierSymbol } from './symbolUtils';

/**
 * 驗證並清洗 AI 回傳的盤面與押注資料
 * @param {Object} responseData - AI 回傳的 JSON (包含 grid 與 bet)
 * @param {Object} template - 遊戲模板配置
 * @param {string[]} availableSymbols - 當前可用的基礎符號清單
 * @returns {Object} { grid, bet } 或是丟出 Error
 */
export function validateVisionResponse(responseData, template, availableSymbols) {
    let parsedGrid = responseData.grid;
    let recognizedBet = responseData.bet !== undefined ? responseData.bet : null;

    // 1. 基本陣列結構檢查
    if (!Array.isArray(parsedGrid) || parsedGrid.length === 0 || !Array.isArray(parsedGrid[0])) {
        // AI 有時候會把 grid 包在一個外層物件裡
        const possibleGrid = Object.values(responseData).find(val => Array.isArray(val) && Array.isArray(val[0]));
        if (possibleGrid) {
            parsedGrid = possibleGrid;
        } else {
            throw new Error("無法解析為二維陣列，可能並非盤面結構。");
        }
    }

    // 2. 盤面尺寸嚴格校驗
    if (parsedGrid.length !== template.rows) {
        throw new Error(`高度不符：預期 ${template.rows} 列，但 AI 回傳了 ${parsedGrid.length} 列。`);
    }

    const displayCols = template.hasMultiplierReel ? template.cols - 1 : template.cols;
    const midRow = Math.floor(template.rows / 2);
    let detectedMultiplier = '';

    // 倍數列處理 (提取中央的倍數)
    if (template.hasMultiplierReel) {
        for (let r = 0; r < template.rows; r++) {
            if (parsedGrid[r] && parsedGrid[r].length >= template.cols) {
                const sym = parsedGrid[r][template.cols - 1];
                if (sym) {
                    const strSym = String(sym);
                    const match = strSym.match(/(\d+(?:\.\d+)?)/);
                    if (match) {
                        detectedMultiplier = "x" + match[0];
                        break;
                    }
                }
            }
        }
    }

    // 行數維度與符號檢查
    const safeGrid = [];
    let unknownSymbolsCount = 0;
    const MAX_UNKNOWN_ALLOWED = Math.max(2, Math.floor((template.rows * displayCols) * 0.15)); // 容許最多 15% 或至少 2 個不認識的符號

    for (let r = 0; r < template.rows; r++) {
        const row = parsedGrid[r];
        if (!Array.isArray(row)) {
             throw new Error(`第 ${r + 1} 列資料錯誤：不是一個陣列。`);
        }

        // 強制檢查 AI 最少要有 displayCols 欄的寬度
        if (row.length < displayCols) {
            throw new Error(`第 ${r + 1} 欄數不符：預期至少 ${displayCols} 欄，但 AI 僅回傳 ${row.length} 欄。`);
        }

        const rowArr = [];
        for (let c = 0; c < template.cols; c++) {
            let sym = row[c] !== undefined && row[c] !== null ? String(row[c]).trim() : '';
            const isMultiplierCol = template.hasMultiplierReel && c === template.cols - 1;

            if (isMultiplierCol) {
                sym = (r === midRow) ? detectedMultiplier : '';
            } else {
                // 一般列檢查合法性
                if (sym !== "") {
                    const isValidBase = availableSymbols.includes(sym);
                    const isCash = isCashSymbol(sym, template?.jpConfig);
                    const isCollect = isCollectSymbol(sym);
                    const isDynamic = template?.hasDynamicMultiplier && isDynamicMultiplierSymbol(sym);
                    
                    // 特殊處理結尾結算字尾（如雙重圖案 _double）
                    const symBase = sym.toLowerCase().endsWith('_double') ? sym.slice(0, -7) : sym;
                    const isValidDoubleBase = availableSymbols.includes(symBase);

                    if (!isValidBase && !isCash && !isCollect && !isDynamic && !isValidDoubleBase) {
                        unknownSymbolsCount++;
                        sym = ''; // 清洗為空字串，防止壞掉
                    }
                }
            }
            rowArr.push(sym);
        }
        safeGrid.push(rowArr);
    }

    if (unknownSymbolsCount > MAX_UNKNOWN_ALLOWED) {
        throw new Error(`過多未知符號 (共 ${unknownSymbolsCount} 個)，疑似 AI 幻覺，已拒絕。`);
    }

    // 3. BET 數值校驗
    if (template.hasBetBox && recognizedBet !== null && recognizedBet !== undefined) {
        // 如果 knownBet 不能被轉為合理的正數數字
        // 將字串內可能的錢幣符號與逗號去除
        const cleanBetStr = String(recognizedBet).replace(/[^0-9.]/g, '');
        const numericBet = Number(cleanBetStr);
        if (isNaN(numericBet) || numericBet <= 0) {
            throw new Error(`押注金額 '${recognizedBet}' 無效。`);
        }
        recognizedBet = numericBet;
    }

    return { grid: safeGrid, bet: recognizedBet };
}
