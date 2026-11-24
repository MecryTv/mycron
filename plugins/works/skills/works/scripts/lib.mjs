// Gemeinsame Hilfsfunktionen für das works CLI. Keine externen Abhängigkeiten.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tr, language } from './i18n.mjs';

// Kennung eines Projekts (W-0029): Hash des echten Pfads. Steht in data.json, ohne den Pfad preiszugeben.
export function rootIdOf(dir) {
  let real = String(dir);
  try { real = fs.realpathSync(real); } catch { /* Pfad wie angegeben */ }
  return crypto.createHash('sha256').update(process.platform === 'win32' ? real.toLowerCase() : real).digest('hex').slice(0, 16);
}

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATE_DIR = path.join(SKILL_DIR, 'references', 'templates');
// Vorlagen je Sprache: Englisch in references/templates, sonst references/<sprache>/templates.
export const templateDir = (lang = language(findRoot())) => {
  const dir = path.join(SKILL_DIR, 'references', lang, 'templates');
  return lang !== 'en' && exists(dir) ? dir : TEMPLATE_DIR;
};

// Gespeicherte Werte bleiben deutsch (Daten), angezeigt wird die Übersetzung. Die Getter übersetzen bei jedem Zugriff,
// so zeigen auch Board und JSON (Object.entries, JSON.stringify) die eingestellte Sprache.
const translated = (map) => Object.defineProperties({}, Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { get: () => tr(v), enumerable: true }])));
export const STATUSES = ['backlog', 'geplant', 'in-arbeit', 'review', 'erledigt', 'verworfen'];
export const OPEN_STATUSES = ['backlog', 'geplant', 'in-arbeit', 'review'];
export const CLOSED_STATUSES = ['erledigt', 'verworfen'];
export const STATUS_LABEL = translated({
  backlog: 'Backlog', geplant: 'Planned', 'in-arbeit': 'In progress',
  review: 'Review', erledigt: 'Done', verworfen: 'Dropped',
});
export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
export const PRIO_LABEL = translated({ P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' });
export const TYPES = ['feature', 'bug', 'refactor', 'spike', 'chore', 'design', 'debt'];
export const TYPE_LABEL = translated({
  feature: 'Feature', bug: 'Bug', refactor: 'Refactoring', spike: 'Spike',
  chore: 'Chore', design: 'Design', debt: 'Tech debt',
});
export const EFFORTS = ['S', 'M', 'L', 'XL'];
export const RISKS = ['niedrig', 'mittel', 'hoch'];
// Englische Eingaben für die gespeicherten Werte (W-0041): status=done speichert erledigt.
export const VALUE_ALIAS = {
  status: { planned: 'geplant', 'in-progress': 'in-arbeit', done: 'erledigt', dropped: 'verworfen' },
  risk: { low: 'niedrig', medium: 'mittel', high: 'hoch' },
  kind: { current: 'ist', before: 'vorher', after: 'nachher', reference: 'referenz', sketch: 'skizze', error: 'fehler', diagram: 'diagramm' },
};
export const normValue = (field, v) => (typeof v === 'string' && (VALUE_ALIAS[field] || {})[v.toLowerCase()]) || v;
export const BRANCH_PREFIX = {
  feature: 'feature', bug: 'fix', refactor: 'refactor', spike: 'chore',
  chore: 'chore', design: 'feature', debt: 'refactor',
};

export const FIELD_ORDER = [
  'id', 'title', 'type', 'priority', 'status', 'effort', 'risk',
  'created', 'updated', 'due', 'completed', 'milestone', 'branch', 'tags',
  'blocked_by', 'blocks', 'related', 'source', 'incomplete', 'reopened',
];
export const LIST_FIELDS = ['tags', 'blocked_by', 'blocks', 'related'];

export const DEFAULT_CONFIG = {
  version: 1,
  id_prefix: 'W',
  id_digits: 4,
  next_id: 1,
  next_idea_id: 1,
  milestones: [],
  dod: {
    global: [
      'Build and tests pass without errors',
      'code-audit skill was run for the changes',
      'History is up to date and design decisions are documented',
    ],
    by_type: {
      bug: ['Regression test exists or skipping it is justified'],
      refactor: ['Externally visible behavior is unchanged'],
      spike: ['Follow-up tasks are created'],
      debt: ['Debt is fully repaid or the remaining follow-up costs are documented'],
    },
    by_tag: {
      ui: ['responsive-website-check was run'],
    },
    commands: [],
  },
  assets: {
    max_width: 2400,
    quality: 82,
    compress_on_add: false,
  },
  brainstorm: {
    mode: 'link',
  },
  github: {
    label_priority: {
      P1: ['P1', 'critical', 'kritisch', 'blocker', 'security'],
      P2: ['P2', 'high', 'hoch', 'important'],
      P4: ['P4', 'low', 'niedrig', 'nice-to-have'],
    },
    label_type: {
      bug: ['bug', 'fehler'],
      feature: ['enhancement', 'feature'],
      design: ['design', 'ui', 'ux'],
      refactor: ['refactor', 'refactoring'],
      chore: ['chore', 'maintenance', 'dependencies'],
      spike: ['question', 'research', 'spike'],
      debt: ['tech-debt', 'debt'],
    },
  },
  scan: {
    markers: ['TODO', 'FIXME', 'HACK', 'XXX'],
    ignore: ['node_modules', 'dist', 'build', '.next', 'out', 'coverage', 'vendor', '.works', '.git', 'target'],
  },
  hooks: {
    session_start: true,
    stop_reminder: true,
  },
  report: {
    days: 7,
  },
  handoff_stale_days: 3,
  // Reihenfolge, in der Claude Aufgaben abarbeiten soll (IDs), und wie danach weitergemacht wird.
  queue: [],
  queue_settings: {
    auto_next: false,
    skip_blocked: true,
    ask_before: true,
  },
};

export function queueOf(config) {
  return Array.isArray(config.queue) ? config.queue.filter((x) => typeof x === 'string') : [];
}

// Entfernt erledigte, verworfene oder unbekannte Aufgaben aus der Warteschlange. Gibt true zurück, wenn sich etwas geändert hat.
export function pruneQueue(root, config, tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const before = queueOf(config);
  const after = before.filter((id, i) => before.indexOf(id) === i && byId.has(id) && !['erledigt', 'verworfen'].includes(byId.get(id).status));
  if (after.length === before.length) return false;
  config.queue = after;
  saveConfig(root, config);
  return true;
}

// ---------- Allgemein ----------

export function today() {
  return new Date().toLocaleDateString('sv-SE');
}

export function nowStamp() {
  const d = new Date();
  return `${d.toLocaleDateString('sv-SE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

export function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}

export function slugify(text, max = 40) {
  const map = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };
  let s = String(text).replace(/[äöüßÄÖÜ]/g, (c) => map[c]).toLowerCase();
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > max) s = s.slice(0, max).replace(/-[^-]*$/, '') || s.slice(0, max);
  return s || 'task';
}

export function fail(msg, code = 1) {
  process.stderr.write(tr('Error: {msg}', { msg }) + '\n');
  process.exit(code);
}

export function warn(msg) {
  process.stderr.write(tr('Note: {msg}', { msg }) + '\n');
}

// windowsHide: Ohne das öffnet Windows für jeden Aufruf aus einem Prozess ohne Konsole
// (Board-Server, Hooks) ein eigenes Terminalfenster.
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...opts });
  return { ok: r.status === 0, code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}

// Seite oder Datei im Standardbrowser öffnen. WORKS_DRY_OPEN meldet nur, was geöffnet würde (Selbsttest).
export function openInBrowser(target) {
  if (process.env.WORKS_DRY_OPEN) return tr('Opened in browser (dry run): {target}', { target });
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  run(opener, [target], { detached: true, stdio: 'ignore', windowsHide: false });
  return tr('Opened in browser: {target}', { target });
}

export function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

export function readJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

export function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

export function deepMerge(base, over) {
  if (Array.isArray(base) || Array.isArray(over)) return over === undefined ? base : over;
  if (typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = (k in base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]))
      ? deepMerge(base[k], v) : v;
  }
  return out;
}

// ---------- Projekt ----------

// In einem Worktree einer parallelen Aufgabe zeigt .works.link auf das Hauptprojekt.
// So schreiben alle Agenten in dieselbe .works statt in die ausgecheckte Kopie.
export function laneLink(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    const f = path.join(dir, '.works.link');
    if (exists(f)) {
      const l = readJson(f, null);
      if (l && l.root && exists(path.join(l.root, '.works', 'config.json'))) return { ...l, path: dir };
    }
    if (exists(path.join(dir, '.works', 'config.json'))) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    const link = path.join(dir, '.works.link');
    if (exists(link)) {
      const l = readJson(link, null);
      if (l && l.root && exists(path.join(l.root, '.works', 'config.json'))) return l.root;
    }
    if (exists(path.join(dir, '.works', 'config.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireRoot() {
  const root = findRoot();
  if (!root) fail(tr('No .works folder found. Run `works init` in the project root first.'));
  return root;
}

export function worksDir(root) { return path.join(root, '.works'); }

export function loadConfig(root) {
  const raw = readJson(path.join(worksDir(root), 'config.json'), {});
  return deepMerge(DEFAULT_CONFIG, raw);
}

export function saveConfig(root, config) {
  writeJson(path.join(worksDir(root), 'config.json'), config);
}

export function loadState(root) {
  return readJson(path.join(worksDir(root), 'state.json'), {});
}

export function saveState(root, state) {
  writeJson(path.join(worksDir(root), 'state.json'), state);
}

export function formatId(config, n) {
  return `${config.id_prefix}-${String(n).padStart(config.id_digits, '0')}`;
}

export function idNumber(id) {
  const m = String(id).match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : NaN;
}

export function normalizeId(config, input) {
  if (!input) return null;
  const s = String(input).trim().toUpperCase();
  if (/^\d+$/.test(s)) return formatId(config, parseInt(s, 10));
  const m = s.match(/^([A-Z]+)-?(\d+)$/);
  if (m) return formatId({ ...config, id_prefix: m[1] }, parseInt(m[2], 10));
  return s;
}

// ---------- Frontmatter ----------

function unquote(s) {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

function splitList(inner) {
  const out = [];
  let cur = '';
  let q = null;
  for (const ch of inner) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseValue(v) {
  v = v.trim();
  if (v === '' || v === '~' || v === 'null') return null;
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return splitList(inner).map((x) => unquote(x)).filter((x) => x !== '');
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  return unquote(v);
}

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!m) return { data: null, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const mm = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!mm) continue;
    data[mm[1]] = parseValue(mm[2]);
  }
  return { data, body: text.slice(m[0].length) };
}

function fmtValue(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return `[${v.map((x) => fmtScalar(String(x), true)).join(', ')}]`;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  return fmtScalar(String(v), false);
}

function fmtScalar(s, inArray) {
  if (s === '') return '""';
  const safe = inArray
    ? /^[\p{L}\p{N}_./@+(][\p{L}\p{N}_ ./@+()&!?#-]*$/u
    : /^[\p{L}\p{N}_./@+(][\p{L}\p{N}_ ./@+()&!?,#-]*$/u;
  if (safe.test(s) && !/^(true|false|null|~|\d+)$/.test(s) && !s.endsWith(' ') && !s.includes(' #')) return s;
  return JSON.stringify(s);
}

export function serializeFrontmatter(data) {
  const keys = [...FIELD_ORDER.filter((k) => k in data), ...Object.keys(data).filter((k) => !FIELD_ORDER.includes(k))];
  const lines = keys.map((k) => {
    const val = fmtValue(data[k]);
    return val === '' ? `${k}:` : `${k}: ${val}`;
  });
  return `---\n${lines.join('\n')}\n---\n`;
}

// ---------- Markdown Abschnitte ----------

// Abschnitte (W-0041): Im Code heißen sie deutsch (Schlüssel), in der Datei wie in der Sprache der Aufgabe.
// Deutsche und englische Aufgaben bleiben so beide gültig. Eine weitere Sprache bekommt hier eine Spalte.
export const SECTION_NAMES = {
  en: {
    Ziel: 'Goal', Beschreibung: 'Description', 'Kontext und Problem': 'Context and problem', Nutzerperspektive: 'User perspective',
    Akzeptanzkriterien: 'Acceptance criteria', Umsetzungsplan: 'Implementation plan', 'Betroffene Dateien': 'Affected files',
    Designentscheidungen: 'Design decisions', 'Offene Fragen': 'Open questions', Übergabe: 'Handoff', Verlauf: 'History',
    Herkunft: 'Origin', Zusammenfassung: 'Summary', Reproduktion: 'Reproduction', 'Erwartetes Verhalten': 'Expected behavior',
    'Tatsächliches Verhalten': 'Actual behavior', Umgebung: 'Environment', 'Logs und Fehlermeldungen': 'Logs and error messages',
    Ursache: 'Root cause', Lösung: 'Solution', Checkliste: 'Checklist', Abkürzung: 'Shortcut taken', Grund: 'Reason',
    'Folgekosten und Risiko': 'Follow-up costs and risk', Auslöser: 'Trigger', Rückzahlung: 'Repayment',
    'Zielgruppe und Kontext': 'Audience and context', Referenzen: 'References', Varianten: 'Variants', 'Gewählte Lösung': 'Chosen solution',
    'Ist-Zustand': 'Current state', Zielarchitektur: 'Target architecture', Risiken: 'Risks', Forschungsfrage: 'Research question',
    Zeitlimit: 'Timebox', Hypothesen: 'Hypotheses', Vorgehen: 'Approach', Ergebnisse: 'Results', Empfehlung: 'Recommendation',
    Folgeaufgaben: 'Follow-up tasks', Quellen: 'Sources', 'Brainstorm-Zusammenfassung': 'Brainstorm summary', Entscheidungen: 'Decisions',
    'UI und UX': 'UI and UX', Kontext: 'Context', 'Gewählter Entwurf': 'Chosen design', Fehlerbild: 'Error description',
  },
};
const HEADING_LANG = new Map();
for (const [lang, names] of Object.entries(SECTION_NAMES)) {
  for (const [k, v] of Object.entries(names)) if (k !== v) { HEADING_LANG.set(k, 'de'); HEADING_LANG.set(v, lang); }
}

// Schlüssel zu einer Überschrift in beliebiger Sprache ("Acceptance criteria" → "Akzeptanzkriterien").
export function sectionKey(name) {
  for (const names of Object.values(SECTION_NAMES)) for (const [k, v] of Object.entries(names)) if (v === name) return k;
  return name;
}
export function sectionVariants(heading) {
  const key = sectionKey(heading);
  return [...new Set([key, heading, ...Object.values(SECTION_NAMES).map((n) => n[key]).filter(Boolean)])];
}

// Sprache einer task.md nach ihren Überschriften; ohne bekannte Überschrift die eingestellte Sprache.
export function bodyLang(body) {
  const score = {};
  for (const m of String(body || '').matchAll(/^## (.+?)[ \t]*$/gm)) {
    const l = HEADING_LANG.get(m[1]);
    if (l) score[l] = (score[l] || 0) + 1;
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : language(findRoot());
}

// Überschrift für einen Abschnitt in der Sprache dieser Aufgabe.
export function sectionTitle(heading, body = '') {
  const key = sectionKey(heading);
  const lang = bodyLang(body);
  return lang === 'de' ? key : ((SECTION_NAMES[lang] || {})[key] || heading);
}

// Gruppen: 1 davor, 2 Überschrift wie in der Datei, 3 Inhalt.
export function sectionRegex(heading, flags = '') {
  const alt = sectionVariants(heading).map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`(^|\\n)## (${alt})[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$)`, flags);
}

export function getSection(body, heading) {
  const m = body.match(sectionRegex(heading));
  return m ? m[3] : null;
}

export function setSection(body, heading, content) {
  const re = sectionRegex(heading);
  const text = `${content.replace(/\s+$/, '')}\n`;
  if (re.test(body)) {
    return body.replace(re, (all, pre, name) => `${pre}## ${name}\n${text}`);
  }
  const block = `## ${sectionTitle(heading, body)}\n${text}`;
  // vor "Verlauf" einfügen, falls vorhanden, sonst anhängen
  const verlauf = sectionKey(heading) === 'Verlauf' ? null : body.match(sectionRegex('Verlauf'));
  if (verlauf && verlauf[1]) {
    const idx = verlauf.index;
    return `${body.slice(0, idx)}\n${block}${body.slice(idx)}`;
  }
  return `${body.replace(/\s+$/, '')}\n\n${block}`;
}

export function stripComments(text) {
  return (text || '').replace(/<!--[\s\S]*?-->/g, '');
}

export function appendToSection(body, heading, line) {
  const cur = getSection(body, heading);
  if (cur === null) return setSection(body, heading, line);
  const cleaned = cur.replace(/\s+$/, '');
  return setSection(body, heading, cleaned ? `${cleaned}\n${line}` : line);
}

export function checkboxes(text) {
  const items = [];
  for (const line of stripComments(text).split('\n')) {
    const m = line.match(/^\s*[-*]\s+\[( |x|X)\]\s*(.*)$/);
    if (m && m[2].trim()) items.push({ done: m[1] !== ' ', text: m[2].trim() });
  }
  return { total: items.length, done: items.filter((i) => i.done).length, items };
}

export function hasContent(text) {
  if (text === null || text === undefined) return false;
  const t = stripComments(text)
    .split('\n')
    .filter((l) => l.trim() && !/^\s*[-*]\s+(\[ \])?\s*$/.test(l) && !/^\s*\d+\.\s*$/.test(l))
    .join('\n');
  return t.trim().length > 0;
}

export function imageLinks(text) {
  const out = [];
  const re = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(text || ''))) out.push({ alt: m[1], src: decodeURI(m[2]) });
  return out;
}

