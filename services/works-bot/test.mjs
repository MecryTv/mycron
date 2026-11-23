// Test of the works-bot service (W-0040) against the fake Discord from the works plugin, with the works CLI and
// bot from this repository: slash command, linking, bot through the service, security cases, broken links,
// limits, restart. Needs the global WebSocket (Node 22 or newer); skipped below that.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(HERE, '..', '..', 'plugins', 'works', 'skills', 'works', 'scripts');
const HOOKS = path.resolve(SCRIPTS, '..', 'hooks');
const CLI = path.join(SCRIPTS, 'works.mjs');
if (typeof globalThis.WebSocket !== 'function') { console.log('works-bot: skipped, needs Node 22 (global WebSocket)'); process.exit(0); }

const { startFakeDiscord } = await import(pathToFileURL(path.join(SCRIPTS, 'discord-fake.mjs')).href);
const TOKEN = 'MTAwMA.shared-bot-token.0123456789abcdefWXYZ';
const fake = await startFakeDiscord({ token: TOKEN });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'works-bot-test-'));
const data = path.join(tmp, 'data');
const home = path.join(tmp, 'home');
const proj = path.join(tmp, 'projekt');
for (const d of [data, home, proj]) fs.mkdirSync(d, { recursive: true });
const port = await new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = async (fn, what, ms = 25000) => { const until = Date.now() + ms; while (Date.now() < until) { const v = await fn(); if (v) return v; await sleep(100); } throw new Error(`Timeout: ${what}`); };

