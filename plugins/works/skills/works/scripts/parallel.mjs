// Parallelarbeit: mehrere Aufgaben gleichzeitig in eigenen Git-Worktrees, je ein Agent pro Aufgabe.
// works plant (geht das parallel?), legt Worktrees an, schreibt den Auftrag für den Agenten und räumt auf.
// Claude entscheidet anhand von plan, ob es Agenten startet, nacheinander arbeitet oder den Nutzer fragt.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  worksDir, readJson, writeJson, exists, loadTasks, loadConfig, isBlocked, getSection, stripComments,
  checkboxes, openQuestions, OPEN_STATUSES, slugify, BRANCH_PREFIX, sectionTitle,
} from './lib.mjs';
import { tr } from './i18n.mjs';
import { taskFiles } from './files.mjs';
import { loadDesign, needsDesign } from './design.mjs';
import { knowledgeSummary } from './knowledge.mjs';
import { checksFor } from './checks.mjs';

export const LINK_FILE = '.works.link';
const lanesFile = (root) => path.join(worksDir(root), 'lanes.json');
export const DEFAULT_PARALLEL = { max: 3, dir: '', min_effort: 'M' };

export function parallelSettings(config) { return { ...DEFAULT_PARALLEL, ...(config.parallel || {}) }; }
export function loadLanes(root) { return (readJson(lanesFile(root), { lanes: [] }) || { lanes: [] }).lanes || []; }
function saveLanes(root, lanes) { writeJson(lanesFile(root), { lanes }); }
export function laneOf(root, id) { return loadLanes(root).find((l) => l.task === id) || null; }

function git(cwd, args, { timeout = 30000, allowFail = true } = {}) {
  try {
    return { ok: true, out: execFileSync('git', args, { cwd, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }) };
  } catch (e) {
    if (!allowFail) throw new Error(String(e.stderr || e.message).trim());
    return { ok: false, out: String(e.stdout || ''), err: String(e.stderr || e.message).trim() };
  }
}

export function branchFor(t) {
  let prefix = BRANCH_PREFIX[t.type] || 'feature';
  if (t.type === 'bug' && t.priority === 'P1') prefix = 'hotfix';
  return t.branch || `${prefix}/${t.id.toLowerCase()}-${slugify(t.title, 30)}`;
}

function lanesDir(root, config) {
  const s = parallelSettings(config);
  if (s.dir) return path.resolve(root, s.dir);
  return path.join(path.dirname(root), `${path.basename(root)}.works-lanes`);
}

// Dateipfade, die in Beschreibung und Plan erwähnt werden, zum Beispiel src/commands/backup.ts.
const dirOf = (f) => f.split('/').slice(0, -1).join('/');

const EFF = { S: 1, M: 2, L: 3, XL: 4 };

