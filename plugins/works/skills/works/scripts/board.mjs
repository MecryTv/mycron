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

// Letzter Eintrag im Verlauf, wird in der Live-Ansicht als Grund einer Änderung angezeigt.
function lastLog(t) {
  const lines = (getSection(t._body, 'Verlauf') || '').split('\n')
    .map((l) => l.match(/^- (\d{4}-\d{2}-\d{2}): (.*)$/)).filter(Boolean);
  const m = lines[lines.length - 1];
  return m ? m[2].slice(0, 200) : '';
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
      completed: t.completed || '', updated: t.updated || '', lastLog: lastLog(t),
      file: relFromWorks(root, t._file),
      thumb: imgs.length ? relFromWorks(root, path.resolve(t._dir, imgs[imgs.length - 1].src)) : '',
      thumbAlt: imgs.length ? imgs[imgs.length - 1].alt : '',
    };
  });
  const meta = {
    generated: nowStamp(),
    project: path.basename(root),
    statusLabel: STATUS_LABEL, prioLabel: PRIO_LABEL, typeLabel: TYPE_LABEL,
    milestones: milestoneProgress(config, all).map((m) => ({
      ...m,
      open: all.filter((t) => t.milestone === m.id && OPEN_STATUSES.includes(t.status)).length,
    })),
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
  --p1: #c8322b; --p2: #d97a16; --p3: #3a6fb0; --p4: #8a8984; --ok: #2f8a4f;
  --chip: #efeeea; --accent: #1d1d1b; --shadow: 0 1px 2px rgba(0,0,0,.06);
  --c-backlog: #8a8984; --c-geplant: #3a6fb0; --c-in-arbeit: #d97a16; --c-review: #8a55c4; --c-erledigt: #2f8a4f; --c-verworfen: #8a8984;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #151514; --panel: #1f1f1d; --line: #33322f; --text: #ecebe6; --muted: #9b9a94;
    --p1: #ef5b52; --p2: #f0a04b; --p3: #6d9be0; --p4: #8f8e88; --ok: #4cbf75; --chip: #2a2a27; --accent: #ecebe6; --shadow: none;
    --c-backlog: #8f8e88; --c-geplant: #6d9be0; --c-in-arbeit: #f0a04b; --c-review: #b38ae8; --c-erledigt: #4cbf75; --c-verworfen: #8f8e88; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
header { padding: 20px 24px 12px; display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; }
h1 { font-size: 18px; margin: 0; font-weight: 650; letter-spacing: -.01em; }
.meta { color: var(--muted); font-size: 12px; }
.spacer { flex: 1; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 24px 16px; align-items: center; }
.toolbar input[type="search"], .toolbar select { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; font: inherit; }
.toolbar input[type="search"] { min-width: 220px; }
.chip { border: 1px solid var(--line); background: var(--panel); color: var(--text); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.chip[aria-pressed="false"] { opacity: .45; }
.toggle { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); }
.ms { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 24px 16px; align-items: stretch; }
.ms-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); align-self: center; margin-right: 4px; }
.ms button { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; font: inherit; font-size: 12px; min-width: 200px; text-align: left; cursor: pointer; }
.ms button:hover { border-color: var(--muted); }
.ms button[aria-pressed="true"] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.ms .sub { color: var(--muted); }
.bar { height: 4px; background: var(--chip); border-radius: 2px; margin-top: 6px; overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--ok); transition: width .6s ease; }
main { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(260px, 1fr); gap: 12px; padding: 0 24px 32px; overflow-x: auto; }
.col { background: transparent; min-width: 0; border-radius: 10px; transition: background-color .4s; }
.col.arrive { background: color-mix(in srgb, var(--colc) 10%, transparent); }
.col h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 8px; display: flex; justify-content: space-between; align-items: center; padding-top: 2px; border-top: 2px solid var(--colc); padding-top: 8px; }
.col h2 .n { transition: transform .3s; display: inline-block; }
.col.arrive h2 .n { transform: scale(1.35); color: var(--text); }
.card { position: relative; background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--p4); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; box-shadow: var(--shadow); will-change: transform; }
.card:hover { border-color: var(--muted); }
.card.P1 { border-left-color: var(--p1); } .card.P2 { border-left-color: var(--p2); } .card.P3 { border-left-color: var(--p3); }
.card .top { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--muted); }
.card .title { font-weight: 560; margin: 4px 0 6px; }
.card img { width: 100%; max-height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid var(--line); margin-bottom: 6px; }
.card.changed { outline: 2px solid var(--chc); outline-offset: 1px; }
.card.changed.pulse { animation: pulse 1.4s ease-out 2; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--chc) 55%, transparent); } 100% { box-shadow: 0 0 0 10px transparent; } }
.badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: var(--panel); background: var(--chc); border-radius: 4px; padding: 1px 6px; margin-bottom: 6px; }
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
.live::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--ok); }
.live.off::before { background: var(--p1); }
.toasts { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 20; width: min(380px, calc(100vw - 32px)); }
.toast { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--chc); border-radius: 8px; padding: 10px 12px; box-shadow: 0 6px 20px rgba(0,0,0,.18); font-size: 13px; cursor: pointer; animation: tin .25s ease-out; }
.toast.out { opacity: 0; transform: translateY(8px); transition: opacity .3s, transform .3s; }
@keyframes tin { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.toast .what { font-weight: 600; }
.toast .why { color: var(--muted); font-size: 12px; margin-top: 2px; }
.flow { display: inline-flex; align-items: center; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; background: var(--dc); }
.drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); background: var(--panel); border-left: 1px solid var(--line); z-index: 30; transform: translateX(100%); transition: transform .25s; display: flex; flex-direction: column; }
.drawer.open { transform: none; box-shadow: -8px 0 30px rgba(0,0,0,.2); }
.drawer header { padding: 16px 18px; border-bottom: 1px solid var(--line); }
.drawer h2 { font-size: 15px; margin: 0; }
.drawer ol { list-style: none; margin: 0; padding: 8px 0; overflow-y: auto; flex: 1; }
.drawer li { padding: 10px 18px; border-bottom: 1px solid var(--line); border-left: 3px solid var(--chc); cursor: pointer; font-size: 13px; }
.drawer li:hover { background: var(--chip); }
.drawer .time { color: var(--muted); font-size: 11px; }
.count { background: var(--p3); color: var(--panel); border-radius: 999px; padding: 0 6px; font-size: 11px; margin-left: 4px; }
@media (prefers-reduced-motion: reduce) { .card, .toast, .drawer, .bar span, .col, .col h2 .n { animation: none !important; transition: none !important; } }
@media (max-width: 640px) { header, .toolbar, .ms, main { padding-left: 16px; padding-right: 16px; } .toolbar input[type="search"] { min-width: 0; flex: 1 1 100%; } .ms button { min-width: 0; flex: 1 1 100%; } }
</style>
</head>
<body>
<header>
  <h1 id="h"></h1><span class="meta" id="gen"></span><span class="live" id="live" hidden></span>
  <span class="spacer"></span>
  <button class="chip" id="actBtn" hidden>Aktivität<span class="count" id="actCount" hidden></span></button>
