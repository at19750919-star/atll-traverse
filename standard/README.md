# 百家 3.0 共用功能來源

來源快照日期：2026-10-18；來源 Git HEAD：f6b4137（複製當時工作目錄的所需檔案）。

本目錄由相鄰「百家3.0」專案複製，供 integrated.html 使用；原專案未修改。
主頁與核心邏輯保留原功能；signals_ui.js 的附屬頁連結改為 standard/ 路徑，assistant.html 共用根目錄 logo，並清除來源檔案行尾空白。
整合行為、穿越模式與模式切換集中於根目錄 integrated.js，不在這裡混入穿越算法。
整合頁新增 round_size_limits.js 供百家紅0／A2讀取、檢查4／5／6張局數上下限；signals_ui.js挑局時套用上限並優先補下限，signals.js在殘牌分配與最後修正後檢查。未通過的候選結果暫存而不更新主表／彈窗，中止或失敗時回復上次完成的牌靴，暫存期間不編輯或導出。不設限制時維持原流程，原四張比例上限仍保留；沒有載入此模組的既有獨立頁維持不限。驗證：node scripts/test-standard-size-limits.cjs（10項）、node scripts/test-integrated.cjs（14項）。
更新這份副本時，先比較來源差異，再執行 scripts/test-integrated.cjs 與兩種模式瀏覽器驗證，勿直接覆蓋整合修正。
