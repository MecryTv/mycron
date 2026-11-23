// Bot-Prozess works (W-0036): einer je Rechner, für alle angemeldeten Projekte.
// Ereignisse entstehen aus dem Stand der Projekte (Aufgaben, Warteschlange, Live-Aktivität), damit Hooks
// nichts zusätzlich tun müssen; ship, CI-Wächter und Berichte legen Ereignisse in die outbox (discord.mjs).
// Nachrichten nach Entwurf F2: Felder, Erledigtes wird nachträglich bearbeitet, nur Erwähnungen klingeln,
// je Projekt ein angehefteter Statuspost, der gebündelt bearbeitet wird.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJson, writeJson, loadTasks, loadConfig, loadState, OPEN_STATUSES, checkboxes, getSection, openQuestions, queueOf, today, rootIdOf, run, sortTasks } from './lib.mjs';
import { loadActivity } from './live.mjs';
import { liveUsage, fmtCost } from './usage.mjs';
import { projectList } from './hub.mjs';
import { runningVersion, OWN_CLI, isAlive } from './server-control.mjs';
import { dfile, discordDir, loadDiscordConfig, loadToken, normalizeConfig, apiBase, readOutbox } from './discord.mjs';
import { Rest, Gateway, hasWebSocket } from './discord-api.mjs';

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

