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
    const res = await fetch(`/data/bulletin.json?_=${Date.now()}`);
    const data = await res.json();
    let items = data.items || [];
    if (state.filter !== "all") {
      items = items.filter((u) => (u.region || []).includes(state.filter));
    }
    items = sortBulletinItems(items);
    state.officialItems = items;

    if (meta) {
      meta.textContent = formatMeta(data, items.length, items);
    }
    const latestEl = document.getElementById("official-latest");
    if (latestEl) {
      const newest = items.find((i) => i.kind !== "pointer") || items[0];
      if (newest) {
        const when = newest.publishedLabel || formatStamp(newest.timestamp);
        latestEl.innerHTML = `Newest official update in this feed: <strong>${escapeHtml(when)}</strong> — ${escapeHtml(
          newest.title || newest.source || ""
        )}`;
      } else {
        latestEl.textContent = "";
      }
    }
  } catch (e) {
    state.officialItems = [];
    container.innerHTML = `<div class="alert alert-error">Could not load updates.</div>`;
  }
}

async function loadTwitterBulletin() {
  const meta = document.getElementById("twitter-meta");
  const hint = document.getElementById("twitter-hint");
  try {
    const res = await fetch(`/data/twitter_bulletin.json?_=${Date.now()}`);
    const data = await res.json();
    let items = data.items || [];
    if (state.filter !== "all") {
      items = items.filter((u) => (u.region || []).includes(state.filter));
    }
    items = sortBulletinItems(items);
    state.twitterItems = items;
    if (meta) meta.textContent = formatMeta(data, items.length, items);
    if (hint) {
      hint.textContent = data.liveFetch === false ? t("twitterLiveOff") : t("twitterHint");
    }
  } catch (e) {
    state.twitterItems = [];
    if (meta) meta.textContent = "";
    if (hint) hint.textContent = t("twitterLiveOff");
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

function formatMeta(data, visibleCount, items) {
  const checked = data.generatedAt ? formatStamp(data.generatedAt) : "—";
  const parts = [`Checked ${checked}`];
  if (items && items.length) {
    const newest = items.find((i) => i.kind !== "pointer") || items[0];
    const when = newest?.publishedLabel || formatStamp(newest?.timestamp);
    if (when) parts.push(`Newest post ${when}`);
  }
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

/** Always show one format in Nepal time: "29 Aug 2026 · 3:00 pm" */
function formatStamp(iso, label) {
  const d = parseBulletinDate(iso, label);
  if (!d) return label || iso || "";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kathmandu",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    const day = get("day");
    const month = get("month");
    const year = get("year");
    const hour = get("hour");
    const minute = get("minute");
    const dayPeriod = (get("dayPeriod") || "").toLowerCase();
    return `${day} ${month} ${year} · ${hour}:${minute} ${dayPeriod}`;
  } catch (e) {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

function parseBulletinDate(iso, label) {
  if (iso) {
    let s = String(iso).trim();
    // "2026-08-27 22:27:30" → treat as Nepal local if no zone
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
      s = s.replace(" ", "T") + "+05:45";
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (label) {
    const m = String(label).match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})\s*(AM|PM))?/i
    );
    if (m) {
      const months = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      };
      let hour = m[4] ? parseInt(m[4], 10) : 12;
      const minute = m[5] ? parseInt(m[5], 10) : 0;
      const ap = (m[6] || "PM").toUpperCase();
      if (ap === "PM" && hour < 12) hour += 12;
      if (ap === "AM" && hour === 12) hour = 0;
      // Build as Nepal offset via ISO string
      const mon = months[m[1].toLowerCase()];
      const day = parseInt(m[2], 10);
      const year = parseInt(m[3], 10);
      const isoLocal = `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:45`;
      const d = new Date(isoLocal);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const bare = new Date(label);
    if (!Number.isNaN(bare.getTime())) return bare;
  }
  return null;
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
