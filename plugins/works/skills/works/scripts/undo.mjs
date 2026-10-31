// Rückgängig für Änderungen aus dem Board: Vor jeder Aktion wird der alte Stand der betroffenen Dateien
// in .works/.undo/ gesichert. Die letzten 50 Änderungen bleiben erhalten.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { worksDir, readJson, writeJson, exists, loadTasks } from './lib.mjs';

const MAX = 50;
const dir = (root) => path.join(worksDir(root), '.undo');
const indexFile = (root) => path.join(dir(root), 'index.json');

export function undoList(root) { return readJson(indexFile(root), []) || []; }

// Dateien, die eine Aufgabe ausmachen: alles im Aufgabenordner außer Bildern.
function taskFiles(t) {
  const out = [];
  for (const f of ['task.md', 'decisions.md', 'comments.md', 'checks.json', path.join('design', 'design.json')]) if (exists(path.join(t._dir, f))) out.push(path.join(t._dir, f));
  return out;
}

export function snapshot(root, { label, ids = [], config = false, extra = [] }) {
  const wd = worksDir(root);
  const all = loadTasks(root);
  const files = [];
  for (const id of ids) { const t = all.find((x) => x.id === id); if (t) files.push(...taskFiles(t), t._dir); }
  if (config) files.push(path.join(wd, 'config.json'));
  for (const e of extra) files.push(path.join(wd, e));
  const key = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const base = path.join(dir(root), key);
  const saved = [];
  const dirs = [];
  for (const f of [...new Set(files)]) {
    const rel = path.relative(wd, f);
    if (rel.startsWith('..')) continue;
    let st; try { st = fs.statSync(f); } catch { saved.push({ rel, missing: true }); continue; }
    if (st.isDirectory()) { dirs.push(rel); continue; }
    fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
    fs.copyFileSync(f, path.join(base, rel));
    saved.push({ rel });
  }
  const before = new Set(all.map((t) => path.relative(wd, t._dir)));
  const list = undoList(root);
  list.unshift({ key, label: String(label).slice(0, 160), at: new Date().toISOString(), files: saved, dirs, before: [...before] });
  for (const old of list.slice(MAX)) fs.rmSync(path.join(dir(root), old.key), { recursive: true, force: true });
  writeJson(indexFile(root), list.slice(0, MAX));
  return key;
}

// Stellt den Stand vor der Änderung wieder her. Neu angelegte Aufgaben werden entfernt,
// verschobene Ordner (Archiv) zurückbewegt.
export function undo(root, key) {
  const wd = worksDir(root);
  const list = undoList(root);
  const i = key ? list.findIndex((x) => x.key === key) : 0;
  const e = list[i];
  if (!e) throw new Error('Nichts zum Rückgängigmachen.');
  const base = path.join(dir(root), e.key);
  const before = new Set(e.before);
  // Neue Aufgabenordner entfernen, die erst durch die Änderung entstanden sind.
  const nowDirs = loadTasks(root).map((t) => path.relative(wd, t._dir));
  const created = nowDirs.filter((d) => !before.has(d));
  // Archivierte Aufgaben: der Ordner ist umgezogen, also zurückholen.
  for (const d of e.dirs) {
    if (exists(path.join(wd, d))) continue;
    const moved = created.find((c) => path.basename(c) === path.basename(d));
    if (moved) { fs.mkdirSync(path.dirname(path.join(wd, d)), { recursive: true }); fs.renameSync(path.join(wd, moved), path.join(wd, d)); }
  }
  for (const c of loadTasks(root).map((t) => path.relative(wd, t._dir)).filter((d) => !before.has(d))) {
    const trash = path.join(dir(root), 'entfernt', `${Date.now()}-${path.basename(c)}`);
    fs.mkdirSync(path.dirname(trash), { recursive: true });
    fs.renameSync(path.join(wd, c), trash);
  }
  for (const f of e.files) {
    const target = path.join(wd, f.rel);
    if (f.missing) { try { fs.unlinkSync(target); } catch { /* weg */ } continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(base, f.rel), target);
  }
  fs.rmSync(base, { recursive: true, force: true });
  list.splice(i, 1);
  writeJson(indexFile(root), list);
  return e;
}

export function relabel(root, key, label) {
  const list = undoList(root);
  const e = list.find((x) => x.key === key);
  if (e) { e.label = String(label).slice(0, 160); writeJson(indexFile(root), list); }
}

export function dropSnapshot(root, key) {
  const list = undoList(root).filter((x) => x.key !== key);
  fs.rmSync(path.join(dir(root), key), { recursive: true, force: true });
  writeJson(indexFile(root), list);
}