// Prüft, ob die Aufgaben gleichzeitig laufen können. Ergebnis: parallel, nacheinander oder unsicher, mit Gründen.
export function planParallel(root, { ids = [], max } = {}) {
  const config = loadConfig(root);
  const set = parallelSettings(config);
  const limit = Math.max(1, Math.min(6, parseInt(max || set.max, 10) || 3));
  const all = loadTasks(root, { archive: false });
  const byId = new Map(loadTasks(root).map((t) => [t.id, t]));
  const lanes = loadLanes(root);
  const laneIds = new Set(lanes.map((l) => l.task));
  const notes = [];

  // Git-Voraussetzungen
  const inside = git(root, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok) return { verdict: 'nacheinander', reasons: [tr('Not a Git repository. Parallel work needs worktrees.')], lanes: [], skipped: [], pairs: [] };
  const head = git(root, ['rev-parse', '--verify', 'HEAD']);
  if (!head.ok) return { verdict: 'nacheinander', reasons: [tr('The repository has no commit yet.')], lanes: [], skipped: [], pairs: [] };
  const dirty = (git(root, ['status', '--porcelain', '--untracked-files=no']).out || '').split('\n').filter((l) => l.trim() && !/\s\.works\//.test(l));
  if (dirty.length) notes.push(dirty.length === 1
    ? tr('{n} changed file is not committed. Worktrees start from the last commit and do not see these changes.', { n: 1 })
    : tr('{n} changed files are not committed. Worktrees start from the last commit and do not see these changes.', { n: dirty.length }));

  // Kandidaten: angegebene IDs, sonst Warteschlange, Sprint und die besten Vorschläge.
  let cand = ids.length ? ids.map((id) => byId.get(id)).filter(Boolean) : [];
  if (!ids.length) {
    const queue = (config.queue || []).map((id) => byId.get(id)).filter(Boolean);
    const sprint = (config.sprints || []).find((s) => s.status === 'aktiv');
    const inSprint = sprint ? (sprint.tasks || []).map((id) => byId.get(id)).filter(Boolean) : [];
    const rest = all.filter((t) => ['backlog', 'geplant'].includes(t.status)).sort((a, b) => a.priority.localeCompare(b.priority));
    cand = [...new Map([...queue, ...inSprint, ...rest].map((t) => [t.id, t])).values()];
  }
  const skipped = [];
  const ok = [];
  for (const t of cand) {
    const why = [];
    if (!OPEN_STATUSES.includes(t.status) || t.status === 'review') why.push(`Status ${t.status}`);
    if (laneIds.has(t.id)) why.push(tr('already running in parallel'));
    if (isBlocked(t, byId)) why.push(tr('blocked'));
    if (t.incomplete) why.push(tr('incomplete, needs details from the user'));
    if (openQuestions(t).length) why.push(tr('open questions'));
    if (!checkboxes(getSection(t._body, 'Akzeptanzkriterien') || '').total && ['feature', 'bug', 'design', 'refactor'].includes(t.type)) why.push(tr('no acceptance criteria'));
    if (needsDesign(t)) { const d = loadDesign(t); if (!d || !d.chosen) why.push(tr('design without a chosen variant')); }
    if (why.length) { if (ids.length || ok.length < limit * 2) skipped.push({ id: t.id, title: t.title, why }); continue; }
    ok.push(t);
  }

  // Paarweise Konflikte
  const info = new Map(ok.map((t) => {
    const files = taskFiles(root, config, t);
    return [t.id, { files, dirs: new Set(files.map(dirOf).filter(Boolean)) }];
  }));
  const dependsOn = (a, b, seen = new Set()) => {
    if (seen.has(a.id)) return false; seen.add(a.id);
    for (const x of a.blocked_by || []) { if (x === b.id) return true; const n = byId.get(x); if (n && dependsOn(n, b, seen)) return true; }
    return false;
  };
  const pairs = [];
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    const a = ok[i]; const b = ok[j];
    const A = info.get(a.id); const B = info.get(b.id);
    let level = 'frei'; const why = [];
    if (dependsOn(a, b) || dependsOn(b, a) || (a.blocks || []).includes(b.id) || (b.blocks || []).includes(a.id)) { level = 'hart'; why.push(tr('depend on each other')); }
    const sameFiles = A.files.filter((f) => B.files.includes(f));
    if (sameFiles.length) { level = 'hart'; why.push(tr('same files: {list}', { list: sameFiles.slice(0, 3).join(', ') })); }
    if (level !== 'hart') {
      const sameDirs = [...A.dirs].filter((d) => B.dirs.has(d));
      const sameTags = (a.tags || []).filter((x) => (b.tags || []).includes(x));
      if (sameDirs.length) { level = 'weich'; why.push(tr('same folder: {list}', { list: sameDirs.slice(0, 2).join(', ') })); }
      else if (!A.files.length && !B.files.length && sameTags.length) { level = 'weich'; why.push(tr('same area (#{tags}), no files known', { tags: sameTags.join(', #') })); }
      if ((a.related || []).includes(b.id) || (b.related || []).includes(a.id)) { level = 'weich'; why.push(tr('marked as related')); }
    }
    pairs.push({ a: a.id, b: b.id, level, why });
  }
  const conflict = (x, y) => pairs.find((p) => (p.a === x && p.b === y) || (p.a === y && p.b === x));

  // Gruppe ohne harte Konflikte in Reihenfolge der Kandidaten
  const lanesPick = [];
  for (const t of ok) {
    if (lanesPick.length >= limit) break;
    if (lanesPick.every((l) => conflict(l.id, t.id).level !== 'hart')) lanesPick.push(t);
  }
  const weak = pairs.filter((p) => p.level === 'weich' && lanesPick.some((t) => t.id === p.a) && lanesPick.some((t) => t.id === p.b));
  const effort = lanesPick.reduce((s, t) => s + (EFF[t.effort] || 2), 0);
  const minEff = EFF[set.min_effort] || 2;
  const reasons = [...notes];
  let verdict;
  if (lanesPick.length < 2) {
    verdict = 'nacheinander';
    reasons.unshift(ok.length < 2 ? tr('Fewer than two tasks are ready for an agent.') : tr('The ready tasks depend on each other or change the same files.'));
  } else if (lanesPick.every((t) => (EFF[t.effort] || 2) < minEff) && lanesPick.length < 3) {
    verdict = 'nacheinander';
    reasons.unshift(tr('The tasks are small. One after another is faster than setting up worktrees and agents.'));
  } else if (weak.length || dirty.length) {
    verdict = 'unsicher';
    for (const p of weak) reasons.push(tr('{a} and {b}: {why}', { a: p.a, b: p.b, why: p.why.join(', ') }));
  } else {
    verdict = 'parallel';
    reasons.unshift(tr('{n} tasks without shared files or dependencies, about effort {effort} in total.', { n: lanesPick.length, effort }));
  }
  return {
    verdict, reasons, lanes: lanesPick.map((t) => ({ id: t.id, title: t.title, effort: t.effort || '', files: info.get(t.id).files.slice(0, 8) })),
    later: ok.filter((t) => !lanesPick.includes(t)).map((t) => ({ id: t.id, title: t.title })), skipped, pairs, running: lanes.map((l) => l.task),
  };
}

