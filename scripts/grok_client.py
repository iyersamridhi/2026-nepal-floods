"""Shared Grok / xAI client and .env loader."""

from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"


def load_dotenv():
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and v and k not in os.environ:
            os.environ[k] = v


def grok_summarize(prompt: str, max_tokens: int = 300) -> str | None:
    load_dotenv()
    api_key = os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY")
    if not api_key:
        return None

    model = os.environ.get("GROK_MODEL", "grok-3-latest")
    payload = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_tokens": max_tokens,
        }
    ).encode()
    req = urllib.request.Request(
        "https://api.x.ai/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())
        return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"Grok failed: {e}")
        return None


def grok_summarize_official(title: str, body: str, source_url: str) -> str | None:
    prompt = (
        "You summarize official Nepal Bhotekoshi/Rasuwa flood bulletins for families.\n"
        "Rules:\n"
        "- 2-3 factual sentences only\n"
        "- Include aggregate numbers ONLY if explicitly in the text\n"
        "- Do NOT claim named individuals are found or deceased\n"
        "- Do NOT suggest matches between missing persons and bodies\n"
        "- Do not add information not in the source\n\n"
        f"Title: {title}\nSource URL: {source_url}\n\n{body[:6000]}"
    )
    return grok_summarize(prompt)


def grok_summarize_tweet(handle: str, text: str, url: str) -> str | None:
    prompt = (
        "Summarize this tweet from a disaster authority in 1-2 factual sentences.\n"
        "This is NOT official confirmation — preserve uncertainty.\n"
        "Do not add facts not in the tweet. Include @handle.\n\n"
        f"@{handle}\n{url}\n\n{text[:2000]}"
    )
    return grok_summarize(prompt, max_tokens=150)
