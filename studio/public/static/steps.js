// NEXT STEPS 1 · 2 · 3 — the same idea on every screen (Andrej, Georgie, the guest): 1 is now, 2 is next, 3 after that.
// When there is a choice (GO or ADMIT GUEST first?) the studio shows only the better one for this moment. `due` names
// the one button that should be pressed now, so it can blink. Nothing here acts: it only reads the show.
import { showClock, mmss } from './clock.js';

const two = n => String(n).padStart(2, '0');
const SOON = 15;                 // seconds before the end of a segment / break: the next action becomes due
const ADMIT_EARLY = 180;         // the guest is admitted backstage up to 3 min before their segment
const WHO = {
  director: { andrej: 'you speak', georgie: 'Georgie speaks', both: 'both of you' },
  host: { andrej: 'Andrej speaks — listen', georgie: 'you speak', both: 'both of you' },
};
const segLine = (segs, i, who) => { const s = segs[i]; return s ? `${two(i + 1)} ${s.title} — ${WHO[who][s.lead] || 'both of you'}` : ''; };
const needsGuest = s => s && (s.kind === 'GUEST' || !!s.guest?.name);

// returns { steps: [{ text, due }], due: 'go' | 'return' | 'admit' | 'onair' | 'check' | 'open' | '' }
export function nextSteps(S, who, now = Date.now()) {
  if (who === 'guest') return guestSteps(S?.guest);
  const r = S?.rundown, segs = r?.segments || [], b = S?.brk || {};
  if (!segs.length) return { steps: [], due: '' };
  const k = showClock(segs, r, now), g = S.guest, dir = who === 'director';
  const out = [], step = (text, due = '') => out.push({ text, due });
  let due = '';

  if (b.active) {
    const left = Math.round((b.startedAt + b.planned * 1000 - now) / 1000), back = r.index + 1;
    step(left > 0 ? `BREAK — off air. Back in ${mmss(left)}` : `BREAK — over by ${mmss(-left)}`);
    if (dir) { const d = left <= SOON; step(`Press RETURN TO LIVE (twice) → ${segLine(segs, back, who)}`, d ? 'return' : ''); if (d) due = 'return'; }
    else step(`Back on air: ${segLine(segs, back, who)}`, left <= SOON ? 'ready' : '');
    if (segs[back + 1]) step(`Then ${segLine(segs, back + 1, who)}`);
    return { steps: out.slice(0, 3), due };
  }

  if (!k.running) {
    const until = r.episode?.startAt ? Math.round((r.episode.startAt - now) / 1000) : null;
    if (dir) {
      if (needsGuest(segs[0]) && g && !['backstage', 'onair'].includes(g.status)) {
        step(g.online ? `ADMIT GUEST ${g.name} first` : `Wait for ${g.name} to open the guest link`, g.online ? 'admit' : '');
        if (g.online) due = 'admit';
      }
      const d = !due && (until == null || until <= SOON);
      step(`Press GO — START SHOW${until > 0 ? ` (in ${mmss(until)})` : ''}`, d ? 'go' : '');
      if (d) due = 'go';
    } else step(until > 0 ? `Get ready — the show starts in ${mmss(until)}` : 'Get ready — Andrej starts the show', until != null && until <= SOON ? 'ready' : '');
    for (let i = 0; out.length < 3 && segs[i]; i++) step(segLine(segs, i, who));
    return { steps: out, due };
  }

  const i = k.index, cur = segs[i], nx = segs[i + 1], left = k.remaining;
  step(`NOW ${segLine(segs, i, who)} · ${left >= 0 ? mmss(left) + ' left' : 'over by ' + mmss(-left)}`);
  if (dir) {
    // one recommendation when several actions are possible: the guest first, when their seat is needed now or next
    if (needsGuest(cur) && g?.status === 'backstage') { step(`TAKE GUEST ON AIR — ${g.name}`, 'onair'); due = 'onair'; }
    else if (needsGuest(nx) && g && ['invited', 'waiting'].includes(g.status)) {
      const d = g.online && left <= ADMIT_EARLY;
      step(g.online ? `ADMIT GUEST ${g.name} (backstage, not on air)` : `Wait for ${g.name} to open the guest link`, d ? 'admit' : '');
      if (d) due = 'admit';
    }
    if (out.length < 3 && nx) {
      const d = left <= SOON && !due;
      step(`Press GO → ${segLine(segs, i + 1, who)}${nx.kind === 'BREAK' ? ' (microphones off)' : ''}`, d ? 'go' : '');
      if (d) due = 'go';
    }
    if (out.length < 3 && needsGuest(cur) && g?.status === 'onair' && !needsGuest(nx)) step(`TAKE GUEST OFF AIR when ${g.name} is done`);
  } else if (nx) step(`Next ${segLine(segs, i + 1, who)}`, left <= SOON ? 'ready' : '');
  for (let j = i + 2; out.length < 3 && segs[j]; j++) step(`Then ${segLine(segs, j, who)}`);
  if (out.length < 3 && !nx) step('Last segment — end credits, then stop the stream');
  return { steps: out.slice(0, 3), due };
}

function guestSteps(g) {
  if (!g) return { steps: [], due: '' };
  const checked = !!(g.check?.camera && g.check?.mic);
  if (g.status === 'onair') return { due: '', steps: [
    { text: 'You are ON AIR — speak when Andrej or Georgie ask you', due: '' },
    { text: 'The studio takes you off air at the end of your part', due: '' },
    { text: 'Then you can close both tabs. Thank you!', due: '' }] };
  if (g.status === 'backstage') return { due: 'open', steps: [
    { text: 'Press OPEN STUDIO CAMERA and allow camera + microphone', due: 'open' },
    { text: 'Wait backstage — viewers cannot see or hear you yet', due: '' },
    { text: 'The studio puts you on air; this page turns red: ON AIR', due: '' }] };
  return { due: checked ? '' : 'check', steps: [
    { text: checked ? 'Camera and microphone checked ✓' : 'Press START CHECK and say a few words', due: checked ? '' : 'check' },
    { text: 'Wait — the studio lets you in', due: '' },
    { text: 'Then open the studio camera (a button appears here)', due: '' }] };
}

// renders the list into `root` (an <ol>), only when the text changed
export function renderSteps(root, { steps }) {
  const sig = JSON.stringify(steps);
  if (root.dataset.sig === sig) return;
  root.dataset.sig = sig;
  root.replaceChildren(...steps.map((s, i) => {
    const li = document.createElement('li');
    li.className = (i === 0 ? 'now' : '') + (s.due ? ' due' : '');
    const n = document.createElement('b'); n.textContent = i + 1;
    li.append(n, s.text);
    return li;
  }));
  root.hidden = !steps.length;
}