// Legt Worktree und Branch an. Der Worktree bekommt eine .works.link, damit das works CLI dort
// immer die .works des Hauptprojekts nutzt.
export function startLane(root, t) {
  const config = loadConfig(root);
  if (laneOf(root, t.id)) throw new Error(tr('{id} is already running in parallel.', { id: t.id }));
  const base = (git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).out || '').trim() || 'HEAD';
  const branch = branchFor(t);
  const dir = path.join(lanesDir(root, config), `${t.id}-${slugify(t.title, 24)}`);
  if (exists(dir)) throw new Error(tr('Folder {dir} already exists. Clean up with works parallel abort {id}.', { dir, id: t.id }));
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const has = git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).ok;
  const r = git(root, has ? ['worktree', 'add', dir, branch] : ['worktree', 'add', '-b', branch, dir, 'HEAD']);
  if (!r.ok) throw new Error(tr('git worktree add failed: {err}', { err: r.err }));
  fs.writeFileSync(path.join(dir, LINK_FILE), JSON.stringify({ root, task: t.id, branch }, null, 2) + '\n');
  // .works.link nie committen: gilt für alle Worktrees über info/exclude im gemeinsamen Git-Ordner.
  const common = (git(root, ['rev-parse', '--git-common-dir']).out || '.git').trim();
  const ex = path.resolve(root, common, 'info', 'exclude');
  try {
    fs.mkdirSync(path.dirname(ex), { recursive: true });
    const cur = exists(ex) ? fs.readFileSync(ex, 'utf8') : '';
    if (!cur.split('\n').includes(LINK_FILE)) fs.appendFileSync(ex, (cur && !cur.endsWith('\n') ? '\n' : '') + LINK_FILE + '\n');
  } catch { /* nicht kritisch */ }
  const lane = { task: t.id, branch, path: dir, base, started: new Date().toISOString(), status: 'aktiv' };
  saveLanes(root, [...loadLanes(root), lane]);
  return lane;
}

