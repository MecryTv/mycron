// Kanban-Board: erzeugt .works/board.html und liefert die Daten für die Live-Ansicht (works board --serve).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadTasks, loadConfig, worksDir, queueOf, getSection, checkboxes, stripComments, imageLinks,
  isBlocked, openBlockers, isOverdue, openQuestions, relFromWorks, nowStamp, STATUS_LABEL,
  PRIO_LABEL, TYPE_LABEL, OPEN_STATUSES, today, rootIdOf,
} from './lib.mjs';
import { byIdMap, milestoneProgress } from './views.mjs';
import { runningVersion } from './server-control.mjs';
import { activeSprint, lastClosedSprint, sprintStats, sprintSettings } from './sprint.mjs';
import { loadComments } from './comments.mjs';
import { effortDays, staleTasks } from './timelog.mjs';
import { configuredChecks, checksFor, loadResults, flakyOf, trendOf } from './checks.mjs';
import { designSummary } from './design.mjs';
import { loadActivity, pendingInstructions, stampSteps, backgroundOf } from './live.mjs';
import { loadKnowledge } from './knowledge.mjs';
import { loadLanes } from './parallel.mjs';
import { liveUsage } from './usage.mjs';
import { fileConflicts } from './files.mjs';
import { tr, language, languageSource, languages, LANGUAGE_NAMES, catalog, setLanguage } from './i18n.mjs';

