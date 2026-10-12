// OBS Browser source. Read-only: listens for graphics state from the studio server, sends nothing but pings.
const $ = id => document.getElementById(id);
const key = new URLSearchParams(location.search).get('key') || '';
const f = tz => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const vie = f('Europe/Vienna'), mel = f('Australia/Melbourne');
setInterval(() => { $('oVie').textContent = vie.format(Date.now()); $('oMel').textContent = mel.format(Date.now()); }, 1000);
$('oVie').textContent = vie.format(Date.now()); $('oMel').textContent = mel.format(Date.now());

let opened = false;
function start() {
  const ws = new WebSocket('ws://' + location.host + '/ws?overlay=' + encodeURIComponent(key));
  ws.onopen = () => { opened = true; $('nolink').hidden = true; };
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.t === 'state') paint(m.s); };
  // keep the last graphics on screen through a blip; OBS should never show an error mid-show
  ws.onclose = () => { if (!opened) $('nolink').hidden = false; setTimeout(start, 2000); };
}
function paint(s) {
  const g = s.gfx;
  $('bug').classList.toggle('on', g.bug);
  $('bugTag').textContent = g.tagline || 'Vienna // Melbourne';
  $('clocks').classList.toggle('on', g.clocks);
  $('identTitle').textContent = s.segment?.title || '';
  $('ident').classList.toggle('on', g.ident && !!s.segment);
  const lt = g.lowerThird;
  $('lowerTitle').textContent = lt.title; $('lowerSub').textContent = lt.subtitle;
  $('lowerTab').textContent = lt.side === 'melbourne' ? 'MEL' : 'VIE';
  const lower = $('lower');
  lower.classList.toggle('mel', lt.side === 'melbourne'); lower.classList.toggle('vie', lt.side !== 'melbourne');
  lower.classList.toggle('on', lt.visible && !!lt.title);
  lower.classList.toggle('stacked', g.ident && !!s.segment);
}
if (!key) $('nolink').hidden = false;
start();
