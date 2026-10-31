#!/usr/bin/env node
// works: Aufgabenverwaltung im Projektordner .works/
// Aufruf: node "${CLAUDE_SKILL_DIR}/scripts/works.mjs" <befehl> [argumente]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import {
  SKILL_DIR, STATUSES, OPEN_STATUSES, CLOSED_STATUSES, STATUS_LABEL, PRIORITIES, PRIO_LABEL,
  TYPES, TYPE_LABEL, EFFORTS, RISKS, BRANCH_PREFIX, FIELD_ORDER, LIST_FIELDS, DEFAULT_CONFIG,
  today, nowStamp, daysBetween, slugify, fail, warn, run, exists, readJson, writeJson,
  findRoot, requireRoot, worksDir, loadConfig, saveConfig, loadState, saveState,
  formatId, idNumber, normalizeId, parseFrontmatter, serializeFrontmatter,
  getSection, setSection, appendToSection, stripComments, checkboxes, hasContent, imageLinks,
  loadTasks, loadTask, findTask, saveTask, addHistory, relFromWorks, isBlocked, openBlockers,
  isOverdue, openQuestions, sortTasks, readTemplate, fillTemplate, parseArgs, listFlag,
  queueOf, pruneQueue,
} from './lib.mjs';
import { generateIndex, nextCandidates, dodCheck, sessionSummary, byIdMap, milestoneProgress } from './views.mjs';
import { generateBoard, refreshBoardIfPresent } from './board.mjs';
import { serveBoard } from './serve.mjs';
import { shareLinks, rotateKeys } from './share.mjs';
import { buildSnapshot, snapshotName } from './export.mjs';
import { sprintSettings, sprintList, activeSprint, lastClosedSprint, nextSprintId, sprintStats, pointsOf, addDays } from './sprint.mjs';
import { addComment, loadComments, unreadForClaude, markRead } from './comments.mjs';
import { listTemplates, findTemplate, saveTemplate, deleteTemplate, templateFromTask, applyTemplate, countUse } from './templates.mjs';
import { taskTime, estimates, fmtDuration } from './timelog.mjs';
import { configuredChecks, checksFor, detectChecks, runChecks, recordCheck, ackCheck, loadResults, NAME_RE } from './checks.mjs';
import { writeWeekly, reportSettings, setWebhook } from './weekly.mjs';
import { seedDemo, simulate, defaultDemoPath } from './demo.mjs';
import { adaptToType, repairTasks, insertAfter, GOAL_SECTION } from './sections.mjs';
import { readServer, clearServer, findServerProcesses, stopProcess, startDetached, newestCli, cliVersion } from './server-control.mjs';

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'];
const ASSET_KINDS = ['ist', 'vorher', 'nachher', 'referenz', 'mockup', 'skizze', 'fehler', 'diagramm'];

const { pos, flags } = parseArgs(process.argv.slice(2));
const cmd = pos.shift() || 'help';

const out = (s = '') => process.stdout.write(s + '\n');
// Ausgabe in eine geschlossene Pipe (etwa | head) ist kein Fehler.
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); throw e; });

function refresh(root) {
  generateIndex(root);
  refreshBoardIfPresent(root);
}

function validateEnum(name, value, allowed) {
  if (value === undefined || value === null || value === '') return;
  if (!allowed.includes(value)) fail(`Ungültiger Wert für ${name}: "${value}". Erlaubt: ${allowed.join(', ')}`);
}

function normPriority(p) {
  if (p === undefined || p === true) return undefined;
  const s = String(p).toUpperCase();
  return /^\d$/.test(s) ? `P${s}` : s;
}

// ---------- init ----------

function cmdInit() {
  const root = path.resolve(flags.path || process.cwd());
  const wd = path.join(root, '.works');
  if (exists(path.join(wd, 'config.json')) && !flags.force) {
    out(`.works existiert bereits in ${root}. Mit --force werden fehlende Dateien ergänzt.`);
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
  const ignore = ['# works: generierte und lokale Dateien', 'board.html', 'state.json', 'server.json', 'server.log', '.tmp/', 'share.json', 'inbox/*', '!inbox/.gitkeep'];
  if (mode === 'assets') ignore.push('tasks/*/assets/', 'archive/*/assets/');
  if (mode === 'all') ignore.splice(1, ignore.length - 1, '*', '!.gitignore');
  if (mode !== 'none') fs.writeFileSync(path.join(wd, '.gitignore'), ignore.join('\n') + '\n');
  refresh(root);
  out(`works initialisiert in ${wd}`);
  out('Nächste Schritte: Aufgabe anlegen mit `works new`, optional Hooks mit `works install-hooks`.');
}

// ---------- new ----------

function createTask(root, config, opts) {
  const type = opts.type || 'feature';
  validateEnum('type', type, TYPES);
  const priority = normPriority(opts.priority) || 'P3';
  validateEnum('priority', priority, PRIORITIES);
  const status = opts.status || 'backlog';
  validateEnum('status', status, STATUSES);
  validateEnum('effort', opts.effort, EFFORTS);
  validateEnum('risk', opts.risk, RISKS);
  if (!opts.title || opts.title === true) fail('Titel fehlt (--title "...").');

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
    effort: opts.effort || null, risk: opts.risk || null,
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
  if (process.env.WORKS_ACTOR) filled = filled.replace(/^(- \d{4}-\d{2}-\d{2}: Aufgabe angelegt)$/m, `$1 [${process.env.WORKS_ACTOR}]`);
  fs.writeFileSync(path.join(dir, 'task.md'), serializeFrontmatter(data) + '\n' + filled.replace(/^\n+/, ''));

  const task = loadTask(dir);
  if (opts['log-file']) {
    const log = fs.readFileSync(String(opts['log-file']), 'utf8').trim();
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
  if (descText && goalName !== 'Beschreibung') task._body = insertAfter(task._body, goalName, `## Beschreibung\n${descText}\n`);
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
  out(`Angelegt: ${task.id} ${task.title}`);
  out(`Datei: ${task._file}`);
  if (exists(path.join(task._dir, 'decisions.md'))) out(`Entscheidungen: ${path.join(task._dir, 'decisions.md')}`);
  out('Nächster Schritt: Abschnitte der task.md ausfüllen (Platzhalterkommentare ersetzen).');
}

// ---------- list / show ----------

function cmdList() {
  const root = requireRoot();
  let list = loadTasks(root, { archive: !!flags.all || !!flags.archived });
  const byId = byIdMap(loadTasks(root));
  if (!flags.all && !flags.status) list = list.filter((t) => OPEN_STATUSES.includes(t.status));
  if (flags.status) { const s = listFlag(flags.status); list = list.filter((t) => s.includes(t.status)); }
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
  if (!list.length) { out('Keine passenden Aufgaben.'); return; }
  const rows = list.map((t) => {
    const hints = [];
    if (OPEN_STATUSES.includes(t.status) && isBlocked(t, byId)) hints.push(`blockiert: ${openBlockers(t, byId).join(',')}`);
    if (isOverdue(t)) hints.push(`überfällig ${t.due}`);
    if (t.incomplete) hints.push('unvollständig');
    const q = openQuestions(t).length;
    if (q) hints.push(`${q} Frage(n)`);
    return [t.id, t.priority, STATUS_LABEL[t.status] || t.status, TYPE_LABEL[t.type] || t.type, t.effort || '-', t.title, hints.join(', ')];
  });
  const head = ['ID', 'Prio', 'Status', 'Typ', 'Aufw.', 'Titel', 'Hinweise'];
  const w = head.map((h, i) => Math.min(i === 5 ? 50 : 30, Math.max(h.length, ...rows.map((r) => String(r[i]).length))));
  const fmt = (r) => r.map((c, i) => { const s = String(c); return (s.length > w[i] ? s.slice(0, w[i] - 1) + '…' : s).padEnd(w[i]); }).join('  ').trimEnd();
  out(fmt(head));
  out(w.map((x) => '-'.repeat(x)).join('  '));
  rows.forEach((r) => out(fmt(r)));
  out(`\n${list.length} Aufgabe(n)`);
}

function cmdShow() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  if (flags.section) {
    const s = getSection(t._body, String(flags.section));
    if (s === null) fail(`Abschnitt "${flags.section}" nicht gefunden.`);
    out(s.trim());
    return;
  }
  out(fs.readFileSync(t._file, 'utf8'));
  const byId = byIdMap(loadTasks(root));
  const info = [];
  if (isBlocked(t, byId)) info.push(`Blockiert durch: ${openBlockers(t, byId).join(', ')}`);
  const dec = path.join(t._dir, 'decisions.md');
  if (exists(dec)) info.push(`Designentscheidungen: ${dec}`);
  const assets = fs.existsSync(path.join(t._dir, 'assets')) ? fs.readdirSync(path.join(t._dir, 'assets')).filter((f) => !f.startsWith('.')) : [];
  if (assets.length) info.push(`Assets: ${assets.length} Datei(en)`);
  if (info.length) out('---\n' + info.join('\n'));
}

// ---------- set / log / question / link ----------

function applyField(t, key, value, config) {
  if (key === 'id' || key === 'created') fail(`Feld ${key} kann nicht geändert werden.`);
  if (!FIELD_ORDER.includes(key) && !flags.custom) fail(`Unbekanntes Feld ${key}. Mit --custom erlaubst du eigene Felder.`);
  let v = value;
  if (LIST_FIELDS.includes(key)) {
    v = listFlag(value);
    if (['blocked_by', 'blocks', 'related'].includes(key)) v = v.map((x) => normalizeId(config, x));
  } else if (key === 'incomplete') v = value === 'true' || value === '1' || value === 'ja';
  else if (value === '' || value === 'null' || value === '-') v = null;
  if (key === 'priority') v = normPriority(v);
  if (key === 'priority') validateEnum(key, v, PRIORITIES);
  if (key === 'status') validateEnum(key, v, STATUSES);
  if (key === 'type') validateEnum(key, v, TYPES);
  if (key === 'effort') validateEnum(key, v, EFFORTS);
  if (key === 'risk') validateEnum(key, v, RISKS);
  if ((key === 'due' || key === 'completed') && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(`${key} braucht das Format JJJJ-MM-TT.`);
  if (key === 'milestone' && v && !(config.milestones || []).some((m) => m.id === v)) warn(`Meilenstein ${v} ist nicht in config.json definiert.`);
  const old = t[key];
  t[key] = v;
  return old;
}

function cmdSet() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos.shift());
  if (!pos.length) fail('Keine Änderungen angegeben. Beispiel: works set W-0012 priority=P1 status=geplant');
  const changes = [];
  for (const pair of pos) {
    const eq = pair.indexOf('=');
    if (eq === -1) fail(`Ungültige Angabe "${pair}", erwartet feld=wert.`);
    const key = pair.slice(0, eq).trim().replace(/-/g, '_');
    const value = pair.slice(eq + 1).trim();
    if (key === 'status' && value === 'erledigt' && !flags.force) fail('Zum Abschließen `works done` verwenden, damit die Definition of Done geprüft wird.');
    if (key === 'status' && value === 'verworfen' && !flags.reason) fail('Verwerfen braucht eine Begründung (--reason "...") oder `works drop`.');
    const old = applyField(t, key, value, config);
    if (key === 'type' && old && old !== t[key]) adaptToType(t, old, t[key]);
    const fmt = (x) => (Array.isArray(x) ? `[${x.join(', ')}]` : (x ?? 'leer'));
    if (key === 'status') changes.push(`Status: ${fmt(old)} → ${fmt(t[key])}`);
    else if (key === 'priority') changes.push(`Priorität: ${fmt(old)} → ${fmt(t[key])}`);
    else changes.push(`${key}: ${fmt(old)} → ${fmt(t[key])}`);
  }
  addHistory(t, changes.join('; ') + (flags.reason ? ` (Grund: ${flags.reason})` : ''));
  saveTask(t);
  if (t.status === 'in-arbeit') { const st = loadState(root); st.active = t.id; saveState(root, st); }
  refresh(root);
  out(`${t.id} aktualisiert: ${changes.join('; ')}`);
}

