// The grand's keys, played from note events on the recording's clock. The mechanism only: no song has a piano part
// yet, and none is made up. A part is used only when it is approved (see docs/vienna-stage/SCORE-IMPORT.md).
//
// A part: {
//   song: 'zwischenlandung/official-piano-version',   // the repertoire id it belongs to
//   kind: 'piano-part' | 'accompaniment',              // the recording's own piano, or a verified chord accompaniment
//   source: 'MIDI from the DAW project' | 'score PDF → MusicXML (OMR), corrected' | …,
//   approved: { by: 'DJ Andy'K', on: '2026-10-25' },   // without it the part is refused
//   offset: 0,                                         // seconds: note time 0 = this point in the recording
//   notes: [{ t: 12.345, d: 0.5, m: 60, v: 0.8 }, …],  // start (s), length (s), MIDI note 21–108, velocity 0–1
// }
// Each frame the keys are set from the recording's current time alone, so pause, resume and seeking can never put
// them out of step with the sound. A key goes down just before its note sounds (as the hammer must travel) and comes
// back up after it ends.
const ATTACK = 0.035, RELEASE = 0.07;

export function validatePart(part) {
  const errors = [];
  if (!part || typeof part !== 'object') return ['not a part'];
  if (!part.song) errors.push('no song id');
  if (!['piano-part', 'accompaniment'].includes(part.kind)) errors.push('kind must be piano-part or accompaniment');
  if (!part.source) errors.push('no source');
  if (!part.approved?.by || !part.approved?.on) errors.push('not approved');
  if (!Array.isArray(part.notes) || !part.notes.length) errors.push('no notes');
  else part.notes.forEach((n, i) => {
    if (!(n.t >= 0) || !(n.d > 0) || !Number.isInteger(n.m) || n.m < 21 || n.m > 108) errors.push(`note ${i}: ${JSON.stringify(n)}`);
  });
  return errors.slice(0, 20);
}

export function createKeyPlayer(keyboard) {
  let part = null, notes = [], longest = 0;
  const down = new Map();
  const releaseAll = () => { for (const n of down.keys()) keyboard.press(n, 0); down.clear(); };
  return {
    get part() { return part; },
    // load an approved part (returns the problems found, if any); null unloads
    load(p) {
      releaseAll();
      if (!p) { part = null; notes = []; return []; }
      const errors = validatePart(p);
      if (errors.length) { part = null; notes = []; return errors; }
      part = p;
      notes = [...p.notes].map(n => ({ ...n, t: n.t + (p.offset || 0) })).sort((a, b) => a.t - b.t);
      longest = notes.reduce((x, n) => Math.max(x, n.d), 0);
      return [];
    },
    // set every key for this moment of the recording (seconds)
    update(time) {
      if (!notes.length) return;
      const now = new Map();
      // first note that could still be sounding: binary search on start
      let lo = 0, hi = notes.length;
      const from = time - longest - RELEASE;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].t < from) lo = mid + 1; else hi = mid; }
      for (let i = lo; i < notes.length && notes[i].t - ATTACK <= time; i++) {
        const n = notes[i], a = time - (n.t - ATTACK), r = n.t + n.d - time;
        if (r < -RELEASE) continue;
        const depth = Math.min(1, a / ATTACK, r >= 0 ? 1 : 1 + r / RELEASE) * (0.75 + 0.25 * (n.v ?? 0.8));
        if (depth > (now.get(n.m) || 0)) now.set(n.m, depth);
      }
      for (const n of down.keys()) if (!now.has(n)) keyboard.press(n, 0);
      for (const [n, dpt] of now) keyboard.press(n, +dpt.toFixed(3));
      down.clear(); for (const [n, dpt] of now) down.set(n, dpt);
    },
    stop: releaseAll,
  };
}
