// Discord-Bot works (W-0036): Ablage, Einstellungen, Ereignis-Warteschlange (outbox), Start und Stopp.
// Bewusst leicht, weil Hooks, ship und die CLI das Modul laden. REST und Gateway stehen in discord-api.mjs,
// der Bot selbst in discord-bot.mjs.
//
// Alles liegt in ~/.works/discord, nie im Projekt:
//   secret.json  nur das Token, Datei nur für den Nutzer lesbar
//   config.json  Einstellungen (Kanal, Ereignisse, Ruhezeit, Datenschutz, Projekte)
//   state.json   Stand des Bots (Nachrichten-IDs, letzter Stand je Projekt, offene Ereignisse)
//   outbox/      eine Datei je Ereignis von ship, CI-Wächter und Berichten; der Bot holt sie ab
//   bot.pid      läuft gerade ein Bot (eine Sperrdatei je Rechner)
//   bot.log      Protokoll ohne Token
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { readJson, writeJson, rootIdOf } from './lib.mjs';
import { isAlive, stopProcess, newestCli, cliVersion } from './server-control.mjs';

export const discordDir = () => path.join(os.homedir(), '.works', 'discord');
export const dfile = (name) => path.join(discordDir(), name);

// Rechte für die Einladung: Kanal sehen, senden, Links einbetten, Verlauf lesen, anheften. Nicht mehr.
export const INVITE_PERMISSIONS = String((1n << 10n) | (1n << 11n) | (1n << 14n) | (1n << 16n) | (1n << 51n));

// Ereignisse: on = senden, at = mit Erwähnung (klingelt). Gruppen wie im Entwurf J2.
export const EVENT_GROUPS = [
  ['Claude braucht dich', [['perm', 'Freigabe wartet'], ['idle', 'Fertig, wartet auf dich'], ['question', 'Frage gestellt']]],
  ['Ergebnisse', [['review', 'Im Review'], ['shipped', 'Ausgeliefert'], ['done', 'Erledigt ohne ship'], ['returned', 'Zurückgegeben']]],
  ['CI', [['ci_red', 'Rot, Bug angelegt'], ['ci_green', 'Wieder grün']]],
  ['Planung und Berichte', [['p1', 'Neue P1'], ['queue_empty', 'Warteschlange leer'], ['report_day', 'Feierabendbericht'], ['report_week', 'Wochenbericht']]],
];
const AT = new Set(['perm', 'idle', 'question']);
const OFF = new Set(['report_day']);

export const DEFAULTS = {
  mode: 'own', service: '',
  app_id: '', bot_name: '', owner_id: '',
  guild_id: '', guild_name: '', channel_id: '', channel_name: '',
  autostart: true,
  auto_enroll: true,
  // Befehle und Knöpfe (W-0046): aus heißt kein /works beim eigenen Bot und keine Knöpfe an neuen Nachrichten.
  commands: true,
  // Je Projekt (rootId): enabled (Hinweise an oder aus), beim eigenen Bot channel_id und channel_name (W-0046).
  projects: {},
  events: Object.fromEntries(EVENT_GROUPS.flatMap(([, list]) => list.map(([k]) => [k, { on: !OFF.has(k), at: AT.has(k) }]))),
  quiet: { on: true, from: '22:00', to: '07:00' },
  privacy: { commands: false, costs: true, ci_error: true, titles: true },
  delays: { perm: 30, idle: 120 },
  // Aufräumen (W-0044): Nachrichten außer dem Dashboard nach so vielen Stunden löschen, offene erst nach der Erledigung. 0: nie.
  cleanup: { hours: 24 },
};

export function normalizeConfig(c = {}) {
  const src = c && typeof c === 'object' ? c : {};
  const out = { ...DEFAULTS, ...src };
  out.events = Object.fromEntries(Object.entries(DEFAULTS.events).map(([k, v]) => [k, { ...v, ...((src.events || {})[k] || {}) }]));
  for (const k of ['quiet', 'privacy', 'delays', 'cleanup']) out[k] = { ...DEFAULTS[k], ...(src[k] || {}) };
  out.projects = { ...(src.projects || {}) };
  return out;
}

export function loadDiscordConfig() { return normalizeConfig(readJson(dfile('config.json'), {})); }
export function saveDiscordConfig(cfg) { writeJson(dfile('config.json'), cfg); }

