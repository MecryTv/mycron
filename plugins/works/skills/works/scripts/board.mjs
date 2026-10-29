// Kanban-Board: erzeugt .works/board.html und liefert die Daten für die Live-Ansicht (works board --serve).
import fs from 'node:fs';
import path from 'node:path';
import {
  loadTasks, loadConfig, worksDir, getSection, checkboxes, stripComments, imageLinks,
  isBlocked, openBlockers, isOverdue, openQuestions, relFromWorks, nowStamp, STATUS_LABEL,
  PRIO_LABEL, TYPE_LABEL, OPEN_STATUSES,
} from './lib.mjs';
import { byIdMap, milestoneProgress } from './views.mjs';

function excerpt(t) {
  for (const s of ['Ziel', 'Zusammenfassung', 'Forschungsfrage', 'Beschreibung', 'Abkürzung']) {
    const c = stripComments(getSection(t._body, s) || '').trim();
    if (c) return c.slice(0, 400);
  }
  return '';
}

export function boardData(root) {
  const config = loadConfig(root);
  const all = loadTasks(root);
  const byId = byIdMap(all);
  const data = all.map((t) => {
    const imgs = imageLinks(getSection(t._body, 'Assets') || '').filter((i) => !/^https?:/.test(i.src));
    const crit = checkboxes(getSection(t._body, 'Akzeptanzkriterien') || '');
    return {
      id: t.id, title: t.title, type: t.type, priority: t.priority, status: t.status,
      effort: t.effort || '', due: t.due || '', milestone: t.milestone || '', tags: t.tags || [],
      blocked: OPEN_STATUSES.includes(t.status) && isBlocked(t, byId), blockers: openBlockers(t, byId),
      overdue: !!isOverdue(t), incomplete: !!t.incomplete, questions: openQuestions(t).map((q) => q.text),
      crit: [crit.done, crit.total], excerpt: excerpt(t), archived: t._archived,
      completed: t.completed || '', updated: t.updated || '',
      file: relFromWorks(root, t._file),
      thumb: imgs.length ? relFromWorks(root, path.resolve(t._dir, imgs[imgs.length - 1].src)) : '',
      thumbAlt: imgs.length ? imgs[imgs.length - 1].alt : '',
    };
  });
  const meta = {
    generated: nowStamp(),
    project: path.basename(root),
    statusLabel: STATUS_LABEL, prioLabel: PRIO_LABEL, typeLabel: TYPE_LABEL,
    milestones: milestoneProgress(config, all),
  };
  return { tasks: data, meta };
}

export function renderBoard(data, { live = false } = {}) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return TEMPLATE
    .replace('__DATA__', () => json)
    .replace('__LIVE__', live ? 'true' : 'false')
    .replace('__TITLE__', () => `Works · ${data.meta.project}`.replace(/</g, '&lt;'));
}

export function boardFile(root) {
  return path.join(worksDir(root), 'board.html');
}

export function generateBoard(root) {
  const file = boardFile(root);
  fs.writeFileSync(file, renderBoard(boardData(root)));
  return file;
}

// Aktualisiert board.html nur, wenn sie bereits existiert (wird nach jeder Änderung aufgerufen).
export function refreshBoardIfPresent(root) {
  if (fs.existsSync(boardFile(root))) generateBoard(root);
}

