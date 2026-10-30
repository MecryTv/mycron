// Lese- und Schreibschnittstelle für das Live-Board.
// Schreibaktionen laufen über das CLI, damit Prüfungen, Verlauf und Index identisch zum Terminal sind.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  loadTasks, loadConfig, worksDir, getSection, stripComments, imageLinks, checkboxes,
  isBlocked, openBlockers, openQuestions, relFromWorks, exists,
  STATUSES, OPEN_STATUSES, STATUS_LABEL, PRIORITIES, PRIO_LABEL, TYPES, TYPE_LABEL, EFFORTS, RISKS,
} from './lib.mjs';
import { dodCheck, nextCandidates, byIdMap } from './views.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'works.mjs');
const ID_RE = /^[A-Za-z]{1,8}-?\d{1,6}$/;
const IDEA_RE = /^I-\d{1,5}$/i;
const MS_RE = /^M\d{1,4}$/i;
const ASSET_KINDS = ['ist', 'vorher', 'nachher', 'referenz', 'mockup', 'skizze', 'fehler', 'diagramm'];
const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif' };
const CHECK_SECTIONS = ['Akzeptanzkriterien', 'Umsetzungsplan', 'Checkliste', 'Vorgehen'];
const GOAL_SECTION = {
  feature: 'Ziel', design: 'Ziel', refactor: 'Ziel', bug: 'Zusammenfassung',
  spike: 'Forschungsfrage', chore: 'Beschreibung', debt: 'Abkürzung',
};
// Abschnitte, die im Board als Text bearbeitet werden dürfen.
const EDITABLE_SECTIONS = [
  'Ziel', 'Kontext und Problem', 'Nutzerperspektive', 'Betroffene Dateien', 'Designentscheidungen',
  'Zusammenfassung', 'Reproduktion', 'Erwartetes Verhalten', 'Tatsächliches Verhalten', 'Umgebung',
  'Logs und Fehlermeldungen', 'Ursache', 'Lösung', 'Ist-Zustand', 'Zielarchitektur', 'Motivation',
  'Risiken', 'Rollback', 'Forschungsfrage', 'Zeitlimit', 'Hypothesen', 'Ergebnisse', 'Empfehlung',
  'Folgeaufgaben', 'Beschreibung', 'Zielgruppe und Kontext', 'Referenzen', 'Varianten', 'Gewählte Lösung',
  'Abkürzung', 'Grund', 'Folgekosten und Risiko', 'Auslöser', 'Rückzahlung', 'Übergabe', 'Herkunft',
];
const SKIP_IN_DETAIL = new Set(['Verlauf', 'Assets', 'Offene Fragen', ...CHECK_SECTIONS]);

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => { throw new ApiError(400, msg); };

function str(v, name, { max = 2000, required = false } = {}) {
  if (v === undefined || v === null || v === '') { if (required) bad(`${name} fehlt.`); return ''; }
  if (typeof v !== 'string') bad(`${name} muss Text sein.`);
  const s = v.trim();
  if (required && !s) bad(`${name} fehlt.`);
  if (s.length > max) bad(`${name} ist zu lang (höchstens ${max} Zeichen).`);
  return s;
}
function oneOf(v, name, allowed, { required = false } = {}) {
  if (v === undefined || v === null || v === '') { if (required) bad(`${name} fehlt.`); return ''; }
  if (!allowed.includes(v)) bad(`Ungültiger Wert für ${name}.`);
  return v;
}
function id(v) {
  if (typeof v !== 'string' || !ID_RE.test(v)) bad('Ungültige Aufgaben-ID.');
  return v.toUpperCase();
}
function date(v, name) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) bad(`${name} braucht das Format JJJJ-MM-TT.`);
  return v;
}
function list(v, name, re) {
  if (v === undefined || v === null || v === '') return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map((x) => String(x).trim()).filter(Boolean).map((x) => {
    if (x.length > 40 || (re && !re.test(x))) bad(`Ungültiger Eintrag in ${name}: ${x.slice(0, 40)}`);
    return x;
  });
}
const TAG_RE = /^[\p{L}\p{N}_.+-]+$/u;

// ---------- CLI-Aufrufe, nacheinander ausgeführt ----------

