// works ship (W-0026): eine Aufgabe in einem Rutsch abschließen. Definition of Done prüfen, Board stoppen,
// mit --no-ff in den Hauptbranch mergen, works done --confirm, .works committen, pushen, Branch löschen,
// auf die CI warten, Plugins aktualisieren (nur in einem Marketplace-Repo) und das Board neu starten.
// Hält an, sobald etwas nicht stimmt; vor dem Push bleibt alles lokal.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readJson, exists, loadState } from './lib.mjs';
import { readServer, stopProcess, clearServer, newestCli, OWN_CLI } from './server-control.mjs';

export class ShipStop extends Error {}

const GENERATED = ['.works/WORKS.md', '.works/time.jsonl'];

function git(cwd, args, timeout = 120000) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout, windowsHide: true });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function works(cli, cwd, args) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: 600000, windowsHide: true, env: { ...process.env, WORKS_ACTOR: '' } });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

function baseBranch(top) {
  const head = git(top, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (head.ok && head.out) return head.out.replace(/^origin\//, '');
  for (const b of ['main', 'master']) if (git(top, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`]).ok) return b;
  return 'main';
}

// CI-Wächter aus dem installierten Plugin ci-watch, sonst aus dem Repo nebenan (plugins/ci-watch).
function ciScript() {
  const reg = readJson(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'), null);
  const rel = path.join('skills', 'ci-watch', 'scripts', 'ci-status.mjs');
  const entries = Object.entries((reg && reg.plugins) || {}).filter(([k]) => k.split('@')[0] === 'ci-watch').flatMap(([, v]) => (Array.isArray(v) ? v : [v]));
  for (const e of entries) if (e && e.installPath && exists(path.join(e.installPath, rel))) return path.join(e.installPath, rel);
  const local = path.resolve(path.dirname(OWN_CLI), '..', '..', '..', '..', 'ci-watch', rel);
  return exists(local) ? local : null;
}

// Neue, noch nicht committete Zeilen der Zeiterfassung. Sie gehen beim Zurücksetzen sonst verloren.
function uncommittedTail(top, rel) {
  const file = path.join(top, rel);
  if (!exists(file)) return '';
  const cur = fs.readFileSync(file, 'utf8');
  const committed = git(top, ['show', `HEAD:${rel}`]);
  if (!committed.ok) return cur;
  const old = committed.out;
  if (cur.startsWith(old)) return cur.slice(old.length).replace(/^\r?\n/, '');
  const known = new Set(old.split(/\r?\n/));
  return cur.split(/\r?\n/).filter((l) => l.trim() && !known.has(l)).map((l) => l + '\n').join('');
}

function appendTail(top, rel, tail) {
  if (!tail) return;
  const file = path.join(top, rel);
  const cur = exists(file) ? fs.readFileSync(file, 'utf8') : '';
  fs.writeFileSync(file, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + tail);
}

export async function ship(root, { id = '', push = true, ci = true, update = true, open = true, log = (s) => process.stdout.write(s + '\n') } = {}) {
  const cli = OWN_CLI;
  const stop = (msg) => { throw new ShipStop(msg); };
  const top = git(root, ['rev-parse', '--show-toplevel']);
  if (!top.ok) stop('Kein Git-Repository. ship braucht Git.');
  const repo = path.resolve(top.out);
  const task = id || loadState(root).active;
  if (!task) stop('Keine aktive Aufgabe. Aufgabe angeben: works ship <ID>.');
  const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).out;
  const base = baseBranch(repo);
  if (branch === base || branch === 'HEAD') stop(`Du bist auf ${branch}. ship schließt einen Feature-Branch ab; erst auf den Branch der Aufgabe wechseln.`);

  // 1. Definition of Done, solange noch nichts verändert ist.
  const dod = works(cli, root, ['done', task]);
  if (!dod.ok) stop(`${dod.out}\n\nship hält an: Definition of Done nicht erfüllt. Nichts wurde gemergt oder gepusht.`);
  log(`ok  Definition of Done erfüllt (${task})`);

  // 2. Nicht committete Änderungen außerhalb von .works gehören zur Aufgabe oder nicht: das entscheidet der Nutzer.
  // Neue, nicht verfolgte Dateien zählen mit: Eine vergessene Quelldatei fehlte sonst nach dem Merge.
  // Die Ausgabe ist gekürzt: Der ersten Zeile kann das führende Leerzeichen des Status fehlen.
  const dirty = git(repo, ['status', '--porcelain']).out.split('\n').filter((l) => l.trim() && !/^\s*\S{1,2}\s+"?\.works\//.test(l));
  if (dirty.length) stop(`Nicht committete Änderungen (?? = neue Datei):\n${dirty.join('\n')}\nErst committen, verwerfen oder in .gitignore eintragen, dann ship erneut.`);

  // 3. Board stoppen. Es startet am Ende mit der neuen Version auf demselben Port, bei einem Abbruch sofort.
  const board = readServer(root);
  if (board) { await stopProcess(board.pid); clearServer(root, board.pid); log(`ok  Board gestoppt (Port ${board.port})`); }
  const restartBoard = () => {
    if (!board) return;
    const args = ['board', '--serve', '--detach', `--port=${board.port}`, ...(board.host && board.host !== '127.0.0.1' ? [`--host=${board.host}`] : []), ...(open ? ['--open'] : [])];
    const r = works(newestCli(), root, args);
    log(r.ok ? `ok  ${r.out.split('\n').filter(Boolean).join(' · ')}` : `--  Board startet nicht: ${r.out.split('\n').pop()}`);
  };
  try {
    const result = await finish();
    restartBoard();
    return result;
  } catch (e) {
    if (e instanceof ShipStop) restartBoard();
    throw e;
  }

  async function finish() {

    // 4. Generierte Dateien zurücksetzen, neue Zeiten merken. Übrige .works-Änderungen auf dem Branch committen.
    const timeTarget = path.relative(repo, path.join(root, '.works', 'time.jsonl')).split(path.sep).join('/');
    const tracked = GENERATED.map((g) => path.relative(repo, path.join(root, g)).split(path.sep).join('/')).filter((g) => git(repo, ['ls-files', '--error-unmatch', g]).ok);
    // Nur eine verfolgte time.jsonl wird zurückgesetzt; eine neue geht mit dem Commit unten ganz mit.
    const tail = tracked.includes(timeTarget) ? uncommittedTail(repo, timeTarget) : '';
    if (tracked.length) git(repo, ['checkout', '--', ...tracked]);
    git(repo, ['add', '--', path.relative(repo, path.join(root, '.works')) || '.works']);
    if (!git(repo, ['diff', '--cached', '--quiet']).ok) {
      const c = git(repo, ['commit', '-q', '-m', `works: ${task} Stand vor dem Abschluss`]);
      if (!c.ok) stop(`Commit der .works-Änderungen fehlgeschlagen: ${c.err}`);
    }

    // 5. Merge in den Hauptbranch.
    const remote = git(repo, ['remote', 'get-url', 'origin']);
    const back = (msg) => { git(repo, ['switch', '-q', branch]); appendTail(repo, timeTarget, tail); stop(msg); };
    const sw = git(repo, ['switch', '-q', base]);
    if (!sw.ok) back(`Wechsel nach ${base} fehlgeschlagen: ${sw.err}`);
    if (remote.ok && push) {
      const pull = git(repo, ['pull', '-q', '--ff-only', 'origin', base]);
      if (!pull.ok) back(`${base} lässt sich nicht vorspulen (git pull --ff-only): ${pull.err}. Erst ${base} abgleichen.`);
    }
    const merge = git(repo, ['merge', '--no-ff', branch, '-m', `Merge branch '${branch}'`]);
    if (!merge.ok) { git(repo, ['merge', '--abort']); back(`Merge von ${branch} in ${base} hat Konflikte und wurde abgebrochen. Konflikte auf ${branch} lösen (git merge ${base}), dann ship erneut.`); }
    log(`ok  ${branch} mit --no-ff in ${base} gemergt`);
    // Die aufgehobenen Zeiten gleich zurückschreiben, damit sie auch bei einem Abbruch danach erhalten bleiben.
    appendTail(repo, timeTarget, tail);

    // 6. Aufgabe abschließen und .works committen.
    const done = works(cli, root, ['done', task, '--confirm']);
    if (!done.ok) stop(`${done.out}\n\nship hält an: works done --confirm fehlgeschlagen. Der Merge ist lokal und nicht gepusht.`);
    git(repo, ['add', '--', path.relative(repo, path.join(root, '.works')) || '.works']);
    if (!git(repo, ['diff', '--cached', '--quiet']).ok) git(repo, ['commit', '-q', '-m', `works: ${task} erledigt`]);
    log(`ok  ${task} erledigt und committet`);

    // 7. Pushen, Branch löschen.
    const sha = git(repo, ['rev-parse', 'HEAD']).out;
    if (!remote.ok) log('--  Kein Remote origin, nicht gepusht.');
    else if (!push) log('--  Push übersprungen (--no-push).');
    else {
      const p = git(repo, ['push', '-q', 'origin', base], 300000);
      if (!p.ok) stop(`Push fehlgeschlagen: ${p.err}\nDer Abschluss ist lokal committet (${sha.slice(0, 7)}).`);
      log(`ok  Gepusht: ${base} auf ${sha.slice(0, 7)}`);
    }
    git(repo, ['branch', '-d', branch]);
    if (remote.ok && push && git(repo, ['ls-remote', '--exit-code', '--heads', 'origin', branch]).ok) git(repo, ['push', '-q', 'origin', '--delete', branch]);
    log(`ok  Branch ${branch} gelöscht`);

    // 8. CI des letzten Commits. Rot: anhalten, nichts aktualisieren.
    const github = remote.ok && /github\.com[:/]/.test(remote.out);
    const ciJs = github && ci && push ? ciScript() : null;
    if (!remote.ok || !push) log('--  CI: nichts gepusht, übersprungen.');
    else if (!github) log('--  CI: kein GitHub-Remote, übersprungen.');
    else if (!ci) log('--  CI übersprungen (--no-ci).');
    else if (!ciJs) log(`--  CI: Plugin ci-watch nicht gefunden. Stand prüfen: ${sha.slice(0, 7)} auf GitHub.`);
    else {
      log(`..  CI für ${sha.slice(0, 7)} läuft, warte auf das Ergebnis`);
      const r = spawnSync(process.execPath, [ciJs, '--sha', sha], { cwd: repo, encoding: 'utf8', timeout: 25 * 60000, windowsHide: true });
      const msg = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-6).join('\n');
      if (r.status === 1) stop(`CI rot für ${sha.slice(0, 7)}:\n${msg}\nPlugins nicht aktualisiert, Board nicht neu gestartet.`);
      log(r.status === 0 ? `ok  CI grün für ${sha.slice(0, 7)}` : `--  CI: ${msg.split('\n').pop()}`);
    }

    // 9. Plugins aktualisieren, wenn das Repo ein Marketplace ist.
    const mpFile = path.join(repo, '.claude-plugin', 'marketplace.json');
    if (update && exists(mpFile)) {
      const mp = readJson(mpFile, {}) || {};
      const reg = readJson(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'), { plugins: {} }) || { plugins: {} };
      const safe = (n) => /^[\w.-]+$/.test(String(n || ''));
      if (!safe(mp.name)) stop(`Ungültiger Marketplace-Name in ${mpFile}.`);
      const installed = (mp.plugins || []).map((p) => p.name).filter((n) => safe(n) && (reg.plugins || {})[`${n}@${mp.name}`]);
      // claude als .exe direkt; als npm-Installation (claude.cmd) unter Windows nur über die Shell aufrufbar, die Namen sind oben geprüft.
      const claude = (args) => {
        const r = spawnSync('claude', args, { cwd: repo, encoding: 'utf8', timeout: 300000, windowsHide: true });
        return r.error && r.error.code === 'ENOENT' && process.platform === 'win32' ? spawnSync('claude.cmd', args, { cwd: repo, encoding: 'utf8', timeout: 300000, windowsHide: true, shell: true }) : r;
      };
      const m = claude(['plugin', 'marketplace', 'update', mp.name]);
      if (m.error || m.status !== 0) log(`--  Plugins nicht aktualisiert (claude plugin marketplace update ${mp.name}): ${String(m.error ? m.error.message : m.stderr || m.stdout).trim().split('\n').pop()}`);
      else {
        for (const n of installed) {
          const u = claude(['plugin', 'update', `${n}@${mp.name}`]);
          log(u.status === 0 ? `ok  Plugin ${n} aktualisiert` : `--  Plugin ${n}: ${String(u.stderr || u.stdout).trim().split('\n').pop()}`);
        }
        if (!installed.length) log(`--  Keine Plugins aus ${mp.name} installiert.`);
      }
    }

    // 10. Das Board startet danach mit der neuesten Version (restartBoard oben). --open öffnet nur ohne offenen works-Tab.
    return { sha, base, branch };
  }
}