function excerpt(t) {
  for (const s of ['Ziel', 'Zusammenfassung', 'Forschungsfrage', 'Beschreibung', 'Abkürzung', 'Kontext und Problem', 'Problem', 'Herkunft']) {
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

// Erster Start laut Verlauf, für die Zeitleiste.
function startedOf(t) {
  const m = (getSection(t._body, 'Verlauf') || '').match(/^- (\d{4}-\d{2}-\d{2}): (?:Gestartet|Started)/m);
  return m ? m[1] : '';
}

// Prüfungsstand einer Aufgabe für die Live-Ansicht. null, wenn keine Prüfungen eingerichtet sind.
// Ein running älter als Zeitgrenze plus eine Minute stammt aus einem abgebrochenen Lauf und zählt nicht.
const STALE_RUN_MS = 11 * 60 * 1000;
function liveChecks(config, t) {
  const list = checksFor(config, t);
  if (!list.length) return null;
  const r = loadResults(t) || {};
  const fresh = !!r.running && Date.now() - Date.parse(r.runningSince) < STALE_RUN_MS;
  // wackelig und Laufzeittrend fertig berechnet, damit das Board nur noch anzeigt.
  const results = Object.fromEntries(Object.entries(r.results || {}).map(([k, v]) => [k, { ...v, flaky: flakyOf(v.hist), trend: trendOf(v.hist) }]));
  return { list, results, running: fresh ? r.running : '', runningSince: fresh ? r.runningSince : '', at: r.at || '' };
}

export function boardData(root) {
  // Sprache je Aufbau frisch bestimmen (W-0041): Der Board-Server läuft lange, works lang wirkt ohne Neustart.
  const lang = language(root);
  setLanguage(lang);
  const config = loadConfig(root);
  const all = loadTasks(root);
  const byId = byIdMap(all);
  // Tagesliste der Live-Ansicht: in Arbeit, im Review, in der Warteschlange oder heute erledigt.
  const queued = new Set(queueOf(config));
  const day = today();
  const plans = stampSteps(root, all.filter((t) => ['in-arbeit', 'review'].includes(t.status)
    || (OPEN_STATUSES.includes(t.status) && queued.has(t.id)) || (t.status === 'erledigt' && t.completed === day)), { prune: true });
  const usage = liveUsage(root, config);
  const stale = staleTasks(root, config, all);
  // Konflikt-Radar: offene Aufgaben (in Arbeit, Review, Warteschlange), die dieselben Dateien ändern.
  const conflicts = fileConflicts(root, config, all.filter((t) => ['in-arbeit', 'review'].includes(t.status) || (OPEN_STATUSES.includes(t.status) && queued.has(t.id))));
  const data = all.map((t) => {
    const imgs = imageLinks(getSection(t._body, 'Assets') || '').filter((i) => !/^https?:/.test(i.src));
    const crit = checkboxes(getSection(t._body, 'Akzeptanzkriterien') || '');
    const com = loadComments(t);
    return {
      design: designSummary(t),
      comments: com.length, lastCommentBy: com.length ? com[com.length - 1].author : '', lastCommentAt: com.length ? com[com.length - 1].at : '',
      id: t.id, title: t.title, type: t.type, priority: t.priority, status: t.status,
      effort: t.effort || '', due: t.due || '', milestone: t.milestone || '', tags: t.tags || [],
      blocked: OPEN_STATUSES.includes(t.status) && isBlocked(t, byId), blockers: openBlockers(t, byId),
      overdue: !!isOverdue(t), incomplete: !!t.incomplete, questions: openQuestions(t).map((q) => q.text),
      crit: [crit.done, crit.total], excerpt: excerpt(t), archived: t._archived,
      completed: t.completed || '', updated: t.updated || '', created: t.created || '', started: startedOf(t), lastLog: lastLog(t),
      blockedBy: t.blocked_by || [], risk: t.risk || '', branch: t.branch || '',
      file: relFromWorks(root, t._file),
      stale: stale[t.id] || null,
      conflicts: conflicts[t.id] || null,
      thumb: imgs.length ? relFromWorks(root, path.resolve(t._dir, imgs[imgs.length - 1].src)) : '',
      thumbAlt: imgs.length ? imgs[imgs.length - 1].alt : '',
      ...(plans.has(t.id) ? { plan: plans.get(t.id), checks: liveChecks(config, t), usage: usage.byTask[t.id] || null } : {}),
    };
  });
  const open = new Set(all.filter((t) => OPEN_STATUSES.includes(t.status)).map((t) => t.id));
  const meta = {
    generated: nowStamp(),
    lang,
    queue: queueOf(config).filter((id) => open.has(id)),
    sprint: (() => { const sp = activeSprint(config); return sp ? { ...sp, stats: sprintStats(config, sp, all) } : null; })(),
    lastSprint: (() => { const sp = lastClosedSprint(config); return sp ? { id: sp.id, title: sp.title, result: sp.result || null, carry: sp.carry || [] } : null; })(),
    sprintSettings: sprintSettings(config),
    views: Array.isArray(config.views) ? config.views : [],
    effortDays: effortDays(root, all, config),
    hasChecks: Object.keys(configuredChecks(config)).length > 0,
    today: day,
    staleDays: config.handoff_stale_days === undefined ? 3 : Number(config.handoff_stale_days) || 0,
    usage: { currency: usage.currency, today: usage.today },
    // background: Befehle im Hintergrund mit Stand aus ihrer Ausgabedatei (W-0059), ohne Pfad.
    activity: (() => { const a = loadActivity(root); return a ? { busy: !!a.busy, current: a.current || null, recent: a.recent || [], since: a.since || '', idleSince: a.idleSince || '', lanes: a.lanes || {}, background: backgroundOf(a) } : null; })(),
    lanes: loadLanes(root).map((l) => ({ task: l.task, branch: l.branch, dir: path.basename(l.path), started: l.started, status: l.status })),
    instructions: pendingInstructions(root).map((x) => ({ task: x.task, text: x.text, at: x.at })),
    knowledgeProposals: loadKnowledge(root).filter((e) => e.status === 'vorschlag').length,
    queueSettings: { auto_next: false, skip_blocked: true, ask_before: true, ...(config.queue_settings || {}) },
    version: runningVersion(),
    project: path.basename(root),
    rootId: rootIdOf(root),
    statusLabel: STATUS_LABEL, prioLabel: PRIO_LABEL, typeLabel: TYPE_LABEL,
    milestones: milestoneProgress(config, all).map((m) => ({
      ...m,
      open: all.filter((t) => t.milestone === m.id && OPEN_STATUSES.includes(t.status)).length,
    })),
  };
  return { tasks: data, meta };
}

const ASSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'board');
let assetCache = null;
function boardAssets() {
  if (assetCache && !process.env.WORKS_DEV) return assetCache;
  const read = (f) => fs.readFileSync(path.join(ASSET_DIR, f), 'utf8');
  const font = fs.readFileSync(path.join(ASSET_DIR, 'fonts', 'Geist-Variable.woff2')).toString('base64');
  const template = read('template.html');
  const js = read('board.js');
  assetCache = {
    template,
    css: read('board.css').replace('__FONT__', `data:font/woff2;base64,${font}`),
    js,
    keys: boardKeys(js, template),
  };
  return assetCache;
}

// Texte, die das Board übersetzt (W-0041): die tr-Aufrufe in board.js und {{t:Text}} in template.html. Nur diese gehen als
// Katalog in die Seite, damit sie klein bleibt. Gleiche Suche wie im Selbsttest.
const TR_RE = /\btr\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)\s*[,)]/g;
const T_RE = /\{\{t:(.+?)\}\}/g;
const unesc = (s) => s.replace(/\\(.)/g, (a, c) => ({ n: '\n', t: '\t' })[c] || c);
function boardKeys(js, template) {
  const keys = [...js.replace(/\r\n?/g, '\n').matchAll(TR_RE)].map((m) => unesc(m[1] ?? m[2] ?? m[3]));
  return [...new Set([...keys, ...[...template.matchAll(T_RE)].map((m) => m[1])])];
}

