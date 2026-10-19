// The CINEMATIC button's quick lift reveal (about 18 s). The full show with the official audio is the Piano Show
// (piano-show-config.js, show.js); this short sequence stays for rehearsing the lift and lights on their own.
// Times are seconds into it.
//
// To attach the final audio, nothing in the 3D scene changes:
//   1. put the file at `audio` (or point `audio` at it);
//   2. set `duration` to its length and `hit` to the moment the platform should arrive at the top (the big chord);
//   3. move cues if wanted.
// While the file is missing (or the browser will not play it) the opening runs on its own clock with the same timing.
// For a test the page also takes ?jingle=<url>.
//
// Each cue: `at` seconds after its anchor `from`, which is 'start' (default), 'lift' (when the lift sets off, worked
// out so the platform arrives on `hit`), 'hit' or 'end'. What a cue can do:
//   lights: a lighting mode  · hold: groups held dark  · release: a held group (or 'all') back to the mode
//   set: { group: level } overrides  · cut: a camera (P1–P5)  · lift: 'up'  · say: what the panel shows
export const OPENING = {
  title: 'DISTANCE // ZERO — PIANO SESSIONS',
  audio: null,         // optional: a short jingle to play with it (the page also takes ?jingle=<url>)
  duration: 18,
  hit: 15,
  cues: [
    { at: 0, lights: 'LIFT REVEAL', hold: ['under', 'spot'], cut: 'P4', say: 'lights down' },
    { at: 1.2, release: 'under', say: 'under-platform light' },
    { from: 'lift', at: 0, lift: 'up', say: 'lift rising' },
    { from: 'lift', at: 4.5, cut: 'P5' },
    { from: 'hit', at: 0, set: { spot: 1 }, say: 'performance spot' },
    { from: 'hit', at: 1, cut: 'P1', lights: 'CINEMATIC', release: 'all' },
    { from: 'end', at: 0, say: 'done' },
  ],
};
