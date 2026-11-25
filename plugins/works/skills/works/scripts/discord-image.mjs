// Bilder für Discord: das Panel (W-0044, seit W-0050 nach Entwurf P2: Fortschritt, letzte 24 Stunden, Woche) und die
// Karte je Aufgabe (W-0050, Entwurf I3). works zeichnet sie selbst, ohne Abhängigkeiten und ohne fremden Dienst: ein
// RGB-Raster, eine eingebaute Pixelschrift (nur Großbuchstaben, Ziffern und wenige Zeichen) und PNG über zlib aus Node.
import zlib from 'node:zlib';

// Farben wie in den Entwürfen P2 und I3.
const BG = 0x1e1f2a;
const TEXT = 0xe9eaf2;
const MUTED = 0x9aa0b8;
const SOFT = 0xc6c8d8;
const LANE = 0x262938;
const GRID = 0x343748;
const DONE = 0x23a55a;
const DONE_DIM = 0x216944; // Grün zu 55 % auf dem Grund: die Tage vor heute
const WIP = 0x5865f2;
const WAIT = 0xe8a33d;
const RED = 0xf23f43;
const OPEN = 0x4e5058;
const W = 640;
const S = 2; // Schrift doppelt: 10x14 Pixel je Zeichen, damit sie auch verkleinert auf dem Handy lesbar bleibt.
const MAX_ROWS = 6;

// 5x7, Zeile für Zeile, # gesetzt.
export const GLYPHS = {
  A: '.###.#...##...#######...##...##...#',B: '####.#...##...#####.#...##...#####.', C: '.###.#...##....#....#....#...#.###.',
  D: '####.#...##...##...##...##...#####.', E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....',
  G: '.###.#...##....#.####...##...#.####', H: '#...##...##...#######...##...##...#', I: '.###...#....#....#....#....#...###.',
  J: '..###...#....#....#....#.#..#..##..', K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####',
  M: '#...###.###.#.##.#.##...##...##...#', N: '#...##...###..##.#.##..###...##...#', O: '.###.#...##...##...##...##...#.###.',
  P: '####.#...##...#####.#....#....#....', Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#.#..#..#.#...#',
  S: '.#####....#.....###.....#....#####.', T: '#####..#....#....#....#....#....#..', U: '#...##...##...##...##...##...#.###.',
  V: '#...##...##...##...##...#.#.#...#..', W: '#...##...##...##.#.##.#.##.#.#.#.#.', X: '#...##...#.#.#...#...#.#.#...##...#',
  Y: '#...##...#.#.#...#....#....#....#..', Z: '#####....#...#...#...#...#....#####',
  0: '.###.#...##..###.#.###..##...#.###.', 1: '..#...##....#....#....#....#...###.', 2: '.###.#...#....#...#...#...#...#####',
  3: '#####...#...#.....#.....##...#.###.', 4: '...#...##..#.#.#..#.#####...#....#.', 5: '######....####.....#....##...#.###.',
  6: '..##..#...#....####.#...##...#.###.', 7: '#####....#...#...#...#....#....#...', 8: '.###.#...##...#.###.#...##...#.###.',
  9: '.###.#...##...#.####....#...#..##..',
  ' ': '...................................', '.': '..........................##...##..', ':': '......##...##.........##...##......',
  '/': '.........#...#...#...#...#.........', '-': '...............#####...............', '+': '.......#....#..#####..#....#.......',
  '%': '##...##..#...#...#...#...#..##...##', '(': '...#...#...#....#....#.....#.....#.', ')': '.#.....#.....#....#....#...#...#...',
  '?': '.###.#...#....#...#...#.........#..', '·': '.................#.................', _: '..............................#####',
  '#': '.#.#..#.#.#####.#.#.#####.#.#..#.#.', "'": '..#....#...#.......................',
  Ä: '.#.#.......###.#...#######...##...#', Ö: '.#.#.......###.#...##...##...#.###.', Ü: '.#.#......#...##...##...##...#.###.',
};

// k: Faktor der Schrift (Standard S), für große Zahlen etwa 3.
function raster(h, bg = BG) {
  const px = Buffer.alloc(W * h * 3);
  const rect = (x, y, w, hh, c) => {
    for (let yy = Math.max(0, y); yy < Math.min(h, y + hh); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) { const i = (yy * W + xx) * 3; px[i] = c >> 16; px[i + 1] = (c >> 8) & 255; px[i + 2] = c & 255; }
    }
  };
  rect(0, 0, W, h, bg);
  const text = (x, y, s, c, k = S) => {
    let cx = x;
    for (const ch of s) {
      const g = GLYPHS[ch] || GLYPHS['?'];
      for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) if (g[r * 5 + col] === '#') rect(cx + col * k, y + r * k, k, k, c);
      cx += 6 * k;
    }
  };
  return { px, rect, text };
}

