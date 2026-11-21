// Prüft die reinen Hilfsfunktionen des CI-Wächters: node test.mjs
import assert from 'node:assert/strict';
import { repoFromUrl, errorExcerpt, failureLines } from './ci-status.mjs';

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
console.log('ci-waechter: alle Prüfungen bestanden');
