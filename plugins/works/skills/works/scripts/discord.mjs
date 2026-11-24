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
  if (parts.length === 1 && ['autostart', 'auto_enroll'].includes(a)) { cfg[a] = bool(value); return; }
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
  throw new Error(`Unbekannte Einstellung ${key}. Möglich: autostart, auto_enroll, service, delay.perm, delay.idle, quiet.on, quiet.from, quiet.to, privacy.commands|costs|ci_error|titles, cleanup.hours, event.<name>[.at]`);
}

