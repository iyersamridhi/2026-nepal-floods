const ID_TYPES = [
  "",
  "Passport",
  "National ID / citizenship",
  "Driver's license",
  "Aadhaar (India)",
  "Voter ID",
  "Other government ID",
];

const NEED_OPTIONS = [
  { value: "report", label: "Report them missing officially" },
  { value: "search", label: "Check if they've been found / search records" },
  { value: "remains", label: "Check unidentified remains records" },
  { value: "embassy", label: "Embassy / consular help" },
];

const SETU_FORM_URL = "https://setu.ndrrma.gov.np/admin/help.php";

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
    id: "idType",
    label: "Government ID type (if known)",
    required: false,
    type: "select",
    options: ID_TYPES,
  },
  {
    id: "idTypeOther",
    label: "If Other — which government ID?",
    required: false,
    hint: "e.g. residence permit, military ID, birth certificate number",
    showWhen: { field: "idType", value: "Other government ID" },
  },
  {
    id: "idNumber",
    label: "Passport / government ID number",
    required: false,
    hint: "Optional but helps authorities. Leave blank if you do not have it.",
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

let reportMode = "form"; // "form" | "paste"

function validateReport(data) {
  const issues = [];

  if (reportMode === "paste") {
    if (!data.pastedText?.trim() || data.pastedText.trim().length < 40) {
      issues.push("Please paste the text you already prepared (at least a few sentences).");
    }
    if (!data.reporterPhone?.trim() || data.reporterPhone.replace(/\D/g, "").length < 8) {
      issues.push("Please add your phone with country code so authorities can reach you.");
    }
    return issues;
  }

  for (const f of REPORT_FIELDS) {
    if (f.showWhen) {
      const gate = data[f.showWhen.field];
      if (gate !== f.showWhen.value) continue;
      if (!data[f.id]?.trim()) {
        issues.push(`Please add: ${f.label}`);
      }
      continue;
    }
    if (f.required && !data[f.id]?.trim()) {
      issues.push(`Please add: ${f.label}`);
    }
  }
  if (data.reporterPhone && data.reporterPhone.replace(/\D/g, "").length < 8) {
    issues.push("Please add a valid phone number with country code.");
  }
  if (data.idType === "Other government ID" && !data.idTypeOther?.trim()) {
    issues.push("Please explain which government ID (you selected Other).");
  }
  return issues;
}

function buildMessageText(data) {
  if (reportMode === "paste" && data.pastedText?.trim()) {
    return [
      data.pastedText.trim(),
      "",
      "—",
      "Sent via 2026 Nepal Floods (volunteer routing — not an official filing)",
      data.reporterPhone ? `Contact phone: ${data.reporterPhone}` : null,
      data.reporterEmail ? `Contact email: ${data.reporterEmail}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const idLabel =
    data.idType === "Other government ID"
      ? `Other: ${data.idTypeOther || "not specified"}`
      : data.idType;

  const lines = [
    "MISSING PERSON — Bhotekoshi / Rasuwa Flood (Aug 26, 2026)",
    "Prepared via 2026 Nepal Floods (volunteer routing — not an official filing)",
    "",
    `Missing person: ${data.missingName}`,
    data.missingAge ? `Age: ${data.missingAge}` : null,
    data.missingGender ? `Gender: ${data.missingGender}` : null,
    `Nationality: ${data.nationality}`,
    idLabel ? `ID type: ${idLabel}` : null,
    data.idNumber ? `ID / passport number: ${data.idNumber}` : null,
    `Border side: ${data.lastSeenSide}`,
    `Last known location: ${data.lastSeen}`,
    data.lastContact ? `Last contact: ${data.lastContact}` : null,
    data.tourGroup ? `Tour/group/employer: ${data.tourGroup}` : null,
    data.clothing ? `Description: ${data.clothing}` : null,
    data.needs?.length ? `What I need help with: ${data.needs.join("; ")}` : null,
    "",
    `Contact: ${data.reporterName} (${data.reporterRelation})`,
    `Phone: ${data.reporterPhone}`,
    data.reporterEmail ? `Email: ${data.reporterEmail}` : null,
    data.additional ? `\nAdditional info:\n${data.additional}` : null,
    "",
    "Please confirm you received this.",
  ];
  return lines.filter(Boolean).join("\n");
}

function buildWhatsAppPreview(data) {
  const name = data.missingName?.trim() || "a missing person";
  return [
    `Hello — looking for help regarding ${name} (Bhotekoshi flood Aug 26).`,
    data.nationality ? `Nationality: ${data.nationality}` : null,
    data.lastSeenSide ? `Last seen: ${data.lastSeenSide}${data.lastSeen ? ` — ${data.lastSeen}` : ""}` : null,
    `My phone: ${data.reporterPhone}`,
    `I will paste the full details in the next message.`,
  ]
    .filter(Boolean)
    .join("\n");
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

  if (indian || reportMode === "paste") {
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

  if (!nepali || reportMode === "paste") {
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

function fieldVisible(f, data) {
  if (!f.showWhen) return true;
  return data[f.showWhen.field] === f.showWhen.value;
}

function renderForm() {
  const form = document.getElementById("report-form");
  const data = collectFormDataSafe();

  if (reportMode === "paste") {
    form.innerHTML = `
      <div class="alert alert-info">
        Paste the message you already wrote. We will help you send it to SETU, WhatsApp, and email — nothing is uploaded to this website.
      </div>
      <div class="form-group">
        <label for="pastedText">Your message *</label>
        <textarea id="pastedText" name="pastedText" rows="12" placeholder="Paste the full message you already prepared…"></textarea>
      </div>
      <div class="form-group">
        <label for="nationality">Nationality <span class="form-hint">(optional — helps pick the right contacts)</span></label>
        <select id="nationality" name="nationality">
          ${["", "Nepali", "Indian", "Chinese", "American", "Australian", "British", "South Korean", "Bangladeshi", "Pakistani", "Other"]
            .map((o) => `<option value="${o}">${o || "—"}</option>`)
            .join("")}
        </select>
      </div>
      <div class="form-group">
        <label for="lastSeenSide">Which side of the border? <span class="form-hint">(optional)</span></label>
        <select id="lastSeenSide" name="lastSeenSide">
          ${["", "Nepal (Rasuwa / Nuwakot / Trishuli)", "Tibet / China (Gyirong / Kailash)", "Don't know"]
            .map((o) => `<option value="${o}">${o || "—"}</option>`)
            .join("")}
        </select>
      </div>
      <div class="form-group">
        <label for="reporterPhone">Your phone (with country code) *</label>
        <input type="text" id="reporterPhone" name="reporterPhone">
      </div>
      <div class="form-group">
        <label for="reporterEmail">Your email <span class="form-hint">(optional)</span></label>
        <input type="text" id="reporterEmail" name="reporterEmail">
      </div>
      ${renderPhotosNote()}
    `;
    return;
  }

  form.innerHTML =
    REPORT_FIELDS.map((f) => {
      if (!fieldVisible(f, data) && f.showWhen) {
        return `<div class="form-group" id="wrap-${f.id}" hidden>
          <label for="${f.id}">${f.label}${f.required ? " *" : ""}</label>
          <input type="text" id="${f.id}" name="${f.id}">
          ${f.hint ? `<p class="form-hint">${f.hint}</p>` : ""}
        </div>`;
      }
      if (f.type === "textarea") {
        return `<div class="form-group"><label for="${f.id}">${f.label}${f.required ? " *" : ""}</label><textarea id="${f.id}" name="${f.id}"></textarea></div>`;
      }
      if (f.type === "select") {
        return `<div class="form-group"><label for="${f.id}">${f.label}${f.required ? " *" : ""}</label><select id="${f.id}" name="${f.id}">${f.options.map((o) => `<option value="${o}">${o || "—"}</option>`).join("")}</select>${f.hint ? `<p class="form-hint">${f.hint}</p>` : ""}</div>`;
      }
      return `<div class="form-group"><label for="${f.id}">${f.label}${f.required ? " *" : ""}</label><input type="text" id="${f.id}" name="${f.id}">${f.hint ? `<p class="form-hint">${f.hint}</p>` : ""}</div>`;
    }).join("") +
    renderNeedsBlock() +
    renderPhotosNote();

  const idType = document.getElementById("idType");
  if (idType) {
    idType.addEventListener("change", () => {
      const wrap = document.getElementById("wrap-idTypeOther");
      const other = document.getElementById("idTypeOther");
      if (!wrap) return;
      const show = idType.value === "Other government ID";
      wrap.hidden = !show;
      if (!show && other) other.value = "";
    });
  }
}

function renderNeedsBlock() {
  return `
    <div class="form-group">
      <label>What do you need help with right now? <span class="form-hint">(select all that apply)</span></label>
      <div class="checkbox-grid" id="needs-checkboxes">
        ${NEED_OPTIONS.map(
          (o) => `
          <label class="checkbox-option">
            <input type="checkbox" name="needs" value="${o.value}">
            <span>${o.label}</span>
          </label>`
        ).join("")}
      </div>
    </div>`;
}

function renderPhotosNote() {
  return `
    <div class="alert alert-warning" style="margin-top:1rem">
      <strong>Photos &amp; documents:</strong> This site does not upload or store any files.
      After you open WhatsApp, email, or the
      <a href="https://udb.nepalpolice.gov.np/missing" target="_blank" rel="noopener">Nepal Police portal</a>,
      you will need to attach photos / ID scans yourself on those apps.
    </div>`;
}

function collectFormDataSafe() {
  const data = {};
  REPORT_FIELDS.forEach((f) => {
    const el = document.getElementById(f.id);
    data[f.id] = el ? el.value.trim() : "";
  });
  return data;
}

function collectFormData() {
  const data = collectFormDataSafe();
  const pasted = document.getElementById("pastedText");
  data.pastedText = pasted ? pasted.value.trim() : "";

  ["missingName", "nationality", "lastSeenSide", "reporterPhone", "reporterEmail"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) data[id] = el.value.trim();
  });

  data.needs = Array.from(document.querySelectorAll('input[name="needs"]:checked')).map((el) => {
    const opt = NEED_OPTIONS.find((o) => o.value === el.value);
    return opt ? opt.label : el.value;
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

function buildSetuDetails(data) {
  if (reportMode === "paste" && data.pastedText?.trim()) {
    return data.pastedText.trim();
  }

  const idLabel =
    data.idType === "Other government ID"
      ? `Other: ${data.idTypeOther || "not specified"}`
      : data.idType;

  const lines = [
    "Missing person — Bhotekoshi / Rasuwa flood (Aug 26, 2026)",
    data.nationality ? `Nationality: ${data.nationality}` : null,
    data.lastSeenSide ? `Border side: ${data.lastSeenSide}` : null,
    data.lastContact ? `Last contact: ${data.lastContact}` : null,
    data.tourGroup ? `Tour/group/employer: ${data.tourGroup}` : null,
    data.clothing ? `Description: ${data.clothing}` : null,
    idLabel ? `ID type: ${idLabel}` : null,
    data.idNumber ? `ID / passport: ${data.idNumber}` : null,
    data.reporterRelation ? `Relationship: ${data.reporterRelation}` : null,
    data.reporterEmail ? `Email: ${data.reporterEmail}` : null,
    data.additional ? `Additional: ${data.additional}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

function buildSetuFieldGuide(data) {
  // Paste mode: don't re-ask for structured fields — just phone + paste into Details
  if (reportMode === "paste") {
    return [
      {
        setu: "Contact mobile / सम्पर्क फोन",
        value: data.reporterPhone || "",
        required: true,
      },
      {
        setu: "Situation / अवस्था",
        value: "Missing / हराएको",
        required: true,
        hint: "On SETU, tap the Missing chip before submitting.",
      },
      {
        setu: "Details / विवरण",
        value: buildSetuDetails(data),
        required: true,
        multiline: true,
        hint: "Paste your message into this field on SETU.",
      },
    ];
  }

  const fields = [
    { setu: "Your name / नाम", value: data.reporterName || "", required: true },
    { setu: "Contact mobile / सम्पर्क फोन", value: data.reporterPhone || "", required: true },
    { setu: "Person — Name", value: data.missingName || "", required: true },
  ];
  if (data.missingGender) {
    fields.push({ setu: "Person — Gender", value: data.missingGender, required: false });
  }
  if (data.missingAge) {
    fields.push({ setu: "Person — Age", value: data.missingAge, required: false });
  }
  fields.push(
    { setu: "Address / ठेगाना", value: data.lastSeen || "", required: true },
    {
      setu: "Situation / अवस्था",
      value: "Missing / हराएको",
      required: true,
      hint: "On SETU, tap the Missing chip before submitting.",
    },
    { setu: "Details / विवरण", value: buildSetuDetails(data), required: false, multiline: true }
  );
  return fields;
}

function renderSetuOrchestration(data) {
  const fields = buildSetuFieldGuide(data);
  const tibet = (data.lastSeenSide || "").toLowerCase().includes("tibet");

  const pasteHint =
    reportMode === "paste"
      ? "You already have a message — open SETU, tap <strong>Missing</strong>, paste your text into <strong>Details</strong>, and add your phone."
      : "Open SETU and copy each value below into the matching field. We cannot submit for you.";

  return `
    <div class="panel setu-orchestration" style="margin-top:1rem;padding:1rem;border:2px solid var(--nepal-blue)">
      <div class="orchestration-step-label">Step 1 — Official (NDRRMA)</div>
      <h3 style="margin:0.25rem 0 0.5rem">SETU — if you have not filed yet</h3>
      <p class="form-hint">
        ${pasteHint}
        ${tibet ? " Also contact MoFA / your embassy in Step 2 if they were last seen in Tibet/China." : ""}
      </p>
      <div class="btn-group" style="margin:0.75rem 0">
        <a class="btn btn-primary js-setu-open" href="${SETU_FORM_URL}" target="_blank" rel="noopener">Open SETU form →</a>
        <button type="button" class="btn btn-secondary js-setu-copy-all">Copy SETU details</button>
      </div>
      <ol class="setu-field-guide">
        ${fields
          .map(
            (f, i) => `
          <li class="setu-field-row">
            <div class="setu-field-meta">
              <strong>${i + 1}. ${f.setu}</strong>
              ${f.required ? '<span class="setu-required">needed</span>' : ""}
              ${f.hint ? `<p class="form-hint">${f.hint}</p>` : ""}
            </div>
            <pre class="setu-field-value${f.multiline ? " multiline" : ""}">${escapeHtml(f.value)}</pre>
            <button type="button" class="btn btn-secondary btn-sm js-setu-copy" data-field-index="${i}">Copy</button>
          </li>`
          )
          .join("")}
      </ol>
      <p class="form-hint">
        Optional on SETU: <strong>Point on Map</strong>. Photos are not part of SETU — attach them in WhatsApp/email or Nepal Police.
      </p>
    </div>`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSetuCopyAllText(data) {
  const fields = buildSetuFieldGuide(data);
  return fields.map((f) => `${f.setu}\n${f.value}`).join("\n\n");
}

function wireSetuOrchestration(resultPanel, data) {
  const fields = buildSetuFieldGuide(data);

  resultPanel.querySelectorAll(".js-setu-copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const field = fields[Number(btn.dataset.fieldIndex)];
      const ok = await copyText(field ? field.value : "");
      btn.textContent = ok ? "Copied!" : "Copy failed";
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 2000);
    });
  });

  const copyAllBtn = resultPanel.querySelector(".js-setu-copy-all");
  if (copyAllBtn) {
    copyAllBtn.addEventListener("click", async () => {
      const ok = await copyText(buildSetuCopyAllText(data));
      copyAllBtn.textContent = ok ? "Copied!" : "Select and copy manually";
      setTimeout(() => {
        copyAllBtn.textContent = "Copy SETU details";
      }, 2500);
    });
  }

  const openBtn = resultPanel.querySelector(".js-setu-open");
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      // Prefer pasting the Details value for paste mode; otherwise full SETU map
      const details = fields.find((f) => f.setu.startsWith("Details"));
      copyText(details ? details.value : buildSetuCopyAllText(data));
    });
  }
}