function cmdLog() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos.shift());
  const text = flags.text || pos.join(' ');
  if (!text) fail('Text fehlt.');
  addHistory(t, text);
  saveTask(t);
  refresh(root);
  out(`Verlauf von ${t.id} ergänzt.`);
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
      if (m && m[3].trim()) { i++; if (i === n) return `${m[1]}[x]${m[2]}${m[3]}${flags.answer ? ` Antwort: ${flags.answer}` : ''}`; }
      return l;
    });
    if (i < n) fail(`Frage ${n} nicht gefunden.`);
    t._body = setSection(t._body, 'Offene Fragen', lines.join('\n'));
    addHistory(t, `Frage ${n} geklärt${flags.answer ? `: ${flags.answer}` : ''}`);
  } else {
    const text = flags.text && flags.text !== true ? String(flags.text) : pos.join(' ');
    if (!text) {
      const q = openQuestions(t);
      out(q.length ? q.map((x, i) => `${i + 1}. ${x.text}`).join('\n') : 'Keine offenen Fragen.');
      return;
    }
    const sec = stripComments(getSection(t._body, 'Offene Fragen') || '').split('\n').filter((l) => l.trim() && !/^\s*[-*]\s+\[ \]\s*$/.test(l));
    sec.push(`- [ ] ${text}`);
    t._body = setSection(t._body, 'Offene Fragen', sec.join('\n'));
  }
  saveTask(t);
  refresh(root);
  out(`Offene Fragen von ${t.id} aktualisiert.`);
}

function cmdLink() {
  const root = requireRoot();
  const config = loadConfig(root);
  const [a, rel, b] = pos;
  if (!a || !rel || !b) fail('Aufruf: works link <A> blocks|blocked-by|related <B>');
  const ta = findTask(root, config, a);
  const tb = findTask(root, config, b);
  const remove = cmd === 'unlink';
  const add = (arr, v) => { if (!arr.includes(v)) arr.push(v); };
  const del = (arr, v) => { const i = arr.indexOf(v); if (i !== -1) arr.splice(i, 1); };
  const op = remove ? del : add;
  if (rel === 'blocks') { op(ta.blocks, tb.id); op(tb.blocked_by, ta.id); }
  else if (rel === 'blocked-by' || rel === 'blocked_by') { op(ta.blocked_by, tb.id); op(tb.blocks, ta.id); }
  else if (rel === 'related') { op(ta.related, tb.id); op(tb.related, ta.id); }
  else fail(`Unbekannte Beziehung ${rel}.`);
  if (!remove && rel !== 'related' && hasCycle(loadTasks(root).map((t) => (t.id === ta.id ? ta : t.id === tb.id ? tb : t)))) {
    fail('Diese Abhängigkeit würde einen Zyklus erzeugen.');
  }
  addHistory(ta, `${remove ? 'Beziehung entfernt' : 'Beziehung'}: ${rel} ${tb.id}`);
  addHistory(tb, `${remove ? 'Beziehung entfernt' : 'Beziehung'}: ${ta.id} ${rel}`);
  saveTask(ta); saveTask(tb);
  refresh(root);
  out(`${ta.id} ${remove ? 'nicht mehr ' : ''}${rel} ${tb.id}`);
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
  out(`Aufgabe: ${t.id} ${t.title}`);
  out(`Typ ${TYPE_LABEL[t.type]}, ${t.priority} ${PRIO_LABEL[t.priority]}, Status ${STATUS_LABEL[t.status]}${t.effort ? `, Aufwand ${t.effort}` : ''}`);
  out(`Datei: ${t._file}`);
  if (t.branch) out(`Branch: ${t.branch}`);
  for (const s of ['Ziel', 'Zusammenfassung', 'Forschungsfrage', 'Abkürzung', 'Beschreibung', 'Kontext und Problem', 'Akzeptanzkriterien', 'Umsetzungsplan', 'Checkliste', 'Übergabe', 'Offene Fragen']) {
    const c = getSection(t._body, s);
    if (hasContent(c)) out(`\n## ${s}\n${stripComments(c).trim()}`);
  }
  const dec = path.join(t._dir, 'decisions.md');
  if (exists(dec)) out(`\nDesignentscheidungen: ${dec}`);
  const assets = getSection(t._body, 'Assets');
  if (hasContent(assets)) out(`\n## Assets (Beschreibungen)\n${stripComments(assets).trim()}`);
}

function cmdStart() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  if (t._archived) fail(`${t.id} ist archiviert. Zum Wiederaufnehmen \`works reopen\` verwenden.`);
  const all = loadTasks(root);
  const byId = byIdMap(all);
  if (isBlocked(t, byId) && !flags.force) {
    fail(`${t.id} ist blockiert durch ${openBlockers(t, byId).join(', ')}. Erst diese abschließen oder mit --force bewusst übergehen.`);
  }
  if (t.incomplete) warn(`${t.id} ist als unvollständig markiert. Vor dem Start fehlende Angaben beim Nutzer erfragen.`);
  const others = all.filter((x) => x.status === 'in-arbeit' && x.id !== t.id);
  if (others.length) warn(`Bereits in Arbeit: ${others.map((x) => x.id).join(', ')}. Übergabe dort vorher aktualisieren.`);
  const old = t.status;
  if (old !== 'in-arbeit') {
    t.status = 'in-arbeit';
    addHistory(t, `Gestartet (Status: ${old} → in-arbeit)${isBlocked(t, byId) ? ' trotz Blockade' : ''}`);
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
    out(r.ok ? `Git: auf Branch ${t.branch}` : `Git fehlgeschlagen: ${r.stderr.trim()}`);
  }
  refresh(root);
  printContext(root, t);
}

function cmdHandoff() {
  const root = requireRoot();
  const config = loadConfig(root);
  const st = loadState(root);
  const id = pos[0] || st.active;
  if (!id) fail('Keine aktive Aufgabe. ID angeben.');
  const t = findTask(root, config, id);
  let text = flags.text;
  if (flags.file) text = fs.readFileSync(String(flags.file), 'utf8');
  if (!text || text === true) {
    const h = getSection(t._body, 'Übergabe');
    out(hasContent(h) ? stripComments(h).trim() : `Keine Übergabe für ${t.id} vorhanden.`);
    return;
  }
  t._body = setSection(t._body, 'Übergabe', `Stand: ${nowStamp()}\n\n${String(text).trim()}`);
  addHistory(t, 'Übergabe aktualisiert');
  saveTask(t);
  st.active = t.id;
  st.last_handoff = nowStamp();
  saveState(root, st);
  refresh(root);
  out(`Übergabe für ${t.id} gespeichert.`);
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
  if (!name) fail('Abschnittsname fehlt. Aufruf: works section <ID> "Ziel" --text "..." | --file pfad');
  if (['Verlauf', 'Assets'].includes(name)) fail(`Der Abschnitt ${name} wird nur über das CLI gepflegt.`);
  let text = flags.text;
  if (flags.file) text = fs.readFileSync(String(flags.file), 'utf8');
  if (text === undefined || text === true) {
    const s = getSection(t._body, name);
    out(s === null ? '' : stripComments(s).trim());
    return;
  }
  const clean = String(text).replace(/\r\n/g, '\n').trim();
  if (getSection(t._body, name) === null && flags.after && flags.after !== true) {
    t._body = insertAfter(t._body, String(flags.after), `## ${name}\n${clean}\n`);
  } else {
    t._body = setSection(t._body, name, clean);
  }
  addHistory(t, `Abschnitt ${name} aktualisiert`);
  saveTask(t);
  refresh(root);
  out(`${t.id}: Abschnitt ${name} gespeichert.`);
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
  if (!n) fail('Nummer des Punkts fehlt. Aufruf: works check <ID> <Nr> [--section Akzeptanzkriterien] [--undo]');
  const sec = getSection(t._body, name);
  if (sec === null) fail(`Abschnitt ${name} nicht gefunden.`);
  let text = '';
  const next = mapChecklist(sec.split('\n'), (l, m, i) => {
    if (i !== n) return l;
    text = m[4].trim();
    return `${m[1]}[${flags.undo ? ' ' : 'x'}]${m[3] || ' '}${m[4]}`;
  });
  if (!text) fail(`Punkt ${n} in ${name} nicht gefunden.`);
  t._body = setSection(t._body, name, next.join('\n'));
  addHistory(t, `${name}: "${text}" ${flags.undo ? 'wieder geöffnet' : 'abgehakt'}`);
  saveTask(t);
  refresh(root);
  out(`${t.id}: ${name} Punkt ${n} ${flags.undo ? 'offen' : 'erledigt'}.`);
}

function cmdItem() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos.shift());
  const text = (flags.text && flags.text !== true ? String(flags.text) : pos.join(' ')).trim();
  const name = flags.section && flags.section !== true ? String(flags.section) : 'Akzeptanzkriterien';
  if (!CHECK_SECTIONS.includes(name)) warn(`Checklisten stehen üblicherweise in: ${CHECK_SECTIONS.join(', ')}`);
  const sec = getSection(t._body, name) || '';
  if (flags.remove) {
    const n = parseInt(flags.remove, 10);
    let removed = '';
    const kept = mapChecklist(sec.split('\n'), (l, m, i) => {
      if (i !== n) return l;
      removed = m[4].trim();
      return null;
    }).filter((l) => l !== null);
    if (!removed) fail(`Punkt ${n} nicht gefunden.`);
    t._body = setSection(t._body, name, kept.join('\n'));
    addHistory(t, `${name}: "${removed}" entfernt`);
  } else {
    if (!text) fail('Text fehlt.');
    const lines = stripComments(sec).split('\n').filter((l) => l.trim() && !/^\s*[-*]\s+\[ \]\s*$/.test(l));
    lines.push(`- [ ] ${text}`);
    t._body = setSection(t._body, name, lines.join('\n'));
    addHistory(t, `${name}: "${text}" ergänzt`);
  }
  saveTask(t);
  refresh(root);
  out(`${t.id}: ${name} aktualisiert.`);
}

function printDod(res) {
  out('Automatisch geprüft:');
  for (const a of res.auto) out(`  [${a.ok ? 'x' : ' '}] ${a.text}${a.detail ? ` (${a.detail})` : ''}`);
  if (res.manual.length) {
    out('Manuell zu bestätigen:');
    for (const m of res.manual) out(`  [?] ${m}`);
  }
  if (res.commands.length) out(`Befehle (mit --run ausführen): ${res.commands.join(' ; ')}`);
}

