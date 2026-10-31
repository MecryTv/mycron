// Kanban-Board: erzeugt .works/board.html und liefert die Daten für die Live-Ansicht (works board --serve).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadTasks, loadConfig, worksDir, getSection, checkboxes, stripComments, imageLinks,
  isBlocked, openBlockers, isOverdue, openQuestions, relFromWorks, nowStamp, STATUS_LABEL,
  PRIO_LABEL, TYPE_LABEL, OPEN_STATUSES,
} from './lib.mjs';
import { byIdMap, milestoneProgress } from './views.mjs';
import { runningVersion } from './server-control.mjs';

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
      completed: t.completed || '', updated: t.updated || '', created: t.created || '', lastLog: lastLog(t),
      file: relFromWorks(root, t._file),
      thumb: imgs.length ? relFromWorks(root, path.resolve(t._dir, imgs[imgs.length - 1].src)) : '',
      thumbAlt: imgs.length ? imgs[imgs.length - 1].alt : '',
    };
  });
  const meta = {
    generated: nowStamp(),
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
export function renderBoard(data, { live = false, token = '' } = {}) {
  const a = boardAssets();
  const boot = JSON.stringify({ data, live, token }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
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
