# 達標後聯合搜尋比較（2026-10-25）

結論：不保留功能修改。紅0改善 0 局，A2改善 0.001967 局，均未達 0.05 局門檻。

## 方法

- 基準：ce2f956。正式程式未修改，實驗版由 bench-recovery-extra.cjs 在本機 HTTP 回應注入。
- 兩模式使用相同12個固定種子，每次建立乾淨頁面；前後版依種子奇偶交錯執行。
- 平均回復上限4.5，三條與末張9關閉；莊閒差距、和局、4／5／6張局、莊6及逆轉上限留白，其餘沿用新頁面預設。
- 達標後額外搜尋預算400ms，每批最多90ms／128次檢查，一批未改善即停。採合作式截止，正在執行的驗收可能超時。
- A2保留原本未達標重跑流程，只在成品達標時接入額外搜尋，不重做單局優化。
- 只採用原分析器確認平均回復嚴格下降、且原規則及卡色驗收通過的候選。
- 平均回復使用各切點局數總和／416，未先四捨五入；生成時間不含載入，包含當副重跑。重跑次數為排牌候選呼叫數減1。
- 完整生成均驗證416張、最終規則及卡色。A2種子41前後均因第15、16局連續和局驗收失敗，另列失敗、不納入成功配對平均。

## 結果

| 模式 | 成功配對 | 平均回復：前 → 後 | 每副生成ms：前 → 後 | 重跑總次數：前 → 後 |
|---|---:|---:|---:|---:|
| 紅0 | 12 | 3.254006 → 3.254006 | 592.6 → 675.6 | 18 → 18 |
| A2 | 11 | 2.904939 → 2.902972 | 421.0 → 499.0 | 15 → 15 |

生成時間為本機本次實測，不代表固定效能。所有完整配對結果都未惡化；A2僅種子5、139、332有下降。

## 重現

以 NODE_PATH 指向已安裝 Playwright 的 node_modules：

```powershell
node scripts/bench-recovery-extra.cjs "$env:TEMP/atll-recovery-extra.json"
```

JSON只存暫存目錄，不提交。比較腳本保留實驗分支供重現，正式頁面不載入它；因此不變更 integrated.html 版本號或 AGENTS.md 已定案。

## 逐種子紀錄

| 模式 | 種子 | 回復前 | 回復後 | ms前 | ms後 | 重跑前／後 |
|---|---:|---:|---:|---:|---:|---:|
| 紅0 | 5 | 2.951923 | 2.951923 | 549.2 | 454.5 | 0／0 |
| 紅0 | 139 | 3.507212 | 3.507212 | 585.1 | 687.0 | 1／1 |
| 紅0 | 332 | 3.319712 | 3.319712 | 612.4 | 586.6 | 2／2 |
| 紅0 | 17 | 3.076923 | 3.076923 | 456.9 | 532.9 | 0／0 |
| 紅0 | 29 | 2.918269 | 2.918269 | 702.6 | 788.0 | 3／3 |
| 紅0 | 41 | 3.259615 | 3.259615 | 334.6 | 1092.2 | 0／0 |
| 紅0 | 53 | 3.956731 | 3.956731 | 595.3 | 478.4 | 0／0 |
| 紅0 | 67 | 3.307692 | 3.307692 | 400.2 | 450.4 | 0／0 |
| 紅0 | 79 | 3.086538 | 3.086538 | 822.2 | 803.0 | 3／3 |
| 紅0 | 97 | 3.064904 | 3.064904 | 779.3 | 830.3 | 4／4 |
| 紅0 | 101 | 3.074519 | 3.074519 | 649.6 | 755.7 | 3／3 |
| 紅0 | 113 | 3.524038 | 3.524038 | 623.9 | 648.2 | 2／2 |
| A2 | 5 | 3.139423 | 3.129808 | 594.3 | 652.1 | 4／4 |
| A2 | 139 | 2.507212 | 2.500000 | 587.7 | 236.7 | 0／0 |
| A2 | 332 | 2.920673 | 2.915865 | 877.8 | 999.3 | 5／5 |
| A2 | 17 | 2.742788 | 2.742788 | 193.9 | 234.6 | 0／0 |
| A2 | 29 | 2.927885 | 2.927885 | 279.0 | 268.6 | 0／0 |
| A2 | 41 | 驗收失敗 | 驗收失敗 | 140.4 | 145.7 | 0／0 |
| A2 | 53 | 3.257212 | 3.257212 | 177.7 | 317.6 | 0／0 |
| A2 | 67 | 2.911058 | 2.911058 | 775.8 | 866.5 | 4／4 |
| A2 | 79 | 2.783654 | 2.783654 | 533.8 | 592.7 | 2／2 |
| A2 | 97 | 3.247596 | 3.247596 | 250.4 | 302.4 | 0／0 |
| A2 | 101 | 2.711538 | 2.711538 | 175.9 | 500.2 | 0／0 |
| A2 | 113 | 2.805288 | 2.805288 | 184.2 | 518.7 | 0／0 |

## 回歸驗證

首次28 PASS／1 FAIL，test-collector-recovery-browser等待逾時；單獨重跑PASS。最終29個均有通過結果。test-banker-six-limit在比較前、後兩次均PASS。未修改任何測試預期。

- test-a2-flex-browser.cjs：PASS
- test-a2-flex-regression.cjs：PASS
- test-a2-flex.cjs：PASS
- test-a2-prune.cjs：PASS
- test-a2-reversal-spacing.cjs：PASS
- test-a2-side-balance.cjs：PASS
- test-a2-tail-browser.cjs：PASS
- test-a2-tail-regression.cjs：PASS
- test-a2-tail.cjs：PASS
- test-banker-six-limit.cjs：PASS
- test-collector-recovery-browser.cjs：首次FAIL（等待逾時），單獨重跑PASS
- test-integrated.cjs：PASS
- test-targeted-recovery.cjs：PASS
- test-recovery-incremental.cjs：PASS
- test-red0-recovery.cjs：PASS
- test-recovery-plateau.cjs：PASS
- test-red0-balance-controls.cjs：PASS
- test-red0-balance-unit.cjs：PASS
- test-red0-balance.cjs：PASS
- test-red0-finite-full.cjs：PASS
- test-red0-finite-tail.cjs：PASS
- test-red0-unlimited.cjs：PASS
- test-swap-banker-six-row.cjs：PASS
- test-targeted-recovery-controls.cjs：PASS
- test-template-continuation-a2.cjs：PASS
- test-traverse-recovery-browser.cjs：PASS
- test-traverse-recovery.cjs：PASS
- test-traverse-red0-target-browser.cjs：PASS
- test-traverse-red0-target.cjs：PASS