async function cmdDone() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  if (t.status === 'erledigt') { out(`${t.id} ist bereits erledigt.`); return; }
  // Eingerichtete Prüfungen laufen automatisch, wenn es für den aktuellen Stand noch kein Ergebnis gibt.
  if (checksFor(config, t).length && !flags['no-checks']) {
    const st = dodCheck(root, config, t).checks;
    if (st && st.stale) {
      out('Automatische Prüfungen:');
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
  if (cmdFail.length) out(`Fehlgeschlagene Befehle: ${cmdFail.join(', ')}`);
  if ((failed.length || cmdFail.length) && !flags.force) {
    out(`\n${t.id} erfüllt die Definition of Done noch nicht. Punkte erledigen oder mit --force --reason "..." bewusst abschließen.`);
    process.exit(1);
  }
  if (!flags.confirm) {
    out(`\nAutomatische Prüfungen bestanden. Manuelle Punkte prüfen, dann: works done ${t.id} --confirm`);
    return;
  }
  const old = t.status;
  t.status = 'erledigt';
  t.completed = today();
  const forced = failed.length || cmdFail.length;
  addHistory(t, `Abgeschlossen (Status: ${old} → erledigt)${forced ? `, DoD übergangen: ${flags.reason || 'ohne Begründung'}` : ', DoD bestätigt'}`);
  t._body = setSection(t._body, 'Übergabe', `Abgeschlossen am ${today()}. Keine offene Übergabe.`);
  saveTask(t);
  const st = loadState(root);
  if (st.active === t.id) { delete st.active; saveState(root, st); }
  refresh(root);
  out(`${t.id} ist erledigt.`);
  afterClose(root, t);
  const unblocked = loadTasks(root).filter((o) => (o.blocked_by || []).includes(t.id) && OPEN_STATUSES.includes(o.status) && !isBlocked(o, byIdMap(loadTasks(root))));
  if (unblocked.length) out(`Jetzt frei: ${unblocked.map((o) => `${o.id} ${o.title}`).join('; ')}`);
  const dec = path.join(t._dir, 'decisions.md');
  if (exists(dec) && hasContent(getSection(fs.readFileSync(dec, 'utf8'), 'Entscheidungen'))) {
    out('Hinweis: decisions.md enthält Entscheidungen. Übernahme ins Decision Log (second-brain-sync) anbieten.');
  }
}

function cmdDrop() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  if (!flags.reason) fail('Begründung fehlt (--reason "...").');
  const old = t.status;
  t.status = 'verworfen';
  t.completed = today();
  addHistory(t, `Verworfen (Status: ${old} → verworfen). Grund: ${flags.reason}`);
  saveTask(t);
  const st = loadState(root);
  if (st.active === t.id) { delete st.active; saveState(root, st); }
  refresh(root);
  out(`${t.id} verworfen.`);
  afterClose(root, t);
}

