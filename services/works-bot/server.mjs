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
//   DELETE /v1/channels/:id/messages/:mid         delete a message created with this key (W-0044)
//   GET  /v1/inbox?wait=s                         commands and clicks for this device (long poll, W-0037)
//   POST /v1/interactions/:id/reply               answer one of them (the interaction token stays here)
// Status 410 means: the link is broken (bot removed, rights taken away, channel deleted); link again with /works link.
// No dependencies. Discord REST and gateway, commands, help and dialogs come from the works plugin
// (discord-api.mjs, discord-ui.mjs).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { Rest, Gateway } from '../../plugins/works/skills/works/scripts/discord-api.mjs';
import { commands, helpMessage, modalFor, parseCid, MODAL, CID_RE, who, subOf, ephemeral, notOwner } from '../../plugins/works/skills/works/scripts/discord-ui.mjs';

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
const LIMITS = { post: 30, patch: 120, pin: 10, del: 60, reply: 60 };
// A command or click waits this long for its device to fetch it, then this long for the answer (W-0037).
const PICKUP = FAST ? 2000 : 10000;
const ANSWER = FAST ? 20000 : 120000;
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

function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// ---------- Commands and buttons (W-0037) ----------
// The device has no gateway: commands and clicks wait in an inbox per key, the device fetches them with a long poll
// and answers through the service. The interaction token never leaves the service.
// A request counts as fetched only when the device acknowledges it with its next poll (?ack=ids): an answer that
// got lost on the way comes again instead of vanishing.
const inbox = new Map();    // key hash -> interactions for the device
const inflight = new Map(); // key hash -> interactions sent, not yet acknowledged
const waiting = new Map();  // key hash -> { res, timer } of the open long poll
const pending = new Map();  // interaction id -> { token, h, de, delivered, timer }
// Answers to clicks are messages of their own, visible only to the clicker; clicks on their buttons go back to the
// device that answered. Kept apart from the channel messages and only in memory, so they never push those out.
const answers = new Map();  // message id of an answer -> key hash

const editOriginal = (token, data) => discord(() => rest.patch(`/webhooks/${app.id}/${token}/messages/@original`, data));

function markDelivered(id) {
  const p = pending.get(id);
  if (!p || p.delivered) return;
  p.delivered = true;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => expire(id), ANSWER);
}

// Nobody fetched or answered in time: say so instead of leaving Discord "thinking".
function expire(id) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  for (const m of [inbox, inflight]) {
    const list = m.get(p.h);
    if (list) { const keep = list.filter((x) => x.id !== id); if (keep.length) m.set(p.h, keep); else m.delete(p.h); }
  }
  const t = (g, e) => (p.de ? g : e);
  // A device that never asked for its inbox runs a works without commands and buttons.
  const old = store.links[p.h] && !store.links[p.h].polled;
  editOriginal(p.token, {
    embeds: [{ color: 0x80848e, title: t('works antwortet nicht', 'works does not answer'),
      description: p.delivered ? t('Das Gerät hat die Anfrage abgeholt, aber nicht geantwortet. Bitte später noch einmal.', 'The device picked up the request but did not answer. Please try again later.')
        : old ? t('works auf dem gekoppelten Rechner kennt noch keine Befehle und Knöpfe. Bitte works aktualisieren (Plugin-Update), dann geht es.', 'works on the linked computer does not know commands and buttons yet. Please update works (plugin update), then it works.')
          : t('Das gekoppelte Gerät ist gerade nicht erreichbar. Läuft der Rechner mit works? Der Bot startet mit dem Board oder einer Claude-Sitzung.', 'The linked device is not reachable right now. Is the computer with works running? The bot starts with the board or a Claude session.') }],
    allowed_mentions: { parse: [] },
  }).catch((e) => log('answer for a missing device failed:', e.message));
}

