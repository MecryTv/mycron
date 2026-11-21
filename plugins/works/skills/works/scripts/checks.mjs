// Automatische Prüfungen vor dem Abschluss: Befehle aus config.checks (Typecheck, Lint, Tests, Build)
// und Skill-Prüfungen wie code-audit, deren Ergebnis Claude einträgt. Ergebnis je Aufgabe in checks.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { exists, readJson, writeJson, worksDir } from './lib.mjs';

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
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { error: `Arbeitsordner ${c.cwd} liegt außerhalb des Projekts.` };
  if (!exists(abs)) return { error: `Arbeitsordner ${c.cwd} fehlt.` };
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

// Wackelig: in den letzten Läufen mindestens zweimal zwischen bestanden und fehlgeschlagen gewechselt.
// Ein einzelner Wechsel heißt nur "seit kurzem rot" oder "repariert".
export function flakyOf(hist = []) {
  let flips = 0;
  for (let i = 1; i < hist.length; i++) if (hist[i].s !== hist[i - 1].s) flips++;
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
    const timer = setTimeout(() => { child.kill('SIGTERM'); buf += '\n[abgebrochen nach 10 Minuten]'; }, TIMEOUT_MS);
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
  for (const c of list) {
    if (c.skill) {
      // Skill-Prüfungen führt Claude aus und trägt sie ein. Ein altes Ergebnis gilt nur für denselben Stand.
      if (!results[c.name] || results[c.name].fingerprint !== workFingerprint(dir)) results[c.name] = { status: 'manual', cmd: c.cmd, note: `Claude führt ${c.cmd.slice(6)} aus und trägt das Ergebnis mit works checks record ${task.id} ${c.name} ein.` };
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
  }
  const data = { at: new Date().toISOString(), fingerprint: workFingerprint(dir), results };
  writeJson(resultFile(task), data);
  return data;
}

export function recordCheck(root, task, name, status, note) {
  if (!NAME_RE.test(name)) throw new Error('Ungültiger Name der Prüfung.');
  if (!['ok', 'warn', 'fail'].includes(status)) throw new Error('Status muss ok, warn oder fail sein.');
  const fp = workFingerprint(checkDir(root, task));
  const data = loadResults(task) || { at: new Date().toISOString(), fingerprint: fp, results: {} };
  data.results[name] = { status, cmd: (data.results[name] || {}).cmd || '', note: String(note || '').slice(0, 2000), fingerprint: fp, at: new Date().toISOString() };
  writeJson(resultFile(task), data);
  return data;
}

export function ackCheck(task, name, reason) {
  const data = loadResults(task);
  if (!data || !data.results[name]) throw new Error(`Für ${name} gibt es kein Ergebnis.`);
  const r = data.results[name];
  if (r.status !== 'warn') throw new Error('Nur Funde mit Status warn lassen sich als bekannt markieren.');
  data.results[name] = { ...r, status: 'ack', note: `${r.note || ''}${reason ? `\nAls bekannt markiert: ${reason}` : '\nAls bekannt markiert.'}`.trim() };
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
  const stale = !data || (fp && data.fingerprint !== fp) || cmdChanged || list.some((c) => !c.skill && !data.results[c.name]);
  const items = [];
  if (stale) items.push({ ok: false, text: 'Automatische Prüfungen sind auf dem aktuellen Stand gelaufen', detail: `works checks run ${task.id}` });
  else {
    for (const c of list) {
      const r = data.results[c.name];
      const st = r ? r.status : 'missing';
      const label = { ok: 'bestanden', ack: 'Fund als bekannt markiert', warn: 'Fund, Entscheidung nötig', fail: 'fehlgeschlagen', manual: 'noch nicht eingetragen', missing: 'nicht gelaufen' }[st];
      items.push({ ok: st === 'ok' || st === 'ack', text: `Prüfung ${c.name}`, detail: label + (r && r.note && st !== 'ok' ? `: ${r.note.split('\n')[0].slice(0, 160)}` : '') });
    }
  }
  // CI aus GitHub zählt mit, auch wenn sie nicht in config.checks steht.
  if (data && data.results.ci && !list.some((c) => c.name === 'ci')) {
    const r = data.results.ci;
    items.push({ ok: r.status === 'ok' || r.status === 'ack', text: 'Prüfung ci', detail: r.status === 'ok' ? 'GitHub CI grün' : (r.note || 'GitHub CI fehlgeschlagen').slice(0, 160) });
    list.push({ name: 'ci', cmd: 'GitHub CI', skill: true });
  }
  return { items, state: { stale, at: data ? data.at : null, results: data ? data.results : {}, list } };
}
