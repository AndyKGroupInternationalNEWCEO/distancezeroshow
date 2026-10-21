# Vienna Piano Stage → Broadcast Studio: technical handoff

From the Virtual Studio (branch `feature/vienna-piano-stage`, worktree `~/DISTANCE-ZERO/virtual-space-vienna`) to the
Broadcast Studio (worktree `~/DISTANCE-ZERO/broadcast-studio`, `studio/`). Written 2026-10-20, from reading
the Broadcast Studio's code: `lib/stage.js`, `public/static/stage-bridge.js`, `obs-setup.js`, `shows/saturday.json`,
`shows/albums/deep-connections.json`. Nothing in the Broadcast Studio was changed or run.

## How the two connect today

- **The page:** the Broadcast Studio serves the stage page itself, at `/piano-stage/` on the Director port. It
  builds the page in memory from this worktree's `studio.html`, using the same three swaps as
  `virtual-studio/vienna/dev-page.mjs`, and adds `stage-bridge.js` and a clean-picture stylesheet.
- **Always the latest local state:** it reads the worktree directly, committed or not. After a change here,
  **Refresh** the OBS browser source *Piano Stage* to load it.
- **OBS input *Piano Stage*:** `?quality=broadcast&stagekey=…`, 1920 × 1080, 30 fps, with page audio routed into OBS
  (`reroute_audio`). It is never opened with `?obs=1`, which would start the studio's own on-air simulation.
- **Control:** the bridge drives the stage through `window.__studio.ext`, which exists on 127.0.0.1 only. It
  reports the stage's state twice a second.

### The interface the bridge uses (kept stable)

| The bridge calls | What it does |
|---|---|
| `ext.show.playSong({ id, title, album, audio, seconds })` | plays one recording on the show's song slot |
| `ext.showCommand('start' \| 'stop' \| 'restart' \| 'skip' \| 'live' \| 'between' \| 'between-stop' \| 'return-live' \| 'closing' \| 'closing-stop' \| 'closing-restart' \| 'song-stop' \| 'pause')` | the Piano Show |
| `ext.pickCamera('P1' … 'P5')` | the stage cameras |
| `ext.setMode('WARM PIANO' \| 'CINEMATIC' \| 'PERFORMANCE' \| 'BLACKOUT' \| 'LIFT REVEAL')` | lighting |
| `ext.command('up' \| 'down' \| 'stop' \| 'reset')` | the lift |
| `ext.setLiftHold(true \| false)`, reads `ext.liftHold` | LIFT HOLD: the lift stays where it is; the Piano Show plays without moving it (new, 2026-10-21) |
| reads `ext.show.{state, paused, segment, label, clock, time, duration, song, audio}`, `ext.program`, `ext.mode`, `ext.lift.{state, height}`, `ext.keyPlayer.part` | the report |

All of these are unchanged by today's work, and the stage's browser test (Chrome) exercises them.

## Answers

| Question | Status |
|---|---|
| Can the Broadcast Studio take the picture of the newest Piano Stage? | **Yes, by design.** It serves this worktree's current files. Live OBS was not checked from here: do one browser-source refresh and check the picture. |
| Do cameras P1–P5 switch? | **Yes:** the bridge's `cam` command calls `ext.pickCamera`. The stage's own test checks all five, with the lift down and up. |
| Music | The Piano Show's own recordings (opening, theme, between songs, closing) play from the page, and OBS captures them through *Piano Stage*. Songs play only the piano master the Broadcast Studio names: its playlist sends `cmd: 'song'` with `/piano-stage/master/<id>`. |
| Sound and microphone | The microphone on the stage is **visual only, with no audio**. The real host mic is an OBS input: *TALK* opens it and ducks the music −12 dB. Emergency *Mics off* mutes the inputs tagged MIC. |
| OBS | Driven only by the Director Studio (WebSocket 4455, localhost). The page never talks to OBS. |
| Small live host camera | The scene **PIANO STAGE** has *Cam // Andrej* over *Piano Stage* (runbook: "never over the keyboard"). **PIANO STAGE · CLEAN** has no host camera. It is set up in `obs-setup.js` and was not checked here in live OBS. |

## What the Broadcast Studio still lacks

