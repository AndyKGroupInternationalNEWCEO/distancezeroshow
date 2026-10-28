# broadcast.distancezeroshow.com — web Broadcast Studio

Status 28 Oct 2026: **proposal**. Nothing deployed, no DNS change. The studio on the Vienna Mac and Georgie's
Tailscale link stay exactly as they are until each replacement is verified.

## Today (verified 28 Oct)

| Part | Where | Reachable from |
|---|---|---|
| Director (OBS, cameras, GO LIVE) | Mac, `127.0.0.1:4747` | this Mac only; refuses tunnelled requests |
| Host / guest pages | Mac, `127.0.0.1:4748` | internet via Tailscale Funnel `macbook-air-von-andrej.tailff4ac2.ts.net` (only while the launcher runs) |
| OBS WebSocket | Mac, `127.0.0.1:4455` | this Mac only |
| `studio.distancezeroshow.com` | Vercel project `distancezero-virtualspace` | 307 to the Funnel |
| `broadcast.distancezeroshow.com` | IONOS DNS, A `217.160.0.137` (IONOS default) | nothing; no valid HTTPS |

## Stage 1 — temporary, safe entrance (files ready in `studio/web/`)

A static page on Vercel. It asks the studio's public `/healthz` (host port, through the Funnel) whether the Mac is
on, shows **Studio online / Studio offline — live controls unavailable**, and when online opens the existing host
and guest login. It holds no secret, controls nothing, is `noindex`, and its CSP allows a connection to the Funnel
host only. The studio itself is not changed.