function cmdReopen() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  if (!flags.reason) fail('Wiedereröffnen braucht eine Begründung (--reason "...").');
  if (OPEN_STATUSES.includes(t.status)) fail(`${t.id} ist bereits offen.`);
  const status = flags.status || 'backlog';
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
  addHistory(t, `Wiedereröffnet (Status: ${old} → ${status}). Grund: ${flags.reason}`);
  saveTask(t);
  refresh(root);
  out(`${t.id} wiedereröffnet als ${status}.`);
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
  if (!list.length) { out('Nichts zu archivieren.'); return; }
  for (const t of list) {
    const target = path.join(worksDir(root), 'archive', path.basename(t._dir));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(t._dir, target);
    out(`Archiviert: ${t.id} ${t.title}`);
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
    if (!t) fail(`Aufgabe ${id} nicht gefunden.`);
    return t;
  };
  if (sub === 'add') {
    const t = need(pos.shift());
    if (!OPEN_STATUSES.includes(t.status)) fail(`${t.id} ist ${STATUS_LABEL[t.status]} und kann nicht eingereiht werden.`);
    q = q.filter((x) => x !== t.id);
    const p = flags.pos && flags.pos !== true ? Math.max(1, parseInt(flags.pos, 10)) : q.length + 1;
    q.splice(p - 1, 0, t.id);
    save();
    out(`${t.id} steht auf Platz ${q.indexOf(t.id) + 1} der Warteschlange.`);
  } else if (sub === 'remove') {
    const id = normalizeId(config, pos.shift());
    q = q.filter((x) => x !== id);
    save();
    out(`${id} aus der Warteschlange entfernt.`);
  } else if (sub === 'move') {
    const t = need(pos.shift());
    const p = Math.max(1, parseInt(pos.shift(), 10) || 1);
    q = q.filter((x) => x !== t.id);
    q.splice(p - 1, 0, t.id);
    save();
    out(`${t.id} steht jetzt auf Platz ${q.indexOf(t.id) + 1}.`);
  } else if (sub === 'order') {
    const ids = listFlag(pos.join(',')).map((x) => normalizeId(config, x));
    for (const id of ids) if (!byId.has(id)) fail(`Aufgabe ${id} nicht gefunden.`);
    q = [...new Set(ids)];
    save();
    out(`Warteschlange mit ${q.length} Aufgabe(n) gespeichert.`);
  } else if (sub === 'clear') {
    q = [];
    save();
    out('Warteschlange geleert.');
  } else if (sub === 'set') {
    config.queue_settings = config.queue_settings || {};
    for (const pair of pos) {
      const [k, v] = pair.split('=');
      if (!['auto_next', 'skip_blocked', 'ask_before'].includes(k)) fail(`Unbekannte Einstellung ${k}. Erlaubt: auto_next, skip_blocked, ask_before`);
      config.queue_settings[k] = ['true', '1', 'ja', 'an'].includes(String(v).toLowerCase());
    }
    saveConfig(root, config);
    refresh(root);
    out(`Einstellungen: ${Object.entries(config.queue_settings).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  } else {
    pruneQueue(root, config, tasks);
    q = queueOf(config);
    if (flags.json) { out(JSON.stringify({ queue: q, settings: config.queue_settings }, null, 2)); return; }
    if (!q.length) { out('Die Warteschlange ist leer. Einreihen mit works queue add <ID>.'); return; }
    q.forEach((id, i) => {
      const t = byId.get(id);
      const hint = isBlocked(t, byId) ? `, blockiert durch ${openBlockers(t, byId).join(', ')}` : '';
      out(`${String(i + 1).padStart(2)}. ${t.id} ${t.priority} ${STATUS_LABEL[t.status]}: ${t.title}${hint}`);
    });
    const s = config.queue_settings || {};
    out(`\nNach Abschluss automatisch weiter: ${s.auto_next ? 'ja' : 'nein'}${s.auto_next && s.ask_before ? ' (mit Rückfrage)' : ''}, Blockierte überspringen: ${s.skip_blocked === false ? 'nein' : 'ja'}`);
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
  out(`Nächste Aufgabe in der Warteschlange: ${next.id} ${next.title}`);
  if (s.auto_next) out(s.ask_before ? `Laut Einstellung als Nächstes ${next.id} starten, vorher kurz beim Nutzer nachfragen.` : `Laut Einstellung direkt mit works start ${next.id} weitermachen.`);
}

function cmdNext() {
  const root = requireRoot();
  const n = parseInt(flags.n || 3, 10);
  const { active, candidates } = nextCandidates(root, n);
  if (active.length) {
    out('Bereits in Arbeit oder Review:');
    for (const t of sortTasks(active)) out(`  ${t.id} ${t.priority} ${STATUS_LABEL[t.status]}: ${t.title}`);
    out('');
  }
  if (!candidates.length) { out('Keine startbaren Aufgaben im Backlog.'); return; }
  out('Empfehlung für die nächste Aufgabe:');
  candidates.forEach((c, i) => out(`  ${i + 1}. ${c.task.id} ${c.task.title}\n     ${c.reasons.join(', ')}`));
}

function cmdStatus() {
  const root = findRoot();
  if (!root) { out('Kein .works Ordner in diesem Projekt.'); return; }
  out(sessionSummary(root));
}

function cmdIndex() {
  const root = requireRoot();
  refresh(root);
  out(`WORKS.md aktualisiert: ${path.join(worksDir(root), 'WORKS.md')}`);
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

function printShare(root, info) {
  if (!info || !['0.0.0.0', '::'].includes(info.host)) return;
  const links = shareLinks(root, info.port);
  if (!links.length) { out('Im Netzwerk freigegeben, aber keine Netzwerkadresse gefunden.'); return; }
  out('Im Netzwerk geteilt. Link zum Ansehen (nur lesen):');
  for (const l of links) out(`  ${l.view}`);
  if (flags['owner-link']) { out('Link mit Bearbeitungsrechten, nicht weitergeben:'); for (const l of links) out(`  ${l.edit}`); }
  out('Freigabe beenden: works board --restart --private. Links erneuern: works share --rotate');
}

function cmdShare() {
  const root = requireRoot();
  if (flags.rotate) { rotateKeys(root); out('Neue Links erzeugt. Die alten funktionieren nicht mehr. Offene geteilte Tabs brauchen den neuen Link.'); }
  const info = readServer(root);
  if (!info) { out('Kein Live-Board aktiv. Teilen mit: works board --serve --detach --share'); return; }
  if (!['0.0.0.0', '::'].includes(info.host)) { out(`Das Board läuft nur lokal (${serverUrl(info)}). Im Netzwerk teilen mit: works board --restart --share`); return; }
  flags['owner-link'] = flags['owner-link'] || flags.owner;
  printShare(root, info);
}

function cmdExport() {
  const root = requireRoot();
  const snap = buildSnapshot(root, { images: !flags['no-images'], closed: !flags['open-only'] });
  const file = path.resolve(flags.out && flags.out !== true ? String(flags.out) : path.join(worksDir(root), 'reports', snapshotName(root)));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, snap.html);
  out(`Schnappschuss gespeichert: ${file}`);
  out(`${snap.tasks} Aufgaben, ${(snap.imageBytes / 1024 / 1024).toFixed(1)} MB Bilder eingebettet${snap.skipped ? `, ${snap.skipped} Bild(er) zu groß oder fehlend` : ''}. Öffnet sich ohne Server, nur zum Ansehen.`);
}

async function cmdBoard() {
  const root = requireRoot();
  const current = cliVersion(newestCli());
  const info = readServer(root);
  const legacy = info ? [] : findServerProcesses(root);

  if (flags.status) {
    if (info) { out(`Live-Board läuft: ${serverUrl(info)} (PID ${info.pid}, Version ${info.version}${info.version === current ? ', aktuell' : `, veraltet, aktuell ist ${current}`})`); printShare(root, info); }
    for (const p of legacy) out(`Board-Server einer älteren works-Version läuft: PID ${p.pid}${p.port ? `, Port ${p.port}` : ''}. Mit works board --restart ersetzen.`);
    if (!info && !legacy.length) out('Kein Live-Board für dieses Projekt aktiv.');
    return;
  }
  if (flags.stop) {
    let n = 0;
    if (info && await stopProcess(info.pid)) { clearServer(root, info.pid); n++; }
    for (const p of legacy) if (await stopProcess(p.pid)) n++;
    out(n ? `${n} Board-Server beendet.` : 'Kein Live-Board für dieses Projekt aktiv.');
    return;
  }

  if (flags.serve || flags.restart) {
    const host = flags.share ? '0.0.0.0' : flags.private ? '127.0.0.1' : flags.host && flags.host !== true ? String(flags.host) : (info && info.host) || '127.0.0.1';
    const hostChanged = info && info.host && info.host !== host;
    let port = parseInt(flags.port || (info && info.port) || (legacy[0] && legacy[0].port) || 4747, 10);
    // Läuft schon ein aktueller Server, keinen zweiten starten.
    if (info && info.version === current && !flags.restart && !flags.takeover && !hostChanged) {
      out(`Live-Board läuft bereits: ${serverUrl(info)}`);
      return;
    }
    // Veraltete oder alte Server dieses Projekts durch die aktuelle Version ersetzen.
    if (!flags.takeover) {
      if (info) { await stopProcess(info.pid); clearServer(root, info.pid); out(`Vorherigen Board-Server (Version ${info.version}) beendet.`); }
      for (const p of legacy) { await stopProcess(p.pid); out(`Board-Server einer älteren works-Version (PID ${p.pid}) beendet.`); }
    }
    generateIndex(root);
    if (flags.detach || flags.restart) {
      const pid = startDetached(root, { cli: newestCli(), port, host, takeover: !!(info || legacy.length) });
      const started = await waitForServer(root, info ? info.pid : null);
      if (!started) fail(`Board-Server startet nicht (PID ${pid}). Details in .works/server.log`);
      out(`Live-Board läuft: ${serverUrl(started)}`);
      printShare(root, started);
      out('Läuft im Hintergrund weiter. Beenden mit works board --stop.');
      if (flags.open) {
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
        run(opener, [serverUrl(started)], { detached: true, stdio: 'ignore' });
      }
      return;
    }
    serveBoard(root, {
      port, host, open: !!flags.open,
      fixedPort: !!flags.port || !!flags.takeover || !!info || legacy.length > 0,
      takeover: !!flags.takeover || !!info || legacy.length > 0,
    });
    return new Promise(() => {}); // läuft bis Strg+C
  }
  const file = generateBoard(root);
  out(`Board erzeugt: ${file}`);
  if (flags.open) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    run(opener, [file], { detached: true, stdio: 'ignore' });
  }
}

// ---------- Demo ----------

async function cmdDemo() {
  const root = path.resolve(flags.path && flags.path !== true ? String(flags.path) : defaultDemoPath());
  const marker = path.join(root, '.works', '.demo');
  const wd = path.join(root, '.works');
  const isDemo = exists(marker);
  const sub = (args) => run(process.execPath, [path.join(SKILL_DIR, 'scripts', 'works.mjs'), ...args], { cwd: root, encoding: 'utf8' });

  if (flags.remove) {
    if (!isDemo) fail(`${root} ist kein Demo-Projekt, nichts entfernt.`);
    sub(['board', '--stop']);
    fs.rmSync(root, { recursive: true, force: true });
    out(`Demo entfernt: ${root}`);
    return;
  }
  // Niemals ein echtes Projekt überschreiben.
  if (exists(wd) && !isDemo) fail(`${root} enthält bereits ein echtes .works. Für die Demo einen anderen Ordner mit --path wählen.`);
  if (exists(root) && !exists(wd) && fs.readdirSync(root).length && flags.path) fail(`${root} ist nicht leer. Für die Demo einen leeren oder neuen Ordner wählen.`);

  if (isDemo) sub(['board', '--stop']);
  out(`Lege Beispielprojekt an: ${root}`);
  const tasks = seedDemo(root);
  fs.writeFileSync(path.join(root, '.works', '.demo'), 'Von works demo angelegt. Mit works demo --remove entfernen.\n');
  const args = ['board', '--serve', '--detach'];
  if (flags.port && flags.port !== true) args.push(`--port=${flags.port}`);
  if (flags.open) args.push('--open');
  const r = sub(args);
  if (!r.ok) fail(`Board startet nicht: ${(r.stderr || r.stdout).trim()}`);
  out(r.stdout.trim().split('\n')[0]);
  out(`${Object.keys(tasks).length} Aufgaben, 2 Meilensteine und 3 Ideen sind angelegt. Im Board kannst du alles ausprobieren.`);
  if (flags.simulate) {
    const delay = Math.max(2, parseInt(flags.delay || 6, 10)) * 1000;
    out(`\nSpiele jetzt alle ${delay / 1000} Sekunden eine Änderung vor, wie Claude sie macht. Schau dabei aufs Board:`);
    await simulate(root, tasks, { delay, log: out });
    out('\nVorführung beendet. Das Board läuft weiter.');
  }
  out(`Beenden: works board --stop im Ordner ${root}, oder alles entfernen mit works demo --remove`);
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
    if (!t._valid) { errors.push(`${where}: Frontmatter fehlt oder ist ungültig`); continue; }
    for (const f of ['id', 'title', 'type', 'priority', 'status', 'created']) if (!t[f]) errors.push(`${where}: Pflichtfeld ${f} fehlt`);
    if (t.type && !TYPES.includes(t.type)) errors.push(`${where}: ungültiger Typ ${t.type}`);
    if (t.priority && !PRIORITIES.includes(t.priority)) errors.push(`${where}: ungültige Priorität ${t.priority}`);
    if (t.status && !STATUSES.includes(t.status)) errors.push(`${where}: ungültiger Status ${t.status}`);
    if (t.effort && !EFFORTS.includes(t.effort)) errors.push(`${where}: ungültiger Aufwand ${t.effort}`);
    if (t.risk && !RISKS.includes(t.risk)) errors.push(`${where}: ungültiges Risiko ${t.risk}`);
    for (const f of ['created', 'updated', 'due', 'completed']) if (t[f] && !/^\d{4}-\d{2}-\d{2}$/.test(String(t[f]))) errors.push(`${where}: ${f} hat kein Datumsformat JJJJ-MM-TT`);
    if (t.id && !path.basename(t._dir).startsWith(t.id + '-')) errors.push(`${where}: Ordnername passt nicht zur ID ${t.id}`);
    if (t.id && byId.has(t.id)) errors.push(`${where}: doppelte ID ${t.id}`);
    byId.set(t.id, t);
    if (t._archived && OPEN_STATUSES.includes(t.status)) errors.push(`${where}: offene Aufgabe liegt im Archiv (works reopen verwenden)`);
    if (!t.effort && OPEN_STATUSES.includes(t.status)) warnings.push(`${t.id}: kein Aufwand gesetzt`);
    if (t.milestone && !(config.milestones || []).some((m) => m.id === t.milestone)) warnings.push(`${t.id}: Meilenstein ${t.milestone} nicht definiert`);
  }
  for (const t of all) {
    if (!t._valid) continue;
    for (const f of ['blocked_by', 'blocks', 'related']) for (const ref of t[f] || []) if (!byId.has(ref)) errors.push(`${t.id}: ${f} verweist auf unbekannte Aufgabe ${ref}`);
    for (const b of t.blocks || []) {
      const o = byId.get(b);
      if (o && !(o.blocked_by || []).includes(t.id)) {
        if (flags.fix) { o.blocked_by.push(t.id); saveTask(o, { touch: false }); fixes.push(`${o.id}: blocked_by um ${t.id} ergänzt`); }
        else warnings.push(`${t.id} blockiert ${b}, aber ${b} führt ${t.id} nicht in blocked_by`);
      }
    }
    for (const b of t.blocked_by || []) {
      const o = byId.get(b);
      if (o && !(o.blocks || []).includes(t.id)) {
        if (flags.fix) { o.blocks.push(t.id); saveTask(o, { touch: false }); fixes.push(`${o.id}: blocks um ${t.id} ergänzt`); }
        else warnings.push(`${t.id} wartet auf ${b}, aber ${b} führt ${t.id} nicht in blocks`);
      }
    }
    // Inhalte
    const open = OPEN_STATUSES.includes(t.status);
    const crit = checkboxes(getSection(t._body, 'Akzeptanzkriterien') || '');
    if (open && ['feature', 'bug', 'design', 'refactor', 'debt'].includes(t.type) && crit.total === 0 && !t.incomplete) warnings.push(`${t.id}: keine Akzeptanzkriterien`);
    if (t.status === 'erledigt' && crit.done < crit.total) warnings.push(`${t.id}: erledigt, aber ${crit.total - crit.done} Akzeptanzkriterien offen`);
    if (t.status === 'in-arbeit') {
      const h = getSection(t._body, 'Übergabe');
      const stale = daysBetween(String(t.updated || t.created), today()) > (config.handoff_stale_days || 3);
      if (!hasContent(h)) warnings.push(`${t.id}: in Arbeit ohne Übergabenotiz`);
      else if (stale) warnings.push(`${t.id}: in Arbeit, seit ${t.updated} nicht aktualisiert`);
    }
    if (t.incomplete && open) warnings.push(`${t.id}: als unvollständig markiert`);
    // Bilder
    const texts = [fs.readFileSync(t._file, 'utf8')];
    const dec = path.join(t._dir, 'decisions.md');
    if (exists(dec)) texts.push(fs.readFileSync(dec, 'utf8'));
    const referenced = new Set();
    for (const txt of texts) {
      for (const img of imageLinks(txt)) {
        if (/^https?:/.test(img.src)) continue;
        const abs = path.resolve(t._dir, img.src);
        referenced.add(path.normalize(abs));
        if (!exists(abs)) missing.push(`${t.id}: Bild fehlt: ${img.src}`);
        if (!img.alt.trim()) warnings.push(`${t.id}: Bild ohne Alternativtext: ${img.src}`);
      }
      const linkRe = /(?<!!)\[[^\]]*\]\((assets\/[^)\s]+)\)/g;
      let m;
      while ((m = linkRe.exec(txt))) {
        const abs = path.resolve(t._dir, decodeURI(m[1]));
        referenced.add(path.normalize(abs));
        if (!exists(abs)) missing.push(`${t.id}: verlinkte Datei fehlt: ${m[1]}`);
      }
    }
    const adir = path.join(t._dir, 'assets');
    if (exists(adir)) {
      for (const f of fs.readdirSync(adir)) {
        if (f.startsWith('.')) continue;
        if (!referenced.has(path.normalize(path.join(adir, f)))) warnings.push(`${t.id}: Asset nicht referenziert: assets/${f}`);
      }
    }
    const assetSec = getSection(t._body, 'Assets') || '';
    const lines = assetSec.split('\n');
    lines.forEach((l, i) => {
      if (/^!\[/.test(l.trim()) && !/^Beschreibung:/i.test((lines[i + 1] || '').trim())) warnings.push(`${t.id}: Bild ohne Beschreibungszeile: ${l.trim().slice(0, 60)}`);
    });
  }
  if (hasCycle(all.filter((t) => t._valid))) errors.push('Zyklische Abhängigkeit in blocked_by gefunden');
  // Beschreibung im falschen Abschnitt oder fehlende Vorlagenabschnitte
  for (const r of repairTasks(root, { dryRun: !flags.fix })) {
    const what = [r.moved ? `Beschreibung steht in ${r.moved}` : null, r.added.length ? `fehlende Abschnitte: ${r.added.join(', ')}` : null].filter(Boolean).join(', ');
    if (flags.fix) fixes.push(`${r.id}: ${what.replace('steht in', 'übernommen aus')}`);
    else warnings.push(`${r.id}: ${what} (works doctor --fix repariert das)`);
  }
  const maxId = Math.max(0, ...all.map((t) => idNumber(t.id)).filter((n) => !Number.isNaN(n)));
  if ((config.next_id || 1) <= maxId) {
    if (flags.fix) { config.next_id = maxId + 1; saveConfig(root, config); fixes.push(`next_id auf ${maxId + 1} gesetzt`); }
    else errors.push(`config.next_id (${config.next_id}) ist nicht größer als die höchste ID (${maxId})`);
  }
  const inbox = path.join(worksDir(root), 'inbox');
  if (exists(inbox)) {
    const files = fs.readdirSync(inbox).filter((f) => !f.startsWith('.'));
    if (files.length) warnings.push(`Inbox enthält ${files.length} nicht zugeordnete Datei(en): ${files.join(', ')}`);
  }
  const state = loadState(root);
  if (state.active && !byId.has(state.active)) {
    if (flags.fix) { delete state.active; saveState(root, state); fixes.push('ungültige aktive Aufgabe aus state.json entfernt'); }
    else warnings.push(`state.json verweist auf unbekannte aktive Aufgabe ${state.active}`);
  }
  refresh(root);
  if (!flags.quiet || errors.length) {
    for (const f of fixes) out(`Behoben: ${f}`);
    for (const e of errors) out(`FEHLER   ${e}`);
    if (!flags.quiet) for (const w of warnings) out(`WARNUNG  ${w}`);
    out(`\n${errors.length} Fehler, ${warnings.length} Warnungen${fixes.length ? `, ${fixes.length} behoben` : ''}. WORKS.md neu erzeugt.`);
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
  if (!src) fail('Quelldatei fehlt. Aufruf: works asset <ID> <pfad> --desc "..." [--kind vorher]');
  if (!exists(src)) {
    const inInbox = path.join(worksDir(root), 'inbox', src);
    if (exists(inInbox)) src = inInbox; else fail(`Datei nicht gefunden: ${src}`);
  }
  const fromInbox = path.resolve(src).startsWith(path.join(worksDir(root), 'inbox'));
  const kind = flags.kind && flags.kind !== true ? String(flags.kind) : null;
  if (kind && !ASSET_KINDS.includes(kind)) warn(`Unübliche Art "${kind}". Üblich: ${ASSET_KINDS.join(', ')}`);
  const desc = flags.desc && flags.desc !== true ? String(flags.desc) : '';
  if (!desc) warn('Ohne --desc fehlt die Textbeschreibung. Spätere Sessions müssen das Bild dann laden.');
  const alt = flags.alt && flags.alt !== true ? String(flags.alt) : (desc.split(/[.!?]/)[0].slice(0, 80) || (kind ? `Bild (${kind})` : 'Bild ohne Beschreibung'));
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
    else warn('sharp nicht gefunden, Bild wurde nicht komprimiert. Installation: npm i -D sharp');
  }
  const rel = `assets/${path.basename(target)}`;
  const isImage = IMAGE_EXT.includes(ext);
  const block = [isImage ? `![${alt}](${encodeURI(rel)})` : `[${alt}](${encodeURI(rel)})`];
  if (desc) block.push(`Beschreibung: ${desc}`);
  const meta = [kind ? `Art: ${kind}` : null, `Hinzugefügt: ${today()}`, flags.origin ? `Quelle: ${flags.origin}` : null].filter(Boolean).join(' · ');
  block.push(meta);
  const sec = stripComments(getSection(t._body, 'Assets') || '').trim();
  t._body = setSection(t._body, 'Assets', (sec ? sec + '\n\n' : '') + block.join('\n'));
  addHistory(t, `Asset hinzugefügt: ${rel}${kind ? ` (${kind})` : ''}`);
  saveTask(t);
  refresh(root);
  out(`Gespeichert: ${target}${note}`);
  out(`Markdown: ${block[0]}`);
}

function cmdInbox() {
  const root = requireRoot();
  const dir = path.join(worksDir(root), 'inbox');
  const files = exists(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')) : [];
  if (flags.json) { out(JSON.stringify(files.map((f) => ({ name: f, path: path.join(dir, f), size: fs.statSync(path.join(dir, f)).size })), null, 2)); return; }
  if (!files.length) { out('Inbox ist leer.'); return; }
  out(`Inbox (${dir}):`);
  for (const f of files) {
    const st = fs.statSync(path.join(dir, f));
    out(`  ${f}  ${Math.round(st.size / 1024)} KB  ${st.mtime.toLocaleString('de-DE')}`);
  }
  out('\nZuordnen mit: works asset <ID> <dateiname> --desc "..." [--kind ...]');
}

async function cmdCompress() {
  const root = requireRoot();
  const config = loadConfig(root);
  const sharp = loadSharp(root);
  if (!sharp) fail('sharp ist nicht installiert. Im Projekt `npm i -D sharp` ausführen.');
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
  out(`${total} Bilder geprüft, ${Math.round(saved / 1024)} KB gespart.`);
}

// ---------- Entscheidungen / Dokumente ----------

function createDecisions(root, t) {
  const file = path.join(t._dir, 'decisions.md');
  if (!exists(file)) {
    fs.writeFileSync(file, fillTemplate(readTemplate('decisions.md'), { id: t.id, title: t.title, date: today() }));
    const sec = stripComments(getSection(t._body, 'Designentscheidungen') || '').trim();
    if (!sec.includes('decisions.md')) {
      t._body = setSection(t._body, 'Designentscheidungen', `${sec ? sec + '\n\n' : ''}Details und verworfene Alternativen: [decisions.md](decisions.md)`);
    }
    addHistory(t, 'decisions.md angelegt');
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
    let txt = fs.readFileSync(file, 'utf8');
    const n = (stripComments(txt).match(/^### E(\d+)/gm) || []).length + 1;
    const entry = [
      `### E${n}: ${flags.add}`,
      `- Datum: ${today()}`,
      `- Quelle: ${flags.source || 'Gespräch'}`,
      `- Kontext: ${flags.context || ''}`,
      `- Entscheidung: ${flags.decision || ''}`,
      `- Begründung: ${flags.why || ''}`,
      '- Verworfene Alternativen:',
      ...listFlag(flags.rejected).map((r) => `  - ${r}`),
      `- Konsequenzen: ${flags.consequences || ''}`,
    ].map((l) => l.trimEnd()).join('\n');
    const sec = stripComments(getSection(txt, 'Entscheidungen') || '').trim();
    txt = setSection(txt, 'Entscheidungen', (sec ? sec + '\n\n' : '') + entry);
    fs.writeFileSync(file, txt);
    addHistory(t, `Entscheidung E${n} dokumentiert: ${flags.add}`);
    saveTask(t);
    refresh(root);
    out(`E${n} in ${file} ergänzt.`);
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
  if (!src || !exists(src)) fail('Dokument nicht gefunden. Aufruf: works attach-doc <ID> <pfad> [--mode link|copy|move] [--label "..."]');
  const mode = flags.mode || config.brainstorm.mode || 'link';
  if (!['link', 'copy', 'move'].includes(mode)) fail('--mode muss link, copy oder move sein.');
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
  let txt = fs.readFileSync(decFile, 'utf8');
  const sec = stripComments(getSection(txt, 'Quellen') || '').trim();
  txt = setSection(txt, 'Quellen', (sec ? sec + '\n' : '') + `- [${label}](${encodeURI(rel)}) (${mode === 'link' ? 'verlinkt' : mode === 'copy' ? 'kopiert' : 'verschoben'} am ${today()})`);
  fs.writeFileSync(decFile, txt);
  addHistory(t, `Dokument ${mode === 'link' ? 'verlinkt' : 'übernommen'}: ${label}`);
  saveTask(t);
  refresh(root);
  out(`${label} an ${t.id} angehängt (${mode}). Zusammenfassung jetzt in decisions.md unter "Brainstorm-Zusammenfassung" bzw. "Entscheidungen" eintragen.`);
}

