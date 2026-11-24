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
import { ensureBot } from '../scripts/discord.mjs';
import { syncSettings, syncState } from '../scripts/ghsync.mjs';
import { idPattern } from '../scripts/files.mjs';
import { tr, language, setLanguage, LANGUAGE_NAMES } from '../scripts/i18n.mjs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let input = {};
try {
  if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch { input = {}; }

async function main() {
  const root = findRoot(input.cwd || process.cwd());
  // Sprache für Claude in der ersten Zeile, absichtlich englisch (W-0041). Ohne .works nur, wenn nicht Englisch eingestellt ist.
  const lang = language(root);
  setLanguage(lang);
  const langLine = `Language: ${lang}${lang === 'en' ? '' : lang === 'de' ? ', answer in German, German docs in SKILL.de.md and references/de/' : `, answer in ${LANGUAGE_NAMES[lang] || lang}`}\n`;
  if (root || lang !== 'en') process.stdout.write(langLine);
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
      const ids = fixed.map((f) => f.id).join(', ');
      if (fixed.length) repairNotes.push(fixed.length === 1
        ? tr('1 task repaired ({ids}): description moved to the right section, missing sections added', { ids })
        : tr('{n} tasks repaired ({ids}): description moved to the right section, missing sections added', { n: fixed.length, ids }));
      config.migrations = [...migrations, 'sections-1'];
      saveConfig(root, config);
    } catch (e) { repairNotes.push(tr('Repair skipped: {msg}', { msg: e.message })); }
  }
  // Einmal nach der Migration language-1 (W-0041): sagen, dass die alte Sprache aus works init nicht mehr gilt.
  if (config.language_removed) {
    const old = config.language_removed;
    if (old !== lang) repairNotes.push(tr('The language "{old}" from an older works init no longer applies, output is now in {now}. "works lang {old}" switches back for all projects', { old, now: LANGUAGE_NAMES[lang] || lang }));
    delete config.language_removed;
    saveConfig(root, config);
  }
  registerProject(root);
  const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'works.mjs');
  // Fällige wiederkehrende Aufgaben anlegen.
  let recurNote = '';
  if (Array.isArray(config.recurring) && config.recurring.length) {
    const r = spawnSync(process.execPath, [CLI, 'recur', 'run'], { cwd: root, encoding: 'utf8', timeout: 20000, windowsHide: true, env: { ...process.env, WORKS_ACTOR: tr('Recurring') } });
    // Angelegte Aufgaben erkennt man an ihrer ID, in jeder Sprache ("Heute ist nichts fällig." hat keine).
    recurNote = (r.stdout || '').split('\n').map((l) => l.trim()).filter((l) => l && l.match(idPattern(config))).join('; ');
  }
  // GitHub-Abgleich im Hintergrund, damit der Start nicht wartet.
  const gs = syncSettings(config);
  const last = (syncState(root) || {}).last;
  if (gs.enabled && (!last || Date.now() - Date.parse(last) > gs.interval_min * 60000)) {
    try { spawn(process.execPath, [CLI, 'github', 'sync', '--quiet'], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch { /* gh fehlt */ }
  }
  generateIndex(root);
  refreshBoardIfPresent(root);
  let notes = [];
  try { notes = await refreshServers(root); } catch (e) { notes = [tr('Could not update the board server: {msg}', { msg: e.message })]; }
  // Discord-Bot (W-0036): nur wenn eingerichtet, einer je Rechner, eine neue Version ersetzt den alten.
  try { await ensureBot(); } catch { /* Sitzung startet auch ohne Bot */ }
  process.stdout.write(sessionSummary(root) + '\n');
  if (recurNote) process.stdout.write(`[works] ${recurNote}\n`);
  if (repairNotes.length) process.stdout.write(`[works] ${repairNotes.join('. ')}.\n`);
  const due = reportDue(root, config);
  if (due) process.stdout.write(`[works] ${tr('Weekly report {name} is due. If it fits, summarize the week in two to four sentences and run works report --week --summary "...". The user has set it up this way.', { name: reportName(due) })}\n`);
  if (notes.length) process.stdout.write(`[works] ${notes.join('. ')}. ${tr('Open board tabs reload themselves.')}\n`);
}

main().catch((e) => process.stderr.write(`works session-start: ${e.message}\n`)).finally(() => process.exit(0));
