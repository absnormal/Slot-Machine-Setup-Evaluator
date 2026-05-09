---
name: Slot Machine Evaluator Architecture
description: 老虎機辨識工具的完整架構文件，涵蓋 Phase 1-4 流程、檔案導覽、資料結構、狀態管理與關鍵設計決策。每次對話優先查閱此文件以避免重複讀取原始碼。
---

# 🎰 Slot Machine Setup Evaluator — 架構文件

> **用途**：每次新對話時快速回復上下文，避免重複讀取 800+ 行的原始檔。修改程式碼前先查此文件定位目標檔案。

## 1. 專案概觀

| 項目 | 值 |
|------|-----|
| **名稱** | Slot Machine Setup Evaluator (老虎機模板辨識工具) |
| **框架** | React (Vite) + Tailwind CSS |
| **狀態管理** | Zustand (2 stores) |
| **AI** | Google Gemini Vision API |
| **OCR** | Tesseract.js (Web Worker) |
| **影像辨識** | HOG (Histogram of Oriented Gradients) + 本地模板匹配 |
| **入口** | `src/main.jsx` → `src/App.jsx` |

## 2. 四階段流程 (Phase Pipeline)

```
Phase 1 (模板設定) → Phase 2 (手動驗證) → Phase 3 (AI辨識) → Phase 4 (影片自動化)
     ↓                    ↓                    ↓                    ↓
  SlotTemplate        手動填格子          批量AI辨識           即時偵測+OCR
                         ↓                    ↓                    ↓
                   computeGridResults   computeGridResults    自動結算+報表
```

### Phase 1 — 模板建構
- **目的**：定義遊戲規則（盤面大小、線獎路徑、賠付表、特殊符號）
- **核心 Hook**：`useTemplateBuilder` — 建構 `SlotTemplate` 物件
- **輸出**：`template` 物件，供所有後續 Phase 使用
- **元件**：`Phase1Setup.jsx` → `LineModeConfig.jsx`, `PaytableConfig.jsx`, `SpecialSymbolQA.jsx`
- **模板 I/O**：`useTemplateIO` — JSON 匯入/匯出、`useCloud` — 雲端 Firebase 同步

### Phase 2 — 手動結算
- **目的**：手動輸入盤面驗證結算引擎
- **核心引擎**：`computeGridResults.js` — 支援 paylines / allways / symbolcount 模式
- **元件**：`Phase2Manual.jsx` → `BrushToolbar.jsx`
- **Hook**：`useSlotEngine` — 包裝 `computeGridResults`，管理 grid state

### Phase 3 — AI 圖片辨識
- **目的**：上傳截圖 → Gemini 辨識盤面 → 自動結算
- **核心 Hook**：
  - `useGeminiVision` — Gemini API 呼叫 + ROI 裁切管理
  - `useVisionBatchProcessor` — 批量 OCR + 本地 HOG 辨識
  - `useVisionImageManager` — 管理上傳的圖片列表
- **元件**：`Phase3Vision.jsx`
- **辨識流程**：上傳圖 → ROI 裁切 → Gemini / 本地辨識 → grid → `computeGridResults`

### Phase 4 — 影片智慧分析
- **目的**：播放影片或即時螢幕擷取 → 自動偵測停輪 → 批量辨識 → 產出報表
- **核心 Hook**：
  - `useKeyframeExtractor` — 幀差偵測、V-Line 停輪判定、候選幀管理
  - `useAutoRecognition` — 背景批量辨識 (HOG + Gemini fallback)
  - `useSmartDedup` — 重複幀去除 + 分局群組化 (spin group)
  - `useSpinGroupAnalysis` — 連續性驗算 (BAL+BET=上局結餘) + cascade 偵測
  - `useReportGenerator` — HTML 報表產出 + Session 匯入/匯出
  - `useAutoSave` — 候選幀自動存檔至本機 (File System Access API)
- **偵測引擎**：
  - `vlineScanner.js` — 切片式 V-Line 偵測 (column-based MAE)
  - `winPollAgent.js` — WIN 變化追蹤特工 (高頻輪詢 WIN ROI)
  - `ocrPipeline.js` — `captureFullFrame`, `generateThumbUrl`, `cropAndOCR`