let queue = Promise.resolve();
function cli(root, args) {
  const job = queue.then(() => new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], {
      cwd: root, env: { ...process.env, WORKS_ACTOR: 'Board' }, timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  }));
  queue = job.catch(() => {});
  return job;
}

async function must(root, args) {
  const r = await cli(root, args);
  if (!r.ok) {
    // Fehler stehen auf stderr (erste Zeile zählt). Ohne stderr, etwa bei nicht erfüllter DoD, steht die Erklärung in der letzten Zeile von stdout.
    const errLines = r.stderr.split('\n').map((l) => l.replace(/^(Fehler|Hinweis):\s*/, '').trim()).filter(Boolean);
    const outLines = r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    const msg = errLines.find((l) => !/^at |node:/.test(l)) || outLines[outLines.length - 1] || 'Aktion fehlgeschlagen.';
    throw new ApiError(422, msg);
  }
  return r.stdout.trim();
}

function tmpFile(root, text) {
  const dir = path.join(worksDir(root), '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${crypto.randomBytes(8).toString('hex')}.txt`);
  fs.writeFileSync(file, text);
  return file;
}
function removeQuiet(file) { try { fs.unlinkSync(file); } catch { /* bereits weg */ } }

async function withTextFile(root, text, fn) {
  const file = tmpFile(root, text);
  try { return await fn(file); } finally { removeQuiet(file); }
}

// ---------- Lesen ----------

function findTaskSafe(root, taskId) {
  const t = loadTasks(root).find((x) => x.id === taskId);
  if (!t) throw new ApiError(404, `Aufgabe ${taskId} nicht gefunden.`);
  return t;
}

function sectionList(body) {
  const out = [];
  const re = /(?:^|\n)## ([^\n]+)\n([\s\S]*?)(?=\n## |$)/g;
  let m;
  while ((m = re.exec(body))) out.push({ name: m[1].trim(), content: stripComments(m[2]).trim() });
  return out;
}

function checklist(body, name) {
  const sec = getSection(body, name);
  if (sec === null) return null;
  return checkboxes(sec).items.map((it, i) => ({ n: i + 1, done: it.done, text: it.text }));
}

function assetsOf(t) {
  const sec = getSection(t._body, 'Assets') || '';
  const lines = stripComments(sec).split('\n');
  const out = [];
  lines.forEach((l, i) => {
    const img = l.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)\)/);
    const file = !img && l.match(/^\s*\[([^\]]*)\]\((assets\/[^)\s]+)\)/);
    const m = img || file;
    if (!m) return;
    const desc = (lines[i + 1] || '').match(/^Beschreibung:\s*(.*)$/i);
    const metaLine = desc ? lines[i + 2] || '' : lines[i + 1] || '';
    const kind = (metaLine.match(/Art:\s*([\wäöü-]+)/i) || [])[1] || '';
    const added = (metaLine.match(/Hinzugefügt:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
    const src = decodeURI(m[2]);
    out.push({
      alt: m[1], src: /^https?:/.test(src) ? src : relFromWorks(t._root, path.resolve(t._dir, src)),
      desc: desc ? desc[1] : '', kind, added, image: !!img,
    });
  });
  return out;
}

