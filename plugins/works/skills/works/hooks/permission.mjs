#!/usr/bin/env node
// Claude Code PermissionRequest Hook: Claude fragt gerade nach einer Freigabe. Markiert den laufenden Aufruf
// in activity.json als wartend, damit das Live-Board "wartet auf deine Freigabe" zeigt.
// Gibt bewusst nichts aus: Eine Ausgabe könnte die Freigabe entscheiden, das bleibt beim Nutzer.
import fs from 'node:fs';
import { findRoot, loadConfig } from '../scripts/lib.mjs';
import { recordActivity, callTarget } from '../scripts/live.mjs';

let input = {};
try {
  if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch { input = {}; }

try {
  const root = findRoot(input.cwd || process.cwd());
  if (root && loadConfig(root).live_activity !== false) {
    const { task, lane } = callTarget(root, input);
    recordActivity(root, task, input.tool_name || '', input.tool_input || {}, true, lane ? lane.path : '', { running: true, perm: true });
  }
} catch (e) { process.stderr.write(`works permission: ${e.message}\n`); }
process.exit(0);
