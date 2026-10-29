// Gemeinsame Hilfsfunktionen für das works CLI. Keine externen Abhängigkeiten.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATE_DIR = path.join(SKILL_DIR, 'references', 'templates');

export const STATUSES = ['backlog', 'geplant', 'in-arbeit', 'review', 'erledigt', 'verworfen'];
export const OPEN_STATUSES = ['backlog', 'geplant', 'in-arbeit', 'review'];
export const CLOSED_STATUSES = ['erledigt', 'verworfen'];
export const STATUS_LABEL = {
  backlog: 'Backlog', geplant: 'Geplant', 'in-arbeit': 'In Arbeit',
  review: 'Review', erledigt: 'Erledigt', verworfen: 'Verworfen',
};
export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
export const PRIO_LABEL = { P1: 'Kritisch', P2: 'Hoch', P3: 'Mittel', P4: 'Niedrig' };
export const TYPES = ['feature', 'bug', 'refactor', 'spike', 'chore', 'design', 'debt'];
export const TYPE_LABEL = {
  feature: 'Feature', bug: 'Bug', refactor: 'Refactoring', spike: 'Spike',
  chore: 'Chore', design: 'Design', debt: 'Techn. Schuld',
};
export const EFFORTS = ['S', 'M', 'L', 'XL'];
export const RISKS = ['niedrig', 'mittel', 'hoch'];
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
  language: 'de',
  milestones: [],
  dod: {
    global: [
      'Build und Tests laufen ohne Fehler',
      'code-audit Skill wurde für die Änderungen ausgeführt',
      'Verlauf ist aktuell und Designentscheidungen sind dokumentiert',
    ],
    by_type: {
      bug: ['Regressionstest vorhanden oder Verzicht begründet'],
      refactor: ['Verhalten nach außen unverändert'],
      spike: ['Folgeaufgaben sind angelegt'],
      debt: ['Schuld ist vollständig getilgt oder die verbleibenden Folgekosten sind dokumentiert'],
    },
    by_tag: {
      ui: ['responsive-website-check wurde ausgeführt'],
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
};

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
  return s || 'aufgabe';
}

export function fail(msg, code = 1) {
  process.stderr.write(`Fehler: ${msg}\n`);
  process.exit(code);
}

export function warn(msg) {
  process.stderr.write(`Hinweis: ${msg}\n`);
}

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return { ok: r.status === 0, code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
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

export function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (exists(path.join(dir, '.works', 'config.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireRoot() {
  const root = findRoot();
  if (!root) fail('Kein .works Ordner gefunden. Zuerst `works init` im Projektwurzelverzeichnis ausführen.');
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

function sectionRegex(heading) {
  const h = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\n)## ${h}[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$)`);
}

export function getSection(body, heading) {
  const m = body.match(sectionRegex(heading));
  return m ? m[2] : null;
}

export function setSection(body, heading, content) {
  const re = sectionRegex(heading);
  const block = `## ${heading}\n${content.replace(/\s+$/, '')}\n`;
  if (re.test(body)) {
    return body.replace(re, (all, pre) => `${pre}${block}`);
  }
  // vor "Verlauf" einfügen, falls vorhanden, sonst anhängen
  const verlauf = body.match(/\n## Verlauf[ \t]*\n/);
  if (verlauf && heading !== 'Verlauf') {
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

export function loadTask(dir, archived = false) {
  const file = path.join(dir, 'task.md');
  const text = fs.readFileSync(file, 'utf8');
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
  if (!t) fail(`Aufgabe ${id} nicht gefunden.`);
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

export function addHistory(task, text) {
  task._body = appendToSection(task._body, 'Verlauf', `- ${today()}: ${text}`);
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

export function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8');
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
      if (eq !== -1) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; } else flags[key] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

export function listFlag(v) {
  if (v === undefined || v === true) return [];
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}
