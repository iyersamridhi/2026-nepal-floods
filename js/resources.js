document.addEventListener("DOMContentLoaded", async () => {
  const portals = document.getElementById("resource-portals");
  const twitter = document.getElementById("resource-twitter");
  const contacts = document.getElementById("resource-contacts");
  if (!portals) return;

  const [res, help] = await Promise.all([
    fetch("/data/resources.json").then((r) => r.json()),
    fetch("/data/helplines.json").then((r) => r.json()),
  ]);

  portals.innerHTML = res.portals
    .map(
      (p) => `<li><a href="${p.url}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a>
      <span class="form-hint">${escapeHtml(p.region || "")}</span></li>`
    )
    .join("");

  twitter.innerHTML = res.twitter
    .map((p) => `<li><a href="${p.url}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a></li>`)
    .join("");

  const districtRows = (help.nepalDistricts || [])
    .map((d) => {
      const phones = d.phones || (d.phone ? [d.phone] : []);
      return `<li><strong>${escapeHtml(d.name)}</strong>: ${phones.map((p) => `<a href="tel:${p}">${p}</a>`).join(" · ")}${d.email ? ` · <a href="mailto:${d.email}">${d.email}</a>` : ""}</li>`;
    })
    .join("");

  const embassyRows = (help.embassies || [])
    .map((e) => {
      const phones = e.phones || [];
      return `<li><strong>${escapeHtml(e.country)}</strong>: ${phones.map((p) => `<a href="tel:${p}">${p}</a>`).join(" · ") || "see website"}
        ${e.url ? ` · <a href="${e.url}" target="_blank" rel="noopener">site</a>` : ""}
        ${e.note ? `<div class="form-hint">${escapeHtml(e.note)}</div>` : ""}</li>`;
    })
    .join("");

  const tibetRows = (help.tibetChina || [])
    .map((t) => {
      const phones = t.phones || (t.phone ? [t.phone] : []);
      return `<li><strong>${escapeHtml(t.name)}</strong>: ${phones.map((p) => `<a href="tel:${p}">${p}</a>`).join(" · ")}
        ${t.email ? ` · <a href="mailto:${t.email}">${t.email}</a>` : ""}
        ${t.note ? `<div class="form-hint">${escapeHtml(t.note)}</div>` : ""}</li>`;
    })
    .join("");

  contacts.innerHTML = `
    <h3>India MEA Control Room</h3>
    <ul class="step-list">
      <li>Phones: ${(help.indiaMea.phones || []).map((p) => `<a href="tel:${p}">${p}</a>`).join(" · ")}</li>
      <li>WhatsApp: <a href="${encodeWhatsApp(help.indiaMea.whatsapp[0], "Hello, I need help regarding an Indian national in the Nepal floods.")}">${help.indiaMea.whatsapp[0]}</a></li>
      <li>Email: <a href="mailto:${help.indiaMea.email}">${help.indiaMea.email}</a></li>
      <li><a href="${help.indiaMea.sourceUrl}" target="_blank" rel="noopener">MEA press release (source)</a></li>
    </ul>
    <h3>Nepal districts (from MEA list)</h3>
    <ul class="step-list">${districtRows}</ul>
    <h3>Tibet / China side</h3>
    <ul class="step-list">${tibetRows}</ul>
    <h3>Embassies in Kathmandu</h3>
    <ul class="step-list">${embassyRows}</ul>
  `;
});

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}
