// Bot-Prozess works (W-0036): einer je Rechner, für alle angemeldeten Projekte.
// Ereignisse entstehen aus dem Stand der Projekte (Aufgaben, Warteschlange, Live-Aktivität), damit Hooks
// nichts zusätzlich tun müssen; ship, CI-Wächter und Berichte legen Ereignisse in die outbox (discord.mjs).
// Nachrichten nach Entwurf F2: Felder, Erledigtes wird nachträglich bearbeitet, nur Erwähnungen klingeln.
// Dauerhaft im Kanal steht nur das Dashboard nach D3 (W-0044), eines je Kanal für alle Projekte; alles andere
// löscht der Bot nach der Frist (cleanup.seconds), offene Nachrichten erst nach ihrer Erledigung.
// Je Aufgabe genau eine Karte nach Entwurf I3 (W-0050), die bei jedem Schritt bearbeitet wird; braucht sie dich,
// kommt sie neu nach unten. Alles Gesendete steht im Verlauf (state.history), den Knopf und /works verlauf zeigen.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJson, loadTasks, loadConfig, loadState, OPEN_STATUSES, checkboxes, getSection, openQuestions, queueOf, today, rootIdOf, run, sortTasks } from './lib.mjs';
import { loadActivity } from './live.mjs';
import { loadLanes } from './parallel.mjs';
import { liveUsage, fmtCost } from './usage.mjs';
import { projectList } from './hub.mjs';
import { runningVersion, OWN_CLI, isAlive } from './server-control.mjs';
import { dfile, discordDir, loadDiscordConfig, normalizeConfig, credential, readOutbox, channelOf } from './discord.mjs';
import { Rest, Gateway, hasWebSocket } from './discord-api.mjs';
import { tr, useCatalog, who, subOf, parseCid, cid, MODAL, modalFor, modalValues, helpMessage, ephemeral, notOwner, commandsOff, commands } from './discord-ui.mjs';
import { language, catalog, normLang, setLanguage } from './i18n.mjs';
import { dashboardPng, cardPng } from './discord-image.mjs';

export { normalizeConfig };

// Sprache (W-0041): Nachrichten im Kanal (Dashboard, Hinweise, Status des Bots) in der globalen Sprache, bei jedem
// Aufbau frisch, damit works lang ohne Neustart wirkt; Antworten auf Befehle und Knöpfe in der Sprache des Clients.
// Weitere Sprachen über den Katalog aus i18n (Deutsch steht als Paar im Code).
useCatalog((lang, en) => catalog(lang)[en]);
const langOf = (lang) => tr(lang || language(null));

const FAST = process.env.WORKS_DISCORD_FAST === '1';
const TICK = FAST ? 100 : 2000;
const STATUS_MIN = FAST ? 300 : 10000;
const IMAGE_MIN = FAST ? 1000 : 300000; // Bild höchstens alle 5 Minuten neu zeichnen
// Kartenbild ohne neues Ereignis (Minuten, Achse bis jetzt) höchstens alle 5 Minuten, auch im Testtakt: sonst
// bearbeitet der Bot laufende Karten dauernd und schreibt state.json ohne Grund neu.
const CARD_IMAGE_MIN = 300000;
const PRESENCE_MIN = FAST ? 200 : 20000;
const RETRY = FAST ? 200 : 15000;
// W-0051: so lange darf .works/config.json fehlen (Branch-Wechsel), bevor ein Projekt aus Panel und state.json fällt.
const GONE_AFTER = FAST ? 2000 : 60000;
const SILENT = 4096;
const DAY_MS = 86400000;
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
const minutes = (from, to, t) => { const m = Math.max(0, Math.round((Date.parse(to || new Date().toISOString()) - Date.parse(from)) / 60000)); return Number.isNaN(m) ? '' : m < 1 ? t('unter 1 Minute', 'under 1 minute') : m === 1 ? t('1 Minute', '1 minute') : m < 60 ? t(`${m} Minuten`, `${m} minutes`) : `${Math.floor(m / 60)} h ${m % 60} min`; };
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

// Statuspost je Projekt. snap kommt aus snapshotOf, ergänzt um recent und ci. lang: Sprache, sonst die globale.
export function renderStatus(s, cfg, { now = new Date(), lang = '' } = {}) {
  const t = langOf(lang);
  const name = cut(s.name, 200);
  const a = s.active;
  const lines = [];
  const aLabel = a ? `**${a.id}**${cfg.privacy.titles && a.title ? ` ${cut(a.title, 120)}` : ''}` : '';
  const tool = s.perm && s.perm.tool ? ` (${cut(s.perm.tool, 40)})` : '';
  if (s.perm) lines.push(t(`**Claude** wartet auf deine Freigabe${tool}, seit ${rel(s.perm.since)}`, `**Claude** is waiting for your approval${tool}, since ${rel(s.perm.since)}`));
  else if (s.busy) lines.push(t(`**Claude** arbeitet${a ? ` an ${aLabel}` : ''}${s.since ? `, seit ${rel(s.since)}` : ''}`, `**Claude** is working${a ? ` on ${aLabel}` : ''}${s.since ? `, since ${rel(s.since)}` : ''}`));
  else if (s.idleSince) lines.push(t(`**Claude** ist fertig und wartet auf dich, seit ${rel(s.idleSince)}`, `**Claude** is done and waiting for you, since ${rel(s.idleSince)}`));
  if (a && (s.perm || !s.busy)) lines.push(t(`In Arbeit: ${aLabel}`, `In progress: ${aLabel}`));
  if (!a && !s.busy && !s.perm) lines.push(t('Keine Aufgabe in Arbeit', 'No task in progress'));
  if (a && a.crit && a.crit[1]) lines.push(`${bar(a.crit[0], a.crit[1], 7)} ${t(`${a.crit[0]} von ${a.crit[1]} Kriterien`, `${a.crit[0]} of ${a.crit[1]} criteria`)}`);
  const td = s.today || {};
  const fields = [
    field(t('Freigabe', 'Approval'), s.perm ? t(`wartet seit ${rel(s.perm.since)}`, `waiting since ${rel(s.perm.since)}`) : t('keine offen', 'none open')),
    field('CI', s.ci ? `${s.ci.ok ? t('✓ grün', '✓ green') : t('✗ rot', '✗ red')}${s.ci.sha ? ` · ${sha7(s.ci.sha)}` : ''}` : t('noch kein Lauf', 'no run yet')),
    field(t('Heute', 'Today'), `${t(`${td.done || 0} erledigt`, `${td.done || 0} done`)}${cfg.privacy.costs && td.cost ? ` · ${td.cost}` : ''}`),
    field(t('Als Nächstes', 'Up next'), (s.queue || []).slice(0, 2).map((q) => cut(label(cfg, q.id, q.title), 150)).join('\n') || t('nichts eingeplant', 'nothing planned'), false),
  ];
  const recent = (s.recent || []).slice(0, 3);
  if (recent.length) fields.push(field(t('Zuletzt', 'Recent'), recent.map((r) => `${hhmm(r.at)} ${cut(r.text, 150)}`).join('\n'), false));
  const p = s.progress;
  return {
    embeds: [fit({
      author: { name: t(`${name} · Stand`, `${name} · Status`) },
      color: colorOf(s.name),
      description: trimTo(lines.join('\n'), 4000),
      fields,
      footer: { text: p && p.total ? `${bar(p.done, p.total)} ${t(`${p.done} von ${p.total} erledigt`, `${p.done} of ${p.total} done`)}` : 'works' },
      timestamp: now.toISOString(),
    })],
  };
}

// ---------- Dashboard nach D3 (W-0044) ----------

// Ampel und Satz zu einem Projekt nach P2 (W-0050): wartet auf dich (Freigabe mit Werkzeug oder fertig), arbeitet,
// ruhig; am Ende die Aufgabe (bei einer Freigabe die der Freigabe).
export function stateOf(s, cfg, t) {
  const a = s.active;
  const id = (s.perm && s.perm.task) || (a && a.id) || '';
  const on = id ? ` · ${id}` : '';
  if (s.perm) { const tool = s.perm.tool ? ` · ${cut(s.perm.tool, 40)}` : ''; return ['🟠', t(`wartet auf deine Freigabe${tool}${on}`, `waits for your approval${tool}${on}`)]; }
  if (s.busy) return ['🟢', t(`arbeitet${on}`, `working${on}`)];
  if (s.idleSince) return ['🟠', t(`ist fertig und wartet auf dich${on}`, `is done and waits for you${on}`)];
  return ['⚪', a ? t(`in Arbeit${on}`, `in progress${on}`) : t('keine Aufgabe in Arbeit', 'no task in progress')];
}

export function projectLineOf(s, ci, cfg, t) {
  const [dot, text] = stateOf(s, cfg, t);
  return `${dot} **${cut(s.name, 80)}** ${text}${ci && !ci.ok ? ' · 🔴 CI' : ''}`;
}

// Zusammenfassung oben im Panel (P2): wartet, arbeitet, heute erledigt, Kosten des Tages über alle Projekte nur mit
// privacy.costs (je Währung summiert).
function summaryLine(list, cfg, t) {
  const wait = list.filter((p) => p.snap.perm || (!p.snap.busy && p.snap.idleSince)).length;
  const work = list.filter((p) => p.snap.busy && !p.snap.perm).length;
  const done = list.reduce((s, p) => s + ((p.snap.today && p.snap.today.done) || 0), 0);
  const sums = {};
  for (const p of list) { const d = p.snap.today || {}; if (d.value > 0) sums[d.currency || 'USD'] = (sums[d.currency || 'USD'] || 0) + d.value; }
  const cost = cfg.privacy.costs ? Object.entries(sums).map(([c, v]) => fmtCost(v, c, language(null))).join(' + ') : '';
  return [wait ? t(`${wait} ${wait === 1 ? 'wartet' : 'warten'} auf dich`, `${wait} waiting for you`) : '', work ? t(`${work} ${work === 1 ? 'arbeitet' : 'arbeiten'}`, `${work} working`) : '', t(`heute ${done} erledigt`, `${done} done today`), cost].filter(Boolean).join(' · ');
}

const WEEKDAY = [['SO', 'SUN'], ['MO', 'MON'], ['DI', 'TUE'], ['MI', 'WED'], ['DO', 'THU'], ['FR', 'FRI'], ['SA', 'SAT']];

