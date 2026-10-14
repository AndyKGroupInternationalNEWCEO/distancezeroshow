// Private rehearsal mode.
//   - Starting a rehearsal never touches OBS. While it runs, the server REFUSES to start the YouTube stream or
//     OBS recording (stopping stays possible), so a rehearsal can never go out by accident.
//   - Pre-show checks: a check only shows PASS when it was actually verified, by a measurement here (OBS answers,
//     round trips to each dashboard, the public link answering from the internet) or by the person at that end
//     (camera/microphone opened in their browser, test tone heard, HELP seen). Everything else stays NOT TESTED.
//   - A timeline of connection interruptions, warnings and HELP requests becomes a downloadable report.
//     Text only: no audio or video is ever recorded.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { renderReportHtml } from './report.js';

export const CHECKS = [
  { id: 'obs', name: 'OBS connection' },
  { id: 'director', name: 'Director Studio connection' },
  { id: 'host', name: 'Host Dashboard connection' },
  { id: 'tunnel', name: 'Georgie\'s public link' },
  { id: 'camera', name: 'Camera permission' },
  { id: 'mic', name: 'Microphone permission' },
  { id: 'playback', name: 'Audio playback' },
  { id: 'call', name: 'Private call connectivity' },
  { id: 'screen', name: 'Screen sharing' },
  { id: 'help', name: 'HELP notification test' },
  { id: 'safety', name: 'Broadcast safety' },
];
const PEOPLE = ['director', 'host'];
const NAME = { director: 'Andrej', host: 'Georgie' };
const TIMELINE_KEEP = 500;
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