// secret.json hält genau ein Geheimnis: das Token des eigenen Bots oder den Geräteschlüssel für den gemeinsamen Bot
// (W-0040). Wer den Weg wechselt, verliert das andere.
const readSecret = () => readJson(dfile('secret.json'), null) || {};
export const loadToken = () => (typeof readSecret().token === 'string' ? readSecret().token : '');
export const loadKey = () => (typeof readSecret().key === 'string' ? readSecret().key : '');

// Angelegt mit Rechten nur für den Nutzer (unter Windows erbt die Datei die Rechte des Benutzerordners).
function writeSecret(obj) {
  fs.mkdirSync(discordDir(), { recursive: true, mode: 0o700 });
  const file = dfile('secret.json');
  try { fs.unlinkSync(file); } catch { /* neu */ }
  fs.writeFileSync(file, JSON.stringify(obj) + '\n', { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* Windows */ }
}
export const saveToken = (token) => writeSecret({ token });
export const saveKey = (key) => writeSecret({ key });

export function removeToken() { try { fs.unlinkSync(dfile('secret.json')); } catch { /* weg */ } }

export const maskToken = (t) => (t ? `…${t.slice(-4)}` : '');
export const isShared = (cfg) => cfg.mode === 'shared';
// Kanal eines Projekts: ein eigener nur beim eigenen Bot, der gemeinsame schreibt in genau einen Kanal (W-0046).
export const channelOf = (cfg, rid) => (!isShared(cfg) && cfg.projects[rid] && cfg.projects[rid].channel_id) || cfg.channel_id;
export const isConfigured = (cfg = loadDiscordConfig()) => !!((isShared(cfg) ? loadKey() : loadToken()) && cfg.channel_id);

const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];

// Basis der REST-API. Überschreiben nur auf diesem Rechner (Tests), sonst ginge das Token an einen fremden Server.
export function apiBase() {
  const o = process.env.WORKS_DISCORD_API;
  if (!o) return 'https://discord.com/api/v10';
  let u;
  try { u = new URL(o); } catch { throw new Error('WORKS_DISCORD_API ist keine gültige Adresse.'); }
  if (!LOOPBACK.includes(u.hostname) || u.protocol !== 'http:') throw new Error('WORKS_DISCORD_API darf nur auf diesen Rechner zeigen (http://127.0.0.1:...).');
  return o.replace(/\/$/, '');
}

// Adresse des gemeinsamen Bots (Dienst works-bot). Fest hinterlegt, sobald er läuft; einstellbar mit
// works discord set service=https://…, für Tests auch über WORKS_DISCORD_SERVICE. Nur https, außer auf diesem Rechner.
export const DEFAULT_SERVICE = '';
export function serviceBase(cfg = loadDiscordConfig()) {
  const o = process.env.WORKS_DISCORD_SERVICE || cfg.service || DEFAULT_SERVICE;
  if (!o) throw new Error('Der gemeinsame Bot hat noch keine Adresse. Einstellen mit works discord set service=https://…');
  let u;
  try { u = new URL(o); } catch { throw new Error(`Adresse des gemeinsamen Bots ungültig: ${o}`); }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOOPBACK.includes(u.hostname))) throw new Error('Der gemeinsame Bot braucht https (http nur auf diesem Rechner).');
  return o.replace(/\/$/, '');
}

// Zugang für den Bot: eigener Bot direkt zu Discord mit Token, gemeinsamer Bot über den Dienst mit Schlüssel.
export function credential(cfg = loadDiscordConfig()) {
  return isShared(cfg)
    ? { secret: loadKey(), scheme: 'Bearer', base: `${serviceBase(cfg)}/v1`, shared: true }
    : { secret: loadToken(), scheme: 'Bot', base: apiBase(), shared: false };
}

export const inviteUrl = (appId) => `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot%20applications.commands&permissions=${INVITE_PERMISSIONS}`;

// ---------- outbox ----------

