"""Shared Grok / xAI client and .env loader."""

from __future__ import annotations

import json
import os
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"

_URL_RE = re.compile(r"https?://\S+", re.I)
_TRAILING_LINK_NUDGE = re.compile(
    r"(?is)(?:\n\s*)?(?:"
    r"for the (?:latest )?details,?\s*check the original(?: update)? here:?"
    r"|see the full update here:?"
    r"|check the original page(?: for updates)?:?"
    r"|for the full details,?\s*see the original report here:?"
    r"|check the original page here for contact numbers:?"
    r"|open the (?:post|original|page)(?: for (?:the )?full (?:note|details))?\.?"
    r"|check (?:them|it) at\.?"
    r"|read the original\.?"
    r")\s*$"
)


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


def strip_summary_urls(text: str) -> str:
    """Remove bare URLs and 'see original here' nudges — UI already has Read original."""
    if not text:
        return ""
    cleaned = _URL_RE.sub("", text)
    cleaned = _TRAILING_LINK_NUDGE.sub("", cleaned)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip(" \n\t:–-")


def grok_summarize(prompt: str, max_tokens: int = 300) -> str | None:
    load_dotenv()
    api_key = (
        os.environ.get("XAI_API_KEY")
        or os.environ.get("X_AI")
        or os.environ.get("GROK_API_KEY")
    )
    if not api_key:
        return None

    # Secrets often get pasted with newlines, quotes, or a "Bearer " prefix
    api_key = api_key.strip().strip('"').strip("'")
    if api_key.lower().startswith("bearer "):
        api_key = api_key[7:].strip()
    api_key = "".join(api_key.split())
    if not api_key:
        return None
    os.environ.setdefault("XAI_API_KEY", api_key)

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
        return strip_summary_urls(data["choices"][0]["message"]["content"].strip())
    except Exception as e:
        print(f"Grok failed: {e}")
        return None


def grok_summarize_official(title: str, body: str, source_url: str) -> str | None:
    prompt = (
        "Rewrite this flood update for ordinary readers (families looking for news).\n"
        "Tone: plain and human — not a government press release, not stiff, not salesy.\n"
        "Rules:\n"
        "- 2 short sentences max\n"
        "- Only facts clearly in the text; include numbers only if the source states them\n"
        "- Do not name anyone as found or deceased unless the source does\n"
        "- Do not invent details or sound like you are an official channel\n"
        "- Do NOT include any URL, link, or 'check the original / see full update here' line "
        "(the website already shows a Read original button)\n\n"
        f"Title: {title}\nSource URL (do not paste into the summary): {source_url}\n\n{body[:6000]}"
    )
    return grok_summarize(prompt)


def grok_summarize_tweet(handle: str, text: str, url: str) -> str | None:
    prompt = (
        "Rewrite this authority tweet as a short plain note for families.\n"
        "Tone: calm, human, not bureaucratic. Do not sound like an official bulletin yourself.\n"
        "1-2 sentences. Include @handle. Only use facts from the tweet.\n"
        "If the tweet is just a link or list, say what it points to.\n"
        "Do not add 'this is not official confirmation' boilerplate — keep it simple.\n"
        "Do NOT include any URL or 'open the post' line (the website already links the original).\n\n"
        f"@{handle}\nURL (do not paste): {url}\n\n{text[:2000]}"
    )
    return grok_summarize(prompt, max_tokens=150)
