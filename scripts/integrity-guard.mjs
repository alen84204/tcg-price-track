import { copyFile, mkdir, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupDirectory = path.join(root, ".codex", "last-good");

const rules = new Map([
  ["app.js", { minBytes: 5000, markers: ["function renderProducts", "function renderDetail", "function initializeProductsPage", "initializeProductsPage();"] }],
  ["styles.css", { minBytes: 5000, markers: [".product-grid", ".series-filters", ".market-price-grid"] }],
  ["products.html", { minBytes: 2000, markers: ["id=\"productGrid\"", "id=\"seriesFilters\"", "app.js"] }],
  ["index.html", { minBytes: 1500, markers: ["OPCG", "app.js"] }],
  ["activity.html", { minBytes: 1500, markers: ["id=\"activityList\"", "app.js"] }],
  ["data/catalog-data.js", { minBytes: 2000, markers: ["window.ONEPRICE_CATALOG", "window.ONEPRICE_MARKET"] }],
  ["data/price-snapshot.js", { minBytes: 500, markers: ["window.ONEPRICE_DATA"] }],
  ["data/catalog.json", { minBytes: 2000, markers: ["\"products\""] }],
  ["data/snkrdunk-products.json", { minBytes: 2000, markers: ["\"products\"", "\"recentSales\""] }]
  , ["scripts/update-snkrdunk-data.mjs", { minBytes: 3000, markers: ["buildBrowserData", "recentSales", "occurredAt"] }]
]);

const textExtensions = new Set([".js", ".mjs", ".css", ".html", ".json", ".md"]);

function workspacePath(relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`路徑超出工作區：${relativePath}`);
  }
  return resolved;
}

function decodeUtf8(buffer, relativePath) {
  if (buffer.includes(0)) throw new Error(`${relativePath} 含有空位元組`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error(`${relativePath} 不是有效 UTF-8`);
  }
}

function validateText(relativePath, buffer, rule = rules.get(relativePath)) {
  if (!rule) throw new Error(`沒有 ${relativePath} 的完整性規則`);
  if (buffer.byteLength < rule.minBytes) {
    throw new Error(`${relativePath} 大小異常：${buffer.byteLength} bytes，小於 ${rule.minBytes}`);
  }
  const text = decodeUtf8(buffer, relativePath);
  for (const marker of rule.markers) {
    if (!text.includes(marker)) throw new Error(`${relativePath} 缺少必要內容：${marker}`);
  }
  if (relativePath === "app.js") new Function(text);
  if (relativePath.endsWith(".json")) JSON.parse(text);
  return { relativePath, bytes: buffer.byteLength, nulBytes: 0 };
}

async function validateFile(relativePath) {
  return validateText(relativePath, await readFile(workspacePath(relativePath)));
}

