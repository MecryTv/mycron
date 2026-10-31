// Übersicht über alle Projekte mit .works. Projekte melden sich in ~/.works/projects.json an
// (beim Init, beim Sitzungsstart und beim Start des Boards). works hub zeigt sie auf Port 4740.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { readJson, writeJson, exists, loadTasks, loadConfig, isOverdue, OPEN_STATUSES, today } from './lib.mjs';
import { readServer, startDetached, newestCli } from './server-control.mjs';
import { activeSprint, sprintStats } from './sprint.mjs';
import { milestoneProgress } from './views.mjs';
import { loadActivity } from './live.mjs';

const regFile = () => path.join(os.homedir(), '.works', 'projects.json');

export function registerProject(root) {
  try {
    const reg = readJson(regFile(), { projects: [] }) || { projects: [] };
    const real = fs.realpathSync(root);
    const list = reg.projects.filter((p) => p.path !== real);
    list.unshift({ path: real, name: path.basename(real), seen: new Date().toISOString() });
    fs.mkdirSync(path.dirname(regFile()), { recursive: true });
    writeJson(regFile(), { projects: list.slice(0, 60) });
  } catch { /* nicht kritisch */ }
}

export function projectList() {
  const reg = readJson(regFile(), { projects: [] }) || { projects: [] };
  return reg.projects.filter((p) => exists(path.join(p.path, '.works', 'config.json')));
}

