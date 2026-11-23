// Nachgebautes Discord für den Selbsttest (W-0036): REST unter /api/v10 und das Gateway als WebSocket unter /gateway.
// Prüft Token und die Grenzen von Discord (Nachrichtenlänge, Embeds, Felder), damit zu lange Nachrichten im Test auffallen.
// Ohne Abhängigkeiten; der WebSocket-Server ist auf das beschränkt, was der Bot braucht (Textrahmen, Close, Ping).
import http from 'node:http';
import crypto from 'node:crypto';

const LIMITS = { content: 2000, embeds: 10, title: 256, description: 4096, fields: 25, fieldName: 256, fieldValue: 1024, footer: 2048, author: 256, total: 6000 };

export function embedProblems(e) {
  const p = [];
  const len = (s) => String(s || '').length;
  if (len(e.title) > LIMITS.title) p.push('title');
  if (len(e.description) > LIMITS.description) p.push('description');
  if ((e.fields || []).length > LIMITS.fields) p.push('fields');
  for (const f of e.fields || []) {
    if (!len(f.name) || len(f.name) > LIMITS.fieldName) p.push(`field name "${f.name}"`);
    if (!len(f.value) || len(f.value) > LIMITS.fieldValue) p.push(`field value "${f.name}"`);
  }
  if (e.footer && len(e.footer.text) > LIMITS.footer) p.push('footer');
  if (e.author && len(e.author.name) > LIMITS.author) p.push('author');
  const total = len(e.title) + len(e.description) + len(e.footer && e.footer.text) + len(e.author && e.author.name)
    + (e.fields || []).reduce((s, f) => s + len(f.name) + len(f.value), 0);
  if (total > LIMITS.total) p.push('total');
  return p;
}

function messageProblems(b) {
  const p = [];
  if (String(b.content || '').length > LIMITS.content) p.push('content');
  if ((b.embeds || []).length > LIMITS.embeds) p.push('embeds');
  for (const e of b.embeds || []) p.push(...embedProblems(e));
  for (const row of b.components || []) {
    if (row.type !== 1 || !Array.isArray(row.components) || row.components.length > 5) p.push('components');
    for (const c of row.components || []) if (c.style === 5 && !/^https:\/\//.test(c.url || '')) p.push('link button url');
  }
  if (!String(b.content || '').trim() && !(b.embeds || []).length) p.push('empty');
  return p;
}

// ---------- WebSocket-Rahmen (RFC 6455) ----------

function frame(op, payload) {
  const data = Buffer.from(payload);
  const head = data.length < 126 ? Buffer.from([0x80 | op, data.length])
    : data.length < 65536 ? Buffer.from([0x80 | op, 126, data.length >> 8, data.length & 255])
      : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(data.length), 2); return h; })();
  return Buffer.concat([head, data]);
}

function parseFrames(buf) {
  const out = [];
  let off = 0;
  while (buf.length - off >= 2) {
    const b0 = buf[off]; const b1 = buf[off + 1];
    let len = b1 & 127; let pos = off + 2;
    if (len === 126) { if (buf.length < pos + 2) break; len = buf.readUInt16BE(pos); pos += 2; }
    else if (len === 127) { if (buf.length < pos + 8) break; len = Number(buf.readBigUInt64BE(pos)); pos += 8; }
    const masked = b1 & 128;
    const mask = masked ? buf.subarray(pos, pos + 4) : null;
    if (masked) pos += 4;
    if (buf.length < pos + len) break;
    const data = Buffer.from(buf.subarray(pos, pos + len));
    if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
    out.push({ fin: !!(b0 & 128), op: b0 & 15, data });
    off = pos + len;
  }
  return { frames: out, rest: buf.subarray(off) };
}

// ---------- Fake ----------

