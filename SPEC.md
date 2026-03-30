# 老虎機線獎辨識工具 — 完整功能規範書

> **版本**: 2026-03-30  
> **目的**: 記錄本工具的所有功能、行為規範與細部規則，**任何改動前必須先比對此文件，確保不會破壞既有行為**。

---

## 目錄

1. [架構總覽](#1-架構總覽)
2. [Phase 1：模板建立與設定](#2-phase-1模板建立與設定)
3. [Phase 2：手動盤面設定與結算](#3-phase-2手動盤面設定與結算)
4. [Phase 3：AI 實機截圖辨識](#4-phase-3ai-實機截圖辨識)
5. [Phase 4：影片自動偵測截圖](#5-phase-4影片自動偵測截圖)
6. [結算引擎核心邏輯](#6-結算引擎核心邏輯)
7. [符號系統分類規則](#7-符號系統分類規則)
8. [全域快捷鍵](#8-全域快捷鍵)
9. [Phase 間盤面傳送機制](#9-phase-間盤面傳送機制)
10. [雲端模板儲存與載入](#10-雲端模板儲存與載入)
11. [本地匯出與匯入](#11-本地匯出與匯入)
12. [資產追蹤系統](#12-資產追蹤系統)
13. [Template 物件完整欄位規格](#13-template-物件完整欄位規格)
14. [開發注意事項與常見錯誤](#14-開發注意事項與常見錯誤)

---

## 1. 架構總覽

```
App.jsx (頂層狀態管理與 Phase 間的膠水邏輯)
├── hooks/useTemplateBuilder.js  — Phase 1 模板建立核心 Hook
├── hooks/useSlotEngine.js       — Phase 2 結算引擎 Hook
├── hooks/useGeminiVision.js     — Phase 3 AI 辨識 Hook
├── hooks/useVideoProcessor.js   — Phase 4 影片偵測 Hook
├── hooks/useCloud.js            — 雲端 CRUD Hook
├── hooks/useLightbox.js         — 圖片放大燈箱
├── hooks/useCanvasDrag.js       — Canvas 拖曳操作
├── engine/computeGridResults.js — 結算計算純函式
├── utils/symbolUtils.js         — 符號分類/判斷輔助函式
├── utils/helpers.js             — 通用工具
├── utils/constants.js           — GAS_URL / apiKey 常數
└── components/
    ├── Phase1Setup.jsx   — Phase 1 設定介面
    ├── Phase2Manual.jsx  — Phase 2 手動盤面
    ├── Phase3Vision.jsx  — Phase 3 AI 辨識
    ├── Phase4Video.jsx   — Phase 4 影片偵測
    ├── ResultView.jsx    — 結算結果面板（Phase 2 和 Phase 3 共用）
    ├── CloudModal.jsx    — 雲端模板庫彈窗
    ├── AppHeader.jsx     — 頂部標頭
    ├── SettingsModal.jsx — 設定彈窗（API Key）
    └── ToastMessage.jsx  — Toast 訊息元件
```

### 手風琴（Accordion）折疊機制

- 同一時間最多只能有一個 Phase 處於「展開」狀態。
- 當點擊某個 Phase 標題列時：
  - 若它目前為「折疊」→ 展開它，並折疊其他所有 Phase。
  - 若它目前為「展開」→ 僅折疊它自己。
- 此邏輯定義在 `App.jsx` 的 `handlePhaseToggle` 中。

---

## 2. Phase 1：模板建立與設定

### 2.1 基本資訊
| 欄位 | 說明 |
|---|---|
| 平台名稱 (`platformName`) | 例：`金銀島` |
| 遊戲名稱 (`gameName`) | 例：`High Noon` |
| 盤面列數 (`gridRows`) | 預設 `3` |
| 盤面行數 (`gridCols`) | 預設 `5` |

### 2.2 線獎模式 (`lineMode`)
| 值 | 說明 |
|---|---|
| `paylines` | 固定線獎。需搭配連線圖（由圖片提取或純文字輸入）。 |
| `allways` | All Ways（全路線）。自動計算 `rows^cols` 種組合。 |
| `symbolcount` | 消除模式（Pay Anywhere）。不看位置，只計數量。 |

- 若 `lineMode === 'paylines'`，需有 `extractResults`（每條線路的行座標陣列）。
- 若 `lineMode === 'allways'`，`linesCount` 自動計算為 `Math.pow(rows, cols)`。

### 2.3 Q&A 設定問題（於 Phase1Setup.jsx 的問卷區）

| 題號 | 狀態名 | 預設值 | 說明 |
|---|---|---|---|
| 1 | `hasJackpot` | `false` | 是否有累積獎金 (JP)。若有，展開 JP 面額設定 (MINI/MINOR/MAJOR/GRAND)。 |
| 2 | `hasMultiplierReel` | `false` | 是否有全盤乘倍（專用乘倍滾輪列）。若有，盤面最右方自動加一行乘倍列。 |
| 3 | `hasDoubleSymbol` | `false` | 是否有 DOUBLE 符號（一格算兩格）。 |
| 3-1 | `hasDynamicMultiplier` | `false` | 是否有動態乘倍符號 `xN`。 |
| 4 | `requiresCollectToWin` | `true` | CASH 是否需要 COLLECT 才得分。`false` 表示自動收集（漁機模式）。 |
| 4-1 | (附屬 Q4) | — | 收集計算是否顯示 Total Win。 |
| 4-2 | (附屬 Q4) | — | 其他收集設定。 |
| 5 | `multiplierCalcType` | `product` | 乘倍計算方式。`product` = 相乘，`sum` = 相加。 |

#### 動態乘倍符號 (Q3-1) 備註文字
> 動態乘倍符號：視作 WILD 且共用賠率，連線贏分乘以該數字。  
> 若有，賠付表資料設定會有 "xN" 符號，賠率預設為 0。

### 2.4 線獎資料提取
- **圖片模式** (`linesTabMode === 'image'`)：上傳線獎圖片，框選起終點，透過 Canvas 色彩分析提取。
- **純文字模式** (`linesTabMode === 'text'`)：直接輸入每條線路的列座標（空格分隔，換行分條）。

### 2.5 賠付表 (`paytable`)
- **圖片模式** (`paytableMode === 'image'`)：上傳賠率表截圖，透過 Gemini AI OCR 自動辨識符號名稱與賠率。
- **純文字模式** (`paytableMode === 'text'`)：手動輸入，格式為 `符號名 賠率1 賠率2 … 賠率N`。
- AI OCR 完成後，會自動建立 `ptResultItems`（含符號名、賠率欄位 match1~match10、縮圖 thumbUrls）。
- 若賠付表中沒有 `WILD` 符號，系統會**自動補上**一筆 `WILD 0 0 0 0 0`。

### 2.6 符號縮圖裁切
- `ptResultItems` 中的每個符號可存放 `thumbUrls`（標準縮圖陣列）與 `doubleThumbUrls`（DOUBLE 版本縮圖）。
- 縮圖用於 Phase 2 畫筆選擇器、Phase 3 預覽格子的圖片渲染。
- 上傳至雲端時，縮圖會自動壓縮至 48px / JPEG / 0.4 品質。

### 2.7 建立模板按鈕
- 呼叫 `handleBuildTemplate()`，驗證所有必要資料後組裝 `template` 物件。
- 建立成功後自動：折疊 Phase 1、展開 Phase 2、折疊 Phase 3。

---

## 3. Phase 2：手動盤面設定與結算

### 3.1 輸入模式
| 模式 | 說明 |
|---|---|
| `paint`（畫筆） | 從符號選擇器選擇畫筆，點擊或拖曳網格填色。 |
| `text`（鍵盤） | 每格直接輸入符號名稱字串。支援 Clipboard Paste 批次貼入。 |

### 3.2 畫筆選擇器規則
- 來源：`availableSymbols`，由 `useSlotEngine` 根據 `template.paytable` 與 `jpConfig` 動態產生。
- 每個畫筆格子的圖片由 `getSymbolDisplayImage()` 決定。
- **動態乘倍符號 (`xN`) 的畫筆**：底圖使用 WILD 的圖片，上方疊加白色 `"xN"` 文字。標籤僅顯示 `"xN"`（不是 `"xN設定"`）。
- **CASH 類符號**：點擊時彈出金幣數值輸入彈窗。
- **動態乘倍符號**：點擊時彈出「設定乘倍數值」彈窗（非金幣）。
- **JP 符號 (MINI/MINOR/MAJOR/GRAND)**：直接放置，面額由 `jpConfig` 決定（固定值）。

### 3.3 盤面格子渲染規則
- 有圖片 → 顯示圖片。
- 若為 CASH/COLLECT 且有數值 → 疊加金額文字。
- 若為 JP 類 → 顯示 `{面額}x` 格式。
- 若為動態乘倍符號 → 底圖使用 WILD，疊加 `xN` 或 `x{倍數}` 白色文字。
- 若為 DOUBLE 變體 → 右上角顯示 `"2X"` 小徽章。
- 無資料 → 顯示空心圓點。

### 3.4 隨機盤面
- `handleRandomizePanel()` 從 `template.paytable` 的 keys 中隨機填入。
- 若有乘倍列 (`hasMultiplierReel`)，最右列僅中間行放 `"x1"`，其餘留空。

### 3.5 清除盤面
- 將所有格子清為空字串 `''`。乘倍列復位為 `"x1"` 在中間行。

### 3.6 結算
- 自動觸發：當 `panelGrid` 或 `betInput` 變化時，`useEffect` 自動呼叫 `computeGridResults()`。
- 結果顯示在右側的 `ResultView` 元件。

### 3.7 標題列「返回 AI 辨識 (↓)」按鈕
- 呼叫 `handleReturnToVision()`，將 Phase 2 手動盤面回傳至 Phase 3。
- 標題列的 ↓ 折疊箭頭也綁定了此傳送行為（展開時點擊 = 傳送+折疊）。

---

## 4. Phase 3：AI 實機截圖辨識

### 4.1 圖片管理
- 支援多張截圖同時上傳（縮圖列顯示）。
- 可左右切換、刪除個別圖片。
- 每張圖片獨立儲存 `grid`（辨識結果）、`error`、`bet`。

### 4.2 框選 ROI
- 主框選區域 (`visionP1`)：框選遊戲盤面範圍。
- 乘倍框選 (`visionP1Mult`)：框選乘倍列（若 `hasMultiplierReel`）。
- BET 框選 (`visionP1Bet`)：框選押注金額顯示位置（若 `hasBetBox`）。
- 框選座標以百分比儲存，持久化於 `localStorage`。

### 4.3 AI 批次辨識
- `performAIVisionBatchMatching()`：依序對所有未辨識的圖片呼叫 Gemini API。
- 可中途取消 (`cancelVisionProcessing`)。
- 辨識結果存入各圖片的 `.grid` 屬性。
- BET 辨識結果存入 `.bet` 屬性。

### 4.4 盤面預覽
- AI 辨識完成後，在左側顯示唯讀的小盤面預覽。
- 渲染規則與 Phase 2 一致（圖片優先、CASH 面額疊加、動態乘倍 `xN` 疊加等）。

### 4.5 「傳送至 Phase 2 手動調整 (↑)」按鈕
- 呼叫 `handleTransferVisionToManual()`，將 Phase 3 辨識盤面與押注金額傳送至 Phase 2。
- Phase 3 標題列的 ↑ 箭頭也綁定了此傳送行為（展開時點擊 = 傳送+折疊）。

---

## 5. Phase 4：影片自動偵測截圖

### 5.1 影片上傳與播放
- 上傳 MP4 影片後在左側播放器預覽。

### 5.2 動態偵測系統
- 使用 Canvas 差異偵測 (Motion Detection)。
- 狀態機：`IDLE → SPINNING → SETTLING → CAPTURE → IDLE`。
- 參數：`sensitivity`、`motionCoverageMin`、`motionDelay`、`vLineThreshold`。

### 5.3 ROI 框選
- `reelROI`：盤面框選。
- `winROI`：贏分框選。
- `balanceROI`：餘額框選。
- `betROI`：押注金額框選。

### 5.4 傳送至 Phase 3
- `handleTransferPhase4ToPhase3()`：將所有已截取的圖片轉換為 Phase 3 格式。
- 同步 ROI 位置到 Phase 3 的 `visionP1` 與 `visionP1Bet`。
- 自動啟用 `hasBetBox`。
- 傳送後自動清空 Phase 4 截圖。

---

## 6. 結算引擎核心邏輯

> 檔案：`engine/computeGridResults.js`

### 6.1 全盤乘倍列 (`hasMultiplierReel`)
- 最右一行為乘倍列，不參與線獎計算。
- 結算前自動將盤面裁切為 `cols - 1`。
- 遍歷乘倍列所有行，將所有 `xN` 相乘得到 `activeMultiplier`。
- 最終 `totalWin *= activeMultiplier`，每筆明細也同步調整。

### 6.2 固定線獎模式 (`paylines`)
1. 逐條線路遍歷：取出線路上每格的符號。
2. 對每種賠付表符號，從左向右連續匹配：
   - 符號本身匹配 **或** 該格是 WILD 符號。
   - 遇到不匹配就中斷。
3. DOUBLE 符號算 2 個單位。
4. 取最大賠付的符號作為該線路的最佳結果。
5. 線上乘倍 (`xN`)：連線中的符號若帶有 `getSymbolMultiplier > 1`，依 `multiplierCalcType` 相乘或相加。

### 6.3 All Ways 模式 (`allways`)
1. 對每種賠付表符號，逐行前進：
   - 統計每行中匹配（含 WILD）的格子數 → 作為 `ways` 累乘值。
   - 若某行完全無匹配格子則中斷。
2. `payoutMult × bet × ways × lineMultiplier`。

### 6.4 消除模式 (`symbolcount`)
1. 統計盤面中每種符號的總數（含 WILD 替補、DOUBLE 算雙）。
2. `payoutMult × bet × lineMultiplier`。

### 6.5 SCATTER 計算
- 全盤面掃描，不受位置與線路限制。
- `count → paytable[SCATTER][count-1] × bet`。

### 6.6 CASH / COLLECT 計算
1. 掃描盤面中所有 `isCashSymbol` 並累加其 `getCashValue`。
   - JP 類符號：`value × bet`。
   - 一般 CASH：直接用面值。
2. 掃描盤面中所有 `isCollectSymbol` 作為收集倍數。
3. 若 `requiresCollectToWin === false`（自動收集），即使無 COLLECT 符號也視為至少 1 倍。
4. COLLECT 符號的 `getSymbolMultiplier` 也會加入倍數。
5. 非連線乘倍（如盤面上獨立的 `xN`）也會被計入 `otherGridMultiplier`。
6. `totalPayout = totalCashValue × effectiveCollectCount × otherGridMultiplier`。

### 6.7 乘倍計算類型 (`multiplierCalcType`)
| 值 | 行為 |
|---|---|
| `product` | 多個乘倍相乘：`x2 × x3 = x6` |
| `sum` | 多個乘倍相加：`x2 + x3 = x5`，最終取 `max(1, sum)` |

### 6.8 排序規則
- `SCATTER_*` 和 `COLLECT_FEATURE` 排在最前面。
- 一般線獎依 `lineId` 數字升序排列。

---

## 7. 符號系統分類規則

> 檔案：`utils/symbolUtils.js`

| 函式 | 判定規則 |
|---|---|
| `isScatterSymbol(sym)` | 名稱含 `SCATTER`（不分大小寫）|
| `isCollectSymbol(sym)` | 名稱含 `COLLECT`（不分大小寫）|
| `isDynamicMultiplierSymbol(sym)` | 符合 `^x\d+$`、`^WILD_x\d+$` 或 `^xN$`（不分大小寫）|
| `isWildSymbol(sym)` | 名稱含 `WILD` **或** `isDynamicMultiplierSymbol` 為 true |
| `isJpSymbol(sym, jpConfig)` | 名稱（大寫）存在於 `jpConfig` 的 keys 中 |
| `isDoubleSymbol(sym)` | 名稱以 `_double` 結尾（不分大小寫）|
| `isCashSymbol(sym, jpConfig)` | 以 `CASH` 開頭 **或** `isJpSymbol` 為 true |
| `getSymbolCount(sym)` | DOUBLE → 2，其餘 → 1 |
| `getSymbolMultiplier(sym)` | 解析 `_xN` 後綴或 `xN` 前綴，預設 1 |
| `getBaseSymbol(sym, jpConfig)` | 剝除 `_double` → 剝除 `_xN` → CASH/COLLECT 去值部分 |
| `getCashValue(sym, jpConfig)` | JP → `jpConfig[sym]`，CASH → 解析最後一段 `_value` |
| `getCollectValue(sym)` | 同 `getCashValue` 邏輯，針對 COLLECT |
| `formatShorthandValue(num)` | K/M/B 簡寫格式化 |
| `parseShorthandValue(str)` | K/M/B 字串解析回數字 |
| `getSymbolDisplayImage(sym, symbolImages, jpConfig)` | 圖片查找：完整名 → 基底名 → 模糊匹配（同類別）|

### 動態乘倍符號 (`xN`) 關鍵規則
1. `isDynamicMultiplierSymbol` 判斷格式：`x5`、`x10`、`WILD_x5`、`xN`。
2. `isWildSymbol` 回傳 `true`（動態乘倍視作 WILD）。
3. `getBaseSymbol` 將 `x5`、`x10` 統一回傳 `xN`；但 `xN` 本身保留。
4. `getSymbolDisplayImage` 查找順序：先找 `xN` 的圖 → 找不到就 fallback 到 `WILD` 的圖。
5. Phase 2/3 的盤面格子，**動態乘倍符號無條件疊加白色 `xN` 或 `x{數值}` 文字**。

---

## 8. 全域快捷鍵

> 定義在 `App.jsx` 的兩個 `useEffect` 中。

### 8.1 方向鍵（上下切換 Phase 與盤面傳送）
| 目前展開的 Phase | 按鍵 | 行為 |
|---|---|---|
| Phase 2 | `ArrowDown (↓)` | **傳送盤面回 Phase 3** (`handleReturnToVision`) + 切換 |
| Phase 3 | `ArrowUp (↑)` | **傳送盤面至 Phase 2** (`handleTransferVisionToManual`) + 切換 |
| 其他任何 Phase | `ArrowUp / ArrowDown` | 單純切換至上/下一個 Phase（無盤面傳送）|

- **前提**：焦點不在 `INPUT` / `TEXTAREA` / `SELECT` 元素上。

### 8.2 Enter 鍵
| 目前展開的 Phase | 行為 |
|---|---|
| Phase 1 | 建立模板 (`handleBuildTemplate`) |
| Phase 2 | 將當前贏分加入總資產 |
| Phase 3 | 將當前 AI 辨識贏分加入總資產 |

- **前提**：焦點不在 `INPUT` / `TEXTAREA` 元素上。

---

## 9. Phase 間盤面傳送機制

### 9.1 Phase 3 → Phase 2 (`handleTransferVisionToManual`)
1. 檢查 `activeVisionImg.grid` 是否存在。若無，僅切換面板。
2. 深拷貝盤面：`activeVisionImg.grid.map(row => [...row])`。
3. `setPanelGrid(newGrid)` 寫入 Phase 2 狀態。
4. `setBetInput(visionBetInput)` 同步押注。
5. 折疊 Phase 3，展開 Phase 2。
6. 顯示 Toast 訊息。

### 9.2 Phase 2 → Phase 3 (`handleReturnToVision`)
1. 若有 `activeVisionId`：
   - 深拷貝盤面：`panelGrid.map(row => [...row])`。
   - 更新 `visionImages` 中對應圖片的 `.grid`。
   - 同步 `betInput → visionBetInput`。
2. 展開 Phase 3，折疊 Phase 2。
3. 顯示 Toast 訊息。

### 9.3 Phase 4 → Phase 3 (`handleTransferPhase4ToPhase3`)
1. 將 `capturedImages` 轉換為帶有 `Image` 對象的格式。
2. 同步 ROI (`reelROI → visionP1`, `betROI → visionP1Bet`)。
3. 啟用 `hasBetBox`。
4. 追加到 `visionImages` 陣列。
5. 自動選中第一張新圖片。
6. 清空 Phase 4 截圖。

### 9.4 Phase 2/3 標題列箭頭的整合行為
- **Phase 2 標題列右側 ↑↓ 箭頭**：展開時點擊 = 呼叫 `onReturn()`（傳送+折疊）；折疊時點擊 = `onToggle()`（單純展開）。
- **Phase 3 標題列**：展開時點擊標題列 = 呼叫 `onTransfer()`（傳送+折疊）；折疊時點擊 = `onToggle()`（單純展開）。

---

## 10. 雲端模板儲存與載入

> 檔案：`hooks/useCloud.js`

### 10.1 儲存 (`saveTemplateToCloud`)
**必須包含的欄位**（任何新增的 Template 狀態都必須在此處同步更新）：

```
templateName, generatedName, platformName, gameName,
gridRows, gridCols, lineMode, extractResults,
paytableInput, ptResultItems, jpConfig, hasJackpot,
hasMultiplierReel, requiresCollectToWin, hasDoubleSymbol,
hasDynamicMultiplier, multiplierCalcType,
localUserId (creatorId), actualForceId
```

> ⚠️ **重要**：新增狀態時，必須同時更新：  
> (1) 函式的**參數解構宣告**  
> (2) `newTemplate` 物件的**屬性列表**  
> (3) `App.jsx` 的 `handleSaveToCloud` 呼叫處

### 10.2 載入 (`loadCloudTemplate`)
- 從 `getTemplateData(id)` 取得完整資料。
- 逐欄位設定 state（含向下相容的 fallback 預設值）。
- 最後呼叫 `performAutoBuild(data)` 自動建構模板。

### 10.3 衝突偵測
- 儲存前比對 `platformName + gameName`（忽略大小寫），若已存在則顯示覆寫確認。

### 10.4 縮圖壓縮
- 上傳前自動將 `thumbUrls` 壓縮至 48px/JPEG/0.4 品質。
- Payload 上限 50KB（Google Sheets 單格限制）。

---

## 11. 本地匯出與匯入

### 11.1 匯出 (`handleExportLocalTemplate`)
- 匯出為 JSON 檔案。
- 檔名格式：`{平台}-{遊戲}.json` 或 `slot_template_{rows}x{cols}_{lines}lines.json`。
- 包含的欄位與雲端儲存一致（含 `hasDynamicMultiplier`）。

### 11.2 匯入 (`handleImportLocalTemplate`)
- 讀取 JSON → 逐欄位設定 state → 呼叫 `performAutoBuild(data)`。
- 向下相容：若 JSON 中缺少新欄位，使用安全的 fallback 預設值。

---

## 12. 資產追蹤系統

| 項目 | 說明 |
|---|---|
| `totalBalance` | 累計資產餘額，持久化於 `localStorage` (`slot_total_balance`)。 |
| 展開/收合 | `isBalanceExpanded` 控制餘額面板是否展開。 |
| Enter 鍵更新 | Phase 2/3 展開時按 Enter，將當前面板的 `totalWin` 加入 `totalBalance`。 |
| Phase 2/3 的 ResultView | 皆有「更新資產」按鈕可手動執行。 |

---

## 13. Template 物件完整欄位規格

`template` 物件由 `handleBuildTemplate()` 或 `performAutoBuild()` 產生：

```javascript
{
  rows: number,                    // 盤面列數
  cols: number,                    // 盤面行數 (若有乘倍列則 +1)
  lineMode: 'paylines' | 'allways' | 'symbolcount',
  linesCount: number,              // 線數或路數
  lines: { [lineId]: number[] },   // 每條線路的行座標 (paylines 模式)
  paytable: { [symbol]: number[] },// 符號賠率表
  symbolImages: { [symbol]: string },     // 符號圖片 URL (優先使用)
  symbolImagesAll: { [symbol]: string[] },// 所有縮圖 URL
  jpConfig: { MINI, MINOR, MAJOR, GRAND },// JP 面額設定
  hasMultiplierReel: boolean,      // 是否有全盤乘倍列
  requiresCollectToWin: boolean,   // CASH 是否需 COLLECT
  hasDoubleSymbol: boolean,        // 是否有 DOUBLE
  hasDynamicMultiplier: boolean,   // 是否有動態乘倍 xN
  multiplierCalcType: 'product' | 'sum' // 乘倍計算方式
}
```

---

## 14. 開發注意事項與常見錯誤

### ✅ 新增 Template 狀態的完整 Checklist

當要新增一個新的 Template 層級狀態（例如未來新增 `hasStickyWild`）時，你**必須**同時修改以下所有位置：

| # | 檔案 | 位置 | 說明 |
|---|---|---|---|
| 1 | `useTemplateBuilder.js` | `useState` 宣告 | 新增狀態變數 |
| 2 | `useTemplateBuilder.js` | `handleBuildTemplate()` 的 `tpl` 物件 | 包含新欄位 |
| 3 | `useTemplateBuilder.js` | `performAutoBuild()` 的 `tpl` 物件 | 包含新欄位 |
| 4 | `useTemplateBuilder.js` | `resetTemplateBuilder()` | 重置新狀態 |
| 5 | `useTemplateBuilder.js` | `return { ... }` | 匯出新狀態與 setter |
| 6 | `App.jsx` | `useTemplateBuilder()` 解構 | 接收新狀態 |
| 7 | `App.jsx` | `handleSaveToCloud()` 呼叫處 | 傳入新欄位 |
| 8 | `App.jsx` | `handleExportLocalTemplate()` 的 `data` | 包含新欄位 |
| 9 | `App.jsx` | `handleImportLocalTemplate()` | 設為 state + fallback |
| 10 | `App.jsx` | `loadCloudTemplate()` | 設 state + fallback |
| 11 | `useCloud.js` | `saveTemplateToCloud` 的**參數解構** | 接收新欄位 |
| 12 | `useCloud.js` | `saveTemplateToCloud` 的 `newTemplate` 物件 | 包含新欄位 |
| 13 | `Phase1Setup.jsx` | Q&A 區域 | 新增對應的 toggle / 輸入 |

### ❌ 常見錯誤

1. **`setXxx is not a function`**：Custom Hook 新增了 state，卻忘記在 `return { ... }` 匯出 setter。
2. **`ReferenceError: xxx is not defined`**：`useCloud.js` 的 `saveTemplateToCloud` 參數宣告處忘記解構新欄位。
3. **雲端載入後新欄位被重置為 false**：`loadCloudTemplate` 或 `performAutoBuild` 中沒有正確讀取 `data.newField`，或舊版雲端資料不含此欄位且沒寫 fallback。
4. **方向鍵失效**：存在多個 `useEffect` 都在監聽 `keydown` 事件，後者的 `e.preventDefault()` 蓋掉前者。應確保只有一個統一的方向鍵監聽器。
5. **传送盤面後 React 不重新渲染**：深拷貝時使用 `JSON.parse(JSON.stringify())` 可能轉換失敗。建議使用 `.map(row => [...row])` 做淺層展開式深拷貝。
