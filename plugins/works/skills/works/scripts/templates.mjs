// Vorlagen für Aufgaben: JSON-Dateien in .works/templates/ (Projekt) oder ~/.works/templates/ (alle Projekte).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { worksDir, exists, readJson, writeJson, slugify, getSection, stripComments, checkboxes, TYPES, PRIORITIES, EFFORTS } from './lib.mjs';

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const KEY_RE = /^[\p{L}\p{N}_]{1,30}$/u;

export function templateDirs(root) {
  return { project: path.join(worksDir(root), 'templates'), user: path.join(os.homedir(), '.works', 'templates') };
}

export function listTemplates(root) {
  const dirs = templateDirs(root);
  const out = new Map();
  for (const scope of ['user', 'project']) {
    let files = [];
    try { files = fs.readdirSync(dirs[scope]).filter((f) => f.endsWith('.json')); } catch { continue; }
    for (const f of files) {
      const t = readJson(path.join(dirs[scope], f), null);
      if (!t || typeof t !== 'object') continue;
      const slug = f.replace(/\.json$/, '');
      if (!SLUG_RE.test(slug)) continue;
      try { out.set(slug, { ...normalizeTemplate({ ...t, slug }), scope }); } catch { /* defekte Vorlage überspringen */ }
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function findTemplate(root, slug) {
  return listTemplates(root).find((t) => t.slug === slug) || null;
}

const str = (v, max, name) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length > max) throw new Error(`${name} ist zu lang.`);
  return s;
};

// Prüft und vereinheitlicht eine Vorlage. Wirft bei ungültigen Angaben.
export function normalizeTemplate(t) {
  const name = str(t.name, 80, 'Name');
  if (!name) throw new Error('Name der Vorlage fehlt.');
  const slug = t.slug && SLUG_RE.test(t.slug) ? t.slug : slugify(name).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'vorlage';
  const fields = (Array.isArray(t.fields) ? t.fields : []).slice(0, 12).map((f) => {
    const key = str(f.key, 30, 'Feld');
    if (!KEY_RE.test(key)) throw new Error(`Ungültiger Feldname: ${key || 'leer'}. Erlaubt sind Buchstaben, Zahlen und _.`);
    const kind = f.kind === 'choice' ? 'choice' : 'text';
    const options = kind === 'choice' ? (Array.isArray(f.options) ? f.options : String(f.options || '').split(',')).map((o) => str(String(o), 60, 'Option')).filter(Boolean).slice(0, 20) : [];
    return { key, kind, options, required: !!f.required, hint: str(f.hint, 120, 'Hinweis') };
  });
  const criteria = (Array.isArray(t.criteria) ? t.criteria : []).slice(0, 30).map((c) => ({
    text: str(typeof c === 'string' ? c : c.text, 300, 'Kriterium'),
    mode: ['always', 'default', 'optional'].includes(c.mode) ? c.mode : 'always',
  })).filter((c) => c.text);
  return {
    slug, name,
    about: str(t.about, 200, 'Kurzbeschreibung'),
    title: str(t.title, 160, 'Titel'),
    type: TYPES.includes(t.type) ? t.type : 'feature',
    priority: PRIORITIES.includes(t.priority) ? t.priority : 'P3',
    effort: EFFORTS.includes(t.effort) ? t.effort : '',
    tags: (Array.isArray(t.tags) ? t.tags : String(t.tags || '').split(',')).map((x) => String(x).trim().replace(/^#/, '')).filter((x) => /^[\p{L}\p{N}_.+-]{1,40}$/u.test(x)).slice(0, 10),
    fields,
    description: str(t.description, 8000, 'Grundtext'),
    hints: str(t.hints, 2000, 'Hinweise für Claude'),
    criteria,
    uses: Number.isInteger(t.uses) ? t.uses : 0,
  };
}

export function saveTemplate(root, input, scope = 'project') {
  const t = normalizeTemplate(input);
  const dir = templateDirs(root)[scope === 'user' ? 'user' : 'project'];
  fs.mkdirSync(dir, { recursive: true });
  const { scope: _s, ...data } = t;
  writeJson(path.join(dir, `${t.slug}.json`), data);
  return t;
}

export function deleteTemplate(root, slug) {
  if (!SLUG_RE.test(slug)) throw new Error('Ungültige Vorlage.');
  const dirs = templateDirs(root);
  let n = 0;
  for (const d of Object.values(dirs)) {
    const f = path.join(d, `${slug}.json`);
    if (exists(f)) { fs.unlinkSync(f); n++; }
  }
  return n;
}

export function countUse(root, slug) {
  const t = findTemplate(root, slug);
  if (!t) return;
  try { saveTemplate(root, { ...t, uses: (t.uses || 0) + 1 }, t.scope); } catch { /* nicht kritisch */ }
}

const fill = (text, values) => String(text || '').replace(/\{([\p{L}\p{N}_]{1,30})\}/gu, (all, k) => (values[k] ? values[k] : all));

// Baut aus Vorlage, Feldwerten und dem freien Text des Nutzers die Angaben für eine neue Aufgabe.
export function applyTemplate(tpl, { values = {}, text = '', criteria = null, title = '' } = {}) {
  for (const f of tpl.fields) {
    if (f.required && !String(values[f.key] || '').trim()) throw new Error(`Feld ${f.key} ist ein Pflichtfeld.`);
    if (f.kind === 'choice' && values[f.key] && !f.options.includes(values[f.key])) throw new Error(`Ungültiger Wert für ${f.key}.`);
  }
  const base = fill(tpl.description, values).trim();
  const parts = [];
  if (text.trim()) parts.push(text.trim());
  if (base) parts.push(text.trim() ? `Aus der Vorlage „${tpl.name}“:\n\n${base}` : base);
  if (tpl.hints) parts.push(`Hinweise für Claude: ${fill(tpl.hints, values)}`);
  const chosen = criteria
    ? tpl.criteria.filter((c, i) => c.mode === 'always' || criteria.includes(i))
    : tpl.criteria.filter((c) => c.mode !== 'optional');
  return {
    title: (title || fill(tpl.title, values) || tpl.name).trim(),
    type: tpl.type, priority: tpl.priority, effort: tpl.effort, tags: tpl.tags,
    description: parts.join('\n\n'),
    criteria: chosen.map((c) => fill(c.text, values)),
  };
}

// Vorschlag für eine Vorlage aus einer bestehenden Aufgabe.
export function templateFromTask(task) {
  const desc = stripComments(getSection(task._body, 'Beschreibung') || getSection(task._body, 'Ziel') || '').trim();
  const crit = checkboxes(getSection(task._body, 'Akzeptanzkriterien') || '').items.map((i) => ({ text: i.text, mode: 'always' }));
  return {
    name: task.title.slice(0, 80), about: '', title: task.title, type: task.type, priority: task.priority, effort: task.effort || '',
    tags: task.tags || [], fields: [], description: desc, hints: '', criteria: crit,
  };
}
