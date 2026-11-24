// Automatische Prüfungen vor dem Abschluss: Befehle aus config.checks (Typecheck, Lint, Tests, Build)
// und Skill-Prüfungen wie code-audit, deren Ergebnis Claude einträgt. Ergebnis je Aufgabe in checks.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { exists, readJson, writeJson, worksDir } from './lib.mjs';
import { tr } from './i18n.mjs';

const TIMEOUT_MS = 10 * 60 * 1000;
const TAIL = 4000;
export const NAME_RE = /^[a-z][a-z0-9_-]{0,30}$/;

// Eine Prüfung steht in config.checks als Befehl (Text) oder als { cmd, cwd } mit Arbeitsordner relativ zum Projekt.
export function checkEntry(v) {
  if (typeof v === 'string') return v.trim() ? { cmd: v.trim(), cwd: '' } : null;
  if (v && typeof v === 'object' && typeof v.cmd === 'string' && v.cmd.trim()) return { cmd: v.cmd.trim(), cwd: typeof v.cwd === 'string' ? v.cwd.trim() : '' };
  return null;
}
// Gespeichert wird ohne Ordner weiter als reiner Text, damit bestehende Konfigurationen gleich aussehen.
export const storedCheck = (e) => (e.cwd ? { cmd: e.cmd, cwd: e.cwd } : e.cmd);

export function configuredChecks(config) {
  const c = config.checks && typeof config.checks === 'object' ? config.checks : {};
  return Object.fromEntries(Object.entries(c).filter(([k, v]) => NAME_RE.test(k) && checkEntry(v)));
}

export function checksFor(config, task) {
  const all = configuredChecks(config);
  const by = (config.checks_by_type || {})[task.type];
  const names = Array.isArray(by) ? by.filter((n) => all[n]) : Object.keys(all);
  return names.map((n) => { const e = checkEntry(all[n]); return { name: n, cmd: e.cmd, cwd: e.cwd, skill: e.cmd.startsWith('skill:') }; });
}

