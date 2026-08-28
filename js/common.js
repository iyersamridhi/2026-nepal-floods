const I18N = {
  en: {
    siteTitle: "2026 Nepal Floods",
    siteSubtitle: "Bhotekoshi · Rasuwa · Gyirong · Trishuli — find the right official channel",
    banner: "This site does not confirm deaths or matches. It helps you find the correct official channel.",
    navHome: "Home",
    navWizard: "Who to contact",
    navSearch: "Check if found",
    navReport: "Report missing",
    navUpdates: "Updates",
    navResources: "Resources",
    homeCard1Title: "Find the right contact",
    homeCard1Desc: "Answer a few questions — we tell you which authority to call or email.",
    homeCard2Title: "Check official found lists",
    homeCard2Desc: "Go to Nepal Police / SETU found and rescued pages — we do not copy photos here.",
    homeCard3Title: "Report someone missing",
    homeCard3Desc: "Fill a form — we help you send it to the right authorities via WhatsApp or email.",
    homeCard4Title: "News & updates",
    homeCard4Desc: "News from official channels and authority Twitter — with citations.",
    updatesSubtitle: "News from official channels and authority social media",
    updatesFilterLabel: "Filter by region",
    tabOfficial: "News from official channels",
    tabTwitter: "Twitter / X",
    officialHint: "Summaries from government websites (e.g. MoFA flash flood updates). Always read the original source.",
    twitterHint: "Posts from NDRRMA, Nepal Police, MoFA, MEA, embassies. Not official confirmation — always check the original post.",
    officialEmpty: "No updates from official channels yet.",
    twitterEmpty: "No authority posts loaded yet. Follow the accounts below for live updates.",
    twitterFollow: "Follow official accounts for live updates",
    updatesResourcesLink: "Helplines & social accounts →",
    footer:
      "Volunteer tool. We route you to official channels. We do not verify missing or deceased status. Confirmations come from Nepal Police, NDRRMA, or your embassy.",
    officialLink: "View official record →",
    floodBadge: "Flood-affected area",
    noResults: "No records match your search.",
    loading: "Loading records…",
  },
  np: {
    siteTitle: "२०२६ नेपाल बाढी",
    siteSubtitle: "भोटेकोशी · रसुवा · ग्यिरोङ · त्रिशुली — सही आधिकारिक सम्पर्क",
    banner: "यो साइटले मृत्यु वा मिलान पुष्टि गर्दैन। यसले तपाईंलाई सही आधिकारिक च्यानलमा पुर्‍याउँछ।",
    navHome: "गृह",
    navWizard: "कसलाई सम्पर्क",
    navSearch: "फेला परेको जाँच",
    navReport: "हराएको रिपोर्ट",
    navUpdates: "अपडेट",
    navResources: "स्रोत",
    homeCard1Title: "सही सम्पर्क खोज्नुहोस्",
    homeCard1Desc: "केही प्रश्नको जवाफ दिनुहोस् — हामी कुन निकायलाई सम्पर्क गर्ने भन्छौं।",
    homeCard2Title: "आधिकारिक फेला परेको सूची",
    homeCard2Desc: "नेपाल प्रहरी / सेतुको आधिकारिक पृष्ठमा जानुहोस् — यहाँ फोटो कपी गर्दैनौं।",
    homeCard3Title: "हराएको व्यक्ति रिपोर्ट",
    homeCard3Desc: "फारम भर्नुहोस् — व्हाट्सएप वा इमेलमार्फत सही निकायमा पठाउन मद्दत।",
    homeCard4Title: "समाचार र अपडेट",
    homeCard4Desc: "आधिकारिक च्यानल र प्राधिकरण ट्विटरबाट — स्रोत सहित।",
    updatesSubtitle: "आधिकारिक च्यानल र सामाजिक सञ्जालका अपडेट",
    updatesFilterLabel: "क्षेत्र अनुसार फिल्टर",
    tabOfficial: "आधिकारिक च्यानलबाट समाचार",
    tabTwitter: "Twitter / X",
    officialHint: "सरकारी वेबसाइटबाट सारांश। मूल स्रोत पढ्नुहोस्।",
    twitterHint: "NDRRMA, नेपाल प्रहरी, MoFA, MEA, दूतावासका पोस्ट। मूल पोस्ट जाँच गर्नुहोस्।",
    officialEmpty: "अहिलेसम्म आधिकारिक अपडेट छैन।",
    twitterEmpty: "अहिलेसम्म प्राधिकरण पोस्ट लोड भएको छैन। तलका खाता फलो गर्नुहोस्।",
    twitterFollow: "प्रत्यक्ष अपडेटका लागि आधिकारिक खाता फलो गर्नुहोस्",
    updatesResourcesLink: "हेल्पलाइन र सामाजिक खाता →",
    footer:
      "स्वयंसेवी उपकरण। हामी तपाईंलाई आधिकारिक च्यानलमा पुर्‍याउँछौं। हामी हराएको वा मृत्यु पुष्टि गर्दैनौं।",
    officialLink: "आधिकारिक अभिलेख हेर्नुहोस् →",
    floodBadge: "बाढी प्रभावित क्षेत्र",
    noResults: "तपाईंको खोजसँग मिल्ने अभिलेख छैन।",
    loading: "अभिलेख लोड हुँदैछ…",
  },
};

let currentLang = localStorage.getItem("lang") || "en";

function t(key) {
  return I18N[currentLang][key] || I18N.en[key] || key;
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem("lang", lang);
  renderNav();
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll(".lang-toggle button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });
  markActiveNav();
}

function initLang() {
  document.querySelectorAll(".lang-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => setLang(btn.dataset.lang));
  });
  setLang(currentLang);
}

function renderNav() {
  const el = document.getElementById("site-nav");
  if (!el) return;
  el.innerHTML = `
    <a href="/" data-page="home" data-i18n="navHome">${t("navHome")}</a>
    <a href="/wizard.html" data-page="wizard" data-i18n="navWizard">${t("navWizard")}</a>
    <a href="/search.html" data-page="search" data-i18n="navSearch">${t("navSearch")}</a>
    <a href="/report.html" data-page="report" data-i18n="navReport">${t("navReport")}</a>
    <a href="/updates.html" data-page="updates" data-i18n="navUpdates">${t("navUpdates")}</a>
    <a href="/resources.html" data-page="resources" data-i18n="navResources">${t("navResources")}</a>
  `;
}

function markActiveNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll(".nav-links a").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === page);
  });
}

function encodeWhatsApp(phone, text) {
  const num = phone.replace(/\D/g, "");
  let msg = text || "";
  if (msg.length > 1200) {
    msg = msg.slice(0, 1150) + "\n\n[Message shortened. Full report is on your clipboard — paste after opening.]";
  }
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

function encodeMailto(email, subject, body) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

document.addEventListener("DOMContentLoaded", () => {
  renderNav();
  initLang();
  markActiveNav();
});
