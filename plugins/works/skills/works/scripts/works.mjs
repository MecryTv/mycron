#!/usr/bin/env node
// works: Aufgabenverwaltung im Projektordner .works/
// Aufruf: node "${CLAUDE_SKILL_DIR}/scripts/works.mjs" <befehl> [argumente]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readText,
  SKILL_DIR, STATUSES, OPEN_STATUSES, CLOSED_STATUSES, STATUS_LABEL, PRIORITIES, PRIO_LABEL,
  TYPES, TYPE_LABEL, EFFORTS, RISKS, BRANCH_PREFIX, FIELD_ORDER, LIST_FIELDS, DEFAULT_CONFIG,
  today, nowStamp, daysBetween, slugify, fail, warn, run, openInBrowser, exists, readJson, writeJson,
  findRoot, requireRoot, worksDir, loadConfig, saveConfig, loadState, saveState,
  formatId, idNumber, normalizeId, parseFrontmatter, serializeFrontmatter,
  getSection, setSection, appendToSection, stripComments, checkboxes, hasContent, imageLinks,
  loadTasks, loadTask, findTask, saveTask, addHistory, relFromWorks, isBlocked, openBlockers,
  isOverdue, openQuestions, sortTasks, readTemplate, fillTemplate, parseArgs, listFlag,
  queueOf, pruneQueue, laneLink, normValue, sectionTitle, sectionKey, bodyLang,
} from './lib.mjs';
import { tasksForFile, filesForTask } from './files.mjs';
import { parseImport, FORMATS } from './import.mjs';
import { similarity } from './similar.mjs';
import { planParallel, startLane, laneInfo, loadLanes, laneOf, finishLane, abortLane, lanePrompt, setLaneStatus } from './parallel.mjs';
import { generateIndex, nextCandidates, dodCheck, sessionSummary, byIdMap, milestoneProgress } from './views.mjs';
import { generateBoard, refreshBoardIfPresent } from './board.mjs';
import { serveBoard } from './serve.mjs';
import { shareLinks, rotateKeys } from './share.mjs';
import { buildSnapshot, snapshotName } from './export.mjs';
import { sprintSettings, sprintList, activeSprint, lastClosedSprint, nextSprintId, sprintStats, pointsOf, addDays } from './sprint.mjs';
import { addComment, loadComments, unreadForClaude, markRead } from './comments.mjs';
import { listTemplates, findTemplate, saveTemplate, deleteTemplate, templateFromTask, applyTemplate, countUse } from './templates.mjs';
import { taskTime, estimates, fmtDuration } from './timelog.mjs';
import { configuredChecks, checksFor, detectChecks, runChecks, recordCheck, ackCheck, loadResults, NAME_RE, checkEntry, storedCheck } from './checks.mjs';
import { writeWeekly, reportSettings, setWebhook } from './weekly.mjs';
import { setDirection, addVariant, addBrainstorm, chooseVariant, removeVariant, loadDesign, parseColors, needsDesign, detectDesignSkills, localRefs } from './design.mjs';
import { addInstruction } from './live.mjs';
import { loadKnowledge, addKnowledge, updateKnowledge, removeKnowledge } from './knowledge.mjs';
import { rules, KINDS, dueRules, fillTitle, describe, upcoming } from './recurring.mjs';
import { serveHub, projectList, registerProject, runningBoards } from './hub.mjs';
import { syncGithub, syncSettings, syncState, DEFAULT_SYNC } from './ghsync.mjs';
import { buildIcal } from './ical.mjs';
import { undo, undoList, snapshot, snapshotRestore } from './undo.mjs';
import { FORMAT as BACKUP_FORMAT, exportBoard, readBackup, compareBackup, mergeBackup, restoreBackup, backupFileName } from './backup.mjs';
import { findSimilar } from './similar.mjs';
import { taskUsage, projectUsage, liveUsage, fmtTokens, fmtCost } from './usage.mjs';
import { seedDemo, simulate, defaultDemoPath } from './demo.mjs';
import { adaptToType, repairTasks, insertAfter, GOAL_SECTION } from './sections.mjs';
import { readServer, clearServer, findServerProcesses, stopProcess, startDetached, newestCli, cliVersion, lastPort, OWN_CLI } from './server-control.mjs';
import { BOARD_VIEWS, loadPlaywright, takeShots, boardPrepare } from './shot.mjs';
import { tr, languages, languageSource, setLanguage, normLang, settingsFile, LANGUAGE_NAMES, variants } from './i18n.mjs';

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'];
const ASSET_KINDS = ['ist', 'vorher', 'nachher', 'referenz', 'mockup', 'skizze', 'fehler', 'diagramm'];

const { pos, flags } = parseArgs(process.argv.slice(2));
const cmd = pos.shift() || (flags.version ? 'version' : 'help');

const out = (s = '') => process.stdout.write(s + '\n');
// Ausgabe in eine geschlossene Pipe (etwa | head) ist kein Fehler.
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); throw e; });

function refresh(root) {
  generateIndex(root);
  refreshBoardIfPresent(root);
}

function validateEnum(name, value, allowed) {
  if (value === undefined || value === null || value === '') return;
  if (!allowed.includes(value)) fail(tr('Invalid value for {name}: "{value}". Allowed: {allowed}', { name, value, allowed: allowed.join(', ') }));
}

function normPriority(p) {
  if (p === undefined || p === true) return undefined;
  const s = String(p).toUpperCase();
  return /^\d$/.test(s) ? `P${s}` : s;
}

// ---------- init ----------

function cmdInit() {
  setTimeout(() => { try { const r = findRoot(); if (r) registerProject(r); } catch { /* egal */ } }, 0);
  const root = path.resolve(flags.path || process.cwd());
  const wd = path.join(root, '.works');
  if (exists(path.join(wd, 'config.json')) && !flags.force) {
    out(tr('.works already exists in {root}. --force adds missing files.', { root }));
  }
  for (const sub of ['tasks', 'archive', 'inbox', 'reports']) fs.mkdirSync(path.join(wd, sub), { recursive: true });
  if (!exists(path.join(wd, 'config.json'))) {
    const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    if (flags.prefix) cfg.id_prefix = String(flags.prefix).toUpperCase();
    saveConfig(root, cfg);
  }
  if (!exists(path.join(wd, 'state.json'))) saveState(root, {});
  if (!exists(path.join(wd, 'ideas.md'))) fs.writeFileSync(path.join(wd, 'ideas.md'), readTemplate('ideas.md'));
  for (const sub of ['inbox', 'reports', 'archive']) {
    const keep = path.join(wd, sub, '.gitkeep');
    if (!exists(keep)) fs.writeFileSync(keep, '');
  }
  const mode = flags.gitignore || 'default';
  const ignore = [tr('# works: generated and local files'),'board.html', 'state.json', 'server.json', 'server.log', '.tmp/', 'share.json', 'activity.json', 'steps.json', 'instructions.json', '.undo/', '.usage-state.json', 'github.json', 'lanes.json', 'files.jsonl', '.filemap.json', '.file-hints.json', 'inbox/*', '!inbox/.gitkeep'];
  if (mode === 'assets') ignore.push('tasks/*/assets/', 'archive/*/assets/');
  if (mode === 'all') ignore.splice(1, ignore.length - 1, '*', '!.gitignore');
  if (mode !== 'none') fs.writeFileSync(path.join(wd, '.gitignore'), ignore.join('\n') + '\n');
  refresh(root);
  out(tr('works initialized in {dir}', { dir: wd }));
  out(tr('Next steps: create a task with `works new`, optionally install hooks with `works install-hooks`.'));
}

// ---------- new ----------

function createTask(root, config, opts) {
  const type = opts.type || 'feature';
  validateEnum('type', type, TYPES);
  const priority = normPriority(opts.priority) || 'P3';
  validateEnum('priority', priority, PRIORITIES);
  const status = normValue('status', opts.status) || 'backlog';
  validateEnum('status', status, STATUSES);
  validateEnum('effort', opts.effort, EFFORTS);
  const risk = normValue('risk', opts.risk);
  validateEnum('risk', risk, RISKS);
  if (!opts.title || opts.title === true) fail(tr('Title missing (--title "...").'));

  const existing = loadTasks(root);
  const maxId = Math.max(0, ...existing.map((t) => idNumber(t.id)).filter((n) => !Number.isNaN(n)));
  const num = Math.max(config.next_id || 1, maxId + 1);
  const id = formatId(config, num);
  config.next_id = num + 1;
  saveConfig(root, config);

  const dirName = `${id}-${slugify(opts.title)}`;
  const dir = path.join(worksDir(root), 'tasks', dirName);
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', '.gitkeep'), '');

  const tpl = readTemplate(`task-${type}.md`);
  const { body } = parseFrontmatter(tpl);
  const data = {
    id, title: String(opts.title), type, priority, status,
    effort: opts.effort || null, risk: risk || null,
    created: today(), updated: today(), due: opts.due || null, completed: null,
    milestone: opts.milestone || null, branch: null,
    tags: listFlag(opts.tags), blocked_by: listFlag(opts['blocked-by']).map((x) => normalizeId(config, x)),
    blocks: listFlag(opts.blocks).map((x) => normalizeId(config, x)),
    related: listFlag(opts.related).map((x) => normalizeId(config, x)),
    source: opts.source || 'manuell',
    incomplete: !!opts.incomplete,
  };
  let filled = fillTemplate(body, { id, title: data.title, date: today() });
  // Wer die Aufgabe angelegt hat, steht auch im ersten Verlaufseintrag (das Board erkennt so eigene Änderungen).
  if (process.env.WORKS_ACTOR) filled = filled.replace(new RegExp(`^(- \\d{4}-\\d{2}-\\d{2}: (?:${variants('Task created').join('|')}))$`, 'm'), `$1 [${process.env.WORKS_ACTOR}]`);
  fs.writeFileSync(path.join(dir, 'task.md'), serializeFrontmatter(data) + '\n' + filled.replace(/^\n+/, ''));

  const task = loadTask(dir);
  if (opts['log-file']) {
    const log = readText(String(opts['log-file'])).trim();
    task._body = setSection(task._body, 'Logs und Fehlermeldungen', '```\n' + log + '\n```');
  }
  // Ziel, Beschreibung und Kriterien in einem Schritt schreiben, damit nie eine halb angelegte Aufgabe entsteht.
  const textOpt = (name) => {
    const file = opts[`${name}-file`];
    if (file && file !== true) return fs.readFileSync(String(file), 'utf8').replace(/\r\n/g, '\n').trim();
    return opts[name] && opts[name] !== true ? String(opts[name]).trim() : '';
  };
  const goalName = GOAL_SECTION[type] || 'Ziel';
  const goalText = textOpt('goal');
  const descText = textOpt('description');
  const mainText = goalName === 'Beschreibung' ? [goalText, descText].filter(Boolean).join('\n\n') : goalText;
  if (mainText) task._body = setSection(task._body, goalName, mainText);
  if (descText && goalName !== 'Beschreibung') task._body = insertAfter(task._body, goalName, `## ${sectionTitle('Beschreibung', task._body)}\n${descText}\n`);
  const criteria = (Array.isArray(opts.criteriaList) ? opts.criteriaList.join('\n') : textOpt('criteria')).split('\n').map((s) => s.replace(/^\s*[-*]\s*(\[ \]\s*)?/, '').trim()).filter(Boolean);
  if (criteria.length) {
    const sec = stripComments(getSection(task._body, 'Akzeptanzkriterien') || '').split('\n').filter((l) => l.trim() && !/^\s*[-*]\s+\[ \]\s*$/.test(l));
    task._body = setSection(task._body, 'Akzeptanzkriterien', [...sec, ...criteria.map((c) => `- [ ] ${c}`)].join('\n'));
  }
  if (opts.context) {
    task._body = setSection(task._body, 'Herkunft', String(opts.context));
  }
  saveTask(task, { touch: false });

  // Gegenseitige Abhängigkeiten pflegen
  const byId = byIdMap(loadTasks(root));
  for (const b of data.blocked_by) {
    const dep = byId.get(b);
    if (dep && !dep.blocks.includes(id)) { dep.blocks.push(id); saveTask(dep); }
  }
  for (const b of data.blocks) {
    const dep = byId.get(b);
    if (dep && !dep.blocked_by.includes(id)) { dep.blocked_by.push(id); saveTask(dep); }
  }
  for (const r of data.related) {
    const dep = byId.get(r);
    if (dep && !dep.related.includes(id)) { dep.related.push(id); saveTask(dep); }
  }

  if (type === 'design' || opts.decisions) createDecisions(root, task);
  return task;
}

function cmdNew() {
  const root = requireRoot();
  const config = loadConfig(root);
  const title = flags.title || pos.join(' ');
  const task = flags.template && flags.template !== true ? newFromTemplate(root, config) : createTask(root, config, { ...flags, title });
  refresh(root);
  out(tr('Created: {id} {title}', { id: task.id, title: task.title }));
  const sim = findSimilar({ id: task.id, title: task.title, tags: task.tags, text: getSection(task._body, 'Beschreibung') || '' }, loadTasks(root, { archive: false }), { min: 0.55 });
  if (sim.length) out(tr('Note: similar open task {list}. If it is a duplicate, suggest merging them to the user.', { list: sim.map((x) => `${x.t.id} ${x.t.title} (${Math.round(x.score * 100)} %)`).join(', ') }));
  out(tr('File: {file}', { file: task._file }));
  if (exists(path.join(task._dir, 'decisions.md'))) out(tr('Decisions: {file}', { file: path.join(task._dir, 'decisions.md') }));
  out(tr('Next step: fill in the sections of task.md (replace the placeholder comments).'));
}

// ---------- list / show ----------

function cmdList() {
  const root = requireRoot();
  let list = loadTasks(root, { archive: !!flags.all || !!flags.archived });
  const byId = byIdMap(loadTasks(root));
  if (!flags.all && !flags.status) list = list.filter((t) => OPEN_STATUSES.includes(t.status));
  if (flags.status) { const s = listFlag(flags.status).map((x) => normValue('status', x)); list = list.filter((t) => s.includes(t.status)); }
  if (flags.priority) { const p = listFlag(flags.priority).map(normPriority); list = list.filter((t) => p.includes(t.priority)); }
  if (flags.type) { const ty = listFlag(flags.type); list = list.filter((t) => ty.includes(t.type)); }
  if (flags.tag) { const tg = listFlag(flags.tag); list = list.filter((t) => tg.some((x) => (t.tags || []).includes(x))); }
  if (flags.milestone) list = list.filter((t) => t.milestone === flags.milestone);
  if (flags.blocked) list = list.filter((t) => isBlocked(t, byId));
  if (flags.overdue) list = list.filter(isOverdue);
  if (flags.incomplete) list = list.filter((t) => t.incomplete);
  if (flags.view && flags.view !== true) list = applyView(loadConfig(root), list, byId, flags.view);
  list = sortTasks(list);
  if (flags.json) {
    out(JSON.stringify(list.map((t) => ({
      ...Object.fromEntries(Object.entries(t).filter(([k]) => !k.startsWith('_'))),
      file: t._file, archived: t._archived, blocked: isBlocked(t, byId), open_questions: openQuestions(t).length,
    })), null, 2));
    return;
  }
  if (!list.length) { out(tr('No matching tasks.')); return; }
  const rows = list.map((t) => {
    const hints = [];
    if (OPEN_STATUSES.includes(t.status) && isBlocked(t, byId)) hints.push(tr('blocked: {ids}', { ids: openBlockers(t, byId).join(',') }));
    if (isOverdue(t)) hints.push(tr('overdue {due}', { due: t.due }));
    if (t.incomplete) hints.push(tr('incomplete'));
    const q = openQuestions(t).length;
    if (q) hints.push(tr('{n} question(s)', { n: q }));
    return [t.id, t.priority, STATUS_LABEL[t.status] || t.status, TYPE_LABEL[t.type] || t.type, t.effort || '-', t.title, hints.join(', ')];
  });
  const head = ['ID', 'Prio', 'Status', tr('Type'), tr('Eff.'), tr('Title'), tr('Notes')];
  const w = head.map((h, i) => Math.min(i === 5 ? 50 : 30, Math.max(h.length, ...rows.map((r) => String(r[i]).length))));
  const fmt = (r) => r.map((c, i) => { const s = String(c); return (s.length > w[i] ? s.slice(0, w[i] - 1) + '…' : s).padEnd(w[i]); }).join('  ').trimEnd();
  out(fmt(head));
  out(w.map((x) => '-'.repeat(x)).join('  '));
  rows.forEach((r) => out(fmt(r)));
  out('\n' + tr('{n} task(s)', { n: list.length }));
}

function cmdShow() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  if (flags.section) {
    const s = getSection(t._body, String(flags.section));
    if (s === null) fail(tr('Section "{name}" not found.', { name: flags.section }));
    out(s.trim());
    return;
  }
  out(readText(t._file));
  const byId = byIdMap(loadTasks(root));
  const info = [];
  if (isBlocked(t, byId)) info.push(tr('Blocked by: {ids}', { ids: openBlockers(t, byId).join(', ') }));
  const dec = path.join(t._dir, 'decisions.md');
  if (exists(dec)) info.push(tr('Design decisions: {file}', { file: dec }));
  const assets = fs.existsSync(path.join(t._dir, 'assets')) ? fs.readdirSync(path.join(t._dir, 'assets')).filter((f) => !f.startsWith('.')) : [];
  if (assets.length) info.push(tr('Assets: {n} file(s)', { n: assets.length }));
  if (info.length) out('---\n' + info.join('\n'));
}

// ---------- set / log / question / link ----------

function applyField(t, key, value, config) {
  if (key === 'id' || key === 'created') fail(tr('Field {key} cannot be changed.', { key }));
  if (!FIELD_ORDER.includes(key) && !flags.custom) fail(tr('Unknown field {key}. --custom allows your own fields.', { key }));
  let v = value;
  if (LIST_FIELDS.includes(key)) {
    v = listFlag(value);
    if (['blocked_by', 'blocks', 'related'].includes(key)) v = v.map((x) => normalizeId(config, x));
  } else if (key === 'incomplete') v = value === 'true' || value === '1' || value === 'ja' || value === 'yes';
  else if (value === '' || value === 'null' || value === '-') v = null;
  if (key === 'priority') v = normPriority(v);
  if (key === 'priority') validateEnum(key, v, PRIORITIES);
  if (key === 'status') validateEnum(key, v, STATUSES);
  if (key === 'type') validateEnum(key, v, TYPES);
  if (key === 'effort') validateEnum(key, v, EFFORTS);
  if (key === 'risk') validateEnum(key, v, RISKS);
  if ((key === 'due' || key === 'completed') && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(tr('{key} needs the format YYYY-MM-DD.', { key }));
  if (key === 'milestone' && v && !(config.milestones || []).some((m) => m.id === v)) warn(tr('Milestone {id} is not defined in config.json.', { id: v }));
  const old = t[key];
  t[key] = v;
  return old;
}

function cmdSet() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos.shift());
  if (!pos.length) fail(tr('No changes given. Example: works set W-0012 priority=P1 status=planned'));
  const changes = [];
  for (const pair of pos) {
    const eq = pair.indexOf('=');
    if (eq === -1) fail(tr('Invalid argument "{arg}", expected field=value.', { arg: pair }));
    const key = pair.slice(0, eq).trim().replace(/-/g, '_');
    const value = normValue(key, pair.slice(eq + 1).trim());
    if (key === 'status' && value === 'erledigt' && !flags.force) fail(tr('Use `works done` to close a task, so the Definition of Done gets checked.'));
    if (key === 'status' && value === 'verworfen' && !flags.reason) fail(tr('Dropping needs a reason (--reason "...") or `works drop`.'));
    const old = applyField(t, key, value, config);
    if (key === 'type' && old && old !== t[key]) adaptToType(t, old, t[key]);
    const fmt = (x) => (Array.isArray(x) ? `[${x.join(', ')}]` : (x ?? tr('empty')));
    if (key === 'status') changes.push(`Status: ${fmt(old)} → ${fmt(t[key])}`);
    else if (key === 'priority') changes.push(tr('Priority: {old} → {new}', { old: fmt(old), new: fmt(t[key]) }));
    else changes.push(`${key}: ${fmt(old)} → ${fmt(t[key])}`);
  }
  addHistory(t, changes.join('; ') + (flags.reason ? ' ' + tr('(reason: {reason})', { reason: flags.reason }) : ''));
  saveTask(t);
  if (t.status === 'in-arbeit') { const st = loadState(root); st.active = t.id; saveState(root, st); }
  refresh(root);
  out(tr('{id} updated: {changes}', { id: t.id, changes: changes.join('; ') }));
}

function cmdLog() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos.shift());
  const text = flags.text || pos.join(' ');
  if (!text) fail(tr('Text missing.'));
  addHistory(t, text);
  saveTask(t);
  refresh(root);
  out(tr('Added to the history of {id}.', { id: t.id }));
}

function cmdQuestion() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos.shift());
  if (flags.resolve) {
    const n = parseInt(flags.resolve, 10);
    const sec = getSection(t._body, 'Offene Fragen') || '';
    let i = 0;
    const lines = sec.split('\n').map((l) => {
      const m = l.match(/^(\s*[-*]\s+)\[ \](\s*)(.*)$/);
      if (m && m[3].trim()) { i++; if (i === n) return `${m[1]}[x]${m[2]}${m[3]}${flags.answer ? ' ' + tr('Answer: {answer}', { answer: flags.answer }) : ''}`; }
      return l;
    });
    if (i < n) fail(tr('Question {n} not found.', { n }));
    t._body = setSection(t._body, 'Offene Fragen', lines.join('\n'));
    addHistory(t, tr('Question {n} resolved', { n }) + (flags.answer ? `: ${flags.answer}` : ''));
  } else {
    const text = flags.text && flags.text !== true ? String(flags.text) : pos.join(' ');
    if (!text) {
      const q = openQuestions(t);
      out(q.length ? q.map((x, i) => `${i + 1}. ${x.text}`).join('\n') : tr('No open questions.'));
      return;
    }
    const sec = stripComments(getSection(t._body, 'Offene Fragen') || '').split('\n').filter((l) => l.trim() && !/^\s*[-*]\s+\[ \]\s*$/.test(l));
    sec.push(`- [ ] ${text}`);
    t._body = setSection(t._body, 'Offene Fragen', sec.join('\n'));
  }
  saveTask(t);
  refresh(root);
  out(tr('Open questions of {id} updated.', { id: t.id }));
}

function cmdLink() {
  const root = requireRoot();
  const config = loadConfig(root);
  const [a, rel, b] = pos;
  if (!a || !rel || !b) fail(tr('Usage: works link <A> blocks|blocked-by|related <B>'));
  const ta = findTask(root, config, a);
  const tb = findTask(root, config, b);
  const remove = cmd === 'unlink';
  const add = (arr, v) => { if (!arr.includes(v)) arr.push(v); };
  const del = (arr, v) => { const i = arr.indexOf(v); if (i !== -1) arr.splice(i, 1); };
  const op = remove ? del : add;
  if (rel === 'blocks') { op(ta.blocks, tb.id); op(tb.blocked_by, ta.id); }
  else if (rel === 'blocked-by' || rel === 'blocked_by') { op(ta.blocked_by, tb.id); op(tb.blocks, ta.id); }
  else if (rel === 'related') { op(ta.related, tb.id); op(tb.related, ta.id); }
  else fail(tr('Unknown relation {rel}.', { rel }));
  if (!remove && rel !== 'related' && hasCycle(loadTasks(root).map((t) => (t.id === ta.id ? ta : t.id === tb.id ? tb : t)))) {
    fail(tr('This dependency would create a cycle.'));
  }
  const relWord = remove ? tr('Relation removed') : tr('Relation');
  addHistory(ta, `${relWord}: ${rel} ${tb.id}`);
  addHistory(tb, `${relWord}: ${ta.id} ${rel}`);
  saveTask(ta); saveTask(tb);
  refresh(root);
  out(remove ? tr('{a} no longer {rel} {b}', { a: ta.id, rel, b: tb.id }) : `${ta.id} ${rel} ${tb.id}`);
}

