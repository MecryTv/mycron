// Git-Daten zu einer Aufgabe: Branch, Commits mit der Aufgaben-ID, geänderte Dateien und Diffs.
// Alle Aufrufe ohne Shell, mit festen Argumenten und Zeitlimit.
import { execFile } from 'node:child_process';

const MAX_DIFF_LINES = 400;

function git(root, args, { timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: root, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || ''), err: String(stderr || '') });
    });
  });
}

function run(cmd, args, root, timeout = 4000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: root, timeout, maxBuffer: 1024 * 1024 }, (err, stdout) => resolve(err ? null : String(stdout || '')));
  });
}

async function defaultBranch(root) {
  const head = await git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (head.ok && head.out.trim()) return head.out.trim();
  for (const b of ['main', 'master', 'develop']) {
    if ((await git(root, ['rev-parse', '--verify', '--quiet', b])).ok) return b;
  }
  return null;
}

function parseNumstat(text) {
  const files = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m) continue;
    let file = m[3];
    const ren = file.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
    if (ren) file = `${ren[1]}${ren[3]}${ren[4]}`;
    else if (file.includes(' => ')) file = file.split(' => ').pop();
    const cur = files.get(file) || { file, add: 0, del: 0, binary: false };
    if (m[1] === '-') cur.binary = true; else { cur.add += +m[1]; cur.del += +m[2]; }
    files.set(file, cur);
  }
  return [...files.values()];
}

export async function codeInfo(root, task) {
  const inside = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok) return { git: false };
  const id = task.id;
  const base = await defaultBranch(root);
  const current = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim();
  const safeRef = (b) => typeof b === 'string' && /^[\w][\w./-]{0,200}$/.test(b) && !b.includes('..');
  let branch = safeRef(task.branch) && (await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${task.branch}`])).ok ? task.branch : null;
  if (!branch) {
    // Branch über die ID im Namen finden, etwa feature/w-0034-...
    const list = (await git(root, ['branch', '--list', `*${id.toLowerCase()}*`, '--format=%(refname:short)'])).out.split('\n').map((s) => s.trim()).filter(Boolean);
    branch = list.find(safeRef) || null;
  }
  const log = await git(root, ['log', '--all', '-n', '40', `--grep=${id}`, '--regexp-ignore-case', '--date=iso-strict', '--format=%H%x1f%h%x1f%ad%x1f%an%x1f%s']);
  const commits = log.out.split('\n').filter(Boolean).map((l) => {
    const [hash, short, date, author, subject] = l.split('\x1f');
    return { hash, short, date, author, subject };
  });
  let ahead = null; let behind = null;
  if (branch && base && branch !== base) {
    const c = await git(root, ['rev-list', '--left-right', '--count', `${base}...${branch}`]);
    const m = c.out.trim().match(/^(\d+)\s+(\d+)$/);
    if (m) { behind = +m[1]; ahead = +m[2]; }
  }
  // Geänderte Dateien: Unterschied des Branches zum Hauptbranch, sonst die Summe der Commits mit der ID.
  let files = [];
  let source = 'none';
  if (branch && base && branch !== base) {
    files = parseNumstat((await git(root, ['diff', '--numstat', `${base}...${branch}`])).out);
    source = 'branch';
  }
  if (!files.length && commits.length) {
    const shown = await git(root, ['show', '--numstat', '--format=', ...commits.slice(0, 30).map((c) => c.hash)]);
    files = parseNumstat(shown.out);
    source = 'commits';
  }
  // Noch nicht committete Änderungen, wenn gerade auf dem Branch der Aufgabe gearbeitet wird.
  let uncommitted = [];
  if (branch && current === branch) {
    uncommitted = parseNumstat((await git(root, ['diff', '--numstat', 'HEAD'])).out);
    const untracked = (await git(root, ['ls-files', '--others', '--exclude-standard'])).out.split('\n').filter((f) => f && !f.startsWith('.works/'));
    for (const f of untracked.slice(0, 50)) uncommitted.push({ file: f, add: 0, del: 0, binary: false, untracked: true });
    uncommitted = uncommitted.filter((f) => !f.file.startsWith('.works/'));
  }
  files = files.filter((f) => !f.file.startsWith('.works/'));
  let pr = null;
  if (branch) {
    const json = await run('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'number,url,state,title'], root);
    try { const arr = JSON.parse(json || '[]'); if (arr[0]) pr = arr[0]; } catch { /* gh fehlt oder nicht angemeldet */ }
  }
  return { git: true, base, current, branch, ahead, behind, commits, files, source, uncommitted, pr };
}

export async function fileDiff(root, task, file, { uncommitted = false } = {}) {
  const info = await codeInfo(root, task);
  if (!info.git) return { diff: '' };
  const known = [...info.files, ...info.uncommitted].some((f) => f.file === file);
  if (!known) return { error: 'Diese Datei gehört nicht zu den Änderungen der Aufgabe.' };
  let r;
  if (uncommitted) r = await git(root, ['diff', 'HEAD', '--', file]);
  else if (info.source === 'branch') r = await git(root, ['diff', `${info.base}...${info.branch}`, '--', file]);
  else {
    const hashes = info.commits.slice(0, 30).map((c) => c.hash).reverse();
    r = await git(root, ['show', '--format=%x1e%h %s', ...hashes, '--', file]);
  }
  const lines = r.out.split('\n');
  return { diff: lines.slice(0, MAX_DIFF_LINES).join('\n'), truncated: lines.length > MAX_DIFF_LINES };
}
