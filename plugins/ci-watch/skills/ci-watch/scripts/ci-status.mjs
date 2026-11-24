#!/usr/bin/env node
// CI-Wächter: wartet auf die GitHub-Actions-Läufe zu einem Commit und meldet grün oder rot, bei rot mit Job,
// Schritt und Fehlerstelle. Braucht kein gh: öffentliche GitHub-API, ein Token aus GITHUB_TOKEN oder GH_TOKEN
// nur, wenn vorhanden (immer im Header, nie in der URL).
//
// node ci-status.mjs [--sha <commit>] [--repo owner/name] [--timeout 20] [--interval 30] [--grace 3]
//   --timeout  Minuten, so lange wird höchstens gewartet (Standard 20)
//   --interval Sekunden zwischen zwei Abfragen, mindestens 30 (Standard 30 mit Token, sonst 60:
//              ohne Token erlaubt GitHub nur 60 Abfragen pro Stunde)
//   --grace    Minuten, so lange darf nach dem Start noch kein Lauf existieren (Standard 3)
//   --no-bug   bei rot keinen Bug in works anlegen
// Exit: 0 grün, 1 rot, 2 kein Lauf oder Zeitlimit, 3 Fehler (etwa kein GitHub-Repo, Rate-Limit).
// Bei rot legt der Wächter in einem Projekt mit .works einen Bug an (P2) oder ergänzt den offenen zum selben Schritt.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { tr, languages } from './i18n.mjs';

export function repoFromUrl(url) {
  const m = String(url).trim().match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/);
  return m ? m[1] : '';
}

// Die Zeilen um die erste Fehlermeldung eines Job-Logs, ohne Zeitstempel. Höchstens before Zeilen davor.
export function errorExcerpt(log, before = 15) {
  const lines = String(log).split(/\r?\n/).map((l) => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, ''));
  const i = lines.findIndex((l) => l.includes('##[error]'));
  if (i < 0) return lines.filter(Boolean).slice(-before).join('\n');
  return lines.slice(Math.max(0, i - before), i + 1).map((l) => l.replace('##[error]', tr('Error: '))).join('\n');
}

// Fehler-Annotationen eines Jobs als Zeilen. Gibt GitHub auch ohne Token heraus, anders als die Logs.
// Annotationen auf .github zeigen nur auf den Workflow, dort zählt allein die Meldung.
export function failureLines(annotations) {
  return (annotations || []).filter((a) => a.annotation_level === 'failure').map((a) => {
    const msg = `${a.title ? `${a.title}: ` : ''}${a.message}`;
    return !a.path || a.path.startsWith('.github') ? msg : `${a.path}:${a.start_line} ${msg}`;
  });
}

// W-0027: Bug aus den roten Jobs. Der Titel ist je Workflow und Schritt gleich, damit derselbe Fehler
// bei jedem weiteren roten Commit den offenen Bug ergänzt statt einen neuen anzulegen.
export function bugFor({ repo, sha, failures }) {
  const f = failures[0] || { run: 'CI', job: '', steps: [] };
  const steps = [...new Set(failures.flatMap((x) => x.steps))];
  const titleIn = (lang) => (steps.length ? tr('CI red: {run}, step {steps}', { run: f.run, steps: steps.join(', ') }, lang) : tr('CI red: {run}, job {job}', { run: f.run, job: f.job }, lang));
  const title = titleIn();
  const jobs = failures.map((x) => (x.steps.length ? tr('- {job} (step {steps}): {url}', { job: x.job, steps: x.steps.join(', '), url: x.url }) : `- ${x.job}: ${x.url}`)).join('\n');
  const log = [...new Set(failures.flatMap((x) => [...x.lines, ...(x.excerpt ? [x.excerpt] : [])]))].join('\n');
  const description = tr('Created by the CI watcher: CI red for commit {sha} in {repo}.\n\nFailed jobs:\n{jobs}\n\nThe error location is under Logs, as far as GitHub provides it (without GITHUB_TOKEN only the annotations). The links show the full log.', { sha: sha.slice(0, 7), repo, jobs });
  return { title, titles: languages().map(titleIn), description, log, jobs: failures.map((x) => x.job).join(', ') };
}

// works-CLI: im Repo nebenan (plugins/works), sonst aus der Plugin-Installation.
export function findWorksCli() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const rel = path.join('skills', 'works', 'scripts', 'works.mjs');
  const local = path.resolve(here, '..', '..', '..', '..', 'works', rel);
  if (fs.existsSync(local)) return local;
  try {
    const reg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'), 'utf8'));
    const entries = Object.entries(reg.plugins || {}).filter(([k]) => k.split('@')[0] === 'works').flatMap(([, v]) => (Array.isArray(v) ? v : [v]));
    for (const e of entries) if (e && e.installPath && fs.existsSync(path.join(e.installPath, rel))) return path.join(e.installPath, rel);
  } catch { /* keine Installation */ }
  return null;
}

