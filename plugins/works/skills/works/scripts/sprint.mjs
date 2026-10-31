// Sprints: ein Zeitraum mit Ziel, Kapazität in Punkten und den eingeplanten Aufgaben.
// Gespeichert in config.json unter sprints und sprint_settings.
import { today, daysBetween } from './lib.mjs';

export const DEFAULT_POINTS = { S: 1, M: 2, L: 4, XL: 8 };

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
}

export function sprintSettings(config) {
  const s = config.sprint_settings || {};
  return { length_days: 14, capacity: 20, ...s, points: { ...DEFAULT_POINTS, ...(s.points || {}) } };
}

export function sprintList(config) {
  return Array.isArray(config.sprints) ? config.sprints : [];
}

export function activeSprint(config) {
  return sprintList(config).find((s) => s.status === 'aktiv') || null;
}

export function lastClosedSprint(config) {
  return sprintList(config).filter((s) => s.status === 'abgeschlossen').slice(-1)[0] || null;
}

// Aufgaben ohne Schätzung zählen wie M, damit die Kapazität nicht zu optimistisch wirkt.
export function pointsOf(task, settings) {
  return settings.points[task.effort] ?? settings.points.M;
}

export function nextSprintId(config) {
  const max = Math.max(0, ...sprintList(config).map((s) => parseInt(String(s.id).replace(/\D/g, ''), 10) || 0));
  return `S${max + 1}`;
}

export function sprintStats(config, sprint, tasks) {
  const set = sprintSettings(config);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const list = (sprint.tasks || []).map((id) => byId.get(id)).filter(Boolean).filter((t) => t.status !== 'verworfen');
  const pts = (t) => pointsOf(t, set);
  const sum = (f) => list.filter(f).reduce((a, t) => a + pts(t), 0);
  const planned = sum(() => true);
  const done = sum((t) => t.status === 'erledigt');
  const working = sum((t) => t.status === 'in-arbeit' || t.status === 'review');
  const days = Math.max(1, daysBetween(sprint.start, sprint.end) + 1);
  const now = today();
  const dayIndex = Math.min(days, Math.max(0, daysBetween(sprint.start, now) + 1));
  const series = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(sprint.start, i);
    if (d > now) break;
    series.push({ d, remaining: sum((t) => !(t.status === 'erledigt' && String(t.completed || t.updated || '') <= d)) });
  }
  const unestimated = list.filter((t) => !t.effort).length;
  return {
    planned, done, working, open: planned - done - working, capacity: sprint.capacity ?? set.capacity,
    days, dayIndex, series, unestimated, count: list.length,
    idealNow: planned * (1 - Math.min(1, Math.max(0, dayIndex - 1) / Math.max(1, days - 1))),
  };
}

export function sprintSummaryLine(config, tasks) {
  const s = activeSprint(config);
  if (!s) return '';
  const st = sprintStats(config, s, tasks);
  const open = (s.tasks || []).map((id) => tasks.find((t) => t.id === id)).filter((t) => t && !['erledigt', 'verworfen'].includes(t.status));
  return `Sprint ${s.id}${s.title ? ` ${s.title}` : ''} bis ${s.end}${s.goal ? `, Ziel: ${s.goal}` : ''}: ${st.done} von ${st.planned} Punkten erledigt.`
    + (open.length ? ` Offen im Sprint: ${open.slice(0, 6).map((t) => t.id).join(', ')}${open.length > 6 ? ' und weitere' : ''}. Sprint-Aufgaben haben nach der Warteschlange Vorrang.` : '');
}
