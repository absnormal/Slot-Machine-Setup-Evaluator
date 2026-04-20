/**
 * AI Prompt 模板集中管理
 * 
 * 所有 Gemini API 的 prompt 文字從此檔匯出。
 * 修改 prompt 不需要改動元件或 hook 邏輯。
 * 
 * 變數插值使用 ${varName} 語法，在呼叫端透過函式參數動態注入。
 */

// ============================================================
// 1. Paytable OCR Prompt (Phase 1 — 賠率表分析)
// ============================================================

/**
 * 賠率表圖片 AI 分析 prompt
 * @returns {string} prompt 文字
 */
export function buildPaytablePrompt() {
    return `請仔細分析圖片中的「老虎機賠率表 (Paytable)」。
任務目標：辨識出圖片中【每一個】圖案符號，以及它對應的連線數量(通常為 5, 4, 3, 2連線，或是雙重符號遊戲中的 10, 9, 8, 7, 6連線)所獲得的「賠率分數」。

命名規則：
1. 若符號上有寫 "WILD"、"百搭"、或取代其他圖案的功能，請統一命名為 "WILD"。
2. 若符號上有寫 "SCATTER" 字樣，請統一在名稱中包含 "SCATTER" (例如: 星星SCATTER)。
3. 若符號有「收集」其他符號分數的功能(如漁夫)，請在名稱中包含 "COLLECT" (若同時也是百搭，請命名為 WILD_COLLECT)。
4. 若符號是帶有數字的現金/金幣，請統一命名為 "CASH" (不用加上數字，這裡是賠率表提取)。
5. 若為英文字母或數字，請直接使用：A, K, Q, J, 10, 9。
6. 若為一般圖案，請根據外觀用「繁體中文」直觀命名 (例如: 金龍, 西瓜, 皇冠)。
7. 符號名稱 (name) 必須是連續字串，不可包含空白或特殊符號。

數值規則：
1. 提取對應的賠率數字。如果某個連線數量(例如 2 連線)沒有標示數字，請補 0。
2. match1 (1連線) 的賠率請一律填寫 0。

請嚴格按照 JSON Schema 回傳陣列 (Array)，包含所有辨識到的符號，絕對不可回傳空陣列或忽略任何圖案！`;
}

/**
 * 賠率表 AI 分析的 response schema
 * @returns {object} Gemini generationConfig
 */
export function buildPaytableGenerationConfig() {
    return {
        responseMimeType: "application/json",
        responseSchema: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING", description: "符號名稱" },
                    match1: { type: "NUMBER", description: "1連線賠率" },
                    match2: { type: "NUMBER", description: "2連線賠率" },
                    match3: { type: "NUMBER", description: "3連線賠率" },
                    match4: { type: "NUMBER", description: "4連線賠率" },
                    match5: { type: "NUMBER", description: "5連線賠率" },
                    match6: { type: "NUMBER", description: "6連線賠率" },
                    match7: { type: "NUMBER", description: "7連線賠率" },
                    match8: { type: "NUMBER", description: "8連線賠率" },
                    match9: { type: "NUMBER", description: "9連線賠率" },
                    match10: { type: "NUMBER", description: "10連線賠率" }
                },
                required: ["name", "match1", "match2", "match3", "match4", "match5"]
            }
        }
    };
}


// ============================================================
// 2. Vision Grid Recognition Prompt (Phase 3 — 盤面辨識)
// ============================================================

/**
 * 產生 CASH/COLLECT 規則文字
 * @param {boolean} hasCashOrCollect - 是否有 CASH 或 COLLECT 符號
 * @param {boolean} collectShowsTotalWin - COLLECT 是否直接顯示總贏分
 * @returns {string}
 */