function hasCycle(tasks) {
  const graph = new Map(tasks.map((t) => [t.id, t.blocked_by || []]));
  const state = new Map();
  const visit = (id) => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const d of graph.get(id) || []) if (graph.has(d) && visit(d)) return true;
    state.set(id, 2);
    return false;
  };
  return [...graph.keys()].some(visit);
}

// ---------- start / handoff / done / drop / reopen / archive ----------

function branchName(t) {
  let prefix = BRANCH_PREFIX[t.type] || 'feature';
  if (t.type === 'bug' && t.priority === 'P1') prefix = 'hotfix';
  return `${prefix}/${t.id.toLowerCase()}-${slugify(t.title, 30)}`;
}

function printContext(root, t) {
  out(tr('Task: {id} {title}', { id: t.id, title: t.title }));
  out(tr('Type {type}, {prio} {prioLabel}, Status {status}', { type: TYPE_LABEL[t.type], prio: t.priority, prioLabel: PRIO_LABEL[t.priority], status: STATUS_LABEL[t.status] }) + (t.effort ? tr(', effort {effort}', { effort: t.effort }) : ''));
  out(tr('File: {file}', { file: t._file }));
  if (t.branch) out(`Branch: ${t.branch}`);
  for (const s of ['Ziel', 'Zusammenfassung', 'Forschungsfrage', 'Abkürzung', 'Beschreibung', 'Kontext und Problem', 'Akzeptanzkriterien', 'Umsetzungsplan', 'Checkliste', 'Übergabe', 'Offene Fragen']) {
    const c = getSection(t._body, s);
    if (hasContent(c)) out(`\n## ${sectionTitle(s, t._body)}\n${stripComments(c).trim()}`);
  }
  const dec = path.join(t._dir, 'decisions.md');
  if (exists(dec)) out('\n' + tr('Design decisions: {file}', { file: dec }));
  const assets = getSection(t._body, 'Assets');
  if (hasContent(assets)) out(`\n## ${tr('Assets (descriptions)')}\n${stripComments(assets).trim()}`);
}

function cmdStart() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  const here = laneLink();
  if (here) {
    if (here.task !== t.id) fail(tr('This worktree belongs to {task}. Do not start other tasks from here.', { task: here.task }));
    out(tr('{id} runs in parallel in this worktree. The active task of the main project stays unchanged.', { id: t.id }));
    printContext(root, t);
    return;
  }
  const lane = laneOf(root, t.id);
  if (lane && !flags.force) fail(tr('{id} runs in parallel in the worktree {path}. An agent works there. First run works parallel finish {id} or abort.', { id: t.id, path: lane.path }));
  if (t._archived) fail(tr('{id} is archived. Use `works reopen` to resume it.', { id: t.id }));
  const all = loadTasks(root);
  const byId = byIdMap(all);
  if (isBlocked(t, byId) && !flags.force) {
    fail(tr('{id} is blocked by {ids}. Finish those first or override deliberately with --force.', { id: t.id, ids: openBlockers(t, byId).join(', ') }));
  }
  if (t.incomplete) warn(tr('{id} is marked as incomplete. Ask the user for the missing details before starting.', { id: t.id }));
  const others = all.filter((x) => x.status === 'in-arbeit' && x.id !== t.id);
  if (others.length) warn(tr('Already in progress: {ids}. Update their handoff first.', { ids: others.map((x) => x.id).join(', ') }));
  const old = t.status;
  if (old !== 'in-arbeit') {
    t.status = 'in-arbeit';
    addHistory(t, tr('Started (Status: {old} → in-arbeit)', { old }) + (isBlocked(t, byId) ? ' ' + tr('despite blockers') : ''));
  }
  if (!t.branch) t.branch = branchName(t);
  saveTask(t);
  const st = loadState(root);
  st.active = t.id;
  st.started = nowStamp();
  saveState(root, st);
  if (flags.git) {
    const exists_ = run('git', ['rev-parse', '--verify', t.branch], { cwd: root }).ok;
    const r = run('git', exists_ ? ['checkout', t.branch] : ['checkout', '-b', t.branch], { cwd: root });
    out(r.ok ? tr('Git: on branch {branch}', { branch: t.branch }) : tr('Git failed: {error}', { error: r.stderr.trim() }));
  }
  refresh(root);
  printContext(root, t);
  if (needsDesign(t)) {
    const d = loadDesign(t);
    const sk = detectDesignSkills();
    const names = [sk.uiux ? 'UI UX Pro Max' : '', sk.brainstorm ? 'Superpowers Brainstorming' : ''].filter(Boolean);
    if (d && d.chosen) out('\n' + tr('Design variant {name} is chosen (works design {id}). Implement it accordingly.', { name: d.chosen.name, id: t.id }));
    else if (d && d.variants.length) out('\n' + tr('There are {n} design variants, but no choice yet. Let the user choose in the board under design variants, or ask before implementing.', { n: d.variants.length }));
    else if (names.length > 1) out('\n' + tr('Design task: {a} and {b} are installed. Use them now and attach the results: works design brainstorm, works design direction, works design add (see references/integrations.md). Wait for the user\'s choice before implementing.', { a: names[0], b: names[1] }));
    else if (names.length) out('\n' + tr('Design task: {name} is installed. Use it now and attach the results: works design brainstorm, works design direction, works design add (see references/integrations.md). Wait for the user\'s choice before implementing.', { name: names[0] }));
    else out('\n' + tr('Design task: if UI UX Pro Max or Superpowers Brainstorming is available, use it now and attach the results: works design brainstorm, works design direction, works design add (see references/integrations.md). Wait for the user\'s choice before implementing.'));
  }
}

function cmdHandoff() {
  const root = requireRoot();
  const config = loadConfig(root);
  const st = loadState(root);
  const id = pos[0] || st.active;
  if (!id) fail(tr('No active task. Give an ID.'));
  const t = findTask(root, config, id);
  let text = flags.text;
  if (flags.file) text = readText(String(flags.file));
  if (!text || text === true) {
    const h = getSection(t._body, 'Übergabe');
    out(hasContent(h) ? stripComments(h).trim() : tr('No handoff for {id} yet.', { id: t.id }));
    return;
  }
  t._body = setSection(t._body, 'Übergabe', `${tr('As of: {time}', { time: nowStamp() })}\n\n${String(text).trim()}`);
  addHistory(t, tr('Handoff updated'));
  saveTask(t);
  st.active = t.id;
  st.last_handoff = nowStamp();
  saveState(root, st);
  refresh(root);
  out(tr('Handoff for {id} saved.', { id: t.id }));
}

function cmdDod() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  const res = dodCheck(root, config, t);
  if (flags.json) { out(JSON.stringify(res, null, 2)); return; }
  printDod(res);
}

// ---------- Abschnitte und Checklisten bearbeiten ----------

const CHECK_SECTIONS = ['Akzeptanzkriterien', 'Umsetzungsplan', 'Checkliste', 'Vorgehen'];
const CHECK_RE = /^(\s*[-*]\s+)\[( |x|X)\](\s*)(.*)$/;

function cmdSection() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos.shift());
  const name = pos.shift();
  if (!name) fail(tr('Section name missing. Usage: works section <ID> "Goal" --text "..." | --file path'));
  if (['Verlauf', 'Assets'].includes(sectionKey(name))) fail(tr('The section {name} is maintained only through the CLI.', { name }));
  let text = flags.text;
  if (flags.file) text = readText(String(flags.file));
  if (text === undefined || text === true) {
    const s = getSection(t._body, name);
    out(s === null ? '' : stripComments(s).trim());
    return;
  }
  const clean = String(text).replace(/\r\n/g, '\n').trim();
  if (getSection(t._body, name) === null && flags.after && flags.after !== true) {
    t._body = insertAfter(t._body, String(flags.after), `## ${sectionTitle(name, t._body)}\n${clean}\n`);
  } else {
    t._body = setSection(t._body, name, clean);
  }
  addHistory(t, tr('Section {name} updated', { name }));
  saveTask(t);
  refresh(root);
  out(tr('{id}: section {name} saved.', { id: t.id, name }));
}

// Zählt nur echte Punkte außerhalb von HTML-Kommentaren, genau wie checkboxes() in lib.mjs.
function mapChecklist(lines, fn) {
  let i = 0;
  let inComment = false;
  return lines.map((l) => {
    const opens = l.includes('<!--');
    const closes = l.includes('-->');
    if (inComment || opens) { inComment = opens ? !closes : !closes; return l; }
    const m = l.match(CHECK_RE);
    if (m && m[4].trim()) { i++; return fn(l, m, i); }
    return l;
  });
}

function cmdCheck() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos.shift());
  const n = parseInt(pos.shift(), 10);
  const name = flags.section && flags.section !== true ? String(flags.section) : 'Akzeptanzkriterien';
  if (!n) fail(tr('Item number missing. Usage: works check <ID> <no.> [--section "Acceptance criteria"] [--undo]'));
  const sec = getSection(t._body, name);
  if (sec === null) fail(tr('Section {name} not found.', { name }));
  let text = '';
  const next = mapChecklist(sec.split('\n'), (l, m, i) => {
    if (i !== n) return l;
    text = m[4].trim();
    return `${m[1]}[${flags.undo ? ' ' : 'x'}]${m[3] || ' '}${m[4]}`;
  });
  if (!text) fail(tr('Item {n} in {section} not found.', { n, section: sectionTitle(name, t._body) }));
  t._body = setSection(t._body, name, next.join('\n'));
  const section = sectionTitle(name, t._body);
  addHistory(t, flags.undo ? tr('{section}: "{text}" reopened', { section, text }) : tr('{section}: "{text}" checked', { section, text }));
  saveTask(t);
  refresh(root);
  out(flags.undo ? tr('{id}: {section} item {n} open.', { id: t.id, section, n }) : tr('{id}: {section} item {n} done.', { id: t.id, section, n }));
}

function cmdItem() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos.shift());
  const text = (flags.text && flags.text !== true ? String(flags.text) : pos.join(' ')).trim();
  const name = flags.section && flags.section !== true ? String(flags.section) : 'Akzeptanzkriterien';
  if (!CHECK_SECTIONS.includes(sectionKey(name))) warn(tr('Checklists usually go in: {list}', { list: CHECK_SECTIONS.map((s) => sectionTitle(s, t._body)).join(', ') }));
  const sec = getSection(t._body, name) || '';
  if (flags.remove) {
    const n = parseInt(flags.remove, 10);
    let removed = '';
    const kept = mapChecklist(sec.split('\n'), (l, m, i) => {
      if (i !== n) return l;
      removed = m[4].trim();
      return null;
    }).filter((l) => l !== null);
    if (!removed) fail(tr('Item {n} not found.', { n }));
    t._body = setSection(t._body, name, kept.join('\n'));
    addHistory(t, tr('{section}: "{text}" removed', { section: sectionTitle(name, t._body), text: removed }));
  } else {
    if (!text) fail(tr('Text missing.'));
    const lines = stripComments(sec).split('\n').filter((l) => l.trim() && !/^\s*[-*]\s+\[ \]\s*$/.test(l));
    lines.push(`- [ ] ${text}`);
    t._body = setSection(t._body, name, lines.join('\n'));
    addHistory(t, tr('{section}: "{text}" added', { section: sectionTitle(name, t._body), text }));
  }
  saveTask(t);
  refresh(root);
  out(tr('{id}: {section} updated.', { id: t.id, section: sectionTitle(name, t._body) }));
}

function printDod(res) {
  out(tr('Checked automatically:'));
  for (const a of res.auto) out(`  [${a.ok ? 'x' : ' '}] ${a.text}${a.detail ? ` (${a.detail})` : ''}`);
  if (res.manual.length) {
    out(tr('To confirm manually:'));
    for (const m of res.manual) out(`  [?] ${m}`);
  }
  if (res.commands.length) out(tr('Commands (run with --run): {list}', { list: res.commands.join(' ; ') }));
}

async function cmdDone() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  if (t.status === 'erledigt') { out(tr('{id} is already done.', { id: t.id })); return; }
  if (laneLink()) fail(tr('Do not close a task inside the worktree of a parallel task. Set status review, the main project closes it.'));
  { const lane = laneOf(root, t.id); if (lane && !flags.force) fail(tr('{id} still runs in parallel in the worktree {path}. First run works parallel finish {id} [--merge].', { id: t.id, path: lane.path })); }
  // Eingerichtete Prüfungen laufen automatisch, wenn es für den aktuellen Stand noch kein Ergebnis gibt.
  if (checksFor(config, t).length && !flags['no-checks']) {
    const st = dodCheck(root, config, t).checks;
    if (st && st.stale) {
      out(tr('Automatic checks:'));
      printChecks(await runChecks(root, config, t, { onStart: (c) => out(`> ${c.name}: ${c.cmd}`) }));
      out('');
    }
  }
  const res = dodCheck(root, config, t);
  let cmdFail = [];
  if (flags.run && res.commands.length) {
    for (const c of res.commands) {
      out(`> ${c}`);
      const r = run(process.platform === 'win32' ? 'cmd' : 'sh', [process.platform === 'win32' ? '/c' : '-c', c], { cwd: root, stdio: 'inherit' });
      if (!r.ok) cmdFail.push(c);
    }
  }
  printDod(res);
  const failed = res.auto.filter((a) => !a.ok);
  if (cmdFail.length) out(tr('Failed commands: {list}', { list: cmdFail.join(', ') }));
  if ((failed.length || cmdFail.length) && !flags.force) {
    out('\n' + tr('{id} does not meet the Definition of Done yet. Finish the items or close it deliberately with --force --reason "...".', { id: t.id }));
    process.exit(1);
  }
  if (!flags.confirm) {
    out('\n' + tr('Automatic checks passed. Check the manual items, then: works done {id} --confirm', { id: t.id }));
    return;
  }
  const old = t.status;
  t.status = 'erledigt';
  t.completed = today();
  const forced = failed.length || cmdFail.length;
  addHistory(t, tr('Closed (Status: {old} → erledigt)', { old }) + (forced ? tr(', DoD skipped: {reason}', { reason: flags.reason || tr('no reason given') }) : tr(', DoD confirmed')));
  t._body = setSection(t._body, 'Übergabe', tr('Closed on {date}. No open handoff.', { date: today() }));
  saveTask(t);
  const st = loadState(root);
  if (st.active === t.id) { delete st.active; saveState(root, st); }
  refresh(root);
  out(tr('{id} is done.', { id: t.id }));
  afterClose(root, t);
  const unblocked = loadTasks(root).filter((o) => (o.blocked_by || []).includes(t.id) && OPEN_STATUSES.includes(o.status) && !isBlocked(o, byIdMap(loadTasks(root))));
  if (unblocked.length) out(tr('Now unblocked: {list}', { list: unblocked.map((o) => `${o.id} ${o.title}`).join('; ') }));
  const dec = path.join(t._dir, 'decisions.md');
  if (exists(dec) && hasContent(getSection(readText(dec), 'Entscheidungen'))) {
    out(tr('Note: decisions.md contains decisions. Offer to copy them into the Decision Log (second-brain-sync).'));
  }
}

// Abschluss in einem Rutsch (W-0026). Hält mit Exit 1 an, wenn etwas nicht stimmt.
async function cmdShip() {
  const root = requireRoot();
  const { ship, ShipStop } = await import('./ship.mjs');
  const id = pos[0] ? findTask(root, loadConfig(root), pos[0]).id : '';
  try {
    await ship(root, { id, push: !flags['no-push'], ci: !flags['no-ci'], update: !flags['no-update'], open: !flags['no-open'], log: out });
  } catch (e) {
    if (!(e instanceof ShipStop)) throw e;
    out(e.message);
    process.exit(1);
  }
}

function cmdDrop() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  if (!flags.reason) fail(tr('Reason missing (--reason "...").'));
  const old = t.status;
  t.status = 'verworfen';
  t.completed = today();
  addHistory(t, tr('Dropped (Status: {old} → verworfen). Reason: {reason}', { old, reason: flags.reason }));
  saveTask(t);
  const st = loadState(root);
  if (st.active === t.id) { delete st.active; saveState(root, st); }
  refresh(root);
  out(tr('{id} dropped.', { id: t.id }));
  afterClose(root, t);
}

function cmdReopen() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  if (!flags.reason) fail(tr('Reopening needs a reason (--reason "...").'));
  if (OPEN_STATUSES.includes(t.status)) fail(tr('{id} is already open.', { id: t.id }));
  const status = normValue('status', flags.status) || 'backlog';
  validateEnum('status', status, OPEN_STATUSES);
  if (t._archived) {
    const target = path.join(worksDir(root), 'tasks', path.basename(t._dir));
    fs.renameSync(t._dir, target);
    t._dir = target;
    t._file = path.join(target, 'task.md');
    t._archived = false;
  }
  const old = t.status;
  t.status = status;
  t.completed = null;
  t.reopened = (parseInt(t.reopened, 10) || 0) + 1;
  addHistory(t, tr('Reopened (Status: {old} → {status}). Reason: {reason}', { old, status, reason: flags.reason }));
  saveTask(t);
  refresh(root);
  out(tr('{id} reopened as {status}.', { id: t.id, status }));
}

function cmdArchive() {
  const root = requireRoot();
  const config = loadConfig(root);
  let list = loadTasks(root, { archive: false }).filter((t) => CLOSED_STATUSES.includes(t.status));
  if (pos.length) {
    const ids = pos.map((p) => normalizeId(config, p));
    list = list.filter((t) => ids.includes(t.id));
  } else if (!flags.all) {
    const days = parseInt(flags['older-than'] ?? 0, 10);
    list = list.filter((t) => daysBetween(String(t.completed || t.updated), today()) >= days);
  }
  if (!list.length) { out(tr('Nothing to archive.')); return; }
  for (const t of list) {
    const target = path.join(worksDir(root), 'archive', path.basename(t._dir));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(t._dir, target);
    out(tr('Archived: {id} {title}', { id: t.id, title: t.title }));
  }
  refresh(root);
}

// ---------- next / status / index ----------

// ---------- Warteschlange ----------

function cmdQueue() {
  const root = requireRoot();
  const config = loadConfig(root);
  const sub = pos.shift() || 'list';
  const tasks = loadTasks(root);
  const byId = byIdMap(tasks);
  let q = queueOf(config);
  const save = () => { config.queue = q; saveConfig(root, config); refresh(root); };
  const need = (raw) => {
    const id = normalizeId(config, raw);
    const t = byId.get(id);
    if (!t) fail(tr('Task {id} not found.', { id }));
    return t;
  };
  if (sub === 'add') {
    const t = need(pos.shift());
    if (!OPEN_STATUSES.includes(t.status)) fail(tr('{id} is {status} and cannot be queued.', { id: t.id, status: STATUS_LABEL[t.status] }));
    q = q.filter((x) => x !== t.id);
    const p = flags.pos && flags.pos !== true ? Math.max(1, parseInt(flags.pos, 10)) : q.length + 1;
    q.splice(p - 1, 0, t.id);
    save();
    out(tr('{id} is at position {n} in the queue.', { id: t.id, n: q.indexOf(t.id) + 1 }));
  } else if (sub === 'remove') {
    const id = normalizeId(config, pos.shift());
    q = q.filter((x) => x !== id);
    save();
    out(tr('{id} removed from the queue.', { id }));
  } else if (sub === 'move') {
    const t = need(pos.shift());
    const p = Math.max(1, parseInt(pos.shift(), 10) || 1);
    q = q.filter((x) => x !== t.id);
    q.splice(p - 1, 0, t.id);
    save();
    out(tr('{id} is now at position {n}.', { id: t.id, n: q.indexOf(t.id) + 1 }));
  } else if (sub === 'order') {
    const ids = listFlag(pos.join(',')).map((x) => normalizeId(config, x));
    for (const id of ids) if (!byId.has(id)) fail(tr('Task {id} not found.', { id }));
    q = [...new Set(ids)];
    save();
    out(tr('Queue with {n} task(s) saved.', { n: q.length }));
  } else if (sub === 'clear') {
    q = [];
    save();
    out(tr('Queue cleared.'));
  } else if (sub === 'set') {
    config.queue_settings = config.queue_settings || {};
    for (const pair of pos) {
      const [k, v] = pair.split('=');
      if (!['auto_next', 'skip_blocked', 'ask_before'].includes(k)) fail(tr('Unknown setting {key}. Allowed: auto_next, skip_blocked, ask_before', { key: k }));
      config.queue_settings[k] = ['true', '1', 'ja', 'an', 'yes', 'on'].includes(String(v).toLowerCase());
    }
    saveConfig(root, config);
    refresh(root);
    out(tr('Settings: {list}', { list: Object.entries(config.queue_settings).map(([k, v]) => `${k}=${v}`).join(', ') }));
  } else {
    pruneQueue(root, config, tasks);
    q = queueOf(config);
    if (flags.json) { out(JSON.stringify({ queue: q, settings: config.queue_settings }, null, 2)); return; }
    if (!q.length) { out(tr('The queue is empty. Add tasks with works queue add <ID>.')); return; }
    q.forEach((id, i) => {
      const t = byId.get(id);
      const hint = isBlocked(t, byId) ? tr(', blocked by {ids}', { ids: openBlockers(t, byId).join(', ') }) : '';
      out(`${String(i + 1).padStart(2)}. ${t.id} ${t.priority} ${STATUS_LABEL[t.status]}: ${t.title}${hint}`);
    });
    const s = config.queue_settings || {};
    const auto = (s.auto_next ? tr('yes') : tr('no')) + (s.auto_next && s.ask_before ? ' ' + tr('(ask first)') : '');
    out('\n' + tr('Continue automatically after closing: {auto}, skip blocked tasks: {skip}', { auto, skip: s.skip_blocked === false ? tr('no') : tr('yes') }));
  }
}

// Nach Abschluss oder Verwerfen: aus der Warteschlange nehmen und den nächsten Eintrag nennen.
function afterClose(root, t) {
  const config = loadConfig(root);
  const tasks = loadTasks(root);
  pruneQueue(root, config, tasks);
  const byId = byIdMap(tasks);
  const s = config.queue_settings || {};
  const next = queueOf(config).map((id) => byId.get(id)).find((x) => x && ['backlog', 'geplant'].includes(x.status) && (s.skip_blocked === false || !isBlocked(x, byId)));
  if (!next) return;
  out(tr('Next task in the queue: {id} {title}', { id: next.id, title: next.title }));
  if (s.auto_next) out(s.ask_before ? tr('Per settings, start {id} next, but ask the user briefly first.', { id: next.id }) : tr('Per settings, continue directly with works start {id}.', { id: next.id }));
}

