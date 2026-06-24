# 老虎機線獎辨識工具 — 完整功能規範書

> **版本**: 2026-06（P5 排程器 + 地端模型 + 三重符號 + ROI 校正後）
> **目的**: 記錄本工具的所有功能、行為規範與細部規則，**任何改動前必須先比對此文件，確保不會破壞既有行為**。

---

## 目錄

1. [架構總覽](#1-架構總覽)
2. [Phase 1：模板建立與設定](#2-phase-1模板建立與設定)
3. [Phase 2：手動盤面設定與結算](#3-phase-2手動盤面設定與結算)
4. [Phase 3：AI / 本地盤面辨識](#4-phase-3ai--本地盤面辨識)
5. [Phase 4：影片 / 串流自動偵測截圖](#5-phase-4影片--串流自動偵測截圖)
6. [Phase 5：積木排程自動化](#6-phase-5積木排程自動化)
7. [結算引擎核心邏輯](#7-結算引擎核心邏輯)
8. [符號系統分類規則](#8-符號系統分類規則)
9. [OCR 與本地辨識引擎](#9-ocr-與本地辨識引擎)
10. [全域快捷鍵](#10-全域快捷鍵)
11. [Phase 間盤面傳送機制](#11-phase-間盤面傳送機制)
12. [ROI 系統](#12-roi-系統)
13. [雲端 / 本地模板儲存與載入](#13-雲端--本地模板儲存與載入)
14. [資產追蹤系統](#14-資產追蹤系統)
15. [Template 物件完整欄位規格](#15-template-物件完整欄位規格)
16. [Python 原生擷取後端](#16-python-原生擷取後端)
17. [開發注意事項與常見錯誤](#17-開發注意事項與常見錯誤)

---

## 1. 架構總覽

```
App.jsx（Phase 間膠水 + 快捷鍵 + UI 模式；Phase4/5 為 React.lazy）
├── hooks/
│   ├── useTemplateBuilder.js   — Phase 1 模板建立（組合 Hook）
│   │   ├── useCanvasLineExtractor.js — Canvas 線獎圖片提取
│   │   └── usePaytableProcessor.js   — 賠率表 AI OCR + 表格管理
│   ├── useTemplateIO.js        — 模板匯入/匯出/雲端存取統一入口（applyTemplateData）
│   ├── useSlotEngine.js        — Phase 2 結算（含可調線數/EXBET/全盤乘倍）
│   ├── useGeminiVision.js      — Phase 3 辨識（組合 Hook）
│   │   ├── useVisionImageManager.js   — 圖片清單 CRUD 與切換
│   │   └── useVisionBatchProcessor.js — AI / 本地批次辨識與進度
│   ├── useVideoSource.js       — Phase 4 來源管理（影片 / 螢幕串流 / 原生擷取）
│   │   └── useNativeCapture.js — Python WebSocket 連線（P4/P5 共用，App 層級）
│   ├── useKeyframeExtractor.js — Phase 4 偵測核心（V-Line + WIN 特工 + 候選幀）
│   ├── useAutoRecognition.js   — 背景批量辨識（本地 HOG + Gemini/地端 fallback）
│   ├── useSmartDedup.js        — 去重 + 分局（spinGroupId）
│   ├── useSpinGroupAnalysis.js — 連續性驗算 + Cascade 偵測
│   ├── useReportGenerator.js   — HTML 報表 + Session I/O + computeStats
│   ├── useAutoSave.js          — 候選幀自動存檔（File System Access API）
│   ├── usePhaseTransfer.js     — 跨 Phase 傳遞膠水（P3↔P2、P4→P3、Session 匯入）
│   ├── useFlowRunner.js        — Phase 5 積木排程引擎 Hook
│   ├── useFlowStorage.js       — 流程存取（local + 雲端 GAS）
│   └── useCloud.js             — 雲端 CRUD（GAS）
├── engine/
│   ├── computeGridResults.js   — 結算純函式（45 單元測試）
│   ├── localBoardRecognizer.js — 本地盤面辨識（HOG+中心HOG+Hue+SSIM+CASH OCR）
│   ├── vlineScanner.js / winPollAgent.js / ocrPipeline.js / ocrWorkerBridge.js
│   ├── frameRateCalibrator.js / statsCalculator.js
│   ├── flowRunner.js / roiResolver.js / exprEvaluator.js / presetFlows.js
│   ├── spreadsheetIO.js / sessionSerializer.js
│   ├── actions/                — 積木動作（click/ocr/wait/table/web/findText…）
│   └── blocks/                 — 積木處理器（control/flow/ocr/record/var/web）
├── workers/ocrWorker.js        — PaddleOCR Web Worker
├── stores/
│   ├── useAppStore.js          — UI 模式 / 手風琴 / Toast / 資產 / API 設定 / 資料表
│   └── usePhase4Store.js       — 7 組 ROI + clickTargets + ROI 群組 + 偵測參數（localStorage）
├── config/promptTemplates.js   — AI Vision Prompt 模板
├── types.js                    — JSDoc 型別（SlotTemplate / Candidate / 結算結果…）
└── components/                 — Phase1~5 與子元件、modals、TemplateQuickBar
```

### 1.1 UI 模式（`useAppStore.uiMode`）

| 模式 | 行為 |
|---|---|
| `simple`（預設） | 只顯示 Phase 2/3 + `TemplateQuickBar`（快速載入雲端模板）。Phase 1/4/5 隱藏。 |
| `full` | 顯示 Phase 1~5 全部。點 QuickBar「編輯模板」會切到 `full` 並展開 Phase 1。 |

持久化於 localStorage（`slot_ui_mode`）。方向鍵切換的 Phase 清單會依模式變動（simple：只在 P2/P3 之間）。

### 1.2 AI 來源（`useAppStore.apiProvider`）

| 值 | 設定欄位 | 說明 |
|---|---|---|
| `gemini`（預設） | `customApiKey` | Gemini Vision API |
| `local` | `localEndpoint` / `localModel` / `localApiKey` | OpenAI 相容地端視覺模型（dev-only CORS）|

`hasApiKey` 判斷：`local` 只要有 Endpoint 即可；`gemini` 需有 Key。

### 1.3 手風琴與 Phase 5 Portal

- **Phase 1~4 為手風琴**：同時最多展開一個，邏輯在 `useAppStore.handlePhaseToggle`（展開某 Phase = 收合其他全部；再點已展開者 = 收合自己）。
- **Phase 5 不在手風琴內**：透過 Portal 固定於 body 底部狀態列，與 Phase 4 共用 `videoRef`、`candidates`、ROI。

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
| `paylines` | 固定線獎。需 `extractResults`（每條線路的行座標）。 |
| `allways` | All Ways。`linesCount` 自動為 `rows^cols`。 |
| `symbolcount` | 消除模式（Pay Anywhere）。**Phase 1 UI 尚未開放此選項**，需手動建 JSON。 |

### 2.3 Q&A 與特殊機制設定（`Phase1Setup` → `SpecialSymbolQA` 等）

> 以下為實際存入 / 影響 template 的開關。標「UI」者為僅控制顯示的本地 state，不直接入 template。

| 機制 | 狀態名 | 預設 | 說明 |
|---|---|---|---|
| 雙重符號 | `hasDoubleSymbol` | `false` | `_double` 結尾符號，1 格算 2 連 |
| 三重符號 | `hasTripleSymbol` | `false` | `_triple` 結尾符號，1 格算 3 連 |
| 全盤乘倍機制 | `hasMultiplierReel` | `false` | 盤面最右加一行乘倍列（單格或整排）|
| 單線乘倍計算 | `multiplierCalcType` | `product` | `product`(相乘) / `sum`(相加)。需在賠付表加 xN（賠率 0）|
| 動態乘倍符號 | `hasDynamicMultiplier` | `false` | xN 視作 WILD 且共用賠率，連線贏分乘該數字 |
| 滾動贏分 | `hasRollingWin` | `false` | WIN 為滾動上升模式（影響 Phase 4 特工/去重）|
| 收集現金獎 | `hasCashCollectFeature`（UI） | `false` | 控制 4-1/4-2 顯示；選「無」會重置 `requiresCollectToWin`/`hasJackpot` |
| └ 需 COLLECT 符號 | `requiresCollectToWin` | `true` | `false` = 自動收集（無 COLLECT 也至少 1 倍）|
| └ 含 JP 符號 | `hasJackpot` | `false` | 展開 `jpConfig`（MINI/MINOR/MAJOR/GRAND 面額）|
| 雙向連線 | `hasBidirectionalPaylines` | `false` | paylines 模式允許右至左掃描 |
| 可調整線數 | `hasAdjustableLines` | `false` | `lineBet = 總BET / 啟用線數` |
| EXBET 額外押注 | `hasExBet` / `exBetOptions` | `false` / `[]` | 畫面 BET = 原 BET × 倍率；結算回推原 BET |
| LineBet 固定除數 | `hasLineBetDivisor` / `lineBetDivisor` | `false` / `1` | `lineBet = 總BET / 固定除數` |
| 鑽石形盤面 | `reelHeights` | `null` | 每轉軸可見列數陣列（如 `[3,4,5,4,3]`）|

#### Q&A 自動注入賠付表符號
建立模板時（`handleBuildTemplate` / `performAutoBuild`）依設定**自動注入**（使用者已手動定義同名符號則不覆寫）：
| 條件 | 注入符號 | 賠率 |
|---|---|---|
| `hasDynamicMultiplier` | `xN` | 全 0 |
| `hasJackpot` | `jpConfig` 中所有非空 key | 全 0 |
| 賠付表無任何 WILD | `WILD` | 全 0（保底）|

### 2.4 線獎資料提取
- **圖片模式** (`linesTabMode==='image'`)：上傳線獎圖、框選起終點，Canvas 色彩分析提取。
- **文字模式** (`linesTabMode==='text'`)：直接輸入每條線路列座標。

### 2.5 賠付表 (`paytableInput` / `ptResultItems`)
- **圖片模式**：上傳截圖 → AI OCR 辨識符號名與賠率，建立 `ptResultItems`（含 match1~match10、`thumbUrls`、`doubleThumbUrls`、`tripleThumbUrls`）。
- **文字模式**：`符號名 賠率1 … 賠率N`。
- 縮圖可裁切（`PtCropModal`），上雲端時壓縮至 48px/JPEG/0.4。

### 2.6 建立模板
- `handleBuildTemplate()` 驗證後組裝 `template`，成功後折疊 Phase 1、展開 Phase 2。

---

## 3. Phase 2：手動盤面設定與結算

- **輸入模式**：`paint`（畫筆，可拖曳；CASH/動態乘倍點擊彈出數值輸入）/ `text`（鍵盤，支援剪貼簿批次貼入）。
- **畫筆來源**：`availableSymbols` 由 `useSlotEngine` 依 `template.paytable` + `jpConfig` 動態產生；DOUBLE/TRIPLE 變體畫筆會顯示。
- **格子渲染**：圖片優先 → CASH/COLLECT 疊加金額 → JP 顯示 `{面額}x` → 動態乘倍底圖用 WILD 疊加 `xN`/`x{值}` → DOUBLE 右上 `2X`、TRIPLE `3X` 徽章 → 無資料顯示空心點。
- **即時結算**：`panelGrid` / `betInput` 變化 → `computeGridResults()` → `ResultView`。
- **即時調整**：可調線數 (`activeLineCount`)、全盤乘倍 (`globalMultiplier`)、EXBET 倍率 (`activeExBetMultiplier`)。
- **隨機/清除盤面**：乘倍列復位為中間行 `x1`。
- **↓ 返回 AI 辨識**：`handleReturnToVision()`（傳送+折疊）。

---

## 4. Phase 3：AI / 本地盤面辨識

### 4.1 圖片管理 (`useVisionImageManager`)
多張批次上傳、左右切換、刪除；每張獨立儲存 `grid` / `error` / `bet`。

### 4.2 ROI 框選（百分比，持久化 localStorage）
- `visionP1`：盤面範圍。`visionP1Mult`：乘倍列（`hasMultiplierReel`）。`visionP1Bet`：押注（`hasBetBox`）。

### 4.3 兩種批次辨識 (`useVisionBatchProcessor`)
| 路徑 | 函式 | 說明 |
|---|---|---|
| AI | `performAIVisionBatchMatching` | Gemini / 地端視覺模型，可中途取消 |
| 本地 | `performLocalVisionBatchMatching` | 用模板縮圖建 HOG 參考索引，純前端比對，不需 API |

辨識結果存入各圖片 `.grid`，BET 存 `.bet`。

### 4.4 盤面預覽與傳送
- 唯讀小盤面預覽（渲染規則同 Phase 2）。
- **↑ 傳送至 Phase 2**：`handleTransferVisionToManual()`。
- **存回 Phase 4**：`handleSaveVisionToPhase4()`。

---

## 5. Phase 4：影片 / 串流自動偵測截圖

### 5.1 來源 (`useVideoSource` + `useNativeCapture`)
| 來源 | 說明 |
|---|---|
| MP4 影片 | 本機檔案 |
| 螢幕串流 | 瀏覽器 `getDisplayMedia` |
| 原生擷取 | Python WebSocket 後端（繞過瀏覽器限制，可截被遮擋視窗）|

原生模式：收 JPEG blob → Canvas → `captureStream` → video，`NativeSourceModal` 選擇螢幕/視窗。

### 5.2 V-Line 停輪偵測 (`vlineScanner.js`)
- 盤面 ROI 垂直切 N 片（= `cols`），各片計算相鄰幀 MAE；全片 < `vLineThreshold` ≥ 數幀 → 停輪。
- 參數：`vLineThreshold`、`motionCoverageMin`、空盤過濾 `enableEmptyBoardFilter`（σ<35 跳過）。
- 防呆：`hadSpinSinceLastStop` 確保有實質轉動才允許新候選。

### 5.3 WIN 追蹤特工 (`winPollAgent.js` / `useKeyframeExtractor`)
- 開關：`enableWinTracker`。
- 初始短路（停輪原圖已有 WIN 即退場）、截圖鎖定第一次 WIN 幀、2 次確認、統一數據源、排乾佇列。詳見 README §3 4b。

### 5.4 智慧去重 / 分局 / 驗算
- `useSmartDedup`：殘影淨化（須 OrderID 不同）、Union-Find 合併同局、FG/Cascade 合併。
- `useSpinGroupAnalysis`：`BAL+BET−WIN` 連續性驗算 → `mathState`（0 無資料 / 1 正常無贏 / 2 正常有贏 / 3 贏分差異 / 5 Cascade）。

### 5.5 報表 / 統計 / Session
- `useReportGenerator`：自包含 HTML（表頭固定、斷層標記、浮動導覽列、雙截圖並排）；`exportHTMLReport(candidates, game, dir, format, onProgress)`。
- `statsCalculator.computeStats`：RTP、命中率、最大贏分/倍率、最長無贏連續局。
- Session：`sessionSerializer` + File System Access API（JSON + 圖片資料夾）。
- `useAutoSave`：候選幀自動存檔本機。

### 5.6 傳送至 Phase 3
`handleTransferPhase4ToPhase3()`：候選幀 canvas → Image；同步 `reelROI→visionP1`、`betROI→visionP1Bet`；啟用 `hasBetBox`；追加至 `visionImages` 並選中第一張；清空 Phase 4。

---

## 6. Phase 5：積木排程自動化

> 職責：遊戲操控與排程（雙手）。引擎 `engine/flowRunner.js`（`FlowRunner extends EventTarget`），Hook `useFlowRunner`。
> ⚠️ 舊版 Selenium 程式碼已全部移除，目前為 **ROI-only 自動化**。

### 6.1 執行模型
- `FlowRunner.run(flow, context)` → `_executeBlocks` → 逐塊查 `BLOCK_HANDLERS` 執行。
- 狀態：`IDLE / RUNNING / PAUSED / STOPPED`（`RunState`）。
- 事件（`FlowEvent`）：`STATE_CHANGE / BLOCK_START / BLOCK_END / VAR_UPDATE / LOG / SPIN_RECORDED / LOOP_PROGRESS / ERROR`，供 `FlowComposer` 更新 UI。
- 變數空間 `this.variables`（`$win`, `$balance`, `$bet`, `$loopIndex`, 自訂…）；`$表名._count` 可動態查表格列數。
- 表達式/條件用 `exprEvaluator`（token-based，**不使用 Function/eval**）+ NFKC 全形→半形正規化。
- 錯誤策略 per-block：`stop`（預設）/ `skip` / `retry`（含 retryCount）。

### 6.2 積木類型（`blockDefs.js` / `BLOCK_HANDLERS`）
| 分類 | 積木 |
|---|---|
| 操控 | `click_roi` 🎮、`key_press` ⌨️、`type_text` 💬、`hotkey` 🔑 |
| 等待 | `wait` ⏱️、`wait_stable` 👁️、`wait_change` ⚡ |
| 搜尋 | `find_text` 🔎（後端全螢幕 OCR 找文字 → 動態點擊目標）|
| 讀取 | `ocr_batch` 📊、`ocr_read` 📖 |
| 記錄 | `capture_frame` 📸、`record_spin` 💾、`recognize_grid` 🔍 |
| 流程 | `loop` 🔁、`if_then` ❓、`sub_flow` 📦 |
| 變數工具 | `set_var` 📝、`var_replace` 🔤、`var_extract_number` 🔢、`log` 📋 |
| 控制 | `stop` 🛑、`break_loop` ⏏️ |
| 表格 | `for_each_row` 📊、`read_row` 📖、`append_result` 📝、`export_results` 📥、`clear_results` 🧹 |
| P4 操作 | `export_p4_report` 📤、`clear_p4_data` 🧹 |

### 6.3 ROI 名稱解析 (`roiResolver.js`)
- Flow 只存 ROI 名稱；座標由 `usePhase4Store` 提供。
- 標準名稱：`SPIN / REEL / WIN / BAL(BALANCE) / BET / ORDER_ID / MULT(MULTIPLIER)`。
- Fallback：動態點擊目標（遊戲層 `clickTargets` + 平台層，遊戲層覆蓋同名）。
- `getDecimalPlaces`：BAL → `balDecimalPlaces`，ORDER_ID → 0，其餘 → `ocrDecimalPlaces`。

### 6.4 表格驅動自動化
- 上傳 Excel（`spreadsheetIO.parseExcel`，SheetJS）→ `useAppStore.dataTables`。
- `for_each_row` 迭代帳號清單（`$row.欄名` 取值）；`append_result` 累積到 `resultTables`；`export_results` → `exportExcel` 下載。

### 6.5 流程存取 (`useFlowStorage`)
本地 localStorage + 雲端 GAS；內建範本 `presetFlows.js`（空白 / 基本 SPIN / Cascade / 手動觀察）。

---

## 7. 結算引擎核心邏輯

> 檔案：`engine/computeGridResults.js`（純函式，`big.js` 安全運算 `safeMul`/`safeAdd`）。
> 函式簽名：`computeGridResults(template, targetGrid, betAmount, options)`。

### 7.1 押注名詞
- `parsedBet`：使用者輸入的總押注。
- `lineBet`：每線押注，依序判斷 — EXBET (`/activeExBetMultiplier`) → 可調線數 (`/activeLineCount`) → LineBet 除數 (`/lineBetDivisor`) → 否則 = `parsedBet`。

### 7.2 全盤乘倍列（`hasMultiplierReel` + `options.globalMultiplier`）
- `globalMultiplier > 1` 時，結算末段 `totalWin *= activeMultiplier`，每筆明細同步乘並標 `xN`。

### 7.3 固定線獎 (`paylines`)
- 逐條線路：從左向右連續匹配（符號本身或 WILD），遇不匹配中斷；DOUBLE/TRIPLE 算 2/3 單位。
- 取最大賠付符號為該線最佳；線上乘倍依 `multiplierCalcType` 相乘/相加。
- 雙向：`options.enableBidirectional` 時另算右至左掃描取較高者，winCoords 反向計算。

### 7.4 All Ways (`allways`)
- 逐列統計匹配格（target + WILD）作 ways 連乘；扣除純 WILD 路線（`pureWildWays`）。
- 須至少一格為 target 本身、且 `reelsReached ≥ 2`。
- **含 xN 時**：笛卡爾積枚舉所有路線，純 WILD 路線排除，按乘倍值分組輸出（`lineId: WAYS_SYM_xN`）；無 xN 時退化為單筆聚合 `WAYS_SYM`。

### 7.5 消除 (`symbolcount`)
- 統計每符號總數（含 WILD 替補、DOUBLE/TRIPLE 加權）→ 查表 × lineBet × 線上乘倍。

### 7.6 SCATTER
- 全盤掃描（`getBaseSymbol` 比對，不含 WILD 替補）→ `paytable[SCATTER][count-1] × parsedBet`。

### 7.7 CASH / COLLECT
- 累加 `isCashSymbol` 的 `getCashValue`（JP：`value × parsedBet`；一般 CASH：面值）。
- 收集倍數 = `isCollectSymbol` 數量；`requiresCollectToWin===false` 時至少 1。
- 盤面獨立 xN 計入 `otherGridMultiplier`。
- `totalPayout = totalCashValue × effectiveCollectCount × otherGridMultiplier`。

### 7.8 乘倍計算類型
| 值 | 行為 |
|---|---|
| `product` | 相乘 `x2 × x3 = x6` |
| `sum` | 相加後 `max(1, sum)` |

### 7.9 排序
`SCATTER_*` / `COLLECT_FEATURE` 置頂；其餘依 `lineId` 升序。

---

## 8. 符號系統分類規則

> 檔案：`utils/symbolUtils.js`

| 函式 | 規則 |
|---|---|
| `isScatterSymbol` | 名稱含 `SCATTER` |
| `isCollectSymbol` | 名稱含 `COLLECT` |
| `isDynamicMultiplierSymbol` | 符合 `(^|_)x(\d+(.\d+)?|N)$` |
| `isWildSymbol` | 含 `WILD` 或為獨立乘倍 `^x(\d+|N)$` |
| `isJpSymbol(sym, jpConfig)` | 大寫名存在於 `jpConfig` keys |
| `isDoubleSymbol` | `_double` 結尾 |
| `isTripleSymbol` | `_triple` 結尾 |
| `getSymbolCount` | TRIPLE→3、DOUBLE→2、其餘→1 |
| `getSymbolMultiplier` | 解析 `_xN` 後綴或 `xN` 前綴，預設 1 |
| `isCashSymbol(sym, jpConfig)` | `CASH` 開頭 或 `isJpSymbol` |
| `getBaseSymbol` | 獨立 `x5`→`xN`；剝 `_double`/`_triple` → 剝 `_xN` → JP 大寫 → CASH/COLLECT 去值 |
| `getCashValue` / `getCollectValue` | JP→jpConfig；其餘解析最後一段（支援 K/M/B）|
| `getSymbolDisplayImage` | 完整名 → 基底名 → 同類別模糊匹配 |

### 動態乘倍 (`xN`) 關鍵規則
1. 格式：`x5`、`x10`、`WILD_x5`、`Grape_x5`、`xN`。
2. `isWildSymbol` 回傳 true（視作 WILD）。
3. `getBaseSymbol`：獨立 `x5/x10` → `xN`；`Grape_x5` → `Grape`。
4. 圖片查找：先 `xN` → fallback `WILD`。
5. Phase 2/3 盤面無條件疊加白色 `xN` / `x{值}` 文字。

---

## 9. OCR 與本地辨識引擎

### 9.1 數值 OCR（PaddleOCR）
- 模型：PP-OCRv4（`public/ocr-models/*.onnx` + `ppocr_keys_v1.txt`）。
- 執行：`@gutenye/ocr-browser` + `onnxruntime-web`，跑在 **Web Worker**（`workers/ocrWorker.js`，含 OffscreenCanvas/Image polyfill）。
- 橋接：`ocrWorkerBridge.js` 對外提供 `.detect(dataURL)`；`ocrPipeline.js` 負責截圖/縮圖/自動精確裁切（亮色 bounding box）/放大/清洗 → OCR → 數字後處理（小數位、千分位誤判修正、ORDER_ID 保留 `-`）。
- 全域 Queue 保護單 Worker 不被高頻調用擠爆 WASM。

### 9.2 本地盤面辨識（`localBoardRecognizer.js`，不需 API）
- 前處理：亮度異常遮罩（清洗閃電/光暈，高飽和彩色高光保留）。
- 融合評分：**全圖 HOG ×0.55 + 中心裁切 HOG ×0.30 + Hue 直方圖 ×0.15**；統一 128×128。
- 平手仲裁：分差 < 0.03 時，色彩優先決勝或 SSIM 仲裁（守門條件）。
- CASH/JP：對被判為 CASH/JP 的格子做 OCR，讀 JP 文字或 CASH 數值；OCR 無結果則排除 CASH/JP 重新比對。
- `buildReferenceIndex` 模組級快取（多 hook 共享）。

### 9.3 後端 OCR（Python）
`server.py` 用 `rapidocr_onnxruntime` 載入相同 PP-OCRv4 模型；`ocr_rois`（rec-only 快速批次）與 `find_text`（det+cls+rec 全螢幕找文字回傳百分比座標）。後處理與前端對齊。

---

## 10. 全域快捷鍵

> 定義在 `App.jsx` 兩個 `useEffect`（焦點不在 INPUT/TEXTAREA/SELECT 時生效）。

### 10.1 方向鍵
- Phase 清單依 UI 模式：`full`→`[p1,p2,p3,p4]`、`simple`→`[p2,p3]`。
- Phase 2 + `↓`：傳送盤面回 Phase 3 (`handleReturnToVision`) + 切換。
- Phase 3 + `↑`：傳送盤面至 Phase 2 (`handleTransferVisionToManual`) + 切換。
- 其他：單純切換上/下一個 Phase。

### 10.2 Enter
| 展開 Phase | 行為 |
|---|---|
| Phase 1 | 建立模板 |
| Phase 2 | 將 `calcResults.totalWin` 加入總資產 |
| Phase 3 | 將 `visionCalcResults.totalWin` 加入總資產 |

---

## 11. Phase 間盤面傳送機制

> 膠水集中於 `usePhaseTransfer`。深拷貝一律用 `.map(row => [...row])`（避免 `JSON.parse(JSON.stringify())` 失敗）。

- **P3 → P2** (`handleTransferVisionToManual`)：複製 `activeVisionImg.grid` → `setPanelGrid`；同步 BET；展開 P2。
- **P2 → P3** (`handleReturnToVision`)：複製 `panelGrid` 更新對應 `visionImages.grid`；同步 BET；展開 P3。
- **P4 → P3** (`handleTransferPhase4ToPhase3`)：見 §5.6。
- **標題列箭頭**：展開時點 = 傳送+折疊；折疊時點 = 單純展開。

---

## 12. ROI 系統

> 檔案：`stores/usePhase4Store.js`（全部自動持久化 localStorage，key `SLOT_P4_ROI_V2`）。
> ROI 為**百分比座標** `{x, y, w, h}`（0–100）。

### 12.1 固定 ROI（7 組）
`reel` / `win` / `balance` / `bet` / `orderId` / `multiplier` / `spinButton`。

### 12.2 動態點擊目標（`clickTargets`）
- 遊戲層 `clickTargets` + 平台層（依 `platformName` 存 `slot_platform_clicks_{platform}`）。
- `getAllClickTargets`：平台 + 遊戲（遊戲層覆蓋同名）。
- 供 Phase 5 `click_roi` / `find_text` 動態目標使用。

### 12.3 ROI 群組
`roiGroups`（預設：遊戲/遊戲介面/遊戲歷程/後台塞卡/後台簽核）、`fixedRoiGroups`、`visibleGroups`，供 VideoPlayer 疊層顯示與積木分類。

### 12.4 匯出 / 匯入 / 校正
- `exportAllROIs` / `importAllROIs`（JSON，`_version: 3`，含群組）。
- 獨立校正精靈：`public/roi-setup.html`。

### 12.5 Phase 3 專屬 ROI
`visionP1` / `visionP1Mult` / `visionP1Bet` 各自存於獨立 localStorage key。

---

## 13. 雲端 / 本地模板儲存與載入

> 雲端後端：Google Apps Script（`gas/Code.gs`）；URL/token 在 `utils/constants.js`（`GAS_URL` / `gasUrl()` / `gasPost()`）。

### 13.1 儲存 (`useCloud.saveTemplateToCloud`)
必含全部 Template 欄位（見 §15）；衝突偵測比對 `platformName + gameName`（忽略大小寫）顯示覆寫確認；縮圖壓縮 48px/JPEG/0.4，payload 上限 ~50KB。

### 13.2 載入 / 匯入
- 統一入口 `useTemplateIO.applyTemplateData(data)`（雲端載入與本地匯入共用），逐欄位設定 state（含 fallback），最後 `performAutoBuild(data)`。
- 本地匯出 `handleExportLocalTemplate` → JSON 檔；欄位與雲端一致。

---

## 14. 資產追蹤系統

| 項目 | 說明 |
|---|---|
| `totalBalance` | 累計餘額，持久化 `slot_total_balance`（`useAppStore`）|
| `isBalanceExpanded` | 餘額面板展開狀態 |
| Enter 更新 | Phase 2/3 展開時按 Enter 加入當前 `totalWin` |
| ResultView | 皆有「更新資產」按鈕 |

---

## 15. Template 物件完整欄位規格

> 由 `handleBuildTemplate()` / `performAutoBuild()` 產生（型別見 `types.js` 的 `SlotTemplate`）。

```javascript
{
  rows, cols,                       // 盤面尺寸（有乘倍列則 cols+1）
  lineMode,                         // 'paylines' | 'allways' | 'symbolcount'
  linesCount,
  lines,                            // { [lineId]: number[] }（paylines）
  paytable,                         // { [symbol]: number[] }
  symbolImages, symbolImagesAll,    // 圖片 URL / 全縮圖
  jpConfig,                         // { MINI, MINOR, MAJOR, GRAND }
  hasMultiplierReel,
  requiresCollectToWin,
  hasDoubleSymbol, hasTripleSymbol,
  hasRollingWin,
  hasDynamicMultiplier, multiplierCalcType,  // 'product' | 'sum'
  hasBidirectionalPaylines,
  hasAdjustableLines,
  hasExBet, exBetOptions,
  hasLineBetDivisor, lineBetDivisor,
  reelHeights,                      // number[] | null（鑽石形盤面）
}
```

---

## 16. Python 原生擷取後端

> 檔案：`screen-capture-server/server.py`（`ws://localhost:8765`，可帶埠號）。啟動會自動 `pip install` 缺套件。

### 16.1 擷取
- 螢幕：`mss`（DXGI）；視窗：`mss` 或 `PrintWindow`（可截被遮擋視窗）。
- 串流：縮放上限寬 1920、JPEG（優先 `turbojpeg`），二進制幀推送。

### 16.2 控制（背景，不搶實體滑鼠鍵盤）
- 點擊：`PostMessage`（視窗 client 座標）/ `pyautogui`（螢幕模式）。
- 鍵盤：原生視窗 `PostMessage`；瀏覽器視窗短暫搶焦點 + `pyautogui`/`SendInput`（`AttachThreadInput`）。
- action：`click / click_pct / click_roi / key / hotkey / type_text / move / drag / focus / ocr_rois / find_text / log`。
- 連線模式：串流中可夾帶控制，或純 `control_only` 通道。

### 16.3 後端 OCR
`get_ocr_engine()` 延遲載入 `RapidOCR`（同 PP-OCRv4 模型）；`ocr_rois` rec-only 快速、`find_text` 完整管線。

---

## 17. 開發注意事項與常見錯誤

### ✅ 新增 Template 狀態的完整 Checklist
新增 Template 層級狀態（如未來 `hasStickyWild`）時**必須**同步：

| # | 檔案 | 位置 |
|---|---|---|
| 1 | `useTemplateBuilder.js` | `useState` 宣告 |
| 2 | `useTemplateBuilder.js` | `handleBuildTemplate()` 的 `tpl` |
| 3 | `useTemplateBuilder.js` | `performAutoBuild()` 的 `tpl` |
| 4 | `useTemplateBuilder.js` | `resetTemplateBuilder()` |
| 5 | `useTemplateBuilder.js` | `return { ... }` |
| 6 | `App.jsx` | `useTemplateBuilder()` 解構 + 傳給 `useTemplateIO` |
| 7 | `useTemplateIO.js` | `applyTemplateData()`（含 fallback）|
| 8 | `useTemplateIO.js` | `handleExportLocalTemplate()` 的 `data` |
| 9 | `useTemplateIO.js` | `handleSaveToCloud()` 呼叫處 |
| 10 | `useCloud.js` | `saveTemplateToCloud` 參數解構 |
| 11 | `useCloud.js` | `newTemplate` 物件 |
| 12 | `Phase1Setup.jsx`（或 `SpecialSymbolQA.jsx`） | Q&A 區 toggle/輸入 |

> `applyTemplateData()` 是雲端載入與本地匯入的**唯一共用入口**，向下相容靠此處 fallback。

### ✅ 其他 Checklist
- **Paytable 邏輯**：改 `usePaytableProcessor.js`；其函式需透過參數接收 `setPaytableInput`（`paytableInput` state 留在 `useTemplateBuilder`，用 wrapper 綁定）。
- **線獎提取**：改 `useCanvasLineExtractor.js`；`useTemplateBuilder` 直接轉發。
- **新增 Phase 5 積木**：`blockDefs.js`（meta + 範本）→ `flowRunner.js` 的 `BLOCK_HANDLERS` → 對應 `blocks/` 或 `actions/` 實作 → `BlockParams.jsx` 參數 UI。
- **新增 ROI**：`usePhase4Store`（state+setter+持久化）→ `roiResolver` 映射 → `VideoPlayer` 疊層 → 報表/Session 序列化。
- **架構文件同步**（`.agent/rules.md` 規則 6）：同步更新 `project-architecture/SKILL.md`。

### ❌ 常見錯誤
1. **`setXxx is not a function`**：Hook 加 state 忘了在 `return` 匯出 setter。
2. **`ReferenceError`**：`useCloud.saveTemplateToCloud` 參數宣告漏解構新欄位。
3. **雲端/匯入後新欄位被重置**：`applyTemplateData` 沒讀 `data.newField` 或缺 fallback。
4. **方向鍵失效**：多個 `keydown` 監聽互相 `preventDefault` 蓋掉，須維持單一統一監聽。
5. **傳送盤面不重渲染**：深拷貝用 `.map(row => [...row])`，勿用 `JSON.parse(JSON.stringify())`。
6. **OCR/WASM 載入失敗**：模型以 `import.meta.env.BASE_URL` 載入，注意 `vite.config.js` 的 `base`。
7. **改文件不觸發 HMR**：`screen-capture-server/`、`.agent/`、`*.md` 已被 `server.watch.ignored`。
