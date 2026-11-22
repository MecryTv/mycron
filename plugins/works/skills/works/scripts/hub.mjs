// Übersicht über alle Projekte mit .works (W-0025). Projekte melden sich in ~/.works/projects.json an
// (beim Init, beim Sitzungsstart und beim Start des Boards). Jedes Board liefert die Seite unter /hub,
// works hub zeigt dieselbe Seite auf Port 4740.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { readJson, writeJson, exists, loadTasks, loadConfig, isOverdue, OPEN_STATUSES, today } from './lib.mjs';
import { readServer, newestCli, cliVersion } from './server-control.mjs';
import { activeSprint, sprintStats } from './sprint.mjs';
import { loadActivity } from './live.mjs';
import { liveUsage, fmtTokens, fmtCost } from './usage.mjs';
import { syncState } from './ghsync.mjs';
import { boardCss } from './board.mjs';

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

const boardUrl = (s) => `http://${['0.0.0.0', '::', '', undefined].includes(s.host) ? '127.0.0.1' : s.host}:${s.port}/`;

// Laufende Boards aller angemeldeten Projekte.
export function runningBoards() {
  return projectList().map((p) => ({ p, s: readServer(p.path) })).filter((x) => x.s)
    .map(({ p, s }) => ({ name: p.name, path: p.path, port: s.port, url: boardUrl(s) }));
}

const prio = (t) => String(t.priority || 'P9');

export function projectInfo(p, current = null) {
  const config = loadConfig(p.path);
  const all = loadTasks(p.path);
  const tasks = all.filter((t) => !t.archived);
  const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const counted = all.filter((t) => t.status !== 'verworfen');
  const sp = activeSprint(config);
  const act = loadActivity(p.path);
  const cur = act && act.current;
  // Zuletzt geändert: letzte Aktivität von Claude (mit Uhrzeit) oder das Datum der letzten Aufgabenänderung.
  const last = [...tasks.map((t) => String(t.updated || '')), cur && cur.at ? String(cur.at) : ''].sort().pop() || '';
  const queue = (config.queue || []).map((id) => tasks.find((t) => t.id === id)).filter((t) => t && OPEN_STATUSES.includes(t.status));
  const working = open.filter((t) => t.status === 'in-arbeit');
  const server = readServer(p.path);
  const prs = Object.values((syncState(p.path) || {}).prs || {}).filter((x) => x && x.ci).sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  let usage = null;
  try { const u = liveUsage(p.path, config); usage = { ...u.today, currency: u.currency }; } catch { /* keine Zeiterfassung */ }
  return {
    ...p, open: open.length, p1: open.filter((t) => t.priority === 'P1'), review: open.filter((t) => t.status === 'review').length,
    overdue: open.filter(isOverdue).length, working,
    sprint: sp ? { ...sp, stats: sprintStats(config, sp, tasks) } : null,
    progress: { done: counted.filter((t) => t.status === 'erledigt').length, total: counted.length },
    busy: act && act.busy && cur && Date.now() - Date.parse(cur.at) < 10 * 60000 ? cur : null,
    perm: cur && cur.perm && Date.now() - Date.parse(cur.permSince || cur.at) < 60 * 60000 ? cur : null,
    ci: prs[0] ? prs[0].ci : '', usage,
    server, outdated: !!(server && current && server.version !== current),
    last, next: queue[0] || working[0] || open.slice().sort((a, b) => prio(a).localeCompare(prio(b)))[0] || null,
  };
}

