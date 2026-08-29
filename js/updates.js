const state = {
  tab: "official",
  officialItems: [],
  twitterItems: [],
  filter: "all",
};

async function loadBulletins() {
  state.filter = document.getElementById("region-filter")?.value || "all";
  await Promise.all([loadOfficialBulletin(), loadTwitterBulletin()]);
  renderOfficialList();
  if (state.tab === "twitter") renderTwitterList();
}

async function loadOfficialBulletin() {
  const meta = document.getElementById("official-meta");
  const container = document.getElementById("official-list");
  if (!container) return;

  container.innerHTML = `<div class="empty-state">Loading…</div>`;

  try {
    const res = await fetch("/data/bulletin.json");
    const data = await res.json();
    let items = data.items || [];
    if (state.filter !== "all") {
      items = items.filter((u) => (u.region || []).includes(state.filter));
    }
    items = sortBulletinItems(items);
    state.officialItems = items;

    if (meta) {
      meta.textContent = formatMeta(data, items.length);
    }
  } catch (e) {
    state.officialItems = [];
    container.innerHTML = `<div class="alert alert-error">Could not load updates.</div>`;
  }
}

async function loadTwitterBulletin() {
  const meta = document.getElementById("twitter-meta");
  try {
    const res = await fetch("/data/twitter_bulletin.json");
    const data = await res.json();
    let items = data.items || [];
    if (state.filter !== "all") {
      items = items.filter((u) => (u.region || []).includes(state.filter));
    }
    items = sortBulletinItems(items);
    state.twitterItems = items;
    if (meta) meta.textContent = formatMeta(data, items.length);
  } catch (e) {
    state.twitterItems = [];
    if (meta) meta.textContent = "";
  }
}

function sortBulletinItems(items) {
  const updates = items
    .filter((i) => i.kind !== "pointer")
    .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  const pointers = items
    .filter((i) => i.kind === "pointer")
    .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  return [...updates, ...pointers];
}

function renderOfficialList() {
  const container = document.getElementById("official-list");
  if (!container) return;

  const items = state.officialItems;
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(t("officialEmpty"))}</div>`;
    return;
  }

  const news = items.filter((i) => i.kind !== "pointer");
  const portals = items.filter((i) => i.kind === "pointer");

  let html = "";
  if (news.length) {
    html += news.map((u) => renderItem(u, false)).join("");
  }
  if (portals.length) {
    html += `<h3 class="updates-section-title">${escapeHtml(t("officialPortalsTitle"))}</h3>`;
    html += `<p class="form-hint updates-section-hint">${escapeHtml(t("officialPortalsHint"))}</p>`;
    html += portals.map((u) => renderItem(u, false)).join("");
  }
  container.innerHTML = html;
}

async function renderTwitterList() {
  const container = document.getElementById("twitter-list");
  const accountsEl = document.getElementById("twitter-accounts");
  if (!container) return;

  const items = state.twitterItems;
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(t("twitterEmpty"))}</div>`;
  } else {
    container.innerHTML = items.map((u) => renderItem(u, true)).join("");
  }
  await renderTwitterAccounts(accountsEl);
}

async function renderTwitterAccounts(el) {
  if (!el) return;
  try {
    const res = await fetch("/data/resources.json");
    const data = await res.json();
    const accounts = data.twitter || [];
    if (!accounts.length) {
      el.hidden = true;
      return;
    }

    el.hidden = false;
    el.innerHTML = `
      <h3 class="account-grid-title">${escapeHtml(t("twitterFollow"))}</h3>
      <p class="form-hint">${escapeHtml(t("twitterFollowHint"))}</p>
      <div class="account-grid-inner">
        ${accounts
          .map(
            (a) => `
          <a class="account-card" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">
            <strong>${escapeHtml(a.name)}</strong>
            <span>${escapeHtml(a.url.replace("https://x.com/", "@"))}</span>
          </a>`
          )
          .join("")}
      </div>`;
  } catch (e) {
    el.hidden = true;
  }
}

function formatMeta(data, visibleCount) {
  const checked = data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "—";
  const parts = [`Checked ${checked}`];
  if (visibleCount != null) parts.push(`${visibleCount} update${visibleCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function shortSource(name) {
  const map = [
    [/ministry of foreign affairs/i, "MoFA Nepal"],
    [/ministry of external affairs/i, "MEA India"],
    [/xinhua/i, "Xinhua"],
    [/ndrrma/i, "NDRRMA"],
    [/nepal police/i, "Nepal Police"],
    [/embassy of india/i, "India Embassy"],
    [/twitter @/i, (s) => s.replace(/^Twitter\s+/i, "")],
  ];
  for (const [re, label] of map) {
    if (re.test(name || "")) return typeof label === "function" ? label(name) : label;
  }
  return name || "Official source";
}

function renderItem(u, isTwitter) {
  const when = formatStamp(u.timestamp, u.publishedLabel);
  const source = shortSource(u.source);
  const isPointer = u.kind === "pointer";
  const badge = isTwitter
    ? `<span class="badge badge-twitter">X / Twitter</span>`
    : isPointer
      ? `<span class="badge badge-portal">Official portal</span>`
      : `<span class="badge badge-official">Official update</span>`;

  return `
    <article class="update-item${isPointer ? " update-item-portal" : ""}">
      <div class="update-meta">
        ${badge}
        <span class="update-source">${escapeHtml(source)}</span>
        <time datetime="${escapeHtml(u.timestamp || "")}">${escapeHtml(when)}</time>
      </div>
      ${u.title ? `<h3 class="bulletin-title">${escapeHtml(u.title)}</h3>` : ""}
      <p class="update-summary">${escapeHtml(u.summary)}</p>
      <a class="update-link" href="${escapeHtml(u.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(
        isPointer ? t("openPortal") : t("readOriginal")
      )} →</a>
    </article>`;
}

function formatStamp(iso, label) {
  if (label) {
    // Prefer a short readable date if label is long
    const m = label.match(/(August \d+,?\s*2026[^,]*)/i) || label.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1].replace(",", "");
    return label;
  }
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab-bar .tab").forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const show = panel.id === `panel-${tab}`;
    panel.classList.toggle("active", show);
    panel.hidden = !show;
  });
  if (tab === "twitter") renderTwitterList();
  else renderOfficialList();
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("official-list")) return;

  document.querySelectorAll(".tab-bar .tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("region-filter")?.addEventListener("change", loadBulletins);

  const hash = window.location.hash.replace("#", "");
  if (hash === "twitter") switchTab("twitter");

  loadBulletins();
});