export function buildCashRule(hasCashOrCollect, collectShowsTotalWin) {
    if (!hasCashOrCollect) {
        return "Ignore small multiplier amounts on coins. Match base symbols only. (Do NOT ignore standard symbols that are numbers, e.g., '7', '10', '9'). ";
    }

    if (collectShowsTotalWin) {
        return "CASH/COLLECT RULES: In this specific game, coin symbols disappear from the grid upon collection, and the summarized win value is displayed directly on the COLLECT symbol itself! If you see a shape that matches a COLLECT symbol from reference images AND it has a numeric value displayed on it, you MUST output it as COLLECT_{full_numeric_value} (e.g., if you see a fisherman with 1500000, output COLLECT_1500000). Do NOT use CASH_ prefix for this. For any empty grid cells left behind by vanished coins, you MUST output \"\" (empty string). Any standalone coins remaining should be CASH_{value}. Convert K=1000, M=1000000. ";
    }

    return "CASH/COLLECT RULES: If a cell contains a coin/token/gem with a numeric value displayed on it, you MUST identify it — do NOT leave it empty. First, check if the shape matches a COLLECT symbol from the reference images. If it is a COLLECT symbol AND has a numeric value (e.g. COLLECT_500 or 1.5M), format it as COLLECT_{full_numeric_value} (e.g., 1.5M → COLLECT_1500000, 500 → COLLECT_500). DO NOT mistake COLLECT symbols as CASH. If it matches COLLECT but has NO explicit number, return the COLLECT symbol name exactly as listed. If it does not match COLLECT but has a standalone numeric value, return it as CASH_{full_numeric_value}. Convert K=1000, M=1000000, B=1000000000. If the symbol functions as BOTH WILD and CASH, you MUST use the format CASH_WILD_{value} (e.g. CASH_WILD_500). ";
}

/**
 * 產生動態乘倍規則
 * @param {boolean} hasDynamicMultiplier
 * @returns {string}
 */
export function buildDynamicMultiplierRule(hasDynamicMultiplier) {
    if (!hasDynamicMultiplier) return "";
    return "SYMBOL MULTIPLIER RULE: In this game, symbols may have a multiplier value attached to them (e.g. x2, 5x, x10). If you see a multiplier on top of a normal symbol, you MUST output the base symbol name followed by '_x{value}' (e.g., if you see an orange with '5x', output '橘子_x5'; if you see WILD with '2x', output 'WILD_x2'). Do NOT separate the symbol and the multiplier. If you see a stand-alone generic multiplier, output exactly 'x{value}'. ";
}

/**
 * 產生乘倍輪規則
 * @param {object} template
 * @returns {string}
 */
export function buildMultiplierReelRule(template) {
    if (!template.hasMultiplierReel) return "";
    return `The LAST column (Reel ${template.cols}) is a MULTIPLIER REEL. In Image 2, there might be a bar with multiple multiplier values (e.g. x1, x2, x3, x5). YOU MUST ONLY extract the "Highlighted" or "Activated" value (usually indicated by being brighter, yellow/gold color, or having a distinct frame vs the dimmed/dark green inactive ones). Output ONLY the format 'xN' (e.g., if you see '5x' or '5', output 'x5') for the center cell (Row ${Math.floor(template.rows / 2) + 1}). Top and bottom cells of this reel are empty, output "". `;
}

/**
 * 產生 BET 辨識規則
 * @param {boolean} hasBetBox
 * @returns {string}
 */
export function buildBetRule(hasBetBox) {
    if (!hasBetBox) return "";
    return `Image 3 is identifying the BET amount. YOU MUST extract the numeric value ONLY (e.g., if you see "$1,000" or "1000", output 1000). Return it in the "bet" field of your JSON response.`;
}

/**
 * 產生選取規則
 * @param {object} template
 * @returns {string}
 */
export function buildPickRule(template) {
    if (template.hasMultiplierReel) {
        return `Rules: For columns 1 to ${template.cols - 1}, pick closest symbol from list only. For the LAST column, do NOT use the list, extract the raw text if any. `;
    }
    return `Rules: Pick closest symbol from list only. `;
}

/**
 * 已知易混淆符號對清單
 */