// Großbuchstaben, ß wird SS; was die Schrift nicht kennt, wird zu ?. Auf n Zeichen gekürzt.
const fit = (s, n) => { const u = [...String(s ?? '').toUpperCase().replace(/\s+/g, ' ')].map((ch) => (GLYPHS[ch] ? ch : '?')); return u.length > n ? `${u.slice(0, n - 1).join('')}.` : u.join(''); };
const width = (s, k = S) => [...s].length * 6 * k - k;
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

// CRC32 für die PNG-Blöcke (zlib.crc32 gibt es erst ab Node 22.2).
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function png(px, h) {
  const raw = Buffer.alloc(h * (1 + W * 3));
  for (let y = 0; y < h; y++) px.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Panel nach P2 (W-0050). projects: [{ name, done, wip, open, dot, task }] mit Ampelfarbe und Aufgabe;
// tracks: { labels: [[Anteil, Text]], rows: [[[Anteil, Farbe]]] je Projekt } für die letzten 24 Stunden;
// days: [{ label, count, today }] (älteste zuerst). labels: Überschriften in der Sprache des Panels (W-0041), ohne
// Angabe deutsch; more und total mit {n}.
const LABELS = { progress: 'FORTSCHRITT', open: 'OFFEN', wip: 'IN ARBEIT', done: 'ERLEDIGT', more: '+{n} WEITERE', chart: 'ERLEDIGT · LETZTE 7 TAGE', total: '{n} GESAMT', track: 'LETZTE 24 STUNDEN', result: 'ERGEBNIS', waited: 'WARTETE', red: 'CI ROT', ship: 'SHIP' };
export function dashboardPng({ projects = [], tracks = null, days = [], labels = {} } = {}) {
  const L = { ...LABELS, ...labels };
  const shown = projects.slice(0, MAX_ROWS);
  const more = projects.length - shown.length;
  const ROW = 28; const TROW = 22; const CH = 80; // Zeile Fortschritt, Zeile Spur, Höhe der Tagesbalken
  const top = 16;
  const trackTop = top + 30 + shown.length * ROW + (more > 0 ? ROW : 0) + 16;
  const withTracks = !!(tracks && shown.length);
  const chartTop = withTracks ? trackTop + 30 + shown.length * TROW + 26 + 22 + 16 : trackTop;
  const baseY = chartTop + 30 + CH;
  const h = baseY + 40;
  const { px, rect, text } = raster(h);
  const legend = (x, y, items) => { for (const [l, c] of items) { const s = fit(l, 14); rect(x, y + 2, 10, 10, c); text(x + 16, y, s, MUTED); x += 16 + width(s) + 22; } };

  // Fortschritt: Ampel, Name, Balken (erledigt, in Arbeit, offen), erledigt/gesamt, Aufgabe. Legende rechts oben.
  text(16, top, fit(L.progress, 24), TEXT);
  let lx = W - 16;
  for (const [label, c] of [[fit(L.open, 12), OPEN], [fit(L.wip, 12), WIP], [fit(L.done, 12), DONE]]) {
    lx -= width(label); text(lx, top, label, MUTED); lx -= 16; rect(lx, top + 2, 10, 10, c); lx -= 18;
  }
  const barX = 200; const barW = 236;
  shown.forEach((p, i) => {
    const y = top + 30 + i * ROW;
    rect(16, y + 2, 10, 10, p.dot ?? MUTED);
    text(32, y, fit(p.name, 13), TEXT);
    const total = Math.max(0, p.done) + Math.max(0, p.wip) + Math.max(0, p.open);
    rect(barX, y, barW, 14, OPEN);
    if (total) {
      const d = Math.round((Math.max(0, p.done) / total) * barW);
      const w = Math.round((Math.max(0, p.wip) / total) * barW);
      rect(barX, y, d, 14, DONE);
      rect(barX + d, y, w, 14, WIP);
    }
    const n = fit(`${p.done}/${total}`, 7);
    text(barX + barW + 96 - width(n), y, n, SOFT);
    if (p.task) { const tk = fit(p.task, 7); text(W - 16 - width(tk), y, tk, MUTED); }
  });
  if (more > 0) text(32, top + 30 + shown.length * ROW, fit(L.more.replace('{n}', more), 20), MUTED);

  // Letzte 24 Stunden: eine Spur je Projekt, ein Punkt je Nachricht in der Farbe ihrer Art, Uhrzeiten und Legende darunter.
  if (withTracks) {
    text(16, trackTop, fit(L.track, 40), TEXT);
    const tx = 200; const tw = W - 16 - tx;
    shown.forEach((p, i) => {
      const y = trackTop + 30 + i * TROW;
      text(16, y + 1, fit(p.name, 14), TEXT);
      rect(tx, y, tw, 16, LANE);
      for (let k = 1; k < 6; k++) rect(tx + Math.round((tw * k) / 6), y, 1, 16, GRID);
      for (const [f, c] of (tracks.rows || [])[i] || []) rect(tx + Math.round(Math.max(0, Math.min(1, f)) * (tw - 10)), y + 3, 10, 10, c);
    });
    const ay = trackTop + 30 + shown.length * TROW + 4;
    for (const [f, s0] of tracks.labels || []) {
      const s = fit(s0, 6); const w = width(s);
      text(f <= 0 ? tx : f >= 1 ? tx + tw - w : tx + Math.round(f * tw) - Math.floor(w / 2), ay, s, MUTED);
    }
    legend(16, ay + 26, [[L.result, DONE], [L.waited, WAIT], [L.red, RED], [L.ship, WIP]]);
  }

  // Erledigt je Tag über alle Projekte, einfarbig; heute hervorgehoben, die Summe rechts.
  const week = days.slice(-7);
  text(16, chartTop, fit(L.chart, 34), TEXT);
  const tot = fit(L.total.replace('{n}', week.reduce((s, d) => s + Math.max(0, d.count || 0), 0)), 14);
  text(W - 16 - width(tot), chartTop, tot, MUTED);
  const max = Math.max(1, ...week.map((d) => Math.max(0, d.count || 0)));
  const colW = Math.floor((W - 32) / 7);
  rect(16, baseY, W - 32, 2, OPEN);
  week.forEach((d, i) => {
    const x = 16 + i * colW + Math.floor((colW - 44) / 2);
    const n = Math.max(0, d.count || 0);
    const hh = Math.round((n / max) * CH);
    if (hh && d.today) rect(x - 2, baseY - hh - 2, 48, hh + 2, TEXT);
    if (hh) rect(x, baseY - hh, 44, hh, d.today ? DONE : DONE_DIM);
    if (n) { const s = fit(String(n), 4); text(x + 22 - Math.floor(width(s) / 2), baseY - hh - 20, s, d.today ? TEXT : SOFT); }
    const l = fit(d.label, 5);
    text(x + 22 - Math.floor(width(l) / 2), baseY + 10, l, d.today ? TEXT : MUTED);
  });
  return png(px, h);
}

// Bild einer Karte je Aufgabe (W-0050, Entwurf I3): links die Zeitachse der Aufgabe vom ersten Ereignis bis end
// (jetzt oder, wenn erledigt, das letzte Ereignis), Ereignisse als Quadrate, Wartezeiten als Strich bis zur Antwort,
// Uhrzeiten darunter; rechts Minuten, Schritte und Kriterien; darunter die Legende.
// events: [{ at, until, color }] in ms (until 0: kein Strich), right: Zeilen der rechten Spalte, die erste groß,
// legend: [[Text, Farbe]].
export function cardPng({ start = 0, end = 0, events = [], right = [], legend = [] } = {}) {
  const top = 14;
  const big = fit(right[0] || '', 8);
  const small = right.slice(1, 3).map((s) => fit(s, 16));
  const rw = Math.max(width(big, 3), ...small.map((s) => width(s)), 0);
  const x0 = 16;
  const x1 = W - 16 - rw - 24;
  const ty = top + 26; // Uhrzeiten
  const sy = top + 21 + 10; // Zeilen unter der großen Zahl
  const ly = Math.max(ty + 14, sy + small.length * 22 - 8) + 16; // Legende
  const h = ly + 14 + 14;
  const { px, rect, text } = raster(h);
  rect(x0, top, x1 - x0, 20, LANE);
  for (let k = 1; k < 6; k++) rect(x0 + Math.round(((x1 - x0) * k) / 6), top, 1, 20, GRID);
  const span = Math.max(1, end - start);
  const xOf = (t) => x0 + 10 + Math.round(Math.max(0, Math.min(1, (t - start) / span)) * (x1 - x0 - 20));
  for (const e of events) if (e.until > e.at) rect(xOf(e.at), top + 8, Math.max(2, xOf(e.until) - xOf(e.at)), 4, e.color);
  for (const e of events) rect(xOf(e.at) - 6, top + 4, 12, 12, e.color);
  // Uhrzeiten: die erste und die letzte, dazwischen nur, wo Platz ist; am Rand bündig statt mittig.
  const times = [...new Set(events.map((e) => e.at))].sort((a, b) => a - b).map((at) => {
    const s = hhmm(at); const w = width(s);
    return { s, w, x: Math.max(x0, Math.min(x1 - w, xOf(at) - Math.floor(w / 2))) };
  });
  const shown = times.slice(0, 1);
  const last = times.length > 1 ? times[times.length - 1] : null;
  for (const t of times.slice(1, -1)) { const p = shown[shown.length - 1]; if (t.x >= p.x + p.w + 12 && (!last || t.x + t.w + 12 <= last.x)) shown.push(t); }
  if (last && last.x >= shown[shown.length - 1].x + shown[shown.length - 1].w + 12) shown.push(last);
  for (const t of shown) text(t.x, ty, t.s, MUTED);
  // Rechte Spalte, rechtsbündig.
  text(W - 16 - width(big, 3), top - 1, big, TEXT, 3);
  small.forEach((s, i) => text(W - 16 - width(s), sy + i * 22, s, MUTED));
  let lx = x0;
  for (const [l, c] of legend) { const s = fit(l, 20); rect(lx, ly + 2, 10, 10, c); text(lx + 16, ly, s, MUTED); lx += 16 + width(s) + 22; }
  return png(px, h);
}
