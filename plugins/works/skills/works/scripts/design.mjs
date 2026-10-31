// Entwürfe je Aufgabe: Designrichtung und Varianten aus UI UX Pro Max, Ergebnisse aus dem Superpowers Brainstorming.
// Alles liegt im Ordner design/ der Aufgabe, design.json ist das Verzeichnis dazu.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exists, readJson, writeJson, slugify, stripComments, today, nowStamp } from './lib.mjs';

const IMAGE = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'];
const ALLOWED = [...IMAGE, '.html', '.htm', '.md', '.pdf'];
export const VARIANT_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,20}$/;

export function designDir(task) { return path.join(task._dir, 'design'); }
const indexFile = (task) => path.join(designDir(task), 'design.json');

export function loadDesign(task) {
  const d = readJson(indexFile(task), null);
  return d && typeof d === 'object' ? { direction: null, variants: [], brainstorm: [], chosen: null, ...d } : null;
}

function saveDesign(task, d) {
  fs.mkdirSync(designDir(task), { recursive: true });
  writeJson(indexFile(task), d);
}

function ensure(task) { return loadDesign(task) || { direction: null, variants: [], brainstorm: [], chosen: null }; }

function copyIn(task, src, base) {
  const ext = path.extname(src).toLowerCase();
  if (!ALLOWED.includes(ext)) throw new Error(`Dateityp ${ext || 'ohne Endung'} wird nicht unterstützt. Erlaubt: ${ALLOWED.join(', ')}`);
  if (!exists(src)) throw new Error(`Datei ${src} nicht gefunden.`);
  const name = `${base}${ext === '.htm' ? '.html' : ext}`;
  fs.mkdirSync(designDir(task), { recursive: true });
  fs.copyFileSync(src, path.join(designDir(task), name));
  return name;
}

