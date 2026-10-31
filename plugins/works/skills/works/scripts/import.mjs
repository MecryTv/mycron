// Import von Aufgaben aus anderen Werkzeugen und Dateien, ohne Abhängigkeiten.
// Formate: Trello (JSON), Notion (CSV, Markdown, ZIP-Export), Linear (CSV), allgemeines CSV/TSV,
// Excel (.xlsx), Word (.docx), Markdown und Text mit Listen, sowie die eigene Kandidatenliste (JSON).
// Ergebnis ist immer eine Liste von Kandidaten, die works import anzeigt und erst auf Wunsch anlegt.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const FORMATS = ['auto', 'trello', 'notion', 'linear', 'csv', 'xlsx', 'docx', 'md', 'json'];
const MAX = 2000;

// ---------- ZIP ----------

export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Keine gültige ZIP-Datei.');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count && off + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28); const elen = buf.readUInt16LE(off + 30); const clen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nlen).toString('utf8');
    off += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    files.set(name, () => {
      const ln = buf.readUInt16LE(local + 26); const le = buf.readUInt16LE(local + 28);
      const start = local + 30 + ln + le;
      const data = buf.slice(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: 100 * 1024 * 1024 });
      throw new Error(`ZIP-Kompression ${method} wird nicht unterstützt.`);
    });
  }
  return files;
}

// ---------- XML und Text ----------

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decodeXml = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m));
const clean = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();

// ---------- CSV ----------

