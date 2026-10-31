#!/usr/bin/env node
// Claude Code SubagentStop Hook: rechnet den Tokenverbrauch eines Agenten der passenden Aufgabe zu.
// Arbeitet der Agent im Worktree einer parallelen Aufgabe, zählt er für diese, sonst für die aktive Aufgabe.
import fs from 'node:fs';
import { findRoot, loadConfig, loadState } from '../scripts/lib.mjs';
import { collectUsage, recordUsage } from '../scripts/usage.mjs';
import { loadLanes } from '../scripts/parallel.mjs';

let input = {};
try {
  if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch { input = {}; }

try {
  const root = findRoot(input.cwd || process.cwd());
  const tp = input.agent_transcript_path;
  if (root && tp && tp !== input.transcript_path && fs.existsSync(tp)) {
    const config = loadConfig(root);
    if (config.time_tracking !== false) {
      const list = collectUsage(root, tp, `agent:${input.agent_id || tp}`);
      if (list.length) {
        let head = '';
        try { const fd = fs.openSync(tp, 'r'); const b = Buffer.alloc(Math.min(fs.statSync(tp).size, 256 * 1024)); fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd); head = b.toString('utf8'); } catch { head = ''; }
        const lane = loadLanes(root).find((l) => head.includes(l.path) || head.includes(JSON.stringify(l.path).slice(1, -1)));
        recordUsage(root, lane ? lane.task : (loadState(root).active || ''), `agent:${input.agent_id || ''}`, list);
      }
    }
  }
} catch (e) { process.stderr.write(`works subagent-stop: ${e.message}\n`); }
process.exit(0);
