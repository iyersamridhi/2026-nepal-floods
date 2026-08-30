const FOUND_LINKS = [
  {
    title: "OPMCM — missing / found persons (official)",
    desc: "Government of Nepal Rasuwa Flood Rescue Portal. Search missing and found reports there — we do not copy names here.",
    href: "https://rescue.opmcm.gov.np/person-lost-found",
  },
  {
    title: "DAO Rasuwa — hospital treatment list (Rasuwa Hospital)",
    desc: "District Administration Office (MoHA) PDF list of flood patients treated at Rasuwa Hospital. Bilingual district site.",
    href: "https://daorasuwa.moha.gov.np/en/page/b-dha-pa-rabha-va-tahara-ka-rasa-va-asa-pata-lma-bhaeka-upaca-ra-va-varanae",
  },
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
    title: "DAO Rasuwa — Bhotekoshi flood notices hub",
    desc: "Official MoHA district hub: rescue notices, missing lists, body collection, hospital details (नेपाली / EN).",
    href: "https://daorasuwa.moha.gov.np/page/bha-ta-ka-sha-b-dha-bha-tha-ra",
  },
  {
    title: "OPMCM Rasuwa Flood Rescue Portal (home)",
    desc: "Official Office of the Prime Minister portal: ask for help, browse help requests, emergency contacts, and more.",
    href: "https://rescue.opmcm.gov.np/",
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
