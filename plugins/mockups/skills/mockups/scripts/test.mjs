// Prüft entwurf.mjs: node test.mjs (die Screenshots nur, wenn Playwright gefunden wird)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { placeholders } from './i18n.mjs';

// W-0041: Die Prüfungen bis zum englischen Teil erwarten deutsche Texte, entwurf.mjs erbt die Sprache.
process.env.WORKS_LANG = 'de';
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, 'entwurf.mjs');
const run = (...args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; }
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'entwurf-test-'));
fs.mkdirSync(path.join(dir, 'css'));
fs.writeFileSync(path.join(dir, 'css', 'app.css'), '.x { color: red }\n@font-face { font-family: T; src: url("../fonts/t.woff2") format("woff2"); }\n');
fs.mkdirSync(path.join(dir, 'fonts'));
fs.writeFileSync(path.join(dir, 'fonts', 't.woff2'), Buffer.from([1, 2, 3, 4]));
fs.writeFileSync(path.join(dir, 'bild.png'), Buffer.from([137, 80, 78, 71]));

// inline: CSS aus relativem und file://-Link einbetten, Schriften und Bilder als data:, https bleibt, Variante setzen
const absCss = pathToFileURL(path.join(dir, 'css', 'app.css')).href;
fs.writeFileSync(path.join(dir, 'seite.html'), `<!doctype html><html lang="de"><head>
<link rel="stylesheet" href="css/app.css">
<link href="${absCss}" rel="stylesheet">
<link rel="stylesheet" href="https://fonts.example/a.css">
</head><body><img src="bild.png" alt=""><div class="x">x</div></body></html>`);
let r = run('inline', path.join(dir, 'seite.html'), '--out', path.join(dir, 'eingebettet.html'), '--variant', 'B');
assert.equal(r.code, 0, r.out);
const html = fs.readFileSync(path.join(dir, 'eingebettet.html'), 'utf8');
assert.equal((html.match(/\.x \{ color: red \}/g) || []).length, 2, 'beide Links eingebettet');
assert.ok(!html.includes('css/app.css') && !html.includes('file:'), 'keine lokalen Verweise mehr');
assert.ok(html.includes('url("data:font/woff2;base64,AQIDBA==")'), 'Schrift relativ zur CSS-Datei aufgelöst');
assert.ok(html.includes('src="data:image/png;base64,iVBORw=="'), 'Bild eingebettet');
assert.ok(html.includes('href="https://fonts.example/a.css"'), 'https-Link bleibt');
assert.ok(/<html lang="de" data-v="B">/.test(html), 'Variante gesetzt');
r = run('inline', path.join(dir, 'fehlt.html'));
assert.equal(r.code, 2, 'fehlende Datei');
// Platzhalter oder fehlende Datei in der CSS: Rest einbetten, Verweis stehen lassen, warnen, Exit 1
fs.writeFileSync(path.join(dir, 'css', 'platz.css'), '@font-face { font-family: G; src: url("__FONT__"); }\n.y { background: url(fehlt.png) }\n.x { color: red }\n');
fs.writeFileSync(path.join(dir, 'platz.html'), '<!doctype html><html><head><link rel="stylesheet" href="css/platz.css"></head><body></body></html>');
r = run('inline', path.join(dir, 'platz.html'), '--out', path.join(dir, 'platz-ein.html'));
assert.equal(r.code, 1, r.out);
assert.match(r.out, /nicht eingebettet: __FONT__/, r.out);
assert.match(r.out, /nicht eingebettet: fehlt\.png/, r.out);
const platz = fs.readFileSync(path.join(dir, 'platz-ein.html'), 'utf8');
assert.ok(platz.includes('url("__FONT__")') && platz.includes('.x { color: red }'), 'Rest eingebettet, Verweis unverändert');

// shots: seitliches Scrollen nur in Variante B, Seitenfehler, fehlende Datei
fs.writeFileSync(path.join(dir, 'kaputt.html'), `<!doctype html><html><head>
<style>body{margin:0} [data-v-show]{display:none} html[data-v="A"] [data-v-show="A"], html[data-v="B"] [data-v-show="B"]{display:block}</style>
<script>const v = new URLSearchParams(location.search).get('v') || 'A'; document.documentElement.dataset.v = v;</script>
</head><body>
<div data-v-show="A">schmal</div>
<div data-v-show="B" class="breit" style="width:2000px">breit</div>
<script>if (new URLSearchParams(location.search).get('theme') === 'dark') throw new Error('kaputt im Dunkeln');</script>
</body></html>`);
r = run('shots', path.join(dir, 'kaputt.html'), '--out', path.join(dir, 'shots'), '--widths', '390', '--themes', 'light,dark', '--variants', 'A,B');
if (r.code === 2 && /Playwright/.test(r.out)) {
  console.log('Screenshots übersprungen: ' + r.out.trim().split('\n')[0]);
} else {
  assert.equal(r.code, 1, r.out);
  const lines = r.out.split('\n');
  const line = (v, t) => lines.find((l) => l.includes(` ${v} ${t} 390`)) || '';
  assert.match(line('A', 'light'), /^ok/, r.out);
  assert.match(line('B', 'light'), /seitliches Scrollen.*2000.*div\.breit/, r.out);
  assert.match(line('A', 'dark'), /kaputt im Dunkeln/, r.out);
  assert.equal(fs.readdirSync(path.join(dir, 'shots')).filter((f) => f.endsWith('.png')).length, 4);
  fs.writeFileSync(path.join(dir, 'fehlt.html'), '<!doctype html><html><head><link rel="stylesheet" href="fehlt.css"></head><body>x</body></html>');
  r = run('shots', path.join(dir, 'fehlt.html'), '--out', path.join(dir, 'shots2'), '--widths', '1440', '--themes', 'light', '--variants', 'A');
  assert.equal(r.code, 1, 'fehlende CSS allein reicht für Exit 1');
  assert.match(r.out, /nicht geladen: .*fehlt\.css/, r.out);
}