let svc = null;
let svcLog = '';
// Small caps so the limits are reachable in a test: 3 devices per server, 6 remembered messages per device.
const startService = (extra = {}) => {
  svc = spawn(process.execPath, [path.join(HERE, 'server.mjs')], { env: { ...process.env, DISCORD_TOKEN: TOKEN, DISCORD_API: fake.api, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: data, WORKS_BOT_FAST: '1', WORKS_BOT_GUILD_CAP: '3', WORKS_BOT_MSG_CAP: '6', ...extra }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  svc.stdout.on('data', (d) => { svcLog += d; });
  svc.stderr.on('data', (d) => { svcLog += d; });
  return svc;
};
const stopService = () => new Promise((r) => { if (!svc || svc.exitCode !== null) return r(); svc.once('exit', r); svc.kill(); });
const healthy = () => wait(async () => (await api('GET', '/health').catch(() => ({ status: 0 }))).status === 200, 'service healthy');
const api = async (method, p, body, key, headers = {}) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* leer */ }
  return { status: r.status, body: j };
};
const env = { ...process.env, HOME: home, USERPROFILE: home, WORKS_ACTOR: '', WORKS_DRY_OPEN: '1', WORKS_DISCORD_SERVICE: base, WORKS_DISCORD_FAST: '1' };
const wa = (args, { input = '', cwd = proj } = {}) => new Promise((resolve) => {
  const c = spawn(process.execPath, [CLI, ...args], { cwd, env, windowsHide: true });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out }));
  c.stdin.end(input);
});
const codeOf = (cb) => (JSON.stringify(cb).match(/[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}/) || [])[0];
const reply = async (opts) => { const id = fake.interact(opts); return wait(() => fake.callbacks.get(id), `reply to /works ${opts.sub}`); };
const linkCode = async (opts = {}) => codeOf(await reply({ sub: 'link', ...opts }));
const linkKey = async (opts = {}) => { const r = await api('POST', '/v1/link', { code: await linkCode(opts), device: 'test' }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.key; };
const ddir = path.join(home, '.works', 'discord');
const secret = () => JSON.parse(fs.readFileSync(path.join(ddir, 'secret.json'), 'utf8'));
const statusPosts = (name, ch = '11') => fake.inChannel(ch).filter((m) => m.embeds[0] && m.embeds[0].author && m.embeds[0].author.name === `${name} · Stand`);
const botRunning = () => fs.existsSync(path.join(ddir, 'bot.pid'));

try {
  startService();
  // Service: gateway, slash command registered, health, public info.
  await wait(() => fake.gateway.identifies.length, 'gateway identify');
  const cmds = await wait(() => fake.commands, 'commands registered');
  const works = cmds.find((c) => c.name === 'works');
  assert.ok(works, 'command /works missing');
  assert.equal(works.default_member_permissions, '32', '/works must require Manage Server');
  assert.deepEqual(works.options.map((o) => o.name).sort(), ['link', 'status', 'unlink']);
  assert.equal(works.options.find((o) => o.name === 'link').name_localizations.de, 'verbinden');
  await healthy();
  const info = (await api('GET', '/v1/info')).body;
  assert.equal(info.app_id, '1000');
  assert.match(info.invite_url, /client_id=1000/);

  // /works link without Manage Server, and in a channel where the bot lacks rights: no code.
  let cb = await reply({ sub: 'link', perms: '0', user: '77' });
  assert.equal(cb.data.flags & 64, 64, 'reply must be ephemeral');
  assert.ok(!codeOf(cb), 'code handed out without permission');
  cb = await reply({ sub: 'link', appPerms: String(1n << 10n) });
  assert.ok(!codeOf(cb), 'code handed out although the bot cannot post');
  assert.match(JSON.stringify(cb), /Rechte|permissions/i);

  // /works link: ephemeral code. works: status shows both ways (design R), wrong code refused, right code links.
  cb = await reply({ sub: 'link' });
  assert.equal(cb.type, 4);
  assert.equal(cb.data.flags & 64, 64, 'code must be ephemeral');
  const code = codeOf(cb);
  assert.ok(code, `no code in ${JSON.stringify(cb)}`);
  assert.equal((await wa(['init'])).code, 0);
  let r = await wa(['discord']);
  assert.match(r.out, /Gemeinsamer Bot/);
  assert.match(r.out, /Eigener Bot/);
  r = await wa(['discord', 'link', 'AAAA-BBBB']);
  assert.notEqual(r.code, 0, 'wrong code accepted');
  r = await wa(['discord', 'link', code.toLowerCase()]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /#works/);
  assert.match(r.out, /Mein Server/);
  const key1 = secret().key;
  assert.match(key1 || '', /^wk_/);
  assert.ok(!secret().token, 'token stored in shared mode');
  const cfg = JSON.parse(fs.readFileSync(path.join(ddir, 'config.json'), 'utf8'));
  assert.equal(cfg.mode, 'shared');
  assert.equal(cfg.channel_id, '11');
  assert.equal(cfg.owner_id, '4242');
  assert.ok(!JSON.stringify(cfg).includes(key1), 'key in config.json');
  assert.ok(!r.out.includes(key1), 'key printed');
  assert.notEqual((await wa(['discord', 'link', code])).code, 0, 'code accepted twice');
  assert.ok(!fs.readFileSync(path.join(data, 'links.json'), 'utf8').includes(key1), 'service stores the plain key');

  // Bot through the service: exactly one pinned status post, event with mention for the linked user only.
  await wa(['discord', 'set', 'delay.perm=0', 'delay.idle=0', 'quiet.on=false']);
  r = await wa(['discord', 'start']);
  assert.match(r.out, /gestartet/, r.out);
  await wait(() => { const s = statusPosts('projekt').pop(); return s && s.pinned; }, 'pinned status post through the service');
  await wa(['new', '--type=chore', '--title=Neuer Stand']);
  await sleep(2500);
  assert.equal(statusPosts('projekt').length, 1, `status post created ${statusPosts('projekt').length} times`);
  assert.ok(fake.requests.every((q) => q.auth === `Bot ${TOKEN}` || q.path.includes('/callback')), 'request to Discord without the bot token');
  spawnSync(process.execPath, [path.join(HOOKS, 'permission.mjs')], { cwd: proj, env, input: JSON.stringify({ cwd: proj, session_id: 's', tool_name: 'Bash', tool_input: { command: 'npm test' } }), encoding: 'utf8', windowsHide: true });
  const pm = await wait(() => fake.inChannel('11').find((m) => (m.embeds[0] || {}).title === 'Wartet auf deine Freigabe'), 'permission message');
  assert.match(pm.content, /<@4242>/);
  assert.deepEqual(pm.allowed_mentions, { parse: [], users: ['4242'] });
  assert.match((await wa(['discord'])).out, /Gemeinsamer Bot/);

  // Linking again revokes the old key at the service.
  r = await wa(['discord', 'link', await linkCode()]);
  assert.equal(r.code, 0, r.out);
  const key1b = secret().key;
  assert.notEqual(key1b, key1);
  assert.equal((await api('GET', '/v1/users/@me', null, key1)).status, 401, 'old key still valid after linking again');
  r = await wa(['discord', 'start']);
  assert.match(r.out, /gestartet/, r.out);

  // Security: a second device in another channel.
  const key2 = await linkKey({ channel: '12', user: '88' });
  const own = await api('POST', '/v1/channels/12/messages', { content: 'eigene' }, key2);
  assert.equal(own.status, 200);
  const foreign = statusPosts('projekt').pop().id;
  assert.equal((await api('POST', '/v1/channels/11/messages', { content: 'x' }, key2)).status, 403, 'foreign channel');
  assert.equal((await api('PATCH', `/v1/channels/11/messages/${foreign}`, { content: 'y' }, key2)).status, 403, 'edit in foreign channel');
  assert.equal((await api('PATCH', `/v1/channels/12/messages/${foreign}`, { content: 'y' }, key2)).status, 403, 'edit of a foreign message');
  assert.equal((await api('PUT', `/v1/channels/12/messages/pins/${foreign}`, null, key2)).status, 403, 'pin of a foreign message');
  assert.equal((await api('PUT', `/v1/channels/12/messages/pins/${own.body.id}`, null, key2)).status, 204, 'pin of an own message');
  const evil = await api('POST', '/v1/channels/12/messages', { content: '@everyone <@4242> hallo', allowed_mentions: { parse: ['everyone', 'users'], users: ['4242'] }, flags: 4096 | 4 }, key2);
  assert.equal(evil.status, 200);
  assert.deepEqual(fake.messages.get(evil.body.id).allowed_mentions, { parse: [], users: [] }, 'mentions not restricted');
  assert.equal(fake.messages.get(evil.body.id).flags, 4096, 'flags not restricted');
  assert.equal((await api('POST', '/v1/channels/12/messages', { content: 'x' }, 'wk_falsch')).status, 401);
  assert.equal((await api('POST', '/v1/channels/12/messages', { content: 'x' })).status, 401);
  // Only the last messages per device are remembered (cap 6 here): the oldest can no longer be edited.
  for (let i = 0; i < 6; i++) assert.equal((await api('POST', '/v1/channels/12/messages', { content: `m${i}` }, key2)).status, 200);
  assert.equal((await api('PATCH', `/v1/channels/12/messages/${own.body.id}`, { content: 'alt' }, key2)).status, 403, 'message cap per device');
  // Devices per server (cap 3 here): key1b and key2 exist, a third is fine, a fourth is refused.
  const key3 = await linkKey({ channel: '11', user: '99' });
  cb = await reply({ sub: 'link', user: '98' });
  assert.ok(!codeOf(cb), 'code handed out above the device cap');
  // Discord rejects the bot token (reset by the operator): clients get "try later", not "key invalid".
  fake.token = 'anderes';
  assert.equal((await api('POST', '/v1/channels/12/messages', { content: 'x' }, key2)).status, 503);
  fake.token = TOKEN;
  // Bot removed from the channel: the link is broken (410), further requests do not reach Discord.
  fake.denyChannels.add('12');
  assert.equal((await api('POST', '/v1/channels/12/messages', { content: 'x' }, key2)).status, 410);
  const before = fake.requests.length;
  assert.equal((await api('POST', '/v1/channels/12/messages', { content: 'x' }, key2)).status, 410);
  assert.equal((await api('GET', '/v1/users/@me', null, key2)).status, 410);
  assert.equal(fake.requests.length, before, 'broken link still calls Discord');
  fake.denyChannels.delete('12');
  // Channel deleted (gateway): links in it break.
  fake.dispatch('CHANNEL_DELETE', { id: '11', guild_id: '1', type: 0 });
  await wait(async () => (await api('GET', '/v1/users/@me', null, key3)).status === 410, 'link broken after CHANNEL_DELETE');
  // The bot stops on a broken link and says what to do (a change makes it ask the service).
  assert.ok(botRunning(), 'bot not running before the broken link');
  await wa(['new', '--type=chore', '--title=Nach dem Löschen']);
  await wait(() => !botRunning(), 'bot stops on a broken link');
  assert.match(fs.readFileSync(path.join(ddir, 'bot.log'), 'utf8'), /neu koppeln/i);

  // /works status lists the devices, /works unlink removes those of the channel.
  cb = await reply({ sub: 'status' });
  assert.match(JSON.stringify(cb), /#works/);
  await reply({ sub: 'unlink' });
  assert.equal((await api('GET', '/v1/users/@me', null, key1b)).status, 401, 'key still valid after /works unlink');

  // works discord disconnect revokes the key at the service.
  r = await wa(['discord', 'link', await linkCode({ channel: '12' })]);
  assert.equal(r.code, 0, r.out);
  const key4 = secret().key;
  r = await wa(['discord', 'disconnect']);
  assert.match(r.out, /schlüssel/i);
  assert.equal((await api('GET', '/v1/users/@me', null, key4)).status, 401, 'key still valid after disconnect');

  // Restart behind a proxy: links survive; the code limit counts the address the proxy appended (last entry).
  const key5 = await linkKey({ channel: '12', user: '55' });
  // Wrong codes from one address: blocked after five attempts (last, because it blocks this test's address).
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await api('POST', '/v1/link', { code: 'ZZZZ-ZZZZ', device: 'x' })).status;
  assert.equal(last, 429, 'no limit for wrong codes');
  await stopService();
  startService({ TRUST_PROXY: '1' });
  await healthy();
  assert.equal((await api('GET', '/v1/users/@me', null, key5)).status, 200, 'link lost on restart');
  for (let i = 0; i < 6; i++) last = (await api('POST', '/v1/link', { code: 'ZZZZ-ZZZZ' }, null, { 'x-forwarded-for': `198.51.100.${i}, 203.0.113.7` })).status;
  assert.equal(last, 429, 'spoofed first X-Forwarded-For entry bypasses the limit');
  assert.equal((await api('POST', '/v1/link', { code: 'ZZZZ-ZZZZ' }, null, { 'x-forwarded-for': '203.0.113.8' })).status, 400, 'other address blocked');

  // A broken links.json stops the start instead of being overwritten.
  await stopService();
  const good = fs.readFileSync(path.join(data, 'links.json'), 'utf8');
  fs.writeFileSync(path.join(data, 'links.json'), 'kaputt');
  const bad = startService();
  const code0 = await new Promise((res) => bad.once('exit', res));
  assert.notEqual(code0, 0, 'service started with a broken links.json');
  assert.equal(fs.readFileSync(path.join(data, 'links.json'), 'utf8'), 'kaputt', 'broken links.json overwritten');
  fs.writeFileSync(path.join(data, 'links.json'), good);
  startService();
  await healthy();
  assert.equal((await api('GET', '/v1/users/@me', null, key5)).status, 200);
  assert.ok(!/wk_[\w-]{20,}/.test(svcLog) && !svcLog.includes(TOKEN), 'key or token in the service log');
  console.log('works-bot: all checks passed');
} catch (e) {
  console.error(`works-bot: FAILED\n${e.stack || e.message}\n--- service log ---\n${svcLog.slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await wa(['discord', 'stop']);
  await stopService();
  await fake.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows */ }
}
