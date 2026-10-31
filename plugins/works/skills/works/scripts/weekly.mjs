// Wochenbericht: Zahlen und Listen aus den Aufgaben, Zusammenfassung von Claude, als Markdown und HTML.
// Optional an einen Discord-Kanal per Webhook. Die Webhook-URL liegt nur lokal in .works/report.local.json.
import fs from 'node:fs';
import path from 'node:path';
import { worksDir, readJson, writeJson, exists, loadTasks, isBlocked, openBlockers, isOverdue, openQuestions, today, OPEN_STATUSES, STATUS_LABEL } from './lib.mjs';
import { byIdMap, milestoneProgress } from './views.mjs';
import { addDays } from './sprint.mjs';
import { loadComments } from './comments.mjs';
import { ensureGitignore } from './server-control.mjs';

export const DEFAULT_REPORT = {
  days: 7,
  enabled: false,
  weekday: 5,
  time: '16:00',
  destinations: { file: true, discord: false },
  include: { done: true, attention: true, next: true, milestones: true },
};

export function reportSettings(config) {
  const r = config.report || {};
  return { ...DEFAULT_REPORT, ...r, destinations: { ...DEFAULT_REPORT.destinations, ...(r.destinations || {}) }, include: { ...DEFAULT_REPORT.include, ...(r.include || {}) } };
}

const localFile = (root) => path.join(worksDir(root), 'report.local.json');
export function localReport(root) { return readJson(localFile(root), {}) || {}; }
export function setWebhook(root, url) {
  if (url && !/^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) throw new Error('Das ist keine Discord-Webhook-URL (https://discord.com/api/webhooks/...).');
  ensureGitignore(root, ['report.local.json']);
  const cur = localReport(root);
  if (url) cur.discord_webhook = url; else delete cur.discord_webhook;
  writeJson(localFile(root), cur);
  try { fs.chmodSync(localFile(root), 0o600); } catch { /* Windows */ }
}

export function isoWeek(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return { year: d.getFullYear(), week: 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7) };
}

export function weekRange(iso = today()) {
  const d = new Date(iso + 'T00:00:00');
  const start = addDays(iso, -((d.getDay() + 6) % 7));
  return { start, end: addDays(start, 6), ...isoWeek(iso) };
}

export function reportName(range) { return `${range.year}-KW${String(range.week).padStart(2, '0')}`; }
export function reportExists(root, range) { return exists(path.join(worksDir(root), 'reports', `${reportName(range)}.md`)); }

// Ist laut Einstellung ein Bericht für diese Woche fällig und noch nicht geschrieben?
export function reportDue(root, config, now = new Date()) {
  const s = reportSettings(config);
  if (!s.enabled) return null;
  const range = weekRange(now.toLocaleDateString('sv-SE'));
  if (reportExists(root, range)) return null;
  const wd = ((now.getDay() + 6) % 7) + 1;
  const hm = now.toTimeString().slice(0, 5);
  if (wd < s.weekday || (wd === s.weekday && hm < s.time)) return null;
  return range;
}

export function collect(root, config, range) {
  const all = loadTasks(root);
  const byId = byIdMap(all);
  const inRange = (d) => d && String(d) >= range.start && String(d) <= range.end;
  const hist = (t) => (t._body.match(/^- (\d{4}-\d{2}-\d{2}): Gestartet/m) || [])[1];
  const open = all.filter((t) => OPEN_STATUSES.includes(t.status));
  const queue = (config.queue || []).map((id) => byId.get(id)).filter((t) => t && OPEN_STATUSES.includes(t.status));
  const attention = [];
  for (const t of open) {
    const q = openQuestions(t);
    if (q.length) attention.push(`${t.id}: offene Frage, ${q[0].text}`);
    if (t.status === 'review') attention.push(`${t.id}: wartet auf deine Abnahme`);
    if (isOverdue(t)) attention.push(`${t.id} ${t.title} ist seit ${t.due} überfällig`);
    const last = loadComments(t).slice(-1)[0];
    if (last && last.author === 'Claude' && inRange(last.at.slice(0, 10))) attention.push(`${t.id}: Claude hat kommentiert und wartet auf deine Antwort`);
  }
  return {
    range,
    done: all.filter((t) => t.status === 'erledigt' && inRange(t.completed)),
    started: all.filter((t) => inRange(hist(t))),
    created: all.filter((t) => inRange(t.created)),
    overdue: open.filter(isOverdue),
    blocked: open.filter((t) => isBlocked(t, byId)).map((t) => ({ t, by: openBlockers(t, byId) })),
    attention: [...new Set(attention)].slice(0, 12),
    next: (queue.length ? queue : open.filter((t) => ['in-arbeit', 'review', 'geplant'].includes(t.status))).slice(0, 6),
    milestones: milestoneProgress(config, all).filter((m) => m.status !== 'erledigt'),
    open: open.length,
  };
}

