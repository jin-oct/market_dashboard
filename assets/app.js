const TAB_DEFS = [
  { key: "summary", label: "市場" },
  { key: "jp_stock", label: "日本株" },
  { key: "us_stock", label: "米国株" },
  { key: "fx", label: "為替" },
  { key: "crypto", label: "仮想通貨" },
  { key: "bond", label: "債券" },
  { key: "watchlist", label: "監視" }
];

const DATA_FILES = {
  summary: "./data/summary.json",
  jp_stock: "./data/jp_stock.json",
  us_stock: "./data/us_stock.json",
  fx: "./data/fx.json",
  crypto: "./data/crypto.json",
  bond: "./data/bond.json",
  watchlist: "./data/watchlist.json"
};

const FALLBACK_DATA = {
  summary: {
    updated_at: "未取得",
    market_overview: {
      risk_mode: "判定待ち",
      macro_tone: "データ取得に失敗しました。生成スクリプトを再実行してください。",
      geopolitical_risk: "medium",
      related_assets: { oil: "--", vix: "--", usdjpy: "--", fear_greed: "--" }
    },
    ai_summary: {
      global: {
        main_theme: "市場データを読み込み中",
        fall_factors: "未取得",
        risk_on_off: "判定待ち",
        focus_points: "JSONを確認してください。",
        jp_swing_hint: "データ取得後に表示します。"
      }
    },
    news: [],
    category_news: { jp_stock: [], us_stock: [], fx: [], crypto: [], bond: [] }
  },
  jp_stock: { items: [] },
  us_stock: { items: [] },
  fx: { items: [] },
  crypto: { items: [], top_pumps: [] },
  bond: { items: [] },
  watchlist: { items: [] }
};

const IMPACT_TEXT = { high: "影響大", medium: "影響中", low: "影響小" };
const SENTIMENT_TEXT = { positive: "上昇要因", negative: "下落要因", neutral: "中立" };
const CATEGORY_TEXT = {
  jp_stock: "日本株",
  us_stock: "米国株",
  fx: "為替",
  crypto: "仮想通貨",
  bond: "債券"
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return number.toLocaleString("ja-JP", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  const sign = number > 0 ? "+" : "";
  return `${sign}${formatNumber(number, 2)}%`;
}

function shortText(value, maxLength = 84) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function toneClassFromNumber(value) {
  const number = Number(value);
  if (number > 0) return "positive";
  if (number < 0) return "negative";
  return "neutral";
}

function sentimentClass(value) {
  if (value === "positive") return "positive";
  if (value === "negative") return "negative";
  return "neutral";
}

function impactClass(value) {
  if (value === "high") return "impact-high";
  if (value === "medium") return "impact-medium";
  return "impact-low";
}

function iconForNews(item) {
  const tags = item.tags || [];
  if (tags.includes("geopolitics")) return "⚠";
  if (tags.includes("oil")) return "油";
  if (tags.includes("volatility")) return "VIX";
  if (tags.includes("rates")) return "金利";
  if (tags.includes("crypto")) return "BTC";
  if (item.category === "fx") return "円";
  return "株";
}

function directionText(item) {
  if (item.category === "fx" && item.fx_bias) return item.fx_bias;
  return SENTIMENT_TEXT[item.sentiment] || "中立";
}

function impactNote(item) {
  const assets = (item.related_assets || []).slice(0, 3).join(" / ");
  const category = CATEGORY_TEXT[item.category] || "市場";
  const impact = IMPACT_TEXT[item.impact] || "影響中";
  const direction = directionText(item);
  if (assets) return `${category}に${impact}。主な影響先は ${assets}。方向性は「${direction}」。`;
  return `${category}に${impact}。方向性は「${direction}」。`;
}

function renderSparkline(points, color) {
  if (!Array.isArray(points) || points.length === 0) {
    return `<div class="empty-state">履歴なし</div>`;
  }
  const width = 320;
  const height = 64;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const spread = max - min || 1;
  const step = width / Math.max(points.length - 1, 1);
  const path = points.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / spread) * (height - 10) - 5;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="square"></path>
    </svg>
  `;
}

function createTabs() {
  const root = document.getElementById("tabs");
  TAB_DEFS.forEach((tab, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${index === 0 ? " is-active" : ""}`;
    button.dataset.tab = tab.key;
    button.textContent = tab.label;
    button.addEventListener("click", () => switchTab(tab.key));
    root.appendChild(button);
  });
}

