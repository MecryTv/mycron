// Automatische Prüfungen vor dem Abschluss: Befehle aus config.checks (Typecheck, Lint, Tests, Build)
// und Skill-Prüfungen wie code-audit, deren Ergebnis Claude einträgt. Ergebnis je Aufgabe in checks.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { exists, readJson, writeJson } from './lib.mjs';

const TIMEOUT_MS = 10 * 60 * 1000;
const TAIL = 4000;
export const NAME_RE = /^[a-z][a-z0-9_-]{0,30}$/;

export function configuredChecks(config) {
  const c = config.checks && typeof config.checks === 'object' ? config.checks : {};
  return Object.fromEntries(Object.entries(c).filter(([k, v]) => NAME_RE.test(k) && typeof v === 'string' && v.trim()));
}

export function checksFor(config, task) {
  const all = configuredChecks(config);
  const by = (config.checks_by_type || {})[task.type];
  const names = Array.isArray(by) ? by.filter((n) => all[n]) : Object.keys(all);
  return names.map((n) => ({ name: n, cmd: all[n], skill: all[n].startsWith('skill:') }));
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
export function loadResults(task) { return readJson(resultFile(task), null); }

// Fingerabdruck des Arbeitsstands: HEAD plus noch nicht committete Änderungen außerhalb von .works.
export function workFingerprint(root) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (head.status !== 0) return '';
  const diff = spawnSync('git', ['diff', 'HEAD', '--', '.', ':(exclude).works'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return head.stdout.trim().slice(0, 12) + ':' + crypto.createHash('sha1').update(diff.stdout || '').digest('hex').slice(0, 12);
}

function runOne(root, cmd) {
  return new Promise((resolve) => {
    const started = Date.now();
    const shell = process.platform === 'win32' ? ['cmd', ['/d', '/s', '/c', cmd]] : ['sh', ['-c', cmd]];
    const child = spawn(shell[0], shell[1], { cwd: root, env: { ...process.env, CI: '1', FORCE_COLOR: '0' } });
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

export async function runChecks(root, config, task, { only = null, onStart = null } = {}) {
  const list = checksFor(config, task).filter((c) => !only || only.includes(c.name));
  const prev = loadResults(task) || {};
  const results = { ...(prev.results || {}) };
  for (const c of list) {
    if (c.skill) {
      // Skill-Prüfungen führt Claude aus und trägt sie ein. Ein altes Ergebnis gilt nur für denselben Stand.
      if (!results[c.name] || results[c.name].fingerprint !== workFingerprint(root)) results[c.name] = { status: 'manual', cmd: c.cmd, note: `Claude führt ${c.cmd.slice(6)} aus und trägt das Ergebnis mit works checks record ${task.id} ${c.name} ein.` };
      continue;
    }
    if (onStart) onStart(c);
    const r = await runOne(root, c.cmd);
    results[c.name] = { status: r.ok ? 'ok' : 'fail', cmd: c.cmd, ms: r.ms, output: r.output };
  }
  const data = { at: new Date().toISOString(), fingerprint: workFingerprint(root), results };
  writeJson(resultFile(task), data);
  return data;
}

export function recordCheck(root, task, name, status, note) {
  if (!NAME_RE.test(name)) throw new Error('Ungültiger Name der Prüfung.');
  if (!['ok', 'warn', 'fail'].includes(status)) throw new Error('Status muss ok, warn oder fail sein.');
  const data = loadResults(task) || { at: new Date().toISOString(), fingerprint: workFingerprint(root), results: {} };
  data.results[name] = { status, cmd: (data.results[name] || {}).cmd || '', note: String(note || '').slice(0, 2000), fingerprint: workFingerprint(root), at: new Date().toISOString() };
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
  const fp = workFingerprint(root);
  // Veraltet, wenn sich der Code oder ein eingerichteter Befehl seit dem letzten Lauf geändert hat.
  const cmdChanged = data && list.some((c) => !c.skill && data.results[c.name] && data.results[c.name].cmd !== c.cmd);
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
  return { items, state: { stale, at: data ? data.at : null, results: data ? data.results : {}, list } };
}
