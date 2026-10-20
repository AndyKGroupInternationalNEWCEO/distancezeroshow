# DISTANCE // ZERO

Official site. Static, no build step.

- `index.html` — page, styles, script. Edit the `DZ` config block in the script for launch time, live stream, guests, media and episodes.
- `assets/` — key visual, opening video, studio loop, soundtrack.
- `get-featured.html` + `api/get-featured.js` — GET FEATURED artist submissions (Supabase + Resend, own D//0 accounts).
- `data/programme-2027.json` — the 2027 programme; the calendar on the homepage is built from it.
- `api/keep-alive.js`, `api/featured-retention.js` — daily Vercel crons.
- Setup, environment variables and review process: `docs/infrastructure.md`. Tests: `node --test test/*.test.js`.