function showResults(data) {
  const issues = validateReport(data);
  const resultPanel = document.getElementById("report-result");
  const formPanel = document.getElementById("report-form-panel");

  if (issues.length > 0) {
    resultPanel.innerHTML = `<div class="alert alert-error"><strong>Please complete:</strong><ul>${issues.map((i) => `<li>${i}</li>`).join("")}</ul></div>`;
    resultPanel.style.display = "block";
    return;
  }

  const text = buildMessageText(data);
  const waPreview = buildWhatsAppPreview(data);
  const nameHint = data.missingName?.trim() || "missing person";
  const subject = `Missing person — ${nameHint} — Bhotekoshi flood`;
  const authorities = getAuthoritiesForReport(data);

  resultPanel.innerHTML = `
    <div class="alert alert-info">
      <strong>Next steps</strong> — nothing is sent automatically. Prefer SETU first (top of this page), then WhatsApp/email, then Nepal Police if needed.
    </div>
    ${renderSetuOrchestration(data)}
    <div class="panel" style="margin-top:1rem;padding:1rem">
      <div class="orchestration-step-label">Step 2 — Notify contacts</div>
      <h3 style="margin:0.25rem 0 0.5rem">WhatsApp or email</h3>
      <p class="form-hint">We copy your message, then open WhatsApp with a short intro — you tap Send, then paste the full text. Attach photos yourself after it opens.</p>
    </div>
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
    <div class="panel" style="margin-top:1rem;padding:1rem">
      <div class="orchestration-step-label">Step 3 — Nepal Police</div>
      <h3 style="margin:0.25rem 0 0.5rem">File on the UDB portal</h3>
      <p class="form-hint">Official missing-person database. Attach photos and ID there — this site does not upload files.</p>
      <a class="btn btn-secondary" href="https://udb.nepalpolice.gov.np/missing" target="_blank" rel="noopener">Open Nepal Police portal →</a>
    </div>
    <div class="form-group" style="margin-top:1rem">
      <label>Your message (for WhatsApp / email)</label>
      <textarea readonly rows="12" id="report-text-copy"></textarea>
    </div>
    <button type="button" class="btn btn-secondary" id="btn-copy">Copy message</button>
    <button type="button" class="btn btn-secondary" id="btn-edit" style="margin-left:0.5rem">Go back and edit</button>
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

  wireSetuOrchestration(resultPanel, data);
}

function setMode(mode) {
  reportMode = mode;
  document.querySelectorAll(".mode-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  renderForm();
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("report-form")) return;

  document.querySelectorAll(".mode-tab").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  renderForm();
  applyWizardHandoff();

  document.getElementById("report-form").addEventListener("submit", (e) => {
    e.preventDefault();
    showResults(collectFormData());
    window.scrollTo(0, 0);
  });
});

function applyWizardHandoff() {
  const params = new URLSearchParams(location.search);
  if (params.get("from") !== "wizard") return;

  let handoff = null;
  try {
    handoff = JSON.parse(sessionStorage.getItem("nfh_wizard") || "null");
  } catch (e) {
    return;
  }
  if (!handoff) return;

  const natMap = {
    nepali: "Nepali",
    indian: "Indian",
    foreign: "Other",
    unknown: "",
  };
  const sideMap = {
    nepal: "Nepal (Rasuwa / Nuwakot / Trishuli)",
    tibet: "Tibet / China (Gyirong / Kailash)",
    unknown: "Don't know",
  };

  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el && value) el.value = value;
  };

  setVal("nationality", natMap[handoff.citizenship] || "");
  setVal("lastSeenSide", sideMap[handoff.location] || "");
  if (handoff.tourGroupName) setVal("tourGroup", handoff.tourGroupName);

  if (Array.isArray(handoff.needs)) {
    handoff.needs.forEach((need) => {
      const cb = document.querySelector(`input[name="needs"][value="${need}"]`);
      if (cb) cb.checked = true;
    });
  }

  // Scroll to WhatsApp helper if SETU hero is already visible
  const formPanel = document.getElementById("report-form-panel");
  if (formPanel) {
    const note = document.createElement("div");
    note.className = "alert alert-success";
    note.style.marginBottom = "1rem";
    note.innerHTML =
      "<strong>From Who to contact:</strong> Your answers are pre-filled below. Add the missing person's details, then continue to WhatsApp / email.";
    formPanel.insertBefore(note, formPanel.firstChild);
    formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}