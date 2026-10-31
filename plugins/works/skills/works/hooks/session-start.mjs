#!/usr/bin/env node
// Claude Code SessionStart Hook: gibt eine Kurzübersicht aus .works/ in den Kontext,
// erzeugt WORKS.md und eine vorhandene board.html mit der installierten Version neu
// und ersetzt Board-Server, die noch mit einer älteren Version laufen.
// Bleibt still, wenn das Projekt keinen .works Ordner hat.
import fs from 'node:fs';
import { findRoot, loadConfig, saveConfig } from '../scripts/lib.mjs';
import { repairTasks } from '../scripts/sections.mjs';
import { sessionSummary, generateIndex } from '../scripts/views.mjs';
import { refreshBoardIfPresent } from '../scripts/board.mjs';
import { refreshServers, ensureGitignore } from '../scripts/server-control.mjs';
import { reportDue, reportName } from '../scripts/weekly.mjs';
import { registerProject } from '../scripts/hub.mjs';
import { syncSettings, syncState } from '../scripts/ghsync.mjs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let input = {};
try {
  if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch { input = {}; }

async function main() {
  const root = findRoot(input.cwd || process.cwd());
  if (!root) return;
  const config = loadConfig(root);
  if (config.hooks && config.hooks.session_start === false) return;
  ensureGitignore(root, ['.tmp/', 'activity.json', 'instructions.json', '.undo/', '.usage-state.json', 'github.json', 'lanes.json', 'files.jsonl', '.filemap.json', '.file-hints.json']);
  // Einmalige Reparatur: Beschreibungen, die wegen eines Fehlers älterer Versionen im falschen Abschnitt stehen.
  const repairNotes = [];
  const migrations = Array.isArray(config.migrations) ? config.migrations : [];
  if (!migrations.includes('sections-1')) {
    try {
      const fixed = repairTasks(root);
      if (fixed.length) repairNotes.push(`${fixed.length} Aufgabe${fixed.length === 1 ? '' : 'n'} repariert (${fixed.map((f) => f.id).join(', ')}): Beschreibung in den richtigen Abschnitt übernommen, fehlende Abschnitte ergänzt`);
      config.migrations = [...migrations, 'sections-1'];
      saveConfig(root, config);
    } catch (e) { repairNotes.push(`Reparatur übersprungen: ${e.message}`); }
  }
  registerProject(root);
  const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'works.mjs');
  // Fällige wiederkehrende Aufgaben anlegen.
  let recurNote = '';
  if (Array.isArray(config.recurring) && config.recurring.length) {
    const r = spawnSync(process.execPath, [CLI, 'recur', 'run'], { cwd: root, encoding: 'utf8', timeout: 20000, env: { ...process.env, WORKS_ACTOR: 'Wiederkehrend' } });
    recurNote = (r.stdout || '').split('\n').filter((l) => l.startsWith('Wiederkehrend angelegt')).join('; ');
  }
  // GitHub-Abgleich im Hintergrund, damit der Start nicht wartet.
  const gs = syncSettings(config);
  const last = (syncState(root) || {}).last;
  if (gs.enabled && (!last || Date.now() - Date.parse(last) > gs.interval_min * 60000)) {
    try { spawn(process.execPath, [CLI, 'github', 'sync', '--quiet'], { cwd: root, detached: true, stdio: 'ignore' }).unref(); } catch { /* gh fehlt */ }
  }
  generateIndex(root);
  refreshBoardIfPresent(root);
  let notes = [];
  try { notes = await refreshServers(root); } catch (e) { notes = [`Board-Server konnte nicht aktualisiert werden: ${e.message}`]; }
  process.stdout.write(sessionSummary(root) + '\n');
  if (recurNote) process.stdout.write(`[works] ${recurNote}\n`);
  if (repairNotes.length) process.stdout.write(`[works] ${repairNotes.join('. ')}.\n`);
  const due = reportDue(root, config);
  if (due) process.stdout.write(`[works] Wochenbericht ${reportName(due)} ist fällig. Wenn es passt, die Woche in zwei bis vier Sätzen zusammenfassen und works report --week --summary "..." ausführen. Der Nutzer hat das so eingestellt.\n`);
  if (notes.length) process.stdout.write(`[works] ${notes.join('. ')}. Offene Board-Tabs laden sich selbst neu.\n`);
}

main().catch((e) => process.stderr.write(`works session-start: ${e.message}\n`)).finally(() => process.exit(0));
