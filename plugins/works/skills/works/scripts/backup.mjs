// Das Board als eine JSON-Datei sichern und wieder einlesen (W-0021).
// Aufgaben reisen als ihre Dateien im Wortlaut. So ergeben Export und Import denselben Stand, auch für Abschnitte,
// die works später dazubekommt. Nur wenn sich ID oder Verweise ändern, wird der Kopf der task.md neu geschrieben.
import fs from 'node:fs';
import path from 'node:path';
import { worksDir, loadConfig, loadTasks, readText, readJson, writeJson, exists, formatId, idNumber, slugify, parseFrontmatter, serializeFrontmatter, sectionRegex } from './lib.mjs';

export const FORMAT = 'works-board';
const VERSION = 1;
const TEXT = ['task.md', 'decisions.md', 'comments.md', 'checks.json'];
const PLAN = ['milestones', 'sprints', 'sprint_settings', 'queue', 'queue_settings', 'recurring'];
const REFS = ['blocked_by', 'blocks', 'related'];
const CLOSED = ['erledigt', 'verworfen'];
const ID_RE = /^[A-Za-z][A-Za-z0-9]{0,9}-\d{1,8}$/;
const DIR_RE = /^[A-Za-z0-9][\w.-]{0,120}$/;
const BIN_RE = /^(assets|design|docs)\/[\w.-][\w./-]{0,200}$/;

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const lf = (s) => String(s).replace(/\r\n?/g, '\n');

function walk(dir, rel = '') {
  const out = [];
  if (!exists(path.join(dir, rel))) return out;
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, r));
    else if (e.name !== '.gitkeep') out.push(r);
  }
  return out;
}

// Verlauf und Übergabe leeren, die Überschriften bleiben.
function stripHistory(text) {
  for (const h of ['Verlauf', 'Übergabe']) text = text.replace(sectionRegex(h, 'g'), (all, pre, name) => `${pre}## ${name}\n`);
  return text;
}

// Kommt eine Aufgabe aus einem Export ohne Verlauf, behält sie beim Zusammenführen Verlauf und Übergabe des Boards.
function keepLocalHistory(theirs, local) {
  let out = theirs;
  for (const h of ['Verlauf', 'Übergabe']) {
    const m = local.match(sectionRegex(h));
    if (m) out = out.replace(sectionRegex(h), (x, pre, name) => `${pre}## ${name}\n${m[3]}`);
  }
  return out;
}

export function exportBoard(root, { closed = true, archive = false, comments = true, history = true, checks = false, planning = true, knowledge = true, images = false, designs = false } = {}) {
  const config = loadConfig(root);
  const wd = worksDir(root);
  const scope = { closed, archive, comments, history, checks, planning, knowledge, images, designs };
  const tasks = loadTasks(root).filter((t) => (t._archived ? archive : closed || !CLOSED.includes(t.status)));
  const out = { format: FORMAT, version: VERSION, project: path.basename(path.resolve(root)), exported: new Date().toISOString(), id_prefix: config.id_prefix, scope, tasks: [] };
  if (planning) out.planning = Object.fromEntries(PLAN.filter((k) => config[k] !== undefined).map((k) => [k, config[k]]));
  if (knowledge) for (const [k, f] of [['knowledge', 'wissen.md'], ['ideas', 'ideas.md']]) if (exists(path.join(wd, f))) out[k] = readText(path.join(wd, f));
  for (const t of tasks) {
    const files = {};
    for (const f of TEXT) {
      if ((f === 'comments.md' || f === 'decisions.md') && !comments) continue;
      if (f === 'checks.json' && !checks) continue;
      if (exists(path.join(t._dir, f))) files[f] = readText(path.join(t._dir, f));
    }
    if (!history) files['task.md'] = stripHistory(files['task.md']);
    const binary = {};
    for (const r of walk(t._dir)) {
      const want = (r.startsWith('assets/') && images) || ((r.startsWith('design/') || r.startsWith('docs/')) && designs);
      if (want && BIN_RE.test(r)) binary[r] = fs.readFileSync(path.join(t._dir, r)).toString('base64');
    }
    out.tasks.push({ id: t.id, title: t.title || '', status: t.status || '', priority: t.priority || '', archived: !!t._archived, dir: path.basename(t._dir), files, ...(Object.keys(binary).length ? { binary } : {}) });
  }
  return out;
}

