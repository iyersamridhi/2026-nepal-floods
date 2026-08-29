const SETU_FORM_URL = "https://setu.ndrrma.gov.np/admin/help.php";
const WIZARD_HANDOFF_KEY = "nfh_wizard";

const wizardState = {
  citizenship: null,
  location: null,
  tourGroup: null,
  needs: [],
  tourGroupName: "",
};

const STEPS = ["citizenship", "location", "tourGroup", "need", "result"];

const QUESTIONS = {
  citizenship: {
    title: "Who are you looking for?",
    titleNp: "तपाईं कसलाई खोज्दै हुनुहुन्छ?",
    options: [
      { value: "nepali", label: "Nepali citizen", labelNp: "नेपाली नागरिक" },
      { value: "indian", label: "Indian national", labelNp: "भारतीय नागरिक" },
      { value: "foreign", label: "Other foreign national / tourist", labelNp: "अन्य विदेशी नागरिक / पर्यटक" },
      { value: "unknown", label: "Not sure", labelNp: "थाहा छैन" },
    ],
  },
  location: {
    title: "Where were they last seen?",
    titleNp: "अन्तिम पटक कहाँ देख्नुभयो?",
    options: [
      { value: "nepal", label: "Nepal side (Rasuwa, Nuwakot, Trishuli area)", labelNp: "नेपालतर्फ (रसुवा, नुवाकोट, त्रिशूली)" },
      { value: "tibet", label: "Tibet / China side (Gyirong, Kailash route)", labelNp: "तिब्बत / चीन (ग्यिरुङ, कैलाश)" },
      { value: "unknown", label: "Don't know", labelNp: "थाहा छैन" },
    ],
  },
  tourGroup: {
    title: "Are they part of a tour or pilgrimage group?",
    titleNp: "के उनीहरू कुनै यात्रा वा तीर्थ समूहमा छन्?",
    options: [
      { value: "yes", label: "Yes", labelNp: "हो" },
      { value: "no", label: "No / don't know", labelNp: "होइन / थाहा छैन" },
    ],
  },
  need: {
    title: "What do you need right now?",
    titleNp: "अहिले तपाईंलाई के चाहिन्छ?",
    multi: true,
    hint: "Select all that apply",
    hintNp: "लागू हुने सबै छान्नुहोस्",
    options: [
      { value: "report", label: "Report them missing officially", labelNp: "आधिकारिक रूपमा हराएको रिपोर्ट" },
      { value: "search", label: "Check if they've been found / search records", labelNp: "फेला परेको जाँच / अभिलेख खोज" },
      { value: "remains", label: "Check unidentified remains records", labelNp: "पहिचान नखुलेका शव अभिलेख" },
      { value: "embassy", label: "Embassy / consular help", labelNp: "दूतावास / कन्सुलर सहायता" },
    ],
  },
};

let currentStep = 0;
let helplinesData = null;

async function loadHelplines() {
  const res = await fetch("/data/helplines.json");
  helplinesData = await res.json();
}

function hasNeed(...values) {
  return values.some((v) => wizardState.needs.includes(v));
}

function saveWizardHandoff() {
  try {
    sessionStorage.setItem(
      WIZARD_HANDOFF_KEY,
      JSON.stringify({
        citizenship: wizardState.citizenship,
        location: wizardState.location,
        tourGroup: wizardState.tourGroup,
        tourGroupName: wizardState.tourGroupName,
        needs: wizardState.needs,
      })
    );
  } catch (e) {
    /* ignore */
  }
}

function reportFormUrl() {
  saveWizardHandoff();
  return "/report.html?from=wizard";
}

