import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function buildBrowserData() {
  const dataDirectory = path.join(root, "data");
  const [catalogText, marketText] = await Promise.all([
    readFile(path.join(dataDirectory, "catalog.json"), "utf8"),
    readFile(path.join(dataDirectory, "snkrdunk-products.json"), "utf8")
  ]);
  const catalog = JSON.parse(catalogText);
  const market = JSON.parse(marketText);
  const browserData = [
    `window.ONEPRICE_CATALOG = ${JSON.stringify(catalog)};`,
    `window.ONEPRICE_MARKET = ${JSON.stringify(market)};`,
    ""
  ].join("\n");
  const outputPath = path.join(dataDirectory, "catalog-data.js");
  await writeFile(outputPath, browserData, "utf8");
  return outputPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await buildBrowserData());
}
