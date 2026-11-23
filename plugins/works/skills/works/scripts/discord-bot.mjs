// Bot-Prozess works (W-0036): einer je Rechner, für alle angemeldeten Projekte.
// Ereignisse entstehen aus dem Stand der Projekte (Aufgaben, Warteschlange, Live-Aktivität), damit Hooks
// nichts zusätzlich tun müssen; ship, CI-Wächter und Berichte legen Ereignisse in die outbox (discord.mjs).
// Nachrichten nach Entwurf F2: Felder, Erledigtes wird nachträglich bearbeitet, nur Erwähnungen klingeln,
// je Projekt ein angehefteter Statuspost, der gebündelt bearbeitet wird.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJson, loadTasks, loadConfig, loadState, OPEN_STATUSES, checkboxes, getSection, openQuestions, queueOf, today, rootIdOf, run, sortTasks } from './lib.mjs';
import { loadActivity } from './live.mjs';
import { loadLanes } from './parallel.mjs';
import { liveUsage, fmtCost } from './usage.mjs';
import { projectList } from './hub.mjs';
import { runningVersion, OWN_CLI, isAlive } from './server-control.mjs';
import { dfile, discordDir, loadDiscordConfig, normalizeConfig, credential, readOutbox } from './discord.mjs';
import { Rest, Gateway, hasWebSocket } from './discord-api.mjs';
import { tr, who, subOf, parseCid, cid, MODAL, modalFor, modalValues, helpMessage, ephemeral, notOwner, commands } from './discord-ui.mjs';

export { normalizeConfig };

const FAST = process.env.WORKS_DISCORD_FAST === '1';
const TICK = FAST ? 100 : 2000;
const STATUS_MIN = FAST ? 300 : 10000;
const RETRY = FAST ? 200 : 15000;
const SILENT = 4096;
const COLOR = { need: 0xe8a33d, done: 0x23a55a, red: 0xf23f43, run: 0x5865f2, gone: 0x80848e, status: 0x8e8cf7 };
const PALETTE = [0x8e8cf7, 0xe8a33d, 0x3aa7a3, 0xd16ba5, 0x5aa9e6, 0x9bc53d, 0xf08a4b];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Darstellung ----------

// Fremder Text (Titel, Fragen, Issue-Titel) darf keine klickbaren Links [Text](https://…) bilden: Klammern entschärfen.
const trimTo = (t, n) => (t.length > n ? `${t.slice(0, Math.max(0, n - 1))}…` : t);
const unlink = (s) => String(s ?? '').replace(/[[\]]/g, '\\$&');
const cut = (s, n) => trimTo(unlink(s).replace(/\s+/g, ' ').trim(), n);
const cutBlock = (s, n) => trimTo(unlink(s).trim(), n);

// Embed in die Gesamtgrenze von Discord (6000 Zeichen) bringen: erst die Beschreibung, dann die letzten Felder kürzen.
const LIMIT = 5800;
function fit(e) {
  const len = (s) => String(s || '').length;
  const total = () => len(e.title) + len(e.description) + len(e.footer && e.footer.text) + len(e.author && e.author.name) + (e.fields || []).reduce((s, f) => s + len(f.name) + len(f.value), 0);
  if (total() > LIMIT && e.description) e.description = trimTo(e.description, Math.max(200, e.description.length - (total() - LIMIT)));
  while (total() > LIMIT && e.fields && e.fields.length) {
    const f = e.fields[e.fields.length - 1];
    const keep = f.value.length - (total() - LIMIT);
    if (keep > 60) f.value = trimTo(f.value, keep); else e.fields.pop();
  }
  return e;
}
const rel = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? `<t:${Math.floor(Date.parse(iso) / 1000)}:R>` : '');
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const bar = (d, t, n = 10) => { if (!t) return ''; const f = Math.max(0, Math.min(n, Math.round((d / t) * n))); return '▰'.repeat(f) + '▱'.repeat(n - f); };
const sha7 = (s) => String(s || '').slice(0, 7);
const field = (name, value, inline = true) => ({ name: cut(name, 256) || '–', value: trimTo(String(value ?? '').trim(), 1024) || '–', inline });
const label = (cfg, id, title) => (cfg.privacy.titles && title ? `${id} ${title}` : String(id || ''));
const colorOf = (name) => PALETTE[parseInt(crypto.createHash('md5').update(String(name)).digest('hex').slice(0, 6), 16) % PALETTE.length];
const minutes = (from, to) => { const m = Math.max(0, Math.round((Date.parse(to || new Date().toISOString()) - Date.parse(from)) / 60000)); return Number.isNaN(m) ? '' : m < 1 ? 'unter 1 Minute' : m === 1 ? '1 Minute' : m < 60 ? `${m} Minuten` : `${Math.floor(m / 60)} h ${m % 60} min`; };
// Eine Zeile Knöpfe: erst die mit Aktion (W-0037), dann Links.
const row = (links, acts = []) => {
  const c = [...acts, ...links.map(([lbl, url]) => ({ type: 2, style: 5, label: cut(lbl, 80), url }))].slice(0, 5);
  return c.length ? [{ type: 1, components: c }] : [];
};
// Knopf mit Aktion; ohne gültige custom_id (etwa eine ungewöhnliche Aufgaben-ID) gibt es ihn nicht.
const act = (style, lbl, id) => (parseCid(id) ? [{ type: 2, style, label: cut(lbl, 80), custom_id: id }] : []);

export function isQuiet(cfg, now = new Date()) {
  if (!cfg.quiet || !cfg.quiet.on) return false;
  const min = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
  const f = min(cfg.quiet.from); const t = min(cfg.quiet.to); const m = now.getHours() * 60 + now.getMinutes();
  if (f === t || Number.isNaN(f) || Number.isNaN(t)) return false;
  return f < t ? m >= f && m < t : m >= f || m < t;
}

// Statuspost je Projekt. snap kommt aus snapshotOf, ergänzt um recent und ci.
export function renderStatus(s, cfg, now = new Date()) {
  const name = cut(s.name, 200);
  const a = s.active;
  const lines = [];
  const aLabel = a ? `**${a.id}**${cfg.privacy.titles && a.title ? ` ${cut(a.title, 120)}` : ''}` : '';
  if (s.perm) lines.push(`**Claude** wartet auf deine Freigabe${s.perm.tool ? ` (${cut(s.perm.tool, 40)})` : ''}, seit ${rel(s.perm.since)}`);
  else if (s.busy) lines.push(`**Claude** arbeitet${a ? ` an ${aLabel}` : ''}${s.since ? `, seit ${rel(s.since)}` : ''}`);
  else if (s.idleSince) lines.push(`**Claude** ist fertig und wartet auf dich, seit ${rel(s.idleSince)}`);
  if (a && (s.perm || !s.busy)) lines.push(`In Arbeit: ${aLabel}`);
  if (!a && !s.busy && !s.perm) lines.push('Keine Aufgabe in Arbeit');
  if (a && a.crit && a.crit[1]) lines.push(`${bar(a.crit[0], a.crit[1], 7)} ${a.crit[0]} von ${a.crit[1]} Kriterien`);
  const t = s.today || {};
  const fields = [
    field('Freigabe', s.perm ? `wartet seit ${rel(s.perm.since)}` : 'keine offen'),
    field('CI', s.ci ? `${s.ci.ok ? '✓ grün' : '✗ rot'}${s.ci.sha ? ` · ${sha7(s.ci.sha)}` : ''}` : 'noch kein Lauf'),
    field('Heute', `${t.done || 0} erledigt${cfg.privacy.costs && t.cost ? ` · ${t.cost}` : ''}`),
    field('Als Nächstes', (s.queue || []).slice(0, 2).map((q) => cut(label(cfg, q.id, q.title), 150)).join('\n') || 'nichts eingeplant', false),
  ];
  const recent = (s.recent || []).slice(0, 3);
  if (recent.length) fields.push(field('Zuletzt', recent.map((r) => `${hhmm(r.at)} ${cut(r.text, 150)}`).join('\n'), false));
  const p = s.progress;
  return {
    embeds: [fit({
      author: { name: `${name} · Stand` },
      color: colorOf(s.name),
      description: trimTo(lines.join('\n'), 4000),
      fields,
      footer: { text: p && p.total ? `${bar(p.done, p.total)} ${p.done} von ${p.total} erledigt` : 'works' },
      timestamp: now.toISOString(),
    })],
  };
}