// ---------- Ideen ----------

function ideasFile(root) { return path.join(worksDir(root), 'ideas.md'); }

function cmdIdea() {
  const root = requireRoot();
  const config = loadConfig(root);
  const text = flags.text || pos.join(' ');
  if (!text) fail('Text fehlt.');
  const id = `I-${String(config.next_idea_id || 1).padStart(3, '0')}`;
  config.next_idea_id = (config.next_idea_id || 1) + 1;
  saveConfig(root, config);
  const tags = listFlag(flags.tags).map((x) => `#${x}`).join(' ');
  fs.appendFileSync(ideasFile(root), `- [${id}] ${today()}: ${text}${tags ? ' ' + tags : ''}\n`);
  refresh(root);
  out(`Idee ${id} notiert.`);
}

function cmdIdeas() {
  const root = requireRoot();
  const lines = fs.readFileSync(ideasFile(root), 'utf8').split('\n').filter((l) => /^- \[I-\d+\]/.test(l));
  const open = lines.filter((l) => !l.includes('~~'));
  out(open.length ? open.join('\n') : 'Keine offenen Ideen.');
}

function cmdIdeaDrop() {
  const root = requireRoot();
  const iid = String(pos[0] || '').toUpperCase();
  const file = ideasFile(root);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const idx = lines.findIndex((l) => l.startsWith(`- [${iid}]`));
  if (idx === -1) fail(`Idee ${iid} nicht gefunden.`);
  lines[idx] = `- ~~${lines[idx].slice(2)}~~ verworfen${flags.reason && flags.reason !== true ? `: ${flags.reason}` : ''}`;
  fs.writeFileSync(file, lines.join('\n'));
  refresh(root);
  out(`Idee ${iid} verworfen.`);
}