export function laneInfo(root, lane) {
  const ex = exists(lane.path);
  const dirty = ex ? (git(lane.path, ['status', '--porcelain']).out || '').split('\n').filter((l) => l.trim() && !l.endsWith(LINK_FILE)).length : 0;
  const ahead = ex ? parseInt((git(root, ['rev-list', '--count', `${lane.base}..${lane.branch}`]).out || '0').trim(), 10) || 0 : 0;
  return { ...lane, exists: ex, dirty, ahead };
}

export function setLaneStatus(root, id, status, extra = {}) {
  const lanes = loadLanes(root);
  const l = lanes.find((x) => x.task === id);
  if (l) { Object.assign(l, { status, ...extra }); saveLanes(root, lanes); }
}

// Worktree entfernen. merge: Branch mit --no-ff in den Basis-Branch des Hauptprojekts übernehmen.
export function finishLane(root, id, { merge = false, force = false } = {}) {
  const lane = laneOf(root, id);
  if (!lane) throw new Error(tr('{id} is not running in parallel.', { id }));
  const li = laneInfo(root, lane);
  if (li.exists && li.dirty && !force) throw new Error(tr('In the worktree of {id}, {n} files are not committed ({path}). Commit them first or discard them with --force.', { id, n: li.dirty, path: lane.path }));
  let merged = false;
  if (merge) {
    if (!li.ahead) throw new Error(tr('{branch} has no new commits compared to {base}.', { branch: lane.branch, base: lane.base }));
    const cur = (git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).out || '').trim();
    if (cur !== lane.base) throw new Error(tr('The main project is on {cur}, not on {base}. Switch first or finish without --merge.', { cur, base: lane.base }));
    const dirtyMain = (git(root, ['status', '--porcelain', '--untracked-files=no']).out || '').split('\n').filter((l) => l.trim() && !/\s\.works\//.test(l));
    if (dirtyMain.length) throw new Error(tr('The main project has uncommitted changes. Commit or stash them first.'));
    const m = git(root, ['merge', '--no-ff', '--no-edit', lane.branch], { timeout: 60000 });
    if (!m.ok) {
      git(root, ['merge', '--abort']);
      setLaneStatus(root, id, 'konflikt');
      throw new Error(tr('Merge of {branch} has conflicts and was aborted. The worktree stays. Resolve the conflict in the worktree (git merge {base}) and try again.', { branch: lane.branch, base: lane.base }));
    }
    merged = true;
  }
  if (li.exists) {
    const r = git(root, ['worktree', 'remove', ...(force ? ['--force'] : []), lane.path]);
    if (!r.ok) {
      try { fs.rmSync(path.join(lane.path, LINK_FILE), { force: true }); } catch { /* egal */ }
      const r2 = git(root, ['worktree', 'remove', '--force', lane.path]);
      if (!r2.ok) throw new Error(tr('The worktree could not be removed: {err}', { err: r2.err }));
    }
  }
  git(root, ['worktree', 'prune']);
  if (merged) git(root, ['branch', '-d', lane.branch]);
  saveLanes(root, loadLanes(root).filter((l) => l.task !== id));
  return { lane: li, merged };
}

// Abbrechen: Worktree weg, Branch nur löschen, wenn er keine eigenen Commits hat.
export function abortLane(root, id, { force = false } = {}) {
  const lane = laneOf(root, id);
  if (!lane) throw new Error(tr('{id} is not running in parallel.', { id }));
  const li = laneInfo(root, lane);
  if (li.exists && li.dirty && !force) throw new Error(tr('In the worktree, {n} files are not committed. Discard them anyway with --force.', { n: li.dirty }));
  if (li.exists) git(root, ['worktree', 'remove', '--force', lane.path]);
  git(root, ['worktree', 'prune']);
  let branchKept = true;
  if (!li.ahead) { git(root, ['branch', '-D', lane.branch]); branchKept = false; }
  saveLanes(root, loadLanes(root).filter((l) => l.task !== id));
  return { lane: li, branchKept };
}

