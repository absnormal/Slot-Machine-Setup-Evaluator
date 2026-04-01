---
name: Slot Machine Evaluator Development
description: 專門用於開發與維護「老虎機線獎辨識工具」的技能，涵蓋四分析階段的核心邏輯與補丁機制。
---

# 老虎機辨識工具開發技能 (Slot Machine Evaluator Development Skill)

本技能旨在提供開發人員與 AI 助理一套完整的標準流程，用於維護及擴充「老虎機線獎辨識工具」。

## 1. 核心架構 (Core Architecture)

本工具採用「四階段辨識流程」，各階段以手風琴折疊呈現，狀態透過 Zustand (`useAppStore`) 管理：

1.  **Phase 1 (Template Builder)**: 上傳線獎圖片/文字建立連線模板，透過 AI OCR 或手動輸入建立賠付表。
2.  **Phase 2 (Manual Update)**: 手動盤面設定與即時結算驗證（畫筆/鍵盤模式）。
3.  **Phase 3 (AI Vision)**: 利用 Gemini Vision API 自動辨識實機截圖盤面，支援批次處理。
4.  **Phase 4 (Video Processing)**: 影片動態偵測自動截圖，傳送至 Phase 3 批次辨識。

### Hook 組合架構

```
App.jsx (~430 行)
  ├─ useTemplateBuilder()      ← 組合 Hook，對外介面不變
  │    ├─ useCanvasLineExtractor()  ← Canvas 圖片提取
  │    └─ usePaytableProcessor()    ← 賠率表 AI + 表格
  ├─ useTemplateIO()           ← 模板匯入/匯出/雲端存取統一
  ├─ useSlotEngine()           ← Phase 2 結算
  ├─ useGeminiVision()         ← 組合 Hook，負責 ROI 與 Canvas
  │    ├─ useVisionImageManager()   ← 圖片清單 CRUD 與切換
  │    └─ useVisionBatchProcessor() ← Gemini API 批次辨識與進度
  ├─ useVideoProcessor()       ← Phase 4 影片偵測
  └─ useCloud()                ← 雲端 CRUD
```

## 2. 關鍵組件與 Hook (Key Components & Hooks)

### Phase 1 模板建構系統
| Hook | 用途 |
|---|---|
| `useTemplateBuilder.js` | **組合 Hook**：管理 config state、build 邏輯、reset，組合下方兩個子 hook |
| `useCanvasLineExtractor.js` | Canvas 線獎圖片提取：圖片上傳、繪圖、控制點拖拽、色彩分析 |
| `usePaytableProcessor.js` | 賠率表處理：文字/表格同步、AI OCR (Gemini)、縮圖管理 |
| `useTemplateIO.js` | 模板 IO 統一：匯入/匯出 JSON、雲端載入/儲存、`applyTemplateData()` 共用入口 |

### Phase 2-4
| Hook | 用途 |
|---|---|
| `useSlotEngine.js` | Phase 2 結算引擎：盤面管理、符號畫筆、即時計算 |
| `useGeminiVision.js` | Phase 3 **組合 Hook**：Canvas 繪圖、ROI 框選拖拽、保留對外介面 |
| `useVisionImageManager.js` | 圖片上傳、切換預覽、方向鍵綁定 |
| `useVisionBatchProcessor.js` | AI 批次辨識：組裝 prompt、API 呼叫、進度控制、取消機制 |
| `useVideoProcessor.js` | Phase 4 影片偵測：Motion Detection 狀態機 (IDLE→SPINNING→SETTLING→CAPTURE) |

### 結算引擎 (`computeGridResults.js`)
*   **核心邏輯**: 處理 Paylines / All Ways / Symbol Count 三種模式、WILD 替代、SCATTER、CASH/COLLECT、全盤乘倍、線上乘倍。
*   **測試**: 45 個單元測試 (`tests/computeGridResults.test.js`)。

### UI 子元件
| 元件 | 用途 |
|---|---|
| `phase2/BrushToolbar.jsx` | 畫筆工具列 + 符號選擇器 (從 Phase2Manual 抽出) |
| `modals/PtConfirmModal.jsx` | AI 賠率分析前確認 |
| `modals/BuildErrorModal.jsx` | 建構錯誤提示 |
| `modals/PtCropModal.jsx` | 符號縮圖擷取 + Lightbox |
| `modals/OverwriteConfirmModal.jsx` | 雲端覆蓋確認 |
| `modals/CashValueModal.jsx` | 金幣/乘倍數值輸入 |

