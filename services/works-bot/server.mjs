#!/usr/bin/env node
// works-bot (W-0040): the shared Discord bot for works. Runs as a Docker container on a server and is the only place
// that knows the bot token. works installations link themselves with a one-time code from /works link and then post
// through this service with a device key that may only write into its own channel and edit its own messages.
//
// The HTTP API mirrors the Discord routes the local works bot uses, so works needs no second code path:
//   GET  /health                                  liveness
//   GET  /v1/info                                 public: app id, bot name, invite link
//   POST /v1/link {code, device}                  exchange a code for a device key
//   DELETE /v1/link                               revoke the own key
//   GET  /v1/users/@me                            check the key (works calls this at start)
//   POST /v1/channels/:id/messages                new message in the linked channel
//   PATCH /v1/channels/:id/messages/:mid          edit a message created with this key
//   PUT  /v1/channels/:id/messages/pins/:mid      pin a message created with this key
// Status 410 means: the link is broken (bot removed, rights taken away, channel deleted); link again with /works link.
// No dependencies. Discord REST and gateway come from the works plugin (discord-api.mjs).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { Rest, Gateway } from '../../plugins/works/skills/works/scripts/discord-api.mjs';

const env = process.env;
const TOKEN = (env.DISCORD_TOKEN || (env.DISCORD_TOKEN_FILE && fs.existsSync(env.DISCORD_TOKEN_FILE) ? fs.readFileSync(env.DISCORD_TOKEN_FILE, 'utf8') : '')).trim();
const API = (env.DISCORD_API || 'https://discord.com/api/v10').replace(/\/$/, '');
const PORT = Number(env.PORT || 8080);
const HOST = env.HOST || '0.0.0.0';
const DATA = env.DATA_DIR || '/data';
const TRUST_PROXY = env.TRUST_PROXY === '1';
const FAST = env.WORKS_BOT_FAST === '1';
const CODE_TTL = 10 * 60000;
const GUILD_CAP = Number(env.WORKS_BOT_GUILD_CAP || 20);   // devices per server
const MSG_CAP = Number(env.WORKS_BOT_MSG_CAP || 300);      // remembered messages per device
const IDLE_DAYS = 90;                                     // links unused this long expire
const MANAGE_GUILD = 1n << 5n;
const ADMIN = 1n << 3n;
const NEEDED = { 'Kanal sehen / View Channel': 1n << 10n, 'Nachrichten senden / Send Messages': 1n << 11n, 'Links einbetten / Embed Links': 1n << 14n };
const INVITE_PERMISSIONS = String((1n << 10n) | (1n << 11n) | (1n << 14n) | (1n << 16n) | (1n << 51n));
// Per key and minute. The local bot bundles status post edits (at most every 10 s per project).
const LIMITS = { post: 30, patch: 120, pin: 10 };
// Discord codes that mean the bot can no longer use the channel: the link is broken.
const BROKEN = new Set([50001, 50013, 10003]);
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Never logs tokens, keys or message contents.
const log = (...a) => console.log(new Date().toISOString(), ...a);
if (!TOKEN) { log('DISCORD_TOKEN or DISCORD_TOKEN_FILE is missing.'); process.exit(1); }
process.on('unhandledRejection', (e) => log('unhandled:', e && e.message ? e.message : e));

// ---------- Storage: one JSON file in the volume, written atomically ----------
// links:    hash of the key -> link (guild, channel, user, device, times, mids: own message ids, newest last)
// messages: message id -> { h: hash of the key }

