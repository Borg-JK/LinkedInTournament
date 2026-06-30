# LinkedIn Tournament

Static dashboard for LinkedIn game tournament results.

## Local Update Flow

1. Scrape WhatsApp Web and update the dashboard:

   ```bash
   .venv/bin/python whatsapp_scraper.py --once
   ```

2. Or scrape, commit, and push in one step:

   ```bash
   ./update_site.sh
   ```

Netlify deploys the `HTML` folder. Raw WhatsApp chat files are intentionally
ignored by git; only generated dashboard data should be published.

If WhatsApp Web shows dates as `MM/DD/YYYY`, set `"date_order": "MDY"` in
`whatsapp_scraper_config.json`. Use `"DMY"` for `DD/MM/YYYY`.
