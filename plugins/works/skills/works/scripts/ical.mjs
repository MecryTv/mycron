// Kalender-Export (iCalendar): Fälligkeiten offener Aufgaben, Meilensteine, Sprints und wiederkehrende Termine.
import path from 'node:path';
import { loadTasks, loadConfig, OPEN_STATUSES, STATUS_LABEL } from './lib.mjs';
import { sprintList } from './sprint.mjs';
import { rules, upcoming, describe } from './recurring.mjs';

const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const day = (iso) => iso.replace(/-/g, '');
const nextDay = (iso) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE').replace(/-/g, ''); };

// Zeilen über 75 Zeichen umbrechen, wie es der Standard verlangt.
function fold(line) {
  const out = [];
  let s = line;
  while (Buffer.byteLength(s, 'utf8') > 74) {
    let cut = 74;
    while (Buffer.byteLength(s.slice(0, cut), 'utf8') > 74) cut--;
    out.push(s.slice(0, cut)); s = ' ' + s.slice(cut);
  }
  out.push(s);
  return out.join('\r\n');
}

export function buildIcal(root, { tasks = true, milestones = true, sprints = true, recurring = false } = {}) {
  const config = loadConfig(root);
  const project = path.basename(root);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const ev = [];
  const add = (uid, start, end, summary, desc) => ev.push(['BEGIN:VEVENT', `UID:${uid}@works-${esc(project)}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(start)}`, `DTEND;VALUE=DATE:${end ? nextDay(end) : nextDay(start)}`, `SUMMARY:${esc(summary)}`, desc ? `DESCRIPTION:${esc(desc)}` : '', 'END:VEVENT'].filter(Boolean));
  if (tasks) for (const t of loadTasks(root, { archive: false }).filter((x) => x.due && OPEN_STATUSES.includes(x.status))) add(`task-${t.id}`, String(t.due), null, `${t.id} fällig: ${t.title}`, `${t.priority}, ${STATUS_LABEL[t.status]}`);
  if (milestones) for (const m of config.milestones || []) if (m.due && m.status !== 'erledigt') add(`ms-${m.id}`, m.due, null, `Meilenstein ${m.id}: ${m.title}`, m.description || '');
  if (sprints) for (const s of sprintList(config).filter((x) => x.status !== 'abgeschlossen')) add(`sprint-${s.id}`, s.start, s.end, `${s.id} ${s.title}`, s.goal ? `Ziel: ${s.goal}` : '');
  if (recurring) for (const r of rules(config).filter((x) => x.active !== false)) for (const d of upcoming(r, 3)) add(`rec-${r.id}-${d}`, d, null, `Wiederkehrend: ${r.title}`, describe(r));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//works//DE', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:works ${esc(project)}`, ...ev.flat(), 'END:VCALENDAR'];
  return lines.map(fold).join('\r\n') + '\r\n';
}
