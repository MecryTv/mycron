// Was Claude gerade tut und Anweisungen des Nutzers während der Arbeit.
// activity.json: letzter Werkzeugaufruf und eine kurze Liste davor. instructions.json: wartende Anweisungen.
import fs from 'node:fs';
import path from 'node:path';
import { worksDir, readJson, writeJson, nowStamp, loadState, getSection, checkboxes } from './lib.mjs';
import { loadLanes } from './parallel.mjs';
import { tr } from './i18n.mjs';

const actFile = (root) => path.join(worksDir(root), 'activity.json');
const insFile = (root) => path.join(worksDir(root), 'instructions.json');

const VERB = (name) => ({ Edit: tr('Editing'), MultiEdit: tr('Editing'), Write: tr('Writing'), Read: tr('Reading'), Bash: tr('Command'), Grep: tr('Searching'), Glob: tr('Searching'), NotebookEdit: tr('Editing'), WebFetch: tr('Loading'), WebSearch: tr('Searching the web'), Task: 'Agent', Agent: 'Agent', Skill: 'Skill' })[name];

export function describeTool(root, name, input = {}) {
  const rel = (p) => { if (!p) return ''; const r = path.relative(root, String(p)); return r && !r.startsWith('..') ? r.split(path.sep).join('/') : path.basename(String(p)); };
  let what = '';
  if (input.file_path || input.notebook_path || input.path) what = rel(input.file_path || input.notebook_path || input.path);
  else if (input.command) what = String(input.command).split('\n')[0].slice(0, 120);
  else if (input.pattern) what = String(input.pattern).slice(0, 80);
  else if (input.skill || input.skill_name) what = String(input.skill || input.skill_name).slice(0, 60);
  else if (input.description) what = String(input.description).slice(0, 80);
  else if (input.url) what = String(input.url).slice(0, 100);
  // Aufrufe des works CLI selbst zeigen, aber ohne den langen Pfad.
  what = what.replace(/node\s+"?[^"\s]*works\.mjs"?/, 'works');
  return { verb: VERB(name) || name, what };
}

