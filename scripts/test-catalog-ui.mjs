import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [appSource, browserDataSource, productsHtml] = await Promise.all([
  readFile(path.join(root, "app.js"), "utf8"),
  readFile(path.join(root, "data", "catalog-data.js"), "utf8"),
  readFile(path.join(root, "products.html"), "utf8")
]);

const browserWindow = {};
new Function("window", browserDataSource)(browserWindow);

const state = { query: "", sort: "newest" };
const grid = { innerHTML: "STALE PRODUCTS", classList: { toggle() {} } };
const empty = { hidden: true };
const layout = { hidden: false };
const productCount = { textContent: "" };
const documentMock = {
  querySelector(selector) {
    return {
      "#searchInput": { value: state.query },
      "#sortSelect": { value: state.sort },
      "#productGrid": grid,
      "#emptyState": empty,
      ".product-layout": layout,
      "#productCount": productCount
    }[selector] ?? null;
  }
};

const testableSource = appSource.slice(0, appSource.indexOf("function renderActivities"));
const api = new Function("window", "document", `${testableSource}; return {
  normalizeCatalog,
  filteredProducts,
  renderProducts,
  setProducts: value => { catalogProducts = value; },
  setSeries: value => { activeSeries = value; },
  setReleaseStatus: value => { activeReleaseStatus = value; }
};`)(browserWindow, documentMock);

const products = api.normalizeCatalog(
  browserWindow.ONEPRICE_CATALOG.products,
  browserWindow.ONEPRICE_MARKET.products
);
api.setProducts(products);

const allSeries = new Set(["OP", "PRB", "EB", "ST"]);
const statusCounts = {};
for (const status of ["全部", "已上市", "未上市"]) {
  api.setSeries(allSeries);
  api.setReleaseStatus(status);
  statusCounts[status] = api.filteredProducts().length;
}

api.setReleaseStatus("全部");
api.setSeries(new Set());
api.renderProducts();
if (grid.innerHTML !== "") throw new Error("零筆結果仍保留舊商品內容");
if (!layout.hidden || empty.hidden || productCount.textContent !== 0) {
  throw new Error("零筆結果的顯示狀態不正確");
}

api.setSeries(allSeries);
api.setReleaseStatus("未上市");
api.renderProducts();
const renderedCards = (grid.innerHTML.match(/<article class="product-card"/g) ?? []).length;
if (renderedCards !== 7 || layout.hidden || !empty.hidden || productCount.textContent !== 7) {
  throw new Error("未上市商品渲染數量不正確");
}
if (!grid.innerHTML.includes("官方商品頁") || !grid.innerHTML.includes("SNKRDUNK")) {
  throw new Error("列表沒有整合商品來源連結");
}
if (productsHtml.includes("detailPanel") || appSource.includes("function renderDetail")) {
  throw new Error("獨立詳情欄仍存在");
}

const expected = { 全部: 59, 已上市: 52, 未上市: 7 };
if (JSON.stringify(statusCounts) !== JSON.stringify(expected)) {
  throw new Error(`上市狀態數量不正確：${JSON.stringify(statusCounts)}`);
}

console.log(JSON.stringify({ statusCounts, emptyResultCleared: true, renderedUpcoming: renderedCards }));