export function autoSummary(d) {
  const bits = [`${d.done.length} Aufgabe${d.done.length === 1 ? '' : 'n'} erledigt`, `${d.started.length} begonnen`, `${d.created.length} neu angelegt`];
  let s = `Diese Woche: ${bits.join(', ')}.`;
  if (d.overdue.length) s += ` ${d.overdue.length} ${d.overdue.length === 1 ? 'ist' : 'sind'} überfällig.`;
  if (d.next.length) s += ` Als Nächstes: ${d.next.slice(0, 3).map((t) => t.id).join(', ')}.`;
  return s;
}

export function toMarkdown(project, d, summary, inc) {
  const L = [`# ${project}, KW ${d.range.week}`, '', `${fmt(d.range.start)} bis ${fmt(d.range.end)}`, '', summary, ''];
  L.push(`Erledigt ${d.done.length}, begonnen ${d.started.length}, neu ${d.created.length}, überfällig ${d.overdue.length}, offen gesamt ${d.open}.`, '');
  if (inc.done) { L.push('## Erledigt', ''); L.push(...(d.done.length ? d.done.map((t) => `- ${t.id} ${t.title}`) : ['Keine.']), ''); }
  if (inc.attention) { L.push('## Braucht dich', ''); L.push(...(d.attention.length ? d.attention.map((x) => `- ${x}`) : ['Nichts offen.']), ''); }
  if (inc.next) { L.push('## Nächste Woche', ''); L.push(...(d.next.length ? d.next.map((t) => `- ${t.id} ${t.title} (${STATUS_LABEL[t.status]})`) : ['Noch nichts geplant.']), ''); }
  if (inc.milestones && d.milestones.length) { L.push('## Meilensteine', ''); L.push(...d.milestones.map((m) => `- ${m.id} ${m.title}: ${m.done} von ${m.total}${m.due ? `, Ziel ${fmt(m.due)}` : ''}`), ''); }
  return L.join('\n');
}

const fmt = (iso) => { const [y, m, dd] = String(iso).split('-'); return `${dd}.${m}.${y}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Eigenständige HTML-Datei. Folgt dem Farbschema des Boards (localStorage works-theme) oder dem System.
export function toHtml(project, d, summary, inc) {
  const list = (items) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>` : '<p class="muted">Keine.</p>');
  const stat = (n, l, bad) => `<div class="stat${bad && n ? ' bad' : ''}"><b>${n}</b><span>${l}</span></div>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark">
<title>${esc(project)}, KW ${d.range.week}</title>
<script>(function(){var t='auto';var m=location.hash.match(/theme=(light|dark)/);if(m)t=m[1];else{try{t=JSON.parse(localStorage.getItem('works-theme')||'"auto"');}catch(e){}}if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);})();</script>
<style>
:root{--bg:#f3f5f8;--card:#fff;--soft:#eef1f4;--line:#dce1e8;--text:#18202c;--text2:#3f4a5c;--muted:#647085;--bad:#c4343a;--badsoft:#fdecec}
:root[data-theme=dark]{--bg:#141a24;--card:#1c2330;--soft:#222b3a;--line:#2b3546;--text:#e6eaf2;--text2:#c0c8d6;--muted:#8d98ab;--bad:#f0676c;--badsoft:rgba(240,103,108,.14)}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#141a24;--card:#1c2330;--soft:#222b3a;--line:#2b3546;--text:#e6eaf2;--text2:#c0c8d6;--muted:#8d98ab;--bad:#f0676c;--badsoft:rgba(240,103,108,.14)}}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:32px auto;padding:32px 36px;background:var(--card);border:1px solid var(--line);border-radius:12px}
h1{margin:0;font-size:24px;letter-spacing:-.01em}header{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:18px}
header span,.muted{color:var(--muted)}h2{font-size:15px;margin:22px 0 6px}ul{margin:0;padding-left:20px}p.sum{color:var(--text2);font-size:16px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}.stat{padding:10px 12px;border-radius:8px;background:var(--soft)}.stat b{display:block;font-size:22px}.stat span{font-size:12px;color:var(--muted)}.stat.bad{background:var(--badsoft)}.stat.bad b{color:var(--bad)}
@media (max-width:560px){main{margin:0;border-radius:0;padding:24px 16px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head><body><main>
<header><h1>${esc(project)}, KW ${d.range.week}</h1><span>${fmt(d.range.start)} bis ${fmt(d.range.end)}</span></header>
<p class="sum">${esc(summary)}</p>
<div class="stats">${stat(d.done.length, 'erledigt')}${stat(d.started.length, 'begonnen')}${stat(d.created.length, 'neu angelegt')}${stat(d.overdue.length, 'überfällig', true)}</div>
${inc.done ? `<h2>Erledigt</h2>${list(d.done.map((t) => `${esc(t.id)} ${esc(t.title)}`))}` : ''}
${inc.attention ? `<h2>Braucht dich</h2>${list(d.attention.map(esc))}` : ''}
${inc.next ? `<h2>Nächste Woche</h2>${list(d.next.map((t) => `${esc(t.id)} ${esc(t.title)}`))}` : ''}
${inc.milestones && d.milestones.length ? `<h2>Meilensteine</h2>${list(d.milestones.map((m) => `${esc(m.id)} ${esc(m.title)}: ${m.done} von ${m.total}${m.due ? `, Ziel ${fmt(m.due)}` : ''}`))}` : ''}
</main></body></html>`;
}

