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
import { tr, language } from './i18n.mjs';
import { isAlive, stopProcess, newestCli, cliVersion } from './server-control.mjs';

export const discordDir = () => path.join(os.homedir(), '.works', 'discord');
export const dfile = (name) => path.join(discordDir(), name);

// Rechte für die Einladung: Kanal sehen, senden, Links einbetten, Verlauf lesen, anheften. Nicht mehr.
export const INVITE_PERMISSIONS = String((1n << 10n) | (1n << 11n) | (1n << 14n) | (1n << 16n) | (1n << 51n));

// Ereignisse: on = senden, at = mit Erwähnung (klingelt). Gruppen wie im Entwurf J2, Namen für das Board in eventNames.
export const EVENT_GROUPS = [
  ['need', ['perm', 'idle', 'question']],
  ['results', ['review', 'shipped', 'done', 'returned']],
  ['ci', ['ci_red', 'ci_green']],
  ['plan', ['p1', 'queue_empty', 'report_day', 'report_week']],
];
const eventNames = () => ({
  need: tr('Claude needs you'), results: tr('Results'), ci: 'CI', plan: tr('Planning and reports'),
  perm: tr('Approval waiting'), idle: tr('Done, waiting for you'), question: tr('Question asked'),
  review: tr('In review'), shipped: tr('Shipped'), done: tr('Done without ship'), returned: tr('Returned'),
  ci_red: tr('Red, bug created'), ci_green: tr('Green again'),
  p1: tr('New P1'), queue_empty: tr('Queue empty'), report_day: tr('End-of-day report'), report_week: tr('Weekly report'),
});
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
  events: Object.fromEntries(EVENT_GROUPS.flatMap(([, list]) => list.map((k) => [k, { on: !OFF.has(k), at: AT.has(k) }]))),
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
  try { u = new URL(o); } catch { throw new Error(tr('WORKS_DISCORD_API is not a valid address.')); }
  if (!LOOPBACK.includes(u.hostname) || u.protocol !== 'http:') throw new Error(tr('WORKS_DISCORD_API may only point to this computer (http://127.0.0.1:...).'));
  return o.replace(/\/$/, '');
}

// Adresse des gemeinsamen Bots (Dienst works-bot). Fest hinterlegt, sobald er läuft; einstellbar mit
// works discord set service=https://…, für Tests auch über WORKS_DISCORD_SERVICE. Nur https, außer auf diesem Rechner.
export const DEFAULT_SERVICE = '';
export function serviceBase(cfg = loadDiscordConfig()) {
  const o = process.env.WORKS_DISCORD_SERVICE || cfg.service || DEFAULT_SERVICE;
  if (!o) throw new Error(tr('The shared bot has no address yet. Set it with works discord set service=https://…'));
  let u;
  try { u = new URL(o); } catch { throw new Error(tr('Invalid address of the shared bot: {url}', { url: o })); }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOOPBACK.includes(u.hostname))) throw new Error(tr('The shared bot needs https (http only on this computer).'));
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
  const bool = (v) => { if (/^(true|an|on|ja|1)$/i.test(v)) return true; if (/^(false|aus|off|nein|0)$/i.test(v)) return false; throw new Error(tr('{key}: expected on or off, not "{v}".', { key, v })); };
  const [a, b, c] = parts;
  if (parts.length === 1 && ['autostart', 'auto_enroll', 'commands'].includes(a)) { cfg[a] = bool(value); return; }
  if (parts.length === 1 && a === 'service') {
    if (value) serviceBase({ service: value });
    cfg.service = value.replace(/\/$/, '');
    return;
  }
  if (a === 'delays' && b in DEFAULTS.delays && parts.length === 2) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 3600) throw new Error(tr('{key}: seconds from 0 to 3600.', { key }));
    cfg.delays[b] = n; return;
  }
  if (a === 'quiet' && parts.length === 2) {
    if (b === 'on') { cfg.quiet.on = bool(value); return; }
    if (b === 'from' || b === 'to') { if (!TIME.test(value)) throw new Error(tr('{key}: time as HH:MM.', { key })); cfg.quiet[b] = value; return; }
  }
  if (a === 'privacy' && b in DEFAULTS.privacy && parts.length === 2) { cfg.privacy[b] = bool(value); return; }
  if (a === 'cleanup' && b === 'hours' && parts.length === 2) {
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 720) throw new Error(tr('{key}: hours from 0 (never delete) to 720.', { key }));
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
    if (v && isShared(cfg)) throw new Error(tr('{key}: a channel per project only exists with your own bot. The shared bot writes to exactly one channel, the linked one.', { key }));
    if (v && !/^\d{1,25}$/.test(v)) throw new Error(tr('{key}: channel ID expected (works discord channel shows the channels), empty for the default channel.', { key }));
    const p = { ...(cfg.projects[b] || {}) };
    if (!v || v === cfg.channel_id) { delete p.channel_id; delete p.channel_name; } else if (p.channel_id !== v) Object.assign(p, { channel_id: v, channel_name: '' });
    cfg.projects[b] = p;
    return;
  }
  throw new Error(tr('Unknown setting {key}. Possible: {list}', { key, list: 'autostart, auto_enroll, commands, service, delay.perm, delay.idle, quiet.on, quiet.from, quiet.to, privacy.commands|costs|ci_error|titles, cleanup.hours, event.<name>[.at], project.<id>, project.<id>.channel' }));
}