async function validateDataCoverage() {
  const catalog = JSON.parse(await readFile(workspacePath("data/catalog.json"), "utf8"));
  const market = JSON.parse(await readFile(workspacePath("data/snkrdunk-products.json"), "utf8"));
  if (catalog.products?.length !== 59) throw new Error(`官方商品數量異常：${catalog.products?.length ?? 0}`);
  if (market.products?.length !== 59) throw new Error(`市場商品數量異常：${market.products?.length ?? 0}`);
  const catalogCodes = new Set(catalog.products.map(product => product.code));
  const marketCodes = new Set(market.products.map(product => product.code));
  const missingMarket = [...catalogCodes].filter(code => !marketCodes.has(code));
  const extraMarket = [...marketCodes].filter(code => !catalogCodes.has(code));
  if (missingMarket.length || extraMarket.length) {
    throw new Error(`商品對應異常；缺少：${missingMarket.join(", ") || "無"}；多出：${extraMarket.join(", ") || "無"}`);
  }

  const categoryCounts = Object.fromEntries(["OP", "EB", "PRB", "ST"].map(category => [
    category,
    catalog.products.filter(product => product.category === category).length
  ]));
  const expectedCategories = { OP: 16, EB: 5, PRB: 2, ST: 36 };
  if (JSON.stringify(categoryCounts) !== JSON.stringify(expectedCategories)) {
    throw new Error(`系列數量異常：${JSON.stringify(categoryCounts)}`);
  }
  const boosters = catalog.products.filter(product => product.category !== "ST").length;
  const decks = catalog.products.filter(product => product.category === "ST").length;
  if (boosters !== 23 || decks !== 36) throw new Error(`官方分類數量異常：BOOSTERS ${boosters}／DECKS ${decks}`);
  if (catalog.products.some(product => !product.feature || product.featureSource !== "official-product-page")) {
    throw new Error("官方特色欄位不完整");
  }

  const matchedPages = market.products.filter(product => product.url).length;
  const withPrice = market.products.filter(product => Number.isFinite(product.currentMinPrice ?? product.price)).length;
  const withAverage = market.products.filter(product => Number.isFinite(product.recentAveragePrice)).length;
  if (matchedPages !== 58 || withPrice !== 52 || withAverage !== 44) {
    throw new Error(`市場覆蓋異常：頁面 ${matchedPages}／價格 ${withPrice}／均價 ${withAverage}`);
  }

  for (const product of market.products) {
    if (!product.image) continue;
    const image = await readFile(workspacePath(product.image));
    if (image.byteLength < 100) throw new Error(`${product.code} 圖片檔案異常`);
  }

  const browserDataText = await readFile(workspacePath("data/catalog-data.js"), "utf8");
  const browserWindow = {};
  new Function("window", browserDataText)(browserWindow);
  if (browserWindow.ONEPRICE_CATALOG?.products?.length !== 59 || browserWindow.ONEPRICE_MARKET?.products?.length !== 59) {
    throw new Error("瀏覽器資料檔與 JSON 不一致");
  }

  return {
    catalogProducts: 59,
    marketProducts: 59,
    categoryCounts,
    officialGroups: { BOOSTERS: boosters, DECKS: decks },
    marketCoverage: { matchedPages, withPrice, withAverage }
  };
}

async function scanTextFiles(directory = root) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "last-good") continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (absolutePath.startsWith(path.join(root, "assets", "products"))) continue;
      results.push(...await scanTextFiles(absolutePath));
    } else if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
      const relativePath = path.relative(root, absolutePath).replaceAll("\\", "/");
      const buffer = await readFile(absolutePath);
      decodeUtf8(buffer, relativePath);
      if (!buffer.byteLength) throw new Error(`${relativePath} 是空檔案`);
      results.push({ relativePath, bytes: buffer.byteLength, nulBytes: 0 });
    }
  }
  return results;
}

async function checkAll() {
  const files = [];
  for (const relativePath of rules.keys()) files.push(await validateFile(relativePath));
  const coverage = await validateDataCoverage();
  const scannedFiles = await scanTextFiles();
  return { files, coverage, scannedTextFiles: scannedFiles.length };
}

async function saveLastGood(relativePaths = [...rules.keys()]) {
  await mkdir(backupDirectory, { recursive: true });
  for (const relativePath of relativePaths) {
    await validateFile(relativePath);
    const destination = path.join(backupDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(workspacePath(relativePath), destination);
  }
}

async function promote(candidatePath, targetPath) {
  const normalizedTarget = targetPath.replaceAll("\\", "/");
  const candidate = await readFile(workspacePath(candidatePath));
  validateText(normalizedTarget, candidate);
  await copyFile(workspacePath(candidatePath), workspacePath(normalizedTarget));
  await validateFile(normalizedTarget);
  await saveLastGood([normalizedTarget]);
  await unlink(workspacePath(candidatePath));
  return { promoted: normalizedTarget, bytes: candidate.byteLength };
}

async function restore(targetPath) {
  const normalizedTarget = targetPath.replaceAll("\\", "/");
  const backupPath = path.join(backupDirectory, normalizedTarget);
  const backup = await readFile(backupPath);
  validateText(normalizedTarget, backup);
  await copyFile(backupPath, workspacePath(normalizedTarget));
  return validateFile(normalizedTarget);
}

const [command = "check", first, second] = process.argv.slice(2);
let result;
if (command === "check") result = await checkAll();
else if (command === "snapshot") {
  result = await checkAll();
  await saveLastGood();
  result.snapshot = path.relative(root, backupDirectory).replaceAll("\\", "/");
} else if (command === "promote" && first && second) result = await promote(first, second);
else if (command === "restore" && first) result = await restore(first);
else throw new Error("用法：node scripts/integrity-guard.mjs check|snapshot|promote <候選檔> <正式檔>|restore <正式檔>");

console.log(JSON.stringify(result, null, 2));
