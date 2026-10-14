// Spoken lines of a segment script, shared by the server (PDF export) and the dashboards (teleprompter).
// "ANDY'K: …" / "GEORGIE: …" (also ANDREJ, BOTH, GUEST) mark the speaker until the next marker.
// "[DIRECTOR] …", "[CUE] …" and "[TECH] …" lines are technical instructions: never spoken, never in the teleprompter.
export function speakerLines(script) {
  const out = [];
  let speaker = '';
  for (const raw of String(script ?? '').slice(0, 20000).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { out.push({ speaker, text: '' }); continue; }
    if (/^\[(DIRECTOR|CUE|TECH)[^\]]*\]/i.test(line)) continue;
    const m = /^(ANDY'?K|ANDREJ|GEORGIE|BOTH|GUEST)\s*:\s*(.*)$/i.exec(line);
    if (m) { speaker = m[1].toUpperCase().replace('ANDYK', "ANDY'K").replace('ANDREJ', "ANDY'K"); out.push({ speaker, text: m[2] }); }
    else out.push({ speaker, text: line });
  }
  return out;
}
// the technical lines inside a script ([DIRECTOR] / [CUE] / [TECH]), shown to the Director apart from the spoken text
export const techLines = script => String(script ?? '').split(/\r?\n/).map(l => l.trim()).filter(l => /^\[(DIRECTOR|CUE|TECH)[^\]]*\]/i.test(l));