// Auftrag für den Agenten einer Bahn. Enthält alles, was er braucht, ohne den Gesprächsverlauf zu kennen.
export function lanePrompt(root, t, lane, cli) {
  const desc = stripComments(getSection(t._body, 'Beschreibung') || getSection(t._body, 'Ziel') || '').trim();
  const crit = checkboxes(getSection(t._body, 'Akzeptanzkriterien') || '').items;
  const plan = checkboxes(getSection(t._body, 'Umsetzungsplan') || '').items;
  const hand = stripComments(getSection(t._body, 'Übergabe') || '').trim();
  const know = knowledgeSummary(root, 1500);
  const d = needsDesign(t) ? loadDesign(t) : null;
  const w = `node "${cli}"`;
  const v = { w, id: t.id, path: lane.path, branch: lane.branch, base: lane.base };
  const list = (items) => items.map((c, i) => `${i + 1}. [${c.done ? 'x' : ' '}] ${c.text}`).join('\n');
  return [
    tr('You work alone on task {id} "{title}" ({info}).', { id: t.id, title: t.title, info: `${t.type}, ${t.priority}${t.effort ? `, ${tr('effort {effort}', { effort: t.effort })}` : ''}` }),
    tr('Other agents work on other tasks at the same time in their own worktrees. Stay strictly in yours.'),
    '',
    `## ${tr('Where you work')}`,
    `- Worktree: ${lane.path}`,
    tr('- Branch: {branch} (branched off {base})', v),
    tr('- Start every command with `cd "{path}" && ...` and only read and change files below this folder. Use absolute paths.', v),
    tr('- The works CLI: `{w} <command>`. In the worktree it automatically writes to the tasks of the main project.', v),
    '',
    `## ${tr('Task')}`,
    desc || tr('(no description)'),
    crit.length ? `\n## ${sectionTitle('Akzeptanzkriterien', t._body)}\n${list(crit)}` : '',
    plan.length ? `\n## ${sectionTitle('Umsetzungsplan', t._body)}\n${list(plan)}` : '',
    hand ? `\n## ${tr('Last handoff')}\n${hand.slice(0, 1500)}` : '',
    d && d.chosen ? `\n## ${sectionTitle('Gewählter Entwurf', t._body)}\n${tr('Variant {name}. Details: {w} design show {id}', { ...v, name: d.chosen.name })}` : '',
    know ? `\n## ${tr('Project knowledge')}\n${know}\n${tr('Details: {w} know search <term>', v)}` : '',
    '',
    `## ${tr('Rules')}`,
    tr('1. First read `{w} show {id}`. The description and the comments by the user are binding.', v),
    tr('2. Do not run: works start, works done, works init, works board, works parallel, git push, git merge, git checkout of another branch.'),
    tr('3. Record progress: `{w} check {id} <no>` for met criteria, `{w} check {id} <no> --section=Umsetzungsplan` for steps, `{w} log {id} "..."` for important steps.', v),
    tr('4. Commits in the branch carry the ID, for example `feat({id}): ...`. Nothing may stay uncommitted at the end.', v),
    tr('5. If something is unclear or you have to make a decision the user should make: `{w} question {id} "..."`, do not guess, and come back with this question as the result.', v),
    checksFor(loadConfig(root), t).length
      ? tr('6. Run the checks with `{w} checks run {id}` (they run in this worktree). Fix errors and findings and check again. Run skill checks yourself and record them with `{w} checks record {id} <name> --status=ok|warn|fail --note="..."`.', v)
      : tr('6. Run the tests and checks of the project in the worktree, if there are any.'),
    tr('7. At the end: `{w} handoff {id} --text "..."` (state, what is open), then `{w} set {id} status=review --reason="Agent done"`.', v),
    // Leerzeile davor über \n, weil leere Einträge unten herausfallen.
    `\n${tr('Reply at the end with: what is implemented, which criteria are met, commits, open points or questions.')}`,
  ].filter((x) => x !== null && x !== '').join('\n').replace(/\n(## )/g, '\n\n$1');
}
