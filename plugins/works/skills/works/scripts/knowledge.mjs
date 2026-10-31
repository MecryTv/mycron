// Projektwissen in .works/wissen.md: Bereiche (##), Einträge (###) mit Metadaten im Kommentar.
// Vorschläge von Claude haben status=vorschlag, bis der Nutzer sie übernimmt.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { worksDir, exists, today } from './lib.mjs';

export const knowledgeFile = (root) => path.join(worksDir(root), 'wissen.md');
const HEAD = '# Projektwissen\n\nWas Claude in diesem Projekt wissen muss. Claude liest die passenden Einträge vor der Arbeit. Bearbeiten im Board unter Wissen oder mit works know.\n';

export function loadKnowledge(root) {
  const f = knowledgeFile(root);
  if (!exists(f)) return [];
  const out = [];
  let area = 'Allgemein';
  let cur = null;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const a = line.match(/^## (.+)$/);
    if (a) { area = a[1].trim(); cur = null; continue; }
    const h = line.match(/^### (.+)$/);
    if (h) { cur = { id: '', area, title: h[1].trim(), text: '', by: '', source: '', date: '', status: 'ok' }; out.push(cur); continue; }
    if (!cur) continue;
    const m = line.match(/^<!-- k:(.*) -->$/);
    if (m) { for (const kv of m[1].split(' ')) { const i = kv.indexOf('='); if (i > 0) cur[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } continue; }
    cur.text += (cur.text ? '\n' : '') + line;
  }
  for (const e of out) { e.text = e.text.trim(); if (!e.id) e.id = crypto.createHash('sha1').update(e.area + e.title).digest('hex').slice(0, 6); }
  return out;
}

export function saveKnowledge(root, list) {
  const areas = [...new Set(list.map((e) => e.area))];
  const meta = (e) => `<!-- k:${['id', 'by', 'source', 'date', 'status'].filter((k) => e[k]).map((k) => `${k}=${encodeURIComponent(e[k])}`).join(' ')} -->`;
  const body = areas.map((a) => `## ${a}\n\n` + list.filter((e) => e.area === a).map((e) => `### ${e.title}\n${meta(e)}\n${e.text.trim()}\n`).join('\n')).join('\n');
  fs.writeFileSync(knowledgeFile(root), `${HEAD}\n${body}`);
}

const clean = (s, max) => String(s || '').replace(/\r\n/g, '\n').replace(/<!--|-->/g, '').trim().slice(0, max);

export function addKnowledge(root, { area, title, text, by = 'Claude', source = '', proposal = false }) {
  const list = loadKnowledge(root);
  const t = clean(title, 140).replace(/\n/g, ' ');
  if (!t) throw new Error('Titel fehlt.');
  const e = { id: crypto.randomBytes(3).toString('hex'), area: clean(area || 'Allgemein', 60).replace(/[\n#]/g, ' '), title: t, text: clean(text, 4000), by, source: clean(source, 40), date: today(), status: proposal ? 'vorschlag' : 'ok' };
  list.push(e);
  saveKnowledge(root, list);
  return e;
}

export function updateKnowledge(root, id, patch) {
  const list = loadKnowledge(root);
  const e = list.find((x) => x.id === id);
  if (!e) throw new Error(`Eintrag ${id} nicht gefunden.`);
  if ('title' in patch) e.title = clean(patch.title, 140).replace(/\n/g, ' ') || e.title;
  if ('text' in patch) e.text = clean(patch.text, 4000);
  if ('area' in patch) e.area = clean(patch.area, 60).replace(/[\n#]/g, ' ') || e.area;
  if ('status' in patch) e.status = ['ok', 'vorschlag', 'veraltet'].includes(patch.status) ? patch.status : e.status;
  saveKnowledge(root, list);
  return e;
}

export function removeKnowledge(root, id) {
  const list = loadKnowledge(root);
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) throw new Error(`Eintrag ${id} nicht gefunden.`);
  saveKnowledge(root, next);
}

// Kurzfassung für den Sitzungsstart: Bereiche mit Titeln, gekürzt.
export function knowledgeSummary(root, max = 1200) {
  const list = loadKnowledge(root).filter((e) => e.status !== 'vorschlag');
  if (!list.length) return '';
  const areas = [...new Set(list.map((e) => e.area))];
  let s = `Projektwissen (.works/wissen.md, vor passender Arbeit lesen): ${areas.map((a) => `${a}: ${list.filter((e) => e.area === a).map((e) => e.title + (e.status === 'veraltet' ? ' (veraltet?)' : '')).join('; ')}`).join(' | ')}`;
  if (s.length > max) s = s.slice(0, max) + ' …';
  return s;
}
