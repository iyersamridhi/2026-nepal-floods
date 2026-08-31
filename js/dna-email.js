const DNA_EMAIL_TO = "dnacodis@nepalpolice.gov.np";
const DNA_EMAIL_SUBJECT =
  "DNA profile for comparison - Bhote Koshi / Rasuwa flood unidentified remains";

function dnaFormData(form) {
  const get = (name) => (form.elements[name]?.value || "").trim();
  return {
    missingName: get("missingName"),
    nationality: get("nationality"),
    idDetails: get("idDetails"),
    disappearance: get("disappearance"),
    donorName: get("donorName"),
    relationship: get("relationship"),
    donorPhone: get("donorPhone"),
    labNote: get("labNote"),
  };
}

function validateDnaEmail(data) {
  const issues = [];
  if (!data.missingName) issues.push(t("dnaErrMissingName"));
  if (!data.nationality) issues.push(t("dnaErrNationality"));
  if (!data.idDetails) issues.push(t("dnaErrId"));
  if (!data.donorName) issues.push(t("dnaErrDonor"));
  if (!data.relationship) issues.push(t("dnaErrRelation"));
  return issues;
}

function buildDnaEmailBody(data) {
  const lines = [
    "DNA PROFILE SUBMISSION - Unidentified remains / Bhote Koshi River flood, Rasuwa (26 August 2026)",
    "",
    "Per Nepal Police notice - information for comparison:",
    "",
    `1. Full name of the person concerned: ${data.missingName}`,
    `   Nationality: ${data.nationality}`,
    `2. Passport or identification details: ${data.idDetails}`,
    `3. Date and place of disappearance (if known): ${data.disappearance || "Not known / not provided"}`,
    "4. DNA profiling report from the authorized forensic laboratory: ATTACHED to this email (soft copy).",
    data.labNote ? `   Lab note: ${data.labNote}` : null,
    `5. Relationship between the DNA donor and the missing person: ${data.relationship}`,
    "",
    `DNA donor name: ${data.donorName}`,
    data.donorPhone ? `DNA donor phone: ${data.donorPhone}` : null,
    "",
    "Please confirm receipt and advise next steps.",
    "",
    "- Draft prepared via volunteer site 2026-nepal-floods.vercel.app (not affiliated with Nepal Police).",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

function setDnaStatus(msg, isError) {
  const el = document.getElementById("dna-email-status");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
  el.classList.toggle("form-errors", !!isError);
}

function showDnaErrors(issues) {
  const err = document.getElementById("dna-email-errors");
  if (!err) return false;
  if (issues.length) {
    err.hidden = false;
    err.textContent = issues.join(" ");
    return true;
  }
  err.hidden = true;
  err.textContent = "";
  return false;
}

function syncDnaCta(open) {
  const cta = document.getElementById("dna-email-open-cta");
  if (!cta) return;
  cta.setAttribute("aria-expanded", open ? "true" : "false");
  cta.classList.toggle("is-active", !!open);
}

function openDnaPanel() {
  const panel = document.getElementById("dna-email");
  const card = document.getElementById("dna-priority-alert");
  if (!panel) return;
  panel.open = true;
  syncDnaCta(true);
  (card || panel).scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => {
    document.getElementById("dna-missing-name")?.focus({ preventScroll: true });
  }, 250);
}

function launchDnaEmail(prefer) {
  const form = document.getElementById("dna-email-form");
  if (!form) return;
  const data = dnaFormData(form);
  if (showDnaErrors(validateDnaEmail(data))) {
    setDnaStatus("", false);
    return;
  }
  const body = buildDnaEmailBody(data);
  const result = openEmailClient(DNA_EMAIL_TO, DNA_EMAIL_SUBJECT, body, { prefer });
  result.copyPromise.then((copied) => {
    if (result.method === "gmail") {
      setDnaStatus(
        copied ? t("dnaEmailOpenedGmail") : t("dnaEmailOpenedGmailNoCopy"),
        false
      );
    } else if (result.bodyOmitted) {
      setDnaStatus(copied ? t("dnaEmailOpenedPaste") : t("dnaEmailOpenedPasteNoCopy"), false);
    } else {
      setDnaStatus(copied ? t("dnaEmailOpened") : t("dnaEmailOpenedNoCopy"), false);
    }
  });
}

function initDnaEmailHelper() {
  const form = document.getElementById("dna-email-form");
  const panel = document.getElementById("dna-email");
  if (!form || !panel) return;

  // Start collapsed; only open via Prepare DNA email or deep link
  panel.open = false;
  syncDnaCta(false);
  if (location.hash === "#dna-email") openDnaPanel();

  panel.addEventListener("toggle", () => {
    syncDnaCta(panel.open);
    if (!panel.open && location.hash === "#dna-email") {
      history.replaceState(null, "", location.pathname + location.search);
    }
  });

  document.querySelectorAll('a[href="#dna-email"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      if (panel.open) {
        panel.open = false;
        syncDnaCta(false);
        history.replaceState(null, "", location.pathname + location.search);
        return;
      }
      history.replaceState(null, "", "#dna-email");
      openDnaPanel();
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // Default: native mail on mobile, Gmail compose on desktop (openEmailClient)
    launchDnaEmail(isMobileLike() ? "mailto" : "gmail");
  });

  document.getElementById("dna-email-open")?.addEventListener("click", (e) => {
    e.preventDefault();
    launchDnaEmail(isMobileLike() ? "mailto" : "gmail");
  });

  document.getElementById("dna-email-gmail")?.addEventListener("click", (e) => {
    e.preventDefault();
    launchDnaEmail("gmail");
  });

  document.getElementById("dna-email-mailto")?.addEventListener("click", (e) => {
    e.preventDefault();
    launchDnaEmail("mailto");
  });

  document.getElementById("dna-email-address")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(DNA_EMAIL_TO);
      setDnaStatus(t("dnaEmailAddressCopied"), false);
    } catch {
      setDnaStatus(DNA_EMAIL_TO, false);
    }
    // Also kick a blank compose so the address button actually opens mail
    openEmailClient(DNA_EMAIL_TO, DNA_EMAIL_SUBJECT, "", { prefer: isMobileLike() ? "mailto" : "gmail" });
  });

  document.getElementById("dna-email-copy")?.addEventListener("click", async () => {
    const data = dnaFormData(form);
    if (showDnaErrors(validateDnaEmail(data))) return;
    const text = `${DNA_EMAIL_SUBJECT}\n\nTo: ${DNA_EMAIL_TO}\n\n${buildDnaEmailBody(data)}`;
    try {
      await navigator.clipboard.writeText(text);
      setDnaStatus(t("dnaEmailCopied"), false);
    } catch {
      setDnaStatus(t("dnaEmailCopyFail"), true);
    }
  });
}

document.addEventListener("DOMContentLoaded", initDnaEmailHelper);
