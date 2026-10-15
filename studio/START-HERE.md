# DISTANCE // ZERO — Start here

The studio runs on the **Vienna Mac**. Georgie only needs a link and Chrome.

## Once (already done on this Mac)

- Node and `cloudflared` are installed (`brew install cloudflared`).
- The OBS WebSocket password is saved in `studio/.env.local`.

## Georgie's permanent link (Tailscale, once)
Without Tailscale her link changes on every start (Cloudflare). With it, it stays the same for every show.
1. Install: `brew install --cask tailscale-app` (asks for your Mac password).
2. Open **Tailscale** from Applications, allow the VPN configuration, sign in (with GitHub).
3. Start the studio as usual. The first time only, line 3 shows a Tailscale link to **switch on Funnel** for this Mac: open it and confirm.
From then on line 3 says **her permanent link is ready**: send it to Georgie once. She still needs only her browser, and her own access code protects it.

## Two shows, saved
In the Director Studio top bar, **Select show**: **SUNDAY — DISTANCE // ZERO** or **FRIDAY — DJ ANDY'K**. OBS switches to that
show's own scene collection (scenes, cameras, videos, jingles, layout), and the rundown, microphones, standby scene,
transition and graphics follow. The choice stays after a restart. Not possible while streaming, recording or with the
show clock running (press Reset first). Presets: `studio/shows/*.json`. Build the OBS collections once with
`npm run obs-setup -- sunday friday` (backs up OBS first, never changes an existing collection).
Still to do once in OBS: choose the **DJ Mixer** audio device; add files for **Jingle // slot 2, slot 3** (Sunday) and
**Opening Video** (Friday) when you have them.

## Every rehearsal or show: one icon

Click **DISTANCE ZERO** on the Desktop (drag it into the Dock if you like). It opens OBS if it is not open yet, starts the
studio in the background (or uses it if it already runs), opens the Director Studio signed in, and after a few seconds says
**READY**, or **CHECK** with the reason and the next step. Clicking it again never starts a second OBS or studio.
It never streams, records or starts the virtual camera. No Terminal needed. Georgie's permanent link stays the same;
copy it in Rehearsal → Copy Georgie's link if needed. If the icon is missing: `npm run make-launcher` builds it again.

The studio started by the icon keeps running in the background until you log out or restart the Mac.

## The older way (Terminal window)

1. **Open OBS** (optional for a rehearsal). The studio never streams, records or switches scenes by itself.
2. **Double-click `Start DISTANCE ZERO Studio`** in the `studio` folder (or run `npm run studio` in Terminal).
   A Terminal window opens and shows three lines:
   - `1 OBS`: connected, or "not running" (fine for a rehearsal).
   - `2 Director`: the Director Studio opens in your browser, already signed in.
   - `3 Georgie`: her secure link is ready and **already copied to your clipboard**.
3. **Paste the link to Georgie** in Signal or iMessage. Never post it anywhere public.
4. **Keep the Terminal window open.** Closing it (or Ctrl+C) stops the studio and Georgie's link. OBS keeps running.
5. **Put your headphones on.**

## Rehearsal

1. In the Director Studio, open the **Rehearsal** tab (⌥4) and press **Start rehearsal**.
   The YouTube stream and OBS recording are now **locked**: nothing can go on air until you end the rehearsal.
2. Press **Run automatic checks**, then **Ask Georgie to run hers**. Each step appears on her screen.
3. Use **Test mine** and **Play tone here** for your own camera, microphone and sound.
4. **Call Georgie.** During the call, one of you presses **Share screen** for a few seconds.
5. When Georgie sends her test HELP, press **Seen** in the banner.
6. Tick **Mine are on (Vienna)** for headphones.
7. Press **End rehearsal**, then click again to confirm. The report appears under **Reports**: click **Download**.

A check only says **PASS** after it was really verified. **NOT TESTED** means nobody has tried it yet.

## If something goes wrong

The **What to do now** card in the Rehearsal tab shows the steps for whatever is wrong at that moment.

| What happened | What to do |
|---|---|
| Georgie disconnected | Her page reconnects by itself. Not back after 30 s: phone her and ask her to reload the page. |
| "NEW link for Georgie" | Her public link restarted with a new address. Press **Copy Georgie's link** (Rehearsal tab) and send it to her again. |
| The private call dropped | Press **Call Georgie** again. Fails twice: use the talkback chat, and VDO.Ninja for video. |
| The Director Studio says "Lost connection" | Check the Terminal window is still open. If it's closed, double-click the launcher again. Georgie's page waits and reconnects. |
| OBS offline | Fine for a rehearsal. Open OBS; the studio connects by itself and changes nothing. |

## Stop

Close the Terminal window (or press Ctrl+C in it). The studio and Georgie's link stop. OBS keeps running untouched.
