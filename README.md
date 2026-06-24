# 老虎機線獎辨識工具 (Slot Machine Setup Evaluator)

用於實機老虎機的「賠率表建立 → 盤面辨識 → 贏分結算驗證 → 自動操控收數據」全流程工具。
支援影片 / 螢幕串流 / 原生視窗截圖、PaddleOCR 本地數值辨識、HOG 本地盤面辨識、Gemini（或地端）Vision AI 盤面辨識，
並可透過 Python 後端對遊戲視窗背景點擊與排程自動遊玩，最終產出含斷層標記的 HTML 驗證報告與 Excel 結果表。

---

## 1. 啟動指南

### 環境需求

| 項目 | 版本 |
|------|------|
| Node.js | 18+ |
| npm | 隨 Node 附帶即可 |
| Python | 3.10+（**僅 Phase 5 原生擷取/控制需要**，瀏覽器端功能不需要） |

### 安裝與啟動（前端）

```bash
npm install      # 安裝依賴
npm run dev      # 啟動開發伺服器 (Vite，預設 http://localhost:5173)
```

### 其他指令

```bash
npm run build      # 正式打包 (輸出至 dist/)
npm run preview    # 預覽 production build
npm run test       # 執行單元測試 (vitest run，共 3 個測試檔)
npm run test:watch # 監看模式
```

> **打包路徑**：`vite.config.js` 設定 `base: '/Slot-Machine-Setup-Evaluator/'`（部署於 GitHub Pages，見 `.github/workflows/deploy.yml`）。

### Python 後端（Phase 5 原生擷取與控制）

```bash
cd screen-capture-server
python server.py            # 預設 ws://localhost:8765；可帶埠號參數 python server.py 8765
# 或雙擊 start.bat
```

伺服器啟動時會自動嘗試 `pip install` 缺少的套件（`pyautogui` 等）。相依套件見 `screen-capture-server/requirements.txt`。
此後端提供：螢幕/視窗串流、背景點擊鍵盤（PostMessage / SendInput）、後端 RapidOCR、全螢幕找文字。

### AI 與 API Key 設定

點右上角 ⚙️ 齒輪開啟設定面板。支援兩種 AI 來源（存於瀏覽器 localStorage）：

| 來源 (`apiProvider`) | 設定 | 用途 |
|---|---|---|
| `gemini`（雲端，預設） | Gemini API Key | Phase 1 賠率表 OCR、Phase 3/4 的 AI 盤面辨識 |
| `local`（地端） | OpenAI 相容 Endpoint / Model / Key | 同上，改打地端視覺模型（dev-only CORS）|

> 無 AI 設定時，**Phase 1 的 AI 賠率辨識與 AI 盤面辨識無法使用**，但手動輸入、**本地 HOG 盤面辨識**、PaddleOCR 數值辨識、結算引擎與報表皆不受影響。

### 兩種介面模式

- **簡易模式 (`simple`，預設)**：只顯示 Phase 2 / 3 與一條 `TemplateQuickBar`（快速載入雲端模板）。
- **完整模式 (`full`)**：顯示 Phase 1~5 全部。點 QuickBar 的「編輯模板」即切換至完整模式。

---

## 2. 目錄架構

