#!/usr/bin/env node
// Claude Code SessionStart Hook: gibt eine Kurzübersicht aus .works/ in den Kontext,
// erzeugt WORKS.md und eine vorhandene board.html mit der installierten Version neu
// und ersetzt Board-Server, die noch mit einer älteren Version laufen.
// Bleibt still, wenn das Projekt keinen .works Ordner hat.
import fs from 'node:fs';
import { findRoot, loadConfig } from '../scripts/lib.mjs';
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
  generateIndex(root);
  refreshBoardIfPresent(root);
  let notes = [];
  try { notes = await refreshServers(root); } catch (e) { notes = [`Board-Server konnte nicht aktualisiert werden: ${e.message}`]; }
  process.stdout.write(sessionSummary(root) + '\n');
  if (notes.length) process.stdout.write(`[works] ${notes.join('. ')}. Offene Board-Tabs laden sich selbst neu.\n`);
}

main().catch((e) => process.stderr.write(`works session-start: ${e.message}\n`)).finally(() => process.exit(0));
