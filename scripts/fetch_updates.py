#!/usr/bin/env python3
"""Refresh official updates timestamp and optionally append new entries."""

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPDATES_PATH = ROOT / "data" / "updates.json"

SOURCES = [
    ("NDRRMA", "https://ndrrma.gov.np/np/rescue"),
    ("Nepal Police UDB", "https://udb.nepalpolice.gov.np/missing"),
    ("Nepal MoFA", "https://mofa.gov.np"),
    ("SETU", "https://setu.ndrrma.gov.np"),
]


def check_source(name: str, url: str) -> dict:
    result = subprocess.run(
        ["curl", "-sL", "-o", "/dev/null", "-w", "%{http_code}", url, "-H", "User-Agent: Mozilla/5.0"],
        capture_output=True,
        text=True,
    )
    code = result.stdout.strip()
    return {
        "source": name,
        "sourceUrl": url,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "summary": f"{name} portal is {'online' if code == '200' else 'unreachable (HTTP ' + code + ')'}. Check official site for latest bulletins.",
        "summaryNp": f"{name} पोर्टल {'सञ्चालनमा' if code == '200' else 'अनुपलब्ध'}।",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "httpStatus": code,
    }


def main():
    checks = [check_source(name, url) for name, url in SOURCES]
    existing = []
    if UPDATES_PATH.exists():
        existing = json.loads(UPDATES_PATH.read_text(encoding="utf-8"))

    # Keep curated entries (no checkedAt), prepend health checks
    curated = [u for u in existing if "checkedAt" not in u]
    out = curated + checks

    UPDATES_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated {UPDATES_PATH} with {len(out)} entries", file=sys.stderr)


if __name__ == "__main__":
    main()
