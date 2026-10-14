// The public sign-in page sends the Director here (this Mac only) with a one-time ticket in the # part,
// which never reaches a server log. The ticket becomes the Director session, then the Director Studio opens.
const t = new URLSearchParams(location.hash.slice(1)).get('t') || '';
history.replaceState(null, '', location.pathname);
const msg = document.getElementById('msg');
fetch('/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t }) })
  .then(r => r.json()).then(j => { if (j.ok) location.replace('/'); else { msg.textContent = j.error; setTimeout(() => location.replace('/login'), 2500); } })
  .catch(() => { msg.textContent = 'The Director Studio opens only on the Vienna Mac.'; });
