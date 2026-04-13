# 🎰 老虎機線獎辨識工具 (Slot Machine Setup Evaluator)

這是一個專門為「實機老虎機」進行**賠率表自動擷取**、**實機影片動態偵測截圖**、**AI 自動辨識盤面**與**贏分驗證結算**的 React 開發工具。

透過結合 Gemini Vision API、前端 WebAssembly OCR (PaddleOCR)、圖像分析 (V-Line Scanner) 與精密的結算引擎，本工具旨在大幅減少測試與審查人員核對錄影畫面的時間，將其轉換為可量化與匯出的自動報告。

---

## 🚀 1. 快速啟動指南 (Getting Started)

### 環境需求
* **Node.js**: v18+ 
* **npm** 或 **yarn**

### 安裝與運行
```bash
# 1. 將專案 Clone 到本地端
git clone https://github.com/absnormal/Slot-Machine-Setup-Evaluator.git
cd Slot-Machine-Setup-Evaluator

# 2. 安裝依賴 (使用 npm)
npm install

# 3. 啟動本機開發伺服器
npm run dev
```
啟動後，開啟瀏覽器並進入 `http://localhost:5173`。

### 環境變數設定
專案需要 **Gemini API Key** 才能進行 AI Vision 盤面與賠率表的自動辨識。
您無須在環境建立 `.env` 檔，只需於介面右上角點擊「⚙️ 齒輪」圖示 (SettingsModal) 直接填入您的 Gemini API 即可（儲存於 LocalStorage）。 

---

## 📁 2. 目錄架構說明 (Folder Structure)

本專案採模組化的 React 架構，核心運算引擎與 React UI 分離。

```
Slot-Machine-Setup-Evaluator/
├── .agent/                    # [重要] 存放開發環境與文件規範
│   ├── SPEC.md                # ⚡️ 核心規格書（任何改動前必讀，詳列所有狀態與防呆規則）
│   └── SKILL.md               # 開發者與 Agent 共通的技能定義與架構觀念
├── tests/                     # Vitest 單元測試
│   └── computeGridResults.test.js # 結算引擎核心邏輯的 45 項單元測試（絕對不可打破）
├── public/                    # 靜態資源、Paddle OCR Model (onnx)
└── src/
    ├── App.jsx                # 應用程式入口，處理四大 Phase 之間膠水邏輯與快捷鍵
    ├── components/            # React 元件庫
    │   ├── modals/            # 所有的燈箱與彈窗 (如確認框、金幣計算、設定等)
    │   ├── Phase1Setup.jsx    # 第一階段：遊戲環境、線路與賠率表設定
    │   ├── Phase2Manual.jsx   # 第二階段：手動盤面配置與畫筆工具介面
    │   ├── Phase3Vision.jsx   # 第三階段：AI 圖片與實機圖辨識
    │   ├── Phase4Video.jsx    # 第四階段：實機影片解析、去殘影邏輯與匯出報告
    │   └── ... 
    ├── config/
    │   └── promptTemplates.js # 呼叫 Gemini Vision 時使用的 AI 咒語/模板
    ├── engine/                # [核心運算] 純函式、不受框架干擾的核心模組
    │   ├── computeGridResults.js # 🎉 結算計算引擎 (Paylines, AllWays, Anywhere)
    │   ├── ocrPipeline.js        # WebAssembly OCR 影像前置裁切與文字辨識
    │   └── vlineScanner.js       # V-Line 動態偵測：負責切片計算幀間差異判斷轉輪狀態
    ├── hooks/                 # 針對不同業務抽離封裝的邏輯 (Custom Hooks)
    │   ├── useTemplateBuilder.js # 管理 Phase 1 的所有組裝與設定狀態
    │   ├── useSlotEngine.js      # 管理 Phase 2 結算即時狀態
    │   ├── useVisionBatchProcessor.js # 實作批次呼叫 Gemini AI 辨識的佇列
    │   ├── useKeyframeExtractor.js    # Phase 4：實時幀抽取與特工作業 (WIN Poll)
    │   └── useReportGenerator.js      # 產出最終含有雙對比圖的 HTML 報表
    ├── stores/                # Zustand 全域狀態中心
    │   └── useAppStore.js     # 存放手風琴展開狀態、全域 API Key 等
    └── utils/                 # 工具小函式
        └── symbolUtils.js     # 封裝所有的特殊符號判定 (如 JP, Wild, Scatter)
```

---

## 🔄 3. 資料處理流程 (Data Flow)

