// Prüft die Hilfsfunktionen des CI-Wächters: node test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repoFromUrl, errorExcerpt, failureLines, bugFor, fileBug, findWorksCli, notifyWorks } from './ci-status.mjs';
import { tr, setLanguage, placeholders } from './i18n.mjs';

// W-0041: Die Prüfungen bis zum englischen Teil erwarten deutsche Texte. Kindprozesse (works-CLI) erben die Sprache.
process.env.WORKS_LANG = 'de';
setLanguage(null);
const here = path.dirname(fileURLToPath(import.meta.url));

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
// Ein offener Bug aus einer anderen Sprache wird wiedererkannt (W-0041).
assert.deepEqual(bugFor({ repo: 'a/b', sha: 'x'.repeat(40), failures: [{ run: 'CI', job: 'build', steps: [], url: '', lines: [], excerpt: '' }] }).titles, ['CI red: CI, job build', 'CI rot: CI, Job build']);

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

  // notifyWorks legt das CI-Ergebnis für den Discord-Bot von works ab (W-0036), nur wenn der Bot eingerichtet ist.
  const outbox = path.join(tmp, '.works', 'discord', 'outbox');
  const data = { ok: false, sha: 'a5cfc20aaaa', failed: 1, total: 3, job: 'build', error: 'Fehler', bug: r1.id, url: 'https://github.com/a/b/actions/runs/1' };
  assert.equal(notifyWorks({ cwd: proj, data, cli, env }), true);
  assert.ok(!fs.existsSync(outbox) || !fs.readdirSync(outbox).length, 'Ereignis ohne eingerichteten Bot abgelegt');
  fs.mkdirSync(path.dirname(outbox), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(outbox), 'secret.json'), '{"token":"test-token-0123456789abcdef"}');
  assert.equal(notifyWorks({ cwd: proj, data, cli, env }), true);
  const files = fs.readdirSync(outbox);
  assert.equal(files.length, 1);
  const ev = JSON.parse(fs.readFileSync(path.join(outbox, files[0]), 'utf8'));
  assert.equal(ev.type, 'ci');
  assert.deepEqual(ev.data, data);
  assert.equal(ev.project, 'p');
  assert.equal(notifyWorks({ cwd: plain, data, cli, env }), false);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// W-0041: Englisch (Standard). Wichtige Ausgaben englisch und ohne deutsche Wörter.
