'use strict';
(() => {
  const BOOT = window.WORKS;
  const I18N = BOOT.i18n || { lang: 'en', catalog: {} };
  const tr = (s, v) => { const x = (I18N.catalog && I18N.catalog[s]) || s; return v ? x.replace(/\{(\w+)\}/g, (a, k) => (k in v ? String(v[k]) : a)) : x; };
  const LIVE = !!BOOT.live;
  // edit: Live mit Bearbeiten, view: Live nur lesen (geteilter Link), static: board.html, snapshot: Export
  const MODE = BOOT.mode || (LIVE ? 'edit' : 'static');
  const EDIT = MODE === 'edit';
  const DETAILS = BOOT.details || null;
  const TOKEN = BOOT.token || '';
  let data = BOOT.data;
  let meta = data.meta;
  let tasks = data.tasks;
  let metaInfo = null;

  const COLS = ['backlog', 'geplant', 'in-arbeit', 'review', 'erledigt', 'verworfen'];
  const OPEN = ['backlog', 'geplant', 'in-arbeit', 'review'];
  const PRIOS = ['P1', 'P2', 'P3', 'P4'];
  const HIGHLIGHT_MS = 10000;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const VIEWS = ['board', 'sprint', 'queue', 'timeline', 'graph', 'table', 'live'];
  const VIEW_LABEL = { board: 'Board', sprint: 'Sprint', queue: tr('Queue'), timeline: tr('Timeline'), graph: tr('Dependencies'), table: tr('Table'), live: 'Live' };
  const state = { q: '', prios: new Set(PRIOS), type: '', tag: '', ms: '', closed: false, signal: '', view: 'board' };
  const PAGE_VERSION = meta.version || '';
  const PAGE_SERVER = meta.server || '';
  // Kennung des eigenen Projekts (W-0029). Läuft auf dem Port später ein anderes Projekt, ist dieser Tab verwaist.
  const ROOT_ID = meta.rootId || '';
  const isForeign = (m) => !!(m && m.rootId && ROOT_ID && m.rootId !== ROOT_ID);
  let orphan = false;
  let liveSource = null;
  // Neue Version oder andere Sprache (works lang): Seite neu laden, damit Texte und Skript passen.
  const outdated = (m) => !!m && ((m.version && PAGE_VERSION && m.version !== PAGE_VERSION) || (m.server && PAGE_SERVER && m.server !== PAGE_SERVER) || (BOOT.i18n && m.lang && m.lang !== I18N.lang));
  const UI_KEY = 'works-ui-' + meta.project;
  const changes = new Map();
  let openId = null;
  let detail = null;
  let side = null;
  let quickCol = null;
  let ideasCache = [];

  // ---------- Hilfen ----------

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const L = (s) => meta.statusLabel[s] || s;
  const statusVar = (s) => 'var(--s-' + (COLS.includes(s) ? s : 'backlog') + ')';
  const prioVar = (p) => 'var(--' + (PRIOS.includes(p) ? p.toLowerCase() : 'p4') + ')';
  const today = () => new Date().toLocaleDateString('sv-SE');
  const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = String(d).split('-'); const s = I18N.lang === 'de' ? '.' : '/'; return dd + s + m + s + y; };
  const daysUntil = (d) => Math.round((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  const store = {
    get(k, f) { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch (e) { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privat */ } },
  };

  async function api(method, path, body, raw) {
    const opt = { method, headers: { 'X-Works-Token': TOKEN } };
    if (raw) { opt.body = raw.body; opt.headers['Content-Type'] = raw.type; }
    else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
    const res = await fetch(path, opt);
    let out = {};
    try { out = await res.json(); } catch (e) { out = {}; }
    if (!res.ok) throw new Error(out.error || tr('Request failed ({status}).', { status: res.status }));
    return out;
  }
  const act = (action, payload) => api('POST', 'api/action', { action, ...payload });

  function toast(html, kind, onClick, color) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'err' ? ' err' : '');
    if (color) el.style.setProperty('--cc', color);
    el.innerHTML = html;
    el.onclick = () => { el.remove(); if (onClick) onClick(); };
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, kind === 'err' ? 9000 : 6000);
  }
  const ok = (msg) => toast('<div class="what">' + esc(msg) + '</div>');
  const fail = (e) => toast('<div class="what">' + tr('Not saved') + '</div><div class="why">' + esc(e.message || e) + '</div>', 'err');

  async function run(fn, success) {
    try {
      const r = await fn();
      if (success) {
        const msg = typeof success === 'function' ? success(r) : success;
        if (r && r.undo) undoToast(msg, r.undo); else ok(msg);
      }
      return r;
    } catch (e) { fail(e); return null; } finally {
      setTimeout(runWhenSaved, 600);
    }
  }

  // ---------- Markdown (klein und sicher) ----------

  function inline(s) {
    let t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    t = t.replace(/!?\[([^\]]*)\]\(([^)\s]+)\)/g, (m, txt, url) => {
      const u = url.replace(/&amp;/g, '&');
      if (!/^(https?:\/\/|\.{0,2}\/|[\w-]+[\w./-]*$)/.test(u) || /^javascript:/i.test(u)) return txt;
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + txt + '</a>';
    });
    t = t.replace(/\b([A-Z]{1,8}-\d{2,6})\b/g, (m) => (tasks.some((x) => x.id === m) ? '<a href="#" data-goto="' + m + '">' + m + '</a>' : m));
    return t;
  }
  function md(src) {
    const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) {
        const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++; out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>'); continue;
      }
      if (/^\s*\|/.test(l)) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        const cells = rows.filter((r) => !/^\s*\|[\s|:-]+\|\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        if (cells.length) out.push('<table><thead><tr>' + cells[0].map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' + cells.slice(1).map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
        continue;
      }
      const h = l.match(/^(#{2,6})\s+(.*)$/);
      if (h) { out.push('<h' + Math.min(5, h[1].length + 1) + '>' + inline(h[2]) + '</h' + Math.min(5, h[1].length + 1) + '>'); i++; continue; }
      if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
        const ordered = /^\s*\d+\./.test(l);
        const items = [];
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        out.push('<' + (ordered ? 'ol' : 'ul') + '>' + items.map((x) => '<li>' + inline(x.replace(/^\[( |x|X)\]\s*/, (m, c) => (c === ' ' ? '☐ ' : '☑ '))) + '</li>').join('') + '</' + (ordered ? 'ol' : 'ul') + '>');
        continue;
      }
      if (/^>\s?/.test(l)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        out.push('<p>' + buf.map(inline).join('<br>') + '</p>'); continue;
      }
      if (!l.trim()) { i++; continue; }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(```|#{2,6}\s|\s*([-*]|\d+\.)\s|\s*\||>)/.test(lines[i])) buf.push(lines[i++]);
      if (!buf.length) { buf.push(lines[i++]); }
      out.push('<p>' + buf.map(inline).join('<br>') + '</p>');
    }
    return out.join('') || '<p class="empty-md">' + tr('Nothing here yet.') + '</p>';
  }

  // ---------- Filter ----------

  function match(t) {
    if (!state.prios.has(t.priority)) return false;
    if (state.type && t.type !== state.type) return false;
    if (state.tag && !t.tags.includes(state.tag)) return false;
    if (state.ms && t.milestone !== state.ms) return false;
    if (!state.closed && (t.archived || t.status === 'verworfen')) return false;
    if (state.signal === 'blocked' && !t.blocked) return false;
    if (state.signal === 'unblocked' && t.blocked) return false;
    if (state.signal === 'overdue' && !t.overdue) return false;
    if (state.signal === 'questions' && !t.questions.length) return false;
    if (state.signal === 'incomplete' && !t.incomplete) return false;
    if (state.signal === 'stale' && !t.stale) return false;
    if (state.signal === 'conflict' && !t.conflicts) return false;
    if (state.q) {
      const hay = (t.id + ' ' + t.title + ' ' + t.tags.join(' ') + ' ' + t.milestone + ' ' + (meta.typeLabel[t.type] || '')).toLowerCase();
      if (!state.q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }
  const filtersActive = () => state.q || state.type || state.tag || state.ms || state.signal || state.prios.size !== 4;

  function resetFilters() {
    state.q = ''; state.type = ''; state.tag = ''; state.ms = ''; state.signal = ''; state.prios = new Set(PRIOS);
    $('#q').value = ''; $('#typeFilter').value = ''; $('#tagFilter').value = '';
    renderAll();
  }

  // ---------- Kopf, Überblick, Filter ----------

  function renderHeader() {
    $('#project').innerHTML = esc(meta.project) + ' <span class="dim">' + tr('Tasks') + '</span>';
    const pill = $('#busy');
    const a = meta.activity;
    const fresh = a && a.busy && lvFresh(a.current);
    const laneIds = (meta.lanes || []).map((l) => l.task).filter((id) => a && a.lanes && lvFresh(a.lanes[id]));
    pill.hidden = !fresh && !laneIds.length;
    const perm = lvPermEntry();
    pill.classList.toggle('perm', !!perm);
    const pulse = $('#livePulse');
    if (pulse) { pulse.hidden = pill.hidden; pulse.classList.toggle('perm', !!perm); }
    if (fresh || laneIds.length) {
      const main = fresh ? (a.current.perm ? tr('Waiting for your approval') + (a.current.task ? ' (' + esc(a.current.task) + ')' : '') : a.current.task ? tr('Claude has been working on {task} for {since}', { task: esc(a.current.task), since: lvSince(a.since || a.current.at, 'min') }) : tr('Claude has been working for {since}', { since: lvSince(a.since || a.current.at, 'min') })) : '';
      const par = laneIds.length ? (laneIds.length === 1 ? tr('1 agent in parallel on {task}', { task: esc(laneIds[0]) }) : tr('{n} agents in parallel', { n: laneIds.length })) : '';
      pill.innerHTML = [main, par].filter(Boolean).join(', ');
      const go = fresh && a.current.task ? a.current.task : laneIds[0];
      // Im Live-Board führt die Pille in die Live-Ansicht und lässt sie wieder Claude folgen.
      pill.onclick = () => { if (LIVE) { liveFollowClaude(); setView('live'); } else if (go) focusCard(go); };
    }
    const tc = $('#toolsCount');
    const n = (meta.knowledgeProposals || 0);
    tc.hidden = !n; tc.textContent = n;
    document.title = (hiddenCount && notifySet.title ? '(' + hiddenCount + ') ' : '') + baseTitle();
  }

  function renderOverview() {
    const visible = tasks.filter((t) => !t.archived || state.closed);
    const cols = state.closed ? COLS : COLS.filter((c) => c !== 'verworfen');
    $('#flow').innerHTML = cols.map((c) => {
      const n = visible.filter((t) => t.status === c).length;
      return '<button class="seg' + (n ? '' : ' zero') + '" role="listitem" data-col="' + c + '" style="--c:' + statusVar(c) + ';--w:' + Math.max(n, 0.0001) + '" title="' + esc(L(c)) + ': ' + n + '"><span class="n">' + n + '</span><span class="l">' + esc(L(c)) + '</span></button>';
    }).join('');
    $$('#flow .seg').forEach((b) => b.onclick = () => {
      const col = $('.col[data-col="' + b.dataset.col + '"]');
      if (col) col.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
    });
    const open = tasks.filter((t) => OPEN.includes(t.status));
    const sig = [
      ['p1', tr('open with P1'), open.filter((t) => t.priority === 'P1').length, true],
      ['blocked', tr('blocked'), open.filter((t) => t.blocked).length, true],
      ['overdue', tr('overdue'), open.filter((t) => t.overdue).length, true],
      ['questions', tr('with open questions'), open.filter((t) => t.questions.length).length, false],
      ['incomplete', tr('captured incompletely'), open.filter((t) => t.incomplete).length, false],
      ['conflict', tr('sharing files'), tasks.filter((t) => t.conflicts).length, 'warn'],
      ['stale', meta.staleDays === 1 ? tr('quiet for 1 day') : tr('quiet for {n} days', { n: meta.staleDays }), tasks.filter((t) => t.stale).length, false],
    ];
    $('#signals').innerHTML = sig.filter((s) => s[2] > 0).map((s) => '<button class="signal' + (s[3] === true ? ' hot' : s[3] ? ' ' + s[3] : '') + '" data-sig="' + s[0] + '" aria-pressed="' + (state.signal === s[0] || (s[0] === 'p1' && state.prios.size === 1 && state.prios.has('P1'))) + '"><b>' + s[2] + '</b> ' + esc(s[1]) + '</button>').join('')
      || '<span class="signal calm">' + tr('No blockers, nothing overdue') + '</span>';
    $$('#signals .signal[data-sig]').forEach((b) => b.onclick = () => {
      const s = b.dataset.sig;
      if (s === 'p1') {
        const only = state.prios.size === 1 && state.prios.has('P1');
        state.prios = only ? new Set(PRIOS) : new Set(['P1']);
      } else state.signal = state.signal === s ? '' : s;
      renderAll();
    });
  }

  function renderFilters() {
    $('#prioFilter').innerHTML = PRIOS.map((p) => '<button aria-pressed="' + state.prios.has(p) + '" data-p="' + p + '" title="' + esc(tr('Show or hide {prio}', { prio: meta.prioLabel[p] })) + '"><span class="pdot" style="--pc:' + prioVar(p) + '"></span>' + p + '<span class="pl"> ' + esc(meta.prioLabel[p]) + '</span></button>').join('');
    $$('#prioFilter button').forEach((b) => b.onclick = () => {
      const p = b.dataset.p;
      if (state.prios.has(p)) { if (state.prios.size > 1) state.prios.delete(p); } else state.prios.add(p);
      renderAll();
    });
    const ty = $('#typeFilter');
    if (ty.options.length === 1) Object.entries(meta.typeLabel).forEach(([k, v]) => ty.add(new Option(v, k)));
    ty.value = state.type;
    const tags = [...new Set(tasks.flatMap((t) => t.tags))].sort();
    const tg = $('#tagFilter');
    tg.innerHTML = '<option value="">' + tr('All tags') + '</option>' + tags.map((t) => '<option value="' + esc(t) + '">#' + esc(t) + '</option>').join('');
    tg.value = tags.includes(state.tag) ? state.tag : '';
    $('#showClosed').checked = state.closed;
    $('#resetFilters').hidden = !filtersActive();
  }

  // ---------- Fortschritt ----------

  // Zählt alle Aufgaben, die den Filtern entsprechen, unabhängig vom Status. Erledigte im Archiv zählen mit,
  // verworfene nicht. So zeigt die Anzeige bei gewähltem Meilenstein genau dessen Fortschritt.
  function scopeTasks() {
    const saved = state.closed;
    state.closed = true;
    const list = tasks.filter((t) => match(t) && t.status !== 'verworfen');
    state.closed = saved;
    return list;
  }

  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };

  function burnup(list, weeks = 8) {
    const end = today();
    const points = [];
    for (let i = weeks; i >= 0; i--) {
      const d = addDays(end, -7 * i);
      points.push({
        d,
        total: list.filter((t) => t.created && t.created <= d).length,
        done: list.filter((t) => t.status === 'erledigt' && (t.completed || t.updated) <= d).length,
      });
    }
    return points;
  }

  function chartSvg(points) {
    const W = 320; const H = 96; const P = 4;
    const max = Math.max(1, ...points.map((p) => p.total));
    const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1);
    const y = (v) => H - P - (v * (H - 2 * P)) / max;
    const line = (key) => points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[key]).toFixed(1)).join(' ');
    const area = line('done') + ' L' + x(points.length - 1).toFixed(1) + ' ' + (H - P) + ' L' + x(0).toFixed(1) + ' ' + (H - P) + ' Z';
    const dots = points.map((p, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.done).toFixed(1) + '" r="2.5" class="c-dot"><title>' + esc(tr('{date}: {done} of {total} done', { date: fmtDate(p.d), done: p.done, total: p.total })) + '</title></circle>').join('');
    const grid = [0.5, 1].map((f) => '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + y(max * f).toFixed(1) + '" y2="' + y(max * f).toFixed(1) + '" class="c-grid"/>').join('');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + tr('Last 8 weeks: {done} of {total} done', { done: points[points.length - 1].done, total: points[points.length - 1].total }) + '">' +
      grid + '<path d="' + area + '" class="c-area"/><path d="' + line('total') + '" class="c-total"/><path d="' + line('done') + '" class="c-done"/>' + dots + '</svg>';
  }

  function renderProgress() {
    const box = $('#progress');
    const list = scopeTasks();
    if (!list.length) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    const n = (s) => list.filter((t) => t.status === s).length;
    const total = list.length;
    const done = n('erledigt');
    const pct = Math.round((done / total) * 100);
    const working = n('review') + n('in-arbeit');
    const waiting = total - done - working;
    const crit = list.reduce((a, t) => [a[0] + t.crit[0], a[1] + t.crit[1]], [0, 0]);
    const weekAgo = addDays(today(), -7);
    const doneWeek = list.filter((t) => t.status === 'erledigt' && (t.completed || '') > weekAgo).length;
    const newWeek = list.filter((t) => (t.created || '') > weekAgo).length;
    const fourWeeks = addDays(today(), -28);
    const rate = list.filter((t) => t.status === 'erledigt' && (t.completed || '') > fourWeeks).length / 4;
    const open = total - done;
    const weeks = rate > 0 ? Math.max(1, Math.ceil(open / rate)) : 0;
    const eta = !open ? tr('All done') : rate > 0 ? (weeks === 1 ? tr('At this pace about 1 more week') : tr('At this pace about {n} more weeks', { n: weeks })) : tr('Pace not measurable yet');
    const ms = state.ms ? meta.milestones.find((m) => m.id === state.ms) : null;
    const scope = ms ? tr('Milestone {id} {title}', { id: ms.id, title: ms.title }) : filtersActive() ? tr('Filtered tasks') : tr('Whole project');
    const late = ms && ms.due && ms.due < today() && open > 0;
    const points = burnup(list);
    box.innerHTML =
      '<div class="pg-main">' +
        '<div class="pg-head"><span class="pg-pct num">' + pct + '<small>%</small></span><span class="pg-title"><strong>' + tr('Progress') + '</strong><span>' + esc(scope) + (ms && ms.due ? esc(tr(', target {date}', { date: fmtDate(ms.due) })) : '') + '</span></span></div>' +
        '<div class="pg-bar" role="img" aria-label="' + tr('{done} of {total} tasks done, {working} in progress or review', { done, total, working }) + '">' +
          (done ? '<span class="pg-done" style="flex-grow:' + done + '" title="' + tr('Done: {n}', { n: done }) + '"></span>' : '') +
          (working ? '<span class="pg-work" style="flex-grow:' + working + '" title="' + tr('In progress or review: {n}', { n: working }) + '"></span>' : '') +
          (waiting ? '<span class="pg-wait" style="flex-grow:' + waiting + '" title="' + tr('Still open: {n}', { n: waiting }) + '"></span>' : '') +
        '</div>' +
        '<div class="pg-legend"><span class="pg-k"><i class="pg-done"></i>' + tr('Done') + ' <b class="num">' + done + '</b></span><span class="pg-k"><i class="pg-work"></i>' + tr('In progress and review') + ' <b class="num">' + working + '</b></span><span class="pg-k"><i class="pg-wait"></i>' + tr('Still open') + ' <b class="num">' + waiting + '</b></span></div>' +
      '</div>' +
      '<dl class="pg-stats">' +
        '<div><dt>' + tr('Done') + '</dt><dd class="num">' + tr('{a} of {b}', { a: done, b: total }) + '</dd></div>' +
        '<div><dt>' + tr('Criteria met') + '</dt><dd class="num">' + (crit[1] ? tr('{a} of {b}', { a: crit[0], b: crit[1] }) : tr('none')) + '</dd></div>' +
        '<div><dt>' + tr('Last 7 days') + '</dt><dd class="num">' + tr('{done} done, {new} new', { done: doneWeek, new: newWeek }) + '</dd></div>' +
        '<div><dt>' + tr('Forecast') + '</dt><dd class="' + (late ? 'late' : '') + '">' + esc(late ? tr('Target date passed, {eta}', { eta }) : eta) + '</dd></div>' +
      '</dl>' +
      '<figure class="pg-chart"><figcaption><span>' + tr('Last 8 weeks') + '</span><span class="lg"><i class="lg-done"></i>' + tr('done') + ' <i class="lg-total"></i>' + tr('created') + '</span></figcaption>' + chartSvg(points) +
        '<div class="c-axis"><span>' + esc(fmtDate(points[0].d)) + '</span><span>' + tr('today') + '</span></div></figure>';
  }

  function renderMsFilter() {
    const sel2 = $('#msFilter');
    const opts = '<option value="">' + tr('All milestones') + '</option>' + meta.milestones.map((m) => '<option value="' + esc(m.id) + '">' + esc(m.id + ' ' + m.title) + ' (' + m.done + '/' + m.total + ')</option>').join('') + (EDIT ? '<option value="__new">' + tr('Create milestone …') + '</option>' : '');
    sel2.innerHTML = opts;
    sel2.value = meta.milestones.some((m) => m.id === state.ms) ? state.ms : '';
    sel2.hidden = !meta.milestones.length && !EDIT;
    $('#msEdit').hidden = !EDIT || !state.ms;
  }

  // ---------- Spalten und Karten ----------

  function changeOf(id) {
    const c = changes.get(id);
    return c && Date.now() - c.at < HIGHLIGHT_MS ? c : null;
  }
  function changeLabel(c) {
    if (c.kind === 'moved') return L(c.from) + ' → ' + L(c.to);
    if (c.kind === 'prio') return tr('Priority {from} → {to}', { from: c.from, to: c.to });
    if (c.kind === 'added') return tr('New');
    if (c.kind === 'archived') return tr('Archived');
    if (c.kind === 'removed') return tr('Removed');
    return tr('Updated');
  }
  // Symbole für Etiketten an Karten (Stillstand, gleiche Dateien).
  const cfSvg = (p) => '<svg viewBox="0 0 16 16" aria-hidden="true">' + p + '</svg>';
  const CF_IC = { still: cfSvg('<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>'), conflict: cfSvg('<path d="M8 2.5l6 10.5H2z"/><path d="M8 7v2.5M8 11.4v.1"/>') };
  const cfConflict = (t) => {
    const c = t.conflicts[0];
    return '<span class="cflag conflict" title="' + esc(t.conflicts.map((x) => x.id + ': ' + x.files.join(', ')).join('\n')) + '">' + CF_IC.conflict + tr('Same files as {id}', { id: esc(c.id) }) + (t.conflicts.length > 1 ? tr(' and {n} more', { n: t.conflicts.length - 1 }) : '') + '</span>';
  };

  function changeColor(c) {
    if (c.kind === 'moved' || c.kind === 'added') return statusVar(c.to);
    if (c.kind === 'prio') return prioVar(c.to);
    if (c.kind === 'removed') return 'var(--danger)';
    return 'var(--accent)';
  }

  function card(t) {
    const ch = changeOf(t.id);
    const meta2 = [];
    if (t.crit[1]) {
      const pct = Math.round((t.crit[0] / t.crit[1]) * 100);
      meta2.push('<span class="prog" title="' + tr('Acceptance criteria') + '"><span class="bar"><span style="width:' + pct + '%"></span></span>' + t.crit[0] + '/' + t.crit[1] + '</span>');
    }
    if (t.blocked) meta2.push('<span class="warn" title="' + esc(tr('Waiting for {ids}', { ids: t.blockers.join(', ') })) + '">' + esc(tr('Blocked by {ids}', { ids: t.blockers.join(', ') })) + '</span>');
    if (t.due) {
      const d = daysUntil(t.due);
      const closed = !OPEN.includes(t.status);
      meta2.push('<span class="' + (t.overdue ? 'warn' : d <= 3 && !closed ? 'note' : '') + '">' + (t.overdue ? tr('Overdue since {date}', { date: fmtDate(t.due) }) : tr('Due {date}', { date: fmtDate(t.due) })) + '</span>');
    }
    if ((meta.lanes || []).some((l) => l.task === t.id)) meta2.push('<span class="lane-tag" title="' + tr('An agent is working in its own Git worktree') + '">Parallel</span>');
    if (t.design && t.design.variants) meta2.push('<span class="' + (t.design.chosen ? '' : 'note') + '" title="' + tr('Design variants from UI UX Pro Max') + '">' + (t.design.chosen ? tr('Variant {id} chosen', { id: esc(t.design.chosen) }) : tr('{n} design variants to choose from', { n: t.design.variants })) + '</span>');
    if (t.questions.length) meta2.push('<span class="note">' + (t.questions.length === 1 ? tr('1 open question') : tr('{n} open questions', { n: t.questions.length })) + '</span>');
    if (t.incomplete && OPEN.includes(t.status)) meta2.push('<span>' + tr('Incomplete') + '</span>');
    const tags = [];
    if (t.milestone) tags.push('<span class="tag ms-tag">' + esc(t.milestone) + '</span>');
    t.tags.slice(0, 3).forEach((x) => tags.push('<span class="tag">#' + esc(x) + '</span>'));
    if (t.tags.length > 3) tags.push('<span class="tag">+' + (t.tags.length - 3) + '</span>');
    return '<article class="card' + (ch ? ' changed' + (ch.fresh ? ' pulse' : '') : '') + (OPEN.includes(t.status) ? '' : ' closed') + '" data-id="' + esc(t.id) + '" data-prio="' + esc(t.priority) + '" tabindex="0" role="button" aria-label="' + esc(t.id + ' ' + t.title) + '"' + (EDIT ? ' draggable="true"' : '') + (ch ? ' style="--cc:' + changeColor(ch) + '"' : '') + '>' +
      (ch && ch.kind !== 'updated' ? '<span class="change">' + esc(changeLabel(ch)) + '</span>' : '') +
      '<div class="card-top"><span class="id">' + esc(t.id) + '</span><span>' + esc(meta.typeLabel[t.type] || t.type) + '</span>' + (t.effort ? '<span class="effort" title="' + tr('Effort') + '">' + esc(t.effort) + '</span>' : '') + '<span class="prio">' + esc(t.priority) + '</span></div>' +
      '<div class="title">' + esc(t.title) + '</div>' +
      (t.thumb ? '<img loading="lazy" src="' + esc(t.thumb) + '" alt="' + esc(t.thumbAlt) + '">' : '') +
      liveBlock(t) +
      (t.conflicts ? cfConflict(t) : '') +
      (t.stale ? '<span class="cflag still">' + CF_IC.still + (t.stale.days === 1 ? tr('Quiet for 1 day') : tr('Quiet for {n} days', { n: t.stale.days })) + (t.stale.handoff ? '' : tr(', no handoff')) + '</span>' : '') +
      (meta2.length ? '<div class="card-meta">' + meta2.join('') + '</div>' : '') +
      (tags.length ? '<div class="card-meta">' + tags.join('') + '</div>' : '') +
      '</article>';
  }

  function sortList(c, list) {
    const rank = (p) => PRIOS.indexOf(p);
    if (c === 'erledigt' || c === 'verworfen') return list.sort((a, b) => String(b.completed || b.updated).localeCompare(String(a.completed || a.updated)));
    return list.sort((a, b) => rank(a.priority) - rank(b.priority) || (b.overdue - a.overdue) || String(a.due || '9').localeCompare(String(b.due || '9')) || a.id.localeCompare(b.id, 'de', { numeric: true }));
  }

  function renderBoard(arrived) {
    const board = $('#board');
    const cols = state.closed ? COLS : COLS.filter((c) => c !== 'verworfen');
    const anyMatch = tasks.some(match);
    board.innerHTML = cols.map((c) => {
      const list = sortList(c, tasks.filter((t) => t.status === c && match(t)));
      const canAdd = EDIT && (c === 'backlog' || c === 'geplant');
      let note = '';
      if (c === 'in-arbeit' && list.length > 1) note = '<div class="col-note">' + tr('More than one task in progress. Keep handoffs up to date.') + '</div>';
      const empty = filtersActive() && !anyMatch ? tr('No matches for the filters') : c === 'backlog' && EDIT ? tr('Empty. Use + to add a task.') : tr('Empty');
      return '<section class="col' + (arrived && arrived.has(c) ? ' arrive' : '') + '" data-col="' + c + '" style="--c:' + statusVar(c) + '" aria-label="' + esc(L(c)) + '">' +
        '<div class="col-head"><span class="dot"></span><h2>' + esc(L(c)) + '</h2><span class="n">' + list.length + '</span>' +
        (canAdd ? '<button class="add" data-quick="' + c + '" title="' + esc(tr('Add task to {col}', { col: L(c) })) + '" aria-label="' + esc(tr('Add task to {col}', { col: L(c) })) + '">+</button>' : '') + '</div>' + note +
        (quickCol === c ? '<div class="quick"><input class="quick-in" placeholder="' + tr('Type a title, Enter saves') + '" maxlength="160" aria-label="' + tr('Title of the new task') + '"><small>' + tr('Created as a feature with P3. Add details in the panel afterwards.') + '</small></div>' : '') +
        '<div class="cards">' + (list.length ? list.map(card).join('') : '<div class="empty">' + esc(empty) + '</div>') + '</div></section>';
    }).join('');
    $$('.card', board).forEach((el) => {
      el.onclick = () => openTask(el.dataset.id);
      el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(el.dataset.id); } };
    });
    $$('[data-quick]', board).forEach((b) => b.onclick = () => { quickCol = quickCol === b.dataset.quick ? null : b.dataset.quick; renderBoard(); const i = $('.quick-in'); if (i) i.focus(); });
    const qi = $('.quick-in', board);
    if (qi) {
      qi.onkeydown = async (e) => {
        if (e.key === 'Escape') { quickCol = null; renderBoard(); return; }
        if (e.key !== 'Enter' || !qi.value.trim()) return;
        const title = qi.value.trim(); const status = quickCol;
        qi.disabled = true;
        const r = await run(() => act('create', { title, status, type: 'feature', priority: 'P3' }), (x) => x.message);
        quickCol = null;
        if (r && r.id) pendingOpen = r.id;
        renderBoard();
      };
    }
    if (EDIT) setupDnD(board);
    for (const c of changes.values()) c.fresh = false;
  }
  let pendingOpen = null;

  function renderAll(arrived) {
    renderHeader(); renderViews();
    if (state.view === 'board') { renderOverview(); renderProgress(); }
    if (['board', 'timeline', 'graph', 'table'].includes(state.view)) { renderFilters(); renderMsFilter(); renderSavedViews(); }
    renderBoard(arrived);
    if (state.view === 'sprint') renderSprint();
    if (state.view === 'graph') renderGraph();
    if (state.view === 'queue') renderQueue();
    if (state.view === 'timeline') renderTimeline();
    if (state.view === 'table') renderTable();
    if (state.view === 'live') renderLive();
    liveDeadline = nextLiveDeadline();
  }

  // ---------- Drag and Drop ----------

  let dragId = null;
  function setupDnD(board) {
    $$('.card', board).forEach((el) => {
      el.ondragstart = (e) => { dragId = el.dataset.id; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); };
      el.ondragend = () => {
        el.classList.remove('dragging'); dragId = null; $$('.col.drop').forEach((c) => c.classList.remove('drop'));
        if (reloadPending) { reloadPending = false; reload(); }
      };
    });
    $$('.col', board).forEach((col) => {
      col.ondragover = (e) => { if (!dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('drop'); };
      col.ondragleave = (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop'); };
      col.ondrop = (e) => {
        e.preventDefault(); col.classList.remove('drop');
        const id = e.dataTransfer.getData('text/plain') || dragId;
        if (id) requestMove(id, col.dataset.col);
      };
    });
  }

  async function requestMove(id, to) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === to) return;
    const from = t.status;
    if (!OPEN.includes(from)) {
      if (!OPEN.includes(to)) { toast('<div class="what">' + tr('Reopen first') + '</div><div class="why">' + tr('Done and dropped tasks can only go back to an open column.') + '</div>', 'err'); return; }
      const reason = await askText({ title: tr('Reopen {id}', { id }), lead: tr('The task goes back to {col}. The reason is recorded in the history.', { col: L(to) }), label: tr('Justification'), confirm: tr('Reopen'), required: true });
      if (reason === null) return;
      return run(() => act('move', { id, to, reason }), tr('{id} reopened', { id }));
    }
    if (to === 'erledigt') return openDod(id);
    if (to === 'verworfen') {
      const reason = await askText({ title: tr('Drop {id}', { id }), lead: tr('The task will not be done. You can reopen it later.'), label: tr('Justification'), confirm: tr('Drop'), required: true, danger: true });
      if (reason === null) return;
      return run(() => act('move', { id, to, reason }), tr('{id} dropped', { id }));
    }
    try {
      await act('move', { id, to });
      ok(to === 'in-arbeit' ? tr('{id} started', { id }) : tr('{id} moved to {col}', { id, col: L(to) }));
    } catch (e) {
      // Die Meldung des Servers kommt in der eingestellten Sprache.
      if (to === 'in-arbeit' && /blockiert|blocked/i.test(e.message)) {
        const yes = await confirmBox({ title: tr('{id} is blocked', { id }), lead: e.message, confirm: tr('Start anyway') });
        if (yes) await run(() => act('move', { id, to, force: true }), tr('{id} started', { id }));
      } else fail(e);
    }
  }

  // ---------- Dialoge ----------

  const dlg = $('#dialog');
  const form = $('#dialogForm');
  function showDialog(html, onSubmit, onOpen) {
    form.innerHTML = html;
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; dlg.close(); resolve(v); };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const submitter = e.submitter;
        if (submitter && submitter.value === 'cancel') return finish(null);
        const err = $('.err', form);
        try {
          if (submitter) submitter.disabled = true;
          const v = await onSubmit(new FormData(form), submitter ? submitter.value : '');
          if (v !== undefined) finish(v);
        } catch (ex) {
          if (err) err.textContent = ex.message; else fail(ex);
        } finally { if (submitter) submitter.disabled = false; }
      };
      dlg.oncancel = (e) => { e.preventDefault(); finish(null); };
      dlg.showModal();
      if (onOpen) onOpen(form);
      const first = $('[autofocus]', form) || $('input, textarea, select', form);
      if (first) first.focus();
    });
  }
  const foot = (confirm, opts = {}) => '<p class="err" role="alert"></p><div class="foot">' + (opts.extra || '') + '<button class="btn" value="cancel" formnovalidate>' + tr('Cancel') + '</button><button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" value="ok">' + esc(confirm) + '</button></div>';

  function askText({ title, lead, label, confirm, required, danger, value = '', multiline = false }) {
    const field = multiline
      ? '<textarea class="input" name="v" rows="5" ' + (required ? 'required' : '') + ' autofocus>' + esc(value) + '</textarea>'
      : '<input class="input" name="v" value="' + esc(value) + '" ' + (required ? 'required' : '') + ' maxlength="300" autofocus>';
    return showDialog('<h2>' + esc(title) + '</h2>' + (lead ? '<p class="lead">' + esc(lead) + '</p>' : '') +
      '<label class="field"><span>' + esc(label) + '</span>' + field + '</label>' + foot(confirm, { danger }),
    (fd) => String(fd.get('v') || '').trim());
  }
  function confirmBox({ title, lead, confirm, danger }) {
    return showDialog('<h2>' + esc(title) + '</h2><p class="lead">' + esc(lead) + '</p>' + foot(confirm, { danger }), () => true);
  }

  async function ensureMeta() {
    if (!metaInfo) metaInfo = await api('GET', 'api/meta');
    return metaInfo;
  }

  const segCtl = (name, options, checked) => '<div class="seg-ctl" role="radiogroup">' + options.map((o) => '<label><input type="radio" name="' + name + '" value="' + esc(o.id) + '"' + (o.id === checked ? ' checked' : '') + '><span>' + (o.dot ? '<span class="pdot" style="--pc:' + o.dot + '"></span>' : '') + esc(o.label) + '</span></label>').join('') + '</div>';

  async function newTask(prefill = {}) {
    if (!prefill.blank) {
      let tpls = [];
      try { tpls = await api('GET', 'api/templates'); } catch (e) { tpls = []; }
      if (tpls.length) return pickTemplate(tpls, prefill);
    }
    let m;
    try { m = await ensureMeta(); metaInfo = null; } catch (e) { return fail(e); }
    const type = prefill.type || 'feature';
    const html = '<h2>' + tr('New task') + '</h2>' +
      '<div class="field span4"><span>' + tr('Type') + '</span>' + segCtl('type', m.types.map((x) => ({ id: x.id, label: x.label })), type) + '</div>' +
      '<label class="field span4"><span>' + tr('Title') + '</span><input class="input" name="title" required maxlength="160" placeholder="' + tr('What should be different at the end?') + '" value="' + esc(prefill.title || '') + '" autofocus></label>' +
      '<div class="grid">' +
      '<div class="field span4"><span>' + tr('Priority') + '</span>' + segCtl('priority', m.priorities.map((p) => ({ id: p.id, label: p.id + ' ' + p.label, dot: prioVar(p.id) })), prefill.priority || 'P3') + '</div>' +
      '<div class="field span2"><span>' + tr('Column') + '</span>' + segCtl('status', [{ id: 'backlog', label: L('backlog') }, { id: 'geplant', label: L('geplant') }], prefill.status || 'backlog') + '</div>' +
      '<div class="field span2"><span>' + tr('Effort') + '</span>' + segCtl('effort', [{ id: '', label: tr('Not set') }].concat(m.efforts.map((e) => ({ id: e, label: e }))), '') + '</div>' +
      '<label class="field"><span>' + tr('Risk') + '</span><select name="risk"><option value="">' + tr('Not set') + '</option>' + m.risks.map((r) => '<option>' + esc(r) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>' + tr('Due') + '</span><input type="date" name="due"></label>' +
      '<label class="field span2"><span>' + tr('Milestone') + '</span><select name="milestone"><option value="">' + tr('None') + '</option>' + m.milestones.map((x) => '<option value="' + esc(x.id) + '"' + (state.ms === x.id ? ' selected' : '') + '>' + esc(x.id + ' ' + x.title) + '</option>').join('') + '</select></label>' +
      '<label class="field span2"><span>' + tr('Tags, comma-separated') + '</span><input class="input" name="tags" list="tagList" placeholder="bot, dashboard"><datalist id="tagList">' + m.tags.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist></label>' +
      '<label class="field span2"><span>' + tr('Waiting for') + '</span><select name="blocked_by"><option value="">' + tr('Nothing') + '</option>' + m.tasks.filter((x) => !['erledigt', 'verworfen'].includes(x.status)).map((x) => '<option value="' + esc(x.id) + '">' + esc(x.id + ' ' + x.title) + '</option>').join('') + '</select></label>' +
      '</div>' +
      '<label class="field"><span>' + tr('Description') + '</span><textarea class="input" name="description" rows="7" placeholder="' + tr('What should happen and why? Background, details, links and notes for Claude. Markdown works, start lists with -.') + '"></textarea><span class="sublabel">' + tr('Put everything relevant to the task here. Claude reads the description at the start as your brief.') + '</span></label>' +
      '<label class="field"><span>' + tr('Acceptance criteria, one per line') + '</span><textarea class="input" name="criteria" rows="3" placeholder="' + tr('Answerable with yes or no') + '"></textarea></label>' +
      '<p class="sublabel">' + tr('Without a description or criteria the task is marked incomplete. Claude will ask about it then.') + '</p>' +
      foot(tr('Create task'));
    const r = await showDialog(html, async (fd) => {
      const payload = {
        type: fd.get('type'), title: String(fd.get('title') || '').trim(), priority: fd.get('priority'), status: fd.get('status'),
        effort: fd.get('effort') || '', risk: fd.get('risk') || '', due: fd.get('due') || '', milestone: fd.get('milestone') || '',
        tags: String(fd.get('tags') || '').split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean),
        blocked_by: fd.get('blocked_by') ? [fd.get('blocked_by')] : [],
        description: String(fd.get('description') || ''), criteria: String(fd.get('criteria') || '').split('\n').map((s) => s.replace(/^\s*[-*]\s*(\[ \]\s*)?/, '').trim()).filter(Boolean),
      };
      return act('create', payload);
    }, (f) => bindDuplicateCheck(f));
    if (r && r.merged) { ok(r.message); return; }
    if (r) { ok(r.message); pendingOpen = r.id; }
  }

  async function editMilestone(mid) {
    const m = mid ? meta.milestones.find((x) => x.id === mid) : null;
    const html = '<h2>' + (m ? tr('Edit milestone {id}', { id: esc(m.id) }) : tr('Create milestone')) + '</h2>' +
      '<p class="lead">' + tr('A milestone groups tasks toward a goal, for example a release. You assign tasks in the detail panel.') + '</p>' +
      '<label class="field"><span>' + tr('Title') + '</span><input class="input" name="title" required maxlength="120" value="' + esc(m ? m.title : '') + '" autofocus></label>' +
      '<div class="grid"><label class="field span2"><span>' + tr('Target date') + '</span><input type="date" name="due" value="' + esc(m ? m.due || '' : '') + '"></label>' +
      (m ? '<label class="field span2"><span>Status</span><select name="status"><option value="offen"' + (m.status !== 'erledigt' ? ' selected' : '') + '>' + tr('Open') + '</option><option value="erledigt"' + (m.status === 'erledigt' ? ' selected' : '') + '>' + tr('Reached') + '</option></select></label>' : '') + '</div>' +
      '<label class="field"><span>' + tr('Description') + '</span><input class="input" name="description" maxlength="500" value="' + esc(m ? m.description || '' : '') + '"></label>' +
      foot(m ? tr('Save') : tr('Create milestone'));
    const r = await showDialog(html, (fd) => {
      const f = { title: String(fd.get('title') || '').trim(), due: fd.get('due') || '', description: String(fd.get('description') || '').trim() };
      if (m) return act('milestoneSet', { mid: m.id, fields: { ...f, status: fd.get('status') } });
      return act('milestoneAdd', f);
    });
    if (r) ok(r.message);
  }

  // ---------- Definition of Done ----------

  async function openDod(id) {
    let res;
    try { res = await api('GET', 'api/dod?id=' + encodeURIComponent(id)); } catch (e) { return fail(e); }
    const t = tasks.find((x) => x.id === id) || { title: '' };
    const missing = res.auto.filter((a) => !a.ok);
    // Punkte der Prüfungen in beiden Sprachen erkennen (englisch "Check {name}", "Automatic checks ran on the current state").
    const isCheck = (a) => /^(Prüfung |Automatische Prüfungen|Check |Automatic checks)/.test(a.text);
    const dodItems = res.checks ? res.auto.filter((a) => !isCheck(a)) : res.auto;
    const html = '<h2>' + tr('Complete {id}', { id: esc(id) }) + '</h2><p class="lead">' + esc(t.title) + '</p>' +
      (res.checks ? checksBlock(res.checks) : '') +
      '<div class="block"><div class="block-head"><h3>' + (res.checks ? tr('From the Definition of Done') : tr('Checked automatically')) + '</h3><span class="meta">' + tr('{a} of {b} met', { a: dodItems.filter((a) => a.ok).length, b: dodItems.length }) + '</span></div>' +
      '<ul class="dod">' + dodItems.map((a) => '<li class="' + (a.ok ? 'ok' : 'no') + '"><span class="mark" aria-hidden="true">' + (a.ok ? '✓' : '!') + '</span><span>' + esc(a.text) + (a.detail ? ' <span class="detail">' + esc(a.detail) + '</span>' : '') + '<span class="sr"> ' + (a.ok ? tr('met') : tr('missing')) + '</span></span></li>').join('') + '</ul></div>' +
      (res.manual.length ? '<div class="block"><div class="block-head"><h3>' + tr('Confirm yourself') + '</h3><span class="meta">' + tr('Tick what is done') + '</span></div><ul class="dod">' + res.manual.map((m, i) => '<li><label><input type="checkbox" name="m' + i + '" class="man"><span>' + esc(m) + '</span></label></li>').join('') + '</ul></div>' : '') +
      (missing.length ? '<div class="alert bad">' + (missing.length === 1 ? tr('1 item is still missing. You can only complete with a reason, which is recorded in the history.') : tr('{n} items are still missing. You can only complete with a reason, which is recorded in the history.', { n: missing.length })) + '</div><label class="field"><span>' + tr('Reason for completing despite open items') + '</span><input class="input" name="reason" maxlength="300"></label>' : '') +
      '<p class="err" role="alert"></p><div class="foot"><button class="btn" value="cancel" formnovalidate>' + tr('Cancel') + '</button><button class="btn ' + (missing.length ? 'danger' : 'primary') + '" value="ok" id="dodGo" disabled>' + (missing.length ? tr('Complete anyway') : tr('Complete')) + '</button></div>';
    const r = await showDialog(html, (fd) => {
      const reason = String(fd.get('reason') || '').trim();
      if (missing.length && !reason) throw new Error(tr('Please give a reason.'));
      return act('move', { id, to: 'erledigt', force: missing.length > 0, reason });
    }, (f) => {
      const go = $('#dodGo', f);
      const update = () => {
        const allMan = $$('.man', f).every((c) => c.checked);
        const reasonOk = !missing.length || String(($('input[name="reason"]', f) || {}).value || '').trim().length > 2;
        go.disabled = !(allMan && reasonOk);
      };
      $$('input', f).forEach((i) => { i.oninput = update; i.onchange = update; });
      update();
      bindChecks(f, id);
    });
    if (r) ok(tr('{id} done', { id }));
  }

  // ---------- Detailpanel ----------

  const panel = $('#panel');
  const scrim = $('#scrim');
  let dirty = false;
  let staleDetail = false;
  let detailTab = 'overview';
  // Abschnitte heißen in englischen Aufgaben wie SECTION_NAMES.en in lib.mjs; Vergleiche erkennen beide Sprachen.
  const SEC_EN = { Beschreibung: 'Description', Übergabe: 'Handoff', Akzeptanzkriterien: 'Acceptance criteria', Umsetzungsplan: 'Implementation plan', Checkliste: 'Checklist', Vorgehen: 'Approach' };
  const secIs = (name, key) => name === key || name === SEC_EN[key];
  // Anzeigename eines Abschnittsschlüssels in der Sprache des Boards; andere Namen bleiben wie in der Datei.
  const SEC_LABEL = { Beschreibung: tr('Description'), Übergabe: tr('Handoff'), Akzeptanzkriterien: tr('Acceptance criteria'), Umsetzungsplan: tr('Implementation plan'), Checkliste: tr('Checklist'), Vorgehen: tr('Approach') };
  const secLabel = (name) => SEC_LABEL[name] || name;

  async function openTask(id) {
    if (!LIVE && !DETAILS) return openStatic(id);
    if (openId !== id) detailTab = 'overview';
    openId = id; dirty = false; staleDetail = false;
    closeSide();
    panel.hidden = false; scrim.hidden = false;
    if (!detail || detail.task.id !== id) $('#panelBody').innerHTML = '<p class="md">' + tr('Loading …') + '</p>';
    await loadDetail();
    panel.tabIndex = -1;
    panel.focus({ preventScroll: true });
  }

  function openStatic(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    openId = id;
    panel.hidden = false; scrim.hidden = false;
    $('#panelBody').innerHTML = '<div class="p-head"><div class="p-bar"><span class="id">' + esc(t.id) + '</span><span>' + esc(meta.typeLabel[t.type]) + '</span><span class="st" style="--c:' + statusVar(t.status) + '">' + esc(L(t.status)) + '</span><span class="spacer"></span><button class="btn small" data-close>' + tr('Close') + '</button></div><h2 class="p-title" style="border:0">' + esc(t.title) + '</h2></div>' +
      (t.excerpt ? '<div class="md">' + md(t.excerpt) + '</div>' : '') +
      (t.thumb ? '<img src="' + esc(t.thumb) + '" alt="' + esc(t.thumbAlt) + '" style="max-width:100%;border-radius:8px">' : '') +
      '<div class="alert info">' + tr('Details and editing are available in the live view.') + '</div>' +
      '<div class="p-foot"><span class="path">' + esc(t.file) + '</span></div>';
    $('[data-close]', panel).onclick = closePanel;
  }

  async function loadDetail() {
    if (!openId) return;
    try {
      if (DETAILS) {
        detail = DETAILS[openId];
        if (!detail) throw new Error(tr('The snapshot contains no details for this task.'));
      } else detail = await api('GET', 'api/task?id=' + encodeURIComponent(openId));
      renderDetail();
    } catch (e) {
      $('#panelBody').innerHTML = '<div class="alert bad">' + esc(e.message) + '</div><button class="btn" data-close>' + tr('Close') + '</button>';
      $('[data-close]', panel).onclick = closePanel;
    }
  }

  function closePanel() {
    if (dirty && !confirm(tr('Discard unsaved changes?'))) return;
    panel.hidden = true; scrim.hidden = true; openId = null; detail = null; dirty = false;
  }
  scrim.onclick = () => { closePanel(); closeSide(); };

  function sel(name, options, value, labelFn) {
    return '<select data-field="' + name + '">' + options.map((o) => {
      const v = typeof o === 'string' ? o : o.id;
      const lab = labelFn ? labelFn(o) : typeof o === 'string' ? (o || tr('Not set')) : o.label;
      return '<option value="' + esc(v) + '"' + (String(value || '') === v ? ' selected' : '') + '>' + esc(lab) + '</option>';
    }).join('') + '</select>';
  }

  function renderDetail() {
    const d = detail;
    const t = d.task;
    const mi = metaInfo || { types: Object.entries(meta.typeLabel).map(([id, label]) => ({ id, label })), efforts: ['S', 'M', 'L', 'XL'], risks: ['niedrig', 'mittel', 'hoch'], milestones: meta.milestones };
    const closed = !OPEN.includes(t.status);
    // Die Beschreibung ist der zentrale Abschnitt. Ein Ziel älterer Aufgaben erscheint nur, wenn es gefüllt ist.
    const desc = d.sections.find((s) => secIs(s.name, 'Beschreibung'));
    const legacy = !secIs(d.goalSection, 'Beschreibung') ? d.sections.find((s) => s.name === d.goalSection && s.content) : null;
    const others = d.sections.filter((s) => !secIs(s.name, 'Beschreibung') && !secIs(s.name, 'Übergabe') && !(legacy && s.name === legacy.name) && !(!s.content && s.name === d.goalSection));
    const handoff = d.sections.find((s) => secIs(s.name, 'Übergabe'));
    const h = [];

    const queued = (meta.queue || []).indexOf(t.id);
    h.push('<div class="p-head"><div class="p-bar"><span class="id">' + esc(t.id) + '</span><span class="st" style="--c:' + statusVar(t.status) + '">' + esc(L(t.status)) + '</span>' +
      (d.archived ? '<span class="tag">' + tr('Archived') + '</span>' : '') + (queued >= 0 ? '<span class="tag q-tag">' + tr('Queue position {n}', { n: queued + 1 }) + '</span>' : '') + '<span class="spacer"></span>' +
      (OPEN.includes(t.status) && !['in-arbeit', 'review'].includes(t.status) ? '<button class="btn small ghost" data-act="queue">' + (queued >= 0 ? tr('Remove from queue') : tr('Add to queue')) + '</button>' : '') +
      (t.status === 'review' ? '<button class="btn small primary" data-act="review">' + tr('Accept') + '</button>' : OPEN.includes(t.status) ? '<button class="btn small" data-act="dod">' + tr('Complete') + '</button>' : '') +
      '<button class="btn small ghost" data-close aria-label="' + tr('Close panel') + '">' + tr('Close') + '</button></div>' +
      '<textarea class="p-title" rows="1" maxlength="160" aria-label="' + tr('Title') + '" data-title' + (EDIT ? '' : ' readonly') + '>' + esc(t.title) + '</textarea>' +
      '<div class="p-tabs" role="tablist">' + [['overview', tr('Details')]].concat(d.design || /^(design)$/.test(t.type) || (t.tags || []).includes('ui') ? [['design', tr('Design variants') + (d.design && d.design.variants.length ? ' <span class="count">' + d.design.variants.length + '</span>' : '')]] : []).concat([['comments', tr('Comments') + ((d.comments || []).length ? ' <span class="count">' + d.comments.length + '</span>' : '')], ['time', tr('Time')]]).concat(LIVE ? [['code', tr('Code and commits')]] : []).map((x) => '<button role="tab" data-tab="' + x[0] + '" aria-selected="' + (detailTab === x[0]) + '">' + x[1] + '</button>').join('') + '</div>' +
      '</div>');
    if (detailTab === 'comments' || detailTab === 'time' || detailTab === 'design') {
      h.push(detailTab === 'comments' ? commentsHtml(d) : detailTab === 'design' ? designHtml(d) : timeHtml(d));
      $('#panelBody').innerHTML = h.join('');
      bindHead();
      if (detailTab === 'comments') bindComments(t.id);
      if (detailTab === 'design') bindDesign(t.id);
      return;
    }
    if (detailTab === 'code' && LIVE) {
      h.push('<div id="codeBox" class="code-box"><p class="md">' + tr('Loading Git data …') + '</p></div>');
      $('#panelBody').innerHTML = h.join('');
      bindHead();
      loadCode(t.id);
      return;
    }

    h.push('<div class="fields">' +
      '<label class="field"><span>Status</span>' + sel('status', COLS.map((c) => ({ id: c, label: L(c) })), t.status) + '</label>' +
      '<label class="field"><span>' + tr('Priority') + '</span>' + sel('priority', PRIOS.map((p) => ({ id: p, label: p + ' ' + meta.prioLabel[p] })), t.priority) + '</label>' +
      '<label class="field"><span>' + tr('Type') + '</span>' + sel('type', mi.types, t.type) + '</label>' +
      '<label class="field"><span>' + tr('Effort') + '</span>' + sel('effort', [''].concat(mi.efforts), t.effort) + '</label>' +
      '<label class="field"><span>' + tr('Risk') + '</span>' + sel('risk', [''].concat(mi.risks), t.risk) + '</label>' +
      '<label class="field"><span>' + tr('Due') + '</span><input type="date" data-field="due" value="' + esc(t.due || '') + '"></label>' +
      '<label class="field wide"><span>' + tr('Milestone') + '</span>' + sel('milestone', [{ id: '', label: tr('None') }].concat(meta.milestones.map((m) => ({ id: m.id, label: m.id + ' ' + m.title }))), t.milestone) + '</label>' +
      '<label class="field wide" style="grid-column:1/-1"><span>' + tr('Tags, comma-separated') + '</span><input class="input" data-field="tags" value="' + esc((t.tags || []).join(', ')) + '"></label>' +
      '</div>');

    const alerts = [];
    if (d.blocked) alerts.push('<div class="alert bad">' + tr('Waiting for {ids}. You can start once these are done.', { ids: d.openBlockers.map((x) => '<a href="#" data-goto="' + esc(x) + '">' + esc(x) + '</a>').join(', ') }) + '</div>');
    if (t.incomplete && !closed) alerts.push('<div class="alert info"><span>' + tr('Captured quickly, details are still missing. Add a description and acceptance criteria, then {button}.', { button: '<button class="btn link" data-act="complete">' + tr('mark as complete') + '</button>' }) + '</span></div>');
    if (staleDetail) alerts.push('<div class="alert info">' + tr('The task has changed in the meantime.') + ' <button class="btn link" data-act="reload">' + tr('Reload') + '</button></div>');
    h.push(alerts.join(''));
    if (t.status === 'in-arbeit' && EDIT) h.push(instructBox(t.id));

    const descBlock = sectionBlock('Beschreibung', desc ? desc.content : '', true, tr('Everything relevant to the task; Claude reads it as your brief'));
    // Ältere Aufgaben ohne Beschreibung: das gefüllte Ziel zuerst, darunter die leere Beschreibung zum Ergänzen.
    if (legacy && !(desc && desc.content)) h.push(sectionBlock(legacy.name, legacy.content, true), descBlock);
    else { h.push(descBlock); if (legacy) h.push(sectionBlock(legacy.name, legacy.content, true)); }

    for (const c of d.checklists) {
      if (!EDIT && !c.items.length) continue;
      const done = c.items.filter((i) => i.done).length;
      h.push('<div class="block" data-list="' + esc(c.name) + '"><div class="block-head"><h3>' + esc(secLabel(c.name)) + '</h3><span class="meta">' + tr('{a} of {b}', { a: done, b: c.items.length }) + '</span></div>' +
        (c.items.length ? '<ul class="checklist">' + c.items.map((i) => '<li class="' + (i.done ? 'done' : '') + '"><input type="checkbox" data-check="' + i.n + '"' + (i.done ? ' checked' : '') + ' aria-label="' + esc(i.text) + '"><span class="txt">' + inline(i.text) + '</span><button class="rm" data-rm="' + i.n + '" title="' + tr('Remove item') + '" aria-label="' + tr('Remove item') + '">×</button></li>').join('') + '</ul>' : '') +
        '<div class="add-row"><input class="input" data-additem placeholder="' + (secIs(c.name, 'Akzeptanzkriterien') ? tr('Add criterion') : tr('Add step')) + '" maxlength="500"><button class="btn small" data-additem-btn>' + tr('Add') + '</button></div></div>');
    }

    const openQ = d.questions.filter((q) => !q.done);
    h.push('<div class="block"><div class="block-head"><h3>' + tr('Open questions') + '</h3><span class="meta">' + (openQ.length ? tr('{n} open', { n: openQ.length }) : tr('none open')) + '</span></div>' +
      d.questions.map((q) => '<div class="qa' + (q.done ? ' done' : '') + '"><div class="q">' + inline(q.text) + '</div>' +
        (q.done ? '' : '<div class="add-row"><input class="input" data-answer="' + q.n + '" placeholder="' + tr('Answer, optional') + '" maxlength="1000"><button class="btn small" data-resolve="' + q.n + '">' + tr('Resolved') + '</button></div>') + '</div>').join('') +
      '<div class="add-row"><input class="input" data-question placeholder="' + tr('Note a question for Claude or yourself') + '" maxlength="500"><button class="btn small" data-question-btn>' + tr('Jot down') + '</button></div></div>');

    h.push(sectionBlock('Übergabe', handoff ? handoff.content : '', d.editable.some((n) => secIs(n, 'Übergabe')), tr('Where work continues. Claude writes it at the end of each work phase.')));

    h.push('<div class="block"><div class="block-head"><h3>' + tr('Images and files') + '</h3><span class="meta">' + d.assets.length + '</span></div>' +
      (d.assets.length ? '<div class="gallery">' + d.assets.map((a) => '<figure class="shot" style="margin:0">' + (a.image ? '<a href="' + esc(a.src) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(a.src) + '" alt="' + esc(a.alt) + '"></a>' : '<a href="' + esc(a.src) + '" target="_blank" rel="noopener">' + esc(a.alt || a.src) + '</a>') +
        '<figcaption>' + (a.kind ? '<span class="kind">' + esc(a.kind) + '</span>' : '') + esc(a.desc || a.alt) + '</figcaption></figure>').join('') + '</div>' : '') +
      '<div class="drop" id="dropzone"><span>' + tr('{paste} with Ctrl+V, drag it here or {pick}. PNG, JPEG, GIF, WebP and AVIF are allowed.', { paste: '<strong>' + tr('Paste an image') + '</strong>', pick: '<button class="btn link" id="pickFile">' + tr('choose a file') + '</button>' }) + '</span><input type="file" id="fileIn" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" hidden>' +
      '<div id="upForm" hidden><img class="preview" id="upPrev" alt="' + tr('Preview') + '"><div class="row" style="margin-top:8px"><select id="upKind" class="input"><option value="">' + tr('Choose a kind') + '</option>' + ['ist', 'vorher', 'nachher', 'referenz', 'mockup', 'skizze', 'fehler', 'diagramm'].map((k) => '<option>' + k + '</option>').join('') + '</select><input class="input" id="upName" placeholder="' + tr('Short name, optional') + '" maxlength="60"></div>' +
      '<textarea class="input" id="upDesc" rows="2" style="margin-top:8px" placeholder="' + tr('What does it show? Claude reads this description instead of the image.') + '" maxlength="1000"></textarea><div class="row" style="margin-top:8px;justify-content:flex-end;display:flex;gap:8px"><button class="btn small" id="upCancel">' + tr('Discard') + '</button><button class="btn small primary" id="upSave">' + tr('Save image') + '</button></div></div></div></div>');

    const relRow = (k, list, rel) => list.map((r) => '<div class="rel-item"><span class="k">' + k + '</span><button class="go" data-goto="' + esc(r.id) + '">' + esc(r.id + ' ' + r.title) + '</button><span class="st" style="--c:' + statusVar(r.status) + '">' + esc(L(r.status)) + '</span><button class="btn small ghost" data-unlink="' + esc(rel) + '" data-target="' + esc(r.id) + '" aria-label="' + tr('Remove link') + '">×</button></div>').join('');
    const others2 = tasks.filter((x) => x.id !== t.id && !x.archived);
    h.push('<div class="block"><div class="block-head"><h3>' + tr('Dependencies') + '</h3></div><div class="rel">' +
      relRow(tr('Waiting for'), d.blockedBy, 'blocked-by') + relRow(tr('Blocks'), d.blocks, 'blocks') + relRow(tr('Related'), d.related, 'related') +
      '<div class="add-row"><select class="input" id="relKind" style="flex:0 0 140px"><option value="blocked-by">' + tr('Waiting for') + '</option><option value="blocks">' + tr('Blocks') + '</option><option value="related">' + tr('Related to') + '</option></select><select class="input" id="relTarget"><option value="">' + tr('Choose a task') + '</option>' + others2.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.id + ' ' + x.title) + '</option>').join('') + '</select><button class="btn small" id="relAdd">' + tr('Link') + '</button></div></div></div>');

    for (const s of others) {
      if (!s.content && !d.editable.includes(s.name)) continue;
      h.push('<details class="sec"' + (s.content ? ' open' : '') + '><summary>' + esc(s.name) + (s.content ? '' : ' <span class="meta">' + tr('empty') + '</span>') + '</summary><div class="body">' + sectionInner(s.name, s.content, d.editable.includes(s.name)) + '</div></details>');
    }
    if (d.decisions) h.push('<details class="sec"><summary>' + tr('Design decisions') + ' <span class="meta">decisions.md</span></summary><div class="body"><div class="md">' + md(d.decisions.replace(/^# .*\n?/, '')) + '</div></div></details>');

    h.push('<details class="sec" open><summary>' + tr('History') + ' <span class="meta">' + tr('{n} entries', { n: d.history.length }) + '</span></summary><div class="body">' +
      '<div class="add-row"><input class="input" data-note placeholder="' + tr('Write a note to the history') + '" maxlength="2000"><button class="btn small" data-note-btn>' + tr('Save') + '</button></div>' +
      '<ol class="timeline">' + d.history.slice(0, 60).map((e) => '<li><time datetime="' + esc(e.date) + '">' + esc(fmtDate(e.date)) + '</time><span>' + inline(e.text) + (e.actor ? '<span class="by">' + esc(e.actor) + '</span>' : '') + '</span></li>').join('') + '</ol></div></details>');

    h.push('<div class="p-foot"><span class="path" title="' + tr('File') + '">.works/' + esc(d.file) + '</span>' +
      (EDIT ? '<button class="btn small ghost" data-act="template">' + tr('Save as template') + '</button>' : '') +
      (closed && !d.archived ? '<button class="btn small" data-act="archive">' + tr('Archive') + '</button>' : '') +
      (!closed ? '<button class="btn small danger" data-act="drop">' + tr('Drop') + '</button>' : '<button class="btn small" data-act="reopen">' + tr('Reopen') + '</button>') + '</div>');

    $('#panelBody').innerHTML = h.join('');
    bindDetail();
    if (!EDIT) {
      // Felder im Nur-Lesen-Modus als Text zeigen statt als gesperrte Eingaben.
      $$('#panelBody .fields select, #panelBody .fields input').forEach((el) => {
        const v = el.tagName === 'SELECT' ? (el.options[el.selectedIndex] || {}).text : el.type === 'date' ? fmtDate(el.value) : el.value;
        const span = document.createElement('span');
        span.className = 'ro-val';
        span.textContent = v && v !== tr('Not set') && v !== tr('None') ? v : '–';
        el.replaceWith(span);
      });
      $$('#panelBody input, #panelBody select, #panelBody textarea:not([data-title])').forEach((el) => { el.disabled = true; });
    }
  }

  // Kopf des Panels: Schließen, Tabs, Sprünge. Gilt für Übersicht und Code.
  function bindHead() {
    const root = $('#panelBody');
    $$('[data-close]', root).forEach((b) => b.onclick = closePanel);
    $$('[data-tab]', root).forEach((b) => b.onclick = () => { if (detailTab === b.dataset.tab) return; detailTab = b.dataset.tab; renderDetail(); });
    $$('[data-goto]', root).forEach((a) => a.onclick = (e) => { e.preventDefault(); openTask(a.dataset.goto); });
    $$('[data-act="queue"]', root).forEach((b) => b.onclick = () => toggleQueue(detail.task.id));
    $$('[data-act="dod"]', root).forEach((b) => b.onclick = () => openDod(detail.task.id));
    $$('[data-act="review"]', root).forEach((b) => b.onclick = () => openReview(detail.task.id));
  }

  function sectionBlock(name, content, editable, hint) {
    return '<div class="block"><div class="block-head"><h3>' + esc(secLabel(name)) + '</h3>' + (hint ? '<span class="meta">' + esc(hint) + '</span>' : '') + '</div>' + sectionInner(name, content, editable) + '</div>';
  }
  function sectionInner(name, content, editable) {
    return '<div class="sec-view" data-sec="' + esc(name) + '"><div class="md">' + md(content) + '</div>' +
      (editable ? '<div><button class="btn small" data-edit="' + esc(name) + '">' + tr('Edit') + '</button></div>' : '') + '</div>';
  }

  function bindDetail() {
    const root = $('#panelBody');
    const t = detail.task;
    const id = t.id;
    bindHead();

    const title = $('[data-title]', root);
    const fit = () => { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; };
    fit();
    title.oninput = () => { fit(); dirty = true; };
    title.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } if (e.key === 'Escape') { title.value = t.title; dirty = false; title.blur(); } };
    title.onblur = async () => {
      if (!EDIT) return;
      const v = title.value.trim();
      dirty = false;
      if (!v || v === t.title) { title.value = t.title; fit(); return; }
      await run(() => act('set', { id, fields: { title: v } }), tr('Title saved'));
    };

    $$('[data-field]', root).forEach((el) => {
      el.onchange = async () => {
        const f = el.dataset.field;
        if (f === 'status') { const to = el.value; el.value = t.status; return requestMove(id, to); }
        let v = el.value;
        if (f === 'tags') v = v.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean);
        await run(() => act('set', { id, fields: { [f]: v } }), tr('Saved'));
      };
    });

    $$('[data-act]', root).forEach((b) => { if (['queue', 'dod', 'review'].includes(b.dataset.act)) return; b.onclick = async () => {
      const a = b.dataset.act;
      if (a === 'drop') return requestMove(id, 'verworfen');
      if (a === 'reopen') return requestMove(id, 'backlog');
      if (a === 'reload') { staleDetail = false; return loadDetail(); }
      if (a === 'archive') return run(() => act('archive', { id }), tr('{id} archived', { id }));
      if (a === 'template') return editTemplate(null, id);
      if (a === 'complete') return run(() => act('set', { id, fields: { incomplete: false } }), tr('Marked as complete'));
    }; });

    $$('[data-edit]', root).forEach((b) => b.onclick = () => {
      const name = b.dataset.edit;
      const box = b.closest('.sec-view');
      const cur = (detail.sections.find((s) => secIs(s.name, name)) || {}).content || '';
      box.innerHTML = '<textarea class="input" rows="' + Math.min(18, Math.max(4, cur.split('\n').length + 1)) + '" data-secedit>' + esc(cur) + '</textarea><div class="add-row" style="justify-content:flex-end"><span class="sublabel" style="margin-right:auto">' + tr('Markdown, start lists with -') + '</span><button class="btn small" data-seccancel>' + tr('Cancel') + '</button><button class="btn small primary" data-secsave>' + tr('Save') + '</button></div>';
      const ta = $('[data-secedit]', box);
      ta.focus(); dirty = true;
      ta.onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') $('[data-secsave]', box).click(); };
      $('[data-seccancel]', box).onclick = () => { dirty = false; renderDetail(); };
      $('[data-secsave]', box).onclick = async () => {
        const r = await run(() => act('section', { id, name, text: ta.value, after: name === 'Beschreibung' ? detail.typeGoal : undefined }), tr('{name} saved', { name: secLabel(name) }));
        if (r) dirty = false;
      };
    });

    $$('[data-list]', root).forEach((blk) => {
      const section = blk.dataset.list;
      $$('[data-check]', blk).forEach((c) => c.onchange = () => run(() => act('check', { id, section, n: +c.dataset.check, done: c.checked })));
      $$('[data-rm]', blk).forEach((b) => b.onclick = () => run(() => act('itemRemove', { id, section, n: +b.dataset.rm }), tr('Item removed')));
      const inp = $('[data-additem]', blk);
      const add = () => { const v = inp.value.trim(); if (!v) return; inp.disabled = true; run(() => act('item', { id, section, text: v }), tr('Item added')).finally(() => { inp.disabled = false; }); };
      inp.onkeydown = (e) => { if (e.key === 'Enter') add(); };
      $('[data-additem-btn]', blk).onclick = add;
    });

    $$('[data-resolve]', root).forEach((b) => b.onclick = () => {
      const n = +b.dataset.resolve;
      const answer = ($('[data-answer="' + n + '"]', root) || {}).value || '';
      run(() => act('resolve', { id, n, answer: answer.trim() }), tr('Question resolved'));
    });
    const q = $('[data-question]', root);
    const addQ = () => { const v = q.value.trim(); if (v) run(() => act('question', { id, text: v }), tr('Question noted')); };
    q.onkeydown = (e) => { if (e.key === 'Enter') addQ(); };
    $('[data-question-btn]', root).onclick = addQ;

    const note = $('[data-note]', root);
    const addN = () => { const v = note.value.trim(); if (v) run(() => act('log', { id, text: v }), tr('Note saved')); };
    note.onkeydown = (e) => { if (e.key === 'Enter') addN(); };
    $('[data-note-btn]', root).onclick = addN;

    $('#relAdd', root).onclick = () => {
      const target = $('#relTarget', root).value;
      if (!target) return;
      run(() => act('link', { id, rel: $('#relKind', root).value, target }), tr('Linked'));
    };
    $$('[data-unlink]', root).forEach((b) => b.onclick = () => run(() => act('link', { id, rel: b.dataset.unlink, target: b.dataset.target, remove: true }), tr('Link removed')));

    bindUpload(root, id);
  }

  // ---------- Bilder hochladen ----------

  let pendingFile = null;
  function bindUpload(root, id) {
    const zone = $('#dropzone', root);
    const fileIn = $('#fileIn', root);
    const formEl = $('#upForm', root);
    const show = (file) => {
      if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(file.type)) { fail(new Error(tr('Only PNG, JPEG, GIF, WebP or AVIF.'))); return; }
      if (file.size > 20 * 1024 * 1024) { fail(new Error(tr('The image is larger than 20 MB.'))); return; }
      pendingFile = file; dirty = true;
      formEl.hidden = false;
      const url = URL.createObjectURL(file);
      $('#upPrev', root).src = url;
      $('#upDesc', root).focus();
    };
    $('#pickFile', root).onclick = (e) => { e.preventDefault(); fileIn.click(); };
    fileIn.onchange = () => { if (fileIn.files[0]) show(fileIn.files[0]); };
    zone.ondragover = (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); zone.classList.add('over'); } };
    zone.ondragleave = () => zone.classList.remove('over');
    zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) show(f); };
    pasteTarget = show;
    $('#upCancel', root).onclick = (e) => { e.preventDefault(); pendingFile = null; dirty = false; formEl.hidden = true; };
    $('#upSave', root).onclick = async (e) => {
      e.preventDefault();
      if (!pendingFile) return;
      const qs = new URLSearchParams({ id, kind: $('#upKind', root).value, desc: $('#upDesc', root).value.trim(), name: $('#upName', root).value.trim() });
      const btn = e.currentTarget; btn.disabled = true;
      const r = await run(() => api('POST', 'api/asset?' + qs.toString(), undefined, { body: pendingFile, type: pendingFile.type }), tr('Image saved'));
      btn.disabled = false;
      if (r) { pendingFile = null; dirty = false; }
    };
  }
  let pasteTarget = null;
  document.addEventListener('paste', (e) => {
    if (!EDIT || panel.hidden || !pasteTarget) return;
    const item = [...(e.clipboardData || {}).items || []].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    pasteTarget(item.getAsFile());
  });

  // ---------- Seitenleiste ----------

  const sidePanel = $('#sidePanel');
  function openSide(kind) {
    if (side === kind && !sidePanel.hidden) return closeSide();
    side = kind;
    if (!panel.hidden) closePanel();
    if (!panel.hidden) return;
    sidePanel.hidden = false; scrim.hidden = false;
    renderSide();
  }
  function closeSide() { sidePanel.hidden = true; side = null; if (panel.hidden) scrim.hidden = true; }

  async function renderSide() {
    const body = $('#sideBody');
    const head = (title) => '<div class="side-head"><h2>' + esc(title) + '</h2><span class="spacer"></span><button class="btn small ghost" data-sclose>' + tr('Close') + '</button></div>';
    if (side === 'ideas') {
      let ideas = [];
      try { ideas = ideasCache = await api('GET', 'api/ideas'); } catch (e) { return fail(e); }
      const open = ideas.filter((i) => !i.closed);
      const closed = ideas.filter((i) => i.closed);
      body.innerHTML = head(tr('Ideas')) +
        '<p class="md">' + tr('Loose thoughts that are not a task yet. Promoted ideas become a task in the backlog.') + '</p>' +
        '<div class="add-row"><input class="input" id="ideaIn" placeholder="' + tr('Note an idea') + '" maxlength="500"><button class="btn small primary" id="ideaAdd">' + tr('Jot down') + '</button></div>' +
        '<input class="input" id="ideaTags" placeholder="' + tr('Tags, optional, comma-separated') + '">' +
        (open.length ? open.map((i) => '<div class="idea"><div>' + inline(i.text) + '</div><div class="meta">' + esc(i.id) + ', ' + esc(fmtDate(i.date)) + (i.tags.length ? ', ' + i.tags.map((x) => '#' + esc(x)).join(' ') : '') + '</div><div class="row"><select class="input" data-ity="' + esc(i.id) + '" style="flex:1">' + Object.entries(meta.typeLabel).map(([k, v]) => '<option value="' + k + '">' + esc(v) + '</option>').join('') + '</select><select class="input" data-ipr="' + esc(i.id) + '" style="flex:0 0 110px">' + PRIOS.map((p) => '<option' + (p === 'P3' ? ' selected' : '') + '>' + p + '</option>').join('') + '</select><button class="btn small" data-promote="' + esc(i.id) + '">' + tr('Turn into a task') + '</button><button class="btn small ghost danger" data-idrop="' + esc(i.id) + '">' + tr('Drop') + '</button></div></div>').join('') : '<p class="md empty-md">' + tr('No open ideas yet.') + '</p>') +
        (closed.length ? '<details class="sec"><summary>' + tr('Closed ideas') + ' <span class="meta">' + closed.length + '</span></summary><div class="body">' + closed.map((i) => '<div class="idea closed"><div>' + inline(i.text) + '</div><div class="meta">' + esc(i.id) + ', ' + esc(i.note || tr('closed')) + '</div></div>').join('') + '</div></details>' : '');
      const add = () => { const v = $('#ideaIn').value.trim(); if (!v) return; run(() => act('idea', { text: v, tags: $('#ideaTags').value }), tr('Idea noted')).then((r) => { if (r) renderSide(); }); };
      $('#ideaIn').onkeydown = (e) => { if (e.key === 'Enter') add(); };
      $('#ideaAdd').onclick = add;
      $$('[data-promote]', body).forEach((b) => b.onclick = async () => {
        const iid = b.dataset.promote;
        const r = await run(() => act('ideaPromote', { iid, type: $('[data-ity="' + iid + '"]', body).value, priority: $('[data-ipr="' + iid + '"]', body).value }), (x) => x.message);
        if (r) { renderSide(); if (r.id) pendingOpen = r.id; }
      });
      $$('[data-idrop]', body).forEach((b) => b.onclick = async () => {
        const reason = await askText({ title: tr('Drop idea'), label: tr('Reason, optional'), confirm: tr('Drop'), danger: true });
        if (reason === null) return;
        const r = await run(() => act('ideaDrop', { iid: b.dataset.idrop, reason }), tr('Idea dropped'));
        if (r) renderSide();
      });
    } else if (side === 'next') {
      let n;
      try { n = await api('GET', 'api/next'); } catch (e) { return fail(e); }
      body.innerHTML = head(tr('Next task')) +
        '<p class="md">' + tr('Suggestion based on priority, due dates, dependencies and effort. Blocked tasks are left out.') + '</p>' +
        (n.active.length ? '<div class="block"><div class="block-head"><h3>' + tr('Running now') + '</h3></div>' + n.active.map((t) => '<div class="cand"><div class="row"><span class="st" style="--c:' + statusVar(t.status) + '">' + esc(L(t.status)) + '</span><span class="tag">' + esc(t.priority) + '</span></div><button class="btn link" style="justify-content:flex-start;text-align:left" data-goto="' + esc(t.id) + '">' + esc(t.id + ' ' + t.title) + '</button></div>').join('') + '</div>' : '') +
        '<div class="block"><div class="block-head"><h3>' + tr('Suggestions') + '</h3></div>' + (n.candidates.length ? n.candidates.map((c, i) => '<div class="cand"><div class="t">' + esc(i === 0 ? tr('Recommended: {task}', { task: c.id + ' ' + c.title }) : c.id + ' ' + c.title) + '</div><div class="why">' + esc(c.reasons.join(', ')) + '</div><div class="row"><button class="btn small primary" data-start="' + esc(c.id) + '">' + tr('Start') + '</button><button class="btn small" data-goto="' + esc(c.id) + '">' + tr('View') + '</button></div></div>').join('') : '<p class="md empty-md">' + tr('Nothing startable in the backlog.') + '</p>') + '</div>';
      $$('[data-start]', body).forEach((b) => b.onclick = async () => { await requestMove(b.dataset.start, 'in-arbeit'); renderSide(); });
      $$('[data-goto]', body).forEach((b) => b.onclick = () => { closeSide(); openTask(b.dataset.goto); });
    } else if (side === 'knowledge') {
      return renderKnowledge(body, head);
    } else if (side === 'cleanup') {
      return renderCleanup(body, head);
    } else if (side === 'tools') {
      return renderTools(body, head);
    } else if (side === 'activity') {
      unseen = 0; renderCounts();
      body.innerHTML = head(tr('Activity')) +
        '<p class="md">' + tr('Changes since the board was opened, whether from Claude, the terminal or here in the board.') + '</p>' +
        (activity.length ? '<ol class="feed">' + activity.map((a) => '<li data-id="' + esc(a.id) + '" style="--cc:' + changeColor(a) + '"><span class="time">' + esc(a.date) + ' ' + esc(a.time) + (a.actor ? ', ' + esc(a.actor) : '') + '</span><span><strong>' + esc(a.id) + '</strong> ' + esc(a.title) + '</span><span class="flowline">' + flowHtml(a) + '</span>' + (a.why ? '<span class="why">' + esc(a.why) + '</span>' : '') + '</li>').join('') + '</ol><button class="btn small" id="actClear">' + tr('Clear list') + '</button>' : '<p class="md empty-md">' + tr('No changes yet.') + '</p>');
      $$('.feed li', body).forEach((li) => li.onclick = () => { closeSide(); focusCard(li.dataset.id); });
      const c = $('#actClear', body);
      if (c) c.onclick = () => { activity = []; store.set(actKey, activity); renderSide(); };
    }
    $$('[data-sclose]', body).forEach((b) => b.onclick = closeSide);
  }

  function flowHtml(c) {
    if (c.kind === 'moved') return '<span class="st" style="--c:' + statusVar(c.from) + '">' + esc(L(c.from)) + '</span> → <span class="st" style="--c:' + statusVar(c.to) + '">' + esc(L(c.to)) + '</span>';
    if (c.kind === 'added') return tr('New in {col}', { col: '<span class="st" style="--c:' + statusVar(c.to) + '">' + esc(L(c.to)) + '</span>' });
    return esc(changeLabel(c));
  }

  function focusCard(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (!match(t)) { if (t.archived || t.status === 'verworfen') state.closed = true; resetFilters(); }
    const el = $('.card[data-id="' + CSS.escape(id) + '"]');
    if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center', inline: 'center' });
    openTask(id);
  }

  // ---------- Live-Aktualisierung ----------

  const actKey = 'works-activity-' + meta.project;
  let activity = store.get(actKey, []);
  let unseen = 0;
  function renderCounts() {
    const c = $('#actCount');
    c.hidden = !unseen; c.textContent = unseen;
  }

  function diff(prev, next) {
    const before = new Map(prev.map((t) => [t.id, t]));
    const after = new Map(next.map((t) => [t.id, t]));
    const out = [];
    for (const t of next) {
      const o = before.get(t.id);
      const base = { id: t.id, title: t.title, why: (t.lastLog || '').replace(/ \[[^\]]+\]$/, ''), actor: /\[Board\]$/.test(t.lastLog || '') ? 'Board' : tr('Claude or terminal') };
      if (!o) out.push({ ...base, kind: 'added', to: t.status });
      else if (o.status !== t.status) out.push({ ...base, kind: 'moved', from: o.status, to: t.status });
      else if (!o.archived && t.archived) out.push({ ...base, kind: 'archived' });
      else if (o.priority !== t.priority) out.push({ ...base, kind: 'prio', from: o.priority, to: t.priority });
      else if (JSON.stringify(o) !== JSON.stringify(t)) out.push({ ...base, kind: 'updated' });
    }
    for (const o of prev) if (!after.has(o.id)) out.push({ id: o.id, title: o.title, kind: 'removed', why: '', actor: '' });
    return out;
  }

  function positions() {
    const m = new Map();
    $$('.card').forEach((el) => m.set(el.dataset.id, el.getBoundingClientRect()));
    return m;
  }
  function animateFrom(oldPos, moved) {
    if (reduceMotion) return;
    $$('.card').forEach((el) => {
      const was = oldPos.get(el.dataset.id);
      const now = el.getBoundingClientRect();
      if (!was) { el.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' }); return; }
      const dx = was.left - now.left; const dy = was.top - now.top;
      if (!dx && !dy) return;
      const big = moved.has(el.dataset.id);
      el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' + (big ? ' scale(1.02)' : ''), zIndex: 5 }, { transform: 'none', zIndex: 5 }], { duration: big ? 700 : 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
    });
  }

  let reloadPending = false;
  // Neuladen nach einem Update und Wechsel zum Hub (W-0057) warten, solange eine Eingabe ungespeichert offen ist, und
  // laufen, sobald sie gespeichert oder verworfen ist. Geprüft wird nach jedem Speichern (run) und jede Sekunde, damit
  // auch Abbrechen, Escape und Schließen zählen. Der Wechsel zum Hub geht vor, der Hub lädt ohnehin die neue Version.
  let afterSave = null;
  function whenSaved(fn, why, hub = false) {
    if (!dirty) { fn(); return; }
    if (afterSave && afterSave.hub && !hub) return;
    afterSave = { fn, why, hub };
    setLive(true, why);
  }
  function runWhenSaved() {
    if (!afterSave) return;
    if (dirty) { if (!$('#live').classList.contains('off')) setLive(true, afterSave.why); return; }
    const { fn } = afterSave;
    afterSave = null;
    fn();
  }
  function goToHub() { whenSaved(() => { location.href = '/hub'; }, tr('Another board started, the hub opens after saving'), true); }

  // Neue works-Version auf dem Server: Ansicht merken und Seite neu laden, damit Design und Skript aktuell sind.
  function reloadForUpdate() {
    if (dirty) { whenSaved(reloadForUpdate, tr('New version available, loads after saving')); return; }
    try {
      sessionStorage.setItem(UI_KEY, JSON.stringify({
        q: state.q, prios: [...state.prios], type: state.type, tag: state.tag, ms: state.ms, closed: state.closed, signal: state.signal, view: state.view,
        openId, side, scrollX: $('#board').scrollLeft, scrollY: window.scrollY,
      }));
    } catch (e) { /* privat */ }
    setLive(true, tr('Loading the new version'));
    location.reload();
  }

  // Verwaister Tab (W-0029): Das eigene Board ist beendet, auf seinem Port läuft jetzt ein anderes Projekt.
  // Statt es still anzuzeigen: Leiste oben, der letzte Stand bleibt ausgegraut und gesperrt. Die Verbindung wird
  // geschlossen, damit der Tab beim fremden Board nicht als offen zählt. Läuft das eigene Board wieder, geht es dorthin.
  function becomeOrphan(m) {
    if (orphan) return;
    orphan = true;
    if (liveSource) liveSource.close();
    setLive(false, tr('Another project on this port'));
    const bar = $('#orphanBar');
    const at = new Date().toLocaleTimeString(I18N.lang === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    const own = esc(meta.project);
    bar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0z"/><path d="M12 16v5"/><path d="M3 3l18 18"/></svg>' +
      '<p><b>' + tr('{project} is no longer running here.', { project: own }) + '</b> ' + tr('Port {port} now runs {other}.', { port: esc(location.port), other: esc(m.project) }) + '<small>' + tr('Below is the last state from {time}, view only.', { time: at }) + '</small></p>' +
      '<span class="orphan-acts">' + (EDIT ? '<button type="button" class="btn small primary" id="orphanStart">' + tr('Start {project}', { project: own }) + '</button><a class="btn small" href="/hub">' + tr('Go to the hub') + '</a>' : '') +
      '<a class="btn small ghost" href="/">' + tr('View {project}', { project: esc(m.project) }) + '</a></span>';
    bar.hidden = false;
    document.body.classList.add('orphan');
    for (const el of document.body.children) if (el !== bar && !/^(DIALOG|SCRIPT)$/.test(el.tagName)) el.inert = true;
    if (!EDIT) return;
    let info = null;
    const look = async () => {
      try { const r = await fetch('/boards', { cache: 'no-store' }); if (!r.ok) return; info = await r.json(); } catch (e) { return; }
      const mine = (info.boards || []).find((b) => b.id === ROOT_ID);
      if (mine) location.href = mine.url;
    };
    look();
    setInterval(look, 3000);
    $('#orphanStart').onclick = async (e) => {
      const b = e.currentTarget;
      const p = info && (info.projects || []).find((x) => x.id === ROOT_ID);
      if (!p) { b.disabled = true; b.textContent = tr('Start it in the project with works board --serve'); return; }
      b.disabled = true;
      b.textContent = tr('{project} is starting …', { project: meta.project });
      try { await fetch('/api/hub', { method: 'POST', headers: { 'X-Works-Token': info.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'start', path: p.path }) }); } catch (err) { /* look() meldet sich, sobald es läuft */ }
    };
  }

  async function reload() {
    if (orphan) return;
    // Während eine Karte gezogen wird, nicht neu zeichnen, sonst springt das Board unter dem Mauszeiger.
    if (dragId || qDrag || tlDrag) { reloadPending = true; return; }
    try {
      const res = await fetch('data.json', { cache: 'no-store' });
      const next = await res.json();
      if (isForeign(next.meta)) return becomeOrphan(next.meta);
      if (outdated(next.meta)) return reloadForUpdate();
      const found = diff(tasks, next.tasks);
      const now = new Date();
      const time = now.toLocaleTimeString(I18N.lang === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const date = now.toLocaleDateString(I18N.lang === 'de' ? 'de-DE' : 'en-GB');
      const arrived = new Set(); const moved = new Set();
      notifyChanges(tasks, next, found);
      for (const c of found) {
        Object.assign(c, { time, date, fresh: true, at: Date.now() });
        changes.set(c.id, c);
        if (c.kind === 'moved' || c.kind === 'added') { arrived.add(c.to); moved.add(c.id); }
        if (c.kind !== 'updated') {
          activity.unshift(c);
          if (side !== 'activity') unseen++;
          if (c.actor !== 'Board') toast('<div class="what">' + esc(c.id + ' ' + c.title) + '</div><div class="flowline">' + flowHtml(c) + '</div>' + (c.why ? '<div class="why">' + esc(c.why) + '</div>' : ''), '', () => focusCard(c.id), changeColor(c));
        }
      }
      activity = activity.slice(0, 150);
      if (found.some((c) => c.kind !== 'updated')) store.set(actKey, activity);
      const oldPos = positions();
      data = next; tasks = next.tasks; meta = next.meta; metaInfo = null;
      renderAll(arrived);
      animateFrom(oldPos, moved);
      renderCounts();
      if (arrived.size) setTimeout(() => $$('.col.arrive').forEach((c) => c.classList.remove('arrive')), 1400);
      if (openId && found.some((c) => c.id === openId)) {
        if (dirty) { staleDetail = true; } else await loadDetail();
      }
      if (pendingOpen && tasks.some((t) => t.id === pendingOpen)) { const id = pendingOpen; pendingOpen = null; openTask(id); }
      if (side === 'ideas' || side === 'next') renderSide();
      setLive(true, tr('Live, as of {time}', { time }));
    } catch (e) {
      setLive(false, tr('Update failed'));
    }
  }

  function setLive(okState, text) {
    const el = $('#live');
    el.hidden = false; el.classList.toggle('off', !okState); el.textContent = text;
  }

  // ---------- Ansichten ----------

  function setView(v) {
    if (!VIEWS.includes(v) || (v === 'live' && !LIVE)) return;
    state.view = v;
    store.set('works-view-' + meta.project, v);
    if (v !== 'table') { selected.clear(); }
    renderAll();
    const main = $('[data-only="' + v + '"].view, #board[data-only="' + v + '"]');
    if (main) window.scrollTo({ top: 0 });
  }

  function renderViews() {
    $$('[data-only]').forEach((el) => { el.hidden = !el.dataset.only.split(' ').includes(state.view); });
    $$('#views [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
    const qc = $('#queueCount');
    const n = (meta.queue || []).length;
    qc.hidden = !n; qc.textContent = n;
    if (state.view !== 'table') $('#bulk').hidden = true;
  }

  const byIdNow = () => new Map(tasks.map((t) => [t.id, t]));

  async function toggleQueue(id) {
    const inQ = (meta.queue || []).includes(id);
    await run(() => act(inQ ? 'queueRemove' : 'queueAdd', { id }), inQ ? tr('{id} removed from the queue', { id }) : tr('{id} added to the queue', { id }));
  }

  // ---------- Warteschlange ----------

  let qDrag = null;

  function renderQueue() {
    const box = $('#viewQueue');
    const byId = byIdNow();
    const ids = (meta.queue || []).filter((id) => byId.has(id));
    const q = ids.map((id) => byId.get(id));
    const s = meta.queueSettings || {};
    const running = tasks.filter((t) => t.status === 'in-arbeit' || t.status === 'review');
    const unlocks = (t) => tasks.filter((x) => OPEN.includes(x.status) && (x.blockedBy || []).includes(t.id)).length;
    const startable = (t) => ['backlog', 'geplant'].includes(t.status) && (s.skip_blocked === false || !t.blocked);
    const next = q.find(startable);
    const skipped = next ? q.slice(0, q.indexOf(next)).filter((t) => t.blocked) : [];
    const effort = {};
    const noEst = tr('without estimate');
    q.forEach((t) => { const e = t.effort || noEst; effort[e] = (effort[e] || 0) + 1; });
    const effortText = ['XL', 'L', 'M', 'S', noEst].filter((e) => effort[e]).map((e) => effort[e] + ' ' + e).join(', ') || tr('empty');
    const candidates = tasks.filter((t) => ['backlog', 'geplant'].includes(t.status) && !t.archived && !ids.includes(t.id))
      .sort((a, b) => PRIOS.indexOf(a.priority) - PRIOS.indexOf(b.priority) || a.id.localeCompare(b.id, 'de', { numeric: true }));

    const item = (t, i) => {
      const bits = [meta.typeLabel[t.type] || t.type];
      if (t.effort) bits.push(tr('Effort {effort}', { effort: t.effort }));
      if (t.milestone) bits.push(tr('Milestone {id}', { id: t.milestone }));
      if (t.due) bits.push(tr('due {date}', { date: fmtDate(t.due) }));
      let hint = '';
      if (t.blocked) hint = '<span class="q-hint bad">' + esc(tr('waiting for {ids}', { ids: t.blockers.join(', ') })) + '</span>';
      else if (unlocks(t)) hint = '<span class="q-hint good">' + tr('unblocks {n}', { n: unlocks(t) }) + '</span>';
      else if (t.status === 'in-arbeit' || t.status === 'review') hint = '<span class="q-hint" style="color:' + statusVar(t.status) + '">' + esc(L(t.status)) + '</span>';
      else if (t.status === 'geplant') hint = '<span class="q-hint">' + tr('planned') + '</span>';
      return '<li class="q-item' + (t === next ? ' is-next' : '') + (t.blocked ? ' is-blocked' : '') + '" data-id="' + esc(t.id) + '"' + (EDIT ? ' draggable="true"' : '') + '>' +
        (EDIT ? '<span class="grip" aria-hidden="true">⋮⋮</span>' : '') +
        '<span class="q-pos num">' + (i + 1) + '</span>' +
        '<div class="q-t"><button class="q-title" data-open="' + esc(t.id) + '"><span class="id num">' + esc(t.id) + '</span> ' + esc(t.title) + '</button><span class="q-meta">' + esc(bits.join(', ')) + '</span></div>' +
        hint + '<span class="q-prio" style="color:' + prioVar(t.priority) + '">' + esc(t.priority) + '</span>' +
        (EDIT ? '<span class="q-ctl"><button class="btn small ghost icon" data-up="' + i + '" aria-label="' + tr('Move up') + '"' + (i === 0 ? ' disabled' : '') + '>↑</button><button class="btn small ghost icon" data-down="' + i + '" aria-label="' + tr('Move down') + '"' + (i === q.length - 1 ? ' disabled' : '') + '>↓</button><button class="btn small ghost icon" data-unq="' + esc(t.id) + '" aria-label="' + tr('Remove from the queue') + '" title="' + tr('Remove from the queue') + '">×</button></span>' : '') +
        '</li>';
    };
    const toggle = (key, label, sub, on, disabled) => '<label class="switch' + (disabled ? ' off' : '') + '"><span><b>' + esc(label) + '</b><small>' + esc(sub) + '</small></span><input type="checkbox" data-qset="' + key + '"' + (on ? ' checked' : '') + (disabled || !EDIT ? ' disabled' : '') + '><i aria-hidden="true"></i></label>';

    box.innerHTML = '<div class="q-wrap">' +
      '<section class="q-main">' +
        '<div class="q-head"><h2>' + tr('Queue for Claude') + '</h2><p>' + tr('Claude works through these tasks in exactly this order, before any other suggestions.') + (EDIT ? ' ' + tr('Drag to reorder or use the arrows.') : '') + '</p></div>' +
        running.map((t) => '<button class="q-running" data-open="' + esc(t.id) + '" style="--c:' + statusVar(t.status) + '"><span class="q-run-ic" aria-hidden="true">▶</span><span class="q-t"><small>' + (t.status === 'review' ? tr('In review') : tr('Running now')) + '</small><strong>' + esc(t.id + ' ' + t.title) + '</strong></span>' + (t.crit[1] ? '<span class="q-meta num">' + tr('{a} of {b} criteria', { a: t.crit[0], b: t.crit[1] }) + '</span>' : '') + '</button>').join('') +
        (q.length ? '<ol class="q-list" id="qList">' + q.map(item).join('') + '</ol>'
          : '<div class="q-empty"><strong>' + tr('The queue is empty.') + '</strong><span>' + (EDIT ? tr('Queue tasks below, click Add to queue in the detail panel or select several in the table.') : tr('The owner of the board has not queued anything yet.')) + ' ' + tr('Without a queue, Claude picks by itself based on priority, due dates and dependencies.') + '</span></div>') +
        (EDIT ? '<div class="q-add"><select class="input" id="qAddSel" aria-label="' + tr('Task to queue') + '"><option value="">' + tr('Queue a task …') + '</option>' + candidates.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.priority + '  ' + t.id + '  ' + t.title) + '</option>').join('') + '</select><button class="btn" id="qAddBtn">' + tr('Add to queue') + '</button>' + (q.length ? '<button class="btn ghost" id="qClear">' + tr('Clear') + '</button>' : '') + '</div>' : '') +
      '</section>' +
      '<aside class="q-side">' +
        '<h3>' + tr('Workflow') + '</h3>' +
        toggle('auto_next', tr('Continue after completing'), tr('Claude then starts the next task in the queue.'), !!s.auto_next) +
        toggle('ask_before', tr('Ask before each start'), tr('Claude checks with you briefly before starting the next one.'), s.ask_before !== false, !s.auto_next) +
        toggle('skip_blocked', tr('Skip blocked tasks'), tr('Waiting tasks stay put until their dependency is done.'), s.skip_blocked !== false) +
        '<div class="q-card"><small>' + tr('Next for Claude') + '</small>' + (next ? '<button class="q-title" data-open="' + esc(next.id) + '"><strong>' + esc(next.id + ' ' + next.title) + '</strong></button>' + (skipped.length ? '<span>' + esc(skipped.length === 1 ? tr('{ids} is skipped until the dependency is done.', { ids: skipped[0].id }) : tr('{ids} are skipped until the dependency is done.', { ids: skipped.map((x) => x.id).join(', ') })) + '</span>' : '') : '<span>' + (q.length ? tr('Nothing startable. All entries are waiting for other tasks.') : tr('Claude picks by itself with works next.')) + '</span>') + '</div>' +
        '<div class="q-card row"><span>' + tr('Effort in the queue') + '</span><strong class="num">' + esc(effortText) + '</strong></div>' +
        '<div class="q-card"><small>' + tr('How to use it') + '</small><span>' + tr('Tell Claude, for example, <q>Work through the queue</q>. Claude sees the order at session start and in <code>works next</code>. Finished tasks drop out automatically.') + '</span></div>' +
      '</aside></div>';

    $$('[data-open]', box).forEach((b) => b.onclick = () => openTask(b.dataset.open));
    if (!EDIT) return;
    const save = (order, msg) => {
      meta.queue = order;
      renderQueue(); renderViews();
      run(() => act('queueOrder', { ids: order }), msg);
    };
    $$('[data-up]', box).forEach((b) => b.onclick = () => { const i = +b.dataset.up; const o = ids.slice(); [o[i - 1], o[i]] = [o[i], o[i - 1]]; save(o, tr('Order saved')); });
    $$('[data-down]', box).forEach((b) => b.onclick = () => { const i = +b.dataset.down; const o = ids.slice(); [o[i + 1], o[i]] = [o[i], o[i + 1]]; save(o, tr('Order saved')); });
    $$('[data-unq]', box).forEach((b) => b.onclick = () => save(ids.filter((x) => x !== b.dataset.unq), tr('{id} removed from the queue', { id: b.dataset.unq })));
    const addBtn = $('#qAddBtn', box);
    if (addBtn) addBtn.onclick = () => { const v = $('#qAddSel', box).value; if (v) save(ids.concat(v), tr('{id} added to the queue', { id: v })); };
    const clr = $('#qClear', box);
    if (clr) clr.onclick = async () => { if (await confirmBox({ title: tr('Clear queue'), lead: tr('All {n} entries will be removed. The tasks themselves stay unchanged.', { n: ids.length }), confirm: tr('Clear'), danger: true })) save([], tr('Queue cleared')); };
    $$('[data-qset]', box).forEach((c) => c.onchange = () => {
      meta.queueSettings = { ...s, [c.dataset.qset]: c.checked };
      renderQueue();
      run(() => act('queueSettings', { [c.dataset.qset]: c.checked }), tr('Setting saved'));
    });
    const list = $('#qList', box);
    if (!list) return;
    $$('.q-item', list).forEach((li) => {
      li.ondragstart = (e) => { qDrag = li.dataset.id; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', qDrag); };
      li.ondragend = () => { qDrag = null; li.classList.remove('dragging'); $$('.q-item', list).forEach((x) => x.classList.remove('before', 'after')); if (reloadPending) { reloadPending = false; reload(); } };
      li.ondragover = (e) => {
        if (!qDrag || qDrag === li.dataset.id) return;
        e.preventDefault();
        const r = li.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        $$('.q-item', list).forEach((x) => x.classList.remove('before', 'after'));
        li.classList.add(after ? 'after' : 'before');
      };
      li.ondrop = (e) => {
        e.preventDefault();
        if (!qDrag || qDrag === li.dataset.id) return;
        const after = li.classList.contains('after');
        const o = ids.filter((x) => x !== qDrag);
        o.splice(o.indexOf(li.dataset.id) + (after ? 1 : 0), 0, qDrag);
        qDrag = null;
        save(o, tr('Order saved'));
      };
    });
  }

  // ---------- Zeitleiste ----------

  const EFFORT_DAYS = { S: 2, M: 5, L: 10, XL: 15 };
  const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  const minIso = (a, b) => (a < b ? a : b);
  const maxIso = (a, b) => (a > b ? a : b);
  function weekStart(iso) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('sv-SE'); }
  function isoWeek(iso) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  }

  // Zeitraum je Aufgabe: echte Daten, wo es sie gibt, sonst eine Schätzung aus dem Aufwand.
  function spansFor(list) {
    const now = today();
    const byId = byIdNow();
    const memo = new Map();
    const span = (t, depth = 0) => {
      if (memo.has(t.id)) return memo.get(t.id);
      const dur = (meta.effortDays || EFFORT_DAYS)[t.effort] || (meta.effortDays || EFFORT_DAYS).M || 5;
      let r;
      if (t.status === 'erledigt') {
        const end = t.completed || t.updated || now;
        const start = minIso(t.started || t.created || end, end);
        r = { start, end, kind: 'done' };
      } else if (t.status === 'in-arbeit' || t.status === 'review') {
        const start = t.started || t.created || now;
        let end = t.due || addDays(maxIso(start, now), Math.max(1, dur - Math.max(0, dayDiff(start, now))));
        r = { start: minIso(start, end), end, kind: t.overdue ? 'late' : 'run' };
      } else {
        let start = now;
        if (t.blocked && depth < 8) {
          for (const b of t.blockers) { const o = byId.get(b); if (o) start = maxIso(start, addDays(span(o, depth + 1).end, 1)); }
        }
        if (t.due) {
          const s0 = addDays(t.due, -dur);
          r = { start: t.overdue ? s0 : minIso(maxIso(s0, now), t.due), end: t.due, kind: t.overdue ? 'late' : 'plan', fixed: true };
        } else r = { start, end: addDays(start, dur), kind: 'est' };
      }
      if (r.end < r.start) r.end = r.start;
      memo.set(t.id, r);
      return r;
    };
    return new Map(list.map((t) => [t.id, span(t)]));
  }

  let tlDrag = null;

  function renderTimeline() {
    const box = $('#viewTimeline');
    const now = today();
    const list = tasks.filter((t) => match(t) && t.status !== 'verworfen');
    const spans = spansFor(list);
    const start = addDays(weekStart(now), -7);
    let last = addDays(weekStart(now), 7 * 8 - 1);
    for (const sp of spans.values()) last = maxIso(last, sp.end);
    for (const m of meta.milestones) if (m.due) last = maxIso(last, m.due);
    last = minIso(last, addDays(start, 7 * 26 - 1));
    const weeks = Math.ceil((dayDiff(start, last) + 1) / 7);
    const total = weeks * 7;
    const frac = (iso) => Math.max(0, Math.min(1, dayDiff(start, iso) / total));
    const pct = (x) => (x * 100).toFixed(3) + '%';
    const visible = list.filter((t) => spans.get(t.id).end >= start);
    const hiddenOld = list.length - visible.length;

    const groups = meta.milestones.map((m) => ({ m, items: visible.filter((t) => t.milestone === m.id) })).filter((g) => g.items.length);
    const rest = visible.filter((t) => !t.milestone || !meta.milestones.some((m) => m.id === t.milestone));
    if (rest.length) groups.push({ m: null, items: rest });
    const order = { late: 0, run: 1, plan: 2, est: 3, done: 4 };
    const weekHead = Array.from({ length: weeks }, (_, i) => {
      const ws = addDays(start, i * 7);
      const cur = ws === weekStart(now);
      return '<div class="tl-wk' + (cur ? ' cur' : '') + '"><b>' + tr('Wk {n}', { n: isoWeek(ws) }) + '</b><span>' + esc(fmtDate(ws).slice(0, 6)) + '</span></div>';
    }).join('');

    const bar = (t) => {
      const sp = spans.get(t.id);
      const l = frac(sp.start);
      const r = frac(addDays(sp.end, 1));
      const days = dayDiff(sp.start, sp.end) + 1;
      const label = days <= 3 ? (sp.kind === 'est' ? t.effort || '' : '') : sp.kind === 'done' ? tr('Done') : sp.kind === 'late' ? tr('Overdue') : sp.kind === 'est' ? tr('estimated') + (t.effort ? ', ' + t.effort : '') : t.status === 'in-arbeit' || t.status === 'review' ? L(t.status) + (t.crit[1] ? ', ' + tr('{a} of {b}', { a: t.crit[0], b: t.crit[1] }) : '') : L(t.status);
      const tip = t.id + ' ' + t.title + '\n' + tr('{from} to {to}', { from: fmtDate(sp.start), to: fmtDate(sp.end) }) + (sp.kind === 'est' ? ' ' + tr('(estimated from effort {effort})', { effort: t.effort || 'M' }) : '') + (t.blocked ? '\n' + tr('Waiting for {ids}', { ids: t.blockers.join(', ') }) : '');
      const canDrag = EDIT && OPEN.includes(t.status);
      return '<div class="tl-bar k-' + sp.kind + '" data-bar="' + esc(t.id) + '" style="left:' + pct(l) + ';width:max(' + pct(r - l) + ',6px);--c:' + statusVar(t.status) + '" title="' + esc(tip) + '"><span>' + esc(label) + '</span>' +
        (canDrag ? '<i class="tl-handle" data-due="' + esc(t.id) + '" title="' + tr('Drag to change the due date') + '"></i>' : '') + '</div>' +
        (t.blocked ? '<span class="tl-wait" style="left:calc(' + pct(r) + ' + 8px)">' + esc(tr('waiting for {ids}', { ids: t.blockers.join(', ') })) + '</span>' : '');
    };

    const group = (g) => {
      const items = g.items.slice().sort((a, b) => order[spans.get(a.id).kind] - order[spans.get(b.id).kind] || spans.get(a.id).start.localeCompare(spans.get(b.id).start));
      const m = g.m;
      const done = m ? m.done : 0;
      const line = m && m.due && m.due >= start && m.due <= last ? '<div class="tl-ms" style="left:calc(var(--lab) + (100% - var(--lab)) * ' + frac(addDays(m.due, 1)).toFixed(4) + ')" title="' + esc(tr('Target {id}: {date}', { id: m.id, date: fmtDate(m.due) })) + '"></div>' : '';
      return '<div class="tl-group">' + line +
        '<div class="tl-ghead"><strong>' + esc(m ? m.id + ' ' + m.title : tr('No milestone')) + '</strong><span>' + (m ? (m.due ? esc(tr('Target {date}', { date: fmtDate(m.due) })) + ', ' : '') + tr('{done} of {total} done', { done, total: m.total }) : (items.length === 1 ? tr('1 task') : tr('{n} tasks', { n: items.length }))) + '</span></div>' +
        items.map((t) => '<div class="tl-row' + (t.status === 'erledigt' ? ' is-done' : '') + '"><button class="tl-label" data-open="' + esc(t.id) + '"><span class="pdot" style="--pc:' + prioVar(t.priority) + '"></span><span class="id num">' + esc(t.id) + '</span><span class="tt">' + esc(t.title) + '</span></button><div class="tl-track">' + bar(t) + '</div></div>').join('') +
        '</div>';
    };

    box.innerHTML = (LIVE ? '<div id="estBox"></div>' : '') + '<div class="tl-scroll"><div class="tl" style="--weeks:' + weeks + ';min-width:calc(var(--lab) + ' + weeks + ' * 84px)">' +
      '<div class="tl-headrow"><div class="tl-corner">' + tr('Task') + '</div><div class="tl-weeks">' + weekHead + '</div></div>' +
      '<div class="tl-body"><div class="tl-grid" aria-hidden="true">' + Array.from({ length: weeks }, (_, i) => '<i' + (addDays(start, i * 7) === weekStart(now) ? ' class="cur"' : '') + '></i>').join('') + '</div>' +
      '<div class="tl-today" style="left:calc(var(--lab) + (100% - var(--lab)) * ' + frac(now).toFixed(4) + ')" title="' + tr('Today') + '" data-today="' + esc(tr('today')) + '"></div>' +
      (groups.length ? groups.map(group).join('') : '<div class="tl-empty">' + tr('No tasks for these filters.') + '</div>') +
      '</div></div></div>' +
      '<div class="tl-legend"><span><i class="lg-today"></i>' + tr('today') + '</span><span><i class="lg-ms"></i>' + tr('Milestone target') + '</span><span><i class="lg-run"></i>' + tr('running or done') + '</span><span><i class="lg-plan"></i>' + tr('planned with due date') + '</span><span><i class="lg-est"></i>' + tr('estimated from effort') + '</span>' +
      (EDIT ? '<span>' + tr('Drag the right end of a bar to change the due date.') + '</span>' : '') +
      (hiddenOld ? '<span>' + tr('{n} older done tasks hidden', { n: hiddenOld }) + '</span>' : '') + '</div>';

    $$('[data-open]', box).forEach((b) => b.onclick = () => openTask(b.dataset.open));
    loadEstimates();
    $$('[data-bar]', box).forEach((b) => b.onclick = (e) => { if (e.target.closest('.tl-handle') || tlDrag) return; openTask(b.dataset.bar); });
    if (!EDIT) return;
    $$('.tl-handle', box).forEach((h) => {
      h.onpointerdown = (e) => {
        e.preventDefault(); e.stopPropagation();
        const barEl = h.parentElement;
        const track = barEl.parentElement.getBoundingClientRect();
        const left = barEl.getBoundingClientRect().left;
        const id = h.dataset.due;
        h.setPointerCapture(e.pointerId);
        tlDrag = { id, due: null };
        barEl.classList.add('resizing');
        const sp = spans.get(id);
        h.onpointermove = (ev) => {
          const x = Math.max(left + 4, Math.min(track.right, ev.clientX));
          const day = Math.round(((x - track.left) / track.width) * total) - 1;
          const due = maxIso(addDays(start, day), sp.start);
          tlDrag.due = due;
          barEl.style.width = Math.max(6, ((dayDiff(start, due) + 1) / total) * track.width - (left - track.left)) + 'px';
          barEl.firstChild.textContent = tr('Due {date}', { date: fmtDate(due) });
        };
        h.onpointerup = async () => {
          h.onpointermove = null; h.onpointerup = null;
          const due = tlDrag && tlDrag.due;
          const t = tasks.find((x) => x.id === id);
          setTimeout(() => { tlDrag = null; }, 0);
          barEl.classList.remove('resizing');
          if (!due || (t && t.due === due)) { renderTimeline(); return; }
          await run(() => act('set', { id, fields: { due } }), tr('{id} due on {date}', { id, date: fmtDate(due) }));
          if (reloadPending) { reloadPending = false; reload(); }
        };
      };
    });
  }

  // ---------- Tabelle ----------

  const selected = new Set();
  let lastPick = null;
  const tableSort = store.get('works-table-sort', { key: 'priority', dir: 1 });
  const TABLE_COLS = [
    { key: 'id', label: 'ID' },
    { key: 'title', label: tr('Title') },
    { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Prio' },
    { key: 'type', label: tr('Type') },
    { key: 'effort', label: tr('Effort') },
    { key: 'due', label: tr('Due') },
    { key: 'milestone', label: tr('Milestone') },
    { key: 'tags', label: 'Tags' },
    { key: 'crit', label: tr('Criteria') },
    { key: 'updated', label: tr('Last changed') },
  ];
  function sortValue(t, k) {
    if (k === 'priority') return PRIOS.indexOf(t.priority);
    if (k === 'status') return COLS.indexOf(t.status);
    if (k === 'effort') return t.effort ? ['S', 'M', 'L', 'XL'].indexOf(t.effort) : 9;
    if (k === 'due') return t.due || '9999';
    if (k === 'crit') return t.crit[1] ? t.crit[0] / t.crit[1] : -1;
    if (k === 'tags') return t.tags.join(',');
    if (k === 'type') return meta.typeLabel[t.type] || t.type;
    return String(t[k] || '');
  }
  function tableRows() {
    const k = tableSort.key; const dir = tableSort.dir;
    return tasks.filter(match).sort((a, b) => {
      const x = sortValue(a, k); const y = sortValue(b, k);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'de', { numeric: true });
      return c * dir || a.id.localeCompare(b.id, 'de', { numeric: true });
    });
  }

  function renderTable() {
    const box = $('#viewTable');
    const rows = tableRows();
    const ids = rows.map((t) => t.id);
    for (const id of [...selected]) if (!ids.includes(id)) selected.delete(id);
    const all = rows.length && rows.every((t) => selected.has(t.id));
    const optList = (vals, cur, labelFn) => vals.map((v) => '<option value="' + esc(v) + '"' + (v === (cur || '') ? ' selected' : '') + '>' + esc(labelFn ? labelFn(v) : v || tr('not set')) + '</option>').join('');
    const cell = (t, k) => {
      const open = OPEN.includes(t.status);
      if (k === 'id') return '<td class="c-id num">' + esc(t.id) + '</td>';
      if (k === 'title') return '<td class="c-title"><button class="tt" data-open="' + esc(t.id) + '">' + esc(t.title) + '</button>' + (t.blocked ? '<span class="warn">' + tr('blocked') + '</span>' : '') + ((meta.queue || []).includes(t.id) ? '<span class="q-tag tag">' + tr('Queue {n}', { n: (meta.queue || []).indexOf(t.id) + 1 }) + '</span>' : '') + '</td>';
      if (k === 'status') return '<td><span class="st" style="--c:' + statusVar(t.status) + '">' + esc(L(t.status)) + '</span></td>';
      if (k === 'priority') return '<td>' + (EDIT && open ? '<select class="cell" data-cell="priority" data-id="' + esc(t.id) + '" style="color:' + prioVar(t.priority) + '" aria-label="' + tr('Priority') + '">' + optList(PRIOS, t.priority) + '</select>' : '<span style="color:' + prioVar(t.priority) + ';font-weight:650">' + esc(t.priority) + '</span>') + '</td>';
      if (k === 'type') return '<td>' + esc(meta.typeLabel[t.type] || t.type) + '</td>';
      if (k === 'effort') return '<td>' + (EDIT && open ? '<select class="cell" data-cell="effort" data-id="' + esc(t.id) + '" aria-label="' + tr('Effort') + '">' + optList(['', 'S', 'M', 'L', 'XL'], t.effort) + '</select>' : esc(t.effort || '')) + '</td>';
      if (k === 'due') return '<td class="' + (t.overdue ? 'late' : '') + '">' + (EDIT && open ? '<input type="date" class="cell" data-cell="due" data-id="' + esc(t.id) + '" value="' + esc(t.due) + '" aria-label="' + tr('Due date') + '">' : esc(fmtDate(t.due))) + '</td>';
      if (k === 'milestone') return '<td>' + esc(t.milestone) + '</td>';
      if (k === 'tags') return '<td class="c-tags">' + t.tags.map((x) => '<span class="tag">#' + esc(x) + '</span>').join('') + '</td>';
      if (k === 'crit') return '<td class="num">' + (t.crit[1] ? t.crit[0] + '/' + t.crit[1] : '') + '</td>';
      if (k === 'updated') return '<td class="num muted">' + esc(fmtDate(t.updated)) + '</td>';
      return '<td></td>';
    };
    box.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      (EDIT ? '<th class="c-sel"><input type="checkbox" id="selAll" aria-label="' + tr('Select all') + '"' + (all ? ' checked' : '') + '></th>' : '') +
      TABLE_COLS.map((c) => '<th><button data-sort="' + c.key + '" aria-sort="' + (tableSort.key === c.key ? (tableSort.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' + esc(c.label) + (tableSort.key === c.key ? '<span aria-hidden="true">' + (tableSort.dir > 0 ? ' ↑' : ' ↓') + '</span>' : '') + '</button></th>').join('') +
      '</tr></thead><tbody>' +
      (rows.length ? rows.map((t) => '<tr data-id="' + esc(t.id) + '" class="' + (selected.has(t.id) ? 'sel' : '') + (OPEN.includes(t.status) ? '' : ' closed') + '">' + (EDIT ? '<td class="c-sel"><input type="checkbox" data-sel="' + esc(t.id) + '"' + (selected.has(t.id) ? ' checked' : '') + ' aria-label="' + esc(tr('Select {id}', { id: t.id })) + '"></td>' : '') + TABLE_COLS.map((c) => cell(t, c.key)).join('') + '</tr>').join('')
        : '<tr><td colspan="12" class="tbl-empty">' + tr('No tasks for these filters.') + '</td></tr>') +
      '</tbody></table></div>' +
      '<p class="tbl-foot">' + (rows.length === 1 ? tr('1 task') : tr('{n} tasks', { n: rows.length })) + (EDIT ? '. ' + tr('Shift-click selects a range. Priority, effort and due date can be changed directly.') : '') + '</p>';

    $$('[data-sort]', box).forEach((b) => b.onclick = () => {
      const k = b.dataset.sort;
      if (tableSort.key === k) tableSort.dir *= -1; else { tableSort.key = k; tableSort.dir = 1; }
      store.set('works-table-sort', tableSort);
      renderTable();
    });
    $$('[data-open]', box).forEach((b) => b.onclick = () => openTask(b.dataset.open));
    $$('tbody tr[data-id]', box).forEach((row) => row.ondblclick = (e) => { if (!e.target.closest('input,select,button')) openTask(row.dataset.id); });
    if (EDIT) {
      $('#selAll', box).onchange = (e) => { rows.forEach((t) => (e.target.checked ? selected.add(t.id) : selected.delete(t.id))); renderTable(); };
      $$('[data-sel]', box).forEach((c) => c.onclick = (e) => {
        const id = c.dataset.sel;
        if (e.shiftKey && lastPick && ids.includes(lastPick)) {
          const [a, b] = [ids.indexOf(lastPick), ids.indexOf(id)].sort((x, y) => x - y);
          ids.slice(a, b + 1).forEach((x) => (c.checked ? selected.add(x) : selected.delete(x)));
        } else if (c.checked) selected.add(id); else selected.delete(id);
        lastPick = id;
        renderTable();
      });
      $$('[data-cell]', box).forEach((el) => el.onchange = () => run(() => act('set', { id: el.dataset.id, fields: { [el.dataset.cell]: el.value } }), tr('{id} saved', { id: el.dataset.id })));
    }
    renderBulk();
  }

  function renderBulk() {
    const bar = $('#bulk');
    if (!EDIT || state.view !== 'table' || !selected.size) { bar.hidden = true; return; }
    bar.hidden = false;
    const ids = [...selected];
    const n = ids.length;
    const sel = (op, label, opts) => '<select class="input" data-bulk="' + op + '" aria-label="' + esc(label) + '"><option value="">' + esc(label) + '</option>' + opts.map((o) => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join('') + '</select>';
    bar.innerHTML = '<strong class="num">' + tr('{n} selected', { n }) + '</strong>' +
      sel('priority', tr('Priority'), PRIOS.map((p) => [p, p + ' ' + meta.prioLabel[p]])) +
      sel('status', 'Status', ['backlog', 'geplant', 'in-arbeit', 'review'].map((s) => [s, L(s)])) +
      sel('milestone', tr('Milestone'), [['__none', tr('None')]].concat(meta.milestones.map((m) => [m.id, m.id + ' ' + m.title]))) +
      sel('effort', tr('Effort'), ['S', 'M', 'L', 'XL'].map((e) => [e, e])) +
      '<button class="btn small" data-bop="tagAdd">Tag +</button><button class="btn small" data-bop="tagRemove">Tag −</button>' +
      '<button class="btn small" data-bop="queueAdd">' + tr('Add to queue') + '</button>' +
      '<button class="btn small danger" data-bop="drop">' + tr('Discard') + '</button><button class="btn small" data-bop="archive">' + tr('Archive') + '</button>' +
      '<button class="btn small ghost" data-bop="clear">' + tr('Clear selection') + '</button>';
    const go = async (op, value, reason) => {
      const r = await run(() => act('bulk', { ids, op, value, reason }), (x) => x.message);
      if (r && !(r.errors || []).length) selected.clear();
      renderTable();
    };
    $$('[data-bulk]', bar).forEach((s) => s.onchange = () => {
      const v = s.value; if (!v) return;
      go(s.dataset.bulk, v === '__none' ? '' : v);
    });
    $$('[data-bop]', bar).forEach((b) => b.onclick = async () => {
      const op = b.dataset.bop;
      if (op === 'clear') { selected.clear(); renderTable(); return; }
      if (op === 'tagAdd' || op === 'tagRemove') {
        const tag = await askText({ title: op === 'tagAdd' ? tr('Add tag') : tr('Remove tag'), lead: n === 1 ? tr('1 task') : tr('{n} tasks', { n }), label: tr('Tag without #'), confirm: op === 'tagAdd' ? tr('Add') : tr('Remove'), required: true });
        if (tag) go(op, tag.replace(/^#/, ''));
        return;
      }
      if (op === 'drop') {
        const reason = await askText({ title: n === 1 ? tr('Discard 1 task') : tr('Discard {n} tasks', { n }), lead: tr('They will not be implemented and can be reopened later.'), label: tr('Reason for discarding'), confirm: tr('Discard'), required: true, danger: true });
        if (reason) go(op, '', reason);
        return;
      }
      go(op);
    });
  }

  // ---------- Code und Commits im Detailpanel ----------

  async function loadCode(id) {
    const box = $('#codeBox');
    let c;
    try { c = await api('GET', 'api/code?id=' + encodeURIComponent(id)); } catch (e) { if (box) box.innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; return; }
    if (!box || !detail || detail.task.id !== id || detailTab !== 'code') return;
    if (!c.git) { box.innerHTML = '<div class="alert info">' + tr('This project is not a Git repository. The code tab shows branch, commits and changes once Git is used.') + '</div>'; return; }
    const safeUrl = (u) => (/^https?:\/\//.test(u || '') ? u : '');
    const pr = c.pr && safeUrl(c.pr.url) ? '<a href="' + esc(c.pr.url) + '" target="_blank" rel="noopener">#' + esc(c.pr.number) + ' ' + esc({ OPEN: tr('open'), MERGED: tr('merged'), CLOSED: tr('closed unmerged') }[c.pr.state] || c.pr.state) + '</a>' : '<span class="muted">' + tr('none found') + '</span>';
    const fileRow = (f, unc) => '<li><button class="file" data-file="' + esc(f.file) + '"' + (unc ? ' data-unc="1"' : '') + ' aria-expanded="false"><span class="fn">' + esc(f.file) + '</span>' + (f.untracked ? '<span class="muted">' + tr('new') + '</span>' : f.binary ? '<span class="muted">' + tr('binary') + '</span>' : '<span class="add num">+' + f.add + '</span><span class="del num">−' + f.del + '</span>') + '</button><div class="diff" hidden></div></li>';
    box.innerHTML =
      '<div class="code-cards">' +
        '<div><small>Branch</small><strong class="mono">' + (c.branch ? esc(c.branch) : '<span class="muted">' + esc(tr('none with {id} in its name', { id })) + '</span>') + '</strong></div>' +
        '<div><small>' + esc(tr('Compared with {base}', { base: c.base || tr('main branch') })) + '</small><strong>' + (c.ahead === null ? '<span class="muted">' + tr('not comparable') + '</span>' : (c.ahead === 1 ? tr('1 commit ahead') : tr('{n} commits ahead', { n: c.ahead })) + (c.behind ? ', ' + tr('{n} behind', { n: c.behind }) : '')) + '</strong></div>' +
        '<div><small>Pull Request</small><strong>' + ((detail.prs || []).length ? detail.prs.slice(0, 3).map((p) => (/^https?:/.test(p.url || '') ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">#' + p.number + '</a>' : '#' + p.number) + ' ' + esc({ OPEN: tr('open'), MERGED: tr('merged'), CLOSED: tr('closed unmerged') }[p.state] || p.state) + (p.ci ? ', CI ' + (p.ci === 'ok' ? tr('green') : p.ci === 'fail' ? tr('red') : tr('running')) : '')).join('<br>') : pr) + '</strong></div>' +
      (detail.lane ? '<div><small>' + tr('Parallel in a worktree') + '</small><strong class="mono">' + esc(detail.lane.path.split(/[\\/]/).pop()) + '</strong><span class="muted">' + (detail.lane.ahead === 1 ? tr('1 commit') : tr('{n} commits', { n: detail.lane.ahead })) + ', ' + (detail.lane.dirty ? tr('{n} files uncommitted', { n: detail.lane.dirty }) : tr('everything committed')) + (detail.lane.status === 'konflikt' ? ', ' + tr('merge conflict') : '') + '</span></div>' : '') +
      '</div>' +
      fileLinksHtml(detail.fileLinks) +
      '<div class="block"><div class="block-head"><h3>Commits</h3><span class="meta">' + esc(tr('with {id} in the message', { id })) + '</span></div>' +
        (c.commits.length ? '<ol class="commits">' + c.commits.map((k) => '<li><span class="mono hash">' + esc(k.short) + '</span><span class="subj">' + esc(k.subject) + '</span><time class="muted num" datetime="' + esc(k.date) + '">' + esc(new Date(k.date).toLocaleString(I18N.lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</time></li>').join('') + '</ol>'
          : '<p class="md empty-md">' + tr('No commits found yet. Claude puts the task ID in every commit message, for example {example}.', { example: '<code>feat(' + esc(id) + '): …</code>' }) + '</p>') + '</div>' +
      (c.uncommitted.length ? '<div class="block"><div class="block-head"><h3>' + tr('Not committed yet') + '</h3><span class="meta">' + esc(tr('on {branch}', { branch: c.branch })) + '</span></div><ul class="files">' + c.uncommitted.map((f) => fileRow(f, true)).join('') + '</ul></div>' : '') +
      '<div class="block"><div class="block-head"><h3>' + tr('Changed files') + '</h3><span class="meta">' + (c.source === 'branch' ? esc(tr('Branch compared with {base}', { base: c.base })) : c.source === 'commits' ? tr('from the commits') : '') + '</span></div>' +
        (c.files.length ? '<ul class="files">' + c.files.map((f) => fileRow(f, false)).join('') + '</ul>' : '<p class="md empty-md">' + tr('No changes found.') + '</p>') + '</div>';
    $$('[data-open]', box).forEach((b) => b.onclick = () => openTask(b.dataset.open));
    $$('.file', box).forEach((b) => b.onclick = async () => {
      const d = b.nextElementSibling;
      const open = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', String(!open));
      d.hidden = open;
      if (open || d.dataset.loaded) return;
      d.innerHTML = '<p class="muted">' + tr('Loading …') + '</p>';
      try {
        const r = await api('GET', 'api/diff?id=' + encodeURIComponent(id) + '&file=' + encodeURIComponent(b.dataset.file) + (b.dataset.unc ? '&uncommitted=1' : ''));
        d.dataset.loaded = '1';
        d.innerHTML = diffHtml(r.diff) + (r.truncated ? '<p class="muted diff-more">' + tr('Truncated. Run git diff in the terminal for the full diff.') + '</p>' : '');
      } catch (e) { d.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
    });
  }

  // Dateien, die auch andere Aufgaben geändert haben, mit Sprung dorthin.
  function fileLinksHtml(fl) {
    if (!fl || !fl.files || !fl.files.length) return '';
    const shared = fl.files.filter((f) => fl.others[f.file]);
    if (!shared.length) return '';
    return '<div class="block"><div class="block-head"><h3>' + tr('Also in other tasks') + '</h3><span class="meta">' + tr('same files, mind the decisions there') + '</span></div><ul class="flinks">' +
      shared.slice(0, 12).map((f) => '<li><span class="mono">' + esc(f.file) + '</span><span>' + fl.others[f.file].map((x) => '<button class="btn link" data-open="' + esc(x) + '">' + esc(x) + '</button>').join(' ') + '</span></li>').join('') + '</ul></div>';
  }

  function diffHtml(text) {
    const lines = String(text || '').split('\n');
    const out = [];
    for (const l of lines) {
      if (/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(l)) continue;
      if (l.startsWith('\x1e')) { out.push('<div class="dl dc">' + esc(l.slice(1)) + '</div>'); continue; }
      const cls = l.startsWith('@@') ? 'dh' : l.startsWith('+') ? 'da' : l.startsWith('-') ? 'dd' : '';
      out.push('<div class="dl ' + cls + '">' + (esc(l) || ' ') + '</div>');
    }
    return '<div class="diff-body mono">' + (out.join('') || '<div class="dl">' + tr('No text change.') + '</div>') + '</div>';
  }

  // ---------- Teilen und Export ----------

  async function openShare() {
    let info;
    try { info = await api('GET', 'api/share'); } catch (e) { return fail(e); }
    const copyRow = (label, url, warn) => '<div class="share-link' + (warn ? ' warn' : '') + '"><span>' + esc(label) + '</span><input class="input mono" readonly value="' + esc(url) + '"><button type="button" class="btn small" data-copy="' + esc(url) + '">' + tr('Copy') + '</button></div>';
    const lan = info.shared
      ? (info.links.length
        ? info.links.map((l) => copyRow(tr('View via {address}', { address: l.address }), l.view)).join('') +
          '<details class="sec"><summary>' + tr('Link with edit rights') + ' <span class="meta">' + tr('only for you on other devices') + '</span></summary><div class="body">' + info.links.map((l) => copyRow(l.address, l.edit, true)).join('') + '<p class="sublabel">' + tr('Anyone with this link can change everything. Do not share it.') + '</p></div></details>' +
          '<div class="row-btns"><button type="button" class="btn small" data-share="rotate">' + tr('Renew links') + '</button><button type="button" class="btn small danger" data-share="disable">' + tr('Stop sharing') + '</button></div>'
        : '<div class="alert bad">' + tr('Shared, but no network address found. Is this computer connected to a network?') + '</div><div class="row-btns"><button type="button" class="btn small danger" data-share="disable">' + tr('Stop sharing') + '</button></div>')
      : '<p class="lead">' + tr('The board currently runs only on this computer. Once shared, others on the same network (Wi-Fi, office, VPN) can watch it live via a link. They cannot change anything.') + '</p><div class="row-btns"><button type="button" class="btn primary small" data-share="enable">' + tr('Share on the network') + '</button></div><p class="sublabel">' + tr('The server restarts briefly and then listens on all network addresses. The links contain a secret key; without it there is no access.') + '</p>';
    const html = '<h2>' + tr('Share board') + '</h2>' +
      '<div class="block"><div class="block-head"><h3>' + tr('Live on the network') + '</h3><span class="meta">' + (info.shared ? tr('shared') : tr('this computer only')) + '</span></div>' + lan + '</div>' +
      '<div class="block"><div class="block-head"><h3>' + tr('Snapshot') + '</h3><span class="meta">' + tr('one HTML file') + '</span></div>' +
        '<p class="lead">' + tr('For mail or chat: all tasks with details and images in one file. Opens without a server or internet and shows the current state.') + '</p>' +
        '<label class="toggle"><input type="checkbox" name="images" checked> ' + tr('Embed images') + '</label>' +
        '<label class="toggle"><input type="checkbox" name="closed" checked> ' + tr('Include done, discarded and archived tasks') + '</label>' +
        '<div class="row-btns"><button type="button" class="btn small primary" id="snapGo">' + tr('Download snapshot') + '</button></div></div>' +
      '<div class="block"><div class="block-head"><h3>' + tr('On the internet') + '</h3></div><p class="lead">' + tr('For people outside your network, send the snapshot. A dedicated server with login is possible as a next step.') + '</p></div>' +
      '<div class="foot"><button class="btn" value="cancel" formnovalidate>' + tr('Close') + '</button></div>';
    showDialog(html, () => null, (f) => {
      $$('[data-copy]', f).forEach((b) => b.onclick = async () => {
        const inp = b.previousElementSibling;
        try { await navigator.clipboard.writeText(b.dataset.copy); } catch (e) { inp.select(); document.execCommand('copy'); }
        b.textContent = tr('Copied');
        setTimeout(() => { b.textContent = tr('Copy'); }, 1500);
      });
      $$('[data-share]', f).forEach((b) => b.onclick = async () => {
        const op = b.dataset.share;
        if (op === 'rotate' && !confirm(tr('Create new links? The current links will stop working.'))) return;
        b.disabled = true;
        try {
          const r = await api('POST', 'api/share', { op });
          ok(r.message);
          if (r.restarting) { dlg.close(); setLive(true, tr('Board is restarting')); return; }
          dlg.close(); openShare();
        } catch (e) { fail(e); b.disabled = false; }
      });
      $('#snapGo', f).onclick = async (e) => {
        const b = e.currentTarget;
        b.disabled = true; b.textContent = tr('Creating …');
        try {
          const qs = 'images=' + (f.images.checked ? '1' : '0') + '&closed=' + (f.closed.checked ? '1' : '0');
          const res = await fetch('api/export?' + qs, { headers: { 'X-Works-Token': TOKEN } });
          if (!res.ok) throw new Error(tr('Export failed ({status}).', { status: res.status }));
          const blob = await res.blob();
          const name = ((res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/) || [])[1] || 'works-board.html';
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          ok(tr('Snapshot saved: {name} ({size} MB)', { name, size: (blob.size / 1024 / 1024).toFixed(1) }));
        } catch (ex) { fail(ex); }
        b.disabled = false; b.textContent = tr('Download snapshot');
      };
    });
  }

  // ---------- Sichern und Wiederherstellen (W-0021) ----------

  // Dezimalkomma nur auf Deutsch (auch für fmtTok, fmtMoney und den Burndown).
  const deComma = (s) => (I18N.lang === 'de' ? s.replace('.', ',') : s);
  const bkSize = (b) => (b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : deComma((b / 1048576).toFixed(1)) + ' MB');
  const BK_KEYS = ['closed', 'archive', 'comments', 'history', 'checks', 'planning', 'knowledge', 'images', 'designs'];

  async function openBackup(tab) {
    let info;
    try { info = await api('GET', 'api/backup-info'); } catch (e) { return fail(e); }
    const tg = (name, label, on, hint) => '<label class="toggle"><input type="checkbox" name="' + name + '"' + (on ? ' checked' : '') + '> ' + esc(label) + (hint ? '<span class="bk-hint">' + esc(hint) + '</span>' : '') + '</label>';
    const imp = tab === 'import';
    let pre = null;
    const html = '<h2>' + tr('Back up and restore') + '</h2>' +
      '<div class="bk-tabs" role="tablist" aria-label="' + tr('Direction') + '"><button type="button" role="tab" data-bk="export" aria-selected="' + !imp + '">' + tr('Export') + '</button><button type="button" role="tab" data-bk="import" aria-selected="' + imp + '">' + tr('Import') + '</button></div>' +
      '<div class="bk-pane" data-pane="export"' + (imp ? ' hidden' : '') + '>' +
        '<p class="lead" style="margin:0">' + tr('The board as one JSON file, for backup or to move it into another project.') + '</p>' +
        '<div class="bk-scope">' +
          '<fieldset><legend>' + tr('Tasks') + '</legend><label class="toggle"><input type="checkbox" checked disabled> ' + tr('Unfinished') + '<span class="bk-hint">' + info.open + '</span></label>' + tg('closed', tr('Done and discarded'), true, String(info.closed)) + tg('archive', tr('Archived tasks'), false, String(info.archived)) + '</fieldset>' +
          '<fieldset><legend>' + tr('Per task') + '</legend>' + tg('comments', tr('Comments and decisions'), true) + tg('history', tr('History and handoffs'), true) + tg('checks', tr('Check results'), false) + '</fieldset>' +
          '<fieldset><legend>' + tr('Planning') + '</legend>' + tg('planning', tr('Milestones, sprints, queue, recurring tasks'), true) + tg('knowledge', tr('Project knowledge and ideas'), true) + '</fieldset>' +
          '<fieldset><legend>' + tr('Files') + '</legend>' + tg('images', tr('Images'), false, info.images.n + ' · ' + bkSize(info.images.bytes)) + tg('designs', tr('Design variants'), false, info.designs.n + ' · ' + bkSize(info.designs.bytes)) + '</fieldset>' +
        '</div>' +
        '<div class="bk-sum"><b>' + esc(info.file) + '</b><span class="bk-hint" id="bkSize"></span></div>' +
        '<p class="sublabel">' + tr('Also without the board:') + ' <span class="mono">works export --json</span></p>' +
        '<div class="foot"><button class="btn" value="cancel" formnovalidate>' + tr('Close') + '</button><button type="button" class="btn primary" id="bkGo">' + tr('Download JSON') + '</button></div>' +
      '</div>' +
      '<div class="bk-pane" data-pane="import"' + (imp ? '' : ' hidden') + '>' +
        '<label class="imp-drop" id="bkDrop"><input type="file" id="bkFile" accept=".json,application/json" hidden><strong id="bkName">' + tr('Choose a backup or drop it here') + '</strong><span class="sublabel">' + tr('works backup as JSON, up to 20 MB') + '</span></label>' +
        '<div class="bk-pane" id="bkPre"></div>' +
        '<p class="err" role="alert"></p>' +
        '<div class="foot"><button class="btn" value="cancel" formnovalidate>' + tr('Cancel') + '</button><button class="btn primary" value="next" id="bkNext" disabled>' + tr('Continue to comparison') + '</button></div>' +
      '</div>';
    const next = await showDialog(html, (fd) => {
      if (!pre) throw new Error(tr('Please choose a backup first.'));
      return { r: pre, mode: fd.get('bkmode') === 'restore' ? 'restore' : 'merge' };
    }, (f) => {
      $$('[data-bk]', f).forEach((b) => b.onclick = () => {
        $$('[data-bk]', f).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
        $$('[data-pane]', f).forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.bk; });
      });
      const size = () => {
        const est = info.base + (f.elements.images.checked ? info.images.bytes * 1.34 : 0) + (f.elements.designs.checked ? info.designs.bytes * 1.34 : 0);
        $('#bkSize', f).textContent = tr('about {size}', { size: bkSize(est) }) + ' · ' + tr('{n} tasks', { n: info.open + (f.elements.closed.checked ? info.closed : 0) + (f.elements.archive.checked ? info.archived : 0) });
      };
      BK_KEYS.forEach((k) => { f.elements[k].onchange = size; });
      size();
      $('#bkGo', f).onclick = async (e) => {
        const b = e.currentTarget; const label = b.textContent;
        b.disabled = true; b.textContent = tr('Creating …');
        try {
          const qs = BK_KEYS.map((k) => k + '=' + (f.elements[k].checked ? '1' : '0')).join('&');
          const res = await fetch('api/backup?' + qs, { headers: { 'X-Works-Token': TOKEN } });
          if (!res.ok) throw new Error(tr('Export failed ({status}).', { status: res.status }));
          const blob = await res.blob();
          const name = ((res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/) || [])[1] || 'works-board.json';
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          ok(tr('Backup saved: {name} ({size})', { name, size: bkSize(blob.size) }));
        } catch (ex) { fail(ex); }
        b.disabled = false; b.textContent = label;
      };
      const inp = $('#bkFile', f); const drop = $('#bkDrop', f); const err = $('[data-pane="import"] .err', f);
      const load = async (file) => {
        if (!file) return;
        pre = null; $('#bkNext', f).disabled = true; err.textContent = ''; $('#bkPre', f).innerHTML = '';
        $('#bkName', f).textContent = file.name + ' (' + bkSize(file.size) + ')';
        try {
          const r = await api('POST', 'api/backup-preview?name=' + encodeURIComponent(file.name), undefined, { body: file, type: 'application/json' });
          const c = r.counts;
          const when = r.exported ? new Date(r.exported).toLocaleString(I18N.lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '';
          $('#bkPre', f).innerHTML = '<div class="bk-file"><span class="ic" aria-hidden="true">JSON</span><strong>' + esc(r.name) + '</strong><span class="bk-hint">' +
            esc([r.project ? tr('Project {name}', { name: r.project }) : '', when ? tr('exported {when}', { when }) : '', r.tasks === 1 ? tr('1 task') : tr('{n} tasks', { n: r.tasks }), r.milestones ? tr('{n} milestones', { n: r.milestones }) : '', r.knowledge ? tr('{n} knowledge entries', { n: r.knowledge }) : ''].filter(Boolean).join(' · ')) + '</span></div>' +
            '<div class="bk-counts"><span class="bk-chip" style="--c:var(--ok)"><i></i>' + tr('{n} new', { n: c.neu }) + '</span><span class="bk-chip" style="--c:var(--warn)"><i></i>' + tr('{n} changed', { n: c.geaendert }) + '</span><span class="bk-chip"><i></i>' + tr('{n} unchanged', { n: c.gleich }) + '</span><span class="bk-chip" style="--c:var(--accent)"><i></i>' + tr('{n} only here', { n: c.nurHier }) + '</span></div>' +
            '<fieldset class="bk-mode"><legend class="sublabel">' + tr('Import mode') + '</legend>' +
              '<label><input type="radio" name="bkmode" value="merge" checked><b>' + tr('Merge') + '</b><span>' + tr('Create new tasks, offer changed ones for selection, skip identical ones. Whatever exists only here stays.') + '</span></label>' +
              '<label><input type="radio" name="bkmode" value="restore"><b>' + tr('Restore') + '</b><span>' + tr('Replaces tasks, planning and project knowledge with the file. The current state is first saved as JSON in .works/backups.') + '</span></label>' +
            '</fieldset>';
          pre = r; $('#bkNext', f).disabled = false;
        } catch (ex) { err.textContent = ex.message; }
      };
      inp.onchange = () => load(inp.files[0] || null);
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); };
    });
    if (next) backupCompareDialog(next.r, next.mode);
  }

  async function backupCompareDialog(r, mode) {
    const lbl = (field, v) => (field === 'status' ? L(v) : v) || '–';
    const chg = (c) => (c.from !== undefined ? esc(c.label) + ' <del>' + esc(lbl(c.field, c.from)) + '</del> → <ins>' + esc(lbl(c.field, c.to)) + '</ins>' : esc(tr('{label} changed', { label: c.label })));
    const item = (i) => '<label><input type="checkbox" class="bkc" data-n="' + i.n + '" checked><span class="t"><span class="id">' + esc(i.kind === 'neu' ? tr('new') : i.localId) + '</span>' + esc(i.title) + '</span>' +
      '<span class="d">' + (i.kind === 'neu' ? esc([i.priority, L(i.status)].filter(Boolean).join(' · ')) : i.changes.map(chg).join(' · ')) + '</span></label>';
    const neu = r.items.filter((i) => i.kind === 'neu'); const ge = r.items.filter((i) => i.kind === 'geaendert');
    const restore = mode === 'restore';
    const body = restore
      ? '<p class="lead">' + (r.tasks === 1 ? tr('Restore replaces the current state with 1 task from the file, plus planning and project knowledge. The current state is backed up first.') : tr('Restore replaces the current state with {n} tasks from the file, plus planning and project knowledge. The current state is backed up first.', { n: r.tasks })) + '</p>' +
        (r.onlyHere.length ? '<div class="bk-diff"><h4>' + tr('Only here and will disappear') + ' · ' + r.onlyHere.length + '</h4>' + r.onlyHere.map((t) => '<div class="t"><span class="id">' + esc(t.id) + '</span>' + esc(t.title) + '</div>').join('') + '</div><p class="sublabel">' + tr('Afterwards these tasks exist only in the backup under .works/backups.') + '</p>' : '')
      : (neu.length || ge.length
        ? '<p class="lead">' + tr('Merge: identical items are hidden, whatever exists only here stays.') + '</p><div class="bk-diff">' +
          (neu.length ? '<h4>' + tr('New') + ' · ' + neu.length + '</h4>' + neu.map(item).join('') : '') + (ge.length ? '<h4>' + tr('Changed') + ' · ' + ge.length + '</h4>' + ge.map(item).join('') : '') + '</div>'
        : '<div class="q-empty">' + tr('Nothing to import: everything in the file is already in the board as is.') + '</div>');
    const html = '<h2>' + tr('Comparison with the board') + '</h2>' + body + '<p class="sublabel">' + tr('Undo can revert the whole import.') + '</p>' +
      '<p class="err" role="alert"></p><div class="foot"><button type="button" class="btn" id="bkBack" style="margin-right:auto">' + tr('Back') + '</button><button class="btn" value="cancel" formnovalidate>' + tr('Cancel') + '</button>' +
      '<button class="btn ' + (restore ? 'danger' : 'primary') + '" value="ok" id="bkApply"' + (!restore && !neu.length && !ge.length ? ' disabled' : '') + '>' + (restore ? tr('Restore') : tr('Import {n}', { n: neu.length + ge.length })) + '</button></div>';
    const res = await showDialog(html, () => {
      const only = $$('.bkc', form).filter((c) => c.checked).map((c) => +c.dataset.n);
      if (!restore && !only.length) throw new Error(tr('Nothing selected.'));
      return act('backupApply', { token: r.token, mode, only });
    }, (f) => {
      const count = () => { if (!restore) { const n = $$('.bkc', f).filter((c) => c.checked).length; $('#bkApply', f).textContent = n ? tr('Import {n}', { n }) : tr('Nothing selected'); $('#bkApply', f).disabled = !n; } };
      $$('.bkc', f).forEach((c) => { c.onchange = count; });
      $('#bkBack', f).onclick = () => { $('button[value="cancel"]', f).click(); setTimeout(() => openBackup('import'), 50); };
    });
    if (res) { if (res.undo) undoToast(res.message, res.undo); else ok(res.message); }
  }

  // ---------- Prüfungen im Abschluss-Dialog ----------

  function checksBlock(c) {
    const icon = { ok: ['ok', '✓'], ack: ['ok', '✓'], fail: ['bad', '×'], warn: ['warn', '!'], manual: ['wait', '…'], missing: ['wait', '…'] };
    const rows = c.list.map((x) => {
      const r = c.results[x.name] || { status: 'missing' };
      const st = c.stale ? 'missing' : r.status;
      const [cls, ch] = icon[st] || icon.missing;
      const label = { ok: tr('passed'), ack: tr('known'), fail: tr('failed'), warn: tr('finding'), manual: tr('Claude fills it in'), missing: tr('not run yet') }[st];
      let extra = '';
      if (!c.stale && st === 'warn') extra = '<div class="ck-note">' + md(r.note || '') + (EDIT ? '<div class="row-btns"><button type="button" class="btn small primary" data-cfix="' + esc(x.name) + '">' + tr('Let Claude fix it') + '</button><button type="button" class="btn small" data-cack="' + esc(x.name) + '">' + tr('Mark as known') + '</button></div>' : '') + '</div>';
      else if (!c.stale && st === 'fail' && r.output) extra = '<details class="ck-out"><summary>' + tr('Output') + '</summary><pre>' + esc(r.output.split('\n').slice(-40).join('\n')) + '</pre></details>';
      else if (!c.stale && (st === 'manual' || st === 'ack') && r.note) extra = '<div class="ck-note muted">' + esc(r.note.split('\n').slice(-1)[0]) + '</div>';
      return '<li class="ck ' + cls + '"><div class="ck-row"><span class="ck-ic" aria-hidden="true">' + ch + '</span><span class="ck-name">' + esc(x.name) + '</span><span class="mono muted ck-cmd">' + esc(x.cmd) + '</span><span class="muted num ck-ms">' + (r.ms && !c.stale ? Math.round(r.ms / 1000) + ' s' : esc(label)) + '</span></div>' + extra + '</li>';
    }).join('');
    return '<div class="block"><div class="block-head"><h3>' + tr('Automatic checks') + '</h3><span class="meta">' + (c.stale ? tr('not run yet for the current state') : esc(tr('last run {when}', { when: new Date(c.at).toLocaleString(I18N.lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) }))) + '</span><span class="spacer"></span>' +
      (EDIT ? '<button type="button" class="btn small" data-crun>' + (c.stale ? tr('Check now') : tr('Check again')) + '</button>' : '') + '</div><ul class="checks">' + rows + '</ul></div>';
  }

  function bindChecks(f, id) {
    const reopen = () => { const c = $('button[value="cancel"]', f); if (c) c.click(); setTimeout(() => openDod(id), 50); };
    $$('[data-crun]', f).forEach((b) => b.onclick = async () => {
      b.disabled = true; b.textContent = tr('Checks running …');
      $$('.ck', f).forEach((li) => li.classList.add('running'));
      const r = await run(() => act('checksRun', { id }), tr('Checks done'));
      if (r) reopen(); else { b.disabled = false; b.textContent = tr('Check again'); }
    });
    $$('[data-cack]', f).forEach((b) => b.onclick = async () => { if (await run(() => act('checksAck', { id, name: b.dataset.cack }), tr('Marked as known'))) reopen(); });
    $$('[data-cfix]', f).forEach((b) => b.onclick = async () => {
      const note = (b.closest('.ck').querySelector('.ck-note') || {}).innerText || '';
      const r = await run(() => act('comment', { id, text: tr('Please fix the finding from the check {name} and record the check again afterwards:', { name: b.dataset.cfix }) + '\n\n' + [tr('Let Claude fix it'), tr('Mark as known')].reduce((s, x) => s.split(x).join(''), note).trim() }), tr('Request to Claude saved as a comment'));
      if (r) b.disabled = true;
    });
  }

  // ---------- Kommentare ----------

  function commentsHtml(d) {
    const list = d.comments || [];
    const seenKey = 'works-cseen-' + d.task.id;
    const seen = store.get(seenKey, '');
    if (list.length) store.set(seenKey, list[list.length - 1].at);
    const item = (c) => {
      const me = c.author === 'Nutzer';
      const when = new Date(c.at).toLocaleString(I18N.lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return '<li class="cm' + (me ? ' me' : ' cl') + '"><span class="cm-av" aria-hidden="true">' + (me ? tr('You') : 'C') + '</span><div class="cm-b"><div class="cm-meta"><strong>' + (me ? tr('You') : 'Claude') + '</strong> ' + esc(when) + (!me && c.at > seen && seen ? ' <span class="tag q-tag">' + tr('new') + '</span>' : '') + '</div><div class="cm-text md">' + md(c.text) + '</div></div></li>';
    };
    const lastMine = list.length && list[list.length - 1].author === 'Nutzer';
    return '<div class="comments">' +
      (list.length ? '<ol class="cm-list">' + list.map(item).join('') + '</ol>' : '<div class="q-empty"><strong>' + tr('No comments yet.') + '</strong><span>' + tr('Tell Claude here what matters for this task. Claude reads new comments when a session starts and replies here.') + '</span></div>') +
      (lastMine ? '<p class="sublabel">' + tr('Claude has not answered your last comment yet.') + '</p>' : '') +
      (EDIT ? '<div class="cm-compose"><label class="field"><span>' + tr('Message to Claude') + '</span><textarea class="input" id="cmIn" rows="4" maxlength="10000" placeholder="' + tr('Note, request or answer. Markdown works.') + '"></textarea></label><div class="add-row" style="justify-content:flex-end;align-items:center"><span class="sublabel" style="margin-right:auto">' + tr('Ctrl+Enter sends') + '</span><button class="btn primary small" id="cmSend">' + tr('Send') + '</button></div></div>' : '') +
      '</div>';
  }

  function bindComments(id) {
    const ta = $('#cmIn');
    if (!ta) return;
    ta.oninput = () => { dirty = !!ta.value.trim(); };
    const send = async () => {
      const text = ta.value.trim();
      if (!text) return;
      $('#cmSend').disabled = true;
      const r = await run(() => act('comment', { id, text }), (x) => x.message);
      $('#cmSend').disabled = false;
      if (r) { ta.value = ''; dirty = false; }
    };
    ta.onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send(); };
    $('#cmSend').onclick = send;
  }

  // ---------- Zeit ----------

  const fmtMs = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; };

  function timeHtml(d) {
    const tm = d.time || { totalMs: 0, sessions: [], statusDays: {} };
    const t = d.task;
    const est = (meta.effortDays || {})[t.effort];
    const since = tm.started ? Math.max(0, Math.round((new Date(today() + 'T00:00:00') - new Date(tm.started + 'T00:00:00')) / 86400000)) : null;
    const sd = Object.entries(tm.statusDays || {}).filter(([, v]) => v > 0);
    const total = sd.reduce((a, [, v]) => a + v, 0) || 1;
    return '<div class="time-box">' +
      '<div class="code-cards"><div><small>' + tr('Claude active') + '</small><strong>' + (tm.totalMs ? fmtMs(tm.totalMs) : '–') + '</strong><span class="muted">' + (tm.sessions.length === 1 ? tr('1 session') : tr('{n} sessions', { n: tm.sessions.length })) + '</span></div>' +
      '<div><small>' + tr('Since start') + '</small><strong>' + (since === null ? tr('not started') : since === 1 ? tr('1 day') : tr('{n} days', { n: since })) + '</strong><span class="muted">' + (est ? esc(tr('estimated {n} days at {effort}', { n: est, effort: t.effort })) : tr('no estimate')) + '</span></div>' +
      '<div><small>Tokens</small><strong>' + (d.usage && d.usage.tokens ? fmtTok(d.usage.tokens) : '–') + '</strong><span class="muted">' + (d.usage && d.usage.tokens ? tr('incl. {n} cache', { n: fmtTok(d.usage.cr + d.usage.cw) }) : tr('nothing recorded yet')) + '</span></div>' +
      '<div><small>' + tr('Estimated cost') + '</small><strong>' + (d.usage && d.usage.tokens ? fmtMoney(d.usage.cost, d.usage.currency) : '–') + '</strong><span class="muted">' + tr('based on the prices in config.json') + '</span></div></div>' +
      (d.usage && d.usage.days && d.usage.days.length ? '<div class="block"><div class="block-head"><h3>' + tr('Usage per day') + '</h3></div><div class="est-grid">' + d.usage.days.slice(0, 10).map((x) => { const max = Math.max(...d.usage.days.map((y) => y.cost)) || 1; return '<span class="muted num">' + esc(fmtDate(x.day).slice(0, 6)) + '</span><div class="est-track"><span class="est-bar" style="width:' + (x.cost / max * 100).toFixed(1) + '%"></span></div><span class="num">' + fmtTok(x.in + x.out + x.cw + x.cr) + ', ' + fmtMoney(x.cost, d.usage.currency) + '</span>'; }).join('') + '</div></div>' : '') +
      (sd.length ? '<div class="block"><div class="block-head"><h3>' + tr('Days per status') + '</h3></div><div class="pg-bar">' + sd.map(([k, v]) => '<span style="flex-grow:' + v + ';background:' + statusVar(k) + '" title="' + esc(L(k)) + ': ' + tr('{n} days', { n: v }) + '"></span>').join('') + '</div><div class="pg-legend">' + sd.map(([k, v]) => '<span class="pg-k"><i style="background:' + statusVar(k) + '"></i>' + esc(L(k)) + ' <b class="num">' + v + '</b></span>').join('') + '</div></div>' : '') +
      '<div class="block"><div class="block-head"><h3>' + tr('Sessions') + '</h3><span class="meta">' + tr('breaks over 20 minutes split sessions') + '</span></div>' +
      (tm.sessions.length ? '<ol class="commits">' + tm.sessions.map((s) => '<li><time class="muted num">' + esc(new Date(s.start).toLocaleString(I18N.lang === 'de' ? 'de-DE' : 'en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</time><span class="subj">' + esc(s.label || (s.turns === 1 ? tr('1 prompt') : tr('{n} prompts', { n: s.turns }))) + '</span><span class="num">' + fmtMs(s.ms) + '</span></li>').join('') + '</ol>'
        : '<p class="md empty-md">' + tr('No time recorded yet. The hooks measure how long Claude works on the active task once it was started with works start.') + '</p>') + '</div></div>';
  }

  async function loadEstimates() {
    const box = $('#estBox');
    if (!box) return;
    let e;
    try { e = await api('GET', 'api/estimates'); } catch (err) { return; }
    const max = Math.max(1, ...e.sizes.map((s) => Math.max(s.estimate, s.avg || 0)));
    const open = store.get('works-est-open', false);
    box.innerHTML = '<details class="est"' + (open ? ' open' : '') + '><summary>' + tr('How good are the estimates?') + ' <span class="meta">' + (e.mode === 'measured' ? tr('Timeline uses measured values') : tr('Timeline uses fixed values')) + '</span></summary><div class="est-body">' +
      '<div class="est-grid">' + e.sizes.map((s) => '<strong>' + s.effort + '</strong><div class="est-track"><span class="est-bar' + (s.avg !== null && s.avg > s.estimate * 1.2 ? ' over' : '') + '" style="width:' + ((s.avg || 0) / max * 100).toFixed(1) + '%"></span><span class="est-mark" style="left:' + (s.estimate / max * 100).toFixed(1) + '%" title="' + tr('Estimate {n} days', { n: s.estimate }) + '"></span></div><span class="' + (s.avg === null ? 'muted' : '') + '">' + (s.avg === null ? tr('no data yet') : tr('{avg} instead of {est} days, {n}x', { avg: s.avg, est: s.estimate, n: s.n })) + '</span>').join('') + '</div>' +
      '<p class="sublabel">' + tr('Line: estimate. Bar: average actual duration from start to completion. Measured values count from three done tasks per size.') + '</p>' +
      (e.worst.length ? '<p class="sublabel">' + tr('Furthest over the estimate: {list}', { list: e.worst.map((w) => esc(w.id) + ' (' + esc(w.effort) + ', ' + tr('{n} days', { n: w.days }) + ')').join(', ') }) + '</p>' : '') +
      (EDIT ? '<div class="row-btns">' + (e.mode === 'measured' ? '<button class="btn small" data-emode="fixed">' + tr('Use fixed values') + '</button>' : '<button class="btn small primary" data-emode="measured">' + tr('Use measured values') + '</button>') + '</div>' : '') +
      '</div></details>';
    $('details', box).ontoggle = (ev) => store.set('works-est-open', ev.target.open);
    $$('[data-emode]', box).forEach((b) => b.onclick = () => run(() => act('effortMode', { mode: b.dataset.emode }), tr('Saved')));
  }

  // ---------- Sprint ----------

  function renderSprint() {
    const box = $('#viewSprint');
    const sp = meta.sprint;
    const set = meta.sprintSettings || { points: { S: 1, M: 2, L: 4, XL: 8 }, capacity: 20, length_days: 14 };
    const pts = (t) => (set.points[t.effort] ?? set.points.M);
    const byId = byIdNow();
    const last = meta.lastSprint;
    if (!sp) {
      const carry = last && last.carry ? last.carry.filter((x) => byId.has(x)) : [];
      box.innerHTML = '<div class="q-wrap"><section class="q-main"><div class="q-head"><h2>' + tr('No active sprint') + '</h2><p>' + tr('A sprint groups tasks for a fixed period with a goal. The capacity in points shows whether the plan is realistic. Points: {points}, a task without an estimate counts as M.', { points: Object.entries(set.points).map(([k, v]) => k + ' ' + v).join(', ') }) + '</p></div>' +
        (EDIT ? '<form class="sp-form" id="spStart"><div class="grid"><label class="field span2"><span>' + tr('Title') + '</span><input class="input" name="title" required maxlength="120" value="Sprint ' + ((parseInt(String(last ? last.id : 'S0').slice(1), 10) || 0) + 1) + '"></label><label class="field span2"><span>' + tr('Goal') + '</span><input class="input" name="goal" maxlength="300" placeholder="' + tr('What should exist at the end?') + '"></label>' +
          '<label class="field"><span>Start</span><input type="date" class="input" name="start" value="' + today() + '"></label><label class="field"><span>' + tr('Length in days') + '</span><input type="number" class="input" name="days" min="1" max="60" value="' + set.length_days + '"></label><label class="field"><span>' + tr('Capacity in points') + '</span><input type="number" class="input" name="capacity" min="1" max="1000" value="' + set.capacity + '"></label></div>' +
          (carry.length ? '<label class="toggle"><input type="checkbox" name="carry" checked> ' + esc(carry.length === 1 ? tr('Carry over 1 open task from {id}', { id: last.id }) : tr('Carry over {n} open tasks from {id}', { n: carry.length, id: last.id })) + '</label>' : '') +
          '<div class="row-btns"><button class="btn primary">' + tr('Start sprint') + '</button></div></form>' : '<p class="md empty-md">' + tr('The board owner has no sprint planned right now.') + '</p>') +
        '</section>' + (last ? '<aside class="q-side"><div class="q-card"><small>' + esc(tr('{name} in retrospect', { name: last.id + ' ' + last.title })) + '</small><span>' + (last.result ? tr('{done} of {planned} points achieved', { done: last.result.done, planned: last.result.planned }) : tr('completed')) + (carry.length ? ', ' + tr('{n} left open', { n: carry.length }) : '') + '</span></div></aside>' : '') + '</div>';
      const f = $('#spStart', box);
      if (f) f.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(f); run(() => act('sprintStart', { title: fd.get('title'), goal: fd.get('goal'), start: fd.get('start'), days: fd.get('days'), capacity: fd.get('capacity'), carry: fd.get('carry') === 'on' }), (x) => x.message); };
      return;
    }
    const st = sp.stats;
    const list = (sp.tasks || []).map((x) => byId.get(x)).filter(Boolean);
    const free = st.capacity - st.planned;
    const cap = Math.max(st.capacity, st.planned, 1);
    const seg = (n, cls, label) => (n > 0 ? '<span class="' + cls + '" style="flex-grow:' + n + '" title="' + label + ': ' + tr('{n} points', { n }) + '"></span>' : '');
    const W = 300; const H = 110; const P = 6;
    const x = (i) => P + (i * (W - 2 * P)) / Math.max(1, st.days - 1);
    const y = (v) => H - P - (v * (H - 2 * P)) / Math.max(1, st.planned);
    const actual = st.series.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.remaining).toFixed(1)).join(' ');
    const lastP = st.series[st.series.length - 1];
    const ahead = lastP ? lastP.remaining <= st.idealNow + 0.01 : true;
    const cand = tasks.filter((t) => ['backlog', 'geplant'].includes(t.status) && !t.archived && !(sp.tasks || []).includes(t.id))
      .sort((a, b) => PRIOS.indexOf(a.priority) - PRIOS.indexOf(b.priority) || (b.status === 'geplant') - (a.status === 'geplant')).slice(0, 12);
    const row = (t) => '<li class="sp-item' + (t.status === 'erledigt' ? ' done' : '') + '" data-id="' + esc(t.id) + '"><span class="st" style="--c:' + statusVar(t.status) + '" title="' + esc(L(t.status)) + '"></span><button class="q-title" data-open="' + esc(t.id) + '"><span class="id num">' + esc(t.id) + '</span> ' + esc(t.title) + '</button>' +
      (t.crit[1] && t.status !== 'erledigt' ? '<span class="muted num">' + tr('{a} of {b}', { a: t.crit[0], b: t.crit[1] }) + '</span>' : '') + '<span class="muted num">' + esc(t.effort || tr('no effort')) + ', ' + tr('{n} pts', { n: pts(t) }) + '</span>' + (EDIT && t.status !== 'erledigt' ? '<button class="btn small ghost icon" data-sprm="' + esc(t.id) + '" aria-label="' + tr('Remove from sprint') + '" title="' + tr('Remove from sprint') + '">×</button>' : '') + '</li>';
    box.innerHTML = '<div class="sp">' +
      '<div class="sp-top"><section class="sp-card sp-main"><div class="sp-head"><h2>' + esc(sp.title) + '</h2><span class="muted">' + esc(tr('{from} to {to}', { from: fmtDate(sp.start), to: fmtDate(sp.end) })) + ', ' + tr('day {n} of {total}', { n: st.dayIndex, total: st.days }) + '</span>' + (EDIT ? '<span class="spacer"></span><button class="btn small ghost" id="spEdit">' + tr('Edit') + '</button><button class="btn small" id="spClose">' + tr('Close sprint') + '</button>' : '') + '</div>' +
        (sp.goal ? '<p class="sp-goal">' + esc(tr('Goal: {goal}', { goal: sp.goal })) + '</p>' : '') +
        '<div class="sp-cap"><span>' + tr('Capacity') + '</span><strong class="num">' + tr('{planned} of {capacity} points planned', { planned: st.planned, capacity: st.capacity }) + '</strong></div>' +
        '<div class="pg-bar sp-bar">' + seg(st.done, 'pg-done', tr('Done')) + seg(st.working, 'pg-work', tr('In progress')) + seg(st.open, 'sp-open', tr('Still to do')) + seg(Math.max(0, cap - st.planned), 'pg-wait', tr('Free')) + '</div>' +
        '<div class="pg-legend"><span class="pg-k"><i class="pg-done"></i>' + tr('done') + ' <b class="num">' + st.done + '</b></span><span class="pg-k"><i class="pg-work"></i>' + tr('in progress') + ' <b class="num">' + st.working + '</b></span><span class="pg-k"><i class="sp-open"></i>' + tr('open') + ' <b class="num">' + st.open + '</b></span>' + (free < 0 ? '<span class="late">' + tr('{n} points overbooked', { n: -free }) + '</span>' : '<span class="muted">' + tr('{n} free', { n: free }) + '</span>') + (st.unestimated ? '<span class="muted">' + tr('{n} without estimate count as M', { n: st.unestimated }) + '</span>' : '') + '</div></section>' +
        '<section class="sp-card sp-burn"><div class="sp-cap"><strong>Burndown</strong><span class="' + (ahead ? 'good' : 'late') + '">' + (ahead ? tr('on track') : tr('behind plan')) + '</span></div>' +
        '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + tr('Open points: {n}, ideal would be {ideal}', { n: lastP ? lastP.remaining : st.planned, ideal: st.idealNow.toFixed(1) }) + '"><path d="M' + x(0) + ' ' + y(st.planned) + ' L' + x(st.days - 1) + ' ' + y(0) + '" class="c-ideal"/>' + (actual ? '<path d="' + actual + '" class="c-done"/>' : '') + '' + '</svg>' +
        '<div class="c-axis"><span>' + tr('{n} points open', { n: lastP ? lastP.remaining : st.planned }) + '</span><span>' + tr('ideal would be {ideal}', { ideal: deComma(st.idealNow.toFixed(1)) }) + '</span></div></section></div>' +
      '<div class="q-wrap"><section class="q-main"><h3 class="sp-h">' + tr('In sprint') + ' <span class="muted">' + list.length + '</span></h3>' +
        (list.length ? '<ol class="sp-list" id="spList">' + list.map(row).join('') + '</ol>' : '') +
        (EDIT ? '<div class="sp-drop" id="spDrop">' + tr('Drag tasks here from the right or plan them with +.') + (free > 0 ? ' ' + tr('{n} points still free.', { n: free }) : '') + '</div>' : '') + '</section>' +
      '<aside class="q-side"><h3 class="sp-h">' + tr('Suggestions') + '</h3>' + (cand.length ? cand.map((t) => {
        const p = pts(t);
        const fit = p === free ? ['good', tr('fits exactly')] : p < free ? ['', tr('fits')] : ['late', tr('no longer fits')];
        return '<div class="sp-cand' + (fit[0] === 'good' ? ' best' : '') + '" data-id="' + esc(t.id) + '"' + (EDIT ? ' draggable="true"' : '') + '><button class="q-title" data-open="' + esc(t.id) + '">' + esc(t.id + ' ' + t.title) + '</button><span class="q-meta"><span style="color:' + prioVar(t.priority) + '">' + esc(t.priority) + '</span>, ' + esc(t.effort || tr('no estimate')) + ', ' + tr('{n} pts', { n: p }) + ', <span class="' + fit[0] + '">' + fit[1] + '</span></span>' + (EDIT ? '<button class="btn small ghost icon sp-add" data-spadd="' + esc(t.id) + '" aria-label="' + esc(tr('Add {id} to sprint', { id: t.id })) + '" title="' + tr('Add to sprint') + '">+</button>' : '') + '</div>';
      }).join('') : '<p class="md empty-md">' + tr('No open tasks outside the sprint.') + '</p>') +
        (last && last.result ? '<div class="q-card"><small>' + esc(tr('{name} in retrospect', { name: last.id })) + '</small><span>' + tr('{done} of {planned} points achieved', { done: last.result.done, planned: last.result.planned }) + '</span></div>' : '') +
      '</aside></div></div>';
    $$('[data-open]', box).forEach((b) => b.onclick = () => openTask(b.dataset.open));
    if (!EDIT) return;
    $$('[data-spadd]', box).forEach((b) => b.onclick = () => run(() => act('sprintAdd', { id: b.dataset.spadd }), tr('{id} added to sprint', { id: b.dataset.spadd })));
    $$('[data-sprm]', box).forEach((b) => b.onclick = () => run(() => act('sprintRemove', { id: b.dataset.sprm }), tr('{id} removed from sprint', { id: b.dataset.sprm })));
    $$('.sp-cand[draggable]', box).forEach((c) => {
      c.ondragstart = (e) => { qDrag = c.dataset.id; e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); };
      c.ondragend = () => { qDrag = null; c.classList.remove('dragging'); if (reloadPending) { reloadPending = false; reload(); } };
    });
    const drop = $('#spDrop', box);
    const target = [drop, $('#spList', box)].filter(Boolean);
    target.forEach((el) => {
      el.ondragover = (e) => { if (qDrag) { e.preventDefault(); drop.classList.add('over'); } };
      el.ondragleave = () => drop.classList.remove('over');
      el.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); const idd = e.dataTransfer.getData('text/plain'); qDrag = null; if (idd) run(() => act('sprintAdd', { id: idd }), tr('{id} added to sprint', { id: idd })); };
    });
    $('#spClose', box).onclick = () => openRetro(sp, st, list);
    $('#spEdit', box).onclick = async () => {
      const r = await showDialog('<h2>' + esc(tr('Edit {id}', { id: sp.id })) + '</h2><label class="field"><span>' + tr('Title') + '</span><input class="input" name="title" required maxlength="120" value="' + esc(sp.title) + '"></label><label class="field"><span>' + tr('Goal') + '</span><input class="input" name="goal" maxlength="300" value="' + esc(sp.goal || '') + '"></label><div class="grid"><label class="field span2"><span>' + tr('End') + '</span><input type="date" name="end" value="' + esc(sp.end) + '"></label><label class="field span2"><span>' + tr('Capacity') + '</span><input type="number" class="input" name="capacity" min="1" max="1000" value="' + st.capacity + '"></label></div>' + foot(tr('Save')),
        (fd) => act('sprintSet', { fields: { title: fd.get('title'), goal: fd.get('goal'), end: fd.get('end'), capacity: fd.get('capacity') } }));
      if (r) ok(tr('Sprint saved'));
    };
  }

  // ---------- Abhängigkeitsgraph ----------

  function renderGraph() {
    const box = $('#viewGraph');
    const showDone = store.get('works-graph-done', true);
    const eff = meta.effortDays || EFFORT_DAYS;
    const pool = tasks.filter((t) => match(t) && t.status !== 'verworfen' && (showDone || t.status !== 'erledigt'));
    const ids = new Set(pool.map((t) => t.id));
    const dependents = new Map();
    pool.forEach((t) => (t.blockedBy || []).forEach((b) => { if (ids.has(b)) dependents.set(b, (dependents.get(b) || []).concat(t.id)); }));
    const nodes = pool.filter((t) => (t.blockedBy || []).some((b) => ids.has(b)) || dependents.has(t.id));
    const byId = new Map(nodes.map((t) => [t.id, t]));
    const lvl = new Map();
    const level = (t, depth = 0) => {
      if (lvl.has(t.id)) return lvl.get(t.id);
      if (depth > 50) return 0;
      const bs = (t.blockedBy || []).filter((b) => byId.has(b));
      const v = bs.length ? Math.max(...bs.map((b) => level(byId.get(b), depth + 1) + 1)) : 0;
      lvl.set(t.id, v);
      return v;
    };
    nodes.forEach((t) => level(t));
    // Kritischer Pfad: längste Kette offener Aufgaben, gemessen in geschätzten Tagen.
    const open = (t) => OPEN.includes(t.status);
    const dist = new Map(); const prev = new Map();
    const dfs = (t, depth = 0) => {
      if (dist.has(t.id)) return dist.get(t.id);
      const own = open(t) ? (eff[t.effort] || eff.M || 5) : 0;
      let best = 0; let from = null;
      if (depth < 50) for (const b of (t.blockedBy || []).filter((x) => byId.has(x))) { const d2 = dfs(byId.get(b), depth + 1); if (d2 > best) { best = d2; from = b; } }
      dist.set(t.id, best + own); prev.set(t.id, from);
      return best + own;
    };
    nodes.forEach((t) => dfs(t));
    const endNode = nodes.filter(open).sort((a, b) => dist.get(b.id) - dist.get(a.id))[0];
    const crit = [];
    for (let c = endNode && endNode.id; c; c = prev.get(c)) if (open(byId.get(c))) crit.unshift(c);
    const critSet = new Set(crit.length > 1 ? crit : []);
    const allDeps = (idd, seen = new Set()) => { for (const d of dependents.get(idd) || []) if (!seen.has(d)) { seen.add(d); allDeps(d, seen); } return seen; };
    const lever = nodes.filter((t) => ['backlog', 'geplant', 'in-arbeit'].includes(t.status) && !t.blocked).map((t) => ({ t, n: [...allDeps(t.id)].filter((d) => open(byId.get(d))).length })).filter((x) => x.n).sort((a, b) => b.n - a.n || PRIOS.indexOf(a.t.priority) - PRIOS.indexOf(b.t.priority))[0];
    const cols = Math.max(0, ...nodes.map((t) => lvl.get(t.id))) + 1;
    const NW = 210; const NH = 68; const CX = 270; const GY = 22; const PAD = 28;
    const pos = new Map();
    let maxRows = 0;
    for (let c = 0; c < cols; c++) {
      const col = nodes.filter((t) => lvl.get(t.id) === c).sort((a, b) => (critSet.has(b.id) - critSet.has(a.id)) || PRIOS.indexOf(a.priority) - PRIOS.indexOf(b.priority));
      col.forEach((t, i) => pos.set(t.id, { x: PAD + c * CX, y: PAD + i * (NH + GY) }));
      maxRows = Math.max(maxRows, col.length);
    }
    const W = PAD * 2 + (cols - 1) * CX + NW; const H = PAD * 2 + maxRows * (NH + GY) + 10;
    const edges = [];
    nodes.forEach((t) => (t.blockedBy || []).filter((b) => byId.has(b)).forEach((b) => {
      const a = pos.get(b); const z = pos.get(t.id);
      const x1 = a.x + NW; const y1 = a.y + NH / 2; const x2 = z.x - 2; const y2 = z.y + NH / 2; const mx = (x1 + x2) / 2;
      const hot = critSet.has(b) && critSet.has(t.id) && crit.indexOf(t.id) === crit.indexOf(b) + 1;
      edges.push('<path d="M' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + y2 + ', ' + x2 + ' ' + y2 + '" class="gr-edge' + (hot ? ' hot' : '') + (byId.get(b).status === 'erledigt' ? ' done' : '') + '" marker-end="url(#' + (hot ? 'grh' : 'gra') + ')"/>');
    }));
    const node = (t) => {
      const p = pos.get(t.id);
      const label = t.status === 'erledigt' ? tr('done') : t.blocked ? tr('blocked') : L(t.status);
      return '<div class="gr-node' + (critSet.has(t.id) ? ' crit' : '') + (t.status === 'erledigt' ? ' done' : '') + (t.blocked ? ' blocked' : '') + '" data-node="' + esc(t.id) + '" style="left:' + p.x + 'px;top:' + p.y + 'px;width:' + NW + 'px;height:' + NH + 'px">' +
        '<button class="gr-open" data-open="' + esc(t.id) + '"><span class="gr-meta"><span class="st" style="--c:' + (t.blocked ? 'var(--danger)' : statusVar(t.status)) + '"></span>' + esc(t.id) + ' ' + esc(label) + (t.effort ? ', ' + esc(t.effort) : '') + '</span><span class="gr-t">' + esc(t.title) + '</span></button>' +
        (EDIT && open(t) ? '<button class="gr-link" data-link="' + esc(t.id) + '" title="' + tr('Drag onto another card: this task blocks that one') + '" aria-label="' + esc(tr('Drag dependency from {id}', { id: t.id })) + '">+</button>' : '') + '</div>';
    };
    const loose = pool.length - nodes.length;
    const days = endNode ? dist.get(endNode.id) : 0;
    box.innerHTML = '<div class="q-wrap"><section class="q-main">' +
      '<div class="gr-bar"><label class="toggle"><input type="checkbox" id="grDone"' + (showDone ? ' checked' : '') + '> ' + tr('Show done') + '</label><span class="muted">' + tr('{n} tasks with dependencies', { n: nodes.length }) + (loose ? ', ' + tr('{n} without', { n: loose }) : '') + '</span></div>' +
      (nodes.length ? '<div class="gr-scroll"><div class="gr-canvas" style="width:' + W + 'px;height:' + H + 'px"><svg class="gr-svg" width="' + W + '" height="' + H + '" aria-hidden="true"><defs><marker id="gra" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" class="gr-ah"/></marker><marker id="grh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" class="gr-ah hot"/></marker></defs>' + edges.join('') + '<path id="grTmp" class="gr-edge tmp" d=""/></svg>' + nodes.map(node).join('') + '</div></div>'
        : '<div class="q-empty"><strong>' + tr('No dependencies yet.') + '</strong><span>' + tr('Link tasks in the detail panel under Dependencies or with works link A blocked-by B. This view then shows what waits for what.') + '</span></div>') +
      '</section><aside class="q-side">' +
      (critSet.size ? '<div class="q-card crit"><small>' + tr('Critical path') + '</small><strong>' + crit.map(esc).join(', ') + '</strong><span>' + tr('About {n} days in total by the estimate. If one of them slips, the end moves.', { n: days }) + '</span></div>' : '') +
      (lever ? '<div class="q-card"><small>' + tr('Biggest lever') + '</small><button class="q-title" data-open="' + esc(lever.t.id) + '"><strong>' + esc(lever.t.id + ' ' + lever.t.title) + '</strong></button><span>' + (lever.n === 1 ? tr('Once done, it unblocks 1 task.') : tr('Once done, it unblocks {n} tasks.', { n: lever.n })) + '</span>' + (EDIT && !(meta.queue || []).includes(lever.t.id) && lever.t.status !== 'in-arbeit' ? '<button class="btn small" data-qfront="' + esc(lever.t.id) + '">' + tr('Move to front of queue') + '</button>' : '') + '</div>' : '') +
      '<div class="q-card gr-legend"><span><i class="lg-hot"></i>' + tr('critical path') + '</span><span><i class="lg-edge"></i>' + tr('blocked by') + '</span>' + (EDIT ? '<span class="muted">' + tr('Drag the + on a card onto another to create a dependency.') + '</span>' : '') + '</div>' +
      '</aside></div>';
    $('#grDone', box).onchange = (e) => { store.set('works-graph-done', e.target.checked); renderGraph(); };
    $$('[data-open]', box).forEach((b) => b.onclick = () => openTask(b.dataset.open));
    $$('[data-qfront]', box).forEach((b) => b.onclick = () => run(() => act('queueAdd', { id: b.dataset.qfront, pos: 1 }), tr('{id} is now first in the queue', { id: b.dataset.qfront })));
    if (!EDIT) return;
    const canvas = $('.gr-canvas', box);
    const tmp = $('#grTmp', box);
    $$('[data-link]', box).forEach((h) => h.onpointerdown = (e) => {
      e.preventDefault();
      const src = h.dataset.link; const p = pos.get(src);
      const r0 = canvas.getBoundingClientRect();
      h.setPointerCapture(e.pointerId);
      tlDrag = { id: src };
      const x1 = p.x + NW; const y1 = p.y + NH / 2;
      h.onpointermove = (ev) => { const x2 = ev.clientX - r0.left; const y2 = ev.clientY - r0.top; tmp.setAttribute('d', 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2); $$('.gr-node', canvas).forEach((n) => n.classList.toggle('target', n.contains(document.elementFromPoint(ev.clientX, ev.clientY)) && n.dataset.node !== src)); };
      h.onpointerup = (ev) => {
        h.onpointermove = null; h.onpointerup = null; tmp.setAttribute('d', ''); tlDrag = null;
        $$('.gr-node', canvas).forEach((n) => n.classList.remove('target'));
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const dst = el && el.closest('.gr-node');
        if (dst && dst.dataset.node !== src) run(() => act('link', { id: src, rel: 'blocks', target: dst.dataset.node }), tr('{a} now blocks {b}', { a: src, b: dst.dataset.node }));
        if (reloadPending) { reloadPending = false; reload(); }
      };
    });
  }

  // ---------- Gespeicherte Ansichten ----------

  const currentFilter = () => ({ prios: [...state.prios].sort(), type: state.type, tag: state.tag, ms: state.ms, signal: state.signal, q: state.q, closed: state.closed });
  const sameFilter = (a, b) => JSON.stringify({ ...a, prios: (a.prios && a.prios.length ? a.prios : PRIOS).slice().sort() }) === JSON.stringify({ ...b, prios: (b.prios && b.prios.length ? b.prios : PRIOS).slice().sort() });
  function withFilter(f, fn) {
    const saved = { prios: state.prios, type: state.type, tag: state.tag, ms: state.ms, signal: state.signal, q: state.q, closed: state.closed };
    Object.assign(state, { prios: new Set(f.prios && f.prios.length ? f.prios : PRIOS), type: f.type || '', tag: f.tag || '', ms: f.ms || '', signal: f.signal || '', q: f.q || '', closed: !!f.closed });
    try { return fn(); } finally { Object.assign(state, saved); }
  }

  function renderSavedViews() {
    const box = $('#savedViews');
    const views = meta.views || [];
    const cur = currentFilter();
    if (!views.length && !(EDIT && filtersActive())) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<span class="sv-label">' + tr('Views') + '</span>' +
      '<button class="sv-chip" data-svall aria-pressed="' + (!filtersActive()) + '">' + tr('Everything') + '</button>' +
      views.map((v, i) => {
        const n = withFilter(v.filter || {}, () => tasks.filter((t) => match(t) && OPEN.includes(t.status)).length);
        const on = sameFilter(v.filter || {}, cur) && (v.view || 'board') === state.view;
        return '<span class="sv-wrap"><button class="sv-chip" data-sv="' + i + '" aria-pressed="' + on + '" title="' + esc(describeFilter(v)) + '">' + esc(v.name) + ' <span class="sv-n num">' + n + '</span></button>' + (EDIT ? '<button class="sv-x" data-svdel="' + i + '" aria-label="' + esc(tr('Delete view {name}', { name: v.name })) + '" title="' + tr('Delete') + '">×</button>' : '') + '</span>';
      }).join('') +
      (EDIT && filtersActive() && !views.some((v) => sameFilter(v.filter || {}, cur)) ? '<button class="sv-chip add" id="svSave">' + tr('Save current filters') + '</button>' : '');
    $('[data-svall]', box).onclick = () => resetFilters();
    $$('[data-sv]', box).forEach((b) => b.onclick = () => applySavedView(views[+b.dataset.sv]));
    $$('[data-svdel]', box).forEach((b) => b.onclick = async () => { const v = views[+b.dataset.svdel]; if (await confirmBox({ title: tr('Delete view'), lead: tr('The view “{name}” will be removed. The tasks stay unchanged.', { name: v.name }), confirm: tr('Delete'), danger: true })) run(() => act('viewDelete', { name: v.name }), tr('View deleted')); });
    const sv = $('#svSave', box);
    if (sv) sv.onclick = saveViewDialog;
  }

  function describeFilter(v) {
    const f = v.filter || {};
    const p = [];
    if (f.prios && f.prios.length && f.prios.length < 4) p.push(f.prios.join(' ' + tr('and') + ' '));
    if (f.type) p.push(meta.typeLabel[f.type] || f.type);
    if (f.tag) p.push('#' + f.tag);
    if (f.ms) p.push(tr('Milestone {id}', { id: f.ms }));
    if (f.signal) p.push({ blocked: tr('only blocked'), unblocked: tr('without blocked'), overdue: tr('overdue'), questions: tr('with open questions'), incomplete: tr('incomplete'), stale: tr('quiet'), conflict: tr('with shared files') }[f.signal] || f.signal);
    if (f.q) p.push(tr('Search “{q}”', { q: f.q }));
    if (v.view && v.view !== 'board') p.push(tr('View {name}', { name: VIEW_LABEL[v.view] || v.view }));
    if (v.sort) p.push(tr('sorted by {key}', { key: v.sort.key }));
    return p.join(', ') || tr('all tasks');
  }

  function applySavedView(v) {
    const f = v.filter || {};
    Object.assign(state, { prios: new Set(f.prios && f.prios.length ? f.prios : PRIOS), type: f.type || '', tag: f.tag || '', ms: f.ms || '', signal: f.signal || '', q: f.q || '', closed: !!f.closed });
    $('#q').value = state.q; $('#typeFilter').value = state.type; $('#showClosed').checked = state.closed;
    if (v.sort) { tableSort.key = v.sort.key; tableSort.dir = v.sort.dir; }
    setView(VIEWS.includes(v.view) ? v.view : 'board');
  }

  async function saveViewDialog() {
    const f = currentFilter();
    const defKey = 'works-default-view-' + meta.project;
    const r = await showDialog('<h2>' + tr('Save view') + '</h2><label class="field"><span>' + tr('Name') + '</span><input class="input" name="name" required maxlength="40" placeholder="' + tr('For example Bot urgent') + '" autofocus></label>' +
      '<div class="field"><span>' + tr('Will be saved') + '</span><p class="lead" style="margin:0">' + esc(describeFilter({ filter: f, view: state.view, sort: state.view === 'table' ? tableSort : null })) + '</p></div>' +
      (!f.signal ? '<label class="toggle"><input type="checkbox" name="unblocked"> ' + tr('Hide blocked tasks') + '</label>' : '') +
      '<label class="toggle"><input type="checkbox" name="def"> ' + tr('Show this view when the board opens (this browser only)') + '</label>' +
      '<p class="sublabel">' + tr('Views apply to the whole project and are stored in .works/config.json. Claude can use them with works list --view "Name".') + '</p>' + foot(tr('Save')),
    async (fd) => {
      const name = String(fd.get('name') || '').trim();
      const filter = { ...f, signal: fd.get('unblocked') === 'on' ? 'unblocked' : f.signal };
      const res = await act('viewSave', { name, filter, view: state.view, sort: state.view === 'table' ? { key: tableSort.key, dir: tableSort.dir } : null });
      if (fd.get('def') === 'on') store.set(defKey, name);
      return res;
    });
    if (r) ok(r.message);
  }

  // ---------- Benachrichtigungen ----------

  const NKEY = 'works-notify-' + meta.project;
  const NDEF = { on: false, perm: true, review: true, question: true, p1: true, unblocked: false, queueEmpty: true, any: false, sound: true, title: true };
  let notifySet = { ...NDEF, ...store.get(NKEY, {}) };
  let hiddenCount = 0;
  const baseTitle = () => (lvPermEntry() ? tr('Approval') + ' · ' : '') + 'Works ' + meta.project;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { hiddenCount = 0; document.title = baseTitle(); } });

  function beep() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      const ctx = new C(); const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4);
    } catch (e) { /* kein Ton */ }
  }

  function notifyChanges(prev, next, found) {
    const s = notifySet;
    if (!s.on) return;
    const before = new Map(prev.map((t) => [t.id, t]));
    const ev = [];
    for (const t of next.tasks) {
      const o = before.get(t.id);
      const own = /\[Board\]$/.test(t.lastLog || '');
      if (!o) { if (s.p1 && t.priority === 'P1' && !own) ev.push({ id: t.id, title: tr('New P1: {id}', { id: t.id }), body: t.title }); continue; }
      if (own && !(t.comments > o.comments && t.lastCommentBy === 'Claude')) continue;
      if (s.review && o.status !== 'review' && t.status === 'review') ev.push({ id: t.id, title: tr('{id} awaits your review', { id: t.id }), body: t.title + (t.crit[1] ? ', ' + tr('{a} of {b} criteria met', { a: t.crit[0], b: t.crit[1] }) : '') });
      else if (s.any && o.status !== t.status) ev.push({ id: t.id, title: t.id + ': ' + L(o.status) + ' → ' + L(t.status), body: t.title });
      if (s.question && t.questions.length > o.questions.length) ev.push({ id: t.id, title: tr('Question about {id}', { id: t.id }), body: t.questions[t.questions.length - 1] });
      if (s.question && t.comments > o.comments && t.lastCommentBy === 'Claude') ev.push({ id: t.id, title: tr('Claude commented on {id}', { id: t.id }), body: t.title });
      if (s.question && t.design && t.design.variants > ((o.design && o.design.variants) || 0)) ev.push({ id: t.id, title: tr('New design variants for {id}', { id: t.id }), body: t.title });
      if (s.p1 && o.priority !== 'P1' && t.priority === 'P1') ev.push({ id: t.id, title: tr('{id} is now P1', { id: t.id }), body: t.title });
      if (s.unblocked && o.blocked && !t.blocked && OPEN.includes(t.status)) ev.push({ id: t.id, title: tr('{id} can now be started', { id: t.id }), body: t.title });
    }
    // Freigabe: einmal je Rechteabfrage, erkannt an ihrer Startzeit.
    const permAt = (a) => (a && a.busy && a.current && a.current.perm ? a.current.permSince || a.current.at : '');
    const pn = permAt(next.meta.activity);
    if (s.perm && pn && pn !== permAt(meta.activity)) { const c = next.meta.activity.current; ev.push({ id: c.task || '', title: tr('Claude is waiting for your approval'), body: (c.task ? c.task + ': ' : '') + c.verb + (c.what ? ' ' + c.what : '') }); }
    if (s.queueEmpty && (meta.queue || []).length && !(next.meta.queue || []).length) ev.push({ id: '', title: tr('Queue empty'), body: tr('Claude has worked through all queued tasks.') });
    if (!ev.length) return;
    if (document.hidden) {
      hiddenCount += ev.length;
      if (s.title) document.title = '(' + hiddenCount + ') ' + baseTitle();
      if ('Notification' in window && Notification.permission === 'granted') {
        for (const e of ev.slice(0, 3)) {
          try { const n = new Notification(e.title, { body: e.body, tag: 'works-' + (e.id || 'queue') }); n.onclick = () => { window.focus(); if (e.id) focusCard(e.id); n.close(); }; } catch (err) { /* blockiert */ }
        }
      }
      if (s.sound) beep();
    }
  }

  async function testNotification() {
    if (!('Notification' in window)) return fail(new Error(tr('This browser does not support notifications.')));
    if (Notification.permission !== 'granted') await Notification.requestPermission();
    if (Notification.permission !== 'granted') return fail(new Error(tr('Notifications are blocked in the browser. Allow them in the site settings.')));
    new Notification('works ' + meta.project, { body: tr('This is what a notification looks like. A click opens the board.') });
    if (notifySet.sound) beep();
  }

  // ---------- Werkzeuge: Bericht, Vorlagen, Prüfungen, Benachrichtigungen ----------

  // Prüfungs-Gesundheit (W-0014): je Prüfung über alle Aufgaben, sortierbar nach oft rot, langsam, wackelig.
  let hthSort = 'red';
  let hthAll = false;
  function hthHtml(hd) {
    const rate = (c) => c.fails / c.runs;
    const by = { red: (a, b) => rate(b) - rate(a) || b.fails - a.fails, slow: (a, b) => (b.median || 0) - (a.median || 0), flaky: (a, b) => (b.flaky - a.flaky) || rate(b) - rate(a) };
    const rows = [...hd.checks].sort(by[hthSort]);
    const shown = hthAll ? rows : rows.slice(0, 10);
    return '<div class="hth-tabs" role="group" aria-label="' + tr('Sort order') + '">' + [['red', tr('Often red')], ['slow', tr('Slow')], ['flaky', tr('Flaky')]].map(([k, l]) => '<button type="button" data-hth="' + k + '" aria-pressed="' + (hthSort === k) + '">' + l + '</button>').join('') + '</div>' +
      // Schmal genug für die Seitenleiste: Läufe als Tooltip an "Rot", wackelig am Namen.
      '<div class="hth-wrap"><table class="hth"><thead><tr><th>' + tr('Check') + '</th><th class="num">' + tr('Red') + '</th><th class="num">Median</th><th class="opt">' + tr('Recent') + '</th></tr></thead><tbody>' +
      shown.map((c) => {
        const pct = Math.round(rate(c) * 100);
        const up = c.trend && c.trend.dir === 'up';
        return '<tr><td class="nm"><div class="nmw"><span class="nmt" title="' + esc(c.name) + '">' + esc(c.name) + '</span>' + (c.flaky ? '<span class="flk">' + tr('flaky') + '</span>' : '') + '</div></td>' +
          '<td class="num" title="' + (c.runs === 1 ? tr('{a} of 1 run red', { a: c.fails }) : tr('{a} of {b} runs red', { a: c.fails, b: c.runs })) + '"><span class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' + pct + ' %</td>' +
          '<td class="num' + (up ? ' slow' : '') + '">' + (c.median == null ? '–' : lvMs(c.median)) + (c.trend ? (up ? ' ↑' : ' ↓') : '') + '</td>' +
          '<td class="opt"><span class="lv-hist" aria-hidden="true">' + c.last.map((s) => '<i class="' + (s === 'ok' ? 'ok' : 'fail') + '"></i>').join('') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (rows.length > 10 ? '<button type="button" class="btn link" data-hth-all>' + (hthAll ? tr('Show less') : tr('Show all {n}', { n: rows.length })) + '</button>' : '');
  }

  async function renderTools(body, head) {
    const [rep, tpls, chk, health] = await Promise.all([
      api('GET', 'api/reports').catch(() => null), api('GET', 'api/templates').catch(() => []), EDIT ? api('GET', 'api/checks').catch(() => null) : Promise.resolve(null),
      api('GET', 'api/check-health').catch(() => null),
    ]);
    const theme = store.get('works-theme', 'auto');
    const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    const days = ['', tr('Monday'), tr('Tuesday'), tr('Wednesday'), tr('Thursday'), tr('Friday'), tr('Saturday'), tr('Sunday')];
    const sw = (key, label, on, attrs = '') => '<label class="switch small"><span><b>' + esc(label) + '</b></span><input type="checkbox" ' + attrs + (on ? ' checked' : '') + (EDIT ? '' : ' disabled') + ' data-k="' + key + '"><i aria-hidden="true"></i></label>';
    const s = rep ? rep.settings : null;
    const h = [head(tr('Tools'))];
    if (rep) {
      h.push('<details class="sec" open><summary>' + tr('Weekly report') + '</summary><div class="body">' +
        '<p class="md">' + tr('Numbers and lists from the tasks; Claude writes the summary. When a report is due, the hook reminds you at the next session start.') + '</p>' +
        (EDIT ? '<div id="repSet">' + sw('enabled', tr('Automatically every week'), s.enabled) +
          '<div class="row-btns"><select class="input" data-k="weekday" style="flex:1">' + days.slice(1).map((d, i) => '<option value="' + (i + 1) + '"' + (s.weekday === i + 1 ? ' selected' : '') + '>' + d + 's</option>').join('') + '</select><input type="time" class="input" data-k="time" value="' + esc(s.time) + '" style="flex:0 0 120px"></div>' +
          sw('file', tr('File in .works/reports'), s.destinations.file) + sw('discord', tr('Send to Discord'), s.destinations.discord) +
          '<div class="add-row"><input class="input" id="hookIn" type="url" placeholder="' + (rep.webhook ? tr('Webhook saved, enter a new URL to change it') : tr('Discord webhook URL')) + '" autocomplete="off"><button class="btn small" id="hookSave">' + (rep.webhook ? tr('Replace') : tr('Save')) + '</button>' + (rep.webhook ? '<button class="btn small ghost" id="hookDel">' + tr('Remove') + '</button>' : '') + '</div>' +
          '<p class="sublabel">' + tr('The URL stays on this computer only (.works/report.local.json, not in Git).') + '</p>' +
          sw('done', tr('Done and started'), s.include.done) + sw('attention', tr('What needs you'), s.include.attention) + sw('next', tr('Plan for next week'), s.include.next) + sw('milestones', tr('Milestones'), s.include.milestones) + '</div>' +
          '<label class="field"><span>' + tr('Summary, optional') + '</span><textarea class="input" id="repSum" rows="2" placeholder="' + tr('Without text, a short summary is generated from the numbers.') + '"></textarea></label><div class="row-btns"><button class="btn small primary" id="repRun">' + esc(tr('Create report for {week}', { week: rep.current.replace('-', ', ') })) + '</button></div>' : '') +
        (rep.reports.length ? '<ul class="rep-list">' + rep.reports.map((r) => '<li><span>' + esc(r.name.replace('-', ', ')) + '</span>' + (r.html ? '<a href="' + esc(r.html) + '#theme=' + (dark ? 'dark' : 'light') + '" target="_blank" rel="noopener">' + tr('View report') + '</a>' : '') + (r.md ? '<a href="' + esc(r.md) + '" target="_blank" rel="noopener">Markdown</a>' : '') + '</li>').join('') + '</ul>' : '<p class="md empty-md">' + tr('No reports yet.') + '</p>') +
        '</div></details>');
    }
    if (EDIT) {
      h.push('<details class="sec" open><summary>' + tr('Templates') + ' <span class="meta">' + tpls.length + '</span></summary><div class="body">' +
        (tpls.length ? tpls.map((t) => '<div class="tpl-row"><div class="q-t"><strong>' + esc(t.name) + '</strong><span class="q-meta">' + esc((meta.typeLabel[t.type] || t.type) + ', ' + tr('{n} fields', { n: t.fields.length }) + ', ' + tr('{n} criteria', { n: t.criteria.length }) + (t.uses ? ', ' + tr('used {n}x', { n: t.uses }) : '') + (t.scope === 'user' ? ', ' + tr('all projects') : '')) + '</span></div><button class="btn small" data-tuse="' + esc(t.slug) + '">' + tr('Use') + '</button><button class="btn small ghost" data-tedit="' + esc(t.slug) + '">' + tr('Edit') + '</button></div>').join('') : '<p class="md empty-md">' + tr('No templates yet. Create a new one or save an existing task as a template in the detail panel.') + '</p>') +
        '<div class="row-btns"><button class="btn small primary" id="tplNew">' + tr('New template') + '</button></div></div></details>');
    }
    if (chk) {
      const rows = Object.entries(chk.checks);
      h.push('<details class="sec"' + (rows.length ? '' : ' open') + '><summary>' + tr('Checks before completion') + ' <span class="meta">' + rows.length + '</span></summary><div class="body">' +
        '<p class="md">' + tr('Run on works done and in the completion dialog. Red blocks completion, a finding needs your decision. Claude runs {skill} and records the result.', { skill: '<code>skill:code-audit</code>' }) + '</p>' +
        '<div id="ckRows">' + (rows.length ? rows : Object.entries(chk.detected)).map(([k, v]) => ckRow(k, v)).join('') + '</div>' +
        (!rows.length ? '<p class="sublabel">' + tr('Suggested from your project. Active only after saving.') + '</p>' : '') +
        '<div class="row-btns"><button class="btn small" id="ckAdd">' + tr('Add check') + '</button><button class="btn small primary" id="ckSave">' + tr('Save') + '</button></div></div></details>');
    }
    if (health && health.checks.length) {
      h.push('<details class="sec"><summary>' + tr('Checks in the project') + ' <span class="meta">' + (health.checks.length === 1 ? tr('1 check') : tr('{n} checks', { n: health.checks.length })) + ', ' + (health.tasks === 1 ? tr('1 task') : tr('{n} tasks', { n: health.tasks })) + '</span></summary><div class="body" id="hthBox">' + hthHtml(health) + '</div></details>');
    }
    h.push(await toolsExtra());
    h.push('<details class="sec"><summary>' + tr('Notifications') + ' <span class="meta">' + (notifySet.on ? tr('on') : tr('off')) + '</span></summary><div class="body" id="ntSet">' +
      '<p class="md">' + tr('Notifies you while the tab is in the background. Applies to this browser only.') + '</p>' +
      [['on', tr('Notifications enabled')], ['perm', tr('Claude is waiting for your approval')], ['review', tr('Task moves to review')], ['question', tr('Question or comment from Claude')], ['p1', tr('New task with P1')], ['unblocked', tr('Blocker resolved')], ['queueEmpty', tr('Queue ran empty')], ['any', tr('Every status change')], ['sound', tr('Play sound')], ['title', tr('Counter in the tab title')]].map(([k, l]) => '<label class="switch small"><span><b>' + l + '</b></span><input type="checkbox" data-n="' + k + '"' + (notifySet[k] ? ' checked' : '') + '><i aria-hidden="true"></i></label>').join('') +
      '<div class="row-btns"><button class="btn small" id="ntTest">' + tr('Send test notification') + '</button></div></div></details>');
    body.innerHTML = h.join('');
    $$('[data-sclose]', body).forEach((b) => b.onclick = closeSide);
    $$('#ntSet [data-n]', body).forEach((c) => c.onchange = async () => {
      notifySet = { ...notifySet, [c.dataset.n]: c.checked };
      store.set(NKEY, notifySet);
      if (c.dataset.n === 'on' && c.checked && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    });
    $('#ntTest', body).onclick = testNotification;
    const hb = $('#hthBox', body);
    if (hb) hb.onclick = (e) => {
      const s = e.target.closest('[data-hth]');
      if (s) { hthSort = s.dataset.hth; hb.innerHTML = hthHtml(health); return; }
      if (e.target.closest('[data-hth-all]')) { hthAll = !hthAll; hb.innerHTML = hthHtml(health); }
    };
    bindToolsExtra(body);
    if (!EDIT) return;
    $$('#repSet [data-k]', body).forEach((el) => el.onchange = () => {
      const k = el.dataset.k;
      const v = el.type === 'checkbox' ? el.checked : el.value;
      run(() => act('reportSettings', { [k]: v }), tr('Saved'));
    });
    const hs = $('#hookSave', body);
    if (hs) hs.onclick = async () => { const url = $('#hookIn', body).value.trim(); if (url && await run(() => act('reportWebhook', { url }), tr('Webhook saved'))) renderSide(); };
    const hd = $('#hookDel', body);
    if (hd) hd.onclick = async () => { if (await run(() => act('reportWebhook', { url: '' }), tr('Webhook removed'))) renderSide(); };
    const rr = $('#repRun', body);
    if (rr) rr.onclick = async () => { rr.disabled = true; const r = await run(() => act('reportRun', { summary: $('#repSum', body).value }), (x) => x.message); rr.disabled = false; if (r) renderSide(); };
    $$('[data-tuse]', body).forEach((b) => b.onclick = async () => { closeSide(); const list = await api('GET', 'api/templates'); pickTemplate(list, {}, b.dataset.tuse); });
    $$('[data-tedit]', body).forEach((b) => b.onclick = () => editTemplate(b.dataset.tedit));
    $('#tplNew', body).onclick = () => editTemplate(null);
    const ckBox = $('#ckRows', body);
    if (ckBox) {
      const bindRm = () => $$('[data-ckrm]', ckBox).forEach((b) => b.onclick = () => b.closest('.ck-edit').remove());
      bindRm();
      $('#ckAdd', body).onclick = () => { ckBox.insertAdjacentHTML('beforeend', ckRow('', '')); bindRm(); };
      $('#ckSave', body).onclick = async () => {
        const checks = {};
        $$('.ck-edit', ckBox).forEach((r) => {
          const k = $('[data-ckk]', r).value.trim(); const v = $('[data-ckv]', r).value.trim(); const d = $('[data-ckd]', r).value.trim();
          if (k && v) checks[k] = d ? { cmd: v, cwd: d } : v;
        });
        if (await run(() => act('checksSave', { checks }), (x) => x.message)) renderSide();
      };
    }
  }

  // v: Befehl als Text oder { cmd, cwd } mit Arbeitsordner relativ zum Projekt.
  const ckRow = (k, v) => {
    const cmd = v && typeof v === 'object' ? v.cmd || '' : v || '';
    const cwd = v && typeof v === 'object' ? v.cwd || '' : '';
    return '<div class="ck-edit add-row"><input class="input mono" data-ckk value="' + esc(k) + '" placeholder="name" style="flex:0 0 110px" maxlength="30" aria-label="' + tr('Name') + '"><input class="input mono" data-ckv value="' + esc(cmd) + '" placeholder="' + tr('Command, e.g. npm test') + '" maxlength="300" aria-label="' + tr('Command') + '"><input class="input mono" data-ckd value="' + esc(cwd) + '" placeholder="' + tr('Folder') + '" style="flex:0 0 120px" maxlength="200" aria-label="' + tr('Working folder, relative to the project') + '" title="' + tr('Working folder relative to the project, empty for the project itself') + '"><button class="btn small ghost icon" data-ckrm aria-label="' + tr('Remove') + '">×</button></div>';
  };

  // ---------- Vorlagen nutzen und bearbeiten ----------

  async function pickTemplate(tpls, prefill = {}, preselect = '') {
    let sel = preselect && tpls.some((t) => t.slug === preselect) ? preselect : tpls[0].slug;
    let titleTouched = false;
    const fillT = (text, vals) => String(text || '').replace(/\{([\p{L}\p{N}_]{1,30})\}/gu, (a, k) => vals[k] || a);
    const pane = (t) => '<label class="field"><span>' + tr('Title') + '</span><input class="input" name="title" maxlength="160" value="' + esc(fillT(t.title, {}) || t.name) + '" data-ttl></label>' +
      '<div class="tp-tags"><span class="tag">' + esc(meta.typeLabel[t.type] || t.type) + '</span>' + (t.effort ? '<span class="tag">' + esc(tr('Effort {effort}', { effort: t.effort })) + '</span>' : '') + t.tags.map((x) => '<span class="tag">#' + esc(x) + '</span>').join('') + '</div>' +
      (t.fields.length ? '<div class="grid">' + t.fields.map((f) => '<label class="field span2"><span>' + esc(f.key) + (f.required ? ' *' : '') + (f.hint ? ' <span class="sublabel">' + esc(f.hint) + '</span>' : '') + '</span>' + (f.kind === 'choice' ? '<select name="f_' + esc(f.key) + '" data-fk="' + esc(f.key) + '"' + (f.required ? ' required' : '') + '><option value="">' + tr('Choose') + '</option>' + f.options.map((o) => '<option>' + esc(o) + '</option>').join('') + '</select>' : '<input class="input" name="f_' + esc(f.key) + '" data-fk="' + esc(f.key) + '" maxlength="300"' + (f.required ? ' required' : '') + '>') + '</label>').join('') + '</div>' : '') +
      '<label class="field"><span>' + tr('What exactly should happen?') + '</span><textarea class="input" name="text" rows="5" placeholder="' + tr('Describe in your own words what this task should achieve. Takes precedence over the template base text.') + '"></textarea><span class="sublabel">' + tr('Goes into the description together with the fields. Claude reads it as your instruction.') + '</span></label>' +
      (t.criteria.length ? '<div class="field"><span>' + tr('Acceptance criteria from the template') + '</span><ul class="dod">' + t.criteria.map((c, i) => '<li><label><input type="checkbox" name="c_' + i + '"' + (c.mode !== 'optional' ? ' checked' : '') + (c.mode === 'always' ? ' disabled' : '') + '><span>' + esc(c.text) + (c.mode === 'always' ? ' <span class="sublabel">' + tr('always') + '</span>' : '') + '</span></label></li>').join('') + '</ul></div>' : '') +
      '<div class="grid"><div class="field span2"><span>' + tr('Priority') + '</span>' + segCtl('priority', PRIOS.map((p) => ({ id: p, label: p, dot: prioVar(p) })), t.priority) + '</div><div class="field span2"><span>' + tr('Column') + '</span>' + segCtl('status', [{ id: 'backlog', label: 'Backlog' }, { id: 'geplant', label: tr('Planned') }], prefill.status || 'backlog') + '</div></div>';
    const html = '<h2>' + tr('New task') + '</h2><div class="tp"><nav class="tp-list" aria-label="' + tr('Templates') + '"><button type="button" class="tp-item" data-tp="">' + tr('Blank') + '<span>' + tr('no template') + '</span></button>' +
      tpls.map((t) => '<button type="button" class="tp-item" data-tp="' + esc(t.slug) + '" aria-pressed="' + (t.slug === sel) + '">' + esc(t.name) + '<span>' + esc((meta.typeLabel[t.type] || t.type) + ', ' + tr('{n} criteria', { n: t.criteria.length }) + (t.uses ? ', ' + t.uses + 'x' : '')) + '</span></button>').join('') +
      '<button type="button" class="tp-item new" data-tpnew>' + tr('Create your own template') + '</button></nav><div class="tp-pane" id="tpPane"></div></div>' + foot(tr('Create task'));
    let wantBlank = false; let wantNew = false;
    const r = await showDialog(html, async (fd) => {
      const t = tpls.find((x) => x.slug === sel);
      const values = {};
      t.fields.forEach((f) => { values[f.key] = String(fd.get('f_' + f.key) || '').trim(); });
      const criteria = t.criteria.map((c, i) => (c.mode !== 'always' && fd.get('c_' + i) === 'on' ? i : -1)).filter((i) => i >= 0);
      return act('createFromTemplate', { slug: sel, values, text: String(fd.get('text') || ''), criteria, title: titleTouched ? String(fd.get('title') || '').trim() : '', priority: fd.get('priority'), status: fd.get('status') });
    }, (f) => {
      const show = () => {
        const t = tpls.find((x) => x.slug === sel);
        $('#tpPane', f).innerHTML = pane(t);
        $$('[data-tp]', f).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tp === sel)));
        bindDuplicateCheck($('#tpPane', f));
        titleTouched = false;
        const ttl = $('[data-ttl]', f);
        ttl.oninput = () => { titleTouched = true; };
        $$('[data-fk]', f).forEach((el) => el.oninput = el.onchange = () => {
          if (titleTouched) return;
          const vals = {}; $$('[data-fk]', f).forEach((x) => { vals[x.dataset.fk] = x.value.trim(); });
          ttl.value = fillT(t.title, vals) || t.name;
        });
      };
      $$('[data-tp]', f).forEach((b) => b.onclick = () => {
        if (!b.dataset.tp) { wantBlank = true; $('button[value="cancel"]', f).click(); return; }
        sel = b.dataset.tp; show();
      });
      $('[data-tpnew]', f).onclick = () => { wantNew = true; $('button[value="cancel"]', f).click(); };
      show();
    });
    if (r) { ok(r.message); pendingOpen = r.id; }
    else if (wantBlank) newTask({ ...prefill, blank: true });
    else if (wantNew) editTemplate(null);
  }

  async function editTemplate(slug, fromTask) {
    let tpl = null; let scope = 'project';
    try {
      if (slug) { const all = await api('GET', 'api/templates'); tpl = all.find((t) => t.slug === slug); scope = tpl ? tpl.scope : 'project'; }
      else if (fromTask) tpl = await api('GET', 'api/template-draft?id=' + encodeURIComponent(fromTask));
    } catch (e) { return fail(e); }
    tpl = tpl || { name: '', about: '', title: '', type: 'feature', priority: 'P3', effort: '', tags: [], fields: [], description: '', hints: '', criteria: [] };
    const opt = (list, cur, lab) => list.map((v) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(lab ? lab(v) : v || tr('not set')) + '</option>').join('');
    const fieldRow = (f) => '<div class="te-field"><span class="grip" aria-hidden="true">⋮⋮</span><input class="input mono" data-fkey value="' + esc(f.key || '') + '" placeholder="' + tr('Name') + '" maxlength="30" aria-label="' + tr('Field name') + '"><select class="input" data-fkind aria-label="' + tr('Kind') + '"><option value="text"' + (f.kind !== 'choice' ? ' selected' : '') + '>Text</option><option value="choice"' + (f.kind === 'choice' ? ' selected' : '') + '>' + tr('Choice') + '</option></select><input class="input" data-fopts value="' + esc((f.options || []).join(', ')) + '" placeholder="' + tr('Options, comma-separated') + '" ' + (f.kind === 'choice' ? '' : 'hidden') + ' aria-label="' + tr('Options') + '"><label class="toggle"><input type="checkbox" data-freq' + (f.required ? ' checked' : '') + '> ' + tr('Required') + '</label><button type="button" class="btn small ghost icon" data-frm aria-label="' + tr('Remove field') + '">×</button></div>';
    const critRow = (c) => '<div class="te-crit"><input class="input" data-ctext value="' + esc(c.text || '') + '" placeholder="' + tr('Checkable with yes or no, fields as {Name}') + '" maxlength="300" aria-label="' + tr('Criterion') + '"><select class="input" data-cmode aria-label="' + tr('Kind') + '"><option value="always"' + (c.mode === 'always' ? ' selected' : '') + '>' + tr('always') + '</option><option value="default"' + (c.mode === 'default' ? ' selected' : '') + '>' + tr('preselected') + '</option><option value="optional"' + (c.mode === 'optional' ? ' selected' : '') + '>optional</option></select><button type="button" class="btn small ghost icon" data-crm aria-label="' + tr('Remove criterion') + '">×</button></div>';
    const html = '<h2>' + (slug ? tr('Edit template') : tr('Create your own template')) + '</h2>' +
      '<div class="grid"><label class="field span2"><span>' + tr('Template name') + '</span><input class="input" name="name" required maxlength="80" value="' + esc(tpl.name) + '" autofocus></label><label class="field span2"><span>' + tr('Task title, fields as {Name}') + '</span><input class="input mono" name="title" maxlength="160" value="' + esc(tpl.title) + '" placeholder="Dashboard: {' + tr('Page') + '}"></label>' +
      '<label class="field"><span>' + tr('Type') + '</span><select name="type">' + opt(Object.keys(meta.typeLabel), tpl.type, (v) => meta.typeLabel[v]) + '</select></label><label class="field"><span>' + tr('Priority') + '</span><select name="priority">' + opt(PRIOS, tpl.priority) + '</select></label><label class="field"><span>' + tr('Effort') + '</span><select name="effort">' + opt(['', 'S', 'M', 'L', 'XL'], tpl.effort) + '</select></label><label class="field"><span>Tags</span><input class="input" name="tags" value="' + esc(tpl.tags.join(', ')) + '"></label></div>' +
      '<label class="field"><span>' + tr('Short description, optional') + '</span><input class="input" name="about" maxlength="200" value="' + esc(tpl.about || '') + '" placeholder="' + tr('What is the template for?') + '"></label>' +
      '<div class="field"><span>' + tr('Fields when creating') + '</span><div id="teFields">' + tpl.fields.map(fieldRow).join('') + '</div><div class="row-btns"><button type="button" class="btn small" id="teFieldAdd">' + tr('Add field') + '</button></div></div>' +
      '<label class="field"><span>' + tr('Base text of the description') + '</span><textarea class="input mono" name="description" rows="5" placeholder="' + tr('Insert fields with {Name}. When creating, a free field “What exactly should happen?” is added, which takes precedence.') + '">' + esc(tpl.description) + '</textarea></label>' +
      '<div class="field"><span>' + tr('Acceptance criteria') + '</span><div id="teCrit">' + tpl.criteria.map(critRow).join('') + '</div><div class="row-btns"><button type="button" class="btn small" id="teCritAdd">' + tr('Add a criterion') + '</button></div></div>' +
      '<label class="field"><span>' + tr('Notes for Claude, optional') + '</span><textarea class="input" name="hints" rows="2" maxlength="2000" placeholder="' + tr('For example: use the UI UX Pro Max skill first') + '">' + esc(tpl.hints || '') + '</textarea></label>' +
      '<div class="field"><span>' + tr('Save for') + '</span>' + segCtl('scope', [{ id: 'project', label: tr('This project') }, { id: 'user', label: tr('All my projects') }], scope) + '</div>' +
      foot(tr('Save template'), { extra: slug ? '<button type="button" class="btn danger" id="teDel" style="margin-right:auto">' + tr('Delete') + '</button>' : '' });
    const r = await showDialog(html, (fd, sub) => {
      const fields = $$('.te-field', form).map((row) => ({ key: $('[data-fkey]', row).value.trim(), kind: $('[data-fkind]', row).value, options: $('[data-fopts]', row).value.split(',').map((s) => s.trim()).filter(Boolean), required: $('[data-freq]', row).checked })).filter((f) => f.key);
      const criteria = $$('.te-crit', form).map((row) => ({ text: $('[data-ctext]', row).value.trim(), mode: $('[data-cmode]', row).value })).filter((c) => c.text);
      const template = { name: fd.get('name'), title: fd.get('title'), type: fd.get('type'), priority: fd.get('priority'), effort: fd.get('effort'), tags: String(fd.get('tags') || '').split(','), about: fd.get('about'), description: fd.get('description'), hints: fd.get('hints'), fields, criteria };
      if (slug) template.slug = slug;
      return act('templateSave', { template, scope: fd.get('scope'), oldSlug: slug || '' });
    }, (f) => {
      const bind = () => {
        $$('[data-frm]', f).forEach((b) => b.onclick = () => b.closest('.te-field').remove());
        $$('[data-crm]', f).forEach((b) => b.onclick = () => b.closest('.te-crit').remove());
        $$('[data-fkind]', f).forEach((s2) => s2.onchange = () => { s2.parentElement.querySelector('[data-fopts]').hidden = s2.value !== 'choice'; });
      };
      $('#teFieldAdd', f).onclick = () => { $('#teFields', f).insertAdjacentHTML('beforeend', fieldRow({ kind: 'text' })); bind(); $('#teFields .te-field:last-child [data-fkey]', f).focus(); };
      $('#teCritAdd', f).onclick = () => { $('#teCrit', f).insertAdjacentHTML('beforeend', critRow({ mode: 'always' })); bind(); $('#teCrit .te-crit:last-child [data-ctext]', f).focus(); };
      const del = $('#teDel', f);
      if (del) del.onclick = async () => { if (!confirm(tr('Delete template “{name}”?', { name: tpl.name }))) return; if (await run(() => act('templateDelete', { slug }), tr('Template deleted'))) { $('button[value="cancel"]', f).click(); if (side === 'tools') renderSide(); } };
      bind();
    });
    if (r) { ok(r.message); if (side === 'tools') renderSide(); }
  }

  // ---------- Runde 3: Hilfen ----------

  const fmtTok = (n) => (n >= 1e6 ? tr('{n} M', { n: deComma((n / 1e6).toFixed(1)) }) : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n || 0));
  const fmtMoney = (v, cur) => deComma(v > 0 && v < 0.1 ? v.toFixed(3) : (v || 0).toFixed(2)) + ' ' + (!cur || cur === 'USD' ? '$' : esc(cur));
  const timeOf = (iso) => { try { return new Date(iso).toLocaleTimeString(I18N.lang === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

  function undoToast(msg, key) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast undo';
    el.innerHTML = '<div class="row"><div class="what">' + esc(msg) + '</div><button class="btn small" type="button">' + tr('Undo') + '</button></div><span class="ut"><i></i></span>';
    $('button', el).onclick = async (e) => { e.stopPropagation(); el.remove(); await run(() => act('undo', { key }), (x) => x.message); };
    el.onclick = () => el.remove();
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 8000);
  }

  // ---------- Claude arbeitet gerade ----------

  function liveBlock(t) {
    const a = meta.activity;
    const laneE = a && a.lanes ? a.lanes[t.id] : null;
    const cur = laneE || (a && a.busy && a.current && a.current.task === t.id ? a.current : null);
    if (!cur || t.status !== 'in-arbeit') return '';
    if (Date.now() - Date.parse(cur.at) > 10 * 60000) return '';
    const plan = t.plan || null;
    const recent = (a.recent || []).filter((r) => r.task === t.id).slice(1, 4);
    const pend = (meta.instructions || []).filter((x) => x.task === t.id).length;
    return '<div class="live-box">' + (laneE ? '<span class="lb-lane">' + tr('Agent in its own worktree') + '</span>' : '') + '<span class="lb-head"><i class="lb-dot" aria-hidden="true"></i>' + esc(cur.verb) + (cur.what ? ' <code>' + esc(cur.what) + '</code>' : '') + '</span>' +
      (recent.length ? '<ol class="lb-list">' + recent.map((r) => '<li><span class="muted num">' + esc(timeOf(r.at)) + '</span> ' + esc(r.verb) + ' <span class="mono">' + esc(r.what) + '</span>' + (r.ok === false ? ' <span class="late">' + tr('Error') + '</span>' : '') + '</li>').join('') + '</ol>' : '') +
      (EDIT ? '<button class="btn small" data-instr="' + esc(t.id) + '">' + tr('Instruction to Claude') + (pend ? ' (' + tr('{n} waiting', { n: pend }) + ')' : '') + '</button>' : '') + '</div>';
  }

  function instructBox(id) {
    const pend = (meta.instructions || []).filter((x) => x.task === id);
    return '<div class="block instr"><div class="block-head"><h3>' + tr('Instruction to Claude') + '</h3><span class="meta">' + tr('Claude reads it when it makes sense, usually after the current step') + '</span></div>' +
      (pend.length ? '<ul class="instr-list">' + pend.map((x) => '<li><span class="muted num">' + esc(x.at.slice(11, 16)) + '</span> ' + esc(x.text) + ' <span class="tag">' + tr('waiting') + '</span></li>').join('') + '</ul>' : '') +
      '<div class="add-row"><input class="input" data-instr-in="' + esc(id) + '" maxlength="4000" placeholder="' + tr('For example: please also back up threads in forum channels') + '"><button class="btn small primary" data-instr-send="' + esc(id) + '">' + tr('Send') + '</button></div></div>';
  }

  async function sendInstruction(id, text) {
    if (!text.trim()) return false;
    return !!(await run(() => act('instruct', { id, text }), (x) => x.message));
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-instr]');
    if (b) {
      e.preventDefault(); e.stopPropagation();
      const text = await askText({ title: tr('Instruction to Claude'), lead: b.dataset.instr + ': ' + tr('Claude reads it when it makes sense, usually after the current step. It stays on the task as a comment.'), label: tr('Instruction'), confirm: tr('Send'), required: true, multiline: true });
      if (text) sendInstruction(b.dataset.instr, text);
      return;
    }
    const s = e.target.closest('[data-instr-send]');
    if (s) {
      // Das Feld neben dem Knopf nehmen: Detailpanel und Live-Ansicht können gleichzeitig ein Feld für dieselbe Aufgabe haben.
      const inp = s.parentElement.querySelector('[data-instr-in="' + CSS.escape(s.dataset.instrSend) + '"]');
      if (inp && await sendInstruction(s.dataset.instrSend, inp.value)) inp.value = '';
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    const inp = e.target.closest && e.target.closest('[data-instr-in]');
    if (inp && e.key === 'Enter') { e.preventDefault(); sendInstruction(inp.dataset.instrIn, inp.value).then((okk) => { if (okk) inp.value = ''; }); }
  });

  // ---------- Live-Ansicht ----------
  // Zeigt, an welcher Aufgabe und welchem Schritt Claude arbeitet, was gerade läuft und wie die Prüfungen stehen.
  // Daten: task.plan und task.checks (nur Tagesliste), meta.activity, meta.lanes, meta.queue.

  const LIVE_FRESH_MS = 10 * 60000;
  // Auf eine Freigabe kann Claude lange warten. Eine Ablehnung meldet kein Hook, daher trotzdem eine Obergrenze.
  const LIVE_PERM_MS = 60 * 60000;
  const LIVE_KEY = 'works-live-' + meta.project;
  const livePrefs = Object.assign({ focus: '', feedAll: false }, store.get(LIVE_KEY, {}));
  let liveFollow = !livePrefs.focus;
  let liveSnap = null;
  let liveSeen = null;
  const LV_CK = { ok: tr('passed'), ack: tr('known'), fail: tr('failed'), warn: tr('finding'), manual: tr('Claude fills in'), run: tr('running'), wait: tr('not run yet') };
  const lvSvg = (p) => '<svg viewBox="0 0 16 16" aria-hidden="true">' + p + '</svg>';
  const LV_IC = {
    ok: lvSvg('<path d="M3.5 8.4l2.9 2.9 6.1-6.6"/>'),
    fail: lvSvg('<path d="M5 5l6 6M11 5l-6 6"/>'),
    warn: lvSvg('<path d="M8 4.2v4.4"/><path d="M8 11.5v.1"/>'),
    manual: lvSvg('<path d="M10.4 3.6l2 2L6.2 11.8H4.2v-2z"/>'),
    cur: lvSvg('<circle cx="8" cy="8" r="2.8" fill="currentColor" stroke="none"/>'),
    review: lvSvg('<path d="M1.8 8s2.3-4.2 6.2-4.2S14.2 8 14.2 8s-2.3 4.2-6.2 4.2S1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.8"/>'),
    next: lvSvg('<path d="M6 4l4 4-4 4"/>'),
    ask: lvSvg('<path d="M6 6a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.5"/><path d="M8 11.6v.1"/>'),
    chk: lvSvg('<path d="M8 2.5l4.5 1.8v3.6c0 2.8-2 4.6-4.5 5.6-2.5-1-4.5-2.8-4.5-5.6V4.3z"/>'),
    perm: lvSvg('<rect x="4" y="7.4" width="8" height="5.8" rx="1.2"/><path d="M5.8 7.4V5.6a2.2 2.2 0 0 1 4.4 0v1.8"/>'),
    trend: lvSvg('<path d="M2.5 11.5l4-4 2.5 2.5 4.5-5"/><path d="M10 5h3.5v3.5"/>'),
  };
  const lvSi = (st) => '<span class="lv-si ' + st + '" aria-hidden="true">' + (LV_IC[st === 'ack' ? 'ok' : st] || '') + '</span>';
  const lvPad = (n) => String(n).padStart(2, '0');
  const lvTime = (iso, sec) => { const d = new Date(iso); return isNaN(d) ? '' : lvPad(d.getHours()) + ':' + lvPad(d.getMinutes()) + (sec ? ':' + lvPad(d.getSeconds()) : ''); };
  const lvMs = (ms) => (ms < 60000 ? Math.round(ms / 1000) + ' s' : Math.floor(ms / 60000) + ':' + lvPad(Math.round(ms / 1000) % 60) + ' min');
  function lvSinceText(iso, fmt) {
    const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
    if (!isFinite(s)) return '';
    const v = Math.max(0, s);
    if (fmt === 'min') { const m = Math.max(1, Math.floor(v / 60)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }
    if (fmt === 'sec') return v < 60 ? v + ' s' : Math.floor(v / 60) + ':' + lvPad(v % 60) + ' min';
    return Math.floor(v / 60) + ':' + lvPad(v % 60);
  }
  // Zeitangabe, die der Sekundentakt weiterzählt.
  function lvSince(iso, fmt) { return '<span class="num" data-since="' + esc(iso) + '" data-fmt="' + (fmt || 'clock') + '">' + lvSinceText(iso, fmt) + '</span>'; }
  function liveFollowClaude() { liveFollow = true; livePrefs.focus = ''; store.set(LIVE_KEY, livePrefs); }
  // Frische-Grenzen laufen auch ohne neue Daten ab, etwa nach einem Abbruch mit Esc, bei dem kein Stop-Hook läuft.
  // Der Sekundentakt lädt dann einmal neu; der Server wertet ein veraltetes running dabei selbst aus.
  let liveDeadline = Infinity;
  function nextLiveDeadline() {
    const a = meta.activity;
    const times = [];
    if (a && a.busy && a.current) times.push(Date.parse(a.current.at) + lvTtl(a.current));
    if (a && a.lanes) for (const e of Object.values(a.lanes)) times.push(Date.parse(e.at) + lvTtl(e));
    for (const t of tasks) if (t.checks && t.checks.running) times.push(Date.parse(t.checks.runningSince) + 11 * 60000);
    // Befehle im Hintergrund (W-0059): fertige verschwinden eine Stunde nach dem Ende, verwaiste nach zwölf Stunden.
    for (const x of (a && a.background) || []) times.push(x.state === 'running' ? Date.parse(x.at) + 12 * 3600000 : (Date.parse(x.end) || Date.parse(x.at)) + 3600000);
    const future = times.filter((x) => x > Date.now());
    return future.length ? Math.min(...future) + 1000 : Infinity;
  }
  function lvTtl(e) { return e && e.perm ? LIVE_PERM_MS : LIVE_FRESH_MS; }
  function lvFresh(e) { return !!e && Date.now() - Date.parse(e.at) < lvTtl(e); }
  // Wartet Claude (oder ein Agent) gerade auf eine Freigabe? Liefert den Aufruf oder null.
  function lvPermEntry() {
    const a = meta.activity;
    if (!a) return null;
    if (a.busy && a.current && a.current.perm && lvFresh(a.current)) return a.current;
    // Nur Agenten, deren Bahn noch läuft. Einträge beendeter Bahnen bleiben sonst bis zu 60 Minuten stehen.
    const lanes = lvLanes();
    const e = Object.entries(a.lanes || {}).find(([id, x]) => lanes.has(id) && x.perm && lvFresh(x));
    return e ? e[1] : null;
  }
  const LV_PERM = { Bash: tr('a command'), Edit: tr('a change'), MultiEdit: tr('a change'), NotebookEdit: tr('a change'), Write: tr('a new file'), WebFetch: tr('a web request'), WebSearch: tr('a web search') };
  const lvNotifyOn = () => notifySet.on && notifySet.perm && 'Notification' in window && Notification.permission === 'granted';
  async function lvEnableNotify() {
    if (!('Notification' in window)) return fail(new Error(tr('This browser does not support notifications.')));
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') return fail(new Error(tr('Notifications are blocked in the browser. Allow them in the site settings.')));
    notifySet = { ...notifySet, on: true, perm: true };
    store.set(NKEY, notifySet);
    toast('<div class="what">' + tr('Notifications turned on') + '</div><div class="why">' + tr('Lets you know when Claude is waiting for an approval and the tab is in the background.') + '</div>');
    renderLive();
  }
  const lvLanes = () => new Set((meta.lanes || []).map((l) => l.task));

  function phaseOf(t) {
    if (t.status === 'erledigt') return 'erledigt';
    if (t.checks && t.checks.running) return 'pruefung';
    if (t.status === 'review') return 'review';
    if (t.status === 'in-arbeit') return 'umsetzung';
    if ((meta.queue || []).includes(t.id)) return 'queue';
    return '';
  }

  // Tagesliste: in Arbeit (Hauptsitzung vor Agenten), Review, Warteschlange in Queue-Reihenfolge, heute erledigt.
  function liveTasks() {
    const q = meta.queue || [];
    const lanes = lvLanes();
    const cur = meta.activity && meta.activity.current ? meta.activity.current.task : '';
    const rank = (t) => (t.status === 'in-arbeit' ? (lanes.has(t.id) ? 1 : t.id === cur ? 0 : 0.5) : t.status === 'review' ? 2 : t.status === 'erledigt' ? 4 : 3);
    return tasks.filter((t) => Array.isArray(t.plan)).sort((a, b) => rank(a) - rank(b) || q.indexOf(a.id) - q.indexOf(b.id) || a.id.localeCompare(b.id));
  }

  function lvSteps(t) { const p = t.plan || []; const cur = p.findIndex((s) => !s.done); return { done: p.filter((s) => s.done).length, total: p.length, cur, curT: cur >= 0 ? p[cur].text : '' }; }

  // Zustand einer Prüfung. Während eines Laufs zeigen Befehle nach dem laufenden "noch nicht gelaufen",
  // auch wenn ein Ergebnis aus einem früheren Lauf existiert.
  function lvCheckState(t, x) {
    const c = t.checks;
    if (c.running === x.name) return 'run';
    if (c.running && !x.skill) {
      const ri = c.list.findIndex((y) => y.name === c.running);
      if (c.list.indexOf(x) > ri) return 'wait';
    }
    const r = c.results[x.name];
    return r ? r.status : 'wait';
  }
  function lvChecks(t) {
    if (!t.checks) return null;
    const states = t.checks.list.map((x) => lvCheckState(t, x));
    const n = (...k) => states.filter((s) => k.includes(s)).length;
    return { total: states.length, ok: n('ok', 'ack'), warn: n('warn'), fail: n('fail'), finished: n('ok', 'ack', 'warn', 'fail'), running: t.checks.running };
  }
  const lvFinds = (c) => (c.fail ? tr('{n} failed', { n: c.fail }) : c.warn === 1 ? tr('1 finding') : tr('{n} findings', { n: c.warn }));

  function lvStatus(t) {
    const ph = phaseOf(t), s = lvSteps(t), c = lvChecks(t);
    const pe = lvNowOf(t);
    if (pe && pe.perm) return { ic: 'perm', text: tr('Waiting for your approval'), w: s.total ? s.done / s.total : null };
    if (ph === 'erledigt') return { ic: 'ok', text: tr('Done today') };
    if (ph === 'pruefung') return { ic: 'run', text: tr('Checks {done} of {total}, {name} running', { done: c.finished, total: c.total, name: c.running }), w: c.finished / c.total, col: 'var(--accent)' };
    if (ph === 'review') return { ic: c && (c.warn || c.fail) ? 'warn' : 'review', text: tr('Waiting for your acceptance review') + (c && (c.warn || c.fail) ? ', ' + lvFinds(c) : ''), w: 1, col: 'var(--s-review)' };
    if (ph === 'umsetzung') {
      if (!s.total) return { ic: 'cur', text: tr('In progress, no implementation plan') };
      if (s.cur < 0) return { ic: 'cur', text: tr('All {n} steps done', { n: s.total }), w: 1 };
      return { ic: 'cur', text: tr('Step {n} of {total}: {text}', { n: s.cur + 1, total: s.total, text: s.curT }), w: s.done / s.total };
    }
    if (ph === 'queue') { const pos = (meta.queue || []).indexOf(t.id); return pos === 0 ? { ic: 'next', text: tr('Next in the queue') } : { ic: 'wait', text: tr('Queue, position {n}', { n: pos + 1 }) }; }
    return { ic: 'wait', text: L(t.status) };
  }

  function lvAttention(list) {
    const out = [];
    for (const t of list) { const e = lvNowOf(t); if (e && e.perm) out.push({ id: t.id, ic: 'perm', text: tr('{id}: approval for {what}', { id: t.id, what: LV_PERM[e.tool] || tr('a tool') }) }); }
    for (const t of list) {
      if (t.status === 'review') out.push({ id: t.id, ic: 'review', text: tr('Review {id}', { id: t.id }) });
      // Je Aufgabe und Art eine Zeile, auch bei Dutzenden fehlgeschlagener Prüfungen.
      if (t.status !== 'erledigt' && t.checks) {
        const fails = t.checks.list.filter((x) => lvCheckState(t, x) === 'fail');
        const warns = t.checks.list.filter((x) => lvCheckState(t, x) === 'warn');
        if (fails.length) out.push({ id: t.id, ic: 'fail', text: t.id + ': ' + (fails.length === 1 ? tr('{name} failed', { name: fails[0].name }) : tr('{n} checks failed', { n: fails.length })) });
        if (warns.length) out.push({ id: t.id, ic: 'warn', text: t.id + ': ' + (warns.length === 1 ? tr('Finding in {name}', { name: warns[0].name }) : tr('{n} findings', { n: warns.length })) });
      }
      if (t.status === 'in-arbeit' && t.questions.length) out.push({ id: t.id, ic: 'ask', text: t.id + ': ' + (t.questions.length === 1 ? tr('1 open question') : tr('{n} open questions', { n: t.questions.length })) });
      for (const c of t.conflicts || []) if (t.id < c.id) out.push({ id: t.id, ic: 'warn', text: tr('{a} and {b} change {file}', { a: t.id, b: c.id, file: c.files[0].split('/').pop() }) + (c.files.length > 1 ? tr(' and {n} more', { n: c.files.length - 1 }) : '') });
      if (t.stale) out.push({ id: t.id, ic: 'wait', text: t.stale.days === 1 ? tr('{id} quiet for 1 day', { id: t.id }) : tr('{id} quiet for {n} days', { id: t.id, n: t.stale.days }) });
    }
    return out;
  }

  // Was tut Claude (oder der Agent der Bahn) gerade an dieser Aufgabe?
  function lvNowOf(t) {
    const a = meta.activity;
    if (!a) return null;
    if (lvLanes().has(t.id)) { const e = a.lanes && a.lanes[t.id]; return lvFresh(e) ? e : null; }
    return a.busy && a.current && a.current.task === t.id && lvFresh(a.current) ? a.current : null;
  }
  const lvLastOf = (id) => ((meta.activity && meta.activity.recent) || []).find((r) => r.task === id) || null;
  const lvWhat = (e) => esc(e.verb) + (e.what ? ' <span class="mono">' + esc(e.what) + '</span>' : '');

  function lvPhases(t) {
    const ph = phaseOf(t), s = lvSteps(t), c = lvChecks(t);
    const started = ph !== 'queue' && ph !== '';
    const implDone = t.status === 'review' || t.status === 'erledigt' || (s.total > 0 && s.done === s.total);
    const chk = !c ? ['', tr('none set up')] : ph === 'pruefung' ? ['cur', tr('{done} of {total}', { done: c.finished, total: c.total })]
      : c.total && c.ok === c.total ? ['done', tr('all passed')] : (c.warn || c.fail) ? ['warn', lvFinds(c)] : c.finished ? ['', tr('{done} of {total}', { done: c.finished, total: c.total })] : ['', tr('not run yet')];
    const rows = [
      [tr('Started'), started ? 'done' : '', started ? (t.started === meta.today ? tr('today') : fmtDate(t.started)) : tr('not yet'), 1, ''],
      [tr('Implementation'), ph === 'umsetzung' ? 'cur' : implDone ? 'done' : '', s.total ? tr('{done} of {total} steps', { done: s.done, total: s.total }) : '', s.total ? s.done / s.total : 0, 'var(--s-in-arbeit)'],
      [tr('Checks'), chk[0], chk[1], c && c.total ? c.finished / c.total : 0, 'var(--accent)'],
      ['Review', t.status === 'review' && ph !== 'pruefung' ? 'cur' : t.status === 'erledigt' ? 'done' : '', t.status === 'review' ? tr('waiting for you') : '', 1, 'var(--s-review)'],
      [tr('Done'), t.status === 'erledigt' ? 'done' : '', t.status === 'erledigt' ? fmtDate(t.completed) : '', 1, ''],
    ];
    return '<ol class="lv-phases" aria-label="' + tr('Task phases') + '">' + rows.map((r) => '<li class="' + r[1] + '" style="--p:' + Math.max(6, Math.round(r[3] * 100)) + '%' + (r[4] ? ';--phc:' + r[4] : '') + '"' + (r[1] === 'cur' ? ' aria-current="step"' : '') + '><span class="ph-name">' + r[0] + '</span><span class="ph-sub">' + esc(r[2]) + '</span></li>').join('') + '</ol>';
  }

  function lvStepsHtml(t) {
    const s = lvSteps(t);
    if (!s.total) return '<p class="lv-empty">' + tr('No implementation plan. Steps go in task.md under Implementation plan.') + '</p>';
    const fresh = liveSnap && liveSnap[t.id] && liveSnap[t.id].done < s.done;
    return '<ol class="lv-steps">' + t.plan.map((st, i) => {
      const cur = i === s.cur && phaseOf(t) === 'umsetzung';
      const cls = st.done ? 'done' : cur ? 'cur' + (fresh ? ' fresh' : '') : 'todo';
      const prevAt = i > 0 && t.plan[i - 1].at;
      const right = st.done ? lvTime(st.at) : cur && prevAt ? tr('for {time}', { time: lvSince(prevAt, 'min') }) : '';
      return '<li class="' + cls + '"' + (cur ? ' aria-current="step"' : '') + '>' + lvSi(st.done ? 'ok' : cur ? 'cur' : 'wait') +
        '<span class="s-t">' + esc(st.text) + '<span class="sr">, ' + (st.done ? tr('done') : cur ? tr('in progress') : tr('open')) + '</span></span><span class="s-time">' + right + '</span></li>';
    }).join('') + '</ol>';
  }

  function lvNowHtml(t) {
    const ph = phaseOf(t), s = lvSteps(t), c = lvChecks(t);
    if (ph === 'review') return '<div class="lv-now done">' + lvSi(c && (c.warn || c.fail) ? 'warn' : 'review') + '<div class="lv-now-t"><span class="n-label">' + tr('Claude is done') + '</span><span class="n-what">' + tr('Waiting for your acceptance review') + (c && (c.warn || c.fail) ? ', ' + lvFinds(c) : '') + '</span></div>' + (EDIT ? '<button class="btn small primary" data-lv-review="' + esc(t.id) + '" data-lk="review">' + tr('Review task') + '</button>' : '') + '</div>';
    if (ph === 'erledigt') return '<div class="lv-now fin">' + lvSi('ok') + '<div class="lv-now-t"><span class="n-label">' + tr('Completed') + '</span><span class="n-what">' + tr('Done today') + '</span></div></div>';
    const e = lvNowOf(t);
    const agent = lvLanes().has(t.id);
    const where = ph === 'pruefung' ? tr('Check {n} of {total}, results under Checks', { n: Math.min(c.finished + 1, c.total), total: c.total }) : s.cur >= 0 ? tr('Step {n}: {text}', { n: s.cur + 1, text: esc(s.curT) }) : '';
    if (e && e.perm) {
      return '<div class="lv-now perm"><span class="n-label"><i class="lv-dot perm" aria-hidden="true"></i>' + (agent ? tr('Agent waiting for your approval') : tr('Waiting for your approval')) + '</span><span class="n-what">' + lvWhat(e) + '</span><span class="n-meta">' + tr('for {time}', { time: lvSince(e.permSince || e.at) }) + (where ? ' · ' + where : '') + '</span>' +
        '<span class="n-hint">' + tr('Approve or deny in the Claude window.') + (lvNotifyOn() ? '' : '<button type="button" class="btn link" data-lv-notify data-lk="notify">' + tr('Notify me in the browser') + '</button>') + '</span></div>';
    }
    if (e && e.running) {
      return '<div class="lv-now"><span class="n-label"><i class="lv-dot" aria-hidden="true"></i>' + tr('Right now') + (agent ? tr(', agent in its own worktree') : '') + '</span><span class="n-what">' + lvWhat(e) + '</span><span class="n-meta">' + tr('for {time}', { time: lvSince(e.at) }) + (where ? ' · ' + where : '') + '</span></div>';
    }
    const last = e && e.tool ? e : lvLastOf(t.id);
    if (e) return '<div class="lv-now"><span class="n-label"><i class="lv-dot" aria-hidden="true"></i>' + (agent ? tr('Agent is thinking') : tr('Claude is thinking')) + '</span>' + (last ? '<span class="n-what">' + tr('Last: {what}', { what: lvWhat(last) }) + '</span><span class="n-meta">' + tr('{time} ago', { time: lvSince(last.at) }) + (where ? ' · ' + where : '') + '</span>' : where ? '<span class="n-meta">' + where + '</span>' : '') + '</div>';
    return '<div class="lv-now idle"><span class="n-label">' + tr('Not active right now') + '</span>' + (last ? '<span class="n-what">' + tr('Last: {what}', { what: lvWhat(last) }) + '</span><span class="n-meta">' + tr('at {time}', { time: lvTime(last.at) }) + (where ? ' · ' + where : '') + '</span>' : where ? '<span class="n-meta">' + where + '</span>' : '') + '</div>';
  }

  function lvFeed(list, onlyId) {
    const items = [];
    for (const r of (meta.activity && meta.activity.recent) || []) items.push({ at: r.at, task: r.task, verb: r.verb, what: r.what, err: r.ok === false, kind: 'tool', file: LV_FILE_TOOLS.includes(r.tool) ? r.what : '' });
    for (const t of list) {
      for (const s of t.plan || []) if (s.done && s.at) items.push({ at: s.at, task: t.id, verb: tr('Step done'), what: s.text, kind: 'step' });
      if (t.checks) {
        for (const [name, r] of Object.entries(t.checks.results)) {
          if (r.at && ['ok', 'ack', 'warn', 'fail'].includes(r.status)) items.push({ at: r.at, task: t.id, verb: tr('Check'), what: name + ' ' + LV_CK[r.status], kind: 'check', ok: r.status === 'ok' || r.status === 'ack', err: r.status === 'fail' });
        }
      }
    }
    return items.filter((x) => !onlyId || x.task === onlyId).sort((x, y) => Date.parse(y.at) - Date.parse(x.at)).slice(0, 7);
  }
  // Diff im Verlauf: aufgeklappte Einträge und ihr Inhalt, bleiben über das Neuzeichnen erhalten.
  const LV_FILE_TOOLS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'];
  const lvDiffs = new Map();
  async function lvToggleDiff(b) {
    const key = b.dataset.lvDiff;
    if (lvDiffs.has(key)) { lvDiffs.delete(key); renderLive(); return; }
    lvDiffs.set(key, '<p class="muted diff-more">' + tr('Loading …') + '</p>');
    renderLive();
    let html;
    try {
      const r = await api('GET', 'api/diff?id=' + encodeURIComponent(b.dataset.task) + '&file=' + encodeURIComponent(b.dataset.file) + '&live=1');
      const add = (r.diff.match(/^\+(?!\+\+ )/gm) || []).length;
      const del = (r.diff.match(/^-(?!-- )/gm) || []).length;
      const what = { uncommitted: tr('Current state against the last commit'), new: tr('New file, not in Git yet'), task: tr('No open change, showing: changes of the task'), binary: tr('Binary file, no text diff') }[r.source] || tr('No change found');
      html = '<div class="lv-fdiff-head">' + (r.diff ? '<span class="add">+' + add + '</span><span class="del">−' + del + '</span>' : '') + '<span class="muted">' + what + '</span><button type="button" class="btn link" data-lv-code="' + esc(b.dataset.task) + '">' + tr('In the detail panel') + '</button></div>' +
        (r.diff ? '<div class="diff">' + diffHtml(r.diff) + (r.truncated ? '<p class="muted diff-more">' + tr('Truncated. Full version in the detail panel or with git diff.') + '</p>' : '') + '</div>' : '');
    } catch (err) { html = '<p class="muted diff-more">' + esc(err.message || err) + '</p>'; }
    if (lvDiffs.has(key)) { lvDiffs.set(key, html); renderLive(); }
  }
  function lvFeedHtml(items, withId) {
    if (!items.length) return '<p class="lv-empty">' + tr('No entries yet.') + '</p>';
    return '<ol class="lv-feed' + (withId ? ' with-id' : '') + '">' + items.map((x) => {
      const key = x.at + x.task + x.verb + x.what;
      const ic = x.err ? '<span class="fi err">' + LV_IC.fail + '</span>' : x.kind === 'step' || x.ok ? '<span class="fi ok">' + LV_IC.ok + '</span>' : x.kind === 'check' ? '<span class="fi chk">' + LV_IC.chk + '</span>' : '';
      // Einträge mit einer geänderten Datei klappen ihren Diff auf (W-0011), nur im lokalen Board.
      const canDiff = EDIT && x.file && x.task;
      const open = canDiff && lvDiffs.has(key);
      const inner = ic + (canDiff ? '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>' : '') + '<span class="f-verb">' + esc(x.verb) + '</span><span class="mono">' + esc(x.what) + '</span>' + (x.err ? '<span class="f-err">' + tr('Error') + '</span>' : '');
      return '<li class="k-' + x.kind + (canDiff ? ' k-file' : '') + (liveSeen && !liveSeen.has(key) ? ' new' : '') + '"><span class="f-time">' + lvTime(x.at, true) + '</span>' + (withId ? '<span class="f-id">' + esc(x.task || '–') + '</span>' : '') +
        (canDiff ? '<button type="button" class="f-what lv-fbtn" data-lv-diff="' + esc(key) + '" data-task="' + esc(x.task) + '" data-file="' + esc(x.file) + '" aria-expanded="' + open + '" title="' + tr('Show the change to this file') + '">' + inner + '</button>' : '<span class="f-what">' + inner + '</span>') +
        (open ? '<div class="lv-fdiff">' + lvDiffs.get(key) + '</div>' : '') + '</li>';
    }).join('') + '</ol>';
  }

  function lvChecksList(t) {
    const cls = { ok: 'ok', ack: 'ok', warn: 'warn', fail: 'bad', run: 'running' };
    const ch = { ok: '✓', ack: '✓', warn: '!', fail: '×', run: '', manual: '…', wait: '' };
    return '<ul class="checks">' + t.checks.list.map((x) => {
      const st = lvCheckState(t, x);
      const r = t.checks.results[x.name] || {};
      const right = st === 'run' ? tr('running {time}', { time: lvSince(t.checks.runningSince, 'sec') }) : r.ms && (st === 'ok' || st === 'fail') ? '<span class="sr">' + LV_CK[st] + ', </span>' + lvMs(r.ms) + lvTrendMark(r) : LV_CK[st] || st;
      let extra = '';
      if (st === 'warn') {
        extra = '<div class="ck-note">' + md(r.note || '') + (EDIT ? '<div class="row-btns"><button type="button" class="btn small primary" data-lv-fix="' + esc(x.name) + '" data-lv-task="' + esc(t.id) + '">' + tr('Let Claude fix it') + '</button><button type="button" class="btn small" data-lv-ack="' + esc(x.name) + '" data-lv-task="' + esc(t.id) + '">' + tr('Mark as known') + '</button></div>' : '') + '</div>';
      } else if (st === 'ok' && (r.flaky || r.trend)) {
        extra = '<div class="ck-acts">' + lvFlaky(r) + lvTrendText(r) + '</div>';
      } else if (st === 'fail') {
        const acts = lvFlaky(r) + lvRerunBtn(t, [x.name], tr('Check again'), 'btn link') + (r.output ? '<details class="ck-out" data-out="' + esc(t.id + ':' + x.name) + '"><summary>' + tr('Output') + '</summary><pre>' + esc(r.output.split('\n').slice(-40).join('\n')) + '</pre></details>' : '');
        if (acts) extra = '<div class="ck-acts">' + acts + '</div>';
      }
      return '<li class="ck ' + (cls[st] || '') + '"><div class="ck-row"><span class="ck-ic" aria-hidden="true">' + ch[st] + '</span><span class="ck-name">' + esc(x.name) + '</span><span class="mono muted ck-cmd">' + esc(x.cmd) + '</span>' + lvHist(r) + '<span class="muted num ck-ms">' + right + '</span></div>' + extra + '</li>';
    }).join('') + '</ul>';
  }

  // Verlauf je Prüfung: ein Strich je Lauf, neuester rechts. Erst ab zwei Läufen sinnvoll.
  const lvHist = (r) => (r.hist && r.hist.length > 1 ? '<span class="lv-hist" title="' + tr('Last {n} runs, newest on the right', { n: r.hist.length }) + '" aria-hidden="true">' + r.hist.map((h) => '<i class="' + (h.s === 'ok' ? 'ok' : 'fail') + '"></i>').join('') + '</span>' : '');
  const lvFlaky = (r) => (r.flaky ? '<span class="lv-flaky" title="' + tr('Passed and failed by turns in the last {n} runs', { n: r.flaky.runs }) + '">' + tr('flaky, {fails} of {runs} red', { fails: r.flaky.fails, runs: r.flaky.runs }) + '</span>' : '');
  const lvTrendMark = (r) => (r.trend ? ' <span class="lv-trend ' + r.trend.dir + '" title="' + tr('Usually {time}', { time: lvMs(r.trend.usual) }) + '">' + (r.trend.dir === 'up' ? '↑' : '↓') + '</span>' : '');
  const lvTrendText = (r) => (r.trend ? '<span>' + tr('Took {time}, usually {usual}.', { time: lvMs(r.trend.ms), usual: lvMs(r.trend.usual) }) + '</span>' : '');

  // Erneut prüfen: startet nur die genannten Prüfungen neu. Während eines Laufs (oder bis er beginnt) gibt es keinen Knopf.
  const lvRerunning = new Set();
  function lvRerunBtn(t, names, label, cls = 'btn small') {
    // Skill-Prüfungen wie code-audit führt Claude aus, ein erneuter Lauf würde sie nur zurücksetzen.
    names = names.filter((n) => t.checks.list.some((x) => x.name === n && !x.skill));
    if (!EDIT || !names.length || t.checks.running || lvRerunning.has(t.id)) return '';
    return '<button type="button" class="' + cls + '" data-lv-rerun="' + esc(t.id) + '" data-names="' + esc(names.join(',')) + '">' + esc(label) + '</button>';
  }
  function lvRerunAll(t, many) {
    const fails = t.checks.list.filter((x) => !x.skill && lvCheckState(t, x) === 'fail').map((x) => x.name);
    const b = fails.length >= 2 ? lvRerunBtn(t, fails, many ? tr('Run all {n} failed checks again', { n: fails.length }) : tr('Run failed checks again ({n})', { n: fails.length })) : '';
    return b ? '<div class="lv-ckg-acts">' + b + '</div>' : '';
  }
  async function lvRerun(id, names) {
    lvRerunning.add(id);
    ok(names.length === 1 ? tr('{name} is running again', { name: names[0] }) : tr('{n} checks are running again', { n: names.length }));
    renderLive();
    try { await run(() => act('checksRun', { id, only: names }), (r) => r.message); } finally { lvRerunning.delete(id); renderLive(); }
  }

  // Ab dieser Anzahl Prüfungen einer Aufgabe zeigt die Spalte eine Zusammenfassung statt einer Zeile je Prüfung.
  const LV_MANY = 8;
  const lvExpanded = new Set();
  const lvFirstLine = (out) => { const l = String(out || '').split('\n').map((s) => s.trim()).find(Boolean); return l ? l.slice(0, 240) : tr('No output'); };
  function lvAllList(t) {
    return '<div class="lv-alllist">' + t.checks.list.map((x) => '<div>' + lvSi(lvCheckState(t, x)) + '<span title="' + esc(x.cmd) + '">' + esc(x.name) + '</span></div>').join('') + '</div>';
  }
  function lvCompact(t) {
    const c = t.checks;
    const items = c.list.map((x) => ({ x, st: lvCheckState(t, x), r: c.results[x.name] || {} }));
    const of = (...st) => items.filter((i) => st.includes(i.st));
    const parts = [[['fail'], tr('failed')], [['warn'], tr('finding')], [['ok', 'ack'], tr('passed')], [['run'], tr('running')], [['manual'], tr('Claude fills in')], [['wait'], tr('open')]];
    let h = '<div class="lv-counts">' + parts.map(([st, l]) => { const n = of(...st).length; return n ? '<span class="c-' + st[0] + '"><b>' + n + '</b> ' + l + '</span>' : ''; }).join('') + '</div>' +
      '<div class="lv-strip" aria-hidden="true">' + items.map((i) => '<i class="' + i.st + '" title="' + esc(i.x.name + ': ' + (LV_CK[i.st] || i.st)) + '"></i>').join('') + '</div>' + lvRerunAll(t, true);
    const run = of('run')[0];
    if (run) h += '<div class="lv-runline">' + lvSi('run') + '<b>' + esc(run.x.name) + '</b><span class="mono">' + esc(run.x.cmd) + '</span><span class="tm">' + tr('running {time}', { time: lvSince(c.runningSince, 'sec') }) + '</span></div>';
    // Fehlschläge mit derselben ersten Zeile der Ausgabe gehören zusammen, meist haben sie dieselbe Ursache.
    const groups = new Map();
    for (const i of of('fail')) { const k = lvFirstLine(i.r.output); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
    for (const [msg, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      const key = t.id + ':' + msg;
      const shown = lvExpanded.has(key) ? list : list.slice(0, 10);
      const names = list.map((i) => i.x.name);
      h += '<div class="lv-errgrp"><div class="eh">' + lvSi('fail') + '<span>' + (list.length === 1 ? tr('{name} failed', { name: esc(names[0]) }) : tr('{n} checks, same message', { n: list.length })) + '</span>' + (list.length === 1 ? lvFlaky(list[0].r) : '') + '</div><div class="lv-msg">' + esc(msg) + '</div>' +
        (list.length > 1 ? '<div class="lv-names">' + shown.map((i) => '<span' + (i.r.flaky ? ' class="fl" title="' + tr('flaky') + '"' : '') + '>' + esc(i.x.name) + '</span>').join('') + (list.length > shown.length ? '<button type="button" data-lv-more="' + esc(key) + '">' + tr('+{n} more', { n: list.length - shown.length }) + '</button>' : '') + '</div>' : '') +
        (EDIT ? '<div class="row-btns"><button type="button" class="btn small primary" data-lv-fixall="' + esc(t.id) + '" data-names="' + esc(names.join(', ')) + '">' + tr('Let Claude fix it') + '</button>' + lvRerunBtn(t, names, tr('Check again')) + '</div>' : '') +
        '<details class="ck-out" data-out="' + esc(key) + '"><summary>' + tr('Output of {name}', { name: esc(names[0]) }) + '</summary><pre>' + esc(String(list[0].r.output || '').split('\n').slice(-40).join('\n')) + '</pre></details></div>';
    }
    for (const i of of('warn')) {
      h += '<div class="lv-errgrp warn"><div class="eh">' + lvSi('warn') + '<span>' + tr('Finding in {name}', { name: esc(i.x.name) }) + '</span></div><div class="ck-note">' + md(i.r.note || '') + '</div>' +
        (EDIT ? '<div class="row-btns"><button type="button" class="btn small primary" data-lv-fix="' + esc(i.x.name) + '" data-lv-task="' + esc(t.id) + '">' + tr('Let Claude fix it') + '</button><button type="button" class="btn small" data-lv-ack="' + esc(i.x.name) + '" data-lv-task="' + esc(t.id) + '">' + tr('Mark as known') + '</button></div>' : '') + '</div>';
    }
    const fl = items.filter((i) => i.r.flaky);
    if (fl.length) h += '<div class="lv-infoline">' + lvSi('warn') + '<span>' + tr('<b>{n} flaky</b> (passed and failed by turns in recent runs, marked with ~): {names}', { n: fl.length, names: esc(fl.map((i) => i.x.name).join(', ')) }) + '</span></div>';
    const slow = items.filter((i) => i.r.trend && i.r.trend.dir === 'up');
    if (slow.length) h += '<div class="lv-infoline">' + lvSi('trend') + '<span><b>' + tr('Slower than usual:') + '</b> ' + slow.map((i) => tr('{name} {time} instead of usually {usual}', { name: esc(i.x.name), time: lvMs(i.r.trend.ms), usual: lvMs(i.r.trend.usual) })).join(', ') + '</span></div>';
    const ok = of('ok', 'ack');
    if (ok.length) h += '<div class="lv-okline">' + lvSi('ok') + '<span>' + tr('{n} passed', { n: ok.length }) + (ok.length <= 6 ? ': ' + esc(ok.map((i) => i.x.name).join(', ')) : '') + '</span></div>';
    return h + '<details class="lv-all" data-out="' + esc(t.id + ':alle') + '"><summary>' + tr('Show all {n} checks', { n: items.length }) + '</summary>' + lvAllList(t) + '</details>';
  }

  // Befehle im Hintergrund (W-0059): Claude hat sie mit run_in_background gestartet, das Werkzeug ist längst zurück.
  // Stand und Exit-Code liest der Server aus dem Ende der Ausgabedatei. Gleiche Zeilen wie bei den Prüfungen.
  function lvBgHtml() {
    const list = (meta.activity && meta.activity.background) || [];
    if (!list.length) return '';
    const running = list.filter((x) => x.state === 'running').length;
    const failed = list.filter((x) => x.state === 'done' && x.code !== null && x.code !== 0).length;
    const row = (x) => {
      const done = x.state === 'done';
      const st = x.state === 'running' ? 'running' : done && x.code === 0 ? 'ok' : done && x.code !== null ? 'bad' : '';
      const ic = { running: '', ok: '✓', bad: '×' }[st] ?? (done ? '–' : '?');
      const dur = done && x.end ? ', ' + lvMs(Math.max(0, Date.parse(x.end) - Date.parse(x.at))) : '';
      const right = x.state === 'running' ? tr('running {time}', { time: lvSince(x.at, 'sec') })
        : done ? (x.code !== null ? tr('Exit code {code}', { code: Number(x.code) }) : tr('ended, exit code unknown')) + dur
          : tr('state unknown, started at {time}', { time: lvTime(x.at) });
      return '<li class="ck ' + st + '"><div class="ck-row"><span class="ck-ic" aria-hidden="true">' + ic + '</span>' + (x.task ? '<span class="ck-name">' + esc(x.task) + '</span>' : '') +
        '<span class="' + (x.cmd ? 'mono muted ' : '') + 'ck-cmd" title="' + esc(x.what) + '">' + esc(x.what) + '</span><span class="muted num ck-ms">' + right + '</span></div></li>';
    };
    return '<div class="lv-head"><h2>' + tr('In the background') + '</h2><span class="meta">' + [running ? tr('{n} running', { n: running }) : '', failed ? tr('{n} failed', { n: failed }) : ''].filter(Boolean).join(', ') + '</span></div>' +
      '<div class="lv-body" data-lv-bg><ul class="checks">' + list.map(row).join('') + '</ul></div>';
  }

  function lvChecksHtml(list, focusId) {
    // Ohne Ergebnis abgeschlossene Aufgaben haben nichts zu zeigen.
    const groups = list.filter((t) => t.checks && phaseOf(t) !== 'queue' && !(t.status === 'erledigt' && !lvChecks(t).finished));
    const order = (t) => { const c = lvChecks(t); return c.running ? 0 : c.warn || c.fail ? 1 : !c.finished ? 3 : c.ok === c.total ? 4 : 2; };
    groups.sort((a, b) => order(a) - order(b));
    const running = groups.filter((t) => t.checks.running).length;
    const fails = groups.reduce((n, t) => n + lvChecks(t).fail, 0);
    const warns = groups.reduce((n, t) => n + lvChecks(t).warn, 0);
    let h = '<div class="lv-head"><h2>' + tr('Checks') + '</h2><span class="meta">' + ([running ? tr('{n} running', { n: running }) : '', fails ? tr('{n} failed', { n: fails }) : '', warns ? (warns === 1 ? tr('1 finding') : tr('{n} findings', { n: warns })) : ''].filter(Boolean).join(', ') || (groups.length ? tr('all quiet') : '')) + '</span></div><div class="lv-body">';
    if (!meta.hasChecks) return h + '<p class="lv-empty">' + tr('No checks set up yet. Under Tools you can add commands such as tests or a build; they then run before completion.') + '</p></div>';
    if (!groups.length) return h + '<p class="lv-empty">' + tr('No task with checks is in progress today.') + '</p></div>';
    h += groups.map((t) => {
      const c = lvChecks(t);
      const agent = lvLanes().has(t.id) ? '<span class="tag lv-agent">Agent</span>' : '';
      const head = (ic, note) => '<div class="lv-ckg-head">' + lvSi(ic) + '<b>' + esc(t.id) + '</b><span class="t">' + esc(t.title) + '</span>' + agent + '</div>' + (note ? '<p class="lv-ckg-note">' + note + '</p>' : '');
      if (!c.running && !c.finished) return '<div class="lv-ckg">' + head('wait', tr('Run as soon as the task is completed: {names}.', { names: esc(t.checks.list.map((x) => x.name).join(', ')) })) + '</div>';
      const many = t.checks.list.length > LV_MANY;
      if (!c.running && c.ok === c.total) return '<details class="lv-ckg"><summary class="lv-ckg-head">' + lvSi('ok') + '<b>' + esc(t.id) + '</b><span class="t">' + tr('All {n} passed', { n: c.total }) + (t.checks.at ? ', ' + lvTime(t.checks.at) : '') + '</span>' + agent + '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></summary>' + (many ? lvAllList(t) : lvChecksList(t)) + '</details>';
      const icon = c.running ? 'run' : c.fail ? 'fail' : c.warn ? 'warn' : 'ok';
      if (many) return '<div class="lv-ckg' + (t.id === focusId ? ' hl' : '') + '">' + head(icon, '') + lvCompact(t) + '</div>';
      const note = c.running ? tr('Running, {done} of {total} finished', { done: c.finished, total: c.total }) : (c.warn || c.fail) ? tr('{finds}, decision needed', { finds: lvFinds(c) }) : tr('{done} of {total} ran', { done: c.finished, total: c.total });
      return '<div class="lv-ckg' + (t.id === focusId ? ' hl' : '') + '">' + head(icon, note) + lvRerunAll(t, false) + lvChecksList(t) + '</div>';
    }).join('');
    return h + '</div>';
  }

  function lvTilesHtml(list) {
    const a = meta.activity;
    const busy = a && a.busy && lvFresh(a.current);
    const cur = busy ? a.current : null;
    const ct = cur && cur.task ? tasks.find((t) => t.id === cur.task) : null;
    const cs = ct ? lvSteps(ct) : null;
    const stepTxt = cs && cs.total && cs.cur >= 0 ? ' <small>' + tr('Step {n} of {total}', { n: cs.cur + 1, total: cs.total }) + '</small>' : '';
    let t1;
    if (!cur) t1 = '<h3>' + tr('Claude is waiting') + '</h3><div class="big">' + (a && a.idleSince ? tr('since {time}', { time: lvTime(a.idleSince) }) : tr('Not active right now')) + '</div><div class="sub">' + tr('No request running') + '</div>';
    else if (cur.perm) t1 = '<h3><i class="lv-dot perm" aria-hidden="true"></i>' + tr('Claude is waiting for your approval') + '</h3><div class="big">' + esc(cur.task || tr('No task')) + stepTxt + '</div><div class="sub">' + lvWhat(cur) + ', ' + tr('for {time}', { time: lvSince(cur.permSince || cur.at) }) + '</div>';
    else if (cur.running) t1 = '<h3><i class="lv-dot" aria-hidden="true"></i>' + tr('Claude is working right now') + '</h3><div class="big">' + esc(cur.task || tr('No task')) + stepTxt + '</div><div class="sub">' + lvWhat(cur) + ', ' + tr('for {time}', { time: lvSince(cur.at) }) + '</div>';
    else { const last = (a.recent || [])[0]; t1 = '<h3><i class="lv-dot" aria-hidden="true"></i>' + tr('Claude is thinking') + '</h3><div class="big">' + esc(cur.task || tr('No task')) + stepTxt + '</div><div class="sub">' + (last ? tr('Last: {what}', { what: lvWhat(last) }) + ', ' + tr('{time} ago', { time: lvSince(last.at) }) : tr('for {time}', { time: lvSince(cur.at) })) + '</div>'; }
    const by = (p) => list.filter((t) => phaseOf(t) === p).length;
    const fertig = by('review') + by('erledigt');
    const seg = list.map((t) => '<i class="' + ({ erledigt: 'done', review: 'review', umsetzung: 'cur', pruefung: 'check' }[phaseOf(t)] || '') + '" title="' + esc(t.id) + '"></i>').join('');
    const u = meta.usage;
    const useLine = u && u.today && u.today.tokens ? '<div class="lv-usage" title="' + tr('Estimated from the prices in config.json, updated after every reply') + '">' + tr('Usage today <b>{tokens}</b> tokens, approx. <b>{cost}</b>', { tokens: fmtTok(u.today.tokens), cost: fmtMoney(u.today.cost, u.currency) }) + '</div>' : '';
    const t2 = (list.length ? '<h3>' + tr('Progress today') + '</h3><div class="big">' + tr('{done} of {total}', { done: fertig, total: list.length }) + ' <small>' + tr('finished') + '</small></div><div class="lv-seg" aria-hidden="true">' + seg + '</div><div class="sub">' + tr('{done} done · {review} in review · {work} in progress · {queue} waiting', { done: by('erledigt'), review: by('review'), work: by('umsetzung') + by('pruefung'), queue: by('queue') }) + '</div>'
      : '<h3>' + tr('Progress today') + '</h3><div class="big">' + tr('Nothing planned') + '</div><div class="sub">' + tr('No task in progress, in review or in the queue') + '</div>') + useLine;
    const lanes = list.filter((t) => lvLanes().has(t.id) && t.status === 'in-arbeit');
    const t3 = '<h3>Parallel</h3>' + (lanes.length ? '<div class="big">' + (lanes.length === 1 ? tr('1 agent') : tr('{n} agents', { n: lanes.length })) + '</div>' + lanes.map((t) => '<div class="sub">' + esc(t.id) + ' · ' + esc(lvStatus(t).text) + '</div>').join('') : '<div class="big">' + tr('No agent active') + '</div><div class="sub">' + tr('Everything runs in the main session') + '</div>');
    const att = lvAttention(list);
    // Höchstens vier Zeilen, damit die Kacheln niedrig bleiben.
    const attRest = att.length - 4;
    const t4 = '<h3>' + tr('Waiting for you') + '</h3>' + (att.length ? '<div class="big">' + att.length + ' <small>' + (att.length === 1 ? tr('item') : tr('items')) + '</small></div><ul class="lv-attn">' + att.slice(0, 4).map((x, i) => '<li><button type="button" data-lv-focus="' + esc(x.id) + '" data-lk="att' + i + '">' + lvSi(x.ic) + '<span class="t">' + esc(x.text) + '</span></button></li>').join('') + '</ul>' +
      (attRest > 0 ? '<span class="sub">' + (attRest === 1 ? tr('and 1 more item') : tr('and {n} more items', { n: attRest })) + '</span>' : '') : '<div class="big">' + tr('Nothing') + '</div><div class="sub">' + tr('Claude needs nothing from you right now') + '</div>');
    return '<button type="button" class="lv-tile lv-tile-btn' + (cur && cur.perm ? ' perm' : '') + '" data-lv-follow data-lk="follow" title="' + tr('View follows Claude') + '">' + t1 + '</button><article class="lv-tile">' + t2 + '</article><article class="lv-tile">' + t3 + '</article><article class="lv-tile' + (att.length ? ' attn' : '') + '">' + t4 + '</article>';
  }

  function lvFocusHtml(t, list) {
    if (!t) return '<p class="lv-empty">' + tr('There is no task in progress, in review or in the queue today. Get going with works start or via the queue.') + '</p>';
    const s = lvSteps(t);
    let h = '<div class="lv-ftop"><span class="r-id">' + esc(t.id) + '</span><span class="r-prio" style="color:' + prioVar(t.priority) + '">' + esc(t.priority) + '</span><span>' + esc(meta.typeLabel[t.type] || t.type) + '</span>' +
      (t.branch ? '<span class="mono">' + esc(t.branch) + '</span>' : '') + (lvLanes().has(t.id) ? '<span class="tag lv-agent">' + tr('Agent in its own worktree') + '</span>' : '') +
      (t.usage && t.usage.tokens ? '<span class="lv-cost" title="' + tr('Usage of this task so far, estimated from the prices in config.json') + '">' + tr('{tokens} tokens, approx. {cost}', { tokens: fmtTok(t.usage.tokens), cost: fmtMoney(t.usage.cost, meta.usage && meta.usage.currency) }) + '</span>' : '') +
      '<button type="button" class="btn link" data-lv-open="' + esc(t.id) + '">Details</button></div><h2 class="lv-title">' + esc(t.title) + '</h2>' + lvPhases(t);
    if (phaseOf(t) === 'queue') return h + '<p class="lv-empty">' + tr('Not started yet. {status}.', { status: esc(lvStatus(t).text) }) + '</p>';
    const feed = lvFeed(list, livePrefs.feedAll ? '' : t.id);
    h += '<div class="lv-cols"><div class="lv-col"><div class="lv-head"><h3>' + tr('Implementation plan') + '</h3>' + (s.total ? '<span class="meta">' + tr('{done} of {total} done', { done: s.done, total: s.total }) + '</span>' : '') + '</div>' + lvStepsHtml(t) +
      '<p class="lv-crit">' + lvSi(t.crit[1] && t.crit[0] === t.crit[1] ? 'ok' : 'wait') + tr('Acceptance criteria: {done} of {total} checked', { done: t.crit[0], total: t.crit[1] }) + '</p></div>' +
      '<div class="lv-col">' + lvNowHtml(t) + '<div class="lv-head"><h3>' + tr('History') + '</h3><div class="lv-segbtn" role="group" aria-label="' + tr('Filter history') + '"><button type="button" data-lv-feed="0" data-lk="feed0" aria-pressed="' + !livePrefs.feedAll + '">' + tr('This task') + '</button><button type="button" data-lv-feed="1" data-lk="feed1" aria-pressed="' + livePrefs.feedAll + '">' + tr('All') + '</button></div></div>' + lvFeedHtml(feed, livePrefs.feedAll) + '</div></div>';
    if (EDIT && (t.status === 'in-arbeit')) {
      const pend = (meta.instructions || []).filter((x) => x.task === t.id).length;
      h += '<div class="lv-instr"><label class="sr" for="lvInstr">' + tr('Instruction for Claude') + '</label><input class="input" id="lvInstr" data-instr-in="' + esc(t.id) + '" maxlength="4000" placeholder="' + tr('Instruction for Claude, for example: Please also back up posts with polls') + '"><button type="button" class="btn small primary" data-instr-send="' + esc(t.id) + '">' + tr('Send') + '</button>' +
        (pend ? '<span class="meta">' + (pend === 1 ? tr('1 instruction waiting. Claude reads it after the current step.') : tr('{n} instructions waiting. Claude reads them after the current step.', { n: pend })) + '</span>' : '') + '</div>';
    }
    return h;
  }

  function lvFocusId(list) {
    const ids = list.map((t) => t.id);
    if (!liveFollow && ids.includes(livePrefs.focus)) return livePrefs.focus;
    if (!liveFollow) liveFollowClaude();
    const a = meta.activity;
    if (a && a.busy && lvFresh(a.current) && ids.includes(a.current.task)) return a.current.task;
    const w = list.find((t) => t.status === 'in-arbeit');
    return w ? w.id : ids[0] || '';
  }

  // Ansage für Screenreader: Schritt erledigt, Prüfungen fertig, Aufgabe wartet auf Abnahme.
  function lvAnnounce(list) {
    const snap = {};
    for (const t of list) { const c = lvChecks(t); const e = lvNowOf(t); snap[t.id] = { done: lvSteps(t).done, fin: c ? c.finished : 0, status: t.status, perm: !!(e && e.perm) }; }
    const msgs = [];
    if (liveSnap && state.view === 'live') {
      for (const t of list) {
        const o = liveSnap[t.id], n = snap[t.id];
        if (!o) continue;
        if (n.done > o.done) { const st = t.plan[n.done - 1]; msgs.push(tr('{id}: step {n} of {total} done', { id: t.id, n: n.done, total: t.plan.length }) + (st ? ', ' + st.text : '') + '.'); }
        if (n.fin > o.fin) { const c = lvChecks(t); msgs.push(tr('{id}: checks {done} of {total} finished', { id: t.id, done: c.finished, total: c.total }) + (c.warn || c.fail ? ', ' + lvFinds(c) : '') + '.'); }
        if (n.status === 'review' && o.status !== 'review') msgs.push(tr('{id} is waiting for your acceptance review.', { id: t.id }));
        if (n.perm && !o.perm) msgs.push(tr('{id}: Claude is waiting for your approval.', { id: t.id }));
      }
    }
    if (msgs.length) { const say = $('#liveSay'); say.textContent = ''; setTimeout(() => { say.textContent = msgs.join(' '); }, 50); }
    return snap;
  }

  function renderLive() {
    const box = $('#viewLive');
    if (!box) return;
    const list = liveTasks();
    const focusId = lvFocusId(list);
    const ft = list.find((t) => t.id === focusId) || null;
    // Fokus und angefangene Anweisung über das Neuzeichnen retten.
    const ae = document.activeElement;
    const keyEl = ae && box.contains(ae) ? (ae.id ? '#' + ae.id : ae.dataset.lk ? '[data-lk="' + ae.dataset.lk + '"]' : ae.dataset.lvFocus ? '.lv-run [data-lv-focus="' + ae.dataset.lvFocus + '"], .lv-mini [data-lv-focus="' + ae.dataset.lvFocus + '"]' : null) : null;
    const inp = $('#lvInstr', box);
    const keep = inp ? { v: inp.value, s: inp.selectionStart, task: inp.dataset.instrIn } : null;
    const openGroups = $$('details.lv-ckg[open] summary b', box).map((b) => b.textContent);
    const openOut = $$('details[data-out][open]', box).map((d) => d.dataset.out);
    // Heute Erledigtes steckt eingeklappt in einer Zeile (W-0019). Auf oder zu bleibt über das Neuzeichnen und Neuladen erhalten.
    const fold = $('details.lv-fold', box);
    const foldOpen = fold ? fold.open : !!livePrefs.doneOpen;
    const done = list.filter((t) => t.status === 'erledigt');
    const rest = list.filter((t) => t.status !== 'erledigt');
    const lvRow = (t) => {
      const st = lvStatus(t);
      return '<li><button type="button" data-lv-focus="' + esc(t.id) + '" aria-current="' + (t.id === focusId) + '">' + lvSi(st.ic) +
        '<span class="r-top"><span class="r-id">' + esc(t.id) + '</span>' + (lvLanes().has(t.id) ? '<span class="tag lv-agent">Agent</span>' : '') + '<span class="r-prio" style="color:' + prioVar(t.priority) + '">' + esc(t.priority) + '</span></span>' +
        '<span class="r-title">' + esc(t.title) + '</span><span class="r-sub">' + esc(st.text) + '</span>' +
        (st.w != null ? '<span class="lv-bar r-bar" style="--s:' + Math.max(0, Math.min(1, st.w)).toFixed(3) + (st.col ? ';--c:' + st.col : '') + '"><i></i></span>' : '') + '</button></li>';
    };
    const lvMini = (t) => '<li><button type="button" data-lv-focus="' + esc(t.id) + '" aria-current="' + (t.id === focusId) + '" title="' + esc(t.id + ' ' + t.title) + '">' + lvSi('ok') +
      '<span class="r-id">' + esc(t.id) + '</span><span class="t">' + esc(t.title) + '</span></button></li>';
    const runList = (rest.length ? '<ul class="lv-run">' + rest.map(lvRow).join('') + '</ul>' : '') +
      (done.length ? '<details class="lv-fold"' + (foldOpen || done.some((t) => t.id === focusId) ? ' open' : '') + '><summary>' + lvSi('ok') + '<span><b>' + done.length + '</b> ' + tr('done today') + '</span>' +
        '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></summary><ul class="lv-mini">' + done.map(lvMini).join('') + '</ul></details>' : '');
    const bg = lvBgHtml();
    box.innerHTML = '<section class="lv-sum" aria-label="' + tr('Overview') + '">' + lvTilesHtml(list) + '</section>' +
      '<div class="lv-grid"><section class="lv-panel lv-runbox" aria-label="' + tr('Tasks today') + '"><div class="lv-head"><h2>' + tr('Today') + '</h2><span class="meta">' + (list.length === 1 ? tr('1 task') : tr('{n} tasks', { n: list.length })) + '</span></div>' +
      (list.length ? runList : '<p class="lv-empty">' + tr('No tasks for today.') + '</p>') + '</section>' +
      '<section class="lv-panel lv-focus" aria-label="' + tr('Selected task') + '">' + lvFocusHtml(ft, list) + '</section>' +
      '<section class="lv-panel lv-checks" aria-label="' + (bg ? tr('Background commands and checks') : tr('Checks')) + '">' + bg + lvChecksHtml(list, focusId) + '</section></div>';
    $$('details.lv-ckg', box).forEach((d) => { const b = $('summary b', d); if (b && openGroups.includes(b.textContent)) d.open = true; });
    $$('details[data-out]', box).forEach((d) => { if (openOut.includes(d.dataset.out)) d.open = true; });
    const ni = $('#lvInstr', box);
    if (ni && keep && keep.task === ni.dataset.instrIn) { ni.value = keep.v; }
    if (keyEl) { const el = $(keyEl, box); if (el) { el.focus({ preventScroll: true }); if (el === ni && keep) { try { el.setSelectionRange(keep.s, keep.s); } catch (e) { /* egal */ } } } }
    liveSnap = lvAnnounce(list);
    liveSeen = new Set(lvFeed(list, '').concat(lvFeed(list, focusId)).map((x) => x.at + x.task + x.verb + x.what));
  }

  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#viewLive')) return;
    const f = e.target.closest('[data-lv-focus]');
    if (f) { liveFollow = false; livePrefs.focus = f.dataset.lvFocus; store.set(LIVE_KEY, livePrefs); renderLive(); return; }
    // Klick auf „heute erledigt“: der Browser klappt danach um, also den kommenden Zustand merken.
    const fs = e.target.closest('details.lv-fold > summary');
    if (fs) { livePrefs.doneOpen = !fs.parentElement.open; store.set(LIVE_KEY, livePrefs); }
    if (e.target.closest('[data-lv-follow]')) { liveFollowClaude(); renderLive(); return; }
    const fb = e.target.closest('[data-lv-feed]');
    if (fb) { livePrefs.feedAll = fb.dataset.lvFeed === '1'; store.set(LIVE_KEY, livePrefs); renderLive(); return; }
    if (e.target.closest('[data-lv-notify]')) { lvEnableNotify(); return; }
    const rr = e.target.closest('[data-lv-rerun]');
    if (rr) { lvRerun(rr.dataset.lvRerun, rr.dataset.names.split(',').filter(Boolean)); return; }
    const rv = e.target.closest('[data-lv-review]');
    if (rv) { openReview(rv.dataset.lvReview); return; }
    const op = e.target.closest('[data-lv-open]');
    if (op) { openTask(op.dataset.lvOpen); return; }
    const more = e.target.closest('[data-lv-more]');
    if (more) { lvExpanded.add(more.dataset.lvMore); renderLive(); return; }
    const lc = e.target.closest('[data-lv-code]');
    if (lc) { const id = lc.dataset.lvCode; openTask(id).then(() => { detailTab = 'code'; renderDetail(); }); return; }
    const ld = e.target.closest('[data-lv-diff]');
    if (ld) { lvToggleDiff(ld); return; }
    const fa = e.target.closest('[data-lv-fixall]');
    if (fa) {
      const id = fa.dataset.lvFixall;
      const msg = (fa.closest('.lv-errgrp').querySelector('.lv-msg') || {}).textContent || '';
      const r = await run(() => act('comment', { id, text: tr('Please fix the failed checks and then run them again (works checks run {id}):\n\nChecks: {names}\nMessage: {msg}', { id, names: fa.dataset.names, msg }) }), tr('Request to Claude saved as a comment'));
      if (r) fa.disabled = true;
      return;
    }
    const fx = e.target.closest('[data-lv-fix]');
    if (fx) {
      const id = fx.dataset.lvTask;
      const note = (fx.closest('.ck, .lv-errgrp').querySelector('.ck-note') || {}).innerText || '';
      // Knopftexte aus dem innerText entfernen, in der Sprache der Seite.
      const clean = [tr('Let Claude fix it'), tr('Mark as known')].reduce((s, b) => s.split(b).join(''), note).trim();
      const r = await run(() => act('comment', { id, text: tr('Please fix the finding from the check {name} and then record the check again:\n\n{note}', { name: fx.dataset.lvFix, note: clean }) }), tr('Request to Claude saved as a comment'));
      if (r) fx.disabled = true;
      return;
    }
    const ak = e.target.closest('[data-lv-ack]');
    if (ak) run(() => act('checksAck', { id: ak.dataset.lvTask, name: ak.dataset.lvAck }), tr('Marked as known'));
  });

  // ---------- Entwürfe ----------

  function designHtml(d) {
    const g = d.design;
    if (!g) {
      return '<div class="q-empty"><strong>' + tr('No design variants so far.') + '</strong><span>' + tr('For design tasks Claude uses UI UX Pro Max and Superpowers brainstorming, if they are installed, and attaches the design direction, variants and results here. You then pick a variant before Claude implements it.') + '</span></div>';
    }
    const badge = (src) => (src ? '<span class="src-badge ' + (/brain|superpower/i.test(src) ? 'bs' : 'ux') + '">' + esc(/brain|superpower/i.test(src) ? 'Superpowers' : /ui-?ux/i.test(src) ? 'UI UX Pro Max' : src) + '</span>' : '');
    const h = [];
    if (g.direction) {
      const dir = g.direction;
      h.push('<div class="block"><div class="block-head"><h3>' + tr('Design direction') + '</h3>' + badge(dir.source) + '<span class="meta">' + esc(dir.at || '') + '</span></div>' +
        '<div class="dz-dir">' + (dir.colors.length ? '<div class="dz-card"><small>' + tr('Colors') + '</small><div class="sw">' + dir.colors.map((c) => '<span title="' + esc((c.name ? c.name + ' ' : '') + c.hex) + '"><i style="background:' + esc(c.hex) + '"></i>' + esc(c.name || c.hex) + '</span>').join('') + '</div></div>' : '') +
        (dir.fonts.length ? '<div class="dz-card"><small>' + tr('Font') + '</small><strong>' + esc(dir.fonts[0]) + '</strong>' + (dir.fonts[1] ? '<span class="muted">' + tr('{fonts} for body text', { fonts: esc(dir.fonts.slice(1).join(', ')) }) + '</span>' : '') + '</div>' : '') + '</div>' +
        (dir.text ? '<details class="sec"' + (dir.colors.length ? '' : ' open') + '><summary>' + tr('Style and rules') + '</summary><div class="body"><div class="md">' + md(dir.text) + '</div></div></details>' : '') + '</div>');
    }
    if (g.variants.length) {
      h.push('<div class="block"><div class="block-head"><h3>' + tr('Variants') + '</h3><span class="meta">' + g.variants.length + (g.chosen ? tr(', chosen: {name}', { name: esc(g.chosen.name) }) : tr(', none chosen yet')) + '</span></div><div class="dz-grid">' +
        g.variants.map((v) => {
          const chosen = g.chosen && g.chosen.name === v.name;
          const prev = v.kind === 'html' ? (LIVE ? '<div class="dz-frame dz-wrap"><iframe src="' + esc(v.src) + '" sandbox="allow-scripts" loading="lazy" tabindex="-1" title="Mockup ' + esc(v.name) + '"></iframe></div>' : '<div class="dz-frame dz-none">' + tr('HTML mockup, only in the live board') + '</div>') : v.kind === 'image' ? '<img class="dz-frame" src="' + esc(v.src) + '" alt="Mockup ' + esc(v.name + ' ' + v.title) + '" loading="lazy">' : '<div class="dz-frame dz-none">' + esc(v.file) + '</div>';
          return '<figure class="dz-var' + (chosen ? ' chosen' : '') + '">' + prev + '<figcaption><strong>' + esc(v.name + ' ' + v.title) + '</strong>' + (v.note ? '<span class="muted">' + esc(v.note) + '</span>' : '') + '</figcaption><div class="row-btns">' +
            (v.src && LIVE ? '<a class="btn small ghost" href="' + esc(v.src) + '" target="_blank" rel="noopener">' + tr('View large') + '</a>' : '') +
            (chosen ? '<span class="tag q-tag">' + tr('Chosen {date}', { date: esc((g.chosen.at || '').slice(0, 10)) }) + '</span>' : EDIT ? '<button class="btn small" data-dzpick="' + esc(v.name) + '">' + tr('Take this one') + '</button>' : '') + '</div></figure>';
        }).join('') + '</div>' + (g.chosen && g.chosen.reason ? '<p class="sublabel">' + tr('Reason: {text}', { text: esc(g.chosen.reason) }) + '</p>' : '') + '</div>');
    }
    for (const b of g.brainstorm) {
      h.push('<div class="block"><div class="block-head"><h3>' + esc(b.title || 'Brainstorming') + '</h3>' + badge(b.source) + '<span class="meta">' + esc(b.at || '') + '</span></div><div class="md dz-bs">' + md(String(b.text || '').replace(/^#\s+[^\n]*\n+/, '')) + '</div></div>');
    }
    return '<div class="dz">' + h.join('') + '</div>';
  }

  function bindDesign(id) {
    scaleFrames();
    $$('[data-dzpick]').forEach((b) => b.onclick = async () => {
      const reason = await askText({ title: tr('Take variant {name}', { name: b.dataset.dzpick }), lead: tr('Claude then implements this variant. The choice is recorded in decisions.md.'), label: tr('Reason, optional'), confirm: tr('Take this one') });
      if (reason === null) return;
      run(() => act('designChoose', { id, name: b.dataset.dzpick, reason }), (x) => x.message);
    });
  }

  // HTML-Mockups in Desktopbreite rendern und verkleinert zeigen.
  const FRAME_W = 1024;
  const frameRO = 'ResizeObserver' in window ? new ResizeObserver((list) => list.forEach((e) => fitFrame(e.target))) : null;
  // data-fw: Breite, in der der Entwurf rendert (W-0030: Desktop, Tablet, Handy in der Abnahme). Sonst 1024.
  function fitFrame(w) { const f = w.firstElementChild; if (!f) return; const fw = +w.dataset.fw || FRAME_W; f.style.width = fw + 'px'; const k = w.clientWidth / fw; f.style.transform = 'scale(' + k + ')'; f.style.height = (w.clientHeight / k) + 'px'; }
  function scaleFrames(root) { $$('.dz-wrap', root).forEach((w) => { fitFrame(w); if (frameRO) frameRO.observe(w); }); }

  // ---------- Abnahme im Review ----------

  async function openReview(id) {
    let d;
    try { d = detail && detail.task.id === id ? detail : await api('GET', 'api/task?id=' + encodeURIComponent(id)); } catch (e) { return fail(e); }
    const crit = (d.checklists.find((c) => c.name === 'Akzeptanzkriterien' || c.name === 'Acceptance criteria') || { items: [] }).items;
    const imgs = d.assets.filter((a) => a.image);
    const byKind = (k) => imgs.filter((a) => a.kind === k).pop();
    const after = byKind('nachher') || byKind('ist') || imgs[imgs.length - 1];
    const before = byKind('vorher');
    const chosen = d.design && d.design.chosen ? d.design.variants.find((v) => v.name === d.design.chosen.name) : null;
    const modes = [];
    if (chosen) modes.push({ id: 'mock', label: tr('Design {name} vs. result', { name: chosen.name }), left: { label: tr('Design {name} from UI UX Pro Max', { name: chosen.name }), v: chosen }, right: after });
    if (before && after) modes.push({ id: 'ba', label: tr('Before vs. after'), left: { label: tr('Before'), a: before }, right: after });
    if (!modes.length && after) modes.push({ id: 'one', label: tr('Result'), left: null, right: after });
    const pane = (x) => (!x ? '' : x.v ? '<figure class="rv-fig"><figcaption>' + esc(x.label) + '</figcaption>' + (x.v.kind === 'html' ? '<div class="rv-img dz-wrap"><iframe src="' + esc(x.v.src) + '" sandbox="allow-scripts" tabindex="-1" title="' + tr('Design') + '"></iframe></div>' : '<img class="rv-img" src="' + esc(x.v.src) + '" alt="' + tr('Design') + '">') + '</figure>'
      : '<figure class="rv-fig"><figcaption>' + esc(x.label) + '</figcaption><img class="rv-img" src="' + esc(x.a.src) + '" alt="' + esc(x.a.desc || x.a.alt) + '"></figure>');
    const compare = (m) => '<div class="rv-cmp">' + (m.left ? pane(m.left) : '') + (m.right ? pane({ label: tr('Result') + (m.right.desc ? ': ' + m.right.desc : ''), a: m.right }) : '<div class="q-empty">' + tr('No screenshot of the result yet. Claude adds it with works asset --kind nachher.') + '</div>') + '</div>';
    // Gleicher Maßstab (W-0030): Breite und Schema wählen, der Entwurf rendert genau so (?theme=, ?frame=0 wie in der
    // mockups-Vorlage), daneben das Nachher-Bild mit derselben Breite und demselben Schema im Namen (works shot: -dark-390).
    const SIZES = [['Desktop', 1440], ['Tablet', 768], [tr('Phone'), 390]];
    const shotOf = (a) => { const m = String(a.src).match(/(light|dark)-(\d{3,4})(?!\d)/); return m ? { theme: m[1], width: +m[2] } : null; };
    const afters = imgs.filter((a) => a.kind === 'nachher' && shotOf(a));
    const scaled = !!(chosen && afters.length);
    const start = scaled ? shotOf(afters.find((a) => shotOf(a).theme === 'light' && shotOf(a).width === 1440) || afters[0]) : null;
    let size = start ? (SIZES.some((s) => s[1] === start.width) ? start.width : 1440) : 1440;
    let theme = start ? start.theme : 'light';
    const sizeLabel = () => SIZES.find((s) => s[1] === size)[0] + ', ' + (theme === 'dark' ? tr('dark') : tr('light'));
    const mockCompare = () => {
      const match = afters.find((a) => { const s = shotOf(a); return s.width === size && s.theme === theme; });
      const left = chosen.kind === 'html'
        ? '<figure class="rv-fig"><figcaption>' + tr('Design {name}', { name: esc(chosen.name) }) + ' · ' + esc(sizeLabel()) + '</figcaption><div class="rv-img dz-wrap rv-w' + size + '" data-fw="' + size + '"><iframe src="' + esc(chosen.src + (chosen.src.includes('?') ? '&' : '?') + 'theme=' + theme + '&frame=0') + '" sandbox="allow-scripts" tabindex="-1" title="' + tr('Design') + '"></iframe></div></figure>'
        : pane({ label: tr('Design {name}', { name: chosen.name }), v: chosen });
      const right = '<figure class="rv-fig"><figcaption>' + tr('Result') + ' · ' + esc(sizeLabel()) + '</figcaption>' + (match
        ? '<img class="rv-img rv-w' + size + '" src="' + esc(match.src) + '" alt="' + esc(match.desc || match.alt) + '">'
        : '<div class="rv-miss"><b>' + tr('No after image for {size}', { size: esc(sizeLabel()) }) + '</b><span>' + tr('Claude creates it, for example with') + '</span><code>works shot --url=&lt;' + tr('address') + '&gt; --widths=' + size + ' --themes=' + theme + ' --asset=' + esc(id) + ' --kind=nachher</code></div>') + '</figure>';
      return '<div class="rv-cmp">' + left + right + '</div>';
    };
    const render = (m) => (m.id === 'mock' && scaled ? mockCompare() : compare(m));
    const scaleCtl = scaled ? '<div class="rv-scale" id="rvScale"><span class="rv-grp" role="group" aria-label="' + tr('Width') + '"><span>' + tr('Width') + '</span>' + SIZES.map((s) => '<button type="button" class="sv-chip" data-rvw="' + s[1] + '" aria-pressed="' + (s[1] === size) + '">' + s[0] + '</button>').join('') + '</span>' +
      '<span class="rv-grp" role="group" aria-label="' + tr('Color scheme') + '"><span>' + tr('Scheme') + '</span><button type="button" class="sv-chip" data-rvt="light" aria-pressed="' + (theme === 'light') + '">' + tr('Light') + '</button><button type="button" class="sv-chip" data-rvt="dark" aria-pressed="' + (theme === 'dark') + '">' + tr('Dark') + '</button></span></div>' : '';
    const html = '<h2>' + tr('Review {id}', { id: esc(id) }) + '</h2><p class="lead">' + esc(d.task.title) + '</p>' +
      (modes.length > 1 ? '<div class="row-btns" id="rvModes">' + modes.map((m, i) => '<button type="button" class="sv-chip" data-rvm="' + i + '" aria-pressed="' + (i === 0) + '">' + esc(m.label) + '</button>').join('') + '</div>' : '') +
      scaleCtl +
      '<div id="rvCmp">' + (modes.length ? render(modes[0]) : '<div class="q-empty">' + tr('No images. Check the result directly in the application.') + '</div>') + '</div>' +
      '<div class="rv-bottom"><div class="field"><span>' + tr('Double-check') + '</span><ul class="dod">' + (crit.length ? crit.map((c) => '<li><label><input type="checkbox" class="rvc" data-n="' + c.n + '"' + (c.done ? ' checked' : '') + '><span>' + esc(c.text) + (c.done ? ' <span class="sublabel">' + tr('Claude: met') + '</span>' : '') + '</span></label></li>').join('') : '<li>' + tr('No criteria.') + '</li>') + '</ul></div>' +
      '<label class="field"><span>' + tr('What is missing or bothers you? Required when returning') + '</span><textarea class="input" name="text" rows="4" placeholder="' + tr('Describe what is not right. Claude gets the text as a comment.') + '"></textarea></label></div>' +
      '<p class="err" role="alert"></p><div class="foot"><button class="btn" value="cancel" formnovalidate>' + tr('Cancel') + '</button><button class="btn warn" value="reject">' + tr('Back to Claude') + '</button><button class="btn ok" value="accept">' + tr('Accept and complete') + '</button></div>';
    const r = await showDialog(html, async (fd, sub) => {
      if (sub === 'accept') return 'accept';
      const text = String(fd.get('text') || '').trim();
      if (!text) throw new Error(tr('Please briefly describe what is missing.'));
      const uncheck = $$('.rvc', form).filter((c) => !c.checked && crit.find((x) => x.n === +c.dataset.n && x.done)).map((c) => +c.dataset.n);
      return act('review', { id, text, uncheck });
    }, (f) => {
      let cur = modes[0];
      const show = () => { $('#rvCmp', f).innerHTML = render(cur); const sc = $('#rvScale', f); if (sc) sc.hidden = cur.id !== 'mock'; scaleFrames(f); };
      $$('[data-rvm]', f).forEach((b) => b.onclick = () => { cur = modes[+b.dataset.rvm]; $$('[data-rvm]', f).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); show(); });
      $$('[data-rvw]', f).forEach((b) => b.onclick = () => { size = +b.dataset.rvw; $$('[data-rvw]', f).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); show(); });
      $$('[data-rvt]', f).forEach((b) => b.onclick = () => { theme = b.dataset.rvt; $$('[data-rvt]', f).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); show(); });
      scaleFrames(f);
    });
    if (r === 'accept') return openDod(id);
    if (r) ok(r.message);
  }

  // ---------- Projektwissen ----------

  async function renderKnowledge(body, head) {
    let list = [];
    try { list = await api('GET', 'api/knowledge'); } catch (e) { return fail(e); }
    const q = (store.get('works-know-q', '') || '').toLowerCase();
    const props = list.filter((e) => e.status === 'vorschlag');
    const shown = list.filter((e) => e.status !== 'vorschlag' && (!q || (e.title + ' ' + e.text + ' ' + e.area).toLowerCase().includes(q)));
    const areas = [...new Set(shown.map((e) => e.area))];
    const entry = (e) => '<article class="kn"><div class="kn-h"><strong>' + esc(e.title) + '</strong>' + (e.status === 'veraltet' ? '<span class="tag">' + tr('outdated?') + '</span>' : '') + '</div><div class="md">' + md(e.text) + '</div><div class="kn-meta">' + esc([e.by ? (e.by === 'Nutzer' ? tr('by you') : tr('by {who}', { who: e.by })) : '', e.source ? tr('from {source}', { source: e.source }) : '', e.date ? fmtDate(e.date) : ''].filter(Boolean).join(', ')) +
      (EDIT ? '<span class="spacer"></span><button class="btn link" data-knedit="' + esc(e.id) + '">' + tr('Edit') + '</button>' + (e.status !== 'veraltet' ? '<button class="btn link" data-knflag="' + esc(e.id) + '">' + tr('outdated') + '</button>' : '<button class="btn link" data-knok="' + esc(e.id) + '">' + tr('current') + '</button>') + '<button class="btn link danger" data-knrm="' + esc(e.id) + '">' + tr('Delete') + '</button>' : '') + '</div></article>';
    body.innerHTML = head(tr('Project knowledge')) +
      '<p class="md">' + tr('What Claude needs to know in this project. Claude reads the matching entries before working and suggests new ones when it finds out something important. Stored in .works/wissen.md.') + '</p>' +
      (props.length ? '<div class="block"><div class="block-head"><h3>' + tr('Suggestions from Claude') + '</h3><span class="meta">' + props.length + '</span></div>' + props.map((e) => '<article class="kn prop"><div class="kn-h"><strong>' + esc(e.title) + '</strong><span class="muted">' + esc(e.area) + '</span></div><div class="md">' + md(e.text) + '</div><div class="kn-meta">' + esc([e.source ? tr('learned in {source}', { source: e.source }) : '', e.date ? fmtDate(e.date) : ''].filter(Boolean).join(', ')) + (EDIT ? '<span class="spacer"></span><button class="btn small primary" data-knacc="' + esc(e.id) + '">' + tr('Accept suggestion') + '</button><button class="btn small" data-knedit="' + esc(e.id) + '">' + tr('Edit') + '</button><button class="btn small ghost" data-knrm="' + esc(e.id) + '">' + tr('Reject') + '</button>' : '') + '</div></article>').join('') + '</div>' : '') +
      '<div class="add-row"><input class="input" id="knQ" placeholder="' + tr('Search knowledge') + '" value="' + esc(q) + '">' + (EDIT ? '<button class="btn small primary" id="knAdd">' + tr('Add entry') + '</button>' : '') + '</div>' +
      (areas.length ? areas.map((a) => '<details class="sec" open><summary>' + esc(a) + ' <span class="meta">' + shown.filter((e) => e.area === a).length + '</span></summary><div class="body">' + shown.filter((e) => e.area === a).map(entry).join('') + '</div></details>').join('') : '<p class="md empty-md">' + (q ? tr('Nothing found.') : tr('No project knowledge yet.')) + '</p>');
    $$('[data-sclose]', body).forEach((b) => b.onclick = closeSide);
    const qi = $('#knQ', body);
    qi.oninput = () => { store.set('works-know-q', qi.value); clearTimeout(qi._t); qi._t = setTimeout(() => { renderKnowledge(body, head).then(() => { const n = $('#knQ', body); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 250); };
    if (!EDIT) return;
    const areasAll = [...new Set(list.map((e) => e.area))];
    const edit = async (e) => {
      const r = await showDialog('<h2>' + (e ? tr('Edit entry') : tr('Add entry')) + '</h2><div class="grid"><label class="field span2"><span>' + tr('Area') + '</span><input class="input" name="area" list="knAreas" maxlength="60" value="' + esc(e ? e.area : '') + '" placeholder="' + tr('For example Discord and bot') + '"><datalist id="knAreas">' + areasAll.map((a) => '<option value="' + esc(a) + '">').join('') + '</datalist></label><label class="field span2"><span>' + tr('Title') + '</span><input class="input" name="title" required maxlength="140" value="' + esc(e ? e.title : '') + '" autofocus></label></div><label class="field"><span>' + tr('Text, Markdown allowed') + '</span><textarea class="input" name="text" rows="6">' + esc(e ? e.text : '') + '</textarea></label>' + foot(tr('Save')),
        (fd) => (e ? act('knowEdit', { kid: e.id, fields: { area: String(fd.get('area') || tr('General')), title: String(fd.get('title')), text: String(fd.get('text') || ''), ok: e.status === 'vorschlag' } }) : act('knowAdd', { area: String(fd.get('area') || tr('General')), title: String(fd.get('title')), text: String(fd.get('text') || '') })));
      if (r) { ok(r.message); renderKnowledge(body, head); }
    };
    const again = () => renderKnowledge(body, head);
    const addBtn = $('#knAdd', body); if (addBtn) addBtn.onclick = () => edit(null);
    $$('[data-knedit]', body).forEach((b) => b.onclick = () => edit(list.find((e) => e.id === b.dataset.knedit)));
    $$('[data-knacc]', body).forEach((b) => b.onclick = async () => { if (await run(() => act('knowAccept', { kid: b.dataset.knacc }), (x) => x.message)) again(); });
    $$('[data-knflag]', body).forEach((b) => b.onclick = async () => { if (await run(() => act('knowFlag', { kid: b.dataset.knflag }), (x) => x.message)) again(); });
    $$('[data-knok]', body).forEach((b) => b.onclick = async () => { if (await run(() => act('knowEdit', { kid: b.dataset.knok, fields: { ok: true } }), (x) => x.message)) again(); });
    $$('[data-knrm]', body).forEach((b) => b.onclick = async () => { if (await run(() => act('knowRemove', { kid: b.dataset.knrm }), (x) => x.message)) again(); });
  }

  // ---------- Aufräumen ----------

  async function renderCleanup(body, head) {
    let c;
    try { c = await api('GET', 'api/cleanup'); } catch (e) { return fail(e); }
    const row = (x, btns) => '<div class="cl-row"><span class="st" style="--c:' + statusVar(x.status) + '"></span><div class="q-t"><button class="q-title" data-open="' + esc(x.id) + '">' + esc(x.id + ' ' + x.title) + '</button><span class="q-meta">' + esc(x.why) + '</span></div>' + (EDIT ? btns : '') + '</div>';
    const sec = (title, sub, items) => (items.length ? '<div class="block"><div class="block-head"><h3>' + esc(title) + '</h3><span class="meta">' + esc(sub) + '</span></div>' + items.join('') + '</div>' : '');
    body.innerHTML = head(tr('Clean up')) +
      '<div class="cl-score"><div><small>' + tr('Backlog health') + '</small><strong class="num ' + (c.score >= 85 ? 'good' : c.score >= 60 ? '' : 'late') + '">' + c.score + '</strong><span class="muted">' + tr('of 100') + '</span></div><span class="md">' + (c.count ? tr('{n} things need attention. Done items disappear from the list.', { n: c.count }) : tr('All good.')) + '</span></div>' +
      sec(tr('Stuck'), tr('no movement for a long time'), c.stuck.map((x) => row(x, x.review ? '<button class="btn small primary" data-clreview="' + esc(x.id) + '">' + tr('Review now') + '</button>' : '<button class="btn small" data-clhand="' + esc(x.id) + '">' + tr('Request handoff') + '</button><button class="btn small ghost" data-clback="' + esc(x.id) + '">' + tr('Back to backlog') + '</button>'))) +
      sec(tr('Design variants without a choice'), tr('Claude is holding off on implementing'), c.design.map((x) => row(x, '<button class="btn small primary" data-cldesign="' + esc(x.id) + '">' + tr('View design variants') + '</button>'))) +
      sec(tr('Incomplete'), tr('Claude cannot start cleanly like this'), c.incomplete.map((x) => row(x, '<button class="btn small" data-open="' + esc(x.id) + '">' + tr('Fill in') + '</button>')).concat(c.noEffort.length ? ['<div class="cl-row"><span class="st"></span><div class="q-t"><strong>' + tr('{n} tasks without effort', { n: c.noEffort.length }) + '</strong><span class="q-meta">' + tr('{ids} count as M in sprint and timeline', { ids: esc(c.noEffort.slice(0, 8).join(', ')) }) + '</span></div>' + (EDIT ? '<button class="btn small" data-cltable>' + tr('Estimate in the table') + '</button>' : '') + '</div>'] : [])) +
      sec(tr('Probably duplicates'), tr('similar titles, tags and description'), c.dups.map((p) => '<div class="cl-row"><span class="st"></span><div class="q-t"><span><button class="q-title" data-open="' + esc(p.a.id) + '">' + esc(p.a.id + ' ' + p.a.title) + '</button> ' + tr('and') + ' <button class="q-title" data-open="' + esc(p.b.id) + '">' + esc(p.b.id + ' ' + p.b.title) + '</button></span><span class="q-meta">' + tr('{n} percent match', { n: p.score }) + '</span></div>' + (EDIT ? '<button class="btn small primary" data-clmerge="' + esc(p.a.id) + '|' + esc(p.b.id) + '">' + tr('Merge') + '</button><button class="btn small ghost" data-cldis="' + esc(p.a.id) + '|' + esc(p.b.id) + '">' + tr('Not a duplicate') + '</button>' : '') + '</div>')) +
      sec(tr('Old and untouched'), tr('over 60 days in the backlog'), c.old.map((x) => row(x, '<button class="btn small" data-clidea="' + esc(x.id) + '">' + tr('Turn into idea') + '</button>'))) +
      (c.old.length > 1 && EDIT ? '<div class="row-btns"><button class="btn small" data-clideaall>' + tr('Turn all {n} into ideas', { n: c.old.length }) + '</button></div>' : '');
    $$('[data-sclose]', body).forEach((b) => b.onclick = closeSide);
    $$('[data-open]', body).forEach((b) => b.onclick = () => { closeSide(); openTask(b.dataset.open); });
    const again = () => renderCleanup(body, head);
    const go = async (fn, msg) => { if (await run(fn, msg)) again(); };
    $$('[data-clreview]', body).forEach((b) => b.onclick = () => { closeSide(); openReview(b.dataset.clreview); });
    $$('[data-cldesign]', body).forEach((b) => b.onclick = () => { closeSide(); detailTab = 'design'; openTask(b.dataset.cldesign).then(() => { detailTab = 'design'; renderDetail(); }); });
    $$('[data-clhand]', body).forEach((b) => b.onclick = () => go(() => act('requestHandoff', { id: b.dataset.clhand }), (x) => x.message));
    $$('[data-clback]', body).forEach((b) => b.onclick = () => go(() => act('move', { id: b.dataset.clback, to: 'backlog', reason: tr('Was stuck, back to backlog') }), tr('{id} back to backlog', { id: b.dataset.clback })));
    $$('[data-cltable]', body).forEach((b) => b.onclick = () => { closeSide(); tableSort.key = 'effort'; tableSort.dir = -1; setView('table'); });
    $$('[data-clmerge]', body).forEach((b) => b.onclick = async () => {
      const [a, c2] = b.dataset.clmerge.split('|');
      const keep = await showDialog('<h2>' + tr('Merge') + '</h2><p class="lead">' + tr('Which task stays? The other one is discarded; its description and open criteria end up as a comment in the one that stays.') + '</p>' + segCtl('keep', [{ id: a, label: tr('Keep {id}', { id: a }) }, { id: c2, label: tr('Keep {id}', { id: c2 }) }], a) + foot(tr('Merge')), (fd) => fd.get('keep'));
      if (keep) go(() => act('merge', { keep, drop: keep === a ? c2 : a }), (x) => x.message);
    });
    $$('[data-cldis]', body).forEach((b) => b.onclick = () => { const [a, c2] = b.dataset.cldis.split('|'); go(() => act('dismissDuplicate', { a, b: c2 }), (x) => x.message); });
    $$('[data-clidea]', body).forEach((b) => b.onclick = () => go(() => act('toIdeas', { ids: [b.dataset.clidea] }), (x) => x.message));
    $$('[data-clideaall]', body).forEach((b) => b.onclick = async () => { if (await confirmBox({ title: tr('Turn {n} tasks into ideas', { n: c.old.length }), lead: tr('They are discarded and noted as ideas. Undo brings them back.'), confirm: tr('Turn into ideas') })) go(() => act('toIdeas', { ids: c.old.map((x) => x.id) }), (x) => x.message); });
  }

  // ---------- Duplikate beim Anlegen ----------

  function bindDuplicateCheck(f) {
    const ti = $('input[name="title"]', f);
    if (!ti || !LIVE) return;
    const box = document.createElement('div');
    box.className = 'dup';
    box.hidden = true;
    ti.closest('label').after(box);
    let dismissed = '';
    const check = async () => {
      const title = ti.value.trim();
      if (title.length < 6) { box.hidden = true; return; }
      let list = [];
      try { list = await api('GET', 'api/similar?title=' + encodeURIComponent(title) + '&text=' + encodeURIComponent(String((($('textarea[name="description"], textarea[name="text"]', f) || {}).value) || '').slice(0, 800))); } catch (e) { return; }
      list = list.filter((x) => x.id !== dismissed);
      if (!list.length) { box.hidden = true; return; }
      const x = list[0];
      box.hidden = false;
      box.innerHTML = '<strong>' + tr('Sounds like an open task') + '</strong><button type="button" class="btn link" data-dupopen="' + esc(x.id) + '">' + esc(x.id + ' ' + x.title) + '</button><span class="sublabel">' + esc(L(x.status) + ', ' + x.priority + ', ' + tr('{n} percent similar', { n: x.score })) + '</span><div class="row-btns"><button type="button" class="btn small primary" data-dupcomment="' + esc(x.id) + '">' + tr('As a comment on {id}', { id: esc(x.id) }) + '</button><button type="button" class="btn small ghost" data-dupignore>' + tr('Create anyway') + '</button></div>';
      $('[data-dupignore]', box).onclick = () => { dismissed = x.id; box.hidden = true; };
      $('[data-dupopen]', box).onclick = () => { $('button[value="cancel"]', form).click(); openTask(x.id); };
      $('[data-dupcomment]', box).onclick = async () => {
        const desc = String((($('textarea[name="description"], textarea[name="text"]', f) || {}).value) || '').trim();
        const r = await run(() => act('comment', { id: x.id, text: tr('Addition instead of a new task “{title}”', { title }) + (desc ? ':\n\n' + desc : '.') }), tr('Saved as a comment on {id}', { id: x.id }));
        if (r) $('button[value="cancel"]', form).click();
      };
    };
    let tmr = null;
    ti.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(check, 350); });
  }

  // ---------- Import ----------

  const IMPORT_HELP = tr('Trello (JSON export), Notion (CSV or ZIP export), Linear (CSV), CSV and TSV, Excel (.xlsx), Word (.docx) with lists, checkboxes or tables, Markdown and text with lists.');
  async function openImport(prev) {
    let file = null;
    const fmts = [['auto', tr('Detect automatically')], ['trello', 'Trello'], ['notion', 'Notion'], ['linear', 'Linear'], ['csv', 'CSV'], ['xlsx', 'Excel'], ['docx', 'Word'], ['md', tr('Markdown or text')]];
    const pre = await showDialog('<h2>' + tr('Import tasks') + '</h2><p class="lead">' + esc(IMPORT_HELP) + ' ' + tr('You see a preview first and pick what to import.') + '</p>' +
      '<label class="imp-drop" id="impDrop"><input type="file" id="impFile" accept=".json,.csv,.tsv,.xlsx,.xlsm,.docx,.md,.markdown,.txt,.zip" hidden><strong id="impName">' + tr('Choose a file or drag it here') + '</strong><span class="sublabel">' + tr('up to 20 MB') + '</span></label>' +
      '<div class="grid"><label class="field span2"><span>Format</span><select name="format">' + fmts.map((f) => '<option value="' + f[0] + '"' + (prev && prev.format === f[0] ? ' selected' : '') + '>' + esc(f[1]) + '</option>').join('') + '</select></label>' +
      '<label class="field span2"><span>' + tr('Map columns, optional') + '</span><input class="input" name="map" placeholder="' + tr('title=Task, status=List') + '" value="' + esc(prev ? prev.map : '') + '"></label></div>' +
      '<p class="sublabel">' + tr('For running text without lists, such as minutes or emails, it is better to give Claude the file. Claude reads it and suggests tasks.') + '</p>' + foot(tr('Preview')),
    async (fd) => {
      if (!file) throw new Error(tr('Please choose a file.'));
      const qs = new URLSearchParams({ name: file.name, format: fd.get('format'), map: fd.get('map') || '' });
      const r = await api('POST', 'api/import?' + qs.toString(), undefined, { body: file, type: 'application/octet-stream' });
      return { ...r, chosen: fd.get('format'), map: fd.get('map') || '' };
    }, (f) => {
      const inp = $('#impFile', f); const drop = $('#impDrop', f);
      const setF = (x) => { file = x; $('#impName', f).textContent = x ? x.name + ' (' + Math.max(1, Math.round(x.size / 1024)) + ' KB)' : tr('Choose a file or drag it here'); };
      inp.onchange = () => setF(inp.files[0] || null);
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) setF(e.dataTransfer.files[0]); };
    });
    if (pre) importPreviewDialog(pre);
  }

  async function importPreviewDialog(r) {
    const sel = new Set(r.selected);
    const st = { erledigt: tr('Done'), verworfen: tr('Discarded'), 'in-arbeit': tr('in progress there'), review: tr('in review there'), geplant: tr('Planned'), backlog: '' };
    const rows = r.candidates.map((c) => '<tr class="' + (c.dup ? 'dupr' : '') + '"><td><input type="checkbox" class="impc" data-n="' + c.n + '"' + (sel.has(c.n) ? ' checked' : '') + ' aria-label="' + tr('Import {title}', { title: esc(c.title) }) + '"></td>' +
      '<td><strong>' + esc(c.title) + '</strong>' + (c.description ? '<span class="sublabel">' + esc(c.description.split('\n')[0].slice(0, 120)) + '</span>' : '') + (c.dup ? '<span class="late sublabel">' + esc(c.dupKind) + ': ' + esc(c.dup) + '</span>' : '') + '</td>' +
      '<td>' + esc(meta.typeLabel[c.type] || c.type) + '</td><td>' + esc(c.priority || '') + '</td><td>' + esc(st[c.status] ?? c.status) + '</td><td>' + esc([c.effort, c.due ? fmtDate(c.due) : '', c.criteria.length ? tr('{n} crit.', { n: c.criteria.length }) : ''].filter(Boolean).join(', ')) + '</td><td>' + (c.tags || []).map((t) => '<span class="tag">#' + esc(t) + '</span>').join(' ') + '</td><td class="muted">' + esc(c.origin) + '</td></tr>').join('');
    const html = '<h2>' + tr('Preview: {name}', { name: esc(r.name) }) + '</h2><p class="lead">' + tr('Format {format}', { format: esc(r.format) }) + (r.sheet ? tr(', sheet {sheet}', { sheet: esc(r.sheet) }) : '') + '. ' + tr('{n} entries, {sel} preselected. Duplicates and done items are deselected.', { n: r.candidates.length, sel: sel.size }) + '</p>' +
      (r.mapping ? '<p class="sublabel">' + tr('Columns: {map}', { map: Object.entries(r.mapping).map(([k, v]) => esc(k) + ' = ' + esc(v)).join(', ') }) + (r.header ? tr('. Available: {cols}', { cols: r.header.map(esc).join(', ') }) : '') + '</p>' : '') +
      (r.candidates.length ? '<div class="imp-wrap"><table class="tbl imp"><thead><tr><th><input type="checkbox" id="impAll" aria-label="' + tr('All') + '"></th><th>' + tr('Title') + '</th><th>' + tr('Type') + '</th><th>Prio</th><th>Status</th><th>Details</th><th>Tags</th><th>' + tr('Origin') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="q-empty">' + tr('No tasks recognized. Change the format or the column mapping.') + '</div>') +
      '<div class="grid"><label class="field span2"><span>' + tr('Column for new tasks without status') + '</span><select name="status"><option value="backlog">Backlog</option><option value="geplant">' + tr('Planned') + '</option></select></label><label class="field span2"><span>' + tr('Additional tags') + '</span><input class="input" name="tags" placeholder="import, trello"></label></div>' +
      '<p class="sublabel">' + tr('Tasks that were in progress or in review there go to Planned. Without description and criteria they are marked as incomplete, and Claude then asks.') + '</p>' +
      '<p class="err" role="alert"></p><div class="foot"><button type="button" class="btn" id="impBack" style="margin-right:auto">' + tr('Other file') + '</button><button class="btn" value="cancel" formnovalidate>' + tr('Cancel') + '</button><button class="btn primary" value="ok" id="impGo">' + tr('Import') + '</button></div>';
    const res = await showDialog(html, (fd) => {
      const only = $$('.impc', form).filter((c) => c.checked).map((c) => +c.dataset.n);
      if (!only.length) throw new Error(tr('No entries selected.'));
      return act('importApply', { token: r.token, only, status: fd.get('status'), tags: String(fd.get('tags') || '').split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean), format: r.format, map: r.map || '' });
    }, (f) => {
      const count = () => { const n = $$('.impc', f).filter((c) => c.checked).length; $('#impGo', f).textContent = n === 1 ? tr('Import 1 task') : n ? tr('Import {n} tasks', { n }) : tr('Nothing selected'); $('#impGo', f).disabled = !n; };
      $$('.impc', f).forEach((c) => c.onchange = count);
      const all = $('#impAll', f); if (all) all.onchange = () => { $$('.impc', f).forEach((c) => { c.checked = all.checked; }); count(); };
      $('#impBack', f).onclick = () => { $('button[value="cancel"]', f).click(); setTimeout(() => openImport({ format: r.chosen, map: r.map }), 50); };
      count();
    });
    if (res) { if (res.undo) undoToast(res.message, res.undo); else ok(res.message); }
  }

  // ---------- Sprint-Rückblick ----------

  async function openRetro(sp, st, list) {
    const byId = byIdNow();
    const open = list.filter((t) => OPEN.includes(t.status));
    const set = meta.sprintSettings || { points: { S: 1, M: 2, L: 4, XL: 8 } };
    const pts = (t) => set.points[t.effort] ?? set.points.M;
    const eff = meta.effortDays || { S: 2, M: 5, L: 10, XL: 15 };
    const ins = [];
    const done = list.filter((t) => t.status === 'erledigt');
    const fast = done.filter((t) => t.effort && t.started && t.completed && Math.round((new Date(t.completed) - new Date(t.started)) / 86400000) < (eff[t.effort] || 5));
    if (fast.length) ins.push(['good', fast.length === 1 ? tr('1 task was finished faster than estimated.') : tr('{n} tasks were finished faster than estimated.', { n: fast.length })]);
    for (const t of done.filter((x) => x.effort && x.started && x.completed)) {
      const days = Math.max(1, Math.round((new Date(t.completed) - new Date(t.started)) / 86400000));
      if (days > (eff[t.effort] || 5) * 1.3) ins.push(['bad', tr('{id} was estimated as {effort} and took {days} days.', { id: t.id, effort: t.effort, days })]);
    }
    const added = list.filter((t) => t.created && t.created > sp.start);
    if (added.length) ins.push(['warn', added.length === 1 ? tr('1 task was added after the start: {ids}.', { ids: added.map((t) => t.id).join(', ') }) : tr('{n} tasks were added after the start: {ids}.', { n: added.length, ids: added.map((t) => t.id).join(', ') })]);
    if (open.length) ins.push(['info', tr('Left open: {ids}, {points} points in total.', { ids: open.map((t) => t.id).join(', '), points: open.reduce((a, t) => a + pts(t), 0) })]);
    const unread = list.filter((t) => t.status === 'review');
    if (unread.length) ins.push(['warn', unread.length === 1 ? tr('{ids} is still in review.', { ids: unread.map((t) => t.id).join(', ') }) : tr('{ids} are still in review.', { ids: unread.map((t) => t.id).join(', ') })]);
    let usage = null;
    try { usage = await api('GET', 'api/usage'); } catch (e) { usage = null; }
    if (usage && usage.total.tokens) ins.push(['info', tr('Usage of the last {days} days: {tokens} tokens, estimated {cost}.', { days: usage.days, tokens: fmtTok(usage.total.tokens), cost: fmtMoney(usage.total.cost, usage.currency) })]);
    const icon = { good: ['good', '+'], bad: ['late', '!'], warn: ['warn-t', '!'], info: ['muted', '·'] };
    // [CSS-Klasse, Text]
    const goal = st.done >= st.planned ? ['good', tr('reached')] : st.done >= st.planned * 0.7 ? ['warn-t', tr('partly')] : ['late', tr('not reached')];
    const seen = [st.done, meta.lastSprint && meta.lastSprint.result ? meta.lastSprint.result.done : 0].filter((n) => n > 0);
    const nextCap = seen.length ? Math.max(1, Math.round(seen.reduce((a, n) => a + n, 0) / seen.length)) : (st.capacity || set.capacity || 20);
    const html = '<h2>' + tr('Retrospective on {sprint}', { sprint: esc(sp.id + ' ' + sp.title) }) + '</h2><p class="lead">' + tr('{from} to {to}', { from: esc(fmtDate(sp.start)), to: esc(fmtDate(sp.end)) }) + '</p>' +
      '<div class="code-cards"><div><small>' + tr('Achieved') + '</small><strong>' + tr('{done} of {total}', { done: st.done, total: st.planned }) + '</strong><span class="muted">' + tr('points') + '</span></div><div><small>' + tr('Goal') + '</small><strong class="' + goal[0] + '">' + goal[1] + '</strong><span class="muted">' + esc(sp.goal || tr('no goal')) + '</span></div><div><small>' + tr('Added later') + '</small><strong>' + added.length + '</strong><span class="muted">' + tr('after the start') + '</span></div>' + (meta.lastSprint && meta.lastSprint.result ? '<div><small>' + tr('Previous sprint') + '</small><strong>' + meta.lastSprint.result.done + '</strong><span class="muted">' + tr('points achieved') + '</span></div>' : '') + '</div>' +
      '<div class="block"><div class="block-head"><h3>' + tr('What the data says') + '</h3></div><ul class="retro">' + (ins.length ? ins.map(([k, txt]) => '<li><span class="' + icon[k][0] + '">' + icon[k][1] + '</span><span>' + esc(txt) + '</span></li>').join('') : '<li><span class="muted">·</span><span>' + tr('Nothing stands out.') + '</span></li>') + '</ul></div>' +
      '<div class="block"><div class="block-head"><h3>' + tr('Three questions for you') + '</h3><span class="meta">' + tr('optional, Claude uses the answers for the next sprint') + '</span></div>' +
      '<label class="field"><span>' + tr('What went well?') + '</span><input class="input" name="good" maxlength="500"></label><label class="field"><span>' + tr('What slowed you down?') + '</span><input class="input" name="bad" maxlength="500"></label><label class="field"><span>' + tr('What do we change in the next sprint?') + '</span><input class="input" name="change" maxlength="500"></label></div>' +
      '<div class="row-btns">' + (open.length ? '<label class="toggle"><input type="checkbox" name="carry" checked> ' + tr('Carry over {ids}', { ids: esc(open.map((t) => t.id).join(', ')) }) + '</label>' : '') + '<label class="toggle">' + tr('Capacity for the next sprint') + ' <input class="input" type="number" name="cap" min="1" max="1000" value="' + nextCap + '" style="width:90px;height:30px"></label></div>' +
      '<p class="err" role="alert"></p><div class="foot"><button class="btn" value="cancel" formnovalidate>' + tr('Cancel') + '</button><button class="btn" value="close">' + tr('Only close') + '</button><button class="btn primary" value="plan">' + tr('Close and plan the next one') + '</button></div>';
    let carry = true;
    const r = await showDialog(html, async (fd, sub) => {
      carry = fd.get('carry') === 'on';
      const res = await act('sprintClose', { retro: { good: fd.get('good'), bad: fd.get('bad'), change: fd.get('change') }, nextCapacity: fd.get('cap') });
      return { ...res, plan: sub === 'plan' };
    });
    if (!r) return;
    ok(r.message);
    if (r.plan) {
      await run(() => act('sprintStart', { title: 'Sprint ' + ((parseInt(String(sp.id).slice(1), 10) || 0) + 1), goal: '', capacity: undefined, carry }), (x) => x.message);
      setView('sprint');
    }
  }

  // ---------- Discord-Bot (W-0038): Dialog nach J2, Einrichtung nach R, Kanalwahl nach K ----------
  // Einstellungen sammeln sich als Entwurf unter den Schlüsseln von works discord set; Speichern schickt ihn, die
  // Vorschau rechnet schon mit ihm. Token, Schlüssel und Code stehen nie im DOM, nur kurz im Eingabefeld.

  const DC_TABS = [['verbindung', tr('Connection')], ['projekte', tr('Projects')], ['ereignisse', tr('Events')], ['befehle', tr('Commands')], ['datenschutz', tr('Privacy')]];
  const DC_PV = [['perm', tr('Approval waiting')], ['idle', tr('Done, waiting for you')], ['review', tr('In review')], ['ci_red', tr('CI red')], ['dashboard', 'Dashboard']];
  const DC_HINT = { review: tr('With the buttons Accept and Back to Claude'), shipped: tr('works ship as one message that ticks off its steps'), ci_red: tr('With the first error and bug ID') };
  const onOff = (b) => (b ? 'an' : 'aus');
  const dcAgo = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? tr('just now') : m < 60 ? (m === 1 ? tr('{n} minute ago', { n: m }) : tr('{n} minutes ago', { n: m })) : m < 1440 ? tr('{n} h ago', { n: Math.round(m / 60) }) : tr('{n} days ago', { n: Math.round(m / 1440) }); };

  // Gespeicherter Stand unter den Schlüsseln von works discord set.
  function dcValues(s) {
    const v = { auto_enroll: onOff(s.auto_enroll), commands: onOff(s.commands_on), 'quiet.on': onOff(s.quiet.on), 'quiet.from': s.quiet.from, 'quiet.to': s.quiet.to, 'delay.perm': String(s.delays.perm), 'delay.idle': String(s.delays.idle), 'cleanup.seconds': String(s.cleanup.seconds) };
    for (const g of s.events) for (const e of g.items) { v['event.' + e.key + '.on'] = onOff(e.on); v['event.' + e.key + '.at'] = onOff(e.at); }
    for (const k of Object.keys(s.privacy)) v['privacy.' + k] = onOff(s.privacy[k]);
    for (const p of s.projects) { v['project.' + p.rid] = onOff(p.enabled); v['project.' + p.rid + '.channel'] = p.channel_id || ''; }
    return v;
  }

  // Nachricht wie in Discord: Absender, Text mit Erwähnung, Einbettung mit Feldern, Knöpfe. Nur Text, nichts aus dem Netz.
  function dcMessage(m) {
    const md = (t) => esc(t).replace(/\\([[\]])/g, '$1').replace(/&lt;t:(\d+):R&gt;/g, (x, n) => dcAgo(+n * 1000)).replace(/&lt;@\d+&gt;/g, '<span class="dc-men">' + esc(tr('@you')) + '</span>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    const e = (m.embeds || [])[0] || {};
    const fields = (e.fields || []).map((f) => '<div' + (f.inline === false ? ' class="wide"' : '') + '><strong>' + md(f.name) + '</strong>' + md(f.value) + '</div>').join('');
    const comps = (m.components || []).flatMap((r) => r.components || []);
    return '<div class="dc-who"><i>w</i><b>works</b><em>APP</em></div>' + (m.content ? '<div class="dc-txt">' + md(m.content) + '</div>' : '') +
      '<div class="dc-emb" style="--c:#' + Number(e.color || 0x5865f2).toString(16).padStart(6, '0') + '">' + (e.author ? '<span class="dc-a">' + md(e.author.name) + '</span>' : '') + (e.title ? '<b>' + md(e.title) + '</b>' : '') +
      (e.description ? '<div>' + md(e.description) + '</div>' : '') + (fields ? '<div class="dc-f">' + fields + '</div>' : '') + (e.image ? '<div class="dc-img">' + tr('Image: progress per project, done per day') + '</div>' : '') +
      (e.footer ? '<span class="dc-ft">' + md(e.footer.text) + '</span>' : '') + '</div>' +
      (comps.length ? '<div class="dc-btns">' + comps.map((c) => (c.type === 3 ? '<span class="sel">' + esc(c.placeholder || tr('Selection')) + ' ▾</span>' : '<span class="s' + c.style + '">' + esc(c.label) + (c.style === 5 ? ' ↗' : '') + '</span>')).join('') + '</div>' : '');
  }

  async function openDiscord() {
    let s;
    try { s = await api('GET', 'api/discord'); } catch (e) { return fail(e); }
    let saved = dcValues(s);
    let draft = {};
    let tab = 'verbindung';
    let way = s.mode || 'shared'; // Weg beim ersten Mal (R), der gemeinsame Bot ist empfohlen
    let chans = null; let chErr = ''; let pick = ''; let guild = '';
    let pvType = 'perm'; let pvSeq = 0; let pvTimer = 0;
    let root = null;
    const val = (k) => (k in draft ? draft[k] : saved[k]);
    const on = (k) => val(k) === 'an';
    const link = (href, text) => '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + text + '</a>';
    const sw = (k, label, hint) => '<label class="switch small"><span><b>' + esc(label) + '</b>' + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</span><input type="checkbox" data-k="' + k + '"' + (on(k) ? ' checked' : '') + '><i aria-hidden="true"></i></label>';
    const bare = (k, label) => '<label class="switch dc-bare"><input type="checkbox" data-k="' + k + '"' + (on(k) ? ' checked' : '') + ' aria-label="' + esc(label) + '"><i aria-hidden="true"></i></label>';
    const at = (k, label) => '<button type="button" class="dc-at" data-k="' + k + '" aria-pressed="' + on(k) + '" aria-label="' + esc(tr('Mention for {label}', { label })) + '">@</button>';
    const num = (k, label, unit, max) => '<label class="field"><span>' + esc(label) + '</span><div class="dc-numin"><input class="input" type="number" min="0" max="' + max + '" step="1" data-k="' + k + '" value="' + esc(val(k)) + '"><small>' + esc(unit) + '</small></div></label>';
    const step = (n, cls, title, body) => '<li class="dc-step ' + cls + '"><span class="dc-num" aria-hidden="true">' + n + '</span><div><h3>' + title + '</h3>' + body + '</div></li>';
    const tokenBox = () => '<div class="dc-box"><div class="dc-pw"><input class="input" id="dcToken" type="password" autocomplete="off" spellcheck="false" aria-label="' + esc(tr('Bot token')) + '"><button type="button" class="btn small primary" id="dcTokenGo">' + tr('Verify') + '</button></div><p class="dc-hint">' + tr('Stored only on this computer and shown only masked afterwards.') + '</p></div>';
    const codeBox = () => '<div class="dc-box"><div class="dc-pw"><input class="input" id="dcCode" autocomplete="off" spellcheck="false" placeholder="ABCD-2345" aria-label="' + esc(tr('Code from Discord')) + '"><button type="button" class="btn small primary" id="dcCodeGo">' + tr('Pair') + '</button></div><p class="dc-hint">' + tr('In the terminal, use {cmd}.', { cmd: '<code>works discord link &lt;' + esc(tr('code')) + '&gt;</code>' }) + '</p></div>';
    const enabled = () => s.projects.filter((p) => on('project.' + p.rid)).length;
    const eventsOn = () => s.events.reduce((n, g) => n + g.items.filter((e) => on('event.' + e.key + '.on')).length, 0);
    const sub = () => (s.ready ? [s.running ? tr('online since {time}', { time: timeOf(s.running.since) }) : tr('stopped'), s.mode === 'shared' ? tr('Shared bot') : tr('Own bot'), tr('#{channel} on {guild}', { channel: s.channel_name, guild: s.guild_name }), enabled() === 1 ? tr('{n} project', { n: 1 }) : tr('{n} projects', { n: enabled() })].join(' · ') : s.secret ? tr('Channel still missing') : tr('not set up'));

    function stepsOwn() {
      const has = !!s.secret;
      return '<p class="dc-lead">' + tr('Four steps, then the bot runs for all projects on this computer. Also possible in the terminal with {cmd}.', { cmd: '<code>works discord token</code>' }) + '</p><ol class="dc-steps">' +
        step(has ? '✓' : 1, has ? 'done' : '', tr('Create the bot'), '<p>' + tr('Create an application with a bot in the {portal} and copy the token.', { portal: link('https://discord.com/developers/applications', tr('Discord developer portal')) }) + '</p>') +
        step(has ? '✓' : 2, has ? 'done' : 'cur', tr('Enter the token'), has ? '<div class="dc-res">' + tr('Valid: {name}', { name: esc(s.bot_name) }) + '</div>' : '<p>' + tr('Paste the token from the portal, works checks it right away.') + '</p>' + tokenBox()) +
        step(3, has ? 'cur' : '', tr('Invite it to your server'), '<p>' + tr('The link only asks for the permissions works needs.') + (s.invite_url ? ' ' + link(s.invite_url, tr('Open the invite link')) : '') + '</p><div class="dc-rights"><span>' + tr('View channel') + '</span><span>' + tr('Send messages') + '</span><span>' + tr('Embed links') + '</span><span>' + tr('Pin') + '</span><span>' + tr('Commands') + '</span></div>') +
        step(4, '', tr('Choose a channel'), '<p>' + tr('The dashboard and the notifications of all projects go there.') + (has ? ' ' + tr('The list is below.') : '') + '</p>') + '</ol>';
    }

    function stepsShared() {
      const sv = s.service || {};
      return '<div class="alert info">' + tr('With the shared bot, messages go through the works service: project name, task IDs, titles and status, depending on privacy. The service stores no content, only which message belongs to your key.') + '</div><ol class="dc-steps">' +
        step(1, 'cur', tr('Invite the bot'), sv.invite_url ? '<p>' + tr('{link}, choose a server and confirm.', { link: link(sv.invite_url, tr('Open the invite link')) }) + '</p>'
          : '<p>' + esc(sv.error || tr('The works service is not responding right now.')) + '</p><div class="dc-pw"><input class="input" id="dcService" type="url" placeholder="https://…" value="' + esc(sv.base || '') + '" aria-label="' + esc(tr('Address of the works service')) + '"><button type="button" class="btn small" data-dc="service">' + tr('Save address') + '</button></div>') +
        step(2, '', tr('Run /works link in the channel'), '<p>' + tr('In Discord, in the channel works should write to. Needs the “Manage Server” permission. The bot replies only to you with a code.') + '</p>') +
        step(3, '', tr('Enter the code'), codeBox()) + '</ol>';
    }

    function pSetup() {
      const card = (k, title, items, tag) => '<button type="button" class="dc-card" data-dc-path="' + k + '" role="radio" aria-checked="' + (way === k) + '">' + (tag ? '<span class="dc-tag">' + tag + '</span>' : '') + '<b>' + title + '</b><ul>' + items.map((x) => '<li>' + x + '</li>').join('') + '</ul></button>';
      return '<p class="dc-lead">' + tr('Notifications on your phone for all projects on this computer. How should works write?') + '</p><div class="dc-choice" role="radiogroup" aria-label="' + esc(tr('Method')) + '">' +
        card('shared', tr('Shared bot'), [tr('Invite and pair with a code'), tr('No token, nothing in the developer portal'), tr('Runs through the works service')], tr('Recommended')) +
        card('own', tr('Own bot'), [tr('Create a bot in the Discord developer portal'), tr('Token only on this computer'), tr('Nothing runs through third-party servers')]) + '</div>' + (way === 'shared' ? stepsShared() : stepsOwn());
    }

    // Kanalwahl nach K: Server und Textkanäle live vom Bot, nach Kategorie; ohne Schreibrecht ausgegraut mit Grund.
    function pChannels() {
      let body;
      if (chErr) body = '<p class="dc-bad">' + esc(chErr) + '</p>';
      else if (!chans) body = '<p class="dc-hint">' + tr('Reading channels live from the bot …') + '</p>';
      else if (!chans.guilds.length) body = '<p class="dc-hint">' + tr('works is not on any server yet. Invite it first, then reload the list.') + '</p>';
      else {
        const g = chans.guilds.find((x) => x.id === guild) || chans.guilds[0];
        let cat = '';
        const rows = g.channels.map((c) => {
          const head = c.category && c.category !== cat ? '<div class="dc-cat">' + esc(c.category) + '</div>' : '';
          cat = c.category;
          const cur = c.id === s.channel_id;
          return head + '<label class="dc-ch' + (cur ? ' on' : '') + (c.can ? '' : ' off') + '"><input type="radio" name="dcch" value="' + esc(c.id) + '"' + ((pick || s.channel_id) === c.id ? ' checked' : '') + (c.can ? '' : ' disabled') + '><span>#' + esc(c.name) + '</span><small>' + (cur ? tr('here now') : c.can ? tr('can write') : esc(c.why)) + '</small></label>';
        }).join('');
        body = (chans.guilds.length > 1 ? '<label class="field"><span>Server</span><select class="input" id="dcGuild">' + chans.guilds.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === g.id ? ' selected' : '') + '>' + esc(x.name) + ' (' + tr('{n} channels', { n: x.channels.length }) + ')</option>').join('') + '</select></label>' : '<p class="dc-hint">Server <b>' + esc(g.name) + '</b></p>') +
          '<div class="dc-list" role="radiogroup" aria-label="' + esc(tr('Channel')) + '">' + (rows || '<p class="dc-hint dc-pad">' + tr('No text channels.') + '</p>') + '</div>';
      }
      return '<section class="dc-sec"><h3>' + tr('Channel for dashboard and notifications') + '</h3>' + body +
        '<p class="dc-hint">' + (s.mode === 'shared' ? tr('With the shared bot, these are the channels of the paired server.') : tr('Server missing? Invite the bot with the invite link.')) + ' ' + tr('The list comes live from the bot.') + '</p>' +
        '<div class="row-btns">' + (s.mode !== 'shared' && s.invite_url ? '<a class="btn small" href="' + esc(s.invite_url) + '" target="_blank" rel="noopener">' + tr('Invite the bot') + '</a>' : '') + '<button type="button" class="btn small ghost" data-dc="reload">' + tr('Reload list') + '</button><span class="spacer"></span><span class="dc-hint dc-target"></span><button type="button" class="btn small primary" id="dcMove" disabled>' + tr('Move here') + '</button></div></section>';
    }

    function pConn() {
      if (!s.secret) return pSetup();
      const shared = s.mode === 'shared';
      return (s.ready ? '<div class="dc-conn' + (s.running ? '' : ' off') + '"><b>' + (s.running ? tr('works is online') : tr('works is stopped')) + '</b><dl class="dc-kv">' +
          '<dt>Server</dt><dd>' + esc(s.guild_name) + '</dd><dt>' + tr('Channel') + '</dt><dd>#' + esc(s.channel_name) + '</dd>' +
          '<dt>' + tr('Method') + '</dt><dd>' + (shared ? tr('Shared bot') + (s.service && s.service.base ? ' ' + tr('via {url}', { url: esc(s.service.base) }) : '') : tr('Own bot {name}', { name: esc(s.bot_name) })) + '</dd>' +
          '<dt>' + tr('Running') + '</dt><dd>' + (s.running ? tr('on this computer since {time}, for all projects', { time: esc(timeOf(s.running.since)) }) : s.autostart ? tr('starts with the board or a Claude session') : tr('no, autostart is off')) + '</dd>' +
          '<dt>' + tr('Mentioned') + '</dt><dd>' + (shared ? tr('whoever ran /works link') : s.owner ? tr('the owner of the bot application, detected during setup') : tr('nobody, the owner was not detected')) + '</dd></dl>' +
          '<div class="row-btns"><button type="button" class="btn small" data-dc="test">' + tr('Test message') + '</button>' + (s.running ? '' : '<button type="button" class="btn small ghost" data-dc="start">' + tr('Start bot') + '</button>') + '</div></div>' : stepsOwn()) +
        pChannels() +
        '<div class="dc-token">' + (shared ? tr('Device key') : 'Token') + ' <code>' + esc(s.secret) + '</code><span class="spacer"></span><button type="button" class="btn small ghost" data-dc="replace">' + (shared ? tr('Pair again') : tr('Replace')) + '</button></div><div class="dc-replace" hidden>' + (shared ? codeBox() : tokenBox()) + '</div>' +
        '<p class="dc-hint">' + (shared ? tr('The key is stored only on this computer and may only write to the paired channel.') : tr('The token is stored only on this computer, readable only by you. Never in the project, in Git or in logs.')) + '</p>' +
        '<div class="dc-danger"><div><b>' + tr('Disconnect bot') + '</b><small>' + (shared ? tr('Revokes the key at the service and stops the bot. The messages stay in Discord.') : tr('Deletes the token from this computer and stops the bot. The messages stay in Discord.')) + '</small></div><button type="button" class="btn small danger" data-dc="disconnect">' + tr('Disconnect') + '</button></div>';
    }

    // Kanal je Projekt (W-0046): beim eigenen Bot aus der Liste vom Bot, leer heißt Standardkanal. Der gemeinsame Bot
    // schreibt in genau einen Kanal, dort ist die Wahl gesperrt.
    function chanSel(p) {
      const k = 'project.' + p.rid + '.channel';
      const cur = val(k);
      const attrs = ' class="input" data-k="' + k + '" aria-label="' + esc(tr('Channel for {name}', { name: p.name })) + '"';
      const std = '<option value="">#' + esc(s.channel_name || '–') + ' (' + tr('default') + ')</option>';
      if (s.mode === 'shared') return '<select' + attrs + ' disabled>' + std + '</select>';
      const many = chans && chans.guilds.length > 1;
      const all = chans ? chans.guilds.flatMap((g) => g.channels.map((c) => ({ ...c, g: g.name }))).filter((c) => c.id !== s.channel_id) : [];
      const opts = all.map((c) => '<option value="' + esc(c.id) + '"' + (c.id === cur ? ' selected' : '') + (c.can ? '' : ' disabled') + '>#' + esc(c.name) + (many ? ' · ' + esc(c.g) : '') + (c.can ? '' : ' (' + esc(c.why) + ')') + '</option>');
      if (cur && !all.some((c) => c.id === cur)) opts.unshift('<option value="' + esc(cur) + '" selected>' + esc(cur === p.channel_id ? p.channel : '#' + cur) + '</option>');
      return '<select' + attrs + '>' + std + opts.join('') + '</select>';
    }
    const pProjects = () => '<div class="dc-tblwrap"><table class="dc-tbl"><thead><tr><th>' + tr('Project') + '</th><th>' + tr('Channel') + '</th><th>Dashboard</th><th>' + tr('On') + '</th></tr></thead><tbody>' +
      s.projects.map((p) => '<tr><td>' + esc(p.name) + (p.here ? '<small>' + tr('current project') + '</small>' : '') + '</td><td>' + chanSel(p) + '</td><td>' + (p.dash ? tr('pinned') + (p.dash > 1e12 ? '<small>' + tr('edited {ago}', { ago: dcAgo(p.dash) }) + '</small>' : '') : tr('none yet')) + '</td><td>' + bare('project.' + p.rid, tr('Notifications for {name}', { name: p.name })) + '</td></tr>').join('') +
      '</tbody></table></div>' + sw('auto_enroll', tr('Enroll new projects automatically'), tr('They appear in the dashboard of the default channel as soon as their board or a Claude session runs')) +
      '<p class="dc-hint">' + (s.mode === 'shared' ? tr('The shared bot writes to exactly one channel, the paired one. A channel per project is only available with your own bot.') + ' ' : chErr ? esc(chErr) + ' ' : '') +
      tr('One dashboard per channel for all projects that report there. Projects that are switched off are missing there and send no notifications.') + '</p>';

    function pEvents() {
      const grp = (g) => {
        const n = g.items.filter((e) => on('event.' + e.key + '.on')).length;
        return '<div class="dc-grp"><div class="dc-grp-h"><b>' + esc(g.group) + '</b><small>' + tr('{n} of {total}', { n, total: g.items.length }) + '</small><span class="spacer"></span><label class="switch dc-bare"><input type="checkbox" data-grp="' + esc(g.group) + '"' + (n === g.items.length ? ' checked' : '') + ' aria-label="' + esc(tr('Group {name}', { name: g.group })) + '"><i aria-hidden="true"></i></label></div>' +
          g.items.map((e) => '<div class="dc-row"><span><b>' + esc(e.label) + '</b>' + (e.key === 'perm' && !on('privacy.commands') ? '<small>' + tr('Command hidden, see Privacy') + '</small>' : DC_HINT[e.key] ? '<small>' + esc(DC_HINT[e.key]) + '</small>' : '') + '</span>' + at('event.' + e.key + '.at', e.label) + bare('event.' + e.key + '.on', tr('Send {label}', { label: e.label })) + '</div>').join('') + '</div>';
      };
      return '<div class="dc-legend"><span><span class="dc-at" aria-pressed="true">@</span> ' + tr('rings with a mention') + '</span><span><span class="dc-at" aria-pressed="false">@</span> ' + tr('arrives silently') + '</span></div>' + s.events.map(grp).join('') +
        '<div class="dc-quiet"><span><b>' + tr('Quiet hours') + '</b><small>' + tr('Mentions also arrive silently then, nothing gets lost') + '</small></span>' + bare('quiet.on', tr('Quiet hours')) +
        '<div class="dc-times">' + tr('from') + ' <input class="input" type="time" data-k="quiet.from" value="' + esc(val('quiet.from')) + '" aria-label="' + esc(tr('Quiet hours from')) + '"> ' + tr('until') + ' <input class="input" type="time" data-k="quiet.to" value="' + esc(val('quiet.to')) + '" aria-label="' + esc(tr('Quiet hours until')) + '"></div></div>' +
        '<div class="dc-nums">' + num('delay.perm', tr('Report approval after'), tr('seconds'), 3600) + num('delay.idle', tr('Report done after'), tr('seconds'), 3600) + num('cleanup.seconds', tr('Delete messages after'), tr('seconds, 0 never'), 2592000) + '</div>' +
        '<p class="dc-hint">' + tr('The delay saves notifications when you were faster. The dashboard stays; task cards and open messages are deleted only once they are dealt with.') + '</p>';
    }

    // Schalter nach J2 (W-0046); ausgeschaltet wird die Liste blass (CSS über :has).
    const pCmds = () => sw('commands', tr('Allow commands and buttons'), s.mode === 'shared' ? tr('Only you, as the person who ran /works link. Only you see the replies.') : tr('Only you, as the owner of the bot application. Only you see the replies.')) +
      '<div class="dc-cmdl">' + s.commands.map((c) => '<div><code>' + esc(c.cmd) + '</code><span>' + esc(c.text) + '</span></div>').join('') + '<div><code>' + tr('Buttons') + '</code><span>' + tr('Accept, Back to Claude, Instruction to Claude, New task, View bug') + '</span></div></div>' +
      '<p class="dc-hint">' + (s.mode === 'shared' ? tr('When off, works shows no buttons on the dashboard and on new messages and answers /works only with a short note. You still grant tool approvals in Claude Code.') : tr('When off, works shows no buttons on the dashboard and on new messages and unregisters /works on the server. You still grant tool approvals in Claude Code.')) + '</p>';
    const pPrivacy = () => sw('privacy.commands', tr('Show commands from approvals'), tr('May contain paths, addresses or secrets')) + sw('privacy.costs', tr('Show costs'), tr('Daily costs in the dashboard, cost per task in review')) +
      sw('privacy.ci_error', tr('Show the error line on red CI'), tr('First line of the error from the log')) + sw('privacy.titles', tr('Show task titles'), tr('Off: only IDs, e.g. for servers with other people')) +
      '<p class="dc-hint">' + tr('Links go to GitHub, never to the local board.') + ' ' + (s.mode === 'shared' ? tr('The device key is stored nowhere except on this computer.') : tr('The token is stored nowhere except on this computer.')) + '</p>';
    const PANELS = { verbindung: pConn, projekte: pProjects, ereignisse: pEvents, befehle: pCmds, datenschutz: pPrivacy };

    const badge = (k) => (k === 'projekte' ? enabled() : k === 'ereignisse' ? tr('{n} on', { n: eventsOn() }) : '');
    const tabsHtml = () => DC_TABS.map(([k, l]) => '<button type="button" role="tab" data-dc-tab="' + k + '" aria-selected="' + (tab === k) + '"' + (!s.ready && k !== 'verbindung' ? ' aria-disabled="true"' : '') + '>' + l + (s.ready && badge(k) !== '' ? ' <span class="dc-n">' + badge(k) + '</span>' : '') + '</button>').join('');
    const n = () => Object.keys(draft).length;
    const footHtml = () => (s.ready
      ? '<span class="dc-dirty"' + (n() ? '' : ' hidden') + '>' + (n() === 1 ? tr('{n} change not saved', { n: 1 }) : tr('{n} changes not saved', { n: n() })) + '</span><span class="spacer"></span><button type="button" class="btn ghost" data-dc="discard"' + (n() ? '' : ' disabled') + '>' + tr('Discard') + '</button><button class="btn primary" value="save"' + (n() ? '' : ' disabled') + '>' + tr('Save') + '</button>'
      : '<span class="dc-hint">' + tr('You can change the settings after setup.') + '</span><span class="spacer"></span><button class="btn ghost" value="cancel" formnovalidate>' + tr('Set up later') + '</button>');
    const inner = () => '<div class="dc-head"><span class="dc-bot' + (s.running ? '' : ' off') + '" aria-hidden="true">w</span><div><h2>' + tr('works Discord bot') + '</h2><small>' + esc(sub()) + '</small></div><span class="spacer"></span><button class="btn small ghost" value="cancel" formnovalidate>' + tr('Close') + '</button></div>' +
      '<div class="dc-tabs" role="tablist" aria-label="' + esc(tr('Sections')) + '">' + tabsHtml() + '</div>' +
      '<div class="dc-main" role="tabpanel">' + PANELS[tab]() + '</div>' +
      '<aside class="dc-side" aria-label="' + esc(tr('Preview')) + '"><b>' + (s.ready ? tr('Preview') : tr('This is how it will look')) + '</b><label class="field"><span>' + tr('Message') + '</span><select class="input" id="dcPv">' + DC_PV.map(([k, l]) => '<option value="' + k + '"' + (k === pvType ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
        '<div class="dc-pv" id="dcPvBox"><p class="dc-hint">' + tr('Loading …') + '</p></div><b>' + tr('On the phone') + '</b><div class="dc-lock" id="dcLock"></div><p class="dc-cap"></p></aside>' +
      '<p class="err dc-err" role="alert"></p><div class="dc-foot">' + footHtml() + '</div>';

    async function preview() {
      const seq = ++pvSeq;
      let r;
      try { r = await api('POST', 'api/discord', { op: 'preview', type: pvType, draft }); } catch (e) { r = { error: e.message }; }
      if (seq !== pvSeq || !root || !root.isConnected) return;
      if (r.error) { $('#dcPvBox', root).innerHTML = '<p class="dc-bad">' + esc(r.error) + '</p>'; return; }
      $('#dcPvBox', root).innerHTML = dcMessage(r);
      const lock = $('#dcLock', root);
      // Ein eben erst gewählter Kanal je Projekt hat noch keinen gespeicherten Namen: aus der Liste vom Bot.
      const ch = r.channel || ((chans ? chans.guilds.flatMap((g) => g.channels) : []).find((c) => c.id === r.channel_id) || {}).name || 'works';
      lock.className = 'dc-lock' + (r.ring ? '' : ' mute');
      lock.innerHTML = r.ring ? '<i>w</i><b>works · #' + esc(ch) + '</b><span>' + esc(String(r.content || '').replace(/<@\d+>/g, tr('@you'))) + '</span>' : '<b>' + tr('No notification') + '</b><span>' + tr('The message only appears in the channel.') + '</span>';
      $('.dc-cap', root).textContent = r.why;
    }
    const schedule = () => { clearTimeout(pvTimer); pvTimer = setTimeout(preview, 150); };
    const say = (msg) => { const e = $('.dc-err', root); if (e) e.textContent = msg || ''; };
    function renderMain() { $('.dc-tabs', root).innerHTML = tabsHtml(); $('.dc-main', root).innerHTML = PANELS[tab](); updateMove(); }
    function renderAll() { if (!s.ready) tab = 'verbindung'; root.innerHTML = inner(); updateMove(); preview(); }
    function refresh() { $('.dc-foot', root).innerHTML = footHtml(); $('.dc-tabs', root).innerHTML = tabsHtml(); $('.dc-head small', root).textContent = sub(); }
    function updateMove() {
      const b = $('#dcMove', root);
      if (!b) return;
      const c = pick && pick !== s.channel_id && chans ? chans.guilds.flatMap((g) => g.channels).find((x) => x.id === pick) : null;
      b.disabled = !c || !c.can;
      $('.dc-target', root).textContent = c ? tr('New channel: #{name}', { name: c.name }) : '';
    }
    const setK = (k, v) => { if (saved[k] === v) delete draft[k]; else draft[k] = v; refresh(); schedule(); };
    function syncGroups() {
      for (const g of s.events) {
        const box = $('[data-grp="' + g.group + '"]', root);
        if (!box) continue;
        const cnt = g.items.filter((e) => on('event.' + e.key + '.on')).length;
        box.checked = cnt === g.items.length;
        box.closest('.dc-grp-h').querySelector('small').textContent = tr('{n} of {total}', { n: cnt, total: g.items.length });
      }
    }
    async function reload() {
      s = await api('GET', 'api/discord');
      saved = dcValues(s);
      for (const k of Object.keys(draft)) if (saved[k] === draft[k]) delete draft[k];
      renderAll();
    }
    async function loadChannels() {
      if (!s.secret) return;
      chErr = '';
      try { chans = await api('GET', 'api/discord/channels'); } catch (e) { chans = null; chErr = e.message; }
      if (root && root.isConnected && (tab === 'verbindung' || tab === 'projekte')) renderMain();
    }
    // Aktion mit Rückmeldung im Dialog; der Knopf ist solange gesperrt.
    async function busy(btn, fn) {
      say('');
      if (btn) btn.disabled = true;
      try { await fn(); } catch (e) { say(e.message); } finally { if (btn && btn.isConnected) btn.disabled = false; }
    }
    function secretGo(btn, op, input) {
      const field = $(input, root);
      return busy(btn, async () => {
        const r = await api('POST', 'api/discord', op === 'token' ? { op, token: field.value } : { op, code: field.value });
        field.value = '';
        chans = null;
        await reload();
        loadChannels();
        ok(op !== 'token' ? tr('Paired: #{channel} on {guild}', { channel: r.channel_name, guild: r.guild_name }) : r.channel ? tr('Token valid: {name}', { name: r.bot_name }) : tr('Token valid: {name}. Now invite it and choose a channel.', { name: r.bot_name }));
      });
    }

    await showDialog('<div class="dc">' + inner() + '</div>', async (fd, v) => {
      if (v !== 'save') return undefined;
      s = await api('POST', 'api/discord', { op: 'set', values: draft });
      saved = dcValues(s); draft = {};
      renderAll();
      ok(tr('Saved. The bot picks it up without a restart.'));
      return undefined;
    }, (f) => {
      root = $('.dc', f);
      root.addEventListener('click', (ev) => {
        const t = ev.target.closest('[data-dc-tab]');
        if (t) { if (t.getAttribute('aria-disabled') !== 'true') { tab = t.dataset.dcTab; renderMain(); } return; }
        const a = ev.target.closest('button.dc-at[data-k]');
        if (a) { const v = a.getAttribute('aria-pressed') !== 'true'; a.setAttribute('aria-pressed', String(v)); setK(a.dataset.k, onOff(v)); return; }
        const w = ev.target.closest('[data-dc-path]');
        if (w) { way = w.dataset.dcPath; renderMain(); return; }
        const b = ev.target.closest('[data-dc], #dcMove, #dcTokenGo, #dcCodeGo');
        if (!b) return;
        if (b.id === 'dcTokenGo') return secretGo(b, 'token', '#dcToken');
        if (b.id === 'dcCodeGo') return secretGo(b, 'link', '#dcCode');
        if (b.id === 'dcMove') {
          return busy(b, async () => {
            const r = await api('POST', 'api/discord', { op: 'move', channel_id: pick });
            pick = '';
            await reload();
            ok(r.running ? tr('Dashboard moves to #{channel}. The bot creates it there and deletes the old one.', { channel: r.channel_name }) : tr('Channel #{channel} saved.', { channel: r.channel_name }));
          });
        }
        const op = b.dataset.dc;
        if (op === 'discard') { draft = {}; renderAll(); return; }
        if (op === 'replace') { const x = $('.dc-replace', root); x.hidden = !x.hidden; return; }
        if (op === 'reload') { chans = null; renderMain(); loadChannels(); return; }
        if (op === 'test') return busy(b, async () => { const r = await api('POST', 'api/discord', { op: 'test' }); ok(tr('Test message sent to #{channel}', { channel: r.channel_name })); });
        if (op === 'start') return busy(b, async () => { await api('POST', 'api/discord', { op: 'start' }); await new Promise((r) => setTimeout(r, 1500)); await reload(); });
        if (op === 'service') return busy(b, async () => { await api('POST', 'api/discord', { op: 'set', values: { service: $('#dcService', root).value.trim() } }); await reload(); });
        // Trennen in zwei Klicks statt eines zweiten Dialogs.
        if (op === 'disconnect') {
          if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = tr('Really disconnect'); return; }
          return busy(b, async () => { await api('POST', 'api/discord', { op: 'disconnect' }); chans = null; way = 'shared'; await reload(); ok(tr('Disconnected. The messages in Discord stay.')); });
        }
      });
      root.addEventListener('change', (ev) => {
        const x = ev.target;
        if (x.dataset.k) { setK(x.dataset.k, x.type === 'checkbox' ? onOff(x.checked) : x.value); if (x.dataset.k.startsWith('event.')) syncGroups(); return; }
        if (x.dataset.grp) {
          const g = s.events.find((y) => y.group === x.dataset.grp);
          for (const e of g.items) { const k = 'event.' + e.key + '.on'; const box = $('[data-k="' + k + '"]', root); if (box) box.checked = x.checked; setK(k, onOff(x.checked)); }
          syncGroups();
          return;
        }
        if (x.name === 'dcch') { pick = x.value; updateMove(); return; }
        if (x.id === 'dcGuild') { guild = x.value; pick = ''; renderMain(); return; }
        if (x.id === 'dcPv') { pvType = x.value; preview(); }
      });
      // Enter in einem Feld würde sonst den ersten Knopf des Formulars auslösen (Schließen).
      root.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT') return;
        ev.preventDefault();
        const go = { dcToken: '#dcTokenGo', dcCode: '#dcCodeGo' }[ev.target.id];
        if (go) $(go, root).click();
      });
      updateMove();
      preview();
      loadChannels();
    });
  }

  // ---------- Werkzeuge: Wiederkehrend, GitHub, Kalender, Verbrauch, Rückgängig ----------

  async function toolsExtra() {
    const [rec, gh, usage, undos, share] = await Promise.all([
      api('GET', 'api/recurring').catch(() => null), api('GET', 'api/github').catch(() => null), api('GET', 'api/usage').catch(() => null),
      EDIT ? api('GET', 'api/undo').catch(() => []) : Promise.resolve([]), EDIT ? api('GET', 'api/share').catch(() => null) : Promise.resolve(null),
    ]);
    const h = [];
    const loc = I18N.lang === 'de' ? 'de-DE' : 'en-GB';
    h.push('<div class="row-btns tools-top"><button class="btn small" data-openside="knowledge">' + tr('Project knowledge') + (meta.knowledgeProposals ? tr(' ({n} new)', { n: meta.knowledgeProposals }) : '') + '</button><button class="btn small" data-openside="cleanup">' + tr('Clean up') + '</button>' + (EDIT ? '<button class="btn small" id="btnImport">' + tr('Import') + '</button><button class="btn small" id="btnBackup">' + tr('Back up and restore') + '</button>' : '') + (EDIT && LIVE ? '<button class="btn small" id="btnDiscord">' + tr('Discord bot') + '</button>' : '') + '</div>');
    h.push('<details class="sec" id="parSec"><summary>' + tr('Parallel work') + ' <span class="meta">' + ((meta.lanes || []).length ? tr('{n} active', { n: meta.lanes.length }) : tr('none')) + '</span></summary><div class="body" id="parBody"><p class="md">' + tr('Before working through several tasks, Claude checks whether they can run at the same time in their own Git worktrees and then starts one agent per task. If it is unsure, it asks you.') + '</p><p class="muted">' + tr('Loads when opened …') + '</p></div></details>');
    if (rec) {
      h.push('<details class="sec"><summary>' + tr('Recurring tasks') + ' <span class="meta">' + rec.rules.length + '</span></summary><div class="body">' +
        '<p class="md">' + tr('works creates them on schedule by itself, at session start or while the board is running. If the previous one is still open, no second one is created.') + '</p>' +
        (rec.rules.length ? rec.rules.map((r) => '<div class="tpl-row"><div class="q-t"><strong>' + esc(r.title) + '</strong><span class="q-meta">' + esc(r.text + (r.active === false ? tr(', paused') : tr(', next {date}', { date: fmtDate(r.next[0]) }))) + (r.lastTask ? tr(', last {id}', { id: esc(r.lastTask) }) : '') + '</span></div>' + (EDIT ? '<button class="btn small ghost" data-recedit="' + esc(r.id) + '">' + tr('Edit') + '</button>' : '') + '</div>').join('') : '<p class="md empty-md">' + tr('No rules yet.') + '</p>') +
        (EDIT ? '<div class="row-btns"><button class="btn small primary" id="recNew">' + tr('New rule') + '</button><button class="btn small" id="recRun">' + tr('Check now') + '</button></div>' : '') + '</div></details>');
    }
    if (gh) {
      const s = gh.settings; const st = gh.state;
      const sw = (k, l) => '<label class="switch small"><span><b>' + esc(l) + '</b></span><input type="checkbox" data-gh="' + k + '"' + (s[k] ? ' checked' : '') + (EDIT ? '' : ' disabled') + '><i aria-hidden="true"></i></label>';
      h.push('<details class="sec"><summary>GitHub <span class="meta">' + (st && st.repo ? esc(st.repo) : tr('not connected')) + '</span></summary><div class="body">' +
        '<p class="md">' + tr('Syncs via the gh CLI at session start and every {n} minutes while the board is running.', { n: s.interval_min }) + (st && st.last ? ' ' + tr('Last {date}.', { date: esc(new Date(st.last).toLocaleString(loc, { dateStyle: 'short', timeStyle: 'short' })) }) : '') + '</p>' +
        sw('enabled', tr('Sync automatically')) + sw('pr_review', tr('PR opened: task to review')) + sw('merge_done', tr('PR merged: complete the task')) + sw('ci_checks', tr('CI checks as a check')) + sw('review_comments', tr('Change requests as a comment to Claude')) + sw('issues', tr('New issues as tasks')) + sw('close_issues', tr('A done task closes its issue')) +
        '<label class="field"><span>' + tr('Only issues with these labels, empty for all') + '</span><input class="input" id="ghLabels" value="' + esc((s.labels || []).join(', ')) + '"' + (EDIT ? '' : ' disabled') + '></label>' +
        (st && st.events && st.events.length ? '<ol class="commits">' + st.events.slice(0, 8).map((e) => '<li><time class="muted num">' + esc(new Date(e.at).toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</time><span class="subj">' + esc(e.text) + '</span></li>').join('') + '</ol>' : '') +
        (EDIT ? '<div class="row-btns"><button class="btn small" id="ghSync">' + tr('Sync now') + '</button></div>' : '') + '</div></details>');
    }
    if (LIVE) {
      const local = location.origin + '/kalender.ics';
      const viewKey = share && share.shared && share.links[0] ? share.links[0].view.replace(/\/\?view=/, '/kalender.ics?key=') : '';
      h.push('<details class="sec"><summary>' + tr('Calendar') + '</summary><div class="body"><p class="md">' + tr('Due dates, milestones and sprints to subscribe to in Google Calendar, Outlook or Apple Calendar.') + '</p>' +
        '<div class="share-link"><span>' + tr('On this computer') + '</span><input class="input mono" readonly value="' + esc(local) + '"><button type="button" class="btn small" data-copy2="' + esc(local) + '">' + tr('Copy') + '</button></div>' +
        (viewKey ? '<div class="share-link"><span>' + tr('In the network, with read key') + '</span><input class="input mono" readonly value="' + esc(viewKey) + '"><button type="button" class="btn small" data-copy2="' + esc(viewKey) + '">' + tr('Copy') + '</button></div>' : '') +
        '<div class="row-btns"><a class="btn small" href="kalender.ics?recurring=1" download="termine.ics">' + tr('Download as file') + '</a></div><p class="sublabel">' + tr('Online calendars need the file; they cannot reach your computer.') + '</p></div></details>');
    }
    if (usage) {
      h.push('<details class="sec"><summary>' + tr('Usage') + ' <span class="meta">' + (usage.total.tokens ? tr('{cost} in {days} days', { cost: fmtMoney(usage.total.cost, usage.currency), days: usage.days }) : tr('nothing recorded yet')) + '</span></summary><div class="body">' +
        (usage.total.tokens ? '<div class="code-cards"><div><small>Tokens</small><strong>' + fmtTok(usage.total.tokens) + '</strong><span class="muted">' + tr('of which {tokens} cache', { tokens: fmtTok(usage.total.cr + usage.total.cw) }) + '</span></div><div><small>' + tr('Estimated cost') + '</small><strong>' + fmtMoney(usage.total.cost, usage.currency) + '</strong><span class="muted">' + (usage.untrackedCost > 0 ? tr('{cost} without an active task', { cost: fmtMoney(usage.untrackedCost, usage.currency) }) : tr('all assigned to tasks')) + '</span></div></div>' +
          '<div class="est-grid">' + usage.byType.map((b) => '<strong>' + esc(meta.typeLabel[b.type] || b.type) + '</strong><div class="est-track"><span class="est-bar" style="width:' + (b.cost / (usage.byType[0].cost || 1) * 100).toFixed(1) + '%"></span></div><span class="num">' + fmtMoney(b.cost, usage.currency) + ', ' + tr('across {n} tasks', { n: b.tasks }) + '</span>').join('') + '</div>' +
          (usage.top.length ? '<p class="sublabel">' + tr('Most expensive: {list}', { list: usage.top.slice(0, 4).map((x) => esc(x.id) + ' ' + fmtMoney(x.cost, usage.currency)).join(', ') }) + '</p>' : '') : '<p class="md empty-md">' + tr('The Stop hook assigns the usage of every reply to the active task.') + '</p>') +
        '<p class="sublabel">' + tr('Estimate based on the prices in config.json under prices (US dollars per million tokens). Please compare with your plan.') + '</p></div></details>');
    }
    if (EDIT && undos.length) {
      h.push('<details class="sec"><summary>' + tr('Recent changes') + ' <span class="meta">' + tr('Ctrl+Z undoes the last one') + '</span></summary><div class="body">' + undos.slice(0, 10).map((u) => '<div class="tpl-row"><span class="muted num">' + esc(timeOf(u.at)) + '</span><span class="q-t">' + esc(u.label) + '</span><button class="btn small ghost" data-undo="' + esc(u.key) + '">' + tr('Revert') + '</button></div>').join('') + '</div></details>');
    }
    // Sprache (W-0041): global oder nur für dieses Projekt. WORKS_LANG in der Umgebung hat Vorrang.
    if (EDIT) {
      const langs = I18N.languages || [];
      h.push('<details class="sec" id="langSec"><summary>' + tr('Language') + ' <span class="meta">' + esc((langs.find((l) => l.code === I18N.lang) || {}).name || I18N.lang) + '</span></summary><div class="body">' +
        (I18N.source === 'env' ? '<p class="sublabel">' + tr('WORKS_LANG is set in the environment and takes precedence over this setting.') + '</p>' : '') +
        '<label class="field"><span>' + tr('Language') + '</span><select id="langSel">' + langs.map((l) => '<option value="' + esc(l.code) + '"' + (l.code === I18N.lang ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select></label>' +
        segCtl('langScope', [{ id: 'global', label: tr('For all projects') }, { id: 'project', label: tr('Only this project') }], I18N.source === 'project' ? 'project' : 'global') +
        '<div class="row-btns"><button class="btn small primary" id="langApply">' + tr('Apply') + '</button>' + (I18N.source === 'project' ? '<button class="btn small ghost" id="langReset">' + tr('Follow the global language') + '</button>' : '') + '</div></div></details>');
    }
    return h.join('');
  }

  function bindToolsExtra(body) {
    const bi = $('#btnImport', body); if (bi) bi.onclick = () => openImport();
    const bk = $('#btnBackup', body); if (bk) bk.onclick = () => openBackup();
    const dc = $('#btnDiscord', body); if (dc) dc.onclick = () => openDiscord();
    const ps = $('#parSec', body);
    if (ps) ps.addEventListener('toggle', async () => {
      if (!ps.open || ps.dataset.loaded) return;
      let r; try { r = await api('GET', 'api/parallel'); } catch (e) { $('#parBody', body).innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
      ps.dataset.loaded = '1';
      const v = { parallel: ['good', tr('Parallel possible')], nacheinander: ['', tr('Better one after another')], unsicher: ['warn-t', tr('Unsure, Claude asks you')] }[r.plan.verdict];
      $('#parBody', body).innerHTML = (r.lanes.length ? '<div class="block"><div class="block-head"><h3>' + tr('Currently running') + '</h3></div>' + r.lanes.map((l) => '<div class="tpl-row"><div class="q-t"><button class="q-title" data-open="' + esc(l.task) + '">' + esc(l.task) + '</button><span class="q-meta mono">' + esc(l.branch) + '</span></div><span class="muted">' + tr('{n} commits', { n: l.ahead }) + (l.dirty ? tr(', {n} open', { n: l.dirty }) : '') + (l.status === 'konflikt' ? tr(', conflict') : '') + '</span></div>').join('') + '</div>' : '') +
        '<div class="block"><div class="block-head"><h3>' + tr('Assessment for the next tasks') + '</h3></div><p><strong class="' + v[0] + '">' + v[1] + '</strong></p><ul class="retro">' + r.plan.reasons.map((x) => '<li><span class="muted">·</span><span>' + esc(x) + '</span></li>').join('') + '</ul>' +
        (r.plan.lanes.length && r.plan.verdict !== 'nacheinander' ? '<p class="sublabel">' + tr('At the same time: {ids}', { ids: r.plan.lanes.map((l) => esc(l.id)).join(', ') }) + (r.plan.later.length ? tr('. Then: {ids}', { ids: r.plan.later.slice(0, 6).map((l) => esc(l.id)).join(', ') }) : '') + '</p>' : '') +
        (r.plan.skipped.length ? '<p class="sublabel">' + tr('Not for agents: {list}', { list: r.plan.skipped.slice(0, 6).map((x) => esc(x.id) + ' (' + esc(x.why[0]) + ')').join(', ') }) + '</p>' : '') + '</div>';
      $$('[data-open]', $('#parBody', body)).forEach((b) => b.onclick = () => { closeSide(); openTask(b.dataset.open); });
    });
    $$('[data-openside]', body).forEach((b) => b.onclick = () => { side = null; openSide(b.dataset.openside); });
    $$('[data-copy2]', body).forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy2); } catch (e) { b.previousElementSibling.select(); document.execCommand('copy'); } b.textContent = tr('Copied'); setTimeout(() => { b.textContent = tr('Copy'); }, 1500); });
    if (!EDIT) return;
    $$('[data-undo]', body).forEach((b) => b.onclick = async () => { if (await run(() => act('undo', { key: b.dataset.undo }), (x) => x.message)) renderSide(); });
    $$('[data-gh]', body).forEach((c) => c.onchange = () => run(() => act('githubSettings', { [c.dataset.gh]: c.checked }), tr('Saved')));
    const gl = $('#ghLabels', body); if (gl) gl.onchange = () => run(() => act('githubSettings', { labels: gl.value }), tr('Saved'));
    const gs = $('#ghSync', body); if (gs) gs.onclick = async () => { gs.disabled = true; gs.textContent = tr('Syncing …'); await run(() => act('githubSync', {}), (x) => x.message || tr('Synced')); renderSide(); };
    // Sprache wechseln: der Server ruft works lang auf, danach lädt die Seite in der neuen Sprache.
    const la = $('#langApply', body);
    if (la) la.onclick = async () => {
      la.disabled = true;
      const scope = ($('input[name="langScope"]:checked', body) || {}).value || 'global';
      if (await run(() => api('POST', 'api/lang', { lang: $('#langSel', body).value, scope }))) location.reload();
      else la.disabled = false;
    };
    const lr = $('#langReset', body);
    if (lr) lr.onclick = async () => {
      lr.disabled = true;
      if (await run(() => api('POST', 'api/lang', { lang: '', scope: 'project' }))) location.reload();
      else lr.disabled = false;
    };
    const rn = $('#recRun', body); if (rn) rn.onclick = () => run(() => act('recurRun', {}), (x) => x.message);
    const rr = $('#recNew', body); if (rr) rr.onclick = () => editRule(null);
    $$('[data-recedit]', body).forEach((b) => b.onclick = () => editRule(b.dataset.recedit));
  }

  async function editRule(rid) {
    let info;
    try { info = await api('GET', 'api/recurring'); } catch (e) { return fail(e); }
    const r = rid ? info.rules.find((x) => x.id === rid) : { title: '', kind: 'weekly', weekday: 1, nth: 1, interval: 1, status: 'geplant', active: true, priority: 'P3', type: 'chore' };
    const days = [tr('Monday'), tr('Tuesday'), tr('Wednesday'), tr('Thursday'), tr('Friday'), tr('Saturday'), tr('Sunday')];
    const opt = (list, cur) => list.map((o) => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur ?? '') ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('');
    const html = '<h2>' + (rid ? tr('Edit rule') : tr('New recurring task')) + '</h2>' +
      '<label class="field"><span>' + tr('Title; {Datum} (date) and {Monat} (month) are replaced') + '</span><input class="input" name="title" required maxlength="150" value="' + esc(r.title) + '" placeholder="' + tr('Update dependencies ({Monat})') + '" autofocus></label>' +
      '<div class="grid"><label class="field span2"><span>' + tr('Basis') + '</span><select name="template"><option value="">' + tr('No template') + '</option>' + info.templates.map((t) => '<option value="' + esc(t.slug) + '"' + (r.template === t.slug ? ' selected' : '') + '>' + tr('Template {name}', { name: esc(t.name) }) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>' + tr('Type') + '</span><select name="type">' + opt(Object.entries(meta.typeLabel), r.type) + '</select></label><label class="field"><span>' + tr('Priority') + '</span><select name="priority">' + opt(PRIOS.map((p) => [p, p]), r.priority) + '</select></label></div>' +
      '<div class="field"><span>' + tr('Frequency') + '</span>' + segCtl('kind', [{ id: 'daily', label: tr('Daily') }, { id: 'weekly', label: tr('Weekly') }, { id: 'monthly', label: tr('Monthly') }, { id: 'days', label: tr('Every N days') }], r.kind) + '</div>' +
      '<div class="grid"><label class="field"><span>' + tr('Every how many') + '</span><input class="input" type="number" name="interval" min="1" max="365" value="' + esc(r.interval || 1) + '"></label><label class="field"><span>' + tr('Weekday') + '</span><select name="weekday">' + opt(days.map((d, i) => [i + 1, d]), r.weekday || 1) + '</select></label><label class="field"><span>' + tr('In the month') + '</span><select name="nth">' + opt([[1, tr('first')], [2, tr('second')], [3, tr('third')], [4, tr('fourth')], [5, tr('last')]], r.nth || 1) + '</select></label><label class="field"><span>' + tr('Due after days') + '</span><input class="input" type="number" name="due_days" min="0" max="365" value="' + esc(r.due_days || '') + '"></label></div>' +
      '<div class="row-btns"><label class="toggle"><input type="checkbox" name="queue"' + (r.queue ? ' checked' : '') + '> ' + tr('Into the queue') + '</label><label class="toggle"><input type="checkbox" name="sprint"' + (r.sprint ? ' checked' : '') + '> ' + tr('Into the current sprint') + '</label><label class="toggle"><input type="checkbox" name="active"' + (r.active !== false ? ' checked' : '') + '> ' + tr('Active') + '</label></div>' +
      foot(rid ? tr('Save') : tr('Create rule'), { extra: rid ? '<button type="button" class="btn danger" id="recDel" style="margin-right:auto">' + tr('Delete') + '</button>' : '' });
    const res = await showDialog(html, (fd) => {
      const rule = { title: fd.get('title'), template: fd.get('template'), type: fd.get('type'), priority: fd.get('priority'), kind: fd.get('kind'), interval: fd.get('kind') === 'days' || fd.get('kind') === 'weekly' ? fd.get('interval') : '', weekday: fd.get('weekday'), nth: fd.get('kind') === 'monthly' ? fd.get('nth') : '', due_days: fd.get('due_days'), queue: fd.get('queue') === 'on', sprint: fd.get('sprint') === 'on', active: fd.get('active') === 'on', status: 'geplant' };
      return act('recurSave', { rule, rid: rid || '' });
    }, (f) => { const d = $('#recDel', f); if (d) d.onclick = async () => { if (await run(() => act('recurRemove', { rid }), tr('Rule deleted'))) { $('button[value="cancel"]', f).click(); if (side === 'tools') renderSide(); } }; });
    if (res) { ok(res.message); if (side === 'tools') renderSide(); }
  }

  // ---------- Schnellsuche (rechte Shift-Taste oder Strg+K) ----------

  const pal = $('#palette');
  const palIn = $('#palIn');
  const palList = $('#palList');
  let palItems = [];
  let palSel = 0;

  function paletteCommands() {
    const c = [];
    if (EDIT) c.push({ label: tr('New task'), hint: 'N', run: () => newTask() });
    VIEWS.forEach((v, i) => c.push({ label: tr('Show {view}', { view: VIEW_LABEL[v] }), hint: String(i + 1), run: () => setView(v) }));
    (meta.views || []).forEach((v) => c.push({ label: tr('View “{name}”', { name: v.name }), run: () => applySavedView(v) }));
    if (LIVE) c.push({ label: tr('Weekly report, templates, checks, notifications'), run: () => openSide('tools') });
    if (LIVE) c.push({ label: tr('Project knowledge'), run: () => openSide('knowledge') });
    if (LIVE) c.push({ label: tr('Clean up'), run: () => openSide('cleanup') });
    if (LIVE && EDIT) c.push({ label: tr('Import tasks'), run: () => openImport() });
    if (LIVE && EDIT) c.push({ label: tr('Back up and restore (JSON)'), run: () => openBackup() });
    if (EDIT) c.push({ label: tr('Undo last change'), hint: tr('Ctrl+Z'), run: () => run(() => act('undo', {}), (x) => x.message) });
    if (LIVE) {
      c.push({ label: tr('Suggest next task'), run: () => openSide('next') });
      c.push({ label: tr('Open ideas'), run: () => openSide('ideas') });
      c.push({ label: tr('Show activity'), run: () => openSide('activity') });
    }
    if (EDIT) {
      c.push({ label: tr('Share or export board'), run: () => openShare() });
      c.push({ label: tr('Create milestone'), run: () => editMilestone(null) });
    }
    c.push({ label: tr('Change color scheme'), run: () => $('#btnTheme').click() });
    c.push({ label: state.closed ? tr('Hide archive and discarded') : tr('Show archive and discarded'), run: () => { state.closed = !state.closed; renderAll(); } });
    if (filtersActive()) c.push({ label: tr('Reset filters'), run: resetFilters });
    PRIOS.forEach((p) => c.push({ label: tr('Show only {prio} {label}', { prio: p, label: meta.prioLabel[p] }), run: () => { state.prios = new Set([p]); renderAll(); } }));
    meta.milestones.forEach((m) => c.push({ label: tr('Filter milestone {id} {title}', { id: m.id, title: m.title }), run: () => { state.ms = m.id; renderAll(); } }));
    COLS.forEach((s) => c.push({ label: tr('Jump to column {col}', { col: L(s) }), run: () => { const col = $('.col[data-col="' + s + '"]'); if (col) col.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', inline: 'start', block: 'nearest' }); } }));
    return c.map((x) => ({ ...x, kind: 'cmd' }));
  }

  function mark(text, q) {
    if (!q) return esc(text);
    const i = text.toLowerCase().indexOf(q);
    if (i === -1) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }

  function scoreTask(t, q) {
    if (!q) return OPEN.includes(t.status) ? 10 - PRIOS.indexOf(t.priority) + (t.status === 'in-arbeit' ? 5 : 0) : -1;
    const id = t.id.toLowerCase(); const title = t.title.toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const hay = id + ' ' + title + ' ' + t.tags.join(' ') + ' ' + (meta.typeLabel[t.type] || '').toLowerCase() + ' ' + (t.milestone || '').toLowerCase();
    if (!words.every((w) => hay.includes(w))) return -1;
    let s = 0;
    if (id === q || id.replace('-', '') === q.replace('-', '')) s += 100;
    else if (id.includes(q)) s += 60;
    if (title.startsWith(q)) s += 40; else if (title.includes(q)) s += 25;
    if (OPEN.includes(t.status)) s += 8;
    s += 4 - PRIOS.indexOf(t.priority);
    return s;
  }

  function renderPalette() {
    const raw = palIn.value.trim();
    let items = [];
    if (raw.startsWith('>')) {
      const q = raw.slice(1).trim().toLowerCase();
      items = paletteCommands().filter((c) => !q || c.label.toLowerCase().includes(q)).map((c) => ({ ...c, q }));
    } else if (raw.startsWith('#')) {
      const q = raw.slice(1).trim().toLowerCase();
      const tags = [...new Set(tasks.flatMap((t) => t.tags))].filter((g) => !q || g.toLowerCase().includes(q)).sort();
      items = tags.slice(0, 12).map((g) => ({ kind: 'tag', label: '#' + g, q: q ? '#' + q : '', count: tasks.filter((t) => t.tags.includes(g) && OPEN.includes(t.status)).length, run: () => { state.tag = g; renderAll(); } }));
    } else {
      const q = raw.toLowerCase();
      items = tasks.map((t) => ({ t, s: scoreTask(t, q) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, q ? 12 : 8)
        .map((x) => ({ kind: 'task', t: x.t, q, run: () => focusCard(x.t.id) }));
      const cmds = paletteCommands().filter((c) => q && c.label.toLowerCase().includes(q)).slice(0, 4).map((c) => ({ ...c, q }));
      items = items.concat(cmds);
      if (!q) items = items.concat(paletteCommands().slice(0, EDIT ? 5 : 4).map((c) => ({ ...c, q: '' })));
    }
    palItems = items;
    palSel = Math.min(palSel, Math.max(0, items.length - 1));
    let lastGroup = '';
    palList.innerHTML = items.length ? items.map((it, i) => {
      const group = it.kind === 'task' ? (raw ? tr('Tasks') : tr('Open tasks')) : it.kind === 'tag' ? 'Tags' : tr('Commands');
      const head = group !== lastGroup ? '<li class="pal-group" role="presentation">' + esc(group) + '</li>' : '';
      lastGroup = group;
      let body;
      if (it.kind === 'task') {
        const t = it.t;
        body = '<span class="st" style="--c:' + statusVar(t.status) + '" title="' + esc(L(t.status)) + '"></span><span class="pal-id num">' + mark(t.id, it.q) + '</span><span class="pal-t">' + mark(t.title, it.q) + '</span><span class="pal-m">' + esc(L(t.status)) + '</span><span class="pal-p" style="color:' + prioVar(t.priority) + '">' + esc(t.priority) + '</span>';
      } else if (it.kind === 'tag') {
        body = '<span class="pal-ic">#</span><span class="pal-t">' + mark(it.label, it.q) + '</span><span class="pal-m">' + tr('{n} open', { n: it.count }) + '</span>';
      } else {
        body = '<span class="pal-ic">›</span><span class="pal-t">' + mark(it.label, it.q) + '</span>' + (it.hint ? '<kbd>' + esc(it.hint) + '</kbd>' : '');
      }
      return head + '<li role="option" id="pal-' + i + '" data-i="' + i + '" aria-selected="' + (i === palSel) + '">' + body + '</li>';
    }).join('') : '<li class="pal-empty">' + tr('No matches. Type &gt; to search commands, # for tags.') + '</li>';
    palIn.setAttribute('aria-activedescendant', items.length ? 'pal-' + palSel : '');
    $$('li[data-i]', palList).forEach((li) => {
      li.onmousemove = () => { if (palSel !== +li.dataset.i) { palSel = +li.dataset.i; updateSel(); } };
      li.onclick = () => runPal(+li.dataset.i);
    });
  }
  function updateSel() {
    $$('li[data-i]', palList).forEach((li) => li.setAttribute('aria-selected', String(+li.dataset.i === palSel)));
    const el = $('#pal-' + palSel);
    if (el) el.scrollIntoView({ block: 'nearest' });
    palIn.setAttribute('aria-activedescendant', 'pal-' + palSel);
  }
  function runPal(i) {
    const it = palItems[i];
    if (!it) return;
    closePalette();
    it.run();
  }
  function openPalette(prefix = '') {
    if (dlg.open) return;
    pal.hidden = false;
    palIn.value = prefix;
    palSel = 0;
    renderPalette();
    palIn.focus();
  }
  function closePalette() { pal.hidden = true; }
  palIn.oninput = () => { palSel = 0; renderPalette(); };
  palIn.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); updateSel(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); updateSel(); }
    else if (e.key === 'Enter') { e.preventDefault(); runPal(palSel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); }
  };
  pal.onclick = (e) => { if (e.target === pal) closePalette(); };

  // Rechte Shift-Taste allein gedrückt und losgelassen öffnet die Suche. Beim Tippen von Großbuchstaben
  // wird eine andere Taste dazwischen gedrückt, dann passiert nichts.
  let shiftAlone = false;
  document.addEventListener('keydown', (e) => {
    if (e.code === 'ShiftRight' && !e.repeat) shiftAlone = true;
    else shiftAlone = false;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (pal.hidden) openPalette(); else closePalette(); }
  }, true);
  document.addEventListener('keyup', (e) => {
    if (e.code !== 'ShiftRight' || !shiftAlone) return;
    shiftAlone = false;
    const a = document.activeElement;
    const typing = a && a !== palIn && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
    if (typing) return;
    if (pal.hidden) openPalette(); else closePalette();
  }, true);
  document.addEventListener('mousedown', () => { shiftAlone = false; }, true);

  // ---------- Start ----------

  function applyTheme() {
    const t = store.get('works-theme', 'auto');
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    const b = $('#btnTheme');
    const icons = {
      auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>',
      light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>',
      dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>',
    };
    b.innerHTML = icons[t] || icons.auto;
    b.title = tr('Color scheme: {scheme}. Click to change.', { scheme: t === 'auto' ? 'System' : t === 'dark' ? tr('Dark') : tr('Light') });
  }
  $('#btnTheme').onclick = () => {
    const order = ['auto', 'light', 'dark'];
    const cur = store.get('works-theme', 'auto');
    store.set('works-theme', order[(order.indexOf(cur) + 1) % 3]);
    applyTheme();
  };
  applyTheme();

  // Hub (W-0025): Laufen mehrere Boards, führt oben ein Link zur Übersicht. Startet ein weiteres Board, wechselt der Tab
  // zum Hub (W-0057): sofort über das Ereignis hub, das der neue Server schickt, sonst spätestens mit dieser Abfrage.
  // Sie vergleicht Kennungen statt der Anzahl. Was bei der ersten Abfrage schon läuft, ist der Ausgangsstand; so bleibt
  // ein Tab, der gerade für das neue Board geöffnet wurde (etwa aus dem Hub), auf seinem Board. Ein Board, das bei einer
  // Abfrage fehlte und binnen zwei Minuten wieder da ist, wurde neu gestartet (Neustart, neue Version) und zählt nicht.
  // Zwei Minuten, weil der Browser die Abfrage in Hintergrund-Tabs auf einmal pro Minute drosseln kann.
  if (LIVE && EDIT) {
    const hubLink = $('#hubLink');
    const RESTART_MS = 120000;
    let last = null;
    const missing = new Map();
    const pollBoards = async () => {
      if (orphan) return;
      let ids;
      try { const r = await fetch('/boards', { cache: 'no-store' }); if (!r.ok) return; ids = ((await r.json()).boards || []).map((b) => b.id); } catch (e) { return; }
      const now = Date.now();
      if (last) {
        for (const id of last) if (!ids.includes(id) && !missing.has(id)) missing.set(id, now);
        const added = ids.some((id) => !last.includes(id) && !(missing.has(id) && now - missing.get(id) < RESTART_MS));
        for (const id of ids) missing.delete(id);
        if (added && ids.length >= 2) goToHub();
      }
      last = ids;
      const n = ids.length;
      hubLink.hidden = n < 2;
      hubLink.textContent = tr('← Hub ({n} boards)', { n });
    };
    pollBoards();
    setInterval(pollBoards, 5000);
  }

  $('#q').oninput = (e) => { state.q = e.target.value.toLowerCase().trim(); renderAll(); };
  $('#typeFilter').onchange = (e) => { state.type = e.target.value; renderAll(); };
  $('#tagFilter').onchange = (e) => { state.tag = e.target.value; renderAll(); };
  $('#showClosed').onchange = (e) => { state.closed = e.target.checked; renderAll(); };
  $('#resetFilters').onclick = resetFilters;
  $('#msFilter').onchange = (e) => {
    if (e.target.value === '__new') { e.target.value = state.ms; editMilestone(null); return; }
    state.ms = e.target.value; renderAll();
  };
  $('#msEdit').onclick = () => { if (state.ms) editMilestone(state.ms); };

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if (e.key === 'Escape' && !pal.hidden) return;
    if (e.key === 'Escape' && !dlg.open) { if (!panel.hidden) closePanel(); else if (!sidePanel.hidden) closeSide(); return; }
    if (EDIT && !typing && !dlg.open && (e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); run(() => act('undo', {}), (x) => x.message); return; }
    if (typing || dlg.open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); if (state.view === 'queue') setView('board'); $('#q').focus(); }
    if (EDIT && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); newTask(); }
    if (/^[1-7]$/.test(e.key) && panel.hidden && pal.hidden) { e.preventDefault(); setView(VIEWS[+e.key - 1]); }
  });

  document.body.classList.toggle('ro', !EDIT);
  $$('[data-live]').forEach((el) => { if (!LIVE) el.hidden = true; });
  $$('[data-edit]').forEach((el) => { if (!EDIT) el.hidden = true; });
  if (!EDIT) {
    const ro = $('#readonly');
    ro.hidden = false;
    if (MODE === 'view') ro.innerHTML = '<strong>' + tr('View only.') + '</strong> ' + tr('You are watching the board of {project} live via a shared link. Changes appear automatically.', { project: esc(meta.project) });
    else if (MODE === 'snapshot') ro.innerHTML = '<strong>' + tr('Snapshot') + '</strong> ' + tr('of {date}. View only, click a task for details.', { date: esc(new Date(meta.snapshot || Date.now()).toLocaleString(I18N.lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })) });
  }
  $$('#views [data-view]').forEach((b) => b.onclick = () => setView(b.dataset.view));
  if (EDIT) {
    $('#btnNew').onclick = () => newTask(state.ms ? {} : {});
    $('#btnShare').onclick = () => openShare();
  }
  if (LIVE) {
    $('#btnIdeas').onclick = () => openSide('ideas');
    $('#btnTools').onclick = () => openSide('tools');
    $('#btnNext').onclick = () => openSide('next');
    $('#btnActivity').onclick = () => openSide('activity');
    setLive(true, 'Live');
    let first = true;
    // Sprache gewechselt (Board, works lang, anderer Tab): Seite neu laden, Texte stecken im Katalog der Seite.
    const langChanged = (m) => !!(BOOT.i18n && m && m.lang && m.lang !== I18N.lang);
    const es = new EventSource('events');
    liveSource = es;
    es.addEventListener('update', () => {
      // Das erste update nach dem Verbinden prüft nur die Version, die Daten sind schon in der Seite.
      if (first) { first = false; fetch('data.json', { cache: 'no-store' }).then((r) => r.json()).then((n) => { if (isForeign(n.meta)) becomeOrphan(n.meta); else if (outdated(n.meta)) reloadForUpdate(); else if (langChanged(n.meta)) location.reload(); }).catch(() => {}); return; }
      reload().then(() => { if (!orphan && langChanged(meta)) location.reload(); });
    });
    es.addEventListener('restart', () => { first = true; setLive(true, tr('New version starting')); });
    // Ein weiteres Board ist gestartet (W-0057) oder works board in einem anderen Projekt zeigt den Hub statt eines zweiten
    // Boards (W-0049): Dieser Tab wechselt zum Hub, auch wenn er aus dem Hub geöffnet wurde. Mit offener Eingabe erst
    // nach dem Speichern oder Verwerfen.
    es.addEventListener('hub', () => { if (EDIT) goToHub(); });
    es.onopen = () => { if ($('#live').classList.contains('off')) setLive(true, 'Live'); };
    es.onerror = () => setLive(false, tr('Disconnected, retrying'));
    ensureMeta().then(() => { if (detail) renderDetail(); }).catch(() => {});
    setInterval(() => {
      let d = false;
      for (const [id, c] of changes) if (Date.now() - c.at > HIGHLIGHT_MS) { changes.delete(id); d = true; }
      if (d) renderBoard();
      // Zeitangaben der Live-Ansicht und der Pille im Kopf weiterzählen.
      $$('#viewLive [data-since], #busy [data-since]').forEach((el) => { el.textContent = lvSinceText(el.dataset.since, el.dataset.fmt); });
      if (Date.now() >= liveDeadline) { liveDeadline = Infinity; reload(); }
      runWhenSaved();
    }, 1000);
  }
  // Ansicht nach einem Update-Neuladen wiederherstellen.
  let restored = null;
  try { restored = JSON.parse(sessionStorage.getItem(UI_KEY) || 'null'); sessionStorage.removeItem(UI_KEY); } catch (e) { restored = null; }
  state.view = store.get('works-view-' + meta.project, 'board');
  if (restored && restored.view) state.view = restored.view;
  if (!VIEWS.includes(state.view) || (state.view === 'live' && !LIVE)) state.view = 'board';
  // Gespeicherte Standardansicht dieses Browsers, wenn nicht gerade nach einem Update neu geladen wurde.
  const defView = !restored && store.get('works-default-view-' + meta.project, '');
  const defV = defView && (meta.views || []).find((v) => v.name === defView);
  if (restored) {
    Object.assign(state, { q: restored.q || '', type: restored.type || '', tag: restored.tag || '', ms: restored.ms || '', closed: !!restored.closed, signal: restored.signal || '' });
    if (Array.isArray(restored.prios) && restored.prios.length) state.prios = new Set(restored.prios);
    $('#q').value = state.q;
    $('#showClosed').checked = state.closed;
  }
  if (defV) applySavedView(defV); else renderAll();
  if (restored) {
    $('#board').scrollLeft = restored.scrollX || 0;
    window.scrollTo(0, restored.scrollY || 0);
    if (LIVE && restored.openId) openTask(restored.openId);
    else if (LIVE && restored.side) openSide(restored.side);
    if (LIVE) toast('<div class="what">' + tr('Board reloaded') + '</div><div class="why">' + tr('The board server was restarted or updated. View and filters have been kept.') + '</div>');
  }
})();