本工具嚴格遵循「**四大階段 (Phase 1 ~ Phase 4)**」的單向資料流，以手風琴形式呈現，並將各階段的產出「傳遞 (Transfer)」至下一階。 

### Phase 1：環境建立 (Template Builder)
1. **設定參數**：使用者設定盤面長寬、Q&A 問卷 (有無乘倍、CASH 等特殊機制)。
2. **擷取線獎**：透過顏色提取圖片中的 Paylines。
3. **建立賠率表 (Paytable)**：上傳總說明書，使用 Gemini AI 自動 OCR，抓出所有付費符號及相對應賠率（或是使用者手動繪製/修改表格）。
4. **輸出 `Template`**：點擊確認後產生物件 `template` 下放供 Phase 2~4 所有的引擎共用。包含 `jpConfig` 甚至動態添加 `xN` 符號等防呆皆在建立時自動補齊。

### Phase 2：手動驗算 (Manual Simulator)
* 開發者可以使用本階的 **畫筆工具列 (Brush Toolbar)** 隨機或是手動擺放物件。
* 若發生變化，會即刻呼叫 `computeGridResults.js` 引擎得出結算表（包含中獎線路、中獎金額、收集獎項、SCATTER 機制等）。

### Phase 3：實機圖片 AI 辨識 (Vision Analysis)
* 使用者上傳實機截圖，使用滑鼠框選 **「原廠盤面範圍 (ROI)」**。
* 呼叫 `performAIVisionBatchMatching` 委派給 Gemini AI 引擎。
* AI 辨識得到的字串與座標轉換為 Phase 2 共用的 `grid`（盤面二維陣列），並於左側即時預覽。有疑慮時，能以「向下箭頭 (傳送按鈕)」將辨識結果送到 Phase 2 進行修改。

### Phase 4：自動影片追蹤錄影 (Video Dynamics & Keyframes)
本專案的「大腦與防呆」最密集的地方。
1. **V-Line Scanner 轉輪偵測**：將指定區域以直向切分成 5 軸，分析連續幀的變化，自動判斷 `IDLE → SPINNING → SETTLING` (停輪)。
2. **WIN 追蹤特工 (WIN Polling)**：一旦偵測到停輪，會以 20 FPS 輪詢擷取贏分數字。
   * 特工使用 `PaddleOCR / ONNX` 在本地端作業。
   * 具備 V-Line 旋轉打斷(`hadSpinSinceLastStop`)及佇列排乾救援(Drain Queue)。
3. **智慧去重與融合 (Smart Dedup)**：利用贏分數學(Bal + Win - Bet) 結合『注單號 (OrderID)』檢查，移除影片或串流截屏途中所衍生的虛影殘影、結算尚未跳離的殘留重複畫面，與串接 Free Game。
4. **HTML 報告產出**：結合所有驗證資料，產出可導航、無廣告的可攜式 HTML 文件（透過 `useReportGenerator.js`）。

---

## 🛠 4. 給接手工程師的交接指南

### ⚠️ 最高守則：請隨時維護並服從 SPEC.md 
專案的每一個環節有高度關聯（例：你在 Phase 1 的問卷加入了一個 Toggle，這將影響 `useTemplateBuilder.js` 的狀態、`useTemplateIO.js` 的轉換、雲端 `useCloud.js` 的解構陣列、以及 `computeGridResults.js` 的最終數學算法）。
* **所有規則都詳述在 `.agent/SPEC.md`。開發或修復 Bug 前，請一定要詳讀對應章節！**
* 更新完程式了請連帶更新該檔案，請把這個 Markdown 文件視作為你的 **「單一知識來源 (SSOT)」**。

### 🚨 切勿忽視單元測試
在 `tests/computeGridResults.test.js` 有高達 45 項涵蓋所有遊戲路數與數學邏輯的測試。
如果你修改了結算引擎（`engine/computeGridResults.js`）或符號判定 (`utils/symbolUtils.js`)，請先執行：
```bash
npm run test
```
若有測試亮紅燈，**嚴禁強行 Commit 推進**，必須保證所有的結算數學邏輯正確。

### 📦 工具模組增加與共用
如果需要更換 AI 引擎或是 OCR 框架：
* **OCR (WebAssembly)** 相關皆放在 `engine/ocrPipeline.js`，將 Canvas 切割處理後的 Blob 與其對接。
* **Gemini AI** 相關則於 `hooks/useVisionBatchProcessor.js` 中管理串接、輪詢與 Error Handle。

> 祝您開發愉快，一切順利！有空記得看看 `App.jsx` 的整體資料流向，這能大幅度加速你適應整個平台的時間。 🍻
