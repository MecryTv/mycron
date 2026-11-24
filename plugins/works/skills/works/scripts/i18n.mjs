// Sprache (W-0041): Texte stehen englisch im Code und laufen durch t(). Übersetzungen liegen in
// i18n/<sprache>.json (englischer Text → Übersetzung, Platzhalter {name}). Fehlt ein Eintrag, bleibt es englisch.
// Weitere Sprache = weitere JSON-Datei. Ohne Abhängigkeiten, auch für Hooks und Plugins nutzbar.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const I18N_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'i18n');
export const LANGUAGE_NAMES = { en: 'English', de: 'Deutsch' };
export const settingsFile = () => path.join(os.homedir(), '.works', 'settings.json');

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
// "de-DE", "DE", "de_AT" → "de"
export const normLang = (s) => String(s || '').trim().toLowerCase().split(/[-_.]/)[0];

export function languages() {
  let files = [];
  try { files = fs.readdirSync(I18N_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch { /* nur Englisch */ }
  return ['en', ...files.filter((l) => l !== 'en').sort()];
}

// Projektwurzel ohne lib.mjs (Hooks und Plugins laden nur diese Datei): .works.link eines Worktrees oder .works/config.json.
function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    const link = readJson(path.join(dir, '.works.link'));
    if (link && link.root && fs.existsSync(path.join(link.root, '.works', 'config.json'))) return link.root;
    if (fs.existsSync(path.join(dir, '.works', 'config.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Reihenfolge: Umgebung WORKS_LANG, Projekt (.works/config.json), global (~/.works/settings.json), Englisch.
export function languageSource(root = findRoot()) {
  if (process.env.WORKS_LANG) return { lang: normLang(process.env.WORKS_LANG), source: 'env' };
  const project = root && readJson(path.join(root, '.works', 'config.json'));
  if (project && project.language) return { lang: normLang(project.language), source: 'project' };
  const global = readJson(settingsFile());
  if (global && global.language) return { lang: normLang(global.language), source: 'global' };
  return { lang: 'en', source: 'default' };
}
export const language = (root) => languageSource(root).lang;

let current = null;
// Feste Sprache für diesen Prozess (etwa nach works lang), null rechnet beim nächsten t() neu.
export function setLanguage(lang) { current = lang; }

const catalogs = {};
export function catalog(lang) {
  if (lang === 'en') return {};
  if (!catalogs[lang]) catalogs[lang] = readJson(path.join(I18N_DIR, `${lang}.json`)) || {};
  return catalogs[lang];
}

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? String(vars[k]) : all)) : s);

// tr('Created: {id}', { id }) → "Angelegt: W-0001" bei Deutsch. Heißt tr statt t, weil t im Code meist eine Aufgabe ist.
export function tr(text, vars, lang) {
  const l = lang || (current = current || language());
  const s = catalog(l)[text];
  return fill(typeof s === 'string' && s ? s : text, vars);
}
export const t = tr;

// Ein Text in allen Sprachen, für Parser, die alte und neue Dateien lesen (etwa Verlaufseinträge).
export function variants(text) {
  return [...new Set([text, ...languages().map((l) => catalog(l)[text]).filter(Boolean)])];
}

// Platzhalter eines Textes, für den Katalogtest.
export const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