export function taskDetail(root, taskId) {
  const config = loadConfig(root);
  const all = loadTasks(root);
  const byId = byIdMap(all);
  const t = all.find((x) => x.id === taskId);
  if (!t) throw new ApiError(404, `Aufgabe ${taskId} nicht gefunden.`);
  t._root = root;
  const ref = (x) => { const o = byId.get(x); return { id: x, title: o ? o.title : 'unbekannt', status: o ? o.status : '' }; };
  const history = (getSection(t._body, 'Verlauf') || '').split('\n')
    .map((l) => l.match(/^- (\d{4}-\d{2}-\d{2}): (.*?)(?: \[([^\]]+)\])?$/)).filter(Boolean)
    .map((m) => ({ date: m[1], text: m[2], actor: m[3] || '' })).reverse();
  const questions = checkboxes(getSection(t._body, 'Offene Fragen') || '').items.map((q, i) => ({ n: i + 1, done: q.done, text: q.text }));
  const decFile = path.join(t._dir, 'decisions.md');
  const checklists = CHECK_SECTIONS.map((name) => ({ name, items: checklist(t._body, name) })).filter((c) => c.items !== null);
  const data = Object.fromEntries(Object.entries(t).filter(([k]) => !k.startsWith('_')));
  return {
    task: data,
    file: relFromWorks(root, t._file),
    archived: t._archived,
    goalSection: GOAL_SECTION[t.type] || 'Ziel',
    sections: sectionList(t._body).filter((s) => !SKIP_IN_DETAIL.has(s.name)),
    editable: EDITABLE_SECTIONS,
    checklists,
    questions,
    history,
    assets: assetsOf(t),
    decisions: exists(decFile) ? stripComments(fs.readFileSync(decFile, 'utf8')).replace(/\n{3,}/g, '\n\n').trim() : '',
    blockedBy: (t.blocked_by || []).map(ref),
    blocks: (t.blocks || []).map(ref),
    related: (t.related || []).map(ref),
    blocked: OPEN_STATUSES.includes(t.status) && isBlocked(t, byId),
    openBlockers: openBlockers(t, byId),
    openQuestions: openQuestions(t).length,
    dod: dodCheck(root, config, t),
  };
}

export function ideasList(root) {
  const file = path.join(worksDir(root), 'ideas.md');
  if (!exists(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => {
    const m = l.match(/^- (~~)?\[(I-\d+)\] (\d{4}-\d{2}-\d{2}): (.*?)(~~(.*))?$/);
    if (!m) return null;
    const raw = m[4];
    return {
      id: m[2], date: m[3], text: raw.replace(/#[\w-]+/g, '').trim(), tags: [...raw.matchAll(/#([\w-]+)/g)].map((x) => x[1]),
      closed: !!m[1], note: (m[6] || '').trim(),
    };
  }).filter(Boolean).reverse();
}

export function metaInfo(root) {
  const config = loadConfig(root);
  const all = loadTasks(root);
  const tags = [...new Set(all.flatMap((t) => t.tags || []))].sort();
  return {
    statuses: STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s] })),
    priorities: PRIORITIES.map((p) => ({ id: p, label: PRIO_LABEL[p] })),
    types: TYPES.map((t) => ({ id: t, label: TYPE_LABEL[t], goal: GOAL_SECTION[t] })),
    efforts: EFFORTS, risks: RISKS, assetKinds: ASSET_KINDS,
    milestones: config.milestones || [], tags,
    tasks: all.map((t) => ({ id: t.id, title: t.title, status: t.status })),
  };
}

export function nextList(root) {
  const { active, candidates } = nextCandidates(root, 5);
  return {
    active: active.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })),
    candidates: candidates.map((c) => ({ id: c.task.id, title: c.task.title, priority: c.task.priority, status: c.task.status, effort: c.task.effort || '', reasons: c.reasons })),
  };
}

export function dodOf(root, taskId) {
  const config = loadConfig(root);
  return dodCheck(root, config, findTaskSafe(root, taskId));
}

// ---------- Schreiben ----------

const SETTABLE = {
  title: (v) => str(v, 'Titel', { max: 160, required: true }),
  priority: (v) => oneOf(v, 'Priorität', PRIORITIES, { required: true }),
  type: (v) => oneOf(v, 'Typ', TYPES, { required: true }),
  effort: (v) => oneOf(v, 'Aufwand', EFFORTS),
  risk: (v) => oneOf(v, 'Risiko', RISKS),
  due: (v) => date(v, 'Fälligkeit'),
  milestone: (v) => { if (v && !MS_RE.test(v)) bad('Ungültiger Meilenstein.'); return v ? v.toUpperCase() : ''; },
  tags: (v) => list(v, 'Tags', TAG_RE).join(','),
  incomplete: (v) => (v ? 'true' : 'false'),
};