const inside = (p, dir) => { if (!p || !dir) return false; const r = path.relative(dir, path.resolve(String(p))); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

// Zu welcher Aufgabe gehört ein Werkzeugaufruf? Liegt er im Worktree einer parallelen Aufgabe
// (Pfad, Arbeitsordner oder Befehl), zählt er für diese Bahn, sonst für die aktive Aufgabe.
export function callTarget(root, input = {}) {
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.notebook_path || ti.path || '';
  const cmd = String(ti.command || '');
  const lane = loadLanes(root).find((l) => inside(target, l.path) || inside(input.cwd, l.path) || (cmd && cmd.includes(l.path))) || null;
  return { task: lane ? lane.task : (loadState(root).active || ''), lane };
}

// lane: Pfad des Worktrees einer parallelen Aufgabe. Dann zählt der Aufruf für diese Bahn, nicht für die Hauptsitzung.
// running: Aufruf beginnt gerade (PreToolUse). Er wird nur als aktueller Aufruf gezeigt, in recent landet er erst, wenn er fertig ist.
// perm: Claude wartet auf die Freigabe des Nutzers (PermissionRequest). Der nächste Hook ersetzt den Eintrag wieder.
// agent: agent_id aus der Hook-Eingabe, leer für die Hauptsitzung.
export function recordActivity(root, task, tool, input, ok = true, lane = '', { running = false, perm = false, agent = '' } = {}) {
  const a = readJson(actFile(root), null) || { recent: [] };
  const d = describeTool(lane || root, tool, input);
  const at = new Date().toISOString();
  const entry = { at, task: task || '', tool, verb: d.verb, what: d.what, ok, ...(lane ? { lane: true } : {}), ...(running ? { running: true } : {}), ...(perm ? { perm: true, permSince: at } : {}), ...(agent ? { agent } : {}) };
  // Wartet die Hauptsitzung (oder ein Agent) auf eine Freigabe, ersetzt der Aufruf eines anderen Agenten sie nicht.
  // Der Aufruf landet trotzdem im Verlauf. Ein Aufruf desselben Agenten heißt: Die Freigabe ist erledigt.
  const held = !lane && a.current && a.current.perm && (a.current.agent || '') !== agent && Date.now() - Date.parse(a.current.at) < 60 * 60000;
  if (lane) a.lanes = { ...(a.lanes || {}), [task]: entry };
  else if (!held) { a.current = entry; a.busy = true; }
  if (!running) a.recent = [entry, ...(a.recent || [])].slice(0, 40);
  writeJson(actFile(root), a);
}

// Schritte einer Aufgabe: erster nicht leerer Abschnitt aus Umsetzungsplan, Vorgehen, Checkliste.
export function planOf(task) {
  for (const section of ['Umsetzungsplan', 'Vorgehen', 'Checkliste']) {
    const items = checkboxes(getSection(task._body, section) || '').items;
    if (items.length) return { section, items };
  }
  return { section: '', items: [] };
}

export function taskDirOf(root, id) {
  try { return fs.readdirSync(path.join(worksDir(root), 'tasks')).find((d) => d.startsWith(`${id}-`)) || null; } catch { return null; }
}

// Wann wurde ein Schritt abgehakt? task.md speichert das nicht, deshalb hält steps.json beim ersten Sehen
// die Änderungszeit der task.md fest. prune: Aufgaben, die nicht übergeben wurden, fallen heraus.
// ponytail: Schlüssel ist der Schritttext, gleichlautende Schritte teilen sich eine Uhrzeit.
export function stampSteps(root, tasks, { prune = false } = {}) {
  const file = path.join(worksDir(root), 'steps.json');
  const old = readJson(file, {}) || {};
  const next = prune ? {} : { ...old };
  const out = new Map();
  for (const t of tasks) {
    const prev = old[t.id] || {};
    const times = {};
    const items = planOf(t).items.map((s) => {
      const at = s.done ? (prev[s.text] || new Date(t._mtime).toISOString()) : '';
      if (at) times[s.text] = at;
      return { text: s.text, done: s.done, at };
    });
    if (Object.keys(times).length) next[t.id] = times; else delete next[t.id];
    out.set(t.id, items);
  }
  if (JSON.stringify(next) !== JSON.stringify(old)) writeJson(file, next);
  return out;
}

export function setIdle(root) {
  const a = readJson(actFile(root), null);
  if (!a) return;
  a.busy = false;
  a.idleSince = new Date().toISOString();
  if (a.current) delete a.current.perm;
  writeJson(actFile(root), a);
}

export function setBusy(root, task) {
  const a = readJson(actFile(root), null) || { recent: [] };
  a.busy = true;
  a.since = new Date().toISOString();
  a.current = { at: a.since, task: task || '', tool: '', verb: tr('Thinking'), what: '', ok: true };
  writeJson(actFile(root), a);
}

export function loadActivity(root) { return readJson(actFile(root), null); }

export function addInstruction(root, task, text) {
  const list = readJson(insFile(root), []) || [];
  const item = { id: Date.now().toString(36), task, text: String(text).slice(0, 4000), at: nowStamp(), delivered: false };
  list.push(item);
  writeJson(insFile(root), list.slice(-50));
  return item;
}

export function pendingInstructions(root) {
  return (readJson(insFile(root), []) || []).filter((x) => !x.delivered);
}

// Gibt wartende Anweisungen zurück und markiert sie als zugestellt.
// pick: welche Anweisungen dieser Aufrufer bekommt (bei paralleler Arbeit nur die seiner Aufgabe).
export function takeInstructions(root, pick = () => true) {
  const list = readJson(insFile(root), []) || [];
  const open = list.filter((x) => !x.delivered && pick(x));
  if (!open.length) return [];
  for (const x of open) { x.delivered = true; x.deliveredAt = nowStamp(); }
  writeJson(insFile(root), list);
  return open;
}

export function instructionText(items) {
  return `${items.length === 1 ? tr('works: The user sent you an instruction via the board:') : tr('works: The user sent you {n} instructions via the board:', { n: items.length })}\n`
    + items.map((x) => `- ${x.task ? `${x.task}: ` : ''}${x.text}`).join('\n')
    + '\n' + tr('Take them into account as soon as it makes sense: right away if they concern the current step, otherwise after it. Briefly reply with works comment <ID> "..." what you make of them. If one does not fit the task, ask.');
}
