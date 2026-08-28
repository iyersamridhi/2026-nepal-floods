#!/usr/bin/env python3
"""Fetch missing persons from Nepal Police UDB and write data/records.json."""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
PAGES = int(sys.argv[1]) if len(sys.argv) > 1 else 30  # ~600 flood-recent records

DISTRICT_MAP = {
    "रसुवा": "Rasuwa",
    "नुवाकोट": "Nuwakot",
    "चितवन": "Chitwan",
    "धादिङ": "Dhading",
    "गोर्खा": "Gorkha",
    "तनहुँ": "Tanahun",
    "तनहुं": "Tanahun",
    "कास्की": "Kaski",
    "भक्तपुर": "Bhaktapur",
    "काठमाडौं": "Kathmandu",
    "काठमाडौ": "Kathmandu",
    "मोरङ": "Morang",
    "झापा": "Jhapa",
    "सुनसरी": "Sunsari",
    "सिरहा": "Siraha",
    "उदयपुर": "Udayapur",
    "तेह्रथुम": "Terhathum",
    "तेह्थुम": "Tehrathum",
    "ताप्लेजुङ": "Taplejung",
    "स्याङ्जा": "Syangja",
    "बाग्लुङ": "Baglung",
    "रौतहट": "Rautahat",
}

PROVINCE_MAP = {
    "कोशी प्रदेश": "Koshi Province",
    "मधेश प्रदेश": "Madhesh Province",
    "बागमती प्रदेश": "Bagmati Province",
    "गण्डकी प्रदेश": "Gandaki Province",
    "लुम्बिनी प्रदेश": "Lumbini Province",
    "कर्णाली प्रदेश": "Karnali Province",
    "सुदूरपश्चिम प्रदेश": "Sudurpashchim Province",
}

FLOOD_DISTRICTS = {"Rasuwa", "Nuwakot", "Dhading", "Gorkha", "Chitwan", "Tanahun"}


def fetch_page(page: int) -> str:
    url = f"https://udb.nepalpolice.gov.np/missing?page={page}"
    result = subprocess.run(
        ["curl", "-sL", url, "-H", "User-Agent: Mozilla/5.0"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def translate_location(nepali: str) -> str:
    en = nepali
    for np, eng in PROVINCE_MAP.items():
        en = en.replace(np, eng)
    for np, eng in DISTRICT_MAP.items():
        en = en.replace(np, eng)
    return en


def parse_records(html: str) -> list:
    records = []
    chunks = re.split(r"<tr class=", html)
    for chunk in chunks[1:]:
        id_match = re.search(r"missing/(\d+)", chunk)
        if not id_match:
            continue
        record_id = id_match.group(1)

        photo_match = re.search(r"photo/(\d+)", chunk)
        photo_id = photo_match.group(1) if photo_match else record_id

        name_match = re.search(r"नाम:-</b>\s*([^<]+)", chunk)
        age_match = re.search(r"उमेर:-</b>\s*(\d+)", chunk)
        gender_match = re.search(r"लिङ्ग:-</b>\s*([^<]+)", chunk)
        home_match = re.search(
            r"हराएको व्यक्तिको ठेगाना:-</b>(.*?)हराएको ठेगाना:-</b>", chunk, re.DOTALL
        )
        last_seen_match = re.search(
            r"हराएको ठेगाना:-</b>(.*?)हराएको मिति", chunk, re.DOTALL
        )
        date_match = re.search(
            r'convert_date">(\d{4}-\d{2}-\d{2})', chunk
        ) or re.search(r"हराएको मिति\s*:\s*(\d{4}-\d{2}-\d{2})", chunk)

        name = strip_html(name_match.group(1)) if name_match else "Unknown"
        age = age_match.group(1) if age_match else ""
        gender_np = strip_html(gender_match.group(1)) if gender_match else ""
        gender_en = (
            "Male"
            if "पुरुष" in gender_np
            else "Female"
            if "महिला" in gender_np
            else gender_np
        )
        home_np = strip_html(home_match.group(1)) if home_match else ""
        last_seen_np = strip_html(last_seen_match.group(1)) if last_seen_match else ""
        date_missing = date_match.group(1) if date_match else ""

        home_en = translate_location(home_np)
        last_seen_en = translate_location(last_seen_np)

        districts = set()
        for eng in DISTRICT_MAP.values():
            if eng in last_seen_en or eng in home_en:
                districts.add(eng)

        flood_keywords = ("रसुवा", "नुवाकोट", "धादिङ", "गोर्खा", "चितवन", "त्रिशूली", "भोटेकोशी")
        is_flood_area = (
            bool(districts & FLOOD_DISTRICTS)
            or any(k in last_seen_np or k in home_np for k in flood_keywords)
            or (date_missing >= "2026-08-24" if date_missing else False)
        )

        records.append(
            {
                "id": record_id,
                "name": name,
                "nameNp": name,
                "age": age,
                "gender": gender_en,
                "genderNp": gender_np,
                "homeLocationNp": home_np,
                "homeLocationEn": home_en,
                "lastSeenNp": last_seen_np,
                "lastSeenEn": last_seen_en,
                "dateMissing": date_missing,
                "photoUrl": f"https://udb.nepalpolice.gov.np/missing/photo/{photo_id}",
                "officialUrl": f"https://udb.nepalpolice.gov.np/missing/{record_id}",
                "districts": sorted(districts),
                "floodRelated": is_flood_area,
            }
        )
    return records


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    all_records = []
    seen = set()

    for page in range(1, PAGES + 1):
        print(f"Fetching page {page}...", file=sys.stderr)
        html = fetch_page(page)
        page_records = parse_records(html)
        if not page_records:
            break
        for r in page_records:
            if r["id"] not in seen:
                seen.add(r["id"])
                all_records.append(r)

    # Sort: flood-related first, then by date desc
    all_records.sort(
        key=lambda r: (not r["floodRelated"], r["dateMissing"] or "0000", r["name"]),
        reverse=False,
    )
    all_records.sort(key=lambda r: not r["floodRelated"])

    out = {
        "source": "https://udb.nepalpolice.gov.np/missing",
        "fetchedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "count": len(all_records),
        "records": all_records,
    }
    out_path = DATA_DIR / "records.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(all_records)} records to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