- **元件**：`Phase4Video.jsx` → `VideoPlayer.jsx`, `DetectionControlBar.jsx`, `SpinGroupList.jsx`, `CandidateCard.jsx`, `DiagnosticDashboard.jsx`, `SavePanel.jsx`, `ActionPanel.jsx`

## 3. 檔案導覽 (File Map)

### Components
| 檔案 | 用途 | 大小 |
|------|------|------|
| `App.jsx` | 主容器：Phase 路由、hooks 初始化、跨 Phase 資料傳遞 | 53KB ⚠️ |
| `Phase1Setup.jsx` | Phase 1 容器 | 12KB |
| `Phase2Manual.jsx` | Phase 2 容器 + 手動 grid 編輯 | 27KB |
| `Phase3Vision.jsx` | Phase 3 容器 + AI 辨識 UI | 33KB |
| `Phase4Video.jsx` | Phase 4 容器 + 偵測控制 | 18KB |
| `ResultView.jsx` | 結算結果展示（線獎高亮、賠率表） | 32KB |
| `phase4/VideoPlayer.jsx` | 影片播放器 + ROI 覆蓋層 + ROI 切換器 | 19KB |
| `phase4/CandidateCard.jsx` | 單張候選幀卡片（縮圖、OCR、辨識狀態） | 17KB |
| `phase4/SpinGroupList.jsx` | 分局列表（群組化展示、cascade 標記） | 11KB |
| `phase4/DetectionControlBar.jsx` | 偵測參數控制列 | 7KB |
| `phase4/DiagnosticDashboard.jsx` | 輕量診斷面板 | 5KB |
| `phase1/LineModeConfig.jsx` | 線獎模式設定 (paylines/allways/symbolcount) | 28KB |
| `phase1/PaytableConfig.jsx` | 賠付表編輯器 | 20KB |
| `phase1/SpecialSymbolQA.jsx` | 特殊符號問答設定 (WILD/SCATTER/JP/CASH) | 24KB |

### Hooks
| 檔案 | 用途 | 關鍵 exports |
|------|------|-------------|
| `useKeyframeExtractor.js` | 幀差偵測核心 | `startLiveDetection`, `candidates`, `setCandidates` |
| `useAutoRecognition.js` | 自動辨識管線 | `startAutoRecognition` |
| `useReportGenerator.js` | 報表 + Session I/O | `generateReport`, `saveSession`, `importSession` |
| `useSmartDedup.js` | 去重 + 分局 | `computeSmartDedup` |
| `useSpinGroupAnalysis.js` | 連續性驗算 | `analyzeSpinGroups` |
| `useAutoSave.js` | 幀圖片自動存檔 | `startAutoSave` |
| `useGeminiVision.js` | Gemini API 管理 | `recognizeGrid`, `visionP1` (ROI state) |
| `useVisionBatchProcessor.js` | 批量 HOG+OCR | `processAllImages` |
| `useTemplateBuilder.js` | 模板建構 | `template`, `setRows`, `setPaytable`... |
| `useTemplateIO.js` | 模板 JSON I/O | `exportTemplate`, `importTemplate` |
| `useROIDrag.js` | ROI 拖曳邏輯 | `handleMouseDown/Move/Up` |
| `useNativeCapture.js` | WebSocket 本地擷取 | `startCapture`, `stopCapture` |
| `useCloud.js` | Firebase 雲端同步 | `uploadTemplate`, `fetchTemplates` |
| `useSlotEngine.js` | Phase 2 結算包裝 | `computeResults` |

### Engine
| 檔案 | 用途 |
|------|------|
| `computeGridResults.js` | 核心結算引擎：paylines / allways / symbolcount + SCATTER + CASH/COLLECT |
| `localBoardRecognizer.js` | HOG 本地圖形辨識（不需 API） |
| `ocrPipeline.js` | `captureFullFrame`, `generateThumbUrl`, `cropAndOCR` |
| `vlineScanner.js` | V-Line 切片式停輪偵測 |
| `winPollAgent.js` | WIN 特工：高頻輪詢 WIN ROI 像素變化 |
| `ocrWorkerBridge.js` | Tesseract OCR Worker 橋接 |

### Stores (Zustand)
| 檔案 | 用途 |
|------|------|
| `useAppStore.js` | UI 全域狀態：Phase 展開/收合、Toast、餘額、API Key、暗色模式 |
| `usePhase4Store.js` | Phase 4 專屬：6 組 ROI 座標 (自動 localStorage 持久化)、偵測參數 |

