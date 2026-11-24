// Auswertungen: Index (WORKS.md), Empfehlungen, DoD-Prüfung, Session-Zusammenfassung.
import fs from 'node:fs';
import path from 'node:path';
import { readText,
  loadTasks, loadConfig, loadState, queueOf, worksDir, getSection, checkboxes, hasContent,
  imageLinks, OPEN_STATUSES, STATUSES, STATUS_LABEL, PRIO_LABEL, TYPE_LABEL,
  isBlocked, openBlockers, isOverdue, openQuestions, prioRank, effortRank, sortTasks,
  mdEscape, relFromWorks, nowStamp, today, daysBetween, idNumber, exists, stripComments,
} from './lib.mjs';
import { activeSprint, sprintSummaryLine } from './sprint.mjs';
import { unreadForClaude } from './comments.mjs';
import { checkItems } from './checks.mjs';
import { knowledgeSummary, loadKnowledge } from './knowledge.mjs';
import { designSummary } from './design.mjs';
import { tr } from './i18n.mjs';

export function byIdMap(tasks) {
  return new Map(tasks.map((t) => [t.id, t]));
}

export function taskLink(root, t) {
  return `[${t.id}](${relFromWorks(root, t._file)})`;
}

function flags(t, byId) {
  const f = [];
  if (OPEN_STATUSES.includes(t.status) && isBlocked(t, byId)) f.push(tr('blocked by {list}', { list: openBlockers(t, byId).join(', ') }));
  if (isOverdue(t)) f.push(tr('overdue since {due}', { due: t.due }));
  if (t.incomplete) f.push(tr('incomplete'));
  const q = openQuestions(t).length;
  if (q) f.push(q > 1 ? tr('{n} open questions', { n: q }) : tr('{n} open question', { n: q }));
  return f.join(', ');
}

function table(root, list, byId, cols = ['id', 'title', 'type', 'priority', 'status', 'effort', 'due', 'milestone', 'hint']) {
  if (!list.length) return `${tr('_No entries._')}\n`;
  const head = {
    id: 'ID', title: tr('Title'), type: tr('Type'), priority: 'Prio', status: 'Status',
    effort: tr('Effort'), due: tr('Due'), milestone: tr('Milestone'), hint: tr('Notes'), completed: tr('Completed on'),
  };
  const lines = [`| ${cols.map((c) => head[c]).join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`];
  for (const t of list) {
    const row = cols.map((c) => {
      switch (c) {
        case 'id': return taskLink(root, t);
        case 'title': return mdEscape(t.title);
        case 'type': return TYPE_LABEL[t.type] || t.type || '';
        case 'priority': return t.priority ? `${t.priority} ${PRIO_LABEL[t.priority] || ''}`.trim() : '';
        case 'status': return STATUS_LABEL[t.status] || t.status || '';
        case 'effort': return t.effort || '';
        case 'due': return t.due || '';
        case 'milestone': return t.milestone || '';
        case 'completed': return t.completed || t.updated || '';
        case 'hint': return mdEscape(flags(t, byId));
        default: return '';
      }
    });
    lines.push(`| ${row.join(' | ')} |`);
  }
  return lines.join('\n') + '\n';
}