// ---------- Aufgaben ----------

export function taskDirs(root) {
  const res = [];
  for (const [sub, archived] of [['tasks', false], ['archive', true]]) {
    const base = path.join(worksDir(root), sub);
    if (!exists(base)) continue;
    for (const name of fs.readdirSync(base).sort()) {
      const dir = path.join(base, name);
      if (fs.statSync(dir).isDirectory() && exists(path.join(dir, 'task.md'))) res.push({ dir, archived, name });
    }
  }
  return res;
}

// Textdateien lesen und Zeilenenden auf LF bringen. Git mit core.autocrlf=true checkt .works unter Windows
// mit CRLF aus; die Parser erwarten LF. Geschrieben wird immer mit LF.
export function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
}

export function loadTask(dir, archived = false) {
  const file = path.join(dir, 'task.md');
  const text = readText(file);
  const { data, body } = parseFrontmatter(text);
  const d = data || {};
  for (const f of LIST_FIELDS) {
    if (d[f] === null || d[f] === undefined) d[f] = [];
    else if (!Array.isArray(d[f])) d[f] = [String(d[f])];
  }
  return {
    ...d,
    _dir: dir,
    _file: file,
    _archived: archived,
    _body: body,
    _valid: data !== null,
    _mtime: fs.statSync(file).mtimeMs,
  };
}

