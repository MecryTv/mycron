// Discord REST und Gateway für den Bot works (W-0036). Ohne Abhängigkeiten: fetch und das globale WebSocket
// (Node 22 oder neuer). Fehlermeldungen enthalten nie das Token.

// net: Discord war nicht erreichbar (Grund: 'timeout' oder die Meldung von fetch); die Meldung für Nutzer baut
// discord.mjs in der eingestellten Sprache (W-0041), diese Datei bleibt ohne Übersetzung.
export class DiscordError extends Error {
  constructor(message, { status = 0, code = 0, retry = false, net } = {}) { super(message); this.status = status; this.code = code; this.retry = retry; this.net = net; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// REST mit den Grenzen von Discord: Je Route (Methode und Kanal) wartet der Client, wenn der Bucket leer ist,
// und wiederholt bei 429 nach retry_after. 5xx und Netzfehler gibt er als retry-Fehler zurück; der Bot
// versucht es dann später erneut, damit nichts verloren geht.
export class Rest {
  constructor({ token, base, scheme = 'Bot', timeoutMs = 15000 }) {
    this.token = token; this.base = base; this.scheme = scheme; this.timeoutMs = timeoutMs;
    this.blocked = new Map();
  }

  static routeKey(method, route) { return `${method} ${route.replace(/\/messages\/\d+/, '/messages/:id').replace(/\/pins\/\d+/, '/pins/:id')}`; }

  // files: [{ name, type, data }] (W-0044). Zu Discord als multipart (payload_json und files[n]); zum gemeinsamen
  // Bot (Bearer) als JSON mit base64, der Dienst baut daraus multipart.
  encode(body, files) {
    if (!files || !files.length) return { type: 'application/json', payload: body === undefined ? undefined : JSON.stringify(body) };
    if (this.scheme === 'Bearer') return { type: 'application/json', payload: JSON.stringify({ ...(body || {}), files: files.map((f) => ({ name: f.name, type: f.type || 'application/octet-stream', data: Buffer.from(f.data).toString('base64') })) }) };
    const fd = new FormData();
    fd.append('payload_json', JSON.stringify(body || {}));
    files.forEach((f, i) => fd.append(`files[${i}]`, new Blob([f.data], { type: f.type || 'application/octet-stream' }), f.name));
    return { type: '', payload: fd };
  }

  async req(method, route, body, files) {
    const key = Rest.routeKey(method, route);
    const { type, payload } = this.encode(body, files);
    for (let attempt = 0; attempt < 6; attempt++) {
      const wait = (this.blocked.get(key) || 0) - Date.now();
      if (wait > 0) await sleep(Math.min(wait, 60000));
      let res;
      try {
        res = await fetch(this.base + route, {
          method,
          // Bei multipart setzt fetch den Content-Type mit der Grenze selbst.
          headers: { Authorization: `${this.scheme} ${this.token}`, ...(type ? { 'Content-Type': type } : {}), 'User-Agent': 'DiscordBot (https://github.com, 1) works' },
          body: payload,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        const net = e.name === 'TimeoutError' ? 'timeout' : e.message;
        throw new DiscordError(`Discord not reachable: ${net}`, { retry: true, net });
      }
      const remaining = res.headers.get('x-ratelimit-remaining');
      const resetAfter = Number(res.headers.get('x-ratelimit-reset-after'));
      if (remaining === '0' && resetAfter > 0) this.blocked.set(key, Date.now() + resetAfter * 1000);
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (res.status === 429) {
        const after = Number((data && data.retry_after) || res.headers.get('retry-after') || 1);
        // Etwas Streuung: Alle wartenden Anfragen sollen nicht im selben Moment wieder losschießen.
        await sleep(Math.min(Math.max(after, 0.05), 60) * 1000 + Math.random() * 250);
        continue;
      }
      if (res.ok) return data;
      const msg = (data && data.message) || `HTTP ${res.status}`;
      throw new DiscordError(`Discord ${res.status}: ${msg}`, { status: res.status, code: data && data.code, retry: res.status >= 500 });
    }
    throw new DiscordError('Discord: too many requests, try again later', { status: 429, retry: true });
  }

  get(route) { return this.req('GET', route); }
  post(route, body, files) { return this.req('POST', route, body, files); }
  patch(route, body, files) { return this.req('PATCH', route, body, files); }
  put(route, body) { return this.req('PUT', route, body); }
  del(route) { return this.req('DELETE', route); }
}

// ---------- Rechte in Kanälen (W-0038) ----------

// Was der Bot zum Schreiben braucht: Kanal sehen, senden, Links einbetten. Die Namen stehen in missing.
export const WRITE = { view: 1n << 10n, send: 1n << 11n, embed: 1n << 14n };
const ADMIN = 1n << 3n;
const ALL = (1n << 53n) - 1n;
const big = (v) => { try { return BigInt(v || 0); } catch { return 0n; } };

// Rechte eines Mitglieds in einem Kanal, wie Discord sie berechnet: @everyone und Rollen, dann die Overwrites des
// Kanals (@everyone, alle Rollen zusammen, das Mitglied). Besitzer und Administratoren dürfen alles.
export function permissionsIn(guild, member, channel) {
  if (guild.owner_id && guild.owner_id === member.id) return ALL;
  const roles = new Map((guild.roles || []).map((r) => [r.id, big(r.permissions)]));
  let p = roles.get(guild.id) || 0n;
  for (const r of member.roles) p |= roles.get(r) || 0n;
  if (p & ADMIN) return ALL;
  const ow = channel.permission_overwrites || [];
  const apply = (allow, deny) => { p = (p & ~deny) | allow; };
  const every = ow.find((o) => o.id === guild.id);
  if (every) apply(big(every.allow), big(every.deny));
  let allow = 0n; let deny = 0n;
  for (const o of ow) if (Number(o.type) === 0 && o.id !== guild.id && member.roles.includes(o.id)) { allow |= big(o.allow); deny |= big(o.deny); }
  apply(allow, deny);
  const mine = ow.find((o) => Number(o.type) === 1 && o.id === member.id);
  if (mine) apply(big(mine.allow), big(mine.deny));
  return p;
}

// Textkanäle eines Servers (Text und Ankündigungen) in der Reihenfolge von Discord: ohne Kategorie zuerst, dann je
// Kategorie. can: der Bot darf dort schreiben, sonst nennt missing, was fehlt. get: Abruf einer REST-Route.
export async function guildChannels(get, guildId, botId) {
  const [guild, channels, m] = await Promise.all([get(`/guilds/${guildId}`), get(`/guilds/${guildId}/channels`), get(`/guilds/${guildId}/members/${botId}`)]);
  const member = { id: botId, roles: (m && m.roles) || [] };
  const cats = new Map(channels.filter((c) => c.type === 4).map((c) => [c.id, c]));
  const order = (c) => (cats.has(c.parent_id) ? (cats.get(c.parent_id).position || 0) + 1 : 0) * 1e6 + (c.position || 0);
  return channels.filter((c) => c.type === 0 || c.type === 5).sort((a, b) => order(a) - order(b)).map((c) => {
    const p = permissionsIn(guild, member, c);
    const missing = Object.keys(WRITE).filter((k) => !(p & WRITE[k]));
    return { id: c.id, name: c.name, category: cats.has(c.parent_id) ? cats.get(c.parent_id).name : '', can: !missing.length, missing };
  });
}

// Status des Bots in der Mitgliederliste (W-0044): ein eigener Status, ohne Text nur online.
export const presenceOf = (text) => ({ status: 'online', since: null, afk: false, activities: text ? [{ type: 4, name: 'Custom Status', state: String(text).slice(0, 128) }] : [] });

export const hasWebSocket = () => typeof globalThis.WebSocket === 'function';

// Gateway: Hello, Identify oder Resume, Heartbeat mit Ack-Prüfung, Neuverbindung mit wachsender Pause.
// Endgültige Close-Codes (Token ungültig, Intents) beenden die Verbindung; onFatal meldet das dem Bot.
const FATAL = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

export class Gateway {
  constructor({ token, url, intents = 1, log = () => {}, onFatal = () => {}, onDispatch = () => {}, status = '' }) {
    Object.assign(this, { token, url, intents, log, onFatal, onDispatch });
    this.presence = presenceOf(status);
    this.seq = null; this.session = null; this.resumeUrl = null;
    this.stopped = false; this.backoff = 1000; this.ws = null; this.hb = null; this.acked = true;
    this.ready = false;
  }

  start() { this.connect(false); }

  connect(resume) {
    if (this.stopped) return;
    const base = resume && this.resumeUrl ? this.resumeUrl : this.url;
    const ws = new WebSocket(`${base}${base.includes('?') ? '&' : '?'}v=10&encoding=json`);
    this.ws = ws;
    this.ready = false;
    ws.onmessage = (m) => {
      let p;
      try { p = JSON.parse(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString('utf8')); } catch { return; }
      this.handle(p, resume && this.session);
    };
    ws.onclose = (e) => this.closed(ws, e.code);
    ws.onerror = () => { /* onclose folgt */ };
  }

  send(op, d) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ op, d })); } catch { /* onclose folgt */ } }

  handle(p, resuming) {
    if (p.s) this.seq = p.s;
    if (p.op === 10) {
      this.stopBeat();
      this.acked = true;
      const iv = p.d.heartbeat_interval;
      // Erster Herzschlag nach Zufallsversatz, danach im Takt. Zwei getrennte Zeitgeber würden fast gleichzeitig
      // schlagen und das fehlende Ack als tote Verbindung deuten.
      this.hbStart = setTimeout(() => { this.beat(); this.hb = setInterval(() => this.beat(), iv); }, Math.floor(iv * Math.random()));
      if (resuming) this.send(6, { token: this.token, session_id: this.session, seq: this.seq });
      else this.send(2, { token: this.token, intents: this.intents, properties: { os: process.platform, browser: 'works', device: 'works' }, presence: this.presence });
    } else if (p.op === 11) this.acked = true;
    else if (p.op === 1) this.beat(true);
    else if (p.op === 7) this.reconnect(true);
    else if (p.op === 9) { if (!p.d) { this.session = null; this.seq = null; } setTimeout(() => this.reconnect(!!p.d), 1000 + Math.random() * 2000); }
    else if (p.op === 0) {
      if (p.t === 'READY') { this.session = p.d.session_id; this.resumeUrl = p.d.resume_gateway_url; this.ready = true; this.backoff = 1000; this.presenceDue = false; this.log('Gateway verbunden'); }
      if (p.t === 'RESUMED') {
        this.ready = true; this.backoff = 1000; this.log('Gateway fortgesetzt');
        if (this.presenceDue) { this.presenceDue = false; this.send(3, this.presence); }
      }
      this.onDispatch(p.t, p.d);
    }
  }

  stopBeat() { clearTimeout(this.hbStart); clearInterval(this.hb); }

  // Neuer Status; ohne Verbindung geht er beim nächsten Identify mit, nach einer Fortsetzung (Resume, kein Identify)
  // schickt handle() ihn bei RESUMED nach (W-0047).
  setStatus(text) {
    this.presence = presenceOf(text);
    this.presenceDue = !this.ready;
    if (this.ready) this.send(3, this.presence);
  }

  beat(force = false) {
    if (!force && !this.acked) { this.log('Gateway antwortet nicht, neu verbinden'); this.reconnect(true); return; }
    this.acked = false;
    this.send(1, this.seq);
  }

  // Schließen mit 4000 hält die Sitzung fortsetzbar.
  reconnect(resume) {
    const ws = this.ws;
    this.ws = null;
    // Ab hier ist die Verbindung weg: Ein Status aus dieser Lücke muss nach der Fortsetzung nachkommen (W-0048).
    this.ready = false;
    this.stopBeat();
    if (ws) { ws.onclose = null; try { ws.close(4000); } catch { /* schon zu */ } }
    if (!resume) { this.session = null; this.seq = null; }
    setTimeout(() => this.connect(resume), 200);
  }

  closed(ws, code) {
    if (ws !== this.ws) return;
    this.stopBeat();
    this.ready = false;
    if (this.stopped) return;
    if (FATAL.has(code)) { this.stopped = true; this.log(`Gateway beendet (Code ${code})`); this.onFatal(code); return; }
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 60000);
    this.log(`Gateway getrennt (Code ${code}), neuer Versuch in ${Math.round(wait / 1000)} s`);
    setTimeout(() => this.connect(!!this.session), wait);
  }

  stop() {
    this.stopped = true;
    this.stopBeat();
    if (this.ws) { try { this.ws.close(1000); } catch { /* schon zu */ } }
  }
}