// Prüft eine Sicherung, bevor irgendetwas geschrieben wird. Wirft mit verständlicher Meldung.
export function readBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  if (!d || d.format !== FORMAT) throw new Error('Das ist keine works-Sicherung (format "works-board" fehlt).');
  if (d.version !== VERSION) throw new Error(`Sicherung in Version ${d.version}, unterstützt wird Version ${VERSION}.`);
  if (!Array.isArray(d.tasks)) throw new Error('Die Sicherung enthält keine Aufgabenliste.');
  const ids = new Set();
  for (const [i, x] of d.tasks.entries()) {
    const where = `Aufgabe ${i + 1}`;
    if (!x || !ID_RE.test(String(x.id || ''))) throw new Error(`${where}: ungültige ID.`);
    if (ids.has(x.id)) throw new Error(`${where}: ID ${x.id} doppelt.`);
    ids.add(x.id);
    if (x.dir !== undefined && !(DIR_RE.test(String(x.dir)) && String(x.dir).startsWith(x.id + '-'))) throw new Error(`${where}: ungültiger Ordnername.`);
    if (!x.files || typeof x.files['task.md'] !== 'string') throw new Error(`${where}: task.md fehlt.`);
    for (const k of Object.keys(x.files)) if (!TEXT.includes(k) || typeof x.files[k] !== 'string') throw new Error(`${where}: unerwartete Datei ${k}.`);
    for (const [k, v] of Object.entries(x.binary || {})) if (!BIN_RE.test(k) || k.includes('..') || typeof v !== 'string') throw new Error(`${where}: ungültiger Dateipfad ${k}.`);
  }
  for (const k of ['knowledge', 'ideas']) if (d[k] !== undefined && typeof d[k] !== 'string') throw new Error(`${k} ist kein Text.`);
  return d;
}

const LABEL = { status: 'Status', priority: 'Priorität', title: 'Titel' };

function changesOf(t, x, noHistory) {
  const same = (a, b) => lf(a || '').replace(/^updated:.*$/m, '').trim() === lf(b || '').replace(/^updated:.*$/m, '').trim();
  const read = (f) => (exists(path.join(t._dir, f)) ? readText(path.join(t._dir, f)) : '');
  const local = (f) => (noHistory && f === 'task.md' ? stripHistory(read(f)) : read(f));
  const diff = Object.keys(x.files).filter((f) => !same(local(f), x.files[f]));
  if (!diff.length) return [];
  const theirs = parseFrontmatter(lf(x.files['task.md'])).data || {};
  const out = [];
  for (const k of Object.keys(LABEL)) if (String(t[k] || '') !== String(theirs[k] || '')) out.push({ field: k, label: LABEL[k], from: String(t[k] || ''), to: String(theirs[k] || '') });
  if (diff.includes('comments.md')) out.push({ field: 'comments', label: 'Kommentare' });
  if (diff.includes('decisions.md')) out.push({ field: 'decisions', label: 'Entscheidungen' });
  if (!out.length) out.push({ field: 'content', label: 'Inhalt' });
  return out;
}

