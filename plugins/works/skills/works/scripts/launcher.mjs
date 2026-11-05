#!/usr/bin/env node
// Startscript für den Befehl works im Terminal, ohne Claude und ohne langen Pfad.
// works install-cli kopiert diese Datei nach ~/.works/bin/. Bei jedem Aufruf sucht sie die neueste
// installierte works-Version (Plugin-Cache von Claude Code oder Skill-Ordner), damit Updates sofort gelten.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REL = path.join('skills', 'works', 'scripts', 'works.mjs');
const home = os.homedir();
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

function candidates() {
  const out = [];
  // 1. Aktive Plugin-Installationen laut Claude Code
  const reg = readJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'));
  if (reg && reg.plugins) {
    const entries = Object.entries(reg.plugins).filter(([k]) => k.split('@')[0] === 'works')
      .flatMap(([, v]) => (Array.isArray(v) ? v : [v])).filter((e) => e && e.installPath)
      .sort((a, b) => String(b.lastUpdated || '').localeCompare(String(a.lastUpdated || '')));
    for (const e of entries) out.push({ cli: path.join(e.installPath, REL), rank: 3 });
  }
  // 2. Plugin-Cache durchsuchen: ~/.claude/plugins/cache/<marketplace>/works/<version>/
  const cache = path.join(home, '.claude', 'plugins', 'cache');
  try {
    for (const m of fs.readdirSync(cache)) {
      const dir = path.join(cache, m, 'works');
      try { for (const v of fs.readdirSync(dir)) out.push({ cli: path.join(dir, v, REL), rank: 2 }); } catch { /* kein works */ }
    }
  } catch { /* kein Cache */ }
  // 3. Skill-Ordner
  out.push({ cli: path.join(home, '.claude', 'skills', 'works', 'scripts', 'works.mjs'), rank: 1 });
  // 4. Ort beim Einrichten
  const conf = readJson(path.join(path.dirname(fileURLToPath(import.meta.url)), 'launcher.json'));
  if (conf && conf.fallback) out.push({ cli: conf.fallback, rank: 0 });
  return out.filter((c) => exists(c.cli));
}

function newest() {
  const list = candidates();
  if (!list.length) return null;
  const top = Math.max(...list.map((c) => c.rank));
  if (top === 3) return list.find((c) => c.rank === 3).cli;
  const stamp = (f) => { try { return fs.statSync(path.resolve(path.dirname(f), '..', '..', '..', '.claude-plugin', 'plugin.json')).ctimeMs; } catch { try { return fs.statSync(f).ctimeMs; } catch { return 0; } } };
  return list.filter((c) => c.rank === top).sort((a, b) => stamp(b.cli) - stamp(a.cli))[0].cli;
}

const cli = process.env.WORKS_CLI && exists(process.env.WORKS_CLI) ? process.env.WORKS_CLI : newest();
if (!cli) {
  process.stderr.write('works ist nicht mehr installiert. In Claude Code: /plugin install works@mycron\n');
  process.exit(1);
}
if (process.argv[2] === 'which') { process.stdout.write(cli + '\n'); process.exit(0); }
const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