function worksRoot(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.works', 'config.json'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

// Legt den Bug an oder ergänzt den offenen mit gleichem Titel. null ohne .works oder works-CLI.
// Meldet das CI-Ergebnis an den Discord-Bot von works (W-0036). works legt es nur ab, wenn der Bot eingerichtet ist,
// und wartet nie auf Discord. false ohne .works oder works-CLI.
export function notifyWorks({ cwd = process.cwd(), data, cli = findWorksCli(), env = process.env }) {
  const root = worksRoot(cwd);
  if (!root || !cli) return false;
  const r = spawnSync(process.execPath, [cli, 'discord', 'emit', 'ci', `--json=${JSON.stringify(data)}`], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  return r.status === 0;
}

// Rückgabe { action: 'neu' | 'ergänzt' | 'bekannt', id }.
export function fileBug({ cwd = process.cwd(), bug, sha, cli = findWorksCli(), env = process.env }) {
  const root = worksRoot(cwd);
  if (!root || !cli) return null;
  const works = (args) => spawnSync(process.execPath, [cli, ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  const short = sha.slice(0, 7);
  let open = [];
  try { open = JSON.parse(works(['list', '--json']).stdout || '[]'); } catch { return null; }
  // Ein offener Bug zählt auch, wenn er unter einer anderen Sprache angelegt wurde.
  const titles = bug.titles || [bug.title];
  const known = open.find((t) => t.type === 'bug' && titles.includes(t.title));
  if (known) {
    if ((works(['show', known.id]).stdout || '').includes(short)) return { action: 'bekannt', id: known.id };
    works(['log', known.id, tr('CI red again for {sha}: {jobs}', { sha: short, jobs: bug.jobs })]);
    return { action: 'ergänzt', id: known.id };
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-watch-'));
  try {
    const logFile = path.join(tmp, 'ci.log');
    fs.writeFileSync(logFile, bug.log || tr('No error location fetched.'));
    const r = works(['new', '--type', 'bug', '--priority', 'P2', '--title', bug.title, '--description', bug.description, '--source', 'ci-watch', '--log-file', logFile]);
    const id = (String(r.stdout).match(/\b[A-Z]+-\d+\b/) || [])[0];
    return r.status === 0 && id ? { action: 'neu', id } : null;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const GOOD = ['success', 'skipped', 'neutral'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([a-z-]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] !== undefined ? m[2] : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let repo = typeof a.repo === 'string' ? a.repo : '';
  let sha = '';
  try {
    if (!repo) repo = repoFromUrl(git(['remote', 'get-url', 'origin']));
    sha = git(['rev-parse', '--verify', `${typeof a.sha === 'string' ? a.sha : 'HEAD'}^{commit}`]);
  } catch (e) {
    console.log(tr('Error: {msg}', { msg: e.message.split('\n')[0] }));
    return 3;
  }
  if (!repo) { console.log(tr('Error: origin does not point to a GitHub repo.')); return 3; }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.includes('..')) { console.log(tr('Error: {repo} is not a repo in the format owner/name.', { repo })); return 3; }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const timeout = (Number(a.timeout) || 20) * 60000;
  const interval = Math.max(30, Number(a.interval) || (token ? 30 : 60)) * 1000;
  const grace = (a.grace !== undefined ? Number(a.grace) : 3) * 60000;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'ci-watch', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const api = async (p) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${p}`, { headers });
    if (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0') {
      const reset = new Date(Number(r.headers.get('x-ratelimit-reset')) * 1000);
      throw new Error(tr('GitHub rate limit reached, free again at {time}. With GITHUB_TOKEN there are more requests.', { time: reset.toLocaleTimeString('de-DE') }));
    }
    if (r.status === 404) throw new Error(tr('{repo} not found. For a private repo, set GITHUB_TOKEN.', { repo }));
    if (!r.ok) throw new Error(tr('GitHub responds with {status}.', { status: r.status }));
    return r.json();
  };
  const short = sha.slice(0, 7);
  const start = Date.now();
  try {
    for (;;) {
      const runs = (await api(`/actions/runs?head_sha=${sha}&per_page=50`)).workflow_runs || [];
      const waited = Date.now() - start;
      if (!runs.length && waited >= grace) {
        console.log(tr('No CI run for {sha} in {repo}. The commit probably does not match the paths or branches of the workflows.', { sha: short, repo }));
        return 2;
      }
      if (runs.length && runs.every((r) => r.status === 'completed')) {
        const bad = runs.filter((r) => !GOOD.includes(r.conclusion));
        if (!bad.length) {
          // works ship liest diese Zeile (CI (?:grün für|green for) <sha>: A, B.).
          console.log(tr('CI green for {sha}: {workflows}.', { sha: short, workflows: runs.map((r) => r.name).join(', ') }));
          notifyWorks({ data: { ok: true, sha, workflows: runs.length } });
          return 0;
        }
        console.log(tr('CI red for {sha}: {runs}.', { sha: short, runs: bad.map((r) => `${r.name} (${r.conclusion})`).join(', ') }));
        let detail = 0; // Annotationen und Logs nur für die ersten 5 Jobs, schont das Abfragelimit
        const failures = [];
        let jobCount = 0;
        for (const run of bad) {
          const all = (await api(`/actions/runs/${run.id}/jobs?per_page=100`)).jobs || [];
          jobCount += all.length;
          const jobs = all.filter((j) => !GOOD.includes(j.conclusion));
          const ok = all.filter((j) => GOOD.includes(j.conclusion)).map((j) => j.name);
          console.log(`\n${tr('{run}: {red} of {total} jobs red.', { run: run.name, red: jobs.length, total: all.length })}${ok.length ? ` ${tr('Green: {jobs}.', { jobs: ok.join(', ') })}` : ''}`);
          for (const j of jobs) {
            const steps = (j.steps || []).filter((s) => s.conclusion && !GOOD.includes(s.conclusion)).map((s) => s.name);
            console.log(`\n${steps.length ? tr('Job: {job}, step: {steps}', { job: j.name, steps: steps.join(', ') }) : `Job: ${j.name}`}\n${j.html_url}`);
            const f = { run: run.name, job: j.name, steps, url: j.html_url, lines: [], excerpt: '' };
            failures.push(f);
            if (++detail > 5) { console.log(`  ${tr('(no error location fetched, details only for the first 5 jobs)')}`); continue; }
            f.lines = failureLines(await api(`/check-runs/${j.id}/annotations`).catch(() => []));
            for (const l of f.lines) console.log(`  ${l}`);
            if (!token) continue;
            // GitHub leitet auf einen Speicher-Host weiter. Dorthin geht der Token nicht mit, die Weiterleitung ist schon signiert.
            const r = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${j.id}/logs`, { headers, redirect: 'manual' });
            const loc = r.status >= 300 && r.status < 400 && r.headers.get('location');
            const log = loc ? await fetch(loc) : r;
            if (log.ok) { f.excerpt = errorExcerpt(await log.text()); console.log(f.excerpt); }
          }
        }
        if (!token) console.log(`\n${tr('The log excerpt is only available with GITHUB_TOKEN in the environment, otherwise behind the links.')}`);
        let res = null;
        if (!a['no-bug']) {
          const bug = bugFor({ repo, sha, failures });
          res = fileBug({ bug, sha });
          if (res && res.action === 'neu') console.log(`\n${tr('Bug {id} created: {title}', { id: res.id, title: bug.title })}`);
          else if (res && res.action === 'ergänzt') console.log(`\n${tr('Bug {id} is still open, updated with this commit: {title}', { id: res.id, title: bug.title })}`);
          else if (res) console.log(`\n${tr('Bug {id} already lists this commit.', { id: res.id })}`);
        }
        const first = failures[0] || {};
        notifyWorks({ data: { ok: false, sha, failed: failures.length, total: jobCount, job: first.job || '', error: (first.lines && first.lines[0]) || String(first.excerpt || '').split('\n').find((l) => l.trim()) || '', bug: res ? res.id : '', url: bad[0] && bad[0].html_url } });
        return 1;
      }
      if (waited + interval > timeout) {
        const open = runs.filter((r) => r.status !== 'completed').map((r) => `${r.name} (${r.status})`);
        console.log(tr('Timeout after {min} minutes, not finished yet: {open}.', { min: Math.round(timeout / 60000), open: open.join(', ') || tr('no run') }));
        return 2;
      }
      await new Promise((res) => setTimeout(res, interval));
    }
  } catch (e) {
    console.log(tr('Error: {msg}', { msg: e.message }));
    return 3;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then((code) => { process.exitCode = code; }); // kein process.exit: bricht unter Windows offene fetch-Handles ab (libuv-Assertion)
