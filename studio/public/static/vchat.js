// VIEWER CHAT window: the website's live chat inside the studio (Director SHOW tab and Georgie's page). It shows while
// the show runs or messages arrive, and lights up in the live-chat segment. Answers go out under the host's reserved name.
import { h } from './common.js';

export function createViewerChatCard(root, conn, { me = 'Andrej', readOnly = false } = {}) {
  const log = h('ol', { class: 'vc-log', 'aria-live': 'polite' });
  const status = h('span', { class: 'badge' }), title = h('h2', { text: 'Live chat // viewers' });
  const input = h('input', { class: 'in', maxlength: '280', placeholder: `Answer the viewers as ${me}`, 'aria-label': 'Answer in the live chat' });
  const form = h('form', { class: 'chat-form', autocomplete: 'off' }, input, h('button', { class: 'b primary', type: 'submit', text: 'Send' }));
  const hint = h('p', { class: 'hint vc-hint', text: '' });
  root.replaceChildren(h('div', { class: 'card-h' }, title, h('div', { class: 'aside' }, status)), log, readOnly ? null : form, hint);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const t = input.value.trim(); if (!t) return;
    conn.send({ t: 'vchat.say', text: t }).then(() => { input.value = ''; }, err => { hint.textContent = err.message; });
  });
  let shown = 0;
  return {
    update(S) {
      const v = S.viewerChat;
      const rd = S.rundown, seg = rd && rd.index >= 0 ? rd.segments?.[rd.index] : S.segment || null;
      const chatSeg = !!seg && /CHAT|COMMUNITY/i.test(seg.title || '');
      const running = !!(rd && rd.index >= 0) || !!S.segment || readOnly;
      root.hidden = !v || (!running && !v.messages.length);
      if (root.hidden) return;
      root.classList.toggle('vc-on', chatSeg);
      status.textContent = !v.connected ? 'Reconnecting…' : chatSeg ? `ON NOW · ${v.online} in chat` : `${v.online} in chat`;
      status.className = 'badge ' + (!v.connected ? 'warn' : chatSeg ? 'air' : 'ok');
      hint.textContent = readOnly ? 'What viewers write on distancezeroshow.com. Feel free to react on air; Andy\'K and Georgie answer here.'
        : chatSeg ? 'This is the live-chat segment: read the best messages out on air.' : 'Viewers write on distancezeroshow.com. Messages are live only and never saved.';
      if (v.messages.length !== shown || !log.children.length) {
        const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
        log.replaceChildren(...(v.messages.length ? v.messages.map(m => h('li', { class: 'vc-msg' + (m.show ? ' vc-show' : '') },
          h('b', { text: m.nick }), h('span', { text: ' ' + m.text }),
          h('time', { text: new Date(m.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })))
          : [h('li', { class: 'hint', text: 'No messages yet. They appear here the moment a viewer writes.' })]));
        if (atEnd || shown === 0) log.scrollTop = log.scrollHeight;
        shown = v.messages.length;
      }
      input.disabled = !v.connected;
    },
  };
}
