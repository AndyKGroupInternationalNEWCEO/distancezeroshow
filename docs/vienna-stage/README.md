# Vienna Piano Stage (Phase 1)

One integrated piano stage at the grand's **original position** in the existing Virtual Space. The studio's own
grand stays exactly where it has always stood. A round lift platform sits flush in the floor under it and raises
grand and platform together. There is no second piano, no annex and no change to the rest of the studio.

Branch `feature/vienna-piano-stage` (worktree `~/DISTANCE-ZERO/virtual-space-vienna`), based on
`feature/3d-studio` @ `9ae0b83`. The tag `backup/virtualspace-live-2026-10-19` marks that base. Nothing has been
pushed, merged or deployed.

## Preview (local only)

```sh
cd ~/DISTANCE-ZERO/virtual-space-vienna
node virtual-studio/vienna/dev-page.mjs          # writes vienna-dev.html from studio.html (generated, not committed)
python3 -m http.server 8130 --bind 127.0.0.1     # any static server
open http://127.0.0.1:8130/vienna-dev.html       # the studio with the stage and its control panel
open http://127.0.0.1:8130/studio.html           # the public page, unchanged
```

- `vienna-dev.html?quality=broadcast`: the fixed 1920 × 1080 picture used for OBS.
- `vienna-dev.html?obs=1`: the OBS browser-source mode. The stage panel is hidden there.

Tests:

```sh
node --test virtual-studio/vienna/lift.test.mjs   # lift controller (7 tests)
node virtual-studio/vienna/e2e.mjs                # whole page in headless Chrome (29 tests), screenshots in test-output/vienna/
```

## Audit summary (Phase 0)

| | |
|---|---|
| Repository | `github.com/AndyKGroupInternationalNEWCEO/distancezeroshow` (one repo, several worktrees) |
| Live Virtual Space | `virtualspace.distancezeroshow.com`, `studio.distancezeroshow.com`, `distancezero-virtualspace-ten.vercel.app` — Vercel project `distancezero-virtualspace`, deployed by hand from `virtualspace/dist/` (built by `virtualspace/build.mjs`, allowlist only) |
| Source | `studio.html` + `virtual-studio/*.js` (three.js 0.170, self-hosted), branch `feature/3d-studio` |
| Website | same repo, branch `main` → Vercel project `distancezeroshow` via GitHub Action |
| Broadcast / OBS / Georgie / guest links | Director Studio in `studio/` (Node server, `broadcast-studio` worktree). Not touched. The Virtual Space page connects to nothing. |
| `distancezero-virtualspace.vercel.app` | not a domain of our Vercel project. It serves an older build (commit `b5a6494`, 12 Oct). Owner unknown, possibly the old account. |

Because the build is an allowlist, `vienna-dev.html` and `virtual-studio/vienna/` can never reach the public Virtual
Space until someone adds them on purpose.

## What changed

New, in `virtual-studio/vienna/`:

| File | Role |
|---|---|
| `layout.js` | Every number: stage centre (worked out from the grand's placement in `set.js`), lift, cameras, rig. No three.js. |
| `lift.js` | Lift controller: states, commands, motion profile. No three.js. |
| `stage.js` | Pit, scissor lift, rams, platform, light rig (drawn), raising the studio's grand. |
| `index.js` | Wiring: cameras P1–P5, lighting modes, cinematic sequence, LED-wall routing, control panel. |
| `dev-page.mjs` | Generates `vienna-dev.html` from `studio.html` (adds the stage, `noindex`). |
| `drawings.mjs` | Generates `docs/vienna-stage/floor-plan.svg` and `section.svg` from `layout.js`. |
| `lift.test.mjs`, `e2e.mjs` | Tests. |

Small changes to existing files. They do nothing unless the stage is loaded, and the public page's behaviour is unchanged (tested):

- `main.js`
  - Optional `extend` hook, called once after the set is built and every frame after the camera moves.
  - Shots marked `free` unlock the orbit limits, and keep them open after dragging away from such a shot.
  - The tally label comes from `VIEWS[...].cam` when present.
  - `solo` can be fractional (`VIEWS[...].solo`), used by the stage shots. The studio's piano shot stays at 1, as before.
- `views.js`: a `flying` getter on the director.
- `set.js`
  - Exports `glow` and `beamMaterial`, and returns `M` (the materials).
  - `lights.piano` exposes the grand's two existing lights.
  - `lights.pianoLift(y)` makes those lights (top light and solo spot, with its beam and lamp) follow the grand up. At `y = 0` nothing changes.
- `.gitignore`: `vienna-dev.html`, `test-output/`.

## Architecture

```
studio.html ──(dev-page.mjs)──▶ vienna-dev.html ── start({ extend: vienna }) ── main.js
                                                            │
       main.js frame: lights ease → studio.update → director.update → controls → ext.update(dt) → composer.render
                                                                                   │
                                     vienna/index.js ── lift.js (state machine, motion)
                                       │                 stage.js (pit, scissor, platform, grand y, drawn rig)
                                       │                 VIEWS.vP1…vP5 (+ studio 'piano' shot) follow the lift
                                       │                 lighting modes → drawn rig + studio piano lights
                                       │                 cinematic sequence
                                       └─ LED wall source: studio programme | feed render target | black
```

Scene additions: one group, `vienna-stage`. It holds the pit, trim, lift (base, 12 scissor arms, pins, 2 rams, top frame),
platform, ring truss and drop pipes, 17 fixtures (body, lens glow, beam), and light pools. The grand is not
reparented: the stage sets `studio.piano.position.y`. The group is hidden whenever the camera cannot see it (frustum
test).

## The lift

- **Mechanism:** a 3-stage floor-mounted scissor (arms 2.4 m, two packs) on the floor of a 0.5 m pit. Two hydraulic
  rams run 0.42–0.90 m, and the rod always stays inside the body (checked over the whole travel). The scissor angle is
  2.3°–31.8°. The platform is Ø 4.4 m in a Ø 4.6 m pit, flush with the floor when down.
- **Travel and motion:** 3.5 m of travel. Cruise speed 0.32 m/s, acceleration and braking 0.18 m/s². A full move
  takes about 13 s.
- **States and commands:**
  - States: `LOWERED`, `RAISING`, `ELEVATED`, `LOWERING`, `STOPPED`.
  - `UP` and `DOWN` move to the end of travel.
  - `STOP` brakes; it never halts dead.
  - `RESET` returns to the bottom from anywhere, braking first and then reversing.
  - A command against a movement already in progress is refused ("press STOP first").
- **Moves with the lift:**
  - The grand and its contact shadow.
  - The studio's piano top light and solo spot.
  - The studio's own piano shot (key 9).
  - Cameras P1–P5.

## Cameras

Positions are in studio metres; "along" and "across" are measured in the grand's own frame (`layout.js`).

| Cam | Name | Position (lift down) | Rides with lift | Lens | Notes |
|---|---|---|---|---|---|
| P1 | Main front 4K | in front of the open lid, (-8.70, 2.2, 5.40) | 75 % | 36° | frontal concert view; clear of studio cameras 1 and 2 |
| P2 | Keyboard top | 0.6 m behind the keys, 2.55 m up | 100 % | 40° | overhead keys, for Piano Sessions and lessons |
| P3 | Side cinematic | behind the pianist, three-quarter | 100 % | 32° | keys, music desk, lid |
| P4 | Lift reveal | studio front, (-0.8, 3.0, 7.2) | stays down, tilts up 50 % | 44° | the whole mechanism and the grand at the top |
| P5 | Elevated tracking | tail side, 3.9 m out | 100 %, lags 1.6 s | 38° | crane-like follow during the rise |

- All five have a slow drift (0.04–0.28 m).
- Cuts from the sequence are instant; buttons fly.
- Dragging the view frees the camera.
- On air, the tally shows `CAM P1`…`CAM P5`.
- While a stage camera is on, the studio dims to 60 % of the piano-solo look.

## Lighting

**Fixture schedule** (all drawn; see Performance below):

| Group | Count | Where | Beam |
|---|---|---|---|
| Perimeter spots S1–S8 | 8 | ring truss r 2.7 m at 7.9 m, on drop pipes from the ceiling | 0.17 rad, warm |
| Moving heads M1–M4 | 4 | 2 m around the centre at 7.75 m | 0.07 rad, patterns: centre / sweep / fast / track |
| Accents A1–A4 | 4 | A1–A2 floor backlights behind the grand, A3–A4 rims at 5.2 m | 0.2 rad, amber or ice |
| Performance spot FS | 1 | front of house (-1.9, 7.6, 3.4) | 0.1 rad, tungsten |
| Under-platform LED | ring | under the platform edge, top edge ring, pit lip ring | glow in the pit, steel picks it up |

**What actually lights the grand:** the studio's two existing piano lights. The warm top light follows the perimeter
group's level and colour. The tungsten solo spot, which casts shadows, follows the performance-spot group. They do
this only while the stage is in use: a stage camera is on, the lift is up or moving, or the sequence is running. At
all other times they stay exactly as the studio sets them.

**Modes:** `WARM PIANO`, `CINEMATIC`, `PERFORMANCE`, `BLACKOUT`, `LIFT REVEAL`. Each sets every group's level and
colour, the haze in the beams and the platform LEDs, and eases between them like a lighting desk.

## Cinematic sequence

`CINEMATIC` runs only from `LOWERED`:

| Time | Step |
|---|---|
| 0 s | lights to `LIFT REVEAL` with the under-light and spot held at 0; cut to P4 |
| 2 s | under-platform light up |
| 3.5 s | lift up |
| 8 s | cut to P5, which follows the rise |
| at `ELEVATED` | performance spot up |
| + 2.5 s | cut to P1, lights to `CINEMATIC` |

- Picking a camera or a lighting mode during the sequence hands that part to the operator; the lift carries on.
- `STOP` or `RESET` cancels the sequence.

## Main LED wall source (signal flow)

```
                    ┌─ studio programme (canvas: idle / cities / presenters / wave / on-air video) ─┐
LED wall emissive ◀─┼─ feed render target ◀── renderer.render(scene, feedCam) @15 fps ◀── P-cam pose  │  "Vienna piano live"
   map              │                                                         ◀── operator camera    │  "Selected camera"
                    └─ black 1×1 texture                                                              │  "Off"
```

- **No picture of a picture:** while the feed renders, the wall shows the studio programme and the mirror floor is
  left out, so there is no feedback loop (tested on every feed render).
- **Later phases:** "Melbourne DJ live" (Phase 2) and "Media / graphics" (Phase 3) are shown but disabled.
- **OBS:** it captures the page's final picture (`?obs=1`) whatever the wall shows.

## Test results

Run on 2026-10-19 in headless Chrome 155 (Metal) on this Mac.

- **Lift controller (node):** 7/7 pass.
- **Browser (e2e):** 29/29 pass:
  - Page start with exactly one grand at `(-5.3, 0, 0.3)` and the platform centred under it.
  - Lift: refusals, speed and acceleration limits, `STOP` braking and holding, `RESET` reversal, mechanism over the whole travel.
  - P1–P5 at their presets and framing the grand (P2: the keys) with the lift down and up. The cameras follow the rise, P5 lags, P4 tilts.
  - Dragging frees the camera.
  - All five lighting modes reach their levels; blackout leaves no stage light on.
  - The stage adds no lights; the light count matches the public page.
  - Cinematic order, cuts and light cues; operator overrides; `STOP` cancels.
  - LED routing for all sources, with no recursion.
  - The studio's views, keys, backstage walk, Piano tab, on-air simulation and tally.
  - The public page is unchanged.

**Performance:** scene render time per frame at `?quality=broadcast` (1920 × 1080), headless, synchronous:

| View | Public page | With stage |
|---|---|---|
| Studio wide | 67.6 ms | 70.2 ms |
| Georgie (stage not in view) | 64.1 ms | 64.6 ms |
| Piano shot | 60.2 ms | 67.1 ms |
| P1 | – | 66.9 ms |
| P1, `PERFORMANCE` | – | 71.3 ms |
| P4, lift up | – | 68.0 ms |

The first build gave the stage seven real three.js lights. It measured 139–173 ms per frame, more than double, even
with the stage out of view. That is why the rig is now drawn. Headless absolute numbers are far below a real browser;
compare only the ratios.

## Remaining issues and next steps

- **Lacquer reads dark:** the grand reads as a near-silhouette in the darker modes; its key light is the studio's top light. A
  third real light (one, not seven) as a soft key from P1's side would help. Cost: about 5–10 % of frame time. Decision for you.
- **Logo in the background:** from P1 with the grand up, the hanging D/0 logo sits behind the bench. It reads as
  branding, but P1 can be moved if you prefer.
- **Moving heads light only the platform:** they have no real light on the grand itself, by design for performance.
- **The Vienna feed costs a render:** "Vienna piano live" on the wall renders the scene a second time (15 fps). Use it
  for the show segments that need it rather than leaving it on.
- **Visual checks so far:** screenshots from headless Chrome only. A check in real Chrome or OBS on the show machine
  is still needed.
- **Not built:** the Melbourne DJ stage (Phase 2) and the routing for "Selected camera" from the Director Studio.
- **GPU rendering:** none used or needed. Everything runs in the browser. A RunPod GPU would help only for offline Blender/Cycles
  renders (stills or loops), not for the live page.
