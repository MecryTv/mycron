// Lese- und Schreibschnittstelle für das Live-Board.
// Schreibaktionen laufen über das CLI, damit Prüfungen, Verlauf und Index identisch zum Terminal sind.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readText,
  loadTasks, loadConfig, saveConfig, worksDir, getSection, stripComments, imageLinks, checkboxes,
  isBlocked, openBlockers, openQuestions, relFromWorks, exists,
  STATUSES, OPEN_STATUSES, STATUS_LABEL, PRIORITIES, PRIO_LABEL, TYPES, TYPE_LABEL, EFFORTS, RISKS, sectionKey, sectionTitle,
} from './lib.mjs';
import { tr, variants, languages, languageSource } from './i18n.mjs';
import { dodCheck, nextCandidates, byIdMap } from './views.mjs';
import { loadComments, unreadForClaude } from './comments.mjs';
import { listTemplates, templateFromTask, normalizeTemplate, SLUG_RE } from './templates.mjs';
import { taskTime, estimates } from './timelog.mjs';
import { detectChecks, configuredChecks, NAME_RE, checkHealth } from './checks.mjs';
import { reportSettings, localReport, listReports, weekRange, reportName } from './weekly.mjs';
import { designDetail, loadDesign, VARIANT_RE } from './design.mjs';
import { taskUsage, projectUsage } from './usage.mjs';
import { loadKnowledge } from './knowledge.mjs';
import { rules, upcoming, describe as describeRule, RULE_ID_RE } from './recurring.mjs';
import { addDays as addDaysIso } from './sprint.mjs';
import { syncSettings, syncState, DEFAULT_SYNC, prsFor } from './ghsync.mjs';
import { findSimilar, similarity } from './similar.mjs';
import { snapshot, snapshotRestore, relabel, dropSnapshot, undo as undoFn, undoList } from './undo.mjs';
import { readBackup, compareBackup, mergeBackup, restoreBackup } from './backup.mjs';
import { filesForTask } from './files.mjs';
import { laneOf, laneInfo, loadLanes, planParallel } from './parallel.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'works.mjs');
const ID_RE = /^[A-Za-z]{1,8}-?\d{1,6}$/;
const IDEA_RE = /^I-\d{1,5}$/i;
const MS_RE = /^M\d{1,4}$/i;
const ASSET_KINDS = ['ist', 'vorher', 'nachher', 'referenz', 'mockup', 'skizze', 'fehler', 'diagramm'];
const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif' };
const CHECK_SECTIONS = ['Akzeptanzkriterien', 'Umsetzungsplan', 'Checkliste', 'Vorgehen'];
const GOAL_SECTION = {
  feature: 'Ziel', design: 'Ziel', refactor: 'Ziel', bug: 'Zusammenfassung',
  spike: 'Forschungsfrage', chore: 'Beschreibung', debt: 'Abkürzung',
};
// Abschnitte, die im Board als Text bearbeitet werden dürfen.
const EDITABLE_SECTIONS = [
  'Ziel', 'Kontext und Problem', 'Nutzerperspektive', 'Betroffene Dateien', 'Designentscheidungen',
  'Zusammenfassung', 'Reproduktion', 'Erwartetes Verhalten', 'Tatsächliches Verhalten', 'Umgebung',
  'Logs und Fehlermeldungen', 'Ursache', 'Lösung', 'Ist-Zustand', 'Zielarchitektur', 'Motivation',
  'Risiken', 'Rollback', 'Forschungsfrage', 'Zeitlimit', 'Hypothesen', 'Ergebnisse', 'Empfehlung',
  'Folgeaufgaben', 'Beschreibung', 'Zielgruppe und Kontext', 'Referenzen', 'Varianten', 'Gewählte Lösung',
  'Abkürzung', 'Grund', 'Folgekosten und Risiko', 'Auslöser', 'Rückzahlung', 'Übergabe', 'Herkunft',
];
const SKIP_IN_DETAIL = new Set(['Verlauf', 'Assets', 'Offene Fragen', ...CHECK_SECTIONS]);
// Abschnitte, in denen eine Beschreibung stehen kann, falls der Hauptabschnitt des Typs fehlt oder leer ist
// (etwa nach einem Typwechsel oder wenn die task.md von Hand geschrieben wurde).
const DESCRIPTION_SECTIONS = ['Ziel', 'Zusammenfassung', 'Beschreibung', 'Forschungsfrage', 'Abkürzung', 'Kontext und Problem', 'Problem', 'Herkunft'];

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => { throw new ApiError(400, msg); };

function str(v, name, { max = 2000, required = false } = {}) {
  if (v === undefined || v === null || v === '') { if (required) bad(tr('{name} missing.', { name })); return ''; }
  if (typeof v !== 'string') bad(tr('{name} must be text.', { name }));
  const s = v.trim();
  if (required && !s) bad(tr('{name} missing.', { name }));
  if (s.length > max) bad(tr('{name} is too long (at most {max} characters).', { name, max }));
  return s;
}
function oneOf(v, name, allowed, { required = false } = {}) {
  if (v === undefined || v === null || v === '') { if (required) bad(tr('{name} missing.', { name })); return ''; }
  if (!allowed.includes(v)) bad(tr('Invalid value for {key}.', { key: name }));
  return v;
}
function id(v) {
  if (typeof v !== 'string' || !ID_RE.test(v)) bad(tr('Invalid task ID.'));
  return v.toUpperCase();
}
function date(v, name) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) bad(tr('{name} needs the format YYYY-MM-DD.', { name }));
  return v;
}
function list(v, name, re) {
  if (v === undefined || v === null || v === '') return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map((x) => String(x).trim()).filter(Boolean).map((x) => {
    if (x.length > 40 || (re && !re.test(x))) bad(tr('Invalid entry in {name}: {value}', { name, value: x.slice(0, 40) }));
    return x;
  });
}
// Abschnitt aus dem Board (Überschrift in der Sprache der Aufgabe oder deutscher Schlüssel) → Schlüssel für das CLI.
const checkSection = (v) => oneOf(sectionKey(v || 'Akzeptanzkriterien'), tr('Section'), CHECK_SECTIONS);
const TAG_RE = /^[\p{L}\p{N}_.+-]+$/u;

// ---------- CLI-Aufrufe, nacheinander ausgeführt ----------

let queue = Promise.resolve();
function cli(root, args, { timeout = 30000 } = {}) {
  const job = queue.then(() => new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], {
      cwd: root, env: { ...process.env, WORKS_ACTOR: process.env.WORKS_API_ACTOR || 'Board' }, timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  }));
  queue = job.catch(() => {});
  return job;
}

async function must(root, args, opts) {
  const r = await cli(root, args, opts);
  if (!r.ok) {
    // Fehler stehen auf stderr (erste Zeile zählt). Ohne stderr, etwa bei nicht erfüllter DoD, steht die Erklärung in der letzten Zeile von stdout.
    const errLines = r.stderr.split('\n').map((l) => l.replace(/^(Fehler|Hinweis|Error|Note):\s*/, '').trim()).filter(Boolean);
    const outLines = r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    const msg = errLines.find((l) => !/^at |node:/.test(l)) || outLines[outLines.length - 1] || tr('Action failed.');
    throw new ApiError(422, msg);
  }
  return r.stdout.trim();
}

function tmpFile(root, text) {
  const dir = path.join(worksDir(root), '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${crypto.randomBytes(8).toString('hex')}.txt`);
  fs.writeFileSync(file, text);
  return file;
}
function removeQuiet(file) { try { fs.unlinkSync(file); } catch { /* bereits weg */ } }

async function withTextFile(root, text, fn) {
  const file = tmpFile(root, text);
  try { return await fn(file); } finally { removeQuiet(file); }
}

// ---------- Lesen ----------

function findTaskSafe(root, taskId) {
  const t = loadTasks(root).find((x) => x.id === taskId);
  if (!t) throw new ApiError(404, tr('Task {id} not found.', { id: taskId }));
  return t;
}

function sectionList(body) {
  const out = [];
  const re = /(?:^|\n)## ([^\n]+)\n([\s\S]*?)(?=\n## |$)/g;
  let m;
  while ((m = re.exec(body))) out.push({ name: m[1].trim(), content: stripComments(m[2]).trim() });
  return out;
}

function checklist(body, name) {
  const sec = getSection(body, name);
  if (sec === null) return null;
  return checkboxes(sec).items.map((it, i) => ({ n: i + 1, done: it.done, text: it.text }));
}

function assetsOf(t) {
  const sec = getSection(t._body, 'Assets') || '';
  const lines = stripComments(sec).split('\n');
  const out = [];
  lines.forEach((l, i) => {
    const img = l.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)\)/);
    const file = !img && l.match(/^\s*\[([^\]]*)\]\((assets\/[^)\s]+)\)/);
    const m = img || file;
    if (!m) return;
    // Zeilen in der Sprache der Aufgabe (W-0041): deutsch oder englisch.
    const desc = (lines[i + 1] || '').match(/^(?:Beschreibung|Description):\s*(.*)$/i);
    const metaLine = desc ? lines[i + 2] || '' : lines[i + 1] || '';
    const kind = (metaLine.match(/(?:Art|Kind):\s*([\wäöü-]+)/i) || [])[1] || '';
    const added = (metaLine.match(/(?:Hinzugefügt|Added):\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
    const src = decodeURI(m[2]);
    out.push({
      alt: m[1], src: /^https?:/.test(src) ? src : relFromWorks(t._root, path.resolve(t._dir, src)),
      desc: desc ? desc[1] : '', kind, added, image: !!img,
    });
  });
  return out;
}