function deliver(h) {
  const w = waiting.get(h);
  const items = inbox.get(h);
  if (!w || !items || !items.length) return;
  waiting.delete(h);
  clearTimeout(w.timer);
  inbox.delete(h);
  inflight.set(h, [...(inflight.get(h) || []), ...items]);
  send(w.res, 200, { interactions: items });
}

// Next poll of a device: acknowledged requests are fetched, the rest of the last answer comes again first.
function acknowledge(h, ack) {
  const sent = inflight.get(h) || [];
  inflight.delete(h);
  const ids = new Set(ack);
  for (const x of sent) if (ids.has(x.id)) markDelivered(x.id);
  const again = sent.filter((x) => !ids.has(x.id) && pending.has(x.id));
  if (again.length) inbox.set(h, [...again, ...(inbox.get(h) || [])]);
}

// Only what the device needs: no token, no member list, no permissions.
function toDevice(h, i, de) {
  if ((inbox.get(h) || []).length >= 50) expire(inbox.get(h)[0].id);
  const list = inbox.get(h) || [];
  list.push({ id: i.id, type: i.type, application_id: i.application_id, data: i.data, locale: i.locale || '', guild_locale: i.guild_locale || '', guild_id: i.guild_id, channel_id: i.channel_id, member: { user: { id: who(i) } }, ...(i.message ? { message: { id: i.message.id } } : {}) });
  inbox.set(h, list);
  pending.set(i.id, { token: i.token, h, de, delivered: false, timer: setTimeout(() => expire(i.id), PICKUP) });
  deliver(h);
}

const deviceLines = (guildId, t) => Object.values(store.links).filter((l) => l.guild_id === guildId).slice(0, 15)
  .map((l) => `#${l.channel_name || l.channel_id} · ${l.device || '?'} · ${t('zuletzt', 'last seen')} <t:${Math.floor(Date.parse(l.seen || l.created) / 1000)}:R>${l.broken ? t(' · kaputt, neu koppeln', ' · broken, link again') : ''}`);

