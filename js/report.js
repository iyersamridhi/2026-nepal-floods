const REPORT_FIELDS = [
  { id: "missingName", label: "Missing person's full name", required: true },
  { id: "missingAge", label: "Age", required: false },
  { id: "missingGender", label: "Gender", required: false, type: "select", options: ["", "Male", "Female", "Other"] },
  {
    id: "nationality",
    label: "Nationality",
    required: true,
    type: "select",
    options: ["", "Nepali", "Indian", "Chinese", "American", "Australian", "British", "South Korean", "Bangladeshi", "Pakistani", "Other"],
  },
  {
    id: "lastSeenSide",
    label: "Which side of the border?",
    required: true,
    type: "select",
    options: ["", "Nepal (Rasuwa / Nuwakot / Trishuli)", "Tibet / China (Gyirong / Kailash)", "Don't know"],
  },
  { id: "lastSeen", label: "Last known location (village, hotel, checkpoint, group)", required: true },
  { id: "lastContact", label: "Last contact (date, time, method)", required: false },
  { id: "tourGroup", label: "Tour / pilgrimage / employer group", required: false },
  { id: "clothing", label: "Clothing / distinguishing features", required: false },
  { id: "reporterName", label: "Your name", required: true },
  { id: "reporterRelation", label: "Your relationship to missing person", required: true },
  { id: "reporterPhone", label: "Your phone (with country code)", required: true },
  { id: "reporterEmail", label: "Your email", required: false },
  { id: "additional", label: "Anything else authorities should know", required: false, type: "textarea" },
];

function validateReport(data) {
  const issues = [];
  for (const f of REPORT_FIELDS) {
    if (f.required && !data[f.id]?.trim()) {
      issues.push(`Please add: ${f.label}`);
    }
  }
  if (data.reporterPhone && data.reporterPhone.replace(/\D/g, "").length < 8) {
    issues.push("Please add a valid phone number with country code.");
  }
  return issues;
}

function buildReportText(data) {
  const lines = [
    "MISSING PERSON REPORT — Bhotekoshi / Rasuwa Flood (Aug 26, 2026)",
    "Prepared via 2026 Nepal Floods (volunteer routing — not an official filing)",
    "",
    `Missing person: ${data.missingName}`,
    data.missingAge ? `Age: ${data.missingAge}` : null,
    data.missingGender ? `Gender: ${data.missingGender}` : null,
    `Nationality: ${data.nationality}`,
    `Border side: ${data.lastSeenSide}`,
    `Last known location: ${data.lastSeen}`,
    data.lastContact ? `Last contact: ${data.lastContact}` : null,
    data.tourGroup ? `Tour/group/employer: ${data.tourGroup}` : null,
    data.clothing ? `Description: ${data.clothing}` : null,
    "",
    `Reporter: ${data.reporterName} (${data.reporterRelation})`,
    `Phone: ${data.reporterPhone}`,
    data.reporterEmail ? `Email: ${data.reporterEmail}` : null,
    data.additional ? `\nAdditional info:\n${data.additional}` : null,
    "",
    "Please confirm receipt of this report.",
  ];
  return lines.filter(Boolean).join("\n");
}

function buildWhatsAppPreview(data) {
  return [
    `Hello, missing person report — Bhotekoshi flood Aug 26.`,
    `Name: ${data.missingName}`,
    `Nationality: ${data.nationality}`,
    `Last seen: ${data.lastSeenSide} — ${data.lastSeen}`,
    `Reporter: ${data.reporterName}, ${data.reporterPhone}`,
    `I will paste the full details in the next message.`,
  ].join("\n");
}

function getAuthoritiesForReport(data) {
  const targets = [];
  const seen = new Set();
  const add = (item) => {
    const key = (item.whatsapp || "") + "|" + (item.email || "") + "|" + item.name;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push(item);
  };

  const nat = (data.nationality || "").toLowerCase();
  const tibet = (data.lastSeenSide || "").toLowerCase().includes("tibet");
  const indian = nat.includes("india");
  const nepali = nat.includes("nepal");

  if (indian) {
    add({
      name: "India MEA Special Control Room (Delhi, 24×7)",
      whatsapp: "+919968291988",
      email: "situationroom@mea.gov.in",
      phones: ["+911123088718", "+911123088719"],
    });
    add({
      name: "Embassy of India, Kathmandu (WhatsApp)",
      whatsapp: "+9779851316807",
      email: null,
    });
    if (tibet) {
      add({
        name: "Embassy of India, Beijing (Tibet / China side)",
        whatsapp: "+8618514284905",
        email: null,
      });
    }
  }

  if (!nepali) {
    add({
      name: "Nepal MoFA Emergency Control Room",
      whatsapp: "+9779744441227",
      email: "emergency@mofa.gov.np",
    });
  }

  if (nepali) {
    add({
      name: "NDRRMA (WhatsApp/phone from MEA list)",
      whatsapp: "+9779851320269",
      email: null,
    });
    if (tibet) {
      add({
        name: "Nepal Consulate, Lhasa",
        whatsapp: "+8613549067481",
        email: "cgnlhasa@mofa.gov.np",
      });
      add({
        name: "Nepali Embassy, Beijing",
        whatsapp: "+8618618129217",
        email: "beijing@nepalembassy.org.cn",
      });
    }
  }

  if (nat.includes("chinese") || nat.includes("china")) {
    add({
      name: "Chinese Embassy Nepal — 24h consular",
      whatsapp: null,
      email: "kathmandu@csm.mfa.gov.cn",
      phones: ["+97714531511"],
    });
  }

  return targets;
}

