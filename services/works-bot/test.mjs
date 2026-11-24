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
// The dashboard (W-0044): one pinned message per channel for all projects.
const dashboards = (ch = '11') => fake.inChannel(ch).filter((m) => /^works · \d+ Projekte?$/.test((m.embeds[0] || {}).title || ''));
const botRunning = () => fs.existsSync(path.join(ddir, 'bot.pid'));

try {
  startService();
  // Service: gateway, slash command registered, health, public info.
  await wait(() => fake.gateway.identifies.length, 'gateway identify');
  const cmds = await wait(() => fake.commands, 'commands registered');
  const works = cmds.find((c) => c.name === 'works');
  assert.ok(works, 'command /works missing');
  assert.equal(works.default_member_permissions, '32', '/works must require Manage Server');
  assert.deepEqual(works.options.map((o) => o.name).sort(), ['help', 'instruct', 'link', 'new', 'status', 'tasks', 'unlink']);
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

  // Bot through the service: exactly one pinned dashboard with its image, event with mention for the linked user only.
  await wa(['discord', 'set', 'delay.perm=0', 'delay.idle=0', 'quiet.on=false']);
  r = await wa(['discord', 'start']);
  assert.match(r.out, /gestartet/, r.out);
  const dash = await wait(() => { const s = dashboards().pop(); return s && s.pinned && s.attachments.length ? s : null; }, 'pinned dashboard with image through the service');
  assert.equal(dash.attachments[0].filename, 'works.png');
  assert.equal(dash.attachments[0].data.subarray(1, 4).toString(), 'PNG', 'image is no PNG');
  assert.ok(dash.components.flatMap((x) => x.components).some((c) => c.custom_id === 'w:proj::'), 'select menu dropped by the service');
  // The shared bot is one for everybody: its status shows the help, not a project.
  assert.match(JSON.stringify(fake.gateway.identifies[0].presence || {}), /\/works help/);
  await wa(['new', '--type=chore', '--title=Neuer Stand']);
  await sleep(2500);
  assert.equal(dashboards().length, 1, `dashboard created ${dashboards().length} times`);
  assert.ok(fake.requests.every((q) => q.auth === `Bot ${TOKEN}` || q.path.includes('/callback')), 'request to Discord without the bot token');
  spawnSync(process.execPath, [path.join(HOOKS, 'permission.mjs')], { cwd: proj, env, input: JSON.stringify({ cwd: proj, session_id: 's', tool_name: 'Bash', tool_input: { command: 'npm test' } }), encoding: 'utf8', windowsHide: true });
  const pm = await wait(() => fake.inChannel('11').find((m) => (m.embeds[0] || {}).title === 'Wartet auf deine Freigabe'), 'permission message');
  assert.match(pm.content, /<@4242>/);
  assert.deepEqual(pm.allowed_mentions, { parse: [], users: ['4242'] });
  assert.match((await wa(['discord'])).out, /Gemeinsamer Bot/);

  // W-0037: commands and buttons. Help comes from the service itself and lists the devices.
  const ask = async (opts, what) => { const id = fake.interact(opts); return wait(() => fake.answerOf(id), what); };
  let a = await ask({ sub: 'help' }, 'help');
  assert.equal(a.type, 4); assert.equal(a.data.flags & 64, 64, 'help must be ephemeral');
  assert.match(JSON.stringify(a.data), /\/works verbinden/);
  assert.match(JSON.stringify(a.data), /#works · test|#works/);
  // A command goes to the linked device: the service defers at once, the device answers through the service.
  const sid = fake.interact({ sub: 'status' });
  const deferred = await wait(() => fake.callbacks.get(sid), 'deferred answer');
  assert.equal(deferred.type, 5); assert.equal(deferred.data.flags & 64, 64);
  a = await wait(() => fake.answerOf(sid), 'status from the device');
  assert.match(JSON.stringify(a.data), /projekt/);
  // Someone else: the service says no, nothing reaches the device.
  a = await ask({ sub: 'new', user: '77', options: [{ name: 'title', value: 'Fremd' }, { name: 'priority', value: 'P3' }] }, 'not the owner');
  assert.match(JSON.stringify(a.data), /Nicht für dich/);
  // New task from Discord, then the review buttons: the service opens the dialog, the device gets the answer.
  a = await ask({ sub: 'new', options: [{ name: 'title', value: 'Vom Handy' }, { name: 'priority', value: 'P2' }] }, 'new task');
  const nid = (JSON.stringify(a.data).match(/W-\d+/) || [])[0];
  assert.ok(nid, `no task id in ${JSON.stringify(a.data)}`);
  assert.equal((await wa(['set', nid, 'status=review'])).code, 0);
  const rv = await wait(() => fake.inChannel('11').find((m) => (m.embeds[0] || {}).title === `${nid} im Review` && m.components.length), 'review message with buttons');
  const ret = rv.components.flatMap((x) => x.components).find((b) => /^w:ret:/.test(b.custom_id || ''));
  assert.ok(ret, `buttons dropped by the service: ${JSON.stringify(rv.components)}`);
  a = await ask({ type: 3, customId: ret.custom_id, messageId: rv.id }, 'dialog from the service');
  assert.equal(a.type, 9, `no dialog: ${JSON.stringify(a)}`);
  assert.match(JSON.stringify((await ask({ type: 3, customId: ret.custom_id, messageId: rv.id, user: '77' }, 'foreign click')).data), /Nicht für dich/);
  a = await ask({ type: 5, customId: a.data.custom_id, messageId: rv.id, fields: { text: 'Bitte nochmal ansehen.' } }, 'dialog answer from the device');
  assert.match(JSON.stringify(a.data), /Claude/);
  const tdir = fs.readdirSync(path.join(proj, '.works', 'tasks')).find((d) => d.startsWith(`${nid}-`));
  assert.match(fs.readFileSync(path.join(proj, '.works', 'tasks', tdir, 'comments.md'), 'utf8'), /Bitte nochmal ansehen/);
  a = await ask({ sub: 'instruct', options: [{ name: 'text', value: 'Erst das Handy-Bild.' }, { name: 'task', value: nid }] }, 'instruction through the service');
  assert.match(JSON.stringify(a.data), new RegExp(nid));
  assert.match(fs.readFileSync(path.join(proj, '.works', 'instructions.json'), 'utf8'), /Erst das Handy-Bild/);
  // Buttons only with the own custom_id scheme; select menus stay alone in their row.
  const comp = await api('POST', '/v1/channels/11/messages', { content: 'k', components: [{ type: 1, components: [{ type: 2, style: 1, label: 'gut', custom_id: 'w:acc::W-1' }, { type: 2, style: 1, label: 'fremd', custom_id: 'anything' }] }, { type: 1, components: [{ type: 3, custom_id: 'w:proj::', options: [{ label: 'a', value: 'a' }] }, { type: 2, style: 1, label: 'x', custom_id: 'w:acc::W-2' }] }] }, key1);
  assert.equal(comp.status, 200, JSON.stringify(comp.body));
  const kept = fake.messages.get(comp.body.id).components;
  assert.deepEqual(kept.map((x) => x.components.map((c) => c.custom_id)), [['w:acc::W-1'], ['w:proj::']]);
  // Dashboard (W-0044): help from the service itself, project details from the device, buttons on that answer work.
  const d0 = dashboards().pop();
  a = await ask({ type: 3, customId: 'w:help::', messageId: d0.id }, 'help button through the service');
  assert.equal(a.type, 4); assert.match(JSON.stringify(a.data), /\/works/);
  const opt = d0.components.flatMap((x) => x.components).find((c) => c.type === 3).options[0];
  a = await ask({ type: 3, customId: 'w:proj::', messageId: d0.id, values: [opt.value] }, 'project details through the service');
  const tb = (a.data.components || []).flatMap((x) => x.components).find((c) => /^w:tasks:/.test(c.custom_id || ''));
  assert.ok(tb, `no tasks button in ${JSON.stringify(a.data).slice(0, 300)}`);
  assert.match(JSON.stringify((await ask({ type: 3, customId: tb.custom_id, messageId: a.data.id }, 'button on an answer')).data), /offen/);
  // Answers only for interactions of the own device.
  assert.equal((await api('POST', `/v1/interactions/${sid}/reply`, { content: 'x' }, key1)).status, 404, 'answered twice');
  // A second person with an own device in the same channel: each command goes to the device of whoever typed it.
  // That device never asked for its inbox (an older works), so the service suggests an update instead of "off".
  const key88 = await linkKey({ user: '88' });
  a = await ask({ sub: 'tasks' }, 'owner command with a second device in the channel');
  assert.doesNotMatch(JSON.stringify(a.data), /Nicht für dich/, 'command of the owner went to the other device');
  assert.match(JSON.stringify(a.data), /projekt/);
  a = await ask({ sub: 'tasks', user: '88' }, 'command of the second person');
  assert.doesNotMatch(JSON.stringify(a.data), /Nicht für dich/, 'command of the second person went to the other device');
  assert.match(JSON.stringify(a.data), /aktualisier/i, 'no hint to update works');
  // A poll whose answer gets lost: without the acknowledgement the request comes again with the next poll.
  const btn = await api('POST', '/v1/channels/11/messages', { content: 'b', components: [{ type: 1, components: [{ type: 2, style: 3, label: 'ok', custom_id: 'w:acc::W-1' }] }] }, key88);
  const cid88 = fake.interact({ type: 3, customId: 'w:acc::W-1', messageId: btn.body.id, user: '88' });
  await wait(() => fake.callbacks.get(cid88), 'deferred click for the second device');
  const got = (await api('GET', '/v1/inbox', null, key88)).body.interactions.map((x) => x.id);
  assert.deepEqual(got, [cid88]);
  assert.deepEqual((await api('GET', '/v1/inbox', null, key88)).body.interactions.map((x) => x.id), [cid88], 'lost delivery not repeated');
  assert.deepEqual((await api('GET', `/v1/inbox?ack=${cid88}`, null, key88)).body.interactions, [], 'acknowledged request delivered again');
  assert.equal((await api('POST', `/v1/interactions/${cid88}/reply`, { content: 'erledigt' }, key88)).status, 200);
  assert.equal((await api('DELETE', '/v1/link', null, key88)).status, 200);
  // Device off: the service says so instead of leaving Discord waiting.
  await wa(['discord', 'stop']);
  a = await ask({ sub: 'tasks' }, 'answer for a device that is off');
  assert.match(JSON.stringify(a.data), /nicht erreichbar/);
  r = await wa(['discord', 'start']);
  assert.match(r.out, /gestartet/, r.out);

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
  const foreign = dashboards().pop().id;
  assert.equal((await api('POST', '/v1/channels/11/messages', { content: 'x' }, key2)).status, 403, 'foreign channel');
  assert.equal((await api('PATCH', `/v1/channels/11/messages/${foreign}`, { content: 'y' }, key2)).status, 403, 'edit in foreign channel');
  assert.equal((await api('PATCH', `/v1/channels/12/messages/${foreign}`, { content: 'y' }, key2)).status, 403, 'edit of a foreign message');
  assert.equal((await api('PUT', `/v1/channels/12/messages/pins/${foreign}`, null, key2)).status, 403, 'pin of a foreign message');
  assert.equal((await api('PUT', `/v1/channels/12/messages/pins/${own.body.id}`, null, key2)).status, 204, 'pin of an own message');
  // Deleting (W-0044, the channel cleans itself up): only own messages.
  assert.equal((await api('DELETE', `/v1/channels/12/messages/${foreign}`, null, key2)).status, 403, 'delete of a foreign message');
  const gone = await api('POST', '/v1/channels/12/messages', { content: 'weg' }, key2);
  assert.equal((await api('DELETE', `/v1/channels/12/messages/${gone.body.id}`, null, key2)).status, 204, 'delete of an own message');
  assert.ok(!fake.messages.has(gone.body.id), 'message not deleted at Discord');
  assert.equal((await api('PATCH', `/v1/channels/12/messages/${gone.body.id}`, { content: 'x' }, key2)).status, 403, 'deleted message still owned');
  // Files only as a small PNG.
  const pngB64 = fs.readFileSync(path.join(HERE, 'test.mjs')).toString('base64');
  assert.equal((await api('POST', '/v1/channels/12/messages', { content: 'f', files: [{ name: 'works.png', type: 'image/png', data: pngB64 }] }, key2)).status, 400, 'file that is no PNG accepted');
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

  // /works help lists the devices, /works unlink removes those of the channel.
  cb = await reply({ sub: 'help' });
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