export function loadTasks(root, { archive = true } = {}) {
  return taskDirs(root)
    .filter((t) => archive || !t.archived)
    .map((t) => loadTask(t.dir, t.archived));
}

export function findTask(root, config, idInput) {
  const id = normalizeId(config, idInput);
  const tasks = loadTasks(root);
  const t = tasks.find((x) => x.id === id) || tasks.find((x) => path.basename(x._dir).startsWith(id + '-'));
  if (!t) fail(tr('Task {id} not found.', { id }));
  return t;
}

export function taskData(task) {
  const data = {};
  for (const [k, v] of Object.entries(task)) if (!k.startsWith('_')) data[k] = v;
  return data;
}

export function saveTask(task, { touch = true } = {}) {
  const data = taskData(task);
  if (touch) data.updated = today();
  for (const f of LIST_FIELDS) if (Array.isArray(data[f]) && data[f].length === 0) data[f] = [];
  fs.writeFileSync(task._file, serializeFrontmatter(data) + task._body.replace(/^\n*/, '\n'));
  Object.assign(task, data);
}

// WORKS_ACTOR markiert, wer die Änderung ausgelöst hat (das Board setzt "Board").
export function addHistory(task, text) {
  const actor = process.env.WORKS_ACTOR ? ` [${process.env.WORKS_ACTOR}]` : '';
  task._body = appendToSection(task._body, 'Verlauf', `- ${today()}: ${text}${actor}`);
}

