# DISTANCE // ZERO — website infrastructure

DISTANCE // ZERO has its **own** Supabase project and its **own** Resend account. Nothing here uses the DJ Andy'K
(`djandyk-lab`) or A.D.A.M. projects or keys.

## Environment variables (Vercel → distancezeroshow → Settings → Environment Variables)

Server-side only. Never put them in HTML/JS, never commit them (`.env*` is git-ignored).

| Name | What | Where it comes from |
|---|---|---|
| `DZ_SUPABASE_URL` | `https://<ref>.supabase.co` | D//0 Supabase → Project Settings → API |
| `DZ_SUPABASE_SECRET_KEY` | secret key (`sb_secret_…`) — server only, used by GET FEATURED | Supabase → API Keys → Secret keys |
| `DZ_SUPABASE_PUBLISHABLE_KEY` | publishable key (`sb_publishable_…`) — keep-alive only | Supabase → API Keys |
| `DZ_RESEND_API_KEY` | Resend API key, permission "Sending access", domain `distancezeroshow.com` | D//0 Resend → API Keys |
| `DZ_MAIL_FROM` | `DISTANCE // ZERO <info@distancezeroshow.com>` | — |
| `DZ_TEAM_EMAIL` | where new submissions and alerts go, e.g. `info@distancezeroshow.com` (comma-separated for several) | — |
| `DZ_IP_HASH_SALT` | random string, e.g. `openssl rand -hex 32` | generate once |
| `CRON_SECRET` | random string, e.g. `openssl rand -hex 32`; Vercel sends it to the cron endpoints | generate once |
| `DZ_ALLOWED_ORIGINS` | optional: extra origins allowed to submit, e.g. a preview URL | — |
| `DZ_REVIEW_URL` | optional: link to the table in the Supabase dashboard, shown in team emails | — |

Without the Supabase/Resend variables the form answers "Submissions are not open yet" and stores nothing.

## Setup order (nothing goes live before step 6)

1. **Supabase**: new project "distance-zero", region EU (Frankfurt or Ireland), Free plan.
   The Free plan allows 2 active projects per organisation — `adam-prod` and `djandyk-lab` are active, so create the
   D//0 project in a **new, separate organisation** (also keeps billing and access apart).
2. Run the migrations in `supabase/migrations/` in order (SQL Editor, or `supabase db push`):
   `…_featured_submissions.sql`, then `…_keepalive.sql`.
3. **Resend** (account info@distancezeroshow.com): Domains → Add `distancezeroshow.com`, region EU.
   Add the DNS records Resend shows (DKIM `resend._domainkey` TXT, plus MX + SPF TXT on the `send` subdomain) at the
   domain's DNS provider. They do not touch the existing mailbox (MX of the root domain stays as it is).
   Optional DMARC: `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:info@distancezeroshow.com`.
   Wait for "Verified", then create an API key with sending access for this domain only.
4. Set the variables above in Vercel for **Preview** first.
5. Test on a preview deployment: one submission with a photo, check the row + photo in Supabase, both emails, and
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<preview>/api/keep-alive`.
6. After approval: set the same variables for **Production**, merge to `main` (deploys via GitHub Actions).

## Crons (vercel.json) — work on Vercel Hobby (once a day)

- `/api/keep-alive` daily 06:00 UTC: runs `dz_keepalive()` with the publishable key so the Free project never
  pauses (it pauses after ~7 days idle). One retry; on failure the run shows as failed in Vercel → Logs / Cron Jobs and an
  alert email goes to `DZ_TEAM_EMAIL`. Last successful ping: table `dz_heartbeat`.
- `/api/featured-retention` daily 04:00 UTC: deletes expired submissions and their photos, clears IP hashes after 30 days.

## Reviewing GET FEATURED submissions

Supabase → Table Editor → `featured_submissions` (sort by `created_at`). Move `status`:
`new → in_review → shortlisted → invited → featured`, or `declined` / `withdrawn`. Add `reviewer` and `review_notes`.
Press photos: Storage → `featured-press` (private). Retention: 12 months; declined/withdrawn 6 months after the decision;
featured 36 months. An artist asking for deletion: delete the row (and photo) by hand right away.

## Programme

Edit `data/programme-2027.json` only (instructions at the top of that file). Dates are generated; buttons appear only once
`watchUrl`, `recordingUrl` or a confirmed `time` + `calendar: true` are filled in.

## Local preview and tests

    node scripts/dev.js --mock       # http://localhost:4321, GET FEATURED against an in-memory Supabase/Resend stand-in
    node scripts/dev.js              # real env vars only (export them in your shell; never commit them)
    node --test test/*.test.js

## Not yet moved

The live chat on the website (`DZ.chat` in index.html) and in the Broadcast Studio (`studio/config.json`) still uses the
DJ Andy'K Supabase project (Realtime only, publishable key, no tables). Moving it means changing both to the new project's
URL + publishable key at the same time — a separate, approved step.
