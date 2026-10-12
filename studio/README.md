# DISTANCE // ZERO Studio — Phase 1

The Director Studio (Andrej, Vienna) and the Host Dashboard (Georgie, Melbourne). It runs **locally on the Vienna broadcast Mac**. It is separate from the public website: nothing in this folder is deployed (`/.vercelignore` excludes it), and the site files are untouched.

## Architecture

```
                         VIENNA MAC
 ┌─────────────────────────────────────────────────────────────────┐
 │  OBS Studio ── WebSocket :4455 (localhost only) ──┐             │
 │     │  Browser source: /overlay (graphics)        │             │
 │     │  Browser source: VDO.Ninja view (Georgie)   ▼             │
 │     │                                      studio server (Node) │
 │     │                         ┌───────────────┴────────────┐    │
 │     │              director listener               guest listener
 │     │              127.0.0.1:4747                  127.0.0.1:4748
 │     │              Director Studio + overlay       Host Dashboard only
 │     │              never tunnelled                       │       │
 └─────┼──────────────────────────────────────────────────┼───────┘
       │ RTMP                                               │ HTTPS tunnel (free)
       ▼                                                    ▼
  YouTube Live                                    Georgie's browser, Melbourne
                                                  + VDO.Ninja tab (P2P video to OBS)
```

- **One small Node server** (`server.js`, only dependency: `ws`). It holds the show state, the private chat, and the only connection to OBS.
- **OBS is never exposed.** Browsers never talk to OBS. The server refuses an OBS address that isn't on this machine.
- **Two listeners, two roles.** The director port answers only on this Mac and rejects anything that arrives through a proxy or tunnel. The guest port serves only the Host Dashboard. Each port accepts only its own access code.
- **Permissions are enforced on the server.** The host role can only ping, chat, mark chat read and report her camera check. Every OBS, rundown, graphics, note and emergency message from her is refused, and the tests check this.
- **Private chat** runs over the same authenticated WebSocket and is stored only in `studio/data/chat.json` on the Vienna Mac (owner-only file permissions). No third-party chat service is involved, and the public website's Supabase chat is not used.
- **Video** goes Melbourne → Vienna peer-to-peer via VDO.Ninja into an OBS Browser source.
- **Graphics** are a transparent `/overlay` page used as an OBS Browser source, in the website's ident style, controlled from the Director Studio.

### Security

| | |
|---|---|
| Access codes | 100-bit random codes in `studio/data/secrets.json` (gitignored, mode 600). `npm run rotate-codes` replaces them and signs everyone out. |
| Sessions | HMAC-signed, HttpOnly, SameSite=Strict cookies, and `Secure` behind HTTPS. |
| Login | Rate-limited, constant-time compare. Code links use `#code=…`, so the code never reaches a server log and is wiped from the address bar. |
| WebSocket | Cookie plus same-origin check (blocks cross-site hijacking). Overlay uses its own key, only on the local director port. |
| Headers | Strict CSP (no inline script, no framing), `no-referrer`, camera/mic only allowed on the host page. |
| OBS password | `studio/.env.local` → `OBS_WEBSOCKET_PASSWORD=…` (gitignored). Never sent to any browser. |

## Quick start

**See [START-HERE.md](START-HERE.md).** Double-click `Start DISTANCE ZERO Studio` (or `npm run studio`). It starts the studio and Georgie's secure link together, opens the Director Studio signed in, and copies Georgie's link to your clipboard. It only connects to OBS and never streams, records or switches scenes.

| Command | What it does |
|---|---|
| `npm run studio` | Studio + Georgie's public link + opens the Director Studio (the normal way) |
| `npm start` | Studio only (local) |
| `npm run tunnel` | Georgie's public link only, for when the studio already runs via `npm start` |
| `npm run codes` / `npm run rotate-codes` | Show the access codes / replace them and sign everyone out |
| `npm test` | 35 end-to-end tests against a mock OBS |

## Rehearsal mode (Phase 3)

- **Start rehearsal** (Rehearsal tab, ⌥4). It sends nothing to OBS. While it runs, the **server refuses to start the YouTube stream or OBS recording**. Stopping stays possible, and so does the emergency "End stream".
- **Board:** Vienna · Melbourne · Georgie camera & mic · Private call · HELP system · Broadcast safety, each PASS / WARNING / FAILED / NOT TESTED.
- **Pre-show check:** eleven checks, each with how it is verified:

