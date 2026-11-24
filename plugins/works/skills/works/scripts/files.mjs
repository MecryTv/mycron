// Welche Aufgabe hat welche Datei geändert. Zwei Quellen:
// 1. Commits mit der Aufgaben-ID in der Nachricht (geteilt über Git, zwischengespeichert in .works/.filemap.json)
// 2. Edits aus dem PostToolUse Hook für die aktive Aufgabe (lokal in .works/files.jsonl, auch vor dem Commit)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readText, worksDir, readJson, writeJson, exists, loadTasks, stripComments, getSection } from './lib.mjs';
import { tr } from './i18n.mjs';

const editsFile = (root) => path.join(worksDir(root), 'files.jsonl');
const cacheFile = (root) => path.join(worksDir(root), '.filemap.json');
const hintsFile = (root) => path.join(worksDir(root), '.file-hints.json');
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

function git(root, args, timeout = 8000) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); } catch { return null; }
}

// Pfad relativ zur Projektwurzel mit Schrägstrichen, oder '' für Dateien außerhalb und in .works.
export function relPath(root, p, base = root) {
  if (!p) return '';
  const abs = path.resolve(base, String(p));
  const r = path.relative(root, abs).split(path.sep).join('/');
  if (!r || r.startsWith('..') || path.isAbsolute(r) || r.startsWith('.works/') || r.startsWith('.git/')) return '';
  return r;
}

export function idPattern(config) {
  const prefix = String(config.id_prefix || 'W').replace(/[^A-Za-z]/g, '') || 'W';
  return new RegExp(`\\b(${prefix})-?(\\d{1,6})\\b`, 'gi');
}
const normId = (config, p, n) => `${p.toUpperCase()}-${String(parseInt(n, 10)).padStart(config.id_digits || 4, '0')}`;

// Ein Edit des Hooks. file kann absolut sein; root ist die Projektwurzel, base der Worktree einer Bahn.
export function recordEdit(root, task, tool, input, base = root) {
  if (!task || !EDIT_TOOLS.has(tool)) return '';
  const file = relPath(base, input.file_path || input.notebook_path, base);
  if (!file) return '';
  const f = editsFile(root);
  fs.appendFileSync(f, JSON.stringify({ t: new Date().toISOString(), task, file }) + '\n');
  // Datei klein halten: ab 6000 Zeilen auf die letzten 4000 kürzen.
  try {
    const st = fs.statSync(f);
    if (st.size > 600000) { const lines = fs.readFileSync(f, 'utf8').trim().split('\n'); fs.writeFileSync(f, lines.slice(-4000).join('\n') + '\n'); }
  } catch { /* egal */ }
  return file;
}

function readEdits(root) {
  if (!exists(editsFile(root))) return [];
  return fs.readFileSync(editsFile(root), 'utf8').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// Commits mit Aufgaben-ID und ihre Dateien. Zwischengespeichert, solange sich kein Branch bewegt hat.
export function gitMap(root, config) {
  const refs = git(root, ['for-each-ref', '--format=%(objectname)', 'refs/heads', 'refs/remotes']);
  if (refs === null) return { git: false, byFile: {}, byTask: {} };
  const key = String(refs.split('\n').filter(Boolean).sort().join(',').length) + ':' + simpleHash(refs);
  const cached = readJson(cacheFile(root), null);
  if (cached && cached.key === key && cached.v === 2) return cached;
  const out = git(root, ['log', '--all', '-n', '3000', '--no-merges', '--name-only', '--format=%x1e%h%x1f%aI%x1f%s'], 15000) || '';
  const byFile = {}; const byTask = {};
  const re = idPattern(config);
  for (const block of out.split('\x1e')) {
    const lines = block.split('\n');
    const [hash, date, subject] = (lines.shift() || '').split('\x1f');
    if (!hash || !subject) continue;
    const ids = [...new Set([...subject.matchAll(re)].map((m) => normId(config, m[1], m[2])))];
    if (!ids.length) continue;
    const files = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('.works/'));
    for (const id of ids) {
      const t = byTask[id] || (byTask[id] = {});
      for (const f of files) {
        const e = t[f] || (t[f] = { commits: 0, last: '' });
        e.commits++; if (date > e.last) e.last = date;
        const bf = byFile[f] || (byFile[f] = {});
        const x = bf[id] || (bf[id] = { commits: 0, last: '' });
        x.commits++; if (date > x.last) x.last = date;
      }
    }
  }
  const map = { v: 2, key, git: true, byFile, byTask };
  try { writeJson(cacheFile(root), map); } catch { /* nur Cache */ }
  return map;
}

function simpleHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