// ---------- Einrichtung, Kanalwahl und Stand: gemeinsam für CLI und Board (W-0038) ----------
// Fehler tragen eine Meldung für den Nutzer, nie Token, Schlüssel oder Code.

const discordApi = () => import('./discord-api.mjs');

// Discord-Fehler in Worte fassen: 401 Token oder Schlüssel abgelehnt, 410 Kopplung kaputt, nicht erreichbar, zu viele Anfragen.
export function explain(e, shared) {
  if (e.status === 401) return shared ? tr('The service rejects the device key (disconnected?).') : tr('Discord rejects the token.');
  if (e.status === 410) return tr('Link broken (bot removed, permissions revoked or channel deleted). Link again with /works link.');
  if (e.net !== undefined) return tr('Discord not reachable: {reason}', { reason: e.net === 'timeout' ? tr('timeout') : e.net });
  if (e.status === 429 && e.retry) return tr('Discord: too many requests, try again later');
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
  if (!t) throw new Error(tr('No token entered.'));
  if (/\s/.test(t) || t.length < 20) throw new Error(tr('Invalid token: that does not look like a bot token.'));
  const { Rest } = await discordApi();
  const rest = new Rest({ token: t, base: apiBase() });
  let me; let app;
  try { me = await rest.get('/users/@me'); app = await rest.get('/oauth2/applications/@me'); } catch (e) { throw new Error(e.status === 401 ? tr('Invalid token: Discord rejects it.') : e.net !== undefined ? explain(e, false) : tr('Discord not reachable: {reason}', { reason: e.message })); }
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
  if (!code) throw new Error(tr('No code entered. /works link in Discord gives you the code, in the channel works should write to.'));
  const cfg = loadDiscordConfig();
  const base = serviceBase(cfg);
  let r;
  try { r = await fetch(`${base}/v1/link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, device }), signal: AbortSignal.timeout(15000) }); } catch (e) { throw new Error(tr('The shared bot is not reachable: {reason}', { reason: e.message })); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 429 ? tr('Too many wrong codes, try again later.') : tr('Linking failed: {reason}. Get a new code in Discord with /works link.', { reason: j.message || `HTTP ${r.status}` }));
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

const MISSING = () => ({ view: tr('cannot see the channel'), send: tr('may not send'), embed: tr('may not embed links') });

// Server und Textkanäle live vom Bot (Kanalwahl nach K). Eigener Bot: REST mit dem Token, alle Server. Gemeinsamer
// Bot: der Dienst, nur der gekoppelte Server. why: warum der Bot in einem Kanal nicht schreiben darf.
export async function channelsOf(cfg = loadDiscordConfig()) {
  const why = MISSING();
  const withWhy = (list) => list.map((c) => ({ ...c, why: c.can ? '' : c.missing.map((k) => why[k] || k).join(', ') }));
  if (isShared(cfg)) {
    if (!loadKey()) throw new Error(tr('Not linked with the shared bot.'));
    let r;
    try { r = await (await serviceRest(cfg)).get('/guild/channels'); } catch (e) { throw new Error(e.status === 404 ? tr('The shared bot does not know channel selection yet (older version).') : explain(e, true)); }
    return { mode: 'shared', channel_id: cfg.channel_id, guilds: [{ id: r.guild_id, name: r.guild_name || cfg.guild_name, channels: withWhy(r.channels || []) }] };
  }
  const token = loadToken();
  if (!token) throw new Error(tr('Discord bot is not set up. works discord shows the steps.'));
  const { Rest, guildChannels } = await discordApi();
  const rest = new Rest({ token, base: apiBase() });
  const get = (p) => rest.get(p);
  try {
    const [me, guilds] = await Promise.all([get('/users/@me'), get('/users/@me/guilds')]);
    const out = [];
    for (const g of guilds.slice(0, 10)) out.push({ id: g.id, name: g.name, channels: withWhy(await guildChannels(get, g.id, me.id)) });
    return { mode: 'own', channel_id: cfg.channel_id, guilds: out };
  } catch (e) { throw new Error(tr('Channels not readable: {reason}', { reason: explain(e, false) })); }
}

// Kanal aus der Liste vom Bot, in den er schreiben darf; sonst ein Fehler mit Grund.
function writable(list, cid) {
  const hit = list.guilds.flatMap((g) => g.channels.map((c) => ({ ...c, guild: g }))).find((c) => c.id === cid);
  if (!hit) throw new Error(tr('Channel {id} not found. Reload the list or use works discord channel.', { id: cid }));
  if (!hit.can) throw new Error(tr('#{name}: the bot {why}. Change the channel permissions in Discord or pick another one.', { name: hit.name, why: hit.why }));
  return hit;
}

// Kanal je Projekt (W-0046): neu gesetzte Kanäle (noch ohne Namen) gegen die Liste vom Bot prüfen und benennen.
// Ohne neue fragt works Discord nicht; beim gemeinsamen Bot gelten eigene Kanäle ohnehin nicht.
export async function checkProjectChannels(cfg) {
  const fresh = isShared(cfg) ? [] : Object.values(cfg.projects).filter((p) => p.channel_id && !p.channel_name);
  if (!fresh.length) return;
  const list = await channelsOf(cfg);
  for (const p of fresh) p.channel_name = writable(list, p.channel_id).name;
}

// Dashboard und Hinweise in einen anderen Kanal („Hierher verschieben“). Gemeinsamer Bot: erst die Kopplung beim
// Dienst umziehen. Der laufende Bot liest config.json bei jedem Durchgang, legt das Dashboard im neuen Kanal an und
// löscht das alte (dashboards in discord-bot.mjs), ohne Neustart. list: schon gelesene Kanäle (channelsOf).
export async function moveChannel(id, list = null) {
  const cid = String(id || '');
  if (!/^\d{1,25}$/.test(cid)) throw new Error(tr('No channel chosen.'));
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
  if (!isConfigured(cfg)) throw new Error(tr('Discord bot is not set up. works discord shows the steps.'));
  const cred = credential(cfg);
  const { Rest } = await discordApi();
  const rest = new Rest({ token: cred.secret, base: cred.base, scheme: cred.scheme });
  // Die Testnachricht steht im Kanal: globale Sprache wie alle Nachrichten des Bots (W-0041).
  const lang = language(null);
  try { await rest.post(`/channels/${cfg.channel_id}/messages`, { embeds: [{ title: tr('Test message from works', null, lang), description: tr('If you can see this, the connection works.', null, lang), color: 0x5865f2 }], flags: 4096, allowed_mentions: { parse: [] } }); } catch (e) { throw new Error(tr('Sending failed: {reason}', { reason: explain(e, cred.shared) })); }
  return { channel_name: cfg.channel_name };
}

// ---------- Board: Stand, Vorschau, Aktionen (Dialog nach J2) ----------

// Stand für den Dialog. Token und Schlüssel nur maskiert.
export async function boardState(root) {
  const cfg = loadDiscordConfig();
  const shared = isShared(cfg);
  const secret = shared ? loadKey() : loadToken();
  const info = botInfo();
  const [{ projectList }, { commands, tr: trUi }] = await Promise.all([import('./hub.mjs'), import('./discord-ui.mjs')]);
  const here = rootIdOf(root);
  const list = projectList().map((p) => ({ rid: rootIdOf(p.path), name: p.name || path.basename(p.path) }));
  if (!list.some((p) => p.rid === here)) list.unshift({ rid: here, name: path.basename(root) });
  const dash = (readJson(dfile('state.json'), null) || {}).dash || {};
  const names = eventNames();
  const ui = trUi(language(root));
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
    events: EVENT_GROUPS.map(([group, items]) => ({ group: names[group], items: items.map((key) => ({ key, label: names[key], ...cfg.events[key] })) })),
    quiet: cfg.quiet, privacy: cfg.privacy, delays: cfg.delays, cleanup: cfg.cleanup,
    // channel_id und channel: eigener Kanal des Projekts, leer im Standardkanal.
    projects: list.map((p) => {
      const own = cfg.projects[p.rid] || {};
      const ch = channelOf(cfg, p.rid);
      const d = dash[ch];
      const mine = ch !== cfg.channel_id;
      return { ...p, here: p.rid === here, enabled: own.enabled !== undefined ? !!own.enabled : cfg.auto_enroll !== false, channel_id: mine ? ch : '', channel: mine ? `#${own.channel_name || ch}` : '', dash: d && d.message_id ? d.at || 1 : 0 };
    }),
    // Befehle in der Sprache des Boards; Discord zeigt sie in der Sprache des Clients.
    commands: commands({ shared })[0].options.map((o) => ({ cmd: `/works ${ui((o.name_localizations && o.name_localizations.de) || o.name, o.name)}`, text: ui(o.description_localizations.de, o.description) })),
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
  // Die Nachricht selbst wie im Kanal in der globalen Sprache, die Erklärungen in der des Boards (W-0041).
  if (type === 'dashboard') return { ...bot.renderDashboard([{ rid, snap }], cfg, { interactive }), ring: false, why: tr('The dashboard is only edited and never rings.'), ...where };
  const lang = language(null);
  const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
  const { fmtCost } = await import('./usage.mjs');
  const sample = { perm: { tool: 'Bash', what: 'npm test', since: ago(3) }, idle: { since: ago(2) }, review: { crit: [7, 7], cost: fmtCost(8.2, 'USD', lang) }, ci_red: { sha: '81fe2a0c4d', failed: 1, total: 3, job: 'test (windows)', error: 'AssertionError: expected 3 to be 4', bug: 'W-0011', url: 'https://github.com' } }[type];
  if (!sample) throw new Error(tr('Unknown event for the preview.'));
  const a = snap.active || { id: 'W-0001', title: tr('Sample task', null, lang) };
  const body = bot.renderEvent({ type, project: snap.name, id: a.id, title: a.title, ...sample }, cfg, { owner: cfg.owner_id || '0', rid, interactive });
  const e = cfg.events[type];
  const ring = e.on && !(body.flags & 4096);
  const why = !e.on ? tr('Off: works sends no message for this.') : ring ? tr('Rings because @ is on. During quiet hours it would arrive silently.')
    : e.at ? tr('Quiet hours right now: arrives silently, without a notification on the lock screen.') : tr('Arrives silently because @ is off. No notification on the lock screen.');
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
  if (op === 'start') { if (!isConfigured()) throw new Error(tr('Discord bot is not set up.')); return { started: await ensureBot({ force: true }) }; }
  if (op === 'preview') return preview(root, b);
  throw new Error(tr('Unknown action {op}.', { op }));
}