// Sprache, Herkunft, verfügbare Sprachen und die Übersetzungen der Board-Texte für window.WORKS.i18n.
function boardI18n(root, lang, keys) {
  const cat = catalog(lang);
  return {
    lang, source: languageSource(root).source,
    languages: languages().map((code) => ({ code, name: LANGUAGE_NAMES[code] || code })),
    catalog: Object.fromEntries(keys.filter((k) => typeof cat[k] === 'string' && cat[k]).map((k) => [k, cat[k]])),
  };
}

export function boardCss() { return boardAssets().css; }

// Setzt Vorlage, Stile, Skript und Daten zu einer eigenständigen HTML-Datei zusammen.
// mode: edit (Live mit Bearbeiten), view (Live nur lesen, geteilter Link), static (board.html), snapshot (Export).
// root: Projekt, f\u00fcr die Herkunft der Sprache (works lang, W-0041).
export function renderBoard(data, { live = false, token = '', mode = live ? 'edit' : 'static', details = null, root } = {}) {
  const a = boardAssets();
  const lang = data.meta.lang || language(root);
  const i18n = boardI18n(root, lang, a.keys);
  const boot = JSON.stringify({ data, live, token, mode, details, i18n }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  return a.template
    .replace(T_RE, (all, text) => esc(tr(text, null, lang)))
    .replace('__LANG__', () => esc(lang))
    .replace('__TITLE__', () => esc(`Works ${data.meta.project}`))
    .replace('/*__CSS__*/', () => a.css)
    .replace('/*__BOOT__*/', () => `window.WORKS = ${boot};`)
    .replace('/*__JS__*/', () => a.js.replace(/<\/script/gi, '<\\/script'));
}

export function boardFile(root) {
  return path.join(worksDir(root), 'board.html');
}

export function generateBoard(root) {
  const file = boardFile(root);
  fs.writeFileSync(file, renderBoard(boardData(root), { root }));
  return file;
}

// Aktualisiert board.html nur, wenn sie bereits existiert (wird nach jeder Änderung aufgerufen).
export function refreshBoardIfPresent(root) {
  if (fs.existsSync(boardFile(root))) generateBoard(root);
}