function switchTab(tabKey) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tabKey);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.tab === tabKey);
  });
}

function buildBriefCard(summary) {
  const global = summary.ai_summary?.global || {};
  return `
    <div class="section-header">
      <div>
        <div class="section-title">TODAY'S BRIEF</div>
        <div class="section-subtitle">まず見るべき市場テーマ</div>
      </div>
    </div>
    <h2>${escapeHtml(shortText(global.main_theme, 72))}</h2>
    <p class="brief-copy">${escapeHtml(shortText(global.focus_points, 120))}</p>
    <div class="brief-tags">
      <span class="news-chip negative">下落要因: ${escapeHtml(shortText(global.fall_factors, 36))}</span>
      <span class="news-chip neutral">${escapeHtml(shortText(global.risk_on_off, 28))}</span>
    </div>
  `;
}

function buildRiskCard(summary) {
  const overview = summary.market_overview || {};
  const related = overview.related_assets || {};
  const lead = (summary.news || [])[0];
  return `
    <div class="risk-top">
      <div>
        <div class="risk-title">リスク判定</div>
        <div class="section-subtitle">${escapeHtml(shortText(overview.macro_tone, 92))}</div>
      </div>
      <div class="news-chip status-high">${escapeHtml(String(overview.geopolitical_risk || "medium").toUpperCase())}</div>
    </div>
    <div class="risk-grid">
      <div class="risk-metric"><span>市場ムード</span><strong class="negative">${escapeHtml(shortText(overview.risk_mode, 16))}</strong></div>
      <div class="risk-metric"><span>Fear & Greed</span><strong>${escapeHtml(related.fear_greed || "--")}</strong></div>
      <div class="risk-metric"><span>重要ニュース</span><strong>${lead ? IMPACT_TEXT[lead.impact] || "影響中" : "--"}</strong></div>
    </div>
    <div class="risk-linked">
      <span class="metric-chip">VIX ${escapeHtml(related.vix || "--")}</span>
      <span class="metric-chip">WTI ${escapeHtml(related.oil || "--")}</span>
      <span class="metric-chip">USD/JPY ${escapeHtml(related.usdjpy || "--")}</span>
    </div>
  `;
}

function buildPairStrip(summary) {
  const related = summary.market_overview?.related_assets || {};
  const chips = [
    `USD/JPY ${related.usdjpy || "--"}`,
    `VIX ${related.vix || "--"}`,
    `WTI ${related.oil || "--"}`,
    `F&G ${related.fear_greed || "--"}`
  ];
  return chips.map((chip, index) => `<span class="asset-chip${index === 0 ? " is-active" : ""}">${escapeHtml(chip)}</span>`).join("");
}

function percentOrDash(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return `${formatNumber(value, 1)}%`;
}

function buildIntelBoard(summary) {
  const intel = summary.market_overview?.intel || {};
  const pizza = intel.pizza_meter || {};
  const poly = intel.polymarket_iran || {};
  const pizzaSpot = pizza.top_spot
    ? `${pizza.top_spot}${pizza.top_spot_pct ? ` ${pizza.top_spot_pct}%` : ""}`
    : "--";

  return `
    <div class="section-header">
      <div>
        <div class="section-title">SIGNAL BOARD</div>
        <div class="section-subtitle">地政学リスクの補助シグナル</div>
      </div>
    </div>
    <div class="intel-grid">
      <article class="intel-card">
        <div class="intel-label">PENTAGON PIZZA METER</div>
        <div class="intel-main">${escapeHtml(pizza.status || "N/A")} / ${escapeHtml(pizza.score ?? "--")}</div>
        <div class="intel-meta">ピーク: ${escapeHtml(pizzaSpot)} / Spikes ${escapeHtml(pizza.active_spikes ?? "--")}</div>
      </article>
      <article class="intel-card">
        <div class="intel-label">POLYMARKET / IRAN</div>
        <div class="intel-list">
          <div><span>和平合意</span><strong>${percentOrDash(poly.peace_deal_yes)}</strong></div>
          <div><span>外交会談</span><strong>${percentOrDash(poly.diplomatic_meeting_yes)}</strong></div>
          <div><span>ホルムズ正常化</span><strong>${percentOrDash(poly.hormuz_normal_yes)}</strong></div>
        </div>
      </article>
    </div>
  `;
}

