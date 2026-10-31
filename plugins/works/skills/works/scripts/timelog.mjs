// Zeiterfassung: Die Hooks schreiben für jede Anfrage an Claude einen Start- und einen Stop-Eintrag
// in .works/time.jsonl. Daraus entstehen aktive Zeit, Sitzungen je Aufgabe und Schätzgenauigkeit.
import fs from 'node:fs';
import path from 'node:path';
import { worksDir, exists, getSection, daysBetween, today, EFFORTS } from './lib.mjs';

const MAX_TURN_MS = 3 * 3600 * 1000;
const SESSION_GAP_MS = 20 * 60 * 1000;
export const DEFAULT_EFFORT_DAYS = { S: 2, M: 5, L: 10, XL: 15 };

export function timeFile(root) { return path.join(worksDir(root), 'time.jsonl'); }

export function recordEvent(root, ev, task, session = '') {
  const line = JSON.stringify({ t: new Date().toISOString(), ev, task: task || '', s: String(session || '').slice(0, 64) });
  fs.appendFileSync(timeFile(root), line + '\n');
}

function readEvents(root) {
  const file = timeFile(root);
  if (!exists(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && e.t && (e.ev === 'start' || e.ev === 'stop'));
}

// Paare aus Start und Stop. Eine Anfrage zählt für die Aufgabe, die beim Start aktiv war.
export function turns(root) {
  const open = new Map();
  const out = [];
  for (const e of readEvents(root)) {
    const key = e.s || '-';
    if (e.ev === 'start') { open.set(key, e); continue; }
    const s = open.get(key);
    if (!s) continue;
    open.delete(key);
    const a = Date.parse(s.t); const b = Date.parse(e.t);
    if (!(b > a)) continue;
    const task = s.task || e.task;
    if (!task) continue;
    out.push({ task, start: a, end: Math.min(b, a + MAX_TURN_MS) });
  }
  return out;
}

// Aktive Zeit einer Aufgabe, zu Sitzungen zusammengefasst (Pausen über 20 Minuten trennen).
export function taskTime(root, task) {
  const list = turns(root).filter((x) => x.task === task.id).sort((a, b) => a.start - b.start);
  const sessions = [];
  for (const t of list) {
    const last = sessions[sessions.length - 1];
    if (last && t.start - last.end <= SESSION_GAP_MS) { last.end = Math.max(last.end, t.end); last.ms += t.end - t.start; last.turns++; } else sessions.push({ start: t.start, end: t.end, ms: t.end - t.start, turns: 1 });
  }
  const history = historyOf(task);
  for (const s of sessions) {
    const day = new Date(s.start).toLocaleDateString('sv-SE');
    const entry = history.filter((h) => h.date === day && !/^(Gestartet|Status|Übergabe)/.test(h.text)).pop();
    s.label = entry ? entry.text.replace(/ \[[^\]]+\]$/, '').slice(0, 90) : '';
  }
  const total = sessions.reduce((a, s) => a + s.ms, 0);
  return { totalMs: total, sessions: sessions.reverse().slice(0, 30), statusDays: statusDays(task), started: startedOf(task) };
}

export function historyOf(task) {
  return (getSection(task._body, 'Verlauf') || '').split('\n')
    .map((l) => l.match(/^- (\d{4}-\d{2}-\d{2}): (.*)$/)).filter(Boolean).map((m) => ({ date: m[1], text: m[2] }));
}

export function startedOf(task) {
  const h = historyOf(task).find((x) => x.text.startsWith('Gestartet'));
  return h ? h.date : '';
}

// Tage je Status aus den Verlaufseinträgen "(Status: a → b)".
export function statusDays(task) {
  const marks = [{ date: task.created || today(), status: 'backlog' }];
  for (const h of historyOf(task)) {
    const m = h.text.match(/Status: ([\w-]+) → ([\w-]+)/);
    if (m) marks.push({ date: h.date, status: m[2] });
  }
  const out = {};
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].date : (['erledigt', 'verworfen'].includes(task.status) ? marks[i].date : today());
    const d = Math.max(0, daysBetween(marks[i].date, end));
    if (['erledigt', 'verworfen'].includes(marks[i].status)) continue;
    out[marks[i].status] = (out[marks[i].status] || 0) + d;
  }
  return out;
}

// Schätzung gegen tatsächliche Dauer erledigter Aufgaben (Kalendertage vom Start bis zum Abschluss).
export function estimates(root, tasks, config) {
  const done = tasks.filter((t) => t.status === 'erledigt' && t.effort && t.completed).slice(-60);
  const fixed = { ...DEFAULT_EFFORT_DAYS, ...(config.effort_days || {}) };
  const by = {};
  const worst = [];
  for (const t of done) {
    const s = startedOf(t) || t.created;
    if (!s) continue;
    const days = Math.max(1, daysBetween(s, t.completed));
    (by[t.effort] = by[t.effort] || []).push(days);
    worst.push({ id: t.id, title: t.title, effort: t.effort, days, over: days - fixed[t.effort] });
  }
  const sizes = EFFORTS.map((e) => {
    const list = by[e] || [];
    const avg = list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
    return { effort: e, estimate: fixed[e], n: list.length, avg: avg === null ? null : Math.round(avg * 10) / 10 };
  });
  const measured = Object.fromEntries(sizes.map((s) => [s.effort, s.n >= 3 ? Math.max(1, Math.round(s.avg)) : s.estimate]));
  return {
    sizes, measured, fixed, mode: config.effort_mode === 'measured' ? 'measured' : 'fixed',
    worst: worst.filter((w) => w.over > 0).sort((a, b) => b.over - a.over).slice(0, 5),
  };
}

export function effortDays(root, tasks, config) {
  const e = estimates(root, tasks, config);
  return e.mode === 'measured' ? e.measured : e.fixed;
}

export function fmtDuration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