// Alle Projekte einlesen: laufende zuerst, dann nach P1 und letzter Änderung.
export function hubInfos() {
  let current = null;
  try { current = cliVersion(newestCli()); } catch { /* unbekannt */ }
  const infos = [];
  for (const p of projectList()) { try { infos.push(projectInfo(p, current)); } catch { /* Projekt nicht lesbar */ } }
  return infos.sort((a, b) => (!!b.server - !!a.server) || (b.p1.length - a.p1.length) || String(b.last).localeCompare(String(a.last)));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (iso) => {
  if (!iso) return 'nie';
  const ms = Date.now() - Date.parse(iso);
  if (!/T/.test(iso) || Number.isNaN(ms)) { const d = Math.round((new Date(today() + 'T00:00:00') - new Date(String(iso).slice(0, 10) + 'T00:00:00')) / 86400000); return d <= 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`; }
  const m = Math.round(ms / 60000);
  return m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} min` : m < 1440 ? `vor ${Math.round(m / 60)} h` : `vor ${Math.round(m / 1440)} Tagen`;
};
const hhmm = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const pct = (done, total) => (total ? Math.round(done / total * 100) : 0);

function liveLine(i) {
  if (i.perm) return `<div class="hub-live hub-warnbg"><span class="hub-dot hub-perm"></span><span>Wartet ${ago(i.perm.permSince || i.perm.at).replace('vor ', 'seit ')} auf deine Freigabe: ${esc(i.perm.what || i.perm.verb)}</span></div>`;
  if (i.busy) return `<div class="hub-live"><span class="hub-dot hub-work"></span><span>Claude arbeitet${i.busy.task ? ` an ${esc(i.busy.task)}` : ''}: ${esc(i.busy.verb)} ${esc(i.busy.what)}</span></div>`;
  if (i.working.length) return `<div class="hub-live"><span class="hub-dot hub-work"></span><span>In Arbeit: ${esc(i.working.map((t) => `${t.id} ${t.title}`).join(', '))}</span></div>`;
  if (i.review) return `<div class="hub-live"><span class="hub-dot"></span><span>${i.review} ${i.review === 1 ? 'Aufgabe wartet' : 'Aufgaben warten'} auf deine Abnahme</span></div>`;
  return '<div class="hub-live"><span class="hub-dot"></span><span>Gerade nichts in Arbeit</span></div>';
}

function boardCard(i, self) {
  const url = boardUrl(i.server);
  const st = i.sprint && i.sprint.stats;
  const [label, done, total, color] = st ? [`Sprint ${i.sprint.id} bis ${i.sprint.end}`, st.done, st.planned, ';--c:var(--accent)'] : ['Fortschritt gesamt', i.progress.done, i.progress.total, ''];
  const stat = (n, l, hot) => `<div class="hub-stat${hot && n ? ' hub-hot' : ''}"><b>${n}</b><span>${l}</span></div>`;
  const ci = { ok: '<span class="hub-chip hub-ok">CI grün</span>', fail: '<span class="hub-chip hub-red">CI rot</span>', pending: '<span class="hub-chip">CI läuft</span>' }[i.ci] || '';
  const isSelf = self && i.path === self;
  return `<article class="hub-bc">
<header><span class="hub-dot hub-on"></span><h3>${esc(i.name)}</h3><span class="hub-m hub-path">${esc(i.path.replace(os.homedir(), '~'))}</span>
<span class="hub-chips">${isSelf ? '<span class="hub-chip">dieses Board</span>' : ''}${ci}${i.outdated ? '<span class="hub-chip hub-old">Version veraltet</span>' : '<span class="hub-chip">Version aktuell</span>'}</span></header>
${liveLine(i)}
<div class="hub-stats">${stat(i.open, 'offen')}${stat(i.working.length, 'in Arbeit')}${stat(i.review, 'Review')}${stat(i.p1.length, 'P1', true)}${stat(i.overdue, 'überfällig', true)}</div>
<div class="hub-cols">
<div class="hub-prog"><div class="hub-pl"><span>${esc(label)}</span><span>${done} von ${total}</span></div><div class="hub-track"><i style="width:${pct(done, total)}%${color}"></i></div></div>
<dl class="hub-kv"><dt>Als Nächstes</dt><dd>${i.next ? esc(`${i.next.id} ${i.next.title}`) : '–'}</dd><dt>Verbrauch heute</dt><dd>${i.usage && i.usage.tokens ? esc(`${fmtTokens(i.usage.tokens)} · ${fmtCost(i.usage.cost, i.usage.currency)}`) : '–'}</dd><dt>Läuft seit</dt><dd>${hhmm(i.server.started)} · Port ${i.server.port}</dd></dl>
</div>
<div class="hub-acts"><a class="btn small primary" href="${esc(url)}?from=hub">Öffnen</a><a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">In neuem Tab</a><button class="btn small" type="button" data-op="restart" data-path="${esc(i.path)}" data-name="${esc(i.name)}">Neu starten</button>${isSelf ? '' : `<button class="btn small ghost danger" type="button" data-op="stop" data-path="${esc(i.path)}" data-name="${esc(i.name)}">Stoppen</button>`}<span class="hub-m">geändert ${ago(i.last)}</span></div>
</article>`;
}

function stoppedRow(i) {
  return `<div class="hub-offrow"><span class="hub-dot hub-off"></span><b>${esc(i.name)}</b><span class="hub-m">${i.open} offen${i.p1.length ? ` · ${i.p1.length} P1` : ''} · zuletzt geändert ${ago(i.last)}</span><span class="hub-acts"><button class="btn small" type="button" data-op="start" data-path="${esc(i.path)}" data-name="${esc(i.name)}">Board starten</button></span></div>`;
}

const THEME_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" style="width:15px;height:15px"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>';

// Inhalt der Seite (Kopf und Liste). Wird alle 5 s neu geholt.
export function hubBody(infos, { self = '' } = {}) {
  const on = infos.filter((i) => i.server);
  const off = infos.filter((i) => !i.server);
  const sum = (f) => infos.reduce((a, i) => a + f(i), 0);
  const cost = sum((i) => (i.usage ? i.usage.cost : 0));
  const tokens = sum((i) => (i.usage ? i.usage.tokens : 0));
  const cur = (infos.find((i) => i.usage) || { usage: { currency: 'USD' } }).usage.currency;
  const perms = sum((i) => (i.perm ? 1 : 0));
  const kpi = (n, l, cls = '') => `<div class="hub-kpi${cls}"><b>${esc(n)}</b><span>${esc(l)}</span></div>`;
  return `<header class="hub-hd"><div class="hub-wrap">
<div class="hub-hdtop"><h1 class="hub-mark"><i>w</i>works <small>HUB</small></h1><span class="hub-m">${on.length === 1 ? '1 Board läuft' : `${on.length} Boards laufen`} · ${off.length} gestoppt · aktualisiert ${hhmm(new Date().toISOString())}</span>
<span class="hub-right"><button class="btn small" type="button" data-op="add">Projekt hinzufügen</button><button class="btn small icon" type="button" data-theme-toggle aria-label="Farbschema wechseln" title="Farbschema wechseln">${THEME_ICON}</button></span></div>
<div class="hub-kpis">${kpi(sum((i) => i.open), 'offene Aufgaben')}${kpi(sum((i) => i.p1.length), 'P1 kritisch')}${kpi(perms, 'wartet auf Freigabe', perms ? ' hub-warnk' : '')}${kpi(sum((i) => i.review), 'im Review')}${kpi(fmtCost(cost, cur), `Verbrauch heute · ${fmtTokens(tokens)} Tokens`)}</div>
</div></header>
<main class="hub-wrap">
<div class="hub-sec"><h2>Laufende Boards</h2><span class="hub-m">${on.length}</span></div>
${on.length ? `<div class="hub-cards">${on.map((i) => boardCard(i, self)).join('')}</div>` : '<p class="hub-m">Gerade läuft kein Board.</p>'}
${off.length ? `<div class="hub-sec"><h2>Gestoppt</h2><span class="hub-m">${off.length}</span></div><div class="hub-off-list">${off.map(stoppedRow).join('')}</div>` : ''}
${infos.length ? '' : '<p class="hub-m">Noch keine Projekte. Sie erscheinen hier, sobald works in ihnen eingerichtet ist, ein Board startet oder du sie hinzufügst.</p>'}
<div style="height:28px"></div>
</main>`;
}

const HUB_CSS = `
.hub-page { min-height: 100vh; background: var(--bg); }
.hub-wrap { max-width: 1280px; margin: 0 auto; padding: 0 20px; }
.hub-mark { margin: 0; display: inline-flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 700; letter-spacing: -.01em; }
.hub-mark i { width: 26px; height: 26px; border-radius: 8px; background: var(--accent); display: grid; place-items: center; color: var(--on-accent); font-style: normal; font-size: 14px; font-weight: 800; }
.hub-mark small { font-size: 13px; font-weight: 600; color: var(--muted); letter-spacing: .02em; }
.hub-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--c, var(--muted)); display: inline-block; }
.hub-dot.hub-on { --c: var(--ok); } .hub-dot.hub-work { --c: var(--s-in-arbeit); } .hub-dot.hub-perm { --c: var(--warn); } .hub-dot.hub-off { --c: var(--line-strong); }
.hub-m { color: var(--muted); font-size: 12.5px; }
.hub-sec { display: flex; align-items: baseline; gap: 10px; margin: 22px 0 10px; }
.hub-sec h2 { margin: 0; font-size: 14px; font-weight: 650; }
.hub-live { display: flex; align-items: center; gap: 8px; padding: 9px 11px; border-radius: 9px; background: var(--sunken); font-size: 13px; min-width: 0; }
.hub-live.hub-warnbg { background: color-mix(in srgb, var(--warn) 14%, var(--surface)); }
.hub-live > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hub-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.hub-stat { padding: 7px 8px; border-radius: 8px; background: var(--sunken); display: grid; text-align: center; }
.hub-stat b { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.hub-stat span { font-size: 11.5px; color: var(--text-2); }
/* Kontrast mindestens 4,5:1 (WCAG AA) in beiden Schemata: Signalfarben mit der Textfarbe gemischt. */
.hub-stat.hub-hot b { color: color-mix(in srgb, var(--danger) 65%, var(--text)); }
.hub-prog { display: grid; gap: 4px; align-content: start; }
.hub-pl { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--text-2); }
.hub-track { height: 6px; border-radius: 3px; background: var(--sunken); overflow: hidden; }
.hub-track i { display: block; height: 100%; background: var(--c, var(--ok)); }
.hub-kv { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; font-size: 12.5px; margin: 0; }
.hub-kv dt { color: var(--muted); }
.hub-kv dd { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hub-chip { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600; background: var(--sunken); color: var(--text-2); white-space: nowrap; }
.hub-chip.hub-ok { background: color-mix(in srgb, var(--ok) 16%, transparent); color: color-mix(in srgb, var(--ok) 65%, var(--text)); }
.hub-chip.hub-red { background: color-mix(in srgb, var(--danger) 14%, transparent); color: color-mix(in srgb, var(--danger) 65%, var(--text)); }
.hub-chip.hub-old { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--text); }
.hub-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.hub-page a.btn { color: var(--text); }
.hub-page a.btn.primary { color: var(--on-accent); }
.hub-acts .hub-m { margin-left: auto; }
.hub-hd { background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 14%, var(--surface)), var(--surface)); border-bottom: 1px solid var(--line); }
.hub-hd .hub-wrap { display: grid; gap: 14px; padding-top: 18px; padding-bottom: 18px; }
.hub-hdtop { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
.hub-hdtop .hub-m { font-size: 13px; color: var(--text-2); }
.hub-hd .hub-mark small { color: var(--text-2); }
.hub-right { margin-left: auto; display: flex; gap: 8px; }
.hub-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.hub-kpi { padding: 10px 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); display: grid; gap: 2px; min-width: 0; }
.hub-kpi b { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.15; }
.hub-kpi span { font-size: 12px; color: var(--muted); }
.hub-kpi.hub-warnk { border-color: color-mix(in srgb, var(--warn) 50%, var(--line)); }
@media (max-width: 760px) { .hub-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.hub-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr)); gap: 14px; }
.hub-bc { display: grid; gap: 12px; padding: 16px 18px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); align-content: start; min-width: 0; }
.hub-bc header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
.hub-bc h3 { margin: 0; font-size: 17px; font-weight: 650; }
.hub-path { min-width: 0; overflow-wrap: anywhere; }
.hub-chips { margin-left: auto; display: flex; flex-wrap: wrap; gap: 6px; }
.hub-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
@media (max-width: 560px) { .hub-cols { grid-template-columns: minmax(0, 1fr); } .hub-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.hub-off-list { display: grid; gap: 8px; }
.hub-offrow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 10px 14px; border-radius: 12px; background: var(--surface); border: 1px dashed var(--line-strong); font-size: 13px; }
.hub-offrow .hub-acts { margin-left: auto; }
`;

// Holt den Inhalt alle 5 s neu, schaltet das Farbschema wie im Board und schickt die Knöpfe an die API.
// events: Die Seite hält /events offen, damit works board --open sie als offenen works-Tab zählt.
const HUB_JS = `(() => {
  const H = window.HUB;
  const get = (k, f) => { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch (e) { return f; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privat */ } };
  const theme = () => { const t = get('works-theme', 'auto'); if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); };
  theme();
  const root = document.getElementById('hub');
  let last = root.innerHTML;
  const focusKey = (el) => (el && el !== document.body && root.contains(el) ? [el.tagName, el.getAttribute('href'), el.dataset.op, el.dataset.path, el.textContent].join('|') : '');
  async function refresh() {
    try {
      const r = await fetch(H.part, { cache: 'no-store' }); if (!r.ok) return;
      const t = await r.text(); if (t === last) return;
      // Fokus behalten, damit die Bedienung per Tastatur nicht bei jeder Aktualisierung von vorn beginnt.
      const k = focusKey(document.activeElement);
      last = t; root.innerHTML = t;
      if (k) { const el = [...root.querySelectorAll('a, button')].find((x) => focusKey(x) === k); if (el) el.focus(); }
    } catch (e) { /* Server startet neu */ }
  }
  setInterval(refresh, 5000);
  if (H.events) new EventSource('/events');
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-theme-toggle]')) { const o = ['auto', 'light', 'dark']; put('works-theme', o[(o.indexOf(get('works-theme', 'auto')) + 1) % 3]); theme(); return; }
    const b = e.target.closest('[data-op]');
    if (!b) return;
    let dir = b.dataset.path;
    if (b.dataset.op === 'stop' && !confirm('Board von ' + b.dataset.name + ' stoppen?')) return;
    if (b.dataset.op === 'add') { dir = prompt('Ordner des Projekts, in dem works eingerichtet ist:'); if (!dir) return; }
    b.disabled = true;
    try {
      const r = await fetch('/api/hub', { method: 'POST', headers: { 'X-Works-Token': H.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ op: b.dataset.op, path: dir }) });
      if (r.status === 403) { location.reload(); return; }
      if (!r.ok) alert((await r.json().catch(() => ({}))).error || 'Das hat nicht geklappt.');
    } catch (err) { alert('Keine Verbindung zum Board.'); }
    b.disabled = false;
    setTimeout(refresh, 1500); setTimeout(refresh, 4000);
  });
})();`;

// Ganze Seite mit dem CSS des Boards. part: nur den Inhalt für die Aktualisierung.
export function hubHtml({ token, self = '', part = false, partUrl = '/?part=1', events = false } = {}) {
  const body = hubBody(hubInfos(), { self });
  if (part) return body;
  const boot = JSON.stringify({ token, part: partUrl, events }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>works Hub</title><style>${boardCss()}${HUB_CSS}</style></head>
<body><div class="hub-page" id="hub">${body}</div><script>window.HUB = ${boot};${HUB_JS}</script></body></html>`;
}

// Knöpfe im Hub: Board starten, stoppen, neu starten, Projekt hinzufügen. Nur für angemeldete Projekte.
// Läuft über das CLI im Projektordner, wie works board von Hand. Gibt { status, error? } zurück.
export function hubAction(op, dir) {
  if (!['start', 'stop', 'restart', 'add'].includes(op)) return { status: 400, error: 'Unbekannte Aktion.' };
  const real = (x) => { try { return fs.realpathSync(String(x || '')); } catch { return null; } };
  const target = real(dir);
  if (op === 'add') {
    if (!target || !exists(path.join(target, '.works', 'config.json'))) return { status: 400, error: `In ${dir} ist works nicht eingerichtet (works init).` };
    registerProject(target);
    return { status: 200 };
  }
  const p = target && projectList().find((x) => real(x.path) === target);
  if (!p) return { status: 400, error: 'Unbekanntes Projekt.' };
  const args = { start: ['board', '--serve', '--detach'], stop: ['board', '--stop'], restart: ['board', '--restart'] }[op];
  spawn(process.execPath, [newestCli(), ...args], { cwd: p.path, detached: true, windowsHide: true, stdio: 'ignore', env: { ...process.env, WORKS_ACTOR: '' } }).unref();
  return { status: 200 };
}

export function serveHub({ port = 4740 } = {}) {
  const token = crypto.randomBytes(16).toString('hex');
  const head = { 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  const server = http.createServer((req, res) => {
    const host = String(req.headers.host || '').replace(/:\d+$/, '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) { res.writeHead(421); return res.end(); }
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/api/hub') {
      const origin = req.headers.origin;
      if (req.headers['x-works-token'] !== token || (origin && origin !== `http://${req.headers.host}`)) { res.writeHead(403, { ...head, 'Content-Type': 'application/json' }); return res.end('{"error":"Zugriff verweigert."}'); }
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 4000) req.destroy(); });
      req.on('end', () => {
        let q = {};
        try { q = JSON.parse(body); } catch { /* leer */ }
        const r = hubAction(q.op, q.path);
        res.writeHead(r.status, { ...head, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r.error ? { error: r.error } : { ok: true }));
      });
      return;
    }
    if (req.method !== 'GET' || url.pathname !== '/') { res.writeHead(404, head); return res.end('Nicht gefunden'); }
    res.writeHead(200, { ...head, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(hubHtml({ token, part: url.searchParams.has('part') }));
  });
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Projektübersicht läuft: http://127.0.0.1:${port}/\nBeenden mit Strg+C.\n`));
  server.on('error', (e) => { process.stderr.write(`Fehler: ${e.message}\n`); process.exit(1); });
  return server;
}