function cmdNext() {
  const root = requireRoot();
  const n = parseInt(flags.n || 3, 10);
  const { active, candidates } = nextCandidates(root, n);
  if (active.length) {
    out(tr('Already in progress or in review:'));
    for (const t of sortTasks(active)) out(`  ${t.id} ${t.priority} ${STATUS_LABEL[t.status]}: ${t.title}`);
    out('');
  }
  if (!candidates.length) { out(tr('No startable tasks in the backlog.')); return; }
  out(tr('Recommended next task:'));
  candidates.forEach((c, i) => out(`  ${i + 1}. ${c.task.id} ${c.task.title}\n     ${c.reasons.join(', ')}`));
}

function cmdStatus() {
  const root = findRoot();
  if (!root) { out(tr('No .works folder in this project.')); return; }
  out(sessionSummary(root));
}

function cmdIndex() {
  const root = requireRoot();
  refresh(root);
  out(tr('WORKS.md updated: {file}', { file: path.join(worksDir(root), 'WORKS.md') }));
}

function serverUrl(info) {
  const h = !info.host || info.host === '0.0.0.0' || info.host === '::' ? '127.0.0.1' : info.host;
  return `http://${h}:${info.port}/`;
}

async function waitForServer(root, oldPid, ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const info = readServer(root);
    if (info && info.pid !== oldPid) return info;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

// Anzahl offener Board-Tabs auf diesem Rechner, null wenn der Server nicht antwortet.
async function boardTabs(info) {
  try {
    const r = await fetch(`http://127.0.0.1:${info.port}/tabs`, { signal: AbortSignal.timeout(1500) });
    return r.ok ? (await r.json()).tabs : null;
  } catch { return null; }
}

// --open ohne zweiten Tab: Ist das Board schon offen, nichts öffnen. wait: so lange auf Tabs warten, die sich nach
// einem Neustart von selbst wieder verbinden (der Event-Stream versucht es alle 2 s).
// Ist ein anderes Board offen, auch nicht: Dessen Tab wechselt von selbst zum Hub (W-0025).
async function openBoardOnce(info, wait = 0) {
  const others = () => runningBoards().filter((b) => b.port !== info.port);
  const count = async () => {
    const own = await boardTabs(info);
    if (own) return 'own';
    for (const b of others()) if (await boardTabs(b)) return 'other';
    return '';
  };
  const until = Date.now() + wait;
  let tabs = await count();
  while (!tabs && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 250));
    tabs = await count();
  }
  out(tabs === 'own' ? tr('The board is already open in a browser tab, no new tab.')
    : tabs ? tr('Another works board is already open in a browser tab, no new tab. That tab switches to the hub by itself.')
      : openInBrowser(serverUrl(info)));
}

function printShare(root, info) {
  if (!info || !['0.0.0.0', '::'].includes(info.host)) return;
  const links = shareLinks(root, info.port);
  if (!links.length) { out(tr('Shared on the network, but no network address found.')); return; }
  out(tr('Shared on the network. Link for viewing (read-only):'));
  for (const l of links) out(`  ${l.view}`);
  if (flags['owner-link']) { out(tr('Link with edit rights, do not pass it on:')); for (const l of links) out(`  ${l.edit}`); }
  out(tr('Stop sharing: works board --restart --private. Renew links: works share --rotate'));
}

function cmdShare() {
  const root = requireRoot();
  if (flags.rotate) { rotateKeys(root); out(tr('New links created. The old ones no longer work. Open shared tabs need the new link.')); }
  const info = readServer(root);
  if (!info) { out(tr('No live board running. Share with: works board --serve --detach --share')); return; }
  if (!['0.0.0.0', '::'].includes(info.host)) { out(tr('The board runs only locally ({url}). Share it on the network with: works board --restart --share', { url: serverUrl(info) })); return; }
  flags['owner-link'] = flags['owner-link'] || flags.owner;
  printShare(root, info);
}

function cmdExport() {
  const root = requireRoot();
  if (flags.json) {
    const d = exportBoard(root, {
      closed: !flags['open-only'], archive: !!flags.archive, comments: !flags['no-comments'], history: !flags['no-history'],
      checks: !!flags.checks, planning: !flags['no-planning'], knowledge: !flags['no-knowledge'], images: !!flags.images, designs: !!flags.designs,
    });
    const file = path.resolve(flags.out && flags.out !== true ? String(flags.out) : path.join(worksDir(root), 'reports', backupFileName(root)));
    writeJson(file, d);
    const kb = Math.max(1, Math.round(fs.statSync(file).size / 1024));
    out(d.tasks.length === 1 ? tr('Backup saved: {file} ({n} task, {kb} KB). Import it with works import <file>.', { file, n: 1, kb }) : tr('Backup saved: {file} ({n} tasks, {kb} KB). Import it with works import <file>.', { file, n: d.tasks.length, kb }));
    return;
  }
  const snap = buildSnapshot(root, { images: !flags['no-images'], closed: !flags['open-only'] });
  const file = path.resolve(flags.out && flags.out !== true ? String(flags.out) : path.join(worksDir(root), 'reports', snapshotName(root)));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, snap.html);
  out(tr('Snapshot saved: {file}', { file }));
  out(`${tr('{n} tasks, {mb} MB of images embedded', { n: snap.tasks, mb: (snap.imageBytes / 1024 / 1024).toFixed(1) })}${snap.skipped ? tr(', {n} image(s) too large or missing', { n: snap.skipped }) : ''}. ${tr('Opens without a server, view only.')}`);
}

async function cmdBoard() {
  const root = requireRoot();
  const current = cliVersion(newestCli());
  const info = readServer(root);
  const legacy = info ? [] : findServerProcesses(root);

  if (flags.status) {
    if (info) { out(tr('Live board running: {url} (PID {pid}, version {version}{state})', { url: serverUrl(info), pid: info.pid, version: info.version, state: info.version === current ? tr(', current') : tr(', outdated, current is {current}', { current }) })); printShare(root, info); }
    for (const p of legacy) out(tr('Board server of an older works version is running: PID {pid}{port}. Replace it with works board --restart.', { pid: p.pid, port: p.port ? tr(', port {port}', { port: p.port }) : '' }));
    if (!info && !legacy.length) out(tr('No live board running for this project.'));
    return;
  }
  if (flags.stop) {
    let n = 0;
    if (info && await stopProcess(info.pid)) { clearServer(root, info.pid); n++; }
    for (const p of legacy) if (await stopProcess(p.pid)) n++;
    out(n ? tr('{n} board server(s) stopped.', { n }) : tr('No live board running for this project.'));
    return;
  }

  if (flags.serve || flags.restart) {
    const host = flags.share ? '0.0.0.0' : flags.private ? '127.0.0.1' : flags.host && flags.host !== true ? String(flags.host) : (info && info.host) || '127.0.0.1';
    const hostChanged = info && info.host && info.host !== host;
    // Ohne --port: der Port des laufenden Servers, sonst der zuletzt genutzte (W-0031), sonst 4747. Nur --port ist fest.
    let port = parseInt(flags.port || (info && info.port) || (legacy[0] && legacy[0].port) || lastPort(root) || 4747, 10);
    // Läuft schon ein aktueller Server, keinen zweiten starten.
    if (info && info.version === current && !flags.restart && !flags.takeover && !hostChanged) {
      out(tr('Live board already running: {url}', { url: serverUrl(info) }));
      if (flags.open) await openBoardOnce(info);
      return;
    }
    // Veraltete oder alte Server dieses Projekts durch die aktuelle Version ersetzen.
    if (!flags.takeover) {
      if (info) { await stopProcess(info.pid); clearServer(root, info.pid); out(tr('Stopped the previous board server (version {version}).', { version: info.version })); }
      for (const p of legacy) { await stopProcess(p.pid); out(tr('Stopped the board server of an older works version (PID {pid}).', { pid: p.pid })); }
    }
    generateIndex(root);
    if (flags.detach || flags.restart) {
      // Fest ist der Port nur, wenn er vorgegeben ist oder ein Server dieses Projekts ihn schon hatte.
      // Sonst darf der Hintergrundprozess ausweichen, etwa wenn ein anderes Projekt 4747 belegt.
      const fixed = !!(flags.port || info || legacy.length);
      const pid = startDetached(root, { cli: newestCli(), port: fixed ? port : 0, host, takeover: !!(info || legacy.length) });
      const started = await waitForServer(root, info ? info.pid : null);
      if (!started) fail(tr('Board server does not start (PID {pid}). Details in .works/server.log', { pid }));
      out(tr('Live board running: {url}', { url: serverUrl(started) }));
      printShare(root, started);
      out(tr('Keeps running in the background. Stop it with works board --stop.'));
      if (flags.open) await openBoardOnce(started, 3000);
      return;
    }
    // Discord-Bot startet mit dem Board, wenn er eingerichtet ist (W-0036). Einer je Rechner, ein zweiter Start tut nichts.
    try { const { ensureBot } = await import('./discord.mjs'); await ensureBot(); } catch { /* Board läuft auch ohne Bot */ }
    serveBoard(root, {
      port, host, open: !!flags.open,
      fixedPort: !!flags.port || !!flags.takeover || !!info || legacy.length > 0,
      takeover: !!flags.takeover || !!info || legacy.length > 0,
    });
    return new Promise(() => {}); // läuft bis Strg+C
  }
  const file = generateBoard(root);
  out(tr('Board created: {file}', { file }));
  if (flags.open) out(openInBrowser(file));
}

// ---------- Demo ----------

async function cmdDemo() {
  const root = path.resolve(flags.path && flags.path !== true ? String(flags.path) : defaultDemoPath());
  const marker = path.join(root, '.works', '.demo');
  const wd = path.join(root, '.works');
  const isDemo = exists(marker);
  const sub = (args) => run(process.execPath, [path.join(SKILL_DIR, 'scripts', 'works.mjs'), ...args], { cwd: root, encoding: 'utf8' });

  if (flags.remove) {
    if (!isDemo) fail(tr('{dir} is not a demo project, nothing removed.', { dir: root }));
    sub(['board', '--stop']);
    fs.rmSync(root, { recursive: true, force: true });
    out(tr('Demo removed: {dir}', { dir: root }));
    return;
  }
  // Niemals ein echtes Projekt überschreiben.
  if (exists(wd) && !isDemo) fail(tr('{dir} already contains a real .works. Choose another folder for the demo with --path.', { dir: root }));
  if (exists(root) && !exists(wd) && fs.readdirSync(root).length && flags.path) fail(tr('{dir} is not empty. Choose an empty or new folder for the demo.', { dir: root }));

  if (isDemo) sub(['board', '--stop']);
  out(tr('Creating sample project: {dir}', { dir: root }));
  const tasks = seedDemo(root);
  fs.writeFileSync(path.join(root, '.works', '.demo'), tr('Created by works demo. Remove it with works demo --remove.') + '\n');
  const args = ['board', '--serve', '--detach'];
  if (flags.port && flags.port !== true) args.push(`--port=${flags.port}`);
  if (flags.open) args.push('--open');
  const r = sub(args);
  if (!r.ok) fail(tr('Board does not start: {msg}', { msg: (r.stderr || r.stdout).trim() }));
  out(r.stdout.trim().split('\n')[0]);
  out(tr('{n} tasks, 2 milestones and 3 ideas are created. Try everything out in the board.', { n: Object.keys(tasks).length }));
  if (flags.simulate) {
    const delay = Math.max(2, parseInt(flags.delay || 6, 10)) * 1000;
    out('\n' + tr('Now playing a change every {s} seconds, the way Claude makes them. Watch the board:', { s: delay / 1000 }));
    await simulate(root, tasks, { delay, log: out });
    out('\n' + tr('Demo run finished. The board keeps running.'));
  }
  out(tr('Stop: works board --stop in the folder {dir}, or remove everything with works demo --remove', { dir: root }));
}

// ---------- doctor ----------

function cmdDoctor() {
  const root = requireRoot();
  const config = loadConfig(root);
  const errors = [];
  const warnings = [];
  const fixes = [];
  const all = loadTasks(root);
  const byId = new Map();
  const gi = path.join(worksDir(root), '.gitignore');
  const assetsIgnored = exists(gi) && /assets\//.test(fs.readFileSync(gi, 'utf8'));
  const missing = assetsIgnored ? warnings : errors;
  for (const t of all) {
    const where = relFromWorks(root, t._file);
    if (!t._valid) { errors.push(tr('{where}: frontmatter missing or invalid', { where })); continue; }
    for (const f of ['id', 'title', 'type', 'priority', 'status', 'created']) if (!t[f]) errors.push(tr('{where}: required field {field} missing', { where, field: f }));
    if (t.type && !TYPES.includes(t.type)) errors.push(tr('{where}: invalid type {value}', { where, value: t.type }));
    if (t.priority && !PRIORITIES.includes(t.priority)) errors.push(tr('{where}: invalid priority {value}', { where, value: t.priority }));
    if (t.status && !STATUSES.includes(t.status)) errors.push(tr('{where}: invalid status {value}', { where, value: t.status }));
    if (t.effort && !EFFORTS.includes(t.effort)) errors.push(tr('{where}: invalid effort {value}', { where, value: t.effort }));
    if (t.risk && !RISKS.includes(t.risk)) errors.push(tr('{where}: invalid risk {value}', { where, value: t.risk }));
    for (const f of ['created', 'updated', 'due', 'completed']) if (t[f] && !/^\d{4}-\d{2}-\d{2}$/.test(String(t[f]))) errors.push(tr('{where}: {field} is not in the date format YYYY-MM-DD', { where, field: f }));
    if (t.id && !path.basename(t._dir).startsWith(t.id + '-')) errors.push(tr('{where}: folder name does not match the ID {id}', { where, id: t.id }));
    if (t.id && byId.has(t.id)) errors.push(tr('{where}: duplicate ID {id}', { where, id: t.id }));
    byId.set(t.id, t);
    if (t._archived && OPEN_STATUSES.includes(t.status)) errors.push(tr('{where}: open task is in the archive (use works reopen)', { where }));
    if (!t.effort && OPEN_STATUSES.includes(t.status)) warnings.push(tr('{id}: no effort set', { id: t.id }));
    if (t.milestone && !(config.milestones || []).some((m) => m.id === t.milestone)) warnings.push(tr('{id}: milestone {milestone} not defined', { id: t.id, milestone: t.milestone }));
  }
  for (const t of all) {
    if (!t._valid) continue;
    for (const f of ['blocked_by', 'blocks', 'related']) for (const ref of t[f] || []) if (!byId.has(ref)) errors.push(tr('{id}: {field} refers to unknown task {ref}', { id: t.id, field: f, ref }));
    for (const b of t.blocks || []) {
      const o = byId.get(b);
      if (o && !(o.blocked_by || []).includes(t.id)) {
        if (flags.fix) { o.blocked_by.push(t.id); saveTask(o, { touch: false }); fixes.push(tr('{id}: added {ref} to blocked_by', { id: o.id, ref: t.id })); }
        else warnings.push(tr('{id} blocks {other}, but {other} does not list {id} in blocked_by', { id: t.id, other: b }));
      }
    }
    for (const b of t.blocked_by || []) {
      const o = byId.get(b);
      if (o && !(o.blocks || []).includes(t.id)) {
        if (flags.fix) { o.blocks.push(t.id); saveTask(o, { touch: false }); fixes.push(tr('{id}: added {ref} to blocks', { id: o.id, ref: t.id })); }
        else warnings.push(tr('{id} waits for {other}, but {other} does not list {id} in blocks', { id: t.id, other: b }));
      }
    }
    // Inhalte
    const open = OPEN_STATUSES.includes(t.status);
    const crit = checkboxes(getSection(t._body, 'Akzeptanzkriterien') || '');
    if (open && ['feature', 'bug', 'design', 'refactor', 'debt'].includes(t.type) && crit.total === 0 && !t.incomplete) warnings.push(tr('{id}: no acceptance criteria', { id: t.id }));
    if (t.status === 'erledigt' && crit.done < crit.total) warnings.push(tr('{id}: done, but {n} acceptance criteria open', { id: t.id, n: crit.total - crit.done }));
    if (t.status === 'in-arbeit') {
      const h = getSection(t._body, 'Übergabe');
      const stale = daysBetween(String(t.updated || t.created), today()) > (config.handoff_stale_days || 3);
      if (!hasContent(h)) warnings.push(tr('{id}: in progress without a handoff note', { id: t.id }));
      else if (stale) warnings.push(tr('{id}: in progress, not updated since {date}', { id: t.id, date: t.updated }));
    }
    if (t.incomplete && open) warnings.push(tr('{id}: marked as incomplete', { id: t.id }));
    // Bilder
    const texts = [readText(t._file)];
    const dec = path.join(t._dir, 'decisions.md');
    if (exists(dec)) texts.push(readText(dec));
    const referenced = new Set();
    for (const txt of texts) {
      for (const img of imageLinks(txt)) {
        if (/^https?:/.test(img.src)) continue;
        const abs = path.resolve(t._dir, img.src);
        referenced.add(path.normalize(abs));
        if (!exists(abs)) missing.push(tr('{id}: image missing: {src}', { id: t.id, src: img.src }));
        if (!img.alt.trim()) warnings.push(tr('{id}: image without alt text: {src}', { id: t.id, src: img.src }));
      }
      const linkRe = /(?<!!)\[[^\]]*\]\((assets\/[^)\s]+)\)/g;
      let m;
      while ((m = linkRe.exec(txt))) {
        const abs = path.resolve(t._dir, decodeURI(m[1]));
        referenced.add(path.normalize(abs));
        if (!exists(abs)) missing.push(tr('{id}: linked file missing: {src}', { id: t.id, src: m[1] }));
      }
    }
    const adir = path.join(t._dir, 'assets');
    if (exists(adir)) {
      for (const f of fs.readdirSync(adir)) {
        if (f.startsWith('.')) continue;
        if (!referenced.has(path.normalize(path.join(adir, f)))) warnings.push(tr('{id}: asset not referenced: assets/{file}', { id: t.id, file: f }));
      }
    }
    const assetSec = getSection(t._body, 'Assets') || '';
    const lines = assetSec.split('\n');
    lines.forEach((l, i) => {
      if (/^!\[/.test(l.trim()) && !/^(Beschreibung|Description):/i.test((lines[i + 1] || '').trim())) warnings.push(tr('{id}: image without a description line: {line}', { id: t.id, line: l.trim().slice(0, 60) }));
    });
  }
  if (hasCycle(all.filter((t) => t._valid))) errors.push(tr('Circular dependency found in blocked_by'));
  // Beschreibung im falschen Abschnitt oder fehlende Vorlagenabschnitte
  for (const r of repairTasks(root, { dryRun: !flags.fix })) {
    const moved = r.moved ? (flags.fix ? tr('Description taken from {section}', { section: r.moved }) : tr('Description is in {section}', { section: r.moved })) : null;
    const what = [moved, r.added.length ? tr('missing sections: {list}', { list: r.added.join(', ') }) : null].filter(Boolean).join(', ');
    if (flags.fix) fixes.push(`${r.id}: ${what}`);
    else warnings.push(tr('{id}: {what} (works doctor --fix repairs this)', { id: r.id, what }));
  }
  const maxId = Math.max(0, ...all.map((t) => idNumber(t.id)).filter((n) => !Number.isNaN(n)));
  if ((config.next_id || 1) <= maxId) {
    if (flags.fix) { config.next_id = maxId + 1; saveConfig(root, config); fixes.push(tr('next_id set to {n}', { n: maxId + 1 })); }
    else errors.push(tr('config.next_id ({next}) is not greater than the highest ID ({max})', { next: config.next_id, max: maxId }));
  }
  const inbox = path.join(worksDir(root), 'inbox');
  if (exists(inbox)) {
    const files = fs.readdirSync(inbox).filter((f) => !f.startsWith('.'));
    if (files.length) warnings.push(tr('Inbox contains {n} unassigned file(s): {list}', { n: files.length, list: files.join(', ') }));
  }
  const state = loadState(root);
  if (state.active && !byId.has(state.active)) {
    if (flags.fix) { delete state.active; saveState(root, state); fixes.push(tr('removed invalid active task from state.json')); }
    else warnings.push(tr('state.json refers to unknown active task {id}', { id: state.active }));
  }
  refresh(root);
  if (!flags.quiet || errors.length) {
    for (const f of fixes) out(tr('Fixed: {fix}', { fix: f }));
    for (const e of errors) out(`${tr('ERROR').padEnd(9)}${e}`);
    if (!flags.quiet) for (const w of warnings) out(`${tr('WARNING').padEnd(9)}${w}`);
    out('\n' + tr('{errors} error(s), {warnings} warning(s)', { errors: errors.length, warnings: warnings.length }) + (fixes.length ? tr(', {n} fixed', { n: fixes.length }) : '') + '. ' + tr('WORKS.md regenerated.'));
  }
  if (errors.length || (flags.strict && warnings.length)) process.exit(1);
}

// ---------- Assets ----------

function uniquePath(dir, base, ext) {
  let p = path.join(dir, base + ext);
  let i = 2;
  while (exists(p)) p = path.join(dir, `${base}-${i++}${ext}`);
  return p;
}

function loadSharp(root) {
  for (const base of [root, SKILL_DIR, process.cwd()]) {
    try {
      const req = createRequire(path.join(base, 'package.json'));
      return req('sharp');
    } catch { /* weiter */ }
  }
  return null;
}

async function compressFile(sharp, file, config) {
  const ext = path.extname(file).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return null;
  const before = fs.statSync(file).size;
  let img = sharp(fs.readFileSync(file));
  const meta = await img.metadata();
  if (meta.width && meta.width > config.assets.max_width) img = img.resize({ width: config.assets.max_width });
  if (ext === '.png') img = img.png({ compressionLevel: 9, palette: true, quality: config.assets.quality });
  else if (ext === '.webp') img = img.webp({ quality: config.assets.quality });
  else img = img.jpeg({ quality: config.assets.quality, mozjpeg: true });
  const buf = await img.toBuffer();
  if (buf.length < before) { fs.writeFileSync(file, buf); return { before, after: buf.length }; }
  return { before, after: before };
}

async function cmdAsset() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  let src = pos[1];
  if (!src) fail(tr('Source file missing. Usage: works asset <ID> <path> --desc "..." [--kind before]'));
  if (!exists(src)) {
    const inInbox = path.join(worksDir(root), 'inbox', src);
    if (exists(inInbox)) src = inInbox; else fail(tr('File not found: {file}', { file: src }));
  }
  const fromInbox = path.resolve(src).startsWith(path.join(worksDir(root), 'inbox'));
  const kind = flags.kind && flags.kind !== true ? normValue('kind', String(flags.kind)) : null;
  if (kind && !ASSET_KINDS.includes(kind)) warn(tr('Unusual kind "{kind}". Usual: {list}', { kind, list: ASSET_KINDS.join(', ') }));
  const desc = flags.desc && flags.desc !== true ? String(flags.desc) : '';
  if (!desc) warn(tr('Without --desc the text description is missing. Later sessions then have to load the image.'));
  // Bildtext und Zeilen unter dem Bild in der Sprache der Aufgabe (api.mjs liest sie).
  const lang = bodyLang(t._body);
  const alt = flags.alt && flags.alt !== true ? String(flags.alt) : (desc.split(/[.!?]/)[0].slice(0, 80) || (kind ? tr('Image ({kind})', { kind }, lang) : tr('Image without description', null, lang)));
  const ext = path.extname(src).toLowerCase();
  const name = flags.name && flags.name !== true ? slugify(flags.name, 50) : slugify(alt, 40);
  const adir = path.join(t._dir, 'assets');
  fs.mkdirSync(adir, { recursive: true });
  const target = uniquePath(adir, `${today()}-${name}${kind ? `-${kind}` : ''}`, ext);
  if (flags.move || fromInbox) fs.renameSync(src, target); else fs.copyFileSync(src, target);
  let note = '';
  if (flags.compress || config.assets.compress_on_add) {
    const sharp = loadSharp(root);
    if (sharp) { const r = await compressFile(sharp, target, config); if (r) note = ` (${Math.round(r.before / 1024)} KB → ${Math.round(r.after / 1024)} KB)`; }
    else warn(tr('sharp not found, the image was not compressed. Install: npm i -D sharp'));
  }
  const rel = `assets/${path.basename(target)}`;
  const isImage = IMAGE_EXT.includes(ext);
  const block = [isImage ? `![${alt}](${encodeURI(rel)})` : `[${alt}](${encodeURI(rel)})`];
  if (desc) block.push(tr('Description: {desc}', { desc }, lang));
  const meta = [kind ? tr('Kind: {kind}', { kind }, lang) : null, tr('Added: {date}', { date: today() }, lang), flags.origin ? tr('Source: {origin}', { origin: flags.origin }, lang) : null].filter(Boolean).join(' · ');
  block.push(meta);
  const sec = stripComments(getSection(t._body, 'Assets') || '').trim();
  t._body = setSection(t._body, 'Assets', (sec ? sec + '\n\n' : '') + block.join('\n'));
  addHistory(t, kind ? tr('Asset added: {file} ({kind})', { file: rel, kind }) : tr('Asset added: {file}', { file: rel }));
  saveTask(t);
  refresh(root);
  out(tr('Saved: {file}{note}', { file: target, note }));
  out(`Markdown: ${block[0]}`);
}

