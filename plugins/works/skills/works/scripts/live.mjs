// Was Claude gerade tut und Anweisungen des Nutzers während der Arbeit.
// activity.json: letzter Werkzeugaufruf und eine kurze Liste davor. instructions.json: wartende Anweisungen.
import fs from 'node:fs';
import path from 'node:path';
import { worksDir, readJson, writeJson, nowStamp, loadState } from './lib.mjs';
import { loadLanes } from './parallel.mjs';

const actFile = (root) => path.join(worksDir(root), 'activity.json');
const insFile = (root) => path.join(worksDir(root), 'instructions.json');

const VERB = { Edit: 'Bearbeitet', MultiEdit: 'Bearbeitet', Write: 'Schreibt', Read: 'Liest', Bash: 'Befehl', Grep: 'Sucht', Glob: 'Sucht', NotebookEdit: 'Bearbeitet', WebFetch: 'Lädt', WebSearch: 'Sucht im Web', Task: 'Agent', Agent: 'Agent', Skill: 'Skill' };

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
  return { verb: VERB[name] || name, what };
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
export function recordActivity(root, task, tool, input, ok = true, lane = '', { running = false } = {}) {
  const a = readJson(actFile(root), null) || { recent: [] };
  const d = describeTool(lane || root, tool, input);
  const entry = { at: new Date().toISOString(), task: task || '', tool, verb: d.verb, what: d.what, ok, ...(lane ? { lane: true } : {}), ...(running ? { running: true } : {}) };
  if (lane) a.lanes = { ...(a.lanes || {}), [task]: entry };
  else { a.current = entry; a.busy = true; }
  if (!running) a.recent = [entry, ...(a.recent || [])].slice(0, 40);
  writeJson(actFile(root), a);
}

export function setIdle(root) {
  const a = readJson(actFile(root), null);
  if (!a) return;
  a.busy = false;
  a.idleSince = new Date().toISOString();
  writeJson(actFile(root), a);
}

export function setBusy(root, task) {
  const a = readJson(actFile(root), null) || { recent: [] };
  a.busy = true;
  a.since = new Date().toISOString();
  a.current = { at: a.since, task: task || '', tool: '', verb: 'Denkt nach', what: '', ok: true };
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
  return `works: Der Nutzer hat dir über das Board ${items.length === 1 ? 'eine Anweisung' : `${items.length} Anweisungen`} geschickt:\n`
    + items.map((x) => `- ${x.task ? `${x.task}: ` : ''}${x.text}`).join('\n')
    + '\nBerücksichtige sie, sobald es sinnvoll ist: wenn sie den aktuellen Schritt betrifft sofort, sonst nach dem aktuellen Schritt. '
    + 'Antworte kurz mit works comment <ID> "...", was du daraus machst. Passt sie nicht zur Aufgabe, frag nach.';
}