```
.
├── index.html                  # Vite 入口 HTML
├── vite.config.js              # Vite + Tailwind v4 + React + Worker(ES) + manualChunks
├── package.json                # 依賴與 scripts
│
├── .agent/                     # 開發者文件（Vite watch 已忽略）
│   ├── SPEC.md                 # 完整功能規範書（改動前必讀）
│   ├── rules.md                # 專案規則（中文計畫、自動 commit 等）
│   └── skills/                 # 架構與 UI 風格技能文件
│       └── project-architecture/SKILL.md
│
├── gas/Code.gs                 # Google Apps Script 雲端後端（模板/流程 CRUD，部署於 Google Sheets）
│
├── screen-capture-server/      # Python WebSocket 後端（Phase 5 原生擷取 + 背景控制 + 後端 OCR）
│   ├── server.py
│   ├── requirements.txt
│   └── start.bat
│
├── flows/                      # 範例 Flow JSON（ROI 自動化流程）
│
├── public/
│   ├── ocr-models/             # PaddleOCR PP-OCRv4 ONNX 模型 + 字典
│   ├── ort-wasm-*.wasm         # ONNX Runtime WebAssembly 執行檔
│   └── roi-setup.html          # 獨立 ROI 校正精靈頁
│
├── tests/                      # Vitest 單元測試
│   ├── computeGridResults.test.js  # 結算引擎 (45)
│   ├── symbolUtils.test.js         # 符號分類 (109)
│   └── gridShapeUtils.test.js      # 盤面形狀 (25)
│
└── src/
    ├── main.jsx / App.jsx      # 進入點與主膠水（Phase 串接、快捷鍵、UI 模式）
    ├── index.css               # Tailwind v4 全域樣式
    │
    ├── engine/                 # 純函式運算引擎（無 React 依賴）
    │   ├── computeGridResults.js   # 結算核心（paylines / allways / symbolcount + SCATTER + CASH/COLLECT）
    │   ├── localBoardRecognizer.js # 本地盤面辨識（HOG + 中心HOG + Hue + SSIM 仲裁 + CASH OCR）
    │   ├── vlineScanner.js         # V-Line 切片停輪偵測（column-based MAE）
    │   ├── winPollAgent.js         # WIN 追蹤特工（高頻輪詢 WIN ROI）
    │   ├── ocrPipeline.js          # 截圖 / 縮圖 / 裁切 + PaddleOCR
    │   ├── ocrWorkerBridge.js      # PaddleOCR Web Worker 橋接層
    │   ├── statsCalculator.js      # 候選幀 → 統計（RTP/命中率/最大贏分）
    │   ├── frameRateCalibrator.js  # 影格率校正
    │   ├── flowRunner.js           # Phase 5 積木排程引擎（FlowRunner class）
    │   ├── roiResolver.js          # ROI 名稱 → 座標解析（讀 Phase4Store）
    │   ├── exprEvaluator.js        # 安全表達式/條件求值（不使用 eval）
    │   ├── spreadsheetIO.js        # Excel 讀寫（SheetJS）
    │   ├── sessionSerializer.js    # Session 匯出/匯入序列化
    │   ├── presetFlows.js          # 內建 Flow 範本
    │   ├── actions/                # 積木動作實作（click/ocr/wait/table/web/find_text…）
    │   └── blocks/                 # 積木處理器（control/flow/ocr/record/var/web）
    │
    ├── workers/ocrWorker.js    # PaddleOCR Web Worker（@gutenye/ocr-browser + onnxruntime-web）
    │
    ├── hooks/                  # 業務邏輯層（詳見 .agent/SPEC.md 與 SKILL.md）
    ├── components/             # Phase1~5 與各子元件、modals
    ├── stores/                 # Zustand：useAppStore（UI/資產/資料表）、usePhase4Store（ROI/偵測參數）
    ├── config/promptTemplates.js   # AI Vision Prompt 模板
    ├── types.js               # JSDoc 型別定義（SlotTemplate / Candidate / 結算結果…）
    └── utils/                 # symbolUtils / roiUtils / videoUtils / aiValidator / constants…
```

---

## 3. 資料處理流程

### 整體架構：五階段串接

```
Phase 1 (模板建立) ── template 物件 ──┐
                                        ↓ 共用
Phase 2 (手動驗算) ←→ Phase 3 (AI / 本地辨識) ←─ Phase 4 (影片/串流偵測截圖)
                                        ↓                         ↑
                          computeGridResults()                    │ 共用 videoRef / candidates / ROI
                                        ↓                         │
                          HTML 驗證報告 + Excel 結果表    Phase 5 (積木排程自動操控)
```

- **Phase 1~4 為手風琴**：同時只展開一個（邏輯在 `useAppStore.handlePhaseToggle`）。
- **Phase 5 不在手風琴內**：透過 Portal 固定於底部，與 Phase 4 共用 `videoRef`、`candidates`、ROI。
- Phase 2/3 可透過箭頭按鈕或方向鍵互傳盤面；Phase 4 可整批傳送至 Phase 3。

---

### Phase 1：模板建立 (`useTemplateBuilder`)

**輸入**：平台/遊戲名稱、盤面尺寸、線獎圖片或文字、賠率表截圖或文字、Q&A 特殊機制
**輸出**：`template` 物件（供 Phase 2~5 共用）

1. 設定盤面列數 × 行數、線獎模式（`paylines` / `allways` / `symbolcount`）。
2. 線獎：上傳圖片 → Canvas 色彩分析提取線路座標；或純文字輸入（`useCanvasLineExtractor`）。
3. 賠率表：上傳截圖 → AI OCR 自動辨識符號與賠率；或純文字輸入（`usePaytableProcessor`）。
4. Q&A 問卷設定特殊機制（乘倍列、單線乘倍、動態乘倍 xN、CASH/COLLECT、JP、DOUBLE/TRIPLE、雙向連線、可調線數、EXBET、LineBet 除數、鑽石形盤面…）。
5. 「建立模板」→ 依 Q&A 自動注入缺少的 WILD / xN / JP 符號 → 組裝 `template`。