function cmdInbox() {
  const root = requireRoot();
  const dir = path.join(worksDir(root), 'inbox');
  const files = exists(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')) : [];
  if (flags.json) { out(JSON.stringify(files.map((f) => ({ name: f, path: path.join(dir, f), size: fs.statSync(path.join(dir, f)).size })), null, 2)); return; }
  if (!files.length) { out(tr('Inbox is empty.')); return; }
  out(`Inbox (${dir}):`);
  for (const f of files) {
    const st = fs.statSync(path.join(dir, f));
    out(`  ${f}  ${Math.round(st.size / 1024)} KB  ${st.mtime.toLocaleString('de-DE')}`);
  }
  out(tr('\nAssign with: works asset <ID> <file name> --desc "..." [--kind ...]'));
}

async function cmdCompress() {
  const root = requireRoot();
  const config = loadConfig(root);
  const sharp = loadSharp(root);
  if (!sharp) fail(tr('sharp is not installed. Run `npm i -D sharp` in the project.'));
  const tasks = pos[0] ? [findTask(root, config, pos[0])] : loadTasks(root);
  let total = 0; let saved = 0;
  for (const t of tasks) {
    const adir = path.join(t._dir, 'assets');
    if (!exists(adir)) continue;
    for (const f of fs.readdirSync(adir)) {
      const r = await compressFile(sharp, path.join(adir, f), config);
      if (r) { total++; saved += r.before - r.after; }
    }
  }
  out(tr('{n} images checked, {kb} KB saved.', { n: total, kb: Math.round(saved / 1024) }));
}

// ---------- Entscheidungen / Dokumente ----------

function createDecisions(root, t) {
  const file = path.join(t._dir, 'decisions.md');
  if (!exists(file)) {
    const lang = bodyLang(t._body);
    fs.writeFileSync(file, fillTemplate(readTemplate('decisions.md', lang), { id: t.id, title: t.title, date: today() }));
    const sec = stripComments(getSection(t._body, 'Designentscheidungen') || '').trim();
    if (!sec.includes('decisions.md')) {
      t._body = setSection(t._body, 'Designentscheidungen', `${sec ? sec + '\n\n' : ''}${tr('Details and rejected alternatives: [decisions.md](decisions.md)', null, lang)}`);
    }
    addHistory(t, tr('decisions.md created'));
    saveTask(t, { touch: false });
  }
  return file;
}

function cmdDecisions() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  const file = createDecisions(root, t);
  if (flags.add) {
    let txt = readText(file);
    const n = (stripComments(txt).match(/^### E(\d+)/gm) || []).length + 1;
    // Feldnamen in der Sprache von decisions.md.
    const lang = bodyLang(txt);
    const entry = [
      `### E${n}: ${flags.add}`,
      tr('- Date: {date}', { date: today() }, lang),
      tr('- Source: {source}', { source: flags.source || tr('Conversation', null, lang) }, lang),
      tr('- Context: {context}', { context: flags.context || '' }, lang),
      tr('- Decision: {decision}', { decision: flags.decision || '' }, lang),
      tr('- Rationale: {why}', { why: flags.why || '' }, lang),
      tr('- Rejected alternatives:', null, lang),
      ...listFlag(flags.rejected).map((r) => `  - ${r}`),
      tr('- Consequences: {consequences}', { consequences: flags.consequences || '' }, lang),
    ].map((l) => l.trimEnd()).join('\n');
    const sec = stripComments(getSection(txt, 'Entscheidungen') || '').trim();
    txt = setSection(txt, 'Entscheidungen', (sec ? sec + '\n\n' : '') + entry);
    fs.writeFileSync(file, txt);
    addHistory(t, tr('Decision E{n} documented: {title}', { n, title: flags.add }));
    saveTask(t);
    refresh(root);
    out(tr('E{n} added to {file}.', { n, file }));
    return;
  }
  refresh(root);
  out(file);
}

function cmdAttachDoc() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  const src = pos[1];
  if (!src || !exists(src)) fail(tr('Document not found. Usage: works attach-doc <ID> <path> [--mode link|copy|move] [--label "..."]'));
  const mode = flags.mode || config.brainstorm.mode || 'link';
  if (!['link', 'copy', 'move'].includes(mode)) fail(tr('--mode must be link, copy or move.'));
  const decFile = createDecisions(root, t);
  let target = path.resolve(src);
  if (mode !== 'link') {
    const ddir = path.join(t._dir, 'docs');
    fs.mkdirSync(ddir, { recursive: true });
    target = uniquePath(ddir, path.basename(src, path.extname(src)), path.extname(src));
    if (mode === 'move') fs.renameSync(src, target); else fs.copyFileSync(src, target);
  }
  const rel = path.relative(t._dir, target).split(path.sep).join('/');
  const label = flags.label && flags.label !== true ? flags.label : path.basename(src);
  let txt = readText(decFile);
  const lang = bodyLang(txt);
  const date = today();
  const how = mode === 'link' ? tr('linked on {date}', { date }, lang) : mode === 'copy' ? tr('copied on {date}', { date }, lang) : tr('moved on {date}', { date }, lang);
  const sec = stripComments(getSection(txt, 'Quellen') || '').trim();
  txt = setSection(txt, 'Quellen', (sec ? sec + '\n' : '') + `- [${label}](${encodeURI(rel)}) (${how})`);
  fs.writeFileSync(decFile, txt);
  addHistory(t, mode === 'link' ? tr('Document linked: {label}', { label }) : tr('Document added: {label}', { label }));
  saveTask(t);
  refresh(root);
  out(tr('{label} attached to {id} ({mode}). Now write the summary in decisions.md under "Brainstorm summary" or "Decisions".', { label, id: t.id, mode }));
}

// ---------- Ideen ----------

function ideasFile(root) { return path.join(worksDir(root), 'ideas.md'); }

function cmdIdea() {
  const root = requireRoot();
  const config = loadConfig(root);
  const text = flags.text || pos.join(' ');
  if (!text) fail(tr('Text missing.'));
  const id = `I-${String(config.next_idea_id || 1).padStart(3, '0')}`;
  config.next_idea_id = (config.next_idea_id || 1) + 1;
  saveConfig(root, config);
  const tags = listFlag(flags.tags).map((x) => `#${x}`).join(' ');
  fs.appendFileSync(ideasFile(root), `- [${id}] ${today()}: ${text}${tags ? ' ' + tags : ''}\n`);
  refresh(root);
  out(tr('Idea {id} noted.', { id }));
}

function cmdIdeas() {
  const root = requireRoot();
  const lines = readText(ideasFile(root)).split('\n').filter((l) => /^- \[I-\d+\]/.test(l));
  const open = lines.filter((l) => !l.includes('~~'));
  out(open.length ? open.join('\n') : tr('No open ideas.'));
}

function cmdIdeaDrop() {
  const root = requireRoot();
  const iid = String(pos[0] || '').toUpperCase();
  const file = ideasFile(root);
  const lines = readText(file).split('\n');
  const idx = lines.findIndex((l) => l.startsWith(`- [${iid}]`));
  if (idx === -1) fail(tr('Idea {id} not found.', { id: iid }));
  lines[idx] = `- ~~${lines[idx].slice(2)}~~ ${tr('dropped')}${flags.reason && flags.reason !== true ? `: ${flags.reason}` : ''}`;
  fs.writeFileSync(file, lines.join('\n'));
  refresh(root);
  out(tr('Idea {id} dropped.', { id: iid }));
}

function cmdPromote() {
  const root = requireRoot();
  const config = loadConfig(root);
  const iid = String(pos[0] || '').toUpperCase();
  const file = ideasFile(root);
  const lines = readText(file).split('\n');
  const idx = lines.findIndex((l) => l.startsWith(`- [${iid}]`));
  if (idx === -1) fail(tr('Idea {id} not found.', { id: iid }));
  if (lines[idx].includes('~~')) fail(tr('Idea {id} has already been promoted.', { id: iid }));
  const m = lines[idx].match(/^- \[I-\d+\] (\d{4}-\d{2}-\d{2}): (.*)$/);
  const raw = m ? m[2] : lines[idx];
  const tags = [...raw.matchAll(/#([\w-]+)/g)].map((x) => x[1]);
  const text = raw.replace(/#[\w-]+/g, '').trim();
  const task = createTask(root, config, {
    ...flags, title: flags.title || text, tags: [...tags, ...listFlag(flags.tags)].join(','),
    source: `idee:${iid}`, incomplete: true, context: tr('From idea {iid} of {date}: {text}', { iid, date: m ? m[1] : tr('unknown'), text }),
  });
  lines[idx] = `- ~~[${iid}] ${m ? m[1] + ': ' : ''}${raw}~~ ${tr('promoted as {id}', { id: task.id })}`;
  fs.writeFileSync(file, lines.join('\n'));
  refresh(root);
  out(tr('Idea {iid} promoted as {id}: {file}', { iid, id: task.id, file: task._file }));
}

// ---------- Meilensteine ----------

function cmdMilestone() {
  const root = requireRoot();
  const config = loadConfig(root);
  const sub = pos.shift() || 'list';
  config.milestones = config.milestones || [];
  if (sub === 'add') {
    const id = String(pos.shift() || '').toUpperCase();
    if (!/^M\d+$/.test(id)) fail(tr('Give the milestone ID in the format M1, M2 ...'));
    if (config.milestones.some((m) => m.id === id)) fail(tr('{id} already exists.', { id }));
    config.milestones.push({ id, title: flags.title || pos.join(' ') || id, due: flags.due || null, description: flags.desc || '', status: 'offen' });
    saveConfig(root, config);
    refresh(root);
    out(tr('Milestone {id} created.', { id }));
  } else if (sub === 'set') {
    const id = String(pos.shift() || '').toUpperCase();
    const m = config.milestones.find((x) => x.id === id);
    if (!m) fail(tr('{id} not found.', { id }));
    for (const pair of pos) { const [k, ...v] = pair.split('='); m[k] = (k === 'status' ? normValue('status', v.join('=')) : v.join('=')) || null; }
    saveConfig(root, config);
    refresh(root);
    out(tr('Milestone {id} updated.', { id }));
  } else {
    const prog = milestoneProgress(config, loadTasks(root));
    if (!prog.length) { out(tr('No milestones defined.')); return; }
    for (const m of prog) out(`${m.id}  ${m.title}  ${m.due ? `${tr('due {date}', { date: m.due })}  ` : ''}${m.status || 'offen'}  ${m.done}/${m.total} (${m.pct} %)`);
  }
}

// ---------- Code-Scan ----------

function listProjectFiles(root, config) {
  const git = run('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  const ignore = new Set(config.scan.ignore);
  if (git.ok) {
    return git.stdout.split('\n').filter(Boolean).filter((f) => !f.split('/').some((p) => ignore.has(p)));
  }
  const res = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignore.has(e.name) || e.name.startsWith('.') && e.isDirectory()) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else res.push(path.relative(root, p).split(path.sep).join('/'));
    }
  };
  walk(root);
  return res;
}

function cmdScan() {
  const root = requireRoot();
  const config = loadConfig(root);
  const markers = config.scan.markers;
  const re = new RegExp(`(?:\\/\\/|#|\\/\\*+|\\*|<!--|--|;|%|\\{\\/\\*)\\s*(${markers.join('|')})\\b\\s*(?:\\(([^)]*)\\))?\\s*[:\\-]?\\s*(.*)$`);
  const existing = new Set(loadTasks(root).map((t) => String(t.source || '')));
  const found = [];
  for (const rel of listProjectFiles(root, config)) {
    const abs = path.join(root, rel);
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    if (!st.isFile() || st.size > 1024 * 1024) continue;
    const buf = fs.readFileSync(abs);
    if (buf.subarray(0, 8000).includes(0)) continue;
    const lines = buf.toString('utf8').split('\n');
    lines.forEach((line, i) => {
      const m = line.match(re);
      if (!m) return;
      const text = m[3].replace(/\*\/\s*$|-->\s*$|\*\}\s*$/, '').trim();
      const hash = crypto.createHash('sha1').update(`${rel}|${m[1]}|${text}`).digest('hex').slice(0, 8);
      const source = `todo:${rel}#${hash}`;
      found.push({ file: rel, line: i + 1, marker: m[1], author: m[2] || null, text, source, known: existing.has(source),
        snippet: lines.slice(Math.max(0, i - 2), i + 3).join('\n') });
    });
  }
  const fresh = found.filter((f) => !f.known);
  if (flags.json) { out(JSON.stringify(found, null, 2)); return; }
  if (!found.length) { out(tr('No markers found.')); return; }
  const mapping = { FIXME: ['bug', 'P2'], XXX: ['bug', 'P2'], HACK: ['debt', 'P3'], TODO: ['chore', 'P3'] };
  if (!flags.create) {
    for (const f of found) out(`${(f.known ? tr('known') : tr('new')).padEnd(7)}  ${f.marker.padEnd(5)} ${f.file}:${f.line}  ${f.text}`);
    out(tr('\n{n} markers, {fresh} of them without a task. --create turns them into tasks (filter: --marker FIXME,HACK).', { n: found.length, fresh: fresh.length }));
    return;
  }
  const only = listFlag(flags.marker).map((x) => x.toUpperCase());
  let created = 0;
  for (const f of fresh) {
    if (only.length && !only.includes(f.marker)) continue;
    const [type, priority] = mapping[f.marker] || ['chore', 'P3'];
    const ext = path.extname(f.file).slice(1);
    const task = createTask(root, config, {
      type, priority, title: f.text ? f.text.slice(0, 80) : `${f.marker} in ${f.file}`,
      source: f.source, incomplete: true, tags: 'code-scan',
      context: `${f.marker} in \`${f.file}:${f.line}\`${f.author ? tr(' (by {author})', { author: f.author }) : ''}\n\n\`\`\`${ext}\n${f.snippet}\n\`\`\``,
    });
    created++;
    out(tr('Created: {id} {title}', { id: task.id, title: task.title }));
  }
  refresh(root);
  out(tr('{n} task(s) created from code markers.', { n: created }));
}

// ---------- GitHub ----------

function matchLabel(labels, map, fallback) {
  const lower = labels.map((l) => l.toLowerCase());
  for (const [key, names] of Object.entries(map)) if (names.some((n) => lower.includes(n.toLowerCase()))) return key;
  return fallback;
}

function cmdGhImport() {
  const root = requireRoot();
  const config = loadConfig(root);
  let issues;
  if (flags['from-json']) issues = readJson(String(flags['from-json']), []);
  else {
    const r = run('gh', ['issue', 'list', '--state', flags.state || 'open', '--limit', String(flags.limit || 100), '--json', 'number,title,body,labels,url,state'], { cwd: root });
    if (!r.ok) fail(tr('gh issue list failed: {err}', { err: (r.stderr || r.error?.message || '').trim() }));
    issues = JSON.parse(r.stdout || '[]');
  }
  const known = new Set(loadTasks(root).map((t) => String(t.source || '')));
  let n = 0;
  for (const is of issues) {
    const source = `github#${is.number}`;
    if (known.has(source)) continue;
    const labels = (is.labels || []).map((l) => l.name || l);
    const type = matchLabel(labels, config.github.label_type, 'feature');
    const priority = matchLabel(labels, config.github.label_priority, 'P3');
    if (flags['dry-run']) { out(tr('would create: #{num} {title} ({type}, {priority})', { num: is.number, title: is.title, type, priority })); n++; continue; }
    const body = (is.body || '').trim();
    const task = createTask(root, config, {
      type, priority, title: is.title, source, incomplete: true, tags: ['github', ...labels.map((l) => slugify(l, 20))].join(','),
      context: `GitHub Issue [#${is.number}](${is.url || ''})${labels.length ? `, Labels: ${labels.join(', ')}` : ''}\n\n${body ? body.split('\n').map((l) => `> ${l}`).join('\n') : tr('_No description._')}`,
    });
    out(tr('Created: {id} from #{num} {title}', { id: task.id, num: is.number, title: is.title }));
    n++;
  }
  if (!flags['dry-run']) refresh(root);
  out(flags['dry-run'] ? tr('{n} issue(s) would be imported.', { n }) : tr('{n} issue(s) imported.', { n }));
}

function cmdGhExport() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  if (String(t.source || '').startsWith('github#') || t.issue) fail(tr('{id} is already linked to an issue ({ref}).', { id: t.id, ref: t.source || t.issue }));
  const parts = [];
  for (const s of ['Ziel', 'Zusammenfassung', 'Kontext und Problem', 'Akzeptanzkriterien']) {
    const c = getSection(t._body, s);
    if (hasContent(c)) parts.push(`## ${sectionTitle(s, t._body)}\n${stripComments(c).trim()}`);
  }
  parts.push(tr('_Managed in .works as {id}, priority {priority} {label}._', { id: t.id, priority: t.priority, label: PRIO_LABEL[t.priority] }));
  const args = ['issue', 'create', '--title', `[${t.id}] ${t.title}`, '--body', parts.join('\n\n')];
  if (flags['dry-run']) { out(`gh ${args.slice(0, 4).join(' ')} ...\n\n${parts.join('\n\n')}`); return; }
  const r = run('gh', args, { cwd: root });
  if (!r.ok) fail(tr('gh issue create failed: {err}', { err: r.stderr.trim() }));
  const url = r.stdout.trim().split('\n').pop();
  const num = (url.match(/\/(\d+)$/) || [])[1];
  t.issue = num ? `github#${num}` : url;
  addHistory(t, tr('Exported as GitHub issue: {url}', { url }));
  saveTask(t);
  refresh(root);
  out(tr('Issue created: {url}', { url }));
}

// ---------- Git-Verlauf, Changelog, Report ----------

function cmdCommits() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  const r = run('git', ['log', '--all', '--date=short', '--format=%h %ad %s', `--grep=${t.id}`], { cwd: root });
  if (!r.ok) fail(tr('git log failed: {err}', { err: r.stderr.trim() }));
  const lines = r.stdout.trim();
  out(lines || tr('No commits with {id} found. Commit messages should contain the ID, e.g. "feat({id}): ..."', { id: t.id }));
  if (flags.write && lines) {
    t._body = setSection(t._body, 'Commits', lines.split('\n').map((l) => `- ${l}`).join('\n'));
    saveTask(t, { touch: false });
    refresh(root);
  }
}

const changelogGroups = () => [
  [tr('Added'), ['feature', 'design']],
  [tr('Fixed'), ['bug']],
  [tr('Improved'), ['refactor', 'debt']],
  [tr('Other'), ['chore', 'spike']],
];

