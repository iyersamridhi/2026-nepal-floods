#!/usr/bin/env python3
"""Test Grok API — run from project root: python3 scripts/test_grok.py"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from grok_client import grok_summarize, load_dotenv


def main():
    load_dotenv()
    out = grok_summarize("Reply with exactly: Grok OK", max_tokens=20)
    if out and "ok" in out.lower():
        print("Grok is ready:", out)
    else:
        print("Unexpected response:", out)
        sys.exit(1)


if __name__ == "__main__":
    main()