Steps (each step needs Andy's go, marked ✋):
1. ✋ New Vercel project `dz-broadcast` in `kneislandrej-1341s-projects` (Hobby, free), root directory `studio/web`,
   no build, Deployment Protection on for previews. Deploy a **preview** only.
2. Test the preview: online (studio running), offline (Funnel host unreachable, e.g. while the launcher is stopped
   outside show time), header and CSP check, Safari + Chrome.
3. ✋ Add the domain `broadcast.distancezeroshow.com` to the project. Back up the IONOS records to
   `shared-assets/dns-backup` first, then change the record at IONOS to the target Vercel shows.
4. Rollback: remove the domain from the project and restore the old IONOS record (from the backup).

`studio.distancezeroshow.com` is not touched.

### Vercel project, prepared (not created)

Andy's decision (28 Oct, final): the old account `kneislandrej-1341` stays unchanged with the website and the
Virtual Space only (no email change, no moves). Marketing Studio and Broadcast go to the separate, new Vercel account
**info@distancezeroshow.com**. No Pro, no other platform. Access: a scoped token of the new account, saved by Andy to
`~/.config/dz/vercel-info.token` (never through chat or git), used with `--token`/`--scope` for these projects only,
so the old account's CLI login stays untouched. Not verified yet: no access to the new account so far.

| Setting | Value |
|---|---|
| Project | `dz-broadcast` in the new info@distancezeroshow.com account |
| Root directory | `studio/web` (only this folder is uploaded: no studio code, no `data/`, no secrets) |
| Framework / build | Other / none; output = the folder itself |
| Config | `studio/web/vercel.json` (CSP, noindex, no-store, frame deny) |
| Environment variables | none |
| Domain | `broadcast.distancezeroshow.com`: added only with Andy's go, then the IONOS record changed (backup first) |
| Deploy | CLI from `studio/web` with the new account's token and scope (`vercel deploy`, preview first); not via GitHub integration or the website's workflow |

**Status: production BLOCKED.** Vercel's Hobby plan is for non-commercial use only, and D//0 shows advertising
and sponsors. The page itself is ready and tested locally (Chrome: online, offline, link to the studio, no CSP errors).

### Stage 2 on Vercel later

The `cloud/` prototype keeps sessions and data in memory and in files. On Vercel it needs: the API routes as
functions, Supabase Auth for the two identities, and Supabase tables + Realtime for plans and the Mac's state
(`BROADCAST-WEB.md` Stage 2). Environment variables then: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (browser),
`SUPABASE_SECRET_KEY` (server only), and the engine's own credential on the Mac only.

## Stage 2 — the target: cloud control, Mac engine

```
 Browser (Andy, Georgie)                 Cloud                                 Vienna Mac
 ───────────────────────     HTTPS      ─────────────────────────────         ───────────────────────────────
 broadcast.distancezeroshow  ─────────▶ Vercel: web app + API routes
   login, planner, playlist            Supabase: Auth, Postgres, Realtime ◀──── engine agent (lib/cloud.js)
   live controls when the                tables: plans, commands,          WSS   outbound only, no open port
   Mac is online                         engine_state, audit_log                 ↓ existing handle() + allow-lists
                                                                                 OBS 127.0.0.1:4455, MIDI, media
```

**Rules**
- The Mac only connects **out** (WebSocket to Supabase Realtime). No port, no OBS endpoint and no Director port is
  ever opened to the internet.
- Every command is checked twice: by the database (RLS: who may insert which command type) and again on the Mac by
  the same allow-lists the studio uses today (director / host / guest). The Mac can always refuse.
- Commands carry an id, the user, a type from a fixed list and an expiry of a few seconds. The engine executes each
  id once and drops expired ones, so nothing replays after a reconnect.
- The engine publishes its state (show, segment, OBS connected, streaming/recording, rehearsal, guest, MIDI devices)
  on change and a heartbeat every few seconds. If the heartbeat is older than ~10 s the web shows **Mac offline**
  and disables every live control; planning stays usable.
- **GO LIVE, stream, recording and emergency end-stream are not cloud commands at first.** Stage 2d may allow them
  only with an arm step done on the Mac itself (like UNLOCK GO LIVE today) plus a confirmation in the browser.
- Every command and its result goes to `audit_log` (who, what, when, accepted/refused).
- The engine's cloud credential lives in `studio/data/secrets.json` (git-ignored), never in the web bundle.

**Sign-in and roles** — Supabase Auth, invitation only (sign-ups off), MFA for Andy:
`director` (Andy: everything the Director does today, except on-air actions until 2d), `host` (Georgie: what
`HOST_ACTIONS` allows today), guests keep the invitation link flow (INVITATION → WAITING ROOM → ADMIT → TAKE ON AIR),
which stays on the Mac.

**Identities (confirmed by Andy, 28 Oct 2026)**

| Person | Studio sign-in | Role in the web studio | Today's studio |
|---|---|---|---|
| Andrej Kneisl | `andrejkneisl@distancezeroshow.com` | `director` — Director, Owner / Administrator | Director on the Mac (local only) |
| Georgie Walker | `georgiewalker@distancezeroshow.com` | `host` — Co-Host | host code, her Tailscale link |
| — | `info@distancezeroshow.com` | **none**: the infrastructure account (Vercel, Supabase), never a studio user | — |

The Stage 2a prototype (`cloud/`) already uses these addresses with generated test passwords (local only). Mail for the
domain is hosted by IONOS (MX `mx00/mx01.ionos.co.uk`, SPF set, DMARC `p=none`). That the two mailboxes exist and
receive mail is **not verified**: no mail has been sent. Before any invitation: Andy confirms both inboxes receive
a test message.

**Sign-in migration (only after Stage 2c is verified)**
1. Supabase Auth: sign-ups off, the two addresses invited (✋ Andy sends/approves), MFA for Andy, no default passwords.
2. The web studio and today's codes run side by side; Georgie keeps her code and Tailscale link.
3. One real rehearsal with Georgie signed in through the web.
4. ✋ Andy decides to retire the host code. Rollback at any point: the codes and the Funnel link were never removed,
   so switching back is turning the web sign-in off.
Guests keep their invitation links; they get no account.

**Video and calls** — camera previews and the Georgie–Andy call stay peer-to-peer/through the existing path in 2a–2c;
pushing video through Realtime would cost bandwidth and is not planned.

**Order**
- 2a: read-only mirror (status, show, segment, playlist) + Show Planner in the cloud (works with the Mac off).
- 2b: non-broadcast controls: playlist, rehearsal start/stop, segment GO **during rehearsal**, camera/light/lift cues.
- 2c: guest management from the web (invite, admit; TAKE ON AIR still confirmed).
- 2d: on-air controls with the arm-on-Mac rule. Georgie's Funnel link is retired only after 2c is verified in a real
  rehearsal.

**Tests** — existing 77 unit tests + Director e2e stay green; new: engine agent with a fake Realtime (commands accepted,
refused by role, expired, duplicated; offline → controls off); RLS tests with two real test accounts + anonymous;
one real-hardware rehearsal (OBS, Arturia, cameras) marked as such.

## Decisions for Andy
- Supabase project for Stage 2: a new D//0 project, or the existing `htqxswxlxgxbehrrorkf` (owner not verified,
  serves the live GET FEATURED).
- Vercel plan: Hobby is for non-commercial use; a commercial show needs Pro (paid, price to be confirmed at the time).
- Account consolidation to info@distancezeroshow.com: Vercel is owned today by kneisl.andrej@icloud.com.
