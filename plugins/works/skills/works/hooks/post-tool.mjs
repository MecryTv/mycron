#!/usr/bin/env node
// Claude Code PostToolUse Hook: meldet dem Live-Board, was Claude gerade tut, merkt sich geänderte Dateien
// je Aufgabe, weist auf frühere Arbeit an derselben Datei hin und reicht Anweisungen aus dem Board weiter.
// Werkzeugaufrufe in einem Worktree einer parallelen Aufgabe zählen für diese Aufgabe.
import fs from 'node:fs';
import { findRoot, loadConfig } from '../scripts/lib.mjs';
import { recordActivity, takeInstructions, instructionText, callTarget } from '../scripts/live.mjs';
import { recordEdit, editHint } from '../scripts/files.mjs';
import { loadLanes } from '../scripts/parallel.mjs';

let input = {};
try {
  if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch { input = {}; }

try {
  const root = findRoot(input.cwd || process.cwd());
  if (root) {
    const config = loadConfig(root);
    const ti = input.tool_input || {};
    const { task, lane } = callTarget(root, input);
    const notes = [];
    if (config.live_activity !== false) {
      const failed = input.tool_response && (input.tool_response.is_error || input.tool_response.error);
      recordActivity(root, task, input.tool_name || '', ti, !failed, lane ? lane.path : '');
    }
    if (config.file_tracking !== false && task) {
      const file = recordEdit(root, task, input.tool_name || '', ti, lane ? lane.path : root);
      if (file) { const h = editHint(root, config, task, file, `${input.session_id || ''}:${task}`); if (h) notes.push(h); }
    }
    if (config.live_activity !== false) {
      const laneTasks = new Set(loadLanes(root).map((l) => l.task));
      const items = takeInstructions(root, (x) => (lane ? x.task === lane.task : !laneTasks.has(x.task)));
      if (items.length) notes.push(instructionText(items));
    }
    if (notes.length) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notes.join('\n\n') } }) + '\n');
  }
} catch (e) { process.stderr.write(`works post-tool: ${e.message}\n`); }
process.exit(0);
