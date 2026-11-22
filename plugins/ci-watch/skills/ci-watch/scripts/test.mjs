// Prüft die Hilfsfunktionen des CI-Wächters: node test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoFromUrl, errorExcerpt, failureLines, bugFor, fileBug, findWorksCli } from './ci-status.mjs';

assert.equal(repoFromUrl('https://github.com/MecryTv/mycron.git'), 'MecryTv/mycron');
assert.equal(repoFromUrl('git@github.com:MecryTv/mycron.git'), 'MecryTv/mycron');
assert.equal(repoFromUrl('https://github.com/a/b'), 'a/b');
assert.equal(repoFromUrl('https://gitlab.com/a/b.git'), '');

const log = [
  '2026-11-21T10:00:00.0000000Z ##[group]Run node works.mjs selftest',
  '2026-11-21T10:00:01.0000000Z ok      Hooks',
  '2026-11-21T10:00:02.0000000Z FEHLER  Board im Hintergrund',
  '2026-11-21T10:00:03.0000000Z ##[error]Process completed with exit code 1.',
  '2026-11-21T10:00:04.0000000Z Post job cleanup.',
].join('\n');
const ex = errorExcerpt(log, 2);
assert.equal(ex, 'ok      Hooks\nFEHLER  Board im Hintergrund\nFehler: Process completed with exit code 1.');
assert.ok(!errorExcerpt('a\nb').includes('##[error]'));
const ann = [
  { path: '.github', start_line: 2, annotation_level: 'warning', message: 'Node.js 20 is deprecated.' },
  { path: 'src/a.test.js', start_line: 12, annotation_level: 'failure', title: 'AssertionError', message: 'expected 2 to equal 3' },
  { path: '.github', start_line: 29, annotation_level: 'failure', message: 'Process completed with exit code 1.' },
];
assert.deepEqual(failureLines(ann), ['src/a.test.js:12 AssertionError: expected 2 to equal 3', 'Process completed with exit code 1.']);
assert.deepEqual(failureLines([]), []);

// W-0027: Aus roten Jobs wird ein Bug. Der Titel ist je Workflow und Schritt gleich, damit kein zweiter entsteht.
const failures = [
  { run: 'works Selbsttest', job: 'Node 22 auf windows-latest', steps: ['Selbsttest'], url: 'https://github.com/a/b/actions/runs/1/job/11', lines: ['Selbsttest: works ship: Wechsel nach main fehlgeschlagen'], excerpt: '' },
  { run: 'works Selbsttest', job: 'Node 20 auf windows-latest', steps: ['Selbsttest'], url: 'https://github.com/a/b/actions/runs/1/job/12', lines: [], excerpt: '' },
];
const bug = bugFor({ repo: 'a/b', sha: 'a5cfc20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', failures });
assert.equal(bug.title, 'CI rot: works Selbsttest, Schritt Selbsttest');
for (const part of ['a5cfc20', 'a/b', 'Node 22 auf windows-latest', 'Node 20 auf windows-latest', 'https://github.com/a/b/actions/runs/1/job/11']) assert.ok(bug.description.includes(part), `Beschreibung ohne ${part}`);
assert.ok(bug.log.includes('Wechsel nach main fehlgeschlagen'));
assert.equal(bugFor({ repo: 'a/b', sha: 'x'.repeat(40), failures: [{ run: 'CI', job: 'build', steps: [], url: '', lines: [], excerpt: '' }] }).title, 'CI rot: CI, Job build');

// fileBug legt den Bug im works-Projekt an, ergänzt ihn beim nächsten roten Commit und lässt denselben Commit aus.
const cli = findWorksCli();
assert.ok(cli && fs.existsSync(cli), 'works-CLI nicht gefunden');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-watch-test-'));
const env = { ...process.env, HOME: tmp, USERPROFILE: tmp, WORKS_ACTOR: '' };
try {
  const proj = path.join(tmp, 'p');
  fs.mkdirSync(proj);
  execFileSync(process.execPath, [cli, 'init'], { cwd: proj, env, stdio: 'ignore' });
  const list = () => JSON.parse(execFileSync(process.execPath, [cli, 'list', '--json'], { cwd: proj, env, encoding: 'utf8' }));
  const r1 = fileBug({ cwd: proj, bug, sha: 'a5cfc20aaaa', cli, env });
  assert.equal(r1.action, 'neu');
  const bugs = list().filter((t) => t.type === 'bug');
  assert.equal(bugs.length, 1);
  assert.equal(bugs[0].title, bug.title);
  assert.equal(bugs[0].priority, 'P2');
  const show = () => execFileSync(process.execPath, [cli, 'show', r1.id], { cwd: proj, env, encoding: 'utf8' });
  assert.ok(show().includes('Wechsel nach main fehlgeschlagen'), 'Log-Auszug fehlt im Bug');
  const r2 = fileBug({ cwd: proj, bug, sha: 'b6d0e11bbbb', cli, env });
  assert.deepEqual([r2.action, r2.id], ['ergänzt', r1.id]);
  assert.ok(show().includes('b6d0e11'), 'Zweiter roter Commit fehlt im Verlauf');
  const r3 = fileBug({ cwd: proj, bug, sha: 'b6d0e11bbbb', cli, env });
  assert.equal(r3.action, 'bekannt');
  assert.equal(list().filter((t) => t.type === 'bug').length, 1);
  // Ohne .works legt fileBug nichts an.
  const plain = path.join(tmp, 'ohne');
  fs.mkdirSync(plain);
  assert.equal(fileBug({ cwd: plain, bug, sha: 'a5cfc20aaaa', cli, env }), null);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log('ci-watch: alle Prüfungen bestanden');
