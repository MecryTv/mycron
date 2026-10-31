// Schnappschuss des Boards als eine einzige HTML-Datei: alle Aufgaben mit Details, Bilder eingebettet.
// Zum Verschicken per Mail oder Chat, öffnet sich ohne Server und ohne Internet.
import fs from 'node:fs';
import path from 'node:path';
import { worksDir } from './lib.mjs';
import { boardData, renderBoard } from './board.mjs';
import { taskDetail } from './api.mjs';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml' };
const MAX_IMAGE = 4 * 1024 * 1024;
const MAX_TOTAL = 40 * 1024 * 1024;

export function buildSnapshot(root, { images = true, closed = true } = {}) {
  const wd = worksDir(root);
  const data = boardData(root);
  let total = 0;
  let skipped = 0;
  const cache = new Map();
  const embed = (rel) => {
    if (!rel || /^(https?:|data:)/.test(rel)) return rel;
    if (cache.has(rel)) return cache.get(rel);
    let out = '';
    if (images) {
      const abs = path.resolve(wd, rel);
      const mime = MIME[path.extname(abs).toLowerCase()];
      try {
        const st = fs.statSync(abs);
        if (abs.startsWith(wd + path.sep) && mime && st.size <= MAX_IMAGE && total + st.size <= MAX_TOTAL) {
          total += st.size;
          out = `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
        } else skipped++;
      } catch { skipped++; }
    }
    cache.set(rel, out);
    return out;
  };

  const tasks = data.tasks.filter((t) => closed || (!t.archived && t.status !== 'verworfen'));
  const details = {};
  for (const t of tasks) {
    t.thumb = embed(t.thumb);
    if (!t.thumb) t.thumbAlt = '';
    try {
      const d = taskDetail(root, t.id);
      d.assets = d.assets.map((a) => (a.image ? { ...a, src: embed(a.src) } : { ...a, src: '' }));
      details[t.id] = d;
    } catch { /* Aufgabe nicht lesbar, ohne Details */ }
  }
  data.tasks = tasks;
  data.meta.snapshot = new Date().toISOString();
  const html = renderBoard(data, { mode: 'snapshot', details });
  return { html, tasks: tasks.length, imageBytes: total, skipped };
}

export function snapshotName(root) {
  const d = new Date();
  const stamp = d.toLocaleDateString('sv-SE') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  return `works-${path.basename(root).replace(/[^\w.-]+/g, '-')}-${stamp}.html`;
}