</header>
<div class="toolbar">
  <input id="q" type="search" placeholder="Suchen (Titel, ID, Tag)">
  <span id="prios"></span>
  <select id="type"><option value="">Alle Typen</option></select>
  <label class="toggle"><input type="checkbox" id="arch"> Archiv und Verworfene zeigen</label>
</div>
<div class="ms" id="ms"></div>
<main id="board"></main>
<dialog id="dlg"></dialog>
<div class="toasts" id="toasts" aria-live="polite"></div>
<aside class="drawer" id="drawer" aria-label="Aktivität">
  <header><h2>Aktivität</h2><span class="spacer"></span><button class="chip" id="actClear">Leeren</button><button class="chip" id="actClose">Schließen</button></header>
  <ol id="actList"></ol>
</aside>
<script>
let DATA = __DATA__;
const LIVE = __LIVE__;
let tasks = DATA.tasks;
let meta = DATA.meta;
let openId = null;
const COLS = ['backlog', 'geplant', 'in-arbeit', 'review', 'erledigt', 'verworfen'];
const state = { q: '', prios: new Set(['P1','P2','P3','P4']), type: '', arch: false, ms: '' };
const HIGHLIGHT_MS = 10000;
const changes = new Map();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colVar = (s) => 'var(--c-' + (COLS.includes(s) ? s : 'backlog') + ')';
const KIND = {
  moved: { label: 'verschoben', color: (c) => colVar(c.to) },
  added: { label: 'neu', color: () => 'var(--p3)' },
  prio: { label: 'Priorität', color: () => 'var(--p2)' },
  archived: { label: 'archiviert', color: () => 'var(--c-verworfen)' },
  removed: { label: 'entfernt', color: () => 'var(--p1)' },
  updated: { label: 'aktualisiert', color: () => 'var(--muted)' },
};

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
  if (!meta.milestones.length) return;
  const label = document.createElement('span');
  label.className = 'ms-label'; label.textContent = 'Meilensteine';
  ms.appendChild(label);
  meta.milestones.forEach((m) => {
    const b = document.createElement('button');
    b.setAttribute('aria-pressed', state.ms === m.id ? 'true' : 'false');
    b.title = 'Meilenstein ' + m.id + ': Aufgaben mit milestone=' + m.id + '. Klicken, um nur diese anzuzeigen.';
    b.innerHTML = '<strong>' + esc(m.id) + '</strong> ' + esc(m.title) +
      '<div class="sub">' + m.done + ' von ' + m.total + ' erledigt · ' + m.open + ' offen' + (m.due ? ' · Ziel ' + esc(m.due) : '') + '</div>' +
      '<div class="bar"><span style="width:' + m.pct + '%"></span></div>';
    b.onclick = () => { state.ms = state.ms === m.id ? '' : m.id; renderMilestones(); render(); };
    ms.appendChild(b);
  });
}