export function taskDetail(root, taskId) {
  const config = loadConfig(root);
  const all = loadTasks(root);
  const byId = byIdMap(all);
  const t = all.find((x) => x.id === taskId);
  if (!t) throw new ApiError(404, tr('Task {id} not found.', { id: taskId }));
  t._root = root;
  const ref = (x) => { const o = byId.get(x); return { id: x, title: o ? o.title : tr('unknown'), status: o ? o.status : '' }; };
  const history = (getSection(t._body, 'Verlauf') || '').split('\n')
    .map((l) => l.match(/^- (\d{4}-\d{2}-\d{2}): (.*?)(?: \[([^\]]+)\])?$/)).filter(Boolean)
    .map((m) => ({ date: m[1], text: m[2], actor: m[3] || '' })).reverse();
  const questions = checkboxes(getSection(t._body, 'Offene Fragen') || '').items.map((q, i) => ({ n: i + 1, done: q.done, text: q.text }));
  const decFile = path.join(t._dir, 'decisions.md');
  // Namen wie in der Datei (Sprache der Aufgabe, W-0041); Vergleiche im Code über den deutschen Schlüssel (sectionKey).
  const title = (key) => sectionTitle(key, t._body);
  const checklists = CHECK_SECTIONS.map((key) => ({ name: title(key), items: checklist(t._body, key) })).filter((c) => c.items !== null);
  const data = Object.fromEntries(Object.entries(t).filter(([k]) => !k.startsWith('_')));
  const sections = sectionList(t._body).filter((s) => !SKIP_IN_DETAIL.has(sectionKey(s.name)));
  const goalKey = GOAL_SECTION[t.type] || 'Ziel';
  let goalSection = title(goalKey);
  const typed = sections.find((s) => sectionKey(s.name) === goalKey);
  if (!typed || !typed.content) {
    const alt = DESCRIPTION_SECTIONS.map((n) => sections.find((s) => sectionKey(s.name) === n && s.content)).find(Boolean)
      || sections.find((s) => s.content && !EDITABLE_SECTIONS.includes(sectionKey(s.name)));
    if (alt) goalSection = alt.name;
  }
  if (!checklists.some((c) => sectionKey(c.name) === 'Akzeptanzkriterien')) checklists.unshift({ name: title('Akzeptanzkriterien'), items: [] });
  return {
    task: data,
    file: relFromWorks(root, t._file),
    archived: t._archived,
    goalSection,
    typeGoal: title(goalKey),
    sections,
    editable: [...new Set([...EDITABLE_SECTIONS, ...EDITABLE_SECTIONS.map(title), ...sections.map((s) => s.name).filter((n) => n !== t.title)])],
    checklists,
    questions,
    history,
    assets: assetsOf(t),
    decisions: exists(decFile) ? stripComments(readText(decFile)).replace(/\n{3,}/g, '\n\n').trim() : '',
    blockedBy: (t.blocked_by || []).map(ref),
    blocks: (t.blocks || []).map(ref),
    related: (t.related || []).map(ref),
    blocked: OPEN_STATUSES.includes(t.status) && isBlocked(t, byId),
    openBlockers: openBlockers(t, byId),
    openQuestions: openQuestions(t).length,
    dod: dodCheck(root, config, t),
    comments: loadComments(t),
    unreadForClaude: unreadForClaude(root, t).length,
    time: taskTime(root, t),
    usage: taskUsage(root, config, t.id),
    design: designDetail(root, t, relFromWorks),
    prs: prsFor(root, t.id),
    lane: (() => { const l = laneOf(root, t.id); return l ? laneInfo(root, l) : null; })(),
    fileLinks: (() => { try { return filesForTask(root, loadConfig(root), t.id); } catch { return { files: [], others: {} }; } })(),
  };
}

export function parallelInfo(root) { return { plan: planParallel(root), lanes: loadLanes(root).map((l) => laneInfo(root, l)) }; }
export function undoInfo(root) { return undoList(root).slice(0, 20).map((e) => ({ key: e.key, label: e.label, at: e.at })); }
export function templatesList(root) { return listTemplates(root); }
export function templateDraft(root, taskId) { return templateFromTask(findTaskSafe(root, taskId)); }
export function estimatesInfo(root) { return estimates(root, loadTasks(root), loadConfig(root)); }
export function checksInfo(root) {
  const config = loadConfig(root);
  return { checks: configuredChecks(config), byType: config.checks_by_type || {}, detected: detectChecks(root) };
}
export function reportsInfo(root) {
  const config = loadConfig(root);
  const range = weekRange();
  return { settings: reportSettings(config), webhook: !!localReport(root).discord_webhook, reports: listReports(root), current: reportName(range) };
}

export function ideasList(root) {
  const file = path.join(worksDir(root), 'ideas.md');
  if (!exists(file)) return [];
  return readText(file).split('\n').map((l) => {
    const m = l.match(/^- (~~)?\[(I-\d+)\] (\d{4}-\d{2}-\d{2}): (.*?)(~~(.*))?$/);
    if (!m) return null;
    const raw = m[4];
    return {
      id: m[2], date: m[3], text: raw.replace(/#[\w-]+/g, '').trim(), tags: [...raw.matchAll(/#([\w-]+)/g)].map((x) => x[1]),
      closed: !!m[1], note: (m[6] || '').trim(),
    };
  }).filter(Boolean).reverse();
}

export function metaInfo(root) {
  const config = loadConfig(root);
  const all = loadTasks(root);
  const tags = [...new Set(all.flatMap((t) => t.tags || []))].sort();
  return {
    statuses: STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s] })),
    priorities: PRIORITIES.map((p) => ({ id: p, label: PRIO_LABEL[p] })),
    types: TYPES.map((t) => ({ id: t, label: TYPE_LABEL[t], goal: GOAL_SECTION[t] })),
    efforts: EFFORTS, risks: RISKS, assetKinds: ASSET_KINDS,
    milestones: config.milestones || [], tags,
    tasks: all.map((t) => ({ id: t.id, title: t.title, status: t.status })),
  };
}

export function nextList(root) {
  const { active, candidates } = nextCandidates(root, 5);
  return {
    active: active.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })),
    candidates: candidates.map((c) => ({ id: c.task.id, title: c.task.title, priority: c.task.priority, status: c.task.status, effort: c.task.effort || '', reasons: c.reasons })),
  };
}

export async function codeOf(root, taskId) {
  const { codeInfo } = await import('./git.mjs');
  return codeInfo(root, findTaskSafe(root, taskId));
}

export async function diffOf(root, taskId, file, uncommitted, live = false) {
  const { fileDiff, liveFileDiff } = await import('./git.mjs');
  if (typeof file !== 'string' || !file || file.length > 500 || file.includes('\0')) bad(tr('Invalid file.'));
  if (live) {
    // Diff im Verlauf der Live-Ansicht: nur Pfade im Projekt, relativ und ohne "..".
    if (path.isAbsolute(file) || /^[a-z]:/i.test(file) || file.split(/[\\/]/).includes('..')) bad(tr('Invalid file.'));
    const { checkDir } = await import('./checks.mjs');
    const task = findTaskSafe(root, taskId);
    return liveFileDiff(root, task, file, checkDir(root, task));
  }
  const r = await fileDiff(root, findTaskSafe(root, taskId), file, { uncommitted });
  if (r.error) throw new ApiError(404, r.error);
  return r;
}

export function dodOf(root, taskId) {
  const config = loadConfig(root);
  return dodCheck(root, config, findTaskSafe(root, taskId));
}

// ---------- Schreiben ----------

const SETTABLE = {
  title: (v) => str(v, tr('Title'), { max: 160, required: true }),
  priority: (v) => oneOf(v, tr('Priority'), PRIORITIES, { required: true }),
  type: (v) => oneOf(v, tr('Type'), TYPES, { required: true }),
  effort: (v) => oneOf(v, tr('Effort'), EFFORTS),
  risk: (v) => oneOf(v, tr('Risk'), RISKS),
  due: (v) => date(v, tr('Due date')),
  milestone: (v) => { if (v && !MS_RE.test(v)) bad(tr('Invalid milestone.')); return v ? v.toUpperCase() : ''; },
  tags: (v) => list(v, tr('Tags'), TAG_RE).join(','),
  incomplete: (v) => (v ? 'true' : 'false'),
};

