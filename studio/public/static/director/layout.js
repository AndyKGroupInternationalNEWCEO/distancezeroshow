// WINDOW LAYOUT — remember which workspace runs in which window, where and how big (several screens), and open
// them again in the same places. Every open Director window answers a "where are you?" call over a
// BroadcastChannel; the answers are saved in this browser (localStorage). Browsers allow one new window per click,
// so each saved window gets its own Open button.
import { $, h, toast } from '../common.js';

const KEY = 'dz-layout', LABEL = { live: 'Live Control', show: 'Show Control', tech: 'Technical', rehearse: 'Rehearsal' };
const me = () => ({ name: window.name || 'main', ws: location.hash.slice(1) || 'live', x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight });
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };

export function initLayout() {
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('dz-layout') : null;
  bc?.addEventListener('message', e => { if (e.data?.t === 'where') bc.postMessage({ t: 'here', from: e.data.id, win: me() }); });

  const panel = h('div', { class: 'layout-pop', id: 'layoutPop', hidden: '', role: 'dialog', 'aria-label': 'Window layout' });
  document.body.append(panel);
  const btn = $('#layoutBtn');
  btn.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) render(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) panel.hidden = true; });

  async function save() {
    const id = Math.random().toString(36).slice(2), wins = [me()];
    if (bc) {
      const on = e => { if (e.data?.t === 'here' && e.data.from === id) wins.push(e.data.win); };
      bc.addEventListener('message', on);
      bc.postMessage({ t: 'where', id });
      await new Promise(r => setTimeout(r, 400));
      bc.removeEventListener('message', on);
    }
    const seen = new Set(), list = wins.filter(w => !seen.has(w.name) && seen.add(w.name));
    try { localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), windows: list })); } catch {}
    toast(`Layout saved: ${list.length} window${list.length > 1 ? 's' : ''}`);
    render();
  }

  function open(w) {
    if (w.name === (window.name || 'main')) { location.hash = w.ws; return; }
    const win = window.open(location.pathname + '#' + w.ws, w.name, `popup,left=${w.x},top=${w.y},width=${w.w},height=${w.h}`);
    if (!win) toast('The browser blocked the window. Allow pop-ups for the studio and try again.');
    else win.opener = null;
  }

  function render() {
    const L = load();
    panel.replaceChildren(
      h('p', { class: 'lp-h', text: 'Window layout' }),
      h('button', { type: 'button', class: 'b sm', text: 'Save this layout', onclick: save }),
      L ? h('p', { class: 'lp-meta', text: `Saved ${new Date(L.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` })
        : h('p', { class: 'lp-meta', text: 'Open workspaces in their own windows (⧉), place them on your screens, then save.' }),
      ...(L?.windows || []).map(w => h('div', { class: 'lp-row' },
        h('span', { text: `${LABEL[w.ws] || w.ws}${w.name === 'main' ? ' (main window)' : ''} · ${w.w}×${w.h}` }),
        h('button', { type: 'button', class: 'b sm quiet', text: w.name === (window.name || 'main') ? 'Show here' : 'Open', onclick: () => open(w) }))));
  }
}