// Abgleich mit dem Board: gleiche ID und gleicher Titel, sonst gleicher Titel unter anderer ID, sonst neu.
export function compareBackup(root, d) {
  const local = loadTasks(root);
  const byId = new Map(local.map((t) => [t.id, t]));
  const byTitle = new Map();
  for (const t of local) if (!byTitle.has(norm(t.title))) byTitle.set(norm(t.title), t);
  const used = new Set();
  const items = d.tasks.map((x, i) => {
    const n = i + 1; // wie beim übrigen Import ab 1, für --only
    let t = byId.get(x.id);
    if (t && (norm(t.title) !== norm(x.title) || used.has(t.id))) t = null;
    if (!t) { const c = byTitle.get(norm(x.title)); if (c && !used.has(c.id) && !d.tasks.some((y) => y.id === c.id && norm(y.title) === norm(c.title))) t = c; }
    if (t) used.add(t.id);
    const base = { n, id: x.id, title: x.title, status: x.status, priority: x.priority, archived: !!x.archived };
    if (!t) return { ...base, kind: 'neu' };
    const changes = changesOf(t, x, d.scope && d.scope.history === false);
    return { ...base, localId: t.id, kind: changes.length ? 'geaendert' : 'gleich', changes };
  });
  const onlyHere = local.filter((t) => !used.has(t.id)).map((t) => ({ id: t.id, title: t.title }));
  const count = (k) => items.filter((i) => i.kind === k).length;
  return { items, onlyHere, counts: { neu: count('neu'), geaendert: count('geaendert'), gleich: count('gleich'), nurHier: onlyHere.length } };
}

// task.md mit neuer ID und umgestellten Verweisen. Ohne Änderung bleibt der Text im Wortlaut.
function rewriteTask(text, id, map) {
  const { data, body } = parseFrontmatter(lf(text));
  if (!data) return text;
  let changed = data.id !== id;
  data.id = id;
  for (const f of REFS) {
    const list = Array.isArray(data[f]) ? data[f] : data[f] ? [String(data[f])] : [];
    const next = list.map((r) => map.get(r) || r);
    if (next.some((r, i) => r !== list[i])) changed = true;
    if (data[f] !== undefined || next.length) data[f] = next;
  }
  return changed ? serializeFrontmatter(data) + body.replace(/^\n*/, '\n') : text;
}

function writeTask(dir, x, taskText) {
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  if (!exists(path.join(dir, 'assets', '.gitkeep'))) fs.writeFileSync(path.join(dir, 'assets', '.gitkeep'), '');
  for (const [f, v] of Object.entries(x.files)) fs.writeFileSync(path.join(dir, f), f === 'task.md' ? taskText : v);
  for (const [r, v] of Object.entries(x.binary || {})) {
    const target = path.join(dir, ...r.split('/'));
    if (!path.resolve(target).startsWith(path.resolve(dir) + path.sep)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(v, 'base64'));
  }
}

function maxLocalId(root) {
  return Math.max(0, ...loadTasks(root).map((t) => idNumber(t.id)).filter((n) => !Number.isNaN(n)));
}

// Zusammenführen: gewählte neue Aufgaben anlegen (freie IDs), gewählte geänderte übernehmen. Was nur hier steht, bleibt.
// only: Nummern (n) aus compareBackup; ohne Angabe alle neuen und geänderten. snapshot: Rückgängig-Sicherung (undo.mjs).
export function mergeBackup(root, d, { only = null, snapshot = null } = {}) {
  const cmp = compareBackup(root, d);
  const chosen = cmp.items.filter((i) => i.kind !== 'gleich' && (!only || only.includes(i.n)));
  const config = loadConfig(root);
  const undoKey = snapshot ? snapshot({ label: `Import aus ${d.project || 'einer Sicherung'}: ${chosen.length} ${chosen.length === 1 ? 'Aufgabe' : 'Aufgaben'}`, ids: chosen.filter((i) => i.localId).map((i) => i.localId), config: true }) : null;
  let next = Math.max(config.next_id || 1, maxLocalId(root) + 1);
  const map = new Map();
  for (const i of cmp.items) if (i.localId) map.set(i.id, i.localId);
  for (const i of chosen) if (i.kind === 'neu') map.set(i.id, formatId(config, next++));
  const wd = worksDir(root);
  const local = new Map(loadTasks(root).map((t) => [t.id, t]));
  const created = []; const updated = [];
  for (const i of chosen) {
    const x = d.tasks[i.n - 1];
    const id = map.get(x.id);
    const dir = i.kind === 'neu' ? path.join(wd, x.archived ? 'archive' : 'tasks', `${id}-${slugify(x.title || id)}`) : local.get(i.localId)._dir;
    let text = rewriteTask(x.files['task.md'], id, map);
    if (i.kind !== 'neu' && d.scope && d.scope.history === false) text = keepLocalHistory(lf(text), readText(path.join(dir, 'task.md')));
    writeTask(dir, x, text);
    (i.kind === 'neu' ? created : updated).push(id);
  }
  const raw = readJson(path.join(wd, 'config.json'), {});
  raw.next_id = Math.max(raw.next_id || 1, next, maxLocalId(root) + 1);
  writeJson(path.join(wd, 'config.json'), raw);
  return { created, updated, undoKey, counts: cmp.counts };
}