// Daten für das Bild nach P2 (W-0050): Fortschritt je Projekt mit Ampel und Aufgabe, die letzten 24 Stunden je Projekt
// als Spur aus dem Verlauf (ein Punkt je Nachricht in der Farbe ihrer Art), erledigt je Tag über alle Projekte mit
// heute hervorgehoben. Die Spuren enden an einer 5-Minuten-Grenze: So ändert sich das Bild nicht bei jedem Durchgang.
// Überschriften in der Sprache t.
export function dashImageData(list, t = langOf(), history = [], now = Date.now()) {
  const days = (list[0] && list[0].snap.doneDays) || [];
  const to = Math.floor(now / 300000) * 300000;
  const from = to - DAY_MS;
  const dot = (s) => (s.perm || (!s.busy && s.idleSince) ? KIND.wait[0] : s.busy ? KIND.result[0] : 0x80848e);
  return {
    labels: {
      progress: t('FORTSCHRITT', 'PROGRESS'), open: t('OFFEN', 'OPEN'), wip: t('IN ARBEIT', 'IN PROGRESS'), done: t('ERLEDIGT', 'DONE'), more: t('+{n} WEITERE', '+{n} MORE'),
      chart: t('ERLEDIGT · LETZTE 7 TAGE', 'DONE · LAST 7 DAYS'), total: t('{n} GESAMT', '{n} TOTAL'),
      track: t('LETZTE 24 STUNDEN', 'LAST 24 HOURS'), result: t('ERGEBNIS', 'RESULT'), waited: t('WARTETE', 'WAITED'), red: t('CI ROT', 'CI RED'), ship: 'SHIP',
    },
    projects: list.map((p) => {
      const g = p.snap.progress || {};
      const done = g.done || 0; const wip = g.wip || 0;
      return { name: p.snap.name, done, wip, open: Math.max(0, (g.total || 0) - done - wip), dot: dot(p.snap), task: (p.snap.perm && p.snap.perm.task) || (p.snap.active && p.snap.active.id) || '' };
    }),
    tracks: {
      labels: [...[0, 0.25, 0.5, 0.75].map((f) => [f, hhmm(from + f * DAY_MS)]), [1, t('JETZT', 'NOW')]],
      rows: list.map((p) => history.filter((x) => x.rid === p.rid && msOf(x.at, 0) > from).map((x) => [Math.min(1, (msOf(x.at, 0) - from) / DAY_MS), KIND[kindOf(x.ev)][0]])),
    },
    days: days.map(([d], i) => {
      const today = i === days.length - 1;
      return { label: today ? t('HEUTE', 'TODAY') : t(...WEEKDAY[new Date(`${d}T12:00:00`).getDay()]), count: list.reduce((s, p) => s + (((p.snap.doneDays || [])[i] || [])[1] || 0), 0), today };
    }),
  };
}

const button = (style, lbl, custom_id) => ({ type: 2, style, label: lbl, custom_id });

// list: [{ rid, snap }]. interactive: Auswahlmenü und Knöpfe nur, wenn Klicks ankommen. lang: sonst die globale Sprache.
export function renderDashboard(list, cfg, { ci = {}, interactive = false, now = new Date(), lang = '' } = {}) {
  const t = langOf(lang);
  const next = list.flatMap((p) => (p.snap.queue || []).slice(0, 1).map((q) => `${cut(label(cfg, q.id, q.title), 100)} · ${cut(p.snap.name, 40)}`)).slice(0, 3);
  const options = list.slice(0, 25).map((p) => ({ label: cut(p.snap.name, 100), value: p.rid, description: cut(stateOf(p.snap, cfg, t)[1], 100) }));
  const lines = list.map((p) => projectLineOf(p.snap, ci[p.rid], cfg, t)).join('\n') || t('Noch kein Projekt.', 'No project yet.');
  return {
    embeds: [fit({
      title: t(`works · ${list.length} ${list.length === 1 ? 'Projekt' : 'Projekte'}`, `works · ${list.length} ${list.length === 1 ? 'project' : 'projects'}`),
      color: COLOR.status,
      description: trimTo(`**${summaryLine(list, cfg, t)}**\n${lines}`, 4000),
      fields: [field(t('Als Nächstes', 'Up next'), next.join('\n') || t('nichts eingeplant', 'nothing planned'), false)],
      image: { url: 'attachment://works.png' },
      footer: { text: `${t('Bild höchstens alle 5 Minuten neu', 'Image redrawn at most every 5 minutes')}${interactive ? t(' · Details nur für dich über das Menü', ' · Details only for you via the menu') : ''}` },
      timestamp: now.toISOString(),
    })],
    components: interactive ? [
      ...(options.length ? [{ type: 1, components: [{ type: 3, custom_id: 'w:proj::', placeholder: t('Projekt wählen · Details nur für dich', 'Pick a project · details only for you'), options }] }] : []),
      { type: 1, components: [button(2, t('Warteschlange', 'Queue'), 'w:queue::'), button(1, t('Anweisung an Claude', 'Instruction for Claude'), 'w:ins::'), button(2, t('Neue Aufgabe', 'New task'), 'w:new::'), button(2, t('Verlauf', 'History'), 'w:hist::'), button(2, t('Hilfe', 'Help'), 'w:help::')] },
    ] : [],
  };
}

const SHIP_STEP = {
  merge: (x, t) => t('in main gemergt', 'merged into main'),
  push: (x, t) => `${t('gepusht', 'pushed')}${x.sha ? ` · ${sha7(x.sha)}` : ''}`,
  ci: (x, t) => (x.ok ? t(`CI grün${x.workflows ? `, ${x.workflows} Workflows` : ''}`, `CI green${x.workflows ? `, ${x.workflows} workflows` : ''}`) : t('CI rot', 'CI red')),
  update: (x, t) => t('Plugin aktualisiert, Board neu gestartet', 'Plugin updated, board restarted'),
};