function cmdPromote() {
  const root = requireRoot();
  const config = loadConfig(root);
  const iid = String(pos[0] || '').toUpperCase();
  const file = ideasFile(root);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const idx = lines.findIndex((l) => l.startsWith(`- [${iid}]`));
  if (idx === -1) fail(`Idee ${iid} nicht gefunden.`);
  if (lines[idx].includes('~~')) fail(`Idee ${iid} wurde bereits übernommen.`);
  const m = lines[idx].match(/^- \[I-\d+\] (\d{4}-\d{2}-\d{2}): (.*)$/);
  const raw = m ? m[2] : lines[idx];
  const tags = [...raw.matchAll(/#([\w-]+)/g)].map((x) => x[1]);
  const text = raw.replace(/#[\w-]+/g, '').trim();
  const task = createTask(root, config, {
    ...flags, title: flags.title || text, tags: [...tags, ...listFlag(flags.tags)].join(','),
    source: `idee:${iid}`, incomplete: true, context: `Aus Idee ${iid} vom ${m ? m[1] : 'unbekannt'}: ${text}`,
  });
  lines[idx] = `- ~~[${iid}] ${m ? m[1] + ': ' : ''}${raw}~~ übernommen als ${task.id}`;
  fs.writeFileSync(file, lines.join('\n'));
  refresh(root);
  out(`Idee ${iid} übernommen als ${task.id}: ${task._file}`);
}

// ---------- Meilensteine ----------

function cmdMilestone() {
  const root = requireRoot();
  const config = loadConfig(root);
  const sub = pos.shift() || 'list';
  config.milestones = config.milestones || [];
  if (sub === 'add') {
    const id = String(pos.shift() || '').toUpperCase();
    if (!/^M\d+$/.test(id)) fail('Meilenstein-ID im Format M1, M2 ... angeben.');
    if (config.milestones.some((m) => m.id === id)) fail(`${id} existiert bereits.`);
    config.milestones.push({ id, title: flags.title || pos.join(' ') || id, due: flags.due || null, description: flags.desc || '', status: 'offen' });
    saveConfig(root, config);
    refresh(root);
    out(`Meilenstein ${id} angelegt.`);
  } else if (sub === 'set') {
    const id = String(pos.shift() || '').toUpperCase();
    const m = config.milestones.find((x) => x.id === id);
    if (!m) fail(`${id} nicht gefunden.`);
    for (const pair of pos) { const [k, ...v] = pair.split('='); m[k] = v.join('=') || null; }
    saveConfig(root, config);
    refresh(root);
    out(`Meilenstein ${id} aktualisiert.`);
  } else {
    const prog = milestoneProgress(config, loadTasks(root));
    if (!prog.length) { out('Keine Meilensteine definiert.'); return; }
    for (const m of prog) out(`${m.id}  ${m.title}  ${m.due ? `fällig ${m.due}  ` : ''}${m.status || 'offen'}  ${m.done}/${m.total} (${m.pct} %)`);
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
  if (!found.length) { out('Keine Marker gefunden.'); return; }
  const mapping = { FIXME: ['bug', 'P2'], XXX: ['bug', 'P2'], HACK: ['debt', 'P3'], TODO: ['chore', 'P3'] };
  if (!flags.create) {
    for (const f of found) out(`${f.known ? 'bekannt' : 'neu    '}  ${f.marker.padEnd(5)} ${f.file}:${f.line}  ${f.text}`);
    out(`\n${found.length} Marker, davon ${fresh.length} ohne Aufgabe. Mit --create werden daraus Aufgaben (Filter: --marker FIXME,HACK).`);
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
      context: `${f.marker} in \`${f.file}:${f.line}\`${f.author ? ` (von ${f.author})` : ''}\n\n\`\`\`${ext}\n${f.snippet}\n\`\`\``,
    });
    created++;
    out(`Angelegt: ${task.id} ${task.title}`);
  }
  refresh(root);
  out(`${created} Aufgabe(n) aus Code-Markern angelegt.`);
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
    if (!r.ok) fail(`gh issue list fehlgeschlagen: ${(r.stderr || r.error?.message || '').trim()}`);
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
    if (flags['dry-run']) { out(`würde anlegen: #${is.number} ${is.title} (${type}, ${priority})`); n++; continue; }
    const body = (is.body || '').trim();
    const task = createTask(root, config, {
      type, priority, title: is.title, source, incomplete: true, tags: ['github', ...labels.map((l) => slugify(l, 20))].join(','),
      context: `GitHub Issue [#${is.number}](${is.url || ''})${labels.length ? `, Labels: ${labels.join(', ')}` : ''}\n\n${body ? body.split('\n').map((l) => `> ${l}`).join('\n') : '_Keine Beschreibung._'}`,
    });
    out(`Angelegt: ${task.id} aus #${is.number} ${is.title}`);
    n++;
  }
  if (!flags['dry-run']) refresh(root);
  out(`${n} Issue(s) ${flags['dry-run'] ? 'würden importiert' : 'importiert'}.`);
}

function cmdGhExport() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  if (String(t.source || '').startsWith('github#') || t.issue) fail(`${t.id} ist bereits mit einem Issue verknüpft (${t.source || t.issue}).`);
  const parts = [];
  for (const s of ['Ziel', 'Zusammenfassung', 'Kontext und Problem', 'Akzeptanzkriterien']) {
    const c = getSection(t._body, s);
    if (hasContent(c)) parts.push(`## ${s}\n${stripComments(c).trim()}`);
  }
  parts.push(`_Verwaltet in .works als ${t.id}, Priorität ${t.priority} ${PRIO_LABEL[t.priority]}._`);
  const args = ['issue', 'create', '--title', `[${t.id}] ${t.title}`, '--body', parts.join('\n\n')];
  if (flags['dry-run']) { out(`gh ${args.slice(0, 4).join(' ')} ...\n\n${parts.join('\n\n')}`); return; }
  const r = run('gh', args, { cwd: root });
  if (!r.ok) fail(`gh issue create fehlgeschlagen: ${r.stderr.trim()}`);
  const url = r.stdout.trim().split('\n').pop();
  const num = (url.match(/\/(\d+)$/) || [])[1];
  t.issue = num ? `github#${num}` : url;
  addHistory(t, `Als GitHub Issue exportiert: ${url}`);
  saveTask(t);
  refresh(root);
  out(`Issue erstellt: ${url}`);
}

// ---------- Git-Verlauf, Changelog, Report ----------

function cmdCommits() {
  const root = requireRoot();
  const config = loadConfig(root);
  const t = findTask(root, config, pos[0]);
  const r = run('git', ['log', '--all', '--date=short', '--format=%h %ad %s', `--grep=${t.id}`], { cwd: root });
  if (!r.ok) fail(`git log fehlgeschlagen: ${r.stderr.trim()}`);
  const lines = r.stdout.trim();
  out(lines || `Keine Commits mit ${t.id} gefunden. Commit-Messages sollten die ID enthalten, z. B. "feat(${t.id}): ..."`);
  if (flags.write && lines) {
    t._body = setSection(t._body, 'Commits', lines.split('\n').map((l) => `- ${l}`).join('\n'));
    saveTask(t, { touch: false });
    refresh(root);
  }
}

const CHANGELOG_GROUPS = [
  ['Neu', ['feature', 'design']],
  ['Behoben', ['bug']],
  ['Verbessert', ['refactor', 'debt']],
  ['Sonstiges', ['chore', 'spike']],
];

