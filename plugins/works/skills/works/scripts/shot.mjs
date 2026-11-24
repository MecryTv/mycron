// Screenshots für works (W-0024): eine Board-Ansicht, eine Aufgabe im Board oder eine beliebige Seite des Projekts,
// mit dem installierten Chrome über Playwright. Meldet seitliches Scrollen, Seiten- und Konsolenfehler und
// Dateien, die nicht geladen wurden. Lädt keine Browser herunter.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tr } from './i18n.mjs';

// Board-Ansichten und ihre Tasten im Board.
export const BOARD_VIEWS = { board: '1', sprint: '2', queue: '3', timeline: '4', graph: '5', table: '6', live: '7' };

// Playwright aus dem Projekt, neben works (etwa im Repo, das works enthält), über NODE_PATH oder global.
export function loadPlaywright(root) {
  const req = createRequire(import.meta.url);
  const load = (paths) => { for (const n of ['playwright', 'playwright-core']) { try { return req(req.resolve(n, { paths })); } catch { /* weiter */ } } return null; };
  let pw = load([root, process.cwd(), path.dirname(fileURLToPath(import.meta.url))]);
  if (!pw) { try { pw = load([execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()]); } catch { /* kein npm */ } }
  return pw;
}

async function launch(pw) {
  let err;
  const tries = [process.env.WORKS_BROWSER && { executablePath: process.env.WORKS_BROWSER }, { channel: 'chrome' }, { channel: 'msedge' }, {}];
  for (const opt of tries.filter(Boolean)) {
    try { return await pw.chromium.launch(opt); } catch (e) { err = e; }
  }
  throw new Error(tr('No browser could be started (Chrome, Edge, Chromium): {msg}', { msg: String(err && err.message).split('\n')[0] }));
}

// shots: je Farbschema und Breite ein Bild. prepare(page) bringt die Seite in den gewünschten Zustand (Ansicht, Aufgabe).
// fullPage: false für fest stehende Ebenen (Detail einer Aufgabe), sonst würde die lange Seite darunter mit aufgenommen.
// perShot (W-0035): liefert je Aufnahme { url, prepare, done }, etwa ein Szenario mit frischem Aufbau und Aufräumen.
export async function takeShots(pw, { url, name, out, widths, themes, prepare, wait = 600, fullPage = true, height = 900, perShot = null }) {
  fs.mkdirSync(out, { recursive: true });
  const browser = await launch(pw);
  const res = [];
  try {
    for (const theme of themes) for (const w of widths) {
      const page = await browser.newPage({ viewport: { width: w, height }, colorScheme: theme });
      const found = [];
      page.on('pageerror', (e) => found.push(tr('Error: {msg}', { msg: e.message })));
      page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) found.push(tr('Console: {msg}', { msg: m.text() })); });
      page.on('requestfailed', (r) => { if (!/\/events$/.test(r.url())) found.push(tr('not loaded: {url}', { url: r.url() })); });
      const shot = perShot ? await perShot({ theme, width: w }) : { url, prepare, done: null };
      try {
        await page.goto(shot.url, { waitUntil: 'load' });
        await page.waitForTimeout(wait);
        if (shot.prepare) await shot.prepare(page);
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
          return { sw, W, els };
        });
        // Text erst hier bauen: page.evaluate läuft im Browser und kennt tr() nicht.
        if (wide) found.unshift(tr('horizontal scrolling (page {sw} px, window {w} px)', { sw: wide.sw, w: wide.W }) + (wide.els.length ? `: ${wide.els.join(', ')}` : ''));
        const file = path.join(out, `${name}-${theme}-${w}.png`);
        await page.screenshot({ path: file, fullPage });
        res.push({ file, width: w, theme, problems: found });
      } finally {
        await page.close();
        if (shot.done) await shot.done();
      }
    }
  } finally {
    await browser.close();
  }
  return res;
}

// Bringt das Board in eine Ansicht oder öffnet eine Aufgabe (Klick auf ihre Karte in der Board-Ansicht).
export function boardPrepare({ view, task }) {
  return async (page) => {
    await page.keyboard.press('Escape');
    await page.keyboard.press(task ? BOARD_VIEWS.board : BOARD_VIEWS[view]);
    await page.waitForTimeout(400);
    if (task) {
      const card = await page.$(`.card[data-id="${task}"]`);
      if (!card) throw new Error(tr('{id} is not visible on the board (archived or filtered out?).', { id: task }));
      await card.click();
      await page.waitForTimeout(700);
    }
  };
}