const actions = {
  async create(root, b) {
    const type = oneOf(b.type || 'feature', 'Typ', TYPES, { required: true });
    const args = ['new', `--type=${type}`, `--title=${str(b.title, 'Titel', { max: 160, required: true })}`];
    args.push(`--priority=${oneOf(b.priority || 'P3', 'Priorität', PRIORITIES)}`);
    const status = oneOf(b.status || 'backlog', 'Status', ['backlog', 'geplant']);
    args.push(`--status=${status}`);
    const effort = oneOf(b.effort, 'Aufwand', EFFORTS); if (effort) args.push(`--effort=${effort}`);
    const risk = oneOf(b.risk, 'Risiko', RISKS); if (risk) args.push(`--risk=${risk}`);
    const due = date(b.due, 'Fälligkeit'); if (due) args.push(`--due=${due}`);
    if (b.milestone) { if (!MS_RE.test(b.milestone)) bad('Ungültiger Meilenstein.'); args.push(`--milestone=${b.milestone.toUpperCase()}`); }
    const tags = list(b.tags, 'Tags', TAG_RE); if (tags.length) args.push(`--tags=${tags.join(',')}`);
    const blockedBy = list(b.blocked_by, 'Blockiert durch', ID_RE); if (blockedBy.length) args.push(`--blocked-by=${blockedBy.join(',')}`);
    args.push('--source=board');
    const goal = str(b.goal, 'Ziel', { max: 20000 });
    const criteria = (Array.isArray(b.criteria) ? b.criteria : []).map((c) => str(c, 'Kriterium', { max: 500 })).filter(Boolean).slice(0, 50);
    if (!goal || !criteria.length) args.push('--incomplete');
    const outText = await must(root, args);
    const newId = (outText.match(/Angelegt: (\S+)/) || [])[1];
    if (!newId) throw new ApiError(500, 'Neue Aufgaben-ID nicht erkannt.');
    if (goal) await withTextFile(root, goal, (f) => must(root, ['section', newId, GOAL_SECTION[type], `--file=${f}`]));
    for (const c of criteria) await must(root, ['item', newId, `--text=${c}`]);
    return { id: newId, message: `${newId} angelegt.` };
  },

  async set(root, b) {
    const tid = id(b.id);
    const fields = b.fields && typeof b.fields === 'object' ? b.fields : bad('Keine Felder angegeben.');
    const pairs = [];
    for (const [k, v] of Object.entries(fields)) {
      if (!SETTABLE[k]) bad(`Feld ${k} kann im Board nicht geändert werden.`);
      pairs.push(`${k}=${SETTABLE[k](v)}`);
    }
    if (!pairs.length) bad('Keine Felder angegeben.');
    const reason = str(b.reason, 'Begründung', { max: 300 });
    await must(root, ['set', tid, ...pairs, ...(reason ? [`--reason=${reason}`] : [])]);
    return { message: `${tid} gespeichert.` };
  },

  async move(root, b) {
    const tid = id(b.id);
    const to = oneOf(b.to, 'Status', STATUSES, { required: true });
    const t = findTaskSafe(root, tid);
    const from = t.status;
    if (from === to) return { message: 'Keine Änderung.' };
    const reason = str(b.reason, 'Begründung', { max: 300 });
    if (['erledigt', 'verworfen'].includes(from)) {
      if (!reason) bad('Zum Wiedereröffnen ist eine Begründung nötig.');
      if (to === 'verworfen' || to === 'erledigt') bad('Aufgabe zuerst wiedereröffnen.');
      await must(root, ['reopen', tid, `--reason=${reason}`, `--status=${to}`]);
      return { message: `${tid} wiedereröffnet.` };
    }
    if (to === 'in-arbeit') {
      await must(root, ['start', tid, ...(b.force ? ['--force'] : [])]);
      return { message: `${tid} gestartet.` };
    }
    if (to === 'erledigt') {
      const args = ['done', tid, '--confirm'];
      if (b.force) { if (!reason) bad('Zum Abschließen trotz offener Punkte ist eine Begründung nötig.'); args.push('--force', `--reason=${reason}`); }
      try { await must(root, args); } catch (e) {
        if (/Definition of Done/.test(e.message)) throw new ApiError(422, 'Die Definition of Done ist noch nicht erfüllt. Offene Punkte erledigen oder mit Begründung abschließen.');
        throw e;
      }
      return { message: `${tid} erledigt.` };
    }
    if (to === 'verworfen') {
      if (!reason) bad('Zum Verwerfen ist eine Begründung nötig.');
      await must(root, ['drop', tid, `--reason=${reason}`]);
      return { message: `${tid} verworfen.` };
    }
    await must(root, ['set', tid, `status=${to}`, ...(reason ? [`--reason=${reason}`] : [])]);
    return { message: `${tid} verschoben.` };
  },

  async log(root, b) {
    const tid = id(b.id);
    await must(root, ['log', tid, `--text=${str(b.text, 'Notiz', { max: 2000, required: true })}`]);
    return { message: 'Notiz gespeichert.' };
  },
  async question(root, b) {
    const tid = id(b.id);
    await must(root, ['question', tid, `--text=${str(b.text, 'Frage', { max: 500, required: true })}`]);
    return { message: 'Frage gespeichert.' };
  },
  async resolve(root, b) {
    const tid = id(b.id);
    const n = parseInt(b.n, 10); if (!(n > 0)) bad('Ungültige Frage.');
    const answer = str(b.answer, 'Antwort', { max: 1000 });
    await must(root, ['question', tid, `--resolve=${n}`, ...(answer ? [`--answer=${answer}`] : [])]);
    return { message: 'Frage geklärt.' };
  },
  async check(root, b) {
    const tid = id(b.id);
    const section = oneOf(b.section || 'Akzeptanzkriterien', 'Abschnitt', CHECK_SECTIONS);
    const n = parseInt(b.n, 10); if (!(n > 0)) bad('Ungültiger Punkt.');
    await must(root, ['check', tid, String(n), `--section=${section}`, ...(b.done ? [] : ['--undo'])]);
    return { message: 'Gespeichert.' };
  },
  async item(root, b) {
    const tid = id(b.id);
    const section = oneOf(b.section || 'Akzeptanzkriterien', 'Abschnitt', CHECK_SECTIONS);
    await must(root, ['item', tid, `--section=${section}`, `--text=${str(b.text, 'Punkt', { max: 500, required: true })}`]);
    return { message: 'Punkt ergänzt.' };
  },
  async itemRemove(root, b) {
    const tid = id(b.id);
    const section = oneOf(b.section || 'Akzeptanzkriterien', 'Abschnitt', CHECK_SECTIONS);
    const n = parseInt(b.n, 10); if (!(n > 0)) bad('Ungültiger Punkt.');
    await must(root, ['item', tid, `--section=${section}`, `--remove=${n}`]);
    return { message: 'Punkt entfernt.' };
  },
  async section(root, b) {
    const tid = id(b.id);
    const name = oneOf(b.name, 'Abschnitt', EDITABLE_SECTIONS, { required: true });
    const text = typeof b.text === 'string' ? b.text : bad('Text fehlt.');
    if (text.length > 50000) bad('Text ist zu lang.');
    if (name === 'Übergabe') {
      if (!text.trim()) bad('Übergabe ist leer.');
      await withTextFile(root, text, (f) => must(root, ['handoff', tid, `--file=${f}`]));
    } else {
      await withTextFile(root, text, (f) => must(root, ['section', tid, name, `--file=${f}`]));
    }
    return { message: `${name} gespeichert.` };
  },
  async link(root, b) {
    const a = id(b.id); const target = id(b.target);
    const rel = oneOf(b.rel, 'Beziehung', ['blocks', 'blocked-by', 'related'], { required: true });
    await must(root, [b.remove ? 'unlink' : 'link', a, rel, target]);
    return { message: b.remove ? 'Verknüpfung entfernt.' : 'Verknüpft.' };
  },
  async archive(root, b) {
    const tid = id(b.id);
    await must(root, ['archive', tid]);
    return { message: `${tid} archiviert.` };
  },
  async idea(root, b) {
    const text = str(b.text, 'Idee', { max: 500, required: true });
    const tags = list(b.tags, 'Tags', TAG_RE);
    await must(root, ['idea', `--text=${text}`, ...(tags.length ? [`--tags=${tags.join(',')}`] : [])]);
    return { message: 'Idee notiert.' };
  },
  async ideaPromote(root, b) {
    if (typeof b.iid !== 'string' || !IDEA_RE.test(b.iid)) bad('Ungültige Idee.');
    const args = ['promote', b.iid.toUpperCase()];
    args.push(`--type=${oneOf(b.type || 'feature', 'Typ', TYPES)}`);
    args.push(`--priority=${oneOf(b.priority || 'P3', 'Priorität', PRIORITIES)}`);
    const outText = await must(root, args);
    const newId = (outText.match(/als (\S+?):/) || [])[1] || '';
    return { id: newId, message: `Idee übernommen${newId ? ` als ${newId}` : ''}.` };
  },
  async ideaDrop(root, b) {
    if (typeof b.iid !== 'string' || !IDEA_RE.test(b.iid)) bad('Ungültige Idee.');
    const reason = str(b.reason, 'Begründung', { max: 300 });
    await must(root, ['idea-drop', b.iid.toUpperCase(), ...(reason ? [`--reason=${reason}`] : [])]);
    return { message: 'Idee verworfen.' };
  },
  async milestoneAdd(root, b) {
    const config = loadConfig(root);
    let mid = b.mid;
    if (!mid) {
      const max = Math.max(0, ...(config.milestones || []).map((m) => parseInt(String(m.id).slice(1), 10) || 0));
      mid = `M${max + 1}`;
    }
    if (!MS_RE.test(mid)) bad('Meilenstein-ID im Format M1, M2 angeben.');
    const args = ['milestone', 'add', mid.toUpperCase(), `--title=${str(b.title, 'Titel', { max: 120, required: true })}`];
    const due = date(b.due, 'Zieldatum'); if (due) args.push(`--due=${due}`);
    const desc = str(b.description, 'Beschreibung', { max: 500 }); if (desc) args.push(`--desc=${desc}`);
    await must(root, args);
    return { id: mid.toUpperCase(), message: `Meilenstein ${mid.toUpperCase()} angelegt.` };
  },
  async milestoneSet(root, b) {
    if (typeof b.mid !== 'string' || !MS_RE.test(b.mid)) bad('Ungültiger Meilenstein.');
    const f = b.fields || {};
    const pairs = [];
    if ('title' in f) pairs.push(`title=${str(f.title, 'Titel', { max: 120, required: true })}`);
    if ('due' in f) pairs.push(`due=${date(f.due, 'Zieldatum')}`);
    if ('status' in f) pairs.push(`status=${oneOf(f.status, 'Status', ['offen', 'erledigt'], { required: true })}`);
    if ('description' in f) pairs.push(`description=${str(f.description, 'Beschreibung', { max: 500 })}`);
    if (!pairs.length) bad('Keine Felder angegeben.');
    await must(root, ['milestone', 'set', b.mid.toUpperCase(), ...pairs]);
    return { message: 'Meilenstein gespeichert.' };
  },
};

