// Verwaltung des Live-Board-Servers: Versionskennung, Registrierung, Erkennung veralteter Server und Austausch.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { SKILL_DIR, worksDir, exists, readJson, writeJson, run } from './lib.mjs';

const VERSIONED = ['scripts', path.join('scripts', 'board'), 'hooks'];

// Kennung der installierten Version: Hash über alle Skripte und Board-Dateien eines Skill-Ordners.
// Ändert sich bei jedem Update, auch ohne Versionsnummer in plugin.json.
export function buildVersion(skillDir = SKILL_DIR) {
  const h = crypto.createHash('sha256');
  for (const sub of VERSIONED) {
    const dir = path.join(skillDir, sub);
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /\.(mjs|js|css|html)$/.test(f)).sort(); } catch { continue; }
    for (const f of files) {
      h.update(`${sub}/${f}\0`);
      h.update(fs.readFileSync(path.join(dir, f)));
    }
  }
  return h.digest('hex').slice(0, 12);
}

let cachedVersion = null;
export function runningVersion() {
  if (!cachedVersion) cachedVersion = buildVersion();
  return cachedVersion;
}

export const OWN_CLI = path.join(SKILL_DIR, 'scripts', 'works.mjs');
export const IS_PLUGIN = exists(path.resolve(SKILL_DIR, '..', '..', '.claude-plugin', 'plugin.json'));

function findFiles(base, rel, depth, out) {
  if (depth < 0) return;
  let entries = [];
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(base, e.name);
    const cand = path.join(dir, rel);
    if (exists(cand)) out.push(cand);
    else findFiles(dir, rel, depth - 1, out);
  }
}

