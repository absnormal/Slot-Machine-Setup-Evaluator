# 老虎機線獎辨識工具 (Slot Machine Setup Evaluator)

用於實機老虎機的「賠率表建立 → 盤面辨識 → 贏分結算驗證」全流程工具。  
支援影片/串流自動截圖、PaddleOCR 本地贏分讀取、Gemini Vision AI 盤面辨識，最終產出含斷層標記的 HTML 驗證報告。

---

## 1. 啟動指南

### 環境需求

| 項目 | 版本 |
|------|------|
| Node.js | 18+ |
| npm | 隨 Node 附帶即可 |

### 安裝與啟動

```bash
git clone https://github.com/absnormal/Slot-Machine-Setup-Evaluator.git
cd Slot-Machine-Setup-Evaluator

npm install      # 安裝依賴
npm run dev      # 啟動開發伺服器 (預設 http://localhost:5173)
```

### 其他指令

```bash
npm run build    # 正式打包 (輸出至 dist/)
npm run test     # 執行結算引擎單元測試 (45 項)
npm run preview  # 預覽 production build
```

### API Key 設定

本工具使用 **Gemini API** 進行盤面辨識與賠率表 OCR。  
啟動後點右上角 ⚙️ 齒輪圖示，在設定面板中填入 API Key（儲存於瀏覽器 localStorage）。  
無 API Key 時 Phase 1 的 AI 賠率辨識與 Phase 3 的 AI 盤面辨識無法使用，其餘功能不受影響。

---

## 2. 目錄架構

```
.
├── index.html                  # Vite 入口 HTML
├── vite.config.js              # Vite + Tailwind v4 + React 設定
├── package.json                # 依賴與 scripts
│
├── .agent/                     # 開發者文件（Vite watch 已忽略）
│   ├── SPEC.md                 # 完整功能規範書（改動前必讀）
│   └── SKILL.md                # 開發技能定義與模組架構
│
├── gas/                        # Google Apps Script 雲端後端
│   └── Code.gs                 # 模板的 CRUD API（部署於 Google Sheets）
│
├── public/                     # 靜態資源（不經 Vite 處理）
│   ├── ocr-models/             # PaddleOCR ONNX 模型檔
│   │   ├── ch_PP-OCRv4_det_infer.onnx    # 文字偵測模型
│   │   ├── ch_PP-OCRv4_rec_infer.onnx    # 文字辨識模型
│   │   └── ppocr_keys_v1.txt             # 字典檔
│   └── ort-wasm-*.wasm         # ONNX Runtime WebAssembly 執行檔
│
├── tests/
│   └── computeGridResults.test.js  # 結算引擎 45 項單元測試
│
└── src/
    ├── main.jsx                # React 進入點
    ├── index.css               # Tailwind v4 全域樣式
    ├── App.jsx                 # 應用主體（Phase 間資料流、快捷鍵、手風琴）
    │
    ├── engine/                 # 純函式運算引擎（無 React 依賴）
    │   ├── computeGridResults.js   # 結算核心（Paylines / AllWays / SymbolCount）
    │   ├── vlineScanner.js         # V-Line 切片動態偵測（5 軸 MAE 分析）
    │   └── ocrPipeline.js          # 截圖裁切 + PaddleOCR 文字辨識管線
    │
    ├── hooks/                  # React Custom Hooks（業務邏輯層）
    │   ├── useTemplateBuilder.js       # Phase 1 組合 Hook：組裝 template 物件
    │   │   ├── (子) useCanvasLineExtractor.js  # 線獎圖片色彩提取
    │   │   └── (子) usePaytableProcessor.js    # 賠率表 AI OCR + 表格管理
    │   ├── useTemplateIO.js           # 模板匯入/匯出/雲端載入統一入口
    │   ├── useSlotEngine.js           # Phase 2 盤面結算即時計算
    │   ├── useGeminiVision.js         # Phase 3 組合 Hook：ROI 框選 + Canvas
    │   │   ├── (子) useVisionImageManager.js   # 圖片上傳/切換/管理
    │   │   └── (子) useVisionBatchProcessor.js # Gemini API 批次辨識
    │   ├── useVideoProcessor.js       # Phase 4 影片/串流 UI 狀態管理
    │   ├── useKeyframeExtractor.js    # Phase 4 核心：V-Line 偵測 + WIN 特工 + Smart Dedup
    │   ├── useReportGenerator.js      # HTML 報表產生（含浮動導覽列）
    │   ├── useAutoRecognition.js      # Phase 4→Phase 3 自動辨識串接
    │   ├── useCloud.js                # 雲端 CRUD（呼叫 GAS API）
    │   ├── useLightbox.js             # 圖片放大燈箱
    │   └── useCanvasDrag.js           # Canvas 拖曳框選
    │
    ├── components/             # React 元件
    │   ├── Phase1Setup.jsx         # Phase 1 設定介面
    │   ├── Phase2Manual.jsx        # Phase 2 手動盤面 + 畫筆
    │   ├── Phase3Vision.jsx        # Phase 3 AI 辨識介面
    │   ├── Phase4Video.jsx         # Phase 4 影片偵測 + 候選幀管理 + 匯出
    │   ├── ResultView.jsx          # 結算結果面板（Phase 2/3 共用）
    │   ├── AppHeader.jsx           # 頂部標頭
    │   ├── CloudModal.jsx          # 雲端模板庫彈窗
    │   ├── SettingsModal.jsx       # 設定面板（API Key）
    │   ├── ErrorBoundary.jsx       # 錯誤邊界（各 Phase 獨立包覆）
    │   ├── ToastMessage.jsx        # Toast 訊息
    │   ├── phase1/                 # Phase 1 子元件
    │   │   ├── LineModeConfig.jsx      # 線獎模式設定（Paylines/AllWays/SymbolCount）
    │   │   ├── PaytableConfig.jsx      # 賠率表設定（圖片 OCR / 手動輸入）
    │   │   ├── SpecialSymbolQA.jsx     # Q&A 問卷（乘倍/CASH/JP 等）
    │   │   └── TemplateToolbar.jsx     # 模板工具列（匯入/匯出/雲端）
    │   ├── phase2/
    │   │   └── BrushToolbar.jsx        # 畫筆工具列 + 符號選擇器
    │   └── modals/
    │       ├── PtConfirmModal.jsx      # AI 分析前確認
    │       ├── BuildErrorModal.jsx     # 建構錯誤提示
    │       ├── PtCropModal.jsx         # 符號縮圖裁切 + Lightbox
    │       ├── OverwriteConfirmModal.jsx # 雲端覆寫確認
    │       └── CashValueModal.jsx      # 金幣/乘倍數值輸入
    │
    ├── stores/
    │   └── useAppStore.js      # Zustand 全域狀態（手風琴、API Key、Toast）
    │
    ├── config/
    │   └── promptTemplates.js  # Gemini Vision AI Prompt 模板
    │
    └── utils/
        ├── symbolUtils.js      # 符號分類判定（WILD/SCATTER/CASH/JP/xN）
        ├── videoUtils.js       # 灰階提取、MAE 計算、Canvas 快取
        ├── aiValidator.js      # AI 辨識結果驗證與修正
        ├── helpers.js          # 通用工具函式
        └── constants.js        # GAS URL、API Key 常數
```