function cmdChangelog() {
  const root = requireRoot();
  let list = loadTasks(root).filter((t) => t.status === 'erledigt');
  if (flags.since) list = list.filter((t) => String(t.completed || t.updated) >= String(flags.since));
  if (flags.until) list = list.filter((t) => String(t.completed || t.updated) <= String(flags.until));
  if (flags.milestone) list = list.filter((t) => t.milestone === flags.milestone);
  if (!flags['include-internal']) list = list.filter((t) => !(t.tags || []).includes('intern'));
  if (!list.length) { out('Keine erledigten Aufgaben im Zeitraum.'); return; }
  const title = flags.version ? `## ${flags.version} (${today()})` : `## Unveröffentlicht (${today()})`;
  const lines = [title, ''];
  for (const [label, types] of CHANGELOG_GROUPS) {
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
    out(`CHANGELOG.md ergänzt (${list.length} Einträge).`);
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
    out(flags.webhook === true ? 'Discord-Webhook entfernt.' : 'Discord-Webhook gespeichert (nur lokal in .works/report.local.json).');
    return;
  }
  if (flags.settings) {
    const r = reportSettings(config);
    for (const pair of pos) {
      const i = pair.indexOf('='); const k = pair.slice(0, i); const v = pair.slice(i + 1);
      const yes = ['true', '1', 'ja', 'an'].includes(v.toLowerCase());
      if (k === 'enabled') r.enabled = yes;
      else if (k === 'weekday') r.weekday = Math.min(7, Math.max(1, parseInt(v, 10) || 5));
      else if (k === 'time') { if (!/^\d{2}:\d{2}$/.test(v)) fail('time braucht HH:MM.'); r.time = v; } else if (k === 'discord' || k === 'file') r.destinations[k] = yes;
      else if (['done', 'attention', 'next', 'milestones'].includes(k)) r.include[k] = yes;
      else fail(`Unbekannte Einstellung ${k}.`);
    }
    config.report = r; saveConfig(root, config);
    out(`Wochenbericht: ${r.enabled ? `an, ${['', 'montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags', 'sonntags'][r.weekday]} ab ${r.time}` : 'aus'}, Discord ${r.destinations.discord ? 'an' : 'aus'}`);
    return;
  }
  if (flags.week) {
    const summary = flags['summary-file'] && flags['summary-file'] !== true ? fs.readFileSync(String(flags['summary-file']), 'utf8') : flags.summary && flags.summary !== true ? String(flags.summary) : '';
    const r = await writeWeekly(root, config, { summary, send: flags.send ? true : flags['no-send'] ? false : null });
    out(`Wochenbericht ${r.name} gespeichert:\n  ${r.md}\n  ${r.html}`);
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
  const started = all.filter((t) => historyEntries(t).some((h) => inRange(h.date) && h.text.startsWith('Gestartet')));
  const open = sortTasks(all.filter((t) => OPEN_STATUSES.includes(t.status)));
  const L = [];
  L.push(`# Bericht ${start} bis ${end}`, '');
  L.push('## Zusammenfassung', '');
  L.push(`- Erledigt: ${done.length}`);
  L.push(`- Neu angelegt: ${created.length}`);
  L.push(`- Gestartet: ${started.length}`);
  L.push(`- Verworfen: ${dropped.length}`);
  L.push(`- Offen gesamt: ${open.length} (${PRIORITIES.map((p) => `${p}: ${open.filter((t) => t.priority === p).length}`).join(', ')})`);
  L.push('');
  const sect = (title, list, extra = () => '') => {
    L.push(`## ${title}`, '');
    if (!list.length) L.push('Keine.');
    for (const t of list) L.push(`- ${t.id} ${t.title} (${TYPE_LABEL[t.type]}, ${t.priority})${extra(t)}`);
    L.push('');
  };
  sect('Erledigt', done, (t) => (t.completed ? `, am ${t.completed}` : ''));
  sect('Neu angelegt', created);
  sect('In Arbeit und Review', open.filter((t) => ['in-arbeit', 'review'].includes(t.status)), (t) => `, ${STATUS_LABEL[t.status]}`);
  sect('Blockiert', open.filter((t) => isBlocked(t, byId)), (t) => `, wartet auf ${openBlockers(t, byId).join(', ')}`);
  sect('Überfällig', open.filter(isOverdue), (t) => `, fällig ${t.due}`);
  const ms = milestoneProgress(config, all);
  if (ms.length) {
    L.push('## Meilensteine', '');
    for (const m of ms) L.push(`- ${m.id} ${m.title}: ${m.done}/${m.total} (${m.pct} %)${m.due ? `, fällig ${m.due}` : ''}`);
    L.push('');
  }
  const text = L.join('\n');
  if (flags.write) {
    const file = path.join(worksDir(root), 'reports', `${end}-bericht.md`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    out(`Bericht gespeichert: ${file}`);
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
    out('Claude Code Hooks: werden vom Plugin mitgeliefert und sind aktiv, solange das Plugin aktiviert ist. Nichts einzurichten.');
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
      if (present) { out(`${event}: bereits eingerichtet`); return; }
      const group = { hooks: [{ type: 'command', command, timeout: 15 }] };
      if (matcher) group.matcher = matcher;
      settings.hooks[event].push(group);
      out(`${event}: eingerichtet (${command})`);
    };
    add('SessionStart', 'session-start.mjs', 'startup|resume|clear|compact');
    add('Stop', 'stop-reminder.mjs');
    add('UserPromptSubmit', 'prompt-submit.mjs');
    if (!flags['dry-run']) writeJson(file, settings);
    out(`Claude Code Einstellungen: ${file}${flags['dry-run'] ? ' (Probelauf, nichts geschrieben)' : ''}`);
  }
  if (doGit) {
    const gitDir = run('git', ['rev-parse', '--git-dir'], { cwd: root });
    if (!gitDir.ok) { out('Git: kein Repository, pre-commit Hook übersprungen.'); return; }
    const hookFile = path.resolve(root, gitDir.stdout.trim(), 'hooks', 'pre-commit');
    const marker = '# works-doctor';
    // Im Plugin ändert sich der Installationspfad bei jedem Update, daher den aktuellen Pfad zur Laufzeit suchen.
    const locate = IS_PLUGIN
      ? '  WORKS_CLI=$(ls -t $(find "$HOME/.claude/plugins" -path "*/skills/works/scripts/works.mjs" 2>/dev/null) 2>/dev/null | head -n 1)\n'
      : `  WORKS_CLI="${homeRel(path.join(SKILL_DIR, 'scripts', 'works.mjs'))}"\n`;
    const block = `${marker}\nif git diff --cached --name-only | grep -q '^\\.works/'; then\n${locate}`
      + '  if [ -n "$WORKS_CLI" ] && [ -f "$WORKS_CLI" ]; then\n'
      + '    node "$WORKS_CLI" doctor --quiet || { echo "works doctor meldet Fehler in .works/. Commit abgebrochen."; exit 1; }\n'
      + '  else\n    echo "works: CLI nicht gefunden, Prüfung übersprungen."\n  fi\nfi\n';
    let cur = exists(hookFile) ? fs.readFileSync(hookFile, 'utf8') : '#!/bin/sh\n';
    if (cur.includes(marker)) out('Git pre-commit: bereits eingerichtet');
    else {
      cur = cur.replace(/\s*$/, '\n') + block;
      if (!flags['dry-run']) { fs.mkdirSync(path.dirname(hookFile), { recursive: true }); fs.writeFileSync(hookFile, cur); fs.chmodSync(hookFile, 0o755); }
      out(`Git pre-commit: eingerichtet (${hookFile})`);
    }
  }
}

// ---------- Hilfe ----------

function cmdHelp() {
  out(`works: Aufgabenverwaltung in .works/

Einrichtung
  init [--gitignore default|assets|all|none] [--prefix W]
  install-hooks [--claude] [--git] [--scope user|project|local] [--dry-run]

Erfassen
  new --type <typ> --title "..." [--priority P1-P4] [--effort S|M|L|XL] [--risk niedrig|mittel|hoch]
      [--due JJJJ-MM-TT] [--milestone M1] [--tags a,b] [--blocked-by W-1] [--blocks W-2] [--related W-3]
      [--source text] [--incomplete] [--decisions] [--log-file pfad] [--status backlog]
      [--goal ".." | --goal-file pfad] [--description ".." | --description-file pfad] [--criteria-file pfad]
  idea "Text" [--tags a,b]          ideas                      promote I-001 [--type ...] [--priority ...]
  scan [--create] [--marker FIXME,HACK] [--json]
  gh-import [--state open] [--limit 100] [--dry-run]         gh-export <ID> [--dry-run]

Ansehen
  list [--status ..] [--priority ..] [--type ..] [--tag ..] [--milestone M1] [--blocked] [--overdue] [--incomplete] [--all] [--json]
  show <ID> [--section "Name"]     next [--n 3]     status     index
  board [--open]                   board --serve [--detach] [--port 4747] [--host 127.0.0.1] [--open]
                                   board --restart --share   im lokalen Netz teilen (Leselink mit Schlüssel)
                                   board --restart --private wieder nur lokal
  share [--rotate] [--owner]       Links zum Teilen anzeigen oder erneuern
  export [--out datei.html] [--no-images] [--open-only]  Schnappschuss als eine HTML-Datei
  board --status | --stop | --restart
  queue [list|add <ID> [--pos N]|remove <ID>|move <ID> <N>|order A,B,C|clear|set auto_next=true ...]
  sprint [start --title ..|add A,B|remove A|set capacity=24|close|list]
  comments [<ID>]                  comment <ID> "Text" [--as Nutzer|Claude]
  views | views delete "Name"      list --view "Name"
  template list|show <slug>|save --from <ID> [--name ..] [--scope user]|delete <slug>
  new --template <slug> --field Name=Wert --text "Was passieren soll" [--criteria 2,3]
  time [<ID>] [--mode measured|fixed]
  checks [detect [--save]|set name="befehl"|remove name|run <ID>|record <ID> <name> --status ok|warn|fail|ack <ID> <name>]
  report --week [--summary ".."] [--send|--no-send]    report --settings enabled=true weekday=5 time=16:00 discord=true
  report --webhook https://discord.com/api/webhooks/..
  demo [--simulate] [--delay 6] [--open] [--port 4747] [--path ordner] | demo --remove
  milestone list|add M1 --title ".." [--due ..]|set M1 status=erledigt

Bearbeiten
  section <ID> "Name" [--text ".." | --file pfad]     check <ID> <Nr> [--section ..] [--undo]
  item <ID> "Text" [--section Akzeptanzkriterien] [--remove Nr]      idea-drop I-001 [--reason ..]
  set <ID> feld=wert ...           log <ID> "Text"       question <ID> "Frage" | --resolve N [--answer ".."]
  link <A> blocks|blocked-by|related <B>                  unlink <A> <beziehung> <B>
  start <ID> [--git] [--force]     handoff [<ID>] [--text ".." | --file pfad]
  dod <ID>                         done <ID> [--run] [--confirm] [--force --reason ".."]
  drop <ID> --reason ".."          reopen <ID> --reason ".." [--status backlog]
  archive [<ID>...] [--all] [--older-than Tage]

Assets und Entscheidungen
  asset <ID> <pfad|inbox-datei> --desc ".." [--kind ist|vorher|nachher|referenz|mockup|skizze|fehler|diagramm]
        [--alt ".."] [--name ".."] [--move] [--compress] [--origin ".."]
  inbox [--json]                   compress [<ID>]
  decisions <ID> [--add "Titel" --decision ".." --why ".." --rejected "A: Grund,B: Grund" --source ".."]
  attach-doc <ID> <pfad> [--mode link|copy|move] [--label ".."]

Auswertung
  commits <ID> [--write]           changelog [--since ..] [--milestone M1] [--version 1.2.0] [--write]
  report [--days 7] [--write]      doctor [--fix] [--strict] [--quiet]

Typen: ${TYPES.join(', ')}
Status: ${STATUSES.join(', ')}
Prioritäten: ${PRIORITIES.map((p) => `${p} ${PRIO_LABEL[p]}`).join(', ')}`);
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
  const need = () => { if (!cur) fail('Kein aktiver Sprint. Starten mit works sprint start --title ".." [--goal ".."]'); return cur; };
  if (sub === 'start') {
    if (cur) fail(`Sprint ${cur.id} läuft noch bis ${cur.end}. Erst mit works sprint close abschließen.`);
    const days = parseInt(flags.days || set.length_days, 10);
    const start = flags.start && flags.start !== true ? String(flags.start) : today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) fail('--start braucht das Format JJJJ-MM-TT.');
    const id = nextSprintId(config);
    const carry = flags.carry ? ((lastClosedSprint(config) || {}).carry || []) : [];
    const s = {
      id, title: flags.title && flags.title !== true ? String(flags.title) : `Sprint ${id.slice(1)}`, goal: flags.goal && flags.goal !== true ? String(flags.goal) : '',
      start, end: addDays(start, Math.max(1, days) - 1), capacity: parseInt(flags.capacity || set.capacity, 10), status: 'aktiv',
      tasks: carry.filter((x) => byId.has(x) && OPEN_STATUSES.includes(byId.get(x).status)),
    };
    config.sprints.push(s);
    save();
    out(`${s.id} ${s.title} läuft vom ${s.start} bis ${s.end}, Kapazität ${s.capacity} Punkte${s.tasks.length ? `, ${s.tasks.length} Aufgabe(n) übernommen` : ''}.`);
  } else if (sub === 'add' || sub === 'remove') {
    const s = need();
    const ids = listFlag(pos.join(',')).map((x) => normalizeId(config, x));
    if (!ids.length) fail(`Aufgaben angeben: works sprint ${sub} W-0001,W-0002`);
    for (const id of ids) {
      const t = byId.get(id);
      if (!t) fail(`Aufgabe ${id} nicht gefunden.`);
      if (sub === 'add') { if (!OPEN_STATUSES.includes(t.status)) fail(`${id} ist ${STATUS_LABEL[t.status]}.`); if (!s.tasks.includes(id)) s.tasks.push(id); } else s.tasks = s.tasks.filter((x) => x !== id);
    }
    save();
    const st = sprintStats(config, s, tasks);
    out(`${sub === 'add' ? 'Eingeplant' : 'Entfernt'}: ${ids.join(', ')}. ${st.planned} von ${st.capacity} Punkten verplant.`);
    if (st.planned > st.capacity) out('Hinweis: Der Sprint ist überplant.');
  } else if (sub === 'set') {
    const s = need();
    for (const pair of pos) {
      const i = pair.indexOf('=');
      const k = pair.slice(0, i); const v = pair.slice(i + 1);
      if (k === 'capacity') s.capacity = Math.max(1, parseInt(v, 10) || s.capacity);
      else if (k === 'end' || k === 'start') { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(`${k} braucht JJJJ-MM-TT.`); s[k] = v; } else if (k === 'title' || k === 'goal') s[k] = v.slice(0, 200);
      else fail(`Unbekanntes Feld ${k}. Erlaubt: title, goal, start, end, capacity`);
    }
    save();
    out(`${s.id} gespeichert.`);
  } else if (sub === 'close') {
    const s = need();
    const st = sprintStats(config, s, tasks);
    s.status = 'abgeschlossen';
    s.closed = today();
    s.result = { planned: st.planned, done: st.done };
    s.carry = s.tasks.filter((id) => byId.has(id) && OPEN_STATUSES.includes(byId.get(id).status));
    save();
    out(`${s.id} abgeschlossen: ${st.done} von ${st.planned} Punkten geschafft.${s.carry.length ? ` Offen geblieben: ${s.carry.join(', ')}. Mit works sprint start --carry übernehmen.` : ''}`);
  } else if (sub === 'list') {
    if (!config.sprints.length) { out('Noch keine Sprints.'); return; }
    for (const s of config.sprints) out(`${s.id} ${s.title} ${s.start} bis ${s.end} ${s.status}${s.result ? `, ${s.result.done}/${s.result.planned} Punkte` : ''}`);
  } else {
    if (!cur) { out(`Kein aktiver Sprint. Starten mit works sprint start --title ".." --goal ".." (Länge ${set.length_days} Tage, Kapazität ${set.capacity} Punkte, Punkte ${Object.entries(set.points).map(([k, v]) => `${k} ${v}`).join(', ')}).`); return; }
    const st = sprintStats(config, cur, tasks);
    if (flags.json) { out(JSON.stringify({ sprint: cur, stats: st }, null, 2)); return; }
    out(`${cur.id} ${cur.title}, ${cur.start} bis ${cur.end}, Tag ${st.dayIndex} von ${st.days}${cur.goal ? `\nZiel: ${cur.goal}` : ''}`);
    out(`Punkte: ${st.done} erledigt, ${st.working} in Arbeit, ${st.open} offen, ${st.planned} von ${st.capacity} verplant${st.unestimated ? ` (${st.unestimated} ohne Schätzung zählen als M)` : ''}`);
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
  let text = flags.file && flags.file !== true ? fs.readFileSync(String(flags.file), 'utf8') : flags.text && flags.text !== true ? String(flags.text) : pos.join(' ');
  if (!text.trim()) fail('Text fehlt: works comment <ID> "..."');
  const author = commentAuthor();
  try { addComment(t, author, text); } catch (e) { fail(e.message); }
  if (author === 'Claude') markRead(root, t);
  refresh(root);
  out(`Kommentar an ${t.id} gespeichert (${author}).`);
}

function cmdComments() {
  const root = requireRoot();
  const config = loadConfig(root);
  if (!pos.length || flags.unread) {
    const list = loadTasks(root, { archive: false }).map((t) => ({ t, n: unreadForClaude(root, t).length })).filter((x) => x.n);
    if (!list.length) { out('Keine neuen Kommentare vom Nutzer.'); return; }
    for (const x of list) out(`${x.t.id} ${x.t.title}: ${x.n} neu`);
    return;
  }
  const t = findTask(root, config, pos[0]);
  const list = loadComments(t);
  const unread = new Set(unreadForClaude(root, t, list).map((c) => c.at));
  if (flags.json) { out(JSON.stringify(list, null, 2)); return; }
  if (!list.length) { out(`${t.id} hat noch keine Kommentare.`); return; }
  for (const c of list) out(`\n${c.at.replace('T', ' ').slice(0, 16)} ${c.author}${unread.has(c.at) ? ' (neu)' : ''}\n${c.text}`);
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
    if (config.views.length === views.length) fail(`Ansicht "${name}" gibt es nicht.`);
    saveConfig(root, config); refresh(root);
    out(`Ansicht "${name}" gelöscht.`);
    return;
  }
  if (!views.length) { out('Keine gespeicherten Ansichten. Im Board unter den Filtern "Aktuelle Filter speichern".'); return; }
  for (const v of views) out(`${v.name}: ${describeView(v)}`);
}

