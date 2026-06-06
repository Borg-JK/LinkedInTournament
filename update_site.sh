#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

.venv/bin/python whatsapp_scraper.py --once

git add \
  HTML/index.html \
  queens_data.json \
  tango_data.json \
  mini_data.json \
  zip_data.json \
  patches_data.json

if git diff --cached --quiet; then
  echo "No website data changes to commit."
  exit 0
fi

git commit -m "Update tournament data"
git push