// Nachricht zu einem Ereignis. state: open (neu), resolved (Freigabe oder Warten erledigt),
// accepted oder returned (Review). Erwähnung nur bei offenen Ereignissen mit @ und außerhalb der Ruhezeit.
// interactive: Knöpfe mit Aktion (W-0037) nur, wenn Klicks ankommen (Gateway oder gemeinsamer Bot); rid ist das Projekt.
// lang: Sprache der Nachricht, sonst die globale.
export function renderEvent(ev, cfg, { owner = '', now = new Date(), rid = '', interactive = false, lang = '' } = {}) {
  const t = langOf(lang);
  const p = cut(ev.project || '', 100);
  const who = ev.id ? cut(label(cfg, ev.id, ev.title), 200) : '–';
  const open = !ev.state || ev.state === 'open';
  const acts = interactive && rid;
  let e = { color: COLOR.done };
  let text = '';
  let buttons = [];
  let actions = [];
  switch (ev.type) {
    case 'perm': {
      const tool = ev.tool ? ` · ${cut(ev.tool, 60)}` : '';
      if (!open) { e = { color: COLOR.gone, title: t('✓ Freigabe beantwortet', '✓ Approval answered'), description: t(`Hat ${minutes(ev.since, ev.until, t)} gewartet${tool}`, `Waited ${minutes(ev.since, ev.until, t)}${tool}`) }; break; }
      const which = cut(ev.tool || t('Werkzeug', 'tool'), 40);
      text = t(`${p} wartet auf deine Freigabe (${which})`, `${p} is waiting for your approval (${which})`);
      e = { color: COLOR.need, title: t('Wartet auf deine Freigabe', 'Waiting for your approval'), fields: [field(t('Aufgabe', 'Task'), who), field(t('Werkzeug', 'Tool'), cfg.privacy.commands && ev.what ? cut(`${ev.tool}: ${ev.what}`, 1000) : `${cut(ev.tool, 60) || '–'}${ev.what ? t(', Befehl ausgeblendet', ', command hidden') : ''}`), field(t('Wartet seit', 'Waiting since'), rel(ev.since))], footer: { text: t('Freigeben in Claude Code · die Nachricht wird grau, sobald erledigt', 'Approve in Claude Code · the message turns grey once done') } };
      break;
    }
    case 'idle':
      if (!open) { e = { color: COLOR.gone, title: t('↻ Weiter gearbeitet', '↻ Work resumed'), description: t(`Nach ${minutes(ev.since, ev.until, t)}`, `After ${minutes(ev.since, ev.until, t)}`) }; break; }
      text = t(`${p}: Claude ist fertig und wartet auf dich`, `${p}: Claude is done and waiting for you`);
      e = { color: COLOR.need, title: t('Claude ist fertig und wartet auf dich', 'Claude is done and waiting for you'), fields: [field(t('Aufgabe', 'Task'), who), field(t('Fertig seit', 'Done since'), rel(ev.since))] };
      if (acts) actions = act(1, t('Anweisung an Claude', 'Instruction for Claude'), cid('ins', rid, ev.id));
      break;
    case 'question':
      if (!open) { e = { color: COLOR.gone, title: t(`✓ Frage zu ${ev.id} beantwortet`, `✓ Question about ${ev.id} answered`) }; break; }
      text = t(`${p}: Frage zu ${ev.id}`, `${p}: question about ${ev.id}`);
      e = { color: COLOR.need, title: t(`Frage zu ${ev.id}`, `Question about ${ev.id}`), description: cfg.privacy.titles ? cutBlock(ev.text, 1500) : t('Frage im Board ansehen', 'See the question in the board') };
      break;
    case 'review':
      if (ev.state === 'accepted') { e = { color: COLOR.done, title: t(`✓ ${ev.id} angenommen`, `✓ ${ev.id} accepted`), description: `${cfg.privacy.titles && ev.title ? `${cut(ev.title, 200)} · ` : ''}${hhmm(ev.at || now.toISOString())}` }; break; }
      if (ev.state === 'returned') { e = { color: COLOR.gone, title: t(`↩ ${ev.id} zurückgegeben`, `↩ ${ev.id} returned`), description: cfg.privacy.titles ? cut(ev.title, 200) : '' }; break; }
      // Ohne Abnahme erledigt (W-0050): Aufgabe im Review gelöscht oder von einem neueren Review abgelöst.
      if (!open) { e = { color: COLOR.gone, title: t(`${ev.id} nicht mehr im Review`, `${ev.id} no longer in review`), description: cfg.privacy.titles ? cut(ev.title, 200) : '' }; break; }
      e = { color: COLOR.done, title: t(`${ev.id} im Review`, `${ev.id} in review`), fields: [...(cfg.privacy.titles && ev.title ? [field(t('Aufgabe', 'Task'), cut(ev.title, 200))] : []), field(t('Kriterien', 'Criteria'), ev.crit && ev.crit[1] ? t(`${ev.crit[0]} von ${ev.crit[1]}`, `${ev.crit[0]} of ${ev.crit[1]}`) : t('keine', 'none')), ...(cfg.privacy.costs && ev.cost ? [field(t('Kosten', 'Costs'), ev.cost)] : [])], footer: { text: acts ? t('Abnehmen hier, im Board oder mit works done', 'Accept here, in the board or with works done') : t('Abnehmen im Board oder mit works done', 'Accept in the board or with works done') } };
      if (acts) actions = [...act(3, t('Annehmen', 'Accept'), cid('acc', rid, ev.id)), ...act(2, t('Zurück an Claude', 'Back to Claude'), cid('ret', rid, ev.id))];
      break;
    case 'start':
      e = { color: COLOR.run, title: t(`${ev.id} gestartet`, `${ev.id} started`), description: cfg.privacy.titles ? cut(ev.title, 200) : '' };
      break;
    case 'returned':
      e = { color: COLOR.need, title: t(`${ev.id} zurückgegeben`, `${ev.id} returned`), description: cfg.privacy.titles ? cut(ev.title, 200) : '' };
      break;
    case 'done':
      e = { color: COLOR.done, title: t(`✓ ${ev.id} erledigt`, `✓ ${ev.id} done`), description: cfg.privacy.titles ? cut(ev.title, 200) : '' };
      break;
    case 'p1':
      e = { color: COLOR.red, title: t(`Neue P1: ${ev.id}`, `New P1: ${ev.id}`), description: cfg.privacy.titles ? cut(ev.title, 200) : '' };
      break;
    case 'queue_empty':
      e = { color: COLOR.run, title: t('Warteschlange leer', 'Queue empty'), description: t('Claude hat alle eingereihten Aufgaben abgearbeitet.', 'Claude has worked through all queued tasks.') };
      break;
    case 'ship': {
      const lines = (ev.steps || []).map((x) => `${x.ok === false ? '✗' : '✓'} ${(SHIP_STEP[x.step] || (() => x.step))(x, t)}`);
      if (ev.status === 'run') lines.push(t('◌ läuft …', '◌ running …'));
      if (ev.status === 'fail') lines.push(`${t('✗ angehalten', '✗ stopped')}${ev.note ? `: ${cut(ev.note, 300)}` : ''}`);
      e = { color: ev.status === 'done' ? COLOR.done : ev.status === 'fail' ? COLOR.red : COLOR.run, title: ev.status === 'done' ? t(`${ev.id} ausgeliefert`, `${ev.id} shipped`) : ev.status === 'fail' ? t(`${ev.id}: Auslieferung angehalten`, `${ev.id}: shipping stopped`) : t(`${ev.id} wird ausgeliefert`, `${ev.id} is being shipped`), description: lines.join('\n') || t('◌ beginnt …', '◌ starting …'), footer: { text: `works ship${ev.ended ? ` · ${minutes(ev.started, ev.ended, t)}` : ''}` } };
      if (ev.commitUrl) buttons = [[t('Commit auf GitHub', 'Commit on GitHub'), ev.commitUrl]];
      break;
    }
    case 'ci_red':
    case 'ci_green':
      if (ev.type === 'ci_green') { e = { color: COLOR.done, title: t(`CI grün für ${sha7(ev.sha)}`, `CI green for ${sha7(ev.sha)}`), description: ev.workflows ? t(`${ev.workflows} Workflows grün`, `${ev.workflows} workflows green`) : t('Wieder grün', 'Green again') }; }
      else {
        e = { color: COLOR.red, title: t(`CI rot für ${sha7(ev.sha)}`, `CI red for ${sha7(ev.sha)}`), fields: [...(ev.total ? [field(t('Rot', 'Red'), t(`${ev.failed || '?'} von ${ev.total} Jobs`, `${ev.failed || '?'} of ${ev.total} jobs`))] : []), ...(ev.job ? [field(t('Erster Fehler', 'First error'), cut(ev.job, 200))] : []), ...(ev.bug ? [field('Bug', t(`${cut(ev.bug, 40)} angelegt`, `${cut(ev.bug, 40)} created`))] : [])] };
        if (cfg.privacy.ci_error && ev.error) e.footer = { text: cut(ev.error, 300) };
        if (acts && ev.bug) actions = act(2, t('Bug ansehen', 'View bug'), cid('bug', rid, ev.bug));
      }
      if (/^https:\/\//.test(ev.url || '')) buttons = [[t('Lauf auf GitHub', 'Run on GitHub'), ev.url]];
      break;
    case 'report_week':
    case 'report_day':
    {
      // Listen wie im Wochenbericht: Aufgaben als {id, title} (Titel nur mit privacy.titles), sonst Text.
      const item = (x) => cut(typeof x === 'object' && x ? label(cfg, x.id, x.title) : (cfg.privacy.titles ? x : (String(x).match(/^[A-Z]+-\d+/) || [''])[0]), 120);
      const lists = Object.entries(ev.lists && typeof ev.lists === 'object' ? ev.lists : {}).slice(0, 3).filter(([, items]) => Array.isArray(items))
        .map(([n, items]) => field(`${n} (${items.length})`, items.map(item).filter(Boolean).map((x) => `• ${x}`).join('\n') || t('Keine.', 'None.'), false));
      e = { color: COLOR.status, title: cut(ev.title || t('Bericht', 'Report'), 256), description: cutBlock(ev.summary, 3000), fields: lists.length ? lists : ev.done !== undefined ? [field(t('Erledigt', 'Done'), String(ev.done))] : [] };
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

// Zuletzt im Statuspost: in der globalen Sprache beim Merken (W-0041).
const RECENT = {
  perm: (e, t) => t('Freigabe angefragt', 'Approval requested'), idle: (e, t) => t('Claude fertig', 'Claude done'), question: (e, t) => t(`Frage zu ${e.id}`, `Question about ${e.id}`), review: (e, t) => t(`${e.id} im Review`, `${e.id} in review`),
  returned: (e, t) => t(`${e.id} zurückgegeben`, `${e.id} returned`), done: (e, t) => t(`${e.id} erledigt`, `${e.id} done`), p1: (e, t) => t(`Neue P1 ${e.id}`, `New P1 ${e.id}`), queue_empty: (e, t) => t('Warteschlange leer', 'Queue empty'),
  ci_red: (e, t) => t(`CI rot ${sha7(e.sha)}`, `CI red ${sha7(e.sha)}`), ci_green: (e, t) => t(`CI grün ${sha7(e.sha)}`, `CI green ${sha7(e.sha)}`), report_week: (e) => cut(e.title, 80), report_day: (e) => cut(e.title, 80),
  start: (e, t) => t(`${e.id} gestartet`, `${e.id} started`),
};

// ---------- Karte je Aufgabe (W-0050, Entwurf I3) ----------

// Ereignisse mit Aufgabe gehen in die Karte der Aufgabe; WAITS warten auf dich, solange sie offen sind.
const CARD = new Set(['start', 'perm', 'idle', 'question', 'review', 'returned', 'done', 'p1', 'ship']);
const WAITS = new Set(['perm', 'idle', 'question', 'review']);
const isOpen = (ev) => !ev.state || ev.state === 'open';
const waiting = (ev) => WAITS.has(ev.type) && isOpen(ev);
// Art einer Nachricht für Kartenbild, Spuren im Panel und Verlauf: wartet auf dich, CI rot, Arbeit und Auslieferung,
// Ergebnis. Je Art Farbe und Symbol.
const KIND = { wait: [0xe8a33d, '⏳'], red: [0xf23f43, '✕'], ship: [0x5865f2, '⬆'], result: [0x23a55a, '✓'] };
const kindOf = (ev) => (['perm', 'idle', 'question', 'p1'].includes(ev.type) ? 'wait'
  : ev.type === 'ci_red' || (ev.type === 'ship' && ev.status === 'fail') ? 'red'
    : ['ship', 'start', 'returned', 'queue_empty'].includes(ev.type) ? 'ship' : 'result');
const msOf = (iso, d) => { const v = Date.parse(iso); return Number.isNaN(v) ? d : v; };
const entriesOf = (card) => Object.values(card.entries || {}).sort((a, b) => String(a.t0).localeCompare(String(b.t0)));
// Zeitspanne der Aufgabe: erster Eintrag bis zum letzten Ereignis (auch Antwort, Annahme, Ende der Auslieferung).
const spanOf = (list, now) => ({
  start: Math.min(now, ...list.map((e) => msOf(e.t0, now))),
  last: Math.max(0, ...list.map((e) => Math.max(msOf(e.t0, 0), msOf(e.until, 0), msOf(e.ended, 0)))),
});
// Dauer kurz wie im Entwurf: 41 Min., 2 Std. 5 Min., 3 Tage.
const dur = (ms, t) => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return t('unter 1 Min.', 'under 1 min');
  if (m < 60) return t(`${m} Min.`, `${m} min`);
  if (m < 2880) return t(`${Math.floor(m / 60)} Std.${m % 60 ? ` ${m % 60} Min.` : ''}`, `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);
  return t(`${Math.round(m / 1440)} Tage`, `${Math.round(m / 1440)} days`);
};

// Verlauf (W-0050): Zeiträume mit Kurz- und Langnamen (de, en), Einträge je Seite, Symbol je Art, kurze Kennung für
// Auswahlmenüs (Werte bis 100 Zeichen), Zusammenfassung aus dem Titel der Einzelnachricht.
const HIST_SPAN = { d: [DAY_MS, ['24 Std.', '24 h'], ['letzte 24 Stunden', 'last 24 hours']], t: [3 * DAY_MS, ['3 Tage', '3 days'], ['letzte 3 Tage', 'last 3 days']], w: [7 * DAY_MS, ['7 Tage', '7 days'], ['letzte 7 Tage', 'last 7 days']] };
const HIST_PAGE = 10;
const HIST_SYM = { start: '▶', perm: '⏳', idle: '⏳', question: '❓', review: '👀', returned: '↩', done: '✓', p1: '❗', ship: '⬆', ci_red: '✕', ci_green: '✓', queue_empty: '∅', report_day: '📋', report_week: '📋' };
const histId = (k) => crypto.createHash('sha1').update(String(k)).digest('hex').slice(0, 12);
function summaryOf(ev, cfg, lang) {
  const s = renderEvent(ev, cfg, { lang }).embeds[0].title || '';
  return ev.id && !s.includes(ev.id) ? `${s} · ${label(cfg, ev.id, ev.title)}` : s;
}

// Zustand der Karte: der jüngste offene wartende Eintrag, sonst der zuletzt geänderte (u). Eine erledigte oder
// verworfene Aufgabe ohne offenen Eintrag ist erledigt, außer während works ship. task: Stand der Aufgabe aus dem
// Snapshot (status, crit, steps). tone: need, review, run, red, done.
function cardState(card, task, cfg, t) {
  const list = Object.values(card.entries || {});
  const newest = (l) => (l.length ? l.reduce((a, b) => ((b.u || 0) >= (a.u || 0) ? b : a)) : null);
  const last = newest(list);
  let w = newest(list.filter(waiting));
  // Eine Auslieferung, die nach dem Review begonnen hat, zeigt die Karte statt des offenen Reviews.
  if (w && w.type === 'review' && last && last.type === 'ship') w = null;
  const cur = w || last || {};
  const crit = task.crit && task.crit[1] ? task.crit : cur.crit;
  const since = (iso) => (rel(iso) ? t(` · seit ${rel(iso)}`, ` · since ${rel(iso)}`) : '');
  const started = newest(list.filter((e) => e.type === 'start'));
  let s = null;
  if (w && w.type === 'perm') {
    const tool = `${cut(w.tool || t('Werkzeug', 'tool'), 60)}${cfg.privacy.commands && w.what ? `: ${cut(w.what, 200)}` : ''}`;
    s = ['need', t(`Wartet auf deine Freigabe · ${tool}${since(w.since)}`, `Waiting for your approval · ${tool}${since(w.since)}`)];
  } else if (w && w.type === 'idle') s = ['need', t(`Claude ist fertig und wartet auf dich${since(w.since)}`, `Claude is done and waiting for you${since(w.since)}`)];
  else if (w && w.type === 'question') s = ['need', cfg.privacy.titles && w.text ? t(`Frage an dich: ${cut(w.text, 300)}`, `Question for you: ${cut(w.text, 300)}`) : t('Frage an dich, im Board ansehen', 'Question for you, see the board')];
  else if (w) s = ['review', crit && crit[1] ? (crit[0] >= crit[1] ? t('Im Review · alle Kriterien erfüllt', 'In review · all criteria met') : t(`Im Review · ${crit[0]} von ${crit[1]} Kriterien`, `In review · ${crit[0]} of ${crit[1]} criteria`)) : t('Im Review', 'In review')];
  else if (cur.type === 'ship') {
    const push = (cur.steps || []).find((x) => x.step === 'push');
    const ci = (cur.steps || []).find((x) => x.step === 'ci');
    if (cur.status === 'done') s = ['done', `${t('Erledigt · ausgeliefert', 'Done · shipped')}${push && push.sha ? ` ${sha7(push.sha)}` : ''}${ci ? (ci.ok ? t(' · CI grün', ' · CI green') : t(' · CI rot', ' · CI red')) : ''}`];
    else if (cur.status === 'fail') s = ['red', `${t('Auslieferung angehalten', 'Shipping stopped')}${cur.note ? `: ${cut(cur.note, 200)}` : ''}`];
    else {
      const steps = (cur.steps || []).map((x) => `${x.ok === false ? '✗' : '✓'} ${(SHIP_STEP[x.step] || (() => x.step))(x, t)}`).join(', ');
      s = ['run', `${t('Wird ausgeliefert', 'Being shipped')}${steps ? ` · ${steps}` : ''}`];
    }
  } else if (cur.type === 'review' && cur.state === 'accepted') s = ['done', t('Erledigt · angenommen', 'Done · accepted')];
  else if (cur.type === 'done') s = ['done', t('Erledigt', 'Done')];
  else if (cur.type === 'returned' || (cur.type === 'review' && cur.state === 'returned')) s = ['run', t('Zurückgegeben, wieder in Arbeit', 'Returned, back in progress')];
  else if (cur.type === 'p1' && !['in-arbeit', 'review', 'erledigt', 'verworfen'].includes(task.status)) s = ['red', t('Neue P1', 'New P1')];
  else if (cur.type === 'start') s = ['run', t(`In Arbeit${since(cur.t0)}`, `In progress${since(cur.t0)}`)];
  if (!s || (!w && cur.type !== 'ship' && s[0] !== 'done' && ['erledigt', 'verworfen'].includes(task.status))) {
    s = task.status === 'erledigt' ? ['done', t('Erledigt', 'Done')] : task.status === 'verworfen' ? ['done', t('Verworfen', 'Discarded')]
      : task.status === 'review' ? ['review', t('Im Review', 'In review')] : ['backlog', 'geplant'].includes(task.status) ? ['run', t('Offen', 'Open')]
        : ['run', t(`In Arbeit${since(started && started.t0)}`, `In progress${since(started && started.t0)}`)];
  }
  return { tone: s[0], line: s[1], w };
}

const TONE = { need: ['🟠', COLOR.need], review: ['🟢', COLOR.done], run: ['🔵', COLOR.run], red: ['🔴', COLOR.red], done: ['', COLOR.gone] };

// Karte einer Aufgabe: Projekt, Aufgabe (✓ wenn erledigt), Zustandszeile, Bild works.png nach I3, Fußzeile.
// task: { title, status, crit, steps, cost } aus dem Snapshot; waits: die Karte bleibt stehen (Aufgabe offen oder ein
// Eintrag wartet), sonst nennt die Fußzeile die Frist. Erwähnung wie bei renderEvent: nur der jüngste offene
// wartende Eintrag mit @, außerhalb der Ruhezeit; sie klingelt nur, wenn die Karte neu geschickt wird.
export function renderCard(card, cfg, { owner = '', now = new Date(), interactive = false, lang = '', task = {}, waits = true } = {}) {
  const t = langOf(lang);
  const { tone, line, w } = cardState(card, task, cfg, t);
  const list = entriesOf(card);
  const p = cut(card.project || '', 100);
  const acts = interactive && card.rid;
  const cost = cfg.privacy.costs && task.cost ? task.cost : '';
  let actions = [];
  if (acts && w && w.type === 'review') actions = [...act(3, t('Annehmen', 'Accept'), cid('acc', card.rid, card.id)), ...act(2, t('Zurück an Claude', 'Back to Claude'), cid('ret', card.rid, card.id))];
  else if (acts && w && w.type === 'idle') actions = act(1, t('Anweisung an Claude', 'Instruction for Claude'), cid('ins', card.rid, card.id));
  const ship = [...list].reverse().find((e) => e.type === 'ship');
  const links = ship && /^https:\/\//.test(ship.commitUrl || '') ? [[t('Commit auf GitHub', 'Commit on GitHub'), ship.commitUrl]] : [];
  const keep = Number(cfg.cleanup && cfg.cleanup.seconds) || 0;
  const { start, last } = spanOf(list, now.getTime());
  const foot = tone === 'done' ? [dur(last - start, t), cost, !waits && keep ? t(`verschwindet in ${dur(keep * 1000, t)}`, `disappears in ${dur(keep * 1000, t)}`) : '']
    : w && w.type === 'perm' ? [t('Freigeben in Claude Code', 'Approve in Claude Code')]
      : w && w.type === 'question' ? [t('Antworten in Claude Code oder im Board', 'Answer in Claude Code or the board')]
        : tone === 'review' ? [cost, acts ? t('Abnehmen hier, im Board oder mit works done', 'Accept here, in the board or with works done') : t('Abnehmen im Board oder mit works done', 'Accept in the board or with works done')]
          : [cost];
  const which = w && w.type === 'perm' ? cut(w.tool || t('Werkzeug', 'tool'), 40) : '';
  const text = !w ? '' : w.type === 'perm' ? t(`${p} wartet auf deine Freigabe (${which})`, `${p} is waiting for your approval (${which})`)
    : w.type === 'idle' ? t(`${p}: Claude ist fertig und wartet auf dich`, `${p}: Claude is done and waiting for you`)
      : w.type === 'question' ? t(`${p}: Frage zu ${card.id}`, `${p}: question about ${card.id}`) : '';
  const at = !!text && !!owner && !!(cfg.events[w.type] && cfg.events[w.type].at) && !isQuiet(cfg, now);
  const [dot, color] = TONE[tone];
  const e = { color, title: cut(`${tone === 'done' ? '✓ ' : ''}${label(cfg, card.id, card.title || task.title)}`, 256), description: trimTo(`${dot ? `${dot} ` : ''}**${line}**`, 4000), image: { url: 'attachment://works.png' } };
  if (p) e.author = { name: p };
  const ft = foot.filter(Boolean).join(' · ');
  if (ft) e.footer = { text: trimTo(ft, 2048) };
  return {
    content: at ? `<@${owner}> ${trimTo(text, 1800)}` : '',
    embeds: [fit(e)],
    components: row(links, actions),
    allowed_mentions: at ? { parse: [], users: [owner] } : { parse: [] },
    flags: at ? 0 : SILENT,
  };
}

// Daten für das Kartenbild (discord-image.mjs, cardPng): Ereignisse auf der Achse vom ersten Eintrag bis jetzt, bei
// einer erledigten Karte bis zum letzten Ereignis; offene Wartezeiten laufen bis zum Ende der Achse. Rechts Minuten,
// Schritte (Umsetzungsplan) und Kriterien, Texte in der globalen Sprache.
export function cardImageData(card, task = {}, now = Date.now(), t = langOf(), cfg = normalizeConfig({})) {
  const list = entriesOf(card);
  const done = cardState(card, task, cfg, t).tone === 'done';
  const { start, last } = spanOf(list, now);
  const end = done ? Math.max(start, last) : Math.max(now, last);
  const events = list.map((e) => ({ at: msOf(e.t0, now), until: WAITS.has(e.type) ? (isOpen(e) ? end : msOf(e.until, 0)) : 0, color: KIND[kindOf(e)][0] }));
  const m = Math.max(0, Math.round((end - start) / 60000));
  const big = m < 100 ? `${m} MIN` : m < 2880 ? t(`${Math.floor(m / 60)} STD`, `${Math.floor(m / 60)} H`) : t(`${Math.floor(m / 1440)} TAGE`, `${Math.floor(m / 1440)} DAYS`);
  const pair = (de, en, x) => (x && x[1] ? t(`${de} ${x[0]}/${x[1]}`, `${en} ${x[0]}/${x[1]}`) : '');
  return {
    start, end, events,
    right: [big, pair('SCHRITTE', 'STEPS', task.steps), pair('KRITERIEN', 'CRITERIA', task.crit)].filter(Boolean),
    legend: [['START/SHIP', KIND.ship[0]], [t('WARTET AUF DICH', 'WAITING FOR YOU'), KIND.wait[0]], ['TESTS/REVIEW', KIND.result[0]]],
  };
}

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
  const count = (heading) => (t) => { const c = checkboxes(getSection(t._body, heading) || ''); return [c.done, c.total]; };
  const crit = count('Akzeptanzkriterien');
  // Schritte für das Kartenbild (W-0050): Umsetzungsplan.
  const steps = count('Umsetzungsplan');
  const tasks = {};
  for (const t of live) {
    const q = openQuestions(t);
    tasks[t.id] = { id: t.id, title: t.title, status: t.status, priority: t.priority, q: q.length, lastQ: q.length ? q[q.length - 1].text : '', source: t.source || '', crit: crit(t), steps: steps(t) };
  }
  const st = loadState(root);
  let active = st.active && byId.get(st.active);
  // Woran Claude zuletzt war, auch im Review (W-0050): dorthin gehört „fertig und wartet“ wie die Freigabe.
  const focus = active && OPEN_STATUSES.includes(active.status) ? active : null;
  if (!active || active.status !== 'in-arbeit') active = live.find((t) => t.status === 'in-arbeit');
  const queueIds = queueOf(config).filter((id) => byId.has(id) && OPEN_STATUSES.includes(byId.get(id).status));
  // Als Nächstes: Warteschlange ohne das, was schon läuft; sonst die wichtigsten offenen Aufgaben.
  const waiting = (t) => ['backlog', 'geplant'].includes(t.status);
  const queued = queueIds.map((id) => byId.get(id)).filter(waiting);
  const nextList = queued.length ? queued : sortTasks(live.filter(waiting));
  const counted = all.filter((t) => t.status !== 'verworfen');
  const day = today();
  // Für das Bild im Dashboard (W-0044): erledigt je Tag der letzten sieben Tage, älteste zuerst.
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return iso(d); });
  return {
    config,
    snap: {
      name: path.basename(root),
      tasks,
      active: active ? { id: active.id, title: active.title, crit: crit(active) } : null,
      focus: focus || active ? { id: (focus || active).id, title: (focus || active).title } : null,
      queueIds,
      queue: nextList.slice(0, 2).map((t) => ({ id: t.id, title: t.title })),
      progress: { done: counted.filter((t) => t.status === 'erledigt').length, wip: live.filter((t) => ['in-arbeit', 'review'].includes(t.status)).length, total: counted.length },
      doneDays: days.map((d) => [d, all.filter((t) => t.completed === d).length]),
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
    // Kosten stehen in Kanalnachrichten: Format der globalen Sprache.
    // value und currency: Summe über alle Projekte im Panel (W-0050).
    today: { done: part.doneToday, cost: usage.today.cost > 0 ? fmtCost(usage.today.cost, usage.currency, language(null)) : '', value: usage.today.cost || 0, currency: usage.currency },
    costs: Object.fromEntries(Object.entries(usage.byTask).filter(([, v]) => v.cost > 0).map(([k, v]) => [k, fmtCost(v.cost, usage.currency, language(null))])),
  };
}

function commitUrl(root, sha) {
  if (!root || !sha) return '';
  const r = run('git', ['-C', root, 'remote', 'get-url', 'origin']);
  const m = r.ok && r.stdout.trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}/commit/${sha}` : '';
}

// ---------- Bot ----------

// cards: Karte je Aufgabe (W-0050) unter card:<rid>:<id> mit Einträgen je ursprünglichem Schlüssel; history: Verlauf.
const emptyState = () => ({ projects: {}, msgs: {}, queue: [], open: {}, ships: {}, ci: {}, frozen: {}, sent: {}, dash: {}, cards: {}, history: [] });
const DAY = 86400000;

export class Bot {
  // shared: gemeinsamer Bot über den Dienst. clicks: Klicks und Befehle kommen an (Gateway oder Dienst).
  // interactive: Knöpfe zeigen; dazu muss auch der Schalter commands an sein, gelesen bei jedem Durchgang (W-0046).
  constructor({ rest, log, shared = false, interactive = false }) {
    this.rest = rest; this.log = log; this.shared = shared; this.clicks = interactive; this.interactive = interactive;
    this.commandsFor = '';
    const s = readJson(dfile('state.json'), null);
    this.state = { ...emptyState(), ...(s || {}) };
    this.timers = new Map();
    this.fingers = new Map();
    this.snapAt = new Map();
    this.caches = new Map();
    this.missing = new Map();
    this.snapJson = new Map();
    // Bild je Kanal (nur im Speicher: nach einem Neustart wird es neu gezeichnet und das Dashboard einmal bearbeitet,
    // so fällt auch ein gelöschtes Dashboard auf). setStatus: Status des Bots, nur mit Gateway.
    this.images = new Map();
    // Bild je Karte (W-0050), ebenfalls nur im Speicher: { sig, at, png }.
    this.cardImgs = new Map();
    this.setStatus = null; this.statusText = null; this.statusAt = 0;
    this.retryAt = 0;
    this.dirty = false;
    this.restored = false;
    this.warned = new Set();
  }

  channelFor(rid, cfg) { return channelOf(cfg, rid); }
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
  // Ereignisse mit Aufgabe (W-0050) werden ein Eintrag der Karte card:<rid>:<id>, die als Ganzes rausgeht; ein neuer
  // wartender Eintrag schickt sie neu (resend), damit Discord benachrichtigt. Eine Nachricht, die schon als einzelne
  // verschickt ist oder als einzelne in der Warteschlange steht (vor W-0050), bleibt einzeln.
  upsert(key, ev, rid, cfg) {
    this.remember(key, ev, rid);
    let qk = key;
    let resend = false;
    const single = !!this.state.msgs[key] || this.state.queue.some((q) => q.key === key && !q.card);
    if (rid && ev.id && CARD.has(ev.type) && !single) {
      qk = `card:${rid}:${ev.id}`;
      const c = this.state.cards[qk] || (this.state.cards[qk] = { rid, id: ev.id, entries: {} });
      const prev = c.entries[key];
      resend = !prev && waiting(ev);
      c.entries[key] = { ...ev, t0: (prev && prev.t0) || ev.since || ev.started || ev.at || new Date().toISOString(), u: Date.now() };
      if (ev.title) c.title = ev.title;
      if (ev.project) c.project = ev.project;
      // ponytail: höchstens 40 Einträge je Karte, die ältesten erledigten fallen raus (Achse und Verlauf bleiben lesbar).
      const keys = Object.keys(c.entries);
      for (const k of keys.slice(0, Math.max(0, keys.length - 40))) if (!waiting(c.entries[k])) delete c.entries[k];
    }
    const old = this.state.queue.find((q) => q.key === qk);
    this.state.queue = this.state.queue.filter((q) => q !== old);
    const channel_id = this.channelFor(rid, cfg);
    this.state.queue.push(qk === key ? { key, ev, rid, channel_id } : { key: qk, card: true, resend: resend || !!(old && old.resend), rid, channel_id });
    this.dirty = true;
  }

  // Verlauf (W-0050): die neueste Fassung je Nachricht oder Karteneintrag mit dem Zeitpunkt des Ereignisses, neueste
  // zuerst, höchstens 7 Tage und 300 Einträge; steht in state.json und übersteht so einen Neustart.
  remember(key, ev, rid) {
    const h = this.state.history || [];
    const i = h.findIndex((x) => x.k === key);
    const at = i >= 0 ? h[i].at : ev.since || ev.started || ev.at || new Date().toISOString();
    if (i >= 0) h.splice(i, 1);
    h.push({ k: key, rid, at, ev: { ...ev } });
    const old = Date.now() - 7 * DAY;
    this.state.history = h.filter((x) => msOf(x.at, 0) > old).sort((a, b) => msOf(b.at, 0) - msOf(a.at, 0)).slice(0, 300);
  }

  // Stand der Aufgabe einer Karte aus dem Snapshot des Projekts, leer, wenn es sie (dort) nicht mehr gibt.
  taskOf(c) {
    const pr = this.state.projects[c.rid];
    const x = pr && pr.snap && pr.snap.tasks && pr.snap.tasks[c.id];
    const cost = pr && pr.snap && pr.snap.costs ? pr.snap.costs[c.id] || '' : '';
    return x ? { title: x.title, status: x.status, crit: x.crit, steps: x.steps, cost } : { cost };
  }

  // Die Karte, wie sie gilt: Ein wartender Eintrag zählt nur, solange sein Schlüssel in state.open steht. Sonst
  // hielten eine überholte Frage, eine im Review gelöschte Aufgabe oder ein weggefallenes Projekt sie für immer offen.
  liveCard(c) {
    const open = new Set(Object.values(this.state.open).map((o) => o.key));
    const entries = {};
    for (const [k, e] of Object.entries(c.entries || {})) entries[k] = waiting(e) && !open.has(k) ? { ...e, state: 'resolved' } : e;
    return { ...c, entries };
  }

  // Die Karte bleibt stehen, solange ein Eintrag auf dich wartet oder die Aufgabe offen ist.
  cardWaits(c) { return Object.values(this.liveCard(c).entries).some(waiting) || OPEN_STATUSES.includes(this.taskOf(c).status); }
  // Aktiv: Achse und Minuten laufen, das Bild wird alle 5 Minuten neu gezeichnet.
  cardActive(c) { return Object.values(this.liveCard(c).entries).some(waiting) || ['in-arbeit', 'review'].includes(this.taskOf(c).status); }

  // Offener Schritt unter slot: Ein älterer, der dort noch steht (etwa die erste von zwei Fragen zur selben Aufgabe),
  // gilt als erledigt, statt offen liegen zu bleiben.
  setOpen(slot, r, rid, cfg) {
    const old = this.state.open[slot];
    if (old && old.key !== r.key) this.upsert(old.key, { ...old.ev, state: 'resolved', until: new Date().toISOString() }, old.rid, cfg);
    this.state.open[slot] = { ...r, rid };
  }

  // Körper und Bild einer Karte; das Bild neu bei geänderten Einträgen oder Aufgabe, sonst höchstens alle 5 Minuten.
  cardMessage(key, card, cfg) {
    const c = this.liveCard(card);
    const task = this.taskOf(c);
    const waits = this.cardWaits(c);
    const body = renderCard(c, cfg, { owner: cfg.owner_id, interactive: this.interactive, task, waits });
    const now = Date.now();
    const sha = (x) => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex');
    const sig = sha({ e: c.entries, s: task.steps, c: task.crit, st: task.status, l: language(null) });
    let img = this.cardImgs.get(key);
    if (!img || img.sig !== sig || now - img.at >= CARD_IMAGE_MIN) {
      img = { sig, at: now, png: cardPng(cardImageData(c, task, now, langOf(), cfg)) };
      this.cardImgs.set(key, img);
    }
    return { body, waits, files: [{ name: 'works.png', type: 'image/png', data: img.png }], hash: sha({ body, at: img.at }) };
  }

  // Laufende Karten alle 5 Minuten neu zeichnen (Minuten, Achse bis jetzt), auch ohne neues Ereignis.
  refreshCards() {
    for (const [k, m] of Object.entries(this.state.msgs)) {
      const c = k.startsWith('card:') ? this.state.cards[k] : null;
      if (!c || m.done || !this.cardActive(c)) continue;
      const img = this.cardImgs.get(k);
      if (img && Date.now() - img.at < CARD_IMAGE_MIN) continue;
      if (this.state.queue.some((q) => q.key === k)) continue;
      this.state.queue.push({ key: k, card: true, rid: c.rid, channel_id: m.channel_id });
    }
  }

  event(rid, type, data, cfg, key = `${type}:${rid}:${data.id || ''}:${Date.now()}:${crypto.randomBytes(2).toString('hex')}`) {
    const ev = { type, project: (this.state.projects[rid] && this.state.projects[rid].name) || data.project || '', ...data, state: 'open', at: new Date().toISOString() };
    if (RECENT[type]) this.addRecent(rid, RECENT[type](ev, langOf()));
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
        this.addRecent(rid, d.step === 'done' ? langOf()(`${d.id} ausgeliefert`, `${d.id} shipped`) : langOf()(`${d.id} angehalten`, `${d.id} stopped`));
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
      if (d.ok && !(before && !before.ok)) { this.addRecent(rid, langOf()(`CI grün ${sha7(d.sha)}`, `CI green ${sha7(d.sha)}`)); return; }
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
    // Frage: offen, solange die Aufgabe noch mindestens so viele offene Fragen hat wie beim Stellen.
    if (type === 'question') { const t = snap.tasks && snap.tasks[data.id]; return !!t && t.q > 0 && t.q >= (data.q || 1); }
    return false;
  }

  permData(p, snap) { const t = snap.tasks[p.task]; return { id: p.task, title: t ? t.title : '', tool: p.tool, what: p.what, since: p.since, slot: p.slot }; }

  // Aufgaben: Review, angenommen, zurückgegeben, erledigt, Frage, P1, Warteschlange.
  diffTasks(rid, prev, next, cfg) {
    for (const t of Object.values(next.tasks)) {
      const o = prev.tasks[t.id];
      const base = { id: t.id, title: t.title };
      if (!o) {
        if (t.priority === 'P1' && !['board', 'discord'].includes(t.source) && OPEN_STATUSES.includes(t.status) && this.once(rid, `p1:${t.id}`)) this.event(rid, 'p1', base, cfg);
        // Neu und schon im Review (works new --status review, oder angelegt und gesetzt zwischen zwei Blicken des Bots).
        // Erledigte oder Fragen neuer Aufgaben nicht melden: Ein Import brächte sonst Dutzende Nachrichten.
        if (t.status === 'review' && this.once(rid, `review:${t.id}`)) {
          const r = this.event(rid, 'review', { ...base, crit: t.crit, cost: next.costs[t.id] || '' }, cfg);
          if (r) this.setOpen(`review:${rid}:${t.id}`, r, rid, cfg);
        }
        continue;
      }
      if (o.status !== 'review' && t.status === 'review') {
        if (this.once(rid, `review:${t.id}`)) {
          const r = this.event(rid, 'review', { ...base, crit: t.crit, cost: next.costs[t.id] || '' }, cfg);
          if (r) this.setOpen(`review:${rid}:${t.id}`, r, rid, cfg);
        }
      } else if (o.status === 'review' && t.status !== 'review') {
        const slot = `review:${rid}:${t.id}`;
        const op = this.state.open[slot];
        const accepted = t.status === 'erledigt';
        const now = new Date().toISOString();
        if (op) { this.upsert(op.key, { ...op.ev, state: accepted ? 'accepted' : 'returned', at: now, until: now }, rid, cfg); delete this.state.open[slot]; }
        delete (this.state.sent[rid] || {})[`review:${t.id}`];
        if (accepted) { this.once(rid, `done:${t.id}`); this.addRecent(rid, langOf()(`${t.id} angenommen`, `${t.id} accepted`)); }
        else if (OPEN_STATUSES.includes(t.status)) this.event(rid, 'returned', base, cfg);
      } else if (o.status !== 'erledigt' && t.status === 'erledigt' && !this.shipping(rid, t.id) && this.once(rid, `done:${t.id}`)) this.event(rid, 'done', base, cfg);
      // W-0050: Wechsel auf in Arbeit beginnt die Karte; zurück aus dem Review meldet schon returned.
      if (t.status === 'in-arbeit' && !['in-arbeit', 'review'].includes(o.status)) this.event(rid, 'start', base, cfg);
      if (t.q > o.q && this.once(rid, `question:${t.id}:${String(t.lastQ).slice(0, 80)}`)) {
        const r = this.event(rid, 'question', { ...base, text: t.lastQ, q: t.q }, cfg);
        if (r) this.setOpen(`question:${rid}:${t.id}`, r, rid, cfg);
      }
      if (o.priority !== 'P1' && t.priority === 'P1' && OPEN_STATUSES.includes(t.status) && this.once(rid, `p1:${t.id}`)) this.event(rid, 'p1', base, cfg);
    }
    // W-0050: Eine Aufgabe, die im Review verschwindet (gelöscht), wartet nicht mehr auf dich.
    for (const id of Object.keys(prev.tasks)) {
      const slot = `review:${rid}:${id}`;
      const op = !next.tasks[id] && this.state.open[slot];
      if (op) { this.upsert(op.key, { ...op.ev, state: 'resolved', until: new Date().toISOString() }, rid, cfg); delete this.state.open[slot]; }
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
      const a = next.focus || next.active;
      const act = a ? { id: a.id, title: a.title } : {};
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
        const a = s.focus || s.active;
        const act = a ? { id: a.id, title: a.title } : {};
        this.schedule(slot, `${slot}:${s.idleSince}`, rid, 'idle', { ...act, since: s.idleSince }, Date.parse(s.idleSince) + cfg.delays.idle * 1000);
      }
    }
  }

  // Freigabe und Warten, die sich erledigt haben: Timer verwerfen, gesendete Nachricht grau bearbeiten.
  resolve(rid, snap, cfg) {
    for (const [slot, tm] of this.timers) if (tm.rid === rid && !this.stillTrue(tm.type, tm.data, snap)) this.timers.delete(slot);
    for (const [slot, op] of Object.entries(this.state.open)) {
      if (op.rid !== rid || !['perm', 'idle', 'question'].includes(op.ev.type) || this.stillTrue(op.ev.type, op.ev, snap)) continue;
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
      if (r) this.setOpen(slot, r, tm.rid, cfg);
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
      let known = this.state.msgs[op.key];
      const card = op.card ? this.state.cards[op.key] : null;
      try {
        // Karte (W-0050) mit Bild; eine schon aufgeräumte Karte gibt es nicht mehr.
        const m = card ? this.cardMessage(op.key, card, cfg) : op.card ? null
          : { body: renderEvent(op.ev, cfg, { owner: cfg.owner_id, rid: op.rid, interactive: this.interactive }), waits: waiting(op.ev) };
        if (m) {
          // done: seit wann die Nachricht erledigt ist (ab da läuft die Frist zum Löschen); 0, solange sie wartet.
          const { body, waits, files, hash } = m;
          const attachments = files ? { attachments: [{ id: 0, filename: 'works.png' }] } : {};
          // Neuer wartender Eintrag: alte Fassung löschen, die Karte kommt neu nach unten und benachrichtigt.
          if (known && op.resend) {
            if (!await this.remove(known.channel_id, known.message_id)) return;
            delete this.state.msgs[op.key];
            known = undefined;
          }
          if (known) {
            if (!hash || known.h !== hash) await this.rest.patch(`/channels/${known.channel_id}/messages/${known.message_id}`, { content: body.content, embeds: body.embeds, components: body.components, allowed_mentions: body.allowed_mentions, ...attachments }, files);
            known.done = waits ? 0 : known.done || Date.now();
            if (hash) known.h = hash;
          } else {
            const ch = op.channel_id || this.channelFor(op.rid, cfg);
            const r = await this.rest.post(`/channels/${ch}/messages`, { ...body, ...attachments }, files);
            this.state.msgs[op.key] = { channel_id: ch, message_id: r.id, at: new Date().toISOString(), done: waits ? 0 : Date.now(), ...(hash ? { h: hash } : {}) };
          }
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

  // Eine Nachricht löschen; weg (404) oder nicht mehr unsere (403) zählt als gelöscht. false: später noch einmal.
  async remove(channel, message) {
    try { await this.rest.del(`/channels/${channel}/messages/${message}`); } catch (e) {
      if (e.retry) { this.retryAt = Date.now() + RETRY; this.log(e.message); return false; }
      if (e.status === 401 || e.status === 410) throw e;
      if (e.status !== 404 && e.status !== 403) this.log(`Nachricht nicht gelöscht: ${e.message}`);
    }
    return true;
  }

  // Dashboard nach D3 (W-0044): eine angeheftete Nachricht je Kanal für alle Projekte, die dorthin melden. Gebündelt
  // bearbeitet (höchstens alle 10 s), das Bild höchstens alle 5 Minuten neu gezeichnet und bei jeder Bearbeitung mit
  // hochgeladen. 404 (gelöscht) oder 403 (nicht mehr bearbeitbar): neu anlegen.
  async dashboards(cfg) {
    // Statusposts je Projekt von vor W-0044 und Dashboards in Kanälen ohne Projekte (Kanal gewechselt) löschen.
    for (const pr of Object.values(this.state.projects)) {
      if (!pr.status) continue;
      if (pr.status.message_id && !await this.remove(pr.status.channel_id, pr.status.message_id)) return;
      delete pr.status; this.dirty = true;
    }
    const byCh = new Map();
    for (const [rid, pr] of Object.entries(this.state.projects)) {
      if (!pr.snap || !pr.root || !this.enrolled(rid, cfg)) continue;
      const ch = this.channelFor(rid, cfg);
      if (!byCh.has(ch)) byCh.set(ch, []);
      byCh.get(ch).push({ rid, ...pr });
    }
    for (const [ch, d] of Object.entries(this.state.dash)) {
      if (byCh.has(ch)) continue;
      if (d.message_id && !await this.remove(ch, d.message_id)) return;
      delete this.state.dash[ch]; this.images.delete(ch); this.dirty = true;
    }
    const sha = (x) => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex');
    for (const [ch, list] of byCh) {
      if (Date.now() < this.retryAt) return;
      list.sort((a, b) => a.snap.name.localeCompare(b.snap.name));
      const d = this.state.dash[ch] || {};
      const body = renderDashboard(list, cfg, { ci: this.state.ci, interactive: this.interactive });
      const hash = sha({ ...body.embeds[0], timestamp: 0, c: body.components });
      const data = dashImageData(list, langOf(), this.state.history || []);
      const imgHash = sha(data);
      const img = this.images.get(ch);
      const draw = !img || (img.hash !== imgHash && Date.now() - img.at >= IMAGE_MIN);
      if (d.message_id && d.hash === hash && !draw) continue;
      if (Date.now() - (d.at || 0) < STATUS_MIN) continue;
      if (draw) this.images.set(ch, { hash: imgHash, at: Date.now(), png: dashboardPng(data) });
      const files = [{ name: 'works.png', type: 'image/png', data: this.images.get(ch).png }];
      const attachments = [{ id: 0, filename: 'works.png' }];
      try {
        let ok = false;
        if (d.message_id) {
          try { await this.rest.patch(`/channels/${ch}/messages/${d.message_id}`, { embeds: body.embeds, components: body.components, attachments }, files); ok = true; } catch (e) { if (e.status !== 404 && e.status !== 403) throw e; }
        }
        if (!ok) {
          const m = await this.rest.post(`/channels/${ch}/messages`, { ...body, attachments, flags: SILENT, allowed_mentions: { parse: [] } }, files);
          d.message_id = m.id;
          try { await this.rest.put(`/channels/${ch}/messages/pins/${m.id}`); } catch (e) {
            if (e.retry) throw e;
            if (!this.warned.has(`pin:${ch}`)) { this.warned.add(`pin:${ch}`); this.log(`Anheften in Kanal ${ch} nicht möglich (${e.message}). Fehlt das Recht „Nachrichten anheften“?`); }
          }
        }
        this.state.dash[ch] = { ...d, hash, at: Date.now() };
        this.dirty = true;
      } catch (e) {
        if (e.retry) { this.retryAt = Date.now() + RETRY; this.log(e.message); return; }
        if (e.status === 401 || e.status === 410) throw e;
        this.state.dash[ch] = { ...d, at: Date.now() };
        if (!this.warned.has(`dash:${ch}`)) { this.warned.add(`dash:${ch}`); this.log(`Dashboard in Kanal ${ch}: ${e.message}`); }
      }
    }
  }

  // Aufräumen (W-0044): Nachrichten nach der Frist löschen, gezählt ab ihrer Erledigung; wartende bleiben. Eine je
  // Durchgang (30 in der Minute): Der gemeinsame Bot erlaubt 60, und nach einer langen Pause laufen viele Fristen
  // gleichzeitig ab. Einträge von vor W-0044 haben kein done: erledigt ab dem Senden.
  // Karten (W-0050): erledigt, sobald kein Eintrag mehr wartet und die Aufgabe nicht mehr offen ist, auch ohne neues
  // Ereignis (verworfen, gelöscht, Projekt weg); gelöscht samt ihrem Stand.
  async cleanup(cfg) {
    for (const [k, v] of Object.entries(this.state.msgs)) {
      const c = k.startsWith('card:') ? this.state.cards[k] : null;
      if (c && !v.done && !this.cardWaits(c)) { v.done = Date.now(); this.dirty = true; }
    }
    const secs = Number(cfg.cleanup && cfg.cleanup.seconds) || 0;
    if (secs <= 0) return;
    const limit = Date.now() - secs * 1000;
    const busy = new Set([...this.state.queue.map((q) => q.key), ...Object.values(this.state.open).map((o) => o.key)]);
    let n = 0;
    for (const [k, v] of Object.entries(this.state.msgs)) {
      if (n >= 1 || Date.now() < this.retryAt) return;
      const done = v.done === undefined ? Date.parse(v.at) : v.done;
      if (!done || done > limit || busy.has(k)) continue;
      n++;
      if (!await this.remove(v.channel_id, v.message_id)) return;
      delete this.state.msgs[k];
      delete this.state.cards[k];
      this.cardImgs.delete(k);
      this.dirty = true;
    }
  }

  // Status des Bots (eigener Bot): das Wichtigste über alle Projekte, je Art das jüngste; höchstens alle 20 s neu.
  statusLine(cfg) {
    const t = langOf();
    const all = this.liveProjects(cfg);
    const newest = (list, at) => list.sort((x, y) => String(at(y)).localeCompare(String(at(x))))[0];
    const perm = newest(all.filter((p) => p.snap.perm), (p) => p.snap.perm.since);
    if (perm) return t(`${perm.snap.name} wartet auf deine Freigabe`, `${perm.snap.name} is waiting for your approval`);
    const idle = newest(all.filter((p) => !p.snap.busy && p.snap.idleSince), (p) => p.snap.idleSince);
    if (idle) return t(`${idle.snap.name} wartet auf dich`, `${idle.snap.name} is waiting for you`);
    const busy = newest(all.filter((p) => p.snap.busy && p.snap.active), (p) => p.snap.since);
    if (busy) return t(`arbeitet an ${busy.snap.active.id} (${busy.snap.name})`, `working on ${busy.snap.active.id} (${busy.snap.name})`);
    return t(`${all.length} ${all.length === 1 ? 'Projekt' : 'Projekte'} im Blick`, `watching ${all.length} ${all.length === 1 ? 'project' : 'projects'}`);
  }

  updateStatus(cfg) {
    if (!this.setStatus) return;
    const text = trimTo(this.statusLine(cfg), 128);
    if (text === this.statusText || Date.now() - this.statusAt < PRESENCE_MIN) return;
    this.statusText = text; this.statusAt = Date.now();
    this.setStatus(text);
  }

  // W-0051: Projekte, die nicht mehr in projects.json stehen oder kein .works/config.json mehr haben (projectList),
  // fallen nach GONE_AFTER mit ihrem Stand aus state.json und damit aus Panel, Status und /works status. Einen alten
  // Statuspost je Projekt räumt dashboards() vorher weg.
  forget(present) {
    const now = Date.now();
    for (const [rid, pr] of Object.entries(this.state.projects)) {
      if (present.has(rid)) { this.missing.delete(rid); continue; }
      if (!this.missing.has(rid)) this.missing.set(rid, now);
      if (now - this.missing.get(rid) < GONE_AFTER || pr.status) continue;
      delete this.state.projects[rid];
      for (const m of [this.missing, this.fingers, this.snapAt, this.caches, this.snapJson]) m.delete(rid);
      // Offene Schritte und Timer des Projekts gelten nicht mehr: Seine Karten warten dann auf nichts (W-0050).
      for (const [slot, op] of Object.entries(this.state.open)) if (op.rid === rid) delete this.state.open[slot];
      for (const [slot, tm] of this.timers) if (tm.rid === rid) this.timers.delete(slot);
      this.dirty = true;
      this.log(`${pr.name || rid}: kein .works mehr, aus dem Panel genommen`);
    }
  }

  prune(cfg) {
    const now = Date.now();
    // Gemerkte Nachrichten bleiben, bis das Aufräumen sie gelöscht hat: höchstens Frist plus eine Woche ab ihrer
    // Erledigung (ohne Erledigung ab dem Senden). Karten einer offenen Aufgabe bleiben, solange sie dauert (W-0050).
    const keep = ((Number(cfg && cfg.cleanup && cfg.cleanup.seconds) || 0) * 1000) + 7 * DAY;
    for (const [k, v] of Object.entries(this.state.msgs)) {
      if ((v.done || Date.parse(v.at)) >= now - keep || Object.values(this.state.open).some((o) => o.key === k) || (this.state.cards[k] && this.cardWaits(this.state.cards[k]))) continue;
      delete this.state.msgs[k];
    }
    // Karten ohne Nachricht und ohne ausstehendes Senden (verworfen, längst aufgeräumt) braucht niemand mehr.
    for (const k of Object.keys(this.state.cards)) if (!this.state.msgs[k] && !this.state.queue.some((q) => q.key === k)) { delete this.state.cards[k]; this.cardImgs.delete(k); }
    const old = now - 7 * DAY;
    this.state.history = (this.state.history || []).filter((x) => msOf(x.at, 0) > old);
    for (const [k, v] of Object.entries(this.state.ships)) if (Date.parse(v.ended || v.started) < now - DAY) delete this.state.ships[k];
    for (const m of Object.values(this.state.sent)) for (const [k, t] of Object.entries(m)) if (now - t > DAY) delete m[k];
  }

  async tick() {
    const cfg = loadDiscordConfig();
    this.interactive = this.clicks && cfg.commands !== false;
    if (!this.shared) await this.registerCommands(cfg);
    const done = [];
    // Ereignisse älter als zwei Tage (Bot lange aus) wären nur noch Lärm: verwerfen.
    for (const { file, ev } of readOutbox()) {
      if (Date.now() - Date.parse(ev.at) > 2 * DAY) this.log(`Altes Ereignis ${ev.type} vom ${ev.at} verworfen`);
      else { try { this.fromOutbox(ev, cfg, path.basename(file, '.json')); } catch (e) { this.log(`outbox: ${e.message}`); } }
      done.push(file);
    }
    if (done.length) this.dirty = true;
    const present = new Set();
    for (const p of projectList()) {
      const rid = rootIdOf(p.path);
      present.add(rid);
      if (this.enrolled(rid, cfg)) this.scanProject(p.path, rid, cfg);
    }
    this.forget(present);
    if (!this.restored) this.restoreTimers(cfg);
    this.fireTimers(cfg);
    this.refreshCards();
    if (this.dirty) this.save();
    for (const f of done) { try { fs.unlinkSync(f); } catch { /* schon weg */ } }
    await this.flush(cfg);
    await this.dashboards(cfg);
    await this.cleanup(cfg);
    this.updateStatus(cfg);
    if (this.dirty) { this.prune(cfg); this.save(); }
  }

  // ---------- Befehle und Knöpfe (W-0037) ----------

  // Eigener Bot: /works für den Server des Kanals registrieren (Server-Befehle sind sofort da), ohne Gateway nicht.
  // Schalter commands aus (W-0046): mit leerer Liste abmelden, auch ohne Gateway (ein früherer Lauf kann sie
  // registriert haben). Wieder bei einem anderen Server oder Schalter; nach einem Fehler frühestens in zehn Minuten.
  async registerCommands(cfg) {
    const on = cfg.commands !== false;
    const key = `${cfg.app_id}:${cfg.guild_id}:${on}`;
    if ((on && !this.clicks) || !cfg.app_id || !cfg.guild_id || this.commandsFor === key || Date.now() < (this.commandsRetry || 0)) return;
    try {
      await this.rest.put(`/applications/${cfg.app_id}/guilds/${cfg.guild_id}/commands`, on ? commands() : []);
      this.commandsFor = key;
      this.log(`Befehle /works für ${cfg.guild_name || cfg.guild_id} ${on ? 'registriert' : 'abgemeldet'}`);
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
  // active: ohne Angabe bei mehreren Projekten das, in dem Claude gerade arbeitet oder wartet (Knöpfe des Dashboards).
  pick(cfg, t, { rid = '', name = '', active = false } = {}) {
    const all = this.liveProjects(cfg);
    const names = all.map((x) => x.name).join(', ');
    const n = name.toLowerCase();
    const live = all.filter((x) => x.snap.active && (x.snap.busy || x.snap.perm || x.snap.idleSince));
    const p = rid ? all.find((x) => x.rid === rid)
      : name ? all.find((x) => x.name.toLowerCase() === n) || all.find((x) => x.name.toLowerCase().startsWith(n))
        : all.length === 1 ? all[0] : active && live.length === 1 ? live[0] : null;
    if (!p) {
      if (rid) throw new Error(t('Das Projekt ist nicht mehr da oder schickt keine Hinweise mehr.', 'The project is gone or no longer sends notifications.'));
      if (!all.length) throw new Error(t('works kennt noch kein Projekt. Öffne ein Projekt mit works, dann geht es los.', 'works does not know any project yet. Open a project with works first.'));
      if (name) throw new Error(t(`Kein Projekt „${cut(name, 60)}“. Da sind: ${names}`, `No project “${cut(name, 60)}”. Known: ${names}`));
      throw new Error(active ? t(`Mehrere Projekte. Gib das Projekt im Dialog an oder wähle es im Menü „Projekt wählen“: ${names}`, `Several projects. Name it in the dialog or pick it in the menu: ${names}`)
        : t(`Mehrere Projekte, bitte mit project angeben: ${names}`, `Several projects, please name one with project: ${names}`));
    }
    this.scanProject(p.root, p.rid, cfg);
    return { rid: p.rid, ...this.state.projects[p.rid] };
  }

  overview(cfg, t) {
    const all = this.liveProjects(cfg);
    return { embeds: [{ color: COLOR.status, title: t(`works · ${all.length} ${all.length === 1 ? 'Projekt' : 'Projekte'}`, `works · ${all.length} ${all.length === 1 ? 'project' : 'projects'}`), description: trimTo(all.map((p) => projectLineOf(p.snap, this.state.ci[p.rid], cfg, t)).join('\n') || t('Noch kein Projekt bekannt.', 'No project known yet.'), 4000) }] };
  }

  // Details zu einem Projekt aus dem Auswahlmenü des Dashboards, mit Knöpfen für Aufgaben und eine Anweisung.
  detail(pr, cfg, t, lang) {
    const body = renderStatus({ ...pr.snap, recent: pr.recent, ci: this.state.ci[pr.rid] || null }, cfg, { lang });
    const btns = [...act(2, t('Aufgaben', 'Tasks'), cid('tasks', pr.rid, '')), ...act(1, t('Anweisung an Claude', 'Instruction for Claude'), cid('ins', pr.rid, (pr.snap.active && pr.snap.active.id) || ''))];
    return { ...body, components: btns.length ? [{ type: 1, components: btns }] : [] };
  }

  queueView(cfg, t) {
    const lines = this.liveProjects(cfg).flatMap((p) => (p.snap.queueIds || []).slice(0, 10).map((id, n) => {
      const x = p.snap.tasks[id];
      return `${n + 1}. **${id}**${cfg.privacy.titles && x && x.title ? ` ${cut(x.title, 80)}` : ''} · ${cut(p.snap.name, 40)}`;
    }));
    return { embeds: [{ color: COLOR.run, title: t('Warteschlange', 'Queue'), description: trimTo(lines.join('\n') || t('Nichts eingereiht. Im Board unter Warteschlange festlegen, was Claude der Reihe nach abarbeitet.', 'Nothing queued. Set it in the board under Queue.'), 4000) }] };
  }

  taskList(pr, cfg, t) {
    const order = { 'in-arbeit': 0, review: 1, geplant: 2, backlog: 3 };
    const st = { 'in-arbeit': t('in Arbeit', 'in progress'), review: t('im Review', 'in review'), geplant: t('geplant', 'planned'), backlog: 'Backlog' };
    const open = Object.values(pr.snap.tasks).filter((x) => OPEN_STATUSES.includes(x.status))
      .sort((a, b) => String(a.priority || 'P9').localeCompare(String(b.priority || 'P9')) || (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.id.localeCompare(b.id));
    const lines = open.slice(0, 25).map((x) => `**${x.id}** ${x.priority || ''} · ${st[x.status] || x.status}${cfg.privacy.titles && x.title ? ` · ${cut(x.title, 90)}` : ''}`);
    return { embeds: [{ color: colorOf(pr.snap.name), title: cut(t(`${pr.snap.name} · ${open.length} offen`, `${pr.snap.name} · ${open.length} open`), 256), description: trimTo(lines.join('\n') || t('Nichts offen.', 'Nothing open.'), 4000), ...(open.length > 25 ? { footer: { text: t(`und ${open.length - 25} weitere im Board`, `and ${open.length - 25} more in the board`) } } : {}) }] };
  }

  // Verlauf nach Entwurf P2 (W-0050), nur für den Aufrufer: 10 Einträge je Seite mit Symbol, Projekt, Text und
  // relativer Zeit; darunter Auswahl Eintrag ansehen, Projekt und Zeitraum, Knöpfe Neuere und Ältere. rid: nur dieses
  // Projekt; range: d (24 Std.), t (3 Tage), w (7 Tage).
  historyView(cfg, t, { rid = '', range = 'd', page = 0, lang = '' } = {}) {
    const span = HIST_SPAN[range] ? range : 'd';
    const [ms, short, long] = HIST_SPAN[span];
    const now = Date.now();
    const projects = this.liveProjects(cfg);
    const names = Object.fromEntries(Object.entries(this.state.projects).map(([r, p]) => [r, p.name || (p.snap && p.snap.name) || '']));
    const all = (this.state.history || []).filter((x) => (!rid || x.rid === rid) && now - msOf(x.at, 0) < ms);
    const pages = Math.max(1, Math.ceil(all.length / HIST_PAGE));
    const pg = Math.min(Math.max(0, Number(page) || 0), pages - 1);
    const items = all.slice(pg * HIST_PAGE, (pg + 1) * HIST_PAGE);
    const nameOf = (x) => cut(names[x.rid] || x.ev.project || '?', 40);
    const sym = (x) => HIST_SYM[x.ev.type] || KIND[kindOf(x.ev)][1];
    const lines = items.map((x) => `${sym(x)} **${nameOf(x)}** ${cut(summaryOf(x.ev, cfg, lang), 150)} · ${rel(x.at)}`);
    const n = all.length;
    const embed = {
      color: COLOR.run,
      title: cut(`${t(`Verlauf · ${long[0]} · ${n} ${n === 1 ? 'Nachricht' : 'Nachrichten'}`, `History · ${long[1]} · ${n} ${n === 1 ? 'message' : 'messages'}`)}${rid ? ` · ${names[rid] || '?'}` : ''}`, 256),
      description: trimTo(lines.join('\n') || t('Nichts in diesem Zeitraum.', 'Nothing in this period.'), 4000),
      footer: { text: `${t('Im Kanal nach der Frist gelöscht, hier 7 Tage', 'Deleted in the channel after the period, kept here for 7 days')}${pages > 1 ? t(` · Seite ${pg + 1} von ${pages}`, ` · page ${pg + 1} of ${pages}`) : ''}` },
    };
    const id = (r, p) => `${r}-${p}`;
    const components = [];
    if (items.length) {
      components.push({ type: 1, components: [{ type: 3, custom_id: cid('histv', rid, id(span, pg)), placeholder: t('Eintrag ansehen · mit allen Feldern', 'View an entry · with all fields'),
        options: items.map((x) => ({ label: cut(`${sym(x)} ${summaryOf(x.ev, cfg, lang)}`, 100), value: histId(x.k), description: cut(`${nameOf(x)} · ${hhmm(x.at)}`, 100) })) }] });
    }
    if (projects.length > 1 || rid) {
      components.push({ type: 1, components: [{ type: 3, custom_id: cid('histp', '', id(span, 0)), placeholder: t('Projekt', 'Project'),
        options: [{ label: t('Projekt: alle', 'Project: all'), value: 'all', default: !rid }, ...projects.slice(0, 24).map((p) => ({ label: cut(t(`Projekt: ${p.name}`, `Project: ${p.name}`), 100), value: p.rid, default: p.rid === rid }))] }] });
    }
    components.push({ type: 1, components: [{ type: 3, custom_id: cid('histr', rid, id(span, 0)), placeholder: t('Zeitraum', 'Period'),
      options: Object.entries(HIST_SPAN).map(([k, [, s]]) => ({ label: t(`Zeitraum: ${s[0]}`, `Period: ${s[1]}`), value: k, default: k === span })) }] });
    const nav = [...(pg > 0 ? act(2, t('◀ Neuere', '◀ Newer'), cid('hist', rid, id(span, pg - 1))) : []), ...(pg < pages - 1 ? act(2, t('Ältere ▶', 'Older ▶'), cid('hist', rid, id(span, pg + 1))) : [])];
    if (nav.length) components.push({ type: 1, components: nav });
    return { embeds: [embed], components };
  }

  // Ein Eintrag des Verlaufs mit allen Feldern, wie er im Kanal stand, ohne Knöpfe und ohne Erwähnung.
  historyEntry(hid, cfg, t, lang) {
    const x = (this.state.history || []).find((y) => histId(y.k) === hid);
    if (!x) throw new Error(t('Diesen Eintrag gibt es nicht mehr (älter als 7 Tage).', 'This entry is gone (older than 7 days).'));
    const e = renderEvent(x.ev, cfg, { lang }).embeds[0];
    return { embeds: [{ ...e, timestamp: new Date(msOf(x.at, Date.now())).toISOString() }] };
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
    const lang = normLang(i.locale || i.guild_locale) || 'en';
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
      if (sub === 'history') return this.historyView(cfg, t, { rid: opts.project ? this.pick(cfg, t, { name: opts.project }).rid : '', lang });
      const pr = this.pick(cfg, t, { name: opts.project || '' });
      if (sub === 'status') return renderStatus({ ...pr.snap, recent: pr.recent, ci: this.state.ci[pr.rid] || null }, cfg, { lang });
      if (sub === 'tasks') return this.taskList(pr, cfg, t);
      if (sub === 'new') return create(pr, opts.title, opts.priority);
      if (sub === 'instruct') return instruct(pr, (opts.task || '').toUpperCase(), opts.text);
      throw new Error(t('Unbekannter Befehl.', 'Unknown command.'));
    }
    const p = parseCid(i.data && i.data.custom_id);
    if (!p) throw new Error(t('Unbekannter Knopf.', 'Unknown button.'));
    if (i.type === 3 && p.act === 'queue') return this.queueView(cfg, t);
    // Verlauf (W-0050): Knopf im Dashboard und die Auswahlen der Ansicht; Zeitraum und Seite stehen in der custom_id.
    if (i.type === 3 && ['hist', 'histv', 'histp', 'histr'].includes(p.act)) {
      const v = String((i.data.values || [])[0] || '');
      if (p.act === 'histv') return this.historyEntry(v, cfg, t, lang);
      const [r, n] = (p.id || 'd-0').split('-');
      let o = { rid: p.rid, range: r, page: Number(n) || 0, lang };
      if (p.act === 'histp') o = { ...o, rid: /^[0-9a-f]{16}$/.test(v) ? v : '', page: 0 };
      if (p.act === 'histr') o = { ...o, range: v, page: 0 };
      return this.historyView(cfg, t, o);
    }
    if (i.type === 3 && p.act === 'proj') return this.detail(this.pick(cfg, t, { rid: String((i.data.values || [])[0] || '') || '-' }), cfg, t, lang);
    // Knöpfe des Dashboards tragen kein Projekt: das aus dem Dialog, sonst das einzige oder das, in dem Claude gerade ist.
    const pr = this.pick(cfg, t, p.rid ? { rid: p.rid } : { name: i.type === 5 ? modalValues(i.data).project || '' : '', active: true });
    if (i.type === 3 && p.act === 'tasks') return this.taskList(pr, cfg, t);
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
  // (Annehmen kann Prüfungen laufen lassen, Discord wartet aber nur 3 s). Schalter aus: nur ein kurzer Hinweis
  // (beim gemeinsamen Bot bleibt /works registriert, beim eigenen kommen noch Klicks auf alte Knöpfe).
  async onInteraction(i, io) {
    const cfg = loadDiscordConfig();
    const t = tr(i.locale || i.guild_locale);
    try {
      if (!cfg.owner_id || who(i) !== cfg.owner_id) return await io.reply(notOwner(i.locale));
      if (cfg.commands === false) return await io.reply(commandsOff(i.locale));
      const p = i.type === 3 ? parseCid(i.data && i.data.custom_id) : null;
      if (p && MODAL.has(p.act)) return await io.modal(modalFor(i.data.custom_id, i.locale));
      if ((i.type === 2 && subOf(i).sub === 'help') || (p && p.act === 'help')) return await io.reply(helpMessage({ locale: i.locale, shared: this.shared }));
      await io.defer();
      let data;
      // Meldungen der Board-API (api.mjs, tr aus i18n) in der Sprache des Clients, danach wieder die globale.
      // ponytail: eine Sprache je Prozess; zwei gleichzeitige Antworten in verschiedenen Sprachen können sich mischen.
      setLanguage(normLang(i.locale || i.guild_locale) || 'en');
      try { data = await this.act(i, cfg, t); } catch (e) {
        data = { embeds: [{ color: COLOR.red, title: t('Ging nicht', 'That did not work'), description: cut(e.message, 1500) }] };
      } finally { setLanguage(null); }
      await io.edit(data);
    } catch (e) { this.log(`Antwort auf Befehl oder Knopf: ${e.message}`); }
  }

  ownIo(i) {
    const cb = (body) => this.rest.post(`/interactions/${i.id}/${i.token}/callback`, body);
    return {
      reply: (data) => cb({ type: 4, data: ephemeral(data) }),
      modal: (m) => cb({ type: 9, data: m }),
      defer: () => cb({ type: 5, data: { flags: 64 } }),
      // Nur für den Aufrufer ist sie schon durch die vorläufige Antwort; beim Bearbeiten nimmt Discord kein ephemeral-Flag.
      edit: (data) => this.rest.patch(`/webhooks/${i.application_id}/${i.token}/messages/@original`, { ...data, allowed_mentions: { parse: [] } }),
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
          status: bot.statusText || '',
        });
        gw.start();
      } catch (e) { log(`Gateway nicht erreichbar (${e.message}), Nachrichten gehen trotzdem.`); }
    };
    // Schreibende Aktionen aus Discord laufen über die Board-API; der Verlauf zeigt sie mit [Discord].
    process.env.WORKS_API_ACTOR = 'Discord';
    const bot = new Bot({ rest, log, shared: cred.shared, interactive: cred.shared || hasWebSocket() });
    // Status des Bots (W-0044) nur beim eigenen Bot: Der gemeinsame ist einer für alle.
    if (!cred.shared && hasWebSocket()) bot.setStatus = (text) => { if (gw) gw.setStatus(text); };
    // Gemeinsamer Bot: Befehle und Klicks holt das Gerät beim Dienst ab (es hat kein Gateway). Der Dienst hält die
    // Anfrage offen, bis etwas kommt; ein Dienst ohne Inbox (ältere Version) wird nur selten gefragt.
    if (cred.shared) {
      (async () => {
        let warned = false;
        // Erhaltenes bestätigt das Gerät mit der nächsten Abfrage; der Dienst schickt sonst noch einmal. Doppelt
        // Angekommenes (Bestätigung verloren) beantwortet es nur einmal.
        let ack = [];
        const seen = new Set();
        while (!stopping && !fatal) {
          try {
            const r = await rest.get(`/inbox?wait=${FAST ? 1 : 10}${ack.length ? `&ack=${ack.join(',')}` : ''}`);
            const list = r && Array.isArray(r.interactions) ? r.interactions : [];
            ack = list.map((i) => String(i.id));
            for (const i of list) {
              if (seen.has(String(i.id))) continue;
              seen.add(String(i.id));
              if (seen.size > 500) seen.delete(seen.values().next().value);
              bot.onInteraction(i, bot.sharedIo(i));
            }
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
