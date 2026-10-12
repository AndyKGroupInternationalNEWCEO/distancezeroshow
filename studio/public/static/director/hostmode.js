// HOST MODE — Andrej presenting. The same view Georgie has (monitors, show clock, live script with teleprompter,
// break monitors, private notes), inside the Director page and the same signed-in session: no other rights,
// no second login. The tabs and Director controls are hidden, not stopped; DIRECTOR brings them back.
import { $, clock } from '../common.js';
import { createMonitors, createClock, createScript, createBreakMonitors } from '../showpanels.js';

let mons, clk, script, brk;
export function init(ctx) {
  mons = createMonitors($('#hmMons'), { programLabel: 'LIVE PROGRAM' });
  clk = createClock($('#hmClock'));
  script = createScript($('#hmScript'), { me: "ANDY'K", role: 'andrej-host', conn: ctx.conn });
  brk = createBreakMonitors($('#hmBreak'), { call: { get phase() { return ctx.call?.phase; }, streams: () => ctx.call?.streams?.(), micOn: () => ctx.call?.micOn?.() }, role: 'host' });
}
export const frame = f => mons?.frame(f);
export function render(ctx) {
  if (!ctx.hostMode) return;
  const S = ctx.S, r = S.rundown;
  script.render(S);
  $('#hmEp').textContent = [r.title, r.episode?.date && `${r.episode.date} ${r.episode.start} Vienna`].filter(Boolean).join(' · ');
  const lb = $('#hmLock');
  lb.textContent = r.locked ? 'SCRIPT LOCKED — READY FOR BROADCAST' : r.lockAt ? `Script locks ${clock('vie', r.lockAt, false)} Vienna` : '';
  lb.className = 'badge ' + (r.locked ? 'lock' : 'off');
}
export function tick(ctx) {
  if (!ctx.hostMode) return;
  clk.tick(ctx.S); brk.tick(ctx.S); mons.update(ctx.S);
}