function buildSummaryQuote(fxData) {
  const item = (fxData.items || [])[0];
  if (!item) return `<div class="empty-state">為替データなし</div>`;
  const changeClass = toneClassFromNumber(item.change_pct);
  return `
    <div class="quote-bid">
      <strong>${escapeHtml(item.display_price || formatNumber(item.price, item.decimals ?? 2))}</strong>
      <span>/ ${formatNumber(item.price, item.decimals ?? 2)}</span>
    </div>
    <div class="quote-change">
      <span>前日比</span>
      <span class="${changeClass}">${formatPercent(item.change_pct)}</span>
    </div>
    <div class="quote-range">レンジ: ${formatNumber(item.low, item.decimals ?? 2)} - ${formatNumber(item.high, item.decimals ?? 2)}</div>
  `;
}

function todayNote(summary) {
  const global = summary.ai_summary?.global || {};
  return `
    <h3>TODAY'S WATCH</h3>
    <p>${escapeHtml(shortText(global.jp_swing_hint, 110))}</p>
  `;
}

function newsCard(item) {
  const assets = (item.related_assets || []).slice(0, 3);
  const source = [item.source, item.published_at].filter(Boolean).join(" / ");
  const title = shortText(item.title, 92);
  const summary = shortText(item.summary, 96);
  const direction = directionText(item);
  return `
    <article class="news-card ${impactClass(item.impact)}">
      <div class="news-header">
        <div class="news-icon">${escapeHtml(iconForNews(item))}</div>
        <div class="news-body">
          <div class="news-chips">
            <span class="news-chip ${sentimentClass(item.sentiment)}">${escapeHtml(direction)}</span>
            <span class="news-chip">${escapeHtml(IMPACT_TEXT[item.impact] || "影響中")}</span>
          </div>
          <a href="${escapeHtml(item.link || "#")}" target="_blank" rel="noreferrer"><h3>${escapeHtml(title)}</h3></a>
        </div>
      </div>
      <div class="impact-note">${escapeHtml(impactNote(item))}</div>
      ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
      <div class="news-meta">
        ${assets.map((asset) => `<span>${escapeHtml(asset)}</span>`).join("")}
        <span>${escapeHtml(shortText(source, 44))}</span>
      </div>
    </article>
  `;
}

