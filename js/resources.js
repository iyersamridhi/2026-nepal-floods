const CATEGORIES = [
  { id: "all", labelKey: "chipAll", label: "All" },
  { id: "control", labelKey: "chipControl", label: "Control rooms" },
  { id: "nepal", labelKey: "chipNepal", label: "Nepal districts" },
  { id: "tibet", labelKey: "chipTibet", label: "Tibet / China" },
  { id: "embassy", labelKey: "chipEmbassy", label: "Embassies" },
  { id: "community", labelKey: "chipCommunity", label: "Community boards" },
  { id: "situational", labelKey: "chipSituational", label: "Situation briefs" },
  { id: "portal", labelKey: "chipPortal", label: "Portals" },
  { id: "twitter", labelKey: "chipTwitter", label: "X / Twitter" },
];

const CATEGORY_LABEL = {
  control: "Control room",
  nepal: "Nepal",
  tibet: "Tibet / China",
  embassy: "Embassy",
  community: "Community board",
  situational: "Situation brief",
  portal: "Portal",
  twitter: "X / Twitter",
};

let directoryItems = [];
let activeCategory = "all";
let searchQuery = "";

document.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("directory-root");
  if (!root) return;

  const [res, help] = await Promise.all([
    fetch("/data/resources.json").then((r) => r.json()),
    fetch("/data/helplines.json").then((r) => r.json()),
  ]);

  directoryItems = buildDirectory(res, help);
  renderChips();
  renderDirectory();

  const search = document.getElementById("directory-search");
  if (search) {
    search.addEventListener("input", () => {
      searchQuery = search.value.trim().toLowerCase();
      renderDirectory();
    });
  }

  document.addEventListener("langchange", () => {
    renderChips();
    applyPlaceholders();
    renderDirectory();
  });

  applyPlaceholders();
});

function applyPlaceholders() {
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key && typeof t === "function") el.placeholder = t(key);
  });
}

function phonesOf(entry) {
  if (entry.phones) return entry.phones;
  if (entry.phone) return [entry.phone];
  return [];
}

function buildDirectory(res, help) {
  const items = [];

  const push = (item) => {
    const phones = item.phones || [];
    const whatsapp = item.whatsapp || [];
    const hay = [
      item.name,
      item.category,
      CATEGORY_LABEL[item.category] || "",
      ...(item.tags || []),
      ...phones,
      ...whatsapp,
      item.email || "",
      item.note || "",
      item.hours || "",
    ]
      .join(" ")
      .toLowerCase();
    items.push({ ...item, phones, whatsapp, _search: hay });
  };

  if (help.indiaMea) {
    push({
      id: "mea",
      name: help.indiaMea.name,
      category: "control",
      tags: ["India", "MEA", "control room"],
      phones: help.indiaMea.phones || [],
      whatsapp: help.indiaMea.whatsapp || [],
      email: help.indiaMea.email,
      url: help.indiaMea.sourceUrl,
      note: "24×7 Special Control Room for the Nepal floods situation.",
    });
  }

  if (help.nepalMofa) {
    push({
      id: "mofa",
      name: help.nepalMofa.name,
      category: "control",
      tags: ["Nepal", "MoFA", "foreign nationals"],
      phones: phonesOf(help.nepalMofa),
      whatsapp: help.nepalMofa.whatsapp || [],
      email: help.nepalMofa.email,
      hours: help.nepalMofa.hours,
      note: "For foreign nationals affected by the floods.",
    });
  }

  if (help.indiaEmbassyKathmandu) {
    push({
      id: "ind-ktm",
      name: help.indiaEmbassyKathmandu.name,
      category: "control",
      tags: ["India", "embassy", "Kathmandu"],
      phones: phonesOf(help.indiaEmbassyKathmandu),
      whatsapp: help.indiaEmbassyKathmandu.whatsapp || [],
      url: help.indiaEmbassyKathmandu.url,
    });
  }

  if (help.indiaEmbassyBeijing) {
    push({
      id: "ind-bj",
      name: help.indiaEmbassyBeijing.name,
      category: "tibet",
      tags: ["India", "Beijing", "Tibet", "China"],
      phones: phonesOf(help.indiaEmbassyBeijing),
      whatsapp: help.indiaEmbassyBeijing.whatsapp || [],
      note: help.indiaEmbassyBeijing.note,
    });
  }

  (help.nepalDistricts || []).forEach((d, i) => {
    push({
      id: `np-${i}`,
      name: d.name,
      category: "nepal",
      tags: ["district", "Nepal", d.name],
      phones: phonesOf(d),
      email: d.email,
    });
  });

  (help.tibetChina || []).forEach((t, i) => {
    const extra = t.global || [];
    push({
      id: `tb-${i}`,
      name: t.name,
      category: "tibet",
      tags: ["Tibet", "China", "Lhasa", "Beijing"],
      phones: [...phonesOf(t), ...extra],
      email: t.email,
      url: t.url,
      note: t.note,
    });
  });

  (help.embassies || [])
    .filter((e) => e.country !== "India" && e.country !== "China")
    .forEach((e, i) => {
      push({
        id: `emb-${i}`,
        name: `Embassy of ${e.country}`,
        category: "embassy",
        tags: [e.country, "embassy", "Kathmandu"],
        phones: phonesOf(e),
        whatsapp: e.whatsapp ? phonesOf(e) : [],
        email: e.email,
        url: e.url,
        note: e.note,
      });
    });

  (res.portals || []).forEach((p, i) => {
    const isCommunity = p.region === "community";
    const isSituational = p.region === "situational";
    push({
      id: `portal-${i}`,
      name: p.name,
      category: isCommunity ? "community" : isSituational ? "situational" : "portal",
      tags: [
        p.region || "",
        isCommunity ? "community board" : isSituational ? "situation brief" : "portal",
        isCommunity || isSituational ? "non-government" : "official",
      ],
      url: p.url,
      note: isCommunity
        ? "Community-run missing / found board — not a government database."
        : isSituational
          ? "Situational awareness only — not for filing missing-person cases; follow DHM / NDRRMA for official warnings."
          : "",
    });
  });

  (res.twitter || []).forEach((p, i) => {
    push({
      id: `tw-${i}`,
      name: p.name,
      category: "twitter",
      tags: ["twitter", "X", "updates"],
      url: p.url,
      note: "Official account — verify important claims on the linked government site.",
    });
  });

  return items;
}

