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
// Exit: 0 grün, 1 rot, 2 kein Lauf oder Zeitlimit, 3 Fehler (etwa kein GitHub-Repo, Rate-Limit).
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function repoFromUrl(url) {
  const m = String(url).trim().match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/);
  return m ? m[1] : '';
}

// Die Zeilen um die erste Fehlermeldung eines Job-Logs, ohne Zeitstempel. Höchstens before Zeilen davor.
export function errorExcerpt(log, before = 15) {
  const lines = String(log).split(/\r?\n/).map((l) => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, ''));
  const i = lines.findIndex((l) => l.includes('##[error]'));
  if (i < 0) return lines.filter(Boolean).slice(-before).join('\n');
  return lines.slice(Math.max(0, i - before), i + 1).map((l) => l.replace('##[error]', 'Fehler: ')).join('\n');
}

// Fehler-Annotationen eines Jobs als Zeilen. Gibt GitHub auch ohne Token heraus, anders als die Logs.
// Annotationen auf .github zeigen nur auf den Workflow, dort zählt allein die Meldung.
export function failureLines(annotations) {
  return (annotations || []).filter((a) => a.annotation_level === 'failure').map((a) => {
    const msg = `${a.title ? `${a.title}: ` : ''}${a.message}`;
    return !a.path || a.path.startsWith('.github') ? msg : `${a.path}:${a.start_line} ${msg}`;
  });
}

const GOOD = ['success', 'skipped', 'neutral'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([a-z]+)(?:=(.*))?$/);
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
    console.log(`Fehler: ${e.message.split('\n')[0]}`);
    return 3;
  }
  if (!repo) { console.log('Fehler: origin zeigt nicht auf ein GitHub-Repo.'); return 3; }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.includes('..')) { console.log(`Fehler: ${repo} ist kein Repo im Format owner/name.`); return 3; }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const timeout = (Number(a.timeout) || 20) * 60000;
  const interval = Math.max(30, Number(a.interval) || (token ? 30 : 60)) * 1000;
  const grace = (a.grace !== undefined ? Number(a.grace) : 3) * 60000;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'ci-waechter', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const api = async (p) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${p}`, { headers });
    if (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0') {
      const reset = new Date(Number(r.headers.get('x-ratelimit-reset')) * 1000);
      throw new Error(`GitHub-Rate-Limit erreicht, wieder frei um ${reset.toLocaleTimeString('de-DE')}. Mit GITHUB_TOKEN gibt es mehr Abfragen.`);
    }
    if (r.status === 404) throw new Error(`${repo} nicht gefunden. Bei einem privaten Repo GITHUB_TOKEN setzen.`);
    if (!r.ok) throw new Error(`GitHub antwortet mit ${r.status}.`);
    return r.json();
  };
  const short = sha.slice(0, 7);
  const start = Date.now();
  try {
    for (;;) {
      const runs = (await api(`/actions/runs?head_sha=${sha}&per_page=50`)).workflow_runs || [];
      const waited = Date.now() - start;
      if (!runs.length && waited >= grace) {
        console.log(`Kein CI-Lauf für ${short} in ${repo}. Vermutlich passt der Commit nicht zu den Pfaden oder Branches der Workflows.`);
        return 2;
      }
      if (runs.length && runs.every((r) => r.status === 'completed')) {
        const bad = runs.filter((r) => !GOOD.includes(r.conclusion));
        if (!bad.length) {
          console.log(`CI grün für ${short}: ${runs.map((r) => r.name).join(', ')}.`);
          return 0;
        }
        console.log(`CI rot für ${short}: ${bad.map((r) => `${r.name} (${r.conclusion})`).join(', ')}.`);
        let detail = 0; // Annotationen und Logs nur für die ersten 5 Jobs, schont das Abfragelimit
        for (const run of bad) {
          const all = (await api(`/actions/runs/${run.id}/jobs?per_page=100`)).jobs || [];
          const jobs = all.filter((j) => !GOOD.includes(j.conclusion));
          const ok = all.filter((j) => GOOD.includes(j.conclusion)).map((j) => j.name);
          console.log(`\n${run.name}: ${jobs.length} von ${all.length} Jobs rot.${ok.length ? ` Grün: ${ok.join(', ')}.` : ''}`);
          for (const j of jobs) {
            const steps = (j.steps || []).filter((s) => s.conclusion && !GOOD.includes(s.conclusion)).map((s) => s.name);
            console.log(`\nJob: ${j.name}${steps.length ? `, Schritt: ${steps.join(', ')}` : ''}\n${j.html_url}`);
            if (++detail > 5) { console.log('  (keine Fehlerstelle abgefragt, Details nur für die ersten 5 Jobs)'); continue; }
            for (const l of failureLines(await api(`/check-runs/${j.id}/annotations`).catch(() => []))) console.log(`  ${l}`);
            if (!token) continue;
            // GitHub leitet auf einen Speicher-Host weiter. Dorthin geht der Token nicht mit, die Weiterleitung ist schon signiert.
            const r = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${j.id}/logs`, { headers, redirect: 'manual' });
            const loc = r.status >= 300 && r.status < 400 && r.headers.get('location');
            const log = loc ? await fetch(loc) : r;
            if (log.ok) console.log(errorExcerpt(await log.text()));
          }
        }
        if (!token) console.log('\nDen Log-Auszug gibt es nur mit GITHUB_TOKEN in der Umgebung, sonst hinter den Links.');
        return 1;
      }
      if (waited + interval > timeout) {
        const open = runs.filter((r) => r.status !== 'completed').map((r) => `${r.name} (${r.status})`);
        console.log(`Zeitlimit nach ${Math.round(timeout / 60000)} Minuten, noch nicht fertig: ${open.join(', ') || 'kein Lauf'}.`);
        return 2;
      }
      await new Promise((res) => setTimeout(res, interval));
    }
  } catch (e) {
    console.log(`Fehler: ${e.message}`);
    return 3;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then((code) => { process.exitCode = code; }); // kein process.exit: bricht unter Windows offene fetch-Handles ab (libuv-Assertion)