function cmdChangelog() {
  const root = requireRoot();
  let list = loadTasks(root).filter((t) => t.status === 'erledigt');
  if (flags.since) list = list.filter((t) => String(t.completed || t.updated) >= String(flags.since));
  if (flags.until) list = list.filter((t) => String(t.completed || t.updated) <= String(flags.until));
  if (flags.milestone) list = list.filter((t) => t.milestone === flags.milestone);
  if (!flags['include-internal']) list = list.filter((t) => !(t.tags || []).includes('intern'));
  if (!list.length) { out(tr('No completed tasks in this period.')); return; }
  const title = flags.version ? `## ${flags.version} (${today()})` : tr('## Unreleased ({date})', { date: today() });
  const lines = [title, ''];
  for (const [label, types] of changelogGroups()) {
    const g = list.filter((t) => types.includes(t.type)).sort((a, b) => String(a.completed).localeCompare(String(b.completed)));
    if (!g.length) continue;
    lines.push(`### ${label}`, '');
    for (const t of g) lines.push(`- ${t.title} (${t.id})`);
    lines.push('');
  }
  const text = lines.join('\n');
  if (flags.write) {
    const file = path.join(root, 'CHANGELOG.md');
    let cur = exists(file) ? fs.readFileSync(file, 'utf8') : '# Changelog\n\n';
    const m = cur.match(/^# .*\n+/);
    cur = m ? cur.slice(0, m[0].length) + text + '\n' + cur.slice(m[0].length) : `# Changelog\n\n${text}\n${cur}`;
    fs.writeFileSync(file, cur);
    out(tr('CHANGELOG.md updated ({n} entries).', { n: list.length }));
  } else out(text);
}

function historyEntries(t) {
  const sec = getSection(t._body, 'Verlauf') || '';
  return sec.split('\n').map((l) => l.match(/^- (\d{4}-\d{2}-\d{2}): (.*)$/)).filter(Boolean).map((m) => ({ date: m[1], text: m[2] }));
}

async function cmdReport() {
  const root = requireRoot();
  const config = loadConfig(root);
  if (flags.webhook !== undefined) {
    try { setWebhook(root, flags.webhook === true ? '' : String(flags.webhook)); } catch (e) { fail(e.message); }
    out(flags.webhook === true ? tr('Discord webhook removed.') : tr('Discord webhook saved (only locally in .works/report.local.json).'));
    return;
  }
  if (flags.settings) {
    const r = reportSettings(config);
    // parseArgs nimmt das erste Paar nach --settings als dessen Wert.
    for (const pair of [...(typeof flags.settings === 'string' ? [flags.settings] : []), ...pos]) {
      const i = pair.indexOf('='); const k = pair.slice(0, i); const v = pair.slice(i + 1);
      const yes = ['true', '1', 'ja', 'an', 'yes', 'on'].includes(v.toLowerCase());
      if (k === 'enabled') r.enabled = yes;
      else if (k === 'weekday') r.weekday = Math.min(7, Math.max(1, parseInt(v, 10) || 5));
      else if (k === 'time') { if (!/^\d{2}:\d{2}$/.test(v)) fail(tr('time needs HH:MM.')); r.time = v; } else if (k === 'discord' || k === 'file') r.destinations[k] = yes;
      else if (['done', 'attention', 'next', 'milestones'].includes(k)) r.include[k] = yes;
      else fail(tr('Unknown setting {key}.', { key: k }));
    }
    config.report = r; saveConfig(root, config);
    const days = ['', tr('Mondays'), tr('Tuesdays'), tr('Wednesdays'), tr('Thursdays'), tr('Fridays'), tr('Saturdays'), tr('Sundays')];
    const discord = r.destinations.discord ? tr('on') : tr('off');
    out(r.enabled ? tr('Weekly report: on, {day} from {time}, Discord {discord}', { day: days[r.weekday], time: r.time, discord }) : tr('Weekly report: off, Discord {discord}', { discord }));
    return;
  }
  if (flags.week) {
    const summary = flags['summary-file'] && flags['summary-file'] !== true ? fs.readFileSync(String(flags['summary-file']), 'utf8') : flags.summary && flags.summary !== true ? String(flags.summary) : '';
    const r = await writeWeekly(root, config, { summary, send: flags.send ? true : flags['no-send'] ? false : null });
    out(tr('Weekly report {name} saved:\n  {md}\n  {html}', { name: r.name, md: r.md, html: r.html }));
    for (const n of r.notes) out(n);
    return;
  }
  const days = parseInt(flags.days || config.report.days || 7, 10);
  const end = today();
  const startD = new Date(); startD.setDate(startD.getDate() - days + 1);
  const start = startD.toLocaleDateString('sv-SE');
  const all = loadTasks(root);
  const byId = byIdMap(all);
  const inRange = (d) => d && String(d) >= start && String(d) <= end;
  const done = all.filter((t) => t.status === 'erledigt' && inRange(t.completed));
  const dropped = all.filter((t) => t.status === 'verworfen' && inRange(t.completed));
  const created = all.filter((t) => inRange(t.created));
  const started = all.filter((t) => historyEntries(t).some((h) => inRange(h.date) && /^(Gestartet|Started)\b/.test(h.text)));
  const open = sortTasks(all.filter((t) => OPEN_STATUSES.includes(t.status)));
  const L = [];
  L.push(tr('# Report {start} to {end}', { start, end }), '');
  L.push(tr('## Summary'), '');
  L.push(tr('- Done: {n}', { n: done.length }));
  L.push(tr('- Newly created: {n}', { n: created.length }));
  L.push(tr('- Started: {n}', { n: started.length }));
  L.push(tr('- Dropped: {n}', { n: dropped.length }));
  L.push(tr('- Open in total: {n} ({list})', { n: open.length, list: PRIORITIES.map((p) => `${p}: ${open.filter((t) => t.priority === p).length}`).join(', ') }));
  L.push('');
  const sect = (title, list, extra = () => '') => {
    L.push(`## ${title}`, '');
    if (!list.length) L.push(tr('None.'));
    for (const t of list) L.push(`- ${t.id} ${t.title} (${TYPE_LABEL[t.type]}, ${t.priority})${extra(t)}`);
    L.push('');
  };
  const due = (d) => `, ${tr('due {date}', { date: d })}`;
  sect(tr('Done'), done, (t) => (t.completed ? tr(', on {date}', { date: t.completed }) : ''));
  sect(tr('Newly created'), created);
  sect(tr('In progress and review'), open.filter((t) => ['in-arbeit', 'review'].includes(t.status)), (t) => `, ${STATUS_LABEL[t.status]}`);
  sect(tr('Blocked'), open.filter((t) => isBlocked(t, byId)), (t) => tr(', waiting for {list}', { list: openBlockers(t, byId).join(', ') }));
  sect(tr('Overdue'), open.filter(isOverdue), (t) => due(t.due));
  const ms = milestoneProgress(config, all);
  if (ms.length) {
    L.push(tr('## Milestones'), '');
    for (const m of ms) L.push(`- ${m.id} ${m.title}: ${m.done}/${m.total} (${m.pct} %)${m.due ? due(m.due) : ''}`);
    L.push('');
  }
  const text = L.join('\n');
  if (flags.write) {
    const file = path.join(worksDir(root), 'reports', `${end}-bericht.md`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    out(tr('Report saved: {file}', { file }));
  } else out(text);
}

// ---------- Hooks installieren ----------

function homeRel(p) {
  const home = os.homedir();
  return p.startsWith(home + path.sep) ? `$HOME/${path.relative(home, p).split(path.sep).join('/')}` : p;
}

// Läuft der Skill als Teil eines Plugins? Dann liegt zwei Ebenen höher ein Plugin-Manifest.
const IS_PLUGIN = exists(path.resolve(SKILL_DIR, '..', '..', '.claude-plugin', 'plugin.json'));

function cmdInstallHooks() {
  const root = findRoot() || process.cwd();
  let doClaude = flags.claude || !flags.git;
  const doGit = flags.git || !flags.claude;
  const scope = flags.scope || 'user';
  if (doClaude && IS_PLUGIN && !flags.force) {
    out(tr('Claude Code hooks: shipped with the plugin and active as long as the plugin is enabled. Nothing to set up.'));
    doClaude = false;
  }
  if (doClaude) {
    const file = scope === 'user' ? path.join(os.homedir(), '.claude', 'settings.json')
      : scope === 'project' ? path.join(root, '.claude', 'settings.json')
        : path.join(root, '.claude', 'settings.local.json');
    const settings = readJson(file, {}) || {};
    settings.hooks = settings.hooks || {};
    const add = (event, script, matcher) => {
      const command = `node "${homeRel(path.join(SKILL_DIR, 'hooks', script))}"`;
      settings.hooks[event] = settings.hooks[event] || [];
      const present = settings.hooks[event].some((g) => (g.hooks || []).some((h) => String(h.command || '').includes(`hooks/${script}`)));
      if (present) { out(tr('{event}: already set up', { event })); return; }
      const group = { hooks: [{ type: 'command', command, timeout: 15 }] };
      if (matcher) group.matcher = matcher;
      settings.hooks[event].push(group);
      out(tr('{event}: set up ({command})', { event, command }));
    };
    add('SessionStart', 'session-start.mjs', 'startup|resume|clear|compact');
    add('Stop', 'stop-reminder.mjs');
    add('UserPromptSubmit', 'prompt-submit.mjs');
    add('PreToolUse', 'pre-tool.mjs');
    add('PermissionRequest', 'permission.mjs');
    add('PostToolUse', 'post-tool.mjs');
    add('SubagentStop', 'subagent-stop.mjs');
    if (!flags['dry-run']) writeJson(file, settings);
    out(tr('Claude Code settings: {file}', { file }) + (flags['dry-run'] ? tr(' (dry run, nothing written)') : ''));
  }
  if (doGit) {
    const gitDir = run('git', ['rev-parse', '--git-dir'], { cwd: root });
    if (!gitDir.ok) { out(tr('Git: no repository, pre-commit hook skipped.')); return; }
    const hookFile = path.resolve(root, gitDir.stdout.trim(), 'hooks', 'pre-commit');
    const marker = '# works-doctor';
    // Im Plugin ändert sich der Installationspfad bei jedem Update, daher den aktuellen Pfad zur Laufzeit suchen.
    const locate = IS_PLUGIN
      ? '  WORKS_CLI=$(ls -t $(find "$HOME/.claude/plugins" -path "*/skills/works/scripts/works.mjs" 2>/dev/null) 2>/dev/null | head -n 1)\n'
      : `  WORKS_CLI="${homeRel(path.join(SKILL_DIR, 'scripts', 'works.mjs'))}"\n`;
    const block = `${marker}\nif git diff --cached --name-only | grep -q '^\\.works/'; then\n${locate}`
      + '  if [ -n "$WORKS_CLI" ] && [ -f "$WORKS_CLI" ]; then\n'
      + `    node "$WORKS_CLI" doctor --quiet || { echo "${tr('works doctor reports errors in .works/. Commit aborted.')}"; exit 1; }\n`
      + `  else\n    echo "${tr('works: CLI not found, check skipped.')}"\n  fi\nfi\n`;
    let cur = exists(hookFile) ? fs.readFileSync(hookFile, 'utf8') : '#!/bin/sh\n';
    if (cur.includes(marker)) out(tr('Git pre-commit: already set up'));
    else {
      cur = cur.replace(/\s*$/, '\n') + block;
      if (!flags['dry-run']) { fs.mkdirSync(path.dirname(hookFile), { recursive: true }); fs.writeFileSync(hookFile, cur); fs.chmodSync(hookFile, 0o755); }
      out(tr('Git pre-commit: set up ({file})', { file: hookFile }));
    }
  }
}

// ---------- Hilfe ----------

function cmdHelp() {
  out([
    tr('works: task management in .works/'),
    tr(`Setup
  init [--gitignore default|assets|all|none] [--prefix W]
  install-hooks [--claude] [--git] [--scope user|project|local] [--dry-run]
  install-cli [--dir folder] [--no-path] [--dry-run] [--uninstall]   works command in the terminal, without Claude
  lang [code] [--project] [--reset]   show or change the language (en, de)
  version`),
    tr(`Capture
  new --type <type> --title "..." [--priority P1-P4] [--effort S|M|L|XL] [--risk low|medium|high]
      [--due YYYY-MM-DD] [--milestone M1] [--tags a,b] [--blocked-by W-1] [--blocks W-2] [--related W-3]
      [--source text] [--incomplete] [--decisions] [--log-file path] [--status backlog]
      [--goal ".." | --goal-file path] [--description ".." | --description-file path] [--criteria-file path]
  idea "text" [--tags a,b]          ideas                      promote I-001 [--type ...] [--priority ...]
  scan [--create] [--marker FIXME,HACK] [--json]
  gh-import [--state open] [--limit 100] [--dry-run]         gh-export <ID> [--dry-run]`),
    tr(`View
  list [--status ..] [--priority ..] [--type ..] [--tag ..] [--milestone M1] [--blocked] [--overdue] [--incomplete] [--all] [--json]
  show <ID> [--section "Name"]     next [--n 3]     status     index
  board [--open]                   board --serve [--detach] [--port 4747] [--host 127.0.0.1] [--open]
                                   board --restart --share   share on the local network (read link with key)
                                   board --restart --private local only again
  share [--rotate] [--owner]       show or renew the sharing links
  export [--out file.html] [--no-images] [--open-only]  snapshot as a single HTML file
  export --json [--out file.json] [--archive] [--images] [--designs] [--checks] [--open-only]  backup as JSON
  board --status | --stop | --restart
  queue [list|add <ID> [--pos N]|remove <ID>|move <ID> <N>|order A,B,C|clear|set auto_next=true ...]
  sprint [start --title ..|add A,B|remove A|set capacity=24|close [--good ..] [--bad ..] [--change ..] [--next-capacity N]|list]
  comments [<ID>]                  comment <ID> "text" [--as Nutzer|Claude]
  views | views delete "Name"      list --view "Name"
  template list|show <slug>|save --from <ID> [--name ..] [--scope user]|delete <slug>
  new --template <slug> --field Name=Value --text "What should happen" [--criteria 2,3]
  time [<ID>] [--mode measured|fixed]
  checks [detect [--save]|set name="command"|remove name|run <ID>|record <ID> <name> --status ok|warn|fail|ack <ID> <name>]
  report --week [--summary ".."] [--send|--no-send]    report --settings enabled=true weekday=5 time=16:00 discord=true
  report --webhook https://discord.com/api/webhooks/..
  discord [status|link <Code>|unlink|token|channel [name]|set k=v ..|test|start|stop|restart|disconnect]   Discord bot works: shared (link) or your own (token)
  demo [--simulate] [--delay 6] [--open] [--port 4747] [--path folder] | demo --remove
  milestone list|add M1 --title ".." [--due ..]|set M1 status=done`),
    tr(`Edit
  section <ID> "Name" [--text ".." | --file path]     check <ID> <no> [--section ..] [--undo]
  item <ID> "text" [--section "Acceptance criteria"] [--remove no]      idea-drop I-001 [--reason ..]
  set <ID> field=value ...         log <ID> "text"       question <ID> "question" | --resolve N [--answer ".."]
  link <A> blocks|blocked-by|related <B>                  unlink <A> <relation> <B>
  start <ID> [--git] [--force]     handoff [<ID>] [--text ".." | --file path]
  dod <ID>                         done <ID> [--run] [--confirm] [--force --reason ".."]
  ship [<ID>] [--no-push] [--no-ci] [--no-update] [--no-open]   finish in one go: merge, done, push, CI, plugins, board
  drop <ID> --reason ".."          reopen <ID> --reason ".." [--status backlog]
  archive [<ID>...] [--all] [--older-than days]`),
    tr(`Assets and decisions
  asset <ID> <path|inbox-file> --desc ".." [--kind current|before|after|reference|mockup|sketch|error|diagram]
        [--alt ".."] [--name ".."] [--move] [--compress] [--origin ".."]
  shot [board|live|..|<ID>] | --url <address> [--widths 1440,390] [--themes light,dark] [--asset <ID> --kind after]
                                   screenshots with Playwright (installed Chrome)
  inbox [--json]                   compress [<ID>]
  decisions <ID> [--add "title" --decision ".." --why ".." --rejected "A: reason,B: reason" --source ".."]
  attach-doc <ID> <path> [--mode link|copy|move] [--label ".."]
  design [show] <ID> [--json]      design direction <ID> --file direction.md --colors "Base #0F1420,Accent #3DD6B5" --fonts "A,B"
  design add <ID> --name A --title ".." --file mockup.html [--note ..]    design brainstorm <ID> --file bs.md
  design choose <ID> <name> [--reason ..]                   design remove <ID> <name>`),
    tr(`Reports
  commits <ID> [--write]           changelog [--since ..] [--milestone M1] [--version 1.2.0] [--write]
  report [--days 7] [--write]      doctor [--fix] [--strict] [--quiet]
  undo [--list] [<key>]            undo a change made in the board
  ical [--out file.ics] [--recurring]                      dates as a calendar file`),
    tr(`Project knowledge, recurring tasks, GitHub, overview
  know [list|search ..|add|propose] --area ".." --title ".." --text ".."   know accept|flag|edit|remove <kid>
  recur [list|add --title ".." --every daily|weekly|monthly|days:N [--weekday 1-7] [--nth 1-5] [--day 1-31]
        [--template slug] [--due_days N] [--queue] [--sprint]|set R1 field=value|remove R1|run]
  instruct <ID> "text"             instruction that Claude reads while working
  github [sync|status|set field=value ...] [--quiet]         sync with PRs, CI and issues via gh
  hub [--list] [--port 4740]       overview of all projects with .works`),
    tr(`Files, parallel work, import, self-test
  file <path> [--json]             tasks that changed this file, with their decisions
  files [<ID>] [--json]            files of a task and where else they were changed
  parallel plan [A,B,..] [--max 3] [--json]   can the tasks run at the same time?
  parallel start A,B | prompt <ID> | status | finish <ID> [--merge] [--force] | abort <ID> [--force]
  import <file> [--format auto|trello|notion|linear|csv|xlsx|docx|md|json] [--map title=Column,..]
         [--sheet Name] [--json] [--all] [--apply [--only 1,4 | --skip 3] [--status planned] [--tags a,b]
         [--include-done] [--keep-dups] [--include-archived]]
  import <backup.json> [--apply [--mode merge|restore] [--only 1,4]]  merge or restore a works backup
  selftest [--browser] [--keep] [--verbose] [--only <text>]`),
    tr('Types: {types}\nStatus: {statuses}\nPriorities: {prios}', {
      types: TYPES.join(', '),
      statuses: tr('backlog, planned, in-progress, review, done, dropped'),
      prios: PRIORITIES.map((p) => `${p} ${PRIO_LABEL[p]}`).join(', '),
    }),
  ].join('\n\n'));
}

// ---------- Sprint ----------

function cmdSprint() {
  const root = requireRoot();
  const config = loadConfig(root);
  const sub = pos.shift() || 'show';
  const tasks = loadTasks(root);
  const byId = byIdMap(tasks);
  const set = sprintSettings(config);
  config.sprints = sprintList(config);
  const cur = activeSprint(config);
  const save = () => { saveConfig(root, config); refresh(root); };
  const need = () => { if (!cur) fail(tr('No active sprint. Start one with works sprint start --title ".." [--goal ".."]')); return cur; };
  if (sub === 'start') {
    if (cur) fail(tr('Sprint {id} runs until {end}. Close it first with works sprint close.', { id: cur.id, end: cur.end }));
    const days = parseInt(flags.days || set.length_days, 10);
    const start = flags.start && flags.start !== true ? String(flags.start) : today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) fail(tr('--start needs the format YYYY-MM-DD.'));
    const id = nextSprintId(config);
    const carry = flags.carry ? ((lastClosedSprint(config) || {}).carry || []) : [];
    const s = {
      id, title: flags.title && flags.title !== true ? String(flags.title) : `Sprint ${id.slice(1)}`, goal: flags.goal && flags.goal !== true ? String(flags.goal) : '',
      start, end: addDays(start, Math.max(1, days) - 1), capacity: parseInt(flags.capacity || set.capacity, 10), status: 'aktiv',
      tasks: carry.filter((x) => byId.has(x) && OPEN_STATUSES.includes(byId.get(x).status)),
    };
    config.sprints.push(s);
    save();
    out(tr('{id} {title} runs from {start} to {end}, capacity {capacity} points{carried}.', { id: s.id, title: s.title, start: s.start, end: s.end, capacity: s.capacity, carried: s.tasks.length ? tr(', {n} task(s) carried over', { n: s.tasks.length }) : '' }));
  } else if (sub === 'add' || sub === 'remove') {
    const s = need();
    const ids = listFlag(pos.join(',')).map((x) => normalizeId(config, x));
    if (!ids.length) fail(tr('Name the tasks: works sprint {sub} W-0001,W-0002', { sub }));
    for (const id of ids) {
      const t = byId.get(id);
      if (!t) fail(tr('Task {id} not found.', { id }));
      if (sub === 'add') { if (!OPEN_STATUSES.includes(t.status)) fail(tr('{id} is {status}.', { id, status: STATUS_LABEL[t.status] })); if (!s.tasks.includes(id)) s.tasks.push(id); } else s.tasks = s.tasks.filter((x) => x !== id);
    }
    save();
    const st = sprintStats(config, s, tasks);
    const v = { ids: ids.join(', '), planned: st.planned, capacity: st.capacity };
    out(sub === 'add' ? tr('Added to the sprint: {ids}. {planned} of {capacity} points planned.', v) : tr('Removed from the sprint: {ids}. {planned} of {capacity} points planned.', v));
    if (st.planned > st.capacity) out(tr('Note: The sprint is over capacity.'));
  } else if (sub === 'set') {
    const s = need();
    for (const pair of pos) {
      const i = pair.indexOf('=');
      const k = pair.slice(0, i); const v = pair.slice(i + 1);
      if (k === 'capacity') s.capacity = Math.max(1, parseInt(v, 10) || s.capacity);
      else if (k === 'end' || k === 'start') { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(tr('{field} needs YYYY-MM-DD.', { field: k })); s[k] = v; } else if (k === 'title' || k === 'goal') s[k] = v.slice(0, 200);
      else fail(tr('Unknown field {field}. Allowed: title, goal, start, end, capacity', { field: k }));
    }
    save();
    out(tr('{id} saved.', { id: s.id }));
  } else if (sub === 'close') {
    const s = need();
    const st = sprintStats(config, s, tasks);
    s.status = 'abgeschlossen';
    s.closed = today();
    s.result = { planned: st.planned, done: st.done };
    s.carry = s.tasks.filter((id) => byId.has(id) && OPEN_STATUSES.includes(byId.get(id).status));
    const retro = Object.fromEntries(['good', 'bad', 'change'].map((k) => [k, flags[k] && flags[k] !== true ? String(flags[k]).slice(0, 500) : '']).filter(([, v]) => v));
    if (Object.keys(retro).length) s.retro = retro;
    if (flags['next-capacity']) config.sprint_settings = { ...(config.sprint_settings || {}), capacity: Math.max(1, parseInt(flags['next-capacity'], 10) || 20) };
    save();
    out(tr('{id} closed: {done} of {planned} points done.', { id: s.id, done: st.done, planned: st.planned }) + (s.carry.length ? tr(' Still open: {ids}. Carry them over with works sprint start --carry.', { ids: s.carry.join(', ') }) : ''));
  } else if (sub === 'list') {
    if (!config.sprints.length) { out(tr('No sprints yet.')); return; }
    for (const s of config.sprints) out(tr('{id} {title} {start} to {end} {status}', { id: s.id, title: s.title, start: s.start, end: s.end, status: s.status }) + (s.result ? tr(', {done}/{planned} points', { done: s.result.done, planned: s.result.planned }) : ''));
  } else {
    if (!cur) { out(tr('No active sprint. Start one with works sprint start --title ".." --goal ".." (length {days} days, capacity {capacity} points, points {points}).', { days: set.length_days, capacity: set.capacity, points: Object.entries(set.points).map(([k, v]) => `${k} ${v}`).join(', ') })); return; }
    const st = sprintStats(config, cur, tasks);
    if (flags.json) { out(JSON.stringify({ sprint: cur, stats: st }, null, 2)); return; }
    out(tr('{id} {title}, {start} to {end}, day {day} of {days}', { id: cur.id, title: cur.title, start: cur.start, end: cur.end, day: st.dayIndex, days: st.days }) + (cur.goal ? `\n${tr('Goal: {goal}', { goal: cur.goal })}` : ''));
    out(tr('Points: {done} done, {working} in progress, {open} open, {planned} of {capacity} planned', { done: st.done, working: st.working, open: st.open, planned: st.planned, capacity: st.capacity }) + (st.unestimated ? tr(' ({n} without estimate count as M)', { n: st.unestimated }) : ''));
    for (const id of cur.tasks) { const t = byId.get(id); if (t) out(`  ${t.id} ${STATUS_LABEL[t.status].padEnd(9)} ${(t.effort || '-').padEnd(2)} ${pointsOf(t, set)} P  ${t.title}`); }
  }
}

// ---------- Kommentare ----------

function commentAuthor() {
  if (flags.as === 'Nutzer' || flags.as === 'Claude') return flags.as;
  return process.env.WORKS_ACTOR === 'Board' ? 'Nutzer' : 'Claude';
}

function cmdComment() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos.shift());
  let text = flags.file && flags.file !== true ? readText(String(flags.file)) : flags.text && flags.text !== true ? String(flags.text) : pos.join(' ');
  if (!text.trim()) fail(tr('Text missing: works comment <ID> "..."'));
  const author = commentAuthor();
  try { addComment(t, author, text); } catch (e) { fail(e.message); }
  if (author === 'Claude') markRead(root, t);
  refresh(root);
  out(tr('Comment on {id} saved ({author}).', { id: t.id, author }));
}

function cmdComments() {
  const root = requireRoot();
  const config = loadConfig(root);
  if (!pos.length || flags.unread) {
    const list = loadTasks(root, { archive: false }).map((t) => ({ t, n: unreadForClaude(root, t).length })).filter((x) => x.n);
    if (!list.length) { out(tr('No new comments from the user.')); return; }
    for (const x of list) out(tr('{id} {title}: {n} new', { id: x.t.id, title: x.t.title, n: x.n }));
    return;
  }
  const t = findTask(root, config, pos[0]);
  const list = loadComments(t);
  const unread = new Set(unreadForClaude(root, t, list).map((c) => c.at));
  if (flags.json) { out(JSON.stringify(list, null, 2)); return; }
  if (!list.length) { out(tr('{id} has no comments yet.', { id: t.id })); return; }
  for (const c of list) out(`\n${c.at.replace('T', ' ').slice(0, 16)} ${c.author}${unread.has(c.at) ? tr(' (new)') : ''}\n${c.text}`);
  if (process.env.WORKS_ACTOR !== 'Board') markRead(root, t);
}

// ---------- Ansichten ----------

