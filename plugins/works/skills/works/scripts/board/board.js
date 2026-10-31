'use strict';
(() => {
  const BOOT = window.WORKS;
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

  const VIEWS = ['board', 'sprint', 'queue', 'timeline', 'graph', 'table'];
  const VIEW_LABEL = { board: 'Board', sprint: 'Sprint', queue: 'Warteschlange', timeline: 'Zeitleiste', graph: 'Abhängigkeiten', table: 'Tabelle' };
  const state = { q: '', prios: new Set(PRIOS), type: '', tag: '', ms: '', closed: false, signal: '', view: 'board' };
  const PAGE_VERSION = meta.version || '';
  const PAGE_SERVER = meta.server || '';
  const outdated = (m) => !!m && ((m.version && PAGE_VERSION && m.version !== PAGE_VERSION) || (m.server && PAGE_SERVER && m.server !== PAGE_SERVER));
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
  const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = String(d).split('-'); return dd + '.' + m + '.' + y; };
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
    if (!res.ok) throw new Error(out.error || 'Anfrage fehlgeschlagen (' + res.status + ').');
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
  const fail = (e) => toast('<div class="what">Nicht gespeichert</div><div class="why">' + esc(e.message || e) + '</div>', 'err');

  async function run(fn, success) {
    try {
      const r = await fn();
      if (success) {
        const msg = typeof success === 'function' ? success(r) : success;
        if (r && r.undo) undoToast(msg, r.undo); else ok(msg);
      }
      return r;
    } catch (e) { fail(e); return null; } finally {
      setTimeout(() => { if (updateWaiting && !dirty) { updateWaiting = false; reloadForUpdate(); } }, 600);
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
    return out.join('') || '<p class="empty-md">Noch leer.</p>';
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
    $('#project').innerHTML = esc(meta.project) + ' <span class="dim">Aufgaben</span>';
    const pill = $('#busy');
    const a = meta.activity;
    const fresh = a && a.busy && a.current && Date.now() - Date.parse(a.current.at) < 10 * 60000;
    pill.hidden = !fresh;
    if (fresh) { const mins = Math.max(1, Math.round((Date.now() - Date.parse(a.since || a.current.at)) / 60000)); pill.textContent = 'Claude arbeitet' + (a.current.task ? ' an ' + a.current.task : '') + ', seit ' + mins + ' min'; pill.onclick = () => { if (a.current.task) focusCard(a.current.task); }; }
    const tc = $('#toolsCount');
    const n = (meta.knowledgeProposals || 0);
    tc.hidden = !n; tc.textContent = n;
    document.title = 'Works ' + meta.project;
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
      ['p1', 'offen mit P1', open.filter((t) => t.priority === 'P1').length, true],
      ['blocked', 'blockiert', open.filter((t) => t.blocked).length, true],
      ['overdue', 'überfällig', open.filter((t) => t.overdue).length, true],
      ['questions', 'mit offenen Fragen', open.filter((t) => t.questions.length).length, false],
      ['incomplete', 'unvollständig erfasst', open.filter((t) => t.incomplete).length, false],
    ];
    $('#signals').innerHTML = sig.filter((s) => s[2] > 0).map((s) => '<button class="signal' + (s[3] ? ' hot' : '') + '" data-sig="' + s[0] + '" aria-pressed="' + (state.signal === s[0] || (s[0] === 'p1' && state.prios.size === 1 && state.prios.has('P1'))) + '"><b>' + s[2] + '</b> ' + esc(s[1]) + '</button>').join('')
      || '<span class="signal calm">Keine Blockaden, nichts überfällig</span>';
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
    $('#prioFilter').innerHTML = PRIOS.map((p) => '<button aria-pressed="' + state.prios.has(p) + '" data-p="' + p + '" title="' + esc(meta.prioLabel[p]) + ' ein- oder ausblenden"><span class="pdot" style="--pc:' + prioVar(p) + '"></span>' + p + '<span class="pl"> ' + esc(meta.prioLabel[p]) + '</span></button>').join('');
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
    tg.innerHTML = '<option value="">Alle Tags</option>' + tags.map((t) => '<option value="' + esc(t) + '">#' + esc(t) + '</option>').join('');
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
    const dots = points.map((p, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.done).toFixed(1) + '" r="2.5" class="c-dot"><title>' + esc(fmtDate(p.d)) + ': ' + p.done + ' von ' + p.total + ' erledigt</title></circle>').join('');
    const grid = [0.5, 1].map((f) => '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + y(max * f).toFixed(1) + '" y2="' + y(max * f).toFixed(1) + '" class="c-grid"/>').join('');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Verlauf der letzten 8 Wochen: ' + points[points.length - 1].done + ' von ' + points[points.length - 1].total + ' erledigt">' +
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
    const eta = !open ? 'Alles erledigt' : rate > 0 ? 'Bei diesem Tempo noch etwa ' + Math.max(1, Math.ceil(open / rate)) + (Math.ceil(open / rate) === 1 ? ' Woche' : ' Wochen') : 'Tempo noch nicht messbar';
    const ms = state.ms ? meta.milestones.find((m) => m.id === state.ms) : null;
    const scope = ms ? 'Meilenstein ' + ms.id + ' ' + ms.title : filtersActive() ? 'Gefilterte Aufgaben' : 'Gesamtes Projekt';
    const late = ms && ms.due && ms.due < today() && open > 0;
    const points = burnup(list);
    box.innerHTML =
      '<div class="pg-main">' +
        '<div class="pg-head"><span class="pg-pct num">' + pct + '<small>%</small></span><span class="pg-title"><strong>Fortschritt</strong><span>' + esc(scope) + (ms && ms.due ? ', Ziel ' + esc(fmtDate(ms.due)) : '') + '</span></span></div>' +
        '<div class="pg-bar" role="img" aria-label="' + done + ' von ' + total + ' Aufgaben erledigt, ' + working + ' in Arbeit oder Review">' +
          (done ? '<span class="pg-done" style="flex-grow:' + done + '" title="Erledigt: ' + done + '"></span>' : '') +
          (working ? '<span class="pg-work" style="flex-grow:' + working + '" title="In Arbeit oder Review: ' + working + '"></span>' : '') +
          (waiting ? '<span class="pg-wait" style="flex-grow:' + waiting + '" title="Noch offen: ' + waiting + '"></span>' : '') +
        '</div>' +
        '<div class="pg-legend"><span class="pg-k"><i class="pg-done"></i>Erledigt <b class="num">' + done + '</b></span><span class="pg-k"><i class="pg-work"></i>In Arbeit und Review <b class="num">' + working + '</b></span><span class="pg-k"><i class="pg-wait"></i>Noch offen <b class="num">' + waiting + '</b></span></div>' +
      '</div>' +
      '<dl class="pg-stats">' +
        '<div><dt>Erledigt</dt><dd class="num">' + done + ' von ' + total + '</dd></div>' +
        '<div><dt>Kriterien erfüllt</dt><dd class="num">' + (crit[1] ? crit[0] + ' von ' + crit[1] : 'keine') + '</dd></div>' +
        '<div><dt>Letzte 7 Tage</dt><dd class="num">' + doneWeek + ' erledigt, ' + newWeek + ' neu</dd></div>' +
        '<div><dt>Prognose</dt><dd class="' + (late ? 'late' : '') + '">' + esc(late ? 'Zieldatum überschritten, ' + eta : eta) + '</dd></div>' +
      '</dl>' +
      '<figure class="pg-chart"><figcaption><span>Letzte 8 Wochen</span><span class="lg"><i class="lg-done"></i>erledigt <i class="lg-total"></i>angelegt</span></figcaption>' + chartSvg(points) +
        '<div class="c-axis"><span>' + esc(fmtDate(points[0].d)) + '</span><span>heute</span></div></figure>';
  }

  function renderMsFilter() {
    const sel2 = $('#msFilter');
    const opts = '<option value="">Alle Meilensteine</option>' + meta.milestones.map((m) => '<option value="' + esc(m.id) + '">' + esc(m.id + ' ' + m.title) + ' (' + m.done + '/' + m.total + ')</option>').join('') + (EDIT ? '<option value="__new">Meilenstein anlegen …</option>' : '');
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
    if (c.kind === 'prio') return 'Priorität ' + c.from + ' → ' + c.to;
    if (c.kind === 'added') return 'Neu';
    if (c.kind === 'archived') return 'Archiviert';
    if (c.kind === 'removed') return 'Entfernt';
    return 'Aktualisiert';
  }
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
      meta2.push('<span class="prog" title="Akzeptanzkriterien"><span class="bar"><span style="width:' + pct + '%"></span></span>' + t.crit[0] + '/' + t.crit[1] + '</span>');
    }
    if (t.blocked) meta2.push('<span class="warn" title="Wartet auf ' + esc(t.blockers.join(', ')) + '">Blockiert durch ' + esc(t.blockers.join(', ')) + '</span>');
    if (t.due) {
      const d = daysUntil(t.due);
      const closed = !OPEN.includes(t.status);
      meta2.push('<span class="' + (t.overdue ? 'warn' : d <= 3 && !closed ? 'note' : '') + '">' + (t.overdue ? 'Überfällig seit ' : 'Fällig ') + fmtDate(t.due) + '</span>');
    }
    if (t.design && t.design.variants) meta2.push('<span class="' + (t.design.chosen ? '' : 'note') + '" title="Entwürfe aus UI UX Pro Max">' + (t.design.chosen ? 'Entwurf ' + esc(t.design.chosen) + ' gewählt' : t.design.variants + ' Entwürfe zur Wahl') + '</span>');
    if (t.questions.length) meta2.push('<span class="note">' + t.questions.length + (t.questions.length === 1 ? ' offene Frage' : ' offene Fragen') + '</span>');
    if (t.incomplete && OPEN.includes(t.status)) meta2.push('<span>Unvollständig</span>');
    const tags = [];
    if (t.milestone) tags.push('<span class="tag ms-tag">' + esc(t.milestone) + '</span>');
    t.tags.slice(0, 3).forEach((x) => tags.push('<span class="tag">#' + esc(x) + '</span>'));
    if (t.tags.length > 3) tags.push('<span class="tag">+' + (t.tags.length - 3) + '</span>');
    return '<article class="card' + (ch ? ' changed' + (ch.fresh ? ' pulse' : '') : '') + (OPEN.includes(t.status) ? '' : ' closed') + '" data-id="' + esc(t.id) + '" data-prio="' + esc(t.priority) + '" tabindex="0" role="button" aria-label="' + esc(t.id + ' ' + t.title) + '"' + (EDIT ? ' draggable="true"' : '') + (ch ? ' style="--cc:' + changeColor(ch) + '"' : '') + '>' +
      (ch && ch.kind !== 'updated' ? '<span class="change">' + esc(changeLabel(ch)) + '</span>' : '') +
      '<div class="card-top"><span class="id">' + esc(t.id) + '</span><span>' + esc(meta.typeLabel[t.type] || t.type) + '</span>' + (t.effort ? '<span class="effort" title="Aufwand">' + esc(t.effort) + '</span>' : '') + '<span class="prio">' + esc(t.priority) + '</span></div>' +
      '<div class="title">' + esc(t.title) + '</div>' +
      (t.thumb ? '<img loading="lazy" src="' + esc(t.thumb) + '" alt="' + esc(t.thumbAlt) + '">' : '') +
      liveBlock(t) +
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
      if (c === 'in-arbeit' && list.length > 1) note = '<div class="col-note">Mehr als eine Aufgabe in Arbeit. Übergaben aktuell halten.</div>';
      const empty = filtersActive() && !anyMatch ? 'Keine Treffer für die Filter' : c === 'backlog' && EDIT ? 'Leer. Mit + eine Aufgabe anlegen.' : 'Leer';
      return '<section class="col' + (arrived && arrived.has(c) ? ' arrive' : '') + '" data-col="' + c + '" style="--c:' + statusVar(c) + '" aria-label="' + esc(L(c)) + '">' +
        '<div class="col-head"><span class="dot"></span><h2>' + esc(L(c)) + '</h2><span class="n">' + list.length + '</span>' +
        (canAdd ? '<button class="add" data-quick="' + c + '" title="Aufgabe in ' + esc(L(c)) + ' anlegen" aria-label="Aufgabe in ' + esc(L(c)) + ' anlegen">+</button>' : '') + '</div>' + note +
        (quickCol === c ? '<div class="quick"><input class="quick-in" placeholder="Titel eingeben, Enter speichert" maxlength="160" aria-label="Titel der neuen Aufgabe"><small>Wird als Feature mit P3 angelegt. Details danach im Panel ergänzen.</small></div>' : '') +
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
      if (!OPEN.includes(to)) { toast('<div class="what">Erst wiedereröffnen</div><div class="why">Erledigte und verworfene Aufgaben können nur in eine offene Spalte zurück.</div>', 'err'); return; }
      const reason = await askText({ title: id + ' wiedereröffnen', lead: 'Die Aufgabe geht zurück nach ' + L(to) + '. Der Grund landet im Verlauf.', label: 'Grund', confirm: 'Wiedereröffnen', required: true });
      if (reason === null) return;
      return run(() => act('move', { id, to, reason }), id + ' wiedereröffnet');
    }
    if (to === 'erledigt') return openDod(id);
    if (to === 'verworfen') {
      const reason = await askText({ title: id + ' verwerfen', lead: 'Die Aufgabe wird nicht umgesetzt. Sie lässt sich später wiedereröffnen.', label: 'Grund', confirm: 'Verwerfen', required: true, danger: true });
      if (reason === null) return;
      return run(() => act('move', { id, to, reason }), id + ' verworfen');
    }
    try {
      await act('move', { id, to });
      ok(to === 'in-arbeit' ? id + ' gestartet' : id + ' nach ' + L(to) + ' verschoben');
    } catch (e) {
      if (to === 'in-arbeit' && /blockiert/i.test(e.message)) {
        const yes = await confirmBox({ title: id + ' ist blockiert', lead: e.message, confirm: 'Trotzdem starten' });
        if (yes) await run(() => act('move', { id, to, force: true }), id + ' gestartet');
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
  const foot = (confirm, opts = {}) => '<p class="err" role="alert"></p><div class="foot">' + (opts.extra || '') + '<button class="btn" value="cancel" formnovalidate>Abbrechen</button><button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" value="ok">' + esc(confirm) + '</button></div>';

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
    const html = '<h2>Neue Aufgabe</h2>' +
      '<div class="field span4"><span>Typ</span>' + segCtl('type', m.types.map((x) => ({ id: x.id, label: x.label })), type) + '</div>' +
      '<label class="field span4"><span>Titel</span><input class="input" name="title" required maxlength="160" placeholder="Was soll am Ende anders sein?" value="' + esc(prefill.title || '') + '" autofocus></label>' +
      '<div class="grid">' +
      '<div class="field span4"><span>Priorität</span>' + segCtl('priority', m.priorities.map((p) => ({ id: p.id, label: p.id + ' ' + p.label, dot: prioVar(p.id) })), prefill.priority || 'P3') + '</div>' +
      '<div class="field span2"><span>Spalte</span>' + segCtl('status', [{ id: 'backlog', label: 'Backlog' }, { id: 'geplant', label: 'Geplant' }], prefill.status || 'backlog') + '</div>' +
      '<div class="field span2"><span>Aufwand</span>' + segCtl('effort', [{ id: '', label: 'Offen' }].concat(m.efforts.map((e) => ({ id: e, label: e }))), '') + '</div>' +
      '<label class="field"><span>Risiko</span><select name="risk"><option value="">Offen</option>' + m.risks.map((r) => '<option>' + esc(r) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Fällig</span><input type="date" name="due"></label>' +
      '<label class="field span2"><span>Meilenstein</span><select name="milestone"><option value="">Keiner</option>' + m.milestones.map((x) => '<option value="' + esc(x.id) + '"' + (state.ms === x.id ? ' selected' : '') + '>' + esc(x.id + ' ' + x.title) + '</option>').join('') + '</select></label>' +
      '<label class="field span2"><span>Tags, mit Komma getrennt</span><input class="input" name="tags" list="tagList" placeholder="bot, dashboard"><datalist id="tagList">' + m.tags.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist></label>' +
      '<label class="field span2"><span>Wartet auf</span><select name="blocked_by"><option value="">Nichts</option>' + m.tasks.filter((x) => !['erledigt', 'verworfen'].includes(x.status)).map((x) => '<option value="' + esc(x.id) + '">' + esc(x.id + ' ' + x.title) + '</option>').join('') + '</select></label>' +
      '</div>' +
      '<label class="field"><span>Beschreibung</span><textarea class="input" name="description" rows="7" placeholder="Was soll passieren und warum? Hintergrund, Details, Links und Hinweise für Claude. Markdown möglich, Listen mit - beginnen."></textarea><span class="sublabel">Hier gehört alles Relevante zur Aufgabe hinein. Claude liest die Beschreibung beim Start als Vorgabe von dir.</span></label>' +
      '<label class="field"><span>Akzeptanzkriterien, eins pro Zeile</span><textarea class="input" name="criteria" rows="3" placeholder="Prüfbar mit ja oder nein"></textarea></label>' +
      '<p class="sublabel">Ohne Beschreibung oder Kriterien wird die Aufgabe als unvollständig markiert. Claude fragt dann nach.</p>' +
      foot('Aufgabe anlegen');
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
    const html = '<h2>' + (m ? 'Meilenstein ' + esc(m.id) + ' bearbeiten' : 'Meilenstein anlegen') + '</h2>' +
      '<p class="lead">Ein Meilenstein bündelt Aufgaben zu einem Ziel, zum Beispiel einem Release. Aufgaben ordnest du im Detailpanel zu.</p>' +
      '<label class="field"><span>Titel</span><input class="input" name="title" required maxlength="120" value="' + esc(m ? m.title : '') + '" autofocus></label>' +
      '<div class="grid"><label class="field span2"><span>Zieldatum</span><input type="date" name="due" value="' + esc(m ? m.due || '' : '') + '"></label>' +
      (m ? '<label class="field span2"><span>Status</span><select name="status"><option value="offen"' + (m.status !== 'erledigt' ? ' selected' : '') + '>Offen</option><option value="erledigt"' + (m.status === 'erledigt' ? ' selected' : '') + '>Erreicht</option></select></label>' : '') + '</div>' +
      '<label class="field"><span>Beschreibung</span><input class="input" name="description" maxlength="500" value="' + esc(m ? m.description || '' : '') + '"></label>' +
      foot(m ? 'Speichern' : 'Meilenstein anlegen');
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
    const isCheck = (a) => /^(Prüfung |Automatische Prüfungen)/.test(a.text);
    const dodItems = res.checks ? res.auto.filter((a) => !isCheck(a)) : res.auto;
    const html = '<h2>' + esc(id) + ' abschließen</h2><p class="lead">' + esc(t.title) + '</p>' +
      (res.checks ? checksBlock(res.checks) : '') +
      '<div class="block"><div class="block-head"><h3>' + (res.checks ? 'Aus der Definition of Done' : 'Automatisch geprüft') + '</h3><span class="meta">' + dodItems.filter((a) => a.ok).length + ' von ' + dodItems.length + ' erfüllt</span></div>' +
      '<ul class="dod">' + dodItems.map((a) => '<li class="' + (a.ok ? 'ok' : 'no') + '"><span class="mark" aria-hidden="true">' + (a.ok ? '✓' : '!') + '</span><span>' + esc(a.text) + (a.detail ? ' <span class="detail">' + esc(a.detail) + '</span>' : '') + '<span class="sr">' + (a.ok ? ' erfüllt' : ' fehlt') + '</span></span></li>').join('') + '</ul></div>' +
      (res.manual.length ? '<div class="block"><div class="block-head"><h3>Selbst bestätigen</h3><span class="meta">Abhaken, was erledigt ist</span></div><ul class="dod">' + res.manual.map((m, i) => '<li><label><input type="checkbox" name="m' + i + '" class="man"><span>' + esc(m) + '</span></label></li>').join('') + '</ul></div>' : '') +
      (missing.length ? '<div class="alert bad">' + (missing.length === 1 ? 'Es fehlt noch 1 Punkt' : 'Es fehlen noch ' + missing.length + ' Punkte') + '. Abschließen ist nur mit Begründung möglich, die im Verlauf landet.</div><label class="field"><span>Begründung für das Abschließen trotz offener Punkte</span><input class="input" name="reason" maxlength="300"></label>' : '') +
      '<p class="err" role="alert"></p><div class="foot"><button class="btn" value="cancel" formnovalidate>Abbrechen</button><button class="btn ' + (missing.length ? 'danger' : 'primary') + '" value="ok" id="dodGo" disabled>' + (missing.length ? 'Trotzdem abschließen' : 'Abschließen') + '</button></div>';
    const r = await showDialog(html, (fd) => {
      const reason = String(fd.get('reason') || '').trim();
      if (missing.length && !reason) throw new Error('Bitte eine Begründung angeben.');
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
    if (r) ok(id + ' erledigt');
  }

  // ---------- Detailpanel ----------

  const panel = $('#panel');
  const scrim = $('#scrim');
  let dirty = false;
  let staleDetail = false;
  let detailTab = 'overview';

  async function openTask(id) {
    if (!LIVE && !DETAILS) return openStatic(id);
    if (openId !== id) detailTab = 'overview';
    openId = id; dirty = false; staleDetail = false;
    closeSide();
    panel.hidden = false; scrim.hidden = false;
    if (!detail || detail.task.id !== id) $('#panelBody').innerHTML = '<p class="md">Lädt …</p>';
    await loadDetail();
    panel.tabIndex = -1;
    panel.focus({ preventScroll: true });
  }

  function openStatic(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    openId = id;
    panel.hidden = false; scrim.hidden = false;
    $('#panelBody').innerHTML = '<div class="p-head"><div class="p-bar"><span class="id">' + esc(t.id) + '</span><span>' + esc(meta.typeLabel[t.type]) + '</span><span class="st" style="--c:' + statusVar(t.status) + '">' + esc(L(t.status)) + '</span><span class="spacer"></span><button class="btn small" data-close>Schließen</button></div><h2 class="p-title" style="border:0">' + esc(t.title) + '</h2></div>' +
      (t.excerpt ? '<div class="md">' + md(t.excerpt) + '</div>' : '') +
      (t.thumb ? '<img src="' + esc(t.thumb) + '" alt="' + esc(t.thumbAlt) + '" style="max-width:100%;border-radius:8px">' : '') +
      '<div class="alert info">Details und Bearbeiten gibt es in der Live-Ansicht.</div>' +
      '<div class="p-foot"><span class="path">' + esc(t.file) + '</span></div>';
    $('[data-close]', panel).onclick = closePanel;
  }

  async function loadDetail() {
    if (!openId) return;
    try {
      if (DETAILS) {
        detail = DETAILS[openId];
        if (!detail) throw new Error('Für diese Aufgabe sind im Schnappschuss keine Details enthalten.');
      } else detail = await api('GET', 'api/task?id=' + encodeURIComponent(openId));
      renderDetail();
    } catch (e) {
      $('#panelBody').innerHTML = '<div class="alert bad">' + esc(e.message) + '</div><button class="btn" data-close>Schließen</button>';
      $('[data-close]', panel).onclick = closePanel;
    }
  }

  function closePanel() {
    if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
    panel.hidden = true; scrim.hidden = true; openId = null; detail = null; dirty = false;
  }
  scrim.onclick = () => { closePanel(); closeSide(); };

  function sel(name, options, value, labelFn) {
    return '<select data-field="' + name + '">' + options.map((o) => {
      const v = typeof o === 'string' ? o : o.id;
      const lab = labelFn ? labelFn(o) : typeof o === 'string' ? (o || 'Offen') : o.label;
      return '<option value="' + esc(v) + '"' + (String(value || '') === v ? ' selected' : '') + '>' + esc(lab) + '</option>';
    }).join('') + '</select>';
  }

  function renderDetail() {
    const d = detail;
    const t = d.task;
    const mi = metaInfo || { types: Object.entries(meta.typeLabel).map(([id, label]) => ({ id, label })), efforts: ['S', 'M', 'L', 'XL'], risks: ['niedrig', 'mittel', 'hoch'], milestones: meta.milestones };
    const closed = !OPEN.includes(t.status);
    // Die Beschreibung ist der zentrale Abschnitt. Ein Ziel älterer Aufgaben erscheint nur, wenn es gefüllt ist.
    const desc = d.sections.find((s) => s.name === 'Beschreibung');
    const legacy = d.goalSection !== 'Beschreibung' ? d.sections.find((s) => s.name === d.goalSection && s.content) : null;
    const others = d.sections.filter((s) => s.name !== 'Beschreibung' && s.name !== 'Übergabe' && !(legacy && s.name === legacy.name) && !(!s.content && s.name === d.goalSection));
    const handoff = d.sections.find((s) => s.name === 'Übergabe');
    const h = [];

    const queued = (meta.queue || []).indexOf(t.id);
    h.push('<div class="p-head"><div class="p-bar"><span class="id">' + esc(t.id) + '</span><span class="st" style="--c:' + statusVar(t.status) + '">' + esc(L(t.status)) + '</span>' +
      (d.archived ? '<span class="tag">Archiviert</span>' : '') + (queued >= 0 ? '<span class="tag q-tag">Warteschlange Platz ' + (queued + 1) + '</span>' : '') + '<span class="spacer"></span>' +
      (OPEN.includes(t.status) && !['in-arbeit', 'review'].includes(t.status) ? '<button class="btn small ghost" data-act="queue">' + (queued >= 0 ? 'Aus Warteschlange' : 'Einreihen') + '</button>' : '') +
      (t.status === 'review' ? '<button class="btn small primary" data-act="review">Abnehmen</button>' : OPEN.includes(t.status) ? '<button class="btn small" data-act="dod">Abschließen</button>' : '') +
      '<button class="btn small ghost" data-close aria-label="Panel schließen">Schließen</button></div>' +
      '<textarea class="p-title" rows="1" maxlength="160" aria-label="Titel" data-title' + (EDIT ? '' : ' readonly') + '>' + esc(t.title) + '</textarea>' +
      '<div class="p-tabs" role="tablist">' + [['overview', 'Übersicht']].concat(d.design || /^(design)$/.test(t.type) || (t.tags || []).includes('ui') ? [['design', 'Entwürfe' + (d.design && d.design.variants.length ? ' <span class="count">' + d.design.variants.length + '</span>' : '')]] : []).concat([['comments', 'Kommentare' + ((d.comments || []).length ? ' <span class="count">' + d.comments.length + '</span>' : '')], ['time', 'Zeit']]).concat(LIVE ? [['code', 'Code und Commits']] : []).map((x) => '<button role="tab" data-tab="' + x[0] + '" aria-selected="' + (detailTab === x[0]) + '">' + x[1] + '</button>').join('') + '</div>' +
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
      h.push('<div id="codeBox" class="code-box"><p class="md">Lädt Git-Daten …</p></div>');
      $('#panelBody').innerHTML = h.join('');
      bindHead();
      loadCode(t.id);
      return;
    }

    h.push('<div class="fields">' +
      '<label class="field"><span>Status</span>' + sel('status', COLS.map((c) => ({ id: c, label: L(c) })), t.status) + '</label>' +
      '<label class="field"><span>Priorität</span>' + sel('priority', PRIOS.map((p) => ({ id: p, label: p + ' ' + meta.prioLabel[p] })), t.priority) + '</label>' +
      '<label class="field"><span>Typ</span>' + sel('type', mi.types, t.type) + '</label>' +
      '<label class="field"><span>Aufwand</span>' + sel('effort', [''].concat(mi.efforts), t.effort) + '</label>' +
      '<label class="field"><span>Risiko</span>' + sel('risk', [''].concat(mi.risks), t.risk) + '</label>' +
      '<label class="field"><span>Fällig</span><input type="date" data-field="due" value="' + esc(t.due || '') + '"></label>' +
      '<label class="field wide"><span>Meilenstein</span>' + sel('milestone', [{ id: '', label: 'Keiner' }].concat(meta.milestones.map((m) => ({ id: m.id, label: m.id + ' ' + m.title }))), t.milestone) + '</label>' +
      '<label class="field wide" style="grid-column:1/-1"><span>Tags, mit Komma getrennt</span><input class="input" data-field="tags" value="' + esc((t.tags || []).join(', ')) + '"></label>' +
      '</div>');

    const alerts = [];
    if (d.blocked) alerts.push('<div class="alert bad">Wartet auf ' + d.openBlockers.map((x) => '<a href="#" data-goto="' + esc(x) + '">' + esc(x) + '</a>').join(', ') + '. Starten geht erst, wenn diese erledigt sind.</div>');
    if (t.incomplete && !closed) alerts.push('<div class="alert info"><span>Schnell erfasst, Details fehlen noch. Ergänze Beschreibung und Akzeptanzkriterien, dann <button class="btn link" data-act="complete">als vollständig markieren</button>.</span></div>');
    if (staleDetail) alerts.push('<div class="alert info">Die Aufgabe wurde inzwischen geändert. <button class="btn link" data-act="reload">Neu laden</button></div>');
    h.push(alerts.join(''));
    if (t.status === 'in-arbeit' && EDIT) h.push(instructBox(t.id));

    const descBlock = sectionBlock('Beschreibung', desc ? desc.content : '', true, 'Alles Relevante zur Aufgabe, Claude liest das als Vorgabe');
    // Ältere Aufgaben ohne Beschreibung: das gefüllte Ziel zuerst, darunter die leere Beschreibung zum Ergänzen.
    if (legacy && !(desc && desc.content)) h.push(sectionBlock(legacy.name, legacy.content, true), descBlock);
    else { h.push(descBlock); if (legacy) h.push(sectionBlock(legacy.name, legacy.content, true)); }

    for (const c of d.checklists) {
      if (!EDIT && !c.items.length) continue;
      const done = c.items.filter((i) => i.done).length;
      h.push('<div class="block" data-list="' + esc(c.name) + '"><div class="block-head"><h3>' + esc(c.name) + '</h3><span class="meta">' + done + ' von ' + c.items.length + '</span></div>' +
        (c.items.length ? '<ul class="checklist">' + c.items.map((i) => '<li class="' + (i.done ? 'done' : '') + '"><input type="checkbox" data-check="' + i.n + '"' + (i.done ? ' checked' : '') + ' aria-label="' + esc(i.text) + '"><span class="txt">' + inline(i.text) + '</span><button class="rm" data-rm="' + i.n + '" title="Punkt entfernen" aria-label="Punkt entfernen">×</button></li>').join('') + '</ul>' : '') +
        '<div class="add-row"><input class="input" data-additem placeholder="' + (c.name === 'Akzeptanzkriterien' ? 'Kriterium ergänzen' : 'Schritt ergänzen') + '" maxlength="500"><button class="btn small" data-additem-btn>Hinzufügen</button></div></div>');
    }

    const openQ = d.questions.filter((q) => !q.done);
    h.push('<div class="block"><div class="block-head"><h3>Offene Fragen</h3><span class="meta">' + (openQ.length ? openQ.length + ' offen' : 'keine offen') + '</span></div>' +
      d.questions.map((q) => '<div class="qa' + (q.done ? ' done' : '') + '"><div class="q">' + inline(q.text) + '</div>' +
        (q.done ? '' : '<div class="add-row"><input class="input" data-answer="' + q.n + '" placeholder="Antwort, optional" maxlength="1000"><button class="btn small" data-resolve="' + q.n + '">Geklärt</button></div>') + '</div>').join('') +
      '<div class="add-row"><input class="input" data-question placeholder="Frage an Claude oder an dich selbst notieren" maxlength="500"><button class="btn small" data-question-btn>Notieren</button></div></div>');

    h.push(sectionBlock('Übergabe', handoff ? handoff.content : '', d.editable.includes('Übergabe'), 'Wo es weitergeht. Claude schreibt sie am Ende jeder Arbeitsphase.'));

    h.push('<div class="block"><div class="block-head"><h3>Bilder und Dateien</h3><span class="meta">' + d.assets.length + '</span></div>' +
      (d.assets.length ? '<div class="gallery">' + d.assets.map((a) => '<figure class="shot" style="margin:0">' + (a.image ? '<a href="' + esc(a.src) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(a.src) + '" alt="' + esc(a.alt) + '"></a>' : '<a href="' + esc(a.src) + '" target="_blank" rel="noopener">' + esc(a.alt || a.src) + '</a>') +
        '<figcaption>' + (a.kind ? '<span class="kind">' + esc(a.kind) + '</span>' : '') + esc(a.desc || a.alt) + '</figcaption></figure>').join('') + '</div>' : '') +
      '<div class="drop" id="dropzone"><span><strong>Bild einfügen</strong> mit Strg+V, hierher ziehen oder <button class="btn link" id="pickFile">Datei wählen</button>. Erlaubt sind PNG, JPEG, GIF, WebP und AVIF.</span><input type="file" id="fileIn" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" hidden>' +
      '<div id="upForm" hidden><img class="preview" id="upPrev" alt="Vorschau"><div class="row" style="margin-top:8px"><select id="upKind" class="input"><option value="">Art wählen</option>' + ['ist', 'vorher', 'nachher', 'referenz', 'mockup', 'skizze', 'fehler', 'diagramm'].map((k) => '<option>' + k + '</option>').join('') + '</select><input class="input" id="upName" placeholder="Kurzer Name, optional" maxlength="60"></div>' +
      '<textarea class="input" id="upDesc" rows="2" style="margin-top:8px" placeholder="Was ist zu sehen? Diese Beschreibung liest Claude statt des Bildes." maxlength="1000"></textarea><div class="row" style="margin-top:8px;justify-content:flex-end;display:flex;gap:8px"><button class="btn small" id="upCancel">Verwerfen</button><button class="btn small primary" id="upSave">Bild speichern</button></div></div></div></div>');

    const relRow = (k, list, rel) => list.map((r) => '<div class="rel-item"><span class="k">' + k + '</span><button class="go" data-goto="' + esc(r.id) + '">' + esc(r.id + ' ' + r.title) + '</button><span class="st" style="--c:' + statusVar(r.status) + '">' + esc(L(r.status)) + '</span><button class="btn small ghost" data-unlink="' + esc(rel) + '" data-target="' + esc(r.id) + '" aria-label="Verknüpfung entfernen">×</button></div>').join('');
    const others2 = tasks.filter((x) => x.id !== t.id && !x.archived);
    h.push('<div class="block"><div class="block-head"><h3>Abhängigkeiten</h3></div><div class="rel">' +
      relRow('Wartet auf', d.blockedBy, 'blocked-by') + relRow('Blockiert', d.blocks, 'blocks') + relRow('Verwandt', d.related, 'related') +
      '<div class="add-row"><select class="input" id="relKind" style="flex:0 0 140px"><option value="blocked-by">Wartet auf</option><option value="blocks">Blockiert</option><option value="related">Verwandt mit</option></select><select class="input" id="relTarget"><option value="">Aufgabe wählen</option>' + others2.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.id + ' ' + x.title) + '</option>').join('') + '</select><button class="btn small" id="relAdd">Verknüpfen</button></div></div></div>');

    for (const s of others) {
      if (!s.content && !d.editable.includes(s.name)) continue;
      h.push('<details class="sec"' + (s.content ? ' open' : '') + '><summary>' + esc(s.name) + (s.content ? '' : ' <span class="meta">leer</span>') + '</summary><div class="body">' + sectionInner(s.name, s.content, d.editable.includes(s.name)) + '</div></details>');
    }
    if (d.decisions) h.push('<details class="sec"><summary>Designentscheidungen <span class="meta">decisions.md</span></summary><div class="body"><div class="md">' + md(d.decisions.replace(/^# .*\n?/, '')) + '</div></div></details>');

    h.push('<details class="sec" open><summary>Verlauf <span class="meta">' + d.history.length + ' Einträge</span></summary><div class="body">' +
      '<div class="add-row"><input class="input" data-note placeholder="Notiz in den Verlauf schreiben" maxlength="2000"><button class="btn small" data-note-btn>Speichern</button></div>' +
      '<ol class="timeline">' + d.history.slice(0, 60).map((e) => '<li><time datetime="' + esc(e.date) + '">' + esc(fmtDate(e.date)) + '</time><span>' + inline(e.text) + (e.actor ? '<span class="by">' + esc(e.actor) + '</span>' : '') + '</span></li>').join('') + '</ol></div></details>');

    h.push('<div class="p-foot"><span class="path" title="Datei">.works/' + esc(d.file) + '</span>' +
      (EDIT ? '<button class="btn small ghost" data-act="template">Als Vorlage speichern</button>' : '') +
      (closed && !d.archived ? '<button class="btn small" data-act="archive">Archivieren</button>' : '') +
      (!closed ? '<button class="btn small danger" data-act="drop">Verwerfen</button>' : '<button class="btn small" data-act="reopen">Wiedereröffnen</button>') + '</div>');

    $('#panelBody').innerHTML = h.join('');
    bindDetail();
    if (!EDIT) {
      // Felder im Nur-Lesen-Modus als Text zeigen statt als gesperrte Eingaben.
      $$('#panelBody .fields select, #panelBody .fields input').forEach((el) => {
        const v = el.tagName === 'SELECT' ? (el.options[el.selectedIndex] || {}).text : el.type === 'date' ? fmtDate(el.value) : el.value;
        const span = document.createElement('span');
        span.className = 'ro-val';
        span.textContent = v && v !== 'Offen' && v !== 'Keiner' ? v : '–';
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
    return '<div class="block"><div class="block-head"><h3>' + esc(name) + '</h3>' + (hint ? '<span class="meta">' + esc(hint) + '</span>' : '') + '</div>' + sectionInner(name, content, editable) + '</div>';
  }
  function sectionInner(name, content, editable) {
    return '<div class="sec-view" data-sec="' + esc(name) + '"><div class="md">' + md(content) + '</div>' +
      (editable ? '<div><button class="btn small" data-edit="' + esc(name) + '">Bearbeiten</button></div>' : '') + '</div>';
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
      await run(() => act('set', { id, fields: { title: v } }), 'Titel gespeichert');
    };

    $$('[data-field]', root).forEach((el) => {
      el.onchange = async () => {
        const f = el.dataset.field;
        if (f === 'status') { const to = el.value; el.value = t.status; return requestMove(id, to); }
        let v = el.value;
        if (f === 'tags') v = v.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean);
        await run(() => act('set', { id, fields: { [f]: v } }), 'Gespeichert');
      };
    });

    $$('[data-act]', root).forEach((b) => { if (['queue', 'dod', 'review'].includes(b.dataset.act)) return; b.onclick = async () => {
      const a = b.dataset.act;
      if (a === 'drop') return requestMove(id, 'verworfen');
      if (a === 'reopen') return requestMove(id, 'backlog');
      if (a === 'reload') { staleDetail = false; return loadDetail(); }
      if (a === 'archive') return run(() => act('archive', { id }), id + ' archiviert');
      if (a === 'template') return editTemplate(null, id);
      if (a === 'complete') return run(() => act('set', { id, fields: { incomplete: false } }), 'Als vollständig markiert');
    }; });

    $$('[data-edit]', root).forEach((b) => b.onclick = () => {
      const name = b.dataset.edit;
      const box = b.closest('.sec-view');
      const cur = (detail.sections.find((s) => s.name === name) || {}).content || '';
      box.innerHTML = '<textarea class="input" rows="' + Math.min(18, Math.max(4, cur.split('\n').length + 1)) + '" data-secedit>' + esc(cur) + '</textarea><div class="add-row" style="justify-content:flex-end"><span class="sublabel" style="margin-right:auto">Markdown, Listen mit - beginnen</span><button class="btn small" data-seccancel>Abbrechen</button><button class="btn small primary" data-secsave>Speichern</button></div>';
      const ta = $('[data-secedit]', box);
      ta.focus(); dirty = true;
      ta.onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') $('[data-secsave]', box).click(); };
      $('[data-seccancel]', box).onclick = () => { dirty = false; renderDetail(); };
      $('[data-secsave]', box).onclick = async () => {
        const r = await run(() => act('section', { id, name, text: ta.value, after: name === 'Beschreibung' ? detail.typeGoal : undefined }), name + ' gespeichert');
        if (r) dirty = false;
      };
    });

    $$('[data-list]', root).forEach((blk) => {
      const section = blk.dataset.list;
      $$('[data-check]', blk).forEach((c) => c.onchange = () => run(() => act('check', { id, section, n: +c.dataset.check, done: c.checked })));
      $$('[data-rm]', blk).forEach((b) => b.onclick = () => run(() => act('itemRemove', { id, section, n: +b.dataset.rm }), 'Punkt entfernt'));
      const inp = $('[data-additem]', blk);
      const add = () => { const v = inp.value.trim(); if (!v) return; inp.disabled = true; run(() => act('item', { id, section, text: v }), 'Punkt ergänzt').finally(() => { inp.disabled = false; }); };
      inp.onkeydown = (e) => { if (e.key === 'Enter') add(); };
      $('[data-additem-btn]', blk).onclick = add;
    });

    $$('[data-resolve]', root).forEach((b) => b.onclick = () => {
      const n = +b.dataset.resolve;
      const answer = ($('[data-answer="' + n + '"]', root) || {}).value || '';
      run(() => act('resolve', { id, n, answer: answer.trim() }), 'Frage geklärt');
    });
    const q = $('[data-question]', root);
    const addQ = () => { const v = q.value.trim(); if (v) run(() => act('question', { id, text: v }), 'Frage notiert'); };
    q.onkeydown = (e) => { if (e.key === 'Enter') addQ(); };
    $('[data-question-btn]', root).onclick = addQ;

    const note = $('[data-note]', root);
    const addN = () => { const v = note.value.trim(); if (v) run(() => act('log', { id, text: v }), 'Notiz gespeichert'); };
    note.onkeydown = (e) => { if (e.key === 'Enter') addN(); };
    $('[data-note-btn]', root).onclick = addN;

    $('#relAdd', root).onclick = () => {
      const target = $('#relTarget', root).value;
      if (!target) return;
      run(() => act('link', { id, rel: $('#relKind', root).value, target }), 'Verknüpft');
    };
    $$('[data-unlink]', root).forEach((b) => b.onclick = () => run(() => act('link', { id, rel: b.dataset.unlink, target: b.dataset.target, remove: true }), 'Verknüpfung entfernt'));

    bindUpload(root, id);
  }

  // ---------- Bilder hochladen ----------

  let pendingFile = null;
  function bindUpload(root, id) {
    const zone = $('#dropzone', root);
    const fileIn = $('#fileIn', root);
    const formEl = $('#upForm', root);
    const show = (file) => {
      if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(file.type)) { fail(new Error('Nur PNG, JPEG, GIF, WebP oder AVIF.')); return; }
      if (file.size > 20 * 1024 * 1024) { fail(new Error('Das Bild ist größer als 20 MB.')); return; }
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
      const r = await run(() => api('POST', 'api/asset?' + qs.toString(), undefined, { body: pendingFile, type: pendingFile.type }), 'Bild gespeichert');
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
    const head = (title) => '<div class="side-head"><h2>' + esc(title) + '</h2><span class="spacer"></span><button class="btn small ghost" data-sclose>Schließen</button></div>';
    if (side === 'ideas') {
      let ideas = [];
      try { ideas = ideasCache = await api('GET', 'api/ideas'); } catch (e) { return fail(e); }
      const open = ideas.filter((i) => !i.closed);
      const closed = ideas.filter((i) => i.closed);
      body.innerHTML = head('Ideen') +
        '<p class="md">Lose Gedanken, die noch keine Aufgabe sind. Übernommene Ideen werden zur Aufgabe im Backlog.</p>' +
        '<div class="add-row"><input class="input" id="ideaIn" placeholder="Idee notieren" maxlength="500"><button class="btn small primary" id="ideaAdd">Notieren</button></div>' +
        '<input class="input" id="ideaTags" placeholder="Tags, optional, mit Komma getrennt">' +
        (open.length ? open.map((i) => '<div class="idea"><div>' + inline(i.text) + '</div><div class="meta">' + esc(i.id) + ', ' + esc(fmtDate(i.date)) + (i.tags.length ? ', ' + i.tags.map((x) => '#' + esc(x)).join(' ') : '') + '</div><div class="row"><select class="input" data-ity="' + esc(i.id) + '" style="flex:1">' + Object.entries(meta.typeLabel).map(([k, v]) => '<option value="' + k + '">' + esc(v) + '</option>').join('') + '</select><select class="input" data-ipr="' + esc(i.id) + '" style="flex:0 0 110px">' + PRIOS.map((p) => '<option' + (p === 'P3' ? ' selected' : '') + '>' + p + '</option>').join('') + '</select><button class="btn small" data-promote="' + esc(i.id) + '">Als Aufgabe übernehmen</button><button class="btn small ghost danger" data-idrop="' + esc(i.id) + '">Verwerfen</button></div></div>').join('') : '<p class="md empty-md">Noch keine offenen Ideen.</p>') +
        (closed.length ? '<details class="sec"><summary>Erledigte Ideen <span class="meta">' + closed.length + '</span></summary><div class="body">' + closed.map((i) => '<div class="idea closed"><div>' + inline(i.text) + '</div><div class="meta">' + esc(i.id) + ', ' + esc(i.note || 'abgeschlossen') + '</div></div>').join('') + '</div></details>' : '');
      const add = () => { const v = $('#ideaIn').value.trim(); if (!v) return; run(() => act('idea', { text: v, tags: $('#ideaTags').value }), 'Idee notiert').then((r) => { if (r) renderSide(); }); };
      $('#ideaIn').onkeydown = (e) => { if (e.key === 'Enter') add(); };
      $('#ideaAdd').onclick = add;
      $$('[data-promote]', body).forEach((b) => b.onclick = async () => {
        const iid = b.dataset.promote;
        const r = await run(() => act('ideaPromote', { iid, type: $('[data-ity="' + iid + '"]', body).value, priority: $('[data-ipr="' + iid + '"]', body).value }), (x) => x.message);
        if (r) { renderSide(); if (r.id) pendingOpen = r.id; }
      });
      $$('[data-idrop]', body).forEach((b) => b.onclick = async () => {
        const reason = await askText({ title: 'Idee verwerfen', label: 'Grund, optional', confirm: 'Verwerfen', danger: true });
        if (reason === null) return;
        const r = await run(() => act('ideaDrop', { iid: b.dataset.idrop, reason }), 'Idee verworfen');
        if (r) renderSide();
      });
    } else if (side === 'next') {
      let n;
      try { n = await api('GET', 'api/next'); } catch (e) { return fail(e); }
      body.innerHTML = head('Nächste Aufgabe') +
        '<p class="md">Vorschlag nach Priorität, Fristen, Abhängigkeiten und Aufwand. Blockierte Aufgaben sind ausgenommen.</p>' +
        (n.active.length ? '<div class="block"><div class="block-head"><h3>Läuft gerade</h3></div>' + n.active.map((t) => '<div class="cand"><div class="row"><span class="st" style="--c:' + statusVar(t.status) + '">' + esc(L(t.status)) + '</span><span class="tag">' + esc(t.priority) + '</span></div><button class="btn link" style="justify-content:flex-start;text-align:left" data-goto="' + esc(t.id) + '">' + esc(t.id + ' ' + t.title) + '</button></div>').join('') + '</div>' : '') +
        '<div class="block"><div class="block-head"><h3>Vorschläge</h3></div>' + (n.candidates.length ? n.candidates.map((c, i) => '<div class="cand"><div class="t">' + (i === 0 ? 'Empfohlen: ' : '') + esc(c.id + ' ' + c.title) + '</div><div class="why">' + esc(c.reasons.join(', ')) + '</div><div class="row"><button class="btn small primary" data-start="' + esc(c.id) + '">Starten</button><button class="btn small" data-goto="' + esc(c.id) + '">Ansehen</button></div></div>').join('') : '<p class="md empty-md">Nichts Startbares im Backlog.</p>') + '</div>';
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
      body.innerHTML = head('Aktivität') +
        '<p class="md">Änderungen seit dem Öffnen des Boards, egal ob von Claude, aus dem Terminal oder hier im Board.</p>' +
        (activity.length ? '<ol class="feed">' + activity.map((a) => '<li data-id="' + esc(a.id) + '" style="--cc:' + changeColor(a) + '"><span class="time">' + esc(a.date) + ' ' + esc(a.time) + (a.actor ? ', ' + esc(a.actor) : '') + '</span><span><strong>' + esc(a.id) + '</strong> ' + esc(a.title) + '</span><span class="flowline">' + flowHtml(a) + '</span>' + (a.why ? '<span class="why">' + esc(a.why) + '</span>' : '') + '</li>').join('') + '</ol><button class="btn small" id="actClear">Liste leeren</button>' : '<p class="md empty-md">Noch keine Änderungen.</p>');
      $$('.feed li', body).forEach((li) => li.onclick = () => { closeSide(); focusCard(li.dataset.id); });
      const c = $('#actClear', body);
      if (c) c.onclick = () => { activity = []; store.set(actKey, activity); renderSide(); };
    }
    $$('[data-sclose]', body).forEach((b) => b.onclick = closeSide);
  }

  function flowHtml(c) {
    if (c.kind === 'moved') return '<span class="st" style="--c:' + statusVar(c.from) + '">' + esc(L(c.from)) + '</span> → <span class="st" style="--c:' + statusVar(c.to) + '">' + esc(L(c.to)) + '</span>';
    if (c.kind === 'added') return 'Neu in <span class="st" style="--c:' + statusVar(c.to) + '">' + esc(L(c.to)) + '</span>';
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
      const base = { id: t.id, title: t.title, why: (t.lastLog || '').replace(/ \[[^\]]+\]$/, ''), actor: /\[Board\]$/.test(t.lastLog || '') ? 'Board' : 'Claude oder Terminal' };
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
  // Neue works-Version auf dem Server: Ansicht merken und Seite neu laden, damit Design und Skript aktuell sind.
  function reloadForUpdate() {
    if (dirty) { setLive(true, 'Neue Version verfügbar, wird nach dem Speichern geladen'); updateWaiting = true; return; }
    try {
      sessionStorage.setItem(UI_KEY, JSON.stringify({
        q: state.q, prios: [...state.prios], type: state.type, tag: state.tag, ms: state.ms, closed: state.closed, signal: state.signal, view: state.view,
        openId, side, scrollX: $('#board').scrollLeft, scrollY: window.scrollY,
      }));
    } catch (e) { /* privat */ }
    setLive(true, 'Neue Version wird geladen');
    location.reload();
  }
  let updateWaiting = false;

  async function reload() {
    // Während eine Karte gezogen wird, nicht neu zeichnen, sonst springt das Board unter dem Mauszeiger.
    if (dragId || qDrag || tlDrag) { reloadPending = true; return; }
    try {
      const res = await fetch('data.json', { cache: 'no-store' });
      const next = await res.json();
      if (outdated(next.meta)) return reloadForUpdate();
      const found = diff(tasks, next.tasks);
      const now = new Date();
      const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const date = now.toLocaleDateString('de-DE');
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
      setLive(true, 'Live, Stand ' + time);
    } catch (e) {
      setLive(false, 'Aktualisierung fehlgeschlagen');
    }
  }

  function setLive(okState, text) {
    const el = $('#live');
    el.hidden = false; el.classList.toggle('off', !okState); el.textContent = text;
  }

  // ---------- Ansichten ----------

  function setView(v) {
    if (!VIEWS.includes(v)) return;
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
    await run(() => act(inQ ? 'queueRemove' : 'queueAdd', { id }), inQ ? id + ' aus der Warteschlange genommen' : id + ' eingereiht');
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
    q.forEach((t) => { const e = t.effort || 'ohne Schätzung'; effort[e] = (effort[e] || 0) + 1; });
    const effortText = ['XL', 'L', 'M', 'S', 'ohne Schätzung'].filter((e) => effort[e]).map((e) => effort[e] + ' ' + e).join(', ') || 'leer';
    const candidates = tasks.filter((t) => ['backlog', 'geplant'].includes(t.status) && !t.archived && !ids.includes(t.id))
      .sort((a, b) => PRIOS.indexOf(a.priority) - PRIOS.indexOf(b.priority) || a.id.localeCompare(b.id, 'de', { numeric: true }));

    const item = (t, i) => {
      const bits = [meta.typeLabel[t.type] || t.type];
      if (t.effort) bits.push('Aufwand ' + t.effort);
      if (t.milestone) bits.push('Meilenstein ' + t.milestone);
      if (t.due) bits.push('fällig ' + fmtDate(t.due));
      let hint = '';
      if (t.blocked) hint = '<span class="q-hint bad">wartet auf ' + esc(t.blockers.join(', ')) + '</span>';
      else if (unlocks(t)) hint = '<span class="q-hint good">gibt ' + unlocks(t) + ' frei</span>';
      else if (t.status === 'in-arbeit' || t.status === 'review') hint = '<span class="q-hint" style="color:' + statusVar(t.status) + '">' + esc(L(t.status)) + '</span>';
      else if (t.status === 'geplant') hint = '<span class="q-hint">geplant</span>';
      return '<li class="q-item' + (t === next ? ' is-next' : '') + (t.blocked ? ' is-blocked' : '') + '" data-id="' + esc(t.id) + '"' + (EDIT ? ' draggable="true"' : '') + '>' +
        (EDIT ? '<span class="grip" aria-hidden="true">⋮⋮</span>' : '') +
        '<span class="q-pos num">' + (i + 1) + '</span>' +
        '<div class="q-t"><button class="q-title" data-open="' + esc(t.id) + '"><span class="id num">' + esc(t.id) + '</span> ' + esc(t.title) + '</button><span class="q-meta">' + esc(bits.join(', ')) + '</span></div>' +
        hint + '<span class="q-prio" style="color:' + prioVar(t.priority) + '">' + esc(t.priority) + '</span>' +
        (EDIT ? '<span class="q-ctl"><button class="btn small ghost icon" data-up="' + i + '" aria-label="Nach oben"' + (i === 0 ? ' disabled' : '') + '>↑</button><button class="btn small ghost icon" data-down="' + i + '" aria-label="Nach unten"' + (i === q.length - 1 ? ' disabled' : '') + '>↓</button><button class="btn small ghost icon" data-unq="' + esc(t.id) + '" aria-label="Aus der Warteschlange nehmen" title="Aus der Warteschlange nehmen">×</button></span>' : '') +
        '</li>';
    };
    const toggle = (key, label, sub, on, disabled) => '<label class="switch' + (disabled ? ' off' : '') + '"><span><b>' + esc(label) + '</b><small>' + esc(sub) + '</small></span><input type="checkbox" data-qset="' + key + '"' + (on ? ' checked' : '') + (disabled || !EDIT ? ' disabled' : '') + '><i aria-hidden="true"></i></label>';

    box.innerHTML = '<div class="q-wrap">' +
      '<section class="q-main">' +
        '<div class="q-head"><h2>Warteschlange für Claude</h2><p>Claude arbeitet diese Aufgaben in genau dieser Reihenfolge ab, vor allen anderen Vorschlägen.' + (EDIT ? ' Zum Umsortieren ziehen oder die Pfeile nutzen.' : '') + '</p></div>' +
        running.map((t) => '<button class="q-running" data-open="' + esc(t.id) + '" style="--c:' + statusVar(t.status) + '"><span class="q-run-ic" aria-hidden="true">▶</span><span class="q-t"><small>' + (t.status === 'review' ? 'Im Review' : 'Läuft gerade') + '</small><strong>' + esc(t.id + ' ' + t.title) + '</strong></span>' + (t.crit[1] ? '<span class="q-meta num">' + t.crit[0] + ' von ' + t.crit[1] + ' Kriterien</span>' : '') + '</button>').join('') +
        (q.length ? '<ol class="q-list" id="qList">' + q.map(item).join('') + '</ol>'
          : '<div class="q-empty"><strong>Die Warteschlange ist leer.</strong><span>' + (EDIT ? 'Unten Aufgaben einreihen, im Detailpanel auf Einreihen klicken oder in der Tabelle mehrere auswählen.' : 'Der Besitzer des Boards hat noch nichts eingereiht.') + ' Ohne Warteschlange wählt Claude selbst nach Priorität, Fristen und Abhängigkeiten.</span></div>') +
        (EDIT ? '<div class="q-add"><select class="input" id="qAddSel" aria-label="Aufgabe zum Einreihen"><option value="">Aufgabe einreihen …</option>' + candidates.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.priority + '  ' + t.id + '  ' + t.title) + '</option>').join('') + '</select><button class="btn" id="qAddBtn">Einreihen</button>' + (q.length ? '<button class="btn ghost" id="qClear">Leeren</button>' : '') + '</div>' : '') +
      '</section>' +
      '<aside class="q-side">' +
        '<h3>Ablauf</h3>' +
        toggle('auto_next', 'Nach dem Abschluss weitermachen', 'Claude startet danach die nächste Aufgabe der Schlange.', !!s.auto_next) +
        toggle('ask_before', 'Vor jedem Start nachfragen', 'Claude fragt kurz, bevor es die nächste beginnt.', s.ask_before !== false, !s.auto_next) +
        toggle('skip_blocked', 'Blockierte überspringen', 'Wartende Aufgaben bleiben stehen, bis ihre Abhängigkeit erledigt ist.', s.skip_blocked !== false) +
        '<div class="q-card"><small>Als Nächstes für Claude</small>' + (next ? '<button class="q-title" data-open="' + esc(next.id) + '"><strong>' + esc(next.id + ' ' + next.title) + '</strong></button>' + (skipped.length ? '<span>' + esc(skipped.map((x) => x.id).join(', ')) + (skipped.length === 1 ? ' wird' : ' werden') + ' übersprungen, bis die Abhängigkeit erledigt ist.</span>' : '') : '<span>' + (q.length ? 'Nichts startbar. Alle Einträge warten auf andere Aufgaben.' : 'Claude wählt selbst mit works next.') + '</span>') + '</div>' +
        '<div class="q-card row"><span>Aufwand in der Schlange</span><strong class="num">' + esc(effortText) + '</strong></div>' +
        '<div class="q-card"><small>So nutzt du sie</small><span>Sag Claude zum Beispiel <q>Arbeite die Warteschlange ab</q>. Claude sieht die Reihenfolge beim Sitzungsstart und in <code>works next</code>. Fertige Aufgaben fallen automatisch heraus.</span></div>' +
      '</aside></div>';

    $$('[data-open]', box).forEach((b) => b.onclick = () => openTask(b.dataset.open));
    if (!EDIT) return;
    const save = (order, msg) => {
      meta.queue = order;
      renderQueue(); renderViews();
      run(() => act('queueOrder', { ids: order }), msg);
    };
    $$('[data-up]', box).forEach((b) => b.onclick = () => { const i = +b.dataset.up; const o = ids.slice(); [o[i - 1], o[i]] = [o[i], o[i - 1]]; save(o, 'Reihenfolge gespeichert'); });
    $$('[data-down]', box).forEach((b) => b.onclick = () => { const i = +b.dataset.down; const o = ids.slice(); [o[i + 1], o[i]] = [o[i], o[i + 1]]; save(o, 'Reihenfolge gespeichert'); });
    $$('[data-unq]', box).forEach((b) => b.onclick = () => save(ids.filter((x) => x !== b.dataset.unq), b.dataset.unq + ' aus der Warteschlange genommen'));
    const addBtn = $('#qAddBtn', box);
    if (addBtn) addBtn.onclick = () => { const v = $('#qAddSel', box).value; if (v) save(ids.concat(v), v + ' eingereiht'); };
    const clr = $('#qClear', box);
    if (clr) clr.onclick = async () => { if (await confirmBox({ title: 'Warteschlange leeren', lead: 'Alle ' + ids.length + ' Einträge werden entfernt. Die Aufgaben selbst bleiben unverändert.', confirm: 'Leeren', danger: true })) save([], 'Warteschlange geleert'); };
    $$('[data-qset]', box).forEach((c) => c.onchange = () => {
      meta.queueSettings = { ...s, [c.dataset.qset]: c.checked };
      renderQueue();
      run(() => act('queueSettings', { [c.dataset.qset]: c.checked }), 'Einstellung gespeichert');
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
        save(o, 'Reihenfolge gespeichert');
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
      return '<div class="tl-wk' + (cur ? ' cur' : '') + '"><b>KW ' + isoWeek(ws) + '</b><span>' + esc(fmtDate(ws).slice(0, 6)) + '</span></div>';
    }).join('');

    const bar = (t) => {
      const sp = spans.get(t.id);
      const l = frac(sp.start);
      const r = frac(addDays(sp.end, 1));
      const days = dayDiff(sp.start, sp.end) + 1;
      const label = days <= 3 ? (sp.kind === 'est' ? t.effort || '' : '') : sp.kind === 'done' ? 'Erledigt' : sp.kind === 'late' ? 'Überfällig' : sp.kind === 'est' ? 'geschätzt' + (t.effort ? ', ' + t.effort : '') : t.status === 'in-arbeit' || t.status === 'review' ? L(t.status) + (t.crit[1] ? ', ' + t.crit[0] + ' von ' + t.crit[1] : '') : L(t.status);
      const tip = t.id + ' ' + t.title + '\n' + fmtDate(sp.start) + ' bis ' + fmtDate(sp.end) + (sp.kind === 'est' ? ' (geschätzt aus Aufwand ' + (t.effort || 'M') + ')' : '') + (t.blocked ? '\nWartet auf ' + t.blockers.join(', ') : '');
      const canDrag = EDIT && OPEN.includes(t.status);
      return '<div class="tl-bar k-' + sp.kind + '" data-bar="' + esc(t.id) + '" style="left:' + pct(l) + ';width:max(' + pct(r - l) + ',6px);--c:' + statusVar(t.status) + '" title="' + esc(tip) + '"><span>' + esc(label) + '</span>' +
        (canDrag ? '<i class="tl-handle" data-due="' + esc(t.id) + '" title="Ziehen ändert die Fälligkeit"></i>' : '') + '</div>' +
        (t.blocked ? '<span class="tl-wait" style="left:calc(' + pct(r) + ' + 8px)">wartet auf ' + esc(t.blockers.join(', ')) + '</span>' : '');
    };

    const group = (g) => {
      const items = g.items.slice().sort((a, b) => order[spans.get(a.id).kind] - order[spans.get(b.id).kind] || spans.get(a.id).start.localeCompare(spans.get(b.id).start));
      const m = g.m;
      const done = m ? m.done : 0;
      const line = m && m.due && m.due >= start && m.due <= last ? '<div class="tl-ms" style="left:calc(var(--lab) + (100% - var(--lab)) * ' + frac(addDays(m.due, 1)).toFixed(4) + ')" title="Ziel ' + esc(m.id) + ': ' + esc(fmtDate(m.due)) + '"></div>' : '';
      return '<div class="tl-group">' + line +
        '<div class="tl-ghead"><strong>' + esc(m ? m.id + ' ' + m.title : 'Ohne Meilenstein') + '</strong><span>' + (m ? (m.due ? 'Ziel ' + esc(fmtDate(m.due)) + ', ' : '') + done + ' von ' + m.total + ' erledigt' : items.length + (items.length === 1 ? ' Aufgabe' : ' Aufgaben')) + '</span></div>' +
        items.map((t) => '<div class="tl-row' + (t.status === 'erledigt' ? ' is-done' : '') + '"><button class="tl-label" data-open="' + esc(t.id) + '"><span class="pdot" style="--pc:' + prioVar(t.priority) + '"></span><span class="id num">' + esc(t.id) + '</span><span class="tt">' + esc(t.title) + '</span></button><div class="tl-track">' + bar(t) + '</div></div>').join('') +
        '</div>';
    };

    box.innerHTML = (LIVE ? '<div id="estBox"></div>' : '') + '<div class="tl-scroll"><div class="tl" style="--weeks:' + weeks + ';min-width:calc(var(--lab) + ' + weeks + ' * 84px)">' +
      '<div class="tl-headrow"><div class="tl-corner">Aufgabe</div><div class="tl-weeks">' + weekHead + '</div></div>' +
      '<div class="tl-body"><div class="tl-grid" aria-hidden="true">' + Array.from({ length: weeks }, (_, i) => '<i' + (addDays(start, i * 7) === weekStart(now) ? ' class="cur"' : '') + '></i>').join('') + '</div>' +
      '<div class="tl-today" style="left:calc(var(--lab) + (100% - var(--lab)) * ' + frac(now).toFixed(4) + ')" title="Heute"></div>' +
      (groups.length ? groups.map(group).join('') : '<div class="tl-empty">Keine Aufgaben für diese Filter.</div>') +
      '</div></div></div>' +
      '<div class="tl-legend"><span><i class="lg-today"></i>heute</span><span><i class="lg-ms"></i>Ziel eines Meilensteins</span><span><i class="lg-run"></i>läuft oder erledigt</span><span><i class="lg-plan"></i>geplant mit Fälligkeit</span><span><i class="lg-est"></i>geschätzt aus dem Aufwand</span>' +
      (EDIT ? '<span>Rechtes Ende eines Balkens ziehen ändert die Fälligkeit.</span>' : '') +
      (hiddenOld ? '<span>' + hiddenOld + ' ältere erledigte ausgeblendet</span>' : '') + '</div>';

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
          barEl.firstChild.textContent = 'Fällig ' + fmtDate(due);
        };
        h.onpointerup = async () => {
          h.onpointermove = null; h.onpointerup = null;
          const due = tlDrag && tlDrag.due;
          const t = tasks.find((x) => x.id === id);
          setTimeout(() => { tlDrag = null; }, 0);
          barEl.classList.remove('resizing');
          if (!due || (t && t.due === due)) { renderTimeline(); return; }
          await run(() => act('set', { id, fields: { due } }), id + ' fällig am ' + fmtDate(due));
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
    { key: 'title', label: 'Titel' },
    { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Prio' },
    { key: 'type', label: 'Typ' },
    { key: 'effort', label: 'Aufwand' },
    { key: 'due', label: 'Fällig' },
    { key: 'milestone', label: 'Meilenstein' },
    { key: 'tags', label: 'Tags' },
    { key: 'crit', label: 'Kriterien' },
    { key: 'updated', label: 'Geändert' },
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
    const optList = (vals, cur, labelFn) => vals.map((v) => '<option value="' + esc(v) + '"' + (v === (cur || '') ? ' selected' : '') + '>' + esc(labelFn ? labelFn(v) : v || 'offen') + '</option>').join('');
    const cell = (t, k) => {
      const open = OPEN.includes(t.status);
      if (k === 'id') return '<td class="c-id num">' + esc(t.id) + '</td>';
      if (k === 'title') return '<td class="c-title"><button class="tt" data-open="' + esc(t.id) + '">' + esc(t.title) + '</button>' + (t.blocked ? '<span class="warn">blockiert</span>' : '') + ((meta.queue || []).includes(t.id) ? '<span class="q-tag tag">Schlange ' + ((meta.queue || []).indexOf(t.id) + 1) + '</span>' : '') + '</td>';
      if (k === 'status') return '<td><span class="st" style="--c:' + statusVar(t.status) + '">' + esc(L(t.status)) + '</span></td>';
      if (k === 'priority') return '<td>' + (EDIT && open ? '<select class="cell" data-cell="priority" data-id="' + esc(t.id) + '" style="color:' + prioVar(t.priority) + '" aria-label="Priorität">' + optList(PRIOS, t.priority) + '</select>' : '<span style="color:' + prioVar(t.priority) + ';font-weight:650">' + esc(t.priority) + '</span>') + '</td>';
      if (k === 'type') return '<td>' + esc(meta.typeLabel[t.type] || t.type) + '</td>';
      if (k === 'effort') return '<td>' + (EDIT && open ? '<select class="cell" data-cell="effort" data-id="' + esc(t.id) + '" aria-label="Aufwand">' + optList(['', 'S', 'M', 'L', 'XL'], t.effort) + '</select>' : esc(t.effort || '')) + '</td>';
      if (k === 'due') return '<td class="' + (t.overdue ? 'late' : '') + '">' + (EDIT && open ? '<input type="date" class="cell" data-cell="due" data-id="' + esc(t.id) + '" value="' + esc(t.due) + '" aria-label="Fälligkeit">' : esc(fmtDate(t.due))) + '</td>';
      if (k === 'milestone') return '<td>' + esc(t.milestone) + '</td>';
      if (k === 'tags') return '<td class="c-tags">' + t.tags.map((x) => '<span class="tag">#' + esc(x) + '</span>').join('') + '</td>';
      if (k === 'crit') return '<td class="num">' + (t.crit[1] ? t.crit[0] + '/' + t.crit[1] : '') + '</td>';
      if (k === 'updated') return '<td class="num muted">' + esc(fmtDate(t.updated)) + '</td>';
      return '<td></td>';
    };
    box.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      (EDIT ? '<th class="c-sel"><input type="checkbox" id="selAll" aria-label="Alle auswählen"' + (all ? ' checked' : '') + '></th>' : '') +
      TABLE_COLS.map((c) => '<th><button data-sort="' + c.key + '" aria-sort="' + (tableSort.key === c.key ? (tableSort.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' + esc(c.label) + (tableSort.key === c.key ? '<span aria-hidden="true">' + (tableSort.dir > 0 ? ' ↑' : ' ↓') + '</span>' : '') + '</button></th>').join('') +
      '</tr></thead><tbody>' +
      (rows.length ? rows.map((t) => '<tr data-id="' + esc(t.id) + '" class="' + (selected.has(t.id) ? 'sel' : '') + (OPEN.includes(t.status) ? '' : ' closed') + '">' + (EDIT ? '<td class="c-sel"><input type="checkbox" data-sel="' + esc(t.id) + '"' + (selected.has(t.id) ? ' checked' : '') + ' aria-label="' + esc(t.id) + ' auswählen"></td>' : '') + TABLE_COLS.map((c) => cell(t, c.key)).join('') + '</tr>').join('')
        : '<tr><td colspan="12" class="tbl-empty">Keine Aufgaben für diese Filter.</td></tr>') +
      '</tbody></table></div>' +
      '<p class="tbl-foot">' + rows.length + (rows.length === 1 ? ' Aufgabe' : ' Aufgaben') + (EDIT ? '. Mit Shift klicken wählt einen Bereich. Prio, Aufwand und Fälligkeit lassen sich direkt ändern.' : '') + '</p>';

    $$('[data-sort]', box).forEach((b) => b.onclick = () => {
      const k = b.dataset.sort;
      if (tableSort.key === k) tableSort.dir *= -1; else { tableSort.key = k; tableSort.dir = 1; }
      store.set('works-table-sort', tableSort);
      renderTable();
    });
    $$('[data-open]', box).forEach((b) => b.onclick = () => openTask(b.dataset.open));
    $$('tbody tr[data-id]', box).forEach((tr) => tr.ondblclick = (e) => { if (!e.target.closest('input,select,button')) openTask(tr.dataset.id); });
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
      $$('[data-cell]', box).forEach((el) => el.onchange = () => run(() => act('set', { id: el.dataset.id, fields: { [el.dataset.cell]: el.value } }), el.dataset.id + ' gespeichert'));
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
    bar.innerHTML = '<strong class="num">' + n + ' ausgewählt</strong>' +
      sel('priority', 'Priorität', PRIOS.map((p) => [p, p + ' ' + meta.prioLabel[p]])) +
      sel('status', 'Status', ['backlog', 'geplant', 'in-arbeit', 'review'].map((s) => [s, L(s)])) +
      sel('milestone', 'Meilenstein', [['__none', 'Keiner']].concat(meta.milestones.map((m) => [m.id, m.id + ' ' + m.title]))) +
      sel('effort', 'Aufwand', ['S', 'M', 'L', 'XL'].map((e) => [e, e])) +
      '<button class="btn small" data-bop="tagAdd">Tag +</button><button class="btn small" data-bop="tagRemove">Tag −</button>' +
      '<button class="btn small" data-bop="queueAdd">Einreihen</button>' +
      '<button class="btn small danger" data-bop="drop">Verwerfen</button><button class="btn small" data-bop="archive">Archivieren</button>' +
      '<button class="btn small ghost" data-bop="clear">Auswahl aufheben</button>';
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
        const tag = await askText({ title: op === 'tagAdd' ? 'Tag hinzufügen' : 'Tag entfernen', lead: n + (n === 1 ? ' Aufgabe' : ' Aufgaben'), label: 'Tag ohne #', confirm: op === 'tagAdd' ? 'Hinzufügen' : 'Entfernen', required: true });
        if (tag) go(op, tag.replace(/^#/, ''));
        return;
      }
      if (op === 'drop') {
        const reason = await askText({ title: n + (n === 1 ? ' Aufgabe' : ' Aufgaben') + ' verwerfen', lead: 'Sie werden nicht umgesetzt und lassen sich später wiedereröffnen.', label: 'Grund', confirm: 'Verwerfen', required: true, danger: true });
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
    if (!c.git) { box.innerHTML = '<div class="alert info">Dieses Projekt ist kein Git-Repository. Der Code-Bereich zeigt Branch, Commits und Änderungen, sobald Git genutzt wird.</div>'; return; }
    const safeUrl = (u) => (/^https?:\/\//.test(u || '') ? u : '');
    const pr = c.pr && safeUrl(c.pr.url) ? '<a href="' + esc(c.pr.url) + '" target="_blank" rel="noopener">#' + esc(c.pr.number) + ' ' + esc({ OPEN: 'offen', MERGED: 'gemergt', CLOSED: 'geschlossen' }[c.pr.state] || c.pr.state) + '</a>' : '<span class="muted">keiner gefunden</span>';
    const fileRow = (f, unc) => '<li><button class="file" data-file="' + esc(f.file) + '"' + (unc ? ' data-unc="1"' : '') + ' aria-expanded="false"><span class="fn">' + esc(f.file) + '</span>' + (f.untracked ? '<span class="muted">neu</span>' : f.binary ? '<span class="muted">binär</span>' : '<span class="add num">+' + f.add + '</span><span class="del num">−' + f.del + '</span>') + '</button><div class="diff" hidden></div></li>';
    box.innerHTML =
      '<div class="code-cards">' +
        '<div><small>Branch</small><strong class="mono">' + (c.branch ? esc(c.branch) : '<span class="muted">keiner mit ' + esc(id) + ' im Namen</span>') + '</strong></div>' +
        '<div><small>Gegenüber ' + esc(c.base || 'Hauptbranch') + '</small><strong>' + (c.ahead === null ? '<span class="muted">nicht vergleichbar</span>' : c.ahead + (c.ahead === 1 ? ' Commit' : ' Commits') + ' voraus' + (c.behind ? ', ' + c.behind + ' zurück' : '')) + '</strong></div>' +
        '<div><small>Pull Request</small><strong>' + ((detail.prs || []).length ? detail.prs.slice(0, 3).map((p) => (/^https?:/.test(p.url || '') ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">#' + p.number + '</a>' : '#' + p.number) + ' ' + esc({ OPEN: 'offen', MERGED: 'gemergt', CLOSED: 'geschlossen' }[p.state] || p.state) + (p.ci ? ', CI ' + (p.ci === 'ok' ? 'grün' : p.ci === 'fail' ? 'rot' : 'läuft') : '')).join('<br>') : pr) + '</strong></div>' +
      '</div>' +
      '<div class="block"><div class="block-head"><h3>Commits</h3><span class="meta">mit ' + esc(id) + ' in der Nachricht</span></div>' +
        (c.commits.length ? '<ol class="commits">' + c.commits.map((k) => '<li><span class="mono hash">' + esc(k.short) + '</span><span class="subj">' + esc(k.subject) + '</span><time class="muted num" datetime="' + esc(k.date) + '">' + esc(new Date(k.date).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</time></li>').join('') + '</ol>'
          : '<p class="md empty-md">Noch keine Commits gefunden. Claude schreibt die Aufgaben-ID in jede Commit-Nachricht, zum Beispiel <code>feat(' + esc(id) + '): …</code>.</p>') + '</div>' +
      (c.uncommitted.length ? '<div class="block"><div class="block-head"><h3>Noch nicht committet</h3><span class="meta">auf ' + esc(c.branch) + '</span></div><ul class="files">' + c.uncommitted.map((f) => fileRow(f, true)).join('') + '</ul></div>' : '') +
      '<div class="block"><div class="block-head"><h3>Geänderte Dateien</h3><span class="meta">' + (c.source === 'branch' ? 'Branch gegenüber ' + esc(c.base) : c.source === 'commits' ? 'aus den Commits' : '') + '</span></div>' +
        (c.files.length ? '<ul class="files">' + c.files.map((f) => fileRow(f, false)).join('') + '</ul>' : '<p class="md empty-md">Keine Änderungen gefunden.</p>') + '</div>';
    $$('.file', box).forEach((b) => b.onclick = async () => {
      const d = b.nextElementSibling;
      const open = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', String(!open));
      d.hidden = open;
      if (open || d.dataset.loaded) return;
      d.innerHTML = '<p class="muted">Lädt …</p>';
      try {
        const r = await api('GET', 'api/diff?id=' + encodeURIComponent(id) + '&file=' + encodeURIComponent(b.dataset.file) + (b.dataset.unc ? '&uncommitted=1' : ''));
        d.dataset.loaded = '1';
        d.innerHTML = diffHtml(r.diff) + (r.truncated ? '<p class="muted diff-more">Gekürzt. Vollständig mit git diff im Terminal.</p>' : '');
      } catch (e) { d.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
    });
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
    return '<div class="diff-body mono">' + (out.join('') || '<div class="dl">Keine Textänderung.</div>') + '</div>';
  }

  // ---------- Teilen und Export ----------

  async function openShare() {
    let info;
    try { info = await api('GET', 'api/share'); } catch (e) { return fail(e); }
    const copyRow = (label, url, warn) => '<div class="share-link' + (warn ? ' warn' : '') + '"><span>' + esc(label) + '</span><input class="input mono" readonly value="' + esc(url) + '"><button type="button" class="btn small" data-copy="' + esc(url) + '">Kopieren</button></div>';
    const lan = info.shared
      ? (info.links.length
        ? info.links.map((l) => copyRow('Ansehen über ' + l.address, l.view)).join('') +
          '<details class="sec"><summary>Link mit Bearbeitungsrechten <span class="meta">nur für dich auf anderen Geräten</span></summary><div class="body">' + info.links.map((l) => copyRow(l.address, l.edit, true)).join('') + '<p class="sublabel">Wer diesen Link hat, kann alles ändern. Nicht weitergeben.</p></div></details>' +
          '<div class="row-btns"><button type="button" class="btn small" data-share="rotate">Links erneuern</button><button type="button" class="btn small danger" data-share="disable">Freigabe beenden</button></div>'
        : '<div class="alert bad">Freigegeben, aber keine Netzwerkadresse gefunden. Ist der Rechner mit einem Netzwerk verbunden?</div><div class="row-btns"><button type="button" class="btn small danger" data-share="disable">Freigabe beenden</button></div>')
      : '<p class="lead">Das Board läuft gerade nur auf diesem Rechner. Nach der Freigabe sehen andere im selben Netzwerk (WLAN, Büro, VPN) das Board live mit einem Link. Ändern können sie nichts.</p><div class="row-btns"><button type="button" class="btn primary small" data-share="enable">Im Netzwerk freigeben</button></div><p class="sublabel">Der Server startet dafür kurz neu und hört dann auf allen Netzwerkadressen. Die Links enthalten einen geheimen Schlüssel, ohne ihn gibt es keinen Zugriff.</p>';
    const html = '<h2>Board teilen</h2>' +
      '<div class="block"><div class="block-head"><h3>Live im Netzwerk</h3><span class="meta">' + (info.shared ? 'freigegeben' : 'nur dieser Rechner') + '</span></div>' + lan + '</div>' +
      '<div class="block"><div class="block-head"><h3>Schnappschuss</h3><span class="meta">eine HTML-Datei</span></div>' +
        '<p class="lead">Für Mail oder Chat: alle Aufgaben mit Details und Bildern in einer Datei. Öffnet sich ohne Server und ohne Internet, zeigt den Stand von jetzt.</p>' +
        '<label class="toggle"><input type="checkbox" name="images" checked> Bilder einbetten</label>' +
        '<label class="toggle"><input type="checkbox" name="closed" checked> Erledigte, Verworfene und Archiv mitnehmen</label>' +
        '<div class="row-btns"><button type="button" class="btn small primary" id="snapGo">Schnappschuss herunterladen</button></div></div>' +
      '<div class="block"><div class="block-head"><h3>Im Internet</h3></div><p class="lead">Für Leute außerhalb deines Netzwerks den Schnappschuss schicken. Ein eigener Server mit Login ist als nächster Schritt möglich.</p></div>' +
      '<div class="foot"><button class="btn" value="cancel" formnovalidate>Schließen</button></div>';
    showDialog(html, () => null, (f) => {
      $$('[data-copy]', f).forEach((b) => b.onclick = async () => {
        const inp = b.previousElementSibling;
        try { await navigator.clipboard.writeText(b.dataset.copy); } catch (e) { inp.select(); document.execCommand('copy'); }
        b.textContent = 'Kopiert';
        setTimeout(() => { b.textContent = 'Kopieren'; }, 1500);
      });
      $$('[data-share]', f).forEach((b) => b.onclick = async () => {
        const op = b.dataset.share;
        if (op === 'rotate' && !confirm('Neue Links erzeugen? Die bisherigen Links funktionieren dann nicht mehr.')) return;
        b.disabled = true;
        try {
          const r = await api('POST', 'api/share', { op });
          ok(r.message);
          if (r.restarting) { dlg.close(); setLive(true, 'Board startet neu'); return; }
          dlg.close(); openShare();
        } catch (e) { fail(e); b.disabled = false; }
      });
      $('#snapGo', f).onclick = async (e) => {
        const b = e.currentTarget;
        b.disabled = true; b.textContent = 'Wird erstellt …';
        try {
          const qs = 'images=' + (f.images.checked ? '1' : '0') + '&closed=' + (f.closed.checked ? '1' : '0');
          const res = await fetch('api/export?' + qs, { headers: { 'X-Works-Token': TOKEN } });
          if (!res.ok) throw new Error('Export fehlgeschlagen (' + res.status + ').');
          const blob = await res.blob();
          const name = ((res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/) || [])[1] || 'works-board.html';
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          ok('Schnappschuss gespeichert: ' + name + ' (' + (blob.size / 1024 / 1024).toFixed(1) + ' MB)');
        } catch (ex) { fail(ex); }
        b.disabled = false; b.textContent = 'Schnappschuss herunterladen';
      };
    });
  }

  // ---------- Prüfungen im Abschluss-Dialog ----------

  function checksBlock(c) {
    const icon = { ok: ['ok', '✓'], ack: ['ok', '✓'], fail: ['bad', '×'], warn: ['warn', '!'], manual: ['wait', '…'], missing: ['wait', '…'] };
    const rows = c.list.map((x) => {
      const r = c.results[x.name] || { status: 'missing' };
      const st = c.stale ? 'missing' : r.status;
      const [cls, ch] = icon[st] || icon.missing;
      const label = { ok: 'bestanden', ack: 'bekannt', fail: 'fehlgeschlagen', warn: 'Fund', manual: 'trägt Claude ein', missing: 'noch nicht gelaufen' }[st];
      let extra = '';
      if (!c.stale && st === 'warn') extra = '<div class="ck-note">' + md(r.note || '') + (EDIT ? '<div class="row-btns"><button type="button" class="btn small primary" data-cfix="' + esc(x.name) + '">Claude beheben lassen</button><button type="button" class="btn small" data-cack="' + esc(x.name) + '">Als bekannt markieren</button></div>' : '') + '</div>';
      else if (!c.stale && st === 'fail' && r.output) extra = '<details class="ck-out"><summary>Ausgabe</summary><pre>' + esc(r.output.split('\n').slice(-40).join('\n')) + '</pre></details>';
      else if (!c.stale && (st === 'manual' || st === 'ack') && r.note) extra = '<div class="ck-note muted">' + esc(r.note.split('\n').slice(-1)[0]) + '</div>';
      return '<li class="ck ' + cls + '"><div class="ck-row"><span class="ck-ic" aria-hidden="true">' + ch + '</span><span class="ck-name">' + esc(x.name) + '</span><span class="mono muted ck-cmd">' + esc(x.cmd) + '</span><span class="muted num ck-ms">' + (r.ms && !c.stale ? Math.round(r.ms / 1000) + ' s' : esc(label)) + '</span></div>' + extra + '</li>';
    }).join('');
    return '<div class="block"><div class="block-head"><h3>Automatische Prüfungen</h3><span class="meta">' + (c.stale ? 'für den aktuellen Stand noch nicht gelaufen' : 'zuletzt ' + esc(new Date(c.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }))) + '</span><span class="spacer"></span>' +
      (EDIT ? '<button type="button" class="btn small" data-crun>' + (c.stale ? 'Jetzt prüfen' : 'Erneut prüfen') + '</button>' : '') + '</div><ul class="checks">' + rows + '</ul></div>';
  }

  function bindChecks(f, id) {
    const reopen = () => { const c = $('button[value="cancel"]', f); if (c) c.click(); setTimeout(() => openDod(id), 50); };
    $$('[data-crun]', f).forEach((b) => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Prüfungen laufen …';
      $$('.ck', f).forEach((li) => li.classList.add('running'));
      const r = await run(() => act('checksRun', { id }), 'Prüfungen gelaufen');
      if (r) reopen(); else { b.disabled = false; b.textContent = 'Erneut prüfen'; }
    });
    $$('[data-cack]', f).forEach((b) => b.onclick = async () => { if (await run(() => act('checksAck', { id, name: b.dataset.cack }), 'Als bekannt markiert')) reopen(); });
    $$('[data-cfix]', f).forEach((b) => b.onclick = async () => {
      const note = (b.closest('.ck').querySelector('.ck-note') || {}).innerText || '';
      const r = await run(() => act('comment', { id, text: 'Bitte den Fund aus der Prüfung ' + b.dataset.cfix + ' beheben und die Prüfung danach neu eintragen:\n\n' + note.replace(/Claude beheben lassen|Als bekannt markieren/g, '').trim() }), 'Auftrag an Claude als Kommentar gespeichert');
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
      const when = new Date(c.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return '<li class="cm' + (me ? ' me' : ' cl') + '"><span class="cm-av" aria-hidden="true">' + (me ? 'Du' : 'C') + '</span><div class="cm-b"><div class="cm-meta"><strong>' + (me ? 'Du' : 'Claude') + '</strong> ' + esc(when) + (!me && c.at > seen && seen ? ' <span class="tag q-tag">neu</span>' : '') + '</div><div class="cm-text md">' + md(c.text) + '</div></div></li>';
    };
    const lastMine = list.length && list[list.length - 1].author === 'Nutzer';
    return '<div class="comments">' +
      (list.length ? '<ol class="cm-list">' + list.map(item).join('') + '</ol>' : '<div class="q-empty"><strong>Noch keine Kommentare.</strong><span>Schreib Claude hier, was bei dieser Aufgabe wichtig ist. Claude liest neue Kommentare beim Start der Sitzung und antwortet hier.</span></div>') +
      (lastMine ? '<p class="sublabel">Claude hat deinen letzten Kommentar noch nicht beantwortet.</p>' : '') +
      (EDIT ? '<div class="cm-compose"><label class="field"><span>Nachricht an Claude</span><textarea class="input" id="cmIn" rows="4" maxlength="10000" placeholder="Hinweis, Wunsch oder Antwort. Markdown möglich."></textarea></label><div class="add-row" style="justify-content:flex-end;align-items:center"><span class="sublabel" style="margin-right:auto">Strg+Enter sendet</span><button class="btn primary small" id="cmSend">Senden</button></div></div>' : '') +
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
      '<div class="code-cards"><div><small>Claude aktiv</small><strong>' + (tm.totalMs ? fmtMs(tm.totalMs) : '–') + '</strong><span class="muted">' + tm.sessions.length + (tm.sessions.length === 1 ? ' Sitzung' : ' Sitzungen') + '</span></div>' +
      '<div><small>Seit dem Start</small><strong>' + (since === null ? 'nicht gestartet' : since + (since === 1 ? ' Tag' : ' Tage')) + '</strong><span class="muted">' + (est ? 'geschätzt ' + est + ' Tage bei ' + esc(t.effort) : 'ohne Schätzung') + '</span></div>' +
      '<div><small>Tokens</small><strong>' + (d.usage && d.usage.tokens ? fmtTok(d.usage.tokens) : '–') + '</strong><span class="muted">' + (d.usage && d.usage.tokens ? 'davon ' + fmtTok(d.usage.cr + d.usage.cw) + ' Cache' : 'noch nichts erfasst') + '</span></div>' +
      '<div><small>Geschätzte Kosten</small><strong>' + (d.usage && d.usage.tokens ? fmtMoney(d.usage.cost, d.usage.currency) : '–') + '</strong><span class="muted">nach den Preisen in config.json</span></div></div>' +
      (d.usage && d.usage.days && d.usage.days.length ? '<div class="block"><div class="block-head"><h3>Verbrauch je Tag</h3></div><div class="est-grid">' + d.usage.days.slice(0, 10).map((x) => { const max = Math.max(...d.usage.days.map((y) => y.cost)) || 1; return '<span class="muted num">' + esc(fmtDate(x.day).slice(0, 6)) + '</span><div class="est-track"><span class="est-bar" style="width:' + (x.cost / max * 100).toFixed(1) + '%"></span></div><span class="num">' + fmtTok(x.in + x.out + x.cw + x.cr) + ', ' + fmtMoney(x.cost, d.usage.currency) + '</span>'; }).join('') + '</div></div>' : '') +
      (sd.length ? '<div class="block"><div class="block-head"><h3>Tage je Status</h3></div><div class="pg-bar">' + sd.map(([k, v]) => '<span style="flex-grow:' + v + ';background:' + statusVar(k) + '" title="' + esc(L(k)) + ': ' + v + ' Tage"></span>').join('') + '</div><div class="pg-legend">' + sd.map(([k, v]) => '<span class="pg-k"><i style="background:' + statusVar(k) + '"></i>' + esc(L(k)) + ' <b class="num">' + v + '</b></span>').join('') + '</div></div>' : '') +
      '<div class="block"><div class="block-head"><h3>Sitzungen</h3><span class="meta">Pausen über 20 Minuten trennen</span></div>' +
      (tm.sessions.length ? '<ol class="commits">' + tm.sessions.map((s) => '<li><time class="muted num">' + esc(new Date(s.start).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</time><span class="subj">' + esc(s.label || s.turns + (s.turns === 1 ? ' Anfrage' : ' Anfragen')) + '</span><span class="num">' + fmtMs(s.ms) + '</span></li>').join('') + '</ol>'
        : '<p class="md empty-md">Noch keine erfasste Zeit. Die Hooks messen, wie lange Claude an der aktiven Aufgabe arbeitet, sobald sie mit works start begonnen wurde.</p>') + '</div></div>';
  }

  async function loadEstimates() {
    const box = $('#estBox');
    if (!box) return;
    let e;
    try { e = await api('GET', 'api/estimates'); } catch (err) { return; }
    const max = Math.max(1, ...e.sizes.map((s) => Math.max(s.estimate, s.avg || 0)));
    const open = store.get('works-est-open', false);
    box.innerHTML = '<details class="est"' + (open ? ' open' : '') + '><summary>Wie gut passen die Schätzungen? <span class="meta">Zeitleiste rechnet mit ' + (e.mode === 'measured' ? 'gemessenen' : 'festen') + ' Werten</span></summary><div class="est-body">' +
      '<div class="est-grid">' + e.sizes.map((s) => '<strong>' + s.effort + '</strong><div class="est-track"><span class="est-bar' + (s.avg !== null && s.avg > s.estimate * 1.2 ? ' over' : '') + '" style="width:' + ((s.avg || 0) / max * 100).toFixed(1) + '%"></span><span class="est-mark" style="left:' + (s.estimate / max * 100).toFixed(1) + '%" title="Schätzung ' + s.estimate + ' Tage"></span></div><span class="' + (s.avg === null ? 'muted' : '') + '">' + (s.avg === null ? 'noch keine Daten' : s.avg + ' statt ' + s.estimate + ' Tage, ' + s.n + 'x') + '</span>').join('') + '</div>' +
      '<p class="sublabel">Strich: Schätzung. Balken: tatsächliche Dauer im Mittel, vom Start bis zum Abschluss. Gemessene Werte zählen ab drei erledigten Aufgaben je Größe.</p>' +
      (e.worst.length ? '<p class="sublabel">Am längsten über der Schätzung: ' + e.worst.map((w) => esc(w.id) + ' (' + esc(w.effort) + ', ' + w.days + ' Tage)').join(', ') + '</p>' : '') +
      (EDIT ? '<div class="row-btns">' + (e.mode === 'measured' ? '<button class="btn small" data-emode="fixed">Feste Werte nutzen</button>' : '<button class="btn small primary" data-emode="measured">Gemessene Werte nutzen</button>') + '</div>' : '') +
      '</div></details>';
    $('details', box).ontoggle = (ev) => store.set('works-est-open', ev.target.open);
    $$('[data-emode]', box).forEach((b) => b.onclick = () => run(() => act('effortMode', { mode: b.dataset.emode }), 'Gespeichert'));
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
      box.innerHTML = '<div class="q-wrap"><section class="q-main"><div class="q-head"><h2>Kein Sprint aktiv</h2><p>Ein Sprint bündelt Aufgaben für einen festen Zeitraum mit einem Ziel. Die Kapazität in Punkten zeigt, ob der Plan realistisch ist. Punkte: ' + Object.entries(set.points).map(([k, v]) => k + ' ' + v).join(', ') + ', ohne Schätzung zählt eine Aufgabe wie M.</p></div>' +
        (EDIT ? '<form class="sp-form" id="spStart"><div class="grid"><label class="field span2"><span>Titel</span><input class="input" name="title" required maxlength="120" value="Sprint ' + ((parseInt(String(last ? last.id : 'S0').slice(1), 10) || 0) + 1) + '"></label><label class="field span2"><span>Ziel</span><input class="input" name="goal" maxlength="300" placeholder="Was soll am Ende stehen?"></label>' +
          '<label class="field"><span>Start</span><input type="date" class="input" name="start" value="' + today() + '"></label><label class="field"><span>Länge in Tagen</span><input type="number" class="input" name="days" min="1" max="60" value="' + set.length_days + '"></label><label class="field"><span>Kapazität in Punkten</span><input type="number" class="input" name="capacity" min="1" max="1000" value="' + set.capacity + '"></label></div>' +
          (carry.length ? '<label class="toggle"><input type="checkbox" name="carry" checked> ' + carry.length + ' offene Aufgabe' + (carry.length === 1 ? '' : 'n') + ' aus ' + esc(last.id) + ' übernehmen</label>' : '') +
          '<div class="row-btns"><button class="btn primary">Sprint starten</button></div></form>' : '<p class="md empty-md">Der Besitzer des Boards hat gerade keinen Sprint geplant.</p>') +
        '</section>' + (last ? '<aside class="q-side"><div class="q-card"><small>' + esc(last.id + ' ' + last.title) + ' im Rückblick</small><span>' + (last.result ? last.result.done + ' von ' + last.result.planned + ' Punkten geschafft' : 'abgeschlossen') + (carry.length ? ', ' + carry.length + ' offen geblieben' : '') + '</span></div></aside>' : '') + '</div>';
      const f = $('#spStart', box);
      if (f) f.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(f); run(() => act('sprintStart', { title: fd.get('title'), goal: fd.get('goal'), start: fd.get('start'), days: fd.get('days'), capacity: fd.get('capacity'), carry: fd.get('carry') === 'on' }), (x) => x.message); };
      return;
    }
    const st = sp.stats;
    const list = (sp.tasks || []).map((x) => byId.get(x)).filter(Boolean);
    const free = st.capacity - st.planned;
    const cap = Math.max(st.capacity, st.planned, 1);
    const seg = (n, cls, label) => (n > 0 ? '<span class="' + cls + '" style="flex-grow:' + n + '" title="' + label + ': ' + n + ' Punkte"></span>' : '');
    const W = 300; const H = 110; const P = 6;
    const x = (i) => P + (i * (W - 2 * P)) / Math.max(1, st.days - 1);
    const y = (v) => H - P - (v * (H - 2 * P)) / Math.max(1, st.planned);
    const actual = st.series.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.remaining).toFixed(1)).join(' ');
    const lastP = st.series[st.series.length - 1];
    const ahead = lastP ? lastP.remaining <= st.idealNow + 0.01 : true;
    const cand = tasks.filter((t) => ['backlog', 'geplant'].includes(t.status) && !t.archived && !(sp.tasks || []).includes(t.id))
      .sort((a, b) => PRIOS.indexOf(a.priority) - PRIOS.indexOf(b.priority) || (b.status === 'geplant') - (a.status === 'geplant')).slice(0, 12);
    const row = (t) => '<li class="sp-item' + (t.status === 'erledigt' ? ' done' : '') + '" data-id="' + esc(t.id) + '"><span class="st" style="--c:' + statusVar(t.status) + '" title="' + esc(L(t.status)) + '"></span><button class="q-title" data-open="' + esc(t.id) + '"><span class="id num">' + esc(t.id) + '</span> ' + esc(t.title) + '</button>' +
      (t.crit[1] && t.status !== 'erledigt' ? '<span class="muted num">' + t.crit[0] + ' von ' + t.crit[1] + '</span>' : '') + '<span class="muted num">' + esc(t.effort || 'ohne') + ', ' + pts(t) + ' P</span>' + (EDIT && t.status !== 'erledigt' ? '<button class="btn small ghost icon" data-sprm="' + esc(t.id) + '" aria-label="Aus dem Sprint nehmen" title="Aus dem Sprint nehmen">×</button>' : '') + '</li>';
    box.innerHTML = '<div class="sp">' +
      '<div class="sp-top"><section class="sp-card sp-main"><div class="sp-head"><h2>' + esc(sp.title) + '</h2><span class="muted">' + esc(fmtDate(sp.start)) + ' bis ' + esc(fmtDate(sp.end)) + ', Tag ' + st.dayIndex + ' von ' + st.days + '</span>' + (EDIT ? '<span class="spacer"></span><button class="btn small ghost" id="spEdit">Bearbeiten</button><button class="btn small" id="spClose">Sprint abschließen</button>' : '') + '</div>' +
        (sp.goal ? '<p class="sp-goal">Ziel: ' + esc(sp.goal) + '</p>' : '') +
        '<div class="sp-cap"><span>Kapazität</span><strong class="num">' + st.planned + ' von ' + st.capacity + ' Punkten verplant</strong></div>' +
        '<div class="pg-bar sp-bar">' + seg(st.done, 'pg-done', 'Erledigt') + seg(st.working, 'pg-work', 'In Arbeit') + seg(st.open, 'sp-open', 'Offen') + seg(Math.max(0, cap - st.planned), 'pg-wait', 'Frei') + '</div>' +
        '<div class="pg-legend"><span class="pg-k"><i class="pg-done"></i>erledigt <b class="num">' + st.done + '</b></span><span class="pg-k"><i class="pg-work"></i>in Arbeit <b class="num">' + st.working + '</b></span><span class="pg-k"><i class="sp-open"></i>offen <b class="num">' + st.open + '</b></span>' + (free < 0 ? '<span class="late">' + (-free) + ' Punkte überplant</span>' : '<span class="muted">' + free + ' frei</span>') + (st.unestimated ? '<span class="muted">' + st.unestimated + ' ohne Schätzung zählen als M</span>' : '') + '</div></section>' +
        '<section class="sp-card sp-burn"><div class="sp-cap"><strong>Burndown</strong><span class="' + (ahead ? 'good' : 'late') + '">' + (ahead ? 'im Plan' : 'hinter dem Plan') + '</span></div>' +
        '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Offene Punkte: ' + (lastP ? lastP.remaining : st.planned) + ', ideal wären ' + st.idealNow.toFixed(1) + '"><path d="M' + x(0) + ' ' + y(st.planned) + ' L' + x(st.days - 1) + ' ' + y(0) + '" class="c-ideal"/>' + (actual ? '<path d="' + actual + '" class="c-done"/>' : '') + '' + '</svg>' +
        '<div class="c-axis"><span>' + (lastP ? lastP.remaining : st.planned) + ' Punkte offen</span><span>ideal wären ' + st.idealNow.toFixed(1).replace('.', ',') + '</span></div></section></div>' +
      '<div class="q-wrap"><section class="q-main"><h3 class="sp-h">Im Sprint <span class="muted">' + list.length + '</span></h3>' +
        (list.length ? '<ol class="sp-list" id="spList">' + list.map(row).join('') + '</ol>' : '') +
        (EDIT ? '<div class="sp-drop" id="spDrop">Aufgaben von rechts hierher ziehen oder mit + einplanen.' + (free > 0 ? ' Noch ' + free + ' Punkte frei.' : '') + '</div>' : '') + '</section>' +
      '<aside class="q-side"><h3 class="sp-h">Vorschläge</h3>' + (cand.length ? cand.map((t) => {
        const p = pts(t);
        const fit = p === free ? ['good', 'passt genau'] : p < free ? ['', 'passt'] : ['late', 'passt nicht mehr'];
        return '<div class="sp-cand' + (fit[0] === 'good' ? ' best' : '') + '" data-id="' + esc(t.id) + '"' + (EDIT ? ' draggable="true"' : '') + '><button class="q-title" data-open="' + esc(t.id) + '">' + esc(t.id + ' ' + t.title) + '</button><span class="q-meta"><span style="color:' + prioVar(t.priority) + '">' + esc(t.priority) + '</span>, ' + esc(t.effort || 'ohne Schätzung') + ', ' + p + ' P, <span class="' + fit[0] + '">' + fit[1] + '</span></span>' + (EDIT ? '<button class="btn small ghost icon sp-add" data-spadd="' + esc(t.id) + '" aria-label="' + esc(t.id) + ' einplanen" title="Einplanen">+</button>' : '') + '</div>';
      }).join('') : '<p class="md empty-md">Keine offenen Aufgaben außerhalb des Sprints.</p>') +
        (last && last.result ? '<div class="q-card"><small>' + esc(last.id) + ' im Rückblick</small><span>' + last.result.done + ' von ' + last.result.planned + ' Punkten geschafft</span></div>' : '') +
      '</aside></div></div>';
    $$('[data-open]', box).forEach((b) => b.onclick = () => openTask(b.dataset.open));
    if (!EDIT) return;
    $$('[data-spadd]', box).forEach((b) => b.onclick = () => run(() => act('sprintAdd', { id: b.dataset.spadd }), b.dataset.spadd + ' eingeplant'));
    $$('[data-sprm]', box).forEach((b) => b.onclick = () => run(() => act('sprintRemove', { id: b.dataset.sprm }), b.dataset.sprm + ' aus dem Sprint genommen'));
    $$('.sp-cand[draggable]', box).forEach((c) => {
      c.ondragstart = (e) => { qDrag = c.dataset.id; e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); };
      c.ondragend = () => { qDrag = null; c.classList.remove('dragging'); if (reloadPending) { reloadPending = false; reload(); } };
    });
    const drop = $('#spDrop', box);
    const target = [drop, $('#spList', box)].filter(Boolean);
    target.forEach((el) => {
      el.ondragover = (e) => { if (qDrag) { e.preventDefault(); drop.classList.add('over'); } };
      el.ondragleave = () => drop.classList.remove('over');
      el.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); const idd = e.dataTransfer.getData('text/plain'); qDrag = null; if (idd) run(() => act('sprintAdd', { id: idd }), idd + ' eingeplant'); };
    });
    $('#spClose', box).onclick = () => openRetro(sp, st, list);
    $('#spEdit', box).onclick = async () => {
      const r = await showDialog('<h2>' + esc(sp.id) + ' bearbeiten</h2><label class="field"><span>Titel</span><input class="input" name="title" required maxlength="120" value="' + esc(sp.title) + '"></label><label class="field"><span>Ziel</span><input class="input" name="goal" maxlength="300" value="' + esc(sp.goal || '') + '"></label><div class="grid"><label class="field span2"><span>Ende</span><input type="date" name="end" value="' + esc(sp.end) + '"></label><label class="field span2"><span>Kapazität</span><input type="number" class="input" name="capacity" min="1" max="1000" value="' + st.capacity + '"></label></div>' + foot('Speichern'),
        (fd) => act('sprintSet', { fields: { title: fd.get('title'), goal: fd.get('goal'), end: fd.get('end'), capacity: fd.get('capacity') } }));
      if (r) ok('Sprint gespeichert');
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
      const label = t.status === 'erledigt' ? 'erledigt' : t.blocked ? 'blockiert' : L(t.status);
      return '<div class="gr-node' + (critSet.has(t.id) ? ' crit' : '') + (t.status === 'erledigt' ? ' done' : '') + (t.blocked ? ' blocked' : '') + '" data-node="' + esc(t.id) + '" style="left:' + p.x + 'px;top:' + p.y + 'px;width:' + NW + 'px;height:' + NH + 'px">' +
        '<button class="gr-open" data-open="' + esc(t.id) + '"><span class="gr-meta"><span class="st" style="--c:' + (t.blocked ? 'var(--danger)' : statusVar(t.status)) + '"></span>' + esc(t.id) + ' ' + esc(label) + (t.effort ? ', ' + esc(t.effort) : '') + '</span><span class="gr-t">' + esc(t.title) + '</span></button>' +
        (EDIT && open(t) ? '<button class="gr-link" data-link="' + esc(t.id) + '" title="Zu einer anderen Karte ziehen: diese Aufgabe blockiert jene" aria-label="Abhängigkeit von ' + esc(t.id) + ' ziehen">+</button>' : '') + '</div>';
    };
    const loose = pool.length - nodes.length;
    const days = endNode ? dist.get(endNode.id) : 0;
    box.innerHTML = '<div class="q-wrap"><section class="q-main">' +
      '<div class="gr-bar"><label class="toggle"><input type="checkbox" id="grDone"' + (showDone ? ' checked' : '') + '> Erledigte zeigen</label><span class="muted">' + nodes.length + ' Aufgaben mit Abhängigkeiten' + (loose ? ', ' + loose + ' ohne' : '') + '</span></div>' +
      (nodes.length ? '<div class="gr-scroll"><div class="gr-canvas" style="width:' + W + 'px;height:' + H + 'px"><svg class="gr-svg" width="' + W + '" height="' + H + '" aria-hidden="true"><defs><marker id="gra" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" class="gr-ah"/></marker><marker id="grh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" class="gr-ah hot"/></marker></defs>' + edges.join('') + '<path id="grTmp" class="gr-edge tmp" d=""/></svg>' + nodes.map(node).join('') + '</div></div>'
        : '<div class="q-empty"><strong>Noch keine Abhängigkeiten.</strong><span>Verknüpfe Aufgaben im Detailpanel unter Abhängigkeiten oder mit works link A blocked-by B. Dann zeigt diese Ansicht, was worauf wartet.</span></div>') +
      '</section><aside class="q-side">' +
      (critSet.size ? '<div class="q-card crit"><small>Kritischer Pfad</small><strong>' + crit.map(esc).join(', ') + '</strong><span>Zusammen etwa ' + days + ' Tage nach der Schätzung. Verzögert sich eine davon, verschiebt sich das Ende.</span></div>' : '') +
      (lever ? '<div class="q-card"><small>Größter Hebel</small><button class="q-title" data-open="' + esc(lever.t.id) + '"><strong>' + esc(lever.t.id + ' ' + lever.t.title) + '</strong></button><span>Erledigt, gibt sie ' + lever.n + (lever.n === 1 ? ' Aufgabe' : ' Aufgaben') + ' frei.</span>' + (EDIT && !(meta.queue || []).includes(lever.t.id) && lever.t.status !== 'in-arbeit' ? '<button class="btn small" data-qfront="' + esc(lever.t.id) + '">In der Warteschlange nach vorn</button>' : '') + '</div>' : '') +
      '<div class="q-card gr-legend"><span><i class="lg-hot"></i>kritischer Pfad</span><span><i class="lg-edge"></i>blockiert durch</span>' + (EDIT ? '<span class="muted">Das + an einer Karte auf eine andere ziehen legt eine Abhängigkeit an.</span>' : '') + '</div>' +
      '</aside></div>';
    $('#grDone', box).onchange = (e) => { store.set('works-graph-done', e.target.checked); renderGraph(); };
    $$('[data-open]', box).forEach((b) => b.onclick = () => openTask(b.dataset.open));
    $$('[data-qfront]', box).forEach((b) => b.onclick = () => run(() => act('queueAdd', { id: b.dataset.qfront, pos: 1 }), b.dataset.qfront + ' steht vorn in der Warteschlange'));
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
        if (dst && dst.dataset.node !== src) run(() => act('link', { id: src, rel: 'blocks', target: dst.dataset.node }), src + ' blockiert jetzt ' + dst.dataset.node);
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
    box.innerHTML = '<span class="sv-label">Ansichten</span>' +
      '<button class="sv-chip" data-svall aria-pressed="' + (!filtersActive()) + '">Alles</button>' +
      views.map((v, i) => {
        const n = withFilter(v.filter || {}, () => tasks.filter((t) => match(t) && OPEN.includes(t.status)).length);
        const on = sameFilter(v.filter || {}, cur) && (v.view || 'board') === state.view;
        return '<span class="sv-wrap"><button class="sv-chip" data-sv="' + i + '" aria-pressed="' + on + '" title="' + esc(describeFilter(v)) + '">' + esc(v.name) + ' <span class="sv-n num">' + n + '</span></button>' + (EDIT ? '<button class="sv-x" data-svdel="' + i + '" aria-label="Ansicht ' + esc(v.name) + ' löschen" title="Löschen">×</button>' : '') + '</span>';
      }).join('') +
      (EDIT && filtersActive() && !views.some((v) => sameFilter(v.filter || {}, cur)) ? '<button class="sv-chip add" id="svSave">Aktuelle Filter speichern</button>' : '');
    $('[data-svall]', box).onclick = () => resetFilters();
    $$('[data-sv]', box).forEach((b) => b.onclick = () => applySavedView(views[+b.dataset.sv]));
    $$('[data-svdel]', box).forEach((b) => b.onclick = async () => { const v = views[+b.dataset.svdel]; if (await confirmBox({ title: 'Ansicht löschen', lead: 'Die Ansicht „' + v.name + '“ wird entfernt. Die Aufgaben bleiben unverändert.', confirm: 'Löschen', danger: true })) run(() => act('viewDelete', { name: v.name }), 'Ansicht gelöscht'); });
    const sv = $('#svSave', box);
    if (sv) sv.onclick = saveViewDialog;
  }

  function describeFilter(v) {
    const f = v.filter || {};
    const p = [];
    if (f.prios && f.prios.length && f.prios.length < 4) p.push(f.prios.join(' und '));
    if (f.type) p.push(meta.typeLabel[f.type] || f.type);
    if (f.tag) p.push('#' + f.tag);
    if (f.ms) p.push('Meilenstein ' + f.ms);
    if (f.signal) p.push({ blocked: 'nur blockierte', unblocked: 'ohne blockierte', overdue: 'überfällig', questions: 'mit offenen Fragen', incomplete: 'unvollständig' }[f.signal] || f.signal);
    if (f.q) p.push('Suche „' + f.q + '“');
    if (v.view && v.view !== 'board') p.push('Ansicht ' + (VIEW_LABEL[v.view] || v.view));
    if (v.sort) p.push('sortiert nach ' + v.sort.key);
    return p.join(', ') || 'alle Aufgaben';
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
    const r = await showDialog('<h2>Ansicht speichern</h2><label class="field"><span>Name</span><input class="input" name="name" required maxlength="40" placeholder="Zum Beispiel Bot dringend" autofocus></label>' +
      '<div class="field"><span>Wird gespeichert</span><p class="lead" style="margin:0">' + esc(describeFilter({ filter: f, view: state.view, sort: state.view === 'table' ? tableSort : null })) + '</p></div>' +
      (!f.signal ? '<label class="toggle"><input type="checkbox" name="unblocked"> Blockierte ausblenden</label>' : '') +
      '<label class="toggle"><input type="checkbox" name="def"> Beim Öffnen des Boards diese Ansicht zeigen (nur in diesem Browser)</label>' +
      '<p class="sublabel">Ansichten gelten für das ganze Projekt und stehen in .works/config.json. Claude kann sie mit works list --view "Name" nutzen.</p>' + foot('Speichern'),
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
  const NDEF = { on: false, review: true, question: true, p1: true, unblocked: false, queueEmpty: true, any: false, sound: true, title: true };
  let notifySet = { ...NDEF, ...store.get(NKEY, {}) };
  let hiddenCount = 0;
  const baseTitle = () => 'Works ' + meta.project;
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
      if (!o) { if (s.p1 && t.priority === 'P1' && !own) ev.push({ id: t.id, title: 'Neue P1: ' + t.id, body: t.title }); continue; }
      if (own && !(t.comments > o.comments && t.lastCommentBy === 'Claude')) continue;
      if (s.review && o.status !== 'review' && t.status === 'review') ev.push({ id: t.id, title: t.id + ' wartet auf dein Review', body: t.title + (t.crit[1] ? ', ' + t.crit[0] + ' von ' + t.crit[1] + ' Kriterien erfüllt' : '') });
      else if (s.any && o.status !== t.status) ev.push({ id: t.id, title: t.id + ': ' + L(o.status) + ' → ' + L(t.status), body: t.title });
      if (s.question && t.questions.length > o.questions.length) ev.push({ id: t.id, title: 'Frage zu ' + t.id, body: t.questions[t.questions.length - 1] });
      if (s.question && t.comments > o.comments && t.lastCommentBy === 'Claude') ev.push({ id: t.id, title: 'Claude hat ' + t.id + ' kommentiert', body: t.title });
      if (s.question && t.design && t.design.variants > ((o.design && o.design.variants) || 0)) ev.push({ id: t.id, title: 'Neue Entwürfe für ' + t.id, body: t.title });
      if (s.p1 && o.priority !== 'P1' && t.priority === 'P1') ev.push({ id: t.id, title: t.id + ' ist jetzt P1', body: t.title });
      if (s.unblocked && o.blocked && !t.blocked && OPEN.includes(t.status)) ev.push({ id: t.id, title: t.id + ' ist jetzt startbar', body: t.title });
    }
    if (s.queueEmpty && (meta.queue || []).length && !(next.meta.queue || []).length) ev.push({ id: '', title: 'Warteschlange leer', body: 'Claude hat alle eingereihten Aufgaben abgearbeitet.' });
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
    if (!('Notification' in window)) return fail(new Error('Dieser Browser unterstützt keine Benachrichtigungen.'));
    if (Notification.permission !== 'granted') await Notification.requestPermission();
    if (Notification.permission !== 'granted') return fail(new Error('Benachrichtigungen sind im Browser blockiert. In den Seiteneinstellungen erlauben.'));
    new Notification('works ' + meta.project, { body: 'So sieht eine Meldung aus. Ein Klick öffnet das Board.' });
    if (notifySet.sound) beep();
  }

  // ---------- Werkzeuge: Bericht, Vorlagen, Prüfungen, Benachrichtigungen ----------

  async function renderTools(body, head) {
    const [rep, tpls, chk] = await Promise.all([
      api('GET', 'api/reports').catch(() => null), api('GET', 'api/templates').catch(() => []), EDIT ? api('GET', 'api/checks').catch(() => null) : Promise.resolve(null),
    ]);
    const theme = store.get('works-theme', 'auto');
    const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    const days = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    const sw = (key, label, on, attrs = '') => '<label class="switch small"><span><b>' + esc(label) + '</b></span><input type="checkbox" ' + attrs + (on ? ' checked' : '') + (EDIT ? '' : ' disabled') + ' data-k="' + key + '"><i aria-hidden="true"></i></label>';
    const s = rep ? rep.settings : null;
    const h = [head('Werkzeuge')];
    if (rep) {
      h.push('<details class="sec" open><summary>Wochenbericht</summary><div class="body">' +
        '<p class="md">Zahlen und Listen aus den Aufgaben, die Zusammenfassung schreibt Claude. Ist ein Bericht fällig, erinnert der Hook beim nächsten Sitzungsstart daran.</p>' +
        (EDIT ? '<div id="repSet">' + sw('enabled', 'Automatisch jede Woche', s.enabled) +
          '<div class="row-btns"><select class="input" data-k="weekday" style="flex:1">' + days.slice(1).map((d, i) => '<option value="' + (i + 1) + '"' + (s.weekday === i + 1 ? ' selected' : '') + '>' + d + 's</option>').join('') + '</select><input type="time" class="input" data-k="time" value="' + esc(s.time) + '" style="flex:0 0 120px"></div>' +
          sw('file', 'Datei in .works/reports', s.destinations.file) + sw('discord', 'An Discord senden', s.destinations.discord) +
          '<div class="add-row"><input class="input" id="hookIn" type="url" placeholder="' + (rep.webhook ? 'Webhook hinterlegt, zum Ändern neue URL eingeben' : 'Discord-Webhook-URL') + '" autocomplete="off"><button class="btn small" id="hookSave">' + (rep.webhook ? 'Ersetzen' : 'Speichern') + '</button>' + (rep.webhook ? '<button class="btn small ghost" id="hookDel">Entfernen</button>' : '') + '</div>' +
          '<p class="sublabel">Die URL bleibt nur auf diesem Rechner (.works/report.local.json, nicht im Git).</p>' +
          sw('done', 'Erledigt und begonnen', s.include.done) + sw('attention', 'Was dich braucht', s.include.attention) + sw('next', 'Plan für nächste Woche', s.include.next) + sw('milestones', 'Meilensteine', s.include.milestones) + '</div>' +
          '<label class="field"><span>Zusammenfassung, optional</span><textarea class="input" id="repSum" rows="2" placeholder="Ohne Text entsteht eine kurze Zusammenfassung aus den Zahlen."></textarea></label><div class="row-btns"><button class="btn small primary" id="repRun">Bericht für ' + esc(rep.current.replace('-', ', ')) + ' erzeugen</button></div>' : '') +
        (rep.reports.length ? '<ul class="rep-list">' + rep.reports.map((r) => '<li><span>' + esc(r.name.replace('-', ', ')) + '</span>' + (r.html ? '<a href="' + esc(r.html) + '#theme=' + (dark ? 'dark' : 'light') + '" target="_blank" rel="noopener">Ansehen</a>' : '') + (r.md ? '<a href="' + esc(r.md) + '" target="_blank" rel="noopener">Markdown</a>' : '') + '</li>').join('') + '</ul>' : '<p class="md empty-md">Noch keine Berichte.</p>') +
        '</div></details>');
    }
    if (EDIT) {
      h.push('<details class="sec" open><summary>Vorlagen <span class="meta">' + tpls.length + '</span></summary><div class="body">' +
        (tpls.length ? tpls.map((t) => '<div class="tpl-row"><div class="q-t"><strong>' + esc(t.name) + '</strong><span class="q-meta">' + esc((meta.typeLabel[t.type] || t.type) + ', ' + t.fields.length + ' Felder, ' + t.criteria.length + ' Kriterien' + (t.uses ? ', ' + t.uses + 'x benutzt' : '') + (t.scope === 'user' ? ', alle Projekte' : '')) + '</span></div><button class="btn small" data-tuse="' + esc(t.slug) + '">Nutzen</button><button class="btn small ghost" data-tedit="' + esc(t.slug) + '">Bearbeiten</button></div>').join('') : '<p class="md empty-md">Noch keine Vorlagen. Erstelle eine neue oder speichere eine bestehende Aufgabe im Detailpanel als Vorlage.</p>') +
        '<div class="row-btns"><button class="btn small primary" id="tplNew">Neue Vorlage</button></div></div></details>');
    }
    if (chk) {
      const rows = Object.entries(chk.checks);
      h.push('<details class="sec"' + (rows.length ? '' : ' open') + '><summary>Prüfungen vor dem Abschluss <span class="meta">' + rows.length + '</span></summary><div class="body">' +
        '<p class="md">Laufen bei works done und im Abschluss-Dialog. Rot verhindert das Abschließen, ein Fund braucht deine Entscheidung. <code>skill:code-audit</code> führt Claude aus und trägt das Ergebnis ein.</p>' +
        '<div id="ckRows">' + (rows.length ? rows : Object.entries(chk.detected)).map(([k, v]) => ckRow(k, v)).join('') + '</div>' +
        (!rows.length ? '<p class="sublabel">Vorschlag aus deinem Projekt. Erst mit Speichern aktiv.</p>' : '') +
        '<div class="row-btns"><button class="btn small" id="ckAdd">Prüfung hinzufügen</button><button class="btn small primary" id="ckSave">Speichern</button></div></div></details>');
    }
    h.push(await toolsExtra());
    h.push('<details class="sec"><summary>Benachrichtigungen <span class="meta">' + (notifySet.on ? 'an' : 'aus') + '</span></summary><div class="body" id="ntSet">' +
      '<p class="md">Meldet sich, wenn der Tab im Hintergrund ist. Gilt nur in diesem Browser.</p>' +
      [['on', 'Benachrichtigungen an'], ['review', 'Aufgabe kommt in Review'], ['question', 'Frage oder Kommentar von Claude'], ['p1', 'Neue Aufgabe mit P1'], ['unblocked', 'Blockade aufgelöst'], ['queueEmpty', 'Warteschlange leer gelaufen'], ['any', 'Jede Statusänderung'], ['sound', 'Ton abspielen'], ['title', 'Zähler im Tab-Titel']].map(([k, l]) => '<label class="switch small"><span><b>' + l + '</b></span><input type="checkbox" data-n="' + k + '"' + (notifySet[k] ? ' checked' : '') + '><i aria-hidden="true"></i></label>').join('') +
      '<div class="row-btns"><button class="btn small" id="ntTest">Testmeldung senden</button></div></div></details>');
    body.innerHTML = h.join('');
    $$('[data-sclose]', body).forEach((b) => b.onclick = closeSide);
    $$('#ntSet [data-n]', body).forEach((c) => c.onchange = async () => {
      notifySet = { ...notifySet, [c.dataset.n]: c.checked };
      store.set(NKEY, notifySet);
      if (c.dataset.n === 'on' && c.checked && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    });
    $('#ntTest', body).onclick = testNotification;
    bindToolsExtra(body);
    if (!EDIT) return;
    $$('#repSet [data-k]', body).forEach((el) => el.onchange = () => {
      const k = el.dataset.k;
      const v = el.type === 'checkbox' ? el.checked : el.value;
      run(() => act('reportSettings', { [k]: v }), 'Gespeichert');
    });
    const hs = $('#hookSave', body);
    if (hs) hs.onclick = async () => { const url = $('#hookIn', body).value.trim(); if (url && await run(() => act('reportWebhook', { url }), 'Webhook gespeichert')) renderSide(); };
    const hd = $('#hookDel', body);
    if (hd) hd.onclick = async () => { if (await run(() => act('reportWebhook', { url: '' }), 'Webhook entfernt')) renderSide(); };
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
        $$('.ck-edit', ckBox).forEach((r) => { const k = $('[data-ckk]', r).value.trim(); const v = $('[data-ckv]', r).value.trim(); if (k && v) checks[k] = v; });
        if (await run(() => act('checksSave', { checks }), (x) => x.message)) renderSide();
      };
    }
  }

  const ckRow = (k, v) => '<div class="ck-edit add-row"><input class="input mono" data-ckk value="' + esc(k) + '" placeholder="name" style="flex:0 0 110px" maxlength="30" aria-label="Name"><input class="input mono" data-ckv value="' + esc(v) + '" placeholder="Befehl, etwa npm test" maxlength="300" aria-label="Befehl"><button class="btn small ghost icon" data-ckrm aria-label="Entfernen">×</button></div>';

  // ---------- Vorlagen nutzen und bearbeiten ----------

  async function pickTemplate(tpls, prefill = {}, preselect = '') {
    let sel = preselect && tpls.some((t) => t.slug === preselect) ? preselect : tpls[0].slug;
    let titleTouched = false;
    const fillT = (text, vals) => String(text || '').replace(/\{([\p{L}\p{N}_]{1,30})\}/gu, (a, k) => vals[k] || a);
    const pane = (t) => '<label class="field"><span>Titel</span><input class="input" name="title" maxlength="160" value="' + esc(fillT(t.title, {}) || t.name) + '" data-ttl></label>' +
      '<div class="tp-tags"><span class="tag">' + esc(meta.typeLabel[t.type] || t.type) + '</span>' + (t.effort ? '<span class="tag">Aufwand ' + esc(t.effort) + '</span>' : '') + t.tags.map((x) => '<span class="tag">#' + esc(x) + '</span>').join('') + '</div>' +
      (t.fields.length ? '<div class="grid">' + t.fields.map((f) => '<label class="field span2"><span>' + esc(f.key) + (f.required ? ' *' : '') + (f.hint ? ' <span class="sublabel">' + esc(f.hint) + '</span>' : '') + '</span>' + (f.kind === 'choice' ? '<select name="f_' + esc(f.key) + '" data-fk="' + esc(f.key) + '"' + (f.required ? ' required' : '') + '><option value="">Wählen</option>' + f.options.map((o) => '<option>' + esc(o) + '</option>').join('') + '</select>' : '<input class="input" name="f_' + esc(f.key) + '" data-fk="' + esc(f.key) + '" maxlength="300"' + (f.required ? ' required' : '') + '>') + '</label>').join('') + '</div>' : '') +
      '<label class="field"><span>Was genau soll passieren?</span><textarea class="input" name="text" rows="5" placeholder="Beschreibe in eigenen Worten, was diese Aufgabe erreichen soll. Hat Vorrang vor dem Grundtext der Vorlage."></textarea><span class="sublabel">Landet zusammen mit den Feldern in der Beschreibung. Claude liest sie als Vorgabe von dir.</span></label>' +
      (t.criteria.length ? '<div class="field"><span>Akzeptanzkriterien aus der Vorlage</span><ul class="dod">' + t.criteria.map((c, i) => '<li><label><input type="checkbox" name="c_' + i + '"' + (c.mode !== 'optional' ? ' checked' : '') + (c.mode === 'always' ? ' disabled' : '') + '><span>' + esc(c.text) + (c.mode === 'always' ? ' <span class="sublabel">immer</span>' : '') + '</span></label></li>').join('') + '</ul></div>' : '') +
      '<div class="grid"><div class="field span2"><span>Priorität</span>' + segCtl('priority', PRIOS.map((p) => ({ id: p, label: p, dot: prioVar(p) })), t.priority) + '</div><div class="field span2"><span>Spalte</span>' + segCtl('status', [{ id: 'backlog', label: 'Backlog' }, { id: 'geplant', label: 'Geplant' }], prefill.status || 'backlog') + '</div></div>';
    const html = '<h2>Neue Aufgabe</h2><div class="tp"><nav class="tp-list" aria-label="Vorlagen"><button type="button" class="tp-item" data-tp="">Leer<span>ohne Vorlage</span></button>' +
      tpls.map((t) => '<button type="button" class="tp-item" data-tp="' + esc(t.slug) + '" aria-pressed="' + (t.slug === sel) + '">' + esc(t.name) + '<span>' + esc((meta.typeLabel[t.type] || t.type) + ', ' + t.criteria.length + ' Kriterien' + (t.uses ? ', ' + t.uses + 'x' : '')) + '</span></button>').join('') +
      '<button type="button" class="tp-item new" data-tpnew>Eigene Vorlage erstellen</button></nav><div class="tp-pane" id="tpPane"></div></div>' + foot('Aufgabe anlegen');
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
    const opt = (list, cur, lab) => list.map((v) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(lab ? lab(v) : v || 'offen') + '</option>').join('');
    const fieldRow = (f) => '<div class="te-field"><span class="grip" aria-hidden="true">⋮⋮</span><input class="input mono" data-fkey value="' + esc(f.key || '') + '" placeholder="Name" maxlength="30" aria-label="Feldname"><select class="input" data-fkind aria-label="Art"><option value="text"' + (f.kind !== 'choice' ? ' selected' : '') + '>Text</option><option value="choice"' + (f.kind === 'choice' ? ' selected' : '') + '>Auswahl</option></select><input class="input" data-fopts value="' + esc((f.options || []).join(', ')) + '" placeholder="Optionen, mit Komma" ' + (f.kind === 'choice' ? '' : 'hidden') + ' aria-label="Optionen"><label class="toggle"><input type="checkbox" data-freq' + (f.required ? ' checked' : '') + '> Pflicht</label><button type="button" class="btn small ghost icon" data-frm aria-label="Feld entfernen">×</button></div>';
    const critRow = (c) => '<div class="te-crit"><input class="input" data-ctext value="' + esc(c.text || '') + '" placeholder="Prüfbar mit ja oder nein, Felder als {Name}" maxlength="300" aria-label="Kriterium"><select class="input" data-cmode aria-label="Art"><option value="always"' + (c.mode === 'always' ? ' selected' : '') + '>immer</option><option value="default"' + (c.mode === 'default' ? ' selected' : '') + '>vorausgewählt</option><option value="optional"' + (c.mode === 'optional' ? ' selected' : '') + '>optional</option></select><button type="button" class="btn small ghost icon" data-crm aria-label="Kriterium entfernen">×</button></div>';
    const html = '<h2>' + (slug ? 'Vorlage bearbeiten' : 'Eigene Vorlage erstellen') + '</h2>' +
      '<div class="grid"><label class="field span2"><span>Name der Vorlage</span><input class="input" name="name" required maxlength="80" value="' + esc(tpl.name) + '" autofocus></label><label class="field span2"><span>Titel der Aufgabe, Felder als {Name}</span><input class="input mono" name="title" maxlength="160" value="' + esc(tpl.title) + '" placeholder="Dashboard: {Seite}"></label>' +
      '<label class="field"><span>Typ</span><select name="type">' + opt(Object.keys(meta.typeLabel), tpl.type, (v) => meta.typeLabel[v]) + '</select></label><label class="field"><span>Priorität</span><select name="priority">' + opt(PRIOS, tpl.priority) + '</select></label><label class="field"><span>Aufwand</span><select name="effort">' + opt(['', 'S', 'M', 'L', 'XL'], tpl.effort) + '</select></label><label class="field"><span>Tags</span><input class="input" name="tags" value="' + esc(tpl.tags.join(', ')) + '"></label></div>' +
      '<label class="field"><span>Kurzbeschreibung, optional</span><input class="input" name="about" maxlength="200" value="' + esc(tpl.about || '') + '" placeholder="Wofür ist die Vorlage gedacht?"></label>' +
      '<div class="field"><span>Felder beim Anlegen</span><div id="teFields">' + tpl.fields.map(fieldRow).join('') + '</div><div class="row-btns"><button type="button" class="btn small" id="teFieldAdd">Feld hinzufügen</button></div></div>' +
      '<label class="field"><span>Grundtext der Beschreibung</span><textarea class="input mono" name="description" rows="5" placeholder="Felder mit {Name} einsetzen. Beim Anlegen kommt ein freies Feld „Was genau soll passieren?“ dazu, das Vorrang hat.">' + esc(tpl.description) + '</textarea></label>' +
      '<div class="field"><span>Akzeptanzkriterien</span><div id="teCrit">' + tpl.criteria.map(critRow).join('') + '</div><div class="row-btns"><button type="button" class="btn small" id="teCritAdd">Kriterium hinzufügen</button></div></div>' +
      '<label class="field"><span>Hinweise für Claude, optional</span><textarea class="input" name="hints" rows="2" maxlength="2000" placeholder="Etwa: vorher das UI UX Pro Max Skill nutzen">' + esc(tpl.hints || '') + '</textarea></label>' +
      '<div class="field"><span>Speichern für</span>' + segCtl('scope', [{ id: 'project', label: 'Dieses Projekt' }, { id: 'user', label: 'Alle meine Projekte' }], scope) + '</div>' +
      foot('Vorlage speichern', { extra: slug ? '<button type="button" class="btn danger" id="teDel" style="margin-right:auto">Löschen</button>' : '' });
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
      if (del) del.onclick = async () => { if (!confirm('Vorlage „' + tpl.name + '“ löschen?')) return; if (await run(() => act('templateDelete', { slug }), 'Vorlage gelöscht')) { $('button[value="cancel"]', f).click(); if (side === 'tools') renderSide(); } };
      bind();
    });
    if (r) { ok(r.message); if (side === 'tools') renderSide(); }
  }

  // ---------- Runde 3: Hilfen ----------

  const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' Mio' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n || 0));
  const fmtMoney = (v, cur) => (v > 0 && v < 0.1 ? v.toFixed(3) : (v || 0).toFixed(2)).replace('.', ',') + ' ' + (!cur || cur === 'USD' ? '$' : cur);
  const timeOf = (iso) => { try { return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

  function undoToast(msg, key) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast undo';
    el.innerHTML = '<div class="row"><div class="what">' + esc(msg) + '</div><button class="btn small" type="button">Rückgängig</button></div><span class="ut"><i></i></span>';
    $('button', el).onclick = async (e) => { e.stopPropagation(); el.remove(); await run(() => act('undo', { key }), (x) => x.message); };
    el.onclick = () => el.remove();
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 8000);
  }

  // ---------- Claude arbeitet gerade ----------

  function liveBlock(t) {
    const a = meta.activity;
    if (!a || !a.busy || !a.current || a.current.task !== t.id || t.status !== 'in-arbeit') return '';
    if (Date.now() - Date.parse(a.current.at) > 10 * 60000) return '';
    const plan = t.plan || null;
    const recent = (a.recent || []).filter((r) => r.task === t.id).slice(1, 4);
    const pend = (meta.instructions || []).filter((x) => x.task === t.id).length;
    return '<div class="live-box"><span class="lb-head"><i class="lb-dot" aria-hidden="true"></i>' + esc(a.current.verb) + (a.current.what ? ' <code>' + esc(a.current.what) + '</code>' : '') + '</span>' +
      (recent.length ? '<ol class="lb-list">' + recent.map((r) => '<li><span class="muted num">' + esc(timeOf(r.at)) + '</span> ' + esc(r.verb) + ' <span class="mono">' + esc(r.what) + '</span>' + (r.ok === false ? ' <span class="late">Fehler</span>' : '') + '</li>').join('') + '</ol>' : '') +
      (EDIT ? '<button class="btn small" data-instr="' + esc(t.id) + '">Anweisung an Claude' + (pend ? ' (' + pend + ' wartet)' : '') + '</button>' : '') + '</div>';
  }

  function instructBox(id) {
    const pend = (meta.instructions || []).filter((x) => x.task === id);
    return '<div class="block instr"><div class="block-head"><h3>Anweisung an Claude</h3><span class="meta">Claude liest sie, sobald es sinnvoll ist, meist nach dem aktuellen Schritt</span></div>' +
      (pend.length ? '<ul class="instr-list">' + pend.map((x) => '<li><span class="muted num">' + esc(x.at.slice(11, 16)) + '</span> ' + esc(x.text) + ' <span class="tag">wartet</span></li>').join('') + '</ul>' : '') +
      '<div class="add-row"><input class="input" data-instr-in="' + esc(id) + '" maxlength="4000" placeholder="Zum Beispiel: Bitte auch Threads in Forenkanälen mitsichern"><button class="btn small primary" data-instr-send="' + esc(id) + '">Senden</button></div></div>';
  }

  async function sendInstruction(id, text) {
    if (!text.trim()) return false;
    return !!(await run(() => act('instruct', { id, text }), (x) => x.message));
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-instr]');
    if (b) {
      e.preventDefault(); e.stopPropagation();
      const text = await askText({ title: 'Anweisung an Claude', lead: b.dataset.instr + ': Claude liest sie, sobald es sinnvoll ist, meist nach dem aktuellen Schritt. Sie bleibt als Kommentar an der Aufgabe.', label: 'Anweisung', confirm: 'Senden', required: true, multiline: true });
      if (text) sendInstruction(b.dataset.instr, text);
      return;
    }
    const s = e.target.closest('[data-instr-send]');
    if (s) {
      const inp = $('[data-instr-in="' + CSS.escape(s.dataset.instrSend) + '"]');
      if (inp && await sendInstruction(s.dataset.instrSend, inp.value)) inp.value = '';
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    const inp = e.target.closest && e.target.closest('[data-instr-in]');
    if (inp && e.key === 'Enter') { e.preventDefault(); sendInstruction(inp.dataset.instrIn, inp.value).then((okk) => { if (okk) inp.value = ''; }); }
  });

  // ---------- Entwürfe ----------

  function designHtml(d) {
    const g = d.design;
    if (!g) {
      return '<div class="q-empty"><strong>Noch keine Entwürfe.</strong><span>Bei Gestaltungsaufgaben nutzt Claude UI UX Pro Max und das Superpowers Brainstorming, wenn sie installiert sind, und hängt Designrichtung, Varianten und Ergebnisse hier an. Du wählst dann eine Variante, bevor Claude umsetzt.</span></div>';
    }
    const badge = (src) => (src ? '<span class="src-badge ' + (/brain|superpower/i.test(src) ? 'bs' : 'ux') + '">' + esc(/brain|superpower/i.test(src) ? 'Superpowers' : /ui-?ux/i.test(src) ? 'UI UX Pro Max' : src) + '</span>' : '');
    const h = [];
    if (g.direction) {
      const dir = g.direction;
      h.push('<div class="block"><div class="block-head"><h3>Designrichtung</h3>' + badge(dir.source) + '<span class="meta">' + esc(dir.at || '') + '</span></div>' +
        '<div class="dz-dir">' + (dir.colors.length ? '<div class="dz-card"><small>Farben</small><div class="sw">' + dir.colors.map((c) => '<span title="' + esc((c.name ? c.name + ' ' : '') + c.hex) + '"><i style="background:' + esc(c.hex) + '"></i>' + esc(c.name || c.hex) + '</span>').join('') + '</div></div>' : '') +
        (dir.fonts.length ? '<div class="dz-card"><small>Schrift</small><strong>' + esc(dir.fonts[0]) + '</strong>' + (dir.fonts[1] ? '<span class="muted">' + esc(dir.fonts.slice(1).join(', ')) + ' für Fließtext</span>' : '') + '</div>' : '') + '</div>' +
        (dir.text ? '<details class="sec"' + (dir.colors.length ? '' : ' open') + '><summary>Stil und Regeln</summary><div class="body"><div class="md">' + md(dir.text) + '</div></div></details>' : '') + '</div>');
    }
    if (g.variants.length) {
      h.push('<div class="block"><div class="block-head"><h3>Varianten</h3><span class="meta">' + g.variants.length + (g.chosen ? ', gewählt: ' + esc(g.chosen.name) : ', noch keine gewählt') + '</span></div><div class="dz-grid">' +
        g.variants.map((v) => {
          const chosen = g.chosen && g.chosen.name === v.name;
          const prev = v.kind === 'html' ? (LIVE ? '<div class="dz-frame dz-wrap"><iframe src="' + esc(v.src) + '" sandbox="allow-scripts" loading="lazy" tabindex="-1" title="Mockup ' + esc(v.name) + '"></iframe></div>' : '<div class="dz-frame dz-none">HTML-Mockup, nur im Live-Board</div>') : v.kind === 'image' ? '<img class="dz-frame" src="' + esc(v.src) + '" alt="Mockup ' + esc(v.name + ' ' + v.title) + '" loading="lazy">' : '<div class="dz-frame dz-none">' + esc(v.file) + '</div>';
          return '<figure class="dz-var' + (chosen ? ' chosen' : '') + '">' + prev + '<figcaption><strong>' + esc(v.name + ' ' + v.title) + '</strong>' + (v.note ? '<span class="muted">' + esc(v.note) + '</span>' : '') + '</figcaption><div class="row-btns">' +
            (v.src && LIVE ? '<a class="btn small ghost" href="' + esc(v.src) + '" target="_blank" rel="noopener">Groß ansehen</a>' : '') +
            (chosen ? '<span class="tag q-tag">Gewählt ' + esc((g.chosen.at || '').slice(0, 10)) + '</span>' : EDIT ? '<button class="btn small" data-dzpick="' + esc(v.name) + '">Diese nehmen</button>' : '') + '</div></figure>';
        }).join('') + '</div>' + (g.chosen && g.chosen.reason ? '<p class="sublabel">Grund: ' + esc(g.chosen.reason) + '</p>' : '') + '</div>');
    }
    for (const b of g.brainstorm) {
      h.push('<div class="block"><div class="block-head"><h3>' + esc(b.title || 'Brainstorming') + '</h3>' + badge(b.source) + '<span class="meta">' + esc(b.at || '') + '</span></div><div class="md dz-bs">' + md(String(b.text || '').replace(/^#\s+[^\n]*\n+/, '')) + '</div></div>');
    }
    return '<div class="dz">' + h.join('') + '</div>';
  }

  function bindDesign(id) {
    scaleFrames();
    $$('[data-dzpick]').forEach((b) => b.onclick = async () => {
      const reason = await askText({ title: 'Variante ' + b.dataset.dzpick + ' nehmen', lead: 'Claude setzt danach diese Variante um. Die Wahl landet in decisions.md.', label: 'Grund, optional', confirm: 'Diese nehmen' });
      if (reason === null) return;
      run(() => act('designChoose', { id, name: b.dataset.dzpick, reason }), (x) => x.message);
    });
  }

  // HTML-Mockups in Desktopbreite rendern und verkleinert zeigen.
  const FRAME_W = 1024;
  const frameRO = 'ResizeObserver' in window ? new ResizeObserver((list) => list.forEach((e) => fitFrame(e.target))) : null;
  function fitFrame(w) { const f = w.firstElementChild; if (!f) return; const k = w.clientWidth / FRAME_W; f.style.transform = 'scale(' + k + ')'; f.style.height = (w.clientHeight / k) + 'px'; }
  function scaleFrames(root) { $$('.dz-wrap', root).forEach((w) => { fitFrame(w); if (frameRO) frameRO.observe(w); }); }

  // ---------- Abnahme im Review ----------

  async function openReview(id) {
    let d;
    try { d = detail && detail.task.id === id ? detail : await api('GET', 'api/task?id=' + encodeURIComponent(id)); } catch (e) { return fail(e); }
    const crit = (d.checklists.find((c) => c.name === 'Akzeptanzkriterien') || { items: [] }).items;
    const imgs = d.assets.filter((a) => a.image);
    const byKind = (k) => imgs.filter((a) => a.kind === k).pop();
    const after = byKind('nachher') || byKind('ist') || imgs[imgs.length - 1];
    const before = byKind('vorher');
    const chosen = d.design && d.design.chosen ? d.design.variants.find((v) => v.name === d.design.chosen.name) : null;
    const modes = [];
    if (chosen) modes.push({ id: 'mock', label: 'Entwurf ' + chosen.name + ' gegen Ergebnis', left: { label: 'Entwurf ' + chosen.name + ' aus UI UX Pro Max', v: chosen }, right: after });
    if (before && after) modes.push({ id: 'ba', label: 'Vorher gegen Nachher', left: { label: 'Vorher', a: before }, right: after });
    if (!modes.length && after) modes.push({ id: 'one', label: 'Ergebnis', left: null, right: after });
    const pane = (x) => (!x ? '' : x.v ? '<figure class="rv-fig"><figcaption>' + esc(x.label) + '</figcaption>' + (x.v.kind === 'html' ? '<div class="rv-img dz-wrap"><iframe src="' + esc(x.v.src) + '" sandbox="allow-scripts" tabindex="-1" title="Entwurf"></iframe></div>' : '<img class="rv-img" src="' + esc(x.v.src) + '" alt="Entwurf">') + '</figure>'
      : '<figure class="rv-fig"><figcaption>' + esc(x.label) + '</figcaption><img class="rv-img" src="' + esc(x.a.src) + '" alt="' + esc(x.a.desc || x.a.alt) + '"></figure>');
    const compare = (m) => '<div class="rv-cmp">' + (m.left ? pane(m.left) : '') + (m.right ? pane({ label: 'Ergebnis' + (m.right.desc ? ': ' + m.right.desc : ''), a: m.right }) : '<div class="q-empty">Noch kein Screenshot vom Ergebnis. Claude legt ihn mit works asset --kind nachher ab.</div>') + '</div>';
    const html = '<h2>' + esc(id) + ' abnehmen</h2><p class="lead">' + esc(d.task.title) + '</p>' +
      (modes.length > 1 ? '<div class="row-btns" id="rvModes">' + modes.map((m, i) => '<button type="button" class="sv-chip" data-rvm="' + i + '" aria-pressed="' + (i === 0) + '">' + esc(m.label) + '</button>').join('') + '</div>' : '') +
      '<div id="rvCmp">' + (modes.length ? compare(modes[0]) : '<div class="q-empty">Keine Bilder. Prüfe das Ergebnis direkt in der Anwendung.</div>') + '</div>' +
      '<div class="rv-bottom"><div class="field"><span>Gegenprüfen</span><ul class="dod">' + (crit.length ? crit.map((c) => '<li><label><input type="checkbox" class="rvc" data-n="' + c.n + '"' + (c.done ? ' checked' : '') + '><span>' + esc(c.text) + (c.done ? ' <span class="sublabel">Claude: erfüllt</span>' : '') + '</span></label></li>').join('') : '<li>Keine Kriterien.</li>') + '</ul></div>' +
      '<label class="field"><span>Was fehlt oder stört? Pflicht beim Zurückgeben</span><textarea class="input" name="text" rows="4" placeholder="Beschreibe, was nicht passt. Claude bekommt den Text als Kommentar."></textarea></label></div>' +
      '<p class="err" role="alert"></p><div class="foot"><button class="btn" value="cancel" formnovalidate>Abbrechen</button><button class="btn warn" value="reject">Zurück an Claude</button><button class="btn ok" value="accept">Annehmen und abschließen</button></div>';
    const r = await showDialog(html, async (fd, sub) => {
      if (sub === 'accept') return 'accept';
      const text = String(fd.get('text') || '').trim();
      if (!text) throw new Error('Bitte kurz beschreiben, was fehlt.');
      const uncheck = $$('.rvc', form).filter((c) => !c.checked && crit.find((x) => x.n === +c.dataset.n && x.done)).map((c) => +c.dataset.n);
      return act('review', { id, text, uncheck });
    }, (f) => {
      $$('[data-rvm]', f).forEach((b) => b.onclick = () => { $('#rvCmp', f).innerHTML = compare(modes[+b.dataset.rvm]); $$('[data-rvm]', f).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); scaleFrames(f); });
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
    const entry = (e) => '<article class="kn"><div class="kn-h"><strong>' + esc(e.title) + '</strong>' + (e.status === 'veraltet' ? '<span class="tag">veraltet?</span>' : '') + '</div><div class="md">' + md(e.text) + '</div><div class="kn-meta">' + esc([e.by ? 'von ' + (e.by === 'Nutzer' ? 'dir' : e.by) : '', e.source ? 'aus ' + e.source : '', e.date ? fmtDate(e.date) : ''].filter(Boolean).join(', ')) +
      (EDIT ? '<span class="spacer"></span><button class="btn link" data-knedit="' + esc(e.id) + '">Bearbeiten</button>' + (e.status !== 'veraltet' ? '<button class="btn link" data-knflag="' + esc(e.id) + '">veraltet</button>' : '<button class="btn link" data-knok="' + esc(e.id) + '">aktuell</button>') + '<button class="btn link danger" data-knrm="' + esc(e.id) + '">Löschen</button>' : '') + '</div></article>';
    body.innerHTML = head('Projektwissen') +
      '<p class="md">Was Claude in diesem Projekt wissen muss. Claude liest die passenden Einträge vor der Arbeit und schlägt neue vor, wenn es etwas Wichtiges herausfindet. Liegt in .works/wissen.md.</p>' +
      (props.length ? '<div class="block"><div class="block-head"><h3>Vorschläge von Claude</h3><span class="meta">' + props.length + '</span></div>' + props.map((e) => '<article class="kn prop"><div class="kn-h"><strong>' + esc(e.title) + '</strong><span class="muted">' + esc(e.area) + '</span></div><div class="md">' + md(e.text) + '</div><div class="kn-meta">' + esc([e.source ? 'gelernt in ' + e.source : '', e.date ? fmtDate(e.date) : ''].filter(Boolean).join(', ')) + (EDIT ? '<span class="spacer"></span><button class="btn small primary" data-knacc="' + esc(e.id) + '">Übernehmen</button><button class="btn small" data-knedit="' + esc(e.id) + '">Bearbeiten</button><button class="btn small ghost" data-knrm="' + esc(e.id) + '">Ablehnen</button>' : '') + '</div></article>').join('') + '</div>' : '') +
      '<div class="add-row"><input class="input" id="knQ" placeholder="Im Wissen suchen" value="' + esc(q) + '">' + (EDIT ? '<button class="btn small primary" id="knAdd">Eintrag hinzufügen</button>' : '') + '</div>' +
      (areas.length ? areas.map((a) => '<details class="sec" open><summary>' + esc(a) + ' <span class="meta">' + shown.filter((e) => e.area === a).length + '</span></summary><div class="body">' + shown.filter((e) => e.area === a).map(entry).join('') + '</div></details>').join('') : '<p class="md empty-md">' + (q ? 'Nichts gefunden.' : 'Noch kein Projektwissen.') + '</p>');
    $$('[data-sclose]', body).forEach((b) => b.onclick = closeSide);
    const qi = $('#knQ', body);
    qi.oninput = () => { store.set('works-know-q', qi.value); clearTimeout(qi._t); qi._t = setTimeout(() => { renderKnowledge(body, head).then(() => { const n = $('#knQ', body); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 250); };
    if (!EDIT) return;
    const areasAll = [...new Set(list.map((e) => e.area))];
    const edit = async (e) => {
      const r = await showDialog('<h2>' + (e ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen') + '</h2><div class="grid"><label class="field span2"><span>Bereich</span><input class="input" name="area" list="knAreas" maxlength="60" value="' + esc(e ? e.area : '') + '" placeholder="Zum Beispiel Discord und Bot"><datalist id="knAreas">' + areasAll.map((a) => '<option value="' + esc(a) + '">').join('') + '</datalist></label><label class="field span2"><span>Titel</span><input class="input" name="title" required maxlength="140" value="' + esc(e ? e.title : '') + '" autofocus></label></div><label class="field"><span>Text, Markdown möglich</span><textarea class="input" name="text" rows="6">' + esc(e ? e.text : '') + '</textarea></label>' + foot('Speichern'),
        (fd) => (e ? act('knowEdit', { kid: e.id, fields: { area: String(fd.get('area') || 'Allgemein'), title: String(fd.get('title')), text: String(fd.get('text') || ''), ok: e.status === 'vorschlag' } }) : act('knowAdd', { area: String(fd.get('area') || 'Allgemein'), title: String(fd.get('title')), text: String(fd.get('text') || '') })));
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
    body.innerHTML = head('Aufräumen') +
      '<div class="cl-score"><div><small>Zustand des Backlogs</small><strong class="num ' + (c.score >= 85 ? 'good' : c.score >= 60 ? '' : 'late') + '">' + c.score + '</strong><span class="muted">von 100</span></div><span class="md">' + (c.count ? c.count + ' Dinge brauchen Pflege. Erledigtes verschwindet aus der Liste.' : 'Alles in Ordnung.') + '</span></div>' +
      sec('Hängt fest', 'lange ohne Bewegung', c.stuck.map((x) => row(x, x.review ? '<button class="btn small primary" data-clreview="' + esc(x.id) + '">Jetzt abnehmen</button>' : '<button class="btn small" data-clhand="' + esc(x.id) + '">Übergabe anfordern</button><button class="btn small ghost" data-clback="' + esc(x.id) + '">Zurück ins Backlog</button>'))) +
      sec('Entwürfe ohne Wahl', 'Claude wartet mit dem Umsetzen', c.design.map((x) => row(x, '<button class="btn small primary" data-cldesign="' + esc(x.id) + '">Entwürfe ansehen</button>'))) +
      sec('Unvollständig', 'Claude kann so nicht sauber starten', c.incomplete.map((x) => row(x, '<button class="btn small" data-open="' + esc(x.id) + '">Ergänzen</button>')).concat(c.noEffort.length ? ['<div class="cl-row"><span class="st"></span><div class="q-t"><strong>' + c.noEffort.length + ' Aufgaben ohne Aufwand</strong><span class="q-meta">' + esc(c.noEffort.slice(0, 8).join(', ')) + ' zählen in Sprint und Zeitleiste als M</span></div>' + (EDIT ? '<button class="btn small" data-cltable>In der Tabelle schätzen</button>' : '') + '</div>'] : [])) +
      sec('Vermutlich doppelt', 'ähnliche Titel, Tags und Beschreibung', c.dups.map((p) => '<div class="cl-row"><span class="st"></span><div class="q-t"><span><button class="q-title" data-open="' + esc(p.a.id) + '">' + esc(p.a.id + ' ' + p.a.title) + '</button> und <button class="q-title" data-open="' + esc(p.b.id) + '">' + esc(p.b.id + ' ' + p.b.title) + '</button></span><span class="q-meta">' + p.score + ' Prozent Übereinstimmung</span></div>' + (EDIT ? '<button class="btn small primary" data-clmerge="' + esc(p.a.id) + '|' + esc(p.b.id) + '">Zusammenführen</button><button class="btn small ghost" data-cldis="' + esc(p.a.id) + '|' + esc(p.b.id) + '">Kein Duplikat</button>' : '') + '</div>')) +
      sec('Alt und unberührt', 'über 60 Tage im Backlog', c.old.map((x) => row(x, '<button class="btn small" data-clidea="' + esc(x.id) + '">Zu Idee machen</button>'))) +
      (c.old.length > 1 && EDIT ? '<div class="row-btns"><button class="btn small" data-clideaall>Alle ' + c.old.length + ' zu Ideen machen</button></div>' : '');
    $$('[data-sclose]', body).forEach((b) => b.onclick = closeSide);
    $$('[data-open]', body).forEach((b) => b.onclick = () => { closeSide(); openTask(b.dataset.open); });
    const again = () => renderCleanup(body, head);
    const go = async (fn, msg) => { if (await run(fn, msg)) again(); };
    $$('[data-clreview]', body).forEach((b) => b.onclick = () => { closeSide(); openReview(b.dataset.clreview); });
    $$('[data-cldesign]', body).forEach((b) => b.onclick = () => { closeSide(); detailTab = 'design'; openTask(b.dataset.cldesign).then(() => { detailTab = 'design'; renderDetail(); }); });
    $$('[data-clhand]', body).forEach((b) => b.onclick = () => go(() => act('requestHandoff', { id: b.dataset.clhand }), (x) => x.message));
    $$('[data-clback]', body).forEach((b) => b.onclick = () => go(() => act('move', { id: b.dataset.clback, to: 'backlog', reason: 'Hing fest, zurück ins Backlog' }), b.dataset.clback + ' zurück ins Backlog'));
    $$('[data-cltable]', body).forEach((b) => b.onclick = () => { closeSide(); tableSort.key = 'effort'; tableSort.dir = -1; setView('table'); });
    $$('[data-clmerge]', body).forEach((b) => b.onclick = async () => {
      const [a, c2] = b.dataset.clmerge.split('|');
      const keep = await showDialog('<h2>Zusammenführen</h2><p class="lead">Welche Aufgabe bleibt? Die andere wird verworfen, ihre Beschreibung und offenen Kriterien landen als Kommentar in der bleibenden.</p>' + segCtl('keep', [{ id: a, label: a + ' behalten' }, { id: c2, label: c2 + ' behalten' }], a) + foot('Zusammenführen'), (fd) => fd.get('keep'));
      if (keep) go(() => act('merge', { keep, drop: keep === a ? c2 : a }), (x) => x.message);
    });
    $$('[data-cldis]', body).forEach((b) => b.onclick = () => { const [a, c2] = b.dataset.cldis.split('|'); go(() => act('dismissDuplicate', { a, b: c2 }), (x) => x.message); });
    $$('[data-clidea]', body).forEach((b) => b.onclick = () => go(() => act('toIdeas', { ids: [b.dataset.clidea] }), (x) => x.message));
    $$('[data-clideaall]', body).forEach((b) => b.onclick = async () => { if (await confirmBox({ title: c.old.length + ' Aufgaben zu Ideen machen', lead: 'Sie werden verworfen und als Idee notiert. Mit Rückgängig lässt sich das zurückholen.', confirm: 'Zu Ideen machen' })) go(() => act('toIdeas', { ids: c.old.map((x) => x.id) }), (x) => x.message); });
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
      box.innerHTML = '<strong>Klingt wie eine offene Aufgabe</strong><button type="button" class="btn link" data-dupopen="' + esc(x.id) + '">' + esc(x.id + ' ' + x.title) + '</button><span class="sublabel">' + esc(L(x.status) + ', ' + x.priority + ', ' + x.score + ' Prozent ähnlich') + '</span><div class="row-btns"><button type="button" class="btn small primary" data-dupcomment="' + esc(x.id) + '">Als Kommentar zu ' + esc(x.id) + '</button><button type="button" class="btn small ghost" data-dupignore>Trotzdem anlegen</button></div>';
      $('[data-dupignore]', box).onclick = () => { dismissed = x.id; box.hidden = true; };
      $('[data-dupopen]', box).onclick = () => { $('button[value="cancel"]', form).click(); openTask(x.id); };
      $('[data-dupcomment]', box).onclick = async () => {
        const desc = String((($('textarea[name="description"], textarea[name="text"]', f) || {}).value) || '').trim();
        const r = await run(() => act('comment', { id: x.id, text: 'Ergänzung statt neuer Aufgabe „' + title + '“' + (desc ? ':\n\n' + desc : '.') }), 'Als Kommentar zu ' + x.id + ' gespeichert');
        if (r) $('button[value="cancel"]', form).click();
      };
    };
    let tmr = null;
    ti.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(check, 350); });
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
    if (fast.length) ins.push(['good', fast.length + (fast.length === 1 ? ' Aufgabe war' : ' Aufgaben waren') + ' schneller fertig als geschätzt.']);
    for (const t of done.filter((x) => x.effort && x.started && x.completed)) {
      const days = Math.max(1, Math.round((new Date(t.completed) - new Date(t.started)) / 86400000));
      if (days > (eff[t.effort] || 5) * 1.3) ins.push(['bad', t.id + ' war als ' + t.effort + ' geschätzt und hat ' + days + ' Tage gebraucht.']);
    }
    const added = list.filter((t) => t.created && t.created > sp.start);
    if (added.length) ins.push(['warn', added.length + (added.length === 1 ? ' Aufgabe kam' : ' Aufgaben kamen') + ' nach dem Start dazu: ' + added.map((t) => t.id).join(', ') + '.']);
    if (open.length) ins.push(['info', 'Offen geblieben: ' + open.map((t) => t.id).join(', ') + ', zusammen ' + open.reduce((a, t) => a + pts(t), 0) + ' Punkte.']);
    const unread = list.filter((t) => t.status === 'review');
    if (unread.length) ins.push(['warn', unread.map((t) => t.id).join(', ') + ' ' + (unread.length === 1 ? 'liegt' : 'liegen') + ' noch in Review.']);
    let usage = null;
    try { usage = await api('GET', 'api/usage'); } catch (e) { usage = null; }
    if (usage && usage.total.tokens) ins.push(['info', 'Verbrauch der letzten ' + usage.days + ' Tage: ' + fmtTok(usage.total.tokens) + ' Tokens, geschätzt ' + fmtMoney(usage.total.cost, usage.currency) + '.']);
    const icon = { good: ['good', '+'], bad: ['late', '!'], warn: ['warn-t', '!'], info: ['muted', '·'] };
    const goal = st.done >= st.planned ? 'erreicht' : st.done >= st.planned * 0.7 ? 'teilweise' : 'nicht erreicht';
    const seen = [st.done, meta.lastSprint && meta.lastSprint.result ? meta.lastSprint.result.done : 0].filter((n) => n > 0);
    const nextCap = seen.length ? Math.max(1, Math.round(seen.reduce((a, n) => a + n, 0) / seen.length)) : (st.capacity || set.capacity || 20);
    const html = '<h2>Rückblick auf ' + esc(sp.id + ' ' + sp.title) + '</h2><p class="lead">' + esc(fmtDate(sp.start)) + ' bis ' + esc(fmtDate(sp.end)) + '</p>' +
      '<div class="code-cards"><div><small>Geschafft</small><strong>' + st.done + ' von ' + st.planned + '</strong><span class="muted">Punkten</span></div><div><small>Ziel</small><strong class="' + (goal === 'erreicht' ? 'good' : goal === 'teilweise' ? 'warn-t' : 'late') + '">' + goal + '</strong><span class="muted">' + esc(sp.goal || 'ohne Ziel') + '</span></div><div><small>Dazugekommen</small><strong>' + added.length + '</strong><span class="muted">nach dem Start</span></div>' + (meta.lastSprint && meta.lastSprint.result ? '<div><small>Vorheriger Sprint</small><strong>' + meta.lastSprint.result.done + '</strong><span class="muted">Punkte geschafft</span></div>' : '') + '</div>' +
      '<div class="block"><div class="block-head"><h3>Was die Daten sagen</h3></div><ul class="retro">' + (ins.length ? ins.map(([k, txt]) => '<li><span class="' + icon[k][0] + '">' + icon[k][1] + '</span><span>' + esc(txt) + '</span></li>').join('') : '<li><span class="muted">·</span><span>Keine Auffälligkeiten.</span></li>') + '</ul></div>' +
      '<div class="block"><div class="block-head"><h3>Drei Fragen an dich</h3><span class="meta">optional, Claude nutzt die Antworten für den nächsten Sprint</span></div>' +
      '<label class="field"><span>Was lief gut?</span><input class="input" name="good" maxlength="500"></label><label class="field"><span>Was hat gebremst?</span><input class="input" name="bad" maxlength="500"></label><label class="field"><span>Was ändern wir im nächsten Sprint?</span><input class="input" name="change" maxlength="500"></label></div>' +
      '<div class="row-btns">' + (open.length ? '<label class="toggle"><input type="checkbox" name="carry" checked> ' + esc(open.map((t) => t.id).join(', ')) + ' übernehmen</label>' : '') + '<label class="toggle">Kapazität für den nächsten Sprint <input class="input" type="number" name="cap" min="1" max="1000" value="' + nextCap + '" style="width:90px;height:30px"></label></div>' +
      '<p class="err" role="alert"></p><div class="foot"><button class="btn" value="cancel" formnovalidate>Abbrechen</button><button class="btn" value="close">Nur abschließen</button><button class="btn primary" value="plan">Abschließen und nächsten planen</button></div>';
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

  // ---------- Werkzeuge: Wiederkehrend, GitHub, Kalender, Verbrauch, Rückgängig ----------

  async function toolsExtra() {
    const [rec, gh, usage, undos, share] = await Promise.all([
      api('GET', 'api/recurring').catch(() => null), api('GET', 'api/github').catch(() => null), api('GET', 'api/usage').catch(() => null),
      EDIT ? api('GET', 'api/undo').catch(() => []) : Promise.resolve([]), EDIT ? api('GET', 'api/share').catch(() => null) : Promise.resolve(null),
    ]);
    const h = [];
    h.push('<div class="row-btns tools-top"><button class="btn small" data-openside="knowledge">Projektwissen' + (meta.knowledgeProposals ? ' (' + meta.knowledgeProposals + ' neu)' : '') + '</button><button class="btn small" data-openside="cleanup">Aufräumen</button></div>');
    if (rec) {
      h.push('<details class="sec"><summary>Wiederkehrende Aufgaben <span class="meta">' + rec.rules.length + '</span></summary><div class="body">' +
        '<p class="md">works legt sie zum Termin selbst an, beim Sitzungsstart oder solange das Board läuft. Ist die vorige noch offen, wird keine zweite angelegt.</p>' +
        (rec.rules.length ? rec.rules.map((r) => '<div class="tpl-row"><div class="q-t"><strong>' + esc(r.title) + '</strong><span class="q-meta">' + esc(r.text + (r.active === false ? ', pausiert' : ', nächste ' + fmtDate(r.next[0]))) + (r.lastTask ? ', zuletzt ' + esc(r.lastTask) : '') + '</span></div>' + (EDIT ? '<button class="btn small ghost" data-recedit="' + esc(r.id) + '">Bearbeiten</button>' : '') + '</div>').join('') : '<p class="md empty-md">Noch keine Regeln.</p>') +
        (EDIT ? '<div class="row-btns"><button class="btn small primary" id="recNew">Neue Regel</button><button class="btn small" id="recRun">Jetzt prüfen</button></div>' : '') + '</div></details>');
    }
    if (gh) {
      const s = gh.settings; const st = gh.state;
      const sw = (k, l) => '<label class="switch small"><span><b>' + esc(l) + '</b></span><input type="checkbox" data-gh="' + k + '"' + (s[k] ? ' checked' : '') + (EDIT ? '' : ' disabled') + '><i aria-hidden="true"></i></label>';
      h.push('<details class="sec"><summary>GitHub <span class="meta">' + (st && st.repo ? esc(st.repo) : 'nicht verbunden') + '</span></summary><div class="body">' +
        '<p class="md">Abgleich über das gh CLI beim Sitzungsstart und alle ' + s.interval_min + ' Minuten, solange das Board läuft.' + (st && st.last ? ' Zuletzt ' + esc(new Date(st.last).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })) + '.' : '') + '</p>' +
        sw('enabled', 'Automatisch abgleichen') + sw('pr_review', 'PR geöffnet: Aufgabe nach Review') + sw('merge_done', 'PR gemergt: Aufgabe abschließen') + sw('ci_checks', 'CI-Checks als Prüfung') + sw('review_comments', 'Änderungswünsche als Kommentar an Claude') + sw('issues', 'Neue Issues als Aufgabe') + sw('close_issues', 'Erledigte Aufgabe schließt ihr Issue') +
        '<label class="field"><span>Nur Issues mit diesen Labels, leer für alle</span><input class="input" id="ghLabels" value="' + esc((s.labels || []).join(', ')) + '"' + (EDIT ? '' : ' disabled') + '></label>' +
        (st && st.events && st.events.length ? '<ol class="commits">' + st.events.slice(0, 8).map((e) => '<li><time class="muted num">' + esc(new Date(e.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</time><span class="subj">' + esc(e.text) + '</span></li>').join('') + '</ol>' : '') +
        (EDIT ? '<div class="row-btns"><button class="btn small" id="ghSync">Jetzt abgleichen</button></div>' : '') + '</div></details>');
    }
    if (LIVE) {
      const local = location.origin + '/kalender.ics';
      const viewKey = share && share.shared && share.links[0] ? share.links[0].view.replace(/\/\?view=/, '/kalender.ics?key=') : '';
      h.push('<details class="sec"><summary>Kalender</summary><div class="body"><p class="md">Fälligkeiten, Meilensteine und Sprints zum Abonnieren in Google Kalender, Outlook oder Apple Kalender.</p>' +
        '<div class="share-link"><span>Auf diesem Rechner</span><input class="input mono" readonly value="' + esc(local) + '"><button type="button" class="btn small" data-copy2="' + esc(local) + '">Kopieren</button></div>' +
        (viewKey ? '<div class="share-link"><span>Im Netzwerk, mit Leseschlüssel</span><input class="input mono" readonly value="' + esc(viewKey) + '"><button type="button" class="btn small" data-copy2="' + esc(viewKey) + '">Kopieren</button></div>' : '') +
        '<div class="row-btns"><a class="btn small" href="kalender.ics?recurring=1" download="termine.ics">Als Datei laden</a></div><p class="sublabel">Kalender im Internet brauchen die Datei, sie kommen nicht an deinen Rechner heran.</p></div></details>');
    }
    if (usage) {
      h.push('<details class="sec"><summary>Verbrauch <span class="meta">' + (usage.total.tokens ? fmtMoney(usage.total.cost, usage.currency) + ' in ' + usage.days + ' Tagen' : 'noch nichts erfasst') + '</span></summary><div class="body">' +
        (usage.total.tokens ? '<div class="code-cards"><div><small>Tokens</small><strong>' + fmtTok(usage.total.tokens) + '</strong><span class="muted">davon ' + fmtTok(usage.total.cr + usage.total.cw) + ' Cache</span></div><div><small>Geschätzte Kosten</small><strong>' + fmtMoney(usage.total.cost, usage.currency) + '</strong><span class="muted">' + (usage.untrackedCost > 0 ? fmtMoney(usage.untrackedCost, usage.currency) + ' ohne aktive Aufgabe' : 'alles Aufgaben zugeordnet') + '</span></div></div>' +
          '<div class="est-grid">' + usage.byType.map((b) => '<strong>' + esc(meta.typeLabel[b.type] || b.type) + '</strong><div class="est-track"><span class="est-bar" style="width:' + (b.cost / (usage.byType[0].cost || 1) * 100).toFixed(1) + '%"></span></div><span class="num">' + fmtMoney(b.cost, usage.currency) + ', ' + b.tasks + ' Aufg.</span>').join('') + '</div>' +
          (usage.top.length ? '<p class="sublabel">Am teuersten: ' + usage.top.slice(0, 4).map((x) => esc(x.id) + ' ' + fmtMoney(x.cost, usage.currency)).join(', ') + '</p>' : '') : '<p class="md empty-md">Der Stop Hook rechnet den Verbrauch jeder Antwort der aktiven Aufgabe zu.</p>') +
        '<p class="sublabel">Schätzung nach den Preisen in config.json unter prices (US-Dollar je Million Tokens). Bitte mit deinem Tarif abgleichen.</p></div></details>');
    }
    if (EDIT && undos.length) {
      h.push('<details class="sec"><summary>Letzte Änderungen <span class="meta">Strg+Z macht die letzte rückgängig</span></summary><div class="body">' + undos.slice(0, 10).map((u) => '<div class="tpl-row"><span class="muted num">' + esc(timeOf(u.at)) + '</span><span class="q-t">' + esc(u.label) + '</span><button class="btn small ghost" data-undo="' + esc(u.key) + '">Zurück</button></div>').join('') + '</div></details>');
    }
    return h.join('');
  }

  function bindToolsExtra(body) {
    $$('[data-openside]', body).forEach((b) => b.onclick = () => { side = null; openSide(b.dataset.openside); });
    $$('[data-copy2]', body).forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy2); } catch (e) { b.previousElementSibling.select(); document.execCommand('copy'); } b.textContent = 'Kopiert'; setTimeout(() => { b.textContent = 'Kopieren'; }, 1500); });
    if (!EDIT) return;
    $$('[data-undo]', body).forEach((b) => b.onclick = async () => { if (await run(() => act('undo', { key: b.dataset.undo }), (x) => x.message)) renderSide(); });
    $$('[data-gh]', body).forEach((c) => c.onchange = () => run(() => act('githubSettings', { [c.dataset.gh]: c.checked }), 'Gespeichert'));
    const gl = $('#ghLabels', body); if (gl) gl.onchange = () => run(() => act('githubSettings', { labels: gl.value }), 'Gespeichert');
    const gs = $('#ghSync', body); if (gs) gs.onclick = async () => { gs.disabled = true; gs.textContent = 'Gleicht ab …'; await run(() => act('githubSync', {}), (x) => x.message || 'Abgeglichen'); renderSide(); };
    const rn = $('#recRun', body); if (rn) rn.onclick = () => run(() => act('recurRun', {}), (x) => x.message);
    const rr = $('#recNew', body); if (rr) rr.onclick = () => editRule(null);
    $$('[data-recedit]', body).forEach((b) => b.onclick = () => editRule(b.dataset.recedit));
  }

  async function editRule(rid) {
    let info;
    try { info = await api('GET', 'api/recurring'); } catch (e) { return fail(e); }
    const r = rid ? info.rules.find((x) => x.id === rid) : { title: '', kind: 'weekly', weekday: 1, nth: 1, interval: 1, status: 'geplant', active: true, priority: 'P3', type: 'chore' };
    const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    const opt = (list, cur) => list.map((o) => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur ?? '') ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('');
    const html = '<h2>' + (rid ? 'Regel bearbeiten' : 'Neue wiederkehrende Aufgabe') + '</h2>' +
      '<label class="field"><span>Titel, {Datum} und {Monat} werden ersetzt</span><input class="input" name="title" required maxlength="150" value="' + esc(r.title) + '" placeholder="Abhängigkeiten aktualisieren ({Monat})" autofocus></label>' +
      '<div class="grid"><label class="field span2"><span>Grundlage</span><select name="template"><option value="">Ohne Vorlage</option>' + info.templates.map((t) => '<option value="' + esc(t.slug) + '"' + (r.template === t.slug ? ' selected' : '') + '>Vorlage ' + esc(t.name) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Typ</span><select name="type">' + opt(Object.entries(meta.typeLabel), r.type) + '</select></label><label class="field"><span>Priorität</span><select name="priority">' + opt(PRIOS.map((p) => [p, p]), r.priority) + '</select></label></div>' +
      '<div class="field"><span>Rhythmus</span>' + segCtl('kind', [{ id: 'daily', label: 'Täglich' }, { id: 'weekly', label: 'Wöchentlich' }, { id: 'monthly', label: 'Monatlich' }, { id: 'days', label: 'Alle N Tage' }], r.kind) + '</div>' +
      '<div class="grid"><label class="field"><span>Alle wie viele</span><input class="input" type="number" name="interval" min="1" max="365" value="' + esc(r.interval || 1) + '"></label><label class="field"><span>Wochentag</span><select name="weekday">' + opt(days.map((d, i) => [i + 1, d]), r.weekday || 1) + '</select></label><label class="field"><span>Im Monat</span><select name="nth">' + opt([[1, 'erster'], [2, 'zweiter'], [3, 'dritter'], [4, 'vierter'], [5, 'letzter']], r.nth || 1) + '</select></label><label class="field"><span>Fällig nach Tagen</span><input class="input" type="number" name="due_days" min="0" max="365" value="' + esc(r.due_days || '') + '"></label></div>' +
      '<div class="row-btns"><label class="toggle"><input type="checkbox" name="queue"' + (r.queue ? ' checked' : '') + '> In die Warteschlange</label><label class="toggle"><input type="checkbox" name="sprint"' + (r.sprint ? ' checked' : '') + '> In den laufenden Sprint</label><label class="toggle"><input type="checkbox" name="active"' + (r.active !== false ? ' checked' : '') + '> Aktiv</label></div>' +
      foot(rid ? 'Speichern' : 'Regel anlegen', { extra: rid ? '<button type="button" class="btn danger" id="recDel" style="margin-right:auto">Löschen</button>' : '' });
    const res = await showDialog(html, (fd) => {
      const rule = { title: fd.get('title'), template: fd.get('template'), type: fd.get('type'), priority: fd.get('priority'), kind: fd.get('kind'), interval: fd.get('kind') === 'days' || fd.get('kind') === 'weekly' ? fd.get('interval') : '', weekday: fd.get('weekday'), nth: fd.get('kind') === 'monthly' ? fd.get('nth') : '', due_days: fd.get('due_days'), queue: fd.get('queue') === 'on', sprint: fd.get('sprint') === 'on', active: fd.get('active') === 'on', status: 'geplant' };
      return act('recurSave', { rule, rid: rid || '' });
    }, (f) => { const d = $('#recDel', f); if (d) d.onclick = async () => { if (await run(() => act('recurRemove', { rid }), 'Regel gelöscht')) { $('button[value="cancel"]', f).click(); if (side === 'tools') renderSide(); } }; });
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
    if (EDIT) c.push({ label: 'Neue Aufgabe', hint: 'N', run: () => newTask() });
    VIEWS.forEach((v, i) => c.push({ label: VIEW_LABEL[v] + ' anzeigen', hint: String(i + 1), run: () => setView(v) }));
    (meta.views || []).forEach((v) => c.push({ label: 'Ansicht „' + v.name + '“', run: () => applySavedView(v) }));
    if (LIVE) c.push({ label: 'Wochenbericht, Vorlagen, Prüfungen, Benachrichtigungen', run: () => openSide('tools') });
    if (LIVE) c.push({ label: 'Projektwissen', run: () => openSide('knowledge') });
    if (LIVE) c.push({ label: 'Aufräumen', run: () => openSide('cleanup') });
    if (EDIT) c.push({ label: 'Letzte Änderung rückgängig', hint: 'Strg+Z', run: () => run(() => act('undo', {}), (x) => x.message) });
    if (LIVE) {
      c.push({ label: 'Nächste Aufgabe vorschlagen', run: () => openSide('next') });
      c.push({ label: 'Ideen öffnen', run: () => openSide('ideas') });
      c.push({ label: 'Aktivität anzeigen', run: () => openSide('activity') });
    }
    if (EDIT) {
      c.push({ label: 'Board teilen oder exportieren', run: () => openShare() });
      c.push({ label: 'Meilenstein anlegen', run: () => editMilestone(null) });
    }
    c.push({ label: 'Farbschema wechseln', run: () => $('#btnTheme').click() });
    c.push({ label: state.closed ? 'Archiv und Verworfene ausblenden' : 'Archiv und Verworfene anzeigen', run: () => { state.closed = !state.closed; renderAll(); } });
    if (filtersActive()) c.push({ label: 'Filter zurücksetzen', run: resetFilters });
    PRIOS.forEach((p) => c.push({ label: 'Nur ' + p + ' ' + meta.prioLabel[p] + ' zeigen', run: () => { state.prios = new Set([p]); renderAll(); } }));
    meta.milestones.forEach((m) => c.push({ label: 'Meilenstein ' + m.id + ' ' + m.title + ' filtern', run: () => { state.ms = m.id; renderAll(); } }));
    COLS.forEach((s) => c.push({ label: 'Zu Spalte ' + L(s) + ' springen', run: () => { const col = $('.col[data-col="' + s + '"]'); if (col) col.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', inline: 'start', block: 'nearest' }); } }));
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
      const group = it.kind === 'task' ? (raw ? 'Aufgaben' : 'Offene Aufgaben') : it.kind === 'tag' ? 'Tags' : 'Befehle';
      const head = group !== lastGroup ? '<li class="pal-group" role="presentation">' + esc(group) + '</li>' : '';
      lastGroup = group;
      let body;
      if (it.kind === 'task') {
        const t = it.t;
        body = '<span class="st" style="--c:' + statusVar(t.status) + '" title="' + esc(L(t.status)) + '"></span><span class="pal-id num">' + mark(t.id, it.q) + '</span><span class="pal-t">' + mark(t.title, it.q) + '</span><span class="pal-m">' + esc(L(t.status)) + '</span><span class="pal-p" style="color:' + prioVar(t.priority) + '">' + esc(t.priority) + '</span>';
      } else if (it.kind === 'tag') {
        body = '<span class="pal-ic">#</span><span class="pal-t">' + mark(it.label, it.q) + '</span><span class="pal-m">' + it.count + ' offen</span>';
      } else {
        body = '<span class="pal-ic">›</span><span class="pal-t">' + mark(it.label, it.q) + '</span>' + (it.hint ? '<kbd>' + esc(it.hint) + '</kbd>' : '');
      }
      return head + '<li role="option" id="pal-' + i + '" data-i="' + i + '" aria-selected="' + (i === palSel) + '">' + body + '</li>';
    }).join('') : '<li class="pal-empty">Keine Treffer. Mit &gt; nach Befehlen suchen, mit # nach Tags.</li>';
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
    b.title = 'Farbschema: ' + (t === 'auto' ? 'System' : t === 'dark' ? 'Dunkel' : 'Hell') + '. Klicken zum Wechseln.';
  }
  $('#btnTheme').onclick = () => {
    const order = ['auto', 'light', 'dark'];
    const cur = store.get('works-theme', 'auto');
    store.set('works-theme', order[(order.indexOf(cur) + 1) % 3]);
    applyTheme();
  };
  applyTheme();

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
    if (/^[1-6]$/.test(e.key) && panel.hidden && pal.hidden) { e.preventDefault(); setView(VIEWS[+e.key - 1]); }
  });

  document.body.classList.toggle('ro', !EDIT);
  $$('[data-live]').forEach((el) => { if (!LIVE) el.hidden = true; });
  $$('[data-edit]').forEach((el) => { if (!EDIT) el.hidden = true; });
  if (!EDIT) {
    const ro = $('#readonly');
    ro.hidden = false;
    if (MODE === 'view') ro.innerHTML = '<strong>Nur Ansehen.</strong> Du siehst das Board von ' + esc(meta.project) + ' live über einen geteilten Link. Änderungen erscheinen automatisch.';
    else if (MODE === 'snapshot') ro.innerHTML = '<strong>Schnappschuss</strong> vom ' + esc(new Date(meta.snapshot || Date.now()).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })) + '. Nur zum Ansehen, Details per Klick auf eine Aufgabe.';
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
    const es = new EventSource('events');
    es.addEventListener('update', () => {
      // Das erste update nach dem Verbinden prüft nur die Version, die Daten sind schon in der Seite.
      if (first) { first = false; fetch('data.json', { cache: 'no-store' }).then((r) => r.json()).then((n) => { if (outdated(n.meta)) reloadForUpdate(); }).catch(() => {}); return; }
      reload();
    });
    es.addEventListener('restart', () => { first = true; setLive(true, 'Neue Version startet'); });
    es.onopen = () => { if ($('#live').classList.contains('off')) setLive(true, 'Live'); };
    es.onerror = () => setLive(false, 'Verbindung getrennt, neuer Versuch läuft');
    ensureMeta().then(() => { if (detail) renderDetail(); }).catch(() => {});
    setInterval(() => {
      let d = false;
      for (const [id, c] of changes) if (Date.now() - c.at > HIGHLIGHT_MS) { changes.delete(id); d = true; }
      if (d) renderBoard();
    }, 1000);
  }
  // Ansicht nach einem Update-Neuladen wiederherstellen.
  let restored = null;
  try { restored = JSON.parse(sessionStorage.getItem(UI_KEY) || 'null'); sessionStorage.removeItem(UI_KEY); } catch (e) { restored = null; }
  state.view = store.get('works-view-' + meta.project, 'board');
  if (restored && restored.view) state.view = restored.view;
  if (!VIEWS.includes(state.view)) state.view = 'board';
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
    if (LIVE) toast('<div class="what">Board neu geladen</div><div class="why">Der Board-Server wurde neu gestartet oder aktualisiert. Ansicht und Filter sind übernommen.</div>');
  }
})();