export function createRehearsal({ state, clients, obs, store, tunnel, changed, notify }) {
  state.rehearsal ??= { active: false };
  state.reports ??= [];
  const reportsDir = path.join(store.dir, 'reports');
  const echoes = new Map();
  const R = () => state.rehearsal;

  function blankChecks() {
    return Object.fromEntries(CHECKS.map(c => [c.id, { status: 'untested', detail: '', at: 0, parts: {} }]));
  }
  function set(id, status, detail, parts) {
    if (!R().active) return;
    const c = R().checks[id];
    detail = str(detail, 240);
    if (c.status === status && c.detail === detail && !parts) return; // unchanged: no write, no broadcast (re-runs pass through 'running' first)
    Object.assign(c, { status, detail, at: Date.now() }, parts ? { parts } : {});
    changed();
  }

  /* ---------- timeline ---------- */
  function record(kind, level, text) {
    if (!R().active) return;
    R().timeline.push({ ts: Date.now(), kind: kind || '', level, text: str(text, 300) });
    if (R().timeline.length > TIMELINE_KEEP) R().timeline.splice(0, R().timeline.length - TIMELINE_KEEP);
  }

  /* ---------- lifecycle ---------- */
  function start() {
    if (R().active) throw new Error('A rehearsal is already running');
    state.rehearsal = { active: true, id: new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '-' + crypto.randomBytes(2).toString('hex'),
      startedAt: Date.now(), checks: blankChecks(), timeline: [], headphones: false, requests: 0 };
    record('rehearsal', 'ok', 'Rehearsal started. YouTube stream and OBS recording are locked.');
    // what is already true at the start counts as the first interruption baseline
    if (![...clients].some(c => c.role === 'host')) record('host-down', 'warn', 'Georgie is not connected yet');
    if (!obs.state.connected) record('obs-down', 'warn', 'OBS is not connected');
    notify('ok', 'rehearsal', 'Rehearsal started. Streaming and recording are locked.', { to: ['director', 'host'] });
    changed();
    runAuto().catch(() => {});
  }

  function end() {
    if (!R().active) throw new Error('No rehearsal is running');
    record('rehearsal', 'ok', 'Rehearsal ended');
    const report = buildReport(Date.now());
    fs.mkdirSync(reportsDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(reportsDir, report.id + '.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    state.reports.unshift({ id: report.id, startedAt: report.startedAt, endedAt: report.endedAt, summary: report.summary });
    state.reports = state.reports.slice(0, 30);
    state.rehearsal = { active: false, lastReport: report.id };
    notify('ok', 'rehearsal', 'Rehearsal ended. The report is ready to download.', { to: ['director', 'host'] });
    changed();
    return { id: report.id };
  }

  /* ---------- automatic checks: measured here ---------- */
  function echo(client, ms = 5000) {
    const nonce = crypto.randomBytes(8).toString('hex');
    const t0 = Date.now();
    return new Promise(resolve => {
      const timer = setTimeout(() => { echoes.delete(nonce); resolve(null); }, ms);
      echoes.set(nonce, () => { clearTimeout(timer); echoes.delete(nonce); resolve(Date.now() - t0); });
      client.send({ t: 'check.echo', nonce });
    });
  }
  function echoReply(nonce) { echoes.get(String(nonce))?.(); }

  async function runAuto() {
    if (!R().active) return;
    for (const id of ['obs', 'director', 'host', 'tunnel', 'safety']) if (R().checks[id].status !== 'pass') set(id, 'running', 'Checking…');
    await Promise.all([checkObs(), checkLink('director'), checkLink('host'), checkTunnel()]);
    checkSafety();
  }
  async function checkObs() {
    if (!obs.state.connected) return set('obs', 'fail', `Not connected: ${obs.state.error || 'OBS is not running'}. Open OBS; the studio reconnects by itself. The rehearsal works without OBS.`);
    const t0 = Date.now();
    try {
      const v = await obs.request('GetVersion');
      const ms = Date.now() - t0;
      set('obs', ms > 500 ? 'warn' : 'pass', `OBS ${v.obsVersion || ''} answered in ${ms} ms`);
    } catch (e) { set('obs', 'fail', 'OBS did not answer: ' + e.message); }
  }
  async function checkLink(role) {
    const list = [...clients].filter(c => c.role === role && c.ws.readyState === 1); // skip connections already closing
    const id = role === 'director' ? 'director' : 'host';
    if (!list.length) return set(id, 'fail', role === 'host' ? 'Georgie\'s dashboard is not open' : 'No Director Studio window connected');
    // the first window to answer proves the link; a half-open old connection must not hold the check up
    const ms = await new Promise(resolve => {
      let left = list.length;
      for (const c of list) echo(c).then(t => { if (t != null) resolve(t); else if (--left === 0) resolve(null); });
    });
    if (ms == null) return set(id, 'fail', 'Connected, but did not answer within 5 s');
    const via = role === 'host' ? (list.some(c => c.remote) ? ' via the public link' : ' on this Mac') : '';
    const limit = role === 'host' ? [1000, 2500] : [300, 1000];
    set(id, ms <= limit[0] ? 'pass' : ms <= limit[1] ? 'warn' : 'fail', `Round trip ${ms} ms${via}`);
  }
  async function checkTunnel() {
    if (!tunnel) return set('tunnel', 'untested', 'Tunnel watch not available');
    const t = await tunnel.check();
    const remoteHost = [...clients].some(c => c.role === 'host' && c.remote);
    if (!t.running) return set('tunnel', remoteHost ? 'warn' : 'warn', 'No public link running. Start it with the launcher or "npm run tunnel" (only needed for Melbourne).');
    set('tunnel', t.up ? (t.ms > 2000 ? 'warn' : 'pass') : 'fail', t.up ? `Public link answers from the internet in ${t.ms} ms` : `Public link not answering: ${t.error}. The launcher restarts it; send Georgie the new link.`);
  }
  function checkSafety() {
    const o = obs.state;
    if (o.stream.active) return set('safety', 'fail', 'THE STREAM IS LIVE. It was not started by the rehearsal. Stop it in OBS if this is not intended.');
    if (!o.connected) return set('safety', 'warn', 'OBS is offline, so nothing can stream. Lock is on for when OBS connects.');
    if (o.record.active) return set('safety', 'warn', 'OBS is recording (not started by the studio). Streaming is locked.');
    set('safety', 'pass', 'Not streaming, not recording. Stream and recording are locked during the rehearsal.');
  }

  /* ---------- checks verified by the people ---------- */
  function personResult(role, check, ok, detail) {
    if (!R().active || !['camera', 'mic', 'playback'].includes(check)) return;
    const c = R().checks[check];
    c.parts = { ...c.parts, [role]: { ok: !!ok, detail: str(detail, 120), at: Date.now() } };
    combine(check);
    record(check, ok ? 'ok' : 'warn', `${NAME[role]}: ${CHECKS.find(x => x.id === check).name} ${ok ? 'verified' : 'FAILED'}${detail ? ' (' + str(detail, 80) + ')' : ''}`);
    if (!ok) notify('warn', check === 'playback' ? 'playback' : 'device', `${NAME[role]}'s ${check === 'mic' ? 'microphone' : check === 'camera' ? 'camera' : 'audio playback'} is not working${detail ? ': ' + str(detail, 80) : ''}`, { to: ['director'] });
  }
  function combine(check) {
    const c = R().checks[check];
    const p = c.parts || {};
    const done = PEOPLE.filter(r => p[r]);
    const failed = done.filter(r => !p[r].ok);
    const words = PEOPLE.map(r => `${NAME[r]} ${p[r] ? (p[r].ok ? '✓' : '✗') : '—'}${p[r]?.detail ? ' ' + p[r].detail : ''}`).join(' · ');
    c.status = failed.length ? 'fail' : done.length === 2 ? 'pass' : done.length ? 'warn' : 'untested';
    c.detail = str(done.length === 1 && !failed.length ? words + ' (waiting for ' + NAME[PEOPLE.find(r => !p[r])] + ')' : words, 240);
    c.at = Date.now();
    changed();
  }

  /* ---------- hooks from the call and HELP layers ---------- */
  const callSeen = { count: 0, route: '', rtt: 0, screen: '' };
  const hooks = {
    onCall(type, info) {
      if (!R().active) return;
      if (type === 'start') { callSeen.count++; record('call-start', 'ok', 'Private call connected'); }
      if (type === 'end') record(info.dropped ? 'call-drop' : 'call-end', info.dropped ? 'warn' : 'ok', `Private call ended (${info.reason}, ${info.secs} s)`);
    },
    onStats(role, s) {
      if (!R().active) return;
      const c = R().checks.call;
      const ok = s.rtt > 0 || s.fps > 0;
      c.parts = { ...c.parts, [role]: { ok, detail: `${s.route || 'route ?'} ${s.rtt} ms`, at: Date.now(), rtt: s.rtt, fps: s.fps } };
      const both = PEOPLE.every(r => c.parts[r]?.ok);
      const worst = Math.max(...PEOPLE.map(r => c.parts[r]?.rtt || 0));
      if (both) {
        callSeen.route = s.route; callSeen.rtt = worst;
        Object.assign(c, { status: worst > 400 ? 'warn' : 'pass', detail: `Audio/video flowing both ways, ${s.route}, round trip up to ${worst} ms${worst > 400 ? ' (high: expect delay)' : ''}`, at: Date.now() });
      } else Object.assign(c, { status: 'warn', detail: 'Connected on one side so far…', at: Date.now() });
      // screen sharing counts only when the receiving side actually gets frames of the shared screen
      if (s.peerScreen && s.fps > 0) {
        const dir = role === 'director' ? 'Georgie → Vienna' : 'Vienna → Melbourne';
        const sc = R().checks.screen;
        const seen = new Set((sc.detail.match(/(Georgie → Vienna|Vienna → Melbourne)/g) || []));
        if (!seen.has(dir)) { seen.add(dir); callSeen.screen = [...seen].join(', '); Object.assign(sc, { status: 'pass', detail: `Shared screen received (${[...seen].join(', ')}), ${s.fps} fps`, at: Date.now() }); record('screen', 'ok', `Screen sharing verified: ${dir}`); }
      }
      changed();
    },
    onHelp(type, item) {
      if (!R().active) return;
      if (type === 'raise') record('help', item.level === 'normal' ? 'warn' : 'bad', `HELP ${item.level.toUpperCase()}${item.auto ? ' (automatic)' : ''}: ${item.text || item.kind}`);
      const hc = R().checks.help;
      if (type === 'raise' && item.by === 'host' && hc.status !== 'pass') Object.assign(hc, { status: 'warn', detail: 'Request delivered to Vienna. Waiting for Andrej to press Seen…', at: Date.now() });
      if ((type === 'ack' || type === 'resolve') && item.by === 'host' && item.at >= R().startedAt) {
        Object.assign(hc, { status: 'pass', detail: `Georgie's request reached Vienna and was answered after ${Math.max(1, Math.round(((item.ackAt || item.resolvedAt) - item.at) / 1000))} s`, at: Date.now() });
      }
      changed();
    },
  };

  /* ---------- report ---------- */
  function buildReport(endedAt) {
    const r = R(), tl = r.timeline;
    const pairs = [['host', 'Georgie\'s dashboard offline'], ['director', 'Director Studio offline'], ['obs', 'OBS disconnected'], ['tunnel', 'Public link down']];
    const interruptions = [];
    for (const [k, what] of pairs) {
      let open = null;
      for (const e of tl) {
        if (e.kind === k + '-down' && !open) open = e.ts;
        if (e.kind === k + '-up' && open) { interruptions.push({ what, from: open, to: e.ts }); open = null; }
      }
      if (open) interruptions.push({ what, from: open, to: null });
    }
    for (const e of tl) if (e.kind === 'call-drop') interruptions.push({ what: 'Private call dropped', from: e.ts, to: e.ts });
    interruptions.sort((a, b) => a.from - b.from);
    const help = state.help.filter(h => h.at >= r.startedAt && h.at <= endedAt).map(h => ({ level: h.level, text: h.text, kind: h.kind, auto: h.auto, at: h.at, ackAt: h.ackAt || 0, status: h.status, note: h.note || '' })).reverse();
    const checks = CHECKS.map(c => ({ id: c.id, name: c.name, status: r.checks[c.id].status === 'running' ? 'untested' : r.checks[c.id].status, detail: r.checks[c.id].detail, at: r.checks[c.id].at }));
    const outstanding = [
      ...checks.filter(c => c.status === 'fail').map(c => `FAILED: ${c.name}. ${c.detail}`),
      ...checks.filter(c => c.status === 'warn').map(c => `Warning: ${c.name}. ${c.detail}`),
      ...checks.filter(c => c.status === 'untested').map(c => `Not tested: ${c.name}`),
      // automatic normal-level notes ("was disconnected, now back") are information, not open requests
      ...help.filter(h => h.status !== 'resolved' && !h.ackAt && !(h.auto && h.level === 'normal')).map(h => `HELP not answered: ${h.text || h.kind}`),
      ...interruptions.filter(i => !i.to).map(i => `${i.what} at the end of the rehearsal`),
      ...(r.headphones ? [] : ['Andrej did not confirm headphones in Vienna']),
    ];
    const warnings = tl.filter(e => e.level === 'warn' || e.level === 'bad' || e.level === 'critical');
    return {
      id: r.id, startedAt: r.startedAt, endedAt, generatedAt: Date.now(), checks, interruptions, help, warnings, outstanding,
      call: { connected: callSeen.count > 0, count: callSeen.count, route: callSeen.route, rtt: callSeen.rtt, screen: callSeen.screen },
      timeline: tl,
      summary: { interruptions: interruptions.length, help: help.length, checks: checks.length, passed: checks.filter(c => c.status === 'pass').length, outstanding: outstanding.length },
      recordings: 'none',
    };
  }
  function readReport(id) {
    if (!/^[0-9a-z-]{8,40}$/.test(id)) return null;
    try { return JSON.parse(fs.readFileSync(path.join(reportsDir, id + '.json'), 'utf8')); } catch { return null; }
  }

  /* ---------- messages ---------- */
  async function handle(client, msg) {
    const { role } = client;
    switch (msg.t) {
      case 'check.echo': echoReply(msg.nonce); return;
      case 'check.result':
        if (!['director', 'host'].includes(role)) throw new Error('Not allowed');
        return personResult(role, str(msg.check, 20), !!msg.ok, msg.detail);
    }
    if (role !== 'director') throw new Error('Only the director runs the rehearsal');
    switch (msg.t) {
      case 'rehearsal.start': return start();
      case 'rehearsal.end': return end();
      case 'rehearsal.check':
        if (!R().active) throw new Error('Start the rehearsal first');
        if (msg.check === 'auto' || !msg.check) return runAuto();
        if (msg.check === 'obs') return checkObs();
        if (msg.check === 'director' || msg.check === 'host') return checkLink(msg.check);
        if (msg.check === 'tunnel') return checkTunnel();
        if (msg.check === 'safety') return checkSafety();
        throw new Error('That check is verified by a person, not automatically');
      case 'rehearsal.ask': {
        // ask Georgie to run her part of the checks on her own screen
        if (!R().active) throw new Error('Start the rehearsal first');
        if (![...clients].some(c => c.role === 'host')) throw new Error('Georgie is not online');
        const items = (Array.isArray(msg.items) ? msg.items : ['camera', 'playback', 'help']).filter(i => ['camera', 'playback', 'help', 'screen'].includes(i));
        for (const c of clients) if (c.role === 'host') c.send({ t: 'check.request', items });
        R().requests++;
        record('ask', 'ok', `Asked Georgie to run: ${items.join(', ')}`);
        changed();
        return;
      }
      case 'rehearsal.headphones': R().headphones = !!msg.on; record('headphones', 'ok', `Andrej ${msg.on ? 'confirmed' : 'unconfirmed'} headphones`); changed(); return;
      default: throw new Error(`Unknown message ${msg.t}`);
    }
  }

  function view(role) {
    const r = R();
    if (role === 'director') return {
      rehearsal: r.active ? { active: true, id: r.id, startedAt: r.startedAt, checks: r.checks, timeline: r.timeline.slice(-80), headphones: r.headphones } : { active: false, lastReport: r.lastReport || null },
      reports: state.reports.slice(0, 8),
      tunnel: tunnel ? { running: tunnel.status.running, up: tunnel.status.up, ms: tunnel.status.ms, checkedAt: tunnel.status.checkedAt, error: tunnel.status.error, restarts: tunnel.status.restarts || 0 } : null,
    };
    return { rehearsal: { active: !!r.active, startedAt: r.startedAt || 0 } };
  }

  // keep the safety check honest while the rehearsal runs: re-evaluated whenever OBS state changes
  obs.on('state', () => { if (R().active && R().checks.safety.status !== 'untested') { const before = R().checks.safety.status; checkSafety(); if (before !== R().checks.safety.status && R().checks.safety.status === 'fail') notify('critical', 'safety', 'The stream is live during the rehearsal (not started by the studio).', { sound: true }); } });

  return { handle, view, record, hooks, readReport, renderHtml: renderReportHtml, get active() { return !!R().active; } };
}