const TEMPLATE = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
:root {
  --bg: #f6f6f4; --panel: #ffffff; --line: #e3e2de; --text: #1d1d1b; --muted: #6b6a65;
  --p1: #c8322b; --p2: #d97a16; --p3: #3a6fb0; --p4: #8a8984;
  --chip: #efeeea; --accent: #1d1d1b; --shadow: 0 1px 2px rgba(0,0,0,.06);
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #151514; --panel: #1f1f1d; --line: #33322f; --text: #ecebe6; --muted: #9b9a94;
    --p1: #ef5b52; --p2: #f0a04b; --p3: #6d9be0; --p4: #8f8e88; --chip: #2a2a27; --accent: #ecebe6; --shadow: none; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
header { padding: 20px 24px 12px; display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: baseline; }
h1 { font-size: 18px; margin: 0; font-weight: 650; letter-spacing: -.01em; }
.meta { color: var(--muted); font-size: 12px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 24px 16px; align-items: center; }
.toolbar input[type="search"], .toolbar select { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; font: inherit; }
.toolbar input[type="search"] { min-width: 220px; }
.chip { border: 1px solid var(--line); background: var(--panel); color: var(--text); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.chip[aria-pressed="false"] { opacity: .45; }
.toggle { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); }
.ms { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 24px 16px; }
.ms div { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; font-size: 12px; min-width: 180px; }
.bar { height: 4px; background: var(--chip); border-radius: 2px; margin-top: 6px; overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--accent); }
main { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(260px, 1fr); gap: 12px; padding: 0 24px 32px; overflow-x: auto; }
.col { background: transparent; min-width: 0; }
.col h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 8px; display: flex; justify-content: space-between; }
.card { background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--p4); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; box-shadow: var(--shadow); }
.card:hover { border-color: var(--muted); }
.card.P1 { border-left-color: var(--p1); } .card.P2 { border-left-color: var(--p2); } .card.P3 { border-left-color: var(--p3); }
.card .top { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--muted); }
.card .title { font-weight: 560; margin: 4px 0 6px; }
.card img { width: 100%; max-height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid var(--line); margin-bottom: 6px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tag { background: var(--chip); border-radius: 4px; padding: 1px 6px; font-size: 11px; color: var(--muted); }
.tag.warn { color: var(--p1); }
.prio { font-weight: 650; }
.prio.P1 { color: var(--p1); } .prio.P2 { color: var(--p2); } .prio.P3 { color: var(--p3); }
dialog { border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: var(--text); width: min(640px, calc(100vw - 32px)); padding: 20px 22px; }
dialog::backdrop { background: rgba(0,0,0,.35); }
dialog h3 { margin: 4px 0 10px; font-size: 17px; }
dialog pre { white-space: pre-wrap; font: inherit; background: var(--chip); padding: 10px 12px; border-radius: 6px; margin: 8px 0; }
dialog img { max-width: 100%; border-radius: 6px; border: 1px solid var(--line); }
dialog a { color: inherit; }
.close { float: right; }
.empty { color: var(--muted); font-size: 12px; padding: 8px 2px; }
.live { font-size: 12px; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; }
.live::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #3a9a5b; }
.live.off::before { background: var(--p1); }
.card.flash { animation: flash 1.6s ease-out; }
@keyframes flash { from { box-shadow: 0 0 0 3px var(--p3); } to { box-shadow: var(--shadow); } }
@media (max-width: 640px) { header, .toolbar, .ms, main { padding-left: 16px; padding-right: 16px; } .toolbar input[type="search"] { min-width: 0; flex: 1 1 100%; } }
</style>
</head>
<body>
<header><h1 id="h"></h1><span class="meta" id="gen"></span><span class="live" id="live" hidden></span></header>
<div class="toolbar">
  <input id="q" type="search" placeholder="Suchen (Titel, ID, Tag)">
  <span id="prios"></span>
  <select id="type"><option value="">Alle Typen</option></select>
  <label class="toggle"><input type="checkbox" id="arch"> Archiv und Verworfene zeigen</label>
</div>
<div class="ms" id="ms"></div>
<main id="board"></main>
<dialog id="dlg"></dialog>
<script>
let DATA = __DATA__;
const LIVE = __LIVE__;
let tasks = DATA.tasks;
let meta = DATA.meta;
let openId = null;
let flashIds = new Set();
const COLS = ['backlog', 'geplant', 'in-arbeit', 'review', 'erledigt', 'verworfen'];
const state = { q: '', prios: new Set(['P1','P2','P3','P4']), type: '', arch: false };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderHeader() {
  document.getElementById('h').textContent = 'Works · ' + meta.project;
  document.getElementById('gen').textContent = 'Stand ' + meta.generated + ' · ' + tasks.length + ' Aufgaben';
}
const pr = document.getElementById('prios');
['P1','P2','P3','P4'].forEach((p) => {
  const b = document.createElement('button');
  b.className = 'chip'; b.textContent = p + ' ' + meta.prioLabel[p]; b.setAttribute('aria-pressed', 'true');
  b.onclick = () => { state.prios.has(p) ? state.prios.delete(p) : state.prios.add(p); b.setAttribute('aria-pressed', state.prios.has(p)); render(); };
  pr.appendChild(b); pr.append(' ');
});
const sel = document.getElementById('type');
Object.entries(meta.typeLabel).forEach(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v; sel.appendChild(o); });
sel.onchange = () => { state.type = sel.value; render(); };
document.getElementById('q').oninput = (e) => { state.q = e.target.value.toLowerCase(); render(); };
document.getElementById('arch').onchange = (e) => { state.arch = e.target.checked; render(); };
function renderMilestones() {
  const ms = document.getElementById('ms');
  ms.innerHTML = '';
  meta.milestones.forEach((m) => {
    const d = document.createElement('div');
    d.innerHTML = '<strong>' + esc(m.id) + '</strong> ' + esc(m.title) + (m.due ? ' · ' + esc(m.due) : '') + '<br>' + m.done + '/' + m.total + ' (' + m.pct + ' %)<div class="bar"><span style="width:' + m.pct + '%"></span></div>';
    ms.appendChild(d);
  });
}
function match(t) {
  if (!state.prios.has(t.priority)) return false;
  if (state.type && t.type !== state.type) return false;
  if (!state.arch && (t.archived || t.status === 'verworfen')) return false;
  if (state.q) {
    const hay = (t.id + ' ' + t.title + ' ' + t.tags.join(' ') + ' ' + t.milestone).toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}
const rank = (p) => ['P1','P2','P3','P4'].indexOf(p);
function card(t) {
  const flags = [];
  if (t.blocked) flags.push('<span class="tag warn">blockiert</span>');
  if (t.overdue) flags.push('<span class="tag warn">überfällig</span>');
  if (t.incomplete) flags.push('<span class="tag">unvollständig</span>');
  if (t.questions.length) flags.push('<span class="tag">' + t.questions.length + ' Frage(n)</span>');
  const tags = t.tags.map((x) => '<span class="tag">#' + esc(x) + '</span>').join('');
  const crit = t.crit[1] ? '<span class="tag">' + t.crit[0] + '/' + t.crit[1] + ' Kriterien</span>' : '';
  return '<div class="card ' + esc(t.priority) + (flashIds.has(t.id) ? ' flash' : '') + '" data-id="' + esc(t.id) + '">' +
    '<div class="top"><span>' + esc(t.id) + ' · ' + esc(meta.typeLabel[t.type] || t.type) + (t.effort ? ' · ' + esc(t.effort) : '') + '</span><span class="prio ' + esc(t.priority) + '">' + esc(t.priority) + '</span></div>' +
    '<div class="title">' + esc(t.title) + '</div>' +
    (t.thumb ? '<img loading="lazy" src="' + esc(t.thumb) + '" alt="' + esc(t.thumbAlt) + '">' : '') +
    '<div class="tags">' + flags.join('') + crit + (t.due ? '<span class="tag">fällig ' + esc(t.due) + '</span>' : '') + (t.milestone ? '<span class="tag">' + esc(t.milestone) + '</span>' : '') + tags + '</div></div>';
}
function render() {
  const board = document.getElementById('board');
  const cols = state.arch ? COLS : COLS.filter((c) => c !== 'verworfen');
  board.innerHTML = cols.map((c) => {
    let list = tasks.filter((t) => t.status === c && match(t));
    list.sort((a, b) => c === 'erledigt' ? String(b.completed).localeCompare(String(a.completed)) : rank(a.priority) - rank(b.priority) || a.id.localeCompare(b.id));
    return '<section class="col"><h2><span>' + esc(meta.statusLabel[c]) + '</span><span>' + list.length + '</span></h2>' +
      (list.length ? list.map(card).join('') : '<div class="empty">Leer</div>') + '</section>';
  }).join('');
  board.querySelectorAll('.card').forEach((el) => el.onclick = () => open(el.dataset.id));
}
function open(id) {
  const t = tasks.find((x) => x.id === id);
  const d = document.getElementById('dlg');
  if (!t) { if (d.open) d.close(); return; }
  openId = id;
  d.innerHTML = '<button class="chip close" onclick="this.closest(\\'dialog\\').close()">Schließen</button>' +
    '<div class="meta">' + esc(t.id) + ' · ' + esc(meta.typeLabel[t.type]) + ' · <span class="prio ' + esc(t.priority) + '">' + esc(t.priority) + ' ' + esc(meta.prioLabel[t.priority]) + '</span> · ' + esc(meta.statusLabel[t.status]) + '</div>' +
    '<h3>' + esc(t.title) + '</h3>' +
    (t.excerpt ? '<pre>' + esc(t.excerpt) + '</pre>' : '') +
    (t.crit[1] ? '<p>Akzeptanzkriterien: ' + t.crit[0] + ' von ' + t.crit[1] + ' erfüllt</p>' : '') +
    (t.blocked ? '<p>Wartet auf: ' + t.blockers.map(esc).join(', ') + '</p>' : '') +
    (t.questions.length ? '<p>Offene Fragen:</p><ul>' + t.questions.map((q) => '<li>' + esc(q) + '</li>').join('') + '</ul>' : '') +
    (t.thumb ? '<p><img src="' + esc(t.thumb) + '" alt="' + esc(t.thumbAlt) + '"></p>' : '') +
    '<p class="meta">Aktualisiert ' + esc(t.updated) + (t.completed ? ' · abgeschlossen ' + esc(t.completed) : '') + ' · <a href="' + esc(t.file) + '">task.md öffnen</a></p>';
  if (!d.open) d.showModal();
}
document.getElementById('dlg').addEventListener('close', () => { openId = null; });
function renderAll() { renderHeader(); renderMilestones(); render(); }
renderAll();

if (LIVE) {
  const liveEl = document.getElementById('live');
  liveEl.hidden = false;
  const setLive = (ok, text) => { liveEl.classList.toggle('off', !ok); liveEl.textContent = text; };
  setLive(true, 'Live');
  const fingerprint = (t) => JSON.stringify(t);
  async function reload() {
    try {
      const res = await fetch('data.json', { cache: 'no-store' });
      const next = await res.json();
      const before = new Map(tasks.map((t) => [t.id, fingerprint(t)]));
      flashIds = new Set(next.tasks.filter((t) => before.get(t.id) !== fingerprint(t)).map((t) => t.id));
      DATA = next; tasks = next.tasks; meta = next.meta;
      renderAll();
      if (openId) open(openId);
      setLive(true, 'Live · aktualisiert ' + new Date().toLocaleTimeString('de-DE'));
      setTimeout(() => { flashIds = new Set(); }, 1700);
    } catch (e) {
      setLive(false, 'Aktualisierung fehlgeschlagen');
    }
  }
  const es = new EventSource('events');
  es.addEventListener('update', reload);
  es.onopen = () => setLive(true, liveEl.textContent.startsWith('Live') ? liveEl.textContent : 'Live');
  es.onerror = () => setLive(false, 'Verbindung getrennt, neuer Versuch läuft');
}
</script>
</body>
</html>
`;
