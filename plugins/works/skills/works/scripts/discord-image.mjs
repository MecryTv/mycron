// Bild für das Discord-Dashboard (W-0044, Entwurf D3): Fortschritt je Projekt und erledigte Aufgaben der letzten
// sieben Tage. works zeichnet es selbst, ohne Abhängigkeiten und ohne fremden Dienst: ein RGB-Raster, eine eingebaute
// Pixelschrift (nur Großbuchstaben, Ziffern und wenige Zeichen) und PNG über zlib aus Node.
import zlib from 'node:zlib';

const BG = 0x2b2d31;
const TEXT = 0xdbdee1;
const MUTED = 0x949ba4;
const DONE = 0x23a55a;
const WIP = 0x5865f2;
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

function raster(h) {
  const px = Buffer.alloc(W * h * 3);
  const rect = (x, y, w, hh, c) => {
    for (let yy = Math.max(0, y); yy < Math.min(h, y + hh); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) { const i = (yy * W + xx) * 3; px[i] = c >> 16; px[i + 1] = (c >> 8) & 255; px[i + 2] = c & 255; }
    }
  };
  rect(0, 0, W, h, BG);
  const text = (x, y, s, c) => {
    let cx = x;
    for (const ch of s) {
      const g = GLYPHS[ch] || GLYPHS['?'];
      for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) if (g[r * 5 + col] === '#') rect(cx + col * S, y + r * S, S, S, c);
      cx += 6 * S;
    }
  };
  return { px, rect, text };
}

// Großbuchstaben, ß wird SS; was die Schrift nicht kennt, wird zu ?. Auf n Zeichen gekürzt.
const fit = (s, n) => { const u = [...String(s ?? '').toUpperCase().replace(/\s+/g, ' ')].map((ch) => (GLYPHS[ch] ? ch : '?')); return u.length > n ? `${u.slice(0, n - 1).join('')}.` : u.join(''); };
const width = (s) => [...s].length * 6 * S - S;

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

// projects: [{ name, done, wip, open, color }], days: [{ label, counts: [je Projekt] }] (älteste zuerst).
export function dashboardPng({ projects = [], days = [] } = {}) {
  const shown = projects.slice(0, MAX_ROWS);
  const more = projects.length - shown.length;
  const ROW = 28;
  const top = 16;
  const chartTop = top + 30 + shown.length * ROW + (more > 0 ? ROW : 0) + 16;
  const CH = 80; // Höhe der Tagesbalken
  const h = chartTop + 30 + CH + 40;
  const { px, rect, text } = raster(h);

  // Fortschritt: Name, Balken (erledigt, in Arbeit, offen), erledigt/gesamt. Legende rechts oben.
  text(16, top, 'FORTSCHRITT', TEXT);
  let lx = W - 16;
  for (const [label, c] of [['OFFEN', OPEN], ['IN ARBEIT', WIP], ['ERLEDIGT', DONE]]) {
    lx -= width(label); text(lx, top, label, MUTED); lx -= 16; rect(lx, top + 2, 10, 10, c); lx -= 18;
  }
  const barX = 200; const barW = 300;
  shown.forEach((p, i) => {
    const y = top + 30 + i * ROW;
    rect(16, y + 2, 6, 10, p.color ?? MUTED);
    text(28, y, fit(p.name, 13), TEXT);
    const total = Math.max(0, p.done) + Math.max(0, p.wip) + Math.max(0, p.open);
    rect(barX, y, barW, 14, OPEN);
    if (total) {
      const d = Math.round((Math.max(0, p.done) / total) * barW);
      const w = Math.round((Math.max(0, p.wip) / total) * barW);
      rect(barX, y, d, 14, DONE);
      rect(barX + d, y, w, 14, WIP);
    }
    text(barX + barW + 12, y, fit(`${p.done}/${total}`, 10), MUTED);
  });
  if (more > 0) text(28, top + 30 + shown.length * ROW, fit(`+${more} WEITERE`, 20), MUTED);

  // Erledigte Aufgaben der letzten Tage, gestapelt nach Projektfarbe.
  text(16, chartTop, 'ERLEDIGT · LETZTE 7 TAGE', TEXT);
  const baseY = chartTop + 30 + CH;
  const max = Math.max(1, ...days.map((d) => (d.counts || []).reduce((s, n) => s + Math.max(0, n), 0)));
  const colW = Math.floor((W - 32) / 7);
  rect(16, baseY, W - 32, 2, OPEN);
  days.slice(-7).forEach((d, i) => {
    const x = 16 + i * colW + Math.floor((colW - 44) / 2);
    let y = baseY;
    let sum = 0;
    (d.counts || []).forEach((n, k) => {
      const hh = Math.round((Math.max(0, n) / max) * CH);
      if (hh) { rect(x, y - hh, 44, hh, (projects[k] && projects[k].color) ?? DONE); y -= hh; }
      sum += Math.max(0, n);
    });
    if (sum) { const s = fit(String(sum), 4); text(x + 22 - Math.floor(width(s) / 2), y - 20, s, TEXT); }
    const l = fit(d.label, 3);
    text(x + 22 - Math.floor(width(l) / 2), baseY + 10, l, MUTED);
  });
  return png(px, h);
}
