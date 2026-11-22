#!/usr/bin/env node
// Entwurf-Werkzeug.
//   shots:  Screenshots einer Entwurfsseite je Variante, Farbschema und Breite mit dem installierten Chrome (Playwright).
//           Meldet seitliches Scrollen, Seitenfehler, Konsolenfehler und nicht geladene Dateien.
//   inline: bettet lokales CSS, Schriften und Bilder in die Seite ein. Das works-Board zeigt Entwürfe mit strenger CSP,
//           dort lädt kein file:// und kein relativer Pfad.
//
// node entwurf.mjs shots <datei.html|url> [--out ordner] [--widths 1440,768,390] [--themes light,dark] [--variants A,B] [--wait 500]
// node entwurf.mjs inline <datei.html> [--out datei.html] [--variant B]
// Die Seite bekommt ?v=<Variante>&theme=<light|dark>&frame=0 (vorlage.html wertet das aus).
// Browser: Chrome, Edge oder Chromium von Playwright; ENTWURF_BROWSER=<Pfad> nimmt einen anderen (etwa /usr/bin/chromium).
// Exit: 0 ok, 1 Probleme gefunden (bei inline: Verweise, die nicht eingebettet werden konnten), 2 Aufruf- oder Einrichtungsfehler.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml' };
const remote = (u) => /^(https?:|data:|blob:|#)/i.test(u) || u.startsWith('//');
const local = (ref, base) => (/^file:/i.test(ref) ? fileURLToPath(ref) : path.resolve(base, decodeURI(ref.split(/[?#]/)[0])));
// Nicht auflösbare Verweise (fehlende Datei, Platzhalter wie __FONT__, unbekannter Typ) bleiben stehen und landen in skipped.
function inline(file, out, variant) {
  const skipped = [];
  const dataUri = (ref, base) => {
    const f = local(ref, base);
    const mime = MIME[path.extname(f).toLowerCase()];
    if (!mime || !fs.existsSync(f)) { skipped.push(ref); return null; }
    return `data:${mime};base64,${fs.readFileSync(f).toString('base64')}`;
  };
  const cssUrls = (css, base) => css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => {
    const d = !remote(ref) && dataUri(ref, base);
    return d ? `url("${d}")` : m;
  });
  const base = path.dirname(file);
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, css, b) => a + cssUrls(css, base) + b);
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = (tag.match(/\bhref=["']([^"']+)["']/i) || [])[1];
    if (!/\brel=["']?stylesheet\b/i.test(tag) || !href || remote(href)) return tag;
    const css = local(href, base);
    if (!fs.existsSync(css)) { skipped.push(href); return tag; }
    return `<style>/* eingebettet: ${path.basename(css)} */\n${cssUrls(fs.readFileSync(css, 'utf8'), path.dirname(css))}</style>`;
  });
  html = html.replace(/<img\b[^>]*>/gi, (tag) => tag.replace(/\bsrc=(["'])([^"']+)\1/i, (m, q, src) => {
    const d = !remote(src) && dataUri(src, base);
    return d ? `src="${d}"` : m;
  }));
  if (variant) html = html.replace(/<html\b([^>]*)>/i, (m, attrs) => `<html${attrs.replace(/\sdata-v=(["'])[^"']*\1/i, '')} data-v="${variant}">`);
  fs.writeFileSync(out, html);
  console.log(`eingebettet: ${out} (${Math.round(html.length / 1024)} KB)`);
  for (const s of [...new Set(skipped)]) console.log(`nicht eingebettet: ${s} (Datei fehlt oder Typ unbekannt, Verweis bleibt stehen)`);
  return skipped.length ? 1 : 0;
}

// Playwright aus dem Projekt, NODE_PATH oder der globalen npm-Installation. Browser lädt es keine: es nimmt das installierte Chrome.
function playwright() {
  const req = createRequire(import.meta.url);
  const load = (paths) => { for (const n of ['playwright', 'playwright-core']) { try { return req(req.resolve(n, { paths })); } catch { /* weiter */ } } return null; };
  let pw = load([process.cwd()]);
  if (!pw) { try { pw = load([execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()]); } catch { /* kein npm */ } }
  return pw;
}

async function shots(src, a) {
  const list = (v, d) => String(typeof v === 'string' ? v : d).split(',').map((s) => s.trim()).filter(Boolean);
  const widths = list(a.widths, '1440,768,390').map(Number);
  const themes = list(a.themes, 'light,dark');
  const variants = a.variants ? list(a.variants, '') : [''];
  if (widths.some((w) => !(w >= 200 && w <= 4000)) || themes.some((t) => !['light', 'dark'].includes(t))) { console.log('Fehler: --widths 200 bis 4000, --themes light oder dark.'); return 2; }
  const isUrl = /^(https?|file):/i.test(src);
  if (!isUrl && !fs.existsSync(src)) { console.log(`Fehler: ${src} nicht gefunden.`); return 2; }
  const target = isUrl ? src : pathToFileURL(path.resolve(src)).href;
  const name = isUrl ? 'seite' : path.basename(src, path.extname(src));
  const out = typeof a.out === 'string' ? a.out : path.join(isUrl ? '.' : path.dirname(src), `${name}-shots`);
  const pw = playwright();
  if (!pw) { console.log('Playwright fehlt. Einmalig `npm install -g playwright` (lädt keine Browser, genutzt wird das installierte Chrome) oder NODE_PATH auf einen Ordner mit playwright setzen.'); return 2; }
  let browser; let err;
  const tries = [process.env.ENTWURF_BROWSER && { executablePath: process.env.ENTWURF_BROWSER }, { channel: 'chrome' }, { channel: 'msedge' }, {}];
  for (const opt of tries.filter(Boolean)) {
    try { browser = await pw.chromium.launch(opt); break; } catch (e) { err = e; }
  }
  if (!browser) { console.log(`Fehler: kein Browser startbar (Chrome, Edge, Chromium): ${String(err.message).split('\n')[0]}`); return 2; }
  fs.mkdirSync(out, { recursive: true });
  let problems = 0;
  try {
    for (const v of variants) for (const theme of themes) for (const w of widths) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 }, colorScheme: theme });
      const found = [];
      page.on('pageerror', (e) => found.push(`Fehler: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) found.push(`Konsole: ${m.text()}`); });
      page.on('requestfailed', (r) => found.push(`nicht geladen: ${r.url()}`));
      const u = new URL(target);
      if (v) u.searchParams.set('v', v);
      u.searchParams.set('theme', theme);
      u.searchParams.set('frame', '0');
      await page.goto(u.href, { waitUntil: 'load' });
      await page.waitForTimeout(Number(a.wait) || 500);
      const wide = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const sw = document.documentElement.scrollWidth;
        if (sw <= W + 1) return null;
        const els = [];
        for (const el of document.body.querySelectorAll('*')) {
          const over = (e) => e && e !== document.body && e.getBoundingClientRect().right > W + 1;
          if (over(el) && !over(el.parentElement)) els.push(el.tagName.toLowerCase() + [...el.classList].map((c) => `.${c}`).join(''));
          if (els.length >= 3) break;
        }
        return `seitliches Scrollen (Seite ${sw} px, Fenster ${W} px)${els.length ? `: ${els.join(', ')}` : ''}`;
      });
      if (wide) found.unshift(wide);
      const file = path.join(out, `${name}${v ? `-${v}` : ''}-${theme}-${w}.png`);
      await page.screenshot({ path: file, fullPage: true });
      await page.close();
      if (found.length) problems++;
      console.log(`${found.length ? 'PROBLEM' : 'ok     '} ${v || '-'} ${theme} ${w}  ${file}${found.length ? `  ${found.join(' | ')}` : ''}`);
    }
  } finally {
    await browser.close();
  }
  console.log(problems ? `${problems} Screenshot(s) mit Problemen.` : 'Alle Screenshots ohne Probleme.');
  return problems ? 1 : 0;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([a-z]+)(?:=(.*))?$/);
    if (!m) out._.push(argv[i]);
    else out[m[1]] = m[2] !== undefined ? m[2] : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const [cmd, file] = a._;
  if (cmd === 'shots' && file) return shots(file, a);
  if (cmd === 'inline' && file) {
    if (!fs.existsSync(file)) { console.log(`Fehler: ${file} nicht gefunden.`); return 2; }
    if (a.variant !== undefined && !/^[\w-]+$/.test(String(a.variant))) { console.log('Fehler: --variant nur Buchstaben, Ziffern, - und _.'); return 2; }
    const out = typeof a.out === 'string' ? a.out : file.replace(/(\.html?)?$/i, '-eingebettet.html');
    try { return inline(file, out, a.variant); } catch (e) { console.log(`Fehler: ${e.message}`); return 2; }
  }
  console.log('node entwurf.mjs shots <datei.html|url> [--out ordner] [--widths 1440,768,390] [--themes light,dark] [--variants A,B]\nnode entwurf.mjs inline <datei.html> [--out datei.html] [--variant B]');
  return 2;
}

main().then((code) => { process.exitCode = code; }, (e) => { console.log(`Fehler: ${e.message}`); process.exitCode = 2; });
