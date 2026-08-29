const SETU_FORM_URL = "https://setu.ndrrma.gov.np/admin/help.php";

const NAT_OPTIONS = ["", "Nepali", "Indian", "Chinese", "American", "Australian", "British", "South Korean", "Bangladeshi", "Pakistani", "Other"];
const SIDE_OPTIONS = ["", "Nepal (Rasuwa / Nuwakot / Trishuli)", "Tibet / China (Gyirong / Kailash)", "Don't know"];
const GENDER_OPTIONS = ["", "Male", "Female", "Other"];

let reportMode = "form";
let personCount = 1;

function validateReport(data) {
  const issues = [];

  if (reportMode === "paste") {
    if (!data.pastedText?.trim()) issues.push("Please paste your message.");
    if (!data.reporterPhone?.trim() || data.reporterPhone.replace(/\D/g, "").length < 8) {
      issues.push("Please add your phone with country code.");
    }
    return issues;
  }

  if (!data.people?.length || !data.people.some((p) => p.name.trim())) {
    issues.push("Please add at least one person's name.");
  }
  data.people?.forEach((p, i) => {
    if (!p.name.trim()) issues.push(`Person ${i + 1}: add a name.`);
  });
  if (!data.nationality) issues.push("Please select nationality.");
  if (!data.lastSeenSide) issues.push("Please select which side of the border.");
  if (!data.lastSeen?.trim()) issues.push("Please add last known location.");
  if (!data.reporterName?.trim()) issues.push("Please add your name.");
  if (!data.reporterRelation?.trim()) issues.push("Please add your relationship.");
  if (!data.reporterPhone?.trim() || data.reporterPhone.replace(/\D/g, "").length < 8) {
    issues.push("Please add your phone with country code.");
  }
  return issues;
}

function buildMessageText(data) {
  if (reportMode === "paste" && data.pastedText?.trim()) {
    const lines = [data.pastedText.trim()];
    if (data.reporterPhone) lines.push("", `Contact phone: ${data.reporterPhone}`);
    if (data.reporterEmail) lines.push(`Contact email: ${data.reporterEmail}`);
    return lines.join("\n");
  }

  const lines = ["MISSING PERSON — Bhotekoshi / Rasuwa Flood (Aug 26, 2026)", ""];

  data.people.forEach((p, i) => {
    if (data.people.length > 1) lines.push(`— Person ${i + 1} —`);
    lines.push(`Name: ${p.name}`);
    if (p.age) lines.push(`Age: ${p.age}`);
    if (p.gender) lines.push(`Gender: ${p.gender}`);
    if (p.clothing) lines.push(`Description: ${p.clothing}`);
    lines.push("");
  });

  lines.push(`Nationality: ${data.nationality}`);
  lines.push(`Border side: ${data.lastSeenSide}`);
  lines.push(`Last known location: ${data.lastSeen}`);
  if (data.lastContact) lines.push(`Last contact: ${data.lastContact}`);
  if (data.tourGroup) lines.push(`Tour/group/employer: ${data.tourGroup}`);
  lines.push("");
  lines.push(`Contact: ${data.reporterName} (${data.reporterRelation})`);
  lines.push(`Phone: ${data.reporterPhone}`);
  if (data.reporterEmail) lines.push(`Email: ${data.reporterEmail}`);
  if (data.additional) lines.push("", `Additional info:`, data.additional);
  lines.push("", "Please confirm you received this.");
  return lines.filter((l) => l !== null).join("\n");
}