function cmdViews() {
  const root = requireRoot();
  const config = loadConfig(root);
  const views = Array.isArray(config.views) ? config.views : [];
  if (pos[0] === 'delete' || pos[0] === 'remove') {
    const name = pos.slice(1).join(' ');
    config.views = views.filter((v) => v.name !== name);
    if (config.views.length === views.length) fail(tr('View "{name}" does not exist.', { name }));
    saveConfig(root, config); refresh(root);
    out(tr('View "{name}" deleted.', { name }));
    return;
  }
  if (!views.length) { out(tr('No saved views. In the board, use "Save current filters" below the filters.')); return; }
  for (const v of views) out(`${v.name}: ${describeView(v)}`);
}

function describeView(v) {
  const f = v.filter || {};
  const parts = [];
  if (f.prios && f.prios.length && f.prios.length < 4) parts.push(f.prios.join(tr(' and ')));
  if (f.type) parts.push(tr('type {type}', { type: f.type }));
  if (f.tag) parts.push(`#${f.tag}`);
  if (f.ms) parts.push(tr('milestone {ms}', { ms: f.ms }));
  if (f.signal) parts.push({ blocked: tr('only blocked'), unblocked: tr('without blocked'), overdue: tr('overdue only'), questions: tr('with open questions'), incomplete: tr('incomplete only') }[f.signal] || f.signal);
  if (f.q) parts.push(tr('search "{q}"', { q: f.q }));
  if (v.view && v.view !== 'board') parts.push(tr('view {view}', { view: v.view }));
  return parts.join(', ') || tr('all tasks');
}

// Wendet eine gespeicherte Ansicht im Terminal an (works list --view "Name").
function applyView(config, list, byId, name) {
  const v = (config.views || []).find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  if (!v) fail(tr('View "{name}" does not exist. works views shows all views.', { name }));
  const f = v.filter || {};
  return list.filter((t) => {
    if (f.prios && f.prios.length && !f.prios.includes(t.priority)) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.tag && !(t.tags || []).includes(f.tag)) return false;
    if (f.ms && t.milestone !== f.ms) return false;
    if (f.signal === 'blocked' && !isBlocked(t, byId)) return false;
    if (f.signal === 'unblocked' && isBlocked(t, byId)) return false;
    if (f.signal === 'overdue' && !isOverdue(t)) return false;
    if (f.signal === 'questions' && !openQuestions(t).length) return false;
    if (f.signal === 'incomplete' && !t.incomplete) return false;
    if (f.q) { const hay = `${t.id} ${t.title} ${(t.tags || []).join(' ')}`.toLowerCase(); if (!f.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false; }
    return true;
  });
}

// ---------- Vorlagen ----------

function cmdTemplate() {
  const root = requireRoot();
  const config = loadConfig(root);
  const sub = pos.shift() || 'list';
  if (sub === 'list') {
    const list = listTemplates(root);
    if (!list.length) { out(tr('No templates. Create one in the board or with works template save --from <ID> --name ".."')); return; }
    for (const t of list) out(`${t.slug.padEnd(24)} ${tr('{name} ({type}, {fields} fields, {criteria} criteria, {scope})', { name: t.name, type: TYPE_LABEL[t.type], fields: t.fields.length, criteria: t.criteria.length, scope: t.scope === 'user' ? tr('all projects') : tr('this project') })}`);
  } else if (sub === 'show') {
    const t = findTemplate(root, String(pos[0] || ''));
    if (!t) fail(tr('Template {slug} not found.', { slug: pos[0] }));
    out(JSON.stringify(t, null, 2));
  } else if (sub === 'save') {
    let input;
    if (flags.file && flags.file !== true) input = JSON.parse(fs.readFileSync(String(flags.file), 'utf8'));
    else if (flags.from && flags.from !== true) input = templateFromTask(findTask(root, config, String(flags.from)));
    else fail(tr('Source missing: --from <ID> or --file template.json'));
    if (flags.name && flags.name !== true) { input.name = String(flags.name); delete input.slug; }
    try {
      const t = saveTemplate(root, input, flags.scope === 'user' ? 'user' : 'project');
      out(tr('Template saved: {slug} ({name}). Create tasks from it with works new --template {slug}', { slug: t.slug, name: t.name }));
    } catch (e) { fail(e.message); }
  } else if (sub === 'delete') {
    const n = deleteTemplate(root, String(pos[0] || ''));
    out(n ? tr('Template {slug} deleted.', { slug: pos[0] }) : tr('Template {slug} not found.', { slug: pos[0] }));
  } else fail(tr('Subcommands: list, show <slug>, save --from <ID> | --file, delete <slug>'));
}

// Neue Aufgabe aus einer Vorlage: works new --template slug --field Name=Wert --text "Was genau passieren soll"
function newFromTemplate(root, config) {
  const tpl = findTemplate(root, String(flags.template));
  if (!tpl) fail(tr('Template {slug} not found. works template list shows all templates.', { slug: flags.template }));
  const values = {};
  for (const f of [].concat(flags.field || [])) {
    const i = String(f).indexOf('=');
    if (i > 0) values[String(f).slice(0, i)] = String(f).slice(i + 1);
  }
  const text = flags['text-file'] && flags['text-file'] !== true ? fs.readFileSync(String(flags['text-file']), 'utf8') : flags.text && flags.text !== true ? String(flags.text) : flags.description && flags.description !== true ? String(flags.description) : '';
  const pick = flags.criteria && flags.criteria !== true && /^[\d,]+$/.test(String(flags.criteria)) ? String(flags.criteria).split(',').map(Number) : null;
  let a;
  try { a = applyTemplate(tpl, { values, text, criteria: pick, title: flags.title && flags.title !== true ? String(flags.title) : '' }); } catch (e) { fail(e.message); }
  const opts = {
    ...flags, title: a.title, type: flags.type || a.type, priority: flags.priority || a.priority, effort: flags.effort || a.effort || undefined,
    tags: [...new Set([...a.tags, ...listFlag(flags.tags)])].join(','), description: a.description, criteriaList: a.criteria,
    source: flags.source || `vorlage:${tpl.slug}`,
  };
  delete opts.template; delete opts.field; delete opts.text; delete opts.criteria;
  const task = createTask(root, config, opts);
  countUse(root, tpl.slug);
  return task;
}

// ---------- Zeit ----------

function cmdTime() {
  const root = requireRoot();
  const config = loadConfig(root);
  const tasks = loadTasks(root);
  // Verbrauch von heute, etwa für die Bilanz beim Feierabend (W-0023).
  if (flags.today) {
    const u = liveUsage(root, config);
    if (flags.json) { out(JSON.stringify({ ...u.today, currency: u.currency })); return; }
    out(tr('Today: {tokens} tokens, estimated {cost}', { tokens: fmtTokens(u.today.tokens), cost: fmtCost(u.today.cost, u.currency) }));
    return;
  }
  if (flags.mode) {
    if (!['measured', 'fixed'].includes(flags.mode)) fail(tr('--mode measured or fixed'));
    config.effort_mode = flags.mode; saveConfig(root, config); refresh(root);
    out(flags.mode === 'measured' ? tr('Timeline and sprint now use the measured durations.') : tr('Timeline and sprint use fixed values.'));
    return;
  }
  if (pos[0]) {
    const t = findTask(root, config, pos[0]);
    const tt = taskTime(root, t);
    if (flags.json) { out(JSON.stringify(tt, null, 2)); return; }
    out(`${t.id} ${t.title}\n${tr('Claude active: {duration} in {n} session(s)', { duration: fmtDuration(tt.totalMs), n: tt.sessions.length })}${tt.started ? tr(', started on {date}', { date: tt.started }) : ''}`);
    const u = taskUsage(root, config, t.id);
    if (u.tokens) out(tr('Usage: {tokens} tokens (input {in}, output {out}, cache {cache}), estimated {cost}', { tokens: fmtTokens(u.tokens), in: fmtTokens(u.in), out: fmtTokens(u.out), cache: fmtTokens(u.cw + u.cr), cost: fmtCost(u.cost, u.currency) }));
    out(tr('Days per status: {list}', { list: Object.entries(tt.statusDays).map(([k, v]) => `${STATUS_LABEL[k] || k} ${v}`).join(', ') || tr('none') }));
    for (const s of tt.sessions) out(`  ${new Date(s.start).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}  ${fmtDuration(s.ms).padEnd(12)} ${s.label}`);
    return;
  }
  const e = estimates(root, tasks, config);
  if (flags.json) { out(JSON.stringify(e, null, 2)); return; }
  out(e.mode === 'measured' ? tr('Estimate vs. actual duration (calendar days from start to completion), mode: measured') : tr('Estimate vs. actual duration (calendar days from start to completion), mode: fixed'));
  for (const s of e.sizes) out(`  ${s.effort.padEnd(3)} ${tr('estimated {est} days, measured {measured}', { est: String(s.estimate).padStart(2), measured: s.avg === null ? tr('no data yet') : tr('{avg} days from {n} task(s)', { avg: s.avg, n: s.n }) })}`);
  const pu = projectUsage(root, config, tasks);
  if (pu.total.tokens) {
    out(`\n${tr('Usage over the last {days} days: {tokens} tokens, estimated {cost} (prices in config.json under prices)', { days: pu.days, tokens: fmtTokens(pu.total.tokens), cost: fmtCost(pu.total.cost, pu.currency) })}`);
    for (const b of pu.byType) out(`  ${(TYPE_LABEL[b.type] || b.type).padEnd(16)} ${fmtTokens(b.tokens).padStart(9)}  ${fmtCost(b.cost, pu.currency)}  ${tr('{n} task(s)', { n: b.tasks })}`);
    if (pu.top.length) out(tr('Most expensive: {list}', { list: pu.top.slice(0, 3).map((x) => `${x.id} ${fmtCost(x.cost, pu.currency)}`).join(', ') }));
  }
  if (e.worst.length) out(tr('Furthest over the estimate: {list}', { list: e.worst.map((w) => tr('{id} ({effort}, {days} days)', { id: w.id, effort: w.effort, days: w.days })).join(', ') }));
}

// ---------- Prüfungen ----------

async function cmdChecks() {
  const root = requireRoot();
  const config = loadConfig(root);
  const sub = pos.shift() || (flags.detect ? 'detect' : 'list');
  if (sub === 'detect') {
    const d = detectChecks(root);
    out(tr('Suggestion from the project:'));
    for (const [k, v] of Object.entries(d)) out(`  ${k.padEnd(10)} ${v}`);
    if (flags.save) { config.checks = d; saveConfig(root, config); refresh(root); out(tr('Saved in .works/config.json under checks.')); } else out(tr('Save only after asking the user: works checks detect --save'));
  } else if (sub === 'set') {
    config.checks = configuredChecks(config);
    // --file: JSON {"name": "befehl"} oder {"name": {"cmd": "..", "cwd": ".."}}, leerer Wert entfernt. Nutzt das Board.
    if (flags.file && flags.file !== true) {
      let obj;
      try { obj = JSON.parse(readText(String(flags.file))); } catch { fail(tr('--file must be JSON, e.g. {"test": {"cmd": "npm test", "cwd": "app"}}.')); }
      for (const [k, v] of Object.entries(obj && typeof obj === 'object' ? obj : {})) {
        if (!NAME_RE.test(k)) fail(tr('Invalid name {name}.', { name: k }));
        const e = checkEntry(v);
        if (e) config.checks[k] = storedCheck(e); else delete config.checks[k];
      }
    }
    // --cwd gilt für alle Prüfungen dieses Aufrufs.
    const cwd = flags.cwd && flags.cwd !== true ? String(flags.cwd).trim() : '';
    for (const pair of pos) {
      const i = pair.indexOf('=');
      const k = pair.slice(0, i); const v = pair.slice(i + 1).trim();
      if (!NAME_RE.test(k)) fail(tr('Invalid name {name}.', { name: k }));
      if (v) config.checks[k] = storedCheck({ cmd: v, cwd }); else delete config.checks[k];
    }
    saveConfig(root, config); refresh(root);
    out(tr('Checks: {list}', { list: Object.keys(config.checks).join(', ') || tr('none') }));
  } else if (sub === 'remove') {
    config.checks = configuredChecks(config);
    for (const k of pos) delete config.checks[k];
    saveConfig(root, config); refresh(root);
    out(tr('Checks: {list}', { list: Object.keys(config.checks).join(', ') || tr('none') }));
  } else if (sub === 'run') {
    const t = findTask(root, config, pos.shift());
    if (!checksFor(config, t).length) fail(tr('No checks set up. Get a suggestion with works checks detect.'));
    const data = await runChecks(root, config, t, { only: flags.only ? listFlag(flags.only) : null, onStart: (c) => out(`> ${c.name}: ${c.cmd}`) });
    printChecks(data);
    refresh(root);
  } else if (sub === 'record') {
    const t = findTask(root, config, pos.shift());
    const name = pos.shift();
    try { recordCheck(root, t, name, String(flags.status || 'ok'), flags.note && flags.note !== true ? String(flags.note) : ''); } catch (e) { fail(e.message); }
    refresh(root);
    out(tr('{name} recorded for {id}: {status}', { name, id: t.id, status: flags.status || 'ok' }));
  } else if (sub === 'ack') {
    const t = findTask(root, config, pos.shift());
    try { ackCheck(t, pos.shift(), flags.reason && flags.reason !== true ? String(flags.reason) : ''); } catch (e) { fail(e.message); }
    refresh(root);
    out(tr('Marked as known.'));
  } else {
    const c = configuredChecks(config);
    if (!Object.keys(c).length) { out(tr('No checks set up. Get a suggestion with works checks detect, save it after asking with --save.')); return; }
    for (const [k, v] of Object.entries(c)) { const e = checkEntry(v); out(`  ${k.padEnd(10)} ${e.cmd}${e.cwd ? `  ${tr('(in folder {cwd})', { cwd: e.cwd })}` : ''}`); }
    const by = config.checks_by_type || {};
    for (const [ty, list] of Object.entries(by)) out(`  ${tr('only for {type}: {list}', { type: ty, list: list.join(', ') || tr('none') })}`);
    if (pos[0]) { const t = findTask(root, config, pos[0]); const d = loadResults(t); if (d) printChecks(d); }
  }
}

function printChecks(data) {
  const mark = { ok: 'ok', ack: tr('ok, known'), warn: tr('finding'), fail: tr('FAILED'), manual: tr('pending (manual)') };
  for (const [k, r] of Object.entries(data.results)) {
    out(`  ${k.padEnd(10)} ${(mark[r.status] || r.status).padEnd(12)} ${r.ms ? `${Math.round(r.ms / 1000)} s` : ''}${r.note ? `  ${r.note.split('\n')[0]}` : ''}`);
    if (r.status === 'fail' && r.output) out(r.output.split('\n').slice(-12).map((l) => `      ${l}`).join('\n'));
  }
}

// ---------- Entwürfe (UI UX Pro Max, Brainstorming) ----------

function cmdDesign() {
  const root = requireRoot();
  const config = loadConfig(root);
  const sub = ['direction', 'add', 'brainstorm', 'choose', 'remove', 'show'].includes(pos[0]) ? pos.shift() : 'show';
  if (!pos[0]) fail(tr('Task ID missing. Example: works design add W-0006 --name=A --file=mockup.html'));
  const t = findTask(root, config, pos.shift());
  const file = flags.file && flags.file !== true ? path.resolve(String(flags.file)) : '';
  const str = (k) => (flags[k] && flags[k] !== true ? String(flags[k]) : '');
  try {
    if (sub === 'direction') {
      setDirection(t, { file, text: str('text'), source: str('source') || 'ui-ux-pro-max', colors: parseColors(str('colors')), fonts: listFlag(str('fonts')), notes: str('notes') });
      addHistory(t, tr('Design direction attached') + (str('source') ? ` (${str('source')})` : '')); saveTask(t);
      out(tr('Design direction for {id} saved.', { id: t.id }));
    } else if (sub === 'add') {
      const v = addVariant(t, { name: str('name') || pos.shift(), title: str('title'), file, source: str('source') || 'ui-ux-pro-max', note: str('note') });
      addHistory(t, tr('Design variant {name} “{title}” attached', { name: v.name, title: v.title })); saveTask(t);
      out(tr('Variant {name} saved: design/{file}. The user chooses in the board under Design variants, or: works design choose {id} {name}', { name: v.name, file: v.file, id: t.id }));
      const refs = v.kind === 'html' ? localRefs(readText(file)) : [];
      if (refs.length) out(tr('Warning: The design loads local files that the board does not show (only data:, blob: and https work there): {refs}{more}. Styles, fonts or images will be missing in the board. Embed them first, e.g. with the mockups plugin: node <mockups>/scripts/entwurf.mjs inline <file> --variant {name}', { refs: refs.slice(0, 5).join(', '), more: refs.length > 5 ? tr(' and {n} more', { n: refs.length - 5 }) : '', name: v.name }));
    } else if (sub === 'brainstorm') {
      addBrainstorm(t, { file, text: str('text'), source: str('source') || 'superpowers', title: str('title') });
      addHistory(t, tr('Brainstorming attached')); saveTask(t);
      out(tr('Brainstorming attached to {id}.', { id: t.id }));
    } else if (sub === 'choose') {
      const name = pos.shift();
      const r = chooseVariant(t, name, str('reason'));
      addHistory(t, tr('Design variant {name} “{title}” chosen', { name, title: r.variant.title }) + (str('reason') ? tr('. Reason: {reason}', { reason: str('reason') }) : '')); saveTask(t);
      out(tr('Variant {name} chosen for {id} and recorded in decisions.md.', { name, id: t.id }));
    } else if (sub === 'remove') {
      removeVariant(t, pos.shift()); out(tr('Variant removed.'));
    } else {
      const d = loadDesign(t);
      if (!d) { out(tr('{id} has no design variants yet.', { id: t.id }) + (needsDesign(t) ? tr(' This is a design task: use UI UX Pro Max and brainstorming if available, and attach the results with works design.') : '')); return; }
      if (flags.json) { out(JSON.stringify(d, null, 2)); return; }
      if (d.direction) out(tr('Direction ({source}): {colors}{fonts}. File design/{file}', { source: d.direction.source, colors: d.direction.colors.map((c) => `${c.name ? c.name + ' ' : ''}${c.hex}`).join(', '), fonts: d.direction.fonts.length ? tr(', font {fonts}', { fonts: d.direction.fonts.join(', ') }) : '', file: d.direction.file }));
      for (const v of d.variants) out(tr('Variant {name}: {title} (design/{file})', { name: v.name, title: v.title, file: v.file }) + (d.chosen && d.chosen.name === v.name ? tr('  CHOSEN') : ''));
      for (const b of d.brainstorm) out(`Brainstorming: design/${b.file} (${b.source})`);
      out(d.chosen ? tr('Chosen: {name}{reason}. Implement it next.', { name: d.chosen.name, reason: d.chosen.reason ? `, ${d.chosen.reason}` : '' }) : d.variants.length ? tr('No variant chosen yet. Wait for the user to choose, or ask, before implementing.') : '');
    }
  } catch (e) { fail(e.message); }
  refresh(root);
}

// ---------- Anweisungen und Aktivität ----------

function cmdInstruct() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos.shift());
  const text = flags.text && flags.text !== true ? String(flags.text) : pos.join(' ');
  if (!text.trim()) fail(tr('Text missing.'));
  addInstruction(root, t.id, text);
  addComment(t, 'Nutzer', tr('Instruction during work: {text}', { text }));
  refresh(root);
  out(tr('Instruction saved. Claude gets it with the next tool call, or at the latest at the end of the reply.'));
}

// ---------- Projektwissen ----------

function cmdKnow() {
  const root = requireRoot();
  const sub = pos.shift() || 'list';
  const str = (k) => (flags[k] && flags[k] !== true ? String(flags[k]) : '');
  try {
    if (sub === 'add' || sub === 'propose') {
      const text = str('file') ? fs.readFileSync(str('file'), 'utf8') : str('text');
      const e = addKnowledge(root, { area: str('area'), title: str('title') || pos.join(' '), text, by: process.env.WORKS_ACTOR === 'Board' ? 'Nutzer' : 'Claude', source: str('source'), proposal: sub === 'propose' });
      out(sub === 'propose' ? tr('Proposal {id} saved. The user accepts it in the board under Knowledge.', { id: e.id }) : tr('Entry {id} saved.', { id: e.id }));
    } else if (sub === 'accept') { updateKnowledge(root, pos[0], { status: 'ok' }); out(tr('Accepted.')); }
    else if (sub === 'flag') { updateKnowledge(root, pos[0], { status: 'veraltet' }); out(tr('Marked as possibly outdated.')); }
    else if (sub === 'edit') {
      const patch = {};
      if (str('title')) patch.title = str('title');
      if (str('text') || str('file')) patch.text = str('file') ? fs.readFileSync(str('file'), 'utf8') : str('text');
      if (str('area')) patch.area = str('area');
      if (flags.ok) patch.status = 'ok';
      updateKnowledge(root, pos[0], patch); out(tr('Saved.'));
    } else if (sub === 'remove' || sub === 'reject') { removeKnowledge(root, pos[0]); out(tr('Removed.')); }
    else {
      const q = (sub === 'search' ? pos.join(' ') : '').toLowerCase();
      const list = loadKnowledge(root).filter((e) => !q || `${e.title} ${e.text} ${e.area}`.toLowerCase().includes(q));
      if (flags.json) { out(JSON.stringify(list, null, 2)); return; }
      if (!list.length) { out(q ? tr('Nothing found.') : tr('No project knowledge yet. Add entries with works know add --area ".." --title ".." --text "..", proposals with works know propose.')); return; }
      let area = '';
      for (const e of list) {
        if (e.area !== area) { area = e.area; out(`\n## ${area}`); }
        out(`[${e.id}] ${e.title}${e.status !== 'ok' ? ` (${e.status})` : ''}\n${e.text}`);
      }
    }
  } catch (e) { fail(e.message); }
  refresh(root);
}

// ---------- Wiederkehrende Aufgaben ----------

function recurRule(input, old = {}) {
  const r = { ...old };
  const g = (k) => (input[k] !== undefined && input[k] !== true ? String(input[k]) : undefined);
  if (g('title') !== undefined) r.title = g('title').slice(0, 150);
  if (g('every') !== undefined) {
    const e = g('every');
    const m = e.match(/^(daily|weekly|monthly|days)(?::(\d+))?$/);
    if (!m) fail(tr('--every: daily, weekly, monthly or days:N'));
    r.kind = m[1]; if (m[2]) r.interval = parseInt(m[2], 10);
  }
  for (const k of ['interval', 'weekday', 'nth', 'day', 'due_days']) if (g(k) !== undefined) r[k] = parseInt(g(k), 10) || undefined;
  if (g('start') !== undefined) r.start = g('start');
  if (g('template') !== undefined) r.template = g('template');
  for (const k of ['type', 'priority', 'effort', 'tags', 'description']) if (g(k) !== undefined) r[k] = g(k);
  if (g('status') !== undefined) r.status = ['backlog', 'geplant'].includes(g('status')) ? g('status') : 'geplant';
  if (input.queue !== undefined) r.queue = input.queue === true || input.queue === 'true';
  if (input.sprint !== undefined) r.sprint = input.sprint === true || input.sprint === 'true';
  if (input.active !== undefined) r.active = !(input.active === 'false' || input.active === false);
  if (!r.title) fail(tr('--title missing.'));
  if (!KINDS.includes(r.kind)) fail(tr('--every missing: daily, weekly, monthly or days:N'));
  return r;
}