1. **Piano masters:**
   - None of the six Deep Connections piano arrangements (`shared-assets/piano-sessions/deep-connections/02…07-*-piano.wav`) exists yet.
   - So the Saturday playlist's PLAY refuses every track. This is correct, but nothing can be played until they are delivered.
2. **Seek:** done. The bridge has `seek` (checked 2026-10-21 in `public/static/stage-bridge.js`).
3. **A check in real OBS:**
   - Refresh *Piano Stage* and take P1–P5 with the bridge.
   - Run the opening (`start`) and the closing.
   - Check that the page audio reaches the OBS mixer and that the host camera sits clear of the keyboard in PIANO STAGE.
4. **Friday (DJ Sessions):** the Underground DJ Room now exists. What the Broadcast Studio needs for it is in
   [Underground DJ Room: interface for the Broadcast Studio](#underground-dj-room-interface-for-the-broadcast-studio) below.

## What the Virtual Studio provides on its side

- **Stable interface:** the interface above stays as it is. Any change will be announced first.
- **Clean picture:**
  - `.vz` (the stage panel) stays the only stage UI, and the clean stylesheet hides it.
  - Nothing new appears on screen outside the 3D scene.
- **Look:**
  - The page starts in the concert look, which includes the stage's one real key light.
  - `?look=studio` gives the studio look.
- **Show audio:**
  - The four show masters now stream when their segment starts (`preload = metadata`), instead of all loading
    with the page.
  - The audio element is the clock: pause, resume and seek keep picture, lift and keys in step with it.
- **Keys:** the keys move only from an approved piano part (`docs/vienna-stage/SCORE-IMPORT.md`). None exists, so they
  stay still. The bridge never loads one.
- **Public page:**
  - The same stage is public at **https://virtualspace.distancezeroshow.com/piano-stage** for viewing, once deployed.
  - It has no bridge, and `window.__studio` does not exist there.
  - For OBS on show day, use the Broadcast Studio's local `/piano-stage/`, which is the one the bridge can drive.
- **Underground DJ Room:** see the next section.

## Underground DJ Room: interface for the Broadcast Studio

Written 2026-10-21 (branch `feature/vienna-piano-stage`, commit `8c2754f`). Nothing in the Broadcast Studio was
changed. The bridge for these calls is the Broadcast Studio session's to write.

### One page, one picture, one sound

- **The page:** the two-level page carries the studio, the Vienna Piano Stage and the DJ Room together.
  - `stagePage(html, title, { melbourne: true })` in `virtual-studio/vienna/dev-page.mjs` builds it.
  - The Broadcast Studio's `lib/stage.js` today calls `stagePage(html, title)`, which builds the Piano Stage only.
  - **The change:** pass `{ melbourne: true }`. *Piano Stage* stays the one OBS browser source for both stages.
  - Do not add a second browser source of the same page: its Piano Show would play a second copy of the piano audio.
- **Where the controls are:**
  - `window.__studio.ext` is the Piano Stage, unchanged (the table above).
  - `window.__studio.ext.melbourne` is the DJ Room.
- **Sound:**
  - The DJ Room plays **no music**. DJ music is the OBS Music Player (Friday) or the DJ Mixer input.
  - The only sound the DJ Room makes is a quiet mechanical noise while the shaft cover or the monitor arms move.
    It goes out with the page audio (*Piano Stage*). `setSfx(false)` turns it off.

### The calls (`ext.melbourne`)

| Call | What it does |
|---|---|
| `transition('down')` | **DJ TRANSITION:** the booth rides its lift from the studio down into the club, with its own cameras and light. At the bottom: PERFORMANCE, DJ1, then DJ2; the shaft cover closes and the monitor arms come out. |
| `transition('up')` | Arms in, cover open, then the booth rides back up into the studio. |
| `liftCommand('down' \| 'up' \| 'stop' \| 'reset')` | The bare lift. It moves only with the cover open and the arms stowed; otherwise it refuses. |
| `setLiftHold(true \| false)` | **DJ lift hold:** lift, cover and arms stay where they are; a moving lift stops. |
| `coverCommand('close' \| 'open')` | Shaft cover. It closes only over a booth that is down and standing. |
| `armsCommand('deploy' \| 'retract')` | Monitor arms. They come out only with the booth down. |
| `pickCamera('DJ1' … 'DJ6')` | DJ1 master wide · DJ2 front booth · DJ3 side · DJ4 equipment · DJ5 overhead · DJ6 through the glass floor (from the studio). |
| `setAuto(true \| false)` | Automatic camera cuts, every 8 bars of the tempo clock. |
| `setEnv('studio' \| 'djroom')` | The camera back to the main studio, or into the club (`djroom` with the booth up runs the transition). |
| `setMode('OPENING' \| 'PERFORMANCE' \| 'BUILD-UP' \| 'DROP' \| 'BREAKDOWN' \| 'CLOSING' \| 'BLACKOUT')` | Lighting scene. BUILD-UP rises over 16 bars. DROP lands at once with a fog burst and two bars of capped strobe. |
| `setLed('LOGO' \| 'PULSE' \| 'TUNNEL' \| 'WAVES' \| 'TRACK' \| 'OFF')` | The club's LED walls. |
| `lasers(true \| false \| null, level)` | Lasers on, off, or with the scene (`null`); level 0–1. |
| `haze(0…1 \| null)` · `fog(seconds)` · `strobe(0…0.6)` | Steady haze; a fog burst with ground fog; strobe, capped at 0.6 and at most 3 flashes a second. |
| `disco(true \| false \| null, speed)` | D//0 DISCO ZERO mirror ball. |
| `setTrack({ title, artist })` | Track on the LED walls and on the studio wall's live picture. |
| `setTempo(bpm)` | The light's tempo clock (60–200). A playing deck with a BPM sets it by itself. |
| `setShow('live' \| 'break' \| 'ended')` | The DJ show's state. While the wall follows the show: `live` puts the DJ Room on the studio's LED wall; `break` and `ended` give the wall back to the studio. |
| `setWall('djroom' \| 'main' \| 'off')` · `setWallAuto(bool)` · `showOnWall('DJ1'…)` · `setDeskMonitors(bool)` | The studio's LED wall and the presenters' desk monitors upstairs. |
| `setSfx(bool, volume)` | The cover's and arms' mechanical sound. |
| `report()` | Everything above as plain data: lift, cover, arms, mode, camera, wall, gear, and so on. Send it twice a second, like the Piano Stage report. |

Studio views on the two-level page (through `director.go(name)`):
- `floor`: behind camera 3, now clear of the booth.
- `djwide`: the booth, the studio and the audience floor.

### The gear: data only (`ext.melbourne`)

The decks, mixer, meters and mic move **only** on what the Broadcast Studio sends. Without data they stand still and
the decks show NO TRACK. Nothing is invented: no BPM, no levels, no fader moves.

| Call | Source in the Broadcast Studio / OBS |
|---|---|
| `setDeck(1…4, { title, artist, bpm, key, state: 'play' \| 'pause' \| 'stop', position, duration, pitch, waveform })` | The Music Player's playlist and its play state. Send `position` on every change and every few seconds; the page counts between. `waveform` is optional: peaks 0–1 (up to 2048). Without it, the deck shows a position bar only. |
| `setMixer({ ch: [{ trim, hi, mid, low, filter, fader, cue }], xfader, master, phones })` | Only from a real control input (the DJ Mixer, or the Broadcast Studio's own faders). All values 0–1; 0.5 is centre. |
| `setLevels({ ch: [4 values], master: [L, R] })` | OBS `InputVolumeMeters` (obs-websocket), as peak 0–1, about 10–20 times a second. The meters fall back by themselves between updates. |
| `setMic(true \| false)` | TALK: the talkback mic's red ring. |

### One music source at a time (Audio Director)

The Virtual Studio only draws. The rule itself lives in the Broadcast Studio's Audio Director:

- **PIANO:** the Piano Show's audio in *Piano Stage*.
- **DJ:** the Music Player or the DJ Mixer.
- **STUDIO MUSIC:** the studio's own beds.
- **Switching:** before a new source starts, the previous one is faded out and stopped. Microphones stay independent.
- **How the page helps:**
  - `ext.show.state` and the DJ Room's `report()` say what is playing on the page.
  - In PIANO + DJ mode both stages are on the page, but only one source plays.
- **Lift hold:** the Piano Stage's `ext.setLiftHold(true)` and the DJ Room's `setLiftHold(true)` keep the lifts still,
  so that, for example, the Sunday show can use both stages without moving a lift.
