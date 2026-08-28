#!/usr/bin/env bash
# Push to GitHub after: gh auth login
set -euo pipefail
cd "$(dirname "$0")/.."

REPO_NAME="${1:-2026-nepal-floods}"

if ! gh auth status >/dev/null 2>&1; then
  echo "Not logged in. Run: gh auth login"
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "Remote origin already set — pushing..."
  git push -u origin main
else
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push \
    --description "Volunteer routing tool for the Aug 2026 Bhotekoshi / Rasuwa / Gyirong / Trishuli flash floods"
fi

echo ""
echo "Done. Import this repo on Vercel:"
echo "  https://vercel.com/new"
echo "  Framework: Other | Build: (empty) | Output: ."