export const CONFUSABLE_PAIRS = [
    ['二條', '五條'], ['二筒', '五筒'],
    ['二條', '二條'], ['二筒', '五條'],
    ['WILD_元寶', 'SCATTER_錢幣'],
    ['橘子', '檸檬']
];

/**
 * 產生易混淆符號警告
 * @param {string[]} availableSymbols
 * @returns {string}
 */
export function buildConfusableWarning(availableSymbols) {
    const activeConfusables = CONFUSABLE_PAIRS.filter(
        ([a, b]) => availableSymbols.includes(a) && availableSymbols.includes(b)
    );
    if (activeConfusables.length === 0) return '';
    return `CONFUSABLE PAIRS WARNING: The following symbols look very similar. You MUST compare each cell carefully against the reference images before deciding: ${activeConfusables.map(([a, b]) => `${a} vs ${b}`).join(', ')}. Count the exact number of bars/dots/strokes to distinguish them. `;
}

/**
 * 產生主系統 prompt（辨識指令本體）
 * @param {object} template
 * @param {string[]} availableSymbols
 * @param {string} pickRule
 * @param {string} cashRule
 * @param {string} multiplierRule
 * @param {string} dynamicMultiplierRule
 * @param {string} betRule
 * @param {string} confusableWarning
 * @returns {string}
 */
export function buildVisionSystemPrompt(template, availableSymbols, pickRule, cashRule, multiplierRule, dynamicMultiplierRule, betRule, confusableWarning) {
    return `Grid: ${template.rows}R x ${template.cols}C. Symbols: [${availableSymbols.join(',')}]. ${pickRule}${cashRule}${multiplierRule}${dynamicMultiplierRule}${betRule}${confusableWarning}JP names as-is. Dimmed/grayed cells: identify by shape. Truly unrecognizable cells: "". VISUAL EFFECTS: Some cells may be partially obscured by animation effects (sparkles, fire, glow, lightning, smoke, particle trails, shine, win-line highlights). These are NOT part of the symbol. Look THROUGH the effects and identify the underlying symbol based on its visible outline, color, and shape. Winning cells are often the ones with effects, so they are important — do NOT leave them empty just because of visual noise. IMPORTANT: The image has RED grid lines drawn on it to show exact cell boundaries. Analyze each cell INDIVIDUALLY within its red-bordered area. Do NOT let adjacent cell content influence your identification. Scan Row 1 left-to-right first, then Row 2, then Row 3, etc. Always identify each cell as a WHOLE tile/symbol. Do NOT decompose a single tile into sub-parts. For complex symbols (like Mahjong tiles with multiple bars/dots), match the ENTIRE tile pattern against reference images as one unit. If a cell clearly contains a visible symbol or value, you MUST identify it — do not skip it. Return a JSON object with "grid" (${template.rows}x${template.cols} 2D array) and "bet" (number).`;
}

/**
 * 產生 Vision Grid 辨識的 response schema
 * @returns {object}
 */
export function buildVisionGenerationConfig() {
    return {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
            type: "OBJECT",
            properties: {
                grid: {
                    type: "ARRAY",
                    items: {
                        type: "ARRAY",
                        items: { type: "STRING" }
                    }
                },
                bet: { type: "NUMBER" }
            },
            required: ["grid"]
        }
    };
}

/**
 * 乘倍輪補充提示（附加在圖片後）
 * @param {object} template
 * @returns {string}
 */
export function buildMultiplierImagePrompt(template) {
    return `Please extract the symbols from Image 1 for the main grid, and strictly extract the multiplier value for the center cell of the last column (Column ${template.cols}) from Image 2. Output ONLY the format "xN", for example, "5x" or "5" should be returned as "x5". Empty cells in the last column should be "".`;
}

/**
 * BET 圖片辨識提示
 * @returns {string}
 */
export function buildBetImagePrompt() {
    return `Please extract the numeric BET amount from Image 3.`;
}