function match(t) {
  if (!state.prios.has(t.priority)) return false;
  if (state.type && t.type !== state.type) return false;
  if (state.ms && t.milestone !== state.ms) return false;
  if (!state.arch && (t.archived || t.status === 'verworfen')) return false;
  if (state.q) {
    const hay = (t.id + ' ' + t.title + ' ' + t.tags.join(' ') + ' ' + t.milestone).toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}
const rank = (p) => ['P1','P2','P3','P4'].indexOf(p);

function changeText(c, short) {
  const L = meta.statusLabel;
  if (c.kind === 'moved') return short ? (L[c.from] || c.from) + ' → ' + (L[c.to] || c.to) : 'verschoben: ' + (L[c.from] || c.from) + ' → ' + (L[c.to] || c.to);
  if (c.kind === 'prio') return 'Priorität ' + c.from + ' → ' + c.to;
  if (c.kind === 'added') return 'neu angelegt in ' + (L[c.to] || c.to);
  if (c.kind === 'archived') return 'archiviert';
  if (c.kind === 'removed') return 'entfernt';
  return 'aktualisiert';
}
function changeColor(c) { return KIND[c.kind].color(c); }

function card(t) {
  const flags = [];
  if (t.blocked) flags.push('<span class="tag warn">blockiert</span>');
  if (t.overdue) flags.push('<span class="tag warn">überfällig</span>');
  if (t.incomplete) flags.push('<span class="tag">unvollständig</span>');
  if (t.questions.length) flags.push('<span class="tag">' + t.questions.length + ' Frage(n)</span>');
  const tags = t.tags.map((x) => '<span class="tag">#' + esc(x) + '</span>').join('');
  const crit = t.crit[1] ? '<span class="tag">' + t.crit[0] + '/' + t.crit[1] + ' Kriterien</span>' : '';
  const ch = changes.get(t.id);
  const chAttr = ch ? ' style="--chc:' + changeColor(ch) + '"' : '';
  const badge = ch && ch.kind !== 'updated' ? '<div class="badge">' + esc(changeText(ch, true)) + '</div>' : '';
  return '<div class="card ' + esc(t.priority) + (ch ? ' changed' + (ch.fresh ? ' pulse' : '') : '') + '" data-id="' + esc(t.id) + '"' + chAttr + '>' +
    badge +
    '<div class="top"><span>' + esc(t.id) + ' · ' + esc(meta.typeLabel[t.type] || t.type) + (t.effort ? ' · ' + esc(t.effort) : '') + '</span><span class="prio ' + esc(t.priority) + '">' + esc(t.priority) + '</span></div>' +
    '<div class="title">' + esc(t.title) + '</div>' +
    (t.thumb ? '<img loading="lazy" src="' + esc(t.thumb) + '" alt="' + esc(t.thumbAlt) + '">' : '') +
    '<div class="tags">' + flags.join('') + crit + (t.due ? '<span class="tag">fällig ' + esc(t.due) + '</span>' : '') + (t.milestone ? '<span class="tag">' + esc(t.milestone) + '</span>' : '') + tags + '</div></div>';
}

function render(arrived) {
  const board = document.getElementById('board');
  const cols = state.arch ? COLS : COLS.filter((c) => c !== 'verworfen');
  board.innerHTML = cols.map((c) => {
    let list = tasks.filter((t) => t.status === c && match(t));
    list.sort((a, b) => c === 'erledigt' ? String(b.completed).localeCompare(String(a.completed)) : rank(a.priority) - rank(b.priority) || a.id.localeCompare(b.id));
    return '<section class="col' + (arrived && arrived.has(c) ? ' arrive' : '') + '" data-col="' + c + '" style="--colc:' + colVar(c) + '"><h2><span>' + esc(meta.statusLabel[c]) + '</span><span class="n">' + list.length + '</span></h2>' +
      (list.length ? list.map(card).join('') : '<div class="empty">Leer</div>') + '</section>';
  }).join('');
  board.querySelectorAll('.card').forEach((el) => el.onclick = () => open(el.dataset.id));
  for (const ch of changes.values()) ch.fresh = false;
}

function open(id) {
  const t = tasks.find((x) => x.id === id);
  const d = document.getElementById('dlg');
  if (!t) { if (d.open) d.close(); return; }
  openId = id;
  const ch = changes.get(id);
  d.innerHTML = '<button class="chip close" id="dlgClose">Schließen</button>' +
    '<div class="meta">' + esc(t.id) + ' · ' + esc(meta.typeLabel[t.type]) + ' · <span class="prio ' + esc(t.priority) + '">' + esc(t.priority) + ' ' + esc(meta.prioLabel[t.priority]) + '</span> · ' + esc(meta.statusLabel[t.status]) + (t.milestone ? ' · ' + esc(t.milestone) : '') + '</div>' +
    '<h3>' + esc(t.title) + '</h3>' +
    (ch ? '<p class="meta">Zuletzt ' + esc(changeText(ch)) + ' um ' + esc(ch.time) + '</p>' : '') +
    (t.excerpt ? '<pre>' + esc(t.excerpt) + '</pre>' : '') +
    (t.crit[1] ? '<p>Akzeptanzkriterien: ' + t.crit[0] + ' von ' + t.crit[1] + ' erfüllt</p>' : '') +
    (t.blocked ? '<p>Wartet auf: ' + t.blockers.map(esc).join(', ') + '</p>' : '') +
    (t.questions.length ? '<p>Offene Fragen:</p><ul>' + t.questions.map((q) => '<li>' + esc(q) + '</li>').join('') + '</ul>' : '') +
    (t.thumb ? '<p><img src="' + esc(t.thumb) + '" alt="' + esc(t.thumbAlt) + '"></p>' : '') +
    (t.lastLog ? '<p class="meta">Letzter Verlaufseintrag: ' + esc(t.lastLog) + '</p>' : '') +
    '<p class="meta">Aktualisiert ' + esc(t.updated) + (t.completed ? ' · abgeschlossen ' + esc(t.completed) : '') + ' · <a href="' + esc(t.file) + '">task.md öffnen</a></p>';
  document.getElementById('dlgClose').onclick = () => d.close();
  if (!d.open) d.showModal();
}
document.getElementById('dlg').addEventListener('close', () => { openId = null; });

function focusCard(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  if (!match(t)) { state.q = ''; document.getElementById('q').value = ''; state.ms = ''; state.prios = new Set(['P1','P2','P3','P4']); document.querySelectorAll('#prios .chip').forEach((b) => b.setAttribute('aria-pressed', 'true')); state.type = ''; sel.value = ''; if (t.archived || t.status === 'verworfen') { state.arch = true; document.getElementById('arch').checked = true; } renderMilestones(); render(); }
  const el = document.querySelector('.card[data-id="' + CSS.escape(id) + '"]');
  if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center', inline: 'center' });
  open(id);
}

function renderAll(arrived) { renderHeader(); renderMilestones(); render(arrived); }
renderAll();

if (LIVE) {
  const liveEl = document.getElementById('live');
  liveEl.hidden = false;
  const setLive = (ok, text) => { liveEl.classList.toggle('off', !ok); liveEl.textContent = text; };
  setLive(true, 'Live');

  // Aktivität: bleibt pro Projekt im Browser gespeichert, damit ein Neuladen nichts verliert.
  const actKey = 'works-activity-' + meta.project;
  let activity = [];
  try { activity = JSON.parse(localStorage.getItem(actKey) || '[]'); } catch (e) { activity = []; }
  let unseen = 0;
  const actBtn = document.getElementById('actBtn');
  const actCount = document.getElementById('actCount');
  const drawer = document.getElementById('drawer');
  actBtn.hidden = false;
  function saveActivity() { try { localStorage.setItem(actKey, JSON.stringify(activity.slice(0, 100))); } catch (e) {} }
  function renderActivity() {
    actCount.hidden = unseen === 0; actCount.textContent = unseen;
    const L = document.getElementById('actList');
    L.innerHTML = activity.length ? activity.map((a) => '<li data-id="' + esc(a.id) + '" style="--chc:' + changeColor(a) + '"><div class="time">' + esc(a.date) + ' ' + esc(a.time) + '</div><div><strong>' + esc(a.id) + '</strong> ' + esc(a.title) + '</div><div>' + flowHtml(a) + '</div>' + (a.why ? '<div class="time">' + esc(a.why) + '</div>' : '') + '</li>').join('') : '<li style="--chc:transparent;cursor:default">Noch keine Änderungen in dieser Ansicht.</li>';
    L.querySelectorAll('li[data-id]').forEach((li) => li.onclick = () => { drawer.classList.remove('open'); focusCard(li.dataset.id); });
  }
  function flowHtml(c) {
    if (c.kind === 'moved') return '<span class="flow"><span class="dot" style="--dc:' + colVar(c.from) + '"></span>' + esc(meta.statusLabel[c.from] || c.from) + ' → <span class="dot" style="--dc:' + colVar(c.to) + '"></span>' + esc(meta.statusLabel[c.to] || c.to) + '</span>';
    return esc(changeText(c));
  }
  actBtn.onclick = () => { drawer.classList.toggle('open'); unseen = 0; renderActivity(); };
  document.getElementById('actClose').onclick = () => drawer.classList.remove('open');
  document.getElementById('actClear').onclick = () => { activity = []; saveActivity(); renderActivity(); };
  renderActivity();

  function toast(c) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast'; el.style.setProperty('--chc', changeColor(c));
    el.innerHTML = '<div class="what">' + esc(c.id) + ' ' + esc(c.title) + '</div><div>' + flowHtml(c) + '</div>' + (c.why ? '<div class="why">' + esc(c.why) + '</div>' : '');
    el.onclick = () => { el.remove(); focusCard(c.id); };
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 7000);
  }

  function diff(prev, next) {
    const before = new Map(prev.map((t) => [t.id, t]));
    const after = new Map(next.map((t) => [t.id, t]));
    const out = [];
    for (const t of next) {
      const o = before.get(t.id);
      if (!o) { out.push({ kind: 'added', id: t.id, title: t.title, to: t.status }); continue; }
      if (o.status !== t.status) out.push({ kind: 'moved', id: t.id, title: t.title, from: o.status, to: t.status });
      else if (!o.archived && t.archived) out.push({ kind: 'archived', id: t.id, title: t.title });
      else if (o.priority !== t.priority) out.push({ kind: 'prio', id: t.id, title: t.title, from: o.priority, to: t.priority });
      else if (JSON.stringify(o) !== JSON.stringify(t)) out.push({ kind: 'updated', id: t.id, title: t.title });
    }
    for (const o of prev) if (!after.has(o.id)) out.push({ kind: 'removed', id: o.id, title: o.title });
    return out.map((c) => ({ ...c, why: (after.get(c.id) || {}).lastLog || '' }));
  }

  function positions() {
    const m = new Map();
    document.querySelectorAll('.card').forEach((el) => m.set(el.dataset.id, el.getBoundingClientRect()));
    return m;
  }
  // FLIP: Karten gleiten von ihrer alten an die neue Position.
  function animateFrom(oldPos, movedIds) {
    if (reduceMotion) return;
    document.querySelectorAll('.card').forEach((el) => {
      const id = el.dataset.id;
      const was = oldPos.get(id);
      const now = el.getBoundingClientRect();
      if (!was) {
        el.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: 'ease-out' });
        return;
      }
      const dx = was.left - now.left; const dy = was.top - now.top;
      if (!dx && !dy) return;
      const big = movedIds.has(id);
      el.animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px)' + (big ? ' scale(1.03)' : ''), zIndex: big ? 5 : 1 },
        { transform: 'none', zIndex: big ? 5 : 1 },
      ], { duration: big ? 750 : 400, easing: 'cubic-bezier(.2,.7,.2,1)' });
    });
  }

  async function reload() {
    try {
      const res = await fetch('data.json', { cache: 'no-store' });
      const next = await res.json();
      const found = diff(tasks, next.tasks);
      const now = new Date();
      const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const date = now.toLocaleDateString('de-DE');
      const arrived = new Set();
      const movedIds = new Set();
      for (const c of found) {
        c.time = time; c.date = date; c.fresh = true; c.at = Date.now();
        changes.set(c.id, c);
        if (c.kind === 'moved' || c.kind === 'added') { arrived.add(c.to); movedIds.add(c.id); }
        if (c.kind !== 'updated') { activity.unshift(c); unseen++; toast(c); }
      }
      if (found.some((c) => c.kind !== 'updated')) { saveActivity(); renderActivity(); }
      const oldPos = positions();
      DATA = next; tasks = next.tasks; meta = next.meta;
      renderAll(arrived);
      animateFrom(oldPos, movedIds);
      if (arrived.size) setTimeout(() => document.querySelectorAll('.col.arrive').forEach((c) => c.classList.remove('arrive')), 1500);
      if (openId) open(openId);
      setLive(true, 'Live · aktualisiert ' + time);
    } catch (e) {
      setLive(false, 'Aktualisierung fehlgeschlagen');
    }
  }
  // Markierungen nach Ablauf entfernen.
  setInterval(() => {
    let dirty = false;
    for (const [id, c] of changes) if (Date.now() - c.at > HIGHLIGHT_MS) { changes.delete(id); dirty = true; }
    if (dirty) render();
  }, 1000);

  let first = true;
  const es = new EventSource('events');
  es.addEventListener('update', () => { if (first) { first = false; return; } reload(); });
  // Nach einem Reconnect schickt der Server sofort ein update, dadurch holt die Ansicht verpasste Änderungen nach.
  es.onopen = () => { if (liveEl.classList.contains('off')) setLive(true, 'Live'); };
  es.onerror = () => setLive(false, 'Verbindung getrennt, neuer Versuch läuft');
}
</script>
</body>
</html>
`;