function filteredItems() {
  return directoryItems.filter((item) => {
    if (activeCategory !== "all" && item.category !== activeCategory) return false;
    if (searchQuery && !item._search.includes(searchQuery)) return false;
    return true;
  });
}

function renderChips() {
  const el = document.getElementById("directory-chips");
  if (!el) return;

  const counts = { all: directoryItems.length };
  directoryItems.forEach((item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });

  el.innerHTML = CATEGORIES.map((c) => {
    const label = typeof t === "function" ? t(c.labelKey) || c.label : c.label;
    const n = counts[c.id] ?? 0;
    const active = activeCategory === c.id ? " active" : "";
    return `<button type="button" class="chip${active}" data-category="${c.id}" role="tab" aria-selected="${activeCategory === c.id}">${escapeHtml(label)} <span class="chip-count">${n}</span></button>`;
  }).join("");

  el.querySelectorAll("[data-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.getAttribute("data-category");
      renderChips();
      renderDirectory();
    });
  });
}

function renderDirectory() {
  const root = document.getElementById("directory-root");
  const countEl = document.getElementById("directory-count");
  if (!root) return;

  const items = filteredItems();
  const total = directoryItems.length;

  if (countEl) {
    const showing = typeof t === "function" ? t("resourcesShowing") : "Showing";
    countEl.textContent = `${showing} ${items.length} / ${total}`;
  }

  if (!items.length) {
    root.innerHTML = `<p class="directory-empty">${escapeHtml(typeof t === "function" ? t("resourcesEmpty") : "No contacts match that search.")}</p>`;
    return;
  }

  if (activeCategory === "all" && !searchQuery) {
    root.innerHTML = CATEGORIES.filter((c) => c.id !== "all")
      .map((c) => {
        const group = items.filter((i) => i.category === c.id);
        if (!group.length) return "";
        const label = typeof t === "function" ? t(c.labelKey) || c.label : c.label;
        return `<section class="directory-section">
          <h2 class="directory-section-title">${escapeHtml(label)}</h2>
          <div class="directory-grid">${group.map(renderEntry).join("")}</div>
        </section>`;
      })
      .join("");
    return;
  }

  root.innerHTML = `<div class="directory-grid">${items.map(renderEntry).join("")}</div>`;
}

function renderEntry(item) {
  const badge = CATEGORY_LABEL[item.category] || item.category;
  const actions = [];

  item.phones.forEach((p) => {
    actions.push(`<a class="dir-action" href="tel:${escapeAttr(p)}">${escapeHtml(formatPhone(p))}</a>`);
  });

  (item.whatsapp || []).forEach((p) => {
    if (!p) return;
    const already = item.phones.includes(p);
    const label = already ? "WhatsApp" : `WhatsApp ${formatPhone(p)}`;
    actions.push(
      `<a class="dir-action dir-action-wa" href="${encodeWhatsApp(p, "")}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`
    );
  });

  if (item.email) {
    actions.push(`<a class="dir-action" href="mailto:${escapeAttr(item.email)}">${escapeHtml(item.email)}</a>`);
  }

  if (item.url) {
    actions.push(
      `<a class="dir-action dir-action-link" href="${escapeAttr(item.url)}" target="_blank" rel="noopener">${item.category === "twitter" || item.category === "portal" ? "Open" : "Source"} →</a>`
    );
  }

  const meta = [item.hours, item.note].filter(Boolean).join(" · ");

  return `<article class="dir-entry" data-category="${escapeAttr(item.category)}">
    <div class="dir-entry-head">
      <h3 class="dir-entry-name">${escapeHtml(item.name)}</h3>
      <span class="dir-badge">${escapeHtml(badge)}</span>
    </div>
    ${meta ? `<p class="dir-entry-meta">${escapeHtml(meta)}</p>` : ""}
    ${actions.length ? `<div class="dir-actions">${actions.join("")}</div>` : ""}
  </article>`;
}

function formatPhone(p) {
  const s = String(p);
  if (s.startsWith("+977") && s.length > 5) return `+977-${s.slice(4)}`;
  if (s.startsWith("+91") && s.length > 4) return `+91-${s.slice(3)}`;
  if (s.startsWith("+86") && s.length > 4) return `+86-${s.slice(3)}`;
  return s;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
