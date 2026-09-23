# LinkedIn Tournament

Next.js app for tracking LinkedIn daily-puzzle scores against friends, with
multi-tournament support (custom games/scoring/eligibility per tournament),
email-link sign-in, and a personal history/trends view. Firebase
(Auth + Firestore) on the backend, deployed on Vercel.

`Borg-JK/LinkedInCompetition` holds a frozen snapshot of the original
single-file static dashboard this app replaced — nothing further is ever
built there.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Firebase web app config
npm run dev
```

Firestore security rules live in `firestore.rules`; deploy them with:

```bash
firebase deploy --only firestore:rules --project linkedintournam
```

## Legacy data

The original site's history (Jan–May 2026, scraped from WhatsApp chat
exports) can be migrated into Firestore as a one-time "Legacy Tournament"
via `scripts/migrate-legacy-data.js` — see the usage notes at the top of
that file. `parse_chat.py` / `whatsapp_scraper.py` are kept around only as
the source of that legacy data and as a reference for the real-world
variety of LinkedIn share-text formats; they're not part of the deployed
app.
