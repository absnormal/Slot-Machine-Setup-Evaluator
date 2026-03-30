---
name: Slot Machine Evaluator Development
description: 專門用於開發與維護「老虎機線獎辨識工具」的技能，涵蓋四分析階段的核心邏輯與補丁機制。
---

# 老虎機辨識工具開發技能 (Slot Machine Evaluator Development Skill)

本技能旨在提供開發人員與 AI 助理一套完整的標準流程，用於維護及擴充「老虎機線獎辨識工具」。

## 1. 核心架構 (Core Architecture)

本工具採用的「四階段辨識流程」如下，各階段狀態透過 `App.jsx` 的 `phase` 狀態進行切換：

1.  **Phase 1 (Template Builder)**: 使用者點擊圖片上的圖標位置，建立賠率表模板。
2.  **Phase 2 (Manual Update)**: 手動輸入餘額與倍數，驗證計算邏輯。
3.  **Phase 3 (AI Vision)**: 利用 Gemini Vision API 自動辨識盤面圖標，並與 Phase 1 建立的模板進行匹配。
4.  **Phase 4 (Video Processing)**: 整合 `useVideoProcessor` 進行螢幕內核錄製與動態辨識。

## 2. 關鍵組件與 Hook (Key Components & Hooks)

### `useVideoProcessor.js`
*   **用途**: 處理螢幕錄製、動態檢測（Motion Detection）與狀態機轉換（IDLE -> SPINNING -> STOPPED）。
*   **注意點**: 靈敏度（Threshold）需要根據解析度進行微調，避免在 IDLE 狀態卡住。

### `useGeminiVision.js`
*   **用途**: 呼叫 Gemini 1.5 Pro/Flash 進行圖像識別。
*   **輸出格式**: 必須符合 `computeGridResults.js` 預期的 JSON 結構。

### 結算引擎 (`computeGridResults.js`)
*   **核心邏輯**: 處理連線規則、WILD 替代、全盤乘倍（Multiplier）與特殊符號（如 COLLECT）。

## 3. 補丁與修復機制 (Patch Mechanisms)

由於本專案檔案較大（App.jsx 內容豐富），建議使用 Node.js 腳本進行局部修改以避免覆蓋錯誤。

| 指令/腳本 | 用途 |
| :--- | :--- |
| `patch_phase1.cjs` | 修正 Phase 1 模板建立邏輯。 |
| `patch_phase2.cjs` | 修正 Phase 2 手動更新邏輯。 |
| `patch_restore.cjs` | 還原特定檔案至穩定版本。 |
| `fix.cjs` | 通用的細微 Bug 修復工具。 |

## 4. 開發規範 (Development Standards)

*   **繁體中文**: 所有對外說明與計畫書必須使用繁體中文。
*   **自動 Commit**: 每次改動後需執行 `git commit`，訊息應包含 PLAN 名稱。
*   **螢幕協調**: Phase 1 的 Bounding Box 座標與 Phase 3 的辨識座標必須保持 1:1 對齊。

## 5. 實戰範例 (Usage Examples)

### 案例 1：修正 Phase 3 辨識框過大的問題
1.  檢查 `src/hooks/useGeminiVision.js`。
2.  執行補丁腳本：`node scripts/patch_fix.cjs`。
3.  確認 `gridBoundingBox` 的計算邏輯是否正確對齊 Phase 1 座標。

### 案例 2：新增一種連線圖標 (Symbol)
1.  在 `App.jsx` 的 `symbolsConfig` 中新增圖標定義。
2.  更新 `computeGridResults.js` 以支援新圖標的特殊結算（如有）。
3.  進入 Phase 1 重新標記新圖標的位置。

## 6. 常見問題 (Troubleshooting)

*   **圖標辨識不到**: 檢查 `symbolsConfig` 是否包含該圖標，並確認 Gemini 回傳的 Label 是否一致。
*   **動態檢測失靈**: 調整 `useVideoProcessor` 中的 `canvas` 取樣率與 `diffThreshold`。
*   **補丁失敗**: 若 `patch.cjs` 報錯，請檢查目標檔案是否有大幅度結構變動，必要時改用 `fix.cjs` 進行局部取代。
*   **方法或狀態未定義錯誤 (`is not a function` 或是拿到 `undefined`)**: 在 `useTemplateBuilder.js`、`useGeminiVision.js` 等 Custom Hook 擴充新狀態 (state) 或方法時，最容易忘記在尾端 `return { ... }` 將其匯出，開發或除錯時請列為**第一優先檢查事項**。
*   **雲端存檔時遺失新欄位或引發未定義錯誤 (`ReferenceError: is not defined`)**: 當傳遞新的參數給雲端 API (如 `useCloud.js` 的 `saveTemplateToCloud`) 時，經常會忘記在方法的**參數宣告處解構 (Destructure) 該新欄位**，或者忘記在組裝傳送的 JSON Payload (`newTemplate`) 中包含該屬性，開發時務必兩者皆檢查。