| Check | Verified by |
|---|---|
| OBS connection | the studio asks OBS for its version and measures the answer |
| Director Studio / Host Dashboard connection | a round trip from the server to each dashboard (Georgie's through her public link) |
| Georgie's public link | the server fetches it from the internet side |
| Camera / Microphone permission | each person's browser opens the device; the mic must hear a voice |
| Audio playback | each person plays a tone and confirms hearing it |
| Private call connectivity | both browsers report media flowing (route, round trip, frame rate) |
| Screen sharing | the receiving browser reports frames of the shared screen |
| HELP notification test | Georgie's test request reaches Vienna and Andrej presses Seen |
| Broadcast safety | OBS reports not streaming and not recording, while the lock is on |

  Nothing becomes PASS without that verification. A person cannot mark the call, screen sharing or HELP as passed.
- **Report:** at the end you get date, duration, connection interruptions with durations, technical warnings, HELP requests with response times, every check, and outstanding issues. Download it as HTML or JSON from the Reports list. It is text only; **no audio or video is ever recorded**. It's stored in `data/reports/`.

## Reliability and recovery

| Situation | What the studio does |
|---|---|
| Georgie loses internet | Her page retries by itself. An attempt that hangs is abandoned after 6 s, a silent link is detected after 15 s, and "back online" reconnects at once. Vienna gets a notification and a "What to do now" card. |
| The Director Studio disconnects | Same reconnect logic. Georgie is told "Andrej's studio is reconnecting, stay where you are". |
| A tab reloads | Everything is restored from the server. A call in that tab ends cleanly at once. |
| A private call's studio link blips | The call is held for 20 s (the video is peer-to-peer) and re-attaches when the link returns. A call that cannot reconnect ends cleanly with "Call again". |
| The Cloudflare tunnel dies | The launcher restarts it automatically. The studio probes the public address every 15 s, and a new address always triggers "NEW link for Georgie" with a copy button. |
| OBS drops | Notification (critical if it was streaming or recording). The studio reconnects by itself and never restarts a broadcast or changes OBS. |

**Notifications** are short cards, bottom left, one per event. Repeats are merged, and info disappears after a few seconds. Only critical issues and HELP make a sound.

## Demo with Georgie: runbook

**Night before (Vienna):** run `npm test` (should say 29 pass). Keep OBS closed or untouched; the demo doesn't need it.

**Morning, Vienna Mac** (three Terminal windows):
1. `cd ~/distancezeroshow/studio && npm start`. Open the Director link it prints, in Chrome.
2. `npm run tunnel`. It prints **Georgie's private link** (`https://….trycloudflare.com/login#code=…`). Send it to her by Signal or iMessage only. Leave this window open. (Easier: `npm run studio` does steps 1 and 2 in one go.)
3. Put on **headphones**. Call audio plays on this Mac, and speakers would leak into the mic.

**Georgie (Melbourne):** open the link in **Chrome** (Safari also works) on a laptop.
1. **Pre-show check** → *Start check*, then allow camera and microphone.
2. **Show** → *Call Vienna*, or wait for Andrej's call. Accept the browser's camera/mic prompt.
3. If anything is wrong: **HELP**, pick a level, send.

**What to try together:** a call both ways; mute; camera off; *Share screen* both ways; *Move* (⇆) and *Larger* (⤢); a HELP request at each level (Vienna hears a chime, and Critical repeats until *Seen*); *Guide* → "Sound problem"; hang up from each side; closing her tab during a call (the call ends cleanly).

**If the call does not connect** (it stays on "Connecting…" or says "Connection failed"): the two networks block a direct connection. Her dashboard reports this to Vienna automatically. Carry on with talkback and use VDO.Ninja for video (it has its own relay). For a permanent fix, add a TURN relay to `config.json → call.iceServers` (see Costs).

## Talking to Georgie

| | |
|---|---|
| **Remote access** | `npm run tunnel` opens a free Cloudflare quick tunnel to the **host port only** and prints her private link. HTTPS, a sign-in code (100-bit), rate-limited logins, Secure/HttpOnly/SameSite=Strict cookie. The director port refuses tunnelled requests; OBS stays local. Ctrl+C closes it. Every start gives a new address. |
| **Private call** | Video and audio in WebRTC, browser to browser, encrypted (DTLS-SRTP). The studio only relays the set-up between the two signed-in people. Nobody else, not even a second director window, can join or listen. Mic, camera, screen sharing (both ways), larger view, side switch, live quality (route, delay, fps). If the camera is busy it falls back to audio only. Nothing goes into OBS. |
| **HELP** | Georgie's HELP button: **Normal** / **Urgent** / **Critical**, quick picks, optional text, and her diagnostics attached (browser, link delay, network, reconnects, camera/mic check, VDO, call state). Vienna gets a colour-coded banner in every workspace and a chime. Critical repeats until *Seen*. *Seen* and *Resolved* show on her screen, and she can withdraw a request. |
| **Automatic requests** | Raised by her dashboard: very slow link, reconnect after an outage, failed camera check, call that cannot connect, script error. Raised by the studio: her dashboard drops while the stream is live (**Critical**), which closes itself when she's back. Repeats are merged, never a flood. |
| **Guided assistance** | Show Control → *Help & guidance*: push a step-by-step card to her screen (camera, sound, VDO.Ninja, internet, reload, hold, or your own words). She answers *Done, it works* (lands in the chat) or *Still broken* (raises an Urgent request). |

## The interface

**Director Studio** has three workspaces. Switch with the tabs or **⌥1 / ⌥2 / ⌥3**. Each one has its own address (`/#live`, `/#show`, `/#tech`), and the **⧉** button opens the current workspace in a new window, so on show day each can sit on its own screen. One screen is enough for normal operation.

| Workspace | What's on it |
|---|---|
| **Live Control** (main) | PREVIEW and PROGRAM monitors, big **CUT** and **TAKE**, transition choice and duration, the scene bus (your camera shots), the on-air segment with its countdown, microphone mutes with meters, Vienna and Melbourne link lights, and the YouTube stream and recording. Fits one 1440 × 900 screen; best in full-screen browser (⌃⌘F). |
| **Show Control** | On air now with timers, the **editable rundown** (title, kind, minutes, lead, notes, reorder, add, delete), graphics and lower thirds, the jingle/media cart, music now playing plus the played-tonight log, talkback with Georgie, instructions to Georgie, and your private production reminders. |
| **Technical** | OBS diagnostics (latency, CPU, frame rate, render time, dropped frames, bitrate, disk), connections, event log, the full audio mixer with faders, mute and **MIC tagging**, sources in program, emergency controls, and settings (standby scene, overlay URL, VDO.Ninja link). |

**How the switcher works.** Clicking a scene puts it on **preview**, and nothing goes on air until you press CUT or TAKE.
- **TAKE** puts preview on air with the transition you selected.
- **CUT** is always a hard cut. It briefly selects OBS's own Cut transition, switches, then puts your transition back. It finds Cut by its type, so it works with German OBS ("Schnitt").
- **Studio Mode:** if it's off in OBS (your setup today), the studio keeps the preview itself and OBS shows only the program. If you turn Studio Mode on in OBS, the preview becomes OBS's own.

**Monitors** are OBS screenshots of each scene, about 3 a second, only while Live Control is visible. They are for orientation, not full-motion video.

**Keyboard** (press **?** in the studio): 1–9 preview a scene, **C** cut, **T** take, **]** / **[** next / previous segment. Scene and switching keys only work in Live Control and never while you're typing. Go live and End stream always need a hold.

**Georgie's dashboard** has two views:
- **Show:** the big countdown, or the current segment with time remaining; next segment; Andrej's instruction; talkback; now playing; the full running order on request.
- **Pre-show check:** camera preview, mic meter, device choice, checklist, and the VDO.Ninja join link.

She has no broadcast controls, and the server refuses them for her role.

## Local startup

Needs Node 22+ (this Mac has Node 26).

```bash
cd studio
npm install
echo 'OBS_WEBSOCKET_PASSWORD=your-obs-websocket-password' > .env.local
npm start
```

In OBS: **Tools → WebSocket Server Settings** → Enable, keep **Enable Authentication** on, copy the password into `.env.local`. Then:

1. `npm start` prints the **Director Studio** link with your code. Open it in a browser on this Mac.
2. Create a scene called **`STANDBY`** in OBS. This is the emergency cut target; you can change the name in `config.json → emergency.standbyScene`.
3. In OBS add a **Browser source**, 1920 × 1080, with the **OBS overlay** URL that `npm start` prints. Put it on top in your show scenes.
4. Add a second Browser source with the **VDO.Ninja view link**, copied from the Melbourne link panel. Tick *Control audio via OBS*.

`npm run codes` shows the codes again.

### Giving Georgie access (free)

The guest port only listens on `127.0.0.1`. To reach it from Melbourne, use one of these:

- **Quick test, no account:** `brew install cloudflared` then `cloudflared tunnel --url http://127.0.0.1:4748`. Send Georgie `https://<the-printed-name>.trycloudflare.com/login#code=<HOST CODE>` through Signal or iMessage. The address changes on every start, and Cloudflare offers quick tunnels without any uptime guarantee.
- **Show day (recommended):** Tailscale, free personal plan. Both Macs join your tailnet. Set `"guest": {"host": "0.0.0.0"}` in `config.local.json`, or bind it to the Mac's Tailscale IP, and Georgie opens `http://<vienna-mac>:4748`. Nothing is public at all. For camera access in her browser without HTTPS, use `tailscale serve` to give the guest port an HTTPS address.

**Never tunnel port 4747.** The director port refuses tunnelled requests anyway.

## Testing

```bash
cd studio
npm test           # 35 end-to-end tests: real server + real WebSockets + mock OBS (protocol v5 with auth)
```

**Rehearse without OBS:** in one terminal run `npm run mock-obs`, in another `OBS_WEBSOCKET_PASSWORD=mock-password npm start`. You get 8 scenes with moving monitor pictures, German transition names, sources, audio meters, faders, three jingles, stream and record. Don't do this while real OBS is using port 4455.

**With real OBS (manual checklist):**
1. The OBS pill is green and the scenes match the OBS Scenes dock.
2. Click a scene, or press 1–9: it goes to **preview** only, and OBS doesn't change. Press **CUT** (hard cut) or **TAKE** (your transition): OBS follows. After a CUT, the transition in OBS is the same one as before.
3. Toggle a source's visibility; mute and unmute an audio source. The OBS mixer follows, and the meters move.
4. Use **Record**, then stop it. Test **Go live** (hold 1.5 s) only with a YouTube *unlisted* test stream.
5. Emergency: *Cut to standby* goes to `STANDBY`. *Mics off* mutes the sources tagged `MIC`, by default names containing mic, mikro (German OBS), georgie or vdo, set in `emergency.micPattern`. Check that the music source is **not** tagged.
6. Quit OBS: a yellow strip appears and the controls lock. Restart OBS: it reconnects by itself.

**Host Dashboard:** open the host link in a second browser profile, or on another device through the tunnel. Chat both ways and check *Seen*. Take segments, send a note (it flashes on Georgie's side) and run the camera check.

**VDO.Ninja (test separately):** from the Host Dashboard press *Open studio link* and allow camera and mic. In OBS the VDO view Browser source should show Georgie within a few seconds. Check audio sync and echo with headphones on both ends.

## Phase 1: done

- Director Studio: live OBS connection status with auto-reconnect and clear auth/offline errors; scene switching (click, keys 1–9, Studio Mode preview + Take); source visibility in the program scene; audio mixer with live peak meters and mute; stream and recording status with timecode, CPU/FPS/dropped frames/congestion; Go live / End stream with hold-to-confirm.
- Show clock: countdown to the next show, using the website's schedule rule, then a live show clock. Vienna and Melbourne clocks.
- Rundown: current segment, next segment, elapsed / remaining / show over-under, running order with planned Vienna and Melbourne times, take / back / jump / reset, per-segment notes editable and saved.
- Production note to Georgie (flashes on her screen), manual "now playing".
- Emergency: cut to standby (also clears graphics and alerts Georgie), mics off (music untouched), end stream (hold 2 s).
- Graphics: D//0 bug, city clocks, segment ident, lower thirds (Vienna amber / Melbourne ice, presets), rendered by the OBS overlay in the website's ident style.
- Host Dashboard: Melbourne-first clocks, tally (on air / recording), link status with round-trip time, current/next segment and timers, running order (Melbourne times first), Andrej's note, now playing, private chat with read receipts and unread badge, local camera/mic check (preview with rule-of-thirds, mic meter, device choice, resolution warning), pre-show checklist, VDO.Ninja join link. The director sees her checklist status live.
- **Redesign:** three workspaces (Live / Show / Technical), program and preview monitors, a preview bus with CUT and TAKE, transition choice and duration, an editable rundown, jingle cart, played-tracks log, private reminders, volume faders, MIC tagging from the screen, standby scene choice, event log, OBS diagnostics, pop-out windows for more screens, keyboard help, and a simplified two-view host dashboard.
- Security model above, 24 automated tests.

## Not finished (next phases)

- **Phase 3 limits:**
  - When Georgie's internet dies without closing the connection, Vienna may only notice after up to ~30 s: the server's heartbeat is 15 s, plus one missed answer. Her own page notices within 15 s.
  - Camera, mic and playback checks prove the device works in that browser at that moment, not that the same device is chosen in VDO.Ninja.
  - The rehearsal report has no per-minute call-quality graph, only the latest round trip.
  - The launcher copies Georgie's link to the clipboard, so paste it before copying anything else.

- **The Vienna ↔ Melbourne call over two real home networks has not been tried yet.** It's tested between two separate browsers, including Georgie's side over the public tunnel. STUN works from the Vienna network. There's no TURN relay yet, so strict networks (some mobile hotspots, corporate Wi-Fi) may block the call.
- Quick-tunnel addresses change on every start and Cloudflare gives no uptime guarantee for them. For regular shows, use Tailscale or a named tunnel.

- **VDO.Ninja is not end-to-end tested.** The links are generated (stable private stream ID and password) but have not been tried with real cameras. Not yet done: return feed / programme monitor for Georgie, and a view of her feed in the Director Studio.
- **Music information is manual.** There is no link to DJ software (Rekordbox/Serato/Traktor) yet.
- The rundown is still the **sample** until you edit it; it's labelled as such. Each episode can be saved as a **template** (Show → Rundown → Save template) and loaded again later, only while the show clock is stopped. Templates live in `studio/data/rundowns/`.
- Monitors are snapshots (about 3 fps), not live video. Full-motion return would need OBS's virtual camera or NDI.
- Multi-screen is "one workspace per window". The **window layout** (▦ in the top bar) remembers which workspace runs in which window, where and how big; each saved window reopens with its own button, because browsers allow one new window per click. Saved in this browser only.
- No YouTube API integration: no viewer count, no live chat questions feed, no stream health from YouTube's side. OBS stats only.
- No multiple director accounts. (The event log is kept in `data/events.jsonl`, last 200 entries, and comes back after a restart.)
- A new message from Georgie plays one soft tone in the Director Studio, besides the badge and the tab title.
- Phones: Director and Host pages fit an iPhone (390 px) without zooming or sideways scrolling, tested in WebKit (Safari's engine) and Chrome. Desktop and tablet stay the main targets for running a show.

## Costs

Running this costs **€0**: OBS, obs-websocket, VDO.Ninja, YouTube Live, Node and `ws` are all free, and the server runs on hardware you already have.

Costs that could come up later, all optional:
- **Cloudflare named tunnel** with a stable address: free, but it needs the domain's DNS on Cloudflare (currently Vercel). Tailscale's free plan avoids this.
- **YouTube Data API** (viewer count, chat): free within daily quota.
- **VDO.Ninja**: free. A self-hosted TURN relay (a small VPS, about €5/month) only if the peer-to-peer connection fails behind strict networks. Their public relay usually covers this.
- **TURN relay for the private call**: only if a direct call fails between the two homes. Options: Cloudflare Realtime TURN (free tier with an account), Metered's free tier, or the same €5/month VPS running coturn. Add it to `config.json → call.iceServers`; no code change.
- **Cloudflare quick tunnel**: free, no account.
- Hosting the studio in the cloud instead of on the Mac would add cost and isn't needed.