async function onInteraction(i) {
  if (!i || ![2, 3, 5].includes(i.type) || !i.data) return;
  if (i.type === 2 && i.data.name !== 'works') return;
  const de = String(i.locale || i.guild_locale || '').startsWith('de');
  const t = (g, e) => (de ? g : e);
  // Interaction callbacks do not count towards the bot's limits and must arrive within 3 s: no pace here.
  const callback = (body) => rest.post(`/interactions/${i.id}/${i.token}/callback`, body);
  const answer = (data) => callback({ type: 4, data: ephemeral(data) }).catch((e) => log('reply failed:', e.message));
  const reply = (embed) => answer({ embeds: [{ color: 0x5865f2, ...embed }] });
  if (!i.guild_id || !i.member) return reply({ title: t('Nur in einem Server', 'Only in a server'), description: t('/works geht nur in einem Kanal eines Servers.', '/works only works in a server channel.') });
  // Commands and clicks for a device: only its owner; dialogs open here (they cannot wait), the rest is deferred.
  const forward = async (h, link) => {
    const p = i.type === 3 ? parseCid(i.data.custom_id) : null;
    // The help button on the dashboard is answered here, for anybody.
    if (p && p.act === 'help') return answer(helpMessage({ locale: i.locale, shared: true, devices: deviceLines(i.guild_id, t) }));
    if (who(i) !== link.user_id) return answer(notOwner(i.locale));
    if (i.type === 3) {
      if (!p) return reply({ title: '?', description: t('Unbekannter Knopf.', 'Unknown button.') });
      if (MODAL.has(p.act)) return callback({ type: 9, data: modalFor(i.data.custom_id, i.locale) }).catch((e) => log('dialog failed:', e.message));
    }
    try { await callback({ type: 5, data: { flags: 64 } }); } catch (e) { log('defer failed:', e.message); return undefined; }
    return toDevice(h, i, de);
  };
  if (i.type !== 2) {
    // Buttons and dialogs belong to the device that wrote the message.
    const mid = i.message && i.message.id;
    const h = !mid ? '' : Object.hasOwn(store.messages, mid) ? store.messages[mid].h : answers.get(mid) || '';
    const link = h && store.links[h];
    if (!link || link.broken) return reply({ title: t('Nicht mehr gekoppelt', 'No longer linked'), description: t('Das Gerät, das diese Nachricht geschrieben hat, ist nicht mehr gekoppelt.', 'The device that wrote this message is no longer linked.') });
    return forward(h, link);
  }
  const { sub } = subOf(i);
  const channel = { id: i.channel_id, name: (i.channel && i.channel.name) || '' };
  if (sub === 'help') return answer(helpMessage({ locale: i.locale, shared: true, devices: deviceLines(i.guild_id, t) }));
  if (sub !== 'link' && sub !== 'unlink') {
    // Every other command goes to a device of whoever typed it in this channel, the one active last.
    const here = Object.entries(store.links).filter(([, l]) => l.guild_id === i.guild_id && l.channel_id === channel.id && !l.broken);
    const entry = here.filter(([, l]) => l.user_id === who(i)).sort((x, y) => Date.parse(y[1].seen || y[1].created) - Date.parse(x[1].seen || x[1].created))[0];
    if (!entry && here.length) return answer(notOwner(i.locale));
    if (!entry) return reply({ title: t('Noch nicht gekoppelt', 'Not linked yet'), description: t('In diesem Kanal ist kein Gerät gekoppelt. Erst /works verbinden, dann works discord link <Code>.', 'No device is linked in this channel. Run /works link first, then works discord link <code>.') });
    return forward(entry[0], entry[1]);
  }
  const perms = BigInt(i.member.permissions || '0');
  if (!(perms & MANAGE_GUILD) && !(perms & ADMIN)) return reply({ title: t('Keine Berechtigung', 'Not allowed'), description: t('Dafür brauchst du das Recht „Server verwalten“.', 'You need the “Manage Server” permission for this.') });
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
  return undefined;
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

function readBody(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
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

// One component, cleaned: https link buttons, buttons and select menus with the works custom_id scheme (w:…). Clicks
// on them come back to the device that wrote the message, never to another one.
const str = (v, n) => String(v ?? '').slice(0, n);
function component(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.type === 2 && c.style === 5 && /^https:\/\//.test(c.url || '')) return { type: 2, style: 5, label: str(c.label, 80), url: str(c.url, 512) };
  if (c.type === 2 && [1, 2, 3, 4].includes(c.style) && CID_RE.test(c.custom_id || '')) return { type: 2, style: c.style, label: str(c.label, 80), custom_id: c.custom_id, ...(c.disabled ? { disabled: true } : {}) };
  if (c.type === 3 && CID_RE.test(c.custom_id || '') && Array.isArray(c.options) && c.options.length) {
    return { type: 3, custom_id: c.custom_id, ...(c.placeholder ? { placeholder: str(c.placeholder, 150) } : {}), options: c.options.slice(0, 25).map((o) => ({ label: str(o && o.label, 100), value: str(o && o.value, 100), ...(o && o.description ? { description: str(o.description, 100) } : {}), ...(o && o.default ? { default: true } : {}) })) };
  }
  return null;
}

// Only what works needs, and never more than it may: mentions only for the linked user, no @everyone,
// only own buttons (see component), only the "silent" flag.
function sanitize(body, link, create) {
  const out = {};
  if (typeof body.content === 'string') out.content = body.content.slice(0, 2000);
  if (Array.isArray(body.embeds)) out.embeds = body.embeds.slice(0, 10);
  if (Array.isArray(body.components)) {
    out.components = body.components.slice(0, 5).map((row) => {
      const list = (Array.isArray(row && row.components) ? row.components : []).map(component).filter(Boolean);
      // A select menu fills its row alone.
      const select = list.find((c) => c.type === 3);
      return { type: 1, components: select ? [select] : list.slice(0, 5) };
    }).filter((row) => row.components.length);
  }
  const users = body.allowed_mentions && Array.isArray(body.allowed_mentions.users) ? body.allowed_mentions.users.filter((u) => u === link.user_id) : [];
  out.allowed_mentions = { parse: [], users };
  if (create) out.flags = Number(body.flags || 0) & 4096;
  // Which attachments the message keeps or gets: ids of existing ones or the index of a new file.
  if (Array.isArray(body.attachments)) out.attachments = body.attachments.filter((x) => x && /^\d{1,25}$/.test(String(x.id))).slice(0, 10).map((x) => ({ id: typeof x.id === 'number' ? x.id : String(x.id), filename: str(x.filename, 100) }));
  return out;
}

// The dashboard image (W-0044) comes as base64 in JSON. Only one small PNG with a plain name.
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function filesOf(body) {
  if (body.files === undefined) return undefined;
  const bad = (msg) => { throw Object.assign(new Error(msg), { status: 400 }); };
  if (!Array.isArray(body.files) || body.files.length > 1) bad('At most one file');
  return body.files.map((f) => {
    if (!f || !/^[\w.-]{1,60}\.png$/.test(String(f.name || ''))) bad('Only PNG files with a plain name');
    const data = Buffer.from(String(f.data || ''), 'base64');
    if (data.length > 256 * 1024) bad('File too large (at most 256 KB)');
    if (!data.subarray(0, 8).equals(PNG)) bad('File is not a PNG');
    return { name: f.name, type: 'image/png', data };
  });
}

// Calls Discord for a client. Returns { ok: true, data } or sends the error itself and returns { ok: false }.
// Discord rejecting the bot token (401) is the operator's problem: clients hear "try later", not "key invalid".
// Missing access to the channel breaks the link (410), so the client stops instead of failing forever. soft: a
// failure here says nothing about the channel (pinning, answering an interaction), the link stays.
async function forward(res, a, fn, { soft = false } = {}) {
  try { return { ok: true, data: await discord(fn) }; } catch (e) {
    if (e.paused) err(res, 503, 'Service paused, try again later', { retry_after: 60 });
    else if (e.retry) err(res, 502, 'Discord not reachable, try again later');
    else if (e.status === 401) { log('Discord rejects the bot token. Check DISCORD_TOKEN.'); err(res, 503, 'Service unavailable, try again later', { retry_after: 60 }); }
    else if (!soft && BROKEN.has(e.code)) { markBroken((l) => l === a.link, `Discord ${e.code}`); err(res, 410, 'Link broken: the bot can no longer use this channel. Link again with /works link.', { code: 'link_broken' }); }
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
  // Long poll for commands and clicks: answers at once when something waits, otherwise after at most wait seconds.
  // One open poll per device; a new one ends the old.
  if (req.method === 'GET' && p === '/v1/inbox') {
    if (!a.link.polled) { a.link.polled = new Date().toISOString(); save(); }
    const old = waiting.get(a.h);
    if (old) { waiting.delete(a.h); clearTimeout(old.timer); send(old.res, 200, { interactions: [] }); }
    acknowledge(a.h, String(url.searchParams.get('ack') || '').split(',').filter((x) => /^\d{1,25}$/.test(x)).slice(0, 100));
    const secs = Math.min(Math.max(Number(url.searchParams.get('wait')) || 0, 0), 25);
    const w = { res, timer: setTimeout(() => { if (waiting.get(a.h) === w) { waiting.delete(a.h); send(res, 200, { interactions: [] }); } }, secs * 1000) };
    waiting.set(a.h, w);
    res.on('close', () => { if (waiting.get(a.h) === w) { waiting.delete(a.h); clearTimeout(w.timer); } });
    deliver(a.h);
    return undefined;
  }
  if (req.method === 'POST' && (m = p.match(/^\/v1\/interactions\/(\d+)\/reply$/))) {
    const pe = pending.get(m[1]);
    if (!pe || pe.h !== a.h) return err(res, 404, 'Unknown interaction', { code: 10062 });
    const wait = limited(a.h, 'reply');
    if (wait) return err(res, 429, 'You are being rate limited.', { retry_after: wait });
    const body = await readBody(req);
    if (pending.get(m[1]) !== pe) return err(res, 404, 'Unknown interaction', { code: 10062 });
    pending.delete(m[1]);
    clearTimeout(pe.timer);
    const r = await forward(res, a, () => rest.patch(`/webhooks/${app.id}/${pe.token}/messages/@original`, sanitize(body, a.link, false)), { soft: true });
    if (!r.ok) return undefined;
    // The answer is a message of its own: clicks on its buttons go back to this device.
    if (r.data && r.data.id) { answers.set(String(r.data.id), a.h); while (answers.size > 5000) answers.delete(answers.keys().next().value); }
    return send(res, 200, { ok: true });
  }
  if ((m = p.match(/^\/v1\/channels\/(\d+)\/messages(?:\/(pins\/)?(\d+))?$/))) {
    const [, cid, pin, mid] = m;
    if (cid !== a.link.channel_id) return err(res, 403, 'Missing Access', { code: 50001 });
    if (mid && (!Object.hasOwn(store.messages, mid) || store.messages[mid].h !== a.h)) return err(res, 403, 'Cannot edit a message of another device', { code: 50005 });
    const kind = req.method === 'POST' && !mid ? 'post' : req.method === 'PATCH' && mid && !pin ? 'patch' : req.method === 'PUT' && mid && pin ? 'pin' : req.method === 'DELETE' && mid && !pin ? 'del' : '';
    if (!kind) return err(res, 404, 'Not found');
    const wait = limited(a.h, kind);
    if (wait) return err(res, 429, 'You are being rate limited.', { retry_after: wait });
    const body = kind === 'pin' || kind === 'del' ? {} : await readBody(req, 512 * 1024);
    if (kind === 'post') {
      const files = filesOf(body);
      const r = await forward(res, a, () => rest.post(`/channels/${cid}/messages`, sanitize(body, a.link, true), files));
      if (!r.ok) return undefined;
      own(a.h, r.data.id);
      save();
      return send(res, 200, { id: r.data.id, channel_id: cid });
    }
    if (kind === 'patch') {
      const files = filesOf(body);
      const r = await forward(res, a, () => rest.patch(`/channels/${cid}/messages/${mid}`, sanitize(body, a.link, false), files));
      if (!r.ok) return undefined;
      own(a.h, mid); // edited messages stay owned (the dashboard lives for months)
      save();
      return send(res, 200, { id: mid, channel_id: cid });
    }
    if (kind === 'del') {
      // Already gone at Discord counts as deleted.
      const r = await forward(res, a, () => rest.del(`/channels/${cid}/messages/${mid}`).catch((e) => { if (e.status === 404) return null; throw e; }));
      if (!r.ok) return undefined;
      delete store.messages[mid];
      a.link.mids = (a.link.mids || []).filter((x) => x !== mid);
      save();
      return send(res, 204);
    }
    const r = await forward(res, a, () => rest.put(`/channels/${cid}/messages/pins/${mid}`), { soft: true });
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
  try { await rest.put(`/applications/${app.id}/commands`, commands({ shared: true })); } catch (e) { log('registering /works failed:', e.message); }
  const g = await retrying('gateway', () => rest.get('/gateway/bot'));
  // One bot for everybody: its status points to the help instead of a project (W-0044).
  gateway = new Gateway({ token: TOKEN, url: g.url, intents: 1, status: '/works help', log: (s) => log(s), onFatal: (code) => { log(`gateway closed for good (code ${code})`); process.exit(1); }, onDispatch });
  gateway.start();
  setInterval(prune, FAST ? 1000 : 60000).unref();
  server.listen(PORT, HOST, () => log(`works-bot ${me.username} listening on ${HOST}:${PORT}`));
}

const stop = () => { log('stopping'); if (gateway) gateway.stop(); try { saveNow(); } catch { /* read-only */ } server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
start().catch((e) => { log('start failed:', e.message); process.exit(1); });