function getResults() {
  const steps = [];
  const { citizenship, location } = wizardState;
  const formUrl = reportFormUrl();

  if (hasNeed("search", "remains")) {
    steps.push({
      title: "Check official found / rescued lists",
      desc: "We do not copy names or photos. Open the government pages and search there.",
      links: [
        { label: "Go to official found lists", href: "/search.html", primary: true },
        { label: "Nepal Police — Found", href: "https://udb.nepalpolice.gov.np/found" },
        { label: "SETU — request help form", href: SETU_FORM_URL },
      ],
    });
  }

  if (hasNeed("remains")) {
    steps.push({
      title: "Unidentified remains (official)",
      desc: "Only Nepal Police can confirm identification.",
      links: [
        { label: "Unidentified remains — Nepal Police", href: "https://udb.nepalpolice.gov.np/dead-bodies", primary: true },
      ],
    });
  }

  if (hasNeed("report", "embassy") || citizenship === "foreign" || citizenship === "indian") {
    if (citizenship !== "nepali" || location === "tibet") {
      steps.push({
        title: "Nepal Ministry of Foreign Affairs — Emergency Control Room",
        desc: "Central coordination for foreign nationals. Call now, or prepare a full message with details first.",
        phones: ["+9779744441227", "+9779744441228"],
        formFirst: true,
      });
    }
  }

  if (citizenship === "indian") {
    steps.push({
      title: "India MEA Special Control Room (Delhi, 24×7)",
      desc: "For Indian families. Call now, or prepare WhatsApp/email with full details via our form.",
      phones: ["+911123088718", "+911123088719"],
      formFirst: true,
      links: [
        {
          label: "MEA press release",
          href: "https://www.mea.gov.in/press-releases?dtl/41702/Special_Control_Room_in_MEA_for_Nepal_Floods_Situation",
        },
      ],
    });
    steps.push({
      title: "Embassy of India, Kathmandu",
      desc: "+977 9851316807, 9709107500, 9810326117 — call now, or send a prepared message via our form.",
      phones: ["+9779851316807", "+9779709107500", "+9779810326117"],
      formFirst: true,
      links: [{ label: "Indian Embassy website", href: "https://www.indembkathmandu.gov.in" }],
    });
  }

  if (citizenship === "foreign" && hasNeed("embassy")) {
    steps.push({
      title: "Your country's embassy in Kathmandu",
      desc: "Contact your embassy in addition to Nepal MoFA. Fill details first so your message is not blank.",
      links: [{ label: "Prepare message & contacts", href: formUrl, primary: true }],
    });
  }

  if (location === "tibet") {
    steps.push({
      title: "Tibet / Gyirong side",
      desc: "Chinese authorities lead rescue at Gyirong. Families should still notify Nepal MoFA and their own embassy.",
      phones: ["+8613549067481", "+8618618129217", "+8618514284905"],
      formFirst: true,
      links: [
        { label: "Chinese Embassy Nepal (consular)", href: "https://np.china-embassy.gov.cn/eng/lxwm/" },
        { label: "Resources — Tibet contacts", href: "/resources.html" },
      ],
    });
  }

  if (hasNeed("report") || wizardState.needs.length === 0) {
    steps.push({
      title: "SETU — Official missing/rescue request",
      desc: "NDRRMA's official form for the Rasuwa flood. Open SETU directly, or prepare details here first.",
      links: [
        { label: "Open SETU missing form", href: SETU_FORM_URL, primary: true },
        { label: "Prepare details first", href: formUrl },
      ],
    });
    steps.push({
      title: "Nepal Police",
      desc: "Emergency: 100. Also file on the UDB missing-person portal.",
      phones: ["100"],
      links: [
        { label: "Nepal Police UDB portal", href: "https://udb.nepalpolice.gov.np/missing" },
      ],
    });
  }

  if ((citizenship === "nepali" || citizenship === "unknown") && !hasNeed("report") && wizardState.needs.length > 0) {
    steps.push({
      title: "SETU — Request help",
      desc: "Official NDRRMA form for missing / rescue requests.",
      links: [{ label: "Open SETU missing form", href: SETU_FORM_URL, primary: true }],
    });
  }

  return steps;
}

function isOptionSelected(stepKey, value) {
  if (stepKey === "need") return wizardState.needs.includes(value);
  return wizardState[stepKey] === value;
}