// Wiederherstellen: sichert zuerst den ganzen Stand (mit Bildern und Entwürfen) in .works/backups/ und ersetzt dann
// Aufgaben, Archiv, Planung, Projektwissen und Ideen durch die Sicherung. backup: false beim Zurückspielen (Rückgängig).
export function restoreBackup(root, d, { backup = true } = {}) {
  const wd = worksDir(root);
  let file = '';
  if (backup) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    file = path.join(wd, 'backups', `vor-wiederherstellen-${stamp}.json`);
    writeJson(file, exportBoard(root, { closed: true, archive: true, comments: true, history: true, checks: true, planning: true, knowledge: true, images: true, designs: true }));
  }
  for (const t of loadTasks(root)) fs.rmSync(t._dir, { recursive: true, force: true });
  const ids = new Map(d.tasks.map((x) => [x.id, x.id]));
  for (const x of d.tasks) {
    const dir = path.join(wd, x.archived ? 'archive' : 'tasks', x.dir || `${x.id}-${slugify(x.title || x.id)}`);
    writeTask(dir, x, rewriteTask(x.files['task.md'], x.id, ids));
  }
  const raw = readJson(path.join(wd, 'config.json'), {});
  if (d.planning) for (const k of PLAN) { if (d.planning[k] !== undefined) raw[k] = d.planning[k]; else delete raw[k]; }
  raw.next_id = Math.max(raw.next_id || 1, maxLocalId(root) + 1);
  writeJson(path.join(wd, 'config.json'), raw);
  for (const [k, f] of [['knowledge', 'wissen.md'], ['ideas', 'ideas.md']]) if (typeof d[k] === 'string') fs.writeFileSync(path.join(wd, f), d[k]);
  return { tasks: d.tasks.length, backup: file };
}

// Angaben für den Export-Dialog: Anzahl je Gruppe und Größen, damit das Board die Dateigröße schätzen kann.
export function backupInfo(root) {
  const tasks = loadTasks(root);
  const files = (pred) => {
    let n = 0; let bytes = 0;
    for (const t of tasks) for (const r of walk(t._dir)) if (pred(r)) { n++; bytes += fs.statSync(path.join(t._dir, ...r.split('/'))).size; }
    return { n, bytes };
  };
  const live = tasks.filter((t) => !t._archived);
  return {
    open: live.filter((t) => !CLOSED.includes(t.status)).length,
    closed: live.filter((t) => CLOSED.includes(t.status)).length,
    archived: tasks.length - live.length,
    images: files((r) => r.startsWith('assets/')),
    designs: files((r) => r.startsWith('design/') || r.startsWith('docs/')),
    base: Buffer.byteLength(JSON.stringify(exportBoard(root, { archive: true }), null, 2)),
    file: backupFileName(root),
  };
}

export function backupFileName(root) {
  return `works-${slugify(path.basename(path.resolve(root)), 40) || 'board'}-${new Date().toISOString().slice(0, 10)}.json`;
}
