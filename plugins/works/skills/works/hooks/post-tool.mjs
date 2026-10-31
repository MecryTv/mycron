#!/usr/bin/env node
// Claude Code PostToolUse Hook: meldet dem Live-Board, was Claude gerade tut, und reicht Anweisungen weiter,
// die der Nutzer im Board geschrieben hat. Claude entscheidet selbst, wann sie sinnvoll umzusetzen sind.
import fs from 'node:fs';
import { findRoot, loadConfig, loadState } from '../scripts/lib.mjs';
import { recordActivity, takeInstructions, instructionText } from '../scripts/live.mjs';

let input = {};
try {
  if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch { input = {}; }

try {
  const root = findRoot(input.cwd || process.cwd());
  if (root) {
    const config = loadConfig(root);
    if (config.live_activity !== false) {
      const state = loadState(root);
      const failed = input.tool_response && (input.tool_response.is_error || input.tool_response.error);
      recordActivity(root, state.active || '', input.tool_name || '', input.tool_input || {}, !failed);
      const items = takeInstructions(root);
      if (items.length) {
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: instructionText(items) } }) + '\n');
      }
    }
  }
} catch (e) { process.stderr.write(`works post-tool: ${e.message}\n`); }
process.exit(0);