## 3. 驗證流程 (Verification)

每次修改後**必須**執行以下驗證：

```bash
# 1. Build 驗證 (無編譯錯誤)
npm run build

# 2. 單元測試 (45 tests)
npx vitest run

# 3. Runtime 驗證 (手動檢查)
npm run dev
# → 確認 4 個 Phase 全部正常渲染、無 console error
```

## 4. 開發規範 (Development Standards)

*   **繁體中文**: 所有對外說明與計畫書必須使用繁體中文。
*   **自動 Commit**: 每次改動後需執行 `git commit`，訊息應包含 PLAN 名稱。
*   **螢幕協調**: Phase 1 的 Bounding Box 座標與 Phase 3 的辨識座標必須保持 1:1 對齊。
*   **🚨 SPEC.md 強制同步規則（最高優先）**:
    1.  每次修改「功能行為」「新增/刪除狀態」「修改結算邏輯」「修改快捷鍵」「修改 Phase 間傳送機制」「修改雲端/本機匯出入欄位」時，**必須**同步更新 `.agent/SPEC.md`。
    2.  在執行 `git commit` **之前**，先完成 `SPEC.md` 的修改，並將其一同 commit。
    3.  若修改涉及新增 Template 狀態欄位，**必須**對照 `SPEC.md` 第 14 節的 Checklist 逐項確認。
    4.  任何修改開始前，**先閱讀 `.agent/SPEC.md` 中相關章節**，確認不會破壞已記錄的行為規範。

## 5. 實戰範例 (Usage Examples)

### 案例 1：新增 Template 狀態欄位 (e.g. `hasStickyWild`)
1.  **對照 SPEC.md 第 14 節 Checklist**，逐項修改所有相關檔案。
2.  核心修改點：`useTemplateBuilder.js` (state + build + reset + return) → `useTemplateIO.js` (`applyTemplateData`) → `useCloud.js` → `Phase1Setup.jsx`。
3.  執行 build + test 驗證。

### 案例 2：修改賠率表 AI OCR 邏輯
1.  修改 `src/hooks/usePaytableProcessor.js` 的 `handlePtExtract()` 函數。
2.  Prompt 模板位於 `src/config/promptTemplates.js`。
3.  注意：`usePaytableProcessor` 的表格操作函數需要透過參數接收 `setPaytableInput`。

### 案例 3：修改 Canvas 線獎提取邏輯
1.  修改 `src/hooks/useCanvasLineExtractor.js`。
2.  `draw()` 函數負責繪圖，`analyzeImage()` 負責色彩分析提取。

## 6. 常見問題 (Troubleshooting)

*   **圖標辨識不到**: 檢查 `template.paytable` 是否包含該符號，並確認 Gemini 回傳的 Label 與 `symbolUtils.js` 的判斷邏輯一致。
*   **動態檢測失靈**: 調整 `useVideoProcessor` 中的 `sensitivity`、`motionCoverageMin`、`motionDelay` 參數。
*   **方法或狀態未定義錯誤 (`is not a function`)**: Custom Hook 擴充新狀態時，最容易忘記在 `return { ... }` 匯出。特別注意 `useTemplateBuilder.js` 組合 Hook 需要**同時轉發子 hook 的回傳值**。
*   **雲端存檔遺失新欄位 (`ReferenceError`)**: 需同時更新 `useCloud.js` 的**參數解構**和 `newTemplate` 物件，以及 `useTemplateIO.js` 的 `handleSaveToCloud` 呼叫處。
*   **匯入/載入後新欄位被重置**: 修改 `useTemplateIO.js` 的 `applyTemplateData()`，這是雲端載入與本地匯入的**唯一共用入口**。
*   **賠率表操作不同步**: `usePaytableProcessor` 的 `handlePtTableChange` 等函數需透過參數接收 `setPaytableInput`。`useTemplateBuilder` 使用 wrapper 函數綁定此依賴。