export function milestoneProgress(config, tasks) {
  return (config.milestones || []).map((m) => {
    const list = tasks.filter((t) => t.milestone === m.id && t.status !== 'verworfen');
    const done = list.filter((t) => t.status === 'erledigt').length;
    return { ...m, total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
  });
}

function ideaCount(root) {
  const p = path.join(worksDir(root), 'ideas.md');
  if (!exists(p)) return 0;
  return readText(p).split('\n').filter((l) => /^- \[I-\d+\]/.test(l) && !l.includes('~~')).length;
}

export function generateIndex(root) {
  const config = loadConfig(root);
  const state = loadState(root);
  const all = loadTasks(root);
  const byId = byIdMap(all);
  const open = sortTasks(all.filter((t) => OPEN_STATUSES.includes(t.status)));
  const done = all.filter((t) => t.status === 'erledigt');
  const out = [];

  out.push('# Works\n');
  out.push(`> ${tr('Generated on {stamp} by `works index`. Do not edit by hand. Content belongs in the task.md of the respective task.', { stamp: nowStamp() })}\n`);

  const cnt = (s) => open.filter((t) => t.status === s).length;
  out.push(`## ${tr('Overview')}\n`);
  out.push(`| ${[STATUS_LABEL.backlog, STATUS_LABEL.geplant, STATUS_LABEL['in-arbeit'], STATUS_LABEL.review, tr('Blocked'), tr('Overdue'), STATUS_LABEL.erledigt, STATUS_LABEL.verworfen].join(' | ')} |`);
  out.push('|---|---|---|---|---|---|---|---|');
  out.push(`| ${cnt('backlog')} | ${cnt('geplant')} | ${cnt('in-arbeit')} | ${cnt('review')} | ${open.filter((t) => isBlocked(t, byId)).length} | ${open.filter(isOverdue).length} | ${done.length} | ${all.filter((t) => t.status === 'verworfen').length} |\n`);

  const prioLine = ['P1', 'P2', 'P3', 'P4'].map((p) => `${p} ${PRIO_LABEL[p]}: ${open.filter((t) => t.priority === p).length}`).join(' · ');
  out.push(`${tr('Open by priority: {list}', { list: prioLine })}\n`);

  if (state.active && byId.get(state.active)) {
    const a = byId.get(state.active);
    out.push(`## ${tr('Active task')}\n`);
    out.push(`${taskLink(root, a)} ${mdEscape(a.title)} (${STATUS_LABEL[a.status] || a.status})${state.last_handoff ? tr(', last handoff {date}', { date: state.last_handoff }) : ''}\n`);
  }

  out.push(`## ${tr('Critical (P1)')}\n`);
  out.push(table(root, open.filter((t) => t.priority === 'P1'), byId));

  out.push(`## ${tr('In progress and review')}\n`);
  out.push(table(root, open.filter((t) => ['in-arbeit', 'review'].includes(t.status)), byId));

  out.push(`## ${tr('Planned and backlog')}\n`);
  out.push(table(root, open.filter((t) => ['geplant', 'backlog'].includes(t.status)), byId));

  const ms = milestoneProgress(config, all);
  if (ms.length) {
    out.push(`## ${tr('Milestones')}\n`);
    out.push(`| ID | ${tr('Title')} | ${tr('Due')} | Status | ${tr('Progress')} |`);
    out.push('|---|---|---|---|---|');
    for (const m of ms) {
      out.push(`| ${m.id} | ${mdEscape(m.title)} | ${m.due || ''} | ${m.status || 'offen'} | ${m.done}/${m.total} (${m.pct} %) |`);
    }
    out.push('');
  }

  const blocked = open.filter((t) => isBlocked(t, byId));
  if (blocked.length) {
    out.push(`## ${tr('Blocked')}\n`);
    for (const t of blocked) out.push(`- ${taskLink(root, t)} ${mdEscape(t.title)}: ${tr('waiting for {list}', { list: openBlockers(t, byId).join(', ') })}`);
    out.push('');
  }

  const overdue = open.filter(isOverdue);
  if (overdue.length) {
    out.push(`## ${tr('Overdue')}\n`);
    for (const t of overdue) out.push(`- ${taskLink(root, t)} ${mdEscape(t.title)}: ${tr('due on {date}', { date: t.due })}`);
    out.push('');
  }

  const incomplete = open.filter((t) => t.incomplete);
  if (incomplete.length) {
    out.push(`## ${tr('Incomplete entries')}\n`);
    for (const t of incomplete) out.push(`- ${taskLink(root, t)} ${mdEscape(t.title)}${t.source ? ` (${tr('source: {source}', { source: t.source })})` : ''}`);
    out.push('');
  }

  const withQ = open.filter((t) => openQuestions(t).length);
  if (withQ.length) {
    out.push(`## ${tr('Open questions')}\n`);
    for (const t of withQ) {
      out.push(`- ${taskLink(root, t)} ${mdEscape(t.title)}`);
      for (const q of openQuestions(t)) out.push(`  - ${q.text}`);
    }
    out.push('');
  }

  const debt = open.filter((t) => t.type === 'debt');
  if (debt.length) {
    out.push(`## ${tr('Technical debt')}\n`);
    out.push(table(root, debt, byId, ['id', 'title', 'priority', 'status', 'effort', 'due']));
  }

  const recent = [...done].sort((a, b) => String(b.completed || b.updated).localeCompare(String(a.completed || a.updated))).slice(0, 10);
  out.push(`## ${tr('Recently done')}\n`);
  out.push(table(root, recent, byId, ['id', 'title', 'type', 'priority', 'completed']));

  const ideas = ideaCount(root);
  out.push(`## ${tr('Ideas')}\n`);
  out.push(`${ideas === 1 ? tr('{n} open idea in [ideas.md](ideas.md).', { n: ideas }) : tr('{n} open ideas in [ideas.md](ideas.md).', { n: ideas })}\n`);

  const content = out.join('\n').replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(path.join(worksDir(root), 'WORKS.md'), content);
  return content;
}

// ---------- Empfehlung ----------

export function nextCandidates(root, n = 3) {
  const all = loadTasks(root, { archive: true });
  const byId = byIdMap(all);
  const config = loadConfig(root);
  const queue = queueOf(config);
  const sprint = activeSprint(config);
  const inSprint = new Set(sprint ? sprint.tasks || [] : []);
  const active = all.filter((t) => ['in-arbeit', 'review'].includes(t.status));
  const candidates = all
    .filter((t) => ['backlog', 'geplant'].includes(t.status) && !isBlocked(t, byId))
    .map((t) => {
      const reasons = [];
      let score = (4 - prioRank(t.priority)) * 100;
      reasons.push(`${t.priority} ${PRIO_LABEL[t.priority] || ''}`.trim());
      if (t.status === 'geplant') { score += 30; reasons.push(tr('already planned')); }
      if (isOverdue(t)) { score += 80; reasons.push(tr('overdue since {due}', { due: t.due })); } else if (t.due) {
        const d = daysBetween(today(), String(t.due));
        if (d <= 7) { score += 40 - d * 3; reasons.push(d === 1 ? tr('due in {n} day', { n: d }) : tr('due in {n} days', { n: d })); }
      }
      const unblocks = all.filter((o) => (o.blocked_by || []).includes(t.id) && OPEN_STATUSES.includes(o.status)).length;
      if (unblocks) { score += unblocks * 25; reasons.push(unblocks > 1 ? tr('unblocks {n} tasks', { n: unblocks }) : tr('unblocks {n} task', { n: unblocks })); }
      score += (3 - effortRank(t.effort)) * 8;
      if (t.effort) reasons.push(tr('effort {effort}', { effort: t.effort }));
      if (t.risk === 'hoch') { score -= 5; reasons.push(tr('high risk')); }
      if (t.incomplete) { score -= 40; reasons.push(tr('complete it first')); }
      // Die Warteschlange des Nutzers hat Vorrang vor der berechneten Reihenfolge.
      if (inSprint.has(t.id)) { score += 1000; reasons.unshift(tr('in sprint {id}', { id: sprint.id })); }
      const qi = queue.indexOf(t.id);
      if (qi !== -1) { score += 100000 - qi * 100; reasons.unshift(tr('queue position {n}', { n: qi + 1 })); }
      return { task: t, score, reasons, queued: qi !== -1 };
    })
    .sort((a, b) => b.score - a.score || idNumber(a.task.id) - idNumber(b.task.id))
    .slice(0, n);
  return { active, candidates };
}

// ---------- Definition of Done ----------

export function dodCheck(root, config, task) {
  const auto = [];
  const body = task._body;
  const crit = checkboxes(getSection(body, 'Akzeptanzkriterien') || '');
  if (crit.total === 0) auto.push({ ok: false, text: tr('Acceptance criteria are defined'), detail: tr('section is empty') });
  else auto.push({ ok: crit.done === crit.total, text: tr('All acceptance criteria are checked'), detail: `${crit.done}/${crit.total}` });

  const q = openQuestions(task);
  auto.push({ ok: q.length === 0, text: tr('No open questions'), detail: q.length ? q.map((x) => x.text).join('; ') : '' });

  const plan = checkboxes(getSection(body, 'Umsetzungsplan') || getSection(body, 'Checkliste') || getSection(body, 'Vorgehen') || '');
  if (plan.total) auto.push({ ok: plan.done === plan.total, text: tr('Implementation steps completed'), detail: `${plan.done}/${plan.total}` });

  const tags = task.tags || [];
  const needsShots = task.type === 'design' || tags.includes('ui');
  if (needsShots) {
    const imgs = imageLinks(getSection(body, 'Assets') || '').map((i) => i.src.toLowerCase());
    const hasBefore = imgs.some((s) => /-(vorher|ist)(-\d+)?\.\w+$/.test(s));
    const hasAfter = imgs.some((s) => /-nachher(-\d+)?\.\w+$/.test(s));
    const yes = (b) => (b ? tr('yes') : tr('no'));
    auto.push({ ok: hasBefore && hasAfter, text: tr('Before and after screenshots exist'), detail: tr('before: {before}, after: {after}', { before: yes(hasBefore), after: yes(hasAfter) }) });
  }
  if (task.type === 'design' || tags.includes('ui')) {
    const dec = path.join(task._dir, 'decisions.md');
    const filled = exists(dec) && hasContent(getSection(readText(dec), 'Entscheidungen') || '');
    auto.push({ ok: filled, text: tr('decisions.md contains decisions'), detail: exists(dec) ? '' : tr('file is missing') });
  }
  if (task.type === 'bug') auto.push({ ok: hasContent(getSection(body, 'Ursache')), text: tr('Root cause is documented'), detail: '' });
  if (task.type === 'spike') {
    auto.push({ ok: hasContent(getSection(body, 'Ergebnisse')), text: tr('Results are documented'), detail: '' });
    auto.push({ ok: hasContent(getSection(body, 'Empfehlung')), text: tr('Recommendation is documented'), detail: '' });
  }
  if (task.type === 'refactor') auto.push({ ok: hasContent(getSection(body, 'Rollback')), text: tr('Rollback is described'), detail: '' });
  if (task.type === 'debt') auto.push({ ok: hasContent(getSection(body, 'Rückzahlung')), text: tr('Repayment is described'), detail: '' });

  const chk = checkItems(root, config, task);
  auto.push(...chk.items);

  const manual = [...(config.dod.global || []), ...((config.dod.by_type || {})[task.type] || [])];
  for (const tag of tags) manual.push(...((config.dod.by_tag || {})[tag] || []));
  // Punkte aus config.json: Standardwerte stehen englisch im Katalog, eigene Texte bleiben, wie sie sind.
  return { auto, manual: [...new Set(manual.map((m) => tr(m)))], commands: config.dod.commands || [], checks: chk.state };
}

// ---------- Session-Zusammenfassung ----------

export function sessionSummary(root, { maxHandoff = 1500 } = {}) {
  const config = loadConfig(root);
  const state = loadState(root);
  const all = loadTasks(root, { archive: false });
  const byId = byIdMap(all);
  const open = sortTasks(all.filter((t) => OPEN_STATUSES.includes(t.status)));
  const lines = [];
  lines.push(tr('[works] This project manages tasks in .works/ ({n} open). Load the works skill before working on tasks.', { n: open.length }));
  const more = (n) => (n > 0 ? ` ${tr('and {n} more', { n })}` : '');
  const p1 = open.filter((t) => t.priority === 'P1');
  if (p1.length) lines.push(tr('Open P1 Critical: {list}', { list: p1.map((t) => `${t.id} ${t.title} (${STATUS_LABEL[t.status]})`).join('; ') }));
  const p2 = open.filter((t) => t.priority === 'P2');
  if (p2.length) lines.push(tr('Open P2 High: {list}', { list: p2.slice(0, 5).map((t) => `${t.id} ${t.title}`).join('; ') + more(p2.length - 5) }));
  const overdue = open.filter(isOverdue);
  if (overdue.length) lines.push(tr('Overdue: {list}', { list: overdue.map((t) => `${t.id} (${t.due})`).join(', ') }));
  const queued = queueOf(config).map((id) => byId.get(id)).filter((t) => t && OPEN_STATUSES.includes(t.status));
  if (queued.length) {
    const qs = config.queue_settings || {};
    lines.push(tr('Queue of the user (takes precedence over works next): {list}.', { list: queued.slice(0, 6).map((t, i) => `${i + 1}. ${t.id} ${t.title}`).join('; ') + more(queued.length - 6) })
      + (qs.auto_next ? ` ${qs.ask_before ? tr('After finishing a task, start the next startable task from it, check briefly with the user first.') : tr('After finishing a task, start the next startable task from it.')}` : ''));
  }
  const know = knowledgeSummary(root);
  if (know) lines.push(know);
  const proposals = loadKnowledge(root).filter((e) => e.status === 'vorschlag').length;
  if (proposals) lines.push(proposals === 1 ? tr('One proposal for the project knowledge is waiting for the user.') : tr('{n} proposals for the project knowledge are waiting for the user.', { n: proposals }));
  const designOpen = open.filter((t) => { const d = designSummary(t); return d && d.variants && !d.chosen; });
  if (designOpen.length) lines.push(tr('Design variants without a choice by the user: {ids}. Implement only after the choice.', { ids: designOpen.map((t) => t.id).join(', ') }));
  const sprintLine = sprintSummaryLine(config, all);
  if (sprintLine) lines.push(sprintLine);
  const unread = open.map((t) => ({ t, n: unreadForClaude(root, t).length })).filter((x) => x.n);
  if (unread.length) lines.push(tr('New comments from the user: {list}. Read them with works comments <ID> and reply with works comment <ID> "...".', { list: unread.map((x) => `${x.t.id} (${x.n})`).join(', ') }));
  const active = state.active && byId.get(state.active);
  if (active && OPEN_STATUSES.includes(active.status)) {
    lines.push(tr('Active task: {id} {title} ({status}), file: .works/{file}', { id: active.id, title: active.title, status: STATUS_LABEL[active.status], file: relFromWorks(root, active._file) }));
    let h = stripComments(getSection(active._body, 'Übergabe') || '').trim();
    if (h) {
      if (h.length > maxHandoff) h = h.slice(0, maxHandoff) + `\n[${tr('shortened, complete in the task.md')}]`;
      lines.push(tr('Handoff:\n{text}', { text: h }));
    }
    const q = openQuestions(active);
    if (q.length) lines.push(tr('Open questions for the user: {list}', { list: q.map((x) => x.text).join('; ') }));
  } else {
    const inWork = open.filter((t) => t.status === 'in-arbeit');
    if (inWork.length) lines.push(tr('In progress: {list}', { list: inWork.map((t) => `${t.id} ${t.title}`).join('; ') }));
  }
  const inbox = path.join(worksDir(root), 'inbox');
  if (exists(inbox)) {
    const files = fs.readdirSync(inbox).filter((f) => !f.startsWith('.'));
    if (files.length) lines.push(files.length > 1 ? tr('The inbox contains {n} files that still need to be assigned to a task.', { n: files.length }) : tr('The inbox contains {n} file that still needs to be assigned to a task.', { n: files.length }));
  }
  return lines.join('\n');
}

export { STATUSES };
