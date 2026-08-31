const DNA_EMAIL_TO = "dnacodis@nepalpolice.gov.np";
const DNA_EMAIL_SUBJECT = "DNA profile for comparison — Bhote Koshi / Rasuwa flood unidentified remains";

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
  if (!data.missingName) issues.push(t("dnaErrMissingName") || "Add the missing person's full name.");
  if (!data.nationality) issues.push(t("dnaErrNationality") || "Add nationality.");
  if (!data.idDetails) issues.push(t("dnaErrId") || "Add passport or ID details.");
  if (!data.donorName) issues.push(t("dnaErrDonor") || "Add your name (DNA donor).");
  if (!data.relationship) issues.push(t("dnaErrRelation") || "Select your relationship (father, mother, son, or daughter).");
  return issues;
}

function buildDnaEmailBody(data) {
  const lines = [
    "DNA PROFILE SUBMISSION — Unidentified remains / Bhote Koshi River flood, Rasuwa (26 August 2026)",
    "",
    "Per Nepal Police notice — information for comparison:",
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
    "— Draft prepared via volunteer site 2026-nepal-floods.vercel.app (not affiliated with Nepal Police).",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

function dnaMailto(data) {
  const body = buildDnaEmailBody(data);
  return `mailto:${DNA_EMAIL_TO}?subject=${encodeURIComponent(DNA_EMAIL_SUBJECT)}&body=${encodeURIComponent(body)}`;
}

function setDnaStatus(msg, isError) {
  const el = document.getElementById("dna-email-status");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
  el.classList.toggle("form-errors", !!isError);
}

function initDnaEmailHelper() {
  const form = document.getElementById("dna-email-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = dnaFormData(form);
    const issues = validateDnaEmail(data);
    const err = document.getElementById("dna-email-errors");
    if (issues.length) {
      if (err) {
        err.hidden = false;
        err.textContent = issues.join(" ");
      }
      setDnaStatus("", false);
      return;
    }
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
    window.location.href = dnaMailto(data);
    setDnaStatus(
      t("dnaEmailOpened") ||
        "Mail app should open with a draft to dnacodis@nepalpolice.gov.np. Attach the DNA profile file before you send.",
      false
    );
  });

  document.getElementById("dna-email-copy")?.addEventListener("click", async () => {
    const data = dnaFormData(form);
    const issues = validateDnaEmail(data);
    const err = document.getElementById("dna-email-errors");
    if (issues.length) {
      if (err) {
        err.hidden = false;
        err.textContent = issues.join(" ");
      }
      return;
    }
    if (err) err.hidden = true;
    const text = `${DNA_EMAIL_SUBJECT}\n\nTo: ${DNA_EMAIL_TO}\n\n${buildDnaEmailBody(data)}`;
    try {
      await navigator.clipboard.writeText(text);
      setDnaStatus(t("dnaEmailCopied") || "Message copied. Paste into email and attach the DNA profile.", false);
    } catch {
      setDnaStatus(t("dnaEmailCopyFail") || "Could not copy — use Open email draft instead.", true);
    }
  });
}

document.addEventListener("DOMContentLoaded", initDnaEmailHelper);
