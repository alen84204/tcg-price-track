const priceData = window.ONEPRICE_DATA ?? { capturedAt: "", products: [], activityProductIds: [] };
const priceProducts = priceData.products ?? [];

const CATEGORY_META = {
  OP: { label: "BOOSTERS 補充包", color: "#cbd8e5" },
  PRB: { label: "BOOSTERS 高級補充包", color: "#e1d2e7" },
  EB: { label: "BOOSTERS 特殊補充包", color: "#e6c9c8" },
  ST: { label: "DECKS 預組牌組", color: "#d4dfc8" }
};
const CATEGORY_ORDER = ["OP", "PRB", "EB", "ST"];
const DAY_IN_MS = 24 * 60 * 60 * 1000;

let catalogProducts = [];
let activeCategory = "全部";
let activeSeries = new Set(CATEGORY_ORDER);
let selectedCode = null;
let activeView = "list";

const money = value => value == null ? "尚無價格資料" : `¥ ${value.toLocaleString("zh-TW")}`;
const averageMoney = value => value == null ? "成交樣本不足" : `¥ ${value.toLocaleString("zh-TW")}`;
const escapeHTML = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const formatDate = value => value ? value.replaceAll("-", "/") : "尚未公布";

function saleTimestamp(value, capturedAt) {
  const text = String(value ?? "").trim();
  const captured = Date.parse(capturedAt);
  const relative = text.match(/^(\d+)(分|時間|日)前$/);
  if (relative && Number.isFinite(captured)) {
    const unit = relative[2] === "分" ? 60 * 1000 : relative[2] === "時間" ? 60 * 60 * 1000 : DAY_IN_MS;
    return captured - Number(relative[1]) * unit;
  }
  const absolute = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (absolute) return Date.UTC(Number(absolute[1]), Number(absolute[2]) - 1, Number(absolute[3]), 12);
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function calendarDate(timestamp) {
  if (!Number.isFinite(timestamp)) return "日期不明";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}

function latestSaleMeta(product) {
  const sale = product.recentSales[0];
  if (!sale) return "目前沒有成交資料";
  const timestamp = saleTimestamp(sale.occurredAt ?? sale.date, product.capturedAt);
  const quantity = sale.quantity > 1 ? `・${sale.quantity} 件合計 ${money(sale.totalPrice)}` : "";
  return `${calendarDate(timestamp)}${quantity}`;
}

function averagePeriodMeta(product) {
  if (!product.recentSales.length) return "目前沒有足夠成交資料";
  const timestamps = product.recentSales
    .map(sale => saleTimestamp(sale.occurredAt ?? sale.date, product.capturedAt))
    .filter(Number.isFinite);
  let range = "期間不明";
  if (timestamps.length) {
    const spanDays = Math.max(1, Math.ceil((Math.max(...timestamps) - Math.min(...timestamps)) / DAY_IN_MS));
    range = spanDays < 60 ? `涵蓋約 ${spanDays} 天` : `涵蓋約 ${Math.ceil(spanDays / 30)} 個月`;
  }
  return `近 ${product.recentTransactionCount} 筆／${product.recentTotalQuantity} 件・${range}`;
}

function productVisual(product, detail = false) {
  if (product.image) {
    return `<img class="product-photo" src="${escapeHTML(product.image)}" alt="${escapeHTML(product.code)} ${escapeHTML(product.name)} 商品圖" ${detail ? "" : 'loading="lazy"'} />`;
  }
  return `<div class="product-placeholder product-placeholder-${product.category.toLowerCase()}"><small>${escapeHTML(product.familyLabel)}</small><strong>${escapeHTML(product.code)}</strong></div>`;
}

function normalizeCatalog(officialProducts, marketProducts) {
  const pricesByCode = new Map(priceProducts.map(product => [product.code, product]));
  const marketByCode = new Map(marketProducts.map(product => [product.code, product]));
  return officialProducts.map(official => {
    const snapshot = pricesByCode.get(official.code);
    const market = marketByCode.get(official.code);
    const meta = CATEGORY_META[official.category];
    const officialGroup = official.category === "ST" ? "DECKS" : "BOOSTERS";
    return {
      ...official,
      id: official.code,
      officialUrl: official.url,
      officialGroup,
      officialGroupLabel: officialGroup === "DECKS" ? "DECKS 預組牌組" : "BOOSTERS 補充包",
      officialGroupShort: officialGroup === "DECKS" ? "預組牌組" : "補充包",
      familyLabel: meta.label,
      image: market?.image ?? snapshot?.image ?? null,
      imageSource: market?.imageSource ?? null,
      color: snapshot?.color ?? meta.color,
      price: market?.currentMinPrice ?? market?.price ?? snapshot?.price ?? null,
      recentAveragePrice: market?.recentAveragePrice ?? null,
      recentTransactionCount: market?.recentTransactionCount ?? 0,
      recentTotalQuantity: market?.recentTotalQuantity ?? 0,
      recentSales: market?.recentSales ?? [],
      capturedAt: market?.capturedAt ?? null,
      rank: snapshot?.rank ?? Number.MAX_SAFE_INTEGER,
      marketUrl: market?.url ?? snapshot?.url ?? null,
      marketStatus: market?.status ?? null,
      jpName: snapshot?.jpName ?? "",
      sku: snapshot?.sku ?? ""
    };
  });
}

function availabilityLabel(product) {
  if (product.status === "upcoming") return "即將發售";
  if (product.price != null) return "JPY";
  if (product.marketUrl) return "已有商品頁";
  return "尚無商品頁";
}

function compareSeries(a, b) {
  const categoryDifference = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  if (categoryDifference) return categoryDifference;
  return Number(a.code.match(/\d+/)?.[0] ?? 0) - Number(b.code.match(/\d+/)?.[0] ?? 0);
}

function comparePrice(a, b, direction) {
  if (a.price == null && b.price == null) return compareSeries(a, b);
  if (a.price == null) return 1;
  if (b.price == null) return -1;
  return direction * (a.price - b.price);
}

function filteredProducts() {
  const query = document.querySelector("#searchInput")?.value.trim().toLowerCase() ?? "";
  const sort = document.querySelector("#sortSelect")?.value ?? "newest";
  const list = catalogProducts.filter(product => {
    const matchesCategory = activeCategory === "全部" || product.officialGroup === activeCategory;
    const matchesSeries = activeSeries.has(product.category);
    const searchable = `${product.code} ${product.name} ${product.jpName} ${product.type} ${product.familyLabel} ${product.officialGroupLabel} ${product.feature}`.toLowerCase();
    return matchesCategory && matchesSeries && searchable.includes(query);
  });
  return list.sort((a, b) => {
    if (sort === "newest") return (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "") || -compareSeries(a, b);
    if (sort === "oldest") {
      if (!a.releaseDate && !b.releaseDate) return compareSeries(a, b);
      if (!a.releaseDate) return 1;
      if (!b.releaseDate) return -1;
      return a.releaseDate.localeCompare(b.releaseDate) || compareSeries(a, b);
    }
    if (sort === "low") return comparePrice(a, b, 1);
    if (sort === "high") return comparePrice(a, b, -1);
    if (sort === "series-desc") return -compareSeries(a, b);
    return compareSeries(a, b);
  });
}

function renderProducts() {
  const grid = document.querySelector("#productGrid");
  const empty = document.querySelector("#emptyState");
  const layout = document.querySelector(".product-layout");
  if (!grid || !empty || !layout) return;

  const list = filteredProducts();
  grid.classList.toggle("list-view", activeView === "list");
  layout.hidden = !list.length;
  empty.hidden = Boolean(list.length);
  const productCount = document.querySelector("#productCount");
  if (productCount) productCount.textContent = list.length;
  if (!list.length) {
    const detail = document.querySelector("#detailPanel");
    if (detail) detail.innerHTML = "";
    return;
  }
  if (!list.some(product => product.code === selectedCode)) selectedCode = list[0].code;

  grid.innerHTML = list.map(product => `
    <article class="product-card ${product.code === selectedCode ? "selected" : ""}" data-code="${escapeHTML(product.code)}" tabindex="0" role="button" aria-label="查看 ${escapeHTML(product.code)} ${escapeHTML(product.name)} 詳情">
      <div class="product-image" style="background:${escapeHTML(product.color)}">${productVisual(product)}</div>
      <div class="product-meta">
        <div class="product-topline"><span class="tag official-category">${escapeHTML(product.officialGroup)}</span></div>
        <h3><span class="product-title">${escapeHTML(product.type)} ${escapeHTML(product.name)}</span><span class="product-number">【${escapeHTML(product.code)}】</span></h3>
        <span class="sku">發售日期 ${escapeHTML(formatDate(product.releaseDate))}</span>
        <p class="product-feature"><span class="feature-label">特色｜</span>${escapeHTML(product.feature)}</p>
        <div class="price-row market-price-grid">
          <div><small>目前最低價</small><strong class="${product.price == null ? "no-price" : ""}">${money(product.price)}</strong></div>
          <div><small>最新成交價</small><strong class="${product.recentSales[0]?.unitPrice == null ? "no-price" : ""}">${money(product.recentSales[0]?.unitPrice)}</strong><em>${escapeHTML(latestSaleMeta(product))}</em></div>
          <div><small>成交平均價</small><strong class="${product.recentAveragePrice == null ? "no-price" : ""}">${averageMoney(product.recentAveragePrice)}</strong><em>${escapeHTML(averagePeriodMeta(product))}</em></div>
          <span class="availability ${product.status === "upcoming" ? "upcoming" : ""}">${availabilityLabel(product)}</span>
        </div>
      </div>
    </article>`).join("");

  grid.querySelectorAll(".product-card").forEach(card => {
    const select = () => {
      selectedCode = card.dataset.code;
      renderProducts();
    };
    card.addEventListener("click", select);
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
  renderDetail(catalogProducts.find(product => product.code === selectedCode));
}

function renderDetail(product) {
  const panel = document.querySelector("#detailPanel");
  if (!panel || !product) return;
  const marketAction = product.marketUrl
    ? `<a class="view-button" href="${escapeHTML(product.marketUrl)}" target="_blank" rel="noopener">前往 SNKRDUNK</a>`
    : "";

  panel.innerHTML = `
    <div class="detail-hero" style="background:${escapeHTML(product.color)}"><span class="code-badge">${escapeHTML(product.code)}</span>${productVisual(product, true)}</div>
    <h3>${escapeHTML(`${product.type} ${product.name}`)}</h3><span class="detail-sku">${escapeHTML(product.officialGroup)}</span>
    <div class="detail-feature"><span>官網特色</span><p>${escapeHTML(product.feature)}</p></div>
    <div class="detail-price">
      <div class="detail-price-values">
        <div><span>目前最低價</span><strong class="${product.price == null ? "no-price" : ""}">${money(product.price)}</strong></div>
        <div><span>最新成交價</span><strong class="${product.recentSales[0]?.unitPrice == null ? "no-price" : ""}">${money(product.recentSales[0]?.unitPrice)}</strong><small>${escapeHTML(latestSaleMeta(product))}</small></div>
        <div><span>成交平均價</span><strong class="${product.recentAveragePrice == null ? "no-price" : ""}">${averageMoney(product.recentAveragePrice)}</strong><small>${escapeHTML(averagePeriodMeta(product))}</small></div>
      </div>
      <b class="availability ${product.status === "upcoming" ? "upcoming" : ""}">${availabilityLabel(product)}</b>
    </div>
    <div class="range">
      <div><span>發售日期</span><strong>${escapeHTML(formatDate(product.releaseDate))}</strong></div>
      <div><span>商品類型</span><strong>${escapeHTML(product.type)}</strong></div>
      <div><span>官方分類</span><strong>${escapeHTML(product.officialGroup)}</strong></div>
    </div>
    <div class="detail-actions ${product.marketUrl ? "" : "single"}"><a class="source-link" href="${escapeHTML(product.officialUrl)}" target="_blank" rel="noopener">查看官方商品頁</a>${marketAction}</div>`;
}

function renderActivities() {
  const list = document.querySelector("#activityList");
  if (!list) return;
  list.innerHTML = (priceData.activityProductIds ?? []).map(id => {
    const product = priceProducts.find(item => item.id === id);
    if (!product) return "";
    return `<div class="activity-row"><div class="activity-product"><span class="mini-visual" style="background:${escapeHTML(product.color)}"><img src="${escapeHTML(product.image)}" alt="" loading="lazy" /></span><span><b class="activity-code">${escapeHTML(product.code)}</b>${escapeHTML(product.name)}</span></div><strong>${money(product.price)}</strong><span>${product.code.startsWith("ST-") ? "預組牌組" : "補充包"}</span><span>JPY</span><a class="change positive" href="${escapeHTML(product.url)}" target="_blank" rel="noopener">查看來源</a></div>`;
  }).join("");
}

async function initializeProductsPage() {
  const categoryTabs = document.querySelector("#categoryTabs");
  const searchInput = document.querySelector("#searchInput");
  const sortSelect = document.querySelector("#sortSelect");
  const viewSwitch = document.querySelector("#viewSwitch");
  const seriesFilters = document.querySelector("#seriesFilters");
  const searchShortcut = document.querySelector("#searchShortcut");
  if (!categoryTabs || !searchInput || !sortSelect || !viewSwitch || !seriesFilters) return;

  const platform = navigator.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent ?? "";
  const isApplePlatform = /mac|iphone|ipad|ipod/i.test(platform);
  if (searchShortcut) searchShortcut.textContent = isApplePlatform ? "⌘ K" : "Ctrl K";
  searchInput.setAttribute("aria-keyshortcuts", isApplePlatform ? "Meta+K" : "Control+K");

  categoryTabs.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    activeCategory = button.dataset.category;
    selectedCode = null;
    categoryTabs.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
    renderProducts();
  });

  seriesFilters.addEventListener("change", event => {
    const checkbox = event.target.closest('input[type="checkbox"]');
    if (!checkbox) return;
    const allCheckbox = seriesFilters.querySelector('[value="全部"]');
    const itemCheckboxes = [...seriesFilters.querySelectorAll("input[data-series]")];
    if (checkbox.value === "全部") {
      itemCheckboxes.forEach(item => { item.checked = checkbox.checked; });
    } else if (allCheckbox) {
      allCheckbox.checked = itemCheckboxes.every(item => item.checked);
    }
    activeSeries = new Set(itemCheckboxes.filter(item => item.checked).map(item => item.value));
    selectedCode = null;
    renderProducts();
  });

  searchInput.addEventListener("input", renderProducts);
  sortSelect.addEventListener("change", renderProducts);
  viewSwitch.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    activeView = button.dataset.view;
    viewSwitch.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
    renderProducts();
  });
  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
    }
  });

  try {
    let catalog = window.ONEPRICE_CATALOG;
    let market = window.ONEPRICE_MARKET;
    if (!catalog || !market) {
      const [catalogResponse, marketResponse] = await Promise.all([
        fetch("data/catalog.json"),
        fetch("data/snkrdunk-products.json")
      ]);
      if (!catalogResponse.ok || !marketResponse.ok) {
        throw new Error(`Catalog HTTP ${catalogResponse.status}; market HTTP ${marketResponse.status}`);
      }
      [catalog, market] = await Promise.all([catalogResponse.json(), marketResponse.json()]);
    }
    catalogProducts = normalizeCatalog(catalog.products ?? [], market.products ?? []);
    selectedCode = null;
    renderProducts();
  } catch (error) {
    document.querySelector(".product-layout")?.setAttribute("hidden", "");
    const empty = document.querySelector("#emptyState");
    if (empty) {
      empty.hidden = false;
      empty.innerHTML = "<span>!</span><h3>商品資料載入失敗</h3><p>請重新整理頁面後再試一次。</p>";
    }
    console.error("Catalog loading failed", error);
  }
}

try {
  document.body.classList.toggle("light", localStorage.getItem("oneprice-theme") === "light");
} catch {}

document.querySelector("#themeButton")?.addEventListener("click", () => {
  document.body.classList.toggle("light");
  try {
    localStorage.setItem("oneprice-theme", document.body.classList.contains("light") ? "light" : "dark");
  } catch {}
});

initializeProductsPage();
renderActivities();