const actions = {
  async create(root, b) {
    const type = oneOf(b.type || 'feature', tr('Type'), TYPES, { required: true });
    const args = ['new', `--type=${type}`, `--title=${str(b.title, tr('Title'), { max: 160, required: true })}`];
    args.push(`--priority=${oneOf(b.priority || 'P3', tr('Priority'), PRIORITIES)}`);
    const status = oneOf(b.status || 'backlog', tr('Status'), ['backlog', 'geplant']);
    args.push(`--status=${status}`);
    const effort = oneOf(b.effort, tr('Effort'), EFFORTS); if (effort) args.push(`--effort=${effort}`);
    const risk = oneOf(b.risk, tr('Risk'), RISKS); if (risk) args.push(`--risk=${risk}`);
    const due = date(b.due, tr('Due date')); if (due) args.push(`--due=${due}`);
    if (b.milestone) { if (!MS_RE.test(b.milestone)) bad(tr('Invalid milestone.')); args.push(`--milestone=${b.milestone.toUpperCase()}`); }
    const tags = list(b.tags, tr('Tags'), TAG_RE); if (tags.length) args.push(`--tags=${tags.join(',')}`);
    const blockedBy = list(b.blocked_by, tr('Blocked by'), ID_RE); if (blockedBy.length) args.push(`--blocked-by=${blockedBy.join(',')}`);
    args.push(`--source=${b.source === 'discord' ? 'discord' : 'board'}`);
    const goal = str(b.goal, tr('Goal'), { max: 20000 });
    const description = str(b.description, tr('Description'), { max: 50000 });
    const criteria = (Array.isArray(b.criteria) ? b.criteria : []).map((c) => str(c, tr('Criterion'), { max: 500 })).filter(Boolean).slice(0, 50);
    if ((!goal && !description) || !criteria.length) args.push('--incomplete');
    // Alles in einem einzigen CLI-Aufruf, Texte über Dateien. So entsteht die Aufgabe ganz oder gar nicht.
    const files = [];
    const fileArg = (name, text) => { if (!text) return; const f = tmpFile(root, text); files.push(f); args.push(`--${name}-file=${f}`); };
    fileArg('goal', goal);
    fileArg('description', description);
    fileArg('criteria', criteria.join('\n'));
    let outText;
    try { outText = await must(root, args); } finally { files.forEach(removeQuiet); }
    const newId = (outText.match(/(?:Angelegt|Created): (\S+)/) || [])[1];
    if (!newId) throw new ApiError(500, tr('New task ID not recognized.'));
    return { id: newId, message: tr('{id} created.', { id: newId }) };
  },

  async set(root, b) {
    const tid = id(b.id);
    const fields = b.fields && typeof b.fields === 'object' ? b.fields : bad(tr('No fields given.'));
    const pairs = [];
    for (const [k, v] of Object.entries(fields)) {
      if (!SETTABLE[k]) bad(tr('Field {key} cannot be changed in the board.', { key: k }));
      pairs.push(`${k}=${SETTABLE[k](v)}`);
    }
    if (!pairs.length) bad(tr('No fields given.'));
    const reason = str(b.reason, tr('Reason'), { max: 300 });
    await must(root, ['set', tid, ...pairs, ...(reason ? [`--reason=${reason}`] : [])]);
    return { message: tr('{id} saved.', { id: tid }) };
  },

  async move(root, b) {
    const tid = id(b.id);
    const to = oneOf(b.to, tr('Status'), STATUSES, { required: true });
    const t = findTaskSafe(root, tid);
    const from = t.status;
    if (from === to) return { message: tr('No change.') };
    const reason = str(b.reason, tr('Reason'), { max: 300 });
    if (['erledigt', 'verworfen'].includes(from)) {
      if (!reason) bad(tr('Reopening needs a reason.'));
      if (to === 'verworfen' || to === 'erledigt') bad(tr('Reopen the task first.'));
      await must(root, ['reopen', tid, `--reason=${reason}`, `--status=${to}`]);
      return { message: tr('{id} reopened.', { id: tid }) };
    }
    if (to === 'in-arbeit') {
      await must(root, ['start', tid, ...(b.force ? ['--force'] : [])]);
      return { message: tr('{id} started.', { id: tid }) };
    }
    if (to === 'erledigt') {
      const args = ['done', tid, '--confirm'];
      if (b.force) { if (!reason) bad(tr('Closing despite open items needs a reason.')); args.push('--force', `--reason=${reason}`); }
      try { await must(root, args); } catch (e) {
        if (/Definition of Done/.test(e.message)) throw new ApiError(422, tr('The Definition of Done is not met yet. Finish the open items or close it with a reason.'));
        throw e;
      }
      return { message: tr('{id} done.', { id: tid }) };
    }
    if (to === 'verworfen') {
      if (!reason) bad(tr('Dropping needs a reason.'));
      await must(root, ['drop', tid, `--reason=${reason}`]);
      return { message: tr('{id} dropped.', { id: tid }) };
    }
    await must(root, ['set', tid, `status=${to}`, ...(reason ? [`--reason=${reason}`] : [])]);
    return { message: tr('{id} moved.', { id: tid }) };
  },

  async log(root, b) {
    const tid = id(b.id);
    await must(root, ['log', tid, `--text=${str(b.text, tr('History note'), { max: 2000, required: true })}`]);
    return { message: tr('Note saved.') };
  },
  async question(root, b) {
    const tid = id(b.id);
    await must(root, ['question', tid, `--text=${str(b.text, tr('Question'), { max: 500, required: true })}`]);
    return { message: tr('Question saved.') };
  },
  async resolve(root, b) {
    const tid = id(b.id);
    const n = parseInt(b.n, 10); if (!(n > 0)) bad(tr('Invalid question.'));
    const answer = str(b.answer, tr('Answer'), { max: 1000 });
    await must(root, ['question', tid, `--resolve=${n}`, ...(answer ? [`--answer=${answer}`] : [])]);
    return { message: tr('Question resolved.') };
  },
  async check(root, b) {
    const tid = id(b.id);
    const section = checkSection(b.section);
    const n = parseInt(b.n, 10); if (!(n > 0)) bad(tr('Invalid item.'));
    await must(root, ['check', tid, String(n), `--section=${section}`, ...(b.done ? [] : ['--undo'])]);
    return { message: tr('Saved.') };
  },
  async item(root, b) {
    const tid = id(b.id);
    const section = checkSection(b.section);
    await must(root, ['item', tid, `--section=${section}`, `--text=${str(b.text, tr('Item'), { max: 500, required: true })}`]);
    return { message: tr('Item added.') };
  },
  async itemRemove(root, b) {
    const tid = id(b.id);
    const section = checkSection(b.section);
    const n = parseInt(b.n, 10); if (!(n > 0)) bad(tr('Invalid item.'));
    await must(root, ['item', tid, `--section=${section}`, `--remove=${n}`]);
    return { message: tr('Item removed.') };
  },
  async section(root, b) {
    const tid = id(b.id);
    // Erlaubt sind die bekannten Abschnitte und jeder eigene Abschnitt, den die Aufgabe bereits hat.
    const name = str(b.name, tr('Section'), { max: 80, required: true });
    // Name in der Sprache der Aufgabe oder als deutscher Schlüssel, beide gelten (W-0041).
    const key = sectionKey(name);
    if (/[\n#]/.test(name) || ['Verlauf', 'Assets', 'Offene Fragen', ...CHECK_SECTIONS].includes(key)) bad(tr('This section cannot be edited here.'));
    if (!EDITABLE_SECTIONS.includes(key) && getSection(findTaskSafe(root, tid)._body, name) === null) bad(tr('Section {name} does not exist in this task.', { name }));
    const text = typeof b.text === 'string' ? b.text : bad(tr('Text missing.'));
    if (text.length > 50000) bad(tr('Text is too long.'));
    if (key === 'Übergabe') {
      if (!text.trim()) bad(tr('Handoff is empty.'));
      await withTextFile(root, text, (f) => must(root, ['handoff', tid, `--file=${f}`]));
    } else {
      const after = b.after && typeof b.after === 'string' && b.after.length < 80 && !/[\n#]/.test(b.after) ? [`--after=${b.after}`] : [];
      await withTextFile(root, text, (f) => must(root, ['section', tid, name, `--file=${f}`, ...after]));
    }
    return { message: tr('{id} saved.', { id: name }) };
  },
  async link(root, b) {
    const a = id(b.id); const target = id(b.target);
    const rel = oneOf(b.rel, tr('Relation'), ['blocks', 'blocked-by', 'related'], { required: true });
    await must(root, [b.remove ? 'unlink' : 'link', a, rel, target]);
    return { message: b.remove ? tr('Link removed.') : tr('Linked.') };
  },
  async archive(root, b) {
    const tid = id(b.id);
    await must(root, ['archive', tid]);
    return { message: tr('{id} archived.', { id: tid }) };
  },
  async idea(root, b) {
    const text = str(b.text, tr('Idea'), { max: 500, required: true });
    const tags = list(b.tags, tr('Tags'), TAG_RE);
    await must(root, ['idea', `--text=${text}`, ...(tags.length ? [`--tags=${tags.join(',')}`] : [])]);
    return { message: tr('Idea noted.') };
  },
  async ideaPromote(root, b) {
    if (typeof b.iid !== 'string' || !IDEA_RE.test(b.iid)) bad(tr('Invalid idea.'));
    const args = ['promote', b.iid.toUpperCase()];
    args.push(`--type=${oneOf(b.type || 'feature', tr('Type'), TYPES)}`);
    args.push(`--priority=${oneOf(b.priority || 'P3', tr('Priority'), PRIORITIES)}`);
    const outText = await must(root, args);
    const newId = (outText.match(/\b(?:als|as) (\S+?):/) || [])[1] || '';
    return { id: newId, message: newId ? tr('Idea promoted as {id}.', { id: newId }) : tr('Idea promoted.') };
  },
  async ideaDrop(root, b) {
    if (typeof b.iid !== 'string' || !IDEA_RE.test(b.iid)) bad(tr('Invalid idea.'));
    const reason = str(b.reason, tr('Reason'), { max: 300 });
    await must(root, ['idea-drop', b.iid.toUpperCase(), ...(reason ? [`--reason=${reason}`] : [])]);
    return { message: tr('Idea dropped.') };
  },
  async milestoneAdd(root, b) {
    const config = loadConfig(root);
    let mid = b.mid;
    if (!mid) {
      const max = Math.max(0, ...(config.milestones || []).map((m) => parseInt(String(m.id).slice(1), 10) || 0));
      mid = `M${max + 1}`;
    }
    if (!MS_RE.test(mid)) bad(tr('Give the milestone ID as M1, M2.'));
    const args = ['milestone', 'add', mid.toUpperCase(), `--title=${str(b.title, tr('Title'), { max: 120, required: true })}`];
    const due = date(b.due, tr('Target date')); if (due) args.push(`--due=${due}`);
    const desc = str(b.description, tr('Description'), { max: 500 }); if (desc) args.push(`--desc=${desc}`);
    await must(root, args);
    return { id: mid.toUpperCase(), message: tr('Milestone {id} created.', { id: mid.toUpperCase() }) };
  },
  async milestoneSet(root, b) {
    if (typeof b.mid !== 'string' || !MS_RE.test(b.mid)) bad(tr('Invalid milestone.'));
    const f = b.fields || {};
    const pairs = [];
    if ('title' in f) pairs.push(`title=${str(f.title, tr('Title'), { max: 120, required: true })}`);
    if ('due' in f) pairs.push(`due=${date(f.due, tr('Target date'))}`);
    if ('status' in f) pairs.push(`status=${oneOf(f.status, tr('Status'), ['offen', 'erledigt'], { required: true })}`);
    if ('description' in f) pairs.push(`description=${str(f.description, tr('Description'), { max: 500 })}`);
    if (!pairs.length) bad(tr('No fields given.'));
    await must(root, ['milestone', 'set', b.mid.toUpperCase(), ...pairs]);
    return { message: tr('Milestone saved.') };
  },

  // ---------- Sprint ----------
  async sprintStart(root, b) {
    const args = ['sprint', 'start', `--title=${str(b.title, tr('Title'), { max: 120, required: true })}`];
    const goal = str(b.goal, tr('Goal'), { max: 300 }); if (goal) args.push(`--goal=${goal}`);
    const start = date(b.start, tr('Start date')); if (start) args.push(`--start=${start}`);
    const days = parseInt(b.days, 10); if (days > 0 && days <= 60) args.push(`--days=${days}`);
    const cap = parseInt(b.capacity, 10); if (cap > 0 && cap <= 1000) args.push(`--capacity=${cap}`);
    if (b.carry) args.push('--carry');
    return { message: await must(root, args) };
  },
  async sprintAdd(root, b) {
    const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).slice(0, 100).map(id);
    return { message: await must(root, ['sprint', 'add', ids.join(',')]) };
  },
  async sprintRemove(root, b) {
    return { message: await must(root, ['sprint', 'remove', id(b.id)]) };
  },
  async sprintSet(root, b) {
    const f = b.fields || {};
    const pairs = [];
    if ('title' in f) pairs.push(`title=${str(f.title, tr('Title'), { max: 120, required: true })}`);
    if ('goal' in f) pairs.push(`goal=${str(f.goal, tr('Goal'), { max: 300 })}`);
    if ('end' in f) pairs.push(`end=${date(f.end, tr('End')) || bad(tr('{name} missing.', { name: tr('End') }))}`);
    if ('capacity' in f) { const c = parseInt(f.capacity, 10); if (!(c > 0 && c <= 1000)) bad(tr('Capacity between 1 and 1000.')); pairs.push(`capacity=${c}`); }
    if (!pairs.length) bad(tr('No fields given.'));
    return { message: await must(root, ['sprint', 'set', ...pairs]) };
  },
  async sprintClose(root, b) {
    const args = ['sprint', 'close'];
    const r = b && b.retro && typeof b.retro === 'object' ? b.retro : {};
    for (const k of ['good', 'bad', 'change']) { const v = str(r[k], k, { max: 500 }); if (v) args.push(`--${k}=${v}`); }
    const cap = parseInt(b && b.nextCapacity, 10); if (cap > 0 && cap <= 1000) args.push(`--next-capacity=${cap}`);
    return { message: await must(root, args) };
  },

  // ---------- Kommentare ----------
  async comment(root, b) {
    const tid = id(b.id);
    const text = str(b.text, tr('Comment'), { max: 10000, required: true });
    await withTextFile(root, text, (f) => must(root, ['comment', tid, `--file=${f}`, '--as=Nutzer']));
    return { message: tr('Comment sent. Claude reads it at the next start.') };
  },

  // ---------- Gespeicherte Ansichten ----------
  async viewSave(root, b) {
    const name = str(b.name, tr('Name'), { max: 40, required: true });
    const f = b.filter && typeof b.filter === 'object' ? b.filter : {};
    const filter = {
      prios: list(f.prios, tr('Priority'), /^P[1-4]$/),
      type: oneOf(f.type, tr('Type'), TYPES), tag: f.tag ? list([f.tag], tr('Tag'), TAG_RE)[0] : '',
      ms: f.ms && MS_RE.test(f.ms) ? f.ms.toUpperCase() : '',
      signal: oneOf(f.signal, tr('Signal'), ['blocked', 'unblocked', 'overdue', 'questions', 'incomplete']),
      q: str(f.q, tr('Search'), { max: 80 }), closed: !!f.closed,
    };
    const view = oneOf(b.view || 'board', tr('Board view'), ['board', 'sprint', 'queue', 'timeline', 'graph', 'table']);
    const sort = b.sort && typeof b.sort === 'object' && /^[a-z]{1,12}$/.test(b.sort.key || '') ? { key: b.sort.key, dir: b.sort.dir === -1 ? -1 : 1 } : null;
    await saveConfigField(root, (config) => {
      const views = (Array.isArray(config.views) ? config.views : []).filter((v) => v.name !== name);
      views.push({ name, filter, view, sort });
      config.views = views.slice(-20);
    });
    return { message: tr('View {name} saved.', { name }) };
  },
  async viewDelete(root, b) {
    const name = str(b.name, tr('Name'), { max: 40, required: true });
    await must(root, ['views', 'delete', name]);
    return { message: tr('View {name} deleted.', { name }) };
  },

  // ---------- Vorlagen ----------
  async templateSave(root, b) {
    let tpl;
    try { tpl = normalizeTemplate(b.template || {}); } catch (e) { bad(e.message); }
    if (b.oldSlug && SLUG_RE.test(b.oldSlug) && b.oldSlug !== tpl.slug) await must(root, ['template', 'delete', b.oldSlug]);
    const scope = b.scope === 'user' ? 'user' : 'project';
    await withTextFile(root, JSON.stringify(tpl), (f) => must(root, ['template', 'save', `--file=${f}`, `--scope=${scope}`]));
    return { slug: tpl.slug, message: tr('Template {name} saved.', { name: tpl.name }) };
  },
  async templateDelete(root, b) {
    if (typeof b.slug !== 'string' || !SLUG_RE.test(b.slug)) bad(tr('Invalid template.'));
    await must(root, ['template', 'delete', b.slug]);
    return { message: tr('Template deleted.') };
  },
  async createFromTemplate(root, b) {
    if (typeof b.slug !== 'string' || !SLUG_RE.test(b.slug)) bad(tr('Invalid template.'));
    const args = ['new', `--template=${b.slug}`, '--source=board'];
    const values = b.values && typeof b.values === 'object' ? b.values : {};
    for (const [k, v] of Object.entries(values).slice(0, 12)) {
      if (!/^[\p{L}\p{N}_]{1,30}$/u.test(k)) bad(tr('Invalid field.'));
      const val = str(v, k, { max: 300 }); if (val) args.push(`--field=${k}=${val}`);
    }
    const title = str(b.title, tr('Title'), { max: 160 }); if (title) args.push(`--title=${title}`);
    const pr = oneOf(b.priority, tr('Priority'), PRIORITIES); if (pr) args.push(`--priority=${pr}`);
    const status = oneOf(b.status || 'backlog', tr('Status'), ['backlog', 'geplant']); args.push(`--status=${status}`);
    if (Array.isArray(b.criteria)) args.push(`--criteria=${b.criteria.map((n) => parseInt(n, 10)).filter((n) => n >= 0 && n < 100).join(',') || '999'}`);
    const text = str(b.text, tr('Description'), { max: 50000 });
    const run = (extra) => must(root, [...args, ...extra]);
    const outText = text ? await withTextFile(root, text, (f) => run([`--text-file=${f}`])) : await run([]);
    const newId = (outText.match(/(?:Angelegt|Created): (\S+)/) || [])[1];
    return { id: newId, message: tr('{id} created from template.', { id: newId }) };
  },

  // ---------- Prüfungen ----------
  async checksRun(root, b) {
    const tid = id(b.id);
    // only: nur diese Prüfungen neu starten (Erneut prüfen in der Live-Ansicht), die übrigen Ergebnisse bleiben stehen.
    let only = [];
    if (b.only !== undefined) {
      if (!Array.isArray(b.only) || !b.only.length || b.only.length > 200 || b.only.some((n) => typeof n !== 'string' || !NAME_RE.test(n))) bad(tr('Invalid selection of checks.'));
      only = [`--only=${b.only.join(',')}`];
    }
    await must(root, ['checks', 'run', tid, ...only], { timeout: 11 * 60 * 1000 });
    return { message: !b.only ? tr('Checks ran.') : b.only.length === 1 ? tr('{name} checked again.', { name: b.only[0] }) : tr('{n} checks checked again.', { n: b.only.length }) };
  },
  async checksAck(root, b) {
    const tid = id(b.id);
    if (typeof b.name !== 'string' || !NAME_RE.test(b.name)) bad(tr('Invalid check.'));
    const reason = str(b.reason, tr('Reason'), { max: 300 });
    await must(root, ['checks', 'ack', tid, b.name, ...(reason ? [`--reason=${reason}`] : [])]);
    return { message: tr('Marked as known.') };
  },
  async checksSave(root, b) {
    const c = b.checks && typeof b.checks === 'object' && !Array.isArray(b.checks) ? b.checks : bad(tr('Checks missing.'));
    const cur = configuredChecks(loadConfig(root));
    // Alles als JSON an works checks set --file: Befehl als Text oder { cmd, cwd }, entfernte Prüfungen mit leerem Wert.
    const next = {};
    for (const k of Object.keys(cur)) if (!(k in c)) next[k] = '';
    for (const [k, v] of Object.entries(c).slice(0, 200)) {
      if (!NAME_RE.test(k)) bad(tr('Invalid name {name}.', { name: k }));
      const isObj = v && typeof v === 'object';
      const cmd = str(isObj ? v.cmd : v, tr('{name}: command', { name: k }), { max: 300 });
      const cwd = isObj && v.cwd ? str(v.cwd, tr('{name}: folder', { name: k }), { max: 200 }) : '';
      next[k] = cwd ? { cmd, cwd } : cmd;
    }
    if (!Object.keys(next).length) return { message: tr('No change.') };
    await withTextFile(root, JSON.stringify(next), (file) => must(root, ['checks', 'set', `--file=${file}`]));
    return { message: tr('Checks saved.') };
  },

  // ---------- Wochenbericht und Zeit ----------
  async reportSettings(root, b) {
    const pairs = [];
    if ('enabled' in b) pairs.push(`enabled=${!!b.enabled}`);
    if ('weekday' in b) { const w = parseInt(b.weekday, 10); if (!(w >= 1 && w <= 7)) bad(tr('Invalid weekday.')); pairs.push(`weekday=${w}`); }
    if ('time' in b) { if (!/^\d{2}:\d{2}$/.test(b.time || '')) bad(tr('Time in the format HH:MM.')); pairs.push(`time=${b.time}`); }
    for (const k of ['discord', 'file', 'done', 'attention', 'next', 'milestones']) if (k in b) pairs.push(`${k}=${!!b[k]}`);
    if (!pairs.length) bad(tr('No setting given.'));
    await must(root, ['report', '--settings', ...pairs]);
    return { message: tr('Setting saved.') };
  },
  async reportWebhook(root, b) {
    const url = str(b.url, tr('Webhook'), { max: 300 });
    await must(root, ['report', url ? `--webhook=${url}` : '--webhook']);
    return { message: url ? tr('Webhook saved.') : tr('Webhook removed.') };
  },
  async reportRun(root, b) {
    const summary = str(b.summary, tr('Summary'), { max: 3000 });
    const msg = await must(root, ['report', '--week', ...(summary ? [`--summary=${summary}`] : [])]);
    return { message: msg.split('\n').filter((l) => !l.startsWith('  ')).join(' ') };
  },
  async effortMode(root, b) {
    const mode = oneOf(b.mode, tr('Mode'), ['measured', 'fixed'], { required: true });
    return { message: await must(root, ['time', `--mode=${mode}`]) };
  },

  // ---------- Warteschlange ----------
  async queueAdd(root, b) {
    const tid = id(b.id);
    const p = parseInt(b.pos, 10);
    await must(root, ['queue', 'add', tid, ...(p > 0 ? [`--pos=${p}`] : [])]);
    return { message: tr('{id} queued.', { id: tid }) };
  },
  async queueRemove(root, b) {
    const tid = id(b.id);
    await must(root, ['queue', 'remove', tid]);
    return { message: tr('{id} taken out of the queue.', { id: tid }) };
  },
  async queueOrder(root, b) {
    const ids = Array.isArray(b.ids) ? b.ids.slice(0, 200).map(id) : bad(tr('Order missing.'));
    await must(root, ids.length ? ['queue', 'order', ids.join(',')] : ['queue', 'clear']);
    return { message: ids.length ? tr('Order saved.') : tr('Queue cleared.') };
  },
  async queueSettings(root, b) {
    const pairs = ['auto_next', 'skip_blocked', 'ask_before'].filter((k) => k in b).map((k) => `${k}=${b[k] ? 'true' : 'false'}`);
    if (!pairs.length) bad(tr('No setting given.'));
    await must(root, ['queue', 'set', ...pairs]);
    return { message: tr('Setting saved.') };
  },

  // ---------- Mehrere Aufgaben auf einmal ----------
  // Jede Aufgabe läuft als eigener CLI-Aufruf. Fehler einzelner Aufgaben brechen den Rest nicht ab.
  async bulk(root, b) {
    const ids = Array.isArray(b.ids) ? [...new Set(b.ids.slice(0, 200).map(id))] : bad(tr('No tasks selected.'));
    if (!ids.length) bad(tr('No tasks selected.'));
    const op = oneOf(b.op, tr('Action'), ['priority', 'status', 'milestone', 'effort', 'tagAdd', 'tagRemove', 'queueAdd', 'queueRemove', 'drop', 'archive'], { required: true });
    const reason = str(b.reason, tr('Reason'), { max: 300 });
    const all = new Map(loadTasks(root).map((t) => [t.id, t]));
    const okIds = []; const errors = [];
    for (const tid of ids) {
      const t = all.get(tid);
      try {
        if (!t) throw new ApiError(404, tr('not found'));
        if (op === 'priority') await actions.set(root, { id: tid, fields: { priority: b.value }, reason });
        else if (op === 'effort') await actions.set(root, { id: tid, fields: { effort: b.value } });
        else if (op === 'milestone') await actions.set(root, { id: tid, fields: { milestone: b.value || '' } });
        else if (op === 'tagAdd' || op === 'tagRemove') {
          const tag = list(b.value, tr('Tag'), TAG_RE)[0] || bad(tr('{name} missing.', { name: tr('Tag') }));
          const cur = t.tags || [];
          const next = op === 'tagAdd' ? [...new Set([...cur, tag])] : cur.filter((x) => x !== tag);
          if (next.length !== cur.length) await actions.set(root, { id: tid, fields: { tags: next } });
        } else if (op === 'status') {
          const to = oneOf(b.value, tr('Status'), ['backlog', 'geplant', 'in-arbeit', 'review'], { required: true });
          await actions.move(root, { id: tid, to, reason });
        } else if (op === 'queueAdd') await must(root, ['queue', 'add', tid]);
        else if (op === 'queueRemove') await must(root, ['queue', 'remove', tid]);
        else if (op === 'drop') {
          if (!reason) bad(tr('Dropping needs a reason.'));
          if (OPEN_STATUSES.includes(t.status)) await actions.move(root, { id: tid, to: 'verworfen', reason });
        } else if (op === 'archive') {
          if (OPEN_STATUSES.includes(t.status)) throw new ApiError(422, tr('is still open'));
          if (!t._archived) await must(root, ['archive', tid]);
        }
        okIds.push(tid);
      } catch (e) {
        if (e instanceof ApiError && e.status === 400 && !okIds.length && !errors.length) throw e; // Eingabefehler gelten für alle
        errors.push({ id: tid, error: e.message });
      }
    }
    const message = tr('{ok} of {n} tasks changed.', { ok: okIds.length, n: ids.length }) + (errors.length ? ' ' + tr('Not changed: {list}', { list: errors.map((x) => `${x.id} (${x.error})`).join(', ') }) : '');
    if (!okIds.length) throw new ApiError(422, message);
    return { message, done: okIds, errors };
  },
};

// Ändert config.json über eine Datei, die das CLI einliest, damit auch dieser Weg seriell läuft.
async function saveConfigField(root, fn) {
  const job = queue.then(() => {
    const config = loadConfig(root);
    fn(config);
    saveConfig(root, config);
  });
  queue = job.catch(() => {});
  return job;
}

export async function runAction(root, body) {
  if (!body || typeof body !== 'object') bad(tr('Invalid request.'));
  const fn = actions[body.action];
  if (!fn) bad(tr('Unknown action.'));
  return fn(root, body);
}

// Bild aus dem Board (Einfügen oder Ablegen) speichern und über das CLI der Aufgabe zuordnen.
export async function saveAsset(root, { taskId, contentType, data, desc, kind, name }) {
  const tid = id(taskId);
  findTaskSafe(root, tid);
  const ext = IMAGE_TYPES[(contentType || '').split(';')[0].trim().toLowerCase()];
  if (!ext) bad(tr('Only PNG, JPEG, GIF, WebP or AVIF.'));
  if (!data || !data.length) bad(tr('Empty file.'));
  const k = oneOf(kind, tr('Kind'), ASSET_KINDS);
  const d = str(desc, tr('Description'), { max: 1000 });
  const n = str(name, tr('Name'), { max: 60 });
  const inbox = path.join(worksDir(root), 'inbox');
  fs.mkdirSync(inbox, { recursive: true });
  const file = path.join(inbox, `board-${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`);
  fs.writeFileSync(file, data);
  try {
    const args = ['asset', tid, file, '--origin=Board'];
    if (d) args.push(`--desc=${d}`);
    if (k) args.push(`--kind=${k}`);
    if (n) args.push(`--name=${n}`);
    await must(root, args);
  } finally {
    removeQuiet(file);
  }
  return { message: tr('Image saved.') };
}

// Import aus dem Board: Datei kommt roh, liegt kurz in .works/.tmp und wird nach dem Anlegen gelöscht.
const IMPORT_EXT = ['.json', '.csv', '.tsv', '.xlsx', '.xlsm', '.docx', '.md', '.markdown', '.txt', '.zip'];
const IMPORT_FORMATS = ['', 'auto', 'trello', 'notion', 'linear', 'csv', 'xlsx', 'docx', 'md', 'json'];
const importFile = (root, token) => {
  if (!/^[a-f0-9]{16}(\.[a-z]{2,8})$/.test(token || '')) bad(tr('Invalid import.'));
  const f = path.join(worksDir(root), '.tmp', `import-${token}`);
  if (!exists(f)) bad(tr('The uploaded file has expired. Please choose it again.'));
  return f;
};
function importArgs(b) {
  const a = [];
  const fmt = oneOf(b.format || '', tr('Format'), IMPORT_FORMATS); if (fmt && fmt !== 'auto') a.push(`--format=${fmt}`);
  if (b.map) a.push(`--map=${str(b.map, tr('Columns'), { max: 400 }).replace(/[^\p{L}\p{N} _=,.()/-]/gu, '')}`);
  if (b.sheet) a.push(`--sheet=${str(b.sheet, tr('Sheet'), { max: 80 })}`);
  return a;
}
export async function importUpload(root, { name, data, format, map, sheet }) {
  const ext = path.extname(String(name || '')).toLowerCase();
  if (!IMPORT_EXT.includes(ext)) bad(tr('File type {ext} is not supported. Possible: {list}', { ext: ext || tr('unknown'), list: IMPORT_EXT.join(', ') }));
  if (!data || !data.length) bad(tr('Empty file.'));
  const dir = path.join(worksDir(root), '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith('import-')) { try { if (Date.now() - fs.statSync(path.join(dir, f)).mtimeMs > 3600000) fs.rmSync(path.join(dir, f)); } catch { /* egal */ } }
  const token = crypto.randomBytes(8).toString('hex') + ext;
  const file = path.join(dir, `import-${token}`);
  fs.writeFileSync(file, data);
  const r = await cli(root, ['import', file, '--json', ...importArgs({ format, map, sheet })]);
  if (!r.ok) { removeQuiet(file); throw new ApiError(422, (r.stderr.split('\n').find((l) => l.trim()) || tr('Import not readable.')).replace(/^(Fehler|Error):\s*/, '')); }
  return { token, name: path.basename(String(name)).slice(0, 120), ...JSON.parse(r.stdout) };
}

// Sichern und Wiederherstellen (W-0021): Die hochgeladene Sicherung wird geprüft, unter einem Token abgelegt und
// mit dem Board verglichen. backupApply holt sie über das Token und führt zusammen oder stellt wieder her.
const backupTmp = (root, token) => path.join(worksDir(root), '.tmp', `backup-${token}.json`);
export function backupPreview(root, { name, data }) {
  if (!data || !data.length) bad(tr('Empty file.'));
  let d;
  try { d = readBackup(data.toString('utf8')); } catch (e) { bad(e.message); }
  const dir = path.join(worksDir(root), '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith('backup-')) { try { if (Date.now() - fs.statSync(path.join(dir, f)).mtimeMs > 3600000) fs.rmSync(path.join(dir, f)); } catch { /* egal */ } }
  const token = crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(backupTmp(root, token), data);
  const p = d.planning || {};
  return {
    token, name: path.basename(String(name || 'sicherung.json')).slice(0, 120), project: String(d.project || '').slice(0, 80), exported: String(d.exported || '').slice(0, 30),
    tasks: d.tasks.length, milestones: Array.isArray(p.milestones) ? p.milestones.length : 0, knowledge: typeof d.knowledge === 'string' && d.knowledge.trim() ? (d.knowledge.match(/^### /gm) || []).length : 0,
    ...compareBackup(root, d),
  };
}

export { STATUS_LABEL };

// ---------- Runde 3: Entwürfe, Wissen, Wiederkehrend, GitHub, Aufräumen, Rückgängig ----------

export function knowledgeList(root) { return loadKnowledge(root); }
export function recurringInfo(root) {
  const config = loadConfig(root);
  return { rules: rules(config).map((r) => ({ ...r, text: describeRule(r), next: upcoming(r, 3, r.last ? addDaysIso(r.last, 1) : undefined) })), templates: listTemplates(root).map((t) => ({ slug: t.slug, name: t.name })) };
}
export function usageInfo(root) { return projectUsage(root, loadConfig(root), loadTasks(root)); }
export function checkHealthInfo(root) { return checkHealth(loadTasks(root)); }
export function githubInfo(root) {
  const config = loadConfig(root);
  return { settings: syncSettings(config), state: syncState(root) };
}
export function similarTo(root, title, text) {
  return findSimilar({ id: '', title, text, tags: [] }, loadTasks(root, { archive: false }), { min: 0.5 }).map((x) => ({ id: x.t.id, title: x.t.title, status: x.t.status, priority: x.t.priority, score: Math.round(x.score * 100) }));
}

export function cleanupInfo(root) {
  const config = loadConfig(root);
  const all = loadTasks(root, { archive: false });
  const open = all.filter((t) => OPEN_STATUSES.includes(t.status));
  const now = new Date().toLocaleDateString('sv-SE');
  const age = (d) => (d ? Math.round((new Date(now + 'T00:00:00') - new Date(String(d) + 'T00:00:00')) / 86400000) : 0);
  const lastLogDate = (t) => { const m = (getSection(t._body, 'Verlauf') || '').match(/^- (\d{4}-\d{2}-\d{2}):/gm); return m ? m[m.length - 1].slice(2, 12) : t.updated; };
  const ref = (t, why) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, why });
  const stuck = [];
  for (const t of open) {
    if (t.status === 'in-arbeit' && age(lastLogDate(t)) >= 7) stuck.push(ref(t, tr('no history entry for {n} days', { n: age(lastLogDate(t)) })));
    if (t.status === 'review' && age(lastLogDate(t)) >= 3) stuck.push({ ...ref(t, tr('in review for {n} days', { n: age(lastLogDate(t)) })), review: true });
  }
  const incomplete = open.filter((t) => t.incomplete || !checkboxes(getSection(t._body, 'Akzeptanzkriterien') || '').total || !stripComments(getSection(t._body, 'Beschreibung') || getSection(t._body, 'Ziel') || '').trim())
    .map((t) => ref(t, [t.incomplete ? tr('marked as incomplete') : '', !checkboxes(getSection(t._body, 'Akzeptanzkriterien') || '').total ? tr('no acceptance criteria') : '', !stripComments(getSection(t._body, 'Beschreibung') || getSection(t._body, 'Ziel') || '').trim() ? tr('no description') : ''].filter(Boolean).join(', ')));
  const noEffort = open.filter((t) => !t.effort).map((t) => t.id);
  const ignore = new Set((config.cleanup_ignore || []).map((p) => [...p].sort().join('|')));
  const dups = [];
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
    const a = open[i]; const b = open[j];
    if (ignore.has([a.id, b.id].sort().join('|')) || (a.related || []).includes(b.id)) continue;
    const sc = similarity({ title: a.title, tags: a.tags, text: getSection(a._body, 'Beschreibung') || '' }, { title: b.title, tags: b.tags, text: getSection(b._body, 'Beschreibung') || '' });
    if (sc >= 0.6) dups.push({ a: ref(a, ''), b: ref(b, ''), score: Math.round(sc * 100) });
  }
  const old = open.filter((t) => t.status === 'backlog' && age(t.created) >= 60 && age(lastLogDate(t)) >= 60).map((t) => ref(t, tr('in the backlog for {n} days', { n: age(t.created) })));
  const design = open.map((t) => ({ t, d: loadDesign(t) })).filter((x) => x.d && x.d.variants.length && !x.d.chosen)
    .map((x) => ref(x.t, tr('{n} design variants, none chosen yet', { n: x.d.variants.length })));
  const count = stuck.length + incomplete.length + dups.length + old.length + design.length + (noEffort.length ? 1 : 0);
  const penalty = stuck.length * 8 + incomplete.length * 4 + dups.length * 6 + old.length * 2 + design.length * 3 + noEffort.length;
  const score = Math.max(0, Math.round(100 - (penalty / Math.max(5, open.length)) * 10));
  return { count, score, stuck, incomplete, noEffort, dups: dups.sort((x, y) => y.score - x.score).slice(0, 10), old, design };
}

// Beschriftung für Rückgängig, in der Sprache beim Speichern (W-0041).
const LABEL = () => ({
  create: tr('Task created'), createFromTemplate: tr('Task from template'), set: tr('Fields changed'), move: tr('Status changed'), section: tr('Text changed'),
  check: tr('Checkmark'), item: tr('Item added'), itemRemove: tr('Item removed'), link: tr('Dependency link'), archive: tr('Archived'), bulk: tr('Several tasks'),
  queueAdd: tr('Queued'), queueRemove: tr('Out of the queue'), queueOrder: tr('Queue sorted'), comment: tr('Comment'), designChoose: tr('Design variant chosen'),
  review: tr('Acceptance review'), merge: tr('Merged'), toIdeas: tr('Moved to ideas'), importApply: tr('Imported'), sprintAdd: tr('Planned in'), sprintRemove: tr('Out of the sprint'),
});
const NO_UNDO = new Set(['undo', 'backupApply', 'checksRun', 'githubSync', 'reportRun', 'reportWebhook', 'instruct', 'recurRun', 'requestHandoff']);
const CONFIG_ACTIONS = /^(queue|sprint|view|milestone|recur|checksSave|reportSettings|effortMode|githubSettings|dismissDuplicate|importApply)/;

// Schreibaktion mit Sicherung für Rückgängig.
export async function runActionWithUndo(root, body) {
  if (!body || typeof body !== 'object' || NO_UNDO.has(body.action)) return runAction(root, body);
  const ids = [body.id, body.target, body.keep, body.drop, ...(Array.isArray(body.ids) ? body.ids : [])].filter((x) => typeof x === 'string' && ID_RE.test(x)).map((x) => x.toUpperCase());
  const extra = /^idea/.test(body.action) || body.action === 'toIdeas' ? ['ideas.md'] : /^know/.test(body.action) ? ['wissen.md'] : [];
  const key = snapshot(root, { label: LABEL()[body.action] || body.action, ids, config: CONFIG_ACTIONS.test(body.action) || ['create', 'createFromTemplate', 'bulk'].includes(body.action), extra });
  try {
    const r = await runAction(root, body);
    relabel(root, key, r && r.message ? r.message.replace(/\.$/, '') : LABEL()[body.action] || body.action);
    return { ...r, undo: key };
  } catch (e) { dropSnapshot(root, key); throw e; }
}

// Wissensbereich: ohne Angabe der allgemeine Bereich in der eingestellten Sprache. "Allgemein" und "General" sind
// derselbe Bereich (W-0041): Gibt es einen davon schon in wissen.md, kommt der Eintrag dorthin.
function knowArea(root, area) {
  const general = variants('General');
  const a = area || tr('General');
  if (!general.includes(a)) return a;
  return loadKnowledge(root).map((e) => e.area).find((x) => general.includes(x)) || a;
}

Object.assign(actions, {
  async undo(root, b) {
    const key = typeof b.key === 'string' && /^[a-z0-9-]{4,40}$/.test(b.key) ? b.key : undefined;
    let e;
    await new Promise((resolve, reject) => { queue = queue.then(() => { try { e = undoFn(root, key); resolve(); } catch (err) { reject(new ApiError(422, err.message)); } }); });
    return { message: tr('Undo: {label}', { label: e.label }) };
  },
  async designChoose(root, b) {
    const tid = id(b.id);
    if (typeof b.name !== 'string' || !VARIANT_RE.test(b.name)) bad(tr('Invalid variant.'));
    const reason = str(b.reason, tr('Reason'), { max: 300 });
    await must(root, ['design', 'choose', tid, b.name, ...(reason ? [`--reason=${reason}`] : [])]);
    return { message: tr('Variant {name} chosen. Claude implements it.', { name: b.name }) };
  },
  async instruct(root, b) {
    const tid = id(b.id);
    const text = str(b.text, tr('Instruction'), { max: 4000, required: true });
    await withTextFile(root, text, () => must(root, ['instruct', tid, `--text=${text}`]));
    return { message: tr('Instruction sent. Claude reads it when it fits.') };
  },
  async knowAdd(root, b) {
    const args = ['know', 'add', `--title=${str(b.title, tr('Title'), { max: 140, required: true })}`, `--area=${knowArea(root, str(b.area, tr('Area'), { max: 60 }))}`];
    const text = str(b.text, tr('Text'), { max: 4000 });
    await withTextFile(root, text, (f) => must(root, [...args, `--file=${f}`]));
    return { message: tr('Entry saved.') };
  },
  async knowEdit(root, b) {
    if (typeof b.kid !== 'string' || !/^[a-f0-9]{6}$/.test(b.kid)) bad(tr('Invalid entry.'));
    const f = b.fields || {};
    const args = ['know', 'edit', b.kid];
    if ('title' in f) args.push(`--title=${str(f.title, tr('Title'), { max: 140, required: true })}`);
    if ('area' in f) args.push(`--area=${knowArea(root, str(f.area, tr('Area'), { max: 60, required: true }))}`);
    if (f.ok) args.push('--ok');
    if ('text' in f) { const text = str(f.text, tr('Text'), { max: 4000 }); await withTextFile(root, text, (file) => must(root, [...args, `--file=${file}`])); } else await must(root, args);
    return { message: tr('Saved.') };
  },
  async knowAccept(root, b) { if (!/^[a-f0-9]{6}$/.test(b.kid || '')) bad(tr('Invalid entry.')); await must(root, ['know', 'accept', b.kid]); return { message: tr('Added to the project knowledge.') }; },
  async knowRemove(root, b) { if (!/^[a-f0-9]{6}$/.test(b.kid || '')) bad(tr('Invalid entry.')); await must(root, ['know', 'remove', b.kid]); return { message: tr('Entry removed.') }; },
  async knowFlag(root, b) { if (!/^[a-f0-9]{6}$/.test(b.kid || '')) bad(tr('Invalid entry.')); await must(root, ['know', 'flag', b.kid]); return { message: tr('Marked as outdated.') }; },
  async recurSave(root, b) {
    const r = b.rule && typeof b.rule === 'object' ? b.rule : bad(tr('Rule missing.'));
    const args = [];
    args.push(`--title=${str(r.title, tr('Title'), { max: 150, required: true })}`);
    const kind = oneOf(r.kind, tr('Rhythm'), ['daily', 'weekly', 'monthly', 'days'], { required: true });
    args.push(`--every=${kind}${r.interval ? `:${Math.min(365, Math.max(1, parseInt(r.interval, 10) || 1))}` : ''}`);
    for (const k of ['weekday', 'nth', 'day', 'due_days']) if (r[k] !== undefined && r[k] !== '' && r[k] !== null) args.push(`--${k}=${Math.max(0, parseInt(r[k], 10) || 0)}`);
    if (r.template) { if (!SLUG_RE.test(r.template)) bad(tr('Invalid template.')); args.push(`--template=${r.template}`); }
    if (r.type) args.push(`--type=${oneOf(r.type, tr('Type'), TYPES)}`);
    if (r.priority) args.push(`--priority=${oneOf(r.priority, tr('Priority'), PRIORITIES)}`);
    if (r.status) args.push(`--status=${oneOf(r.status, tr('Column'), ['backlog', 'geplant'])}`);
    args.push(`--queue=${!!r.queue}`, `--sprint=${!!r.sprint}`, `--active=${r.active !== false}`);
    if (b.rid) { if (!RULE_ID_RE.test(b.rid)) bad(tr('Invalid rule.')); await must(root, ['recur', 'set', b.rid, ...args]); } else await must(root, ['recur', 'add', ...args]);
    return { message: tr('Rule saved.') };
  },
  async recurRemove(root, b) { if (!RULE_ID_RE.test(b.rid || '')) bad(tr('Invalid rule.')); await must(root, ['recur', 'remove', b.rid]); return { message: tr('Rule removed.') }; },
  async recurRun(root) { const m = await must(root, ['recur', 'run']); return { message: m.split('\n')[0] || tr('Nothing due.') }; },
  async githubSync(root) { const m = await must(root, ['github', 'sync'], { timeout: 90000 }); return { message: m.split('\n').pop() }; },
  async githubSettings(root, b) {
    const pairs = Object.entries(b).filter(([k]) => k in DEFAULT_SYNC && typeof DEFAULT_SYNC[k] === 'boolean').map(([k, v]) => `${k}=${!!v}`);
    if (typeof b.labels === 'string') pairs.push(`labels=${list(b.labels, tr('Labels'), /^[\p{L}\p{N} _.:-]+$/u).join(',')}`);
    if (!pairs.length) bad(tr('No setting.'));
    await must(root, ['github', 'set', ...pairs]);
    return { message: tr('Saved.') };
  },
  async review(root, b) {
    const tid = id(b.id);
    const text = str(b.text, tr('Reason'), { max: 4000, required: true });
    const t = findTaskSafe(root, tid);
    if (t.status !== 'review') bad(tr('The task is not in review.'));
    const nums = (Array.isArray(b.uncheck) ? b.uncheck : []).map((n) => parseInt(n, 10)).filter((n) => n > 0).slice(0, 50);
    for (const n of nums) await must(root, ['check', tid, String(n), '--section=Akzeptanzkriterien', '--undo']);
    await withTextFile(root, `${tr('Acceptance review: returned.')}\n\n${text}`, (f) => must(root, ['comment', tid, `--file=${f}`, '--as=Nutzer']));
    await must(root, ['set', tid, 'status=in-arbeit', `--reason=${tr('Acceptance review returned: {text}', { text: text.split('\n')[0].slice(0, 120) })}`]);
    return { message: tr('{id} goes back to Claude.', { id: tid }) };
  },
  async requestHandoff(root, b) {
    const tid = id(b.id);
    await must(root, ['comment', tid, '--as=Nutzer', `--text=${tr('Please update the handoff: status, next step and what is blocking. If the task is stuck, tell me what is missing.')}`]);
    return { message: tr('Claude is asked for a handoff.') };
  },
  async dismissDuplicate(root, b) {
    const a = id(b.a); const c = id(b.b);
    await saveConfigField(root, (config) => { config.cleanup_ignore = [...(config.cleanup_ignore || []), [a, c]].slice(-200); });
    return { message: tr('Remembered as not a duplicate.') };
  },
  async merge(root, b) {
    const keep = id(b.keep); const drop = id(b.drop);
    if (keep === drop) bad(tr('Choose two different tasks.'));
    const d = findTaskSafe(root, drop);
    const desc = stripComments(getSection(d._body, 'Beschreibung') || getSection(d._body, 'Ziel') || '').trim();
    const crit = checkboxes(getSection(d._body, 'Akzeptanzkriterien') || '').items.filter((i) => !i.done).map((i) => `- ${i.text}`).join('\n');
    await withTextFile(root, `${tr('Merged with {id} “{title}”.', { id: drop, title: d.title })}${desc ? `\n\n${tr('Description of {id}:', { id: drop })}\n${desc}` : ''}${crit ? `\n\n${tr('Open criteria of {id}:', { id: drop })}\n${crit}` : ''}`, (f) => must(root, ['comment', keep, `--file=${f}`, '--as=Nutzer']));
    await must(root, ['link', keep, 'related', drop]);
    await must(root, ['drop', drop, `--reason=${tr('Merged into {id}', { id: keep })}`]);
    return { message: tr('{drop} merged into {keep}.', { drop, keep }) };
  },
  async backupApply(root, b) {
    const token = typeof b.token === 'string' && /^[a-f0-9]{16}$/.test(b.token) ? b.token : bad(tr('Invalid preview.'));
    const file = backupTmp(root, token);
    if (!exists(file)) bad(tr('The preview has expired. Please choose the file again.'));
    const mode = oneOf(b.mode, tr('Import type'), ['merge', 'restore'], { required: true });
    try {
      const d = readBackup(fs.readFileSync(file, 'utf8'));
      if (mode === 'restore') {
        const r = restoreBackup(root, d);
        const key = snapshotRestore(root, { label: tr('Restored from {name} ({n} tasks)', { name: d.project || tr('a backup'), n: r.tasks }), backup: r.backup });
        return { message: r.tasks === 1 ? tr('Restored: 1 task. The previous state is saved.') : tr('Restored: {n} tasks. The previous state is saved.', { n: r.tasks }), undo: key };
      }
      const only = (Array.isArray(b.only) ? b.only : []).map((n) => parseInt(n, 10)).filter((n) => n > 0 && n <= 20000);
      if (!only.length) bad(tr('Nothing selected.'));
      const r = mergeBackup(root, d, { only, snapshot: (o) => snapshot(root, o) });
      return { message: tr('Applied: {created} new, {updated} changed.', { created: r.created.length, updated: r.updated.length }), undo: r.undoKey };
    } finally { removeQuiet(file); }
  },
  async importApply(root, b) {
    const file = importFile(root, b.token);
    const only = (Array.isArray(b.only) ? b.only : []).map((n) => parseInt(n, 10)).filter((n) => n > 0 && n <= 5000);
    if (!only.length) bad(tr('No entries selected.'));
    const args = ['import', file, '--apply', `--only=${only.join(',')}`, '--keep-dups', '--include-done', '--include-archived', ...importArgs(b)];
    const st = oneOf(b.status || '', tr('Column'), ['', 'backlog', 'geplant']); if (st) args.push(`--status=${st}`);
    if (b.tags) args.push(`--tags=${list(b.tags, tr('Tags'), /^[\p{L}\p{N}_-]+$/u).join(',')}`);
    try { const m = await must(root, args, { timeout: 120000 }); return { message: m.split('\n')[0] }; } finally { removeQuiet(file); }
  },
  async toIdeas(root, b) {
    const ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 50).map(id);
    for (const tid of ids) {
      const t = findTaskSafe(root, tid);
      await must(root, ['idea', `--text=${tr('{title} (was {id})', { title: t.title, id: tid })}`, ...(t.tags && t.tags.length ? [`--tags=${t.tags.join(',')}`] : [])]);
      await must(root, ['drop', tid, `--reason=${tr('Moved to the ideas')}`]);
    }
    return { message: ids.length === 1 ? tr('1 task moved to the ideas.') : tr('{n} tasks moved to the ideas.', { n: ids.length }) };
  },
});

// Sprache aus dem Board (W-0041): { lang, scope: 'global' | 'project' }, lang '' entfernt die Einstellung dieses Bereichs.
// Global wirkt auf alle Projekte, deshalb nur direkt am Rechner (local). Schreibt über works lang wie im Terminal.
export async function setLang(root, b, { local = false } = {}) {
  if (!b || typeof b !== 'object') bad(tr('Invalid request.'));
  const scope = oneOf(b.scope || 'global', tr('Scope'), ['global', 'project']);
  const lang = b.lang === '' || b.lang === null ? '' : oneOf(b.lang, tr('Language'), languages(), { required: true });
  if (scope === 'global' && !local) throw new ApiError(403, tr('This only works directly on the computer the board runs on.'));
  await must(root, ['lang', ...(lang ? [lang] : ['--reset']), ...(scope === 'project' ? ['--project'] : [])]);
  return { ok: true, ...languageSource(root) };
}

// Befehl im Hintergrund über dieselbe Warteschlange wie das Board, ohne auf das Ergebnis zu warten.
export function background(root, args, timeout = 60000) { cli(root, args, { timeout }).catch(() => {}); }
