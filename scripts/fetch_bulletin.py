#!/usr/bin/env python3
"""Run official scrapers and refresh bulletin."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    scripts = [
        ROOT / "scripts" / "scrape_official.py",
    ]
    for s in scripts:
        print(f"Running {s.name}...", file=sys.stderr)
        r = subprocess.run([sys.executable, str(s)], cwd=ROOT)
        if r.returncode != 0:
            sys.exit(r.returncode)
    print("Bulletin refresh complete.", file=sys.stderr)


if __name__ == "__main__":
    main()
