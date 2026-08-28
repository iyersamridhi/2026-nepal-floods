const OFFICIAL_PAGE_SIZE = 3;

const state = {
  tab: "official",
  officialPage: 1,
  officialItems: [],
  twitterItems: [],
  filter: "all",
};

async function loadBulletins() {
  state.filter = document.getElementById("region-filter")?.value || "all";
  state.officialPage = 1;

  await Promise.all([loadOfficialBulletin(), loadTwitterBulletin()]);
  renderOfficialPage();
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
    items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    state.officialItems = items;

    if (meta) {
      meta.textContent = formatMeta(data);
    }
  } catch (e) {
    state.officialItems = [];
    container.innerHTML = `<div class="alert alert-error">Could not load updates.</div>`;
  }
}

async function loadTwitterBulletin() {
  const container = document.getElementById("twitter-list");
  const accountsEl = document.getElementById("twitter-accounts");
  const meta = document.getElementById("twitter-meta");
  if (!container) return;

  container.innerHTML = `<div class="empty-state">Loading…</div>`;
  if (accountsEl) accountsEl.hidden = true;

  try {
    const res = await fetch("/data/twitter_bulletin.json");
    const data = await res.json();
    let items = data.items || [];
    if (state.filter !== "all") {
      items = items.filter((u) => (u.region || []).includes(state.filter));
    }
    items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    state.twitterItems = items;

    if (meta) {
      meta.textContent = formatMeta(data);
    }

    if (!items.length) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(t("twitterEmpty"))}</div>`;
      await renderTwitterAccounts(accountsEl);
    } else {
      container.innerHTML = items.map((u) => renderItem(u, true)).join("");
    }
  } catch (e) {
    state.twitterItems = [];
    container.innerHTML = `<div class="alert alert-error">Could not load Twitter updates.</div>`;
    await renderTwitterAccounts(accountsEl);
  }
}

function renderOfficialPage() {
  const container = document.getElementById("official-list");
  const pagination = document.getElementById("official-pagination");
  if (!container) return;

  const items = state.officialItems;
  const totalPages = Math.max(1, Math.ceil(items.length / OFFICIAL_PAGE_SIZE));

  if (state.officialPage > totalPages) {
    state.officialPage = totalPages;
  }

  if (!items.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(t("officialEmpty"))}</div>`;
    if (pagination) pagination.innerHTML = "";
    return;
  }

  const start = (state.officialPage - 1) * OFFICIAL_PAGE_SIZE;
  const pageItems = items.slice(start, start + OFFICIAL_PAGE_SIZE);
  container.innerHTML = pageItems.map((u) => renderItem(u, false)).join("");
  renderPagination(pagination, totalPages);
}

function renderPagination(el, totalPages) {
  if (!el) return;
  if (totalPages <= 1) {
    el.innerHTML = "";
    return;
  }

  const prevDisabled = state.officialPage <= 1;
  const nextDisabled = state.officialPage >= totalPages;

  el.innerHTML = `
    <button type="button" class="btn btn-secondary btn-sm" data-page="prev" ${prevDisabled ? "disabled" : ""}>← Previous</button>
    <span class="pagination-info">Page ${state.officialPage} of ${totalPages}</span>
    <button type="button" class="btn btn-secondary btn-sm" data-page="next" ${nextDisabled ? "disabled" : ""}>Next →</button>
  `;

  el.querySelector('[data-page="prev"]')?.addEventListener("click", () => {
    if (state.officialPage > 1) {
      state.officialPage -= 1;
      renderOfficialPage();
      document.getElementById("official-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  el.querySelector('[data-page="next"]')?.addEventListener("click", () => {
    if (state.officialPage < totalPages) {
      state.officialPage += 1;
      renderOfficialPage();
      document.getElementById("official-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

async function renderTwitterAccounts(el) {
  if (!el) return;
  try {
    const res = await fetch("/data/resources.json");
    const data = await res.json();
    const accounts = data.twitter || [];
    if (!accounts.length) return;

    el.hidden = false;
    el.innerHTML = `
      <h3 class="account-grid-title">${escapeHtml(t("twitterFollow"))}</h3>
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

function formatMeta(data) {
  const checked = data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "—";
  const parts = [`Updated: ${checked}`];
  if (data.summarizer) parts.push(`Summarizer: ${data.summarizer}`);
  if (data.skippedUnchanged) parts.push("(unchanged since last run)");
  return parts.join(" · ");
}

function renderItem(u, isTwitter) {
  const when = formatStamp(u.timestamp, u.publishedLabel);
  const title = u.title ? `<h3 class="bulletin-title">${escapeHtml(u.title)}</h3>` : "";
  const badge = isTwitter
    ? `<span class="badge" style="background:#e8f4fd;color:#1565c0">Twitter / X</span>`
    : `<span class="badge">Official channel</span>`;
  return `
    <article class="update-item">
      <time datetime="${escapeHtml(u.timestamp || "")}">${escapeHtml(when)}</time>
      <div class="source">${badge} ${escapeHtml(u.source)}${u.scrapeMethod ? ` · ${escapeHtml(u.scrapeMethod)}` : ""}</div>
      ${title}
      <p>${escapeHtml(u.summary)}</p>
      <p class="citation">Citation: ${escapeHtml(u.citation || u.source)} —
        <a href="${u.sourceUrl}" target="_blank" rel="noopener">read original →</a>
      </p>
    </article>`;
}

function formatStamp(iso, label) {
  if (label) return label;
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
  if (tab === "twitter" && !state.twitterItems.length) {
    renderTwitterAccounts(document.getElementById("twitter-accounts"));
  }
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
