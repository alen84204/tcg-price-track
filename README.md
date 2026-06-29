# TCG Price Track

航海王 ONE PIECE Card Game 商品與 SNKRDUNK 價格整理專案。

## 目前內容

- `index.html`：盒裝總覽
- `products.html`：商品價格搜尋與比較
- `activity.html`：熱門商品價格快照
- `data/catalog.json`：OP 16、PRB 2、EB 5、ST 36，共 59 項官方商品資料
- `data/other-catalog.json`：OTHER 官方商品清單，不追蹤價格
- `data/price-snapshot.js`：目前 10 項 SNKRDUNK 日幣價格快照
- `data/snkrdunk-products.json`：59 項商品的 SNKRDUNK 對應網址、查找狀態與日幣價格紀錄
- `scripts/update-snkrdunk-data.mjs`：更新目前最低價、近 20 筆成交加權平均與商品圖片
- `assets/products/snkrdunk/`：本機測試使用的 59 項商品圖片；來源網址記錄於市場資料檔
- 支援官網順序與商品名稱分類順序

## 資料原則

- 商品資料優先採用 ONE PIECE Card Game 台灣官方網站。
- 非官網資訊一律標示「保留存疑」，即使由專案擁有者提供亦相同。
- 通路預估日期不視為官方發售日；官網更新後才移除存疑標記。
- 公開資料不包含私人訂單、配貨數量或通路往來資訊。
- 商品圖片版權屬原權利人；公開部署前應確認圖片使用授權。

## 本機查看

啟動本機預覽後，從首頁網址查看多頁介面。上方功能列會分別前往三個獨立 HTML 頁面。

## 修改與發佈流程

1. 修改先寫入候選檔，不直接覆蓋主要程式。
2. 執行 `node scripts/integrity-guard.mjs check`，檢查 UTF-8、空位元組、必要程式內容、59 項資料覆蓋與圖片檔。
3. 檢查通過後建立 Git 提交並推送 `main`。
4. 等待 GitHub Pages 完成建置，再確認公開網址可正常開啟。

`node scripts/integrity-guard.mjs snapshot` 會把通過驗證的主要檔案保存為本機最後正常版本；必要時可用 `restore <檔名>` 復原。

## 專案狀態

目前為前端原型與商品資料整理階段，價格可透過更新程式重新擷取；公開更新以驗證、Git 提交與 Pages 上線為一個完整流程。
