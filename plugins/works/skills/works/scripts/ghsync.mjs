// GitHub-Abgleich über das gh CLI: Pull Requests bewegen Aufgaben, CI wird zur Prüfung, Reviews werden
// zu Kommentaren, neue Issues zu Aufgaben, erledigte Aufgaben schließen ihr Issue. Alles läuft über das
// works CLI selbst, damit Verlauf und Prüfungen gleich bleiben. Änderungen tragen [GitHub] im Verlauf.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { worksDir, readJson, writeJson, loadTasks, loadConfig, OPEN_STATUSES } from './lib.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'works.mjs');
export const DEFAULT_SYNC = { enabled: true, pr_review: true, merge_done: true, ci_checks: true, review_comments: true, issues: true, labels: [], close_issues: true, interval_min: 2 };

export function syncSettings(config) { return { ...DEFAULT_SYNC, ...(config.github_sync || {}) }; }
const stateFile = (root) => path.join(worksDir(root), 'github.json');
export function syncState(root) { return readJson(stateFile(root), null); }

function gh(root, args, timeout = 15000) {
  const r = spawnSync('gh', args, { cwd: root, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout || '', err: (r.stderr || '') + (r.error ? r.error.message : '') };
}

function works(root, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', timeout: 60000, env: { ...process.env, WORKS_ACTOR: 'GitHub' } });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function tmp(root, text) {
  const dir = path.join(worksDir(root), '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `gh-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  fs.writeFileSync(f, text);
  return f;
}

function idIn(config, text) {
  const prefix = String(config.id_prefix || 'W').replace(/[^A-Za-z]/g, '');
  const m = String(text || '').match(new RegExp(`\\b(${prefix})-?(\\d{1,6})\\b`, 'i'));
  if (!m) return null;
  return `${m[1].toUpperCase()}-${String(parseInt(m[2], 10)).padStart(config.id_digits || 4, '0')}`;
}

function ciState(rollup) {
  const list = Array.isArray(rollup) ? rollup : [];
  if (!list.length) return null;
  const st = list.map((c) => String(c.conclusion || c.state || c.status || '').toUpperCase());
  if (st.some((s) => ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED'].includes(s))) return { status: 'fail', failing: list.filter((c) => ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED'].includes(String(c.conclusion || c.state || '').toUpperCase())).map((c) => c.name || c.context).filter(Boolean) };
  if (st.some((s) => ['PENDING', 'QUEUED', 'IN_PROGRESS', 'EXPECTED', ''].includes(s))) return { status: 'pending' };
  return { status: 'ok', count: list.length };
}

export function syncGithub(root, { log = () => {} } = {}) {
  const config = loadConfig(root);
  const set = syncSettings(config);
  if (!set.enabled) return { skipped: 'abgeschaltet' };
  const repo = gh(root, ['repo', 'view', '--json', 'nameWithOwner'], 8000);
  if (!repo.ok) return { skipped: /not found|command not found|ENOENT/i.test(repo.err) ? 'gh ist nicht installiert' : 'kein GitHub-Repository oder gh nicht angemeldet' };
  const name = (() => { try { return JSON.parse(repo.out).nameWithOwner; } catch { return ''; } })();
  const prev = syncState(root);
  const first = !prev;
  const state = prev || { since: new Date().toISOString(), prs: {}, issues: {}, closed: [] };
  state.repo = name;
  const events = [];
  const ev = (text) => { events.push({ at: new Date().toISOString(), text }); log(text); };
  const byId = () => new Map(loadTasks(root).map((t) => [t.id, t]));

  // ---------- Pull Requests ----------
  const prs = gh(root, ['pr', 'list', '--state', 'all', '--limit', '40', '--json', 'number,title,headRefName,state,url,mergedAt,reviewDecision,statusCheckRollup,updatedAt']);
  if (prs.ok) {
    let list = [];
    try { list = JSON.parse(prs.out); } catch { list = []; }
    for (const pr of list) {
      const id = idIn(config, pr.title) || idIn(config, pr.headRefName);
      const key = String(pr.number);
      const old = state.prs[key] || {};
      const ci = ciState(pr.statusCheckRollup);
      const now = { id, state: pr.state, review: pr.reviewDecision || '', ci: ci ? ci.status : '', url: pr.url, title: pr.title, updated: pr.updatedAt };
      state.prs[key] = now;
      if (!id || first) continue;
      const t = byId().get(id);
      if (!t) continue;
      if (set.pr_review && pr.state === 'OPEN' && old.state !== 'OPEN' && t.status === 'in-arbeit') {
        const r = works(root, ['set', id, 'status=review', `--reason=PR #${pr.number} geöffnet`]);
        if (r.ok) ev(`PR #${pr.number} geöffnet: ${id} nach Review`);
      }
      if (set.ci_checks && ci && ci.status !== 'pending' && ci.status !== old.ci) {
        const r = works(root, ['checks', 'record', id, 'ci', `--status=${ci.status}`, `--note=${ci.status === 'ok' ? `GitHub CI: ${ci.count} Checks grün (PR #${pr.number})` : `GitHub CI fehlgeschlagen: ${ci.failing.join(', ') || 'siehe PR'} (PR #${pr.number})`}`]);
        if (r.ok) ev(`CI für PR #${pr.number}: ${ci.status === 'ok' ? 'grün' : 'fehlgeschlagen'}, als Prüfung bei ${id}`);
      }
      if (set.review_comments && pr.reviewDecision === 'CHANGES_REQUESTED' && old.review !== 'CHANGES_REQUESTED') {
        const v = gh(root, ['pr', 'view', String(pr.number), '--json', 'reviews']);
        let body = '';
        try { const rv = JSON.parse(v.out).reviews.filter((x) => x.state === 'CHANGES_REQUESTED').pop(); body = rv ? `${rv.author ? rv.author.login : 'Reviewer'}: ${rv.body || '(ohne Text, Kommentare im PR)'}` : ''; } catch { /* ohne Text */ }
        const f = tmp(root, `Änderungswunsch im Review von PR #${pr.number} (${pr.url}):\n\n${body || 'Siehe Kommentare im PR.'}`);
        works(root, ['comment', id, `--file=${f}`, '--as=Nutzer']);
        fs.rmSync(f, { force: true });
        if (t.status === 'review') works(root, ['set', id, 'status=in-arbeit', `--reason=Änderungswunsch im Review von PR #${pr.number}`]);
        ev(`Änderungswunsch zu PR #${pr.number} als Kommentar an ${id}`);
      }
      if (set.merge_done && pr.state === 'MERGED' && old.state && old.state !== 'MERGED' && OPEN_STATUSES.includes(t.status)) {
        const d = works(root, ['done', id, '--confirm', '--no-checks']);
        if (d.ok) ev(`PR #${pr.number} gemergt: ${id} abgeschlossen`);
        else {
          if (t.status !== 'review') works(root, ['set', id, 'status=review', `--reason=PR #${pr.number} gemergt`]);
          const f = tmp(root, `PR #${pr.number} ist gemergt, aber die Definition of Done ist noch nicht erfüllt. Bitte die offenen Punkte erledigen und dann works done ${id} ausführen.\n\n${(d.out || d.err).split('\n').filter((l) => /^\s*(\[ \]|✗|!|-)/.test(l)).slice(0, 10).join('\n')}`);
          works(root, ['comment', id, `--file=${f}`, '--as=Nutzer']);
          fs.rmSync(f, { force: true });
          ev(`PR #${pr.number} gemergt: ${id} in Review, Definition of Done offen`);
        }
      }
    }
  }

  // ---------- Issues ----------
  if (set.issues) {
    const iss = gh(root, ['issue', 'list', '--state', 'open', '--limit', '40', '--json', 'number,title,body,labels,url,createdAt']);
    let list = [];
    try { list = iss.ok ? JSON.parse(iss.out) : []; } catch { list = []; }
    const known = new Set(Object.keys(state.issues));
    for (const i of list) {
      const key = String(i.number);
      if (known.has(key)) continue;
      const labels = (i.labels || []).map((l) => l.name);
      if (first || i.createdAt < state.since) { state.issues[key] = ''; continue; }
      if (set.labels.length && !labels.some((l) => set.labels.includes(l))) { state.issues[key] = ''; continue; }
      const type = labels.some((l) => /bug|fehler/i.test(l)) ? 'bug' : 'feature';
      const prio = labels.some((l) => /p1|critical|kritisch/i.test(l)) ? 'P1' : labels.some((l) => /p2|high|hoch/i.test(l)) ? 'P2' : 'P3';
      const f = tmp(root, `${(i.body || '').trim()}\n\nQuelle: GitHub Issue #${i.number} ${i.url}`.trim());
      const r = works(root, ['new', `--type=${type}`, `--title=${String(i.title).slice(0, 150)}`, `--priority=${prio}`, `--description-file=${f}`, `--source=github:#${i.number}`, '--incomplete']);
      fs.rmSync(f, { force: true });
      const newId = (r.out.match(/Angelegt: (\S+)/) || [])[1] || '';
      state.issues[key] = newId;
      if (newId) ev(`Issue #${i.number} als ${newId} angelegt`);
    }
  }
  if (set.close_issues && !first) {
    const tasks = byId();
    for (const [num, id] of Object.entries(state.issues)) {
      if (!id || state.closed.includes(num)) continue;
      const t = tasks.get(id);
      if (!t || t.status !== 'erledigt') continue;
      const c = gh(root, ['issue', 'close', num, '--comment', `Erledigt in ${id} (works).`]);
      if (c.ok || /already closed/i.test(c.err)) { state.closed.push(num); ev(`Issue #${num} geschlossen, ${id} ist erledigt`); }
    }
  }
  state.last = new Date().toISOString();
  state.events = [...events, ...(prev && prev.events ? prev.events : [])].slice(0, 40);
  writeJson(stateFile(root), state);
  return { repo: name, events, first };
}

// Für Pull-Request-Links in der Aufgabe: zuletzt gesehener PR zur ID.
export function prsFor(root, id) {
  const st = syncState(root);
  if (!st) return [];
  return Object.entries(st.prs).filter(([, p]) => p.id === id).map(([n, p]) => ({ number: +n, ...p })).sort((a, b) => b.number - a.number);
}

export const homeDir = os.homedir();