const cut = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const cutBlock = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const rel = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? `<t:${Math.floor(Date.parse(iso) / 1000)}:R>` : '');
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const bar = (d, t, n = 10) => { if (!t) return ''; const f = Math.max(0, Math.min(n, Math.round((d / t) * n))); return '▰'.repeat(f) + '▱'.repeat(n - f); };
const sha7 = (s) => String(s || '').slice(0, 7);
const field = (name, value, inline = true) => ({ name: cut(name, 256) || '–', value: cutBlock(value, 1024) || '–', inline });
const label = (cfg, id, title) => (cfg.privacy.titles && title ? `${id} ${title}` : String(id || ''));
const colorOf = (name) => PALETTE[parseInt(crypto.createHash('md5').update(String(name)).digest('hex').slice(0, 6), 16) % PALETTE.length];
const minutes = (from, to) => { const m = Math.max(0, Math.round((Date.parse(to || new Date().toISOString()) - Date.parse(from)) / 60000)); return Number.isNaN(m) ? '' : m < 1 ? 'unter 1 Minute' : m === 1 ? '1 Minute' : m < 60 ? `${m} Minuten` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const linkRow = (buttons) => (buttons.length ? [{ type: 1, components: buttons.slice(0, 5).map(([lbl, url]) => ({ type: 2, style: 5, label: cut(lbl, 80), url })) }] : []);

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
    embeds: [{
      author: { name: `${name} · Stand` },
      color: colorOf(s.name),
      description: cutBlock(lines.join('\n'), 4000),
      fields,
      footer: { text: p && p.total ? `${bar(p.done, p.total)} ${p.done} von ${p.total} erledigt` : 'works' },
      timestamp: now.toISOString(),
    }],
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
export function renderEvent(ev, cfg, { owner = '', now = new Date() } = {}) {
  const p = cut(ev.project || '', 100);
  const who = ev.id ? cut(label(cfg, ev.id, ev.title), 200) : '–';
  const open = !ev.state || ev.state === 'open';
  let e = { color: COLOR.done };
  let text = '';
  let buttons = [];
  switch (ev.type) {
    case 'perm':
      if (!open) { e = { color: COLOR.gone, title: '✓ Freigabe beantwortet', description: `Hat ${minutes(ev.since, ev.until)} gewartet${ev.tool ? ` · ${cut(ev.tool, 60)}` : ''}` }; break; }
      text = `${p} wartet auf deine Freigabe (${cut(ev.tool || 'Werkzeug', 40)})`;
      e = { color: COLOR.need, title: 'Wartet auf deine Freigabe', fields: [field('Aufgabe', who), field('Werkzeug', cfg.privacy.commands && ev.what ? `${ev.tool}: ${ev.what}` : `${ev.tool || '–'}${ev.what ? ', Befehl ausgeblendet' : ''}`), field('Wartet seit', rel(ev.since))], footer: { text: 'Freigeben in Claude Code · die Nachricht wird grau, sobald erledigt' } };
      break;
    case 'idle':
      if (!open) { e = { color: COLOR.gone, title: '↻ Weiter gearbeitet', description: `Nach ${minutes(ev.since, ev.until)}` }; break; }
      text = `${p}: Claude ist fertig und wartet auf dich`;
      e = { color: COLOR.need, title: 'Claude ist fertig und wartet auf dich', fields: [field('Aufgabe', who), field('Fertig seit', rel(ev.since))] };
      break;
    case 'question':
      text = `${p}: Frage zu ${ev.id}`;
      e = { color: COLOR.need, title: `Frage zu ${ev.id}`, description: cfg.privacy.titles ? cutBlock(ev.text, 1500) : 'Frage im Board ansehen' };
      break;
    case 'review':
      if (ev.state === 'accepted') { e = { color: COLOR.done, title: `✓ ${ev.id} angenommen`, description: `${cfg.privacy.titles && ev.title ? `${cut(ev.title, 200)} · ` : ''}${hhmm(ev.at || now.toISOString())}` }; break; }
      if (ev.state === 'returned') { e = { color: COLOR.gone, title: `↩ ${ev.id} zurückgegeben`, description: cfg.privacy.titles ? cut(ev.title, 200) : '' }; break; }
      e = { color: COLOR.done, title: `${ev.id} im Review`, fields: [...(cfg.privacy.titles && ev.title ? [field('Aufgabe', cut(ev.title, 200))] : []), field('Kriterien', ev.crit && ev.crit[1] ? `${ev.crit[0]} von ${ev.crit[1]}` : 'keine'), ...(cfg.privacy.costs && ev.cost ? [field('Kosten', ev.cost)] : [])], footer: { text: 'Abnehmen im Board oder mit works done' } };
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
        e = { color: COLOR.red, title: `CI rot für ${sha7(ev.sha)}`, fields: [...(ev.total ? [field('Rot', `${ev.failed || '?'} von ${ev.total} Jobs`)] : []), ...(ev.job ? [field('Erster Fehler', cut(ev.job, 200))] : []), ...(ev.bug ? [field('Bug', `${ev.bug} angelegt`)] : [])] };
        if (cfg.privacy.ci_error && ev.error) e.footer = { text: cut(ev.error, 300) };
      }
      if (/^https:\/\//.test(ev.url || '')) buttons = [['Lauf auf GitHub', ev.url]];
      break;
    case 'report_week':
    case 'report_day':
      e = { color: COLOR.status, title: cut(ev.title || 'Bericht', 256), description: cutBlock(ev.summary, 3000), ...(ev.done !== undefined ? { fields: [field('Erledigt', String(ev.done))] } : {}) };
      break;
    default:
      e = { color: COLOR.gone, title: cut(ev.type, 100) };
  }
  if (p) e.author = { name: p };
  if (e.fields && !e.fields.length) delete e.fields;
  if (e.description === '') delete e.description;
  const at = open && !!text && !!owner && !!(cfg.events[ev.type] && cfg.events[ev.type].at) && !isQuiet(cfg, now);
  return {
    content: at ? `<@${owner}> ${cut(text, 1800)}` : '',
    embeds: [e],
    components: linkRow(buttons),
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

function fingerprint(root) {
  return ['WORKS.md', 'activity.json', 'config.json', 'state.json', 'time.jsonl'].map((f) => { try { const s = fs.statSync(path.join(root, '.works', f)); return `${s.size}:${s.mtimeMs}`; } catch { return '-'; } }).join('|');
}

export function snapshotOf(root) {
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
  const act = loadActivity(root);
  const cur = act && act.current;
  const usage = liveUsage(root, config);
  const queueIds = queueOf(config).filter((id) => byId.has(id) && OPEN_STATUSES.includes(byId.get(id).status));
  const nextList = queueIds.length ? queueIds.map((id) => byId.get(id))
    : sortTasks(live.filter((t) => ['backlog', 'geplant'].includes(t.status)));
  const counted = all.filter((t) => t.status !== 'verworfen');
  const day = today();
  return {
    name: path.basename(root),
    tasks,
    active: active ? { id: active.id, title: active.title, crit: crit(active) } : null,
    busy: !!(act && act.busy),
    since: (act && act.since) || '',
    idleSince: (act && !act.busy && act.idleSince) || '',
    perm: act && act.busy && cur && cur.perm ? { since: cur.permSince || cur.at, tool: cur.tool || '', what: cur.what || '', task: cur.task || '' } : null,
    queueIds,
    queue: nextList.slice(0, 2).map((t) => ({ id: t.id, title: t.title })),
    today: { done: all.filter((t) => t.completed === day).length, cost: usage.today.cost > 0 ? fmtCost(usage.today.cost, usage.currency) : '' },
    costs: Object.fromEntries(Object.entries(usage.byTask).filter(([, v]) => v.cost > 0).map(([k, v]) => [k, fmtCost(v.cost, usage.currency)])),
    progress: { done: counted.filter((t) => t.status === 'erledigt').length, total: counted.length },
  };
}

function commitUrl(root, sha) {
  if (!root || !sha) return '';
  const r = run('git', ['-C', root, 'remote', 'get-url', 'origin']);
  const m = r.ok && r.stdout.trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}/commit/${sha}` : '';
}

// ---------- Bot ----------

const emptyState = () => ({ projects: {}, msgs: {}, queue: [], open: {}, ships: {}, ci: {} });

export class Bot {
  constructor({ rest, log }) {
    this.rest = rest; this.log = log;
    const s = readJson(dfile('state.json'), null);
    this.state = { ...emptyState(), ...(s || {}) };
    this.timers = new Map();
    this.fingers = new Map();
    this.snapAt = new Map();
    this.forceStatus = new Set(Object.keys(this.state.projects));
    this.retryAt = 0;
    this.dirty = false;
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

  fromOutbox(o, cfg) {
    const d = o.data || {};
    const rid = o.rootId || '';
    if (rid && o.project) { const pr = this.project(rid); if (!pr.name) pr.name = o.project; if (!pr.root) pr.root = o.root; }
    if (o.type === 'ship') {
      const key = `ship:${rid}:${d.id}:${d.run || 'x'}`;
      const s = this.state.ships[key] || { type: 'ship', project: o.project, id: d.id, steps: [], status: 'run', started: o.at };
      if (['merge', 'push', 'ci', 'update'].includes(d.step)) {
        s.steps = s.steps.filter((x) => x.step !== d.step).concat({ step: d.step, ok: d.ok !== false, sha: d.sha || '', workflows: d.workflows || 0 });
        if (d.step === 'push' && d.sha) s.commitUrl = commitUrl(o.root, d.sha);
        if (d.step === 'ci') { const push = s.steps.find((x) => x.step === 'push'); this.state.ci[rid] = { ok: d.ok !== false, sha: (push && push.sha) || d.sha || '', at: o.at }; }
      }
      if (d.step === 'done') { s.status = 'done'; s.ended = o.at; this.addRecent(rid, `${d.id} ausgeliefert`); }
      if (d.step === 'fail') { s.status = 'fail'; s.ended = o.at; s.note = d.note || ''; this.addRecent(rid, `${d.id} angehalten`); }
      this.state.ships[key] = s;
      if (cfg.events.shipped.on) this.upsert(key, s, rid, cfg);
      this.dirty = true;
      return;
    }
    if (o.type === 'ci') {
      const before = this.state.ci[rid];
      this.state.ci[rid] = { ok: !!d.ok, sha: d.sha || '', at: o.at };
      this.dirty = true;
      if (d.ok && !(before && !before.ok)) { this.addRecent(rid, `CI grün ${sha7(d.sha)}`); return; }
      this.event(rid, d.ok ? 'ci_green' : 'ci_red', { ...d, project: o.project }, cfg);
      return;
    }
    if (o.type === 'report') { this.event(rid, d.kind === 'tag' ? 'report_day' : 'report_week', { ...d, project: o.project }, cfg); return; }
    this.log(`Unbekanntes Ereignis ${o.type} verworfen`);
  }

  schedule(slot, key, rid, type, data, delaySec) {
    this.timers.set(slot, { key, rid, type, data, due: Date.now() + Math.max(0, delaySec) * 1000 });
  }

  // Noch gültig? Freigabe: dieselbe Anfrage wartet noch. Warten: Claude ist seitdem nicht wieder losgelaufen.
  stillTrue(type, data, snap) {
    if (!snap) return false;
    if (type === 'perm') return !!(snap.perm && snap.perm.since === data.since);
    if (type === 'idle') return !snap.busy && snap.idleSince === data.since;
    return false;
  }

  diff(rid, prev, next, cfg) {
    for (const t of Object.values(next.tasks)) {
      const o = prev.tasks[t.id];
      const base = { id: t.id, title: t.title };
      if (!o) { if (t.priority === 'P1' && t.source !== 'board' && OPEN_STATUSES.includes(t.status)) this.event(rid, 'p1', base, cfg); continue; }
      if (o.status !== 'review' && t.status === 'review') {
        const r = this.event(rid, 'review', { ...base, crit: t.crit, cost: next.costs[t.id] || '' }, cfg);
        if (r) this.state.open[`review:${rid}:${t.id}`] = { ...r, rid };
      } else if (o.status === 'review' && t.status !== 'review') {
        const slot = `review:${rid}:${t.id}`;
        const op = this.state.open[slot];
        const accepted = t.status === 'erledigt';
        if (op) { this.upsert(op.key, { ...op.ev, state: accepted ? 'accepted' : 'returned', at: new Date().toISOString() }, rid, cfg); delete this.state.open[slot]; }
        if (accepted) this.addRecent(rid, `${t.id} angenommen`);
        else if (OPEN_STATUSES.includes(t.status)) this.event(rid, 'returned', base, cfg);
      } else if (o.status !== 'erledigt' && t.status === 'erledigt' && !this.shipping(rid, t.id)) this.event(rid, 'done', base, cfg);
      if (t.q > o.q) this.event(rid, 'question', { ...base, text: t.lastQ }, cfg);
      if (o.priority !== 'P1' && t.priority === 'P1' && OPEN_STATUSES.includes(t.status)) this.event(rid, 'p1', base, cfg);
    }
    if (prev.queueIds.length && !next.queueIds.length) this.event(rid, 'queue_empty', {}, cfg);
    const act = next.active ? { id: next.active.id, title: next.active.title } : {};
    if (next.perm && (!prev.perm || prev.perm.since !== next.perm.since)) {
      const t = next.tasks[next.perm.task];
      this.schedule(`perm:${rid}`, `perm:${rid}:${next.perm.since}`, rid, 'perm', { id: next.perm.task, title: t ? t.title : '', tool: next.perm.tool, what: next.perm.what, since: next.perm.since }, cfg.delays.perm);
    }
    if (!next.busy && next.idleSince && (prev.busy || prev.idleSince !== next.idleSince)) {
      this.schedule(`idle:${rid}`, `idle:${rid}:${next.idleSince}`, rid, 'idle', { ...act, since: next.idleSince }, cfg.delays.idle);
    }
  }

  // Freigabe und Warten, die sich erledigt haben: Timer verwerfen, gesendete Nachricht grau bearbeiten.
  resolve(rid, snap, cfg) {
    for (const type of ['perm', 'idle']) {
      const slot = `${type}:${rid}`;
      const tm = this.timers.get(slot);
      if (tm && !this.stillTrue(type, tm.data, snap)) this.timers.delete(slot);
      const op = this.state.open[slot];
      if (op && !this.stillTrue(type, op.ev, snap)) {
        this.upsert(op.key, { ...op.ev, state: 'resolved', until: new Date().toISOString() }, rid, cfg);
        delete this.state.open[slot];
        this.dirty = true;
      }
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
    const fp = fingerprint(root);
    if (this.fingers.get(rid) === fp && Date.now() - (this.snapAt.get(rid) || 0) < 60000) return;
    let next;
    try { next = snapshotOf(root); } catch (e) { this.log(`${path.basename(root)}: Stand nicht lesbar (${e.message})`); return; }
    this.fingers.set(rid, fp);
    this.snapAt.set(rid, Date.now());
    const pr = this.project(rid);
    const prev = pr.snap;
    pr.snap = next; pr.name = next.name; pr.root = root;
    if (prev && prev.tasks) this.diff(rid, prev, next, cfg);
    this.resolve(rid, next, cfg);
    this.dirty = true;
  }

  async flush(cfg) {
    while (this.state.queue.length && Date.now() >= this.retryAt) {
      const op = this.state.queue[0];
      const body = renderEvent(op.ev, cfg, { owner: cfg.owner_id });
      const known = this.state.msgs[op.key];
      try {
        if (known) await this.rest.patch(`/channels/${known.channel_id}/messages/${known.message_id}`, { content: body.content, embeds: body.embeds, components: body.components, allowed_mentions: body.allowed_mentions });
        else {
          const ch = op.channel_id || this.channelFor(op.rid, cfg);
          const m = await this.rest.post(`/channels/${ch}/messages`, body);
          this.state.msgs[op.key] = { channel_id: ch, message_id: m.id, at: new Date().toISOString() };
        }
      } catch (e) {
        if (e.retry) { this.retryAt = Date.now() + RETRY; this.log(e.message); return; }
        if (e.status === 401) throw e;
        this.log(`Nachricht verworfen: ${e.message}`);
      }
      this.state.queue.shift();
      this.dirty = true;
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
        if (s.message_id && s.channel_id === ch) {
          try { await this.rest.patch(`/channels/${ch}/messages/${s.message_id}`, { embeds: body.embeds }); ok = true; } catch (e) { if (e.status !== 404) throw e; }
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
        if (e.status === 401) throw e;
        pr.status = { ...s, at: Date.now() };
        if (!this.warned.has(`st:${rid}`)) { this.warned.add(`st:${rid}`); this.log(`Statuspost ${pr.name}: ${e.message}`); }
      }
    }
  }

  prune() {
    const old = Date.now() - 7 * 86400000;
    for (const [k, v] of Object.entries(this.state.msgs)) if (Date.parse(v.at) < old && !Object.values(this.state.open).some((o) => o.key === k)) delete this.state.msgs[k];
    for (const [k, v] of Object.entries(this.state.ships)) if (Date.parse(v.ended || v.started) < Date.now() - 86400000) delete this.state.ships[k];
  }

  async tick() {
    const cfg = loadDiscordConfig();
    const done = [];
    // Ereignisse älter als zwei Tage (Bot lange aus) wären nur noch Lärm: verwerfen.
    for (const { file, ev } of readOutbox()) {
      if (Date.now() - Date.parse(ev.at) > 2 * 86400000) this.log(`Altes Ereignis ${ev.type} vom ${ev.at} verworfen`);
      else { try { this.fromOutbox(ev, cfg); } catch (e) { this.log(`outbox: ${e.message}`); } }
      done.push(file);
    }
    if (done.length) this.dirty = true;
    for (const p of projectList()) {
      const rid = rootIdOf(p.path);
      if (this.enrolled(rid, cfg)) this.scanProject(p.path, rid, cfg);
    }
    this.fireTimers(cfg);
    if (this.dirty) this.save();
    for (const f of done) { try { fs.unlinkSync(f); } catch { /* schon weg */ } }
    await this.flush(cfg);
    await this.statusposts(cfg);
    if (this.dirty) { this.prune(); this.save(); }
  }

  save() { writeJson(dfile('state.json'), this.state); this.dirty = false; }
}

// ---------- Prozess ----------

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

// Sperrdatei bot.pid: ein Bot je Rechner. Gehört sie einem toten Prozess, wird sie übernommen.
function acquireLock() {
  fs.mkdirSync(discordDir(), { recursive: true });
  const file = dfile('bot.pid');
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, started: new Date().toISOString(), version: runningVersion(), cli: OWN_CLI }));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const info = readJson(file, null);
      if (info && info.pid !== process.pid && isAlive(info.pid)) return false;
      try { fs.unlinkSync(file); } catch { /* weg */ }
    }
  }
  return false;
}

function releaseLock() {
  const info = readJson(dfile('bot.pid'), null);
  if (info && info.pid === process.pid) { try { fs.unlinkSync(dfile('bot.pid')); } catch { /* weg */ } }
}

const stopRequested = () => fs.existsSync(dfile('stop.req'));

export async function runBot() {
  const token = loadToken();
  const log = makeLog(token);
  const cfg = loadDiscordConfig();
  if (!token || !cfg.channel_id) { log('Nicht eingerichtet, Bot beendet. Einrichten mit works discord.'); return 1; }
  if (!acquireLock()) { log('Ein anderer Bot läuft schon, dieser beendet sich.'); return 0; }
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  let gw = null;
  let fatal = '';
  try {
    const rest = new Rest({ token, base: apiBase() });
    for (;;) {
      if (stopping || stopRequested()) return 0;
      try { await rest.get('/users/@me'); break; } catch (e) {
        if (e.status === 401) { log('Token ungültig, Bot beendet. Neues Token mit works discord token.'); return 1; }
        log(`${e.message}, neuer Versuch`);
        await sleep(RETRY);
      }
    }
    log(`Bot gestartet (PID ${process.pid}, Node ${process.version})`);
    if (!hasWebSocket()) log(`Node ${process.version}: ohne Gateway, online erst ab Node 22. Nachrichten gehen trotzdem.`);
    // Gateway: beim Start und, falls Discord da nicht erreichbar war, jede Minute neu versuchen.
    let gwRetry = 0;
    const connectGateway = async () => {
      gwRetry = Date.now() + 60000;
      try {
        const g = await rest.get('/gateway/bot');
        gw = new Gateway({ token, url: g.url, log, onFatal: (code) => { fatal = code === 4004 ? 'Token ungültig' : `Gateway-Code ${code}`; } });
        gw.start();
      } catch (e) { log(`Gateway nicht erreichbar (${e.message}), Nachrichten gehen trotzdem.`); }
    };
    const bot = new Bot({ rest, log });
    while (!stopping && !stopRequested() && !fatal) {
      if (!gw && hasWebSocket() && Date.now() >= gwRetry) await connectGateway();
      try { await bot.tick(); } catch (e) {
        if (e.status === 401) { fatal = 'Token ungültig'; break; }
        log(`Fehler: ${e.message}`);
      }
      await sleep(TICK);
    }
    if (fatal) log(`${fatal}, Bot beendet.`);
    return fatal ? 1 : 0;
  } finally {
    if (gw) gw.stop();
    releaseLock();
    try { fs.unlinkSync(dfile('stop.req')); } catch { /* keine */ }
    log('Bot beendet');
  }
}
