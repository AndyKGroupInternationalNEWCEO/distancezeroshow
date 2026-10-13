// Short help for the less obvious controls only (CUT, TAKE, FADE, DURATION, PREVIEW/PROGRAM, GO, GO LIVE lock,
// emergency, guest steps, show clock, teleprompter). A small "?" opens one or two sentences; Escape or a click closes it.
const TIPS = {
  director: [
    ['#pvwHint', 'PREVIEW (PVW): the shot you prepare. Viewers do not see it. Check it, then CUT or TAKE.'],
    ['#pgmHint', 'PROGRAM (PGM): what goes out — to YouTube when the stream is on, and to the recording. Switching shots never starts the stream.'],
    ['#busBadge', 'CUT: the preview shot replaces the program at once. TAKE: the same, with the chosen transition (FADE = a soft crossfade) lasting DURATION. Neither starts the stream.', 'before'],
    ['#transDur', 'DURATION: how long the TAKE transition lasts, in milliseconds (1000 ms = 1 second). CUT ignores it.'],
    ['#armBtn', 'GO LIVE is locked so that testing scenes can never start the stream. UNLOCK opens it for 60 seconds; then hold GO LIVE. It locks itself again.', 'before'],
    ['#hEm', 'CUT TO STANDBY: the program shows the standby scene at once. MICS OFF: mutes the tagged microphones in OBS. END STREAM: stops YouTube (hold 2 s). Try them in a rehearsal first.'],
    ['#goHint', 'GO: moves to the next segment and fires its cues together (scene, video, jingle). Into a break it mutes the broadcast microphones first. Nothing moves on by itself.', 'before'],
    ['#hGuest', 'ADMIT GUEST: the guest\'s camera reaches OBS but stays hidden and muted. TAKE GUEST ON AIR: shows and unmutes it. Two separate steps, on purpose.'],
    ['#hClock', 'SCHEDULE STATUS compares the show with the plan: ON TIME within 30 seconds, otherwise how far ahead or behind.'],
  ],
  host: [
    ['#hClockH', 'SCHEDULE STATUS compares the show with the plan: ON TIME within 30 seconds, otherwise how far ahead or behind. BACKSTAGE means viewers cannot see or hear you.'],
    ['#hScriptH', 'TELEPROMPTER: PLAY scrolls the text, A−/A+ change the size, −/+ the speed. Your lines are highlighted. Scrolling by hand always works. The script cannot be changed here.'],
    ['#hMusic', 'Set by Andrej: the track that is playing now.'],
  ],
};
export function initHelpTips(role) {
  for (const [sel, text, where] of TIPS[role] || []) {
    const anchor = document.querySelector(sel); if (!anchor) continue;
    const wrap = document.createElement('span'); wrap.className = 'qwrap';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'qhelp'; b.textContent = '?'; b.setAttribute('aria-label', 'What is this?');
    const pop = document.createElement('span'); pop.className = 'qpop'; pop.hidden = true; pop.setAttribute('role', 'tooltip'); pop.textContent = text;
    b.addEventListener('click', e => { e.stopPropagation(); const open = pop.hidden; closeAll(); pop.hidden = !open; });
    wrap.append(b, pop);
    anchor.insertAdjacentElement(where === 'before' ? 'beforebegin' : 'afterend', wrap);
  }
  document.addEventListener('click', e => { if (!e.target.closest('.qwrap')) closeAll(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
}
const closeAll = () => document.querySelectorAll('.qpop').forEach(p => { p.hidden = true; });
