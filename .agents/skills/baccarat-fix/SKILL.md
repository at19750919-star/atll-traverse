# 百家樂牌靴違規修復規範

## 修復優先順序

**必須依照以下順序處理，不可跳步：**

1. 無法對調
2. 連續5局4張違規
3. 連續5局莊/閒違規
4. 訊號牌違規
5. 卡色違規（永遠最後做）

---

## 規則定義

### 卡色規則
每局前4張牌的卡色必須符合以下其中一種：
- RRRB（紅紅紅藍）
- BBBR（藍藍藍紅）
- 第5、6張不限卡色

### 訊號牌定義
♠♥♦♣ 全花色的 A、2 為訊號牌（共 64 張）。
訊號牌規則：某局出現訊號牌，則下一局必須開莊。

### 點數規則
T、J、Q、K 均為 0 點，互相視為同點數，可以互換。

### 交換基本限制
- 只能同點數交換
- 交換後不得產生新的違規
- 卡色違規修復：找第5/6張位置、同點數、同訊號牌屬性（都是訊號牌或都是非訊號牌）、不同卡色的牌交換

---

## 一、無法對調

### 症狀
某局（通常是最後幾局）顯示「無法對調」狀態。

### 修復方法
點選該局 → 執行智能重排 → 系統會自動找其他局交換牌，使該局變成可對調狀態。

### 注意
智能重排後，被交換的那局可能產生新違規，需要繼續後面的修復步驟處理。

---

## 二、卡色違規

### 症狀
某局前4張卡色不符合 RRRB 或 BBBR。

### 修復方法
找整條牌中，符合以下所有條件的牌進行交換：
- 位於某局的第5或第6張位置（不影響來源局卡色）
- 與違規牌同點數
- 與違規牌同訊號牌屬性（都是訊號牌，或都是非訊號牌）
- 與違規牌不同卡色

### 範例
- 74局第1張是紅色非訊號牌K → 找其他局第5/6張藍色非訊號牌K或同點數0點牌交換
- 交換後74局第1張變藍色 → BBBR 符合規則

---

## 三、連續5局4張違規

### 症狀
同一段中連續5局都有4張牌。

### 修復方法
呼叫 `autoFixConsecutiveFourCardIssues()`。

若無法自動修復，手動換局：
- 從**區塊外**找一局候選：結果相同（莊↔莊 或 閒↔閒）、張數是5或6張
- 確認交換後不增加訊號違規
- 整局交換（換局）打破連續

```javascript
[currentRounds[a], currentRounds[b]] = [currentRounds[b], currentRounds[a]];
refreshAnalysisAndRender({ mutate: false });
```

---

## 四、連續莊/閒違規（A2 模式）

### 容許規則
A2 模式下，連續莊/閒**不一定要修復**，依以下規則判斷：
- 整副牌最多允許 **2 段**連續莊/閒
- 每段不超過 **6 局**
- 符合以上條件 → 直接接受，不需修復
- 超過（7局以上，或超過2段）→ 需要修復

### 手動修復方法（換局 + 對調前兩張）

**步驟：**
1. 從連續區段**中間**選一局（目標局）
2. 在區段**外**找一局：結果相同（閒↔閒 或 莊↔莊）
3. 兩局整局交換（換局）
4. 換完後，把那兩局各自的**下一局**第一二張對調

換局後下一局需要對調，是因為換局改變了兩個位置的訊號牌狀態，必須讓各自的下一局結果符合訊號牌規則。

**換局前必須確認：**
- 候選局換入後，周邊不會形成新的連續7局以上
- 候選局換出後，空出的位置周邊也不會連成新的連續7局以上



---

## 五、訊號牌違規

### 症狀
某局有訊號牌，但下一局不是莊。

### 修復方法（依情況選擇）

**方法A：換掉訊號牌**
- 把訊號牌換成非訊號牌
- 找來源：整條牌中某個訊號牌局的第5/6張非訊號牌，卡色需相同，點數需相同

**方法B：改變下一局結果**
- 把訊號牌局的下一局前兩張對調，使其從閒變莊

**方法C：下一局無法對調時**
- 先對下一局執行智能重排，使其變成可對調狀態
- 再執行方法B

---

## 實際函式對應

### 全域資料
```javascript
currentRounds  // 當前牌靴的所有局資料（0-based 陣列）
```

### 智能重排（處理無法對調）
```javascript
// roundNumber 是 1-based 局號
tryReorderRoundToClearMismatch(roundNumber)

// 範例：對第86局執行智能重排
tryReorderRoundToClearMismatch(86)
```

### 對調某局前兩張（改變莊/閒結果）
```javascript
// round 是 currentRounds[idx] 物件
swapFirstTwoCards(round)

// 範例：對調第86局前兩張
swapFirstTwoCards(currentRounds[85])
refreshAnalysisAndRender({ mutate: false })
```

### 兩局之間交換指定牌
```javascript
// round1Idx, round2Idx 是 0-based 索引
// card1, card2 是牌物件 { suit, rank }
swapTwoCards(currentRounds, round1Idx, card1, round2Idx, card2)

// 範例：第86局某張牌 ↔ 第79局某張牌
swapTwoCards(currentRounds, 85, currentRounds[85].cards[3], 78, currentRounds[78].cards[4])
refreshAnalysisAndRender({ mutate: false })
```

### 卡色交換
```javascript
// a, b 是 { r: 局索引(0-based), c: 牌位置(0-based) }
swapCards_Internal(currentRounds, a, b)

// 範例：第86局第4張 ↔ 第79局第5張
swapCards_Internal(currentRounds, { r: 85, c: 3 }, { r: 78, c: 4 })
refreshAnalysisAndRender({ mutate: false })
```

### 自動修復連續4張
```javascript
autoFixConsecutiveFourCardIssues(currentRounds)
refreshAnalysisAndRender({ mutate: false })
```

### 自動修復連續5局莊/閒
```javascript
autoFixConsecutiveBankerPlayerIssues(currentRounds)
refreshAnalysisAndRender({ mutate: false })
```

### 重要：每次修改後必須呼叫
```javascript
refreshAnalysisAndRender({ mutate: false })
```

---

## 修復流程總結

```
生成牌靴
  ↓
掃描所有違規
  ↓
[1] 有無法對調？→ 智能重排修復
  ↓
[2] 有卡色違規？→ 找第5/6張同點同屬性異色牌交換
  ↓
[3] 有連續5局4張？→ autoFixConsecutiveFourCardIssues()
  ↓
[4] 有連續5局莊/閒？→ 補/移訊號牌 + 對調前兩張
  ↓
[5] 有訊號牌違規？→ 換牌或對調下一局
  ↓
重新驗證，確認全部清除
```

---

## 批次處理建議

### 大量卡色違規時
如果生成後出現很多卡色違規，先點「換色」按鈕，系統會自動修復一批卡色問題，再手動處理剩餘的。

### 完成後導出
所有違規修復完成後，按「導出」按鈕。
若還有未修復的違規，按導出會出現警示視窗，代表需要繼續修復。
確認導出成功才算完成。

---

## 注意事項

- 每次修復後必須重新驗證整條牌，因為修復一個違規可能引發新的違規
- 智能重排會改變多局的牌，執行後要重新掃描全部違規
- 第85局之後的牌局不可修改（受固定訊號/結構保護）
- 卡色交換優先使用第5/6張位置作為來源，避免影響來源局的卡色結構