### Utils
| 檔案 | 用途 |
|------|------|
| `symbolUtils.js` | 符號名稱解析、同義詞對照 |
| `videoUtils.js` | 影片幀處理工具 |
| `ocrUtils.js` | OCR 文字清理 |
| `displayUtils.js` | 數字格式化 |
| `aiValidator.js` | AI 辨識結果驗證 |
| `constants.js` | API Key 常數 |
| `templateDefaults.js` | 模板預設值 |

## 4. 核心資料結構

### ROI (Region of Interest)
```js
{ x: 5.9, y: 48.17, w: 87.92, h: 28.97 }  // 百分比座標 (0-100)
```
- **6 組 ROI**：`reel`, `win`, `balance`, `bet`, `orderId`, `multiplier`
- 儲存於 `usePhase4Store` + `localStorage` (`SLOT_P4_ROI_V2`)
- 匯出 Session 時寫入 JSON，匯入時還原到 Store

### Candidate (候選幀)
```js
{
  id: "kf_live_1776760945328",     // 唯一 ID
  time: 75.167,                     // 影片時間點 (秒)
  canvas: HTMLCanvasElement,        // 全幀畫布 (videoWidth × videoHeight)
  thumbUrl: "blob:...",             // 縮圖 URL
  diff: "0.32",                    // 幀差值
  status: "pending|recognized|error",
  ocrData: { win, balance, bet, orderId },
  recognitionResult: { grid, settlement, totalWin },
  spinGroupId: 0,                   // 分局 ID
  isSpinBest: true,                 // 群組最佳幀
  isCascadeMember: false,           // Cascade 連鎖成員
  winPollCanvas: HTMLCanvasElement,  // WIN 特工截圖
  useWinFrame: true,                // 顯示用：WIN幀 or 停輪幀
}
```

### SlotTemplate
```js
{
  name: "Game Name",
  rows: 3, cols: 5,
  lineMode: "paylines|allways|symbolcount",
  linesCount: 30,
  lines: [[0,0,0,0,0], [1,1,1,1,1], ...],
  paytable: { "A": [0,0,5,20,50], "WILD": [0,0,25,100,500] },
  symbolImages: { "A": "data:..." },
  jpConfig: { MINI: "MINI", MINOR: "MINOR", ... },
  hasMultiplierReel: false,
  hasDoubleSymbol: false,
  hasExBet: false,
  // ...更多設定見 src/types.js
}
```

## 5. 關鍵資料流

### Phase 4 偵測流程
```
Video/ScreenCapture
  → useKeyframeExtractor (V-Line Scanner)
    → 偵測停輪 → captureFullFrame → 建立 Candidate
    → winPollAgent (WIN 特工) → 偵測 WIN 變化 → 合併到 Candidate
    → useSmartDedup → 去重 + 分組 (spinGroupId)
    → useAutoRecognition → HOG 本地辨識 → computeGridResults
    → useSpinGroupAnalysis → 連續性驗算 (mathValid)
    → useAutoSave → 存檔到本機資料夾
```

### Session 匯出/匯入
```
匯出 (saveSession):
  candidates + ROIs → JSON + PNG 圖片 → 本機資料夾

匯入 (importSession):
  資料夾 → 讀 JSON → 讀圖片 → createImageBitmap → Canvas
  → 用 JSON 中的 ROI 裁切縮圖
  → 還原 ROI 到 usePhase4Store
  → 還原 candidates 到 keyframeExtractor
```

### Phase 4 → Phase 3 傳送
```
handleTransferPhase4ToPhase3:
  candidates[].canvas → toDataURL → Image
  → setVisionP1(reelROI)      // 告訴 Phase 3 裁切位置
  → setVisionImages(images)    // 送圖到 Phase 3
```

## 6. 重要設計決策 & 注意事項

### ROI 座標系統
- ROI 是 **百分比 (0-100)**，不是像素值
- 設定時基於 `containerRef.getBoundingClientRect()` (CSS 尺寸)
- 裁切時基於 `canvas.width/height` (原生解析度)
- 兩者**同比例**（video 無 letterbox），所以百分比可互通