// Aktuellste installierte Version des CLI. Bei Plugins liegt jede Version in einem eigenen Cache-Ordner,
// beim Skill-Ordner wird in place aktualisiert. Nimmt die zuletzt geänderte Installation.
export function newestCli() {
  if (!IS_PLUGIN) return OWN_CLI;
  // Claude Code führt die aktiven Installationen in installed_plugins.json, das ist die verlässlichste Quelle.
  const registry = readJson(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'), null);
  if (registry && registry.plugins) {
    const entries = Object.entries(registry.plugins)
      .filter(([k]) => k.split('@')[0] === 'works')
      .flatMap(([, v]) => (Array.isArray(v) ? v : [v]))
      .filter((e) => e && e.installPath)
      .sort((a, b) => String(b.lastUpdated || '').localeCompare(String(a.lastUpdated || '')));
    for (const e of entries) {
      const cli = path.join(e.installPath, 'skills', 'works', 'scripts', 'works.mjs');
      if (exists(cli)) return cli;
    }
  }
  const pluginRoot = path.resolve(SKILL_DIR, '..', '..');
  const versionsDir = path.dirname(pluginRoot);
  const found = [];
  findFiles(versionsDir, path.join('skills', 'works', 'scripts', 'works.mjs'), 1, found);
  const cacheRoot = path.join(os.homedir(), '.claude', 'plugins');
  if (!found.length && exists(cacheRoot)) findFiles(cacheRoot, path.join('skills', 'works', 'scripts', 'works.mjs'), 4, found);
  if (!found.includes(OWN_CLI)) found.push(OWN_CLI);
  // ctime lässt sich beim Kopieren nicht übernehmen und zeigt daher den Installationszeitpunkt.
  const mtime = (f) => { try { return fs.statSync(path.resolve(path.dirname(f), '..', '..', '..', '.claude-plugin', 'plugin.json')).ctimeMs; } catch { try { return fs.statSync(f).ctimeMs; } catch { return 0; } } };
  return found.filter(exists).sort((a, b) => mtime(b) - mtime(a))[0] || OWN_CLI;
}

export function cliVersion(cli) {
  return buildVersion(path.resolve(path.dirname(cli), '..'));
}

// ---------- Registrierung pro Projekt ----------

export function serverFile(root) { return path.join(worksDir(root), 'server.json'); }

export function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

export function readServer(root) {
  const info = readJson(serverFile(root), null);
  if (!info) return null;
  if (!isAlive(info.pid)) { try { fs.unlinkSync(serverFile(root)); } catch { /* weg */ } return null; }
  return info;
}

export function writeServer(root, info) { writeJson(serverFile(root), info); }

export function clearServer(root, pid) {
  const info = readJson(serverFile(root), null);
  if (info && info.pid === pid) { try { fs.unlinkSync(serverFile(root)); } catch { /* weg */ } }
}

// Ergänzt fehlende Einträge in .works/.gitignore, damit lokale Dateien nicht im Repo landen.
export function ensureGitignore(root, entries) {
  const file = path.join(worksDir(root), '.gitignore');
  if (!exists(file)) return;
  const cur = fs.readFileSync(file, 'utf8');
  if (/^\*$/m.test(cur)) return;
  const lines = cur.split('\n').map((l) => l.trim());
  const missing = entries.filter((e) => !lines.includes(e));
  if (missing.length) fs.appendFileSync(file, (cur.endsWith('\n') ? '' : '\n') + missing.join('\n') + '\n');
}

// ---------- Server ohne Registrierung (ältere Versionen) finden ----------

function procCwd(pid) {
  if (process.platform === 'linux') {
    try { return fs.readlinkSync(`/proc/${pid}/cwd`); } catch { return null; }
  }
  if (process.platform === 'darwin') {
    const r = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
    const m = r.ok && r.stdout.match(/^n(.+)$/m);
    return m ? m[1] : null;
  }
  return null;
}

// Findet laufende "works ... board --serve" Prozesse, deren Arbeitsordner dieses Projekt ist.
export function findServerProcesses(root) {
  const out = [];
  if (process.platform === 'win32') return out;
  const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
  const want = real(root);
  let list = [];
  if (process.platform === 'linux' && exists('/proc')) {
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      let cmd = '';
      try { cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0').join(' '); } catch { continue; }
      list.push({ pid: parseInt(d, 10), cmd });
    }
  } else {
    const r = run('ps', ['-ax', '-o', 'pid=,command=']);
    if (r.ok) list = r.stdout.split('\n').map((l) => l.trim().match(/^(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: parseInt(m[1], 10), cmd: m[2] }));
  }
  for (const p of list) {
    if (p.pid === process.pid || p.pid === process.ppid) continue;
    if (!/works\.mjs\S*\s+board\b.*--serve/.test(p.cmd)) continue;
    // Startbefehle (--detach, --restart) und Abfragen sind keine Server.
    if (/--(detach|restart|status|stop)\b/.test(p.cmd)) continue;
    const cwd = procCwd(p.pid);
    if (!cwd || real(cwd) !== want) continue;
    const port = (p.cmd.match(/--port[= ](\d+)/) || [])[1];
    out.push({ pid: p.pid, cmd: p.cmd, port: port ? parseInt(port, 10) : null });
  }
  return out;
}

export async function stopProcess(pid, timeoutMs = 10000) {
  if (!isAlive(pid)) return true;
  try { process.kill(pid, 'SIGTERM'); } catch { return !isAlive(pid); }
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  try { process.kill(pid, 'SIGKILL'); } catch { /* weg */ }
  await new Promise((r) => setTimeout(r, 200));
  return !isAlive(pid);
}

// Startet den Board-Server losgelöst im Hintergrund. takeover: Port übernehmen, sobald er frei ist.
export function startDetached(root, { cli = newestCli(), port = 4747, host = '127.0.0.1', takeover = true } = {}) {
  ensureGitignore(root, ['server.json', 'server.log', '.tmp/']);
  const log = fs.openSync(path.join(worksDir(root), 'server.log'), 'a');
  const args = [cli, 'board', '--serve', `--port=${port}`, `--host=${host}`];
  if (takeover) args.push('--takeover');
  const child = spawn(process.execPath, args, { cwd: root, detached: true, stdio: ['ignore', log, log], env: { ...process.env, WORKS_ACTOR: '' } });
  child.unref();
  fs.closeSync(log);
  return child.pid;
}

// Ersetzt veraltete Board-Server dieses Projekts durch die aktuelle Version. Gibt eine kurze Meldung zurück.
export async function refreshServers(root) {
  const cli = newestCli();
  const current = cliVersion(cli);
  const info = readServer(root);
  const notes = [];
  if (info) {
    if (info.version !== current) {
      await stopProcess(info.pid);
      startDetached(root, { cli, port: info.port, host: info.host || '127.0.0.1' });
      notes.push(`Board-Server auf Port ${info.port} auf die neue Version umgestellt`);
    }
    return notes;
  }
  // Server aus Versionen vor der Registrierung
  for (const p of findServerProcesses(root)) {
    await stopProcess(p.pid);
    startDetached(root, { cli, port: p.port || 4747 });
    notes.push(`Alten Board-Server (PID ${p.pid}) durch die neue Version ersetzt, Port ${p.port || 4747}`);
  }
  return notes;
}
