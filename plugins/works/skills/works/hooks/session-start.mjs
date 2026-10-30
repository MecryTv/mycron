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

let input = {};
try {
  if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch { input = {}; }

async function main() {
  const root = findRoot(input.cwd || process.cwd());
  if (!root) return;
  const config = loadConfig(root);
  if (config.hooks && config.hooks.session_start === false) return;
  ensureGitignore(root, ['.tmp/']);
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
  generateIndex(root);
  refreshBoardIfPresent(root);
  let notes = [];
  try { notes = await refreshServers(root); } catch (e) { notes = [`Board-Server konnte nicht aktualisiert werden: ${e.message}`]; }
  process.stdout.write(sessionSummary(root) + '\n');
  if (repairNotes.length) process.stdout.write(`[works] ${repairNotes.join('. ')}.\n`);
  if (notes.length) process.stdout.write(`[works] ${notes.join('. ')}. Offene Board-Tabs laden sich selbst neu.\n`);
}

main().catch((e) => process.stderr.write(`works session-start: ${e.message}\n`)).finally(() => process.exit(0));