### 縮圖產生
- **即時模式**：`generateThumbUrl(canvas, reelROI)` → data URL
- **匯入模式**：`generateThumbBlobUrl(canvas, cachedReelROI)` → blob URL (效能 3x)
- 兩者邏輯一致：`drawImage(canvas, sx, sy, sw, sh, 0, 0, dw, dh)`

### 本地擷取 (Native Capture)
- 透過 WebSocket 連線 Python 後端 (`ws://localhost:8765`)
- 收 JPEG blob → Image → 內部 Canvas → `captureStream(60)` → Video 元素
- `video.srcObject` 是 canvas 的 MediaStream
- `captureFullFrame(video)` 擷取的是 canvas stream 的當前幀

### 停輪偵測 (V-Line Scanner)
- 將盤面垂直切成 N 片 (cols 數)
- 每片計算 MAE (Mean Absolute Error) 與前幀差異
- 所有切片 MAE < threshold → 判定停輪
- 額外判斷：boardStd < 35 = 空盤（可選擇跳過）

### WIN 特工 (Win Poll Agent)
- 停輪截圖後啟動，高頻輪詢 WIN ROI 區域
- 偵測到 WIN 數字穩定後截圖 → 合併回原始 Candidate
- 目的：捕捉「停輪後跑分動畫結束」的最終畫面

### 結算引擎 (computeGridResults)
- 三種模式：`paylines` / `allways` / `symbolcount`
- 支援 WILD 替代、SCATTER 獨立計算、CASH/COLLECT
- 支援乘數轉軸 (multiplier reel)
- 支援 EXBET（額外押注解鎖功能，結算仍基於基礎 bet）
- 支援雙向連線 (bidirectional paylines)

### 報表系統 (useReportGenerator)
- 產出自包含 HTML 報表（內嵌 base64 圖片）
- 報表包含：分局列表、連續性驗算、統計摘要 (RTP/命中率/最大贏分)
- Session 匯出：JSON + 圖片資料夾
- Session 匯入：讀資料夾 → 還原 candidates + ROIs

## 7. localStorage 快取 Keys

| Key | 用途 |
|-----|------|
| `SLOT_P4_ROI_V2` | Phase 4 六組 ROI 座標 |
| `slot_total_balance` | 資產餘額 |
| `gemini_api_key` | 自訂 Gemini API Key |
| `slot_dark_mode` | 暗色模式開關 |
| `slot_vision_p1` | Phase 3 主要 ROI |
| `slot_vision_p1_mult` | Phase 3 乘倍 ROI |
| `slot_vision_p1_bet` | Phase 3 押注 ROI |

## 8. 常見修改情境對照

| 要改什麼 | 先看哪裡 |
|---------|---------|
| 辨識結果/盤面渲染 | `ResultView.jsx`, `computeGridResults.js` |
| 停輪偵測邏輯 | `useKeyframeExtractor.js`, `vlineScanner.js` |
| OCR 數值讀取 | `ocrPipeline.js`, `ocrUtils.js` |
| 候選幀卡片 UI | `phase4/CandidateCard.jsx` |
| 分局列表 UI | `phase4/SpinGroupList.jsx` |
| ROI 拖曳互動 | `useROIDrag.js`, `phase4/VideoPlayer.jsx` |
| 報表格式 | `useReportGenerator.js` (巨大檔 50KB，搜尋 `generateReportHTML`) |
| Session 匯入匯出 | `useReportGenerator.js` (搜尋 `saveSession` / `importSession`) |
| 模板賠付表 | `phase1/PaytableConfig.jsx`, `useTemplateBuilder.js` |
| 模板線獎設定 | `phase1/LineModeConfig.jsx` |
| Gemini API 呼叫 | `useGeminiVision.js`, `config/promptTemplates.js` |
| 本地 HOG 辨識 | `localBoardRecognizer.js` |
| 自動辨識管線 | `useAutoRecognition.js` |
| 連續性驗算 | `useSpinGroupAnalysis.js` |
| 去重分組 | `useSmartDedup.js` |
| Phase 間資料傳遞 | `App.jsx` (搜尋 `handleTransfer`) |
| 偵測參數 UI | `phase4/DetectionControlBar.jsx` |
| 存檔功能 | `useAutoSave.js`, `phase4/SavePanel.jsx` |

---
*最後更新：2026-05-09*