// Ereignis für den Bot ablegen. Wartet nie auf Discord und wirft nie: Ohne Einrichtung oder bei einem Fehler
// passiert einfach nichts. Läuft der Bot nicht, holt er die Dateien beim nächsten Start ab.
export function emit(type, data = {}, root = '') {
  try {
    if (!loadToken() && !loadKey()) return false;
    const dir = dfile('outbox');
    fs.mkdirSync(dir, { recursive: true });
    // Läuft der Bot lange nicht, wächst die outbox nicht unbegrenzt.
    if (fs.readdirSync(dir).length >= 500) return false;
    const ev = { v: 1, type, at: new Date().toISOString(), root: root || '', rootId: root ? rootIdOf(root) : '', project: root ? path.basename(root) : '', data };
    const name = `${Date.now().toString().padStart(15, '0')}-${crypto.randomBytes(4).toString('hex')}.json`;
    const tmp = path.join(dir, `.${name}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(ev));
    fs.renameSync(tmp, path.join(dir, name));
    return true;
  } catch { return false; }
}

export function readOutbox() {
  const dir = dfile('outbox');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort(); } catch { return []; }
  return files.map((f) => ({ file: path.join(dir, f), ev: readJson(path.join(dir, f), null) })).filter((x) => x.ev);
}

// ---------- Prozess ----------

// Ein Bot zählt nur, wenn sein Prozess lebt und bot.pid frisch ist (der Bot erneuert sie alle paar Sekunden).
// Eine alte bot.pid, deren PID inzwischen ein anderer Prozess hat, wird so nie für einen Bot gehalten.
const FRESH = 30000;
const isFresh = (file) => { try { return Date.now() - fs.statSync(file).mtimeMs < FRESH; } catch { return false; } };

export function botInfo() {
  const info = readJson(dfile('bot.pid'), null);
  if (!info || !isAlive(info.pid) || !isFresh(dfile('bot.pid'))) return null;
  return info;
}

// Arbeitsordner ~/.works/discord: Unter Windows sperrt ein laufender Prozess seinen Arbeitsordner.
function startProcess(cli) {
  fs.mkdirSync(discordDir(), { recursive: true });
  const log = fs.openSync(dfile('bot.log'), 'a');
  const child = spawn(process.execPath, [cli, 'discord', 'run'], { cwd: discordDir(), detached: true, windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, WORKS_ACTOR: '' } });
  child.unref();
  fs.closeSync(log);
  return child.pid;
}

const requestStop = (pid) => fs.writeFileSync(dfile('stop.req'), String(pid));

// Bot starten, wenn eingerichtet und nicht schon da. Eine ältere Version bekommt die Bitte zu gehen, die neue
// startet sofort und übernimmt, sobald die alte weg ist. Board- und Sitzungsstart warten so nicht.
// Rückgabe: 'aus' (nicht eingerichtet oder Autostart aus), 'läuft', 'gestartet', 'neu'.
export async function ensureBot({ cli = newestCli(), force = false } = {}) {
  const cfg = loadDiscordConfig();
  if (!isConfigured(cfg) || (!force && cfg.autostart === false)) return 'aus';
  const info = botInfo();
  if (info) {
    if (info.version && info.version !== cliVersion(cli)) { requestStop(info.pid); startProcess(cli); return 'neu'; }
    return 'läuft';
  }
  startProcess(cli);
  return 'gestartet';
}

// Erst höflich (stop.req, der Bot meldet sich am Gateway ab), dann hart. Eine alte bot.pid eines fremden
// Prozesses wird nur entfernt, der Prozess bleibt in Ruhe.
export async function stopBot(timeoutMs = 8000) {
  const file = dfile('bot.pid');
  const info = readJson(file, null);
  if (!info) return false;
  if (!isAlive(info.pid) || !isFresh(file)) { try { fs.unlinkSync(file); } catch { /* weg */ } return false; }
  requestStop(info.pid);
  const ours = () => { const i = readJson(file, null); return i && i.pid === info.pid; };
  const until = Date.now() + timeoutMs;
  while (Date.now() < until && isAlive(info.pid) && ours()) await new Promise((r) => setTimeout(r, 100));
  if (isAlive(info.pid) && ours()) await stopProcess(info.pid);
  if (ours()) { try { fs.unlinkSync(file); } catch { /* weg */ } }
  try { if (fs.readFileSync(dfile('stop.req'), 'utf8').trim() === String(info.pid)) fs.unlinkSync(dfile('stop.req')); } catch { /* weg */ }
  return true;
}

// ---------- Einstellungen per works discord set ----------

const ALIAS = { delay: 'delays', event: 'events' };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function applySetting(cfg, key, value) {
  const parts = key.split('.').map((p, i) => (i === 0 ? ALIAS[p] || p : p));
  const bool = (v) => { if (/^(true|an|on|ja|1)$/i.test(v)) return true; if (/^(false|aus|off|nein|0)$/i.test(v)) return false; throw new Error(`${key}: an oder aus erwartet, nicht "${v}".`); };
  const [a, b, c] = parts;
  if (parts.length === 1 && ['autostart', 'auto_enroll', 'commands'].includes(a)) { cfg[a] = bool(value); return; }
  if (parts.length === 1 && a === 'service') {
    if (value) serviceBase({ service: value });
    cfg.service = value.replace(/\/$/, '');
    return;
  }
  if (a === 'delays' && b in DEFAULTS.delays && parts.length === 2) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 3600) throw new Error(`${key}: Sekunden von 0 bis 3600.`);
    cfg.delays[b] = n; return;
  }
  if (a === 'quiet' && parts.length === 2) {
    if (b === 'on') { cfg.quiet.on = bool(value); return; }
    if (b === 'from' || b === 'to') { if (!TIME.test(value)) throw new Error(`${key}: Uhrzeit als HH:MM.`); cfg.quiet[b] = value; return; }
  }
  if (a === 'privacy' && b in DEFAULTS.privacy && parts.length === 2) { cfg.privacy[b] = bool(value); return; }
  if (a === 'cleanup' && b === 'hours' && parts.length === 2) {
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 720) throw new Error(`${key}: Stunden von 0 (nie löschen) bis 720.`);
    cfg.cleanup.hours = n; return;
  }
  if (a === 'events' && b in DEFAULTS.events) {
    if (parts.length === 2) { cfg.events[b].on = bool(value); return; }
    if (c === 'on' || c === 'at') { cfg.events[b][c] = bool(value); return; }
  }
  // Hinweise je Projekt an oder aus (W-0038); die Kennung ist die rootId des Projekts.
  if (a === 'project' && parts.length === 2 && /^[0-9a-f]{16}$/.test(b)) { cfg.projects[b] = { ...(cfg.projects[b] || {}), enabled: bool(value) }; return; }
  // Kanal je Projekt (W-0046): Kanal-ID, leer oder der Standardkanal heißt Standardkanal. Den Namen und das
  // Schreibrecht prüft checkProjectChannels gegen die Liste vom Bot.
  if (a === 'project' && c === 'channel' && parts.length === 3 && /^[0-9a-f]{16}$/.test(b)) {
    const v = String(value).trim().replace(/^#/, '');
    if (v && isShared(cfg)) throw new Error(`${key}: Kanal je Projekt gibt es nur beim eigenen Bot. Der gemeinsame schreibt in genau einen Kanal, den gekoppelten.`);
    if (v && !/^\d{1,25}$/.test(v)) throw new Error(`${key}: Kanal-ID erwartet (works discord channel zeigt die Kanäle), leer für den Standardkanal.`);
    const p = { ...(cfg.projects[b] || {}) };
    if (!v || v === cfg.channel_id) { delete p.channel_id; delete p.channel_name; } else if (p.channel_id !== v) Object.assign(p, { channel_id: v, channel_name: '' });
    cfg.projects[b] = p;
    return;
  }
  throw new Error(`Unbekannte Einstellung ${key}. Möglich: autostart, auto_enroll, commands, service, delay.perm, delay.idle, quiet.on, quiet.from, quiet.to, privacy.commands|costs|ci_error|titles, cleanup.hours, event.<name>[.at], project.<id>, project.<id>.channel`);
}

// ---------- Einrichtung, Kanalwahl und Stand: gemeinsam für CLI und Board (W-0038) ----------
// Fehler tragen eine Meldung für den Nutzer, nie Token, Schlüssel oder Code.

const discordApi = () => import('./discord-api.mjs');

// Discord-Fehler in Worte fassen: 401 Token oder Schlüssel abgelehnt, 410 Kopplung kaputt.
export function explain(e, shared) {
  if (e.status === 401) return shared ? 'Der Dienst lehnt den Geräteschlüssel ab (getrennt?).' : 'Discord lehnt das Token ab.';
  if (e.status === 410) return 'Kopplung kaputt (Bot entfernt, Rechte entzogen oder Kanal gelöscht). Neu koppeln mit /works verbinden.';
  return e.message;
}

// Öffentliche Angaben des gemeinsamen Bots (Einladungslink). Kurz warten, Status und Board sollen nicht hängen.
export async function serviceInfo(cfg = loadDiscordConfig()) {
  try {
    const r = await fetch(`${serviceBase(cfg)}/v1/info`, { signal: AbortSignal.timeout(4000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

const serviceRest = async (cfg) => { const { Rest } = await discordApi(); return new Rest({ token: loadKey(), base: `${serviceBase(cfg)}/v1`, scheme: 'Bearer' }); };

// Geräteschlüssel beim Dienst widerrufen, bevor er lokal verschwindet. Ein Fehler hält nichts auf.
export async function revokeKey(cfg = loadDiscordConfig()) {
  const k = loadKey();
  if (!k) return;
  try { await fetch(`${serviceBase(cfg)}/v1/link`, { method: 'DELETE', headers: { authorization: `Bearer ${k}` }, signal: AbortSignal.timeout(10000) }); } catch { /* lokal trotzdem weg */ }
}

// Token des eigenen Bots prüfen und speichern. Vom gemeinsamen Bot aus: Schlüssel widerrufen, der Kanal der Kopplung
// gilt nicht mehr. Andere Bot-Anwendung: deren alte Nachrichten kann der neue Bot nicht bearbeiten, also neu beginnen.
export async function setToken(raw) {
  const t = String(raw || '').trim();
  if (!t) throw new Error('Kein Token eingegeben.');
  if (/\s/.test(t) || t.length < 20) throw new Error('Token ungültig: Das sieht nicht nach einem Bot-Token aus.');
  const { Rest } = await discordApi();
  const rest = new Rest({ token: t, base: apiBase() });
  let me; let app;
  try { me = await rest.get('/users/@me'); app = await rest.get('/oauth2/applications/@me'); } catch (e) { throw new Error(e.status === 401 ? 'Token ungültig: Discord lehnt es ab.' : `Discord nicht erreichbar: ${e.message}`); }
  const cfg = loadDiscordConfig();
  if (cfg.app_id && cfg.app_id !== app.id) { await stopBot(); try { fs.unlinkSync(dfile('state.json')); } catch { /* keiner */ } }
  if (isShared(cfg)) { await stopBot(); await revokeKey(cfg); Object.assign(cfg, { guild_id: '', guild_name: '', channel_id: '', channel_name: '' }); }
  saveToken(t);
  Object.assign(cfg, {
    mode: 'own', app_id: app.id,
    bot_name: me.discriminator && me.discriminator !== '0' ? `${me.username}#${me.discriminator}` : me.username,
    owner_id: (app.team && app.team.owner_user_id) || (app.owner && app.owner.id) || '',
  });
  saveDiscordConfig(cfg);
  const restarted = !!botInfo();
  if (restarted) { await stopBot(); await ensureBot({ force: true }); }
  return { bot_name: cfg.bot_name, owner: !!cfg.owner_id, invite_url: inviteUrl(app.id), channel: !!cfg.channel_id, restarted };
}

