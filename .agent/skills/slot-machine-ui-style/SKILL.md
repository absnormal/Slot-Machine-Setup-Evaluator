---
name: Slot Machine UI Style Guide
description: 老虎機辨識工具的前端視覺規範，包含 Tailwind CSS 色彩定義、組件樣式與前端 SOP。
---

# 老虎機辨識工具 UI 風格指南 (UI Style Guide)

本指引定義了本專案的核心視覺語言，確保開發人員在擴充 Phase 或組件時能維持一致的高質感體驗。

## 1. 核心配色方案 (Color Palette)

專案基於 **Tailwind CSS**，使用以下標準色碼：

| 用途 | Tailwind Class | 說明 |
| :--- | :--- | :--- |
| **主背景** | `bg-slate-50` / `bg-white` | 用於外部容器與頁面背景。 |
| **主動作色** | `indigo-600` / `indigo-500` | 用於主要按鈕、Active 狀態、進度條。 |
| **互動區背景** | `bg-slate-900` / `bg-black/40` | 用於 Canvas, Grid 預覽區，模擬實機螢幕感。 |
| **警示/錯誤** | `rose-500` / `rose-600` | 用於清除、刪除或錯誤訊息。 |
| **成功/傳送** | `emerald-500` / `emerald-600` | 用於已確認、已辨識或資料傳遞動作。 |
| **大獎/提示** | `amber-500` / `amber-400` | 用於 Jackpot 相關或強調提示。 |
| **邊框** | `border-slate-200` (亮) / `slate-700` (暗) | 標準細邊框規範。 |

## 2. 常用組件規範 (Component Patterns)

### Phase 容器 (Main Section Container)
```jsx
<div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
  {/* Header */}
  <div className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50 transition-colors">
    {/* ... */}
  </div>
  {/* Content (Conditional) */}
  <div className="p-6 pt-0 border-t border-slate-100 mt-4 bg-slate-50">
    {/* ... */}
  </div>
</div>
```

### 按鈕樣式 (Buttons)
*   **Primary (主動作)**: `bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg px-4 py-2 transition-all active:scale-95 shadow-md shadow-indigo-500/20`
*   **Secondary (輔助)**: `bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg border border-slate-200 px-4 py-2 shadow-sm`
*   **Danger (危險)**: `bg-white hover:bg-rose-50 text-rose-600 font-bold rounded-lg border border-rose-200 px-3 py-1.5`

### 網格單元格 (Grid Cell)
*   **Base**: `bg-slate-800 border-slate-700 rounded-lg hover:bg-slate-700 transition-all shadow-inner`
*   **Winning (中獎)**: `bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-[0_0_20px_rgba(99,102,241,0.6)] border-2 border-indigo-300 scale-105 z-10`
*   **Muted (灰階)**: `opacity-10 grayscale scale-90` (用於預覽特定線獎時)

## 3. 磨砂玻璃彈窗 (Glassmorphism Modals)

所有彈窗必須使用背景模糊效果：
*   **Overlay**: `fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[10000] animate-in fade-in`
*   **Card**: `bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl`

## 4. 滾動條樣式 (Custom Scrollbar)

全域定義於 `index.css`:
*   使用 `.custom-scrollbar` 類別，寬度 4px，圓角 10px。
*   Thumb 色彩: `#cbd5e1` (Hover: `#94a3b8`)。

## 5. UI 開發原則 (UI Development Principles)

1.  **動態反饋**: 所有點擊動作應包含 `active:scale-95` 或 `transition-colors`。
2.  **層次感**: 使用 `shadow-sm` 區分容器，`shadow-inner` 區分輸入/網格區。
3.  **狀態一致性**: Phases 間的按鈕顏色定義必須統一（如清空一律使用 Rose 色）。
