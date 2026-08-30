const THEMES = [
  { id: "all", labelKey: "themeAll" },
  { id: "rescue", labelKey: "themeRescue" },
  { id: "missing", labelKey: "themeMissing" },
  { id: "hospitals", labelKey: "themeHospitals" },
  { id: "remains", labelKey: "themeRemains" },
  { id: "relief", labelKey: "themeRelief" },
  { id: "contacts", labelKey: "themeContacts" },
  { id: "briefing", labelKey: "themeBriefing" },
];

const THEME_WORDS = {
  hospitals: ["hospital", "injured", "discharged", "treatment", "अस्पताल", "घाइते", "उपचार", "डिश्चार्ज"],
  rescue: ["rescue", "rescued", "उद्धार", "helicopter", "search and rescue", "खोज"],
  missing: ["missing", "unaccounted", "lost", "found", "बेपत्ता", "हराएको", "सम्पर्कमा नआएका", "फेला"],
  remains: ["unidentified", "dead body", "bodies recovered", "शव", "remains", "forensic", "dna"],
  relief: ["relief", "राहत", "cash support", "food", "fuel", "truck", "supplies"],
  contacts: ["hotline", "control room", "helpline", "whatsapp", "emergency contact", "सम्पर्क"],
  briefing: ["press", "briefing", "update", "अपडेट", "press release", "situation", "portal"],
};

const state = {
  tab: "official",
  officialItems: [],
  twitterItems: [],
  filter: "all",
  theme: "all",
};

function assignThemes(item) {
  if (Array.isArray(item.themes) && item.themes.length) return item.themes;
  const blob = `${item.title || ""} ${item.summary || ""} ${item.source || ""}`.toLowerCase();
  const themes = [];
  for (const [theme, words] of Object.entries(THEME_WORDS)) {
    if (words.some((w) => blob.includes(w.toLowerCase()))) themes.push(theme);
  }
  return themes.length ? themes : ["briefing"];
}

function withThemes(items) {
  return (items || []).map((item) => ({ ...item, themes: assignThemes(item) }));
}

function matchesTheme(item) {
  if (state.theme === "all") return true;
  return (item.themes || []).includes(state.theme);
}

async function loadBulletins() {
  state.filter = document.getElementById("region-filter")?.value || "all";
  await Promise.all([loadOfficialBulletin(), loadTwitterBulletin()]);
  renderThemeChips();
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
    let items = withThemes(data.items || []);
    if (state.filter !== "all") {
      items = items.filter((u) => (u.region || []).includes(state.filter));
    }
    items = sortBulletinItems(items);
    state.officialItems = items;

    const visible = items.filter(matchesTheme);
    if (meta) meta.textContent = formatMeta(data, visible.length, visible);
    const latestEl = document.getElementById("official-latest");
    if (latestEl) {
      const newest = visible.find((i) => i.kind !== "pointer") || visible[0];
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
    let items = withThemes(data.items || []);
    if (state.filter !== "all") {
      items = items.filter((u) => (u.region || []).includes(state.filter));
    }
    items = sortBulletinItems(items);
    state.twitterItems = items;
    const visible = items.filter(matchesTheme);
    if (meta) meta.textContent = formatMeta(data, visible.length, visible);
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

function renderThemeChips() {
  const el = document.getElementById("theme-chips");
  if (!el) return;
  const pool = state.tab === "twitter" ? state.twitterItems : state.officialItems;
  const counts = { all: pool.length };
  THEMES.forEach((th) => {
    if (th.id === "all") return;
    counts[th.id] = pool.filter((i) => (i.themes || []).includes(th.id)).length;
  });

  el.innerHTML = THEMES.map((th) => {
    const n = counts[th.id] || 0;
    const active = state.theme === th.id ? " active" : "";
    return `<button type="button" class="chip${active}" data-theme="${th.id}" role="tab" aria-selected="${
      state.theme === th.id
    }">${escapeHtml(t(th.labelKey))} <span class="chip-count">${n}</span></button>`;
  }).join("");

  el.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.theme = btn.getAttribute("data-theme") || "all";
      renderThemeChips();
      if (state.tab === "twitter") renderTwitterList();
      else renderOfficialList();
      const meta = document.getElementById(state.tab === "twitter" ? "twitter-meta" : "official-meta");
      const items = (state.tab === "twitter" ? state.twitterItems : state.officialItems).filter(matchesTheme);
      if (meta) {
        const checked = meta.textContent.split(" · ")[0] || "";
        meta.textContent = `${checked} · ${items.length} update${items.length === 1 ? "" : "s"}`;
      }
    });
  });
}

function renderOfficialList() {
  const container = document.getElementById("official-list");
  if (!container) return;

  const items = state.officialItems.filter(matchesTheme);
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

  const items = state.twitterItems.filter(matchesTheme);
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
    [/district administration office/i, "DAO Rasuwa"],
    [/xinhua/i, "Xinhua"],
    [/ndrrma/i, "NDRRMA"],
    [/nepal police/i, "Nepal Police"],
    [/embassy of india/i, "India Embassy"],
    [/opmcm|prime minister/i, "OPMCM"],
    [/twitter @/i, (s) => s.replace(/^Twitter\s+/i, "")],
  ];
  for (const [re, label] of map) {
    if (re.test(name || "")) return typeof label === "function" ? label(name) : label;
  }
  return name || "Official source";
}

function stripSummaryUrls(text) {
  if (!text) return "";
  let cleaned = String(text).replace(/https?:\/\/\S+/gi, "");
  cleaned = cleaned.replace(
    /(?:\n\s*)?(?:for the (?:latest )?details,?\s*check the original(?: update)? here:?|see the full update here:?|check the original page(?: for updates)?:?|for the full details,?\s*see the original report here:?|check the original page here for contact numbers:?|open the (?:post|original|page)(?: for (?:the )?full (?:note|details))?\.?|check (?:them|it) at\.?|read the original\.?)\s*$/i,
    ""
  );
  return cleaned.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim().replace(/[:–-]+$/, "").trim();
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
  const summary = stripSummaryUrls(u.summary);
  const themes = (u.themes || []).slice(0, 3);
  const themeHtml = themes.length
    ? `<div class="update-theme-tags">${themes
        .map((th) => {
          const label = THEMES.find((x) => x.id === th);
          return `<span class="update-theme-tag">${escapeHtml(label ? t(label.labelKey) : th)}</span>`;
        })
        .join("")}</div>`
    : "";

  return `
    <article class="update-item${isPointer ? " update-item-portal" : ""}">
      <div class="update-meta">
        ${badge}
        <span class="update-source">${escapeHtml(source)}</span>
        <time datetime="${escapeHtml(u.timestamp || "")}">${escapeHtml(when)}</time>
      </div>
      ${u.title ? `<h3 class="bulletin-title">${escapeHtml(u.title)}</h3>` : ""}
      ${themeHtml}
      <p class="update-summary">${escapeHtml(summary)}</p>
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
  renderThemeChips();
  if (tab === "twitter") renderTwitterList();
  else renderOfficialList();
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("official-list")) return;

  document.querySelectorAll(".tab-bar .tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("region-filter")?.addEventListener("change", loadBulletins);
  document.addEventListener("langchange", () => {
    renderThemeChips();
    if (state.tab === "twitter") renderTwitterList();
    else renderOfficialList();
  });

  const hash = window.location.hash.replace("#", "");
  if (hash === "twitter") switchTab("twitter");

  loadBulletins();
});
