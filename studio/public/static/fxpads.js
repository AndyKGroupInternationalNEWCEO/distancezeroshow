// SOUND FX pads for Georgie and an on-air guest: one button per effect, played through the OBS FX Player in Vienna.
// The Director sets each effect's volume; here it is press to play, nothing else.
import { h, toast } from './common.js';

export function renderFxPads(root, card, pads, conn, air) {
  card.hidden = !pads?.length;
  const sig = JSON.stringify([pads, air?.id]);
  if (root.dataset.sig === sig) return;
  root.dataset.sig = sig;
  root.replaceChildren(...(pads || []).map(x => h('button', {
    type: 'button', class: 'b fxbtn' + (air?.id === x.id ? ' on' : ''), disabled: !x.available,
    title: x.available ? 'Plays on air' : 'Not available right now',
    onclick: async e => {
      const b = e.currentTarget; b.disabled = true;
      try { const r = await conn.send({ t: 'fx.play', fx: x.id }); if (r && r.ok === false) throw new Error(r.error); }
      catch (err) { toast(err.message || 'Could not play', 'warn'); }
      finally { setTimeout(() => { b.disabled = !x.available; }, 1500); }
    },
  }, h('b', { text: x.title }))));
}
