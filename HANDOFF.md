# TCG Price Track 交接手冊

本文件是專案的單一交接入口，避免架構、資料規則與發布方式散落在多個文件。公開網站：<https://alen84204.github.io/tcg-price-track/>。

## 1. 專案架構

這是一個部署於 GitHub Pages 的多頁靜態網站，沒有後端資料庫。

```text
data/catalog.json ─────────────┐
                              ├─ scripts/build-browser-data.mjs ─ data/catalog-data.js ─ app.js ─ HTML 畫面
data/snkrdunk-products.json ───┘

data/price-snapshot.js ────────────────────────────────────────────────────────┘
```

- `index.html`：盒裝總覽。
- `products.html`：完整商品、搜尋、排序、系列與上市狀態篩選。
- `activity.html`：目前的熱門價格快照頁。
- `styles.css`：三個頁面共用的桌面與手機版樣式。
- `app.js`：讀取資料、合併官方商品與市場價格，並負責搜尋、排序、篩選、畫面產生及主題切換。它不是資料庫。

## 2. 三個容易混淆的檔案

### `data/catalog-data.js`

由 `scripts/build-browser-data.mjs` 自動產生，將 `catalog.json` 與 `snkrdunk-products.json` 包成瀏覽器可直接讀取的 `window.ONEPRICE_CATALOG` 和 `window.ONEPRICE_MARKET`。保留此檔是為了讓 `file:///` 開啟網站時不受瀏覽器禁止讀取本機 JSON 的限制。不要手動編輯；修改來源 JSON 後重新產生。

### `data/price-snapshot.js`

供首頁與最新成交頁使用的精選價格快照，目前只包含少量熱門商品。它與完整市場資料有重複，屬於過渡資料；未來可讓首頁和最新成交頁改讀 `catalog-data.js` 後再移除。

### `app.js`

共用前端控制器。商品頁會在約第 285 行取得整合資料，接著合併商品與價格並產生畫面；首頁及最新成交頁則使用 `price-snapshot.js`。只有主題偏好儲存在瀏覽器 `localStorage`，商品與價格不會存進使用者電腦的資料庫。

## 3. 資料責任

- `data/catalog.json`：官方商品主檔、補充通路消息及來源驗證狀態。檔案最上層的 `_fieldDefinitions` 是中文資料字典，不是商品，程式會忽略它。
- `data/snkrdunk-products.json`：市場商品對應網址、目前最低價、最近最多 20 筆成交及圖片來源。
- `data/catalog-data.js`：上述兩份 JSON 的瀏覽器版本，不是新的資料來源。
- `assets/products/snkrdunk/`：網站使用的市場商品圖片副本。

目前更新市場資料時會覆寫每項商品的最近成交清單，不會建立完整的長期成交資料庫。Git 歷史可供復原，但不適合查詢價格趨勢。

## 4. 「保留存疑」規則

`保留存疑` 代表該欄位來自通路消息或其他非台灣官方商品頁來源。只有官方頁確認同一欄位後，才可改為已驗證。

目前 `scripts/update-snkrdunk-data.mjs` 只處理市場價格、成交與圖片，不會檢查台灣官網，也不會修改 `catalog.json` 的驗證狀態。因此「更新價格」不等於「重新驗證商品資料」。

應在以下時機人工檢查官方商品頁：

1. 新增即將上市的 OP、PRB、EB 或 ST 商品時。
2. 更新價格前，若 `supplementalProducts` 仍有 `unverified` 項目。
3. 接近預估發售日或官方公布新商品消息時。
4. 修改名稱、發售日、週年資訊或商品特色前。

檢查後更新 `verifiedAt`、對應欄位與備註；沒有官方證據時保留 `null` 或 `unverified`，不要猜測。

## 5. 市場資料更新

目前更新工具會讀取商品頁及最近成交資料，寫回 `data/snkrdunk-products.json`，下載圖片，並重新產生 `data/catalog-data.js`。更新前必須先確認資料取得方式、引用及圖片使用符合來源規則或已取得授權；技術上可存取不等於已獲得自動化收集許可。

若未來取得正式 API 或書面授權，可再使用 GitHub Actions 定時執行；Action 的執行環境是暫時的，結果必須提交回倉庫或寫入外部資料庫才能長期保存。金鑰只放 GitHub Actions Secrets，不得寫入前端或 Git。

## 6. 長期資料庫方向

需要長期價格曲線時，建議改用 Postgres（例如 Supabase），至少建立：

- `products`：官方商品主檔。
- `market_products`：來源商品 ID 與網址對應。
- `price_snapshots`：每次觀察到的最低價與時間。
- `sales`：逐筆成交時間、數量、總價與每件單價。
- `ingestion_runs`：每次更新的成功、失敗與錯誤紀錄。

公開網站只能使用唯讀權限；管理金鑰只能存在伺服器端或 GitHub Actions Secrets。成交來源若沒有穩定的交易 ID，兩筆相同日期、價格與數量的交易無法保證正確去重，必須在資料設計中保留原始資料與擷取批次。

## 7. 安全修改與發布

1. 重要 HTML、CSS、JavaScript、JSON 先建立候選檔，不直接覆寫正式檔。
2. 執行 `node scripts/integrity-guard.mjs check` 與 `node scripts/test-catalog-ui.mjs`。
3. 執行通用 UTF-8、空位元組與空檔檢查。
4. 確認 `git diff --check` 與預期的商品數量。
5. 建立 Git 提交並推送 `main`。
6. 等待 GitHub Pages 建置完成，確認部署提交與本機提交相同。
7. 在公開網站測試桌面、手機、搜尋、排序、系列和上市狀態篩選。

任何檢查失敗都不得發布。`.codex/last-good/` 保存本機最後正常版本，但正式復原點仍以 Git 提交為準。