// Code aus /works verbinden gegen einen Geräteschlüssel tauschen (gemeinsamer Bot).
export async function linkCode(raw, device = os.hostname()) {
  const code = String(raw || '').trim();
  if (!code) throw new Error('Kein Code eingegeben. Den Code gibt /works verbinden in Discord, im Kanal, in den works schreiben soll.');
  const cfg = loadDiscordConfig();
  const base = serviceBase(cfg);
  let r;
  try { r = await fetch(`${base}/v1/link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, device }), signal: AbortSignal.timeout(15000) }); } catch (e) { throw new Error(`Der gemeinsame Bot ist nicht erreichbar: ${e.message}`); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 429 ? 'Zu viele falsche Codes, später erneut versuchen.' : `Kopplung fehlgeschlagen: ${j.message || `HTTP ${r.status}`}. In Discord mit /works verbinden einen neuen Code holen.`);
  if (botInfo()) await stopBot();
  // Schon gekoppelt: den alten Schlüssel widerrufen, sonst bleibt er beim Dienst gültig.
  await revokeKey(cfg);
  if (!isShared(cfg) || cfg.app_id !== j.app_id) { try { fs.unlinkSync(dfile('state.json')); } catch { /* keiner */ } }
  saveKey(j.key);
  Object.assign(cfg, { mode: 'shared', app_id: j.app_id, bot_name: j.bot_name, owner_id: j.owner_id, guild_id: j.guild_id, guild_name: j.guild_name, channel_id: j.channel_id, channel_name: j.channel_name });
  saveDiscordConfig(cfg);
  return { bot_name: j.bot_name, guild_name: j.guild_name, channel_name: j.channel_name };
}

// Bot stoppen, Schlüssel widerrufen, Geheimnis löschen. Die Nachrichten in Discord bleiben.
export async function disconnect() {
  const key = !!loadKey();
  await stopBot();
  if (key) await revokeKey();
  removeToken();
  return { key };
}

const MISSING = { view: 'kann den Kanal nicht sehen', send: 'darf nicht senden', embed: 'darf keine Links einbetten' };

// Server und Textkanäle live vom Bot (Kanalwahl nach K). Eigener Bot: REST mit dem Token, alle Server. Gemeinsamer
// Bot: der Dienst, nur der gekoppelte Server. why: warum der Bot in einem Kanal nicht schreiben darf.
export async function channelsOf(cfg = loadDiscordConfig()) {
  const withWhy = (list) => list.map((c) => ({ ...c, why: c.can ? '' : c.missing.map((k) => MISSING[k] || k).join(', ') }));
  if (isShared(cfg)) {
    if (!loadKey()) throw new Error('Nicht mit dem gemeinsamen Bot gekoppelt.');
    let r;
    try { r = await (await serviceRest(cfg)).get('/guild/channels'); } catch (e) { throw new Error(e.status === 404 ? 'Der gemeinsame Bot kennt die Kanalwahl noch nicht (ältere Version).' : explain(e, true)); }
    return { mode: 'shared', channel_id: cfg.channel_id, guilds: [{ id: r.guild_id, name: r.guild_name || cfg.guild_name, channels: withWhy(r.channels || []) }] };
  }
  const token = loadToken();
  if (!token) throw new Error('Discord-Bot ist nicht eingerichtet. works discord zeigt die Schritte.');
  const { Rest, guildChannels } = await discordApi();
  const rest = new Rest({ token, base: apiBase() });
  const get = (p) => rest.get(p);
  try {
    const [me, guilds] = await Promise.all([get('/users/@me'), get('/users/@me/guilds')]);
    const out = [];
    for (const g of guilds.slice(0, 10)) out.push({ id: g.id, name: g.name, channels: withWhy(await guildChannels(get, g.id, me.id)) });
    return { mode: 'own', channel_id: cfg.channel_id, guilds: out };
  } catch (e) { throw new Error(`Kanäle nicht lesbar: ${explain(e, false)}`); }
}

// Dashboard und Hinweise in einen anderen Kanal („Hierher verschieben“). Gemeinsamer Bot: erst die Kopplung beim
// Dienst umziehen. Der laufende Bot liest config.json bei jedem Durchgang, legt das Dashboard im neuen Kanal an und
// löscht das alte (dashboards in discord-bot.mjs), ohne Neustart. list: schon gelesene Kanäle (channelsOf).
// Kanal aus der Liste vom Bot, in den er schreiben darf; sonst ein Fehler mit Grund.
function writable(list, cid) {
  const hit = list.guilds.flatMap((g) => g.channels.map((c) => ({ ...c, guild: g }))).find((c) => c.id === cid);
  if (!hit) throw new Error(`Kanal ${cid} nicht gefunden. Liste neu laden oder works discord channel.`);
  if (!hit.can) throw new Error(`#${hit.name}: Der Bot ${hit.why}. In Discord die Rechte des Kanals ändern oder einen anderen wählen.`);
  return hit;
}

// Kanal je Projekt (W-0046): neu gesetzte Kanäle (noch ohne Namen) gegen die Liste vom Bot prüfen und benennen.
// Ohne neue fragt works Discord nicht.
export async function checkProjectChannels(cfg) {
  const fresh = Object.values(cfg.projects).filter((p) => p.channel_id && !p.channel_name);
  if (!fresh.length) return;
  const list = await channelsOf(cfg);
  for (const p of fresh) p.channel_name = writable(list, p.channel_id).name;
}

export async function moveChannel(id, list = null) {
  const cid = String(id || '');
  if (!/^\d{1,25}$/.test(cid)) throw new Error('Kein Kanal gewählt.');
  const cfg = loadDiscordConfig();
  const hit = writable(list || await channelsOf(cfg), cid);
  if (isShared(cfg) && cid !== cfg.channel_id) {
    try { await (await serviceRest(cfg)).post('/link/channel', { channel_id: cid }); } catch (e) { throw new Error(explain(e, true)); }
  }
  Object.assign(cfg, { guild_id: hit.guild.id, guild_name: hit.guild.name, channel_id: hit.id, channel_name: hit.name });
  saveDiscordConfig(cfg);
  return { channel_id: hit.id, channel_name: hit.name, guild_name: hit.guild.name, running: !!botInfo() };
}

export async function sendTest(cfg = loadDiscordConfig()) {
  if (!isConfigured(cfg)) throw new Error('Discord-Bot ist nicht eingerichtet. works discord zeigt die Schritte.');
  const cred = credential(cfg);
  const { Rest } = await discordApi();
  const rest = new Rest({ token: cred.secret, base: cred.base, scheme: cred.scheme });
  try { await rest.post(`/channels/${cfg.channel_id}/messages`, { embeds: [{ title: 'Testnachricht von works', description: 'Wenn du das siehst, klappt die Verbindung.', color: 0x5865f2 }], flags: 4096, allowed_mentions: { parse: [] } }); } catch (e) { throw new Error(`Senden fehlgeschlagen: ${explain(e, cred.shared)}`); }
  return { channel_name: cfg.channel_name };
}

// ---------- Board: Stand, Vorschau, Aktionen (Dialog nach J2) ----------

// Stand für den Dialog. Token und Schlüssel nur maskiert.
export async function boardState(root) {
  const cfg = loadDiscordConfig();
  const shared = isShared(cfg);
  const secret = shared ? loadKey() : loadToken();
  const info = botInfo();
  const [{ projectList }, { commands }] = await Promise.all([import('./hub.mjs'), import('./discord-ui.mjs')]);
  const here = rootIdOf(root);
  const list = projectList().map((p) => ({ rid: rootIdOf(p.path), name: p.name || path.basename(p.path) }));
  if (!list.some((p) => p.rid === here)) list.unshift({ rid: here, name: path.basename(root) });
  const dash = (readJson(dfile('state.json'), null) || {}).dash || {};
  let service = null;
  if (!secret || shared) {
    try { const base = serviceBase(cfg); const i = await serviceInfo(cfg); service = { base, reachable: !!i, invite_url: (i && i.invite_url) || '' }; } catch (e) { service = { base: '', error: e.message }; }
  }
  return {
    mode: secret ? cfg.mode : '', ready: !!secret && !!cfg.channel_id, secret: maskToken(secret),
    bot_name: cfg.bot_name, owner: !!cfg.owner_id,
    guild_id: cfg.guild_id, guild_name: cfg.guild_name, channel_id: cfg.channel_id, channel_name: cfg.channel_name,
    running: info ? { since: info.started } : null,
    autostart: cfg.autostart !== false, auto_enroll: cfg.auto_enroll !== false, commands_on: cfg.commands !== false,
    invite_url: !shared && cfg.app_id ? inviteUrl(cfg.app_id) : (service && service.invite_url) || '',
    service,
    events: EVENT_GROUPS.map(([group, items]) => ({ group, items: items.map(([key, label]) => ({ key, label, ...cfg.events[key] })) })),
    quiet: cfg.quiet, privacy: cfg.privacy, delays: cfg.delays, cleanup: cfg.cleanup,
    // channel_id und channel: eigener Kanal des Projekts, leer im Standardkanal.
    projects: list.map((p) => {
      const own = cfg.projects[p.rid] || {};
      const ch = channelOf(cfg, p.rid);
      const d = dash[ch];
      const mine = ch !== cfg.channel_id;
      return { ...p, here: p.rid === here, enabled: own.enabled !== undefined ? !!own.enabled : cfg.auto_enroll !== false, channel_id: mine ? ch : '', channel: mine ? `#${own.channel_name || ch}` : '', dash: d && d.message_id ? d.at || 1 : 0 };
    }),
    commands: commands({ shared })[0].options.map((o) => ({ cmd: `/works ${(o.name_localizations && o.name_localizations.de) || o.name}`, text: o.description_localizations.de })),
    waiting: readOutbox().length,
  };
}

// Vorschau einer Nachricht mit dem ungespeicherten Stand (draft), mit Beispieldaten aus dem Projekt des Boards.
// ring: klingelt auf dem Handy (Erwähnung ohne Ruhezeit). channel_id und channel: Kanal des Projekts; den Namen
// eines eben erst gewählten Kanals kennt nur die Liste im Dialog.
export async function preview(root, { type = 'perm', draft = {} } = {}) {
  const cfg = loadDiscordConfig();
  for (const [k, v] of Object.entries(draft || {})) applySetting(cfg, k, String(v));
  const bot = await import('./discord-bot.mjs');
  const rid = rootIdOf(root);
  const interactive = cfg.commands !== false;
  const channel_id = channelOf(cfg, rid);
  const where = { channel_id, channel: channel_id === cfg.channel_id ? cfg.channel_name : cfg.projects[rid].channel_name || '' };
  let snap;
  try { snap = bot.snapshotOf(root); } catch { snap = { name: path.basename(root), tasks: {}, queue: [] }; }
  if (type === 'dashboard') return { ...bot.renderDashboard([{ rid, snap }], cfg, { interactive }), ring: false, why: 'Das Dashboard wird nur bearbeitet und klingelt nie.', ...where };
  const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
  const sample = { perm: { tool: 'Bash', what: 'npm test', since: ago(3) }, idle: { since: ago(2) }, review: { crit: [7, 7], cost: '8,20 $' }, ci_red: { sha: '81fe2a0c4d', failed: 1, total: 3, job: 'test (windows)', error: 'AssertionError: expected 3 to be 4', bug: 'W-0011', url: 'https://github.com' } }[type];
  if (!sample) throw new Error('Unbekanntes Ereignis für die Vorschau.');
  const a = snap.active || { id: 'W-0001', title: 'Beispielaufgabe' };
  const body = bot.renderEvent({ type, project: snap.name, id: a.id, title: a.title, ...sample }, cfg, { owner: cfg.owner_id || '0', rid, interactive });
  const e = cfg.events[type];
  const ring = e.on && !(body.flags & 4096);
  const why = !e.on ? 'Ist aus: works schickt dazu keine Nachricht.' : ring ? 'Klingelt, weil @ an ist. In der Ruhezeit käme es still.'
    : e.at ? 'Gerade ist Ruhezeit: kommt still, ohne Hinweis auf dem Sperrbildschirm.' : 'Kommt still, weil @ aus ist. Kein Hinweis auf dem Sperrbildschirm.';
  return { ...body, ring, why, ...where };
}

// Aktionen aus dem Dialog. Nach Token oder Kopplung startet der Bot, wenn er eingerichtet ist (wie beim Board-Start).
export async function boardAction(root, b = {}) {
  const op = String(b.op || '');
  if (op === 'set') {
    const cfg = loadDiscordConfig();
    for (const [k, v] of Object.entries(b.values || {})) applySetting(cfg, k, String(v));
    await checkProjectChannels(cfg);
    saveDiscordConfig(cfg);
    return boardState(root);
  }
  if (op === 'token') { const r = await setToken(b.token); await ensureBot(); return r; }
  if (op === 'link') { const r = await linkCode(b.code); await ensureBot(); return r; }
  if (op === 'disconnect') return disconnect();
  if (op === 'move') return moveChannel(b.channel_id);
  if (op === 'test') return sendTest();
  if (op === 'start') { if (!isConfigured()) throw new Error('Discord-Bot ist nicht eingerichtet.'); return { started: await ensureBot({ force: true }) }; }
  if (op === 'preview') return preview(root, b);
  throw new Error(`Unbekannte Aktion ${op}.`);
}

