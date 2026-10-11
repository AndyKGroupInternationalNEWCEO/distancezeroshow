# DISTANCE // ZERO — Start here

The studio runs on the **Vienna Mac**. Georgie only needs a link and Chrome.

## Once (already done on this Mac)

- Node and `cloudflared` are installed (`brew install cloudflared`).
- The OBS WebSocket password is saved in `studio/.env.local`.

## Every rehearsal or show

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