模板可匯入/匯出 JSON，或儲存至雲端（Google Sheets，後端 `gas/Code.gs`）。模板 I/O 統一由 `useTemplateIO` 處理。

---

### Phase 2：手動盤面驗算 (`useSlotEngine`)

- 畫筆模式：從符號選擇器點選後拖曳填格；CASH/動態乘倍點擊時彈出數值輸入。
- 鍵盤模式：直接輸入符號名稱，支援剪貼簿批次貼入。
- 盤面或押注變化 → 自動呼叫 `computeGridResults()` 即時結算，結果顯示於 `ResultView`。
- 支援可調線數、EXBET 倍率、全盤乘倍即時調整。

---

### Phase 3：AI / 本地盤面辨識 (`useGeminiVision`)

1. 上傳實機截圖（多張批次，縮圖列切換）。
2. 框選盤面 ROI、乘倍列 ROI、BET ROI（座標以百分比持久化於 localStorage）。
3. 兩種辨識路徑：
   - **AI 辨識** (`performAIVisionBatchMatching`)：呼叫 Gemini / 地端視覺模型（Prompt 見 `promptTemplates.js`）。
   - **本地辨識** (`performLocalVisionBatchMatching`)：用模板縮圖建 HOG 參考索引，純前端比對，不需 API。
4. 即時顯示小盤面預覽 + 結算，可傳送至 Phase 2 人工修正（↑ 鍵）。

---

### Phase 4：影片 / 串流自動偵測截圖

**輸入來源** (`useVideoSource`)：MP4 影片 / 瀏覽器螢幕擷取 / Python 原生視窗擷取
**輸出**：候選關鍵幀清單（含 OCR 數據與辨識結果）→ HTML 報告 / Excel / Session

整個系統最複雜的部分，分為以下子系統：

#### 4a. V-Line 停輪偵測 (`vlineScanner.js`)
將盤面 ROI 垂直切成 N 片，計算相鄰幀各片 MAE；全片低於閾值 ≥ 數幀 → 判定停輪截圖。
防呆：`hadSpinSinceLastStop` 旗標確保「有實質轉動過」才允許建立新候選，防贏分動畫衰退被誤判為新局。可選空盤過濾（σ < 35 跳過）。

#### 4b. WIN 追蹤特工 (`winPollAgent.js` + `useKeyframeExtractor`)
停輪後以高頻截圖掃描贏分區域：
| 機制 | 說明 |
|------|------|
| 快速短路 | 停輪原圖已有 WIN → 特工直接退場，保留原始清晰數據 |
| 截圖鎖定 | 鎖定第一次讀到 WIN 的最乾淨幀（`winPollCanvas`）|
| 2 次確認 | 同一數值連續讀到 2 次才視為有效 |
| 統一數據源 | BAL/BET/OrderID 都從鎖定幀讀取，確保同局 |
| 排乾佇列 | 被打斷時把佇列中已截好未 OCR 的幀全部掃完再退場 |

#### 4c. 自動辨識 (`useAutoRecognition`)
背景批量辨識：本地 HOG（`recognizeLocalBatch`）為主，可選 Gemini/地端為輔，結果接 `computeGridResults`。

#### 4d. 智慧去重與分局 (`useSmartDedup` / `useSpinGroupAnalysis`)
- 殘影淨化：須 OrderID 不同才淨化前局 WIN 殘留的假贏分。
- Union-Find 分組：OrderID + BET + BAL + WIN 比對合併同局幀；FG/Cascade 序列合併。
- 連續性驗算：自動計算 `BAL + BET − WIN` 是否與前局銜接，標記斷層（`mathState`）。

#### 4e. 報告與存檔 (`useReportGenerator` / `useAutoSave` / `sessionSerializer`)
- 自包含 HTML 報告：表頭固定、斷層標記、浮動導覽列（斷層/贏分/FG 一鍵跳轉）、盤面原圖 + WIN 特工截圖並排。
- 統計摘要（`statsCalculator`）：RTP、命中率、最大贏分/倍率、最長無贏連續局。
- Session 匯出/匯入：JSON + 圖片資料夾（File System Access API）。

---

### Phase 5：積木排程自動化 (`useFlowRunner` + `flowRunner.js`)

**目的**：透過 Python 後端控制遊戲視窗，以積木式流程自動遊玩並收集數據（P5 = 雙手；P4 = 眼睛）。

