// Kanban-Board: erzeugt .works/board.html und liefert die Daten für die Live-Ansicht (works board --serve).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadTasks, loadConfig, worksDir, queueOf, getSection, checkboxes, stripComments, imageLinks,
  isBlocked, openBlockers, isOverdue, openQuestions, relFromWorks, nowStamp, STATUS_LABEL,
  PRIO_LABEL, TYPE_LABEL, OPEN_STATUSES,
} from './lib.mjs';
import { byIdMap, milestoneProgress } from './views.mjs';
import { runningVersion } from './server-control.mjs';
import { activeSprint, lastClosedSprint, sprintStats, sprintSettings } from './sprint.mjs';
import { loadComments } from './comments.mjs';
import { effortDays } from './timelog.mjs';
import { configuredChecks } from './checks.mjs';
import { designSummary } from './design.mjs';
import { loadActivity, pendingInstructions } from './live.mjs';
import { loadKnowledge } from './knowledge.mjs';

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
  const m = (getSection(t._body, 'Verlauf') || '').match(/^- (\d{4}-\d{2}-\d{2}): Gestartet/m);
  return m ? m[1] : '';
}

export function boardData(root) {
  const config = loadConfig(root);
  const all = loadTasks(root);
  const byId = byIdMap(all);
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
      thumb: imgs.length ? relFromWorks(root, path.resolve(t._dir, imgs[imgs.length - 1].src)) : '',
      thumbAlt: imgs.length ? imgs[imgs.length - 1].alt : '',
    };
  });
  const open = new Set(all.filter((t) => OPEN_STATUSES.includes(t.status)).map((t) => t.id));
  const meta = {
    generated: nowStamp(),
    queue: queueOf(config).filter((id) => open.has(id)),
    sprint: (() => { const sp = activeSprint(config); return sp ? { ...sp, stats: sprintStats(config, sp, all) } : null; })(),
    lastSprint: (() => { const sp = lastClosedSprint(config); return sp ? { id: sp.id, title: sp.title, result: sp.result || null, carry: sp.carry || [] } : null; })(),
    sprintSettings: sprintSettings(config),
    views: Array.isArray(config.views) ? config.views : [],
    effortDays: effortDays(root, all, config),
    hasChecks: Object.keys(configuredChecks(config)).length > 0,
    activity: (() => { const a = loadActivity(root); return a ? { busy: !!a.busy, current: a.current || null, recent: (a.recent || []).slice(0, 6), since: a.since || '', idleSince: a.idleSince || '' } : null; })(),
    instructions: pendingInstructions(root).map((x) => ({ task: x.task, text: x.text, at: x.at })),
    knowledgeProposals: loadKnowledge(root).filter((e) => e.status === 'vorschlag').length,
    queueSettings: { auto_next: false, skip_blocked: true, ask_before: true, ...(config.queue_settings || {}) },
    version: runningVersion(),
    project: path.basename(root),
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
  assetCache = {
    template: read('template.html'),
    css: read('board.css').replace('__FONT__', `data:font/woff2;base64,${font}`),
    js: read('board.js'),
  };
  return assetCache;
}

// Setzt Vorlage, Stile, Skript und Daten zu einer eigenständigen HTML-Datei zusammen.
// mode: edit (Live mit Bearbeiten), view (Live nur lesen, geteilter Link), static (board.html), snapshot (Export).
export function renderBoard(data, { live = false, token = '', mode = live ? 'edit' : 'static', details = null } = {}) {
  const a = boardAssets();
  const boot = JSON.stringify({ data, live, token, mode, details }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const title = `Works ${data.meta.project}`.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  return a.template
    .replace('__TITLE__', () => title)
    .replace('/*__CSS__*/', () => a.css)
    .replace('/*__BOOT__*/', () => `window.WORKS = ${boot};`)
    .replace('/*__JS__*/', () => a.js.replace(/<\/script/gi, '<\\/script'));
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