export function relFromWorks(root, p) {
  return path.relative(worksDir(root), p).split(path.sep).join('/');
}

export function isBlocked(task, byId) {
  return (task.blocked_by || []).some((b) => {
    const dep = byId.get(b);
    return !dep || dep.status !== 'erledigt';
  });
}

export function openBlockers(task, byId) {
  return (task.blocked_by || []).filter((b) => {
    const dep = byId.get(b);
    return !dep || dep.status !== 'erledigt';
  });
}

export function isOverdue(task) {
  return task.due && OPEN_STATUSES.includes(task.status) && String(task.due) < today();
}

export function openQuestions(task) {
  return checkboxes(getSection(task._body, 'Offene Fragen') || '').items.filter((i) => !i.done);
}

export function prioRank(p) {
  const i = PRIORITIES.indexOf(p);
  return i === -1 ? 9 : i;
}

export function effortRank(e) {
  const i = EFFORTS.indexOf(e);
  return i === -1 ? 2 : i;
}

export function sortTasks(list) {
  return [...list].sort((a, b) =>
    prioRank(a.priority) - prioRank(b.priority)
    || STATUSES.indexOf(b.status) - STATUSES.indexOf(a.status)
    || idNumber(a.id) - idNumber(b.id));
}

// Vorlage in der eingestellten Sprache oder in lang (etwa der Sprache einer vorhandenen Aufgabe).
export function readTemplate(name, lang) {
  return readText(path.join(templateDir(lang), name));
}

export function fillTemplate(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (all, k) => (k in vars ? String(vars[k]) : all));
}

export function mdEscape(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      // Mehrfach angegebene Flags (etwa --field) werden zu einer Liste.
      const set = (k, v) => { if (k in flags && k === 'field') flags[k] = [].concat(flags[k], v); else flags[k] = k === 'field' ? [v] : v; };
      if (eq !== -1) { set(a.slice(2, eq), a.slice(eq + 1)); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { set(key, next); i++; } else set(key, true);
    } else pos.push(a);
  }
  return { pos, flags };
}

export function listFlag(v) {
  if (v === undefined || v === true) return [];
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}
