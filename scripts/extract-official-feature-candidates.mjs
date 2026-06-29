import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(path.join(root, "data", "catalog.json"), "utf8"));
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "data", "official-feature-candidates.json");

const headers = {
  "User-Agent": "Mozilla/5.0 (compatible; ONEPRICE personal test)",
  Accept: "text/html,application/xhtml+xml"
};

function decodeHtml(value) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function textLines(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
  const normalized = main
    .replace(/<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(?:br|\/p|\/div|\/section|\/article|\/li|\/h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtml(normalized)
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(line => line.length >= 6 && line.length <= 240);
}

function candidateScore(line, product) {
  let score = 0;
  if (line.includes(product.code)) score += 8;
  if (line.includes(product.name)) score += 6;
  if (/(主題|登場|領航|牌組|收錄|強化|戰術|速攻|防禦|進攻|效果|插圖|異圖|復刻|色)/.test(line)) score += 4;
  if (/[！!。]/.test(line)) score += 2;
  if (line.length >= 18 && line.length <= 100) score += 2;
  if (/(選單|商品一覽|最新情報|活動|規則|常見問題|隱私權|推薦牌組|什麼是|下一步|圖片僅供參考)/.test(line)) score -= 8;
  if (/(發售日期|價格|稀有度|内容|內容)/.test(line)) score -= 2;
  return score;
}

const productsByUrl = new Map();
for (const product of catalog.products) {
  const group = productsByUrl.get(product.url) ?? [];
  group.push(product);
  productsByUrl.set(product.url, group);
}

const pageCache = new Map();
for (const [url] of productsByUrl) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  const html = await response.text();
  pageCache.set(url, { title: decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? ""), lines: textLines(html) });
  console.error(`${response.status} ${url}`);
}

const products = catalog.products.map(product => {
  const page = pageCache.get(product.url);
  const ranked = page.lines
    .map((line, index) => ({ line, index, score: candidateScore(line, product) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const candidates = [];
  for (const item of ranked) {
    if (!candidates.includes(item.line)) candidates.push(item.line);
    if (candidates.length === 12) break;
  }
  return { code: product.code, name: product.name, type: product.type, url: product.url, pageTitle: page.title, candidates };
});

await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), products }, null, 2)}\n`, "utf8");
console.log(outputPath);
