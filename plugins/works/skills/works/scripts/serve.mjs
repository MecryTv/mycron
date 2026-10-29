// Live-Ansicht des Boards: kleiner lokaler HTTP-Server ohne Abhängigkeiten.
// Beobachtet .works/ und meldet Änderungen per Server-Sent Events an offene Browser-Tabs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { worksDir, run } from './lib.mjs';
import { boardData, renderBoard, refreshBoardIfPresent } from './board.mjs';
import { generateIndex } from './views.mjs';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8',
};
// Nur diese Bereiche von .works/ werden ausgeliefert.
const PUBLIC_PREFIXES = ['tasks/', 'archive/', 'reports/', 'WORKS.md', 'ideas.md'];
const POLL_MS = 1000;
const KEEPALIVE_MS = 25000;

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

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

export function serveBoard(root, { port = 4747, host = '127.0.0.1', open = false, fixedPort = false } = {}) {
  const wd = worksDir(root);
  const clients = new Set();
  let sig = signature(root);

  const broadcast = () => {
    for (const res of clients) res.write(`event: update\ndata: ${Date.now()}\n\n`);
  };

  const timer = setInterval(() => {
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
  }, POLL_MS);

  const keepalive = setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, KEEPALIVE_MS);

  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'text/plain', 'Ungültige Anfrage'); }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'Nur GET');

    if (pathname === '/' || pathname === '/index.html') {
      try { return send(res, 200, 'text/html; charset=utf-8', renderBoard(boardData(root), { live: true })); } catch (e) { return send(res, 500, 'text/plain; charset=utf-8', `Fehler beim Erzeugen: ${e.message}`); }
    }
    if (pathname === '/data.json') {
      try { return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(boardData(root))); } catch (e) { return send(res, 500, 'application/json', JSON.stringify({ error: e.message })); }
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
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(abs).pipe(res);
    });
  });

  let attempt = 0;
  const listen = (p) => {
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE' && !fixedPort && attempt < 10) { attempt++; listen(p + 1); return; }
      process.stderr.write(`Fehler: Port ${p} ist nicht verfügbar (${e.code}). Anderen Port mit --port wählen.\n`);
      process.exit(1);
    });
    server.listen(p, host, () => {
      const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${p}/`;
      process.stdout.write(`Live-Board läuft: ${url}\nBeobachte ${wd}\nBeenden mit Strg+C.\n`);
      if (open) {
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
        run(opener, [url], { detached: true, stdio: 'ignore' });
      }
    });
  };
  listen(port);

  const shutdown = () => {
    clearInterval(timer);
    clearInterval(keepalive);
    for (const res of clients) res.end();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}
