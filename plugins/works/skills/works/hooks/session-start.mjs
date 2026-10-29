#!/usr/bin/env node
// Claude Code SessionStart Hook: gibt eine Kurzübersicht aus .works/ in den Kontext.
// Bleibt still, wenn das Projekt keinen .works Ordner hat.
import fs from 'node:fs';
import { findRoot, loadConfig } from '../scripts/lib.mjs';
import { sessionSummary, generateIndex } from '../scripts/views.mjs';
import { refreshBoardIfPresent } from '../scripts/board.mjs';

let input = {};
try {
  if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch { input = {}; }

try {
  const root = findRoot(input.cwd || process.cwd());
  if (!root) process.exit(0);
  const config = loadConfig(root);
  if (config.hooks && config.hooks.session_start === false) process.exit(0);
  generateIndex(root);
  refreshBoardIfPresent(root);
  process.stdout.write(sessionSummary(root) + '\n');
} catch (e) {
  process.stderr.write(`works session-start: ${e.message}\n`);
}
process.exit(0);
