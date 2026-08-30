const FOUND_LINKS = [
  {
    title: "Injured — currently in Kathmandu hospitals (NDRRMA)",
    desc: "Official NDRRMA list of flood-injured people still under treatment in Kathmandu. We do not copy names here.",
    href: "https://ndrrma.gov.np/np/notice-information",
  },
  {
    title: "Injured — discharged after treatment (NDRRMA)",
    desc: "Official NDRRMA list of flood-injured people discharged from Kathmandu hospitals. We do not copy names here.",
    href: "https://ndrrma.gov.np/np/misc-report",
  },
  {
    title: "Found / unidentified living persons — Nepal Police",
    desc: "Official list of people found. Search there. We do not copy names or photos here.",
    href: "https://udb.nepalpolice.gov.np/found",
  },
  {
    title: "Rescued and missing list — SETU",
    desc: "Government coordination platform (NDRRMA / Department of Roads).",
    href: "https://setu.ndrrma.gov.np",
  },
  {
    title: "NDRRMA rescue portal",
    desc: "National disaster authority updates for this flood.",
    href: "https://ndrrma.gov.np/np/rescue",
  },
  {
    title: "Unidentified remains — Nepal Police (official only)",
    desc: "Sensitive official records. Open only if you need this. Identification is done by police, not this site.",
    href: "https://udb.nepalpolice.gov.np/dead-bodies",
  },
  {
    title: "Missing persons — Nepal Police (to file or search)",
    desc: "If you still need to file a missing report, use the official portal.",
    href: "https://udb.nepalpolice.gov.np/missing",
  },
];

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("found-links");
  if (!list) return;
  list.innerHTML = FOUND_LINKS.map(
    (l) => `
    <a class="action-card" href="${l.href}" target="_blank" rel="noopener">
      <h2>${l.title}</h2>
      <p>${l.desc}</p>
      <p class="form-hint" style="margin-top:0.5rem">Opens official site →</p>
    </a>`
  ).join("");
});