- **FlowRunner 引擎**：解析 Flow JSON → 逐塊執行，支援迴圈、條件、子流程、變數空間、暫停/繼續/停止、錯誤策略（stop/skip/retry）。
- **積木類型**：操控（點擊/按鍵/輸入文字/組合鍵）、等待（固定/穩定/數字變化）、找文字、OCR（批次/單次）、截圖、記錄結果、盤面辨識、流程（迴圈/條件/子流程）、變數工具、表格（逐行迭代/讀行/寫結果/匯出 Excel）、P4 操作（匯出報告/清資料）、控制（終止/跳出迴圈）。
- **ROI 名稱解析** (`roiResolver`)：流程只存 ROI 名稱（SPIN/REEL/WIN/BAL/BET/ORDER_ID/MULT 與自訂點擊目標），實際座標由 `usePhase4Store` 提供，支援遊戲層 / 平台層命名空間與群組。
- **表格驅動** (`spreadsheetIO` + `useAppStore.dataTables`)：上傳 Excel → `for_each_row` 迭代帳號清單；`append_result` 累積結果 → `export_results` 匯出 Excel。
- **流程存取** (`useFlowStorage`)：本地 localStorage + 雲端 GAS；內建範本見 `presetFlows.js`。
- 與 Phase 4 共用 `videoRef` / `candidates`，`recognize_grid` 積木回呼 P4 的本地辨識。

---

## 4. 結算引擎 (`computeGridResults.js`)

純函式，使用 `big.js` 杜絕 IEEE-754 浮點飄移。三種模式：

| 模式 | 說明 |
|------|------|
| `paylines` | 固定線獎，逐條從左向右匹配最佳符號（可選雙向）|
| `allways` | 全路線，扣除純 WILD 路線；含 xN 時笛卡爾積枚舉、按乘倍分組 |
| `symbolcount` | 消除模式（Pay Anywhere），只計數量 |

額外支援：WILD 替代、SCATTER 全盤掃描、CASH/COLLECT 收集、動態乘倍 xN（相乘/相加）、全盤乘倍列、DOUBLE/TRIPLE 符號（1 格算 2/3 連）、EXBET、可調線數、LineBet 除數、雙向連線。

> ⚠️ **修改結算邏輯後務必 `npm run test`**。`tests/` 共 3 檔（結算 45 + 符號 109 + 盤面形狀 25 = 179 項），是核心防線。
>
> ⚠️ **`symbolcount` 模式 UI 完整度**：引擎端完整實作，但 Phase 1 UI 尚未開放選此模式（需手動建 JSON）；Phase 3/4 報表完全原生相容。

---

## 5. 技術棧

| 類別 | 技術 |
|------|------|
| 框架 | React 18 + Vite 6 |
| 樣式 | Tailwind CSS v4（`@tailwindcss/vite`）|
| 狀態管理 | Zustand（2 stores）|
| 數值 OCR（本地） | PaddleOCR PP-OCRv4 via `@gutenye/ocr-browser` + `onnxruntime-web`（Web Worker）|
| 盤面辨識（本地） | 自實作 HOG + 中心HOG + Hue 直方圖 + SSIM 仲裁 |
| AI 辨識 | Gemini Vision API 或地端 OpenAI 相容視覺模型 |
| 試算表 | SheetJS (`xlsx`) |
| 數學精度 | `big.js` |
| 圖示 | `lucide-react` |
| 雲端後端 | Google Apps Script（Google Sheets）|
| 原生擷取/控制 | Python：`websockets` + `mss` / PrintWindow + `pyautogui` / PostMessage + RapidOCR |
| 測試 | Vitest |

---

## 6. 開發注意事項

1. **改動前先讀 `.agent/SPEC.md`**：詳列所有狀態、行為規範與防呆規則。
2. **新增 Template 狀態欄位**：需同步多處（SPEC.md 第 14 節 Checklist）；核心入口為 `useTemplateBuilder` → `useTemplateIO.applyTemplateData` → `useCloud` → `Phase1Setup`，遺漏任一處會造成匯入/雲端載入/重置 Bug。
3. **結算引擎測試不可打破**：`npm run test` 必須全過。
4. **架構文件同步**（`.agent/rules.md` 規則 6）：新增/刪除檔案、重構 Hook、變更資料結構時，須同步更新 `.agent/skills/project-architecture/SKILL.md`。
5. **Vite 已忽略** `screen-capture-server/`、`.agent/`、`*.md`：修改這些不會觸發 HMR（`vite.config.js` → `server.watch.ignored`）。
6. **雲端 API**：後端為 GAS（`gas/Code.gs`），URL/token 在 `utils/constants.js`。
7. **OCR 模型/WASM** 放在 `public/`，以 `import.meta.env.BASE_URL` 載入；打包路徑帶 `base`，請勿假設根路徑。
