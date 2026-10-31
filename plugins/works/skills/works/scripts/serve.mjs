// Live-Board: kleiner lokaler HTTP-Server ohne Abhängigkeiten.
// Beobachtet .works/, meldet Änderungen per Server-Sent Events und nimmt Bearbeitungen aus dem Board an.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { worksDir, run } from './lib.mjs';
import { boardData, renderBoard, refreshBoardIfPresent } from './board.mjs';
import { generateIndex } from './views.mjs';
import { ApiError, runAction, saveAsset, taskDetail, ideasList, metaInfo, nextList, dodOf, codeOf, diffOf } from './api.mjs';
import { shareKeys, rotateKeys, shareLinks, lanAddresses } from './share.mjs';
import { buildSnapshot, snapshotName } from './export.mjs';
import { runningVersion, writeServer, clearServer, newestCli, cliVersion, OWN_CLI, startDetached, ensureGitignore } from './server-control.mjs';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8',
};
// Nur diese Bereiche von .works/ werden als Dateien ausgeliefert.
const PUBLIC_PREFIXES = ['tasks/', 'archive/', 'reports/', 'WORKS.md', 'ideas.md'];
const POLL_MS = 1000;
const KEEPALIVE_MS = 25000;
const MAX_JSON = 1024 * 1024;
const MAX_UPLOAD = 20 * 1024 * 1024;
const UPDATE_CHECK_MS = parseInt(process.env.WORKS_UPDATE_CHECK_MS || "30000", 10);

function statPart(file) {
  try { const s = fs.statSync(file); return `${s.mtimeMs}:${s.size}`; } catch { return '-'; }
}

