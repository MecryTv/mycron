// Token-Verbrauch und geschätzte Kosten je Aufgabe. Der Stop Hook liest den Verlauf der Sitzung
// (transcript_path) seit dem letzten Lauf und schreibt die Summe als usage-Eintrag in time.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { worksDir, readJson, writeJson, exists } from './lib.mjs';
import { timeFile } from './timelog.mjs';

// Preise in US-Dollar je Million Tokens. Nur Schätzwerte, in config.json unter prices anpassbar.
// Cache schreiben kostet 1,25 mal, Cache lesen 0,1 mal den Eingabepreis, sofern nicht anders angegeben.
export const DEFAULT_PRICES = {
  currency: 'USD',
  models: {
    opus: { input: 5, output: 25 },
    sonnet: { input: 3, output: 15 },
    haiku: { input: 1, output: 5 },
    default: { input: 3, output: 15 },
  },
  cache_write_factor: 1.25,
  cache_read_factor: 0.1,
};

export function priceTable(config) {
  const p = config.prices || {};
  return { ...DEFAULT_PRICES, ...p, models: { ...DEFAULT_PRICES.models, ...(p.models || {}) } };
}

function family(model, table) {
  const m = String(model || '').toLowerCase();
  for (const k of Object.keys(table.models)) if (k !== 'default' && m.includes(k)) return k;
  return 'default';
}

export function costOf(u, model, table) {
  const pr = table.models[family(model, table)] || table.models.default;
  const cw = pr.cache_write ?? pr.input * table.cache_write_factor;
  const cr = pr.cache_read ?? pr.input * table.cache_read_factor;
  return ((u.in || 0) * pr.input + (u.out || 0) * pr.output + (u.cw || 0) * cw + (u.cr || 0) * cr) / 1e6;
}

const stateFile = (root) => path.join(worksDir(root), '.usage-state.json');

// Liest neue Zeilen des Sitzungsverlaufs und gibt die Summen je Modell zurück.
export function collectUsage(root, transcript, session) {
  if (!transcript || !exists(transcript)) return [];
  const st = readJson(stateFile(root), {}) || {};
  const key = String(session || transcript).slice(0, 80);
  const cur = st[key] || { offset: 0, ids: [] };
  const size = fs.statSync(transcript).size;
  if (size < cur.offset) { cur.offset = 0; cur.ids = []; }
  if (size === cur.offset) return [];
  const fd = fs.openSync(transcript, 'r');
  const buf = Buffer.alloc(Math.min(size - cur.offset, 64 * 1024 * 1024));
  fs.readSync(fd, buf, 0, buf.length, cur.offset);
  fs.closeSync(fd);
  const text = buf.toString('utf8');
  const lastNl = text.lastIndexOf('\n');
  const usable = lastNl === -1 ? '' : text.slice(0, lastNl + 1);
  const seen = new Set(cur.ids);
  const byModel = new Map();
  for (const line of usable.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const msg = o.message || {};
    const u = msg.usage;
    if (!u || o.type !== 'assistant') continue;
    const mid = msg.id || o.uuid;
    if (mid && seen.has(mid)) continue;
    if (mid) seen.add(mid);
    const m = msg.model || 'unbekannt';
    const s = byModel.get(m) || { model: m, in: 0, out: 0, cw: 0, cr: 0 };
    s.in += u.input_tokens || 0; s.out += u.output_tokens || 0;
    s.cw += u.cache_creation_input_tokens || 0; s.cr += u.cache_read_input_tokens || 0;
    byModel.set(m, s);
  }
  cur.offset += Buffer.byteLength(usable, 'utf8');
  cur.ids = [...seen].slice(-800);
  st[key] = cur;
  // Alte Sitzungen nicht ewig mitschleppen.
  const keys = Object.keys(st);
  if (keys.length > 40) for (const k of keys.slice(0, keys.length - 40)) delete st[k];
  writeJson(stateFile(root), st);
  return [...byModel.values()].filter((s) => s.in || s.out || s.cw || s.cr);
}

export function recordUsage(root, task, session, list) {
  const lines = list.map((u) => JSON.stringify({ t: new Date().toISOString(), ev: 'usage', task: task || '', s: String(session || '').slice(0, 64), ...u }));
  if (lines.length) fs.appendFileSync(timeFile(root), lines.join('\n') + '\n');
}

function readUsage(root) {
  const f = timeFile(root);
  if (!exists(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e && e.ev === 'usage');
}

const add = (a, e) => { a.in += e.in || 0; a.out += e.out || 0; a.cw += e.cw || 0; a.cr += e.cr || 0; return a; };
const zero = () => ({ in: 0, out: 0, cw: 0, cr: 0, cost: 0 });

export function taskUsage(root, config, taskId) {
  const table = priceTable(config);
  const tot = zero();
  const byDay = new Map();
  for (const e of readUsage(root).filter((x) => x.task === taskId)) {
    add(tot, e); tot.cost += costOf(e, e.model, table);
    const day = e.t.slice(0, 10);
    const d = byDay.get(day) || { day, ...zero() };
    add(d, e); d.cost += costOf(e, e.model, table);
    byDay.set(day, d);
  }
  return { ...tot, tokens: tot.in + tot.out + tot.cw + tot.cr, days: [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)), currency: table.currency };
}

export function projectUsage(root, config, tasks, days = 30) {
  const table = priceTable(config);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const byTask = new Map();
  const byType = new Map();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const tot = zero();
  let untracked = 0;
  for (const e of readUsage(root).filter((x) => x.t >= since)) {
    const c = costOf(e, e.model, table);
    add(tot, e); tot.cost += c;
    if (!e.task || !byId.has(e.task)) { untracked += c; continue; }
    const t = byId.get(e.task);
    const a = byTask.get(e.task) || { id: e.task, title: t.title, type: t.type, ...zero() };
    add(a, e); a.cost += c; byTask.set(e.task, a);
    const b = byType.get(t.type) || { type: t.type, tasks: new Set(), ...zero() };
    add(b, e); b.cost += c; b.tasks.add(e.task); byType.set(t.type, b);
  }
  const tok = (x) => x.in + x.out + x.cw + x.cr;
  return {
    days, currency: table.currency, total: { ...tot, tokens: tok(tot) }, untrackedCost: untracked,
    byType: [...byType.values()].map((b) => ({ type: b.type, tasks: b.tasks.size, tokens: tok(b), cost: b.cost })).sort((a, b) => b.cost - a.cost),
    top: [...byTask.values()].map((a) => ({ ...a, tokens: tok(a) })).sort((a, b) => b.cost - a.cost).slice(0, 8),
  };
}

export function fmtTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} Mio`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} k`;
  return String(n);
}
export function fmtCost(v, cur = 'USD') {
  return `${v < 0.1 && v > 0 ? v.toFixed(3) : v.toFixed(2)} ${cur === 'USD' ? '$' : cur}`.replace('.', ',');
}
