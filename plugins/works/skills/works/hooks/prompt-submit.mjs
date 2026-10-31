#!/usr/bin/env node
// Claude Code UserPromptSubmit Hook: merkt den Beginn einer Anfrage für die Zeiterfassung der aktiven Aufgabe.
// Schreibt nichts in den Kontext und bleibt still, wenn das Projekt kein .works hat oder keine Aufgabe aktiv ist.
import fs from 'node:fs';
import { findRoot, loadConfig, loadState } from '../scripts/lib.mjs';
import { recordEvent } from '../scripts/timelog.mjs';
import { setBusy, takeInstructions, instructionText } from '../scripts/live.mjs';

let input = {};
try {
  if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch { input = {}; }

try {
  const root = findRoot(input.cwd || process.cwd());
  if (root) {
    const config = loadConfig(root);
    const state = loadState(root);
    if (config.time_tracking !== false && state.active) recordEvent(root, 'start', state.active, input.session_id);
    if (config.live_activity !== false) {
      setBusy(root, state.active || '');
      const items = takeInstructions(root);
      if (items.length) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: instructionText(items) } }) + '\n');
    }
  }
} catch (e) { process.stderr.write(`works prompt-submit: ${e.message}\n`); }
process.exit(0);