function renderForm() {
  const form = document.getElementById("report-form");
  form.innerHTML = REPORT_FIELDS.map((f) => {
    if (f.type === "textarea") {
      return `<div class="form-group"><label for="${f.id}">${f.label}${f.required ? " *" : ""}</label><textarea id="${f.id}" name="${f.id}"></textarea></div>`;
    }
    if (f.type === "select") {
      return `<div class="form-group"><label for="${f.id}">${f.label}${f.required ? " *" : ""}</label><select id="${f.id}" name="${f.id}">${f.options.map((o) => `<option value="${o}">${o || "—"}</option>`).join("")}</select></div>`;
    }
    return `<div class="form-group"><label for="${f.id}">${f.label}${f.required ? " *" : ""}</label><input type="text" id="${f.id}" name="${f.id}"></div>`;
  }).join("");
}

function collectFormData() {
  const data = {};
  REPORT_FIELDS.forEach((f) => {
    const el = document.getElementById(f.id);
    data[f.id] = el ? el.value.trim() : "";
  });
  return data;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}

function showResults(data) {
  const issues = validateReport(data);
  const resultPanel = document.getElementById("report-result");
  const formPanel = document.getElementById("report-form-panel");

  if (issues.length > 0) {
    resultPanel.innerHTML = `<div class="alert alert-error"><strong>Please complete your report:</strong><ul>${issues.map((i) => `<li>${i}</li>`).join("")}</ul></div>`;
    resultPanel.style.display = "block";
    return;
  }

  const text = buildReportText(data);
  const waPreview = buildWhatsAppPreview(data);
  const subject = `Missing person report — ${data.missingName} — Bhotekoshi flood`;
  const authorities = getAuthoritiesForReport(data);
  const ref = "NFH-" + Date.now().toString(36).toUpperCase();

  resultPanel.innerHTML = `
    <div class="alert alert-success">
      <strong>Report ready (ref: ${ref})</strong><br>
      WhatsApp cannot send automatically. We copy the full report, then open WhatsApp with a short intro — you tap Send, then paste the full text.
    </div>
    <div class="alert alert-info">
      <strong>Also file on the official Nepal Police portal</strong> (this form is only a helper):
      <a href="https://udb.nepalpolice.gov.np/missing" target="_blank" rel="noopener">udb.nepalpolice.gov.np/missing →</a>
    </div>
    <h3>Send your report</h3>
    ${authorities
      .map(
        (a) => `
      <div class="panel" style="margin-top:0.75rem;padding:1rem">
        <strong>${a.name}</strong>
        ${a.phones ? `<p class="form-hint">${a.phones.map((p) => `<a href="tel:${p}">${p}</a>`).join(" · ")}</p>` : ""}
        <div class="btn-group">
          ${a.whatsapp ? `<a class="btn btn-whatsapp js-wa" data-phone="${a.whatsapp}" href="#">Open WhatsApp</a>` : ""}
          ${a.email ? `<a class="btn btn-email" href="${encodeMailto(a.email, subject, text)}">Open Email</a>` : ""}
        </div>
      </div>`
      )
      .join("")}
    <div class="form-group" style="margin-top:1rem">
      <label>Full report (copy this, then paste in WhatsApp)</label>
      <textarea readonly rows="12" id="report-text-copy"></textarea>
    </div>
    <button type="button" class="btn btn-secondary" id="btn-copy">Copy full report</button>
    <button type="button" class="btn btn-secondary" id="btn-edit" style="margin-left:0.5rem">Edit report</button>
  `;

  resultPanel.style.display = "block";
  formPanel.style.display = "none";
  document.getElementById("report-text-copy").value = text;

  document.getElementById("btn-copy").addEventListener("click", async () => {
    const ok = await copyText(text);
    document.getElementById("btn-copy").textContent = ok ? "Copied!" : "Select the text and copy";
  });

  document.getElementById("btn-edit").addEventListener("click", () => {
    resultPanel.style.display = "none";
    formPanel.style.display = "block";
  });

  resultPanel.querySelectorAll(".js-wa").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await copyText(text);
      window.open(encodeWhatsApp(btn.dataset.phone, waPreview), "_blank", "noopener");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("report-form")) return;
  renderForm();

  document.getElementById("report-form").addEventListener("submit", (e) => {
    e.preventDefault();
    showResults(collectFormData());
    window.scrollTo(0, 0);
  });
});
