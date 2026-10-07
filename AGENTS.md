# ATLL-穿越排牌

## 已定案
- [2026-10-07｜Claude] 穿越排牌做成獨立頁 traverse_builder.html，不接入 ATLL／百家3.0 原本的生成流程（使用者要求另外複製一份改）
- [2026-10-07｜Claude] 穿越段條件：任一張當起點都在段尾剛好發完、從段頭發出的每局都是敏感局、任一局單獨對調後仍穿越（使用者確認）
- [2026-10-07｜Claude] 敏感局＝對調前兩張後莊閒互換且張數不變；和局對調後仍是和也算（使用者確認）
- [2026-10-07｜Claude] 三條規則照百家3.0 雙向：三條（A～9）下一局必和，其他局下一局不和（使用者選擇）
- [2026-10-07｜Claude] 訊號牌為全花色 A、2：有則下一局莊、無則閒，三條優先；排好後以對調前兩張達成並整段重驗（使用者確認）
- [2026-10-07｜Claude] 導出照百家3.0 Excel 格式，檔名 TR001 起獨立編號，上傳雲端「穿越牌」資料夾（使用者要求另一資料夾與檔名）
- [2026-10-07｜Claude] 排不進的張數超過設定就整副重跑，預設 5 張（使用者指定）

## 專案說明
- 從 ATLL（暫停中，commit 5c2fa1c）複製出的百家樂實驗版，專做「穿越排牌」：反覆洗牌撿合格短段（8～12 張）、計算補排、接成長段，再套三條與 A、2 規則。
- 主要檔案：traverse_builder.html（頁面）、traverse_builder.js（排牌演算法）、traverse_export.js（發牌、切牌、Excel 導出）；其餘檔案沿用 ATLL 原樣，未改。
- 純前端、無建置步驟：直接用瀏覽器開 traverse_builder.html；Excel 用 CDN 的 exceljs 4.4.0。
- 雲端：沿用百家3.0 的 Apps Script（Google 專案「百家樂語音」）/exec，POST 帶 folderId 存到「穿越牌」資料夾（17RvOVNDc0a_JEem1SnRPsTEvm8otkJdx）。

## 規則

### 原 AGENTS.md 內容（完整保留）

# 用繁體中文

## 回答原則
- **不知道就說不知道**，不要猜測或給出不確定的建議
- **避免列舉不可行方案**，不要為了顯示思考而羅列明顯困難或不可能的選項
- **深入思考後再回答**，確保建議具有實際可行性
- **承認限制**，如果問題超出能力範圍，直接說明而非強行給答案

## 禁止行為
- 列出一堆「可能的方案」但實際上都不可行
- 為了顯示全面思考而給出明顯錯誤的建議  
- 用冗長的分析掩蓋缺乏實質內容
- 不經深入思考就給出技術建議

## 期望行為
- 簡潔直接的回答
- 確實可行的建議
- 承認不知道的部分
- 避免浪費時間的無效分析

### 原 CLAUDE.md 內容（完整保留；為 ATLL 主頁 index.html 的說明，不適用 traverse_builder 的規則差異以「已定案」為準）

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
