// Test of the works-bot service (W-0040) against the fake Discord from the works plugin, with the works CLI and
// bot from this repository: slash command, linking, bot through the service, security cases, restart.
// Needs the global WebSocket (Node 22 or newer); skipped below that.
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
const startService = () => {
  svc = spawn(process.execPath, [path.join(HERE, 'server.mjs')], { env: { ...process.env, DISCORD_TOKEN: TOKEN, DISCORD_API: fake.api, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: data, WORKS_BOT_FAST: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  svc.stdout.on('data', (d) => { svcLog += d; });
  svc.stderr.on('data', (d) => { svcLog += d; });
};
const stopService = () => new Promise((r) => { if (!svc || svc.exitCode !== null) return r(); svc.once('exit', r); svc.kill(); });
const api = async (method, p, body, key) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
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
const linkCode = async (opts = {}) => { const id = fake.interact({ sub: 'link', ...opts }); const cb = await wait(() => fake.callbacks.get(id), 'link reply'); return codeOf(cb); };
const ddir = path.join(home, '.works', 'discord');
const statusOf = (name, ch = '11') => fake.inChannel(ch).filter((m) => m.embeds[0] && m.embeds[0].author && m.embeds[0].author.name === `${name} · Stand`).pop();

try {
  startService();
  // Service: gateway, slash command registered, health, public info.
  await wait(() => fake.gateway.identifies.length, 'gateway identify');
  const cmds = await wait(() => fake.commands, 'commands registered');
  const works = cmds.find((c) => c.name === 'works');
  assert.ok(works, 'command /works missing');
  assert.equal(works.default_member_permissions, '32', '/works must require Manage Server');
  const subs = works.options.map((o) => o.name);
  assert.deepEqual(subs.sort(), ['link', 'status', 'unlink']);
  assert.equal(works.options.find((o) => o.name === 'link').name_localizations.de, 'verbinden');
  assert.equal((await api('GET', '/health')).status, 200);
  const info = (await api('GET', '/v1/info')).body;
  assert.equal(info.app_id, '1000');
  assert.match(info.invite_url, /client_id=1000/);

  // /works link without Manage Server: refused, only visible to the caller.
  let iid = fake.interact({ sub: 'link', perms: '0', user: '77' });
  let cb = await wait(() => fake.callbacks.get(iid), 'reply without permission');
  assert.equal(cb.data.flags & 64, 64, 'reply must be ephemeral');
  assert.ok(!codeOf(cb), 'code handed out without permission');

  // /works link: ephemeral code.
  iid = fake.interact({ sub: 'link' });
  cb = await wait(() => fake.callbacks.get(iid), 'link reply');
  assert.equal(cb.type, 4);
  assert.equal(cb.data.flags & 64, 64, 'code must be ephemeral');
  const code = codeOf(cb);
  assert.ok(code, `no code in ${JSON.stringify(cb)}`);

  // works: status shows both ways (design R), wrong code refused, right code links.
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
  const sec = JSON.parse(fs.readFileSync(path.join(ddir, 'secret.json'), 'utf8'));
  assert.match(sec.key || '', /^wk_/);
  assert.ok(!sec.token, 'token stored in shared mode');
  const cfg = JSON.parse(fs.readFileSync(path.join(ddir, 'config.json'), 'utf8'));
  assert.equal(cfg.mode, 'shared');
  assert.equal(cfg.channel_id, '11');
  assert.equal(cfg.owner_id, '4242');
  assert.ok(!JSON.stringify(cfg).includes(sec.key), 'key in config.json');
  assert.ok(!r.out.includes(sec.key), 'key printed');
  r = await wa(['discord', 'link', code]);
  assert.notEqual(r.code, 0, 'code accepted twice');
  assert.ok(!fs.readFileSync(path.join(data, 'links.json'), 'utf8').includes(sec.key), 'service stores the plain key');

  // Bot through the service: pinned status post, event with mention for the linked user only.
  await wa(['discord', 'set', 'delay.perm=0', 'delay.idle=0', 'quiet.on=false']);
  r = await wa(['discord', 'start']);
  assert.match(r.out, /gestartet/, r.out);
  const st = await wait(() => { const s = statusOf('projekt'); return s && s.pinned ? s : null; }, 'pinned status post through the service');
  assert.ok(fake.requests.every((q) => !q.path.startsWith('/v1') && (q.auth === `Bot ${TOKEN}` || q.path.includes('/callback'))), 'request to Discord without the bot token');
  spawnSync(process.execPath, [path.join(HOOKS, 'permission.mjs')], { cwd: proj, env, input: JSON.stringify({ cwd: proj, session_id: 's', tool_name: 'Bash', tool_input: { command: 'npm test' } }), encoding: 'utf8', windowsHide: true });
  const pm = await wait(() => fake.inChannel('11').find((m) => (m.embeds[0] || {}).title === 'Wartet auf deine Freigabe'), 'permission message');
  assert.match(pm.content, /<@4242>/);
  assert.deepEqual(pm.allowed_mentions, { parse: [], users: ['4242'] });
  assert.match((await wa(['discord'])).out, /Gemeinsamer Bot/);

  // Security: a second device linked to another channel.
  const code2 = await linkCode({ channel: '12', user: '88' });
  const l2 = await api('POST', '/v1/link', { code: code2, device: 'zweiter' });
  assert.equal(l2.status, 200);
  const key2 = l2.body.key;
  assert.equal((await api('POST', '/v1/channels/11/messages', { content: 'x' }, key2)).status, 403, 'foreign channel');
  assert.equal((await api('PATCH', `/v1/channels/11/messages/${st.id}`, { content: 'y' }, key2)).status, 403, 'edit in foreign channel');
  assert.equal((await api('PATCH', `/v1/channels/12/messages/${st.id}`, { content: 'y' }, key2)).status, 403, 'edit of a foreign message');
  assert.equal((await api('PUT', `/v1/channels/12/messages/pins/${st.id}`, null, key2)).status, 403, 'pin of a foreign message');
  const evil = await api('POST', '/v1/channels/12/messages', { content: '@everyone <@4242> hallo', allowed_mentions: { parse: ['everyone', 'users'], users: ['4242'] }, flags: 4096 | 4 }, key2);
  assert.equal(evil.status, 200);
  const em = fake.messages.get(evil.body.id);
  assert.deepEqual(em.allowed_mentions, { parse: [], users: [] }, 'mentions not restricted');
  assert.equal(em.flags, 4096, 'flags not restricted');
  assert.equal((await api('POST', '/v1/channels/12/messages', { content: 'x' }, 'wk_falsch')).status, 401);
  assert.equal((await api('POST', '/v1/channels/12/messages', { content: 'x' })).status, 401);
  // Wrong codes from one address: blocked after five attempts.
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await api('POST', '/v1/link', { code: 'ZZZZ-ZZZZ', device: 'x' })).status;
  assert.equal(last, 429, 'no limit for wrong codes');

  // /works status lists the linked devices, /works unlink in channel 11 removes the first device.
  iid = fake.interact({ sub: 'status' });
  cb = await wait(() => fake.callbacks.get(iid), 'status reply');
  assert.match(JSON.stringify(cb), /#works/);
  iid = fake.interact({ sub: 'unlink' });
  await wait(() => fake.callbacks.get(iid), 'unlink reply');
  assert.equal((await api('GET', '/v1/users/@me', null, sec.key)).status, 401, 'key still valid after /works unlink');
  await wait(() => !fs.existsSync(path.join(ddir, 'bot.pid')), 'bot stops with a revoked key');
  assert.equal((await api('GET', '/v1/users/@me', null, key2)).status, 200, 'unlink removed the device of another channel');

  // Restart: links survive. works discord unlink revokes its own key.
  await stopService();
  startService();
  await wait(async () => (await api('GET', '/health').catch(() => ({ status: 0 }))).status === 200, 'service after restart');
  assert.equal((await api('GET', '/v1/users/@me', null, key2)).status, 200, 'link lost on restart');
  assert.equal((await api('DELETE', '/v1/link', null, key2)).status, 200);
  assert.equal((await api('GET', '/v1/users/@me', null, key2)).status, 401);
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