// Arbeitsordner einer Prüfung: relativ zum Projekt (bzw. Worktree), nie außerhalb davon.
function checkCwd(dir, c) {
  if (!c.cwd) return { dir };
  const abs = path.resolve(dir, c.cwd);
  const rel = path.relative(dir, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { error: tr('Working folder {dir} is outside the project.', { dir: c.cwd }) };
  if (!exists(abs)) return { error: tr('Working folder {dir} is missing.', { dir: c.cwd }) };
  return { dir: abs };
}

// Vorschläge aus package.json und typischen Dateien. Wird erst nach Bestätigung gespeichert.
export function detectChecks(root) {
  const pkg = readJson(path.join(root, 'package.json'), null);
  const scripts = (pkg && pkg.scripts) || {};
  const pm = exists(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm' : exists(path.join(root, 'yarn.lock')) ? 'yarn' : 'npm';
  const runS = (s) => (pm === 'npm' ? `npm run ${s}` : `${pm} ${s}`);
  const out = {};
  const tc = ['typecheck', 'type-check', 'tsc', 'check-types'].find((s) => scripts[s]);
  if (tc) out.typecheck = runS(tc);
  else if (exists(path.join(root, 'tsconfig.json'))) out.typecheck = 'npx tsc --noEmit';
  if (scripts.lint) out.lint = runS('lint');
  if (scripts.test && !/no test specified/.test(scripts.test)) out.test = pm === 'npm' ? 'npm test' : `${pm} test`;
  if (scripts.build) out.build = runS('build');
  out.audit = 'skill:code-audit';
  return out;
}

export function resultFile(task) { return path.join(task._dir, 'checks.json'); }

// Verlauf je Prüfung: die letzten fünf Läufe mit Ergebnis und Dauer. Ein geänderter Befehl beginnt von vorn.
const HIST = 5;
function histOf(r, c) {
  if (!r || r.cmd !== c.cmd || (r.cwd || '') !== c.cwd) return [];
  if (Array.isArray(r.hist)) return r.hist;
  return r.status === 'ok' || r.status === 'fail' ? [{ s: r.status, ms: r.ms || 0, at: r.at || '' }] : [];
}

// Wackelig: in den letzten Läufen mindestens zweimal zwischen bestanden und fehlgeschlagen gewechselt,
// und zwar ohne Codeänderung dazwischen (gleicher Fingerabdruck fp). Kaputt gemacht und repariert ist nicht wackelig.
export function flakyOf(hist = []) {
  let flips = 0;
  for (let i = 1; i < hist.length; i++) if (hist[i].s !== hist[i - 1].s && hist[i].fp && hist[i].fp === hist[i - 1].fp) flips++;
  return flips >= 2 ? { fails: hist.filter((h) => h.s === 'fail').length, runs: hist.length } : null;
}

// Laufzeit des letzten Laufs gegen den Median der bestandenen Läufe davor. Nur bestandene Läufe zählen,
// ein Fehlschlag bricht oft früh ab. Deutlich heißt: mindestens 1,5-mal so lang oder kurz und mindestens 5 Sekunden Unterschied.
export function trendOf(hist = []) {
  const last = hist[hist.length - 1];
  const prev = hist.slice(0, -1).filter((h) => h.s === 'ok').map((h) => h.ms).sort((a, b) => a - b);
  if (!last || last.s !== 'ok' || !prev.length) return null;
  const m = prev.length;
  const usual = m % 2 ? prev[(m - 1) / 2] : Math.round((prev[m / 2 - 1] + prev[m / 2]) / 2);
  if (Math.abs(last.ms - usual) < 5000) return null;
  if (last.ms >= usual * 1.5) return { dir: 'up', ms: last.ms, usual };
  if (last.ms * 1.5 <= usual) return { dir: 'down', ms: last.ms, usual };
  return null;
}
export function loadResults(task) { return readJson(resultFile(task), null); }

// Fingerabdruck des Arbeitsstands: HEAD plus noch nicht committete Änderungen außerhalb von .works.
export function workFingerprint(root) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (head.status !== 0) return '';
  const diff = spawnSync('git', ['diff', 'HEAD', '--', '.', ':(exclude).works'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return head.stdout.trim().slice(0, 12) + ':' + crypto.createHash('sha1').update(diff.stdout || '').digest('hex').slice(0, 12);
}

function runOne(root, cmd) {
  return new Promise((resolve) => {
    const started = Date.now();
    // Unter Windows wie Node mit shell: true: Befehl in Anführungszeichen und ohne Node-Maskierung an cmd geben,
    // sonst kommen Anführungszeichen im Befehl verstümmelt an.
    const win = process.platform === 'win32';
    const shell = win ? ['cmd', ['/d', '/s', '/c', `"${cmd}"`]] : ['sh', ['-c', cmd]];
    const child = spawn(shell[0], shell[1], { cwd: root, windowsHide: true, windowsVerbatimArguments: win, env: { ...process.env, CI: '1', FORCE_COLOR: '0' } });
    let buf = '';
    const add = (d) => { buf += d; if (buf.length > TAIL * 4) buf = buf.slice(-TAIL * 2); };
    child.stdout.on('data', add); child.stderr.on('data', add);
    const timer = setTimeout(() => { child.kill('SIGTERM'); buf += `\n[${tr('aborted after 10 minutes')}]`; }, TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, ms: Date.now() - started, output: buf.replace(/\x1b\[[0-9;]*m/g, '').slice(-TAIL) });
    });
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, ms: Date.now() - started, output: e.message }); });
  });
}

// Arbeitsordner der Prüfungen: Läuft die Aufgabe parallel, liegt ihr Code im Worktree, sonst im Projekt.
// lanes.json direkt lesen, weil parallel.mjs seinerseits checks.mjs braucht.
export function checkDir(root, task) {
  const lanes = (readJson(path.join(worksDir(root), 'lanes.json'), null) || {}).lanes || [];
  const lane = lanes.find((l) => l.task === task.id);
  return lane && exists(lane.path) ? lane.path : root;
}

