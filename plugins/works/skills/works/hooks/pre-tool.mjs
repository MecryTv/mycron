#!/usr/bin/env node
// Claude Code PreToolUse Hook: meldet dem Live-Board, welcher Werkzeugaufruf gerade beginnt,
// damit "Gerade jetzt" auch während langer Befehle stimmt. Schreibt nur activity.json, sonst nichts.
import fs from 'node:fs';
import { findRoot, loadConfig } from '../scripts/lib.mjs';
import { recordActivity, callTarget } from '../scripts/live.mjs';
import { language, setLanguage } from '../scripts/i18n.mjs';

let input = {};
try {
  if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch { input = {}; }

try {
  const root = findRoot(input.cwd || process.cwd());
  if (root) setLanguage(language(root));
  if (root && loadConfig(root).live_activity !== false) {
    const { task, lane } = callTarget(root, input);
    recordActivity(root, task, input.tool_name || '', input.tool_input || {}, true, lane ? lane.path : '', { running: true, agent: input.agent_id || '' });
  }
} catch (e) { process.stderr.write(`works pre-tool: ${e.message}\n`); }
process.exit(0);
