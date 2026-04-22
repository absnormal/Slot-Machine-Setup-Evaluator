/**
 * @file 核心資料結構型別定義
 *
 * 本檔案使用 JSDoc @typedef 為專案中最常使用的資料結構提供型別文件。
 * VS Code IntelliSense 會自動讀取，提供 autocomplete、hover info 和型別檢查。
 *
 * 使用方式：在任何 JS 檔案中加上以下註解即可獲得型別提示
 *   @param {import('../types').SlotTemplate} template
 *   @param {import('../types').Candidate} candidate
 */

// ═══════════════════════════════════════════════
// ROI（Region of Interest）
// ═══════════════════════════════════════════════

/**
 * 螢幕區域定義（百分比座標）
 * @typedef {Object} ROI
 * @property {number} x - 從左邊算起的百分比 (0-100)
 * @property {number} y - 從上方算起的百分比 (0-100)
 * @property {number} w - 區域寬度百分比 (0-100)
 * @property {number} h - 區域高度百分比 (0-100)
 */

// ═══════════════════════════════════════════════
// OCR 數據
// ═══════════════════════════════════════════════

/**
 * OCR 辨識結果（每偵截圖的螢幕讀值）
 * @typedef {Object} OcrData
 * @property {string} win      - 贏分數值（字串形式，如 "125.50"）
 * @property {string} balance  - 餘額數值
 * @property {string} bet      - 押注數值
 * @property {string} [orderId] - 局號/訂單編號（如有啟用 Order ID ROI）
 */

// ═══════════════════════════════════════════════
// 辨識結果
// ═══════════════════════════════════════════════

/**
 * 單張關鍵幀的辨識結果
 * @typedef {Object} RecognitionResult
 * @property {string[][]} grid       - 盤面矩陣 (rows × cols)，每格為符號名稱字串
 * @property {string} win            - OCR 讀到的 WIN 值
 * @property {string} balance        - OCR 讀到的 BALANCE 值
 * @property {string} bet            - OCR 讀到的 BET 值
 * @property {number} betValue       - 解析後的數值型 BET（用於結算）
 * @property {SettlementResult} settlement - 結算引擎的完整結果
 * @property {number} totalWin       - 結算引擎計算的總贏分
 * @property {boolean} [localMatch]  - 是否為本地 HOG 辨識（非 Gemini）
 * @property {number} [avgConfidence] - 本地辨識的平均信心度
 * @property {Array}  [matchDetails]  - 本地辨識的逐格匹配細節
 */

/**
 * 結算引擎輸出
 * @typedef {Object} SettlementResult
 * @property {number} totalWin         - 所有線的總贏分
 * @property {WinLine[]} winLines      - 每條中獎線的詳細資訊
 * @property {Object} [scatterResult]  - SCATTER 結算結果
 * @property {Object} [cashCollectResult] - CASH/COLLECT 結算結果
 */

/**
 * 單條中獎線資訊
 * @typedef {Object} WinLine
 * @property {number} lineIndex  - 線獎編號 (0-based)
 * @property {string} symbol     - 中獎符號名稱
 * @property {number} matchCount - 連續匹配數量
 * @property {number} payout     - 該線的賠付倍率
 * @property {number} winAmount  - 該線的實際贏分
 * @property {number[]} positions - 匹配的位置索引陣列
 */

// ═══════════════════════════════════════════════
// 候選幀（Candidate / Keyframe）
// ═══════════════════════════════════════════════

/**
 * Phase 4 影片偵測產生的候選幀
 * @typedef {Object} Candidate
 * @property {string} id                    - 唯一識別碼 (如 "kf_live_1776760945328")
 * @property {number} time                  - 停輪截圖的影片時間點（秒）
 * @property {HTMLCanvasElement} canvas      - 停輪截圖的完整 canvas
 * @property {string} thumbUrl              - 停輪截圖的縮圖 data URL
 * @property {string} diff                  - 偵測時的幀差值
 * @property {string} avgDiff               - 偵測時的平均差值
 * @property {'pending'|'recognized'|'error'} status - 辨識狀態
 * @property {RecognitionResult|null} recognitionResult - 辨識結果（辨識後才有值）
 * @property {string} error                 - 錯誤訊息
 * @property {boolean} useWinFrame          - true=顯示 WIN 截圖, false=顯示停輪截圖
 *
 * @property {OcrData} [ocrData]            - WIN 特工合併後的 OCR 數據
 * @property {number} [captureDelay]        - 停輪 → WIN 確認的延遲秒數
 * @property {number} [reelStopTime]        - 原始停輪時間（特工合併後設定）
 * @property {HTMLCanvasElement} [winPollCanvas]  - WIN 特工截圖 canvas
 * @property {string} [winPollThumbUrl]     - WIN 特工截圖縮圖 data URL
 * @property {number} [winPollTime]         - WIN 特工截圖的影片時間點
 *
 * @property {number} [spinGroupId]         - smartDedup 分配的旋轉群組 ID
 * @property {boolean} [isSpinBest]         - 是否為該群組的最佳代表幀
 * @property {boolean} [isFGSequence]       - 是否屬於 Free Game 連續序列
 * @property {boolean} [isManual]           - 是否為手動擷取的幀
 *
 * @property {Object} [manualOverride]      - 使用者手動覆寫的 OCR 值
 * @property {string} [manualOverride.win]
 * @property {string} [manualOverride.balance]
 * @property {string} [manualOverride.bet]
 */

