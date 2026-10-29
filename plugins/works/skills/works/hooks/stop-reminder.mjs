#!/usr/bin/env node
// Claude Code Stop Hook: erinnert einmalig daran, Verlauf und Übergabe der aktiven Aufgabe
// zu aktualisieren, wenn seit der letzten Änderung an der task.md Projektdateien geändert wurden.
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, loadConfig, loadState, saveState, loadTasks, run } from '../scripts/lib.mjs';

let input = {};
try {
  if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch { input = {}; }

function main() {
  if (input.stop_hook_active) return;
  const root = findRoot(input.cwd || process.cwd());
  if (!root) return;
  const config = loadConfig(root);
  if (config.hooks && config.hooks.stop_reminder === false) return;
  const state = loadState(root);
  if (!state.active) return;
  const task = loadTasks(root, { archive: false }).find((t) => t.id === state.active);
  if (!task || task.status !== 'in-arbeit') return;

  const git = run('git', ['status', '--porcelain', '-uall'], { cwd: root });
  if (!git.ok) return;
  let latest = 0;
  for (const line of git.stdout.split('\n')) {
    const file = line.slice(3).trim().replace(/^"|"$/g, '').split(' -> ').pop();
    if (!file || file.startsWith('.works/')) continue;
    try { latest = Math.max(latest, fs.statSync(path.join(root, file)).mtimeMs); } catch { /* gelöscht */ }
  }
  if (!latest) return;
  if (latest <= task._mtime + 30000) return;
  if (latest <= (state.last_reminder_change || 0)) return;

  state.last_reminder_change = latest;
  saveState(root, state);
  const rel = path.relative(root, task._file).split(path.sep).join('/');
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: `works: An ${task.id} (${task.title}) wurden Dateien geändert, die task.md ist aber älter. `
      + `Bitte kurz Verlauf (works log), abgehakte Kriterien und die Übergabe (works handoff ${task.id} --text "...") in ${rel} aktualisieren. `
      + 'Falls nichts Relevantes passiert ist, einfach fortfahren.',
  }) + '\n');
}

try { main(); } catch (e) { process.stderr.write(`works stop-reminder: ${e.message}\n`); }
process.exit(0);