export async function runChecks(root, config, task, { only = null, onStart = null } = {}) {
  const dir = checkDir(root, task);
  const list = checksFor(config, task).filter((c) => !only || only.includes(c.name));
  const prev = loadResults(task) || {};
  const results = { ...(prev.results || {}) };
  const ran = [];
  for (const c of list) {
    if (c.skill) {
      // Skill-Prüfungen führt Claude aus und trägt sie ein. Ein altes Ergebnis gilt nur für denselben Stand.
      if (!results[c.name] || results[c.name].fingerprint !== workFingerprint(dir)) results[c.name] = { status: 'manual', cmd: c.cmd, note: tr('Claude runs {skill} and records the result with works checks record {id} {name}.', { skill: c.cmd.slice(6), id: task.id, name: c.name }) };
      continue;
    }
    if (onStart) onStart(c);
    // Zwischenstand für das Live-Board: welche Prüfung läuft gerade, was ist schon fertig.
    writeJson(resultFile(task), { at: prev.at || new Date().toISOString(), fingerprint: prev.fingerprint || '', results, running: c.name, runningSince: new Date().toISOString() });
    const wd = checkCwd(dir, c);
    const r = wd.error ? { ok: false, ms: 0, output: wd.error } : await runOne(wd.dir, c.cmd);
    const at = new Date().toISOString();
    const status = r.ok ? 'ok' : 'fail';
    results[c.name] = { status, cmd: c.cmd, cwd: c.cwd, ms: r.ms, output: r.output, at, hist: [...histOf(results[c.name], c), { s: status, ms: r.ms, at }].slice(-HIST) };
    ran.push(c.name);
  }
  // Jedes Ergebnis merkt sich den Stand, auf dem es lief. Bei einem Teillauf (--only) bleiben die übrigen
  // Ergebnisse bei ihrem alten Stand und gelten nach einer Codeänderung als veraltet.
  const fingerprint = workFingerprint(dir);
  for (const n of ran) { results[n].fp = fingerprint; results[n].hist[results[n].hist.length - 1].fp = fingerprint; }
  const data = { at: new Date().toISOString(), fingerprint, results };
  writeJson(resultFile(task), data);
  return data;
}

export function recordCheck(root, task, name, status, note) {
  if (!NAME_RE.test(name)) throw new Error(tr('Invalid check name.'));
  if (!['ok', 'warn', 'fail'].includes(status)) throw new Error(tr('Status must be ok, warn or fail.'));
  const fp = workFingerprint(checkDir(root, task));
  const data = loadResults(task) || { at: new Date().toISOString(), fingerprint: fp, results: {} };
  data.results[name] = { status, cmd: (data.results[name] || {}).cmd || '', note: String(note || '').slice(0, 2000), fingerprint: fp, at: new Date().toISOString() };
  writeJson(resultFile(task), data);
  return data;
}

export function ackCheck(task, name, reason) {
  const data = loadResults(task);
  if (!data || !data.results[name]) throw new Error(tr('There is no result for {name}.', { name }));
  const r = data.results[name];
  if (r.status !== 'warn') throw new Error(tr('Only findings with status warn can be marked as known.'));
  data.results[name] = { ...r, status: 'ack', note: `${r.note || ''}\n${reason ? tr('Marked as known: {reason}', { reason }) : tr('Marked as known.')}`.trim() };
  writeJson(resultFile(task), data);
  return data;
}