---

## 3. 資料處理流程

### 整體架構：四階段串接

```
Phase 1 (模板建立) → template 物件
                        ↓ 共用
Phase 2 (手動驗算) ←→ Phase 3 (AI 辨識) ← Phase 4 (影片截圖)
                        ↓
              computeGridResults() → 結算結果
                        ↓
              HTML 報告匯出（含贏分連續性驗證）
```

四個 Phase 以手風琴呈現，同時只展開一個。Phase 間可透過箭頭按鈕或快捷鍵傳送盤面資料。

---

### Phase 1：模板建立 (`useTemplateBuilder`)

**輸入**：遊戲名稱、盤面尺寸、線獎圖片、賠率表截圖  
**輸出**：`template` 物件（供 Phase 2~4 共用）

1. 設定盤面列數 × 行數、線獎模式（Paylines / AllWays / SymbolCount）
2. 上傳線獎圖片 → Canvas 色彩分析提取連線座標；或手動文字輸入
3. 上傳賠率表截圖 → Gemini AI OCR 自動辨識符號與賠率；或手動文字輸入
4. Q&A 問卷設定特殊機制（全盤乘倍、CASH/COLLECT、JP、動態乘倍 xN）
5. 點擊「建立模板」→ 自動注入缺少的 WILD/xN/JP 符號 → 組裝 `template`

模板可匯入/匯出 JSON，也可儲存至雲端（Google Sheets，後端為 `gas/Code.gs`）。

---

### Phase 2：手動盤面驗算 (`useSlotEngine`)

**輸入**：`template` + 手動填入的盤面  
**輸出**：即時結算結果

- 畫筆模式：從符號選擇器點選，拖曳填入盤面格子
- 鍵盤模式：直接打字輸入符號名稱
- 每次盤面變化自動呼叫 `computeGridResults()` 即時計算
- 結算結果顯示在右側 `ResultView`（含中獎線路明細、SCATTER、CASH/COLLECT）

---

### Phase 3：AI 實機截圖辨識 (`useGeminiVision`)

**輸入**：實機截圖 + ROI 框選  
**輸出**：辨識出的盤面 → 自動結算