// W-0041: Englisch (Standard). Wichtige Ausgaben englisch und ohne deutsche Wörter (Pfade herausgenommen).
process.env.WORKS_LANG = 'en';
const GERMAN = /[äöüß]|\b(?:Fehler|nicht|eingebettet|geladen|Datei|fehlt|Verweis|bleibt|seitliches|Seite|Fenster|Probleme|Problemen|Konsole|ohne|oder|und|nur|gefunden|Einmalig)\b/i;
const en = (...args) => { const x = run(...args); return { ...x, out: x.out.split(dir).join('<dir>') }; };
fs.writeFileSync(path.join(dir, 'css', 'ph.css'), '@font-face { font-family: G; src: url("__FONT__"); }\n.y { background: url(gone.png) }\n');
fs.writeFileSync(path.join(dir, 'ph.html'), '<!doctype html><html><head><link rel="stylesheet" href="css/ph.css"></head><body></body></html>');
r = en('inline', path.join(dir, 'ph.html'), '--out', path.join(dir, 'ph-out.html'));
assert.equal(r.code, 1, r.out);
assert.match(r.out, /^inlined: .*ph-out\.html \(\d+ KB\)$/m, r.out);
assert.match(r.out, /^not inlined: __FONT__ \(file missing or unknown type, the reference stays as it is\)$/m, r.out);
assert.match(r.out, /^not inlined: gone\.png /m, r.out);
assert.ok(!GERMAN.test(r.out), r.out);
assert.ok(fs.readFileSync(path.join(dir, 'ph-out.html'), 'utf8').includes('/* inlined: ph.css */'), 'CSS-Kommentar englisch');
r = en('inline', path.join(dir, 'missing.html'));
assert.equal(r.code, 2, r.out);
assert.match(r.out, /^Error: .*missing\.html not found\./, r.out);
r = en('shots', path.join(dir, 'ph.html'), '--widths', '50');
assert.equal(r.out.trim(), 'Error: --widths 200 to 4000, --themes light or dark.');
r = en();
assert.equal(r.code, 2, r.out);
assert.match(r.out, /^node entwurf\.mjs shots <file\.html\|url> \[--out folder\]/, r.out);
r = en('shots', path.join(dir, 'kaputt.html'), '--out', path.join(dir, 'shots-en'), '--widths', '390', '--themes', 'light', '--variants', 'B');
if (r.code === 2 && /Playwright/.test(r.out)) {
  assert.match(r.out, /^Playwright is missing\./, r.out);
} else {
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /horizontal scrolling \(page \d+ px, window \d+ px\).*div\.breit/, r.out);
  assert.match(r.out, /^1 screenshot\(s\) with problems\.$/m, r.out);
  assert.ok(!GERMAN.test(r.out), r.out);
}
fs.rmSync(dir, { recursive: true, force: true });

// W-0041: i18n.mjs ist eine wortgleiche Kopie aus works, jeder tr()-Text steht im Katalog mit gleichen Platzhaltern.
const worksI18n = path.resolve(here, '..', '..', '..', '..', 'works', 'skills', 'works', 'scripts', 'i18n.mjs');
if (fs.existsSync(worksI18n)) assert.ok(fs.readFileSync(worksI18n).equals(fs.readFileSync(path.join(here, 'i18n.mjs'))), 'i18n.mjs weicht von works/skills/works/scripts/i18n.mjs ab');
else console.log('i18n.mjs-Vergleich übersprungen: works-Plugin liegt nicht nebenan');
const de = JSON.parse(fs.readFileSync(path.join(here, 'i18n', 'de.json'), 'utf8'));
for (const [k, d] of Object.entries(de)) assert.equal(placeholders(d).join(), placeholders(k).join(), `de.json: Platzhalter verschieden in "${k}"`);
const unesc = (s) => s.replace(/\\(.)/g, (a, c) => ({ n: '\n', t: '\t' })[c] || c);
const keys = new Set();
for (const f of fs.readdirSync(here).filter((x) => x.endsWith('.mjs'))) {
  const src = fs.readFileSync(path.join(here, f), 'utf8');
  if (!/import \{[^}]*\btr\b[^}]*\} from '\.\/i18n\.mjs'/.test(src)) continue;
  for (const m of src.matchAll(/\btr\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)\s*[,)]/g)) keys.add(unesc(m[1] ?? m[2] ?? m[3]));
}
assert.ok(keys.size > 10, 'keine tr()-Texte in entwurf.mjs gefunden');
assert.deepEqual([...keys].filter((k) => !(k in de)), [], 'Texte ohne deutsche Übersetzung in i18n/de.json');
console.log('mockups: alle Prüfungen bestanden');