const SHIP_STEP = {
  merge: () => 'in main gemergt',
  push: (x) => `gepusht${x.sha ? ` · ${sha7(x.sha)}` : ''}`,
  ci: (x) => (x.ok ? `CI grün${x.workflows ? `, ${x.workflows} Workflows` : ''}` : 'CI rot'),
  update: () => 'Plugin aktualisiert, Board neu gestartet',
};

// Nachricht zu einem Ereignis. state: open (neu), resolved (Freigabe oder Warten erledigt),
// accepted oder returned (Review). Erwähnung nur bei offenen Ereignissen mit @ und außerhalb der Ruhezeit.
// interactive: Knöpfe mit Aktion (W-0037) nur, wenn Klicks ankommen (Gateway oder gemeinsamer Bot); rid ist das Projekt.
export function renderEvent(ev, cfg, { owner = '', now = new Date(), rid = '', interactive = false } = {}) {
  const p = cut(ev.project || '', 100);
  const who = ev.id ? cut(label(cfg, ev.id, ev.title), 200) : '–';
  const open = !ev.state || ev.state === 'open';
  const acts = interactive && rid;
  let e = { color: COLOR.done };
  let text = '';
  let buttons = [];
  let actions = [];
  switch (ev.type) {
    case 'perm':
      if (!open) { e = { color: COLOR.gone, title: '✓ Freigabe beantwortet', description: `Hat ${minutes(ev.since, ev.until)} gewartet${ev.tool ? ` · ${cut(ev.tool, 60)}` : ''}` }; break; }
      text = `${p} wartet auf deine Freigabe (${cut(ev.tool || 'Werkzeug', 40)})`;
      e = { color: COLOR.need, title: 'Wartet auf deine Freigabe', fields: [field('Aufgabe', who), field('Werkzeug', cfg.privacy.commands && ev.what ? cut(`${ev.tool}: ${ev.what}`, 1000) : `${cut(ev.tool, 60) || '–'}${ev.what ? ', Befehl ausgeblendet' : ''}`), field('Wartet seit', rel(ev.since))], footer: { text: 'Freigeben in Claude Code · die Nachricht wird grau, sobald erledigt' } };
      break;
    case 'idle':
      if (!open) { e = { color: COLOR.gone, title: '↻ Weiter gearbeitet', description: `Nach ${minutes(ev.since, ev.until)}` }; break; }
      text = `${p}: Claude ist fertig und wartet auf dich`;
      e = { color: COLOR.need, title: 'Claude ist fertig und wartet auf dich', fields: [field('Aufgabe', who), field('Fertig seit', rel(ev.since))] };
      if (acts) actions = act(1, 'Anweisung an Claude', cid('ins', rid, ev.id));
      break;
    case 'question':
      text = `${p}: Frage zu ${ev.id}`;
      e = { color: COLOR.need, title: `Frage zu ${ev.id}`, description: cfg.privacy.titles ? cutBlock(ev.text, 1500) : 'Frage im Board ansehen' };
      break;
    case 'review':
      if (ev.state === 'accepted') { e = { color: COLOR.done, title: `✓ ${ev.id} angenommen`, description: `${cfg.privacy.titles && ev.title ? `${cut(ev.title, 200)} · ` : ''}${hhmm(ev.at || now.toISOString())}` }; break; }
      if (ev.state === 'returned') { e = { color: COLOR.gone, title: `↩ ${ev.id} zurückgegeben`, description: cfg.privacy.titles ? cut(ev.title, 200) : '' }; break; }
      e = { color: COLOR.done, title: `${ev.id} im Review`, fields: [...(cfg.privacy.titles && ev.title ? [field('Aufgabe', cut(ev.title, 200))] : []), field('Kriterien', ev.crit && ev.crit[1] ? `${ev.crit[0]} von ${ev.crit[1]}` : 'keine'), ...(cfg.privacy.costs && ev.cost ? [field('Kosten', ev.cost)] : [])], footer: { text: acts ? 'Abnehmen hier, im Board oder mit works done' : 'Abnehmen im Board oder mit works done' } };
      if (acts) actions = [...act(3, 'Annehmen', cid('acc', rid, ev.id)), ...act(2, 'Zurück an Claude', cid('ret', rid, ev.id))];
      break;
    case 'returned':
      e = { color: COLOR.need, title: `${ev.id} zurückgegeben`, description: cfg.privacy.titles ? cut(ev.title, 200) : '' };
      break;
    case 'done':
      e = { color: COLOR.done, title: `✓ ${ev.id} erledigt`, description: cfg.privacy.titles ? cut(ev.title, 200) : '' };
      break;
    case 'p1':
      e = { color: COLOR.red, title: `Neue P1: ${ev.id}`, description: cfg.privacy.titles ? cut(ev.title, 200) : '' };
      break;
    case 'queue_empty':
      e = { color: COLOR.run, title: 'Warteschlange leer', description: 'Claude hat alle eingereihten Aufgaben abgearbeitet.' };
      break;
    case 'ship': {
      const lines = (ev.steps || []).map((x) => `${x.ok === false ? '✗' : '✓'} ${(SHIP_STEP[x.step] || (() => x.step))(x)}`);
      if (ev.status === 'run') lines.push('◌ läuft …');
      if (ev.status === 'fail') lines.push(`✗ angehalten${ev.note ? `: ${cut(ev.note, 300)}` : ''}`);
      e = { color: ev.status === 'done' ? COLOR.done : ev.status === 'fail' ? COLOR.red : COLOR.run, title: ev.status === 'done' ? `${ev.id} ausgeliefert` : ev.status === 'fail' ? `${ev.id}: Auslieferung angehalten` : `${ev.id} wird ausgeliefert`, description: lines.join('\n') || '◌ beginnt …', footer: { text: `works ship${ev.ended ? ` · ${minutes(ev.started, ev.ended)}` : ''}` } };
      if (ev.commitUrl) buttons = [['Commit auf GitHub', ev.commitUrl]];
      break;
    }
    case 'ci_red':
    case 'ci_green':
      if (ev.type === 'ci_green') { e = { color: COLOR.done, title: `CI grün für ${sha7(ev.sha)}`, description: ev.workflows ? `${ev.workflows} Workflows grün` : 'Wieder grün' }; }
      else {
        e = { color: COLOR.red, title: `CI rot für ${sha7(ev.sha)}`, fields: [...(ev.total ? [field('Rot', `${ev.failed || '?'} von ${ev.total} Jobs`)] : []), ...(ev.job ? [field('Erster Fehler', cut(ev.job, 200))] : []), ...(ev.bug ? [field('Bug', `${cut(ev.bug, 40)} angelegt`)] : [])] };
        if (cfg.privacy.ci_error && ev.error) e.footer = { text: cut(ev.error, 300) };
        if (acts && ev.bug) actions = act(2, 'Bug ansehen', cid('bug', rid, ev.bug));
      }
      if (/^https:\/\//.test(ev.url || '')) buttons = [['Lauf auf GitHub', ev.url]];
      break;
    case 'report_week':
    case 'report_day':
    {
      // Listen wie im Wochenbericht: Aufgaben als {id, title} (Titel nur mit privacy.titles), sonst Text.
      const item = (x) => cut(typeof x === 'object' && x ? label(cfg, x.id, x.title) : (cfg.privacy.titles ? x : (String(x).match(/^[A-Z]+-\d+/) || [''])[0]), 120);
      const lists = Object.entries(ev.lists && typeof ev.lists === 'object' ? ev.lists : {}).slice(0, 3).filter(([, items]) => Array.isArray(items))
        .map(([n, items]) => field(`${n} (${items.length})`, items.map(item).filter(Boolean).map((x) => `• ${x}`).join('\n') || 'Keine.', false));
      e = { color: COLOR.status, title: cut(ev.title || 'Bericht', 256), description: cutBlock(ev.summary, 3000), fields: lists.length ? lists : ev.done !== undefined ? [field('Erledigt', String(ev.done))] : [] };
    }
      break;
    default:
      e = { color: COLOR.gone, title: cut(ev.type, 100) };
  }
  if (p) e.author = { name: p };
  if (e.fields && !e.fields.length) delete e.fields;
  if (e.description === '') delete e.description;
  const at = open && !!text && !!owner && !!(cfg.events[ev.type] && cfg.events[ev.type].at) && !isQuiet(cfg, now);
  return {
    content: at ? `<@${owner}> ${trimTo(text, 1800)}` : '',
    embeds: [fit(e)],
    components: row(buttons, actions),
    allowed_mentions: at ? { parse: [], users: [owner] } : { parse: [] },
    flags: at ? 0 : SILENT,
  };
}

const RECENT = {
  perm: () => 'Freigabe angefragt', idle: () => 'Claude fertig', question: (e) => `Frage zu ${e.id}`, review: (e) => `${e.id} im Review`,
  returned: (e) => `${e.id} zurückgegeben`, done: (e) => `${e.id} erledigt`, p1: (e) => `Neue P1 ${e.id}`, queue_empty: () => 'Warteschlange leer',
  ci_red: (e) => `CI rot ${sha7(e.sha)}`, ci_green: (e) => `CI grün ${sha7(e.sha)}`, report_week: (e) => cut(e.title, 80), report_day: (e) => cut(e.title, 80),
};

// ---------- Stand eines Projekts ----------

// Branch aus .git/HEAD, auch in Worktrees mit .git-Datei. Ein Wechsel ändert .works, ohne dass etwas passiert ist.
const gitDirs = new Map();
function headOf(root) {
  let dir = gitDirs.get(root);
  if (dir === undefined) {
    dir = '';
    for (let d = path.resolve(root); ; d = path.dirname(d)) {
      const g = path.join(d, '.git');
      if (fs.existsSync(g)) {
        try {
          if (fs.statSync(g).isDirectory()) dir = g;
          else { const m = fs.readFileSync(g, 'utf8').match(/gitdir:\s*(.+)/); if (m) dir = path.resolve(d, m[1].trim()); }
        } catch { /* nicht lesbar */ }
        break;
      }
      if (path.dirname(d) === d) break;
    }
    gitDirs.set(root, dir);
  }
  if (!dir) return '';
  try { return fs.readFileSync(path.join(dir, 'HEAD'), 'utf8').trim().replace(/^ref: refs\/heads\//, ''); } catch { return ''; }
}

const stamp = (f) => { try { const s = fs.statSync(f); return `${s.size}:${s.mtimeMs}`; } catch { return '-'; } };
const worksStamp = (root, names) => names.map((n) => stamp(path.join(root, '.works', n))).join('|');

// Teurer Teil: alle task.md lesen. Nur neu, wenn sich Aufgaben, Einstellungen, aktive Aufgabe oder Branch geändert
// haben, sonst höchstens jede Minute (Häkchen per Editor ändern WORKS.md nicht).
function tasksPart(root) {
  const config = loadConfig(root);
  const all = loadTasks(root);
  const live = all.filter((t) => !t._archived);
  const byId = new Map(live.map((t) => [t.id, t]));
  const crit = (t) => { const c = checkboxes(getSection(t._body, 'Akzeptanzkriterien') || ''); return [c.done, c.total]; };
  const tasks = {};
  for (const t of live) {
    const q = openQuestions(t);
    tasks[t.id] = { id: t.id, title: t.title, status: t.status, priority: t.priority, q: q.length, lastQ: q.length ? q[q.length - 1].text : '', source: t.source || '', crit: crit(t) };
  }
  const st = loadState(root);
  let active = st.active && byId.get(st.active);
  if (!active || active.status !== 'in-arbeit') active = live.find((t) => t.status === 'in-arbeit');
  const queueIds = queueOf(config).filter((id) => byId.has(id) && OPEN_STATUSES.includes(byId.get(id).status));
  // Als Nächstes: Warteschlange ohne das, was schon läuft; sonst die wichtigsten offenen Aufgaben.
  const waiting = (t) => ['backlog', 'geplant'].includes(t.status);
  const queued = queueIds.map((id) => byId.get(id)).filter(waiting);
  const nextList = queued.length ? queued : sortTasks(live.filter(waiting));
  const counted = all.filter((t) => t.status !== 'verworfen');
  const day = today();
  return {
    config,
    snap: {
      name: path.basename(root),
      tasks,
      active: active ? { id: active.id, title: active.title, crit: crit(active) } : null,
      queueIds,
      queue: nextList.slice(0, 2).map((t) => ({ id: t.id, title: t.title })),
      progress: { done: counted.filter((t) => t.status === 'erledigt').length, total: counted.length },
    },
    doneToday: all.filter((t) => t.completed === day).length,
  };
}

export function snapshotOf(root, cache = null) {
  const branch = headOf(root);
  const key = `${worksStamp(root, ['WORKS.md', 'config.json', 'state.json'])}|${branch}|${today()}`;
  let part = cache && cache.key === key && Date.now() - cache.at < 60000 ? cache.part : null;
  if (!part) { part = tasksPart(root); if (cache) Object.assign(cache, { key, part, at: Date.now() }); }
  const act = loadActivity(root);
  const cur = act && act.current;
  // Freigaben der Hauptsitzung und paralleler Bahnen (activity.lanes), je eine eigene Stelle.
  const perms = [];
  if (act && act.busy && cur && cur.perm) perms.push({ slot: 'main', since: cur.permSince || cur.at, tool: cur.tool || '', what: cur.what || '', task: cur.task || '' });
  // Nur Bahnen, die es noch gibt: Ein beendeter Worktree lässt seinen letzten Eintrag in activity.json stehen.
  const lanes = new Set(loadLanes(root).map((l) => l.task));
  for (const [task, e] of Object.entries((act && act.lanes) || {})) if (e && e.perm && lanes.has(task)) perms.push({ slot: `bahn-${task}`, since: e.permSince || e.at, tool: e.tool || '', what: e.what || '', task });
  const usage = liveUsage(root, part.config);
  return {
    ...part.snap,
    branch,
    busy: !!(act && act.busy),
    since: (act && act.since) || '',
    idleSince: (act && !act.busy && act.idleSince) || '',
    perm: perms[0] || null,
    perms,
    today: { done: part.doneToday, cost: usage.today.cost > 0 ? fmtCost(usage.today.cost, usage.currency) : '' },
    costs: Object.fromEntries(Object.entries(usage.byTask).filter(([, v]) => v.cost > 0).map(([k, v]) => [k, fmtCost(v.cost, usage.currency)])),
  };
}

function commitUrl(root, sha) {
  if (!root || !sha) return '';
  const r = run('git', ['-C', root, 'remote', 'get-url', 'origin']);
  const m = r.ok && r.stdout.trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}/commit/${sha}` : '';
}

// ---------- Bot ----------

const emptyState = () => ({ projects: {}, msgs: {}, queue: [], open: {}, ships: {}, ci: {}, frozen: {}, sent: {} });
const DAY = 86400000;

export class Bot {
  // shared: gemeinsamer Bot über den Dienst. interactive: Klicks und Befehle kommen an (Gateway oder Dienst).
  constructor({ rest, log, shared = false, interactive = false }) {
    this.rest = rest; this.log = log; this.shared = shared; this.interactive = interactive;
    this.commandsFor = '';
    const s = readJson(dfile('state.json'), null);
    this.state = { ...emptyState(), ...(s || {}) };
    this.timers = new Map();
    this.fingers = new Map();
    this.snapAt = new Map();
    this.caches = new Map();
    this.snapJson = new Map();
    this.forceStatus = new Set(Object.keys(this.state.projects));
    this.retryAt = 0;
    this.dirty = false;
    this.restored = false;
    this.warned = new Set();
  }

  channelFor(rid, cfg) { return (cfg.projects[rid] && cfg.projects[rid].channel_id) || cfg.channel_id; }
  enrolled(rid, cfg) { const p = cfg.projects[rid]; return p && p.enabled !== undefined ? !!p.enabled : cfg.auto_enroll !== false; }
  project(rid) { return this.state.projects[rid] || (this.state.projects[rid] = { name: '', root: '', snap: null, status: null, recent: [] }); }

  addRecent(rid, text) {
    if (!rid || !text) return;
    const pr = this.project(rid);
    pr.recent = [{ at: new Date().toISOString(), text }, ...(pr.recent || [])].slice(0, 5);
    this.dirty = true;
  }

  // Schon gemeldet? Merkt sich Meldungen einen Tag lang, damit ein Merge oder ein Hin und Her zwischen Branches
  // dieselbe P1, Erledigung oder Frage nicht noch einmal meldet.
  once(rid, sig) {
    const m = this.state.sent[rid] || (this.state.sent[rid] = {});
    if (m[sig] && Date.now() - m[sig] < DAY) return false;
    m[sig] = Date.now();
    this.dirty = true;
    return true;
  }

  // Nachricht anlegen oder bearbeiten. Eine spätere Fassung derselben Nachricht ersetzt eine noch wartende.
  upsert(key, ev, rid, cfg) {
    this.state.queue = this.state.queue.filter((q) => q.key !== key);
    this.state.queue.push({ key, ev, rid, channel_id: this.channelFor(rid, cfg) });
    this.dirty = true;
  }

  event(rid, type, data, cfg, key = `${type}:${rid}:${data.id || ''}:${Date.now()}:${crypto.randomBytes(2).toString('hex')}`) {
    const ev = { type, project: (this.state.projects[rid] && this.state.projects[rid].name) || data.project || '', ...data, state: 'open', at: new Date().toISOString() };
    if (RECENT[type]) this.addRecent(rid, RECENT[type](ev));
    if (!cfg.events[type] || !cfg.events[type].on) return null;
    this.upsert(key, ev, rid, cfg);
    return { key, ev };
  }

  shipping(rid, id) {
    const now = Date.now();
    return Object.entries(this.state.ships).some(([k, s]) => k.startsWith(`ship:${rid}:${id}:`) && (s.status === 'run' || now - Date.parse(s.ended || 0) < 10 * 60000));
  }

  // name: Dateiname aus der outbox. Er macht den Schlüssel eindeutig, damit ein zweites Lesen derselben Datei
  // (etwa nach einem Speicherfehler) dieselbe Nachricht bearbeitet statt eine neue zu schicken.
  fromOutbox(o, cfg, name = '') {
    const d = o.data || {};
    const rid = o.rootId || '';
    if (rid && !this.enrolled(rid, cfg)) { this.log(`${o.project || rid}: Hinweise aus, Ereignis ${o.type} verworfen`); return; }
    if (rid && o.project) { const pr = this.project(rid); if (!pr.name) pr.name = o.project; if (!pr.root) pr.root = o.root; }
    if (o.type === 'ship') {
      const key = `ship:${rid}:${d.id}:${d.run || 'x'}`;
      const s = this.state.ships[key] || { type: 'ship', project: o.project, id: d.id, steps: [], status: 'run', started: o.at };
      // Während ship wechselt der Branch und .works mehrfach: Stand einfrieren, am Ende mit dem Stand davor vergleichen.
      if (d.step === 'start' && rid && !this.state.frozen[rid]) this.state.frozen[rid] = { at: o.at, snap: this.project(rid).snap };
      if (['merge', 'push', 'ci', 'update'].includes(d.step)) {
        s.steps = s.steps.filter((x) => x.step !== d.step).concat({ step: d.step, ok: d.ok !== false, sha: d.sha || '', workflows: d.workflows || 0 });
        if (d.step === 'push' && d.sha) s.commitUrl = commitUrl(o.root, d.sha);
        if (d.step === 'ci') { const push = s.steps.find((x) => x.step === 'push'); this.state.ci[rid] = { ok: d.ok !== false, sha: (push && push.sha) || d.sha || '', at: o.at }; }
      }
      if (d.step === 'done' || d.step === 'fail') {
        s.status = d.step; s.ended = o.at;
        if (d.step === 'fail') s.note = d.note || '';
        this.addRecent(rid, `${d.id} ${d.step === 'done' ? 'ausgeliefert' : 'angehalten'}`);
      }
      // Auftauen, sobald die Git-Schritte vorbei sind (nach dem Push), nicht erst nach dem Warten auf die CI.
      // Ohne Remote kommt kein Push, dann beim Ende oder Abbruch.
      if (['push', 'done', 'fail'].includes(d.step)) {
        const fz = this.state.frozen[rid];
        if (fz) { if (fz.snap) this.project(rid).thaw = fz.snap; delete this.state.frozen[rid]; this.fingers.delete(rid); }
      }
      this.state.ships[key] = s;
      if (cfg.events.shipped.on) this.upsert(key, s, rid, cfg);
      this.dirty = true;
      return;
    }
    const key = (type) => `${type}:${rid}:${name || `${Date.now()}`}`;
    if (o.type === 'ci') {
      const before = this.state.ci[rid];
      this.state.ci[rid] = { ok: !!d.ok, sha: d.sha || '', at: o.at };
      this.dirty = true;
      if (d.ok && !(before && !before.ok)) { this.addRecent(rid, `CI grün ${sha7(d.sha)}`); return; }
      const type = d.ok ? 'ci_green' : 'ci_red';
      this.event(rid, type, { ...d, project: o.project }, cfg, key(type));
      return;
    }
    if (o.type === 'report') { const type = d.kind === 'tag' ? 'report_day' : 'report_week'; this.event(rid, type, { ...d, project: o.project }, cfg, key(type)); return; }
    this.log(`Unbekanntes Ereignis ${o.type} verworfen`);
  }

  schedule(slot, key, rid, type, data, due) { this.timers.set(slot, { key, rid, type, data, due }); }

  // Noch gültig? Freigabe: dieselbe Anfrage an derselben Stelle wartet noch. Warten: Claude ist nicht wieder losgelaufen.
  stillTrue(type, data, snap) {
    if (!snap) return false;
    if (type === 'perm') return (snap.perms || (snap.perm ? [{ slot: 'main', ...snap.perm }] : [])).some((p) => p.slot === (data.slot || 'main') && p.since === data.since);
    if (type === 'idle') return !snap.busy && snap.idleSince === data.since;
    return false;
  }

  permData(p, snap) { const t = snap.tasks[p.task]; return { id: p.task, title: t ? t.title : '', tool: p.tool, what: p.what, since: p.since, slot: p.slot }; }

  // Aufgaben: Review, angenommen, zurückgegeben, erledigt, Frage, P1, Warteschlange.
  diffTasks(rid, prev, next, cfg) {
    for (const t of Object.values(next.tasks)) {
      const o = prev.tasks[t.id];
      const base = { id: t.id, title: t.title };
      if (!o) {
        if (t.priority === 'P1' && t.source !== 'board' && OPEN_STATUSES.includes(t.status) && this.once(rid, `p1:${t.id}`)) this.event(rid, 'p1', base, cfg);
        // Neu und schon im Review (works new --status review, oder angelegt und gesetzt zwischen zwei Blicken des Bots).
        // Erledigte oder Fragen neuer Aufgaben nicht melden: Ein Import brächte sonst Dutzende Nachrichten.
        if (t.status === 'review' && this.once(rid, `review:${t.id}`)) {
          const r = this.event(rid, 'review', { ...base, crit: t.crit, cost: next.costs[t.id] || '' }, cfg);
          if (r) this.state.open[`review:${rid}:${t.id}`] = { ...r, rid };
        }
        continue;
      }
      if (o.status !== 'review' && t.status === 'review') {
        if (this.once(rid, `review:${t.id}`)) {
          const r = this.event(rid, 'review', { ...base, crit: t.crit, cost: next.costs[t.id] || '' }, cfg);
          if (r) this.state.open[`review:${rid}:${t.id}`] = { ...r, rid };
        }
      } else if (o.status === 'review' && t.status !== 'review') {
        const slot = `review:${rid}:${t.id}`;
        const op = this.state.open[slot];
        const accepted = t.status === 'erledigt';
        if (op) { this.upsert(op.key, { ...op.ev, state: accepted ? 'accepted' : 'returned', at: new Date().toISOString() }, rid, cfg); delete this.state.open[slot]; }
        delete (this.state.sent[rid] || {})[`review:${t.id}`];
        if (accepted) { this.once(rid, `done:${t.id}`); this.addRecent(rid, `${t.id} angenommen`); }
        else if (OPEN_STATUSES.includes(t.status)) this.event(rid, 'returned', base, cfg);
      } else if (o.status !== 'erledigt' && t.status === 'erledigt' && !this.shipping(rid, t.id) && this.once(rid, `done:${t.id}`)) this.event(rid, 'done', base, cfg);
      if (t.q > o.q && this.once(rid, `question:${t.id}:${String(t.lastQ).slice(0, 80)}`)) this.event(rid, 'question', { ...base, text: t.lastQ }, cfg);
      if (o.priority !== 'P1' && t.priority === 'P1' && OPEN_STATUSES.includes(t.status) && this.once(rid, `p1:${t.id}`)) this.event(rid, 'p1', base, cfg);
    }
    if (prev.queueIds.length && !next.queueIds.length) this.event(rid, 'queue_empty', {}, cfg);
  }

  // Live: neue Freigaben und Claude fertig, jeweils mit Verzögerung.
  diffLive(rid, prev, next, cfg) {
    const before = new Map((prev.perms || (prev.perm ? [{ slot: 'main', ...prev.perm }] : [])).map((p) => [p.slot, p.since]));
    for (const p of next.perms || []) {
      if (before.get(p.slot) === p.since) continue;
      this.schedule(`perm:${rid}:${p.slot}`, `perm:${rid}:${p.slot}:${p.since}`, rid, 'perm', this.permData(p, next), Date.now() + cfg.delays.perm * 1000);
    }
    if (!next.busy && next.idleSince && (prev.busy || prev.idleSince !== next.idleSince)) {
      const act = next.active ? { id: next.active.id, title: next.active.title } : {};
      this.schedule(`idle:${rid}`, `idle:${rid}:${next.idleSince}`, rid, 'idle', { ...act, since: next.idleSince }, Date.now() + cfg.delays.idle * 1000);
    }
  }

  // Nach einem Neustart: Freigaben und Warten, deren Hinweis noch aussteht, wieder einplanen. Nur frische, damit
  // ein Neustart am nächsten Morgen nicht für den Abend davor klingelt.
  restoreTimers(cfg) {
    this.restored = true;
    const fresh = (since, delay) => Date.now() - Date.parse(since) < (delay + 600) * 1000;
    for (const [rid, pr] of Object.entries(this.state.projects)) {
      const s = pr.snap;
      if (!s) continue;
      for (const p of s.perms || []) {
        const slot = `perm:${rid}:${p.slot}`;
        if (!this.state.open[slot] && !this.timers.has(slot) && fresh(p.since, cfg.delays.perm)) this.schedule(slot, `${slot}:${p.since}`, rid, 'perm', this.permData(p, s), Date.parse(p.since) + cfg.delays.perm * 1000);
      }
      const slot = `idle:${rid}`;
      if (!s.busy && s.idleSince && !this.state.open[slot] && !this.timers.has(slot) && fresh(s.idleSince, cfg.delays.idle)) {
        const act = s.active ? { id: s.active.id, title: s.active.title } : {};
        this.schedule(slot, `${slot}:${s.idleSince}`, rid, 'idle', { ...act, since: s.idleSince }, Date.parse(s.idleSince) + cfg.delays.idle * 1000);
      }
    }
  }

  // Freigabe und Warten, die sich erledigt haben: Timer verwerfen, gesendete Nachricht grau bearbeiten.
  resolve(rid, snap, cfg) {
    for (const [slot, tm] of this.timers) if (tm.rid === rid && !this.stillTrue(tm.type, tm.data, snap)) this.timers.delete(slot);
    for (const [slot, op] of Object.entries(this.state.open)) {
      if (op.rid !== rid || !['perm', 'idle'].includes(op.ev.type) || this.stillTrue(op.ev.type, op.ev, snap)) continue;
      this.upsert(op.key, { ...op.ev, state: 'resolved', until: new Date().toISOString() }, rid, cfg);
      delete this.state.open[slot];
      this.dirty = true;
    }
  }

  fireTimers(cfg) {
    const now = Date.now();
    for (const [slot, tm] of this.timers) {
      if (tm.due > now) continue;
      this.timers.delete(slot);
      const snap = this.state.projects[tm.rid] && this.state.projects[tm.rid].snap;
      if (!this.stillTrue(tm.type, tm.data, snap)) continue;
      const r = this.event(tm.rid, tm.type, tm.data, cfg, tm.key);
      if (r) this.state.open[slot] = { ...r, rid: tm.rid };
    }
  }

  scanProject(root, rid, cfg) {
    const pr = this.project(rid);
    const fp = `${worksStamp(root, ['WORKS.md', 'activity.json', 'config.json', 'state.json', 'time.jsonl'])}|${headOf(root)}`;
    if (!pr.thaw && this.fingers.get(rid) === fp && Date.now() - (this.snapAt.get(rid) || 0) < 60000) return;
    const cache = this.caches.get(rid) || {};
    this.caches.set(rid, cache);
    let next;
    try { next = snapshotOf(root, cache); } catch (e) { this.log(`${path.basename(root)}: Stand nicht lesbar (${e.message})`); return; }
    this.fingers.set(rid, fp);
    this.snapAt.set(rid, Date.now());
    const json = JSON.stringify(next);
    if (this.snapJson.get(rid) === json && !pr.thaw) return;
    this.snapJson.set(rid, json);
    const prev = pr.snap;
    if (pr.name !== next.name || pr.root !== root) { pr.name = next.name; pr.root = root; }
    const frozen = this.state.frozen[rid];
    // Die Git-Schritte von ship dauern Minuten, nicht länger: Hängt ein Lauf (hart abgebrochen), nach 10 Minuten auftauen.
    if (frozen && Date.now() - Date.parse(frozen.at) > 10 * 60000) { delete this.state.frozen[rid]; this.log(`${next.name}: ship ohne Push oder Ende, Einfrieren aufgehoben`); }
    if (prev && prev.tasks) {
      if (pr.thaw) { this.diffTasks(rid, pr.thaw, next, cfg); delete pr.thaw; }
      else if (this.state.frozen[rid]) { /* ship läuft: Aufgaben erst am Ende vergleichen */ }
      else if ((prev.branch || '') !== (next.branch || '')) this.log(`${next.name}: Branch ${prev.branch || '?'} → ${next.branch || '?'}, Stand ohne Vergleich übernommen`);
      else this.diffTasks(rid, prev, next, cfg);
      this.diffLive(rid, prev, next, cfg);
    }
    pr.snap = next;
    this.resolve(rid, next, cfg);
    this.dirty = true;
  }

  async flush(cfg) {
    while (this.state.queue.length && Date.now() >= this.retryAt) {
      const op = this.state.queue[0];
      const known = this.state.msgs[op.key];
      try {
        const body = renderEvent(op.ev, cfg, { owner: cfg.owner_id, rid: op.rid, interactive: this.interactive });
        if (known) await this.rest.patch(`/channels/${known.channel_id}/messages/${known.message_id}`, { content: body.content, embeds: body.embeds, components: body.components, allowed_mentions: body.allowed_mentions });
        else {
          const ch = op.channel_id || this.channelFor(op.rid, cfg);
          const m = await this.rest.post(`/channels/${ch}/messages`, body);
          this.state.msgs[op.key] = { channel_id: ch, message_id: m.id, at: new Date().toISOString() };
        }
      } catch (e) {
        if (e.retry) { this.retryAt = Date.now() + RETRY; this.log(e.message); return; }
        if (e.status === 401 || e.status === 410) throw e;
        this.log(`Nachricht verworfen: ${e.message}`);
      }
      // Genau diese Fassung entfernen: Befehle und Knöpfe (W-0037) laufen nebenher und können währenddessen eine
      // neuere Fassung derselben Nachricht einreihen; die bleibt stehen und wird als Bearbeitung geschickt.
      const at = this.state.queue.indexOf(op);
      if (at >= 0) this.state.queue.splice(at, 1);
      // Nach jeder Nachricht speichern: Ein harter Stopp kann sie sonst nach dem Neustart noch einmal schicken.
      this.save();
    }
  }

  async statusposts(cfg) {
    for (const [rid, pr] of Object.entries(this.state.projects)) {
      if (Date.now() < this.retryAt) return;
      if (!pr.snap || !pr.root || !this.enrolled(rid, cfg)) continue;
      const body = renderStatus({ ...pr.snap, recent: pr.recent, ci: this.state.ci[rid] || null }, cfg);
      const hash = crypto.createHash('sha1').update(JSON.stringify({ ...body.embeds[0], timestamp: 0 })).digest('hex');
      const ch = this.channelFor(rid, cfg);
      const s = pr.status || {};
      if (s.hash === hash && s.channel_id === ch && !this.forceStatus.has(rid)) continue;
      if (Date.now() - (s.at || 0) < STATUS_MIN) continue;
      try {
        let ok = false;
        // 404 gelöscht, 403 nicht mehr bearbeitbar (anderer Bot nach Tokenwechsel, kein Zugriff): neu anlegen.
        if (s.message_id && s.channel_id === ch) {
          try { await this.rest.patch(`/channels/${ch}/messages/${s.message_id}`, { embeds: body.embeds }); ok = true; } catch (e) { if (e.status !== 404 && e.status !== 403) throw e; }
        }
        if (!ok) {
          const m = await this.rest.post(`/channels/${ch}/messages`, { ...body, flags: SILENT, allowed_mentions: { parse: [] } });
          s.message_id = m.id; s.channel_id = ch;
          try { await this.rest.put(`/channels/${ch}/messages/pins/${m.id}`); } catch (e) {
            if (e.retry) throw e;
            if (!this.warned.has(`pin:${ch}`)) { this.warned.add(`pin:${ch}`); this.log(`Anheften in Kanal ${ch} nicht möglich (${e.message}). Fehlt das Recht „Nachrichten anheften“?`); }
          }
        }
        pr.status = { ...s, hash, at: Date.now() };
        this.forceStatus.delete(rid);
        this.dirty = true;
      } catch (e) {
        if (e.retry) { this.retryAt = Date.now() + RETRY; this.log(e.message); return; }
        if (e.status === 401 || e.status === 410) throw e;
        pr.status = { ...s, at: Date.now() };
        if (!this.warned.has(`st:${rid}`)) { this.warned.add(`st:${rid}`); this.log(`Statuspost ${pr.name}: ${e.message}`); }
      }
    }
  }

  prune() {
    const now = Date.now();
    for (const [k, v] of Object.entries(this.state.msgs)) if (Date.parse(v.at) < now - 7 * DAY && !Object.values(this.state.open).some((o) => o.key === k)) delete this.state.msgs[k];
    for (const [k, v] of Object.entries(this.state.ships)) if (Date.parse(v.ended || v.started) < now - DAY) delete this.state.ships[k];
    for (const m of Object.values(this.state.sent)) for (const [k, t] of Object.entries(m)) if (now - t > DAY) delete m[k];
  }

  async tick() {
    const cfg = loadDiscordConfig();
    if (!this.shared && this.interactive) await this.registerCommands(cfg);
    const done = [];
    // Ereignisse älter als zwei Tage (Bot lange aus) wären nur noch Lärm: verwerfen.
    for (const { file, ev } of readOutbox()) {
      if (Date.now() - Date.parse(ev.at) > 2 * DAY) this.log(`Altes Ereignis ${ev.type} vom ${ev.at} verworfen`);
      else { try { this.fromOutbox(ev, cfg, path.basename(file, '.json')); } catch (e) { this.log(`outbox: ${e.message}`); } }
      done.push(file);
    }
    if (done.length) this.dirty = true;
    for (const p of projectList()) {
      const rid = rootIdOf(p.path);
      if (this.enrolled(rid, cfg)) this.scanProject(p.path, rid, cfg);
    }
    if (!this.restored) this.restoreTimers(cfg);
    this.fireTimers(cfg);
    if (this.dirty) this.save();
    for (const f of done) { try { fs.unlinkSync(f); } catch { /* schon weg */ } }
    await this.flush(cfg);
    await this.statusposts(cfg);
    if (this.dirty) { this.prune(); this.save(); }
  }

  // ---------- Befehle und Knöpfe (W-0037) ----------

  // Eigener Bot: /works für den Server des Kanals registrieren (Server-Befehle sind sofort da). Wieder bei einem
  // anderen Server; nach einem Fehler frühestens in zehn Minuten erneut.
  async registerCommands(cfg) {
    const key = `${cfg.app_id}:${cfg.guild_id}`;
    if (!cfg.app_id || !cfg.guild_id || this.commandsFor === key || Date.now() < (this.commandsRetry || 0)) return;
    try {
      await this.rest.put(`/applications/${cfg.app_id}/guilds/${cfg.guild_id}/commands`, commands());
      this.commandsFor = key;
      this.log(`Befehle /works für ${cfg.guild_name || cfg.guild_id} registriert`);
    } catch (e) {
      if (e.status === 401) throw e;
      this.commandsRetry = Date.now() + (FAST ? 1000 : 600000);
      this.log(`Befehle /works nicht registriert (${e.message}). Fehlt beim Einladen „applications.commands“? Neu einladen mit dem Link aus works discord.`);
    }
  }

  // Projekte mit bekanntem Stand, die Hinweise schicken.
  liveProjects(cfg) { return Object.entries(this.state.projects).filter(([rid, pr]) => pr.root && pr.snap && this.enrolled(rid, cfg)).map(([rid, pr]) => ({ rid, ...pr })); }

  // Projekt zu einem Knopf (rid) oder Befehl (Name, Anfang reicht). Ohne Angabe nur, wenn es genau eines gibt.
  // Liest den Stand vorher frisch ein: Eine Aufgabe, die gerade angelegt wurde, soll schon in der Antwort stehen.
  pick(cfg, t, { rid = '', name = '' } = {}) {
    const all = this.liveProjects(cfg);
    const names = all.map((x) => x.name).join(', ');
    const n = name.toLowerCase();
    const p = rid ? all.find((x) => x.rid === rid)
      : name ? all.find((x) => x.name.toLowerCase() === n) || all.find((x) => x.name.toLowerCase().startsWith(n))
        : all.length === 1 ? all[0] : null;
    if (!p) {
      if (rid) throw new Error(t('Das Projekt ist nicht mehr da oder schickt keine Hinweise mehr.', 'The project is gone or no longer sends notifications.'));
      if (!all.length) throw new Error(t('works kennt noch kein Projekt. Öffne ein Projekt mit works, dann geht es los.', 'works does not know any project yet. Open a project with works first.'));
      throw new Error(name ? t(`Kein Projekt „${cut(name, 60)}“. Da sind: ${names}`, `No project “${cut(name, 60)}”. Known: ${names}`) : t(`Mehrere Projekte, bitte mit project angeben: ${names}`, `Several projects, please name one with project: ${names}`));
    }
    this.scanProject(p.root, p.rid, cfg);
    return { rid: p.rid, ...this.state.projects[p.rid] };
  }

  projectLine(pr, cfg, t) {
    const s = pr.snap;
    const a = s.active;
    const aL = a ? `${a.id}${cfg.privacy.titles && a.title ? ` ${cut(a.title, 60)}` : ''}` : '';
    const [dot, text] = s.perm ? ['🟠', t('wartet auf deine Freigabe', 'waits for your approval')]
      : s.busy ? ['🟢', a ? t(`arbeitet an ${aL}`, `working on ${aL}`) : t('arbeitet', 'working')]
        : s.idleSince ? ['🟠', t('ist fertig und wartet auf dich', 'is done and waits for you')]
          : ['⚪', a ? t(`in Arbeit: ${aL}`, `in progress: ${aL}`) : t('keine Aufgabe in Arbeit', 'no task in progress')];
    const ci = this.state.ci[pr.rid];
    const prog = s.progress && s.progress.total ? ` · ${s.progress.done}/${s.progress.total}` : '';
    return `${dot} **${cut(s.name, 80)}** ${text}${prog}${ci && !ci.ok ? ' · 🔴 CI' : ''}`;
  }

  overview(cfg, t) {
    const all = this.liveProjects(cfg);
    return { embeds: [{ color: COLOR.status, title: t(`works · ${all.length} ${all.length === 1 ? 'Projekt' : 'Projekte'}`, `works · ${all.length} ${all.length === 1 ? 'project' : 'projects'}`), description: trimTo(all.map((p) => this.projectLine(p, cfg, t)).join('\n') || t('Noch kein Projekt bekannt.', 'No project known yet.'), 4000) }] };
  }

  taskList(pr, cfg, t) {
    const order = { 'in-arbeit': 0, review: 1, geplant: 2, backlog: 3 };
    const st = { 'in-arbeit': t('in Arbeit', 'in progress'), review: t('im Review', 'in review'), geplant: t('geplant', 'planned'), backlog: 'Backlog' };
    const open = Object.values(pr.snap.tasks).filter((x) => OPEN_STATUSES.includes(x.status))
      .sort((a, b) => String(a.priority || 'P9').localeCompare(String(b.priority || 'P9')) || (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.id.localeCompare(b.id));
    const lines = open.slice(0, 25).map((x) => `**${x.id}** ${x.priority || ''} · ${st[x.status] || x.status}${cfg.privacy.titles && x.title ? ` · ${cut(x.title, 90)}` : ''}`);
    return { embeds: [{ color: colorOf(pr.snap.name), title: cut(t(`${pr.snap.name} · ${open.length} offen`, `${pr.snap.name} · ${open.length} open`), 256), description: trimTo(lines.join('\n') || t('Nichts offen.', 'Nothing open.'), 4000), ...(open.length > 25 ? { footer: { text: t(`und ${open.length - 25} weitere im Board`, `and ${open.length - 25} more in the board`) } } : {}) }] };
  }

  bugView(pr, id, cfg, t) {
    const b = loadTasks(pr.root).find((x) => x.id === id);
    if (!b) throw new Error(t(`${id} gibt es nicht mehr.`, `${id} no longer exists.`));
    const text = cfg.privacy.titles ? (getSection(b._body, 'Beschreibung') || getSection(b._body, 'Fehlerbild') || '').replace(/<!--[\s\S]*?-->/g, '').trim() : '';
    return { embeds: [{ color: COLOR.red, author: { name: cut(pr.snap.name, 100) }, title: cut(label(cfg, b.id, b.title), 256), ...(text ? { description: cutBlock(text, 1500) } : {}), fields: [field(t('Status', 'Status'), b.status), field(t('Priorität', 'Priority'), b.priority || '–')] }] };
  }

  // Aktion zu einem Befehl, Knopf oder Dialog. Schreibende Aktionen laufen über dieselbe API wie das Board (Rückgängig
  // im Board, Verlauf mit [Discord]). Fehler kommen als Text für den Nutzer zurück.
  async act(i, cfg, t) {
    const { runActionWithUndo } = await import('./api.mjs');
    const ok = (title, description = '') => ({ embeds: [{ color: COLOR.done, title: cut(title, 256), ...(description ? { description: trimTo(description, 4000) } : {}) }] });
    const create = async (pr, title, prio) => {
      const priority = String(prio || '').toUpperCase();
      if (!/^P[1-4]$/.test(priority)) throw new Error(t('Priorität bitte als P1, P2, P3 oder P4.', 'Priority please as P1, P2, P3 or P4.'));
      const r = await runActionWithUndo(pr.root, { action: 'create', type: 'feature', title, priority, source: 'discord' });
      return ok(t(`✓ ${r.id} angelegt`, `✓ ${r.id} created`), `${cfg.privacy.titles ? `${cut(title, 200)} · ` : ''}${priority} · ${cut(pr.snap.name, 80)}\n${t('Claude ergänzt Beschreibung und Kriterien, sobald es die Aufgabe aufnimmt.', 'Claude fills in the description and criteria when it picks the task up.')}`);
    };
    const instruct = async (pr, id, text) => {
      const tid = id || (pr.snap.active && pr.snap.active.id) || '';
      if (!tid) throw new Error(t('Gerade ist keine Aufgabe in Arbeit. Gib die Aufgabe mit an (task).', 'No task is in progress right now. Name the task (task).'));
      await runActionWithUndo(pr.root, { action: 'instruct', id: tid, text });
      return ok(t(`✓ Anweisung an ${tid}`, `✓ Instruction for ${tid}`), t('Claude liest sie beim nächsten Schritt.', 'Claude reads it with its next step.'));
    };
    if (i.type === 2) {
      const { sub, opts } = subOf(i);
      if (sub === 'status' && !opts.project) return this.overview(cfg, t);
      const pr = this.pick(cfg, t, { name: opts.project || '' });
      if (sub === 'status') return renderStatus({ ...pr.snap, recent: pr.recent, ci: this.state.ci[pr.rid] || null }, cfg);
      if (sub === 'tasks') return this.taskList(pr, cfg, t);
      if (sub === 'new') return create(pr, opts.title, opts.priority);
      if (sub === 'instruct') return instruct(pr, (opts.task || '').toUpperCase(), opts.text);
      throw new Error(t('Unbekannter Befehl.', 'Unknown command.'));
    }
    const p = parseCid(i.data && i.data.custom_id);
    if (!p) throw new Error(t('Unbekannter Knopf.', 'Unknown button.'));
    const pr = this.pick(cfg, t, { rid: p.rid });
    if (i.type === 3 && p.act === 'acc') {
      const cur = pr.snap.tasks[p.id];
      if (!cur || cur.status !== 'review') throw new Error(t(`${p.id} ist nicht mehr im Review${cur ? ` (${cur.status})` : ''}.`, `${p.id} is no longer in review${cur ? ` (${cur.status})` : ''}.`));
      await runActionWithUndo(pr.root, { action: 'move', id: p.id, to: 'erledigt' });
      return ok(t(`✓ ${p.id} angenommen`, `✓ ${p.id} accepted`), t('Die Aufgabe ist erledigt.', 'The task is done.'));
    }
    if (i.type === 3 && p.act === 'bug') return this.bugView(pr, p.id, cfg, t);
    if (i.type === 5) {
      const v = modalValues(i.data);
      if (p.act === 'retm') {
        await runActionWithUndo(pr.root, { action: 'review', id: p.id, text: v.text });
        return ok(t(`↩ ${p.id} geht zurück an Claude`, `↩ ${p.id} goes back to Claude`), t('Deine Begründung steht als Kommentar an der Aufgabe.', 'Your reason is attached to the task as a comment.'));
      }
      if (p.act === 'insm') return instruct(pr, p.id, v.text);
      if (p.act === 'newm') return create(pr, v.title, v.priority);
    }
    throw new Error(t('Unbekannte Aktion.', 'Unknown action.'));
  }

  // Eine Interaktion beantworten. io kapselt den Weg: eigener Bot direkt zu Discord, gemeinsamer Bot über den Dienst.
  // Nur der Besitzer darf etwas auslösen. Dialoge und Hilfe sofort, alles andere erst vorläufig, dann das Ergebnis
  // (Annehmen kann Prüfungen laufen lassen, Discord wartet aber nur 3 s).
  async onInteraction(i, io) {
    const cfg = loadDiscordConfig();
    const t = tr(i.locale || i.guild_locale);
    try {
      if (!cfg.owner_id || who(i) !== cfg.owner_id) return await io.reply(notOwner(i.locale));
      const p = i.type === 3 ? parseCid(i.data && i.data.custom_id) : null;
      if (p && MODAL.has(p.act)) return await io.modal(modalFor(i.data.custom_id, i.locale));
      if (i.type === 2 && subOf(i).sub === 'help') return await io.reply(helpMessage({ locale: i.locale, shared: this.shared }));
      await io.defer();
      let data;
      try { data = await this.act(i, cfg, t); } catch (e) {
        data = { embeds: [{ color: COLOR.red, title: t('Ging nicht', 'That did not work'), description: cut(e.message, 1500) }] };
      }
      await io.edit(data);
    } catch (e) { this.log(`Antwort auf Befehl oder Knopf: ${e.message}`); }
  }

  ownIo(i) {
    const cb = (body) => this.rest.post(`/interactions/${i.id}/${i.token}/callback`, body);
    return {
      reply: (data) => cb({ type: 4, data: ephemeral(data) }),
      modal: (m) => cb({ type: 9, data: m }),
      defer: () => cb({ type: 5, data: { flags: 64 } }),
      edit: (data) => this.rest.patch(`/webhooks/${i.application_id}/${i.token}/messages/@original`, ephemeral(data)),
    };
  }

  // Gemeinsamer Bot: Der Dienst hat schon vorläufig geantwortet und Dialoge selbst geöffnet; das Gerät schickt nur das
  // Ergebnis zurück, das Token der Interaktion kennt es nicht.
  sharedIo(i) {
    const send = (data) => this.rest.post(`/interactions/${i.id}/reply`, ephemeral(data));
    return { reply: send, edit: send, defer: async () => {}, modal: () => send({ embeds: [{ color: COLOR.gone, title: '?' }] }) };
  }

  // Atomar und kompakt: erst in eine Zwischendatei, dann umbenennen. Unter Windows kann ein Virenscanner die Datei
  // kurz sperren, dann ein paar Versuche.
  save() {
    const f = dfile('state.json');
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    for (let i = 0; ; i++) {
      try { fs.renameSync(tmp, f); break; } catch (e) {
        if (i >= 5) { try { fs.unlinkSync(tmp); } catch { /* weg */ } throw e; }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
    this.dirty = false;
  }
}

// ---------- Prozess ----------

const HEARTBEAT = FAST ? 500 : 5000;
const FRESH = 30000;

function makeLog(token) {
  return (msg) => {
    const line = `${new Date().toISOString()} ${String(msg).split(token || '\u0000').join('***')}\n`;
    try {
      const f = dfile('bot.log');
      try { if (fs.statSync(f).size > 256 * 1024) fs.renameSync(f, `${f}.1`); } catch { /* neu */ }
      fs.appendFileSync(f, line);
    } catch { /* Log ist nicht kritisch */ }
  };
}

const fresh = (file) => { try { return Date.now() - fs.statSync(file).mtimeMs < FRESH; } catch { return false; } };

// Sperrdatei bot.pid: ein Bot je Rechner. Der laufende Bot erneuert alle paar Sekunden ihren Zeitstempel.
// - Gehört sie einem toten Prozess oder ist sie alt (PID inzwischen an einen anderen Prozess vergeben): übernehmen,
//   bei einer alten aber erst nach einer Gnadenfrist (ein Rechner aus dem Ruhezustand braucht einen Herzschlag).
// - Läuft ein frischer Bot (etwa die alte Version beim Wechsel), bis zu 20 s warten, bis er sich beendet.
async function acquireLock() {
  fs.mkdirSync(discordDir(), { recursive: true });
  const file = dfile('bot.pid');
  const until = Date.now() + 20000;
  let staleSince = 0;
  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, started: new Date().toISOString(), version: runningVersion(), cli: OWN_CLI, cwd: process.cwd() }));
      fs.closeSync(fd);
      return true;
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const info = readJson(file, null);
    const other = info && info.pid !== process.pid && isAlive(info.pid);
    if (other && fresh(file)) { staleSince = 0; if (Date.now() > until) return false; }
    else if (other && !staleSince) staleSince = Date.now();
    else if (!other || Date.now() - staleSince > HEARTBEAT * 1.5 + 500) { try { fs.unlinkSync(file); } catch { /* weg */ } continue; }
    await sleep(200);
  }
}

function releaseLock() {
  const info = readJson(dfile('bot.pid'), null);
  if (info && info.pid === process.pid) { try { fs.unlinkSync(dfile('bot.pid')); } catch { /* weg */ } }
}

// stop.req nennt die PID, die gehen soll. Beim Versionswechsel läuft der neue Bot schon und darf nicht mit gehen.
function stopRequested() {
  try { const want = fs.readFileSync(dfile('stop.req'), 'utf8').trim(); return !want || Number(want) === process.pid; } catch { return false; }
}

export async function runBot() {
  const cfg = loadDiscordConfig();
  let cred;
  try { cred = credential(cfg); } catch (e) { makeLog('')(`${e.message} Bot beendet.`); return 1; }
  const log = makeLog(cred.secret);
  if (!cred.secret || !cfg.channel_id) { log('Nicht eingerichtet, Bot beendet. Einrichten mit works discord.'); return 1; }
  // Nie in einem Projektordner oder Worktree laufen: Unter Windows ließe er sich sonst nicht löschen.
  try { fs.mkdirSync(discordDir(), { recursive: true }); process.chdir(discordDir()); } catch { /* bleibt */ }
  if (!await acquireLock()) { log('Ein anderer Bot läuft schon, dieser beendet sich.'); return 0; }
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  // Lebenszeichen. Gehört bot.pid nicht mehr diesem Prozess (ein anderer Bot hat übernommen), geht er.
  const beat = setInterval(() => {
    const info = readJson(dfile('bot.pid'), null);
    if (!info || info.pid !== process.pid) { if (!stopping) log('bot.pid gehört nicht mehr diesem Bot, er beendet sich.'); stopping = true; return; }
    try { const t = new Date(); fs.utimesSync(dfile('bot.pid'), t, t); } catch { /* nächster Versuch */ }
  }, HEARTBEAT);
  let gw = null;
  let fatal = '';
  // Gemeinsamer Bot (W-0040): über den Dienst mit dem Geräteschlüssel; das Gateway hält der Dienst.
  const invalid = cred.shared ? 'Schlüssel ungültig (in Discord getrennt?). Neu koppeln mit /works verbinden und works discord link.' : 'Token ungültig. Neues Token mit works discord token.';
  // 410 vom Dienst: Kopplung kaputt (Bot vom Server entfernt, Rechte entzogen oder Kanal gelöscht).
  const broken = 'Kanal nicht mehr erreichbar (Bot entfernt, Rechte entzogen oder Kanal gelöscht). Neu koppeln: in Discord /works verbinden, dann works discord link <Code>.';
  const fatalOf = (e) => (e.status === 410 ? broken : e.status === 401 ? invalid : '');
  try {
    const rest = new Rest({ token: cred.secret, base: cred.base, scheme: cred.scheme });
    for (;;) {
      if (stopping || stopRequested()) return 0;
      try { await rest.get('/users/@me'); break; } catch (e) {
        if (fatalOf(e)) { log(`${fatalOf(e)} Bot beendet.`); return 1; }
        log(`${e.message}, neuer Versuch`);
        await sleep(RETRY);
      }
    }
    log(`Bot gestartet (PID ${process.pid}, Node ${process.version}${cred.shared ? ', gemeinsamer Bot' : ''})`);
    if (!cred.shared && !hasWebSocket()) log(`Node ${process.version}: ohne Gateway, online erst ab Node 22. Nachrichten gehen trotzdem.`);
    // Gateway: beim Start und, falls Discord da nicht erreichbar war, jede Minute neu versuchen.
    let gwRetry = 0;
    const connectGateway = async () => {
      gwRetry = Date.now() + 60000;
      try {
        const g = await rest.get('/gateway/bot');
        gw = new Gateway({
          token: cred.secret, url: g.url, log,
          onFatal: (code) => { fatal = code === 4004 ? 'Token ungültig' : `Gateway-Code ${code}`; },
          onDispatch: (type, d) => { if (type === 'INTERACTION_CREATE' && d) bot.onInteraction(d, bot.ownIo(d)); },
        });
        gw.start();
      } catch (e) { log(`Gateway nicht erreichbar (${e.message}), Nachrichten gehen trotzdem.`); }
    };
    // Schreibende Aktionen aus Discord laufen über die Board-API; der Verlauf zeigt sie mit [Discord].
    process.env.WORKS_API_ACTOR = 'Discord';
    const bot = new Bot({ rest, log, shared: cred.shared, interactive: cred.shared || hasWebSocket() });
    // Gemeinsamer Bot: Befehle und Klicks holt das Gerät beim Dienst ab (es hat kein Gateway). Der Dienst hält die
    // Anfrage offen, bis etwas kommt; ein Dienst ohne Inbox (ältere Version) wird nur selten gefragt.
    if (cred.shared) {
      (async () => {
        let warned = false;
        while (!stopping && !fatal) {
          try {
            const r = await rest.get(`/inbox?wait=${FAST ? 1 : 10}`);
            for (const i of (r && Array.isArray(r.interactions) ? r.interactions : [])) bot.onInteraction(i, bot.sharedIo(i));
          } catch (e) {
            if (fatalOf(e)) { fatal = fatalOf(e); break; }
            if (e.status === 404 && !warned) { warned = true; log('Der gemeinsame Bot kennt noch keine Befehle und Knöpfe (ältere Version).'); }
            await sleep(e.status === 404 ? 600000 : RETRY);
          }
        }
      })();
    }
    while (!stopping && !stopRequested() && !fatal) {
      if (!cred.shared && !gw && hasWebSocket() && Date.now() >= gwRetry) await connectGateway();
      try { await bot.tick(); } catch (e) {
        if (fatalOf(e)) { fatal = fatalOf(e); break; }
        log(`Fehler: ${e.message}`);
      }
      await sleep(TICK);
    }
    if (fatal) log(`${fatal}, Bot beendet.`);
    return fatal ? 1 : 0;
  } finally {
    clearInterval(beat);
    if (gw) gw.stop();
    releaseLock();
    try { if (Number(fs.readFileSync(dfile('stop.req'), 'utf8').trim()) === process.pid) fs.unlinkSync(dfile('stop.req')); } catch { /* keine */ }
    log('Bot beendet');
  }
}
