const FOREIGN_NATIONALS = {
  kicker: "NDRRMA · 1 September 2026",
  title: "Foreign nationals — missing, rescued, or contacted",
  body: "Official lists for tourists and foreign nationals after the Bhote Koshi flood. NDRRMA links to the Department of Tourism page and this situation update PDF (final update dated 30 August 2026, 19:00). We embed the official viewer — names stay on the source document.",
  embedHint: "If the viewer is blank, open the PDF in a new tab. We do not copy names onto this page.",
  tourismUrl: "https://tourismdepartment.gov.np/content/185/tourist-list--out-of-contact--in-bhotekoshi/",
  pdfUrl: "https://ap.wps.com/l/cbCaigwQVrYF3ji7",
  pdfLabel: "Open PDF in new tab",
  pdfEmbedTitle: "Official situation update PDF — 30 August 2026, 19:00 (NDRRMA link)",
  ndrrmaUrl: "https://x.com/NDRRMA_Nepal/status/2094666412589744273",
  summaryPdf: "View official PDF (30 Aug 2026, 19:00)",
};

function renderForeignNationalsPanel(containerId, opts) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const u = FOREIGN_NATIONALS;
  const embed = opts && opts.embed;
  el.innerHTML = `
    ${embed ? `<summary class="foreign-nationals-summary">
      <span class="section-kicker">${u.kicker}</span>
      <span class="foreign-nationals-summary-title">${u.title}</span>
      <span class="form-hint foreign-nationals-summary-hint">${u.summaryPdf}</span>
    </summary>` : `<p class="section-kicker">${u.kicker}</p><h2 class="section-title">${u.title}</h2>`}
    <p class="form-hint">${u.body}</p>
    <div class="btn-group">
      <a class="btn btn-primary btn-sm" href="${u.tourismUrl}" target="_blank" rel="noopener">Tourism dept list →</a>
      <a class="btn btn-secondary btn-sm" href="${u.pdfUrl}" target="_blank" rel="noopener">${u.pdfLabel} →</a>
      <a class="btn btn-secondary btn-sm" href="${u.ndrrmaUrl}" target="_blank" rel="noopener">NDRRMA post →</a>
    </div>
    ${embed ? `<div class="pdf-embed-wrap">
      <iframe
        src="${u.pdfUrl}"
        title="${u.pdfEmbedTitle}"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
      ></iframe>
    </div>
    <p class="form-hint pdf-embed-fallback">${u.embedHint}</p>` : ""}`;
}

document.addEventListener("DOMContentLoaded", () => {
  renderForeignNationalsPanel("foreign-nationals-update", { embed: false });
  renderForeignNationalsPanel("foreign-nationals-pdf", { embed: true });
});
