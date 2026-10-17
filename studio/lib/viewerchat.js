// VIEWER CHAT: the retro live chat on distancezeroshow.com, brought into the studio. The website talks to a Supabase
// Realtime channel (broadcast event "msg" { nick, text }, presence = who has picked a nickname). The studio server joins
// the same channel over one WebSocket (the Phoenix protocol Realtime speaks, so no extra library), keeps the last
// messages in memory for Andrej and Georgie, and can answer as the show under a nickname viewers cannot take.
// Messages are never stored on disk: the chat on the website is live-only too.
import WebSocket from 'ws';

const MAX = 150;

export function createViewerChat({ url, key, room, log = () => {}, onChange = () => {} }) {
  const msgs = [];
  let ws = null, ref = 0, joinRef = '', beat = 0, retry = 0, retryT = 0, stopped = false, joined = false, online = new Map();
  const topic = 'realtime:' + room;
  const send = (event, payload, t = topic) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ topic: t, event, payload, ref: String(++ref), join_ref: t === topic ? joinRef : undefined })); };
  const push = m => { msgs.push(m); if (msgs.length > MAX) msgs.splice(0, msgs.length - MAX); onChange(); };

  function presence(state, diff) {
    if (state) { online = new Map(); for (const [k, v] of Object.entries(state)) online.set(k, v.metas || []); }
    if (diff) {
      for (const [k, v] of Object.entries(diff.joins || {})) online.set(k, v.metas || []);
      for (const k of Object.keys(diff.leaves || {})) online.delete(k);
    }
    onChange();
  }

  function connect() {
    if (stopped) return;
    const wsUrl = url.replace(/^http/, 'ws').replace(/\/$/, '') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(key) + '&vsn=1.0.0';
    ws = new WebSocket(wsUrl);
    ws.on('open', () => {
      retry = 0; joinRef = String(++ref);
      ws.send(JSON.stringify({ topic, event: 'phx_join', ref: joinRef, join_ref: joinRef,
        payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, postgres_changes: [], private: false }, access_token: key } }));
      clearInterval(beat); beat = setInterval(() => send('heartbeat', {}, 'phoenix'), 25000);
    });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.topic !== topic) return;
      if (m.event === 'phx_reply' && m.ref === joinRef) {
        joined = m.payload?.status === 'ok';
        log(joined ? 'ok' : 'warn', joined ? 'Viewer chat connected (website live chat)' : 'Viewer chat: the website chat refused the studio: ' + JSON.stringify(m.payload?.response || {}).slice(0, 120));
        onChange();
      } else if (m.event === 'broadcast' && m.payload?.event === 'msg') {
        const p = m.payload.payload || {};
        if (typeof p.nick === 'string' && typeof p.text === 'string') push({ nick: p.nick.slice(0, 20), text: p.text.slice(0, 280), at: Date.now() });
      } else if (m.event === 'presence_state') presence(m.payload, null);
      else if (m.event === 'presence_diff') presence(null, m.payload);
    });
    ws.on('close', () => {
      clearInterval(beat); const was = joined; joined = false; ws = null;
      if (was) { log('warn', 'Viewer chat disconnected: reconnecting'); onChange(); }
      if (!stopped) { clearTimeout(retryT); retryT = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++)); }
    });
    ws.on('error', () => {});
  }
  connect();

  return {
    view() {
      const nicks = [...online.values()].flat().map(p => p.nick).filter(Boolean);
      return { connected: joined, online: nicks.length, messages: msgs.slice(-100) };
    },
    // the hosts answer under their own on-air names, which the website keeps reserved for the show
    say(nick, text) {
      if (!joined) throw new Error('The viewer chat is not connected');
      const t = String(text || '').trim().slice(0, 280);
      if (!t) throw new Error('Write a message first');
      send('broadcast', { type: 'broadcast', event: 'msg', payload: { nick, text: t } });
      push({ nick, text: t, at: Date.now(), show: true });
    },
    stop() { stopped = true; clearTimeout(retryT); clearInterval(beat); try { ws?.close(); } catch {} },
  };
}