function runRecurringNow(root, { quiet = false } = {}) {
  const config = loadConfig(root);
  const due = dueRules(config, loadTasks(root));
  const made = [];
  for (const { rule, date, blockedBy } of due) {
    const r = config.recurring.find((x) => x.id === rule.id);
    if (blockedBy) {
      r.last = date;
      const prev = loadTasks(root).find((t) => t.id === blockedBy);
      if (prev) { addHistory(prev, tr('Recurring date {date} skipped, this task is still open', { date })); saveTask(prev); }
      continue;
    }
    const opts = { title: fillTitle(r.title, date), type: r.type || 'chore', priority: r.priority || 'P3', status: r.status || 'geplant', source: `wiederkehrend:${r.id}` };
    if (r.effort) opts.effort = r.effort;
    if (r.tags) opts.tags = r.tags;
    if (r.description) opts.description = r.description;
    if (r.due_days) opts.due = addDays(date, r.due_days);
    let task;
    if (r.template && findTemplate(root, r.template)) {
      const a = applyTemplate(findTemplate(root, r.template), { text: r.description || '', title: opts.title, criteria: null });
      task = createTask(root, config, { ...opts, type: r.type || a.type, priority: r.priority || a.priority, effort: r.effort || a.effort || undefined, tags: [...new Set([...a.tags, ...listFlag(r.tags)])].join(','), description: a.description, criteriaList: a.criteria });
    } else task = createTask(root, config, opts);
    r.last = date; r.lastTask = task.id;
    if (r.queue) config.queue = [...queueOf(config), task.id];
    const sp = activeSprint(config);
    if (r.sprint && sp) sp.tasks = [...new Set([...(sp.tasks || []), task.id])];
    made.push(task);
    if (!quiet) out(tr('Recurring task created: {id} {title} (rule {rule}, date {date})', { id: task.id, title: task.title, rule: r.id, date }));
  }
  if (due.length) { saveConfig(root, config); refresh(root); }
  return made;
}

function cmdRecur() {
  const root = requireRoot();
  const config = loadConfig(root);
  config.recurring = rules(config);
  const sub = pos.shift() || 'list';
  if (sub === 'add') {
    const max = Math.max(0, ...config.recurring.map((r) => parseInt(String(r.id).slice(1), 10) || 0));
    const r = recurRule(flags, { id: `R${max + 1}`, active: true, status: 'geplant', start: today() });
    config.recurring.push(r); saveConfig(root, config); refresh(root);
    out(tr('{id} {title}: {rule}, next dates {dates}', { id: r.id, title: r.title, rule: describe(r), dates: upcoming(r, 3).join(', ') }));
  } else if (sub === 'set') {
    const id = String(pos.shift() || '').toUpperCase();
    const i = config.recurring.findIndex((r) => r.id === id);
    if (i === -1) fail(tr('Rule {id} not found.', { id }));
    config.recurring[i] = recurRule(flags, config.recurring[i]);
    saveConfig(root, config); refresh(root);
    out(tr('{id} saved: {rule}', { id, rule: describe(config.recurring[i]) }));
  } else if (sub === 'remove') {
    const id = String(pos.shift() || '').toUpperCase();
    config.recurring = config.recurring.filter((r) => r.id !== id);
    saveConfig(root, config); refresh(root);
    out(tr('{id} removed.', { id }));
  } else if (sub === 'run') {
    const made = runRecurringNow(root);
    if (!made.length) out(tr('Nothing is due today.'));
  } else {
    if (!config.recurring.length) { out(tr('No recurring tasks. Create one: works recur add --title ".." --every monthly --weekday 1 --nth 1')); return; }
    for (const r of config.recurring) out(tr('{id} {paused}{title}: {rule}, next {date}', { id: r.id, paused: r.active === false ? tr('(paused) ') : '', title: r.title, rule: describe(r), date: upcoming(r, 1, r.last ? addDays(r.last, 1) : today())[0] }) + (r.lastTask ? tr(', last {id}', { id: r.lastTask }) : ''));
  }
}

// ---------- Projekte, GitHub, Kalender, Rückgängig ----------

async function cmdHub() {
  if (flags.list) { for (const p of projectList()) out(`${p.name}  ${p.path}`); return; }
  serveHub({ port: parseInt(flags.port || 4740, 10) });
  return new Promise(() => {});
}

function cmdGithub() {
  const root = requireRoot();
  const config = loadConfig(root);
  const sub = pos.shift() || 'sync';
  if (sub === 'set') {
    const s = syncSettings(config);
    for (const pair of pos) {
      const i = pair.indexOf('='); const k = pair.slice(0, i); const v = pair.slice(i + 1);
      if (k === 'labels') s.labels = listFlag(v);
      else if (k in DEFAULT_SYNC && typeof DEFAULT_SYNC[k] === 'boolean') s[k] = ['true', '1', 'ja', 'an'].includes(v.toLowerCase());
      else fail(tr('Unknown setting {key}. Allowed: {list}', { key: k, list: Object.keys(DEFAULT_SYNC).join(', ') }));
    }
    config.github_sync = s; saveConfig(root, config);
    out(s.enabled ? tr('GitHub sync: on') : tr('GitHub sync: off'));
    return;
  }
  if (sub === 'status') {
    const st = syncState(root);
    if (!st) { out(tr('No sync yet. works github sync')); return; }
    out(tr('{repo}, last {date}', { repo: st.repo, date: st.last }));
    for (const e of (st.events || []).slice(0, 15)) out(`  ${e.at.slice(0, 16).replace('T', ' ')}  ${e.text}`);
    return;
  }
  const r = syncGithub(root, { log: flags.quiet ? () => {} : (t) => out(t) });
  if (r.skipped) { if (!flags.quiet) out(tr('GitHub sync skipped: {reason}.', { reason: r.skipped })); return; }
  if (!flags.quiet) out(r.first ? tr('First sync with {repo}: state saved, changes are applied from now on.', { repo: r.repo }) : r.events.length ? tr('{n} change(s) applied from {repo}.', { n: r.events.length, repo: r.repo }) : tr('Nothing new from {repo}.', { repo: r.repo }));
}

function cmdIcal() {
  const root = requireRoot();
  const text = buildIcal(root, { recurring: !!flags.recurring });
  const file = path.resolve(flags.out && flags.out !== true ? String(flags.out) : path.join(worksDir(root), 'reports', 'termine.ics'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  out(tr('Calendar saved: {file}. While the board is running, you can also subscribe to it at /kalender.ics.', { file }));
}

function cmdUndo() {
  const root = requireRoot();
  if (flags.list) { const l = undoList(root); if (!l.length) out(tr('Nothing to undo.')); for (const e of l.slice(0, 20)) out(`${e.key}  ${e.at.slice(0, 16).replace('T', ' ')}  ${e.label}`); return; }
  try { const e = undo(root, pos[0]); refresh(root); out(tr('Undone: {label}', { label: e.label })); } catch (e) { fail(e.message); }
}

// ---------- Screenshots mit Playwright (W-0024) ----------

// works shot [board|sprint|queue|timeline|graph|table|live|<ID>] | --url <adresse>
//   [--widths 1440,390] [--themes light,dark] [--out ordner] [--asset <ID> --kind vorher|nachher --desc ".."]
// Board-Ansichten nutzen den laufenden Board-Server; läuft keiner, startet works einen und beendet ihn danach.
async function cmdShot() {
  // Mit --scenario (W-0035) braucht es kein works-Projekt; ein Projekt nur für --asset und den Standard-Ausgabeordner.
  const scenarioFile = flags.scenario && flags.scenario !== true ? String(flags.scenario) : '';
  const root = scenarioFile && !flags.asset ? findRoot() : requireRoot();
  const config = root ? loadConfig(root) : {};
  const list = (v, d) => String(v && v !== true ? v : d).split(',').map((s) => s.trim()).filter(Boolean);
  const widths = list(flags.widths, '1440,390').map(Number);
  const themes = list(flags.themes, 'light');
  if (widths.some((w) => !(w >= 200 && w <= 4000)) || themes.some((t) => !['light', 'dark'].includes(t))) fail(tr('--widths 200 to 4000, --themes light or dark.'));
  const asset = flags.asset && flags.asset !== true ? findTask(root, config, String(flags.asset)).id : '';
  const outDir = path.resolve(flags.out && flags.out !== true ? String(flags.out) : root ? path.join(worksDir(root), '.tmp', 'shots') : 'shots');
  let url = flags.url && flags.url !== true ? String(flags.url) : '';
  let name; let prepare = null; let started = null; let task = null; let perShot = null;
  if (scenarioFile) {
    if (!exists(scenarioFile)) fail(tr('Scenario not found: {file}', { file: scenarioFile }));
    const { loadScenario } = await import('./scenario.mjs');
    let sc;
    try { sc = await loadScenario(scenarioFile, { cli: OWN_CLI }); } catch (e) { fail(e.message.split('\n')[0]); }
    name = slugify(sc.name, 60) || 'szenario';
    perShot = sc.perShot;
  } else if (url) {
    if (!/^(https?|file):/i.test(url)) { if (exists(url)) url = pathToFileURL(path.resolve(url)).href; else fail(tr('--url needs http(s)://, file:// or an existing file path.')); }
    name = slugify(url.replace(/^[a-z]+:\/+/i, '').replace(/[?#].*$/, ''), 40) || 'seite';
  } else {
    const target = String(pos[0] || 'board');
    const view = target.toLowerCase();
    task = BOARD_VIEWS[view] ? null : findTask(root, config, target).id;
    let info = readServer(root);
    if (!info) {
      startDetached(root, { cli: newestCli(), port: 0, host: '127.0.0.1', takeover: false });
      info = started = await waitForServer(root, null);
      if (!info) fail(tr('Board server does not start. Details in .works/server.log'));
    }
    url = `http://127.0.0.1:${info.port}/`;
    name = task || view;
    prepare = boardPrepare({ view, task });
  }
  // --name bestimmt den Dateinamen für alle Arten (W-0034); sonst URL, Ansicht oder Aufgabe.
  if (flags.name && flags.name !== true) name = slugify(String(flags.name), 60) || name;
  const stopStarted = async () => { if (started) { await stopProcess(started.pid); clearServer(root, started.pid); } };
  const pw = loadPlaywright(root);
  if (!pw) {
    await stopStarted();
    out(tr('Playwright is missing. Run `npm install -g playwright` once (it downloads no browsers, the installed Chrome is used) or set NODE_PATH to a folder that contains playwright.'));
    process.exitCode = 2;
    return;
  }
  let shots;
  try { shots = await takeShots(pw, { url, name, out: outDir, widths, themes, prepare, perShot, fullPage: !task && !perShot, height: task ? 1100 : 900 }); } catch (e) { await stopStarted(); fail(e.message.split('\n')[0]); }
  await stopStarted();
  for (const s of shots) out(`${s.problems.length ? 'PROBLEM' : 'ok     '} ${s.theme} ${s.width}  ${s.file}${s.problems.length ? `  ${s.problems.join(' | ')}` : ''}`);
  if (asset) {
    const kind = flags.kind && flags.kind !== true ? normValue('kind', String(flags.kind)) : 'nachher';
    const desc = flags.desc && flags.desc !== true ? String(flags.desc) : `Screenshot ${name}`;
    for (const s of shots) {
      // Name mit Schema und Breite: Daran findet die Abnahme das passende Nachher-Bild (W-0030).
      const r = spawnSync(process.execPath, [process.argv[1], 'asset', asset, s.file, `--kind=${kind}`, `--name=${name}-${s.theme}-${s.width}`, `--desc=${desc} (${s.theme === 'dark' ? tr('{width} px, dark', { width: s.width }) : tr('{width} px, light', { width: s.width })})`], { cwd: root, encoding: 'utf8', windowsHide: true });
      if (r.status !== 0) fail(tr('Attaching to {id} failed: {error}', { id: asset, error: (r.stderr || r.stdout || '').trim().split('\n')[0] }));
    }
    out(shots.length === 1 ? tr('1 image attached to {id} (kind: {kind}).', { id: asset, kind }) : tr('{n} images attached to {id} (kind: {kind}).', { n: shots.length, id: asset, kind }));
  }
  if (shots.some((s) => s.problems.length)) process.exitCode = 1;
}

// ---------- Dateien ----------

function cmdFile() {
  const root = requireRoot();
  const config = loadConfig(root);
  if (!pos[0]) fail(tr('File missing. Example: works file src/commands/backup.ts'));
  const list = tasksForFile(root, config, pos[0]);
  if (flags.json) { out(JSON.stringify(list, null, 2)); return; }
  if (!list.length) { out(tr('No task changed {file} (commits with a task ID or edits during an active task).', { file: pos[0] })); return; }
  for (const x of list) {
    out(`${x.id}  ${STATUS_LABEL[x.status] || x.status || '?'}  ${x.title}`);
    out(`        ${[x.commits ? `${x.commits} Commit${x.commits === 1 ? '' : 's'}` : '', x.edits ? `${x.edits} Edit${x.edits === 1 ? '' : 's'}` : '', x.last ? tr('last {date}', { date: String(x.last).slice(0, 10) }) : ''].filter(Boolean).join(', ')}`);
    for (const d of x.decisions) out(`        ${tr('Decision {decision}', { decision: d })}`);
  }
}

function cmdFiles() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0] || loadState(root).active);
  const r = filesForTask(root, config, t.id);
  if (flags.json) { out(JSON.stringify(r, null, 2)); return; }
  if (!r.files.length) { out(tr('{id}: no files known yet.', { id: t.id })); return; }
  for (const f of r.files) out(`${f.file}${r.others[f.file] ? `   ${tr('also in {ids}', { ids: r.others[f.file].join(', ') })}` : ''}`);
}

// ---------- Import ----------

// Liest Aufgaben aus einer Datei, markiert Duplikate und legt sie erst mit --apply an.
function importPreview(root, file, opts = {}) {
  const config = loadConfig(root);
  const mapping = {};
  for (const pair of listFlag(opts.map)) { const i = pair.indexOf('='); if (i > 0) mapping[pair.slice(0, i).trim()] = pair.slice(i + 1).trim(); }
  const fmt = opts.format && opts.format !== true ? String(opts.format) : 'auto';
  if (!FORMATS.includes(fmt)) fail(tr('Unknown format {format}. Possible: {list}', { format: fmt, list: FORMATS.join(', ') }));
  const r = parseImport(file, { format: fmt, mapping, sheet: opts.sheet && opts.sheet !== true ? String(opts.sheet) : '', includeArchived: !!opts['include-archived'] });
  const existing = loadTasks(root);
  const bySource = new Map(existing.filter((t) => String(t.source || '').startsWith('import:')).map((t) => [String(t.source), t.id]));
  for (const c of r.candidates) {
    c.source = `import:${r.format}${c.key ? `:${String(c.key).slice(0, 60)}` : ''}`;
    if (c.key && bySource.has(c.source)) { c.dup = bySource.get(c.source); c.dupKind = tr('already imported'); continue; }
    let best = null;
    for (const t of existing) {
      const sc = similarity({ title: c.title, tags: c.tags, text: c.description }, { title: t.title, tags: t.tags, text: getSection(t._body, 'Beschreibung') || '' });
      if (sc >= 0.85 && (!best || sc > best.sc)) best = { id: t.id, sc };
    }
    if (best) { c.dup = best.id; c.dupKind = tr('{pct} % similar', { pct: Math.round(best.sc * 100) }); }
  }
  // Doppelte Einträge innerhalb der Datei
  const seen = new Map();
  for (const c of r.candidates) { const k = c.title.toLowerCase(); if (seen.has(k) && !c.dup) { c.dup = `#${seen.get(k)}`; c.dupKind = tr('duplicate in the file'); } else seen.set(k, c.n); }
  return r;
}

function importSelection(r, opts) {
  const only = new Set(listFlag(opts.only).map((x) => parseInt(x, 10)));
  const skip = new Set(listFlag(opts.skip).map((x) => parseInt(x, 10)));
  return r.candidates.filter((c) => {
    if (only.size) return only.has(c.n);
    if (skip.has(c.n)) return false;
    if (c.dup && !opts['keep-dups']) return false;
    if (['erledigt', 'verworfen'].includes(c.status) && !opts['include-done']) return false;
    return true;
  });
}

// works-Sicherung (W-0021): Vorschau mit Abgleich, dann Zusammenführen oder Wiederherstellen.
function importBackupCli(root, text, file) {
  let d;
  try { d = readBackup(text); } catch (e) { fail(e.message); }
  const mode = flags.mode && flags.mode !== true ? String(flags.mode) : 'merge';
  if (!['merge', 'restore'].includes(mode)) fail(tr('--mode is merge (combine) or restore (replace).'));
  const cmp = compareBackup(root, d);
  const count = (n) => (n === 1 ? tr('1 task') : tr('{n} tasks', { n }));
  if (!flags.apply) {
    out(tr('works backup of {project} from {date}: {count}.', { project: d.project || tr('an unknown project'), date: String(d.exported || '').slice(0, 16).replace('T', ' '), count: count(d.tasks.length) }));
    out(tr('{new} new, {changed} changed, {same} unchanged, {here} only here.', { new: cmp.counts.neu, changed: cmp.counts.geaendert, same: cmp.counts.gleich, here: cmp.counts.nurHier }));
    for (const i of cmp.items) {
      if (i.kind === 'gleich') continue;
      const ch = (i.changes || []).map((c) => (c.from !== undefined ? `${c.label} ${c.from || '–'} → ${c.to || '–'}` : c.label)).join(', ');
      out(`${i.kind === 'neu' ? '+' : '~'} ${String(i.n).padStart(3)}  ${i.id}${i.localId && i.localId !== i.id ? ` ${tr('(here {id})', { id: i.localId })}` : ''}  ${i.title}${ch ? `  [${ch}]` : ''}`);
    }
    for (const t of cmp.onlyHere) out(`  ${tr('only here')}  ${t.id}  ${t.title}`);
    out(`\n${tr('Merge: works import {file} --apply  (pick with --only 1,4)', { file })}`);
    out(tr('Restore, replaces the current state after backing it up: works import {file} --apply --mode=restore', { file }));
    return;
  }
  if (mode === 'restore') {
    const r = restoreBackup(root, d);
    snapshotRestore(root, { label: tr('Restored from {source} ({n} tasks)', { source: d.project || tr('a backup'), n: r.tasks }), backup: r.backup });
    refresh(root);
    out(tr('Restored: {count}. The previous state is in {backup}. Undo with works undo.', { count: count(r.tasks), backup: r.backup }));
    return;
  }
  const only = flags.only ? listFlag(flags.only).map(Number) : null;
  const r = mergeBackup(root, d, { only, snapshot: (o) => snapshot(root, o) });
  refresh(root);
  out(tr('Merged: {created} new{createdIds}, {updated} updated{updatedIds}. Undo with works undo.', { created: r.created.length, createdIds: r.created.length ? ` (${r.created.join(', ')})` : '', updated: r.updated.length, updatedIds: r.updated.length ? ` (${r.updated.join(', ')})` : '' }));
}

function cmdImport() {
  const root = requireRoot();
  const file = pos[0];
  if (!file || !exists(file)) fail(tr('File missing or not found. Example: works import trello.json [--apply]'));
  if (/\.json$/i.test(file)) {
    const text = readText(file);
    let isBackup = false;
    try { isBackup = JSON.parse(text).format === BACKUP_FORMAT; } catch { /* anderes JSON, normaler Import */ }
    if (isBackup) return importBackupCli(root, text, file);
  }
  let r;
  try { r = importPreview(root, path.resolve(file), flags); } catch (e) { fail(e.message); }
  const pick = importSelection(r, flags);
  if (flags.json && !flags.apply) { out(JSON.stringify({ format: r.format, mapping: r.mapping || null, header: r.header || null, sheets: r.sheets || null, sheet: r.sheet || null, candidates: r.candidates, selected: pick.map((c) => c.n) }, null, 2)); return; }
  if (!flags.apply) {
    const sheet = r.sheet ? tr(', sheet {sheet}', { sheet: r.sheet }) + (r.sheets && r.sheets.length > 1 ? tr(' (others: {list})', { list: r.sheets.filter((x) => x !== r.sheet).join(', ') }) : '') : '';
    const found = r.candidates.length === 1 ? tr('1 entry found') : tr('{n} entries found', { n: r.candidates.length });
    const would = pick.length === 1 ? tr('1 would be created') : tr('{n} would be created', { n: pick.length });
    out(tr('Format: {format}{sheet}. {found}, {would}.', { format: r.format, sheet, found, would }));
    if (r.mapping) out(tr('Columns: {list}', { list: Object.entries(r.mapping).map(([k, v]) => `${k}=${v}`).join(', ') }));
    for (const c of r.candidates.slice(0, flags.all ? 2000 : 60)) {
      const flagsTxt = [c.status && c.status !== 'backlog' ? c.status : '', c.priority, c.effort, c.due ? tr('due {date}', { date: c.due }) : '', c.tags.length ? '#' + c.tags.join(' #') : '', c.criteria.length ? tr('{n} criteria', { n: c.criteria.length }) : ''].filter(Boolean).join(', ');
      out(`${pick.includes(c) ? '+' : '-'} ${String(c.n).padStart(3)}  ${c.type.padEnd(8)} ${c.title}${flagsTxt ? `  (${flagsTxt})` : ''}${c.dup ? `  [${c.dupKind}: ${c.dup}]` : ''}`);
    }
    if (r.candidates.length > 60 && !flags.all) out(tr('… {n} more, all with --all', { n: r.candidates.length - 60 }));
    const done = r.candidates.filter((c) => ['erledigt', 'verworfen'].includes(c.status)).length;
    if (done && !flags['include-done']) out(tr('{n} done or dropped are skipped, include them with --include-done.', { n: done }));
    out(`\n${tr('Create with: works import {file} --apply{extra}  (pick with --only 1,4,7 or --skip 3, default column with --status geplant, extra tags with --tags)', { file, extra: `${flags.format && flags.format !== true ? ` --format=${flags.format}` : ''}${flags.map ? ` --map="${flags.map}"` : ''}` })}`);
    return;
  }
  const config = loadConfig(root);
  const extraTags = listFlag(flags.tags);
  const created = [];
  for (const c of pick) {
    let status = normValue('status', c.status || (flags.status && flags.status !== true ? String(flags.status) : 'backlog'));
    const was = status;
    if (['in-arbeit', 'review'].includes(status)) status = 'geplant';
    const desc = c.description || '';
    const t = createTask(root, config, {
      type: TYPES.includes(c.type) ? c.type : 'feature', title: c.title, priority: c.priority || (flags.priority && flags.priority !== true ? String(flags.priority) : 'P3'),
      status, effort: EFFORTS.includes(c.effort) ? c.effort : undefined, due: /^\d{4}-\d{2}-\d{2}$/.test(c.due || '') ? c.due : undefined,
      tags: [...new Set([...(c.tags || []), ...extraTags])].join(','), description: desc || undefined,
      criteriaList: (c.criteria || []).map((x) => x.text), source: c.source, incomplete: !desc && !(c.criteria || []).length,
    });
    const fresh = loadTask(t._dir);
    let body = fresh._body;
    for (const x of (c.criteria || []).filter((y) => y.done)) body = body.replace(`- [ ] ${x.text}`, `- [x] ${x.text}`);
    fresh._body = body;
    if (status === 'erledigt') fresh.completed = today();
    addHistory(fresh, tr('Imported from {format} ({origin})', { format: r.format, origin: c.origin }) + (was !== status ? tr(', there {status}', { status: STATUS_LABEL[was] || was }) : ''));
    saveTask(fresh, { touch: false });
    created.push(fresh.id);
  }
  refresh(root);
  out(created.length ? tr('Imported: {count} ({range}).', { count: created.length === 1 ? tr('1 task') : tr('{n} tasks', { n: created.length }), range: created[0] + (created.length > 1 ? tr(' to {id}', { id: created[created.length - 1] }) : '') }) : tr('Nothing imported.'));
  const inc = created.length ? loadTasks(root).filter((t) => created.includes(t.id) && t.incomplete).length : 0;
  if (inc) out(tr('{n} of them without description and criteria, marked as incomplete.', { n: inc }));
}

// ---------- Parallelarbeit ----------

function cmdParallel() {
  const root = requireRoot();
  const config = loadConfig(root);
  const sub = ['plan', 'start', 'prompt', 'status', 'finish', 'abort'].includes(pos[0]) ? pos.shift() : 'status';
  const ids = () => pos.join(',').split(',').map((x) => x.trim()).filter(Boolean).map((x) => normalizeId(config, x));
  try {
    if (sub === 'plan') {
      const p = planParallel(root, { ids: ids(), max: flags.max });
      if (flags.json) { out(JSON.stringify(p, null, 2)); return; }
      const head = { parallel: tr('Recommendation: in parallel with agents'), nacheinander: tr('Recommendation: one after another in this session'), unsicher: tr('Unsure: ask the user before starting agents') }[p.verdict];
      out(head);
      for (const r of p.reasons) out(`- ${r}`);
      if (p.lanes.length && p.verdict !== 'nacheinander') {
        out(`\n${tr('Lanes:')}`);
        for (const l of p.lanes) out(`  ${l.id}  ${l.effort || '-'}  ${l.title}${l.files.length ? `\n        ${tr('Files: {list}', { list: l.files.slice(0, 5).join(', ') })}` : ''}`);
      }
      if (p.later.length) out(`\n${tr('Then: {ids}', { ids: p.later.map((x) => x.id).join(', ') })}`);
      if (p.skipped.length) { out(`\n${tr('Not suitable for agents:')}`); for (const x of p.skipped.slice(0, 10)) out(`  ${x.id}  ${x.why.join(', ')}`); }
      if (p.running.length) out(`\n${tr('Already running in parallel: {ids}', { ids: p.running.join(', ') })}`);
      if (p.verdict === 'parallel') out(`\n${tr('Start: works parallel start {ids}, then one agent per lane with the brief from works parallel prompt <ID>.', { ids: p.lanes.map((l) => l.id).join(',') })}`);
      if (p.verdict === 'unsicher') out(`\n${tr('Tell the user the reasons and ask: start in parallel or work one after another?')}`);
      return;
    }
    if (sub === 'start') {
      const list = ids();
      if (!list.length) fail(tr('IDs missing. Example: works parallel start W-0012,W-0015'));
      const all = loadTasks(root);
      const started = [];
      for (const id of list) {
        const t = all.find((x) => x.id === id);
        if (!t) fail(tr('Task {id} not found.', { id }));
        if (isBlocked(t, byIdMap(all)) && !flags.force) fail(tr('{id} is blocked. Use --force to override this deliberately.', { id }));
        if (['erledigt', 'verworfen'].includes(t.status)) fail(tr('{id} is {status}.', { id, status: t.status }));
        if (t.status === 'review' && !flags.force) fail(tr('{id} is in review. Use --force to continue in parallel anyway.', { id }));
        const lane = startLane(root, t);
        const old = t.status;
        t.status = 'in-arbeit';
        t.branch = lane.branch;
        addHistory(t, tr('Parallel start in worktree {worktree}', { worktree: path.basename(lane.path) }) + (old !== 'in-arbeit' ? ` (Status: ${old} → in-arbeit)` : ''));
        saveTask(t);
        started.push(lane);
      }
      refresh(root);
      for (const l of started) out(tr('{id}: worktree {path}, branch {branch}', { id: l.task, path: l.path, branch: l.branch }));
      out(`\n${tr('Now start one agent per lane, all at the same time. Brief: works parallel prompt <ID>. Then works parallel status and works parallel finish <ID>.')}`);
      return;
    }
    if (sub === 'prompt') {
      const t = findTask(root, config, pos[0]);
      const lane = laneOf(root, t.id);
      if (!lane) fail(tr('{id} is not running in parallel. Run works parallel start {id} first.', { id: t.id }));
      out(lanePrompt(root, t, lane, path.join(SKILL_DIR, 'scripts', 'works.mjs')));
      return;
    }
    if (sub === 'finish') {
      const t = findTask(root, config, pos[0]);
      const r = finishLane(root, t.id, { merge: !!flags.merge, force: !!flags.force });
      const fresh = findTask(root, config, t.id);
      if (fresh.status === 'in-arbeit') { fresh.status = 'review'; addHistory(fresh, tr('Parallel work finished (Status: in-arbeit → review)')); }
      else addHistory(fresh, tr('Parallel work finished') + (r.merged ? tr(', {branch} merged', { branch: r.lane.branch }) : ''));
      saveTask(fresh);
      refresh(root);
      out(tr('{id}: worktree removed.{detail} Finish with works done {id}.', { id: t.id, detail: r.merged ? tr(' {branch} is merged into {base}.', { branch: r.lane.branch, base: r.lane.base }) : tr(' Branch {branch} stays with {commits} for review or PR.', { branch: r.lane.branch, commits: `${r.lane.ahead} Commit${r.lane.ahead === 1 ? '' : 's'}` }) }));
      return;
    }
    if (sub === 'abort') {
      const t = findTask(root, config, pos[0]);
      const r = abortLane(root, t.id, { force: !!flags.force });
      const fresh = findTask(root, config, t.id);
      if (fresh.status === 'in-arbeit') fresh.status = 'geplant';
      addHistory(fresh, tr('Parallel work aborted') + (r.branchKept ? tr(', branch {branch} kept', { branch: r.lane.branch }) : ''));
      saveTask(fresh);
      refresh(root);
      out(tr('{id}: aborted.', { id: t.id }) + (r.branchKept ? tr(' Branch {branch} with {n} commits is kept.', { branch: r.lane.branch, n: r.lane.ahead }) : ''));
      return;
    }
    const lanes = loadLanes(root).map((l) => laneInfo(root, l));
    if (flags.json) { out(JSON.stringify(lanes, null, 2)); return; }
    const here = laneLink();
    if (here) out(tr('This folder is the worktree of {id}.', { id: here.task }));
    if (!lanes.length) { out(tr('No parallel tasks. Check with works parallel plan.')); return; }
    const all = loadTasks(root);
    for (const l of lanes) {
      const t = all.find((x) => x.id === l.task);
      out(`${l.task}  ${t ? STATUS_LABEL[t.status] : '?'}  ${t ? t.title : ''}`);
      out(`        ${l.branch}, ${l.ahead} Commit${l.ahead === 1 ? '' : 's'}, ${l.dirty ? tr('{n} files uncommitted', { n: l.dirty }) : tr('clean')}${l.status !== 'aktiv' ? `, ${l.status}` : ''}${l.exists ? '' : tr(', worktree missing')}`);
    }
  } catch (e) { fail(e.message); }
}

async function cmdInstallCli() {
  const { installCli, uninstallCli } = await import('./cli-install.mjs');
  if (flags.uninstall || flags.remove) {
    const r = uninstallCli({ dir: flags.dir && flags.dir !== true ? String(flags.dir) : undefined, dryRun: !!flags['dry-run'] });
    out(r.length ? `${tr('Removed')}${flags['dry-run'] ? tr(' (dry run)') : ''}:\n${r.map((x) => `  ${x}`).join('\n')}` : tr('The works command was not set up.'));
    return;
  }
  const r = installCli({ dir: flags.dir && flags.dir !== true ? String(flags.dir) : undefined, path: !flags['no-path'], dryRun: !!flags['dry-run'] });
  out(tr('works command set up{dry}.', { dry: flags['dry-run'] ? tr(' (dry run, nothing written)') : '' }));
  for (const n of r.notes) out(`  ${n}`);
  if (r.pathChanged) out(`  ${tr('PATH extended in: {file}', { file: r.pathChanged })}`);
  out('');
  if (r.onPath) out(tr('From now on, in any folder: works board --serve --open, works new --title "...", works hub, works help'));
  else out(tr('Open a new terminal{alt}. Then, in any folder: works board --serve --open, works new --title "...", works hub, works help', { alt: process.platform === 'win32' ? '' : tr(' or run once: export PATH="{dir}:$PATH"', { dir: r.shimDir }) }));
  out(tr('The launcher always uses the newest installed works version, even after plugin updates. Remove it with works install-cli --uninstall.'));
}

function cmdVersion() {
  out(`works ${cliVersion(path.join(SKILL_DIR, 'scripts', 'works.mjs'))}`);
  out(`CLI: ${path.join(SKILL_DIR, 'scripts', 'works.mjs')}`);
  out(`Node ${process.version}`);
}

// ---------- Sprache (W-0041) ----------

// works lang [code] [--project] [--reset]: zeigen oder global (~/.works/settings.json) bzw. für das Projekt setzen.
function cmdLang() {
  const root = findRoot();
  const configFile = root && path.join(worksDir(root), 'config.json');
  if (flags.project && !root) fail(tr('No .works folder found. Run `works init` in the project root first.'));
  const where = (src) => ({
    env: tr('from the environment variable WORKS_LANG'),
    project: tr('for this project in {file}', { file: configFile }),
    global: tr('globally in {file}', { file: settingsFile() }),
    default: tr('default'),
  })[src.source];
  const name = (l) => LANGUAGE_NAMES[l] || l;
  if (pos[0] || flags.reset) {
    const lang = flags.reset ? null : normLang(pos[0]);
    if (lang && !languages().includes(lang)) fail(tr('Unknown language "{lang}". Available: {list}', { lang: pos[0], list: languages().join(', ') }));
    const file = flags.project ? configFile : settingsFile();
    const data = readJson(file, {}) || {};
    if (lang) data.language = lang; else delete data.language;
    writeJson(file, data);
    setLanguage(null);
  }
  const src = languageSource(root);
  out(tr('Language: {name} ({lang}), {where}', { name: name(src.lang), lang: src.lang, where: where(src) }));
  if (pos[0] && !flags.project && src.source !== 'global') out(tr('Note: {where} takes precedence ({lang}). Remove it with `works lang --reset --project`.', { where: where(src), lang: src.lang }));
  if (!pos[0] && !flags.reset) {
    out(tr('Available: {list}', { list: languages().map((l) => `${l} (${name(l)})`).join(', ') }));
    out(tr('Change: works lang <code> (global), works lang <code> --project, works lang --reset [--project]'));
  }
}

async function cmdSelftest() {
  const { selftest } = await import('./selftest.mjs');
  const r = await selftest({ keep: !!flags.keep, browser: !!flags.browser, verbose: !!flags.verbose, only: flags.only && flags.only !== true ? String(flags.only) : '' });
  process.exit(r.ok ? 0 : 1);
}

// ---------- Discord-Bot (W-0036) ----------

// Token von der Eingabe lesen: im Terminal versteckt, sonst aus einer Pipe (Get-Clipboard | works discord token).
async function readHidden(prompt) {
  const stdin = process.stdin;
  if (!stdin.isTTY) { let s = ''; for await (const c of stdin) s += c; return s; }
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    let s = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n' || c === '\u0004') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); resolve(s); return; }
        if (c === '\u0003') { stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130); }
        if (c === '\u007f' || c === '\b') s = s.slice(0, -1); else s += c;
      }
    };
    stdin.on('data', onData);
  });
}