function marketCard(item, type) {
  const template = document.getElementById("marketCardTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  const changeClass = toneClassFromNumber(item.change_pct || 0);
  const sparkColor = changeClass === "positive" ? "#8af0a7" : changeClass === "negative" ? "#f07f7f" : "#d7b36d";

  node.querySelector(".market-symbol").textContent = item.symbol || "";
  node.querySelector(".market-name").textContent = item.name || "";
  node.querySelector(".market-change").textContent = formatPercent(item.change_pct || 0);
  node.querySelector(".market-change").classList.add(changeClass);
  node.querySelector(".market-price").textContent = item.display_price || formatNumber(item.price, item.decimals ?? 2);
  node.querySelector(".market-range").textContent = `高値 ${formatNumber(item.high, item.decimals ?? 2)} / 安値 ${formatNumber(item.low, item.decimals ?? 2)}`;
  node.querySelector(".market-spark").innerHTML = renderSparkline(item.sparkline || [], sparkColor);

  const metaRoot = node.querySelector(".market-meta");
  const chips = [];
  if (type === "crypto") {
    chips.push(`1H ${formatPercent(item.change_1h_pct || 0)}`);
    chips.push(`24H ${formatPercent(item.change_24h_pct || 0)}`);
    chips.push(`VOL ${formatPercent(item.volume_change_pct || 0)}`);
  }
  if (type === "bond" && item.duration) chips.push(`DUR ${item.duration}`);
  metaRoot.innerHTML = chips.map((chip) => `<span class="metric-chip">${escapeHtml(chip)}</span>`).join("");
  return node;
}

function renderNewsList(rootId, items, limit = 4) {
  const root = document.getElementById(rootId);
  root.innerHTML = "";
  const visibleItems = (items || []).slice(0, limit);
  if (visibleItems.length === 0) {
    root.innerHTML = `<div class="empty-state">該当ニュースなし</div>`;
    return;
  }
  visibleItems.forEach((item) => {
    root.insertAdjacentHTML("beforeend", newsCard(item));
  });
}

function renderCategoryNews(summary, category, rootId) {
  const items = summary.category_news?.[category] || [];
  renderNewsList(rootId, items, 4);
}

function renderMarketGrid(rootId, items, type) {
  const root = document.getElementById(rootId);
  root.innerHTML = "";
  if (!items || items.length === 0) {
    root.innerHTML = `<div class="empty-state">価格データなし</div>`;
    return;
  }
  items.forEach((item) => root.appendChild(marketCard(item, type)));
}

function renderPumpList(items) {
  const root = document.getElementById("pumpList");
  root.innerHTML = "";
  if (!items || items.length === 0) {
    root.innerHTML = `<div class="empty-state">パンプ候補なし</div>`;
    return;
  }
  items.slice(0, 5).forEach((item, index) => {
    root.insertAdjacentHTML("beforeend", `
      <div class="pump-row">
        <div>
          <div class="market-name">${index + 1}. ${escapeHtml(item.symbol)}</div>
          <div class="market-range">1H ${formatPercent(item.change_1h_pct)} / 24H ${formatPercent(item.change_24h_pct)}</div>
        </div>
        <strong class="${toneClassFromNumber(item.pump_score)}">${formatNumber(item.pump_score, 2)}</strong>
      </div>
    `);
  });
}

function renderWatchlist(watchlist) {
  const root = document.getElementById("watchlistGrid");
  root.innerHTML = "";
  const items = watchlist.items || [];
  if (items.length === 0) {
    root.innerHTML = `<div class="empty-state">ウォッチリストなし</div>`;
    return;
  }
  items.forEach((item) => {
    const triggers = (item.triggers || []).map((trigger) => `<li>${escapeHtml(trigger)}</li>`).join("");
    const article = document.createElement("article");
    article.className = "watchlist-card";
    article.innerHTML = `
      <div class="market-symbol">${escapeHtml(item.category || "")}</div>
      <h3>${escapeHtml(item.symbol || "")} / ${escapeHtml(item.name || "")}</h3>
      <p>${escapeHtml(item.note || "")}</p>
      <ul>${triggers}</ul>
    `;
    root.appendChild(article);
  });
}

function renderSummary(summary, fxData) {
  document.getElementById("updatedAtLine").textContent = `最終更新 ${summary.updated_at}`;
  document.getElementById("globalSummary").innerHTML = buildBriefCard(summary);
  document.getElementById("riskCard").innerHTML = buildRiskCard(summary);
  document.getElementById("intelBoard").innerHTML = buildIntelBoard(summary);
  document.getElementById("pairStrip").innerHTML = buildPairStrip(summary);
  document.getElementById("summaryQuote").innerHTML = buildSummaryQuote(fxData);
  document.getElementById("todayNote").innerHTML = todayNote(summary);
  renderNewsList("newsList", summary.news || [], 3);
}

async function loadDashboard() {
  createTabs();

  const fallbackUsed = [];
  const loaded = await Promise.all(
    Object.entries(DATA_FILES).map(async ([key, path]) => {
      try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return [key, await response.json()];
      } catch (error) {
        fallbackUsed.push(key);
        return [key, FALLBACK_DATA[key]];
      }
    })
  );

  const data = Object.fromEntries(loaded);
  renderSummary(data.summary, data.fx);
  renderCategoryNews(data.summary, "jp_stock", "jpStockNews");
  renderCategoryNews(data.summary, "us_stock", "usStockNews");
  renderCategoryNews(data.summary, "fx", "fxNews");
  renderCategoryNews(data.summary, "crypto", "cryptoNews");
  renderCategoryNews(data.summary, "bond", "bondNews");
  renderMarketGrid("jpStockGrid", data.jp_stock.items || [], "jp_stock");
  renderMarketGrid("usStockGrid", data.us_stock.items || [], "us_stock");
  renderMarketGrid("fxGrid", data.fx.items || [], "fx");
  renderMarketGrid("cryptoGrid", data.crypto.items || [], "crypto");
  renderMarketGrid("bondGrid", data.bond.items || [], "bond");
  renderPumpList(data.crypto.top_pumps || []);
  renderWatchlist(data.watchlist);

  if (fallbackUsed.length > 0) {
    document.getElementById("updatedAtLine").textContent += ` / fallback: ${fallbackUsed.join(", ")}`;
  }
}

loadDashboard().catch((error) => {
  document.getElementById("views").innerHTML = `<section class="solid-panel"><div class="empty-state">読み取り失敗: ${escapeHtml(error.message)}</div></section>`;
});
