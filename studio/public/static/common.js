// Shared by the Director Studio and the Host Dashboard: connection to the Vienna studio server,
// clocks, show timing, the private chat and small DOM helpers. All text goes in via textContent.

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}

export const pad = n => String(n).padStart(2, '0');
export function hms(ms, { sign = false } = {}) {
  const neg = ms < 0; ms = Math.abs(ms);
  const s = Math.floor(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60;
  return (neg ? '−' : sign ? '+' : '') + (hh ? hh + ':' + pad(mm) : pad(mm)) + ':' + pad(ss);
}

/* ---------- connection ---------- */

export function connect({ query = '', onStatus = () => {} } = {}) {
  const handlers = {};
  const pending = new Map();
  let ws, seq = 0, backoff = 800, rtt = null, pingTimer, open = false;
  const emit = (t, d) => (handlers[t] || []).forEach(f => f(d));

  function start() {
    onStatus({ state: 'connecting', rtt });
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws' + query);
    ws.onopen = () => {
      open = true; backoff = 800;
      onStatus({ state: 'open', rtt });
      ping(); clearInterval(pingTimer); pingTimer = setInterval(ping, 5000);
    };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'pong') { rtt = Math.round(performance.now() - m.ts); onStatus({ state: 'open', rtt }); return; }
      if (m.t === 'ack') {
        const p = pending.get(m.id); if (!p) return;
        pending.delete(m.id);
        return m.ok ? p.resolve(m.result) : p.reject(new Error(m.error || 'Failed'));
      }
      emit(m.t, m);
    };
    ws.onclose = e => {
      open = false; clearInterval(pingTimer);
      for (const p of pending.values()) p.reject(new Error('Connection to the studio lost'));
      pending.clear();
      // 401 during the handshake shows up as an abnormal close before open: send them to sign in again
      onStatus({ state: 'closed', rtt: null, code: e.code });
      setTimeout(start, backoff); backoff = Math.min(backoff * 1.7, 8000);
    };
  }
  function ping() { if (open) ws.send(JSON.stringify({ t: 'ping', ts: performance.now() })); }

  start();
  return {
    on(t, f) { (handlers[t] ||= []).push(f); },
    send(msg) {
      if (!open) return Promise.reject(new Error('Not connected to the studio'));
      const id = 'c' + ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ ...msg, id }));
        setTimeout(() => { if (pending.delete(id)) reject(new Error('The studio did not answer')); }, 8000);
      });
    },
    get open() { return open; },
  };
}

/* if the socket keeps failing before it ever opens, the session has probably expired */
export async function checkSignedIn() {
  try { const r = await fetch('/', { redirect: 'manual', cache: 'no-store' }); if (r.type === 'opaqueredirect' || r.status === 302) location.href = '/login'; } catch {}
}

/* ---------- time ---------- */

const fmt = (tz, o) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...o });
export const TZ = { vie: 'Europe/Vienna', mel: 'Australia/Melbourne' };
const hmFmt = { vie: fmt(TZ.vie, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), mel: fmt(TZ.mel, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) };
const hmsFmt = { vie: fmt(TZ.vie, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }), mel: fmt(TZ.mel, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }) };
const dayFmt = { vie: fmt(TZ.vie, { weekday: 'short', day: 'numeric', month: 'short' }), mel: fmt(TZ.mel, { weekday: 'short', day: 'numeric', month: 'short' }) };
export const clock = (city, t = Date.now(), secs = true) => (secs ? hmsFmt : hmFmt)[city].format(t);
export const day = (city, t = Date.now()) => dayFmt[city].format(t);

function zoned(tz, y, mo, d, hh, mi) {
  const guess = Date.UTC(y, mo, d, hh, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(guess).map(x => [x.type, +x.value]));
  return guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess);
}
/* "HH:MM" today in a given city, as a timestamp (reminders are typed in Vienna time) */
export function zonedToday(tz, hhmm) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(Date.now()).map(x => [x.type, +x.value]));
  const [hh, mm] = hhmm.split(':').map(Number);
  return zoned(tz, p.year, p.month - 1, p.day, hh, mm);
}
/* same rule as the public website: the launch, then every nth weekday of the month */
export function nextShow(show, now = Date.now()) {
  const L = new Date(show.launch).getTime(), S = show.schedule, len = S.minutes * 6e4;
  if (now < L + len) return L;
  const v = new Date(L);
  for (let k = 0; k < 36; k++) {
    const y = v.getUTCFullYear(), mo = v.getUTCMonth() + k, first = new Date(Date.UTC(y, mo, 1)).getUTCDay();
    const d = 1 + (S.weekday - first + 7) % 7 + (S.nth - 1) * 7, t = zoned(S.tz, y, mo, d, S.hour, S.minute);
    if (t > L && now < t + len) return t;
  }
  return L;
}
export function countdown(ms) {
  ms = Math.max(0, ms);
  const d = Math.floor(ms / 864e5), r = ms % 864e5;
  return (d ? d + 'd ' : '') + pad(Math.floor(r / 36e5)) + ':' + pad(Math.floor(r / 6e4) % 60) + ':' + pad(Math.floor(r / 1e3) % 60);
}