const GERMAN = /[äöüß]|\b(?:Fehler|rot|grün|Schritt|Lauf|angelegt|ergänzt|erneut|nicht|keine?|und|oder|für|mit|nur|von|der|die|das|ist|Rote|gibt|sonst)\b/i;
process.env.WORKS_LANG = 'en';
setLanguage(null);
assert.equal(errorExcerpt(log, 0), 'Error: Process completed with exit code 1.');
const enFailures = [
  { run: 'works self-test', job: 'Node 22 on windows-latest', steps: ['Self-test'], url: 'https://github.com/a/b/actions/runs/1/job/11', lines: ['Self-test: works ship: switch to main failed'], excerpt: '' },
  { run: 'works self-test', job: 'build', steps: [], url: 'https://github.com/a/b/actions/runs/1/job/12', lines: [], excerpt: '' },
];
const enBug = bugFor({ repo: 'a/b', sha: 'a5cfc20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', failures: enFailures });
assert.equal(enBug.title, 'CI red: works self-test, step Self-test');
assert.ok(enBug.description.startsWith('Created by the CI watcher: CI red for commit a5cfc20 in a/b.\n\nFailed jobs:\n- Node 22 on windows-latest (step Self-test): https://github.com/a/b/actions/runs/1/job/11\n- build: https://github.com/a/b/actions/runs/1/job/12\n'), enBug.description);
assert.ok(!GERMAN.test(enBug.title + enBug.description), `deutsche Wörter im Bug: ${enBug.description}`);
assert.equal(bugFor({ repo: 'a/b', sha: 'x'.repeat(40), failures: [enFailures[1]] }).title, 'CI red: works self-test, job build');
// works ship erkennt die grüne Zeile in beiden Sprachen (Muster wie in works/scripts/ship.mjs).
for (const lang of ['en', 'de']) assert.equal((tr('CI green for {sha}: {workflows}.', { sha: 'a5cfc20', workflows: 'A, B' }, lang).match(/CI (?:grün für|green for) \w+: (.+)\./) || [])[1], 'A, B', lang);
// Fehlerzeile des Skripts, ohne Netz: kaputter Repo-Name (oder kein Git) endet vor jeder Abfrage mit Exit 3.
const tmpEn = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-watch-test-en-'));
try {
  for (const [lang, prefix] of [['en', 'Error: '], ['de', 'Fehler: ']]) {
    const r = spawnSync(process.execPath, [path.join(here, 'ci-status.mjs'), '--repo', 'bad..repo', '--no-bug'], { cwd: tmpEn, env: { ...process.env, WORKS_LANG: lang }, encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.ok(r.stdout.startsWith(prefix), `${lang}: ${r.stdout}`);
  }
  // fileBug in einem englischen works-Projekt: works meldet "Created: …", der Verlauf bekommt die englische Zeile.
  const envEn = { ...process.env, HOME: tmpEn, USERPROFILE: tmpEn, WORKS_ACTOR: '', WORKS_LANG: 'en' };
  const proj = path.join(tmpEn, 'p');
  fs.mkdirSync(proj);
  execFileSync(process.execPath, [cli, 'init'], { cwd: proj, env: envEn, stdio: 'ignore' });
  const r1 = fileBug({ cwd: proj, bug: enBug, sha: 'a5cfc20aaaa', cli, env: envEn });
  assert.equal(r1 && r1.action, 'neu');
  const show = () => execFileSync(process.execPath, [cli, 'show', r1.id], { cwd: proj, env: envEn, encoding: 'utf8' });
  assert.ok(show().includes('switch to main failed'), 'Log-Auszug fehlt im englischen Bug');
  assert.equal(fileBug({ cwd: proj, bug: enBug, sha: 'b6d0e11bbbb', cli, env: envEn }).action, 'ergänzt');
  assert.ok(show().includes('CI red again for b6d0e11: Node 22 on windows-latest, build'), show());
} finally {
  fs.rmSync(tmpEn, { recursive: true, force: true });
}

// W-0041: i18n.mjs ist eine wortgleiche Kopie aus works, jeder tr()-Text steht im Katalog mit gleichen Platzhaltern.
const worksI18n = path.resolve(here, '..', '..', '..', '..', 'works', 'skills', 'works', 'scripts', 'i18n.mjs');
if (fs.existsSync(worksI18n)) assert.ok(fs.readFileSync(worksI18n).equals(fs.readFileSync(path.join(here, 'i18n.mjs'))), 'i18n.mjs weicht von works/skills/works/scripts/i18n.mjs ab');
else console.log('i18n.mjs-Vergleich übersprungen: works-Plugin liegt nicht nebenan');
const de = JSON.parse(fs.readFileSync(path.join(here, 'i18n', 'de.json'), 'utf8'));
for (const [en, d] of Object.entries(de)) assert.equal(placeholders(d).join(), placeholders(en).join(), `de.json: Platzhalter verschieden in "${en}"`);
const unesc = (s) => s.replace(/\\(.)/g, (a, c) => ({ n: '\n', t: '\t' })[c] || c);
const keys = new Set();
for (const f of fs.readdirSync(here).filter((x) => x.endsWith('.mjs'))) {
  const src = fs.readFileSync(path.join(here, f), 'utf8');
  if (!/import \{[^}]*\btr\b[^}]*\} from '\.\/i18n\.mjs'/.test(src)) continue;
  for (const m of src.matchAll(/\btr\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)\s*[,)]/g)) keys.add(unesc(m[1] ?? m[2] ?? m[3]));
}
assert.deepEqual([...keys].filter((k) => !(k in de)), [], 'Texte ohne deutsche Übersetzung in i18n/de.json');
assert.ok(keys.has('CI green for {sha}: {workflows}.'), 'grüne Zeile nicht mehr in ci-status.mjs');
console.log('ci-watch: alle Prüfungen bestanden');