function decisionTitles(task) {
  const f = path.join(task._dir, 'decisions.md');
  if (!exists(f)) return [];
  return (stripComments(readText(f)).match(/^### E\d+:.*$/gm) || []).map((l) => l.replace(/^### /, '').trim()).slice(0, 6);
}

// Alle Aufgaben, die eine Datei geändert haben, neueste zuerst.
export function tasksForFile(root, config, file, { tasks } = {}) {
  const rel = relPath(root, file, process.cwd()) || String(file).replace(/^\.\//, '');
  const all = tasks || loadTasks(root);
  const byId = new Map(all.map((t) => [t.id, t]));
  const hits = new Map();
  const m = gitMap(root, config);
  for (const [id, x] of Object.entries(m.byFile[rel] || {})) hits.set(id, { id, commits: x.commits, edits: 0, last: x.last });
  for (const e of readEdits(root)) {
    if (e.file !== rel) continue;
    const h = hits.get(e.task) || { id: e.task, commits: 0, edits: 0, last: '' };
    h.edits++; if (e.t > h.last) h.last = e.t;
    hits.set(e.task, h);
  }
  return [...hits.values()].map((h) => {
    const t = byId.get(h.id);
    return { ...h, title: t ? t.title : tr('(unknown)'), status: t ? t.status : '', decisions: t ? decisionTitles(t) : [] };
  }).sort((a, b) => String(b.last).localeCompare(String(a.last)));
}

// Alle Dateien einer Aufgabe mit Zahl der Commits und Edits.
export function filesForTask(root, config, id) {
  const m = gitMap(root, config);
  const files = new Map();
  for (const [f, x] of Object.entries(m.byTask[id] || {})) files.set(f, { file: f, commits: x.commits, edits: 0, last: x.last });
  for (const e of readEdits(root)) {
    if (e.task !== id) continue;
    const x = files.get(e.file) || { file: e.file, commits: 0, edits: 0, last: '' };
    x.edits++; if (e.t > x.last) x.last = e.t;
    files.set(e.file, x);
  }
  // Andere Aufgaben, die dieselben Dateien berührt haben.
  const others = {};
  for (const f of files.keys()) {
    const ids = new Set(Object.keys(m.byFile[f] || {}));
    for (const e of readEdits(root)) if (e.file === f) ids.add(e.task);
    ids.delete(id);
    if (ids.size) others[f] = [...ids].sort();
  }
  return { files: [...files.values()].sort((a, b) => String(b.last).localeCompare(String(a.last))), others };
}

// Hinweis an Claude, wenn eine Datei zum ersten Mal in dieser Sitzung geändert wird und andere Aufgaben
// dort schon gearbeitet oder entschieden haben. Pro Sitzung und Datei nur einmal.
export function editHint(root, config, task, file, session) {
  if (!file) return '';
  const h = readJson(hintsFile(root), null) || {};
  const s = String(session || 'ohne');
  if (h.session !== s) { h.session = s; h.files = []; }
  if (h.files.includes(file)) return '';
  h.files.push(file);
  h.files = h.files.slice(-300);
  writeJson(hintsFile(root), h);
  const list = tasksForFile(root, config, file).filter((x) => x.id !== task && (x.decisions.length || ['in-arbeit', 'review'].includes(x.status)));
  if (!list.length) return '';
  const line = (x) => `- ${x.id} ${x.title} (${x.status || tr('unknown')}${x.commits ? `, ${x.commits === 1 ? tr('1 commit') : tr('{n} commits', { n: x.commits })}` : ''})${x.decisions.length ? `. ${tr('Decisions: {list}', { list: x.decisions.join('; ') })}` : ''}`;
  return `${tr('works: {file} was also changed in other tasks:', { file })}\n${list.slice(0, 4).map(line).join('\n')}\n`
    + tr('Briefly check whether your change contradicts these decisions or ongoing work (works show <ID>, decisions.md). If it does, ask the user.');
}

// Dateien, die eine Aufgabe in ihrer Beschreibung, im Umsetzungsplan oder im Kontext nennt.
export function mentionedFiles(t) {
  const text = stripComments(`${getSection(t._body, 'Beschreibung') || ''}\n${getSection(t._body, 'Umsetzungsplan') || ''}\n${getSection(t._body, 'Kontext') || ''}`);
  return [...new Set((text.match(/(?:[\w@.-]+\/)+[\w@.-]+\.[a-z0-9]{1,6}\b/gi) || []).map((s) => s.replace(/^\.\//, '')))];
}

// Dateien einer Aufgabe: aus Commits mit ihrer ID, aus Änderungen in files.jsonl und aus der task.md.
// Gemeinsame Grundlage für works parallel plan und den Konflikt-Radar im Board.
export function taskFiles(root, config, t, { map = gitMap(root, config), edits = readEdits(root) } = {}) {
  const set = new Set(Object.keys(map.byTask[t.id] || {}));
  for (const e of edits) if (e.task === t.id && e.file) set.add(e.file);
  for (const f of mentionedFiles(t)) set.add(f);
  return [...set];
}

// Konflikt-Radar: welche der übergebenen Aufgaben dieselben Dateien ändern. Ergebnis je ID, meiste Treffer zuerst.
export function fileConflicts(root, config, tasks) {
  const map = gitMap(root, config);
  const edits = readEdits(root);
  const sets = tasks.map((t) => [t.id, new Set(taskFiles(root, config, t, { map, edits }))]);
  const out = {};
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
    const [a, A] = sets[i]; const [b, B] = sets[j];
    const files = [...A].filter((f) => B.has(f)).sort();
    if (!files.length) continue;
    (out[a] = out[a] || []).push({ id: b, files });
    (out[b] = out[b] || []).push({ id: a, files });
  }
  for (const list of Object.values(out)) list.sort((x, y) => y.files.length - x.files.length || x.id.localeCompare(y.id));
  return out;
}
