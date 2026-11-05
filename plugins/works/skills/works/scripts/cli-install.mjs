// Richtet den Befehl works im Terminal ein: Startscript in ~/.works/bin, dazu ein Aufruf im PATH.
// Linux und macOS: ~/.local/bin/works (Shell-Script), PATH-Zeile in .bashrc, .zshrc oder .profile, falls nötig.
// Windows: %USERPROFILE%\.works\bin\works.cmd und works.ps1, Ordner im Benutzer-PATH über PowerShell.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MARK = '# works CLI (works install-cli)';
const WIN = process.platform === 'win32';

export function cliPaths({ home = os.homedir(), dir } = {}) {
  const bin = path.join(home, '.works', 'bin');
  const shimDir = dir ? path.resolve(dir) : WIN ? bin : path.join(home, '.local', 'bin');
  return { home, bin, launcher: path.join(bin, 'works.mjs'), conf: path.join(bin, 'launcher.json'), shimDir, shims: WIN ? [path.join(shimDir, 'works.cmd'), path.join(shimDir, 'works.ps1')] : [path.join(shimDir, 'works')] };
}

const onPath = (dir) => String(process.env.PATH || '').split(path.delimiter).some((p) => p && path.resolve(p) === path.resolve(dir));

function whichOther() {
  const r = spawnSync(WIN ? 'where' : 'which', ['-a', 'works'].slice(WIN ? 1 : 0), { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
}

function rcFiles(home) {
  const shell = path.basename(process.env.SHELL || '');
  const list = [];
  if (shell === 'zsh' || fs.existsSync(path.join(home, '.zshrc'))) list.push(path.join(home, '.zshrc'));
  if (shell === 'bash' || fs.existsSync(path.join(home, '.bashrc'))) list.push(path.join(home, '.bashrc'));
  if (!list.length) list.push(path.join(home, '.profile'));
  return [...new Set(list)];
}

export function installCli({ dir, path: addPath = true, dryRun = false, home } = {}) {
  const p = cliPaths({ home, dir });
  const notes = [];
  const write = (f, text, mode) => { if (dryRun) return; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); if (mode) fs.chmodSync(f, mode); };
  write(p.launcher, fs.readFileSync(path.join(HERE, 'launcher.mjs'), 'utf8'), 0o755);
  write(p.conf, JSON.stringify({ fallback: path.join(HERE, 'works.mjs'), installed: new Date().toISOString() }, null, 2) + '\n');
  notes.push(`Startscript: ${p.launcher}`);
  const node = process.execPath;
  if (WIN) {
    write(p.shims[0], `@echo off\r\nset "WORKS_NODE=node"\r\nwhere node >nul 2>nul || set "WORKS_NODE=${node}"\r\n"%WORKS_NODE%" "${p.launcher}" %*\r\n`);
    write(p.shims[1], `$n = (Get-Command node -ErrorAction SilentlyContinue).Source; if (-not $n) { $n = '${node.replace(/'/g, "''")}' }\r\n& $n '${p.launcher.replace(/'/g, "''")}' @args\r\nexit $LASTEXITCODE\r\n`);
  } else {
    write(p.shims[0], `#!/bin/sh\n${MARK}\nif command -v node >/dev/null 2>&1; then exec node "${p.launcher}" "$@"; fi\nexec "${node}" "${p.launcher}" "$@"\n`, 0o755);
  }
  notes.push(`Befehl: ${p.shims.join(', ')}`);
  let pathChanged = '';
  if (!onPath(p.shimDir)) {
    if (!addPath) notes.push(`${p.shimDir} steht nicht im PATH. Selbst ergänzen, damit works überall funktioniert.`);
    else if (WIN) {
      const ps = `$d='${p.shimDir.replace(/'/g, "''")}'; $c=[Environment]::GetEnvironmentVariable('Path','User'); if (-not $c) { $c='' }; if (($c -split ';') -notcontains $d) { [Environment]::SetEnvironmentVariable('Path', ($c.TrimEnd(';') + ';' + $d).TrimStart(';'), 'User') }`;
      if (!dryRun) { const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' }); if (r.status !== 0) notes.push(`PATH ließ sich nicht setzen: ${(r.stderr || '').trim()}. Ordner ${p.shimDir} selbst in den Benutzer-PATH eintragen.`); else pathChanged = 'Benutzer-PATH'; }
      else pathChanged = 'Benutzer-PATH';
    } else {
      const files = rcFiles(p.home);
      for (const f of files) {
        const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
        if (cur.includes(MARK)) continue;
        if (!dryRun) fs.appendFileSync(f, `${cur && !cur.endsWith('\n') ? '\n' : ''}\n${MARK}\nexport PATH="${p.shimDir}:$PATH"\n`);
      }
      pathChanged = files.map((f) => path.basename(f)).join(', ');
    }
  }
  const others = whichOther().filter((x) => !p.shims.some((s) => path.resolve(s).toLowerCase() === path.resolve(x).toLowerCase()));
  if (others.length) notes.push(`Achtung: Es gibt schon einen anderen Befehl works (${others[0]}). Je nach Reihenfolge im PATH wird dieser zuerst gefunden.`);
  return { ...p, pathChanged, onPath: onPath(p.shimDir), notes };
}

export function uninstallCli({ dir, home, dryRun = false } = {}) {
  const p = cliPaths({ home, dir });
  const removed = [];
  for (const f of [...p.shims, p.launcher, p.conf]) if (fs.existsSync(f)) { if (!dryRun) fs.rmSync(f); removed.push(f); }
  if (!WIN) {
    for (const f of rcFiles(p.home)) {
      if (!fs.existsSync(f)) continue;
      const cur = fs.readFileSync(f, 'utf8');
      if (!cur.includes(MARK)) continue;
      const next = cur.replace(new RegExp(`\\n?${MARK.replace(/[()]/g, '\\$&')}\\nexport PATH="[^"\\n]*"\\n`, 'g'), '\n');
      if (!dryRun) fs.writeFileSync(f, next);
      removed.push(`PATH-Zeile in ${path.basename(f)}`);
    }
  } else if (!dryRun) {
    const ps = `$d='${p.shimDir.replace(/'/g, "''")}'; $c=[Environment]::GetEnvironmentVariable('Path','User'); if ($c) { [Environment]::SetEnvironmentVariable('Path', (($c -split ';') | Where-Object { $_ -and $_ -ne $d }) -join ';', 'User') }`;
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    removed.push('Eintrag im Benutzer-PATH');
  }
  return removed;
}
