# 清理報告

日期：2026-05-28

## 保留在根目錄

目前以 `index.html` 可直接看到、載入或開啟的檔案為主保留：

- 主入口：`index.html`
- 主程式：`signals.js`、`signals_ui.js`
- 主入口載入的外掛/對話框：`smart_reorder_dialog.js`、`swap_preview.js`、`traverse_segment.js`、`auto_fix_plugin.js`、`sequence_input_dialog.js`、`roadmap_dialog.js`、`road_input_dialog.js`
- 主畫面或 JS 會開啟的輔助頁：`point_stats.html`、`manual_input.html`、`validator.html`、`dealer.html`、`assistant.html`
- 專案規則/說明：`AGENTS.md`、`CLAUDE.md`、`SKILL.md`、`測試指南.md`

## 已移到 archive

已將明顯未被目前 `index.html` 或主 JS 引用的舊截圖、測試輸出、素材資料夾、舊備份頁與舊工具移到：

`archive/unused-2026-05-28/`

本次移入約 951 個檔案、54 個資料夾，總大小約 562 MB。

主要類型包含：

- 根目錄大量 `.png` 截圖與檢查圖
- `.playwright-mcp/` 測試輸出
- `cutout_icons/`、`nb/`、`suit/` 舊素材
- `assistant.corrupt.20260206-122155.html`
- `layout-playground.html`、`layout-playground.js`
- `生成流程圖.html`
- `fix_fonts.py`、`baccarat_7pt_reversal.py`
- `console_log.txt`
- 舊文件：`CSS-SECTIONS.md`、`更新日誌.md`、`違規統計功能說明.md`

## 已修改

- 移除 `index.html` 中兩段 Five-server 注入碼，該段包含舊本機路徑與 `/fiveserver.js` 載入。

## 尚未處理

- `.agents/`：OneDrive 回報權限問題，未能移入 archive。
- `btn_export.png`：OneDrive 回報 reparse point tag 問題，未能移入 archive。
- `.git/`、`.vscode/`、`.gitignore`：這些屬於工具/環境設定，第一波未動。

## 驗證

- 已用 `rg` 確認根目錄保留的 HTML/JS/MD 沒有再引用移走的圖片與舊素材。
- 已用 `node --check` 檢查所有主入口載入的 JS，語法檢查通過。

## 第二波清理

- 移除 `index.html` 末尾的 Live Server WebSocket reload 注入碼。
- 移除 `signals_ui.js` 中一段已無作用的舊版全頁 click 監聽器。
- `traverse.js` 只提供舊版 console/舊工具列「穿越掃描」入口，未被目前畫面或主流程引用；已從 `index.html` 移除載入並移到 archive。
- 保留 `traverse_segment.js`，因為目前生成設定中的穿越段功能仍由它提供。
- 修正 `auto_fix_plugin.js` 的「一鍵修正」按鈕插入位置：不再尋找舊 `.tool-sidebar`，改插到目前 action bar 的「換色」按鈕旁。
- 將 `auto_fix_plugin.js` 載入改為 `auto_fix_plugin.js?v=2`，避免瀏覽器快取舊版。

## 第二波驗證

- 已重新檢查主入口本機 script 與 `window.open(...)` 目標，沒有缺失。
- 已重新跑主入口載入的 JS 語法檢查，通過。
- 已用本機伺服器 `http://127.0.0.1:8899/index.html` 驗證主頁可載入。
- 驗證結果：頁面標題正常、品牌文字正常、生成按鈕存在、一鍵修正按鈕已出現在 action bar、`traverse.js` 不再載入。

## 第三波清理

- 移除 `signals.js` 中未被呼叫的舊 Google Drive 檔案選擇器 `showDriveFilePicker()`。
- 移除未被呼叫的 `computeBankerFinalTotal()`；目前牌局結果計算使用 `computeRoundHands()`。
- 移除未被呼叫的 `detectCardCountViolation()`；目前張數違規統計走 `calculateViolationStats()` 與驗證流程。
- 移除已失效的 `card_color_mixed_mode` localStorage 讀寫函式，保留目前固定啟用的 `CARD_COLOR_MIXED_MODE = true`。

## 第三波驗證

- 已重新跑主入口載入的 JS 語法檢查，通過。
- 已確認 `index.html` 沒有缺失的本機 script 或 `window.open(...)` 目標。
- 已確認第三波移除的函式/設定名稱不再出現在 active files 中。

## 第四波清理

- 移除 `signals.js` 裡已被 `signals_ui.js` 接手的暫版重複函式：`ensureRoundsReady()`、`buildPreviewGrid()`、`updateRecoveryDisplay()`。
- 保留 `PREVIEW_GRID_COLS`、`PREVIEW_GRID_ROWS`、`PREVIEW_GRID_GROUP`，因為目前 Excel 預覽/導出仍會共用。
- 移除沒有呼叫點的舊規則輔助函式：`swapProducesBankerSix()`、`ensureNoBannedBankerSixRound()`、`findNonSignalCardCandidate()`、`count7PtReversals()`。
- 移除舊版大型自動修正流程 `autoFixConsecutiveBankerPlayerIssues()` 及其只服務該流程的輔助函式。
- 目前畫面上的「7點」、「莊6」與「避開莊6點贏」功能保留；它們使用的是現行生成/驗證流程，不依賴上述舊函式。

## 第四波驗證

- 已重新跑主入口載入的 JS 語法檢查，通過。
- 已確認 `index.html` 沒有缺失的本機 script 或 `window.open(...)` 目標。
- 已確認被清理的舊函式名稱不再出現在 active files 中；只剩 `signals_ui.js` 的現行 UI 函式版本。
- 已用本機伺服器 `http://127.0.0.1:8899/index.html?cleanup=4` 驗證主頁可載入，生成按鈕、一鍵修正按鈕、`7點`、`莊6` 與 `避開莊6點贏` 控制仍存在。

## 第五波清理

- 移除 `signals_ui.js` 中沒有呼叫點的舊敏感局回收函式 `recycleRemovedRounds()`。
- 移除 `signals_ui.js` 中已不再使用的舊版自動換色預覽流程：`runAutoColorSwapFromUI()`、`showAutoSwapPreview()`、`analyzeRoundsChanges()`、`confirmAutoSwap()`、`closeAutoSwapPreview()`、`formatChangeDiff()`、`formatChangeDiffFloat()`。
- 移除 `exported.ui.runAutoColorSwap` 舊出口；目前換色按鈕仍由現行監聽器直接執行 `runAutoColorSwap_Signal()`。

## 第五波驗證

- 已重新跑主入口載入的 JS 語法檢查，通過。
- 已確認 `index.html` 沒有缺失的本機 script 或 `window.open(...)` 目標。
- 已確認第五波移除的舊函式/舊預覽 DOM 名稱不再出現在 active files 中。
- 已用本機伺服器 `http://127.0.0.1:8899/index.html?cleanup=5` 驗證主頁可載入，生成、換色、一鍵修正、`7點`、`莊6` 控制仍存在，舊預覽全域函式已不存在。