function renderStep() {
  const stepKey = STEPS[currentStep];
  const container = document.getElementById("wizard-content");
  const dots = document.getElementById("progress-dots");
  const backBtn = document.getElementById("btn-back");
  const nextBtn = document.getElementById("btn-next");

  dots.innerHTML = STEPS.slice(0, -1)
    .map((_, i) => {
      let cls = "";
      if (i < currentStep) cls = "done";
      if (i === currentStep) cls = "current";
      return `<span class="${cls}"></span>`;
    })
    .join("");

  if (stepKey === "result") {
    renderResults(container);
    backBtn.style.display = "inline-flex";
    nextBtn.style.display = "none";
    return;
  }

  const q = QUESTIONS[stepKey];
  const lang = currentLang;
  const title = lang === "np" ? q.titleNp : q.title;
  const hint = q.multi ? (lang === "np" ? q.hintNp : q.hint) : "";

  container.innerHTML = `
    <h2>${title}</h2>
    ${hint ? `<p class="form-hint">${hint}</p>` : ""}
    <div class="wizard-options" id="options">
      ${q.options
        .map(
          (o) => `
        <button type="button" class="wizard-option ${isOptionSelected(stepKey, o.value) ? "selected" : ""}" data-value="${o.value}">
          ${lang === "np" ? o.labelNp : o.label}
        </button>`
        )
        .join("")}
    </div>
    ${
      stepKey === "tourGroup" && wizardState.tourGroup === "yes"
        ? `
      <div class="form-group">
        <label>Tour / group name (if known)</label>
        <input type="text" id="tour-name" placeholder="e.g. Kailash yatra group, Isha S3" value="${wizardState.tourGroupName}">
      </div>`
        : ""
    }
  `;

  container.querySelectorAll(".wizard-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (q.multi) {
        const val = btn.dataset.value;
        if (wizardState.needs.includes(val)) {
          wizardState.needs = wizardState.needs.filter((v) => v !== val);
          btn.classList.remove("selected");
        } else {
          wizardState.needs.push(val);
          btn.classList.add("selected");
        }
        return;
      }

      container.querySelectorAll(".wizard-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      wizardState[stepKey] = btn.dataset.value;
      if (stepKey === "tourGroup" && btn.dataset.value === "yes") {
        renderStep();
      }
    });
  });

  const tourInput = document.getElementById("tour-name");
  if (tourInput) {
    tourInput.addEventListener("input", (e) => {
      wizardState.tourGroupName = e.target.value;
    });
  }

  backBtn.style.display = currentStep > 0 ? "inline-flex" : "none";
  nextBtn.style.display = "inline-flex";
  nextBtn.textContent = currentStep === STEPS.length - 2 ? "See results" : "Next";
}

function renderResults(container) {
  const steps = getResults();
  const formUrl = reportFormUrl();
  const wantsContact =
    hasNeed("report", "embassy") ||
    wizardState.citizenship === "indian" ||
    wizardState.citizenship === "foreign" ||
    wizardState.needs.length === 0;

  container.innerHTML = `
    <div class="alert alert-warning">
      <strong>Important:</strong> We cannot confirm if your loved one has been found or is safe.
      Only official authorities can provide verified information.
    </div>
    ${
      wantsContact
        ? `
    <div class="panel" style="border:2px solid var(--nepal-blue);padding:1rem;margin-bottom:1rem">
      <div class="orchestration-step-label">Recommended next</div>
      <h3 style="margin:0.25rem 0 0.5rem">Fill details, then send WhatsApp / email</h3>
      <p class="form-hint" style="margin-bottom:0.75rem">
        Your wizard answers will be carried over. Add the missing person's details, then open SETU and message authorities with a complete text — not a blank chat.
      </p>
      <a class="btn btn-primary" href="${formUrl}">Continue to form →</a>
    </div>`
        : ""
    }
    <h2>Your next steps</h2>
    <ol class="step-list">
      ${steps
        .map(
          (s, i) => `
        <li>
          <span class="step-num">${i + 1}</span>
          <strong>${s.title}</strong>
          <p style="margin:0.35rem 0;color:var(--muted);font-size:0.9rem">${s.desc}</p>
          ${
            s.phones
              ? s.phones
                  .map(
                    (p) =>
                      `<div class="contact-block">📞 <a href="tel:${p}">${p}</a>${
                        s.formFirst ? ` · <a href="${formUrl}">Prepare WhatsApp / email →</a>` : ""
                      }</div>`
                  )
                  .join("")
              : ""
          }
          ${
            s.links
              ? `<div class="btn-group">${s.links
                  .map(
                    (l) =>
                      `<a class="btn ${l.primary ? "btn-primary" : "btn-secondary"}" href="${l.href}" ${
                        l.href.startsWith("http") ? 'target="_blank" rel="noopener"' : ""
                      }>${l.label}</a>`
                  )
                  .join("")}</div>`
              : ""
          }
        </li>`
        )
        .join("")}
    </ol>
    <div class="btn-group" style="margin-top:1.5rem">
      <a class="btn btn-primary" href="${formUrl}">Fill details &amp; contact authorities</a>
      <a class="btn btn-secondary" href="/search.html">Check official found lists</a>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("wizard-content")) return;
  await loadHelplines();

  document.getElementById("btn-next").addEventListener("click", () => {
    const stepKey = STEPS[currentStep];
    if (stepKey === "need") {
      if (!wizardState.needs.length) {
        alert("Please select at least one option.");
        return;
      }
    } else if (!wizardState[stepKey] && stepKey !== "result") {
      alert("Please select an option.");
      return;
    }
    currentStep++;
    renderStep();
    window.scrollTo(0, 0);
  });

  document.getElementById("btn-back").addEventListener("click", () => {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    }
  });

  renderStep();
});