// Punkte für die Definition of Done. Leer, wenn keine Prüfungen eingerichtet sind.
export function checkItems(root, config, task) {
  const list = checksFor(config, task);
  if (!list.length) return { items: [], state: null };
  const data = loadResults(task);
  const fp = workFingerprint(checkDir(root, task));
  // Veraltet, wenn sich der Code oder ein eingerichteter Befehl seit dem letzten Lauf geändert hat.
  const cmdChanged = data && list.some((c) => !c.skill && data.results[c.name] && (data.results[c.name].cmd !== c.cmd || (data.results[c.name].cwd || '') !== c.cwd));
  const cmds = list.filter((c) => !c.skill);
  const codeChanged = (r) => (r.fp || data.fingerprint) !== fp;
  const stale = !data || (fp && (cmds.length ? cmds.some((c) => data.results[c.name] && codeChanged(data.results[c.name])) : data.fingerprint !== fp)) || cmdChanged || cmds.some((c) => !data.results[c.name]);
  const items = [];
  if (stale) items.push({ ok: false, text: tr('Automatic checks ran on the current state'), detail: `works checks run ${task.id}` });
  else {
    for (const c of list) {
      const r = data.results[c.name];
      const st = r ? r.status : 'missing';
      const label = { ok: tr('passed'), ack: tr('finding marked as known'), warn: tr('finding, decision needed'), fail: tr('failed'), manual: tr('not recorded yet'), missing: tr('did not run') }[st];
      items.push({ ok: st === 'ok' || st === 'ack', text: tr('Check {name}', { name: c.name }), detail: label + (r && r.note && st !== 'ok' ? `: ${r.note.split('\n')[0].slice(0, 160)}` : '') });
    }
  }
  // CI aus GitHub zählt mit, auch wenn sie nicht in config.checks steht.
  if (data && data.results.ci && !list.some((c) => c.name === 'ci')) {
    const r = data.results.ci;
    items.push({ ok: r.status === 'ok' || r.status === 'ack', text: tr('Check {name}', { name: 'ci' }), detail: r.status === 'ok' ? tr('GitHub CI green') : (r.note || tr('GitHub CI failed')).slice(0, 160) });
    list.push({ name: 'ci', cmd: 'GitHub CI', skill: true });
  }
  return { items, state: { stale, at: data ? data.at : null, results: data ? data.results : {}, list } };
}

// Prüfungs-Gesundheit über alle Aufgaben (Werkzeuge): je Prüfung Läufe, Fehlschläge, Median der bestandenen Läufe,
// wackelig (Regel wie flakyOf), Trend und die letzten Läufe des jüngsten Ergebnisses. Skill-Prüfungen zählen nicht.
export function checkHealth(tasks) {
  const by = new Map();
  let withChecks = 0;
  for (const t of tasks) {
    const d = loadResults(t);
    if (!d || !d.results) continue;
    let any = false;
    for (const [name, r] of Object.entries(d.results)) {
      if (!r || String(r.cmd || '').startsWith('skill:')) continue;
      const hist = Array.isArray(r.hist) && r.hist.length ? r.hist : ['ok', 'fail'].includes(r.status) ? [{ s: r.status, ms: r.ms || 0, at: r.at || '' }] : [];
      if (!hist.length) continue;
      const e = by.get(name) || { name, runs: 0, fails: 0, oks: [], flaky: false, latest: null };
      e.runs += hist.length;
      e.fails += hist.filter((h) => h.s === 'fail').length;
      for (const h of hist) if (h.s === 'ok' && typeof h.ms === 'number') e.oks.push(h.ms);
      if (flakyOf(hist)) e.flaky = true;
      const at = r.at || '';
      if (!e.latest || at > e.latest.at) e.latest = { at, hist };
      by.set(name, e);
      any = true;
    }
    if (any) withChecks++;
  }
  const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length; return m % 2 ? s[(m - 1) / 2] : Math.round((s[m / 2 - 1] + s[m / 2]) / 2); };
  const checks = [...by.values()].map((e) => ({ name: e.name, runs: e.runs, fails: e.fails, median: median(e.oks), flaky: e.flaky, trend: trendOf(e.latest.hist), last: e.latest.hist.map((h) => h.s) }));
  return { tasks: withChecks, checks };
}