export function projectInfo(p) {
  const config = loadConfig(p.path);
  const tasks = loadTasks(p.path, { archive: false });
  const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const sp = activeSprint(config);
  const ms = milestoneProgress(config, tasks).filter((m) => m.status !== 'erledigt').sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')))[0];
  const act = loadActivity(p.path);
  const last = tasks.map((t) => String(t.updated || '')).sort().pop() || '';
  const queue = (config.queue || []).map((id) => tasks.find((t) => t.id === id)).filter((t) => t && OPEN_STATUSES.includes(t.status));
  return {
    ...p, open: open.length, p1: open.filter((t) => t.priority === 'P1'), review: open.filter((t) => t.status === 'review').length,
    overdue: open.filter(isOverdue).length, working: open.filter((t) => t.status === 'in-arbeit'),
    sprint: sp ? { ...sp, stats: sprintStats(config, sp, tasks) } : null, milestone: ms || null,
    busy: act && act.busy && act.current && Date.now() - Date.parse(act.current.at) < 10 * 60000 ? act.current : null,
    server: readServer(p.path), last, next: queue[0] || null,
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (iso) => { if (!iso) return 'nie'; const d = Math.round((new Date(today() + 'T00:00:00') - new Date(String(iso).slice(0, 10) + 'T00:00:00')) / 86400000); return d <= 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`; };

function page(infos, token) {
  const p1 = infos.flatMap((i) => i.p1.map((t) => ({ i, t })));
  const card = (i) => {
    const url = i.server ? `http://${['0.0.0.0', '::'].includes(i.server.host) ? '127.0.0.1' : i.server.host}:${i.server.port}/` : '';
    const st = i.sprint ? i.sprint.stats : null;
    const bar = (done, total, label) => `<div class="bar"><div class="bl"><span>${esc(label)}</span><span>${done} von ${total}</span></div><div class="track"><span style="width:${total ? Math.round(done / total * 100) : 0}%"></span></div></div>`;
    return `<article class="card"><header><h2>${esc(i.name)}</h2><span class="path">${esc(i.path.replace(os.homedir(), '~'))}</span><span class="srv ${url ? 'on' : ''}">${url ? 'Board läuft' : 'Board aus'}</span></header>
<div class="nums"><span><b>${i.open}</b> offen</span><span class="${i.p1.length ? 'hot' : ''}"><b>${i.p1.length}</b> P1</span><span><b>${i.review}</b> Review</span><span class="${i.overdue ? 'hot' : ''}"><b>${i.overdue}</b> überfällig</span></div>
${i.busy ? `<div class="note busy">Claude arbeitet an ${esc(i.busy.task || 'einer Aufgabe')}: ${esc(i.busy.verb)} ${esc(i.busy.what)}</div>` : i.working.length ? `<div class="note">In Arbeit: ${esc(i.working.map((t) => `${t.id} ${t.title}`).join(', '))}</div>` : i.next ? `<div class="note">Nächste in der Warteschlange: ${esc(i.next.id + ' ' + i.next.title)}</div>` : i.review ? `<div class="note rv">${i.review} ${i.review === 1 ? 'Aufgabe wartet' : 'Aufgaben warten'} auf deine Abnahme</div>` : ''}
${st ? bar(st.done, st.planned, `Sprint ${i.sprint.id} bis ${i.sprint.end}`) : i.milestone ? bar(i.milestone.done, i.milestone.total, `${i.milestone.id} ${i.milestone.title}${i.milestone.due ? ` bis ${i.milestone.due}` : ''}`) : ''}
<footer>${url ? `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">Board öffnen</a>` : `<form method="post" action="/start"><input type="hidden" name="t" value="${token}"><input type="hidden" name="p" value="${esc(i.path)}"><button class="btn">Board starten</button></form>`}<span class="ago">zuletzt geändert ${ago(i.last)}</span></footer></article>`;
  };
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta http-equiv="refresh" content="20"><title>works Projekte</title><style>
:root{--bg:#f3f5f8;--card:#fff;--soft:#eef1f4;--line:#dce1e8;--text:#18202c;--muted:#647085;--accent:#5550d9;--ok:#1f9d6c;--hot:#d93a40;--warn:#c9860b}
@media (prefers-color-scheme:dark){:root{--bg:#141a24;--card:#1c2330;--soft:#222b3a;--line:#2b3546;--text:#e6eaf2;--muted:#8d98ab;--accent:#7f7bf6;--ok:#3dbe8b;--hot:#f0676c;--warn:#f2b33d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.top{display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;padding:12px 24px;border-bottom:1px solid var(--line)}.top strong{font-size:16px}.top .r{margin-left:auto;color:var(--muted);font-size:13px}
main{max-width:1240px;margin:0 auto;padding:22px 24px;display:grid;gap:18px}.p1{padding:12px 16px;border-radius:12px;background:var(--card);border:1px solid var(--hot);display:flex;flex-wrap:wrap;gap:6px 20px}.p1 strong{color:var(--hot)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px}.card{padding:16px 18px;border-radius:14px;background:var(--card);border:1px solid var(--line);display:grid;gap:10px;align-content:start}
.card header{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px}.card h2{margin:0;font-size:17px}.path{font-size:12px;color:var(--muted)}.srv{margin-left:auto;font-size:12px;color:var(--muted)}.srv.on{color:var(--ok)}
.nums{display:flex;flex-wrap:wrap;gap:16px;font-size:13px}.hot{color:var(--hot)}.note{padding:8px 10px;border-radius:8px;background:var(--soft);font-size:13px}.note.busy{color:var(--warn)}.note.rv{color:var(--accent)}
.bl{display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}.track{height:8px;border-radius:4px;background:var(--soft);overflow:hidden}.track span{display:block;height:100%;background:var(--ok)}
footer{display:flex;align-items:center;gap:8px}.ago{margin-left:auto;font-size:12px;color:var(--muted)}.btn{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--line);background:var(--soft);color:var(--text);font:inherit;cursor:pointer;text-decoration:none}.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
form{margin:0}.empty{color:var(--muted)}@media (max-width:560px){.grid{grid-template-columns:1fr}main{padding:16px}}
</style></head><body><div class="top"><strong>works</strong><span>Alle Projekte</span><span class="r">${infos.length} Projekte, ${infos.reduce((a, i) => a + i.open, 0)} offene Aufgaben, ${p1.length} mit P1</span></div><main>
${p1.length ? `<section class="p1"><strong>P1 über alle Projekte</strong>${p1.map(({ i, t }) => `<span>${esc(i.name)}: ${esc(t.id)} ${esc(t.title)}</span>`).join('')}</section>` : ''}
${infos.length ? `<div class="grid">${infos.map(card).join('')}</div>` : '<p class="empty">Noch keine Projekte. Projekte erscheinen hier, sobald works in ihnen eingerichtet ist oder eine Sitzung darin startet.</p>'}
</main></body></html>`;
}

export function serveHub({ port = 4740 } = {}) {
  const token = crypto.randomBytes(16).toString('hex');
  const server = http.createServer((req, res) => {
    const host = String(req.headers.host || '').replace(/:\d+$/, '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) { res.writeHead(421); return res.end(); }
    const head = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' };
    if (req.method === 'POST' && req.url === '/start') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 4000) req.destroy(); });
      req.on('end', () => {
        const q = new URLSearchParams(body);
        const p = projectList().find((x) => x.path === q.get('p'));
        if (q.get('t') !== token || !p) { res.writeHead(403, head); return res.end('Verboten'); }
        if (!readServer(p.path)) startDetached(p.path, { cli: newestCli(), port: 4747 + (projectList().indexOf(p) % 40), takeover: false });
        setTimeout(() => { res.writeHead(303, { Location: '/' }); res.end(); }, 1500);
      });
      return;
    }
    if (req.method !== 'GET' || (req.url !== '/' && !req.url.startsWith('/?'))) { res.writeHead(404, head); return res.end('Nicht gefunden'); }
    let infos = [];
    for (const p of projectList()) { try { infos.push(projectInfo(p)); } catch { /* Projekt nicht lesbar */ } }
    infos = infos.sort((a, b) => (b.p1.length - a.p1.length) || String(b.last).localeCompare(String(a.last)));
    res.writeHead(200, head);
    res.end(page(infos, token));
  });
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Projektübersicht läuft: http://127.0.0.1:${port}/\nBeenden mit Strg+C.\n`));
  server.on('error', (e) => { process.stderr.write(`Fehler: ${e.message}\n`); process.exit(1); });
  return server;
}