// ═══════════════════════════════════════════════
// 模板（SlotTemplate）
// ═══════════════════════════════════════════════

/**
 * 賠付表單一條目
 * @typedef {Object} PaytableEntry
 * @property {string} name            - 符號名稱 (如 "A", "WILD", "SCATTER")
 * @property {number} match1          - 1 連線的賠率
 * @property {number} match2          - 2 連線的賠率
 * @property {number} match3          - 3 連線的賠率
 * @property {number} match4          - 4 連線的賠率
 * @property {number} match5          - 5 連線的賠率
 * @property {number} [match6]        - 6 連線的賠率（Double Symbol 模式）
 * @property {number} [match7]        - 7 連線的賠率
 * @property {number} [match8]        - 8 連線的賠率
 * @property {number} [match9]        - 9 連線的賠率
 * @property {number} [match10]       - 10 連線的賠率
 * @property {string[]} [thumbUrls]   - 符號圖片 URL 陣列
 * @property {string[]} [doubleThumbUrls] - Double 符號圖片 URL 陣列
 */

/**
 * Jackpot 設定
 * @typedef {Object} JpConfig
 * @property {string} [MINI]  - MINI JP 符號名稱（空=未啟用）
 * @property {string} [MINOR] - MINOR JP 符號名稱
 * @property {string} [MAJOR] - MAJOR JP 符號名稱
 * @property {string} [GRAND] - GRAND JP 符號名稱
 */

/**
 * 線獎提取結果（單條線的位置資料）
 * @typedef {Object} LineExtractResult
 * @property {number} id      - 線獎編號
 * @property {number[]} data  - 每列的位置索引 (長度=cols)
 */

/**
 * 完整的老虎機模板（由 useTemplateBuilder 建構）
 * @typedef {Object} SlotTemplate
 * @property {string} name                     - 遊戲名稱
 * @property {number} rows                     - 盤面列數 (通常 3-6)
 * @property {number} cols                     - 盤面行數 (通常 5)
 * @property {'paylines'|'allways'|'symbolcount'} lineMode - 結算模式
 * @property {number} linesCount               - 線獎/路數總數
 * @property {number[][]} lines                - 線獎位置定義陣列
 * @property {Object<string, number[]>} paytable - 賠付表 { 符號名: [match1~match5+] }
 * @property {Object<string, string>} symbolImages    - 符號圖片 { 名稱: URL }
 * @property {Object<string, string[]>} symbolImagesAll - 符號全部圖片 { 名稱: URL[] }
 * @property {JpConfig} jpConfig               - Jackpot 設定
 * @property {boolean} hasMultiplierReel        - 是否有乘數轉軸
 * @property {boolean} requiresCollectToWin     - 是否需要 COLLECT 符號才能兌現
 * @property {boolean} hasDoubleSymbol          - 是否啟用 Double Symbol
 * @property {boolean} hasDynamicMultiplier     - 是否有動態乘數
 * @property {string} multiplierCalcType        - 乘數計算方式 ('sum'|'product')
 * @property {boolean} hasBidirectionalPaylines - 是否啟用雙向連線
 * @property {boolean} hasAdjustableLines       - 是否支援可調整線數
 */

// ═══════════════════════════════════════════════
// 分局群組（GroupWithMath）
// ═══════════════════════════════════════════════

/**
 * smartDedup 後的分局群組（含連續性驗算）
 * @typedef {Object} GroupWithMath
 * @property {string|number} gid       - 群組 ID（數字=正常群組, "ungrouped_xxx"=未分組）
 * @property {Array<{kf: Candidate, idx: number}>} group - 該群組內的所有候選幀
 * @property {Candidate} bestFrame     - 群組內的最佳代表幀
 * @property {number} bal              - 最佳幀的 BALANCE
 * @property {number} win              - 最佳幀的 WIN
 * @property {number} bet              - 最佳幀的 BET
 * @property {boolean} mathValid       - BAL+BET 是否等於上局結餘（連續性驗證）
 * @property {number} mathState        - 驗算狀態 (0=無數據, 1=首局無贏, 2=首局有贏, 3=贏分差異, 4=FG)
 * @property {number} mathDiff         - 實際差異值
 * @property {number|null} expectedBase - 預期的上局結餘
 * @property {boolean} isFGSequence    - 是否為 Free Game 序列
 */

export {};
