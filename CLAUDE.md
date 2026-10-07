# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 語言與風格

- 一律使用**繁體中文**回答
- 簡潔直接，不確定就說不確定，不猜測
- 不列舉明顯不可行的方案


## 專案架構

純前端專案，無建置步驟、無 npm 依賴、無測試框架。

| 檔案 | 職責 |
|------|------|
| `index.html` | 主頁面（含所有 CSS ~800 行） |
| `signals.js` | 核心邏輯：百家樂計算、牌靴生成、違規偵測、訊號牌分析 |
| `signals_ui.js` | UI 渲染、事件處理、敏感局挑選、表格顯示 |
| `auto_fix_plugin.js` | 一鍵修正外掛（違規自動修復） |
| `smart_reorder_dialog.js` | 智能重排對話框 |
| `swap_preview.js` | 對調預覽 |

## 關鍵術語

- **敏感局**：對調前兩張牌會改變勝負結果的牌局（不含和→和）
- **S局**：含訊號牌的局 → 下一局必須開莊
- **B6局**：原始莊6 → 莊家 6 點贏且閒 ≤ 5 的牌局
- **卡色** (`card.back_color`)：牌背顏色 R/B，與花色無關。前4張必須 RRRB 或 BBBR
- **訊號牌**：依設定的花色+點數組合判定（如 ♠♥♦♣ + A、2）

## 開發注意事項

- 每次修改牌局資料後必須呼叫 `refreshAnalysisAndRender({ mutate: false })`
- 完整違規檢查用 `checkViolationsBeforeExport()` 或 `calculateViolationStats(currentRounds)`
- 全域狀態：`currentRounds`（牌局陣列）、`swapBankerSixIndexes`（對調莊6索引）、`bankerSixIndexes`（莊6索引）
- `localStorage` 用 `at-settings` 儲存設定、`at-theme` 儲存主題
- 10 點牌 rank 存為 `"10"`，不是 `"T"`
- 殘牌局（result=null）遇到無法修復時直接重新生成

## 違規修復規範

詳見 @SKILL.md — 必須依序處理：無法對調 → 連續4張 → 連續莊閒 → 訊號牌 → 卡色