function buildWhatsAppPreview(data) {
  const names = (data.people || []).map((p) => p.name).filter(Boolean);
  const name =
    names.length === 0
      ? "a missing person"
      : names.length === 1
        ? names[0]
        : `${names.length} missing people (${names.slice(0, 2).join(", ")}${names.length > 2 ? "…" : ""})`;
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
    add({ name: "Embassy of India, Kathmandu", whatsapp: "+9779851316807", email: null });
    if (tibet) add({ name: "Embassy of India, Beijing", whatsapp: "+8618514284905", email: null });
  }

  if (!nepali || reportMode === "paste") {
    add({
      name: "Nepal MoFA Emergency Control Room",
      whatsapp: "+9779744441227",
      email: "emergency@mofa.gov.np",
    });
  }

  if (nepali) {
    add({ name: "NDRRMA", whatsapp: "+9779851320269", email: null });
    if (tibet) {
      add({ name: "Nepal Consulate, Lhasa", whatsapp: "+8613549067481", email: "cgnlhasa@mofa.gov.np" });
      add({ name: "Nepali Embassy, Beijing", whatsapp: "+8618618129217", email: "beijing@nepalembassy.org.cn" });
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

function personBlockHtml(index) {
  const n = index + 1;
  return `
    <div class="person-block" data-person-index="${index}">
      <div class="person-block-head">
        <strong>Person ${n}</strong>
        ${index > 0 ? `<button type="button" class="btn-text js-remove-person" data-index="${index}">Remove</button>` : ""}
      </div>
      <div class="form-group">
        <label>Full name *</label>
        <input type="text" class="person-name" name="personName${index}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Age</label>
          <input type="text" class="person-age" name="personAge${index}">
        </div>
        <div class="form-group">
          <label>Gender</label>
          <select class="person-gender" name="personGender${index}">
            ${GENDER_OPTIONS.map((o) => `<option value="${o}">${o || "—"}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Clothing / distinguishing features</label>
        <input type="text" class="person-clothing" name="personClothing${index}">
      </div>
    </div>`;
}

function renderForm() {
  const form = document.getElementById("report-form");
  if (!form) return;

  if (reportMode === "paste") {
    form.innerHTML = `
      <p class="form-hint">Paste the message you already wrote. We’ll open WhatsApp / email with it.</p>
      <div class="form-group">
        <label for="pastedText">Your message *</label>
        <textarea id="pastedText" name="pastedText" rows="10" placeholder="Paste your message…"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="nationality">Nationality</label>
          <select id="nationality" name="nationality">
            ${NAT_OPTIONS.map((o) => `<option value="${o}">${o || "—"}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label for="lastSeenSide">Border side</label>
          <select id="lastSeenSide" name="lastSeenSide">
            ${SIDE_OPTIONS.map((o) => `<option value="${o}">${o || "—"}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label for="reporterPhone">Your phone (with country code) *</label>
        <input type="text" id="reporterPhone" name="reporterPhone">
      </div>
      <div class="form-group">
        <label for="reporterEmail">Your email</label>
        <input type="text" id="reporterEmail" name="reporterEmail">
      </div>
    `;
    return;
  }

  form.innerHTML = `
    <div id="people-list">${Array.from({ length: personCount }, (_, i) => personBlockHtml(i)).join("")}</div>
    <button type="button" class="btn btn-secondary btn-sm" id="btn-add-person">+ Add another person</button>

    <hr class="form-divider">

    <div class="form-row">
      <div class="form-group">
        <label for="nationality">Nationality *</label>
        <select id="nationality" name="nationality">
          ${NAT_OPTIONS.map((o) => `<option value="${o}">${o || "—"}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label for="lastSeenSide">Which side of the border? *</label>
        <select id="lastSeenSide" name="lastSeenSide">
          ${SIDE_OPTIONS.map((o) => `<option value="${o}">${o || "—"}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label for="lastSeen">Last known location *</label>
      <input type="text" id="lastSeen" name="lastSeen" placeholder="Village, hotel, checkpoint, group">
    </div>
    <div class="form-group">
      <label for="lastContact">Last contact (date, time, method)</label>
      <input type="text" id="lastContact" name="lastContact">
    </div>
    <div class="form-group">
      <label for="tourGroup">Tour / pilgrimage / employer group</label>
      <input type="text" id="tourGroup" name="tourGroup">
    </div>

    <hr class="form-divider">

    <div class="form-group">
      <label for="reporterName">Your name *</label>
      <input type="text" id="reporterName" name="reporterName">
    </div>
    <div class="form-group">
      <label for="reporterRelation">Your relationship to them *</label>
      <input type="text" id="reporterRelation" name="reporterRelation" placeholder="e.g. parent, spouse, tour leader">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="reporterPhone">Your phone (with country code) *</label>
        <input type="text" id="reporterPhone" name="reporterPhone">
      </div>
      <div class="form-group">
        <label for="reporterEmail">Your email</label>
        <input type="text" id="reporterEmail" name="reporterEmail">
      </div>
    </div>
    <div class="form-group">
      <label for="additional">Anything else authorities should know</label>
      <textarea id="additional" name="additional" rows="3"></textarea>
    </div>
    <p class="quiet-note">Photos are not uploaded here. Attach them in WhatsApp, email, SETU, or the Nepal Police portal.</p>
  `;

  document.getElementById("btn-add-person")?.addEventListener("click", () => {
    const snapshot = snapshotFormValues();
    personCount += 1;
    renderForm();
    restoreFormValues(snapshot);
    wirePersonRemove();
  });
  wirePersonRemove();
}

function wirePersonRemove() {
  document.querySelectorAll(".js-remove-person").forEach((btn) => {
    btn.addEventListener("click", () => {
      const snapshot = snapshotFormValues();
      const removeIdx = Number(btn.dataset.index);
      snapshot.people.splice(removeIdx, 1);
      personCount = Math.max(1, snapshot.people.length);
      renderForm();
      restoreFormValues(snapshot);
      wirePersonRemove();
    });
  });
}

function snapshotFormValues() {
  return collectFormData();
}

function restoreFormValues(data) {
  if (!data) return;
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  };
  set("pastedText", data.pastedText);
  set("nationality", data.nationality);
  set("lastSeenSide", data.lastSeenSide);
  set("lastSeen", data.lastSeen);
  set("lastContact", data.lastContact);
  set("tourGroup", data.tourGroup);
  set("reporterName", data.reporterName);
  set("reporterRelation", data.reporterRelation);
  set("reporterPhone", data.reporterPhone);
  set("reporterEmail", data.reporterEmail);
  set("additional", data.additional);

  const blocks = document.querySelectorAll(".person-block");
  (data.people || []).forEach((p, i) => {
    const block = blocks[i];
    if (!block) return;
    const name = block.querySelector(".person-name");
    const age = block.querySelector(".person-age");
    const gender = block.querySelector(".person-gender");
    const clothing = block.querySelector(".person-clothing");
    if (name) name.value = p.name || "";
    if (age) age.value = p.age || "";
    if (gender) gender.value = p.gender || "";
    if (clothing) clothing.value = p.clothing || "";
  });
}

function collectFormData() {
  const val = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  };

  const people = [];
  document.querySelectorAll(".person-block").forEach((block) => {
    people.push({
      name: block.querySelector(".person-name")?.value.trim() || "",
      age: block.querySelector(".person-age")?.value.trim() || "",
      gender: block.querySelector(".person-gender")?.value.trim() || "",
      clothing: block.querySelector(".person-clothing")?.value.trim() || "",
    });
  });

  return {
    people,
    pastedText: val("pastedText"),
    nationality: val("nationality"),
    lastSeenSide: val("lastSeenSide"),
    lastSeen: val("lastSeen"),
    lastContact: val("lastContact"),
    tourGroup: val("tourGroup"),
    reporterName: val("reporterName"),
    reporterRelation: val("reporterRelation"),
    reporterPhone: val("reporterPhone"),
    reporterEmail: val("reporterEmail"),
    additional: val("additional"),
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}

function showFormErrors(issues) {
  const el = document.getElementById("form-errors");
  if (!el) return;
  if (!issues.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = `<strong>Please complete:</strong> ${issues.join(" · ")}`;
}

function showResults(data) {
  const issues = validateReport(data);
  const resultPanel = document.getElementById("report-result");
  showFormErrors(issues);
  if (issues.length > 0) {
    resultPanel.hidden = true;
    return;
  }

  const text = buildMessageText(data);
  const waPreview = buildWhatsAppPreview(data);
  const names = (data.people || []).map((p) => p.name).filter(Boolean);
  const nameHint = names[0];
  const subject = nameHint
    ? `Missing person — ${nameHint}${names.length > 1 ? ` (+${names.length - 1})` : ""} — Bhotekoshi flood`
    : `Missing person — Bhotekoshi flood`;
  const authorities = getAuthoritiesForReport(data);

  resultPanel.hidden = false;
  resultPanel.innerHTML = `
    <p class="section-kicker">3 · Send</p>
    <h2 class="section-title">Your message is ready</h2>
    <p class="form-hint">The form above stays open — edit anytime, then prepare again. Nothing is sent automatically.</p>

    <div class="send-actions">
      <a class="btn btn-primary" href="${SETU_FORM_URL}" target="_blank" rel="noopener">Open SETU form →</a>
      <button type="button" class="btn btn-secondary js-setu-copy-msg">Copy message for SETU</button>
      <a class="btn btn-secondary" href="https://udb.nepalpolice.gov.np/missing" target="_blank" rel="noopener">Nepal Police portal</a>
    </div>

    <h3 class="subsection-title">WhatsApp / email</h3>
    <div class="contact-list">
      ${authorities
        .map(
          (a, idx) => `
        <div class="contact-row">
          <div>
            <strong>${a.name}</strong>
            ${a.phones ? `<div class="form-hint">${a.phones.map((p) => `<a href="tel:${p}">${p}</a>`).join(" · ")}</div>` : ""}
            ${a.email ? `<div class="form-hint">${a.email}</div>` : ""}
          </div>
          <div class="btn-group">
            ${a.whatsapp ? `<a class="btn btn-whatsapp js-wa" data-phone="${a.whatsapp}" href="#">WhatsApp</a>` : ""}
            ${
              a.email
                ? `<button type="button" class="btn btn-email js-email" data-email="${a.email}">Open Email</button>
                   <button type="button" class="btn btn-secondary btn-sm js-copy-email" data-email="${a.email}">Copy email</button>`
                : ""
            }
          </div>
        </div>`
        )
        .join("")}
    </div>

    <div class="form-group" style="margin-top:1.25rem">
      <label for="report-text-copy">Message</label>
      <textarea readonly rows="10" id="report-text-copy"></textarea>
    </div>
    <button type="button" class="btn btn-secondary" id="btn-copy">Copy message</button>
  `;

  document.getElementById("report-text-copy").value = text;
  resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });

  document.getElementById("btn-copy").addEventListener("click", async () => {
    const ok = await copyText(text);
    document.getElementById("btn-copy").textContent = ok ? "Copied!" : "Select text and copy";
    setTimeout(() => {
      document.getElementById("btn-copy").textContent = "Copy message";
    }, 2000);
  });

  resultPanel.querySelector(".js-setu-copy-msg")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const ok = await copyText(text);
    btn.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(() => {
      btn.textContent = "Copy message for SETU";
    }, 2000);
  });

  resultPanel.querySelectorAll(".js-wa").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await copyText(text);
      window.open(encodeWhatsApp(btn.dataset.phone, waPreview), "_blank", "noopener");
    });
  });

  resultPanel.querySelectorAll(".js-email").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await openEmailClient(btn.dataset.email, subject, text);
    });
  });

  resultPanel.querySelectorAll(".js-copy-email").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await copyText(btn.dataset.email);
      btn.textContent = ok ? "Copied!" : "Failed";
      setTimeout(() => {
        btn.textContent = "Copy email";
      }, 2000);
    });
  });
}

function setMode(mode) {
  reportMode = mode;
  document.querySelectorAll(".mode-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  if (mode === "form" && personCount < 1) personCount = 1;
  renderForm();
}

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

  const natMap = { nepali: "Nepali", indian: "Indian", foreign: "Other", unknown: "" };
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
  });
});
