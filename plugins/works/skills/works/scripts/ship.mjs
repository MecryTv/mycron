// works ship (W-0026): eine Aufgabe in einem Rutsch abschließen. Definition of Done prüfen, Board stoppen,
// mit --no-ff in den Hauptbranch mergen, works done --confirm, .works committen, pushen, Branch löschen,
// auf die CI warten, Plugins aktualisieren (nur in einem Marketplace-Repo) und das Board neu starten.
// Hält an, sobald etwas nicht stimmt; vor dem Push bleibt alles lokal.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readJson, exists, loadState } from './lib.mjs';
import { liveServer, stopProcess, clearServer, newestCli, OWN_CLI } from './server-control.mjs';
import { emit } from './discord.mjs';
import { tr } from './i18n.mjs';

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
  // Repo-Wurzel relativ zum Projektordner bestimmen, nicht über --show-toplevel: Das liefert den langen Pfad,
  // der Projektordner kann aber einen 8.3-Kurznamen enthalten (Windows-Runner: C:\Users\RUNNER~1). Gemischt
  // ergäben sich relative Pfade außerhalb des Repos.
  const cdup = git(root, ['rev-parse', '--show-cdup']);
  if (!cdup.ok) stop(tr('Not a Git repository. ship needs Git.'));
  const repo = path.resolve(root, cdup.out || '.');
  const worksRel = (path.relative(repo, path.join(root, '.works')) || '.works').split(path.sep).join('/');
  const task = id || loadState(root).active;
  if (!task) stop(tr('No active task. Name the task: works ship <ID>.'));
  const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).out;
  const base = baseBranch(repo);
  if (branch === base || branch === 'HEAD') stop(tr('You are on {branch}. ship completes a feature branch; switch to the branch of the task first.', { branch }));

  // 1. Definition of Done, solange noch nichts verändert ist.
  const dod = works(cli, root, ['done', task]);
  if (!dod.ok) stop(`${dod.out}\n\n${tr('ship stops: Definition of Done not met. Nothing was merged or pushed.')}`);
  log(`ok  ${tr('Definition of Done met ({id})', { id: task })}`);
  // Discord-Bot (W-0036): eine Nachricht je Lauf, die ihre Schritte abhakt. Ohne Einrichtung passiert nichts.
  const run = Date.now().toString(36);
  const tell = (step, extra = {}) => emit('ship', { id: task, step, run, ...extra }, root);
  tell('start');

  // 2. Nicht committete Änderungen außerhalb von .works gehören zur Aufgabe oder nicht: das entscheidet der Nutzer.
  // Neue, nicht verfolgte Dateien zählen mit: Eine vergessene Quelldatei fehlte sonst nach dem Merge.
  // Die Ausgabe ist gekürzt: Der ersten Zeile kann das führende Leerzeichen des Status fehlen.
  const inWorks = new RegExp(`^\\s*\\S{1,2}\\s+"?${worksRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`);
  const dirty = git(repo, ['status', '--porcelain']).out.split('\n').filter((l) => l.trim() && !inWorks.test(l));
  if (dirty.length) stop(tr('Uncommitted changes (?? = new file):\n{list}\nCommit, discard or add them to .gitignore first, then run ship again.', { list: dirty.join('\n') }));

  // 3. Board stoppen. Es startet am Ende mit der neuen Version auf demselben Port, bei einem Abbruch sofort.
  // Geprüft (W-0062): nur ein Board, das auf seinem Port wirklich antwortet, nie ein fremder Prozess mit alter PID.
  const board = await liveServer(root);
  if (board) { await stopProcess(board.pid); clearServer(root, board.pid); log(`ok  ${tr('Board stopped (port {port})', { port: board.port })}`); }
  const restartBoard = () => {
    if (!board) return;
    const args = ['board', '--serve', '--detach', `--port=${board.port}`, ...(board.host && board.host !== '127.0.0.1' ? [`--host=${board.host}`] : []), ...(open ? ['--open'] : [])];
    const r = works(newestCli(), root, args);
    log(r.ok ? `ok  ${r.out.split('\n').filter(Boolean).join(' · ')}` : `--  ${tr('Board does not start: {msg}', { msg: r.out.split('\n').pop() })}`);
  };
  try {
    const result = await finish();
    tell('done');
    restartBoard();
    return result;
  } catch (e) {
    tell('fail', { note: String(e.message || '').split('\n').filter(Boolean).pop() || '' });
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
    git(repo, ['add', '--', worksRel]);
    if (!git(repo, ['diff', '--cached', '--quiet']).ok) {
      const c = git(repo, ['commit', '-q', '-m', tr('works: {id} state before completion', { id: task })]);
      if (!c.ok) stop(tr('Commit of the .works changes failed: {err}', { err: c.err }));
    }

    // 5. Merge in den Hauptbranch.
    const remote = git(repo, ['remote', 'get-url', 'origin']);
    // Zurück auf den Feature-Branch. Klappt das nicht, sagt die Meldung, wo der Nutzer jetzt steht.
    const back = (msg) => {
      cleanLeftovers();
      const sb = git(repo, ['switch', '-q', branch]);
      if (sb.ok) appendTail(repo, timeTarget, tail);
      stop(sb.ok ? msg : `${msg}\n${tr('Caution: switching back to {branch} failed ({err}). You are on {current}.', { branch, err: sb.err, current: git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).out })}`);
    };
    // Unter Windows sperrt etwa ein Virenscanner frisch geschriebene Dateien kurz. git switch lässt sie dann liegen
    // (nur eine Warnung), und Merge oder Rückwechsel scheitern an "untracked files would be overwritten".
    // Entfernt werden nur nicht verfolgte Dateien, die genau der Fassung im Branch entsprechen.
    function cleanLeftovers() {
      const files = git(repo, ['ls-files', '--others', '--exclude-standard']).out.split('\n').filter(Boolean);
      for (const f of files) {
        const inBranch = git(repo, ['rev-parse', '-q', '--verify', `${branch}:${f}`]);
        if (!inBranch.ok || git(repo, ['hash-object', '--', f]).out !== inBranch.out) continue;
        for (let i = 0; i < 10; i++) {
          try { fs.rmSync(path.join(repo, f), { force: true }); break; } catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); }
        }
      }
    }
    const sw = git(repo, ['switch', '-q', base]);
    if (!sw.ok) back(tr('Switching to {base} failed: {err}', { base, err: sw.err }));
    cleanLeftovers();
    if (remote.ok && push) {
      const pull = git(repo, ['pull', '-q', '--ff-only', 'origin', base]);
      if (!pull.ok) back(tr('{base} cannot be fast-forwarded (git pull --ff-only): {err}. Sync {base} first.', { base, err: pull.err }));
    }
    const merge = git(repo, ['merge', '--no-ff', branch, '-m', `Merge branch '${branch}'`]);
    if (!merge.ok) {
      // Nur ein begonnener Merge (MERGE_HEAD) hat Konflikte; sonst hat git gar nicht erst angefangen.
      const started = git(repo, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).ok;
      if (started) git(repo, ['merge', '--abort']);
      back(started
        ? tr('Merge of {branch} into {base} has conflicts and was aborted. Resolve the conflicts on {branch} (git merge {base}), then run ship again.', { branch, base })
        : tr('Merge of {branch} into {base} is not possible: {err}', { branch, base, err: (merge.err || merge.out).split('\n').slice(0, 6).join('\n') }));
    }
    log(`ok  ${tr('{branch} merged into {base} with --no-ff', { branch, base })}`);
    tell('merge');
    // Die aufgehobenen Zeiten gleich zurückschreiben, damit sie auch bei einem Abbruch danach erhalten bleiben.
    appendTail(repo, timeTarget, tail);

    // 6. Aufgabe abschließen und .works committen.
    const done = works(cli, root, ['done', task, '--confirm']);
    if (!done.ok) stop(`${done.out}\n\n${tr('ship stops: works done --confirm failed. The merge is local and not pushed.')}`);
    git(repo, ['add', '--', worksRel]);
    if (!git(repo, ['diff', '--cached', '--quiet']).ok) git(repo, ['commit', '-q', '-m', tr('works: {id} done', { id: task })]);
    log(`ok  ${tr('{id} done and committed', { id: task })}`);

    // 7. Pushen, Branch löschen.
    const sha = git(repo, ['rev-parse', 'HEAD']).out;
    const sha7 = sha.slice(0, 7);
    if (!remote.ok) log(`--  ${tr('No remote origin, not pushed.')}`);
    else if (!push) log(`--  ${tr('Push skipped (--no-push).')}`);
    else {
      const p = git(repo, ['push', '-q', 'origin', base], 300000);
      if (!p.ok) stop(tr('Push failed: {err}\nThe completion is committed locally ({sha}).', { err: p.err, sha: sha7 }));
      log(`ok  ${tr('Pushed: {base} at {sha}', { base, sha: sha7 })}`);
      tell('push', { sha });
    }
    git(repo, ['branch', '-d', branch]);
    if (remote.ok && push && git(repo, ['ls-remote', '--exit-code', '--heads', 'origin', branch]).ok) git(repo, ['push', '-q', 'origin', '--delete', branch]);
    log(`ok  ${tr('Branch {branch} deleted', { branch })}`);

    // 8. CI des letzten Commits. Rot: anhalten, nichts aktualisieren.
    const github = remote.ok && /github\.com[:/]/.test(remote.out);
    const ciJs = github && ci && push ? ciScript() : null;
    if (!remote.ok || !push) log(`--  ${tr('CI: nothing pushed, skipped.')}`);
    else if (!github) log(`--  ${tr('CI: no GitHub remote, skipped.')}`);
    else if (!ci) log(`--  ${tr('CI skipped (--no-ci).')}`);
    else if (!ciJs) log(`--  ${tr('CI: plugin ci-watch not found. Check {sha} on GitHub.', { sha: sha7 })}`);
    else {
      log(`..  ${tr('CI for {sha} is running, waiting for the result', { sha: sha7 })}`);
      const r = spawnSync(process.execPath, [ciJs, '--sha', sha], { cwd: repo, encoding: 'utf8', timeout: 25 * 60000, windowsHide: true });
      const msg = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-6).join('\n');
      // ci-watch meldet "CI grün für <sha>: A, B." oder englisch "CI green for <sha>: A, B.".
      if (r.status === 0) tell('ci', { ok: true, workflows: ((msg.match(/CI (?:grün für|green for) \w+: (.+)\./) || [])[1] || '').split(', ').filter(Boolean).length });
      if (r.status === 1) tell('ci', { ok: false });
      if (r.status === 1) stop(tr('CI red for {sha}:\n{msg}\nPlugins not updated.', { sha: sha7, msg }));
      log(r.status === 0 ? `ok  ${tr('CI green for {sha}', { sha: sha7 })}` : `--  CI: ${msg.split('\n').pop()}`);
    }

    // 9. Plugins aktualisieren, wenn das Repo ein Marketplace ist.
    const mpFile = path.join(repo, '.claude-plugin', 'marketplace.json');
    if (update && exists(mpFile)) {
      const mp = readJson(mpFile, {}) || {};
      const reg = readJson(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'), { plugins: {} }) || { plugins: {} };
      const safe = (n) => /^[\w.-]+$/.test(String(n || ''));
      if (!safe(mp.name)) stop(tr('Invalid marketplace name in {file}.', { file: mpFile }));
      const installed = (mp.plugins || []).map((p) => p.name).filter((n) => safe(n) && (reg.plugins || {})[`${n}@${mp.name}`]);
      // claude als .exe direkt; als npm-Installation (claude.cmd) unter Windows nur über die Shell aufrufbar, die Namen sind oben geprüft.
      const claude = (args) => {
        const r = spawnSync('claude', args, { cwd: repo, encoding: 'utf8', timeout: 300000, windowsHide: true });
        return r.error && r.error.code === 'ENOENT' && process.platform === 'win32' ? spawnSync('claude.cmd', args, { cwd: repo, encoding: 'utf8', timeout: 300000, windowsHide: true, shell: true }) : r;
      };
      const m = claude(['plugin', 'marketplace', 'update', mp.name]);
      if (m.error || m.status !== 0) log(`--  ${tr('Plugins not updated (claude plugin marketplace update {name}): {err}', { name: mp.name, err: String(m.error ? m.error.message : m.stderr || m.stdout).trim().split('\n').pop() })}`);
      else {
        for (const n of installed) {
          const u = claude(['plugin', 'update', `${n}@${mp.name}`]);
          log(u.status === 0 ? `ok  ${tr('Plugin {name} updated', { name: n })}` : `--  Plugin ${n}: ${String(u.stderr || u.stdout).trim().split('\n').pop()}`);
        }
        if (!installed.length) log(`--  ${tr('No plugins from {name} installed.', { name: mp.name })}`);
        else tell('update');
      }
    }

    // 10. Das Board startet danach mit der neuesten Version (restartBoard oben). --open öffnet nur ohne offenen works-Tab.
    return { sha, base, branch };
  }
}