function describeView(v) {
  const f = v.filter || {};
  const parts = [];
  if (f.prios && f.prios.length && f.prios.length < 4) parts.push(f.prios.join(' und '));
  if (f.type) parts.push(`Typ ${f.type}`);
  if (f.tag) parts.push(`#${f.tag}`);
  if (f.ms) parts.push(`Meilenstein ${f.ms}`);
  if (f.signal) parts.push({ blocked: 'nur blockierte', unblocked: 'ohne blockierte', overdue: 'überfällig', questions: 'mit offenen Fragen', incomplete: 'unvollständig' }[f.signal] || f.signal);
  if (f.q) parts.push(`Suche "${f.q}"`);
  if (v.view && v.view !== 'board') parts.push(`Ansicht ${v.view}`);
  return parts.join(', ') || 'alle Aufgaben';
}

// Wendet eine gespeicherte Ansicht im Terminal an (works list --view "Name").
function applyView(config, list, byId, name) {
  const v = (config.views || []).find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  if (!v) fail(`Ansicht "${name}" gibt es nicht. works views zeigt alle.`);
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
    if (!list.length) { out('Keine Vorlagen. Anlegen im Board oder mit works template save --from <ID> --name ".."'); return; }
    for (const t of list) out(`${t.slug.padEnd(24)} ${t.name} (${TYPE_LABEL[t.type]}, ${t.fields.length} Felder, ${t.criteria.length} Kriterien, ${t.scope === 'user' ? 'alle Projekte' : 'Projekt'})`);
  } else if (sub === 'show') {
    const t = findTemplate(root, String(pos[0] || ''));
    if (!t) fail(`Vorlage ${pos[0]} nicht gefunden.`);
    out(JSON.stringify(t, null, 2));
  } else if (sub === 'save') {
    let input;
    if (flags.file && flags.file !== true) input = JSON.parse(fs.readFileSync(String(flags.file), 'utf8'));
    else if (flags.from && flags.from !== true) input = templateFromTask(findTask(root, config, String(flags.from)));
    else fail('Quelle fehlt: --from <ID> oder --file vorlage.json');
    if (flags.name && flags.name !== true) { input.name = String(flags.name); delete input.slug; }
    try {
      const t = saveTemplate(root, input, flags.scope === 'user' ? 'user' : 'project');
      out(`Vorlage gespeichert: ${t.slug} (${t.name}). Anlegen mit works new --template ${t.slug}`);
    } catch (e) { fail(e.message); }
  } else if (sub === 'delete') {
    const n = deleteTemplate(root, String(pos[0] || ''));
    out(n ? `Vorlage ${pos[0]} gelöscht.` : `Vorlage ${pos[0]} nicht gefunden.`);
  } else fail('Unterbefehle: list, show <slug>, save --from <ID> | --file, delete <slug>');
}

// Neue Aufgabe aus einer Vorlage: works new --template slug --field Name=Wert --text "Was genau passieren soll"
function newFromTemplate(root, config) {
  const tpl = findTemplate(root, String(flags.template));
  if (!tpl) fail(`Vorlage ${flags.template} nicht gefunden. works template list zeigt alle.`);
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
  if (flags.mode) {
    if (!['measured', 'fixed'].includes(flags.mode)) fail('--mode measured oder fixed');
    config.effort_mode = flags.mode; saveConfig(root, config); refresh(root);
    out(flags.mode === 'measured' ? 'Zeitleiste und Sprint rechnen jetzt mit den gemessenen Dauern.' : 'Zeitleiste und Sprint rechnen mit festen Werten.');
    return;
  }
  if (pos[0]) {
    const t = findTask(root, config, pos[0]);
    const tt = taskTime(root, t);
    if (flags.json) { out(JSON.stringify(tt, null, 2)); return; }
    out(`${t.id} ${t.title}\nClaude aktiv: ${fmtDuration(tt.totalMs)} in ${tt.sessions.length} Sitzung(en)${tt.started ? `, gestartet am ${tt.started}` : ''}`);
    out(`Tage je Status: ${Object.entries(tt.statusDays).map(([k, v]) => `${STATUS_LABEL[k] || k} ${v}`).join(', ') || 'keine'}`);
    for (const s of tt.sessions) out(`  ${new Date(s.start).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}  ${fmtDuration(s.ms).padEnd(12)} ${s.label}`);
    return;
  }
  const e = estimates(root, tasks, config);
  if (flags.json) { out(JSON.stringify(e, null, 2)); return; }
  out(`Schätzung gegen tatsächliche Dauer (Kalendertage vom Start bis zum Abschluss), Modus: ${e.mode === 'measured' ? 'gemessen' : 'fest'}`);
  for (const s of e.sizes) out(`  ${s.effort.padEnd(3)} geschätzt ${String(s.estimate).padStart(2)} Tage, gemessen ${s.avg === null ? 'noch keine Daten' : `${s.avg} Tage aus ${s.n} Aufgabe(n)`}`);
  if (e.worst.length) out(`Am längsten über der Schätzung: ${e.worst.map((w) => `${w.id} (${w.effort}, ${w.days} Tage)`).join(', ')}`);
}

// ---------- Prüfungen ----------

async function cmdChecks() {
  const root = requireRoot();
  const config = loadConfig(root);
  const sub = pos.shift() || (flags.detect ? 'detect' : 'list');
  if (sub === 'detect') {
    const d = detectChecks(root);
    out('Vorschlag aus dem Projekt:');
    for (const [k, v] of Object.entries(d)) out(`  ${k.padEnd(10)} ${v}`);
    if (flags.save) { config.checks = d; saveConfig(root, config); refresh(root); out('Gespeichert in .works/config.json unter checks.'); } else out('Erst nach Rückfrage beim Nutzer speichern: works checks detect --save');
  } else if (sub === 'set') {
    config.checks = configuredChecks(config);
    for (const pair of pos) {
      const i = pair.indexOf('=');
      const k = pair.slice(0, i); const v = pair.slice(i + 1).trim();
      if (!NAME_RE.test(k)) fail(`Ungültiger Name ${k}.`);
      if (v) config.checks[k] = v; else delete config.checks[k];
    }
    saveConfig(root, config); refresh(root);
    out(`Prüfungen: ${Object.keys(config.checks).join(', ') || 'keine'}`);
  } else if (sub === 'remove') {
    config.checks = configuredChecks(config);
    for (const k of pos) delete config.checks[k];
    saveConfig(root, config); refresh(root);
    out(`Prüfungen: ${Object.keys(config.checks).join(', ') || 'keine'}`);
  } else if (sub === 'run') {
    const t = findTask(root, config, pos.shift());
    if (!checksFor(config, t).length) fail('Keine Prüfungen eingerichtet. Vorschlag mit works checks detect.');
    const data = await runChecks(root, config, t, { only: flags.only ? listFlag(flags.only) : null, onStart: (c) => out(`> ${c.name}: ${c.cmd}`) });
    printChecks(data);
    refresh(root);
  } else if (sub === 'record') {
    const t = findTask(root, config, pos.shift());
    const name = pos.shift();
    try { recordCheck(root, t, name, String(flags.status || 'ok'), flags.note && flags.note !== true ? String(flags.note) : ''); } catch (e) { fail(e.message); }
    refresh(root);
    out(`${name} für ${t.id} eingetragen: ${flags.status || 'ok'}`);
  } else if (sub === 'ack') {
    const t = findTask(root, config, pos.shift());
    try { ackCheck(t, pos.shift(), flags.reason && flags.reason !== true ? String(flags.reason) : ''); } catch (e) { fail(e.message); }
    refresh(root);
    out('Als bekannt markiert.');
  } else {
    const c = configuredChecks(config);
    if (!Object.keys(c).length) { out('Keine Prüfungen eingerichtet. Vorschlag mit works checks detect, speichern nach Rückfrage mit --save.'); return; }
    for (const [k, v] of Object.entries(c)) out(`  ${k.padEnd(10)} ${v}`);
    const by = config.checks_by_type || {};
    for (const [ty, list] of Object.entries(by)) out(`  nur für ${ty}: ${list.join(', ') || 'keine'}`);
    if (pos[0]) { const t = findTask(root, config, pos[0]); const d = loadResults(t); if (d) printChecks(d); }
  }
}

function printChecks(data) {
  const mark = { ok: 'ok', ack: 'ok, bekannt', warn: 'Fund', fail: 'FEHLER', manual: 'offen' };
  for (const [k, r] of Object.entries(data.results)) {
    out(`  ${k.padEnd(10)} ${(mark[r.status] || r.status).padEnd(12)} ${r.ms ? `${Math.round(r.ms / 1000)} s` : ''}${r.note ? `  ${r.note.split('\n')[0]}` : ''}`);
    if (r.status === 'fail' && r.output) out(r.output.split('\n').slice(-12).map((l) => `      ${l}`).join('\n'));
  }
}

// ---------- Dispatcher ----------

const commands = {
  help: cmdHelp, init: cmdInit, new: cmdNew, list: cmdList, ls: cmdList, show: cmdShow,
  set: cmdSet, log: cmdLog, question: cmdQuestion, link: cmdLink, unlink: cmdLink,
  start: cmdStart, handoff: cmdHandoff, dod: cmdDod, done: cmdDone, drop: cmdDrop,
  reopen: cmdReopen, archive: cmdArchive, next: cmdNext, status: cmdStatus, index: cmdIndex,
  board: cmdBoard, doctor: cmdDoctor, asset: cmdAsset, inbox: cmdInbox, compress: cmdCompress,
  decisions: cmdDecisions, 'attach-doc': cmdAttachDoc, idea: cmdIdea, ideas: cmdIdeas,
  promote: cmdPromote, milestone: cmdMilestone, scan: cmdScan, 'gh-import': cmdGhImport,
  'gh-export': cmdGhExport, commits: cmdCommits, changelog: cmdChangelog, report: cmdReport,
  'install-hooks': cmdInstallHooks, section: cmdSection, check: cmdCheck, item: cmdItem,
  'idea-drop': cmdIdeaDrop, demo: cmdDemo, queue: cmdQueue, share: cmdShare, export: cmdExport,
  sprint: cmdSprint, comment: cmdComment, comments: cmdComments, views: cmdViews, template: cmdTemplate,
  templates: cmdTemplate, time: cmdTime, checks: cmdChecks,
};

const fn = commands[cmd];
if (!fn) fail(`Unbekannter Befehl "${cmd}". \`works help\` zeigt alle Befehle.`);
Promise.resolve(fn()).catch((e) => fail(e.stack || e.message));