async function sendDiscord(url, project, d, summary, inc) {
  const field = (name, items) => ({ name, value: (items.length ? items.map((x) => `• ${x}`).join('\n') : 'Keine.').slice(0, 1020) });
  const fields = [];
  if (inc.done) fields.push(field(`Erledigt (${d.done.length})`, d.done.map((t) => `${t.id} ${t.title}`)));
  if (inc.attention) fields.push(field('Braucht dich', d.attention));
  if (inc.next) fields.push(field('Nächste Woche', d.next.map((t) => `${t.id} ${t.title}`)));
  const body = { username: 'works', embeds: [{ title: `${project}, KW ${d.range.week}`.slice(0, 250), description: summary.slice(0, 3900), color: 0x7f7bf6, fields, footer: { text: `${fmt(d.range.start)} bis ${fmt(d.range.end)}` } }] };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) throw new Error(`Discord antwortet mit ${res.status}.`);
  } finally { clearTimeout(timer); }
}

export async function writeWeekly(root, config, { date = today(), summary = '', send = null } = {}) {
  const s = reportSettings(config);
  const range = weekRange(date);
  const d = collect(root, config, range);
  const sum = summary.trim() || autoSummary(d);
  const project = path.basename(root);
  const dir = path.join(worksDir(root), 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const name = reportName(range);
  fs.writeFileSync(path.join(dir, `${name}.md`), toMarkdown(project, d, sum, s.include));
  fs.writeFileSync(path.join(dir, `${name}.html`), toHtml(project, d, sum, s.include));
  const notes = [];
  const wantDiscord = send === null ? s.destinations.discord : send;
  if (wantDiscord) {
    const url = localReport(root).discord_webhook;
    if (!url) notes.push('Discord ist eingeschaltet, aber kein Webhook hinterlegt.');
    else {
      try { await sendDiscord(url, project, d, sum, s.include); notes.push('An Discord gesendet.'); } catch (e) { notes.push(`Discord: ${e.name === 'AbortError' ? 'Zeitüberschreitung' : e.message}`); }
    }
  }
  return { name, md: path.join(dir, `${name}.md`), html: path.join(dir, `${name}.html`), notes, summary: sum, range };
}

export function listReports(root) {
  const dir = path.join(worksDir(root), 'reports');
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return []; }
  return files.filter((f) => /\.(md|html)$/.test(f)).reduce((acc, f) => {
    const base = f.replace(/\.(md|html)$/, '');
    let e = acc.find((x) => x.name === base);
    if (!e) { e = { name: base, md: '', html: '' }; acc.push(e); }
    e[f.endsWith('.md') ? 'md' : 'html'] = `reports/${f}`;
    return acc;
  }, []).sort((a, b) => b.name.localeCompare(a.name)).slice(0, 30);
}
