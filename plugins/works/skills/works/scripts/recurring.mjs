// Wiederkehrende Aufgaben: Regeln in config.json unter recurring. Fällige Regeln legen eine neue Aufgabe an,
// aber nur, wenn die zuletzt angelegte nicht mehr offen ist.
import { today, OPEN_STATUSES } from './lib.mjs';
import { addDays } from './sprint.mjs';

export const KINDS = ['daily', 'weekly', 'monthly', 'days'];
export const RULE_ID_RE = /^R\d{1,4}$/;

export function rules(config) { return Array.isArray(config.recurring) ? config.recurring : []; }

const dow = (iso) => ((new Date(iso + 'T00:00:00').getDay() + 6) % 7) + 1; // 1 Montag bis 7 Sonntag

// Nächster Termin ab (einschließlich) from.
export function nextDate(rule, from = today()) {
  const k = rule.kind;
  if (k === 'daily') return from;
  if (k === 'days') {
    const start = rule.start || from;
    if (from <= start) return start;
    const n = Math.max(1, rule.interval || 1);
    const diff = Math.round((new Date(from + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000);
    return addDays(start, Math.ceil(diff / n) * n);
  }
  if (k === 'weekly') {
    const wd = Math.min(7, Math.max(1, rule.weekday || 1));
    const n = Math.max(1, rule.interval || 1);
    let d = addDays(from, (wd - dow(from) + 7) % 7);
    if (n > 1 && rule.start) {
      // Nur jede n-te Woche ab dem Start.
      for (let i = 0; i < 60; i++) {
        const weeks = Math.round((new Date(d + 'T00:00:00') - new Date(rule.start + 'T00:00:00')) / (7 * 86400000));
        if (weeks >= 0 && weeks % n === 0) break;
        d = addDays(d, 7);
      }
    }
    return d;
  }
  if (k === 'monthly') {
    // nth Wochentag im Monat (nth 1 bis 4, 5 = letzter) oder fester Tag (day).
    const dt = new Date(from + 'T00:00:00');
    for (let m = 0; m < 14; m++) {
      const y = dt.getFullYear(); const mo = dt.getMonth() + m;
      let cand;
      if (rule.day) {
        const last = new Date(y, mo + 1, 0).getDate();
        cand = new Date(y, mo, Math.min(rule.day, last));
      } else {
        const wd = Math.min(7, Math.max(1, rule.weekday || 1));
        const nth = Math.min(5, Math.max(1, rule.nth || 1));
        const first = new Date(y, mo, 1);
        let day = 1 + ((wd - (((first.getDay() + 6) % 7) + 1) + 7) % 7) + (nth - 1) * 7;
        const last = new Date(y, mo + 1, 0).getDate();
        if (nth === 5) while (day + 7 <= last) day += 7;
        if (day > last) day -= 7;
        cand = new Date(y, mo, day);
      }
      const iso = cand.toLocaleDateString('sv-SE');
      if (iso >= from) return iso;
    }
  }
  return from;
}

export function upcoming(rule, n = 3, from = today()) {
  const out = [];
  let d = from;
  for (let i = 0; i < n; i++) { const x = nextDate(rule, d); out.push(x); d = addDays(x, 1); }
  return out;
}

export function describe(rule) {
  const days = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  if (rule.kind === 'daily') return 'täglich';
  if (rule.kind === 'days') return `alle ${rule.interval || 1} Tage`;
  if (rule.kind === 'weekly') return `${(rule.interval || 1) > 1 ? `alle ${rule.interval} Wochen` : 'jede Woche'} am ${days[rule.weekday || 1]}`;
  if (rule.day) return `monatlich am ${rule.day}.`;
  return `jeden ${['', 'ersten', 'zweiten', 'dritten', 'vierten', 'letzten'][rule.nth || 1]} ${days[rule.weekday || 1]} im Monat`;
}

// Welche Regeln sind heute fällig? Gibt Paare aus Regel und Termin zurück.
export function dueRules(config, tasks, now = today()) {
  const out = [];
  for (const r of rules(config)) {
    if (r.active === false) continue;
    const from = r.last ? addDays(r.last, 1) : (r.start || now);
    const d = nextDate(r, from);
    if (d > now) continue;
    const prev = r.lastTask && tasks.find((t) => t.id === r.lastTask);
    out.push({ rule: r, date: d, blockedBy: prev && OPEN_STATUSES.includes(prev.status) ? prev.id : '' });
  }
  return out;
}

export function fillTitle(title, date) {
  const d = new Date(date + 'T00:00:00');
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const [y, m, dd] = date.split('-');
  return String(title).replace(/\{Datum\}/g, `${dd}.${m}.${y}`).replace(/\{Monat\}/g, `${months[d.getMonth()]} ${y}`);
}