/* masthead clocks + show clock, shared by both pages */
export function runClocks(getState) {
  const tick = () => {
    const now = Date.now(), s = getState();
    $('#cVie').textContent = clock('vie', now);
    $('#cMel').textContent = clock('mel', now);
    const sc = $('#showclock');
    if (!s?.show) return;
    const started = s.rundown?.showStartedAt;
    if (started) {
      sc.classList.add('live');
      $('#showLabel').textContent = 'Show clock';
      $('#showTime').textContent = hms(now - started);
    } else {
      sc.classList.remove('live');
      const at = nextShow(s.show, now);
      $('#showLabel').textContent = now < at ? 'Next show ' + day('vie', at) : 'Show slot now';
      $('#showTime').textContent = now < at ? 'T−' + countdown(at - now) : 'ON SLOT';
    }
  };
  tick();
  setInterval(tick, 250);
  return tick;
}

/* where each segment falls on the clock: the actual start once the show runs, otherwise the scheduled slot */
export function segmentTimes(s, now = Date.now()) {
  const r = s.rundown;
  let t = r.showStartedAt || nextShow(s.show, now);
  const out = [];
  r.segments.forEach((seg, i) => {
    if (i === r.index && r.segmentStartedAt) t = r.segmentStartedAt;
    out.push(t);
    t += seg.minutes * 6e4;
  });
  return out;
}

export function segmentTimer(s, now = Date.now()) {
  const r = s.rundown, seg = r.segments[r.index];
  if (!seg || !r.segmentStartedAt) return null;
  const planned = seg.minutes * 6e4, elapsed = now - r.segmentStartedAt;
  return { seg, planned, elapsed, remaining: planned - elapsed, ratio: planned ? Math.min(1, elapsed / planned) : 1 };
}

/* ---------- toasts ---------- */

export function toast(text, kind = '') {
  let box = $('.toasts');
  if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + kind, text });
  box.append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3500);
}

/* run a server action with button feedback and a readable error */
export async function act(btn, fn, okText) {
  btn?.classList.add('busy');
  try { const r = await fn(); if (okText) toast(okText, 'ok'); return r; }
  catch (e) { toast(e.message, 'bad'); }
  finally { btn?.classList.remove('busy'); }
}

/* hold-to-confirm: fires after the button is held for `ms` */
export function holdButton(btn, ms, fire) {
  let timer = null;
  btn.style.setProperty('--hold', ms + 'ms');
  const start = e => {
    if (btn.disabled || timer) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e.type === 'keydown' && e.repeat) return;
    e.preventDefault();
    btn.classList.add('holding');
    timer = setTimeout(() => { timer = null; btn.classList.remove('holding'); fire(); }, ms);
  };
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } btn.classList.remove('holding'); };
  btn.addEventListener('pointerdown', start);
  btn.addEventListener('keydown', start);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur']) btn.addEventListener(ev, cancel);
  btn.addEventListener('click', e => e.preventDefault());
}

/* ---------- private chat ---------- */

const NAMES = { director: 'Andrej // Vienna', host: 'Georgie // Melbourne' };
export function chatPanel(conn, me, { onUnread = () => {} } = {}) {
  const log = $('#chatLog'), form = $('#chatForm'), input = $('#chatInput');
  const other = me === 'director' ? 'host' : 'director';
  let msgs = [], read = {}, unread = 0, lastDay = '';
  const visible = () => document.visibilityState === 'visible';
  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 40;

  function line(m) {
    const d = day(me === 'director' ? 'vie' : 'mel', m.ts);
    const out = [];
    if (d !== lastDay) { lastDay = d; out.push(h('li', { class: 'day', text: d })); }
    out.push(h('li', { class: `${m.from} ${m.from === me ? 'me' : ''}`, dataset: { id: m.id } },
      h('span', { class: 'who' }, NAMES[m.from] || m.from, h('time', { text: clock(me === 'director' ? 'vie' : 'mel', m.ts, false) })),
      m.text));
    return out;
  }
  function render() {
    lastDay = '';
    log.replaceChildren(...msgs.flatMap(line));
    seen();
    log.scrollTop = log.scrollHeight;
  }
  function seen() {
    log.querySelector('.seen')?.remove();
    const mine = msgs.filter(m => m.from === me).at(-1);
    if (mine && (read[other] || 0) >= mine.id && msgs.at(-1) === mine) log.append(h('li', { class: 'seen', text: 'Seen' }));
  }
  function markRead() {
    const last = msgs.filter(m => m.from === other).at(-1);
    if (last && visible() && (read[me] || 0) < last.id) conn.send({ t: 'chat.read', upTo: last.id }).catch(() => {});
    unread = 0; onUnread(0);
  }

  conn.on('chat.history', ({ msgs: list }) => { msgs = list; render(); markRead(); });
  conn.on('chat', ({ msg }) => {
    const stick = atBottom() || msg.from === me;
    msgs.push(msg);
    log.querySelector('.seen')?.remove();
    log.append(...line(msg));
    if (stick) log.scrollTop = log.scrollHeight;
    if (msg.from !== me) {
      if (visible() && document.hasFocus()) markRead();
      else { unread++; onUnread(unread); }
    }
  });
  conn.on('state', ({ s }) => { read = s.read || {}; seen(); });
  document.addEventListener('visibilitychange', () => { if (visible()) markRead(); });
  window.addEventListener('focus', markRead);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    try { await conn.send({ t: 'chat.send', text }); input.value = ''; }
    catch (err) { toast(err.message, 'bad'); }
    finally { input.disabled = false; input.focus(); }
  });
  $$('.quick button').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.say || b.textContent; form.requestSubmit(); }));
}

export function titleBadge(base) {
  return n => { document.title = (n ? `(${n}) ` : '') + base; };
}