async function cmdDiscord() {
  const d = await import('./discord.mjs');
  const sub = pos[0] || 'status';
  const cfg = d.loadDiscordConfig();
  const token = d.loadToken();
  const shared = d.isShared(cfg);
  const key = d.loadKey();
  // Token, Kopplung, Kanalwahl und Test teilt sich die CLI mit dem Board (discord.mjs, W-0038).
  const call = async (fn) => { try { return await fn(); } catch (e) { return fail(e.message); } };

  if (sub === 'status') {
    if (!token && !key) {
      // Entwurf R (W-0040): zuerst die Wahl, der gemeinsame Bot ist empfohlen.
      const info = await d.serviceInfo(cfg);
      out('Discord-Bot works: nicht eingerichtet. Zwei Wege:\n');
      out('Gemeinsamer Bot (empfohlen, ohne Token):');
      out(`  1. Bot einladen: ${info ? info.invite_url : '(der Dienst ist nicht erreichbar oder hat noch keine Adresse: works discord set service=https://…)'}`);
      out('  2. In Discord im gewünschten Kanal: /works verbinden (braucht „Server verwalten“)');
      out('  3. Code eintragen: works discord link <Code>');
      out('  Die Nachrichten laufen dann über den works-Dienst. Er speichert keine Inhalte.\n');
      out('Eigener Bot (nichts läuft über fremde Server):');
      out('  1. Im Discord-Entwicklerportal eine Anwendung mit Bot anlegen: https://discord.com/developers/applications');
      out('  2. Token eintragen: works discord token (fragt danach, oder Get-Clipboard | works discord token)');
      out('  3. Bot mit dem Link aus Schritt 2 einladen, dann Kanal wählen: works discord channel');
      return;
    }
    out(`Discord-Bot works: ${cfg.channel_id ? 'eingerichtet' : 'Token hinterlegt, Kanal fehlt'} (${shared ? 'Gemeinsamer Bot' : 'Eigener Bot'})`);
    out(shared ? `Bot: ${cfg.bot_name || '?'} über ${(() => { try { return d.serviceBase(cfg); } catch { return '?'; } })()}, Geräteschlüssel ${d.maskToken(key)} (nur auf diesem Rechner)` : `Bot: ${cfg.bot_name || '?'}, Token ${d.maskToken(token)} (nur auf diesem Rechner)`);
    if (!cfg.channel_id) { out(`Nächster Schritt: einladen mit ${d.inviteUrl(cfg.app_id)}\nDanach Kanal wählen: works discord channel`); return; }
    out(`Kanal: #${cfg.channel_name} auf ${cfg.guild_name}`);
    const info = d.botInfo();
    out(info ? `Prozess: läuft (PID ${info.pid}, seit ${new Date(info.started).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })})` : `Prozess: gestoppt${cfg.autostart === false ? ', Autostart aus' : ', startet mit dem Board'}`);
    const evs = Object.entries(cfg.events);
    out(`Ereignisse: ${evs.filter(([, v]) => v.on).length} von ${evs.length} an, mit Erwähnung: ${evs.filter(([, v]) => v.on && v.at).map(([k]) => k).join(', ') || 'keine'}`);
    out(`Ruhezeit: ${cfg.quiet.on ? `${cfg.quiet.from} bis ${cfg.quiet.to}` : 'aus'}. Verzögerung: Freigabe ${cfg.delays.perm} s, fertig ${cfg.delays.idle} s`);
    const waiting = d.readOutbox().length;
    if (waiting) out(`Wartende Ereignisse: ${waiting}`);
    return;
  }

  if (sub === 'token') {
    if (pos[1]) fail('Das Token nicht als Argument angeben, sonst steht es in der Shell-Historie. Über die Eingabe: works discord token (fragt danach) oder Get-Clipboard | works discord token');
    try { d.apiBase(); } catch (e) { fail(e.message); }
    const t = await readHidden('Token des Bots einfügen (wird nicht angezeigt): ');
    const r = await call(() => d.setToken(t));
    out(`Token gültig: ${r.bot_name}${r.owner ? ', Besitzer erkannt (wird bei Erwähnungen angesprochen)' : ''}.`);
    out('Gespeichert nur auf diesem Rechner, nicht im Projekt.');
    out(`\nBot auf deinen Server einladen:\n${r.invite_url}\n\nDanach Kanal wählen: works discord channel`);
    if (r.restarted) out('Laufender Bot mit dem neuen Token neu gestartet.');
    return;
  }

  if (sub === 'link') {
    if (!String(pos[1] || '').trim()) fail('works discord link <Code>. Den Code gibt /works verbinden in Discord, im Kanal, in den works schreiben soll.');
    const j = await call(() => d.linkCode(pos[1]));
    out(`Gekoppelt: #${j.channel_name} auf ${j.guild_name} über den gemeinsamen Bot ${j.bot_name}. Erwähnt wird, wer /works verbinden ausgeführt hat.`);
    out('Der Geräteschlüssel liegt nur auf diesem Rechner. Der Bot startet mit dem Board, sofort mit works discord start.');
    return;
  }

  if (sub === 'unlink') {
    if (!shared || !key) fail('Nicht mit dem gemeinsamen Bot gekoppelt.');
    await d.disconnect();
    out('Getrennt: Geräteschlüssel gelöscht, Bot gestoppt. Die Nachrichten in Discord bleiben stehen.');
    return;
  }

  // Kanalwahl (W-0038): live vom Bot, mit Schreibrecht; beim gemeinsamen Bot die Kanäle des gekoppelten Servers.
  if (sub === 'channel') {
    if (!token && !key) fail('Discord-Bot ist nicht eingerichtet. works discord zeigt die Schritte.');
    const list = await call(() => d.channelsOf(cfg));
    if (!list.guilds.length) { out(`works ist noch auf keinem Server. Einladen:\n${d.inviteUrl(cfg.app_id)}`); return; }
    const chans = list.guilds.flatMap((g) => g.channels.map((c) => ({ ...c, guild: g })));
    if (!pos[1]) {
      for (const g of list.guilds) out(`${g.name}: ${g.channels.map((c) => `#${c.name}${c.can ? '' : ` (${c.why})`}`).join(', ') || 'keine Textkanäle'}`);
      out('\nWählen mit works discord channel <name>. Am besten ein eigener Kanal wie #works.');
      return;
    }
    const want = String(pos[1]).replace(/^#/, '');
    const hits = chans.filter((c) => c.id === want || c.name === want);
    if (!hits.length) fail(`Kanal ${want} nicht gefunden. Vorhanden: ${chans.map((c) => `#${c.name}`).join(', ')}`);
    if (hits.length > 1) fail(`#${want} gibt es mehrfach. Bitte die Kanal-ID angeben: ${hits.map((h) => `${h.guild.name}: ${h.id}`).join(', ')}`);
    const c = await call(() => d.moveChannel(hits[0].id, list));
    out(`Kanal: #${c.channel_name} auf ${c.guild_name}. ${c.running ? 'Der laufende Bot zieht das Dashboard gleich um.' : 'Der Bot startet mit dem Board, sofort mit works discord start.'}`);
    return;
  }

  if (sub === 'set') {
    const pairs = pos.slice(1);
    if (!pairs.length) fail('works discord set schlüssel=wert ..., etwa delay.perm=60 quiet.on=aus privacy.costs=aus event.ci_red.at=an');
    for (const p of pairs) {
      const i = p.indexOf('=');
      if (i < 1) fail(`${p}: schlüssel=wert erwartet.`);
      try { d.applySetting(cfg, p.slice(0, i), p.slice(i + 1)); } catch (e) { fail(e.message); }
    }
    d.saveDiscordConfig(cfg);
    out(`Gespeichert: ${pairs.join(', ')}`);
    return;
  }

  if (sub === 'test') {
    const r = await call(() => d.sendTest(cfg));
    out(`Testnachricht gesendet an #${r.channel_name}.`);
    return;
  }

  if (sub === 'start' || sub === 'restart') {
    if (!d.isConfigured(cfg)) fail('Discord-Bot ist nicht eingerichtet. works discord zeigt die Schritte.');
    if (sub === 'restart') await d.stopBot();
    const r = await d.ensureBot({ force: true });
    if (r === 'läuft') { out(`Bot läuft schon (PID ${d.botInfo().pid}).`); return; }
    const until = Date.now() + 15000;
    while (Date.now() < until && !d.botInfo()) await new Promise((res) => setTimeout(res, 100));
    const info = d.botInfo();
    if (!info) {
      let last = '';
      try { last = fs.readFileSync(d.dfile('bot.log'), 'utf8').trim().split('\n').pop(); } catch { /* kein Log */ }
      fail(`Bot startet nicht. ${last}`);
    }
    out(`Bot gestartet (PID ${info.pid}). Protokoll: ${d.dfile('bot.log')}`);
    return;
  }

  if (sub === 'stop') { out(await d.stopBot() ? 'Bot gestoppt.' : 'Bot lief nicht.'); return; }

  if (sub === 'emit') {
    let data = {};
    try { data = flags.json && flags.json !== true ? JSON.parse(String(flags.json)) : {}; } catch { fail('--json ist kein gültiges JSON.'); }
    d.emit(String(pos[1] || ''), data, findRoot() || '');
    return;
  }

  if (sub === 'run') {
    const { runBot } = await import('./discord-bot.mjs');
    process.exit(await runBot());
  }

  if (sub === 'disconnect') {
    await d.disconnect();
    out(`${key ? 'Geräteschlüssel widerrufen und gelöscht' : 'Token gelöscht'}, Bot gestoppt. Die Nachrichten in Discord bleiben stehen.`);
    return;
  }

  fail(`Unbekannt: works discord ${sub}. Möglich: status, link, unlink, token, channel, set, test, start, stop, restart, disconnect`);
}

// ---------- Dispatcher ----------

const commands = {
  help: cmdHelp, init: cmdInit, new: cmdNew, list: cmdList, ls: cmdList, show: cmdShow,
  set: cmdSet, log: cmdLog, question: cmdQuestion, link: cmdLink, unlink: cmdLink,
  start: cmdStart, handoff: cmdHandoff, dod: cmdDod, done: cmdDone, ship: cmdShip, drop: cmdDrop,
  reopen: cmdReopen, archive: cmdArchive, next: cmdNext, status: cmdStatus, index: cmdIndex,
  board: cmdBoard, doctor: cmdDoctor, asset: cmdAsset, inbox: cmdInbox, compress: cmdCompress,
  decisions: cmdDecisions, 'attach-doc': cmdAttachDoc, idea: cmdIdea, ideas: cmdIdeas,
  promote: cmdPromote, milestone: cmdMilestone, scan: cmdScan, 'gh-import': cmdGhImport,
  'gh-export': cmdGhExport, commits: cmdCommits, changelog: cmdChangelog, report: cmdReport,
  'install-hooks': cmdInstallHooks, section: cmdSection, check: cmdCheck, item: cmdItem,
  'idea-drop': cmdIdeaDrop, demo: cmdDemo, queue: cmdQueue, share: cmdShare, export: cmdExport,
  sprint: cmdSprint, comment: cmdComment, comments: cmdComments, views: cmdViews, template: cmdTemplate,
  templates: cmdTemplate, time: cmdTime, checks: cmdChecks,
  design: cmdDesign, instruct: cmdInstruct, know: cmdKnow, wissen: cmdKnow, recur: cmdRecur, hub: cmdHub,
  github: cmdGithub, gh: cmdGithub, ical: cmdIcal, undo: cmdUndo, discord: cmdDiscord,
  file: cmdFile, files: cmdFiles, parallel: cmdParallel, par: cmdParallel, import: cmdImport, shot: cmdShot, selftest: cmdSelftest, 'install-cli': cmdInstallCli, version: cmdVersion, '--version': cmdVersion,
  lang: cmdLang, language: cmdLang,
};

const fn = commands[cmd];
if (!fn) fail(tr('Unknown command "{cmd}". `works help` shows all commands.', { cmd }));
Promise.resolve(fn()).catch((e) => fail(e.stack || e.message));