export function parseColors(v) {
  if (!v) return [];
  return String(v).split(',').map((s) => s.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^(?:([^=#]{1,40}?)\s*[=:]?\s*)?(#[0-9a-fA-F]{3,8})$/);
    if (!m) throw new Error(`Farbe "${p}" verstehe ich nicht. Format: Name #RRGGBB oder Name=#RRGGBB, durch Komma getrennt.`);
    return { name: (m[1] || '').trim(), hex: m[2].toUpperCase() };
  }).slice(0, 12);
}

export function setDirection(task, { text, file, source = '', colors = [], fonts = [], notes = '' }) {
  const d = ensure(task);
  const body = file ? fs.readFileSync(file, 'utf8') : String(text || '');
  if (!body.trim() && !colors.length) throw new Error('Leere Designrichtung. --file oder --text angeben.');
  fs.mkdirSync(designDir(task), { recursive: true });
  fs.writeFileSync(path.join(designDir(task), 'richtung.md'), body.trim() + '\n');
  d.direction = { source, at: nowStamp(), file: 'richtung.md', colors, fonts, notes: String(notes || '').slice(0, 300) };
  saveDesign(task, d);
  return d;
}

export function addVariant(task, { name, title = '', file, source = '', note = '' }) {
  if (!VARIANT_RE.test(name || '')) throw new Error('Name der Variante: Buchstaben oder Zahlen, etwa A, B oder tabs.');
  if (!file) throw new Error('Datei fehlt: --file mockup.html oder bild.png');
  const d = ensure(task);
  const stored = copyIn(task, file, `${name}-${slugify(title || name, 30)}`);
  const ext = path.extname(stored).toLowerCase();
  const entry = { name, title: String(title || name).slice(0, 80), file: stored, kind: ext === '.html' ? 'html' : IMAGE.includes(ext) ? 'image' : 'file', source, note: String(note || '').slice(0, 300), at: nowStamp() };
  d.variants = d.variants.filter((v) => v.name !== name).concat(entry);
  saveDesign(task, d);
  return entry;
}

export function removeVariant(task, name) {
  const d = loadDesign(task);
  if (!d) throw new Error('Keine Entwürfe vorhanden.');
  const v = d.variants.find((x) => x.name === name);
  if (!v) throw new Error(`Variante ${name} gibt es nicht.`);
  try { fs.unlinkSync(path.join(designDir(task), v.file)); } catch { /* weg */ }
  d.variants = d.variants.filter((x) => x.name !== name);
  if (d.chosen && d.chosen.name === name) d.chosen = null;
  saveDesign(task, d);
}

export function addBrainstorm(task, { file, text, source = 'superpowers', title = '' }) {
  const body = file ? fs.readFileSync(file, 'utf8') : String(text || '');
  if (!body.trim()) throw new Error('Leeres Brainstorming.');
  const d = ensure(task);
  const n = d.brainstorm.length + 1;
  const name = `brainstorm${n > 1 ? `-${n}` : ''}.md`;
  fs.mkdirSync(designDir(task), { recursive: true });
  fs.writeFileSync(path.join(designDir(task), name), body.trim() + '\n');
  d.brainstorm.push({ file: name, source, title: String(title || 'Brainstorming').slice(0, 80), at: nowStamp() });
  saveDesign(task, d);
  return d;
}

export function chooseVariant(task, name, reason = '') {
  const d = loadDesign(task);
  if (!d) throw new Error('Keine Entwürfe vorhanden.');
  const v = d.variants.find((x) => x.name === name);
  if (!v) throw new Error(`Variante ${name} gibt es nicht. Vorhanden: ${d.variants.map((x) => x.name).join(', ') || 'keine'}`);
  d.chosen = { name, at: nowStamp(), reason: String(reason || '').slice(0, 300) };
  saveDesign(task, d);
  // In decisions.md festhalten, damit die Entscheidung auch ohne Board nachlesbar ist.
  const dec = path.join(task._dir, 'decisions.md');
  const line = `\n- ${today()}: Variante ${name} „${v.title}“ gewählt${reason ? `, Grund: ${reason}` : ''}. Datei: design/${v.file}${d.variants.length > 1 ? `. Nicht gewählt: ${d.variants.filter((x) => x.name !== name).map((x) => `${x.name} ${x.title}`).join(', ')}` : ''}\n`;
  if (exists(dec)) {
    let s = fs.readFileSync(dec, 'utf8');
    if (!/^## Gewählter Entwurf/m.test(s)) s = s.replace(/\s*$/, '\n\n## Gewählter Entwurf\n');
    fs.writeFileSync(dec, s.replace(/(## Gewählter Entwurf\n)/, `$1${line}`));
  } else fs.writeFileSync(dec, `# Entscheidungen ${task.id}\n\n## Gewählter Entwurf\n${line}`);
  return { design: d, variant: v };
}

// Für das Board: Inhalte der Markdown-Dateien gleich mitliefern.
export function designDetail(root, task, relFromWorks) {
  const d = loadDesign(task);
  if (!d) return null;
  const read = (f) => { try { return stripComments(fs.readFileSync(path.join(designDir(task), f), 'utf8')).trim(); } catch { return ''; } };
  const rel = (f) => relFromWorks(root, path.join(designDir(task), f));
  return {
    direction: d.direction ? { ...d.direction, text: read(d.direction.file) } : null,
    variants: d.variants.map((v) => ({ ...v, src: rel(v.file) })),
    brainstorm: d.brainstorm.map((b) => ({ ...b, text: read(b.file) })),
    chosen: d.chosen,
  };
}

export function designSummary(task) {
  const d = loadDesign(task);
  if (!d) return null;
  return { variants: d.variants.length, chosen: d.chosen ? d.chosen.name : '', direction: !!d.direction, brainstorm: d.brainstorm.length };
}

// Ist eine Aufgabe eine Gestaltungsaufgabe? Dann nutzt Claude die Design-Skills.
export function needsDesign(task) {
  const tags = task.tags || [];
  return task.type === 'design' || tags.includes('ui') || tags.includes('design') || tags.includes('ux');
}

// Sucht installierte Skills für Brainstorming und UI UX Pro Max. Nur ein Hinweis, Claude kennt seine Skills selbst.
export function detectDesignSkills() {
  const roots = [path.join(os.homedir(), '.claude', 'skills'), path.join(os.homedir(), '.claude', 'plugins')];
  const found = { uiux: false, brainstorm: false };
  const walk = (dir, depth) => {
    if (depth < 0 || (found.uiux && found.brainstorm)) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const n = e.name.toLowerCase();
      if (/ui-?ux-?pro-?max/.test(n)) found.uiux = true;
      if (/brainstorm/.test(n)) found.brainstorm = true;
      walk(path.join(dir, e.name), depth - 1);
    }
  };
  for (const r of roots) walk(r, 5);
  return found;
}
