// Stage 2a prototype page: sign-in, Mac status, the studio's state (read only), upcoming shows and the Show Planner.
// The server decides what each role may do; this page only hides what the role cannot use.
const $ = id => document.getElementById(id);
const el = (tag, text) => { const e = document.createElement(tag); if (text != null) e.textContent = text; return e; };
async function call(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-DZ': '1' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status });
  return data;
}
let me = null, plans = [], current = null, poll = 0;

async function start() {
  try { me = (await call('GET', '/api/me')).user; } catch { me = null; }
  $('login').hidden = !!me; $('app').hidden = !me;
  document.body.classList.toggle('director', me?.role === 'director');
  clearInterval(poll);
  if (!me) return;
  $('who').textContent = `${me.name} · ${me.role === 'director' ? 'Director' : 'Host'}`;
  await Promise.all([engine(), loadPlans()]);
  poll = setInterval(engine, 3000);
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('loginErr').textContent = '';
  const f = new FormData(e.target);
  try { await call('POST', '/api/login', { login: f.get('login'), password: f.get('password') }); e.target.reset(); start(); }
  catch (err) { $('loginErr').textContent = err.message; }
});
$('logout').addEventListener('click', async () => { await call('POST', '/api/logout').catch(() => {}); start(); });

const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`; };
async function engine() {
  let v;
  try { v = await call('GET', '/api/engine'); } catch (e) { if (e.status === 401) return start(); return; }
  $('mac').dataset.s = v.online ? 'on' : 'off';
  $('macTitle').textContent = v.online ? 'Mac online' : 'Mac offline';
  $('macDetail').textContent = v.online ? `Last report ${ago(v.lastSeen)}` : v.lastSeen ? `No report since ${ago(v.lastSeen)}. Live controls are unavailable.` : 'The studio has not reported. Live controls are unavailable.';
  const s = v.state || {}, yes = b => b == null ? '—' : b ? 'yes' : 'no';
  const rows = [['Show', s.show || '—'], ['Segment', s.segment ? `${(s.segmentIndex ?? 0) + 1} / ${s.segmentCount ?? '?'} · ${s.segment}` : '—'],
    ['OBS connected', yes(s.obs)], ['Streaming', yes(s.streaming)], ['Recording', yes(s.recording)], ['Rehearsal', yes(s.rehearsal)],
    ['Georgie connected', yes(s.host)], ['Guest', s.guest || '—'], ['MIDI', s.midi?.length ? s.midi.join(', ') : '—']];
  $('state').replaceChildren(...rows.flatMap(([k, val]) => [el('dt', k), el('dd', val)]));
  $('state').classList.toggle('old', !v.online);
}

const FORMAT = { friday: 'Friday DJ', saturday: 'Saturday Piano', sunday: 'Sunday Show' };
async function loadPlans(select) {
  plans = await call('GET', '/api/plans');
  $('plans').replaceChildren(...plans.map(p => {
    const b = el('button'); b.type = 'button'; b.setAttribute('aria-current', String(p.id === (select || current?.id)));
    const mins = p.segments.reduce((t, s) => t + s.minutes, 0);
    b.append(el('span', `${p.date} · ${p.start} — ${p.title}`), el('span', `${FORMAT[p.format]} · ${p.status} · ${mins} min${p.test ? ' · test' : ''}`));
    b.lastChild.className = 'tag';
    b.onclick = () => open(p.id);
    const li = el('li'); li.append(b); return li;
  }));
  const id = select || current?.id;
  if (id && plans.some(p => p.id === id)) open(id); else { current = null; $('editor').hidden = true; }
}
function open(id) {
  current = structuredClone(plans.find(p => p.id === id));
  for (const b of $('plans').querySelectorAll('button')) b.setAttribute('aria-current', 'false');
  $('plans').children[plans.findIndex(p => p.id === id)]?.firstChild.setAttribute('aria-current', 'true');
  const f = $('planForm'), ro = me.role !== 'director';
  for (const k of ['title', 'date', 'start', 'status', 'notes']) { f.elements[k].value = current[k]; f.elements[k].disabled = ro; }
  $('edTitle').textContent = `Show Planner · ${FORMAT[current.format]}${ro ? ' (read only)' : ''}`;
  $('planErr').textContent = ''; $('editor').hidden = false; segs();
}
function segs() {
  const ro = me.role !== 'director';
  $('segs').replaceChildren(...current.segments.map((s, i) => {
    const tr = el('tr'); tr.append(el('td', String(i + 1)));
    for (const [k, type] of [['title', 'text'], ['kind', 'text'], ['minutes', 'number']]) {
      const td = el('td'), inp = el('input'); inp.type = type; inp.value = s[k]; inp.disabled = ro; if (type === 'number') { inp.min = 0; inp.step = 0.5; }
      inp.oninput = () => { s[k] = type === 'number' ? Number(inp.value) : inp.value; total(); };
      td.append(inp); tr.append(td);
    }
    const td = el('td'); td.className = 'director-only';
    const x = el('button', '×'); x.type = 'button'; x.className = 'quiet'; x.title = 'Remove segment'; x.onclick = () => { current.segments.splice(i, 1); segs(); };
    td.append(x); tr.append(td); return tr;
  }));
  total();
}
const total = () => { const m = current.segments.reduce((t, s) => t + (Number(s.minutes) || 0), 0); $('total').textContent = `${current.segments.length} segments · ${m} min planned`; };
$('addSeg').onclick = () => { current.segments.push({ title: 'New segment', kind: 'TALK', minutes: 5 }); segs(); };
$('planForm').addEventListener('submit', async e => {
  e.preventDefault(); $('planErr').textContent = '';
  const f = e.target.elements;
  try { await call('PATCH', `/api/plans/${current.id}`, { title: f.title.value, date: f.date.value, start: f.start.value, status: f.status.value, notes: f.notes.value, segments: current.segments }); await loadPlans(current.id); }
  catch (err) { $('planErr').textContent = err.message; }
});
$('delPlan').onclick = async () => {
  try { await call('DELETE', `/api/plans/${current.id}`); current = null; await loadPlans(); }
  catch (err) { $('planErr').textContent = err.message; }
};
$('newPlan').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  try { const p = await call('POST', '/api/plans', { format: f.get('format'), date: f.get('date'), start: f.get('start') }); await loadPlans(p.id); }
  catch (err) { $('newErr').textContent = err.message; }
});

start();