const STORE = path.join(DATA, 'links.json');
const store = (() => {
  let raw;
  try { raw = fs.readFileSync(STORE, 'utf8'); } catch { return { codes: {}, links: {}, messages: {} }; }
  try { return { codes: {}, links: {}, messages: {}, ...JSON.parse(raw) }; } catch (e) {
    // Never start empty over a broken file: that would drop every link on the next save.
    log(`links.json in ${DATA} is not valid JSON (${e.message}). Fix or remove it, then start again.`);
    process.exit(1);
  }
})();
for (const l of Object.values(store.links)) if (!Array.isArray(l.mids)) l.mids = [];
let saveTimer = null;
function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = `${STORE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 });
  fs.renameSync(tmp, STORE);
}
const save = () => { if (!saveTimer) saveTimer = setTimeout(() => { try { saveNow(); } catch (e) { log('saving failed:', e.message); save(); } }, FAST ? 20 : 500); };
const hash = (key) => crypto.createHash('sha256').update(key).digest('hex');

function dropLink(h) {
  const l = store.links[h];
  if (!l) return;
  for (const mid of l.mids || []) delete store.messages[mid];
  delete store.links[h];
}

// Remember a message for its key; only the newest MSG_CAP per key, older ones can no longer be edited.
function own(h, mid) {
  const l = store.links[h];
  l.mids = (l.mids || []).filter((x) => x !== mid);
  l.mids.push(mid);
  store.messages[mid] = { h };
  while (l.mids.length > MSG_CAP) delete store.messages[l.mids.shift()];
}

function markBroken(pred, why) {
  let n = 0;
  for (const l of Object.values(store.links)) if (!l.broken && pred(l)) { l.broken = { why, at: new Date().toISOString() }; n++; }
  if (n) { save(); log(`${n} link(s) broken: ${why}`); }
}

function prune() {
  const now = Date.now();
  for (const [c, v] of Object.entries(store.codes)) if (v.expires < now) delete store.codes[c];
  for (const [h, l] of Object.entries(store.links)) if (now - Date.parse(l.seen || l.created) > IDLE_DAYS * 86400000) dropLink(h);
  for (const [ip, list] of fails) { const keep = list.filter((t) => now - t < 3600000); if (keep.length) fails.set(ip, keep); else fails.delete(ip); }
  save();
}

// ---------- Discord ----------

const rest = new Rest({ token: TOKEN, base: API });
let me = null;
let app = null;
let gateway = null;
const guildNames = new Map();
const inviteUrl = () => `https://discord.com/oauth2/authorize?client_id=${app.id}&scope=bot%20applications.commands&permissions=${INVITE_PERMISSIONS}`;

// One pace for all calls to Discord (40 per second), so a burst of clients cannot hit the global limit, and a count
// of failed answers: Discord bans an IP for 10 000 answers with 401, 403 or 429 in 10 minutes. Above 5 000 the
// service pauses posting for everyone instead.
let nextSlot = 0;
async function pace() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + 25;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}
const bad = [];
const badRecent = () => { const cut = Date.now() - 600000; while (bad.length && bad[0] < cut) bad.shift(); return bad.length; };
async function discord(fn) {
  if (badRecent() > 5000) throw Object.assign(new Error('paused, too many failed Discord answers'), { status: 503, paused: true });
  await pace();
  try { return await fn(); } catch (e) {
    if ([401, 403, 429].includes(e.status)) bad.push(Date.now());
    throw e;
  }
}

async function guildName(id) {
  if (guildNames.has(id)) return guildNames.get(id);
  // Do not hold up linking: the client gives up after 15 s.
  const name = await Promise.race([discord(() => rest.get(`/guilds/${id}`)).then((g) => g.name || '').catch(() => ''), new Promise((r) => setTimeout(() => r(''), 3000))]);
  if (name) guildNames.set(id, name);
  return name;
}

// English names with German localisations (W-0041: English by default, language switchable).
const COMMANDS = [{
  name: 'works', type: 1, contexts: [0], default_member_permissions: '32',
  description: 'Link works to this channel', description_localizations: { de: 'works mit diesem Kanal koppeln' },
  options: [
    { type: 1, name: 'link', name_localizations: { de: 'verbinden' }, description: 'Get a one-time code to link works to this channel', description_localizations: { de: 'Einmaligen Code erzeugen, um works mit diesem Kanal zu koppeln' } },
    { type: 1, name: 'unlink', name_localizations: { de: 'trennen' }, description: 'Disconnect all devices from this channel', description_localizations: { de: 'Alle Geräte in diesem Kanal trennen' } },
    { type: 1, name: 'status', description: 'Show the linked devices', description_localizations: { de: 'Gekoppelte Geräte zeigen' } },
  ],
}];

