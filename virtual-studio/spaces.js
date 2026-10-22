// The visitor's three buttons: STUDIO, PIANO, DJ ROOM, at the bottom of the page in place of the studio's control
// bar (which folds into "⋯"). Each takes the visitor to its space and starts what happens there; a second press
// pauses (PIANO, DJ ROOM) or moves on to the next studio shot (STUDIO). Only one space plays at a time: going to
// another stops the music of the last, so two recordings never sound together. The press is also the gesture that
// lets Safari and the iPhone start the sound.
// The Piano Stage's and the DJ Room's own panels are for the director: shown only with ?director in the address.
//   v: the Vienna Piano Stage (vienna/index.js) with the DJ Room as v.melbourne (melbourne/index.js, withVienna)
const SHOTS = ['studio', 'desk', 'wall', 'crane', 'floor'];

const ICON = {
  studio: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 33c8-5 28-5 36 0"/><path d="M9 33v6m30-6v6"/><rect x="15" y="9" width="13" height="9" rx="1.5"/><path d="M28 12l6-3v9l-6-3"/><path d="M21.5 18v8m-5 0h10"/></svg>',
  piano: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 30h34v-3c0-6-4-9-10-9-3 0-4-6-11-6-7 0-13 6-13 12z"/><path d="M7 30v4h34v-4"/><path d="M12 34v6m24-6v6"/><path d="M13 30v-3m4 3v-3m4 3v-3m4 3v-3m4 3v-3m4 3v-3"/></svg>',
  dj: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="27" r="9"/><circle cx="17" cy="27" r="2"/><path d="M30 18h11v18H30z"/><path d="M33 23h5m-5 4h5m-5 4h5"/><path d="M9 14a15 15 0 0 1 30 0"/><rect x="6" y="13" width="5" height="8" rx="2"/><rect x="37" y="13" width="5" height="8" rx="2"/></svg>',
};

export function spaces(v, director) {
  const m = v.melbourne;
  const director_ = new URLSearchParams(location.search).has('director');
  const dock = document.getElementById('dock'), ctrl = dock?.querySelector('.row.ctrl');
  if (!dock || !ctrl) return null;
  document.body.classList.toggle('dz-public', !director_);

  const css = `
  .spaces{display:flex;justify-content:center;align-items:stretch;gap:12px;margin:0 auto 8px}
  .spaces .sp{display:flex;flex-direction:column;align-items:center;gap:4px;width:156px;padding:10px 12px 9px;border-radius:16px;
    background:var(--glass,rgba(10,11,14,.58));border:1px solid var(--line,rgba(201,206,214,.16));color:var(--chrome-hi,#f3f5f8);
    font:600 .74rem/1.1 var(--wide,Arial,sans-serif);letter-spacing:.2em;text-transform:uppercase;cursor:pointer;backdrop-filter:blur(10px);
    transition:border-color .25s,background .25s,box-shadow .25s}
  .spaces .sp svg{width:38px;height:38px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  .spaces .sp small{font-weight:400;font-size:.6rem;letter-spacing:.08em;text-transform:none;color:var(--dim,#8a9099);min-height:1.1em}
  .spaces .sp:hover{border-color:rgba(243,245,248,.4)}
  .spaces .sp[aria-pressed=true]{--c:var(--chrome-hi,#f3f5f8);border-color:var(--c);box-shadow:0 0 22px -6px var(--c);background:rgba(255,255,255,.07)}
  .spaces .sp.piano[aria-pressed=true]{--c:var(--amber,#f2a650)} .spaces .sp.piano[aria-pressed=true] svg{stroke:var(--amber,#f2a650)}
  .spaces .sp.dj[aria-pressed=true]{--c:var(--ice,#a9c8ee)} .spaces .sp.dj[aria-pressed=true] svg{stroke:var(--ice,#a9c8ee)}
  .spaces .more{align-self:center;min-width:0;width:44px;height:44px;padding:0;border-radius:50%;font-size:1.1rem;letter-spacing:0}
  .dock:not(.more-open) .row.ctrl{display:none}
  body.dz-public .vz,body.dz-public .mz{display:none}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const bar = document.createElement('div'); bar.className = 'spaces'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Spaces');
  const button = (key, label) => `<button class="sp ${key}" type="button" data-space="${key}" aria-pressed="false">${ICON[key]}<span>${label}</span><small></small></button>`;
  bar.innerHTML = button('studio', 'Studio') + button('piano', 'Piano') + button('dj', 'DJ Room')
    + '<button class="sp more" type="button" aria-expanded="false" aria-label="More controls" title="Camera, light, on-air simulation, music, schedule">⋯</button>';
  dock.insertBefore(bar, ctrl);
  const btn = k => bar.querySelector(`[data-space="${k}"]`), more = bar.querySelector('.more');
  more.addEventListener('click', () => { const open = dock.classList.toggle('more-open'); more.setAttribute('aria-expanded', String(open)); });

  let active = 'studio', shot = 0;
  const pianoPlaying = () => !['IDLE', 'ENDED'].includes(v.show.state);
  const djPlaying = () => ['PLAYING', 'PAUSED'].includes(m.opening.state);
  const stopPiano = () => { if (pianoPlaying()) v.showCommand('stop'); };
  const stopDj = () => { if (djPlaying()) m.djOpening('stop'); };

  const go = {
    studio() {
      if (active === 'studio') { shot = (shot + 1) % SHOTS.length; director.setAuto(false); director.go(SHOTS[shot]); return; }
      stopPiano(); stopDj(); shot = 0;
      if (v.lift.state !== 'LOWERED' && !v.liftHold) v.command('reset');
      // the booth down in the club: it rides back up and the transition ends on the studio
      if (m.lift.state !== 'UP' || m.env === 'djroom') { if (!m.travelling) m.transition('up'); }
      else { director.setAuto(false); director.go('studio'); }
    },
    piano() {
      if (active === 'piano' && pianoPlaying()) return v.showCommand('pause');
      stopDj();
      if (m.env === 'djroom') m.setEnv('studio', { transition: false });
      v.showCommand('start');
    },
    dj() {
      if (active === 'dj' && djPlaying()) return m.djOpening('pause');
      stopPiano();
      m.djOpening('start', undefined, 'short');
    },
  };
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-space]'); if (!b) return;
    go[b.dataset.space](); active = b.dataset.space; show();
  });

  // the buttons' state, from what is actually playing (the director's panels and the Broadcast bridge can change it too)
  function show() {
    for (const k of ['studio', 'piano', 'dj']) btn(k).setAttribute('aria-pressed', String(k === active));
    const p = v.show.state, d = m.opening.state;
    btn('studio').querySelector('small').textContent = active === 'studio' ? 'Next shot' : '';
    btn('piano').querySelector('small').textContent = active !== 'piano' ? 'Piano show' : p === 'IDLE' || p === 'ENDED' ? 'Play again' : v.show.paused ? 'Paused · tap to play' : 'Playing · tap to pause';
    btn('dj').querySelector('small').textContent = active !== 'dj' ? 'DJ opening' : d === 'PAUSED' ? 'Paused · tap to play' : d === 'PLAYING' ? 'Playing · tap to pause' : 'Play again';
  }
  show();
  return { update: show, get active() { return active; } };
}
