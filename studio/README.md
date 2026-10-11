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
npm test           # 16 end-to-end tests: real server + real WebSockets + mock OBS (protocol v5 with auth)
```

**Rehearse without OBS:** in one terminal run `npm run mock-obs`, in another `OBS_WEBSOCKET_PASSWORD=mock-password npm start`. You get 8 scenes, sources, moving audio meters, stream and record. Don't do this while real OBS is using port 4455.

**With real OBS (manual checklist):**
1. The OBS pill is green and the scenes match the OBS Scenes dock.
2. Click a scene, or press keys 1–9: OBS cuts. Enable Studio Mode in OBS: clicks go to preview, and **T** / *Take* transitions.
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
- Security model above, 16 automated tests.

## Not finished (next phases)

- **VDO.Ninja is not end-to-end tested.** The links are generated (stable private stream ID and password) but have not been tried with real cameras. Not yet done: return feed / programme monitor for Georgie, and a view of her feed in the Director Studio.
- **Music information is manual.** There is no link to DJ software (Rekordbox/Serato/Traktor) yet.
- Rundown editing (add, remove, reorder, durations) is done in `studio/data/rundown.json` + *Reload*. Only notes are editable in the UI. The current rundown is a **sample** and is labelled as such.
- No YouTube API integration: no viewer count, no live chat questions feed, no stream health from YouTube's side. OBS stats only.
- No multiple director accounts and no audit log beyond the server console.
- No audible chat alert. Unread shows as a badge and in the tab title only.
- Phone layout works but is not optimised. Desktop and tablet are the targets.

## Costs

Running this costs **€0**: OBS, obs-websocket, VDO.Ninja, YouTube Live, Node and `ws` are all free, and the server runs on hardware you already have.

Costs that could come up later, all optional:
- **Cloudflare named tunnel** with a stable address: free, but it needs the domain's DNS on Cloudflare (currently Vercel). Tailscale's free plan avoids this.
- **YouTube Data API** (viewer count, chat): free within daily quota.
- **VDO.Ninja**: free. A self-hosted TURN relay (a small VPS, about €5/month) only if the peer-to-peer connection fails behind strict networks. Their public relay usually covers this.
- Hosting the studio in the cloud instead of on the Mac would add cost and isn't needed.