export function parseCsv(text, delim) {
  text = String(text).replace(/^﻿/, '');
  if (!delim) {
    const first = text.split('\n').slice(0, 5).join('\n');
    const count = (c) => (first.match(new RegExp(c === '\t' ? '\t' : `\\${c}`, 'g')) || []).length;
    delim = [',', ';', '\t', '|'].sort((a, b) => count(b) - count(a))[0];
  }
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------- Excel ----------

export function readXlsx(buf, sheetName) {
  const z = readZip(buf);
  const get = (n) => (z.has(n) ? z.get(n)().toString('utf8') : '');
  const shared = [];
  for (const si of get('xl/sharedStrings.xml').match(/<si>[\s\S]*?<\/si>/g) || []) shared.push(decodeXml((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
  const wb = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels');
  const sheets = [...wb.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]*)"/g)].map((m) => {
    const rel = (rels.match(new RegExp(`<Relationship[^>]*Id="${m[2]}"[^>]*Target="([^"]*)"`)) || rels.match(new RegExp(`<Relationship[^>]*Target="([^"]*)"[^>]*Id="${m[2]}"`)) || [])[1] || '';
    return { name: decodeXml(m[1]), file: rel ? `xl/${rel.replace(/^\/?xl\//, '').replace(/^\//, '')}` : '' };
  });
  // Datumsformate erkennen, damit Excel-Seriennummern zu Daten werden.
  const styles = get('xl/styles.xml');
  const customDate = new Set([...styles.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].filter((m) => /[dmy]/i.test(m[2].replace(/\[[^\]]*\]|"[^"]*"/g, ''))).map((m) => +m[1]));
  const xfs = ((styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0].match(/<xf\b[^>]*>/g) || []).map((x) => +((x.match(/numFmtId="(\d+)"/) || [])[1] || 0));
  const isDateStyle = (s) => { const f = xfs[s]; return f !== undefined && ((f >= 14 && f <= 22) || (f >= 45 && f <= 47) || customDate.has(f)); };
  const pick = sheets.find((s) => s.name === sheetName) || sheets[0];
  if (!pick || !z.has(pick.file)) throw new Error('Keine Tabelle in der Excel-Datei gefunden.');
  const xml = z.get(pick.file)().toString('utf8');
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]; const inner = cm[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1] || '';
      const col = ref ? [...ref].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : row.length;
      const t = (attrs.match(/\bt="(\w+)"/) || [])[1];
      const s = +((attrs.match(/\bs="(\d+)"/) || [])[1] || 0);
      let v = decodeXml((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '');
      if (t === 's') v = shared[+v] ?? '';
      else if (t === 'inlineStr') v = decodeXml((inner.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map((x) => x.replace(/<[^>]+>/g, '')).join(''));
      else if (t === 'b') v = v === '1' ? 'ja' : 'nein';
      else if (v && !t && isDateStyle(s) && /^\d+(\.\d+)?$/.test(v)) v = excelDate(+v);
      row[col] = v;
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return { rows: rows.filter((r) => r.some((c) => String(c).trim() !== '')), sheets: sheets.map((s) => s.name), sheet: pick.name };
}

const excelDate = (n) => new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);

// ---------- Word ----------

// Absätze mit Stil, Listenebene und Häkchen, dazu Tabellen als Zeilen.
export function readDocx(buf) {
  const z = readZip(buf);
  if (!z.has('word/document.xml')) throw new Error('Keine Word-Datei (word/document.xml fehlt).');
  const xml = z.get('word/document.xml')().toString('utf8');
  const styles = z.has('word/styles.xml') ? z.get('word/styles.xml')().toString('utf8') : '';
  const styleName = {};
  for (const m of styles.matchAll(/<w:style\b[^>]*w:styleId="([^"]*)"[^>]*>[\s\S]*?<w:name w:val="([^"]*)"/g)) styleName[m[1]] = m[2];
  const blocks = [];
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [])[1] || xml;
  const paraText = (p) => decodeXml((p.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:tab\/>|<w:br\/>|<w:sym\b[^>]*\/>/g) || []).map((x) => {
    if (x === '<w:tab/>') return ' ';
    if (x === '<w:br/>') return '\n';
    if (x.startsWith('<w:sym')) { const c = (x.match(/w:char="([0-9A-F]+)"/i) || [])[1]; return c && /^F0(FE|FD|A8|78|6F|FC)$/i.test(c) ? (/FE|FD|78|FC/i.test(c) ? '☒' : '☐') : ''; }
    return x.replace(/<[^>]+>/g, '');
  }).join(''));
  const para = (p) => {
    const sid = (p.match(/<w:pStyle w:val="([^"]*)"/) || [])[1] || '';
    const name = (styleName[sid] || sid).toLowerCase();
    const head = (name.match(/^(?:heading|überschrift|titel|title)\s*(\d)?/) || [])[0] ? parseInt((name.match(/(\d)/) || [])[1] || '1', 10) : 0;
    const lvl = p.includes('<w:numPr>') ? parseInt((p.match(/<w:ilvl w:val="(\d+)"/) || [])[1] || '0', 10) : (/list|liste|aufzählung/.test(name) ? Math.max(0, parseInt((name.match(/(\d)\s*$/) || [])[1] || '1', 10) - 1) : -1);
    // Inhaltssteuerelement Kontrollkästchen
    const sdtBox = (p.match(/<w14:checked w14:val="(\d)"/) || [])[1];
    let text = paraText(p);
    if (sdtBox !== undefined) text = (sdtBox === '1' ? '☒ ' : '☐ ') + text.replace(/^[☐☒☑]\s*/, '');
    return { kind: head ? 'heading' : lvl >= 0 ? 'item' : 'para', level: head || lvl, text: clean(text) };
  };
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g)) {
    const x = m[0];
    if (x.startsWith('<w:tbl>')) {
      const rows = [...x.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((r) => [...r[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((c) => clean([...c[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => paraText(p[0])).join('\n'))));
      blocks.push({ kind: 'table', rows });
    } else {
      const b = para(x);
      if (b.text) blocks.push(b);
    }
  }
  return blocks;
}

// ---------- Werte normalisieren ----------

const low = (s) => clean(s).toLowerCase();
export function normStatus(v) {
  const s = low(v);
  if (!s) return '';
  if (/^(nicht begonnen|not started|offen|open|neu|new|idee|idea|backlog|inbox|eingang|unsorted)$/.test(s)) return 'backlog';
  if (/^(done|erledigt|fertig|abgeschlossen|completed?|closed|geschlossen|resolved|gelöst|✓|✔|x|ja|yes|true|1)$/.test(s) || /\b(done|erledigt|fertig|completed)\b/.test(s)) return 'erledigt';
  if (/(cancel|abgebrochen|verworfen|won't|wont|duplicate|duplikat|obsolete)/.test(s)) return 'verworfen';
  if (/(review|prüfung|testing|qa|abnahme|in test)/.test(s)) return 'review';
  if (/(progress|doing|in arbeit|bearbeitung|ongoing|wip|started|begonnen|aktiv|active|läuft|working)/.test(s)) return 'in-arbeit';
  if (/(todo|to do|geplant|planned|next|nächste|ready|bereit|selected|sprint|unstarted)/.test(s)) return 'geplant';
  return 'backlog';
}
export function normPriority(v) {
  const s = low(v);
  if (!s) return '';
  const m = s.match(/^p?\s*([0-4])$/);
  if (m) return m[1] === '0' ? 'P1' : `P${m[1]}`;
  if (/(urgent|dringend|kritisch|critical|highest|blocker|sofort|asap|sehr hoch)/.test(s)) return 'P1';
  if (/(high|hoch|wichtig|major|important)/.test(s)) return 'P2';
  if (/(medium|mittel|normal|moderate|default)/.test(s)) return 'P3';
  if (/(low|niedrig|gering|minor|lowest|trivial|irgendwann|no priority|keine)/.test(s)) return s.includes('no priority') || s === 'keine' ? '' : 'P4';
  return '';
}
export function normType(v, text = '') {
  const s = low(v) || '';
  const t = `${s} ${low(text)}`;
  if (/(bug|fehler|defect|issue type: bug|crash|absturz)/.test(s) || (!s && /\b(bug|fehler|crash|absturz|geht nicht|kaputt)\b/.test(t))) return 'bug';
  if (/(design|ui|ux|mockup|layout)/.test(s)) return 'design';
  if (/(refactor|umbau|aufräumen)/.test(s)) return 'refactor';
  if (/(spike|research|recherche|prüfen|untersuch)/.test(s)) return 'spike';
  if (/(chore|wartung|maintenance|task|aufgabe|ops|infra)/.test(s)) return 'chore';
  if (/(debt|schuld)/.test(s)) return 'debt';
  return 'feature';
}
export function normEffort(v) {
  const s = low(v);
  if (!s) return '';
  if (/^(s|xs|m|l|xl|xxl)$/.test(s)) return { xs: 'S', s: 'S', m: 'M', l: 'L', xl: 'XL', xxl: 'XL' }[s];
  if (/^(klein|small)$/.test(s)) return 'S';
  if (/^(mittel|medium)$/.test(s)) return 'M';
  if (/^(groß|gross|large)$/.test(s)) return 'L';
  const n = parseFloat(s.replace(',', '.'));
  if (!Number.isNaN(n)) {
    if (/(h|std|stunde)/.test(s)) return n <= 4 ? 'S' : n <= 16 ? 'M' : n <= 40 ? 'L' : 'XL';
    if (/(d|tag|day)/.test(s)) return n <= 1 ? 'S' : n <= 3 ? 'M' : n <= 8 ? 'L' : 'XL';
    return n <= 2 ? 'S' : n <= 5 ? 'M' : n <= 8 ? 'L' : 'XL';
  }
  return '';
}
export function normDate(v) {
  const s = clean(v);
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  if (/^\d{5}(\.\d+)?$/.test(s) && +s > 30000 && +s < 70000) return excelDate(+s);
  const MON = { januar: 1, january: 1, jan: 1, februar: 2, february: 2, feb: 2, märz: 3, march: 3, mar: 3, april: 4, apr: 4, mai: 5, may: 5, juni: 6, june: 6, jun: 6, juli: 7, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, oktober: 10, october: 10, okt: 10, oct: 10, november: 11, nov: 11, dezember: 12, december: 12, dez: 12, dec: 12 };
  m = s.toLowerCase().match(/^(\d{1,2})\.?\s+([a-zäö]+)\.?,?\s+(\d{4})/) || s.toLowerCase().match(/^([a-zäö]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const [d, mo] = /^\d/.test(m[1]) ? [m[1], MON[m[2]]] : [m[2], MON[m[1]]];
    if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}
const normTags = (v) => [...new Set(String(v || '').split(/[,;|]/).map((x) => x.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '')).filter((x) => x && x.length <= 30))].slice(0, 8);

// ---------- Tabellen mit Spaltenerkennung ----------

const SYN = {
  title: ['title', 'titel', 'name', 'aufgabe', 'task', 'summary', 'zusammenfassung', 'card name', 'issue', 'betreff', 'subject', 'todo', 'was', 'thema', 'vorhaben', 'überschrift'],
  description: ['description', 'beschreibung', 'desc', 'details', 'notes', 'notizen', 'notiz', 'anmerkung', 'anmerkungen', 'body', 'inhalt', 'content', 'kommentar', 'comment', 'bemerkung', 'info', 'text'],
  status: ['status', 'state', 'liste', 'list', 'spalte', 'column', 'stage', 'phase', 'zustand', 'erledigt', 'done', 'fertig'],
  priority: ['priority', 'priorität', 'prioritaet', 'prio', 'dringlichkeit', 'wichtigkeit', 'importance', 'severity', 'schwere'],
  tags: ['labels', 'label', 'tags', 'tag', 'kategorie', 'category', 'component', 'komponente', 'bereich', 'area', 'project', 'projekt', 'epic', 'gruppe'],
  due: ['due', 'due date', 'fällig', 'fälligkeit', 'deadline', 'termin', 'bis', 'datum', 'date', 'frist', 'end date', 'enddatum', 'target date'],
  effort: ['estimate', 'schätzung', 'aufwand', 'story points', 'points', 'punkte', 'size', 'größe', 'dauer', 'effort', 'time estimate', 'stunden'],
  type: ['type', 'typ', 'issue type', 'art', 'kind', 'ticket type'],
  key: ['id', 'key', 'identifier', 'issue key', 'nummer', 'nr', 'ticket', 'card id', 'card url', 'url', 'link'],
  criteria: ['acceptance criteria', 'akzeptanzkriterien', 'kriterien', 'checklist', 'checkliste', 'definition of done', 'dod'],
};

export function detectMapping(header, rows = []) {
  const map = {};
  const used = new Set();
  const norm = (h) => low(h).replace(/[_*#:()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const field of Object.keys(SYN)) {
    for (const exact of [true, false]) {
      if (map[field] !== undefined) break;
      header.forEach((h, i) => {
        if (map[field] !== undefined || used.has(i)) return;
        const n = norm(h);
        if (exact ? SYN[field].includes(n) : SYN[field].some((s) => s.length > 3 && (n.startsWith(s + ' ') || n.endsWith(' ' + s)))) { map[field] = i; used.add(i); }
      });
    }
  }
  if (map.title === undefined) {
    // Ohne erkennbare Titelspalte die erste Spalte mit überwiegend Text nehmen.
    const i = header.findIndex((h, idx) => !used.has(idx) && rows.slice(0, 20).filter((r) => r[idx] && !/^[\d.,:/\s-]+$/.test(r[idx])).length >= Math.min(3, rows.length));
    if (i >= 0) map.title = i;
  }
  return map;
}

export function applyMapping(map, overrides = {}, header = []) {
  const m = { ...map };
  for (const [field, col] of Object.entries(overrides)) {
    if (!(field in SYN)) throw new Error(`Unbekanntes Feld "${field}". Möglich: ${Object.keys(SYN).join(', ')}`);
    if (col === '' || col === '-') { delete m[field]; continue; }
    const i = /^\d+$/.test(col) ? +col - 1 : header.findIndex((h) => low(h) === low(col));
    if (i < 0 || i >= header.length) throw new Error(`Spalte "${col}" nicht gefunden. Vorhanden: ${header.join(', ')}`);
    m[field] = i;
  }
  return m;
}

function fromTable(rows, fmt, { mapping = {}, origin = 'Zeile' } = {}) {
  if (rows.length < 2) return { candidates: [], header: rows[0] || [], mapping: {} };
  // Kopfzeile: erste Zeile, in der die meisten Zellen gefüllt sind, unter den ersten fünf.
  let hi = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) if (rows[i].filter((c) => clean(c)).length > rows[hi].filter((c) => clean(c)).length) hi = i;
  const header = rows[hi].map((h) => clean(h));
  const body = rows.slice(hi + 1);
  const map = applyMapping(detectMapping(header, body), mapping, header);
  if (map.title === undefined) throw new Error(`Keine Titelspalte erkannt. Spalten: ${header.join(', ')}. Mit --map title=Spaltenname festlegen.`);
  const cell = (r, f) => (map[f] === undefined ? '' : clean(r[map[f]]));
  const known = new Set(Object.values(map));
  const candidates = [];
  body.forEach((r, i) => {
    const title = cell(r, 'title');
    if (!title) return;
    // Spalten ohne Zuordnung landen als Liste in der Beschreibung, damit nichts verloren geht.
    const extra = header.map((h, idx) => (!known.has(idx) && clean(r[idx]) && h ? `- ${h}: ${clean(r[idx]).replace(/\n/g, ' ')}` : '')).filter(Boolean);
    const desc = [cell(r, 'description'), extra.length ? `Weitere Angaben aus dem Import:\n${extra.join('\n')}` : ''].filter(Boolean).join('\n\n');
    const crit = cell(r, 'criteria').split(/\n|;\s*/).map((x) => x.replace(/^[-*•]\s*(\[[ xX]\]\s*)?/, '').trim()).filter(Boolean).map((text) => ({ text, done: false }));
    candidates.push({
      title, description: desc, status: normStatus(cell(r, 'status')), priority: normPriority(cell(r, 'priority')),
      type: normType(cell(r, 'type'), title), effort: normEffort(cell(r, 'effort')), tags: normTags(cell(r, 'tags')), due: normDate(cell(r, 'due')),
      criteria: crit, key: cell(r, 'key'), origin: `${origin} ${hi + i + 2}`, format: fmt,
    });
  });
  return { candidates, header, mapping: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, header[v]])) };
}

// ---------- Trello ----------

function fromTrello(j, { includeArchived = false } = {}) {
  const lists = new Map((j.lists || []).map((l) => [l.id, l]));
  const checklists = new Map();
  for (const c of j.checklists || []) { const arr = checklists.get(c.idCard) || []; arr.push(c); checklists.set(c.idCard, arr); }
  const candidates = [];
  for (const c of j.cards || []) {
    const list = lists.get(c.idList);
    if (!includeArchived && (c.closed || (list && list.closed))) continue;
    const labels = (c.labels || []).map((l) => l.name || l.color).filter(Boolean);
    const prioLabel = labels.map(normPriority).find(Boolean) || '';
    const crit = []; const plan = [];
    for (const cl of checklists.get(c.id) || []) {
      const items = (cl.checkItems || []).sort((a, b) => a.pos - b.pos).map((x) => ({ text: clean(x.name), done: x.state === 'complete' }));
      (/(akzeptanz|acceptance|kriter|dod|definition)/i.test(cl.name) || !plan.length && !crit.length ? crit : plan).push(...items);
    }
    candidates.push({
      title: clean(c.name), description: clean(c.desc) + (plan.length ? `\n\nSchritte aus Trello:\n${plan.map((p) => `- [${p.done ? 'x' : ' '}] ${p.text}`).join('\n')}` : ''),
      status: c.dueComplete ? 'erledigt' : normStatus(list ? list.name : ''), priority: prioLabel, type: normType(labels.find((l) => /bug|fehler|design/i.test(l)) || '', c.name),
      effort: '', tags: normTags(labels.filter((l) => !normPriority(l)).join(',')), due: c.due ? String(c.due).slice(0, 10) : '',
      criteria: crit, key: c.shortLink || c.id, origin: `Karte in „${list ? list.name : '?'}“`, format: 'trello',
    });
  }
  return { candidates, board: j.name || '' };
}

// ---------- Markdown, Text, Word ----------

const CHECK = /^\s*(?:[-*+•]|\d+[.)])?\s*(\[( |x|X|✓|✔)?\]|☐|☑|☒|✅|⬜)\s+(.+)$/;
const BULLET = /^\s*(?:[-*+•]|\d+[.)])\s+(.+)$/;
const TODO = /^\s*(?:TODO|FIXME|AUFGABE|TASK)\s*[:-]\s*(.+)$/i;

// Listenpunkte werden Aufgaben, eingerückte Punkte darunter Kriterien, Überschriften Tags.
function fromLines(lines, fmt, { headingAsTag = true } = {}) {
  const candidates = [];
  let heading = ''; let headStatus = ''; let headTag = '';
  let cur = null; let curIndent = 0;
  let props = null;
  const push = (title, done, indent, origin) => {
    const t = clean(title);
    const m = t.match(/^(.+?)\s*[:–]\s+(.{12,})$/);
    cur = { title: (m ? m[1] : t).slice(0, 150), description: m ? m[2] : '', status: done ? 'erledigt' : headStatus, priority: normPriority((t.match(/\b(P[1-4]|!{1,3})\b|(\(prio:[^)]*\))/i) || [''])[0].replace(/!!!/, 'P1').replace(/!!/, 'P2').replace(/^!$/, 'P3')), type: normType('', t), effort: '', tags: headTag && headingAsTag ? normTags(headTag) : [], due: normDate((t.match(/(?:bis|fällig|due)[: ]+(\S+)/i) || [])[1] || ''), criteria: [], key: '', origin, format: fmt };
    cur.title = cur.title.replace(/\s*\b(P[1-4])\b\s*/i, ' ').replace(/\s*(?:bis|fällig|due)[: ]+\S+/i, '').trim();
    candidates.push(cur); curIndent = indent;
  };
  lines.forEach((raw, i) => {
    const line = raw.replace(/\t/g, '  ');
    const indent = line.match(/^\s*/)[0].length;
    if (!line.trim()) { props = null; return; }
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      heading = clean(h[2]).replace(/[`*_]/g, '');
      // Überschriften wie "Erledigt" oder "In Arbeit" sind Spalten, kurze Überschriften ohne Zahlen werden Tags.
      headStatus = /^(erledigt|done|fertig|abgeschlossen|in arbeit|in progress|doing|review|todo|to do|geplant|backlog|offen|open|ideen?)$/i.test(heading) ? normStatus(heading) : '';
      headTag = !headStatus && heading.split(/\s+/).length <= 3 && !/\d/.test(heading) ? heading : '';
      cur = null; return;
    }
    // Notion-Eigenschaften im Markdown-Export: "Status: In progress"
    const pm = line.match(/^([A-Za-zÄÖÜäöüß ]{2,24}):\s+(.+)$/);
    if (pm && cur && props !== false && !BULLET.test(line)) {
      const k = low(pm[1]); const v = pm[2];
      if (SYN.status.includes(k)) { cur.status = normStatus(v); props = true; return; }
      if (SYN.priority.includes(k)) { cur.priority = normPriority(v); props = true; return; }
      if (SYN.tags.includes(k)) { cur.tags = [...new Set([...cur.tags, ...normTags(v)])]; props = true; return; }
      if (SYN.due.includes(k)) { cur.due = normDate(v); props = true; return; }
      if (SYN.effort.includes(k)) { cur.effort = normEffort(v); props = true; return; }
      if (SYN.type.includes(k)) { cur.type = normType(v, cur.title); props = true; return; }
    }
    const c = line.match(CHECK);
    const b = c ? null : line.match(BULLET);
    const td = line.match(TODO);
    if ((c || b) && cur && indent > curIndent) {
      const text = clean(c ? c[3] : b[1]);
      cur.criteria.push({ text, done: !!(c && /[xX✓✔☑☒✅]/.test(c[1])) });
      return;
    }
    if (c) return push(c[3], /[xX✓✔☑☒✅]/.test(c[1]), indent, `Zeile ${i + 1}`);
    if (b || td) return push((b ? b[1] : td[1]), false, indent, `Zeile ${i + 1}`);
    if (cur && indent > curIndent) { cur.description = [cur.description, clean(line)].filter(Boolean).join('\n'); return; }
  });
  return { candidates };
}

function fromDocx(blocks) {
  const tables = blocks.filter((b) => b.kind === 'table' && b.rows.length >= 2 && b.rows[0].length >= 2);
  let out = [];
  for (const t of tables) { try { out.push(...fromTable(t.rows, 'docx', { origin: 'Tabellenzeile' }).candidates); } catch { /* Tabelle ohne Aufgaben */ } }
  // Listen und Häkchen in Markdown übersetzen und gemeinsam auswerten.
  const lines = [];
  for (const b of blocks) {
    if (b.kind === 'heading') lines.push(`${'#'.repeat(Math.min(6, b.level || 1))} ${b.text}`);
    else if (b.kind === 'item' || /^[☐☑☒✅⬜]/.test(b.text) || /^\[( |x|X)\]/.test(b.text) || TODO.test(b.text)) {
      const box = b.text.match(/^([☐☑☒✅⬜]|\[( |x|X)\])\s*/);
      lines.push(`${'  '.repeat(Math.max(0, b.level))}- ${box ? (/[☑☒✅xX]/.test(box[1]) ? '[x] ' : '[ ] ') + b.text.slice(box[0].length) : b.text}`);
    } else if (b.kind === 'para') lines.push(`${'  '.repeat(4)}${b.text}`);
  }
  out.push(...fromLines(lines, 'docx').candidates.map((c) => ({ ...c, origin: c.origin.replace('Zeile', 'Absatz') })));
  return { candidates: out };
}

// ---------- Notion-ZIP ----------

function fromNotionZip(z) {
  const names = [...z.keys()];
  const csv = names.filter((n) => /\.csv$/i.test(n) && !/_all\.csv$/i.test(n));
  let candidates = [];
  for (const n of csv.length ? csv : names.filter((x) => /_all\.csv$/i.test(x))) {
    candidates.push(...fromTable(parseCsv(z.get(n)().toString('utf8')), 'notion', { origin: `${path.basename(n)}, Zeile` }).candidates);
  }
  // Seiteninhalte (Markdown) als Beschreibung zuordnen: Dateiname beginnt mit dem Titel.
  const pages = names.filter((n) => /\.md$/i.test(n));
  if (candidates.length) {
    for (const c of candidates) {
      const slug = c.title.replace(/[\\/:*?"<>|]/g, ' ').trim().toLowerCase();
      const p = pages.find((n) => path.basename(n).toLowerCase().startsWith(slug.slice(0, 40)));
      if (!p) continue;
      const md = z.get(p)().toString('utf8').split('\n');
      const start = md.findIndex((l, i) => i > 0 && !/^[A-Za-zÄÖÜäöüß ]{2,24}:\s/.test(l) && l.trim());
      const body = md.slice(Math.max(1, start)).join('\n').trim();
      if (body) c.description = [body, c.description].filter(Boolean).join('\n\n');
    }
  } else {
    for (const p of pages) {
      const md = z.get(p)().toString('utf8');
      const r = fromLines(md.split('\n'), 'notion');
      candidates.push(...r.candidates.map((c) => ({ ...c, origin: `${path.basename(p)}, ${c.origin}` })));
    }
  }
  return { candidates };
}

// ---------- Einstieg ----------

export function detectFormat(file, buf) {
  const ext = path.extname(file).toLowerCase();
  if (['.xlsx', '.xlsm'].includes(ext)) return 'xlsx';
  if (ext === '.docx') return 'docx';
  if (['.md', '.markdown', '.txt'].includes(ext)) return 'md';
  if (['.csv', '.tsv'].includes(ext)) {
    const head = buf.slice(0, 2000).toString('utf8').split('\n')[0].toLowerCase();
    if (/\bidentifier\b|\bteam\b.*\bcycle\b|"?triaged"?/.test(head)) return 'linear';
    return 'csv';
  }
  if (ext === '.zip') {
    const z = readZip(buf);
    if (z.has('word/document.xml')) return 'docx';
    if (z.has('xl/workbook.xml')) return 'xlsx';
    return 'notion';
  }
  if (ext === '.json' || buf[0] === 0x7b || buf[0] === 0x5b) {
    try {
      const j = JSON.parse(buf.toString('utf8'));
      if (j && Array.isArray(j.cards) && Array.isArray(j.lists)) return 'trello';
      if (Array.isArray(j) || (j && Array.isArray(j.candidates))) return 'json';
    } catch { /* kein JSON */ }
  }
  if (buf[0] === 0x50 && buf[1] === 0x4b) return detectFormat(file + '.zip', buf);
  return 'md';
}

export function parseImport(file, { format = 'auto', mapping = {}, sheet = '', includeArchived = false } = {}) {
  const buf = fs.readFileSync(file);
  if (buf.length > 30 * 1024 * 1024) throw new Error('Datei ist größer als 30 MB.');
  const fmt = format === 'auto' ? detectFormat(file, buf) : format;
  let r;
  if (fmt === 'trello') r = fromTrello(JSON.parse(buf.toString('utf8')), { includeArchived });
  else if (fmt === 'json') {
    const j = JSON.parse(buf.toString('utf8'));
    const list = Array.isArray(j) ? j : j.candidates;
    r = { candidates: list.filter((c) => c && c.title).map((c, i) => ({
      title: String(c.title), description: clean(c.description || ''), status: c.status ? normStatus(c.status) : '', priority: normPriority(c.priority || ''),
      type: ['feature', 'bug', 'refactor', 'spike', 'chore', 'design', 'debt'].includes(c.type) ? c.type : normType(c.type || '', c.title), effort: normEffort(c.effort || ''),
      tags: Array.isArray(c.tags) ? normTags(c.tags.join(',')) : normTags(c.tags || ''), due: normDate(c.due || ''),
      criteria: (Array.isArray(c.criteria) ? c.criteria : []).map((x) => (typeof x === 'string' ? { text: clean(x), done: false } : { text: clean(x.text), done: !!x.done })).filter((x) => x.text),
      key: c.key ? String(c.key) : '', origin: c.origin || `Eintrag ${i + 1}`, format: 'json',
    })) };
  } else if (fmt === 'xlsx') { const x = readXlsx(buf, sheet); r = { ...fromTable(x.rows, 'xlsx', { mapping, origin: `${x.sheet}, Zeile` }), sheets: x.sheets, sheet: x.sheet }; }
  else if (fmt === 'docx') r = fromDocx(readDocx(buf));
  else if (fmt === 'notion' && buf[0] === 0x50 && buf[1] === 0x4b) r = fromNotionZip(readZip(buf));
  else if (['csv', 'linear'].includes(fmt) || (fmt === 'notion' && /\.(csv|tsv)$/i.test(file))) r = fromTable(parseCsv(buf.toString('utf8'), /\.tsv$/i.test(file) ? '\t' : ''), fmt, { mapping });
  else r = fromLines(buf.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/), fmt === 'notion' ? 'notion' : 'md');
  r.format = fmt;
  r.candidates = r.candidates.map((c) => ({ ...c, title: clean(c.title).slice(0, 150) })).filter((c) => c.title).slice(0, MAX).map((c, i) => ({ n: i + 1, ...c }));
  return r;
}