// Fingerabdruck aller Dateien, die das Board beeinflussen. Generierte Dateien (WORKS.md, board.html) zählen nicht.
export function signature(root) {
  const wd = worksDir(root);
  const parts = ['config.json', 'state.json', 'ideas.md'].map((f) => statPart(path.join(wd, f)));
  for (const sub of ['tasks', 'archive']) {
    const base = path.join(wd, sub);
    let dirs = [];
    try { dirs = fs.readdirSync(base).sort(); } catch { continue; }
    for (const d of dirs) {
      const dir = path.join(base, d);
      parts.push(`${sub}/${d}`, statPart(path.join(dir, 'task.md')), statPart(path.join(dir, 'decisions.md')));
      try { parts.push(fs.readdirSync(path.join(dir, 'assets')).sort().join(',')); } catch { /* keine Assets */ }
    }
  }
  return parts.join('|');
}

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, ...SECURITY_HEADERS });
  res.end(body);
}
function json(res, status, obj) { send(res, status, 'application/json; charset=utf-8', JSON.stringify(obj)); }

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new ApiError(413, 'Datei oder Anfrage ist zu groß.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function serveBoard(root, { port = 4747, host = '127.0.0.1', open = false, fixedPort = false, takeover = false } = {}) {
  const wd = worksDir(root);
  const clients = new Set();
  // Zufällige Tokens pro Serverstart. Nur Seiten, die dieser Server ausgeliefert hat, kennen sie.
  // token erlaubt Lesen und Schreiben, viewToken nur Lesen (geteilter Link).
  const token = crypto.randomBytes(24).toString('hex');
  const viewToken = crypto.randomBytes(24).toString('hex');
  const shared = host === '0.0.0.0' || host === '::';
  let keys = shared ? shareKeys(root) : shareKeys(root, { create: false });
  // Öffentliche Kennung dieses Serverstarts. Ändert sie sich, laden offene Tabs neu und erhalten das neue Token.
  const serverId = crypto.randomBytes(6).toString('hex');
  const withServer = (d) => { d.meta.server = serverId; return d; };
  let sig = signature(root);
  let boundPort = port;

  const broadcast = () => {
    for (const res of clients) res.write(`event: update\ndata: ${Date.now()}\n\n`);
  };

  const tick = () => {
    let next;
    try { next = signature(root); } catch { return; }
    if (next === sig) return;
    try {
      boardData(root); // prüft, ob alles lesbar ist (Datei könnte gerade geschrieben werden)
      generateIndex(root);
      refreshBoardIfPresent(root);
    } catch { return; } // beim nächsten Durchlauf erneut versuchen
    sig = next;
    broadcast();
  };
  const timer = setInterval(tick, POLL_MS);
  const keepalive = setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, KEEPALIVE_MS);

  // Selbstprüfung: Ist inzwischen eine neuere Version installiert, übergibt der Server an sie.
  // Die neue Version muss bei zwei Prüfungen hintereinander gleich sein, damit kein halb kopiertes Update startet.
  let seenVersion = null;
  let handingOver = false;
  // Laufende Schreibaktionen. Vor Neustart oder Übergabe wird gewartet, bis sie fertig sind.
  let inflight = 0;
  let stopping = false;
  const drain = async (ms) => {
    stopping = true;
    const until = Date.now() + ms;
    while (inflight > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  };
  const updateTimer = setInterval(() => {
    if (handingOver) return;
    let cli; let v;
    try { cli = newestCli(); v = cliVersion(cli); } catch { return; }
    if (v === runningVersion()) { seenVersion = null; return; }
    if (seenVersion !== `${cli}|${v}`) { seenVersion = `${cli}|${v}`; return; }
    handOver(cli, v);
  }, UPDATE_CHECK_MS);
  updateTimer.unref();

  async function handOver(cli, v, newHost = host) {
    handingOver = true;
    await drain(15000);
    process.stdout.write(v ? `Neue Version ${v} gefunden, übergebe an ${cli}\n` : `Starte neu mit Host ${newHost}\n`);
    clearInterval(timer); clearInterval(keepalive); clearInterval(updateTimer);
    for (const res of clients) { res.write('event: restart\ndata: 1\n\n'); res.end(); }
    clients.clear();
    clearServer(root, process.pid);
    server.close();
    startDetached(root, { cli, port: boundPort, host: newHost, takeover: true });
    setTimeout(() => process.exit(0), 300).unref();
  }

  // Schutz vor DNS-Rebinding: nur lokale Hostnamen annehmen, außer der Nutzer hat bewusst 0.0.0.0 gewählt.
  // Der Port bleibt frei, weil Portweiterleitungen (etwa VS Code Remote-SSH) einen anderen lokalen Port nutzen können.
  const hostAllowed = (h) => {
    if (host === '0.0.0.0' || host === '::') return true;
    const name = String(h || '').toLowerCase().replace(/:\d+$/, '');
    return ['127.0.0.1', 'localhost', '[::1]', host.toLowerCase()].includes(name);
  };
  // Zugriffsstufe der Anfrage: edit, view oder null.
  // Lokal (Loopback ohne Proxy-Header) darf alles. Von außen braucht es den Schlüssel aus dem Link,
  // der nach dem ersten Aufruf als Cookie mitgeht, damit Live-Updates und Bilder funktionieren.
  const PROXY_HEADERS = ['x-forwarded-for', 'forwarded', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'x-forwarded-host'];
  // Beim Teilen nimmt der Server jeden Hostnamen an. Volle lokale Rechte gibt es dann nur für bekannte
  // Hostnamen, sonst könnte eine fremde Webseite per DNS-Rebinding als lokal durchgehen.
  const knownHost = (h) => {
    const name = String(h || '').toLowerCase().replace(/:\d+$/, '');
    return ['127.0.0.1', 'localhost', '[::1]'].includes(name) || lanAddresses().some((a) => a.address === name);
  };
  const isLocal = (req) => {
    const a = String(req.socket.remoteAddress || '');
    const loop = a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
    return loop && knownHost(req.headers.host) && !PROXY_HEADERS.some((h) => req.headers[h]);
  };
  const cookieKey = (req) => {
    const m = String(req.headers.cookie || '').match(/(?:^|;\s*)works_key=([\w-]+)/);
    return m ? m[1] : '';
  };
  const keyLevel = (k) => {
    if (!k || !keys) return null;
    if (safeEqual(k, keys.owner)) return 'edit';
    if (safeEqual(k, keys.view)) return 'view';
    return null;
  };
  const accessOf = (req, url) => {
    const viewParam = url && url.searchParams.get('view');
    const keyParam = url && url.searchParams.get('key');
    if (viewParam !== null && viewParam !== undefined && url.searchParams.has('view')) {
      if (isLocal(req)) return { level: 'view', set: keyLevel(viewParam) === 'view' ? viewParam : '' };
      return keyLevel(viewParam) === 'view' ? { level: 'view', set: viewParam } : null;
    }
    if (keyParam) return keyLevel(keyParam) === 'edit' ? { level: 'edit', set: keyParam } : null;
    if (isLocal(req)) return { level: 'edit' };
    if (!shared) return null;
    const level = keyLevel(cookieKey(req));
    return level ? { level } : null;
  };

  // API: Token im Header plus passender Origin, falls der Browser ihn mitsendet.
  const apiLevel = (req) => {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) return null;
    const t = req.headers['x-works-token'];
    if (safeEqual(t, token)) return 'edit';
    if (safeEqual(t, viewToken)) return 'view';
    return null;
  };

  async function handleApi(req, res, url) {
    const level = apiLevel(req);
    if (!level) return json(res, 403, { error: 'Zugriff verweigert. Board neu laden.' });
    if (level === 'view' && req.method !== 'GET') return json(res, 403, { error: 'Dieser Link ist nur zum Ansehen.' });
    if (stopping && req.method !== 'GET') return json(res, 503, { error: 'Das Board startet gerade neu. Bitte in ein paar Sekunden erneut versuchen.' });
    inflight++;
    try { return await handleApiInner(req, res, url, level); } finally { inflight--; }
  }

  function shareInfo() {
    return {
      shared, port: boundPort, host,
      links: shared ? shareLinks(root, boundPort) : [],
    };
  }

  async function handleApiInner(req, res, url, level) {
    const p = url.pathname;
    const q = url.searchParams;
    try {
      if (req.method === 'GET') {
        if (p === '/api/code') return json(res, 200, await codeOf(root, String(q.get('id') || '').toUpperCase()));
        if (p === '/api/diff') return json(res, 200, await diffOf(root, String(q.get('id') || '').toUpperCase(), q.get('file'), q.get('uncommitted') === '1'));
        if (level !== 'edit' && ['/api/share', '/api/export'].includes(p)) return json(res, 403, { error: 'Nur für den Besitzer des Boards.' });
        if (p === '/api/share') return json(res, 200, shareInfo());
        if (p === '/api/export') {
          const snap = buildSnapshot(root, { images: q.get('images') !== '0', closed: q.get('closed') !== '0' });
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS,
            'Content-Disposition': `attachment; filename="${snapshotName(root)}"`,
          });
          return res.end(snap.html);
        }
        if (p === '/api/meta') return json(res, 200, metaInfo(root));
        if (p === '/api/task') return json(res, 200, taskDetail(root, String(q.get('id') || '').toUpperCase()));
        if (p === '/api/dod') return json(res, 200, dodOf(root, String(q.get('id') || '').toUpperCase()));
        if (p === '/api/ideas') return json(res, 200, ideasList(root));
        if (p === '/api/next') return json(res, 200, nextList(root));
        return json(res, 404, { error: 'Unbekannter Endpunkt.' });
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'Nur GET und POST.' });
      if (p === '/api/action') {
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'JSON erwartet.' });
        let body;
        try { body = JSON.parse((await readBody(req, MAX_JSON)).toString('utf8')); } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, 'Ungültiges JSON.'); }
        const result = await runAction(root, body);
        tick();
        return json(res, 200, { ok: true, ...result });
      }
      if (p === '/api/share') {
        let body = {};
        try { body = JSON.parse((await readBody(req, MAX_JSON)).toString('utf8') || '{}'); } catch { throw new ApiError(400, 'Ungültiges JSON.'); }
        if (body.op === 'rotate') { keys = rotateKeys(root); return json(res, 200, { ok: true, message: 'Neue Links erzeugt. Die alten funktionieren nicht mehr.', ...shareInfo() }); }
        if (body.op === 'enable' || body.op === 'disable') {
          const want = body.op === 'enable' ? '0.0.0.0' : '127.0.0.1';
          if ((want === '0.0.0.0') === shared) return json(res, 200, { ok: true, message: 'Keine Änderung.', ...shareInfo() });
          if (want === '0.0.0.0') shareKeys(root);
          json(res, 200, { ok: true, restarting: true, message: body.op === 'enable' ? 'Board wird im Netzwerk freigegeben und startet neu.' : 'Freigabe beendet, das Board startet neu.' });
          setTimeout(() => handOver(OWN_CLI, '', want), 100);
          return;
        }
        throw new ApiError(400, 'Unbekannte Aktion.');
      }
      if (p === '/api/asset') {
        const data = await readBody(req, MAX_UPLOAD);
        const result = await saveAsset(root, {
          taskId: q.get('id'), contentType: req.headers['content-type'], data,
          desc: q.get('desc') || '', kind: q.get('kind') || '', name: q.get('name') || '',
        });
        tick();
        return json(res, 200, { ok: true, ...result });
      }
      return json(res, 404, { error: 'Unbekannter Endpunkt.' });
    } catch (e) {
      if (e instanceof ApiError) return json(res, e.status, { error: e.message });
      return json(res, 500, { error: `Interner Fehler: ${e.message}` });
    }
  }

  const server = http.createServer((req, res) => {
    if (!hostAllowed(req.headers.host)) return send(res, 421, 'text/plain; charset=utf-8', 'Unbekannter Host.');
    let url;
    try { url = new URL(req.url, 'http://x'); decodeURIComponent(url.pathname); } catch { return send(res, 400, 'text/plain', 'Ungültige Anfrage'); }
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/api/')) { handleApi(req, res, url); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'Nur GET');

    const access = accessOf(req, pathname === '/' || pathname === '/index.html' ? url : null);
    if (!access) {
      return send(res, 403, 'text/html; charset=utf-8', '<!doctype html><meta charset="utf-8"><title>Kein Zugriff</title><body style="font:16px system-ui;padding:40px;max-width:560px;margin:auto;color:#222"><h1 style="font-size:22px">Kein Zugriff auf dieses Board</h1><p>Der Link ist ungültig oder wurde erneuert. Bitte den Besitzer des Boards um einen neuen Link.</p></body>');
    }
    if (pathname === '/' || pathname === '/index.html') {
      const headers = {};
      if (access.set) headers['Set-Cookie'] = `works_key=${access.set}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`;
      try {
        const html = renderBoard(withServer(boardData(root)), { live: true, token: access.level === 'edit' ? token : viewToken, mode: access.level });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, ...headers });
        return res.end(html);
      } catch (e) { return send(res, 500, 'text/plain; charset=utf-8', `Fehler beim Erzeugen: ${e.message}`); }
    }
    if (pathname === '/data.json') {
      try { return json(res, 200, withServer(boardData(root))); } catch (e) { return json(res, 500, { error: e.message }); }
    }
    if (pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      res.write(`event: update\ndata: ${Date.now()}\n\n`); // nach Reconnect sofort aufholen
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    const rel = pathname.replace(/^\/+/, '');
    if (!PUBLIC_PREFIXES.some((p) => rel === p || rel.startsWith(p))) return send(res, 404, 'text/plain', 'Nicht gefunden');
    const abs = path.resolve(wd, rel);
    if (!abs.startsWith(wd + path.sep)) return send(res, 403, 'text/plain', 'Verboten');
    fs.stat(abs, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, 'text/plain', 'Nicht gefunden');
      const ext = path.extname(abs).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': st.size, ...SECURITY_HEADERS,
        ...(ext === '.svg' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}),
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(abs).pipe(res);
    });
  });

  let attempt = 0;
  const takeoverUntil = Date.now() + 20000;
  const listen = (p) => {
    server.once('error', (e) => {
      // Bei einer Übergabe wartet der neue Server, bis der alte den Port freigegeben hat.
      if (e.code === 'EADDRINUSE' && takeover && Date.now() < takeoverUntil) { setTimeout(() => listen(p), 300); return; }
      if (e.code === 'EADDRINUSE' && !fixedPort && attempt < 10) { attempt++; listen(p + 1); return; }
      process.stderr.write(`Fehler: Port ${p} ist nicht verfügbar (${e.code}). Anderen Port mit --port wählen.\n`);
      process.exit(1);
    });
    server.listen(p, host, () => {
      boundPort = p;
      ensureGitignore(root, ['server.json', 'server.log', '.tmp/', 'share.json']);
      writeServer(root, { pid: process.pid, port: p, host, version: runningVersion(), cli: OWN_CLI, started: new Date().toISOString() });
      const url = `http://${host === '0.0.0.0' || host === '::' ? 'localhost' : host}:${p}/`;
      process.stdout.write(`Live-Board läuft: ${url}\nBeobachte ${wd}\nBeenden mit Strg+C.\n`);
      if (shared) {
        const links = shareLinks(root, p);
        if (links.length) {
          process.stdout.write('Im Netzwerk geteilt. Link zum Ansehen:\n');
          for (const l of links) process.stdout.write(`  ${l.view}\n`);
        } else process.stdout.write('Im Netzwerk freigegeben, aber keine Netzwerkadresse gefunden.\n');
      }
      if (open) {
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
        run(opener, [url], { detached: true, stdio: 'ignore' });
      }
    });
  };
  listen(port);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await drain(8000);
    clearInterval(timer);
    clearInterval(keepalive);
    clearInterval(updateTimer);
    clearServer(root, process.pid);
    for (const res of clients) res.end();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}