export async function runAction(root, body) {
  if (!body || typeof body !== 'object') bad('Ungültige Anfrage.');
  const fn = actions[body.action];
  if (!fn) bad('Unbekannte Aktion.');
  return fn(root, body);
}

// Bild aus dem Board (Einfügen oder Ablegen) speichern und über das CLI der Aufgabe zuordnen.
export async function saveAsset(root, { taskId, contentType, data, desc, kind, name }) {
  const tid = id(taskId);
  findTaskSafe(root, tid);
  const ext = IMAGE_TYPES[(contentType || '').split(';')[0].trim().toLowerCase()];
  if (!ext) bad('Nur PNG, JPEG, GIF, WebP oder AVIF.');
  if (!data || !data.length) bad('Leere Datei.');
  const k = oneOf(kind, 'Art', ASSET_KINDS);
  const d = str(desc, 'Beschreibung', { max: 1000 });
  const n = str(name, 'Name', { max: 60 });
  const inbox = path.join(worksDir(root), 'inbox');
  fs.mkdirSync(inbox, { recursive: true });
  const file = path.join(inbox, `board-${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`);
  fs.writeFileSync(file, data);
  try {
    const args = ['asset', tid, file, '--origin=Board'];
    if (d) args.push(`--desc=${d}`);
    if (k) args.push(`--kind=${k}`);
    if (n) args.push(`--name=${n}`);
    await must(root, args);
  } finally {
    removeQuiet(file);
  }
  return { message: 'Bild gespeichert.' };
}

export { STATUS_LABEL };
