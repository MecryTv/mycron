// Was Claude gerade tut und Anweisungen des Nutzers während der Arbeit.
// activity.json: letzter Werkzeugaufruf und eine kurze Liste davor. instructions.json: wartende Anweisungen.
import fs from 'node:fs';
import path from 'node:path';
import { worksDir, readJson, writeJson, nowStamp } from './lib.mjs';

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

export function recordActivity(root, task, tool, input, ok = true) {
  const a = readJson(actFile(root), null) || { recent: [] };
  const d = describeTool(root, tool, input);
  const entry = { at: new Date().toISOString(), task: task || '', tool, verb: d.verb, what: d.what, ok };
  a.current = entry;
  a.busy = true;
  a.recent = [entry, ...(a.recent || [])].slice(0, 12);
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
export function takeInstructions(root) {
  const list = readJson(insFile(root), []) || [];
  const open = list.filter((x) => !x.delivered);
  if (!open.length) return [];
  for (const x of list) if (!x.delivered) { x.delivered = true; x.deliveredAt = nowStamp(); }
  writeJson(insFile(root), list);
  return open;
}

export function instructionText(items) {
  return `works: Der Nutzer hat dir über das Board ${items.length === 1 ? 'eine Anweisung' : `${items.length} Anweisungen`} geschickt:\n`
    + items.map((x) => `- ${x.task ? `${x.task}: ` : ''}${x.text}`).join('\n')
    + '\nBerücksichtige sie, sobald es sinnvoll ist: wenn sie den aktuellen Schritt betrifft sofort, sonst nach dem aktuellen Schritt. '
    + 'Antworte kurz mit works comment <ID> "...", was du daraus machst. Passt sie nicht zur Aufgabe, frag nach.';
}
