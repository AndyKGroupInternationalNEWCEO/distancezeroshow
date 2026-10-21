// The runbook in its own window (/runbook-view?show=…), for a second screen during the broadcast. Same reader as in
// Show Control → Runbook, over the Director's own signed-in connection.
import { $, connect, checkSignedIn } from './common.js';
import { createRunbook } from './runbook-view.js';

const want = new URLSearchParams(location.search).get('show') || '';
let ever = false;
const conn = connect({ onStatus: st => {
  const b = $('#rbLink');
  b.textContent = st.state === 'open' ? 'Connected' : 'Reconnecting…'; b.className = 'badge ' + (st.state === 'open' ? 'live' : 'warn');
  if (st.state === 'open') ever = true; else if (!ever && st.state === 'closed') checkSignedIn();
} });
const rb = createRunbook($('#rbBody'), { conn, show: S => want || S.showId });
conn.on('state', ({ s }) => { document.title = `Runbook — ${s.shows?.find(x => x.id === (want || s.showId))?.name || 'DISTANCE // ZERO'}`; rb.update(s); });
