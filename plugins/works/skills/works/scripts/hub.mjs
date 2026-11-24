// Übersicht über alle Projekte mit .works (W-0025). Projekte melden sich in ~/.works/projects.json an
// (beim Init, beim Sitzungsstart und beim Start des Boards). Jedes Board liefert die Seite unter /hub,
// works hub zeigt dieselbe Seite auf Port 4740.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, exists, loadTasks, loadConfig, isOverdue, OPEN_STATUSES, today, rootIdOf } from './lib.mjs';
import { readServer, newestCli, cliVersion } from './server-control.mjs';
import { activeSprint, sprintStats } from './sprint.mjs';
import { loadActivity } from './live.mjs';
import { liveUsage, fmtTokens, fmtCost } from './usage.mjs';
import { syncState } from './ghsync.mjs';
import { boardCss } from './board.mjs';
import { tr, language, setLanguage } from './i18n.mjs';

const HUB_CSS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'board', 'hub.css'), 'utf8');

const regFile = () => path.join(os.homedir(), '.works', 'projects.json');

export function registerProject(root) {
  try {
    const reg = readJson(regFile(), { projects: [] }) || { projects: [] };
    const real = fs.realpathSync(root);
    const list = reg.projects.filter((p) => p.path !== real);
    list.unshift({ path: real, name: path.basename(real), seen: new Date().toISOString() });
    fs.mkdirSync(path.dirname(regFile()), { recursive: true });
    writeJson(regFile(), { projects: list.slice(0, 60) });
  } catch { /* nicht kritisch */ }
}

export function projectList() {
  const reg = readJson(regFile(), { projects: [] }) || { projects: [] };
  return reg.projects.filter((p) => exists(path.join(p.path, '.works', 'config.json')));
}

const boardUrl = (s) => `http://${['0.0.0.0', '::', '', undefined].includes(s.host) ? '127.0.0.1' : s.host}:${s.port}/`;

// Laufende Boards aller angemeldeten Projekte.
export function runningBoards() {
  return projectList().map((p) => ({ p, s: readServer(p.path) })).filter((x) => x.s)
    .map(({ p, s }) => ({ id: rootIdOf(p.path), name: p.name, path: p.path, port: s.port, url: boardUrl(s) }));
}

// Alle angemeldeten Projekte mit Kennung, für verwaiste Board-Tabs (W-0029).
export function projectsBrief() {
  return projectList().map((p) => ({ id: rootIdOf(p.path), name: p.name, path: p.path }));
}

const prio = (t) => String(t.priority || 'P9');

export function projectInfo(p, current = null) {
  const config = loadConfig(p.path);
  const all = loadTasks(p.path);
  const tasks = all.filter((t) => !t.archived);
  const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const counted = all.filter((t) => t.status !== 'verworfen');
  const sp = activeSprint(config);
  const act = loadActivity(p.path);
  const cur = act && act.current;
  // Zuletzt geändert: letzte Aktivität von Claude (mit Uhrzeit) oder das Datum der letzten Aufgabenänderung.
  const last = [...tasks.map((t) => String(t.updated || '')), cur && cur.at ? String(cur.at) : ''].sort().pop() || '';
  const queue = (config.queue || []).map((id) => tasks.find((t) => t.id === id)).filter((t) => t && OPEN_STATUSES.includes(t.status));
  const working = open.filter((t) => t.status === 'in-arbeit');
  const server = readServer(p.path);
  const prs = Object.values((syncState(p.path) || {}).prs || {}).filter((x) => x && x.ci).sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  let usage = null;
  try { const u = liveUsage(p.path, config); usage = { ...u.today, currency: u.currency }; } catch { /* keine Zeiterfassung */ }
  return {
    ...p, open: open.length, p1: open.filter((t) => t.priority === 'P1'), review: open.filter((t) => t.status === 'review').length,
    overdue: open.filter(isOverdue).length, working,
    sprint: sp ? { ...sp, stats: sprintStats(config, sp, tasks) } : null,
    progress: { done: counted.filter((t) => t.status === 'erledigt').length, total: counted.length },
    busy: act && act.busy && cur && Date.now() - Date.parse(cur.at) < 10 * 60000 ? cur : null,
    perm: cur && cur.perm && Date.now() - Date.parse(cur.permSince || cur.at) < 60 * 60000 ? cur : null,
    ci: prs[0] ? prs[0].ci : '', usage,
    server, outdated: !!(server && current && server.version !== current),
    last, next: queue[0] || working[0] || open.slice().sort((a, b) => prio(a).localeCompare(prio(b)))[0] || null,
  };
}

