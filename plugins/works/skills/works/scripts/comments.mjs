// Kommentare je Aufgabe: ein Gespräch zwischen Nutzer und Claude in comments.md neben der task.md.
// Format pro Eintrag: <!-- c:2026-10-31T21:14:00 Nutzer --> gefolgt vom Text in Markdown.
import fs from 'node:fs';
import path from 'node:path';
import { exists, loadState, saveState } from './lib.mjs';

const ENTRY_RE = /<!-- c:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}) (Nutzer|Claude) -->\n([\s\S]*?)(?=\n<!-- c:|\s*$)/g;

export function commentsFile(task) { return path.join(task._dir, 'comments.md'); }

export function loadComments(task) {
  const file = commentsFile(task);
  if (!exists(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const out = [];
  let m;
  ENTRY_RE.lastIndex = 0;
  while ((m = ENTRY_RE.exec(text))) out.push({ at: m[1], author: m[2], text: m[3].trim() });
  return out;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function addComment(task, author, text) {
  const clean = String(text || '').replace(/\r\n/g, '\n').replace(/<!-- c:/g, '<!-- c :').trim();
  if (!clean) throw new Error('Kommentar ist leer.');
  const file = commentsFile(task);
  const head = exists(file) ? '' : `# Kommentare ${task.id}\n\nGespräch zwischen Nutzer und Claude. Neue Einträge mit works comment ${task.id} "...".\n`;
  const entry = { at: stamp(), author, text: clean };
  fs.appendFileSync(file, `${head}\n<!-- c:${entry.at} ${author} -->\n${clean}\n`);
  return entry;
}

// Kommentare des Nutzers, die Claude noch nicht gesehen hat: nach Claudes letzter Antwort und nach
// dem letzten works comments Aufruf.
export function unreadForClaude(root, task, list = loadComments(task)) {
  const state = loadState(root);
  const read = (state.comments_read || {})[task.id] || '';
  const lastClaude = list.filter((c) => c.author === 'Claude').map((c) => c.at).pop() || '';
  const since = read > lastClaude ? read : lastClaude;
  return list.filter((c) => c.author === 'Nutzer' && c.at > since);
}

export function markRead(root, task) {
  const state = loadState(root);
  state.comments_read = state.comments_read || {};
  state.comments_read[task.id] = stamp();
  saveState(root, state);
}
