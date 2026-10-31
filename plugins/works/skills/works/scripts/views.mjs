// Auswertungen: Index (WORKS.md), Empfehlungen, DoD-Prüfung, Session-Zusammenfassung.
import fs from 'node:fs';
import path from 'node:path';
import {
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

export function byIdMap(tasks) {
  return new Map(tasks.map((t) => [t.id, t]));
}

export function taskLink(root, t) {
  return `[${t.id}](${relFromWorks(root, t._file)})`;
}

function flags(t, byId) {
  const f = [];
  if (OPEN_STATUSES.includes(t.status) && isBlocked(t, byId)) f.push(`blockiert durch ${openBlockers(t, byId).join(', ')}`);
  if (isOverdue(t)) f.push(`überfällig seit ${t.due}`);
  if (t.incomplete) f.push('unvollständig');
  const q = openQuestions(t).length;
  if (q) f.push(`${q} offene Frage${q > 1 ? 'n' : ''}`);
  return f.join(', ');
}

function table(root, list, byId, cols = ['id', 'title', 'type', 'priority', 'status', 'effort', 'due', 'milestone', 'hint']) {
  if (!list.length) return '_Keine Einträge._\n';
  const head = {
    id: 'ID', title: 'Titel', type: 'Typ', priority: 'Prio', status: 'Status',
    effort: 'Aufwand', due: 'Fällig', milestone: 'Meilenstein', hint: 'Hinweise', completed: 'Erledigt am',
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
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => /^- \[I-\d+\]/.test(l) && !l.includes('~~')).length;
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
  out.push(`> Automatisch erzeugt am ${nowStamp()} durch \`works index\`. Nicht von Hand bearbeiten. Inhalte gehören in die task.md der jeweiligen Aufgabe.\n`);

  const cnt = (s) => open.filter((t) => t.status === s).length;
  out.push('## Überblick\n');
  out.push('| Backlog | Geplant | In Arbeit | Review | Blockiert | Überfällig | Erledigt | Verworfen |');
  out.push('|---|---|---|---|---|---|---|---|');
  out.push(`| ${cnt('backlog')} | ${cnt('geplant')} | ${cnt('in-arbeit')} | ${cnt('review')} | ${open.filter((t) => isBlocked(t, byId)).length} | ${open.filter(isOverdue).length} | ${done.length} | ${all.filter((t) => t.status === 'verworfen').length} |\n`);

  const prioLine = ['P1', 'P2', 'P3', 'P4'].map((p) => `${p} ${PRIO_LABEL[p]}: ${open.filter((t) => t.priority === p).length}`).join(' · ');
  out.push(`Offen nach Priorität: ${prioLine}\n`);

  if (state.active && byId.get(state.active)) {
    const a = byId.get(state.active);
    out.push('## Aktive Aufgabe\n');
    out.push(`${taskLink(root, a)} ${mdEscape(a.title)} (${STATUS_LABEL[a.status] || a.status})${state.last_handoff ? `, letzte Übergabe ${state.last_handoff}` : ''}\n`);
  }

  out.push('## Kritisch (P1)\n');
  out.push(table(root, open.filter((t) => t.priority === 'P1'), byId));

  out.push('## In Arbeit und Review\n');
  out.push(table(root, open.filter((t) => ['in-arbeit', 'review'].includes(t.status)), byId));

  out.push('## Geplant und Backlog\n');
  out.push(table(root, open.filter((t) => ['geplant', 'backlog'].includes(t.status)), byId));

  const ms = milestoneProgress(config, all);
  if (ms.length) {
    out.push('## Meilensteine\n');
    out.push('| ID | Titel | Fällig | Status | Fortschritt |');
    out.push('|---|---|---|---|---|');
    for (const m of ms) {
      out.push(`| ${m.id} | ${mdEscape(m.title)} | ${m.due || ''} | ${m.status || 'offen'} | ${m.done}/${m.total} (${m.pct} %) |`);
    }
    out.push('');
  }

  const blocked = open.filter((t) => isBlocked(t, byId));
  if (blocked.length) {
    out.push('## Blockiert\n');
    for (const t of blocked) out.push(`- ${taskLink(root, t)} ${mdEscape(t.title)}: wartet auf ${openBlockers(t, byId).join(', ')}`);
    out.push('');
  }

  const overdue = open.filter(isOverdue);
  if (overdue.length) {
    out.push('## Überfällig\n');
    for (const t of overdue) out.push(`- ${taskLink(root, t)} ${mdEscape(t.title)}: fällig am ${t.due}`);
    out.push('');
  }

  const incomplete = open.filter((t) => t.incomplete);
  if (incomplete.length) {
    out.push('## Unvollständig erfasst\n');
    for (const t of incomplete) out.push(`- ${taskLink(root, t)} ${mdEscape(t.title)}${t.source ? ` (Quelle: ${t.source})` : ''}`);
    out.push('');
  }

  const withQ = open.filter((t) => openQuestions(t).length);
  if (withQ.length) {
    out.push('## Offene Fragen\n');
    for (const t of withQ) {
      out.push(`- ${taskLink(root, t)} ${mdEscape(t.title)}`);
      for (const q of openQuestions(t)) out.push(`  - ${q.text}`);
    }
    out.push('');
  }

  const debt = open.filter((t) => t.type === 'debt');
  if (debt.length) {
    out.push('## Technische Schulden\n');
    out.push(table(root, debt, byId, ['id', 'title', 'priority', 'status', 'effort', 'due']));
  }

  const recent = [...done].sort((a, b) => String(b.completed || b.updated).localeCompare(String(a.completed || a.updated))).slice(0, 10);
  out.push('## Zuletzt erledigt\n');
  out.push(table(root, recent, byId, ['id', 'title', 'type', 'priority', 'completed']));

  const ideas = ideaCount(root);
  out.push('## Ideen\n');
  out.push(`${ideas} offene Idee${ideas === 1 ? '' : 'n'} in [ideas.md](ideas.md).\n`);

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
      if (t.status === 'geplant') { score += 30; reasons.push('bereits eingeplant'); }
      if (isOverdue(t)) { score += 80; reasons.push(`überfällig seit ${t.due}`); } else if (t.due) {
        const d = daysBetween(today(), String(t.due));
        if (d <= 7) { score += 40 - d * 3; reasons.push(`fällig in ${d} Tag${d === 1 ? '' : 'en'}`); }
      }
      const unblocks = all.filter((o) => (o.blocked_by || []).includes(t.id) && OPEN_STATUSES.includes(o.status)).length;
      if (unblocks) { score += unblocks * 25; reasons.push(`gibt ${unblocks} Aufgabe${unblocks > 1 ? 'n' : ''} frei`); }
      score += (3 - effortRank(t.effort)) * 8;
      if (t.effort) reasons.push(`Aufwand ${t.effort}`);
      if (t.risk === 'hoch') { score -= 5; reasons.push('Risiko hoch'); }
      if (t.incomplete) { score -= 40; reasons.push('erst vervollständigen'); }
      // Die Warteschlange des Nutzers hat Vorrang vor der berechneten Reihenfolge.
      if (inSprint.has(t.id)) { score += 1000; reasons.unshift(`im Sprint ${sprint.id}`); }
      const qi = queue.indexOf(t.id);
      if (qi !== -1) { score += 100000 - qi * 100; reasons.unshift(`Warteschlange Platz ${qi + 1}`); }
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
  if (crit.total === 0) auto.push({ ok: false, text: 'Akzeptanzkriterien sind definiert', detail: 'Abschnitt ist leer' });
  else auto.push({ ok: crit.done === crit.total, text: 'Alle Akzeptanzkriterien sind abgehakt', detail: `${crit.done}/${crit.total}` });

  const q = openQuestions(task);
  auto.push({ ok: q.length === 0, text: 'Keine offenen Fragen', detail: q.length ? q.map((x) => x.text).join('; ') : '' });

  const plan = checkboxes(getSection(body, 'Umsetzungsplan') || getSection(body, 'Checkliste') || getSection(body, 'Vorgehen') || '');
  if (plan.total) auto.push({ ok: plan.done === plan.total, text: 'Umsetzungsschritte abgeschlossen', detail: `${plan.done}/${plan.total}` });

  const tags = task.tags || [];
  const needsShots = task.type === 'design' || tags.includes('ui');
  if (needsShots) {
    const imgs = imageLinks(getSection(body, 'Assets') || '').map((i) => i.src.toLowerCase());
    const hasBefore = imgs.some((s) => /-(vorher|ist)(-\d+)?\.\w+$/.test(s));
    const hasAfter = imgs.some((s) => /-nachher(-\d+)?\.\w+$/.test(s));
    auto.push({ ok: hasBefore && hasAfter, text: 'Vorher und Nachher Screenshots vorhanden', detail: `vorher: ${hasBefore ? 'ja' : 'nein'}, nachher: ${hasAfter ? 'ja' : 'nein'}` });
  }
  if (task.type === 'design' || tags.includes('ui')) {
    const dec = path.join(task._dir, 'decisions.md');
    const filled = exists(dec) && hasContent(getSection(fs.readFileSync(dec, 'utf8'), 'Entscheidungen') || '');
    auto.push({ ok: filled, text: 'decisions.md enthält Entscheidungen', detail: exists(dec) ? '' : 'Datei fehlt' });
  }
  if (task.type === 'bug') auto.push({ ok: hasContent(getSection(body, 'Ursache')), text: 'Ursache ist dokumentiert', detail: '' });
  if (task.type === 'spike') {
    auto.push({ ok: hasContent(getSection(body, 'Ergebnisse')), text: 'Ergebnisse sind dokumentiert', detail: '' });
    auto.push({ ok: hasContent(getSection(body, 'Empfehlung')), text: 'Empfehlung ist dokumentiert', detail: '' });
  }
  if (task.type === 'refactor') auto.push({ ok: hasContent(getSection(body, 'Rollback')), text: 'Rollback ist beschrieben', detail: '' });
  if (task.type === 'debt') auto.push({ ok: hasContent(getSection(body, 'Rückzahlung')), text: 'Rückzahlung ist beschrieben', detail: '' });

  const chk = checkItems(root, config, task);
  auto.push(...chk.items);

  const manual = [...(config.dod.global || []), ...((config.dod.by_type || {})[task.type] || [])];
  for (const tag of tags) manual.push(...((config.dod.by_tag || {})[tag] || []));
  return { auto, manual: [...new Set(manual)], commands: config.dod.commands || [], checks: chk.state };
}

// ---------- Session-Zusammenfassung ----------

export function sessionSummary(root, { maxHandoff = 1500 } = {}) {
  const config = loadConfig(root);
  const state = loadState(root);
  const all = loadTasks(root, { archive: false });
  const byId = byIdMap(all);
  const open = sortTasks(all.filter((t) => OPEN_STATUSES.includes(t.status)));
  const lines = [];
  lines.push(`[works] Dieses Projekt verwaltet Aufgaben in .works/ (${open.length} offen). Vor Arbeit an Aufgaben den works Skill laden.`);
  const p1 = open.filter((t) => t.priority === 'P1');
  if (p1.length) lines.push(`Offene P1 Kritisch: ${p1.map((t) => `${t.id} ${t.title} (${STATUS_LABEL[t.status]})`).join('; ')}`);
  const p2 = open.filter((t) => t.priority === 'P2');
  if (p2.length) lines.push(`Offene P2 Hoch: ${p2.slice(0, 5).map((t) => `${t.id} ${t.title}`).join('; ')}${p2.length > 5 ? ` und ${p2.length - 5} weitere` : ''}`);
  const overdue = open.filter(isOverdue);
  if (overdue.length) lines.push(`Überfällig: ${overdue.map((t) => `${t.id} (${t.due})`).join(', ')}`);
  const queued = queueOf(config).map((id) => byId.get(id)).filter((t) => t && OPEN_STATUSES.includes(t.status));
  if (queued.length) {
    const qs = config.queue_settings || {};
    lines.push(`Warteschlange des Nutzers (hat Vorrang vor works next): ${queued.slice(0, 6).map((t, i) => `${i + 1}. ${t.id} ${t.title}`).join('; ')}${queued.length > 6 ? ` und ${queued.length - 6} weitere` : ''}.`
      + (qs.auto_next ? ` Nach einem Abschluss die nächste startbare Aufgabe daraus beginnen${qs.ask_before ? ', vorher kurz beim Nutzer nachfragen' : ''}.` : ''));
  }
  const know = knowledgeSummary(root);
  if (know) lines.push(know);
  const proposals = loadKnowledge(root).filter((e) => e.status === 'vorschlag').length;
  if (proposals) lines.push(`${proposals === 1 ? 'Ein Vorschlag' : `${proposals} Vorschläge`} für das Projektwissen ${proposals === 1 ? 'wartet' : 'warten'} auf den Nutzer.`);
  const designOpen = open.filter((t) => { const d = designSummary(t); return d && d.variants && !d.chosen; });
  if (designOpen.length) lines.push(`Entwürfe ohne Wahl des Nutzers: ${designOpen.map((t) => t.id).join(', ')}. Erst nach der Wahl umsetzen.`);
  const sprintLine = sprintSummaryLine(config, all);
  if (sprintLine) lines.push(sprintLine);
  const unread = open.map((t) => ({ t, n: unreadForClaude(root, t).length })).filter((x) => x.n);
  if (unread.length) lines.push(`Neue Kommentare vom Nutzer: ${unread.map((x) => `${x.t.id} (${x.n})`).join(', ')}. Mit works comments <ID> lesen und mit works comment <ID> "..." antworten.`);
  const active = state.active && byId.get(state.active);
  if (active && OPEN_STATUSES.includes(active.status)) {
    lines.push(`Aktive Aufgabe: ${active.id} ${active.title} (${STATUS_LABEL[active.status]}), Datei: .works/${relFromWorks(root, active._file)}`);
    let h = stripComments(getSection(active._body, 'Übergabe') || '').trim();
    if (h) {
      if (h.length > maxHandoff) h = h.slice(0, maxHandoff) + '\n[gekürzt, vollständig in der task.md]';
      lines.push(`Übergabe:\n${h}`);
    }
    const q = openQuestions(active);
    if (q.length) lines.push(`Offene Fragen an den Nutzer: ${q.map((x) => x.text).join('; ')}`);
  } else {
    const inWork = open.filter((t) => t.status === 'in-arbeit');
    if (inWork.length) lines.push(`In Arbeit: ${inWork.map((t) => `${t.id} ${t.title}`).join('; ')}`);
  }
  const inbox = path.join(worksDir(root), 'inbox');
  if (exists(inbox)) {
    const files = fs.readdirSync(inbox).filter((f) => !f.startsWith('.'));
    if (files.length) lines.push(`Inbox enthält ${files.length} Datei${files.length > 1 ? 'en' : ''}, die noch einer Aufgabe zugeordnet werden muss.`);
  }
  return lines.join('\n');
}

export { STATUSES };