export async function startFakeDiscord({ token = 'fake-token', ownerId = '4242', appId = '1000', botId = '5000', heartbeatMs = 300, guilds } = {}) {
  const fake = {
    token,
    guilds: guilds || [{ id: '1', name: 'Mein Server', channels: [{ id: '11', name: 'works', type: 0, position: 1 }, { id: '12', name: 'allgemein', type: 0, position: 0 }, { id: '13', name: 'Sprache', type: 2, position: 2 }] }],
    messages: new Map(),
    requests: [],
    problems: [],
    limitNext: 0,
    failNext: 0,
    gateway: { connections: 0, identifies: [], resumes: 0, heartbeats: 0, sockets: new Set() },
  };
  let nextId = 900000;
  const json = (res, code, body, headers = {}) => {
    res.writeHead(code, { 'content-type': 'application/json', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const channel = (id) => fake.guilds.flatMap((g) => g.channels.map((c) => ({ ...c, guild_id: g.id }))).find((c) => c.id === id);

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const p = url.pathname.replace(/^\/api\/v10/, '');
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { return json(res, 400, { message: 'bad json' }); }
      fake.requests.push({ method: req.method, path: p, body, auth: req.headers.authorization || '' });
      if (req.headers.authorization !== `Bot ${fake.token}`) return json(res, 401, { message: '401: Unauthorized', code: 0 });
      if (fake.failNext > 0) { fake.failNext--; return json(res, 502, { message: 'Bad Gateway' }); }
      if (fake.limitNext > 0) { fake.limitNext--; return json(res, 429, { message: 'You are being rate limited.', retry_after: 0.05, global: false }, { 'retry-after': '1', 'x-ratelimit-scope': 'user' }); }
      const rl = { 'x-ratelimit-limit': '5', 'x-ratelimit-remaining': '4', 'x-ratelimit-reset-after': '0.1', 'x-ratelimit-bucket': 'b' };
      let m;
      if (req.method === 'GET' && p === '/users/@me') return json(res, 200, { id: botId, username: 'works', discriminator: '4821', bot: true }, rl);
      if (req.method === 'GET' && p === '/oauth2/applications/@me') return json(res, 200, { id: appId, name: 'works', owner: { id: ownerId, username: 'du' }, team: null }, rl);
      if (req.method === 'GET' && p === '/users/@me/guilds') return json(res, 200, fake.guilds.map((g) => ({ id: g.id, name: g.name })), rl);
      if (req.method === 'GET' && (m = p.match(/^\/guilds\/(\d+)\/channels$/))) {
        const g = fake.guilds.find((x) => x.id === m[1]);
        return g ? json(res, 200, g.channels.map((c) => ({ ...c, guild_id: g.id })), rl) : json(res, 404, { message: 'Unknown Guild', code: 10004 });
      }
      if (req.method === 'GET' && p === '/gateway/bot') {
        const { port } = server.address();
        return json(res, 200, { url: `ws://127.0.0.1:${port}/gateway`, shards: 1, session_start_limit: { total: 1000, remaining: 999, reset_after: 0, max_concurrency: 1 } }, rl);
      }
      if (req.method === 'POST' && (m = p.match(/^\/channels\/(\d+)\/messages$/))) {
        if (!channel(m[1])) return json(res, 404, { message: 'Unknown Channel', code: 10003 });
        const probs = messageProblems(body || {});
        if (probs.length) { fake.problems.push(probs); return json(res, 400, { message: 'Invalid Form Body', code: 50035, errors: probs }); }
        const msg = { id: String(++nextId), channel_id: m[1], content: body.content || '', embeds: body.embeds || [], components: body.components || [], flags: body.flags || 0, allowed_mentions: body.allowed_mentions || null, pinned: false, edits: 0, created: Date.now() };
        fake.messages.set(msg.id, msg);
        return json(res, 200, msg, rl);
      }
      if (req.method === 'PATCH' && (m = p.match(/^\/channels\/(\d+)\/messages\/(\d+)$/))) {
        // forbidEdit: Nachricht einer anderen Bot-Anwendung (50005), etwa nach einem Wechsel des Tokens.
        if (fake.forbidEdit) return json(res, 403, { message: 'Cannot edit a message authored by another user', code: 50005 });
        const msg = fake.messages.get(m[2]);
        if (!msg || msg.channel_id !== m[1]) return json(res, 404, { message: 'Unknown Message', code: 10008 });
        const probs = messageProblems({ content: msg.content, embeds: msg.embeds, ...body });
        if (probs.length) { fake.problems.push(probs); return json(res, 400, { message: 'Invalid Form Body', code: 50035, errors: probs }); }
        for (const k of ['content', 'embeds', 'components', 'allowed_mentions']) if (body[k] !== undefined) msg[k] = body[k];
        msg.edits++;
        return json(res, 200, msg, rl);
      }
      if (req.method === 'PUT' && (m = p.match(/^\/channels\/(\d+)\/messages\/pins\/(\d+)$/))) {
        const msg = fake.messages.get(m[2]);
        if (!msg) return json(res, 404, { message: 'Unknown Message', code: 10008 });
        msg.pinned = true;
        return json(res, 204, undefined, rl);
      }
      return json(res, 404, { message: `Unbekannt: ${req.method} ${p}`, code: 0 });
    });
  });

  server.on('upgrade', (req, socket) => {
    if (!req.url.startsWith('/gateway')) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    fake.gateway.connections++;
    fake.gateway.sockets.add(socket);
    let buf = Buffer.alloc(0);
    let seq = 0;
    const send = (obj) => { if (!socket.destroyed) socket.write(frame(1, JSON.stringify(obj))); };
    const close = (code) => { if (!socket.destroyed) { const b = Buffer.alloc(2); b.writeUInt16BE(code); socket.write(frame(8, b)); socket.end(); } };
    socket.wsSend = send;
    socket.wsClose = close;
    send({ op: 10, d: { heartbeat_interval: heartbeatMs }, s: null, t: null });
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const { frames, rest } = parseFrames(buf);
      buf = rest;
      for (const f of frames) {
        if (f.op === 8) { socket.end(); continue; }
        if (f.op === 9) { socket.write(frame(10, f.data)); continue; }
        if (f.op !== 1) continue;
        let msg;
        try { msg = JSON.parse(f.data.toString('utf8')); } catch { close(4002); continue; }
        if (msg.op === 1) { fake.gateway.heartbeats++; send({ op: 11 }); }
        else if (msg.op === 2) {
          if (!msg.d || msg.d.token !== fake.token) { close(4004); continue; }
          fake.gateway.identifies.push(msg.d);
          const { port } = server.address();
          send({ op: 0, t: 'READY', s: ++seq, d: { v: 10, session_id: 'sess-1', resume_gateway_url: `ws://127.0.0.1:${port}/gateway`, user: { id: botId, username: 'works', bot: true }, application: { id: appId }, guilds: fake.guilds.map((g) => ({ id: g.id, unavailable: true })) } });
        } else if (msg.op === 6) {
          if (!msg.d || msg.d.token !== fake.token) { close(4004); continue; }
          fake.gateway.resumes++;
          send({ op: 0, t: 'RESUMED', s: ++seq, d: {} });
        } else if (msg.op === 3) fake.gateway.presence = msg.d;
      }
    });
    const drop = () => fake.gateway.sockets.delete(socket);
    socket.on('close', drop);
    socket.on('error', drop);
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  fake.url = `http://127.0.0.1:${port}`;
  fake.api = `${fake.url}/api/v10`;
  fake.inChannel = (id) => [...fake.messages.values()].filter((x) => x.channel_id === id);
  fake.deleteMessage = (id) => fake.messages.delete(id);
  // Gateway verlangt eine Neuverbindung (op 7) oder bricht hart ab.
  fake.reconnect = () => { for (const s of fake.gateway.sockets) s.wsSend({ op: 7, d: null }); };
  fake.dropGateway = () => { for (const s of fake.gateway.sockets) s.destroy(); };
  fake.close = () => new Promise((r) => { for (const s of fake.gateway.sockets) s.destroy(); server.close(() => r()); server.closeAllConnections && server.closeAllConnections(); });
  return fake;
}
