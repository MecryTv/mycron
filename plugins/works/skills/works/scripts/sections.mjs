// Abschnitte einer task.md an den Aufgabentyp anpassen: bei Typwechsel und als Reparatur für ältere Aufgaben.
// Namen im Code sind die deutschen Schlüssel; in der Datei steht die Überschrift in der Sprache der Aufgabe (W-0041).
import {
  parseFrontmatter, readTemplate, getSection, setSection, stripComments, today, addHistory,
  loadTasks, saveTask, TYPES, sectionKey, sectionRegex, sectionTitle, bodyLang,
} from './lib.mjs';
import { tr } from './i18n.mjs';

// Hauptabschnitt mit der Beschreibung je Typ.
export const GOAL_SECTION = {
  feature: 'Ziel', design: 'Ziel', refactor: 'Ziel', bug: 'Zusammenfassung',
  spike: 'Forschungsfrage', chore: 'Beschreibung', debt: 'Abkürzung',
};
// Abschnitte, in denen sonst eine Beschreibung stehen kann. Herkunft und Kontext bleiben, wo sie sind.
const DESCRIPTION_SOURCES = ['Ziel', 'Zusammenfassung', 'Beschreibung', 'Forschungsfrage', 'Abkürzung', 'Problem'];
const NEVER_ADD = ['Verlauf', 'Assets', 'Offene Fragen', 'Übergabe'];
const SECTION_RE = /(?:^|\n)## ([^\n]+)\n([\s\S]*?)(?=\n## |$)/g;

function templateSections(type, lang) {
  const tpl = parseFrontmatter(readTemplate(`task-${type}.md`, lang)).body;
  const out = [];
  let m;
  SECTION_RE.lastIndex = 0;
  while ((m = SECTION_RE.exec(tpl))) out.push({ name: sectionKey(m[1].trim()), content: m[2] });
  return out;
}

export function insertBefore(body, block) {
  for (const anchor of ['Assets', 'Offene Fragen', 'Übergabe', 'Verlauf']) {
    const m = body.match(sectionRegex(anchor));
    if (m && m[1]) return `${body.slice(0, m.index)}\n${block}${body.slice(m.index)}`;
  }
  return `${body.replace(/\s+$/, '')}\n\n${block}`;
}

// Fügt einen neuen Abschnitt direkt hinter einem vorhandenen ein, sonst wie insertBefore.
export function insertAfter(body, after, block) {
  const m = body.match(sectionRegex(after));
  if (!m) return insertBefore(body, block);
  const end = m.index + m[0].length;
  return `${body.slice(0, end).replace(/\s+$/, '')}\n\n${block}${body.slice(end)}`;
}

export function removeSection(body, name) {
  return body.replace(sectionRegex(name), (all, pre) => (pre ? '' : all));
}

const filled = (body, name) => stripComments(getSection(body, name) || '').trim();
const title = (body, key) => sectionTitle(key, body);

// Ergänzt fehlende Abschnitte der Vorlage von type und holt die Beschreibung in den Hauptabschnitt.
// preferFrom: Abschnitt, aus dem zuerst übernommen wird (etwa der Hauptabschnitt des alten Typs).
// Vorhandene Inhalte bleiben erhalten. Ein Quellabschnitt wird nur entfernt, wenn er nicht zur Vorlage gehört,
// damit die Beschreibung nicht doppelt erscheint.
export function conformToType(t, type, { preferFrom = null } = {}) {
  if (!TYPES.includes(type)) return { added: [], moved: null };
  const tpl = templateSections(type, bodyLang(t._body));
  const tplNames = tpl.map((s) => s.name);
  const added = [];
  for (const s of tpl) {
    if (NEVER_ADD.includes(s.name) || getSection(t._body, s.name) !== null) continue;
    t._body = insertBefore(t._body, `## ${title(t._body, s.name)}\n${s.content.replace(/\{\{date\}\}/g, today()).replace(/\s+$/, '')}\n`);
    added.push(title(t._body, s.name));
  }
  const goal = GOAL_SECTION[type];
  let moved = null;
  // Eine gefüllte Beschreibung ist der zentrale Abschnitt und muss nicht verschoben werden.
  if (!filled(t._body, goal) && !filled(t._body, 'Beschreibung')) {
    const order = [preferFrom, ...DESCRIPTION_SOURCES].filter((n, i, a) => n && n !== goal && a.indexOf(n) === i);
    const from = order.find((n) => filled(t._body, n));
    if (from) {
      t._body = setSection(t._body, goal, filled(t._body, from));
      if (!tplNames.includes(from)) t._body = removeSection(t._body, from);
      moved = title(t._body, from);
    }
  }
  return { added, moved };
}

// Beim Typwechsel aufrufen.
export function adaptToType(t, oldType, newType) {
  const { added, moved } = conformToType(t, newType, { preferFrom: GOAL_SECTION[oldType] });
  const parts = [];
  if (added.length) parts.push(tr('sections added ({list})', { list: added.join(', ') }));
  if (moved) parts.push(tr('description moved from {from} to {to}', { from: moved, to: title(t._body, GOAL_SECTION[newType]) }));
  if (parts.length) addHistory(t, tr('Type change {from} → {to}: {parts}', { from: oldType, to: newType, parts: parts.join(', ') }));
}

// Repariert Aufgaben, deren Beschreibung nicht im Hauptabschnitt ihres Typs steht oder denen Vorlagenabschnitte fehlen.
// Gibt die geänderten Aufgaben zurück. dryRun: nur melden, nichts schreiben.
export function repairTasks(root, { dryRun = false } = {}) {
  const fixed = [];
  for (const t of loadTasks(root)) {
    if (!t._valid || !TYPES.includes(t.type)) continue;
    const before = t._body;
    const { added, moved } = conformToType(t, t.type);
    if (t._body === before) continue;
    const parts = [];
    if (moved) parts.push(tr('description moved from {from} to {to}', { from: moved, to: title(t._body, GOAL_SECTION[t.type]) }));
    if (added.length) parts.push(tr('missing sections added ({list})', { list: added.join(', ') }));
    fixed.push({ id: t.id, title: t.title, moved, added });
    if (dryRun) { t._body = before; continue; }
    addHistory(t, tr('Repair: {parts}', { parts: parts.join(', ') }));
    saveTask(t, { touch: false });
  }
  return fixed;
}