function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

async function onInteraction(i) {
  if (!i || i.type !== 2 || !i.data || i.data.name !== 'works') return;
  const de = String(i.locale || i.guild_locale || '').startsWith('de');
  const t = (g, e) => (de ? g : e);
  // Interaction callbacks do not count towards the bot's limits and must arrive within 3 s: no pace here.
  const reply = (embed) => rest.post(`/interactions/${i.id}/${i.token}/callback`, { type: 4, data: { embeds: [{ color: 0x5865f2, ...embed }], flags: 64, allowed_mentions: { parse: [] } } })
    .catch((e) => log('reply failed:', e.message));
  const sub = (i.data.options && i.data.options[0] && i.data.options[0].name) || '';
  if (!i.guild_id || !i.member) return reply({ title: t('Nur in einem Server', 'Only in a server'), description: t('/works geht nur in einem Kanal eines Servers.', '/works only works in a server channel.') });
  const perms = BigInt(i.member.permissions || '0');
  if (!(perms & MANAGE_GUILD) && !(perms & ADMIN)) return reply({ title: t('Keine Berechtigung', 'Not allowed'), description: t('Dafür brauchst du das Recht „Server verwalten“.', 'You need the “Manage Server” permission for this.') });
  const channel = { id: i.channel_id, name: (i.channel && i.channel.name) || '' };
  if (sub === 'link') {
    // Only hand out a code when the bot can actually post here, and only up to GUILD_CAP devices per server.
    const app = BigInt(i.app_permissions || '0');
    const missing = Object.entries(NEEDED).filter(([, bit]) => !(app & bit) && !(app & ADMIN)).map(([name]) => name.split(' / ')[de ? 0 : 1]);
    if (missing.length) return reply({ title: t('Dem Bot fehlen Rechte', 'The bot is missing permissions'), description: t(`In #${channel.name} fehlt works: ${missing.join(', ')}. Bitte in den Kanaleinstellungen erlauben, dann /works verbinden erneut.`, `In #${channel.name} works lacks: ${missing.join(', ')}. Allow it in the channel settings, then run /works link again.`) });
    const count = Object.values(store.links).filter((l) => l.guild_id === i.guild_id && !l.broken).length;
    if (count >= GUILD_CAP) return reply({ title: t('Zu viele Geräte', 'Too many devices'), description: t(`Auf diesem Server sind schon ${count} Geräte gekoppelt. Erst mit /works trennen in einem Kanal Platz machen.`, `${count} devices are already linked on this server. Free a slot with /works unlink in a channel first.`) });
    const code = newCode();
    store.codes[code] = { guild_id: i.guild_id, channel_id: channel.id, channel_name: channel.name, user_id: i.member.user.id, expires: Date.now() + CODE_TTL };
    save();
    log(`code issued for guild ${i.guild_id}`);
    return reply({
      title: t('Code für works', 'Code for works'),
      description: t(`Gib diesen Code in works ein, um #${channel.name || 'diesen Kanal'} zu koppeln:\n\n# \`${code}\`\n\nIm Terminal: \`works discord link ${code}\``, `Enter this code in works to link #${channel.name || 'this channel'}:\n\n# \`${code}\`\n\nIn a terminal: \`works discord link ${code}\``),
      footer: { text: t('Gültig 10 Minuten, nur einmal verwendbar', 'Valid for 10 minutes, single use') },
    });
  }
  if (sub === 'unlink') {
    let n = 0;
    for (const [h, l] of Object.entries(store.links)) if (l.guild_id === i.guild_id && l.channel_id === channel.id) { dropLink(h); n++; }
    save();
    log(`unlinked ${n} device(s) in guild ${i.guild_id}`);
    return reply({ title: t('Getrennt', 'Disconnected'), description: t(`${n} Gerät(e) in #${channel.name} getrennt. Sie können nicht mehr schreiben.`, `${n} device(s) in #${channel.name} disconnected. They can no longer post.`) });
  }
  if (sub === 'status') {
    const list = Object.values(store.links).filter((l) => l.guild_id === i.guild_id);
    const line = (l) => `#${l.channel_name || l.channel_id} · ${l.device || '?'} · ${t('zuletzt', 'last seen')} <t:${Math.floor(Date.parse(l.seen || l.created) / 1000)}:R>${l.broken ? t(' · kaputt, neu koppeln', ' · broken, link again') : ''}`;
    return reply({ title: t('Gekoppelte Geräte', 'Linked devices'), description: list.length ? list.slice(0, 25).map(line).join('\n') : t('Keine.', 'None.') });
  }
  return reply({ title: '?', description: t('Unbekannter Befehl.', 'Unknown command.') });
}

