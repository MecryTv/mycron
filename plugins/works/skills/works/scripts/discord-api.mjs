// Discord REST und Gateway für den Bot works (W-0036). Ohne Abhängigkeiten: fetch und das globale WebSocket
// (Node 22 oder neuer). Fehlermeldungen enthalten nie das Token.

export class DiscordError extends Error {
  constructor(message, { status = 0, code = 0, retry = false } = {}) { super(message); this.status = status; this.code = code; this.retry = retry; }
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
        throw new DiscordError(`Discord nicht erreichbar: ${e.name === 'TimeoutError' ? 'Zeitüberschreitung' : e.message}`, { retry: true });
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
    throw new DiscordError('Discord: zu viele Anfragen, später erneut', { status: 429, retry: true });
  }

  get(route) { return this.req('GET', route); }
  post(route, body, files) { return this.req('POST', route, body, files); }
  patch(route, body, files) { return this.req('PATCH', route, body, files); }
  put(route, body) { return this.req('PUT', route, body); }
  del(route) { return this.req('DELETE', route); }
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
      if (p.t === 'READY') { this.session = p.d.session_id; this.resumeUrl = p.d.resume_gateway_url; this.ready = true; this.backoff = 1000; this.log('Gateway verbunden'); }
      if (p.t === 'RESUMED') { this.ready = true; this.backoff = 1000; this.log('Gateway fortgesetzt'); }
      this.onDispatch(p.t, p.d);
    }
  }

  stopBeat() { clearTimeout(this.hbStart); clearInterval(this.hb); }

  // Neuer Status; ohne Verbindung geht er beim nächsten Identify mit.
  setStatus(text) {
    this.presence = presenceOf(text);
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
