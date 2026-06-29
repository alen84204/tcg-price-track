import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBrowserData } from "./build-browser-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketPath = path.join(root, "data", "snkrdunk-products.json");
const imageDirectory = path.join(root, "assets", "products", "snkrdunk");
const market = JSON.parse(await readFile(marketPath, "utf8"));
const capturedAt = new Date().toISOString();

const headers = {
  "User-Agent": "Mozilla/5.0 (compatible; OPCG personal test)",
  Accept: "text/html,application/json,image/avif,image/webp,image/png,image/jpeg,*/*"
};

const decodeHtml = value => value
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&amp;", "&");

function productJson(html, productId) {
  const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1].trim()));
      const nodes = parsed["@graph"] ?? [parsed];
      const product = nodes.find(node => node["@type"] === "Product" && String(node.sku ?? node.productID) === String(productId));
      if (product) return product;
    } catch {}
  }
  return null;
}

function quantityOf(size) {
  const match = String(size ?? "").match(/(\d+)\s*個/);
  return match ? Number(match[1]) : 1;
}

function occurredAtOf(value) {
  const text = String(value ?? "").trim();
  const relative = text.match(/^(\d+)(分|時間|日)前$/);
  if (relative) {
    const unit = relative[2] === "分" ? 60 * 1000 : relative[2] === "時間" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    return new Date(Date.parse(capturedAt) - Number(relative[1]) * unit).toISOString();
  }
  const absolute = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (absolute) return new Date(Date.UTC(Number(absolute[1]), Number(absolute[2]) - 1, Number(absolute[3]), 12)).toISOString();
  return null;
}

function imageExtension(contentType, sourceUrl) {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return new URL(sourceUrl).pathname.split(".").pop()?.toLowerCase() || "webp";
}

async function saveImage(code, sourceUrl) {
  if (!sourceUrl) return null;
  const response = await fetch(sourceUrl, { headers });
  if (!response.ok) throw new Error(`image HTTP ${response.status}`);
  const extension = imageExtension(response.headers.get("content-type") ?? "", sourceUrl);
  const relativePath = `assets/products/snkrdunk/${code.toLowerCase()}.${extension}`;
  await writeFile(path.join(root, relativePath), Buffer.from(await response.arrayBuffer()));
  return relativePath.replaceAll("\\", "/");
}

async function updateProduct(record) {
  if (!record.url || !record.productId) return { ...record, capturedAt };

  const pageResponse = await fetch(record.url, { headers });
  if (!pageResponse.ok) throw new Error(`${record.code} page HTTP ${pageResponse.status}`);
  const product = productJson(await pageResponse.text(), record.productId);
  if (!product) throw new Error(`${record.code} Product JSON-LD not found`);

  const historyUrl = `https://snkrdunk.com/v1/apparels/${record.productId}/sales-history?size_id=0&page=1&per_page=20`;
  const historyResponse = await fetch(historyUrl, { headers: { ...headers, Accept: "application/json" } });
  if (!historyResponse.ok) throw new Error(`${record.code} history HTTP ${historyResponse.status}`);
  const historyData = await historyResponse.json();
  const recentSales = (historyData.history ?? []).map(item => ({
    date: item.date,
    occurredAt: occurredAtOf(item.date),
    quantity: quantityOf(item.size),
    totalPrice: Number(item.price),
    unitPrice: Math.round(Number(item.price) / quantityOf(item.size))
  })).filter(item => Number.isFinite(item.totalPrice) && item.totalPrice > 0);

  const totalQuantity = recentSales.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = recentSales.reduce((sum, item) => sum + item.totalPrice, 0);
  const offers = Array.isArray(product.offers?.offers) ? product.offers.offers : [];
  const singleOffer = offers.find(offer => /(?:サイズ:\s*)?1個/.test(offer.description ?? ""));
  const currentMinPrice = Number(singleOffer?.price ?? historyData.minPrice ?? product.offers?.lowPrice) || null;
  const sourceImage = Array.isArray(product.image) ? product.image[0] : product.image;
  const image = await saveImage(record.code, sourceImage);

  return {
    ...record,
    title: product.name ?? record.title,
    price: currentMinPrice,
    currentMinPrice,
    recentAveragePrice: totalQuantity ? Math.round(totalValue / totalQuantity) : null,
    recentTransactionCount: recentSales.length,
    recentTotalQuantity: totalQuantity,
    recentSales,
    image,
    imageSource: sourceImage ?? null,
    capturedAt,
    status: currentMinPrice ? "matched_with_price" : "matched_without_price",
    lastError: null
  };
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index]);
        console.log(`${items[index].code}: updated`);
      } catch (error) {
        results[index] = { ...items[index], capturedAt, lastError: error.message };
        console.error(`${items[index].code}: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return results;
}

await mkdir(imageDirectory, { recursive: true });
const requestedCodes = new Set(process.argv.slice(2).map(code => code.toUpperCase()));
const updateTargets = requestedCodes.size
  ? market.products.filter(product => requestedCodes.has(product.code))
  : market.products;
const updatedProducts = await mapConcurrent(updateTargets, 4, updateProduct);
const updatedByCode = new Map(updatedProducts.map(product => [product.code, product]));
market.products = market.products.map(product => updatedByCode.get(product.code) ?? product);

const eb05 = market.products.find(product => product.code === "EB-05");
if (eb05 && !eb05.image) {
  const officialPlaceholder = "https://asia-tc.onepiece-cardgame.com/onepiececg/bccard/tc/product/2026/06/18/pUMvBibblwXkLPqA/img_noimage_booster_jp.webp";
  try {
    eb05.image = await saveImage(eb05.code, officialPlaceholder);
    eb05.imageSource = officialPlaceholder;
  } catch (error) {
    eb05.lastError = `EB-05 ${error.message}`;
  }
}

const withPrice = market.products.filter(product => Number.isFinite(product.currentMinPrice ?? product.price));
const withPage = market.products.filter(product => product.url);
market.checkedAt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date(capturedAt));
market.capturedAt = capturedAt;
market.averageDefinition = "最近20筆成交總額除以成交商品總數，四捨五入為每件日幣均價。";
market.summary = {
  officialProducts: market.products.length,
  matchedPages: withPage.length,
  matchedWithPrice: withPrice.length,
  matchedWithoutPrice: withPage.length - withPrice.length,
  notAvailableYet: market.products.filter(product => product.status === "not_available_yet").length,
  updateErrors: market.products.filter(product => product.lastError).length
};

await writeFile(marketPath, `${JSON.stringify(market, null, 2)}\n`, "utf8");
await buildBrowserData();
console.log(JSON.stringify(market.summary));