// Bot removed from a server, or a channel deleted: links there are broken.
function onDispatch(type, d) {
  if (type === 'INTERACTION_CREATE') onInteraction(d).catch((e) => log('interaction failed:', e.message));
  else if (type === 'GUILD_DELETE' && d && !d.unavailable) markBroken((l) => l.guild_id === d.id, 'bot removed from the server');
  else if (type === 'CHANNEL_DELETE' && d) markBroken((l) => l.channel_id === d.id, 'channel deleted');
}

// ---------- HTTP API ----------

const fails = new Map();
const rates = new Map();
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
const err = (res, code, message, extra = {}) => send(res, code, { message, code: extra.code || 0, ...extra });

// Client address for the limit on wrong codes. Behind a proxy the last X-Forwarded-For entry is the one the proxy
// added; earlier entries come from the client and can be anything. IPv6 counts per /64.
function clientIp(req) {
  let ip = req.socket.remoteAddress || '';
  if (TRUST_PROXY && req.headers['x-forwarded-for']) {
    const last = String(req.headers['x-forwarded-for']).split(',').pop().trim();
    if (net.isIP(last)) ip = last;
  }
  ip = ip.replace(/^::ffff:(?=\d+\.)/, '');
  if (net.isIP(ip) === 6) ip = `${ip.split(':').slice(0, 4).join(':')}::/64`;
  return ip || '?';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 64 * 1024) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { const s = Buffer.concat(chunks).toString('utf8'); if (!s) return resolve({}); try { const j = JSON.parse(s); resolve(j && typeof j === 'object' ? j : {}); } catch { reject(Object.assign(new Error('invalid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}

function auth(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer (wk_[\w-]{20,})$/);
  if (!m) return null;
  const h = hash(m[1]);
  const link = store.links[h];
  if (!link) return null;
  if (!link.seen || Date.now() - Date.parse(link.seen) > 60000) { link.seen = new Date().toISOString(); save(); }
  return { h, link };
}

function limited(h, kind) {
  const now = Date.now();
  const k = `${h}:${kind}`;
  const list = (rates.get(k) || []).filter((t) => now - t < 60000);
  if (list.length >= LIMITS[kind]) { rates.set(k, list); return Math.ceil((60000 - (now - list[0])) / 1000); }
  list.push(now); rates.set(k, list);
  return 0;
}

// Only what works needs, and never more than it may: mentions only for the linked user, no @everyone,
// only link buttons, only the "silent" flag.
function sanitize(body, link, create) {
  const out = {};
  if (typeof body.content === 'string') out.content = body.content.slice(0, 2000);
  if (Array.isArray(body.embeds)) out.embeds = body.embeds.slice(0, 10);
  if (Array.isArray(body.components)) {
    out.components = body.components.slice(0, 5).map((row) => ({ type: 1, components: (Array.isArray(row && row.components) ? row.components : []).filter((c) => c && c.type === 2 && c.style === 5 && /^https:\/\//.test(c.url || '')).slice(0, 5).map((c) => ({ type: 2, style: 5, label: String(c.label || '').slice(0, 80), url: c.url })) })).filter((row) => row.components.length);
  }
  const users = body.allowed_mentions && Array.isArray(body.allowed_mentions.users) ? body.allowed_mentions.users.filter((u) => u === link.user_id) : [];
  out.allowed_mentions = { parse: [], users };
  if (create) out.flags = Number(body.flags || 0) & 4096;
  return out;
}

// Calls Discord for a client. Returns { ok: true, data } or sends the error itself and returns { ok: false }.
// Discord rejecting the bot token (401) is the operator's problem: clients hear "try later", not "key invalid".
// Missing access to the channel breaks the link (410), so the client stops instead of failing forever.
async function forward(res, a, fn, { pin = false } = {}) {
  try { return { ok: true, data: await discord(fn) }; } catch (e) {
    if (e.paused) err(res, 503, 'Service paused, try again later', { retry_after: 60 });
    else if (e.retry) err(res, 502, 'Discord not reachable, try again later');
    else if (e.status === 401) { log('Discord rejects the bot token. Check DISCORD_TOKEN.'); err(res, 503, 'Service unavailable, try again later', { retry_after: 60 }); }
    else if (!pin && BROKEN.has(e.code)) { markBroken((l) => l === a.link, `Discord ${e.code}`); err(res, 410, 'Link broken: the bot can no longer use this channel. Link again with /works link.', { code: 'link_broken' }); }
    else err(res, e.status || 502, e.message.replace(/^Discord \d+: /, ''), { code: e.code || 0 });
    return { ok: false };
  }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  let m;
  if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true, gateway: !!(gateway && gateway.ready) });
  if (req.method === 'GET' && p === '/v1/info') return send(res, 200, { app_id: app.id, bot_name: me.username, invite_url: inviteUrl() });
  if (req.method === 'POST' && p === '/v1/link') {
    const ip = clientIp(req);
    const recent = () => (fails.get(ip) || []).filter((t) => Date.now() - t < 3600000);
    const blocked = () => { const r = recent(); return r.length >= 5 ? Math.ceil((3600000 - (Date.now() - r[0])) / 1000) : 0; };
    if (blocked()) return err(res, 429, 'Too many wrong codes, try again later', { retry_after: blocked() });
    const body = await readBody(req);
    // Read the count again after the body: parallel requests must not slip through on an old count.
    if (blocked()) return err(res, 429, 'Too many wrong codes, try again later', { retry_after: blocked() });
    const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2');
    const c = Object.hasOwn(store.codes, code) ? store.codes[code] : null;
    if (!c || c.expires < Date.now()) {
      // Neu einreihen (delete, dann set), damit die Map nach Alter sortiert bleibt.
      const list = [...recent(), Date.now()];
      fails.delete(ip);
      fails.set(ip, list);
      // Bounded: the oldest addresses go first.
      while (fails.size > 20000) fails.delete(fails.keys().next().value);
      return err(res, 400, 'Code invalid or expired');
    }
    delete store.codes[code];
    const key = `wk_${crypto.randomBytes(32).toString('base64url')}`;
    const now = new Date().toISOString();
    const link = { guild_id: c.guild_id, guild_name: await guildName(c.guild_id), channel_id: c.channel_id, channel_name: c.channel_name, user_id: c.user_id, device: String(body.device || '').slice(0, 60), created: now, seen: now, mids: [] };
    store.links[hash(key)] = link;
    saveNow();
    log(`device linked in guild ${c.guild_id}`);
    return send(res, 200, { key, guild_id: link.guild_id, guild_name: link.guild_name, channel_id: link.channel_id, channel_name: link.channel_name, owner_id: link.user_id, app_id: app.id, bot_name: me.username });
  }
  const a = auth(req);
  if (!a) return err(res, 401, '401: Unauthorized');
  if (req.method === 'DELETE' && p === '/v1/link') { dropLink(a.h); saveNow(); log(`device unlinked in guild ${a.link.guild_id}`); return send(res, 200, { ok: true }); }
  if (a.link.broken) return err(res, 410, 'Link broken: the bot can no longer use this channel. Link again with /works link.', { code: 'link_broken' });
  if (req.method === 'GET' && p === '/v1/users/@me') return send(res, 200, { id: me.id, username: me.username, discriminator: me.discriminator || '0', bot: true, link: { guild_name: a.link.guild_name, channel_id: a.link.channel_id, channel_name: a.link.channel_name } });
  if ((m = p.match(/^\/v1\/channels\/(\d+)\/messages(?:\/(pins\/)?(\d+))?$/))) {
    const [, cid, pin, mid] = m;
    if (cid !== a.link.channel_id) return err(res, 403, 'Missing Access', { code: 50001 });
    if (mid && (!Object.hasOwn(store.messages, mid) || store.messages[mid].h !== a.h)) return err(res, 403, 'Cannot edit a message of another device', { code: 50005 });
    const kind = req.method === 'POST' && !mid ? 'post' : req.method === 'PATCH' && mid && !pin ? 'patch' : req.method === 'PUT' && mid && pin ? 'pin' : '';
    if (!kind) return err(res, 404, 'Not found');
    const wait = limited(a.h, kind);
    if (wait) return err(res, 429, 'You are being rate limited.', { retry_after: wait });
    const body = kind === 'pin' ? {} : await readBody(req);
    if (kind === 'post') {
      const r = await forward(res, a, () => rest.post(`/channels/${cid}/messages`, sanitize(body, a.link, true)));
      if (!r.ok) return undefined;
      own(a.h, r.data.id);
      save();
      return send(res, 200, { id: r.data.id, channel_id: cid });
    }
    if (kind === 'patch') {
      const r = await forward(res, a, () => rest.patch(`/channels/${cid}/messages/${mid}`, sanitize(body, a.link, false)));
      if (!r.ok) return undefined;
      own(a.h, mid); // edited messages stay owned (the status post lives for months)
      save();
      return send(res, 200, { id: mid, channel_id: cid });
    }
    const r = await forward(res, a, () => rest.put(`/channels/${cid}/messages/pins/${mid}`), { pin: true });
    if (!r.ok) return undefined;
    own(a.h, mid);
    save();
    return send(res, 204);
  }
  return err(res, 404, 'Not found');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => { if (!res.headersSent) err(res, e.status || 500, e.status ? e.message : 'Internal error'); if (!e.status) log('error:', e.message); });
});

// ---------- Start ----------

async function retrying(what, fn) {
  for (let wait = 1000; ; wait = Math.min(wait * 2, 60000)) {
    try { return await fn(); } catch (e) {
      if (e.status === 401) { log('The bot token is invalid.'); process.exit(1); }
      log(`${what}: Discord not reachable (${e.message}), retry in ${wait / 1000} s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function start() {
  me = await retrying('start', () => rest.get('/users/@me'));
  app = await retrying('start', () => rest.get('/oauth2/applications/@me'));
  try { await rest.put(`/applications/${app.id}/commands`, COMMANDS); } catch (e) { log('registering /works failed:', e.message); }
  const g = await retrying('gateway', () => rest.get('/gateway/bot'));
  gateway = new Gateway({ token: TOKEN, url: g.url, intents: 1, log: (s) => log(s), onFatal: (code) => { log(`gateway closed for good (code ${code})`); process.exit(1); }, onDispatch });
  gateway.start();
  setInterval(prune, FAST ? 1000 : 60000).unref();
  server.listen(PORT, HOST, () => log(`works-bot ${me.username} listening on ${HOST}:${PORT}`));
}

const stop = () => { log('stopping'); if (gateway) gateway.stop(); try { saveNow(); } catch { /* read-only */ } server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
start().catch((e) => { log('start failed:', e.message); process.exit(1); });
