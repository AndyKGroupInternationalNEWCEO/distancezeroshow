// Sign in with an access code. A link like /login#code=XXXX fills it in: the part after # never reaches
// any server or log, and it is wiped from the address bar straight away.
const form = document.getElementById('form'), input = document.getElementById('code'), err = document.getElementById('err');
const fromLink = new URLSearchParams(location.hash.slice(1)).get('code');
if (location.hash) history.replaceState(null, '', location.pathname);

async function submit(code) {
  err.textContent = '';
  try {
    const r = await fetch('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) return location.replace('/');
    err.textContent = j.error || 'Sign-in failed.';
  } catch { err.textContent = 'Cannot reach the studio server.'; }
}
form.addEventListener('submit', e => { e.preventDefault(); submit(input.value); });
if (fromLink) { input.value = fromLink; submit(fromLink); } else input.focus();