// Alle Projekte einlesen: laufende zuerst, dann nach P1 und letzter Änderung.
export function hubInfos() {
  let current = null;
  try { current = cliVersion(newestCli()); } catch { /* unbekannt */ }
  const infos = [];
  // Nur laufende Boards (W-0032): gestoppte verschwinden aus dem Hub, ihre Aufgaben werden gar nicht erst geladen.
  for (const p of projectList()) { if (!readServer(p.path)) continue; try { infos.push(projectInfo(p, current)); } catch { /* Projekt nicht lesbar */ } }
  return infos.filter((i) => i.server).sort((a, b) => (b.p1.length - a.p1.length) || String(b.last).localeCompare(String(a.last)));
}

// W-0049: Projekte mit .works ohne laufendes Board, zuletzt geöffnete zuerst. Nur aus der Anmeldung, ohne Aufgaben zu laden.
export function stoppedProjects() {
  return projectList().filter((p) => !readServer(p.path)).sort((a, b) => String(b.seen || '').localeCompare(String(a.seen || '')));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Alter eines Zeitpunkts als Art und Zahl, daraus "vor 5 min" (ago) oder "seit 5 min" (since) in der Sprache (W-0041).
const age = (iso) => {
  if (!iso) return { k: 'never' };
  const ms = Date.now() - Date.parse(iso);
  if (!/T/.test(iso) || Number.isNaN(ms)) { const d = Math.round((new Date(today() + 'T00:00:00') - new Date(String(iso).slice(0, 10) + 'T00:00:00')) / 86400000); return d <= 0 ? { k: 'today' } : d === 1 ? { k: 'yesterday' } : { k: 'days', n: d }; }
  const m = Math.round(ms / 60000);
  return m < 1 ? { k: 'now' } : m < 60 ? { k: 'min', n: m } : m < 1440 ? { k: 'h', n: Math.round(m / 60) } : { k: 'days', n: Math.round(m / 1440) };
};
const ago = (iso) => {
  const a = age(iso);
  return { never: () => tr('never'), today: () => tr('today'), yesterday: () => tr('yesterday'), now: () => tr('just now'), min: () => tr('{n} min ago', a), h: () => tr('{n} h ago', a), days: () => tr('{n} days ago', a) }[a.k]();
};
const since = (iso) => {
  const a = age(iso);
  return ({ min: () => tr('for {n} min', a), h: () => tr('for {n} h', a), days: () => tr('for {n} days', a) }[a.k] || (() => ''))();
};
const hhmm = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const pct = (done, total) => (total ? Math.round(done / total * 100) : 0);

function liveLine(i) {
  if (i.perm) {
    const s = since(i.perm.permSince || i.perm.at);
    const what = esc(i.perm.what || i.perm.verb);
    return `<div class="hub-live hub-warnbg"><span class="hub-dot hub-perm"></span><span>${s ? tr('Waiting for your approval {since}: {what}', { since: s, what }) : tr('Waiting for your approval: {what}', { what })}</span></div>`;
  }
  if (i.busy) {
    const v = { task: esc(i.busy.task), verb: esc(i.busy.verb), what: esc(i.busy.what) };
    return `<div class="hub-live"><span class="hub-dot hub-work"></span><span>${i.busy.task ? tr('Claude is working on {task}: {verb} {what}', v) : tr('Claude is working: {verb} {what}', v)}</span></div>`;
  }
  if (i.working.length) return `<div class="hub-live"><span class="hub-dot hub-work"></span><span>${tr('In progress: {list}', { list: esc(i.working.map((t) => `${t.id} ${t.title}`).join(', ')) })}</span></div>`;
  if (i.review) return `<div class="hub-live"><span class="hub-dot"></span><span>${i.review === 1 ? tr('1 task is waiting for your acceptance review') : tr('{n} tasks are waiting for your acceptance review', { n: i.review })}</span></div>`;
  return `<div class="hub-live"><span class="hub-dot"></span><span>${tr('Nothing in progress right now')}</span></div>`;
}

function boardCard(i, self) {
  const url = boardUrl(i.server);
  const st = i.sprint && i.sprint.stats;
  const [label, done, total, color] = st ? [tr('Sprint {id} until {end}', { id: i.sprint.id, end: i.sprint.end }), st.done, st.planned, ';--c:var(--accent)'] : [tr('Overall progress'), i.progress.done, i.progress.total, ''];
  const stat = (n, l, hot) => `<div class="hub-stat${hot && n ? ' hub-hot' : ''}"><b>${n}</b><span>${l}</span></div>`;
  const ci = { ok: `<span class="hub-chip hub-ok">${tr('CI green')}</span>`, fail: `<span class="hub-chip hub-red">${tr('CI red')}</span>`, pending: `<span class="hub-chip">${tr('CI running')}</span>` }[i.ci] || '';
  const isSelf = self && i.path === self;
  // Wartende Freigabe mit Kennung (Projekt und Zeitpunkt): Der Browser meldet jede genau einmal (W-0028).
  const perm = i.perm ? ` data-perm="${esc(`${rootIdOf(i.path)}:${i.perm.permSince || i.perm.at}`)}" data-perm-name="${esc(i.name)}" data-perm-what="${esc(i.perm.what || i.perm.verb)}" data-url="${esc(url)}?from=hub"` : '';
  return `<article class="hub-bc" data-board-url="${esc(url)}"${isSelf ? ' data-self' : ''}${perm}>
<header><span class="hub-dot hub-on"></span><h3>${esc(i.name)}</h3><span class="hub-m hub-path">${esc(i.path.replace(os.homedir(), '~'))}</span>
<span class="hub-chips">${isSelf ? `<span class="hub-chip">${tr('this board')}</span>` : ''}${ci}${i.outdated ? `<span class="hub-chip hub-old">${tr('Version outdated')}</span>` : `<span class="hub-chip">${tr('Version current')}</span>`}</span></header>
${liveLine(i)}
<div class="hub-stats">${stat(i.open, tr('open'))}${stat(i.working.length, tr('in progress'))}${stat(i.review, tr('Review'))}${stat(i.p1.length, 'P1', true)}${stat(i.overdue, tr('overdue'), true)}</div>
<div class="hub-cols">
<div class="hub-prog"><div class="hub-pl"><span>${esc(label)}</span><span>${tr('{done} of {total}', { done, total })}</span></div><div class="hub-track"><i style="width:${pct(done, total)}%${color}"></i></div></div>
<dl class="hub-kv"><dt>${tr('Next up')}</dt><dd>${i.next ? esc(`${i.next.id} ${i.next.title}`) : '–'}</dd><dt>${tr('Usage today')}</dt><dd>${i.usage && i.usage.tokens ? esc(`${fmtTokens(i.usage.tokens)} · ${fmtCost(i.usage.cost, i.usage.currency)}`) : '–'}</dd><dt>${tr('Running since')}</dt><dd>${hhmm(i.server.started)} · Port ${i.server.port}</dd></dl>
</div>
<div class="hub-acts"><a class="btn small primary" href="${esc(url)}?from=hub">${tr('Open board')}</a><a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">${tr('In a new tab')}</a><button class="btn small" type="button" data-op="restart" data-path="${esc(i.path)}" data-name="${esc(i.name)}">${tr('Restart')}</button>${isSelf ? '' : `<button class="btn small ghost danger" type="button" data-op="stop" data-path="${esc(i.path)}" data-name="${esc(i.name)}">${tr('Stop')}</button>`}<span class="hub-m">${tr('changed {ago}', { ago: ago(i.last) })}</span></div>
</article>`;
}

const BELL_ICON = '<svg class="hub-bell-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
const THEME_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" style="width:15px;height:15px"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>';

// Inhalt der Seite (Kopf und Liste). Wird alle 5 s neu geholt.
export function hubBody(infos, { self = '', stopped = [] } = {}) {
  const on = infos.filter((i) => i.server);
  const sum = (f) => infos.reduce((a, i) => a + f(i), 0);
  const cost = sum((i) => (i.usage ? i.usage.cost : 0));
  const tokens = sum((i) => (i.usage ? i.usage.tokens : 0));
  const cur = (infos.find((i) => i.usage) || { usage: { currency: 'USD' } }).usage.currency;
  const perms = sum((i) => (i.perm ? 1 : 0));
  const kpi = (n, l, cls = '') => `<div class="hub-kpi${cls}"><b>${esc(n)}</b><span>${esc(l)}</span></div>`;
  return `<header class="hub-hd"><div class="hub-wrap">
<div class="hub-hdtop"><h1 class="hub-mark"><i>w</i>works <small>HUB</small></h1><span class="hub-m">${on.length === 1 ? tr('1 board running') : tr('{n} boards running', { n: on.length })} · ${tr('updated {time}', { time: hhmm(new Date().toISOString()) })}</span>
<span class="hub-right"><button class="btn small hub-bell" type="button" data-notify aria-pressed="false" hidden>${BELL_ICON}<span>${tr('Notifications off')}</span></button><button class="btn small icon" type="button" data-theme-toggle aria-label="${tr('Switch color scheme')}" title="${tr('Switch color scheme')}">${THEME_ICON}</button></span></div>
<div class="hub-ask" id="hubAsk" role="region" aria-label="${tr('Turn on notifications')}" hidden>${BELL_ICON}<p>${tr('Notify you when Claude is waiting for your approval in a project?')}<small>${tr('The browser then asks once for permission. The notification only comes when this tab is in the background.')}</small></p><span class="hub-ask-acts"><button class="btn small primary" type="button" data-notify-on>${tr('Turn on')}</button><button class="btn small ghost" type="button" data-notify-later>${tr('Not now')}</button></span></div>
<div class="hub-kpis">${kpi(sum((i) => i.open), tr('open tasks'))}${kpi(sum((i) => i.p1.length), tr('P1 critical'))}${kpi(perms, tr('waiting for approval'), perms ? ' hub-warnk' : '')}${kpi(sum((i) => i.review), tr('in review'))}${kpi(fmtCost(cost, cur), tr('Usage today · {tokens} tokens', { tokens: fmtTokens(tokens) }))}</div>
</div></header>
<main class="hub-wrap">
<div class="hub-sec"><h2>${tr('Running boards')}</h2><span class="hub-m">${on.length}</span></div>
${on.length ? `<div class="hub-cards">${on.map((i) => boardCard(i, self)).join('')}</div>` : `<p class="hub-m">${tr('No board is running right now.')}</p>`}
${stopped.length ? `<div class="hub-sec"><h2>${tr('Stopped projects')}</h2><span class="hub-m">${stopped.length}</span></div>
<ul class="hub-off">${stopped.map((p) => `<li><span class="hub-dot"></span><b>${esc(p.name)}</b><span class="hub-m hub-path">${esc(p.path.replace(os.homedir(), '~'))}</span><span class="hub-m">${p.seen ? tr('last opened {ago}', { ago: ago(p.seen) }) : ''}</span><button class="btn small" type="button" data-op="open" data-name="${esc(p.name)}" data-path="${esc(p.path)}">${tr('Open board')}</button></li>`).join('')}</ul>` : ''}
<div style="height:28px"></div>
</main>`;
}


// Holt den Inhalt alle 5 s neu, schaltet das Farbschema wie im Board und schickt die Knöpfe an die API.
// events: Die Seite hält /events offen, damit works board --open sie als offenen works-Tab zählt.
const HUB_JS = `(() => {
  const H = window.HUB;
  // Texte über den kleinen Katalog in window.HUB.t (W-0041), Platzhalter wie im Board.
  const tr = (s, v) => { const x = (H.t && H.t[s]) || s; return v ? x.replace(/\\{(\\w+)\\}/g, (a, k) => (k in v ? String(v[k]) : a)) : x; };
  const get = (k, f) => { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch (e) { return f; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privat */ } };
  const theme = () => { const t = get('works-theme', 'auto'); if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); };
  theme();
  const root = document.getElementById('hub');
  let last = root.innerHTML;
  const focusKey = (el) => (el && el !== document.body && root.contains(el) ? [el.tagName, el.getAttribute('href'), el.dataset.op, el.dataset.path, el.textContent].join('|') : '');
  // Browser-Hinweis bei wartender Freigabe (W-0028). Die Wahl steht im Browser: on, off oder later (Nicht jetzt).
  const canNotify = 'Notification' in window;
  const choice = () => get('works-hub-notify', '');
  const notifyOn = () => canNotify && Notification.permission === 'granted' && choice() === 'on';
  function notifyUi() {
    const ask = document.getElementById('hubAsk');
    const bell = root.querySelector('[data-notify]');
    if (!ask || !bell) return;
    const denied = canNotify && Notification.permission === 'denied';
    ask.hidden = !canNotify || denied || choice() !== '';
    bell.hidden = !canNotify || !ask.hidden;
    bell.setAttribute('aria-pressed', String(notifyOn()));
    bell.title = denied ? tr('Blocked in the browser. Allow it in the site settings.') : tr('Notification when Claude is waiting for an approval');
    bell.querySelector('span').textContent = notifyOn() ? tr('Notifications on') : denied ? tr('Notifications blocked') : tr('Notifications off');
  }
  // Was beim Laden schon wartet, sieht man; gemeldet werden nur neue Freigaben, und nur im Hintergrund.
  const seen = new Set();
  function newPerms(initial) {
    for (const c of root.querySelectorAll('[data-perm]')) {
      const k = c.dataset.perm;
      if (seen.has(k)) continue;
      seen.add(k);
      if (initial || !notifyOn() || !document.hidden) continue;
      const n = new Notification(tr('{name} is waiting for your approval', { name: c.dataset.permName }), { body: c.dataset.permWhat, tag: k });
      const url = c.dataset.url;
      n.onclick = () => { window.focus(); location.href = url; n.close(); };
    }
  }
  async function askPermission() {
    const r = await Notification.requestPermission();
    put('works-hub-notify', r === 'granted' ? 'on' : 'off');
    notifyUi();
  }
  notifyUi();
  newPerms(true);
  // W-0032: Läuft nur noch ein Board, schließt sich der Hub und der Tab zeigt dieses Board. Nur beim Übergang von zwei
  // oder mehr auf eins (W-0049): Wer den Hub mit einem Board aufruft, will die gestoppten Projekte sehen. Ist der Server
  // dieser Seite selbst weg (drei Abfragen ohne Antwort, etwa 15 s, damit ein kurzer Neustart nicht wegspringt), zum
  // einzigen anderen bekannten Board. Gehen wieder zwei auf, schaltet die Board-Seite zurück zum Hub.
  let failures = 0;
  let running = null;
  function followSingle() {
    const cards = root.querySelectorAll('[data-board-url]');
    if (running !== null && running >= 2 && cards.length === 1) { location.href = cards[0].dataset.boardUrl; return; }
    running = cards.length;
  }
  function serverGone() {
    if (++failures < 3) return;
    const others = root.querySelectorAll('[data-board-url]:not([data-self])');
    if (others.length === 1) location.href = others[0].dataset.boardUrl;
  }
  followSingle();
  async function refresh() {
    try {
      const r = await fetch(H.part, { cache: 'no-store' }); if (!r.ok) return;
      failures = 0;
      const t = await r.text(); if (t === last) return;
      // Fokus behalten, damit die Bedienung per Tastatur nicht bei jeder Aktualisierung von vorn beginnt.
      const k = focusKey(document.activeElement);
      last = t; root.innerHTML = t;
      notifyUi();
      newPerms(false);
      followSingle();
      if (k) { const el = [...root.querySelectorAll('a, button')].find((x) => focusKey(x) === k); if (el) el.focus(); }
    } catch (e) { serverGone(); }
  }
  setInterval(refresh, 5000);
  if (H.events) new EventSource('/events');
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-theme-toggle]')) { const o = ['auto', 'light', 'dark']; put('works-theme', o[(o.indexOf(get('works-theme', 'auto')) + 1) % 3]); theme(); return; }
    if (e.target.closest('[data-notify-on]')) { await askPermission(); return; }
    if (e.target.closest('[data-notify-later]')) { put('works-hub-notify', 'later'); notifyUi(); return; }
    if (e.target.closest('[data-notify]')) {
      if (notifyOn()) put('works-hub-notify', 'off');
      else if (Notification.permission === 'granted') put('works-hub-notify', 'on');
      else if (Notification.permission === 'default') { await askPermission(); return; }
      notifyUi();
      return;
    }
    const b = e.target.closest('[data-op]');
    if (!b) return;
    let dir = b.dataset.path;
    if (b.dataset.op === 'stop' && !confirm(tr('Stop the board of {name}?', { name: b.dataset.name }))) return;
    b.disabled = true;
    // W-0049: Öffnen startet ein gestopptes Board (freier Port, der zuletzt genutzte zuerst) und zeigt es im selben Tab.
    const label = b.textContent;
    if (b.dataset.op === 'open') b.textContent = tr('Starting …');
    try {
      const r = await fetch('/api/hub', { method: 'POST', headers: { 'X-Works-Token': H.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ op: b.dataset.op, path: dir }) });
      if (r.status === 403) { location.reload(); return; }
      const res = await r.json().catch(() => ({}));
      if (!r.ok) alert(res.error || tr('That did not work.'));
      else if (b.dataset.op === 'open' && res.url) { location.href = res.url + '?from=hub'; return; }
    } catch (err) { alert(tr('No connection to the board.')); }
    b.textContent = label;
    b.disabled = false;
    setTimeout(refresh, 1500); setTimeout(refresh, 4000);
  });
})();`;

// Texte des Skripts im Browser: die tr-Aufrufe in HUB_JS, übersetzt beim Aufbau der Seite.
const HUB_KEYS = [...HUB_JS.matchAll(/\btr\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);

// Ganze Seite mit dem CSS des Boards. part: nur den Inhalt für die Aktualisierung.
// root: Projekt des Boards, dessen Sprache gilt (W-0041); ohne root wie das CLI im aktuellen Ordner.
export function hubHtml({ token, self = '', part = false, partUrl = '/?part=1', events = false, root } = {}) {
  const lang = language(root);
  setLanguage(lang);
  const body = hubBody(hubInfos(), { self, stopped: stoppedProjects() });
  if (part) return body;
  const boot = JSON.stringify({ token, part: partUrl, events, t: Object.fromEntries(HUB_KEYS.map((k) => [k, tr(k)]).filter(([k, v]) => k !== v)) }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>works Hub</title><style>${boardCss()}${HUB_CSS}</style></head>
<body><div class="hub-page" id="hub">${body}</div><script>window.HUB = ${boot};${HUB_JS}</script></body></html>`;
}

// Knöpfe im Hub: Board starten, öffnen, stoppen, neu starten. Nur für angemeldete Projekte.
// Läuft über das CLI im Projektordner, wie works board von Hand; --no-hub, weil hier ausdrücklich gestartet wird
// (W-0049). open wartet, bis das Board läuft, und gibt seine Adresse zurück. Gibt { status, error?, url? } zurück.
export async function hubAction(op, dir) {
  if (!['start', 'open', 'stop', 'restart'].includes(op)) return { status: 400, error: tr('Unknown action.') };
  const real = (x) => { try { return fs.realpathSync(String(x || '')); } catch { return null; } };
  const target = real(dir);
  const p = target && projectList().find((x) => real(x.path) === target);
  if (!p) return { status: 400, error: tr('Unknown project.') };
  if (op === 'open' && readServer(p.path)) return { status: 200, url: boardUrl(readServer(p.path)) };
  const args = { start: ['board', '--serve', '--detach', '--no-hub'], open: ['board', '--serve', '--detach', '--no-hub'], stop: ['board', '--stop'], restart: ['board', '--restart'] }[op];
  spawn(process.execPath, [newestCli(), ...args], { cwd: p.path, detached: true, windowsHide: true, stdio: 'ignore', env: { ...process.env, WORKS_ACTOR: '' } }).unref();
  if (op !== 'open') return { status: 200 };
  for (const until = Date.now() + 12000; Date.now() < until;) {
    await new Promise((r) => setTimeout(r, 200));
    const s = readServer(p.path);
    if (s) return { status: 200, url: boardUrl(s) };
  }
  return { status: 504, error: tr('The board of {name} did not start. Details in .works/server.log in the project.', { name: p.name }) };
}

export function serveHub({ port = 4740 } = {}) {
  const token = crypto.randomBytes(16).toString('hex');
  const head = { 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  const server = http.createServer((req, res) => {
    setLanguage(language());
    const host = String(req.headers.host || '').replace(/:\d+$/, '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) { res.writeHead(421); return res.end(); }
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/api/hub') {
      const origin = req.headers.origin;
      if (req.headers['x-works-token'] !== token || (origin && origin !== `http://${req.headers.host}`)) { res.writeHead(403, { ...head, 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: tr('Access denied.') })); }
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 4000) req.destroy(); });
      req.on('end', async () => {
        let q = {};
        try { q = JSON.parse(body); } catch { /* leer */ }
        const r = await hubAction(q.op, q.path);
        res.writeHead(r.status, { ...head, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r.error ? { error: r.error } : { ok: true, ...(r.url ? { url: r.url } : {}) }));
      });
      return;
    }
    if (req.method !== 'GET' || url.pathname !== '/') { res.writeHead(404, { ...head, 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(tr('Not found')); }
    res.writeHead(200, { ...head, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(hubHtml({ token, part: url.searchParams.has('part') }));
  });
  server.listen(port, '127.0.0.1', () => process.stdout.write(`${tr('Project overview running: {url}', { url: `http://127.0.0.1:${port}/` })}\n${tr('Stop with Ctrl+C.')}\n`));
  server.on('error', (e) => { process.stderr.write(tr('Error: {msg}', { msg: e.message }) + '\n'); process.exit(1); });
  return server;
}
