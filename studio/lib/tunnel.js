// Georgie's public link to the HOST port only: Tailscale Funnel (a STABLE https://<mac>.<tailnet>.ts.net address) when
// Tailscale is installed and signed in, otherwise a free Cloudflare quick tunnel (a new address on every start).
//   startTunnel  runs cloudflared, restarts it if it dies (the address then changes), records the current
//                address (never the access code) in data/tunnel.json for the studio to watch.
//   watchTunnel  used by the studio server: reads that file and probes the public address from the internet
//                side, so "Georgie's link works" is measured, not assumed.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FILE = 'tunnel.json';

export function hasCloudflared() {
  try { execFileSync('cloudflared', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

export function startTunnel({ port, dataDir, onUrl = () => {}, onDown = () => {}, log = console, verbose = false }) {
  let proc = null, stopped = false, restarts = 0, url = '';
  const file = path.join(dataDir, FILE);
  const write = () => {
    try { fs.writeFileSync(file, JSON.stringify({ url, pid: process.pid, port, startedAt: Date.now(), restarts }), { mode: 0o600 }); } catch {}
  };
  function run() {
    url = '';
    proc = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    const scan = buf => {
      const text = String(buf);
      if (verbose) process.stderr.write(text);
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !url) { url = m[0]; write(); onUrl(url, restarts); }
    };
    proc.stdout.on('data', scan);
    proc.stderr.on('data', scan);
    proc.on('exit', code => {
      proc = null;
      if (stopped) return;
      try { fs.unlinkSync(file); } catch {}
      restarts++;
      const wait = Math.min(30000, 2000 * restarts);
      onDown(`cloudflared stopped (exit ${code}); restarting in ${wait / 1000} s. Georgie will need the NEW link.`);
      setTimeout(() => { if (!stopped) run(); }, wait);
    });
  }
  run();
  return {
    get url() { return url; },
    stop() {
      stopped = true;
      try { fs.unlinkSync(file); } catch {}
      if (proc) proc.kill('SIGTERM');
    },
  };
}

/* ---------- Tailscale Funnel: the same address every time ---------- */

const TS_CLI = ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/opt/homebrew/bin/tailscale', '/usr/local/bin/tailscale'];

// the Tailscale command line, or '' when Tailscale is not installed
export function tailscaleCli() {
  for (const p of TS_CLI) { try { execFileSync(p, ['version'], { stdio: 'ignore', timeout: 5000 }); return p; } catch {} }
  return '';
}

// signed in and connected? and this Mac's name on the tailnet (the stable address)
export function tailscaleState(cli) {
  try {
    const st = JSON.parse(execFileSync(cli, ['status', '--json'], { encoding: 'utf8', timeout: 8000 }));
    return { running: st.BackendState === 'Running', state: st.BackendState || '', host: String(st.Self?.DNSName || '').replace(/\.$/, '') };
  } catch (e) { return { running: false, state: 'unavailable', host: '' }; }
}

// runs `tailscale funnel <port>` in the foreground: Georgie's link exists exactly while the studio runs,
// as with the Cloudflare tunnel. Restarted if it stops; the address stays the same.
export function startFunnel({ cli, port, dataDir, onUrl = () => {}, onDown = () => {}, onApproval = () => {}, verbose = false }) {
  let proc = null, stopped = false, restarts = 0, url = '';
  const file = path.join(dataDir, FILE);
  const host = tailscaleState(cli).host;
  const write = () => {
    try { fs.writeFileSync(file, JSON.stringify({ url, pid: process.pid, port, startedAt: Date.now(), restarts, provider: 'tailscale', stable: true }), { mode: 0o600 }); } catch {}
  };
  function run() {
    proc = spawn(cli, ['funnel', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let announced = false;
    const scan = buf => {
      const text = String(buf);
      if (verbose) process.stderr.write(text);
      // first time only: Funnel must be switched on for the tailnet (one click in the browser, by the account owner)
      const ok = text.match(/https:\/\/login\.tailscale\.com\/[^\s]+/);
      if (ok) onApproval(ok[0]);
      const m = text.match(/https:\/\/[a-z0-9.-]+\.ts\.net/i);
      if ((m || /Available on the internet/i.test(text)) && !announced) {
        announced = true;
        url = m ? m[0] : 'https://' + host;
        write(); onUrl(url, restarts);
      }
    };
    proc.stdout.on('data', scan);
    proc.stderr.on('data', scan);
    proc.on('exit', code => {
      proc = null;
      if (stopped) return;
      try { fs.unlinkSync(file); } catch {}
      restarts++;
      const wait = Math.min(30000, 2000 * restarts);
      onDown(`Tailscale Funnel stopped (exit ${code}); restarting in ${wait / 1000} s. Georgie's link stays the same.`);
      setTimeout(() => { if (!stopped) run(); }, wait);
    });
  }
  run();
  return {
    get url() { return url; },
    stop() {
      stopped = true;
      try { fs.unlinkSync(file); } catch {}
      if (proc) proc.kill('SIGTERM');
    },
  };
}

export function watchTunnel({ dataDir, every = 15000, onChange = () => {} }) {
  const file = path.join(dataDir, FILE);
  let status = { running: false, url: '', up: false, checkedAt: 0, ms: 0, error: '' };
  let timer = null, busy = false, lastUrl = ''; // remembered across restarts: a different address means Georgie needs the new link
  const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

  async function check() {
    if (busy) return status;
    busy = true;
    const before = status;
    let info = null;
    try { info = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    if (!info?.url || (info.pid && !alive(info.pid))) {
      status = { running: false, url: '', up: false, checkedAt: Date.now(), ms: 0, error: info?.url ? 'The tunnel process is gone' : '' };
    } else {
      const t0 = Date.now();
      try {
        const r = await fetch(info.url + '/healthz', { signal: AbortSignal.timeout(6000), cache: 'no-store' });
        status = { running: true, url: info.url, up: r.ok, checkedAt: Date.now(), ms: Date.now() - t0, error: r.ok ? '' : 'HTTP ' + r.status, restarts: info.restarts || 0 };
      } catch (e) {
        status = { running: true, url: info.url, up: false, checkedAt: Date.now(), ms: 0, error: e.name === 'TimeoutError' ? 'No answer from the public address' : e.message, restarts: info.restarts || 0 };
      }
    }
    busy = false;
    status.newAddress = !!(status.up && status.url && lastUrl && status.url !== lastUrl);
    if (status.up) lastUrl = status.url; // the last address that actually worked
    if (before.up !== status.up || before.url !== status.url || before.running !== status.running) onChange(status, before);
    return status;
  }
  check();
  timer = setInterval(check, every);
  return { get status() { return status; }, check, stop() { clearInterval(timer); } };
}
