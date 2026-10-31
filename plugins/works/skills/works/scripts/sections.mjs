// Abschnitte einer task.md an den Aufgabentyp anpassen: bei Typwechsel und als Reparatur für ältere Aufgaben.
import {
  parseFrontmatter, readTemplate, getSection, setSection, stripComments, today, addHistory,
  loadTasks, saveTask, TYPES,
} from './lib.mjs';

// Hauptabschnitt mit der Beschreibung je Typ.
export const GOAL_SECTION = {
  feature: 'Ziel', design: 'Ziel', refactor: 'Ziel', bug: 'Zusammenfassung',
  spike: 'Forschungsfrage', chore: 'Beschreibung', debt: 'Abkürzung',
};
// Abschnitte, in denen sonst eine Beschreibung stehen kann. Herkunft und Kontext bleiben, wo sie sind.
const DESCRIPTION_SOURCES = ['Ziel', 'Zusammenfassung', 'Beschreibung', 'Forschungsfrage', 'Abkürzung', 'Problem'];
const NEVER_ADD = ['Verlauf', 'Assets', 'Offene Fragen', 'Übergabe'];
const SECTION_RE = /(?:^|\n)## ([^\n]+)\n([\s\S]*?)(?=\n## |$)/g;

function templateSections(type) {
  const tpl = parseFrontmatter(readTemplate(`task-${type}.md`)).body;
  const out = [];
  let m;
  SECTION_RE.lastIndex = 0;
  while ((m = SECTION_RE.exec(tpl))) out.push({ name: m[1].trim(), content: m[2] });
  return out;
}

export function insertBefore(body, block) {
  for (const anchor of ['Assets', 'Offene Fragen', 'Übergabe', 'Verlauf']) {
    const i = body.search(new RegExp(`\\n## ${anchor}[ \\t]*\\n`));
    if (i !== -1) return `${body.slice(0, i)}\n${block}${body.slice(i)}`;
  }
  return `${body.replace(/\s+$/, '')}\n\n${block}`;
}

// Fügt einen neuen Abschnitt direkt hinter einem vorhandenen ein, sonst wie insertBefore.
export function insertAfter(body, after, block) {
  const h = after.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = body.match(new RegExp(`(^|\\n)## ${h}[ \\t]*\\n[\\s\\S]*?(?=\\n## |$)`));
  if (!m) return insertBefore(body, block);
  const end = m.index + m[0].length;
  return `${body.slice(0, end).replace(/\s+$/, '')}\n\n${block}${body.slice(end)}`;
}

export function removeSection(body, name) {
  const h = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return body.replace(new RegExp(`\\n## ${h}[ \\t]*\\n[\\s\\S]*?(?=\\n## |$)`), '');
}

const filled = (body, name) => stripComments(getSection(body, name) || '').trim();

// Ergänzt fehlende Abschnitte der Vorlage von type und holt die Beschreibung in den Hauptabschnitt.
// preferFrom: Abschnitt, aus dem zuerst übernommen wird (etwa der Hauptabschnitt des alten Typs).
// Vorhandene Inhalte bleiben erhalten. Ein Quellabschnitt wird nur entfernt, wenn er nicht zur Vorlage gehört,
// damit die Beschreibung nicht doppelt erscheint.
export function conformToType(t, type, { preferFrom = null } = {}) {
  if (!TYPES.includes(type)) return { added: [], moved: null };
  const tpl = templateSections(type);
  const tplNames = tpl.map((s) => s.name);
  const added = [];
  for (const s of tpl) {
    if (NEVER_ADD.includes(s.name) || getSection(t._body, s.name) !== null) continue;
    t._body = insertBefore(t._body, `## ${s.name}\n${s.content.replace(/\{\{date\}\}/g, today()).replace(/\s+$/, '')}\n`);
    added.push(s.name);
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
      moved = from;
    }
  }
  return { added, moved };
}

// Beim Typwechsel aufrufen.
export function adaptToType(t, oldType, newType) {
  const { added, moved } = conformToType(t, newType, { preferFrom: GOAL_SECTION[oldType] });
  const parts = [];
  if (added.length) parts.push(`Abschnitte ergänzt (${added.join(', ')})`);
  if (moved) parts.push(`Beschreibung aus ${moved} nach ${GOAL_SECTION[newType]} übernommen`);
  if (parts.length) addHistory(t, `Typwechsel ${oldType} → ${newType}: ${parts.join(', ')}`);
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
    if (moved) parts.push(`Beschreibung aus ${moved} nach ${GOAL_SECTION[t.type]} übernommen`);
    if (added.length) parts.push(`fehlende Abschnitte ergänzt (${added.join(', ')})`);
    fixed.push({ id: t.id, title: t.title, moved, added });
    if (dryRun) { t._body = before; continue; }
    addHistory(t, `Reparatur: ${parts.join(', ')}`);
    saveTask(t, { touch: false });
  }
  return fixed;
}