1. 上傳實機截圖（支援多張批次）
2. 滑鼠框選盤面 ROI、押注 ROI、乘倍列 ROI
3. 呼叫 Gemini Vision API 辨識盤面符號（Prompt 定義於 `promptTemplates.js`）
4. 辨識結果即時顯示小盤面預覽 + 結算
5. 可傳送至 Phase 2 進行人工修正（↑ 鍵）

---

### Phase 4：影片自動偵測截圖 (`useVideoProcessor` + `useKeyframeExtractor`)

**輸入**：影片檔案 或 OBS 串流  
**輸出**：候選關鍵幀清單（含 OCR 數據）→ HTML 報告

這是整個系統最複雜的部分，分為以下子系統：

#### 4a. V-Line 動態偵測 (`vlineScanner.js`)

- 將 Reel ROI 切成 5 軸，計算相鄰幀的 MAE（Mean Absolute Error）
- 全軸停止 ≥ 3 幀 → 判定為「停輪」，截取候選幀
- 防呆：`hadSpinSinceLastStop` 旗標，確保「有旋轉過」才允許建立新候選，防止贏分動畫衰退被誤判為新的一局

#### 4b. WIN 追蹤特工 (`useKeyframeExtractor`)

停輪後啟動，以 20 FPS 持續截圖掃描贏分區域：

| 機制 | 說明 |
|------|------|
| 快速短路 | 停輪原圖已有 WIN → 特工直接下班，保留原始清晰數據 |
| 截圖鎖定 | `bestWinCanvas` 鎖定在第一次讀到 WIN 的幀（最乾淨） |
| 2 次確認 | 同一數值連續讀到 2 次才視為有效 |
| 統一數據源 | BAL/BET/OrderID 都從 bestWinCanvas 讀取，確保同局 |
| 排乾佇列 | 被打斷時把佇列中已截好未 OCR 的幀全部掃完再退場 |

#### 4c. Smart Dedup（智慧去重）

- 殘影淨化：偵測前局 WIN 殘留在畫面上的假贏分（需 OrderID 不同才淨化）
- Union-Find 分組：OrderID + BET + BAL + WIN 字串比對合併同局幀
- FG 合併：依據使用者選擇的 FG 類型（贏分延續型 / 歸零型）合併 Free Game 序列

#### 4d. HTML 報告 (`useReportGenerator`)

- 表頭固定 (`position: sticky`)
- 連續性驗算：自動計算 `BAL + BET - WIN` 是否與前局銜接，標記斷層
- 浮動導覽列：支援「斷層 / 贏分 / FG」一鍵跳轉，位置感知，循環滾動
- 雙截圖：盤面原圖 + WIN 特工截圖並排顯示

---

### 結算引擎 (`computeGridResults.js`)

純函式，無 React 依賴。支援三種模式：

| 模式 | 說明 |
|------|------|
| `paylines` | 固定線獎，逐條匹配最佳符號 |
| `allways` | 全路線，扣除純 WILD 路線 (`pureWildWays`) |
| `symbolcount` | 消除模式（Pay Anywhere），只計數量 |

額外支援：WILD 替代、SCATTER 全盤掃描、CASH/COLLECT 收集、動態乘倍 xN、全盤乘倍列、DOUBLE 雙倍符號。  
**共 45 項單元測試覆蓋**，修改後務必執行 `npm run test`。

---

## 4. 技術棧

| 類別 | 技術 |
|------|------|
| 框架 | React 18 + Vite 6 |
| 樣式 | Tailwind CSS v4 (Vite Plugin) |
| 狀態管理 | Zustand |
| OCR (本地) | PaddleOCR v4 via ONNX Runtime WebAssembly |
| AI 辨識 | Gemini Vision API |
| 雲端後端 | Google Apps Script (Google Sheets) |
| 數學精度 | big.js |
| 圖示 | lucide-react |
| 測試 | Vitest |

---

## 5. 開發注意事項

1. **改動前先讀 `.agent/SPEC.md`**  
   這份文件詳列了所有狀態、行為規範與防呆規則。忽略它會踩坑。

2. **新增 Template 狀態欄位**  
   需同步修改 12 個位置（詳見 SPEC.md 第 14 節 Checklist），遺漏任何一處都會造成匯入/雲端載入/重置時的 Bug。

3. **結算引擎的測試不可打破**  
   `npm run test` 必須全過。結算邏輯是核心中的核心。

4. **Vite 已設定忽略 `.agent/` 和 `*.md`**  
   修改文件不會觸發頁面重新整理（`vite.config.js` → `server.watch.ignored`）。

5. **雲端 API**  
   後端是 Google Apps Script（`gas/Code.gs`），部署為 Web App，URL 寫在 `utils/constants.js` 的 `GAS_URL`。
