const products = [
  { id: 1, name: "決戰之刻", jpName: "決戦の刻", sku: "SNKRDUNK #816932", category: "補充包", price: 13900, rank: 1, url: "https://snkrdunk.com/apparels/816932", icon: "☠", color: "#d8d1c7" },
  { id: 2, name: "被繼承的意志", jpName: "受け継がれる意志", sku: "SNKRDUNK #548909", category: "補充包", price: 23999, rank: 2, url: "https://snkrdunk.com/apparels/548909", icon: "☠", color: "#cbd8e5" },
  { id: 3, name: "ONE PIECE CARD THE BEST vol.2", jpName: "プレミアムブースター", sku: "SNKRDUNK #548907", category: "補充包", price: 9100, rank: 3, url: "https://snkrdunk.com/apparels/548907", icon: "☠", color: "#e1d2e7" },
  { id: 4, name: "神之島的冒險", jpName: "神の島の冒険", sku: "SNKRDUNK #755998", category: "補充包", price: 14369, rank: 4, url: "https://snkrdunk.com/apparels/755998", icon: "☠", color: "#d4dfc8" },
  { id: 5, name: "新四皇", jpName: "新たなる皇帝", sku: "SNKRDUNK #299926", category: "補充包", price: 20997, rank: 5, url: "https://snkrdunk.com/apparels/299926", icon: "☠", color: "#e6c9c8" },
  { id: 6, name: "魯夫＆艾斯 EX 起始牌組", jpName: "ルフィ&エース", sku: "SNKRDUNK #780928", category: "起始牌組", price: 14997, rank: 6, url: "https://snkrdunk.com/apparels/780928", icon: "⚓", color: "#e8d2aa" },
  { id: 7, name: "ONE PIECE FILM edition", jpName: "スタートデッキ", sku: "SNKRDUNK #234182", category: "起始牌組", price: 1000, rank: 7, url: "https://snkrdunk.com/apparels/234182", icon: "⚓", color: "#d4cbe0" },
  { id: 8, name: "紫色 蒙其・D・魯夫", jpName: "紫 モンキー・D・ルフィ", sku: "SNKRDUNK #294196", category: "起始牌組", price: 17500, rank: 8, url: "https://snkrdunk.com/apparels/294196", icon: "⚓", color: "#c9c4dd" },
  { id: 9, name: "綠色 烏塔", jpName: "緑 ウタ", sku: "SNKRDUNK #294194", category: "起始牌組", price: 5000, rank: 9, url: "https://snkrdunk.com/apparels/294194", icon: "⚓", color: "#c9dfd0" },
  { id: 10, name: "3D2Y 起始牌組", jpName: "スタートデッキ 3D2Y", sku: "SNKRDUNK #251268", category: "起始牌組", price: 2000, rank: 10, url: "https://snkrdunk.com/apparels/251268", icon: "⚓", color: "#d7d9dd" }
];

const activities = [1, 2, 6, 7];

let activeCategory = "全部";
let selectedId = 1;

const money = value => `¥ ${value.toLocaleString("zh-TW")}`;
const twd = value => `NT$ ${(Math.round(value * 0.22 / 10) * 10).toLocaleString("zh-TW")}`;

function renderProducts() {
  const query = document.querySelector("#searchInput").value.trim().toLowerCase();
  const sort = document.querySelector("#sortSelect").value;
  let list = products.filter(p => (activeCategory === "全部" || p.category === activeCategory) && `${p.name} ${p.sku}`.toLowerCase().includes(query));
  list.sort((a, b) => sort === "low" ? a.price - b.price : sort === "high" ? b.price - a.price : a.rank - b.rank);

  const grid = document.querySelector("#productGrid");
  const empty = document.querySelector("#emptyState");
  document.querySelector(".product-layout").hidden = !list.length;
  empty.hidden = !!list.length;
  document.querySelector("#productCount").textContent = list.length;
  if (!list.length) return;
  if (!list.some(p => p.id === selectedId)) selectedId = list[0].id;

  grid.innerHTML = list.map(p => `
    <article class="product-card ${p.id === selectedId ? "selected" : ""}" data-id="${p.id}" tabindex="0" role="button" aria-label="查看 ${p.name} 詳情">
      <div class="product-image" style="background:${p.color}"><span class="product-visual">${p.icon}</span></div>
      <div class="product-meta">
        <div class="product-topline"><span class="tag">${p.category}</span><span class="watch">＋</span></div>
        <h3>${p.name}</h3><span class="sku">${p.jpName} · ${p.sku}</span>
        <div class="price-row"><div><small>SNKRDUNK 顯示價</small><strong>${money(p.price)}</strong></div><span class="change positive">查看 ↗</span></div>
      </div>
    </article>`).join("");

  grid.querySelectorAll(".product-card").forEach(card => {
    const select = () => { selectedId = Number(card.dataset.id); renderProducts(); };
    card.addEventListener("click", select);
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } });
  });
  renderDetail(products.find(p => p.id === selectedId));
}

function renderDetail(p) {
  document.querySelector("#detailPanel").innerHTML = `
    <div class="detail-hero" style="background:${p.color}"><span class="tag">${p.category}</span><span class="product-visual">${p.icon}</span></div>
    <h3>${p.name}</h3><span class="detail-sku">${p.jpName} · ${p.sku}</span>
    <div class="detail-price"><div><span>SNKRDUNK 顯示價</span><strong>${money(p.price)}</strong></div><b class="change positive">價格快照</b></div>
    <div class="range"><div><span>約合台幣</span><strong>${twd(p.price)}</strong></div><div><span>商品類型</span><strong>${p.category === "補充包" ? "未拆封 BOX" : "未拆封套牌"}</strong></div><div><span>擷取日期</span><strong>2026/06/27</strong></div></div>
    <button class="view-button" type="button">前往 SNKRDUNK 查看</button>`;
  document.querySelector(".view-button").addEventListener("click", () => window.open(p.url, "_blank", "noopener"));
}

function renderActivities() {
  document.querySelector("#activityList").innerHTML = activities.map(id => {
    const p = products.find(product => product.id === id);
    return `<div class="activity-row"><div class="activity-product"><span class="mini-visual" style="background:${p.color}">${p.icon}</span><span>${p.name}</span></div><strong>${money(p.price)}</strong><span>${p.category === "補充包" ? "補充包 BOX" : "起始牌組"}</span><span>JPY</span><a class="change positive" href="${p.url}" target="_blank" rel="noopener">查看 ↗</a></div>`;
  }).join("");
}

document.querySelector("#categoryTabs").addEventListener("click", e => {
  if (!e.target.matches("button")) return;
  activeCategory = e.target.dataset.category;
  document.querySelectorAll("#categoryTabs button").forEach(btn => btn.classList.toggle("active", btn === e.target));
  renderProducts();
});
document.querySelector("#searchInput").addEventListener("input", renderProducts);
document.querySelector("#sortSelect").addEventListener("change", renderProducts);
document.querySelector("#themeButton").addEventListener("click", () => document.body.classList.toggle("light"));
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); document.querySelector("#searchInput").focus(); }
});

renderProducts();
renderActivities();
