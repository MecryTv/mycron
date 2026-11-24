// Selbsttest: legt ein Wegwerfprojekt an und prüft CLI, Hooks, Import, Dateien, Parallelarbeit, Server und API.
// Läuft lokal mit works selftest und in der GitHub Action des Repos mycron. Ohne Abhängigkeiten;
// mit --browser zusätzlich das Board in Chromium, wenn Playwright installiert ist.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, 'works.mjs');
const HOOKS = path.join(HERE, '..', 'hooks');

// ---------- Mini-ZIP zum Erzeugen von Excel- und Word-Dateien ----------

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function makeZip(files) {
  const locals = []; const central = []; let off = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content); const nb = Buffer.from(name); const crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nb, data); central.push(ch, nb); off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

const xlsx = (rows) => makeZip({
  'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Aufgaben" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((c, j) => `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${c}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`,
});
const docx = (paras) => makeZip({
  'word/document.xml': `<w:document><w:body>${paras.map(([style, text]) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/>${style === 'List' ? '<w:numPr><w:ilvl w:val="0"/></w:numPr>' : ''}</w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`,
  'word/styles.xml': '<w:styles><w:style w:styleId="H1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="List"><w:name w:val="List Paragraph"/></w:style></w:styles>',
});

// ---------- Ablauf ----------

// only: nur Schritte, deren Name diesen Text enthält (für eigenständige Schritte beim Entwickeln).
export async function selftest({ keep = false, browser = false, verbose = false, only = '', log =(s) => process.stdout.write(s + '\n') } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'works-selftest-'));
  const proj = path.join(base, 'projekt');
  const home = path.join(base, 'home');
  fs.mkdirSync(proj, { recursive: true }); fs.mkdirSync(home, { recursive: true });
  // WORKS_DRY_OPEN: --open meldet nur, was es öffnen würde. Der Selbsttest öffnet nie einen Browser.
  const env = { ...process.env, HOME: home, USERPROFILE: home, WORKS_ACTOR: '', WORKS_DRY_OPEN: '1',GIT_AUTHOR_NAME: 'works', GIT_AUTHOR_EMAIL: 'works@test', GIT_COMMITTER_NAME: 'works', GIT_COMMITTER_EMAIL: 'works@test' };
  const results = [];
  const hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

  const w = (args, { cwd = proj, input, ok = true, extraEnv = null } = {}) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env: extraEnv ? { ...env, ...extraEnv } : env, encoding: 'utf8', input, timeout: 60000 });
    const res = { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
    if (ok && res.code !== 0) throw new Error(`works ${args.join(' ')} → Exit ${res.code}: ${(res.err || res.out).split('\n').slice(-3).join(' | ')}`);
    return res;
  };
  const hook = (file, input) => {
    const r = spawnSync(process.execPath, [path.join(HOOKS, file)], { cwd: proj, env, encoding: 'utf8', input: JSON.stringify(input), timeout: 20000 });
    if (r.status !== 0) throw new Error(`${file} → Exit ${r.status}: ${r.stderr}`);
    return (r.stdout || '').trim();
  };
  const git = (args, cwd = proj) => { const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const has = (text, part, what) => expect(String(text).includes(part), `${what || 'Ausgabe'} enthält nicht "${part}": ${String(text).slice(0, 300)}`);
  const step = async (name, fn) => {
    if (only && !name.includes(only)) return;
    const t0 = Date.now();
    try { await fn(); results.push({ name, ok: true }); log(`ok      ${name}${verbose ? ` (${Date.now() - t0} ms)` : ''}`); }
    catch (e) {
      results.push({ name, ok: false, error: e.message });
      log(`FEHLER  ${name}\n        ${e.message.split('\n').join('\n        ')}`);
      if (process.env.GITHUB_ACTIONS === 'true') log(ghError(`Selbsttest: ${name}`, e.message.slice(0, 2000)));
    }
  };
  const skip = (name, why) => { results.push({ name, ok: true, skipped: true }); log(`--      ${name} (übersprungen: ${why})`); };

  log(`works Selbsttest in ${base}\nNode ${process.version}, ${process.platform}${hasGit ? '' : ', ohne Git'}\n`);

  // Rote Schritte erscheinen in GitHub Actions als Annotation (W-0027), die der CI-Wächter auch ohne Token liest.
  await step('GitHub-Annotation für rote Schritte', () => {
    expect(typeof ghError === 'function', 'ghError fehlt');
    const a = ghError('Selbsttest: works ship, Teil 1', 'Zeile 1\nZeile 2: 100%');
    expect(a === '::error title=Selbsttest%3A works ship%2C Teil 1::Zeile 1%0AZeile 2: 100%25', `Annotation falsch kodiert: ${a}`);
  });

  await step('Syntax aller Skripte', () => {
    const files = [...fs.readdirSync(HERE).filter((f) => f.endsWith('.mjs')).map((f) => path.join(HERE, f)), ...fs.readdirSync(HOOKS).filter((f) => f.endsWith('.mjs')).map((f) => path.join(HOOKS, f)), path.join(HERE, 'board', 'board.js')];
    for (const f of files) { const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' }); expect(r.status === 0, `${path.basename(f)}: ${r.stderr}`); }
  });

  // Board-Server und Hooks haben unter Windows keine Konsole. Ein Prozessstart ohne windowsHide
  // öffnet dort bei jedem Speichern ein Terminalfenster.
  await step('Prozessstarts ohne Fenster', () => {
    const files = [...fs.readdirSync(HERE).filter((f) => f.endsWith('.mjs') && !['selftest.mjs', 'launcher.mjs'].includes(f)).map((f) => path.join(HERE, f)), ...fs.readdirSync(HOOKS).filter((f) => f.endsWith('.mjs')).map((f) => path.join(HOOKS, f))];
    for (const f of files) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      // Die Optionen stehen in derselben oder der nächsten Zeile.
      lines.forEach((line, i) => {
        if (/\b(spawn|spawnSync|execFile|execFileSync)\(/.test(line)) expect(/windowsHide/.test(line + (lines[i + 1] || '')), `${path.basename(f)}:${i + 1} startet einen Prozess ohne windowsHide`);
      });
    }
  });

  if (hasGit) { git(['init', '-q']); git(['symbolic-ref', 'HEAD', 'refs/heads/main']); }
  fs.mkdirSync(path.join(proj, 'src', 'bot'), { recursive: true });
  fs.mkdirSync(path.join(proj, 'src', 'web'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'src', 'bot', 'backup.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(proj, 'src', 'web', 'page.tsx'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(proj, 'package.json'), '{"name":"selftest","scripts":{"test":"node -e \\"process.exit(0)\\""}}\n');

  await step('init, new, list, show', () => {
    has(w(['init']).out, '.works');
    has(w(['new', '--type=feature', '--title=Backup Export', '--priority=P2', '--effort=M', '--tags=bot', '--description=Export in src/bot/backup.ts erweitern', '--criteria=Export als JSON']).out, 'Angelegt: W-0001');
    has(w(['new', '--type=feature', '--title=Startseite', '--priority=P2', '--effort=M', '--tags=web', '--description=src/web/page.tsx neu bauen', '--criteria=Seite steht']).out, 'W-0002');
    has(w(['new', '--type=chore', '--title=Logs aufräumen', '--effort=S', '--description=Logs vereinheitlichen', '--criteria=Ein Format']).out, 'W-0003');
    const list = JSON.parse(w(['list', '--json']).out);
    expect(list.length === 3, `list --json liefert ${list.length} statt 3 Aufgaben`);
    has(w(['show', 'W-0001']).out, 'Export als JSON');
  });

  await step('Bearbeiten: set, item, check, link, question, log, comment', () => {
    w(['set', 'W-0003', 'priority=P4']);
    w(['item', 'W-0001', '--section=Umsetzungsplan', '--text=Format festlegen']);
    w(['link', 'W-0003', 'related', 'W-0001']);
    w(['question', 'W-0002', '--text=Welche Farben?']);
    w(['question', 'W-0002', '--resolve=1', '--answer=Dunkel']);
    w(['log', 'W-0001', 'Notiz']);
    w(['comment', 'W-0001', '--as=Nutzer', '--text=Bitte auch Rollen sichern']);
    has(w(['comments', 'W-0001']).out, 'Rollen');
    const t = w(['show', 'W-0003']).out;
    has(t, 'priority: P4', 'W-0003'); has(t, 'related: [W-0001]', 'W-0003');
  });

  await step('Ablauf: start, handoff, dod, done, reopen', () => {
    w(['start', 'W-0003']);
    w(['handoff', 'W-0003', '--text=Halb fertig']);
    w(['check', 'W-0003', '1']);
    const dod = w(['dod', 'W-0003'], { ok: false }).out;
    has(dod, 'Manuell zu bestätigen');
    const d = w(['done', 'W-0003', '--confirm'], { ok: false });
    if (d.code !== 0) w(['done', 'W-0003', '--force', '--reason=Selbsttest']);
    has(w(['show', 'W-0003']).out, 'status: erledigt');
    w(['reopen', 'W-0003', '--reason=Selbsttest']);
    has(w(['show', 'W-0003']).out, 'status: backlog');
  });

  await step('Übersicht: status, next, doctor, index', () => {
    has(w(['status']).out, '[works]');
    has(w(['next']).out, 'W-000');
    const doc = w(['doctor'], { ok: false });
    expect(doc.code === 0, `doctor meldet Fehler: ${doc.out.split('\n').filter((l) => /^FEHLER/.test(l)).join(' | ')}`);
    expect(fs.existsSync(path.join(proj, '.works', 'WORKS.md')), 'WORKS.md fehlt');
  });

  await step('Planung: queue, sprint, milestone, template, recur, know, ical', () => {
    w(['queue', 'add', 'W-0002']);
    has(w(['queue']).out, 'W-0002');
    w(['milestone', 'add', 'M1', '--title=Livegang', '--due=2030-01-01']);
    w(['sprint', 'start', '--title=Test', '--days=7']);
    w(['sprint', 'add', 'W-0001,W-0002']);
    has(w(['sprint']).out, 'W-0001');
    w(['sprint', 'close', '--good=Gut', '--next-capacity=12']);
    w(['template', 'save', '--from=W-0001', '--name=Export']);
    has(w(['template', 'list']).out, 'Export');
    w(['recur', 'add', '--title=Täglich prüfen', '--every=daily']);
    has(w(['recur']).out, 'R1');
    w(['know', 'add', '--area=Bot', '--title=Rate Limit', '--text=Über Queue setzen']);
    w(['know', 'propose', '--area=DB', '--title=Nur migrate deploy', '--text=dev löscht']);
    has(w(['know', 'search', 'migrate']).out, 'vorschlag');
    w(['ical', `--out=${path.join(base, 't.ics')}`]);
    has(fs.readFileSync(path.join(base, 't.ics'), 'utf8'), 'BEGIN:VCALENDAR', 'Kalender');
  });

  await step('Entwürfe: design direction, add, choose', () => {
    w(['new', '--type=design', '--title=Bracket mobil', '--tags=ui', '--description=Bracket auf dem Handy', '--criteria=Kein Scrollen']);
    const f = path.join(base, 'a.html');
    fs.writeFileSync(f, '<!doctype html><p>A</p>');
    w(['design', 'direction', 'W-0004', '--text=Dunkel', '--colors=Grund #0F1420,Akzent=#3DD6B5', '--fonts=Inter']);
    const added = w(['design', 'add', 'W-0004', '--name=A', '--title=Klassisch', `--file=${f}`]).out;
    if (added.includes('lokale Dateien')) throw new Error('Warnung bei einem Entwurf ohne lokale Verweise');
    // Das Board zeigt Entwürfe mit CSP ohne file:// und relative Pfade: design add warnt, nennt die Verweise und hängt trotzdem an.
    const g = path.join(base, 'g.html');
    fs.writeFileSync(g, '<!doctype html><link rel="stylesheet" href="css/app.css"><link rel="stylesheet" href="https://fonts.example/a.css"><style>@font-face{src:url("file:///C:/f.woff2")} .x{background:url(data:image/png;base64,AA==)}</style><img src="bild.png"><img src="https://x.example/a.png">');
    const warned = w(['design', 'add', 'W-0004', '--name=G', '--title=Lokal', `--file=${g}`]).out;
    has(warned, 'lokale Dateien', 'Warnung bei lokalen Verweisen');
    for (const ref of ['css/app.css', 'file:///C:/f.woff2', 'bild.png', 'entwurf.mjs inline']) has(warned, ref, `Warnung nennt ${ref}`);
    for (const ref of ['fonts.example', 'x.example', 'data:image']) if (warned.includes(ref)) throw new Error(`Warnung nennt fälschlich ${ref}`);
    has(w(['design', 'show', 'W-0004']).out, 'Variante G: Lokal', 'trotz Warnung angehängt');
    w(['design', 'remove', 'W-0004', 'G']);
    has(w(['design', 'show', 'W-0004']).out, 'Noch keine Variante gewählt');
    w(['design', 'choose', 'W-0004', 'A', '--reason=Test']);
    has(w(['design', 'show', 'W-0004']).out, 'Gewählt: A');
  });

  // Git mit core.autocrlf=true checkt .works unter Windows mit CRLF aus. works muss das genauso lesen wie LF.
  // W-0001 hat Kriterien und einen Kommentar, W-0004 ist eine Gestaltungsaufgabe (dort prüft die DoD decisions.md).
  // W-0021: Das Board als eine JSON-Datei sichern und wieder einlesen. Zwei eigene Projekte, damit die anderen Schritte unberührt bleiben.
  await step('Sichern als JSON: Export, Zusammenführen, Wiederherstellen, Rückgängig', () => {
    const a = path.join(base, 'sich-a'); const b = path.join(base, 'sich-b');
    for (const d of [a, b]) { fs.mkdirSync(d, { recursive: true }); w(['init'], { cwd: d }); }
    const wa = (args, o = {}) => w(args, { cwd: a, ...o }); const wb = (args, o = {}) => w(args, { cwd: b, ...o });
    wa(['new', '--type=feature', '--title=Login bauen', '--priority=P2', '--description=Mit Passwort']);
    wa(['new', '--type=bug', '--title=Export testen', '--priority=P3']);
    wa(['new', '--type=chore', '--title=Aufräumen', '--priority=P4']);
    wa(['comment', 'W-0001', 'Bitte mit Test']);
    wa(['decisions', 'W-0001', '--add=Weg', '--decision=Sitzung im Cookie', '--why=einfach']);
    wa(['link', 'W-0002', 'blocked-by', 'W-0001']);
    wa(['milestone', 'add', 'M1', '--title=Ziel']);
    wa(['know', 'add', '--area=Repo', '--title=Regel', '--text=Erst testen']);
    const file = path.join(base, 'sich.json');
    has(wa(['export', '--json', `--out=${file}`]).out, 'sich.json', 'Export nennt die Datei');
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(j.format === 'works-board' && j.version === 1 && j.tasks.length === 3, `Export: ${j.format} v${j.version}, ${j.tasks && j.tasks.length} Aufgaben`);
    // Wiederherstellen in ein leeres Projekt ergibt denselben Stand.
    has(wb(['import', file]).out, '3 neu', 'Vorschau in leeres Projekt');
    wb(['import', file, '--apply', '--mode=restore']);
    const dirOf = (p, id) => { const t = path.join(p, '.works', 'tasks'); return path.join(t, fs.readdirSync(t).find((x) => x.startsWith(id + '-'))); };
    for (const id of ['W-0001', 'W-0002', 'W-0003']) for (const f of ['task.md', 'decisions.md', 'comments.md']) {
      const fa = path.join(dirOf(a, id), f); const fb = path.join(dirOf(b, id), f);
      if (fs.existsSync(fa)) expect(fs.existsSync(fb) && fs.readFileSync(fa, 'utf8').replace(/\r/g, '') === fs.readFileSync(fb, 'utf8').replace(/\r/g, ''), `${id}/${f} nach dem Wiederherstellen anders`);
    }
    has(fs.readFileSync(path.join(b, '.works', 'config.json'), 'utf8'), '"M1"', 'Meilenstein wiederhergestellt');
    has(fs.readFileSync(path.join(b, '.works', 'wissen.md'), 'utf8'), 'Erst testen', 'Projektwissen wiederhergestellt');
    // Export ohne Verlauf: Der Abgleich übergeht den Verlauf, Zusammenführen behält Verlauf und Übergabe des Boards.
    const c = path.join(base, 'sich-c'); fs.mkdirSync(c, { recursive: true }); w(['init'], { cwd: c });
    const wc = (args, o = {}) => w(args, { cwd: c, ...o });
    wc(['import', file, '--apply', '--mode=restore']);
    const file0 = path.join(base, 'sich0.json');
    wc(['export', '--json', '--no-history', `--out=${file0}`]);
    has(wb(['import', file0]).out, '0 geändert', 'Export ohne Verlauf gilt als unverändert');
    wc(['set', 'W-0003', 'priority=P2']);
    wc(['export', '--json', '--no-history', `--out=${file0}`]);
    has(wb(['import', file0]).out, '1 geändert', 'Export ohne Verlauf: Änderung erkannt');
    wb(['import', file0, '--apply']);
    const t3 = fs.readFileSync(path.join(dirOf(b, 'W-0003'), 'task.md'), 'utf8');
    has(t3, 'priority: P2', 'Export ohne Verlauf: Änderung übernommen');
    has(t3, 'Aufgabe angelegt', 'Export ohne Verlauf: Verlauf des Boards bleibt');
    wb(['undo']);
    // Zusammenführen: neu in A (gleiche ID wie eine Aufgabe nur in B), geändert in A, nur in B.
    wa(['new', '--type=feature', '--title=Neu in A', '--priority=P3']);
    wa(['set', 'W-0001', 'priority=P1']);
    wb(['new', '--type=feature', '--title=Nur in B', '--priority=P3']);
    const file2 = path.join(base, 'sich2.json');
    wa(['export', '--json', `--out=${file2}`]);
    const pre = wb(['import', file2]).out;
    for (const s of ['1 neu', '1 geändert', '2 gleich', '1 nur hier', 'P2 → P1']) has(pre, s, `Vorschau Zusammenführen: ${s}`);
    wb(['import', file2, '--apply']);
    const titles = () => wb(['list', '--json']).out;
    has(titles(), 'Neu in A', 'Neue Aufgabe angelegt'); has(titles(), 'Nur in B', 'Was nur hier steht, bleibt');
    has(fs.readFileSync(path.join(dirOf(b, 'W-0005'), 'task.md'), 'utf8'), 'Neu in A', 'Neue Aufgabe bekommt die nächste freie ID');
    has(fs.readFileSync(path.join(dirOf(b, 'W-0001'), 'task.md'), 'utf8'), 'priority: P1', 'Geänderte übernommen');
    wb(['undo']);
    expect(!titles().includes('Neu in A'), 'Rückgängig entfernt die neue Aufgabe');
    has(fs.readFileSync(path.join(dirOf(b, 'W-0001'), 'task.md'), 'utf8'), 'priority: P2', 'Rückgängig stellt die Priorität zurück');
    // Wiederherstellen: sichert vorher, ersetzt den Stand; Rückgängig spielt die Sicherung wieder ein.
    has(wb(['import', file2, '--apply', '--mode=restore']).out, 'backups', 'Wiederherstellen nennt die Sicherung');
    expect(!titles().includes('Nur in B'), 'Wiederherstellen entfernt, was nur hier stand');
    wb(['undo']);
    has(titles(), 'Nur in B', 'Rückgängig nach dem Wiederherstellen');
    // Ungültige Dateien werden abgelehnt, ohne etwas zu ändern.
    const bad = path.join(base, 'kaputt.json');
    for (const body of ['{"format":"works-board","version":9,"tasks":[]}', '{"format":"works-board","version":1,"tasks":[{"id":"W-0009","title":"x","dir":"../../boese","files":{"task.md":"---\\nid: W-0009\\n---\\n"}}]}', '{"format":"works-board","version":1,"tasks":[{"id":"W-0009","title":"x","files":{"task.md":"x"},"binary":{"../boese.png":"AA=="}}]}']) {
      fs.writeFileSync(bad, body);
      expect(wb(['import', bad, '--apply', '--mode=restore'], { ok: false }).code !== 0, `Ungültige Sicherung angenommen: ${body.slice(0, 60)}`);
    }
    has(titles(), 'Nur in B', 'Ungültige Sicherung hat nichts verändert');
  });

  await step('Windows-Zeilenenden (CRLF) in .works', () => {
    const wd = path.join(proj, '.works');
    const dirOf = (id) => path.join(wd, 'tasks', fs.readdirSync(path.join(wd, 'tasks')).find((d) => d.startsWith(id + '-')));
    w(['decisions', 'W-0004', '--add=Zeilenenden', '--decision=LF', '--why=einheitlich']);
    w(['idea', 'Idee mit CRLF']);
    w(['know', 'add', '--area=Repo', '--title=Zeilenenden', '--text=CRLF lesen']);
    const crlf = (f) => { if (fs.existsSync(f)) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\r?\n/g, '\r\n')); };
    for (const id of ['W-0001', 'W-0004']) for (const f of ['task.md', 'decisions.md', 'comments.md']) crlf(path.join(dirOf(id), f));
    for (const f of ['ideas.md', 'wissen.md']) crlf(path.join(wd, f));
    const dod = w(['dod', 'W-0001'], { ok: false }).out;
    expect(!dod.includes('Abschnitt ist leer') && /Akzeptanzkriterien sind abgehakt \(\d+\/1\)/.test(dod), `Kriterien mit CRLF nicht erkannt: ${dod.split('\n').slice(0, 3).join(' | ')}`);
    expect(/\[x\] decisions\.md enthält Entscheidungen/.test(w(['dod', 'W-0004'], { ok: false }).out), 'Entscheidungen mit CRLF nicht erkannt');
    has(w(['comments', 'W-0001']).out, 'Rollen', 'Kommentare mit CRLF');
    has(w(['ideas']).out, 'Idee mit CRLF', 'Ideen mit CRLF');
    has(w(['know', 'search', 'Zeilenenden']).out, 'CRLF lesen', 'Projektwissen mit CRLF');
    w(['log', 'W-0001', 'Nach CRLF']);
    expect(!fs.readFileSync(path.join(dirOf('W-0001'), 'task.md'), 'utf8').includes('\r'), 'task.md hat nach einer Änderung gemischte Zeilenenden');
  });

  await step('Import: CSV, Markdown, Trello, Excel, Word, Duplikate', () => {
    const fx = path.join(base, 'fx'); fs.mkdirSync(fx);
    fs.writeFileSync(path.join(fx, 'l.csv'), 'ID,Title,Description,Status,Priority,Labels,Estimate\nA-1,Anmeldung per Discord,Ohne Passwort,Todo,High,web,3\nA-2,Alte Seite weg,,Done,Low,,1\n');
    fs.writeFileSync(path.join(fx, 't.md'), '# Bot\n- [ ] Rate Limiter P2\n  - [ ] Limits pro Befehl\n- [x] Update erledigt\n');
    fs.writeFileSync(path.join(fx, 'tr.json'), JSON.stringify({ name: 'B', lists: [{ id: 'l', name: 'Doing' }], cards: [{ id: 'c', shortLink: 'x1', name: 'Karte aus Trello', desc: 'Text', idList: 'l', labels: [{ name: 'Hoch' }] }], checklists: [] }));
    fs.writeFileSync(path.join(fx, 'p.xlsx'), xlsx([['Aufgabe', 'Prio', 'Status'], ['Monitoring einrichten', 'hoch', 'offen'], ['SSL erneuern', 'niedrig', 'erledigt']]));
    fs.writeFileSync(path.join(fx, 'm.docx'), docx([['H1', 'Besprechung'], ['List', 'Ticket-System bauen'], ['', '☐ Datenschutz prüfen']]));
    const c = JSON.parse(w(['import', path.join(fx, 'l.csv'), '--json']).out);
    expect(c.format === 'linear' || c.format === 'csv', `CSV erkannt als ${c.format}`);
    expect(c.candidates.length === 2 && c.selected.length === 1, `CSV: ${c.candidates.length} Einträge, ${c.selected.length} gewählt`);
    expect(c.candidates[0].priority === 'P2' && c.candidates[0].effort === 'M', 'CSV: Priorität oder Aufwand falsch zugeordnet');
    const m = JSON.parse(w(['import', path.join(fx, 't.md'), '--json']).out);
    expect(m.candidates[0].criteria.length === 1 && m.candidates[0].tags.includes('bot'), 'Markdown: Kriterien oder Tags fehlen');
    expect(JSON.parse(w(['import', path.join(fx, 'tr.json'), '--json']).out).format === 'trello', 'Trello nicht erkannt');
    const x = JSON.parse(w(['import', path.join(fx, 'p.xlsx'), '--json']).out);
    expect(x.format === 'xlsx' && x.candidates.length === 2 && x.candidates[1].status === 'erledigt', `Excel: ${JSON.stringify(x.candidates.map((k) => k.status))}`);
    const d = JSON.parse(w(['import', path.join(fx, 'm.docx'), '--json']).out);
    expect(d.format === 'docx' && d.candidates.some((k) => k.title === 'Ticket-System bauen') && d.candidates.some((k) => k.title === 'Datenschutz prüfen'), `Word: ${d.candidates.map((k) => k.title).join(', ')}`);
    has(w(['import', path.join(fx, 'l.csv'), '--apply']).out, 'Importiert: 1');
    has(w(['import', path.join(fx, 'l.csv')]).out, 'schon importiert');
  });

  await step('Hooks: SessionStart, UserPromptSubmit, PostToolUse, Stop, SubagentStop', () => {
    has(hook('session-start.mjs', { cwd: proj, source: 'startup' }), '[works]');
    w(['start', 'W-0001']);
    hook('prompt-submit.mjs', { cwd: proj, prompt: 'los', session_id: 's1' });
    w(['instruct', 'W-0001', 'Bitte auch Threads']);
    const pt = hook('post-tool.mjs', { cwd: proj, session_id: 's1', tool_name: 'Edit', tool_input: { file_path: path.join(proj, 'src', 'bot', 'backup.ts') }, tool_response: {} });
    const j = JSON.parse(pt);
    has(j.hookSpecificOutput.additionalContext, 'Threads', 'PostToolUse Kontext');
    const act = JSON.parse(fs.readFileSync(path.join(proj, '.works', 'activity.json'), 'utf8'));
    expect(act.current.what === 'src/bot/backup.ts', `Aktivität: ${act.current.what}`);
    const tr = path.join(base, 'transcript.jsonl');
    fs.writeFileSync(tr, [1, 1, 2].map((n) => JSON.stringify({ type: 'assistant', message: { id: `m${n}`, model: 'claude-sonnet-5-5', usage: { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 10000, cache_creation_input_tokens: 0 } } })).join('\n') + '\n');
    hook('stop-reminder.mjs', { cwd: proj, session_id: 's1', transcript_path: tr, stop_hook_active: false });
    const usage = fs.readFileSync(path.join(proj, '.works', 'time.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"usage"')).map((l) => JSON.parse(l));
    const sum = usage.reduce((a, u) => a + u.in, 0);
    expect(sum === 2000, `Tokens doppelt oder fehlen: Eingabe ${sum} statt 2000`);
    has(w(['time', 'W-0001']).out, 'Verbrauch');
    // Verbrauch von heute für die Bilanz beim Feierabend (W-0023).
    const today = w(['time', '--today']).out;
    has(today, 'Heute:', 'time --today'); has(today, 'Tokens', 'time --today nennt Tokens');
    expect(/\d/.test(today) && !today.includes('Schätzung gegen'), `time --today zeigt nur den Tag: ${today.split('\n')[0]}`);
    const at = path.join(base, 'agent.jsonl');
    fs.writeFileSync(at, JSON.stringify({ type: 'assistant', message: { id: 'a1', model: 'claude-haiku-5-5', usage: { input_tokens: 500, output_tokens: 100 } } }) + '\n');
    hook('subagent-stop.mjs', { cwd: proj, session_id: 's1', transcript_path: tr, agent_transcript_path: at, agent_id: 'x' });
    expect(fs.readFileSync(path.join(proj, '.works', 'time.jsonl'), 'utf8').includes('"agent:x"'), 'SubagentStop hat nichts erfasst');
  });

  await step('Live: Jetzt-Anzeige mit PreToolUse', () => {
    const actF = path.join(proj, '.works', 'activity.json');
    const n0 = JSON.parse(fs.readFileSync(actF, 'utf8')).recent.length;
    const call = { cwd: proj, session_id: 's1', tool_name: 'Bash', tool_input: { command: 'npm test' } };
    hook('pre-tool.mjs', call);
    let a = JSON.parse(fs.readFileSync(actF, 'utf8'));
    expect(a.current.running === true && a.current.what === 'npm test' && a.recent.length === n0, `PreToolUse: ${JSON.stringify(a.current)}`);
    hook('post-tool.mjs', { ...call, tool_response: {} });
    a = JSON.parse(fs.readFileSync(actF, 'utf8'));
    expect(!a.current.running && a.recent[0].what === 'npm test' && a.recent.length === n0 + 1, 'PostToolUse nach PreToolUse');
    has(fs.readFileSync(path.join(HERE, '..', '..', '..', 'hooks', 'hooks.json'), 'utf8'), 'pre-tool.mjs', 'hooks.json');
  });

  await step('Live: Warten auf Freigabe', () => {
    const actF = path.join(proj, '.works', 'activity.json');
    const read = () => JSON.parse(fs.readFileSync(actF, 'utf8'));
    const call = { cwd: proj, session_id: 's1', tool_name: 'Bash', tool_input: { command: 'npm install -D vitest' } };
    hook('pre-tool.mjs', call);
    // Der Hook darf nichts ausgeben, sonst entscheidet er womöglich über die Freigabe.
    expect(hook('permission.mjs', { ...call, hook_event_name: 'PermissionRequest', permission_suggestions: [] }) === '', 'PermissionRequest gibt etwas aus');
    let a = read();
    expect(a.current.perm === true && a.current.running === true && a.current.what === 'npm install -D vitest' && a.current.permSince, `Freigabe: ${JSON.stringify(a.current)}`);
    // Ein parallel laufender Agent (agent_id) arbeitet weiter: Die Freigabe der Hauptsitzung bleibt stehen,
    // sein Aufruf landet trotzdem im Verlauf.
    const n1 = read().recent.length;
    hook('pre-tool.mjs', { ...call, agent_id: 'sub1', tool_input: { command: 'git status' } });
    hook('post-tool.mjs', { ...call, agent_id: 'sub1', tool_input: { command: 'git status' }, tool_response: {} });
    a = read();
    expect(a.current.perm === true && a.current.what === 'npm install -D vitest' && a.recent.length === n1 + 1 && a.recent[0].what === 'git status', `Agent überschreibt die Freigabe: ${JSON.stringify(a.current)}`);
    hook('pre-tool.mjs', { ...call, tool_input: { command: 'npm test' } });
    expect(!read().current.perm, 'PreToolUse beendet die Freigabe nicht');
    hook('permission.mjs', call);
    hook('post-tool.mjs', { ...call, tool_response: {} });
    expect(!read().current.perm, 'PostToolUse beendet die Freigabe nicht');
    hook('permission.mjs', call);
    hook('stop-reminder.mjs', { cwd: proj, session_id: 's1', stop_hook_active: false });
    a = read();
    expect(!a.busy && !a.current.perm, 'Stop beendet die Freigabe nicht');
    hook('permission.mjs', call);
    hook('prompt-submit.mjs', { cwd: proj, session_id: 's1', prompt: 'weiter' });
    expect(!read().current.perm, 'UserPromptSubmit beendet die Freigabe nicht');
    has(fs.readFileSync(path.join(HERE, '..', '..', '..', 'hooks', 'hooks.json'), 'utf8'), 'permission.mjs', 'hooks.json');
    has(fs.readFileSync(path.join(HERE, 'works.mjs'), 'utf8'), "add('PermissionRequest', 'permission.mjs')", 'install-hooks');
  });

  await step('Live: Uhrzeit abgehakter Schritte', async () => {
    const { stampSteps, taskDirOf } = await import('./live.mjs');
    const { loadTask } = await import('./lib.mjs');
    const load = () => loadTask(path.join(proj, '.works', 'tasks', taskDirOf(proj, 'W-0001')));
    const stepsF = path.join(proj, '.works', 'steps.json');
    w(['check', 'W-0001', '1', '--section=Umsetzungsplan']);
    hook('post-tool.mjs', { cwd: proj, session_id: 's1', tool_name: 'Bash', tool_input: { command: 'works check W-0001 1' }, tool_response: {} });
    const st = JSON.parse(fs.readFileSync(stepsF, 'utf8'));
    expect(st['W-0001'] && st['W-0001']['Format festlegen'], 'Hook hat keine Uhrzeit gestempelt');
    const first = stampSteps(proj, [load()]).get('W-0001');
    expect(first[0].done && first[0].at === st['W-0001']['Format festlegen'], 'Uhrzeit nicht stabil');
    w(['check', 'W-0001', '1', '--section=Umsetzungsplan', '--undo']);
    const after = stampSteps(proj, [load()]).get('W-0001');
    expect(!after[0].done && after[0].at === '', 'Uhrzeit nach --undo nicht entfernt');
    w(['check', 'W-0001', '1', '--section=Umsetzungsplan']);
    stampSteps(proj, [], { prune: true });
    expect(!JSON.parse(fs.readFileSync(stepsF, 'utf8'))['W-0001'], 'prune entfernt nichts');
    has(fs.readFileSync(path.join(proj, '.works', '.gitignore'), 'utf8'), 'steps.json', '.works/.gitignore');
  });

  await step('Live: Zwischenstand der Prüfungen', () => {
    const dir = path.join('.works', 'tasks', fs.readdirSync(path.join(proj, '.works', 'tasks')).find((d) => d.startsWith('W-0001-')));
    fs.writeFileSync(path.join(proj, 'peek.js'), "process.stdout.write(require('fs').readFileSync(process.argv[2], 'utf8'))\n");
    fs.writeFileSync(path.join(proj, 'where.js'), 'process.stdout.write(process.cwd())\n'); // für den Worktree-Test in "Parallelarbeit"
    w(['checks', 'set', `peek=node peek.js ${path.join(dir, 'checks.json')}`]);
    w(['checks', 'run', 'W-0001']);
    const res = JSON.parse(fs.readFileSync(path.join(proj, dir, 'checks.json'), 'utf8'));
    expect(/"running":\s*"peek"/.test(res.results.peek.output), `running fehlt während des Laufs: ${res.results.peek.output.slice(0, 200)}`);
    expect(!('running' in res) && res.results.peek.at, 'running nach dem Lauf nicht entfernt oder at fehlt');
  });

  await step('Prüfungen: Anführungszeichen und Arbeitsordner', async () => {
    const sub = path.join(proj, 'sub dir');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'here.js'), 'process.stdout.write(process.cwd())\n');
    w(['checks', 'set', 'quote=node -e "process.exit(0)"']);
    w(['checks', 'set', 'folder=node here.js', '--cwd=sub dir']);
    w(['checks', 'set', 'outside=node -v', '--cwd=../..']);
    has(w(['checks']).out, 'sub dir', 'works checks');
    w(['checks', 'run', 'W-0001', '--only=quote,folder,outside']);
    const dir = path.join(proj, '.works', 'tasks', fs.readdirSync(path.join(proj, '.works', 'tasks')).find((d) => d.startsWith('W-0001-')));
    const r = JSON.parse(fs.readFileSync(path.join(dir, 'checks.json'), 'utf8')).results;
    expect(r.quote.status === 'ok', `Befehl mit Anführungszeichen: ${r.quote.status} ${String(r.quote.output).slice(0, 200)}`);
    expect(r.folder.status === 'ok' && fs.realpathSync(r.folder.output.trim()) === fs.realpathSync(sub), `Arbeitsordner: ${r.folder.status} ${String(r.folder.output).slice(0, 200)}`);
    expect(r.outside.status === 'fail' && /außerhalb/.test(r.outside.output), `Ordner außerhalb des Projekts nicht abgelehnt: ${r.outside.status} ${String(r.outside.output).slice(0, 120)}`);
    const { checksFor } = await import('./checks.mjs');
    const { loadConfig } = await import('./lib.mjs');
    expect(checksFor(loadConfig(proj), { type: 'feature' }).find((c) => c.name === 'folder').cwd === 'sub dir', 'checksFor liefert cwd nicht');
    w(['checks', 'remove', 'quote', 'folder', 'outside']);
  });

  await step('Prüfungen: Verlauf, wackelig, Laufzeit', async () => {
    const { flakyOf, trendOf } = await import('./checks.mjs');
    // fp: Stand des Codes beim Lauf. Wackelig zählt nur Wechsel auf demselben Stand.
    const h = (s, fps) => [...s].map((x, i) => ({ s: x === 'o' ? 'ok' : 'fail', ms: 1000, fp: fps ? fps[i] : 'a' }));
    expect(!flakyOf(h('ofo', ['a', 'b', 'c'])) && !flakyOf(h('ofof', ['a', 'b', 'b', 'c'])), 'wackelig zählt Wechsel über Codeänderungen hinweg (kaputt, repariert)');
    expect(JSON.stringify(flakyOf(h('ofoof'))) === '{"fails":2,"runs":5}', `wackelig ofoof: ${JSON.stringify(flakyOf(h('ofoof')))}`);
    expect(flakyOf(h('ofo')) && !flakyOf(h('oooof')) && !flakyOf(h('ffffo')) && !flakyOf(h('ooooo')), 'wackelig: ein einzelner Wechsel zählt nicht');
    const ms = (...a) => a.map((x) => ({ s: x < 0 ? 'fail' : 'ok', ms: Math.abs(x) }));
    const up = trendOf(ms(20000, 22000, 21000, 48000));
    expect(up && up.dir === 'up' && up.ms === 48000 && up.usual === 21000, `langsamer: ${JSON.stringify(up)}`);
    expect(trendOf(ms(30000, 30000, 10000)).dir === 'down', 'schneller nicht erkannt');
    expect(!trendOf(ms(10000, 12000)) && !trendOf(ms(1000, 4000)) && !trendOf(ms(20000, -60000)) && !trendOf(ms(48000)), 'Trend ohne deutliche Abweichung');
    // Verlauf in checks.json: höchstens fünf Läufe, ein neuer Befehl beginnt von vorn.
    w(['checks', 'set', 'hx=node -v']);
    for (let i = 0; i < 6; i++) w(['checks', 'run', 'W-0001', '--only=hx']);
    const cfile = path.join(proj, '.works', 'tasks', fs.readdirSync(path.join(proj, '.works', 'tasks')).find((d) => d.startsWith('W-0001-')), 'checks.json');
    const hist = () => JSON.parse(fs.readFileSync(cfile, 'utf8')).results.hx.hist || [];
    expect(hist().length === 5 && hist().every((x) => x.s === 'ok' && typeof x.ms === 'number' && x.at), `Verlauf: ${JSON.stringify(hist())}`);
    w(['checks', 'set', 'hx=node --version']);
    w(['checks', 'run', 'W-0001', '--only=hx']);
    expect(hist().length === 1, `Verlauf nach neuem Befehl: ${hist().length}`);
    // Das Board bekommt wackelig und Trend fertig berechnet.
    const cj = JSON.parse(fs.readFileSync(cfile, 'utf8'));
    cj.results.hx = { ...cj.results.hx, status: 'fail', hist: [...h('ofoo'), { s: 'fail', ms: 900, fp: 'a' }] };
    fs.writeFileSync(cfile, JSON.stringify(cj));
    const { boardData } = await import('./board.mjs');
    const lr = boardData(proj).tasks.find((t) => t.id === 'W-0001').checks.results.hx;
    expect(lr.flaky && lr.flaky.fails === 2 && lr.trend === null, `Board: ${JSON.stringify({ flaky: lr.flaky, trend: lr.trend })}`);
    w(['checks', 'remove', 'hx']);
  });

  await step('Live: Daten im Board', async () => {
    const { boardData } = await import('./board.mjs');
    const dir = path.join('.works', 'tasks', fs.readdirSync(path.join(proj, '.works', 'tasks')).find((d) => d.startsWith('W-0001-')));
    const d = boardData(proj);
    const t1 = d.tasks.find((t) => t.id === 'W-0001');
    expect(Array.isArray(t1.plan) && t1.plan[0].text === 'Format festlegen' && t1.plan[0].at, 'plan fehlt an W-0001');
    expect(t1.checks && t1.checks.list.some((c) => c.name === 'peek') && t1.checks.results.peek, 'checks fehlt an W-0001');
    const other = d.tasks.find((t) => t.status === 'backlog' && !d.meta.queue.includes(t.id));
    expect(other && !('plan' in other) && !('checks' in other), 'Aufgabe außerhalb der Tagesliste hat plan/checks');
    expect(d.meta.today && Array.isArray(d.meta.activity.recent), 'meta.today oder recent fehlt');
    const cf = path.join(proj, dir, 'checks.json');
    const cj = JSON.parse(fs.readFileSync(cf, 'utf8'));
    const runningOf = () => boardData(proj).tasks.find((t) => t.id === 'W-0001').checks.running;
    fs.writeFileSync(cf, JSON.stringify({ ...cj, running: 'peek', runningSince: new Date(Date.now() - 12 * 60000).toISOString() }));
    expect(runningOf() === '', 'veraltetes running wird angezeigt');
    fs.writeFileSync(cf, JSON.stringify({ ...cj, running: 'peek', runningSince: new Date().toISOString() }));
    expect(runningOf() === 'peek', 'frisches running fehlt');
    fs.writeFileSync(cf, JSON.stringify(cj));
    // Verbrauch (W-0008): heute und je Aufgabe aus time.jsonl. Ohne Änderung an der Datei wird nicht neu gelesen.
    const { liveUsage } = await import('./usage.mjs');
    const { loadConfig } = await import('./lib.mjs');
    const u1 = liveUsage(proj, loadConfig(proj));
    expect(liveUsage(proj, loadConfig(proj)) === u1, 'liveUsage liest time.jsonl ohne Änderung neu');
    const ub = boardData(proj);
    const dayBefore = ub.meta.usage.today.tokens;
    const taskBefore = (ub.tasks.find((t) => t.id === 'W-0001').usage || { tokens: 0 }).tokens;
    const old = new Date(Date.now() - 2 * 86400000).toISOString();
    fs.appendFileSync(path.join(proj, '.works', 'time.jsonl'), [
      { t: new Date().toISOString(), ev: 'usage', task: 'W-0001', s: 'u', model: 'claude-sonnet-5-5', in: 1000, out: 500, cw: 0, cr: 0 },
      { t: old, ev: 'usage', task: 'W-0001', s: 'u', model: 'claude-sonnet-5-5', in: 7000, out: 0, cw: 0, cr: 0 },
    ].map((x) => JSON.stringify(x)).join('\n') + '\n');
    const ua = boardData(proj);
    const ut = ua.tasks.find((t) => t.id === 'W-0001').usage;
    expect(ua.meta.usage.today.tokens === dayBefore + 1500 && ut && ut.tokens === taskBefore + 8500 && ua.meta.usage.today.cost > 0, `Verbrauch: ${JSON.stringify(ua.meta.usage)} ${JSON.stringify(ut)}`);
    expect(!('usage' in other), 'Aufgabe außerhalb der Tagesliste hat usage');
    // Der Export geht an Leute außerhalb: keine Befehlszeilen und kein Live-Stand aus der Live-Ansicht.
    const { buildSnapshot } = await import('./export.mjs');
    const snap = buildSnapshot(proj, { images: false }).html;
    expect(!snap.includes('works check W-0001 1') && !snap.includes('"plan":[') && !snap.includes('"today":{"tokens"'), 'Export enthält Live-Daten (Befehle, Schritte oder Verbrauch)');
    w(['checks', 'remove', 'peek']);
    expect(boardData(proj).tasks.find((t) => t.id === 'W-0001').checks === null, 'ohne Prüfungen ist checks nicht null');
    // Stillstand (W-0013): Aufgaben in Arbeit ohne Aktivität seit handoff_stale_days Tagen (Standard 3, 0 schaltet ab).
    const { staleTasks } = await import('./timelog.mjs');
    const { loadTasks } = await import('./lib.mjs');
    const busy = loadTasks(proj).filter((t) => t.status === 'in-arbeit');
    const inTenDays = Date.now() + 10 * 86400000;
    const later = staleTasks(proj, { handoff_stale_days: 3 }, busy, inTenDays);
    expect(busy.length && busy.every((t) => later[t.id] && later[t.id].days >= 9 && typeof later[t.id].handoff === 'boolean'), `Stillstand nach 10 Tagen: ${JSON.stringify(later)}`);
    expect(!Object.keys(staleTasks(proj, { handoff_stale_days: 3 }, busy)).length, 'Frisch bearbeitete Aufgabe gilt als still');
    expect(!Object.keys(staleTasks(proj, { handoff_stale_days: 0 }, busy, inTenDays)).length, 'handoff_stale_days 0 schaltet den Hinweis nicht ab');
    expect(boardData(proj).tasks.find((t) => t.id === 'W-0001').stale === null && boardData(proj).meta.staleDays === 3, 'Board kennt stale nicht');
  });

  if (hasGit) {
    await step('Dateien: Commits mit ID, works file, Hinweis beim Edit', () => {
      git(['add', '-A']); git(['commit', '-q', '-m', 'chore: start']);
      fs.appendFileSync(path.join(proj, 'src', 'bot', 'backup.ts'), 'export const c = 3;\n');
      git(['commit', '-q', '-am', 'feat(W-0001): Export']);
      w(['decisions', 'W-0001', '--add=Format JSON', '--decision=JSON', '--why=einfach']);
      git(['add', '-A']); git(['commit', '-q', '-m', 'docs: works']);
      has(w(['file', 'src/bot/backup.ts']).out, 'W-0001');
      w(['start', 'W-0002']);
      const h = hook('post-tool.mjs', { cwd: proj, session_id: 's2', tool_name: 'Edit', tool_input: { file_path: path.join(proj, 'src', 'bot', 'backup.ts') }, tool_response: {} });
      has(h, 'Format JSON', 'Hinweis');
    });

    await step('Konflikt-Radar: offene Aufgaben mit gleichen Dateien', async () => {
      // Zwei offene Aufgaben ändern dieselbe Datei, eine dritte (Backlog, nicht in der Warteschlange) zählt nicht.
      const idOf = (out) => (out.match(/Angelegt: (W-\d+)/) || [])[1];
      const a = idOf(w(['new', '--type', 'feature', '--title', 'Konflikt A', '--status', 'in-arbeit']).out);
      const b = idOf(w(['new', '--type', 'feature', '--title', 'Konflikt B', '--status', 'review']).out);
      const c = idOf(w(['new', '--type', 'feature', '--title', 'Konflikt C']).out);
      const t = new Date().toISOString();
      fs.appendFileSync(path.join(proj, '.works', 'files.jsonl'), [a, b, c].map((id) => JSON.stringify({ t, task: id, file: 'src/geteilt.ts' })).join('\n') + '\n');
      const { boardData } = await import('./board.mjs');
      const d = boardData(proj);
      const ca = d.tasks.find((x) => x.id === a).conflicts;
      const cc = d.tasks.find((x) => x.id === c).conflicts;
      expect(ca && ca.length === 1 && ca[0].id === b && ca[0].files.includes('src/geteilt.ts'), `Konflikt für ${a}: ${JSON.stringify(ca)}`);
      expect(!cc, `Backlog-Aufgabe ${c} zählt beim Konflikt-Radar: ${JSON.stringify(cc)}`);
      // works parallel plan nutzt dieselbe Dateierkennung.
      const { taskFiles } = await import('./files.mjs');
      const { loadTasks, loadConfig } = await import('./lib.mjs');
      expect(taskFiles(proj, loadConfig(proj), loadTasks(proj).find((x) => x.id === a)).includes('src/geteilt.ts'), 'taskFiles kennt die Datei nicht');
      for (const id of [a, b, c]) w(['drop', id, '--reason=Selbsttest']);
    });

    await step('Parallelarbeit: plan, start, CLI im Worktree, finish --merge, abort', () => {
      // W-0002 hat eben backup.ts bearbeitet und kollidiert deshalb mit W-0001. Das muss plan erkennen.
      w(['set', 'W-0001', 'status=geplant']); w(['set', 'W-0002', 'status=geplant']);
      const clash = JSON.parse(w(['parallel', 'plan', 'W-0001,W-0002', '--json']).out);
      expect(clash.verdict === 'nacheinander', `Konflikt über gleiche Datei nicht erkannt: ${clash.verdict}`);
      const nid = (w(['new', '--type=feature', '--title=Footer', '--effort=M', '--tags=web', '--description=src/web/footer.tsx anlegen', '--criteria=Footer steht']).out.match(/Angelegt: (\S+)/) || [])[1];
      git(['add', '-A']); git(['commit', '-q', '-m', 'docs: works']);
      const p = JSON.parse(w(['parallel', 'plan', `W-0001,${nid}`, '--json']).out);
      expect(['parallel', 'unsicher'].includes(p.verdict) && p.lanes.length === 2, `plan: ${p.verdict}, ${p.reasons.join(' | ')}`);
      w(['parallel', 'start', `W-0001,${nid}`]);
      const lanes = JSON.parse(w(['parallel', 'status', '--json']).out);
      expect(lanes.length === 2 && lanes.every((l) => fs.existsSync(l.path)), 'Worktrees fehlen');
      const l2 = lanes.find((l) => l.task === nid);
      has(w(['parallel', 'prompt', nid]).out, l2.path);
      w(['log', nid, 'Aus dem Worktree'], { cwd: l2.path });
      // where.js ist seit dem Schritt "Dateien" committet und liegt damit auch im Worktree.
      // Ohne Klammern und Anführungszeichen, damit der Befehl unter cmd und sh gleich läuft.
      w(['checks', 'set', 'where=node where.js']);
      has(w(['parallel', 'prompt', nid]).out, 'checks run', 'Agenten-Auftrag');
      w(['checks', 'run', nid], { cwd: l2.path });
      const nd = fs.readdirSync(path.join(proj, '.works', 'tasks')).find((d) => d.startsWith(nid));
      const wr = JSON.parse(fs.readFileSync(path.join(proj, '.works', 'tasks', nd, 'checks.json'), 'utf8')).results.where.output.trim();
      expect(fs.realpathSync(wr) === fs.realpathSync(l2.path), `Prüfung lief in ${wr} statt im Worktree`);
      w(['checks', 'remove', 'where']);
      has(fs.readFileSync(path.join(proj, '.works', 'tasks', fs.readdirSync(path.join(proj, '.works', 'tasks')).find((d) => d.startsWith(nid)), 'task.md'), 'utf8'), 'Aus dem Worktree', 'Hauptprojekt');
      expect(w(['done', nid], { cwd: l2.path, ok: false }).code !== 0, 'done im Worktree war erlaubt');
      fs.appendFileSync(path.join(l2.path, 'src', 'web', 'page.tsx'), 'export const d = 4;\n');
      git(['commit', '-q', '-am', `feat(${nid}): Seite`], l2.path);
      expect(!spawnSync('git', ['status', '--porcelain'], { cwd: l2.path, encoding: 'utf8' }).stdout.includes('.works.link'), '.works.link taucht in git status auf');
      git(['add', '-A']); git(['commit', '-q', '-m', 'docs: works']);
      has(w(['parallel', 'finish', nid, '--merge']).out, 'gemergt');
      has(fs.readFileSync(path.join(proj, 'src', 'web', 'page.tsx'), 'utf8'), 'const d', 'Merge');
      w(['parallel', 'abort', 'W-0001']);
      expect(JSON.parse(w(['parallel', 'status', '--json']).out).length === 0, 'Bahnen nicht aufgeräumt');
    });
  } else {
    skip('Dateien und Parallelarbeit', 'Git fehlt');
  }

  await step('Befehl works ohne Claude: install-cli, Aufruf aus beliebigem Ordner, uninstall', () => {
    const bin = path.join(home, 'bin');
    has(w(['install-cli', `--dir=${bin}`, '--no-path']).out, 'eingerichtet');
    const shim = path.join(bin, process.platform === 'win32' ? 'works.cmd' : 'works');
    expect(fs.existsSync(shim), `${shim} fehlt`);
    const other = path.join(base, 'anderswo'); fs.mkdirSync(other);
    const r = process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', `"${shim}" init`], { cwd: other, env, encoding: 'utf8', windowsVerbatimArguments: true })
      : spawnSync(shim, ['init'], { cwd: other, env, encoding: 'utf8' });
    expect(r.status === 0 && fs.existsSync(path.join(other, '.works', 'config.json')), `Aufruf über ${path.basename(shim)}: ${r.stderr || r.stdout}`);
    if (process.platform === 'win32') {
      // works.ps1 reicht eine Pipe an Node weiter (W-0043): Get-Clipboard | works discord token. Ein zu kurzes Token
      // zeigt, dass die Eingabe ankam; ohne sie hieße es „Kein Token eingegeben“.
      const ps1 = path.join(bin, 'works.ps1');
      const pr = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `'kurz' | & '${ps1.replace(/'/g, "''")}' discord token`], { cwd: other, env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
      has(pr.stdout + pr.stderr, 'nicht nach einem Bot-Token', 'Pipe durch works.ps1');
    }
    has(w(['install-cli', '--uninstall', `--dir=${bin}`]).out, 'Entfernt');
    expect(!fs.existsSync(shim), 'Befehl nach --uninstall noch vorhanden');
  });

  // ---------- Server und API ----------
  let port = 0;
  await step('Live-Board: Start, Seite, Daten, API, Rückgängig, Stopp', async () => {
    for (let p = 47900 + Math.floor(Math.random() * 80); p < 48000 && !port; p++) port = await free(p) ? p : 0;
    expect(port, 'Kein freier Port');
    has(w(['board', '--serve', '--detach', `--port=${port}`]).out, `:${port}`);
    const url = `http://127.0.0.1:${port}`;
    const html = await (await fetch(url + '/')).text();
    has(html, 'data-view="live"', 'Seite'); has(html, 'id="viewLive"', 'Seite');
    const token = (html.match(/"token":"([a-f0-9]{20,})"/) || [])[1];
    expect(token, 'Kein Token in der Seite');
    const data = await (await fetch(url + '/data.json')).json();
    expect(data.tasks && data.tasks.length >= 4 && data.meta, 'data.json unvollständig');
    const api = async (m, p, body) => { const r = await fetch(url + p, { method: m, headers: { 'X-Works-Token': token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${p}: ${j.error}`); return j; };
    const d = await api('GET', '/api/task?id=W-0001');
    expect(d.task && d.task.id === 'W-0001', '/api/task');
    for (const p of ['/api/knowledge', '/api/recurring', '/api/usage', '/api/cleanup', '/api/undo', '/api/parallel', '/api/similar?title=Backup']) await api('GET', p);
    const forbidden = await fetch(url + '/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"create"}' });
    expect(forbidden.status === 403, `Aktion ohne Token: ${forbidden.status}`);
    const c = await api('POST', '/api/action', { action: 'create', type: 'bug', title: 'Aus dem Selbsttest', priority: 'P3', status: 'backlog', description: 'x', criteria: ['y'] });
    expect(c.undo, 'Keine Rückgängig-Sicherung');
    await api('POST', '/api/action', { action: 'undo', key: c.undo });
    const after = await (await fetch(url + '/data.json')).json();
    expect(!after.tasks.some((t) => t.title === 'Aus dem Selbsttest'), 'Rückgängig hat die Aufgabe nicht entfernt');
    const up = await fetch(url + '/api/import?name=x.md', { method: 'POST', headers: { 'X-Works-Token': token, 'Content-Type': 'application/octet-stream' }, body: '- [ ] Aus dem Upload\n' });
    const uj = await up.json();
    expect(up.ok && uj.candidates.length === 1, `Import-Upload: ${uj.error || uj.candidates.length}`);
    await api('POST', '/api/action', { action: 'importApply', token: uj.token, only: [1] });
    has(w(['list']).out, 'Aus dem Upload');
    // Prüfungen im Board speichern, auch mit Arbeitsordner und mehr als 12 Einträgen.
    const saved = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`api${i}`, i === 0 ? { cmd: 'node -v', cwd: 'sub dir' } : 'node -v']));
    await api('POST', '/api/action', { action: 'checksSave', checks: saved });
    const cfgChecks = JSON.parse(fs.readFileSync(path.join(proj, '.works', 'config.json'), 'utf8')).checks;
    expect(cfgChecks.api0 && cfgChecks.api0.cwd === 'sub dir' && cfgChecks.api13 === 'node -v', `checksSave: ${JSON.stringify(cfgChecks).slice(0, 200)}`);
    // Erneut prüfen (W-0006): Nur die genannten Prüfungen laufen, die übrigen Ergebnisse bleiben stehen.
    await api('POST', '/api/action', { action: 'checksSave', checks: { rok: 'node -v', rbad: 'node fehlt-absichtlich.js' } });
    w(['checks', 'run', 'W-0001']);
    const ckF = ['tasks', 'archive'].map((d) => path.join(proj, '.works', d)).flatMap((d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((x) => x.startsWith('W-0001-')).map((x) => path.join(d, x, 'checks.json')) : []))[0];
    const r0 = JSON.parse(fs.readFileSync(ckF, 'utf8')).results;
    expect(r0.rok.status === 'ok' && r0.rbad.status === 'fail', `Ausgangslage: ${JSON.stringify(r0).slice(0, 200)}`);
    await api('POST', '/api/action', { action: 'checksRun', id: 'W-0001', only: ['rbad'] });
    const r1 = JSON.parse(fs.readFileSync(ckF, 'utf8')).results;
    expect(r1.rok.at === r0.rok.at && r1.rbad.at !== r0.rbad.at, 'checksRun mit only hat nicht nur rbad laufen lassen');
    // Hat sich der Code seit dem letzten vollen Lauf geändert, gelten die stehengebliebenen Ergebnisse nicht als aktuell.
    if (hasGit) {
      const src = path.join(proj, 'src', 'bot', 'backup.ts');
      const before = fs.readFileSync(src, 'utf8');
      fs.appendFileSync(src, 'export const geaendert = 1;\n');
      await api('POST', '/api/action', { action: 'checksRun', id: 'W-0001', only: ['rbad'] });
      // checkItems direkt, works done würde veraltete Prüfungen selbst neu starten.
      const { checkItems } = await import('./checks.mjs');
      const { loadConfig, loadTask } = await import('./lib.mjs');
      const ci = checkItems(proj, loadConfig(proj), loadTask(path.dirname(ckF)));
      fs.writeFileSync(src, before);
      expect(ci.state.stale && ci.items.some((x) => !x.ok && /aktuellen Stand/.test(x.text)), `Teillauf nach Codeänderung gilt als aktuell: ${JSON.stringify(ci.items).slice(0, 200)}`);
    }
    const badOnly = await fetch(url + '/api/action', { method: 'POST', headers: { 'X-Works-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'checksRun', id: 'W-0001', only: ['../x'] }) });
    expect(badOnly.status === 400, `Ungültiger Name in only: ${badOnly.status}`);
    // Diff im Verlauf (W-0011): Stand der Datei gegen den letzten Commit, Pfade außerhalb des Projekts abgelehnt.
    if (hasGit) {
      const src = path.join(proj, 'src', 'bot', 'backup.ts');
      const before = fs.readFileSync(src, 'utf8');
      fs.appendFileSync(src, 'export const liveDiff = 42;\n');
      const ld = await api('GET', '/api/diff?id=W-0001&file=src/bot/backup.ts&live=1');
      fs.writeFileSync(src, before);
      expect(ld.source === 'uncommitted' && /\+export const liveDiff = 42;/.test(ld.diff), `Live-Diff: ${JSON.stringify(ld).slice(0, 200)}`);
      // Neue, noch nicht verfolgte Datei: ganzer Inhalt als hinzugefügt.
      fs.writeFileSync(path.join(proj, 'src', 'neu-im-verlauf.ts'), 'export const neu = 1;\n');
      const nd = await api('GET', '/api/diff?id=W-0001&file=src/neu-im-verlauf.ts&live=1');
      fs.rmSync(path.join(proj, 'src', 'neu-im-verlauf.ts'));
      expect(nd.source === 'new' && /\+export const neu = 1;/.test(nd.diff), `Neue Datei im Live-Diff: ${JSON.stringify(nd).slice(0, 200)}`);
      const out = await fetch(url + '/api/diff?id=W-0001&file=../geheim.txt&live=1', { headers: { 'X-Works-Token': token } });
      expect(out.status === 400, `Pfad außerhalb des Projekts: ${out.status}`);
    }
    // Prüfungs-Gesundheit (W-0014): je Prüfung über alle Aufgaben Läufe, Fehlschläge, Median, wackelig.
    const hh = await api('GET', '/api/check-health');
    const rb = hh.checks.find((c) => c.name === 'rbad');
    expect(hh.tasks >= 1 && rb && rb.runs >= 2 && rb.fails >= 2 && rb.fails <= rb.runs && Array.isArray(rb.last) && 'median' in rb && typeof rb.flaky === 'boolean', `Prüfungs-Gesundheit: ${JSON.stringify(rb)}`);
    await api('POST', '/api/action', { action: 'checksSave', checks: {} });
    // W-0002 hat keinen Umsetzungsplan: Die Live-Ansicht darf dafür kein NaN oder "Schritt 0 von 0" zeigen.
    w(['start', 'W-0002']);
    // Viele Prüfungen: zehn eingerichtet, neun mit derselben Meldung fehlgeschlagen. Die Live-Ansicht fasst sie zusammen.
    const many = Array.from({ length: 10 }, (_, i) => `m${i + 1}`);
    w(['checks', 'set', ...many.map((n) => `${n}=node -v`)]);
    const d2 = path.join(proj, '.works', 'tasks', fs.readdirSync(path.join(proj, '.works', 'tasks')).find((x) => x.startsWith('W-0002-')));
    const at = new Date().toISOString();
    fs.writeFileSync(path.join(d2, 'checks.json'), JSON.stringify({ at, fingerprint: '', results: Object.fromEntries(many.map((n, i) => [n, i < 9
      ? { status: 'fail', cmd: 'node -v', ms: 40, output: 'The system cannot find the path specified.\n', at, ...(i === 0 ? { hist: ['ok', 'fail', 'ok', 'fail'].map((s) => ({ s, ms: 40, at, fp: 'x' })) } : {}) }
      // m10 bestanden, aber deutlich langsamer als sonst (W-0009).
      : { status: 'ok', cmd: 'node -v', ms: 48000, output: '', at, hist: [21000, 22000, 20000, 48000].map((ms) => ({ s: 'ok', ms, at })) }])) }));
    // Eine heute erledigte Aufgabe für die Liste Heute (W-0019): Erledigtes steht dort eingeklappt.
    // Vor der Dateiänderung, damit sie den Dateieintrag nicht aus dem Verlauf drängt.
    if (browser) {
      const nid = (w(['new', '--type=chore', '--title=Heute schon erledigt', '--priority=P4']).out.match(/W-\d+/) || [])[0];
      w(['done', nid, '--confirm', '--force', '--reason=Selbsttest']);
    }
    // Eine frische Dateiänderung für den Diff im Verlauf (W-0011), vor der Freigabe, damit sie diese nicht ersetzt.
    hook('post-tool.mjs', { cwd: proj, session_id: 's9', tool_name: 'Edit', tool_input: { file_path: path.join(proj, 'src', 'bot', 'backup.ts') }, tool_response: {} });
    // Claude wartet auf eine Freigabe für W-0002: Desktop zeigt das, der Stop-Hook beendet es vor der Handyprüfung.
    hook('permission.mjs', { cwd: proj, session_id: 's9', tool_name: 'Bash', tool_input: { command: 'npm install -D vitest' } });
    // works shot (W-0024): Screenshots einer Board-Ansicht, einer Aufgabe und einer URL; mit --asset als Bild an der Aufgabe.
    if (browser) {
      const sdir = path.join(base, 'shots');
      // Chrome und Edge stürzen unter Windows ab, wenn USERPROFILE auf einen fremden Ordner zeigt: das echte Profil mitgeben.
      const real = { extraEnv: { HOME: process.env.HOME || '', USERPROFILE: process.env.USERPROFILE || '' } };
      const r = w(['shot', 'live', '--widths=390', '--themes=dark', `--out=${sdir}`], { ok: false, ...real });
      // In der CI ist Playwright für die Browserprüfung installiert: Dort darf works shot nicht still überspringen.
      if (r.code === 2 && /Playwright/.test(r.out + r.err)) { if (process.env.CI) throw new Error('works shot findet in der CI kein Playwright'); log('        works shot übersprungen: Playwright fehlt'); }
      else {
        expect(r.code === 0, `works shot live → Exit ${r.code}: ${(r.out + r.err).slice(0, 300)}`);
        expect(fs.existsSync(path.join(sdir, 'live-dark-390.png')), 'works shot: Bild der Live-Ansicht fehlt');
        const t = w(['shot', 'W-0001', '--widths=1440', '--themes=light', `--out=${sdir}`, '--asset=W-0001', '--kind=nachher', '--desc=Detail von W-0001'], real);
        has(t.out, 'W-0001-light-1440.png', 'works shot einer Aufgabe');
        has(w(['show', 'W-0001']).out, 'Art: nachher', 'works shot --asset hängt das Bild an');
        // Der Dateiname trägt Schema und Breite, sonst findet der Vergleich in der Abnahme (W-0030) das Bild nicht.
        has(w(['show', 'W-0001']).out, 'w-0001-light-1440', 'works shot --asset (Name mit Schema und Breite)');
        const page = path.join(base, 'seite.html');
        fs.writeFileSync(page, '<!doctype html><body style="margin:0"><div class="breit" style="width:2000px">breit</div><script>throw new Error("kaputt")</script></body>');
        const u = w(['shot', `--url=${pathToFileURL(page).href}`, '--widths=390', '--themes=light', `--out=${sdir}`, '--name=breite seite'], { ok: false, ...real });
        expect(u.code === 1 && /seitliches Scrollen/.test(u.out) && /kaputt/.test(u.out), `works shot --url meldet Überlauf und Fehler nicht: ${u.out.slice(0, 300)}`);
        // W-0034: --name bestimmt den Dateinamen, auch bei --url.
        expect(fs.existsSync(path.join(sdir, 'breite-seite-light-390.png')), `works shot --name wirkt nicht: ${fs.readdirSync(sdir).join(', ')}`);
        // W-0035: Szenario stellt einen Zustand in Wegwerf-Projekten her (hier: verwaister Tab), nimmt auf und räumt auf.
        const kitDirs = () => fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('works-szenario-'));
        const before = new Set(kitDirs());
        const sc = w(['shot', `--scenario=${path.join(HERE, '..', 'references', 'scenarios', 'verwaister-tab.mjs')}`, '--widths=1280', '--themes=light', `--out=${sdir}`], { ok: false, ...real });
        expect(sc.code === 0 && fs.existsSync(path.join(sdir, 'verwaister-tab-light-1280.png')), `works shot --scenario → Exit ${sc.code}: ${(sc.out + sc.err).slice(0, 400)}`);
        expect(!kitDirs().some((d) => !before.has(d)), `Szenario hat nicht aufgeräumt: ${kitDirs().filter((d) => !before.has(d)).join(', ')}`);
      }
    }
    if (browser) await browserCheck(url, log, () => hook('stop-reminder.mjs', { cwd: proj, session_id: 's9', stop_hook_active: true }));
    w(['checks', 'remove', ...many]);
  });
  w(['board', '--stop'], { ok: false });

  // Läuft auf 4747 schon das Board eines anderen Projekts, muss der Start im Hintergrund ausweichen.
  await step('Board im Hintergrund: freier Port, Neustart, fester Port', async () => {
    const { default: net } = await import('node:net');
    // Den Port selbst belegen. Gibt ihn gerade ein anderer Prozess frei (etwa ein Board, das noch herunterfährt),
    // bis zu fünf Sekunden warten; ein dauerhaft fremd belegter Port zählt auch als belegt.
    const blocker = net.createServer();
    let held = false;
    for (let i = 0; i < 20 && !held; i++) {
      held = await new Promise((r) => { blocker.once('error', () => r(false)); blocker.listen(4747, '127.0.0.1', () => r(true)); });
      if (!held) await new Promise((r) => setTimeout(r, 250));
    }
    if (!held) log('        Port 4747 ist dauerhaft von einem anderen Programm belegt.');
    try {
      const out = w(['board', '--serve', '--detach']).out;
      const port = (out.match(/127\.0\.0\.1:(\d+)/) || [])[1];
      if (!port || port === '4747') {
        // Diagnose für den seltenen Fall, dass der Start den belegten Port trotzdem bekommt.
        const tail = fs.readFileSync(path.join(proj, '.works', 'server.log'), 'utf8').split(/\r?\n/).filter(Boolean).slice(-6).join(' | ');
        const ns = process.platform === 'win32' ? spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout.split(/\r?\n/).filter((l) => /:4747 /.test(l)).join(' | ') : '';
        throw new Error(`Start bei belegtem Port 4747: ${out.split('\n')[0]} (Blocker hält: ${held}, server.log: ${tail}, netstat: ${ns})`);
      }
      has(w(['board', '--restart']).out, `:${port}/`, 'Neustart behält den Port');
      w(['board', '--stop']);
      const fixed = w(['board', '--serve', '--detach', '--port=4747'], { ok: false });
      expect(fixed.code !== 0, `Belegter ausdrücklicher Port wurde nicht abgelehnt: ${fixed.out.split('\n')[0]}`);
    } finally {
      blocker.close();
      w(['board', '--stop'], { ok: false });
    }
  });

  // W-0031: Ohne --port startet ein Board auf seinem letzten Port, damit offene Tabs sich wieder verbinden.
  await step('Board merkt sich seinen Port: Neustart ohne --port, belegter Port weicht aus', async () => {
    if (!fs.existsSync(path.join(proj, '.works', 'config.json'))) w(['init']);
    const { default: net } = await import('node:net');
    const p1 = await highPort();
    try {
      has(w(['board', '--serve', '--detach', `--port=${p1}`]).out, `:${p1}/`, 'Start mit --port');
      w(['board', '--stop']);
      has(w(['board', '--serve', '--detach']).out, `:${p1}/`, 'Start ohne --port nach dem Stopp');
      w(['board', '--stop']);
      // Belegt: ausweichen wie bisher, nicht scheitern.
      const blocker = net.createServer();
      await new Promise((r) => blocker.listen(p1, '127.0.0.1', r));
      try {
        const out = w(['board', '--serve', '--detach']).out;
        const got = (out.match(/127\.0\.0\.1:(\d+)/) || [])[1];
        expect(got && got !== String(p1), `Belegter letzter Port nicht ausgewichen: ${out.split('\n')[0]}`);
      } finally { blocker.close(); w(['board', '--stop'], { ok: false }); }
      expect(fs.readFileSync(path.join(proj, '.works', '.gitignore'), 'utf8').includes('server-last.json'), 'server-last.json nicht in .works/.gitignore');
    } finally { w(['board', '--stop'], { ok: false }); }
  });

  // Ein offener Board-Tab hält /events offen und verbindet sich nach einem Neustart von selbst wieder (retry 2 s).
  // --open soll dann keinen zweiten Tab öffnen. Der Kindprozess spielt so einen Tab.
  await step('Board --open: kein zweiter Tab, wenn schon einer offen ist', async () => {
    const tabJs = path.join(base, 'tab.cjs');
    fs.writeFileSync(tabJs, "const http = require('http'); const port = process.argv[2];\n(function connect() { const r = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => { res.on('data', () => {}); res.on('end', () => setTimeout(connect, 300)); }); r.on('error', () => setTimeout(connect, 300)); })();\n");
    let tab = null;
    try {
      const first = w(['board', '--serve', '--detach', '--open', `--port=${await highPort()}`]).out;
      has(first, 'Im Browser geöffnet', 'Start ohne Tab öffnet den Browser');
      const port = (first.match(/127\.0\.0\.1:(\d+)/) || [])[1];
      // fetch hält Verbindungen offen. Nach einem Neustart ist die gemerkte tot (ECONNRESET): dann einmal neu fragen.
      const ask = async () => (await (await fetch(`http://127.0.0.1:${port}/tabs`)).json()).tabs;
      const tabs = async () => {
        try { return await ask(); } catch { /* alte Verbindung */ }
        try { return await ask(); } catch (e) {
          const sj = fs.existsSync(path.join(proj, '.works', 'server.json')) ? fs.readFileSync(path.join(proj, '.works', 'server.json'), 'utf8').replace(/\s+/g, ' ') : 'fehlt';
          throw new Error(`/tabs auf Port ${port}: ${e.cause ? e.cause.code || e.cause.message : e.message}. Ausgabe: ${first.split('\n')[0]}. server.json: ${sj}`);
        }
      };
      const until = async (n) => { for (let i = 0; i < 40; i++) { if (await tabs() === n) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error(`/tabs meldet nicht ${n}, sondern ${await tabs()}`); };
      await until(0);
      tab = spawn(process.execPath, [tabJs, port], { stdio: 'ignore' });
      await until(1);
      const again = w(['board', '--serve', '--detach', '--open']).out;
      has(again, 'schon in einem Browser-Tab offen', 'Laufendes Board mit Tab');
      if (again.includes('Im Browser geöffnet')) throw new Error('Zweiter Tab geöffnet, obwohl einer offen ist');
      const restart = w(['board', '--restart', '--open']).out;
      has(restart, 'schon in einem Browser-Tab offen', 'Neustart: der Tab verbindet sich neu');
      if (restart.includes('Im Browser geöffnet')) throw new Error('Nach dem Neustart zweiter Tab geöffnet');
      tab.kill(); tab = null;
      await until(0);
      has(w(['board', '--serve', '--detach', '--open']).out, 'Im Browser geöffnet', 'Laufendes Board ohne Tab öffnet den Browser');
    } finally {
      if (tab) tab.kill();
      w(['board', '--stop'], { ok: false });
    }
  });

  // Hub (W-0025): Laufen zwei Boards, zeigt jedes unter /hub alle Boards. /boards nennt die laufenden,
  // --open zählt die Tabs aller Boards, Stoppen und Starten gehen nur mit Token.
  const other = path.join(base, 'zweites');
  const portOf = (s) => (String(s).match(/127\.0\.0\.1:(\d+)/) || [])[1];
  const waitFor = async (fn, what, ms = 12000) => { const until = Date.now() + ms; while (Date.now() < until) { if (await fn()) return; await new Promise((r) => setTimeout(r, 200)); } throw new Error(`Zeit abgelaufen: ${what}`); };
  await step('Hub: zwei Boards, /boards, /hub, Aktionen, --open über alle Boards, works hub', async () => {
    if (!fs.existsSync(path.join(proj, '.works', 'config.json'))) { w(['init']); w(['new', '--type=chore', '--title=Eine Karte']); }
    if (!fs.existsSync(path.join(base, 'tab.cjs'))) fs.writeFileSync(path.join(base, 'tab.cjs'), "const http = require('http'); const port = process.argv[2];\n(function connect() { const r = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => { res.on('data', () => {}); res.on('end', () => setTimeout(connect, 300)); }); r.on('error', () => setTimeout(connect, 300)); })();\n");
    fs.mkdirSync(other, { recursive: true });
    w(['init'], { cwd: other });
    w(['new', '--type=bug', '--title=Fehler im zweiten Projekt', '--priority=P1'], { cwd: other });
    // Eine Währung aus der config.json darf im Hub nur maskiert erscheinen.
    const ocfg = path.join(other, '.works', 'config.json');
    fs.writeFileSync(ocfg, JSON.stringify({ ...JSON.parse(fs.readFileSync(ocfg, 'utf8')), prices: { currency: '<img src=x onerror=alert(1)>' } }, null, 2));
    const tabJs = path.join(base, 'tab.cjs');
    let tab = null; let hubProc = null;
    try {
      const a = portOf(w(['board', '--serve', '--detach', `--port=${await highPort()}`]).out);
      const b = portOf(w(['board', '--serve', '--detach', `--port=${await highPort()}`], { cwd: other }).out);
      expect(a && b && a !== b, `Zwei Boards auf verschiedenen Ports erwartet: ${a}, ${b}`);
      const get = (u, opt) => fetch(`http://127.0.0.1:${a}${u}`, opt);
      const boards = async () => (await (await get('/boards')).json()).boards;
      const bl = await boards();
      expect(bl.length === 2 && bl.some((x) => String(x.port) === b && x.name === 'zweites'), `/boards: ${JSON.stringify(bl)}`);
      // W-0029: Kennung je Projekt (Hash des Pfads, kein Pfad in data.json), Projekte mit Pfad und Token nur lokal über /boards.
      const bj = await (await get('/boards')).json();
      const own = bj.projects && bj.projects.find((x) => x.name === 'projekt');
      const meta = (await (await get('/data.json')).json()).meta;
      expect(own && own.id && own.path && /^[a-f0-9]{20,}$/.test(bj.token || '') && meta.rootId === own.id && bl.every((x) => x.id), `/boards ohne Kennung, Pfad oder Token: ${JSON.stringify(bj).slice(0, 300)}`);
      expect(!JSON.stringify(meta).includes(own.path.replace(/\\/g, '\\\\')), 'data.json enthält den Projektpfad');
      const html = await (await get('/hub')).text();
      has(html, 'Laufende Boards', 'Hub-Seite'); has(html, 'zweites', 'Hub-Seite'); has(html, `127.0.0.1:${b}/`, 'Hub-Seite (Link zum zweiten Board)');
      has(html, 'Fehler im zweiten Projekt', 'Hub-Seite (P1 des zweiten Projekts)');
      expect(!html.includes('<img src=x'), 'Hub-Seite gibt die Währung aus der config.json unmaskiert aus');
      const token = (html.match(/"token":"([a-f0-9]{20,})"/) || [])[1];
      expect(token, 'Kein Token in der Hub-Seite');
      const part = await (await get('/hub?part=1')).text();
      expect(!part.includes('<html') && part.includes('zweites'), `/hub?part=1 liefert nicht nur den Inhalt: ${part.slice(0, 120)}`);
      // W-0028: Wartet Claude im zweiten Projekt auf eine Freigabe, trägt dessen Karte eine Kennung für den Browser-Hinweis.
      hook('permission.mjs', { cwd: other, session_id: 'h1', tool_name: 'Bash', tool_input: { command: 'npm install -D vitest' } });
      const ph = await (await get('/hub?part=1')).text();
      expect(/data-perm="[^"]+"/.test(ph) && ph.includes('data-perm-name="zweites"') && ph.includes('npm install -D vitest'), `Karte ohne Kennung der Freigabe: ${ph.slice(0, 200)}`);
      has(ph, 'id="hubAsk"', 'Hub (Einladung zu Hinweisen)'); has(ph, 'data-notify', 'Hub (Glocke)');
      expect(!ph.includes('Wartet gerade eben') && ph.includes('Wartet auf deine Freigabe: npm install -D vitest'), 'Live-Zeile einer frischen Freigabe falsch formuliert');
      const act = (body, t = token) => get('/api/hub', { method: 'POST', headers: { ...(t ? { 'X-Works-Token': t } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      expect((await act({ op: 'stop', path: other }, '')).status === 403, 'Stoppen ohne Token war erlaubt');
      expect((await act({ op: 'stop', path: path.join(base, 'gibt-es-nicht') })).status === 400, 'Unbekanntes Projekt nicht abgelehnt');
      // W-0032: Projekt hinzufügen gibt es nicht mehr (der Hub zeigt nur laufende Boards).
      expect((await act({ op: 'add', path: other })).status === 400, 'Aktion add noch erlaubt');
      expect((await act({ op: 'rm', path: other })).status === 400, 'Unbekannte Aktion nicht abgelehnt');
      has(part, 'data-board-url=', 'Hub (Board-Adresse an den Karten)');
      // Ein Tab am zweiten Board reicht: --open im ersten Projekt öffnet keinen weiteren.
      const tabsB = async () => { try { return (await (await fetch(`http://127.0.0.1:${b}/tabs`)).json()).tabs; } catch { return -1; } };
      tab = spawn(process.execPath, [tabJs, b], { stdio: 'ignore' });
      await waitFor(async () => await tabsB() === 1, 'Tab am zweiten Board');
      has(w(['board', '--serve', '--detach', '--open']).out, 'schon in einem Browser-Tab offen', '--open mit Tab an einem anderen Board');
      tab.kill(); tab = null;
      await waitFor(async () => await tabsB() === 0, 'Tab geschlossen');
      has(w(['board', '--serve', '--detach', '--open']).out, 'Im Browser geöffnet', '--open ohne Tab');
      // Stoppen und Starten über den Hub. Der neue Start nimmt den Standardport, deshalb zuletzt und ohne Tab-Zählung.
      expect((await act({ op: 'stop', path: other })).ok, 'Stoppen über den Hub');
      await waitFor(async () => (await boards()).length === 1, 'zweites Board stoppt');
      // W-0032: Gestoppte Boards verschwinden aus dem Hub, eine Gestoppt-Liste gibt es nicht mehr.
      const solo = await (await get('/hub?part=1')).text();
      expect(!solo.includes('zweites') && !solo.includes('Gestoppt') && !solo.includes('Projekt hinzufügen'), `Hub zeigt gestoppte Boards: ${solo.slice(0, 200)}`);
      expect((await act({ op: 'start', path: other })).ok, 'Starten über den Hub');
      await waitFor(async () => (await boards()).length === 2, 'zweites Board startet');
      // works hub zeigt dieselbe Seite.
      let hp = 0;
      for (let p = 48100 + Math.floor(Math.random() * 80); p < 48200 && !hp; p++) hp = await free(p) ? p : 0;
      hubProc = spawn(process.execPath, [CLI, 'hub', `--port=${hp}`], { cwd: proj, env, stdio: 'ignore' });
      let hh = '';
      await waitFor(async () => { try { hh = await (await fetch(`http://127.0.0.1:${hp}/`)).text(); return true; } catch { return false; } }, 'works hub startet');
      has(hh, 'Laufende Boards', 'works hub'); has(hh, 'zweites', 'works hub');
    } finally {
      if (tab) tab.kill();
      if (hubProc) hubProc.kill();
      w(['board', '--stop'], { ok: false });
      w(['board', '--stop'], { cwd: other, ok: false });
    }
  });

  // Im Browser: Ein offenes Board wechselt zum Hub, sobald ein zweites startet. Öffnen zeigt ein Board im selben Tab.
  if (browser) {
    await step('Hub im Browser: Wechsel beim zweiten Board, Öffnen im selben Tab', async () => {
      const br = await launchChromium(log);
      if (!br) return;
      try {
        const a = portOf(w(['board', '--serve', '--detach', `--port=${await highPort()}`]).out);
        const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
        const errs = [];
        p.on('pageerror', (e) => errs.push(e.message));
        await p.goto(`http://127.0.0.1:${a}/`); await p.waitForSelector('.card');
        expect(await p.locator('#hubLink').isHidden(), 'Hub-Link sichtbar, obwohl nur ein Board läuft');
        const b = portOf(w(['board', '--serve', '--detach', `--port=${await highPort()}`], { cwd: other }).out);
        await p.waitForURL(/\/hub$/, { timeout: 15000 });
        await p.waitForSelector('.hub-bc');
        expect(await p.locator('.hub-bc').count() === 2, `Hub zeigt ${await p.locator('.hub-bc').count()} statt 2 Boards`);
        expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'Hub: seitliches Scrollen');
        await p.locator('.hub-bc', { hasText: 'zweites' }).getByRole('link', { name: 'Öffnen', exact: true }).click();
        await p.waitForURL(new RegExp(`:${b}/`), { timeout: 10000 }); await p.waitForSelector('.card');
        await p.waitForSelector('#hubLink:not([hidden])', { timeout: 10000 });
        has(await p.locator('#hubLink').textContent(), '2 Boards', 'Hub-Link');
        expect(!errs.length, `Fehler auf der Seite: ${errs.join(' | ')}`);
      } finally {
        await br.close();
        w(['board', '--stop'], { ok: false });
        w(['board', '--stop'], { cwd: other, ok: false });
      }
    });
  }

  // W-0028: Hinweis bei wartender Freigabe. Notification ist nachgebaut (zählt mit), "Hintergrund" wird simuliert.
  if (browser) {
    await step('Hub: Browser-Hinweis bei wartender Freigabe, einmal je Freigabe', async () => {
      if (!fs.existsSync(path.join(other, '.works', 'config.json'))) { fs.mkdirSync(other, { recursive: true }); w(['init'], { cwd: other }); }
      if (!fs.existsSync(path.join(proj, '.works', 'config.json'))) { w(['init']); w(['new', '--type=chore', '--title=Eine Karte']); }
      const br = await launchChromium(log);
      if (!br) return;
      try {
        const a = portOf(w(['board', '--serve', '--detach', `--port=${await highPort()}`]).out);
        w(['board', '--serve', '--detach', `--port=${await highPort()}`], { cwd: other });
        const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
        await ctx.addInitScript(() => {
          window.__notes = []; window.__hidden = false;
          Object.defineProperty(document, 'hidden', { get: () => window.__hidden, configurable: true });
          class FakeNote { constructor(title, opt) { window.__notes.push({ title, body: (opt || {}).body || '' }); } close() {} }
          FakeNote.permission = 'default';
          FakeNote.requestPermission = async () => { FakeNote.permission = 'granted'; return 'granted'; };
          window.Notification = FakeNote;
        });
        const p = await ctx.newPage();
        const errs = [];
        p.on('pageerror', (e) => errs.push(e.message));
        await p.goto(`http://127.0.0.1:${a}/hub`);
        await p.waitForSelector('#hubAsk:not([hidden])', { timeout: 10000 });
        await p.getByRole('button', { name: 'Einschalten', exact: true }).click();
        await p.waitForSelector('#hubAsk', { state: 'hidden' });
        const bell = p.locator('[data-notify]');
        expect(await bell.getAttribute('aria-pressed') === 'true', 'Glocke nach Einschalten nicht an');
        has(await bell.textContent(), 'Hinweise an', 'Glocke');
        await p.evaluate(() => { window.__hidden = true; });
        hook('permission.mjs', { cwd: other, session_id: 'b1', tool_name: 'Bash', tool_input: { command: 'npm test -- --watch' } });
        await p.waitForFunction(() => window.__notes.length >= 1, null, { timeout: 15000 });
        const n = (await p.evaluate(() => window.__notes))[0];
        has(n.title, 'zweites', 'Hinweis (Projekt)'); has(n.body, 'npm test', 'Hinweis (Freigabe)');
        await p.waitForTimeout(6500);
        expect(await p.evaluate(() => window.__notes.length) === 1, 'Zweiter Hinweis für dieselbe Freigabe');
        // Nach dem Neuladen bleibt die Wahl erhalten: keine Einladung, Glocke an.
        await p.reload();
        await p.waitForSelector('[data-notify]:not([hidden])');
        expect(await p.locator('#hubAsk').isHidden(), 'Einladung nach dem Neuladen wieder da');
        expect(!errs.length, `Fehler auf der Seite: ${errs.join(' | ')}`);
      } finally {
        await br.close();
        w(['board', '--stop'], { ok: false });
        w(['board', '--stop'], { cwd: other, ok: false });
      }
    });
  }

  // W-0032: Läuft nur noch ein Board, schließt sich der Hub; bei zwei oder mehr kommt er zurück.
  if (browser) {
    await step('Hub schließt sich bei einem Board und kommt bei zweien zurück', async () => {
      if (!fs.existsSync(path.join(other, '.works', 'config.json'))) { fs.mkdirSync(other, { recursive: true }); w(['init'], { cwd: other }); }
      if (!fs.existsSync(path.join(proj, '.works', 'config.json'))) { w(['init']); w(['new', '--type=chore', '--title=Eine Karte']); }
      const br = await launchChromium(log);
      if (!br) return;
      try {
        const a = portOf(w(['board', '--serve', '--detach', `--port=${await highPort()}`]).out);
        const pb = await highPort();
        w(['board', '--serve', '--detach', `--port=${pb}`], { cwd: other });
        const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
        const errs = [];
        p.on('pageerror', (e) => errs.push(e.message));
        await p.goto(`http://127.0.0.1:${a}/hub`);
        await p.waitForSelector('.hub-bc');
        expect(await p.locator('.hub-bc').count() === 2, 'Hub zeigt nicht beide Boards');
        // Zweites Board endet: der Hub-Tab zeigt das verbliebene Board.
        w(['board', '--stop'], { cwd: other });
        await p.waitForURL(new RegExp(`:${a}/$`), { timeout: 15000 });
        await p.waitForSelector('.card');
        // Wieder zwei Boards: zurück zum Hub.
        w(['board', '--serve', '--detach', `--port=${pb}`], { cwd: other });
        await p.waitForURL(/\/hub$/, { timeout: 15000 });
        await p.waitForSelector('.hub-bc');
        // Endet das Board, das den Hub ausliefert, geht der Tab zum verbliebenen.
        w(['board', '--stop']);
        await p.waitForURL(new RegExp(`:${pb}/$`), { timeout: 30000 });
        await p.waitForSelector('.card');
        expect(!errs.length, `Fehler auf der Seite: ${errs.join(' | ')}`);
      } finally {
        await br.close();
        w(['board', '--stop'], { ok: false });
        w(['board', '--stop'], { cwd: other, ok: false });
      }
    });
  }

  // W-0029: Endet ein Board und startet auf seinem Port ein anderes Projekt, zeigt der alte Tab eine Leiste statt
  // still das fremde Board. Er zählt dort nicht als Tab und wechselt von selbst, sobald sein Projekt wieder läuft.
  if (browser) {
    await step('Verwaister Tab: Leiste statt fremdem Projekt, kein fremder Tab, Wechsel zurück', async () => {
      if (!fs.existsSync(path.join(other, '.works', 'config.json'))) { fs.mkdirSync(other, { recursive: true }); w(['init'], { cwd: other }); }
      if (!fs.existsSync(path.join(proj, '.works', 'config.json'))) { w(['init']); w(['new', '--type=chore', '--title=Eine Karte']); }
      const br = await launchChromium(log);
      if (!br) return;
      try {
        const port = await highPort();
        w(['board', '--serve', '--detach', `--port=${port}`]);
        const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
        const errs = [];
        p.on('pageerror', (e) => errs.push(e.message));
        await p.goto(`http://127.0.0.1:${port}/`); await p.waitForSelector('.card');
        expect(await p.locator('#orphanBar').isHidden(), 'Leiste sichtbar, obwohl das eigene Board läuft');
        w(['board', '--stop']);
        w(['board', '--serve', '--detach', `--port=${port}`], { cwd: other });
        await p.waitForSelector('#orphanBar:not([hidden])', { timeout: 15000 });
        const bar = await p.locator('#orphanBar').textContent();
        has(bar, 'projekt', 'Leiste (eigenes Projekt)'); has(bar, 'zweites', 'Leiste (fremdes Projekt)');
        const st = await p.evaluate(() => ({ orphan: document.body.classList.contains('orphan'), h1: document.querySelector('#project').textContent }));
        expect(st.orphan && st.h1.includes('projekt') && !st.h1.includes('zweites'), `Tab zeigt das fremde Projekt: ${JSON.stringify(st)}`);
        const tabs = async () => (await (await fetch(`http://127.0.0.1:${port}/tabs`)).json()).tabs;
        await waitFor(async () => await tabs() === 0, 'verwaister Tab zählt nicht als Tab des fremden Boards');
        const own = await highPort();
        w(['board', '--serve', '--detach', `--port=${own}`]);
        await p.waitForURL(new RegExp(`:${own}/`), { timeout: 15000 });
        await p.waitForSelector('.card');
        expect(await p.locator('#orphanBar').isHidden(), 'Leiste nach dem Wechsel noch sichtbar');
        expect(!errs.length, `Fehler auf der Seite: ${errs.join(' | ')}`);
      } finally {
        await br.close();
        w(['board', '--stop'], { ok: false });
        w(['board', '--stop'], { cwd: other, ok: false });
      }
    });
  }

  // W-0030: In der Abnahme lassen sich Breite und Schema wählen; Entwurf und Nachher-Bild folgen beide.
  if (browser) {
    await step('Abnahme: Entwurf und Ergebnis in gleicher Breite und gleichem Schema', async () => {
      if (!fs.existsSync(path.join(proj, '.works', 'config.json'))) w(['init']);
      const id = (w(['new', '--type=design', '--title=Vergleich im gleichen Maßstab', '--priority=P3']).out.match(/W-\d+/) || [])[0];
      const dir = path.join(base, 'w30');
      fs.mkdirSync(dir, { recursive: true });
      // Entwurf wie aus der mockups-Vorlage: liest ?theme= und meldet Schema und Breite.
      fs.writeFileSync(path.join(dir, 'A.html'), '<!doctype html><html><body><p id="t"></p><script>const q = new URLSearchParams(location.search); document.getElementById("t").textContent = (q.get("theme") || "light") + " " + innerWidth;</script></body></html>');
      w(['design', 'add', id, '--name', 'A', '--title', 'Variante A', '--file', path.join(dir, 'A.html')]);
      w(['design', 'choose', id, 'A', '--reason', 'Selbsttest']);
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
      for (const n of ['seite-light-1440', 'seite-dark-390']) { fs.writeFileSync(path.join(dir, `${n}.png`), png); w(['asset', id, path.join(dir, `${n}.png`), '--kind=nachher', `--name=${n}`, '--desc=Selbsttest']); }
      w(['set', id, 'status=review']);
      const br = await launchChromium(log);
      if (!br) return;
      try {
        const port = await highPort();
        w(['board', '--serve', '--detach', `--port=${port}`]);
        const p = await br.newPage({ viewport: { width: 1440, height: 900 } });
        const errs = [];
        p.on('pageerror', (e) => errs.push(e.message));
        await p.goto(`http://127.0.0.1:${port}/`);
        await p.click(`.card[data-id="${id}"]`);
        await p.click('[data-act="review"]');
        await p.waitForSelector('dialog[open] .rv-cmp');
        const dlg = p.locator('dialog[open]');
        const pick = (name) => dlg.getByRole('button', { name, exact: true }).click();
        const state = () => p.evaluate(() => { const d = document.querySelector('dialog[open]'); const f = d.querySelector('.rv-cmp iframe'); const i = d.querySelector('.rv-cmp img'); const m = d.querySelector('.rv-miss'); return { frame: f ? f.getAttribute('src') : '', img: i ? i.getAttribute('src') : '', miss: m ? m.textContent : '' }; });
        await pick('Handy'); await pick('Dunkel');
        let st = await state();
        expect(st.frame.includes('theme=dark') && st.img.includes('dark-390'), `Handy dunkel: ${JSON.stringify(st)}`);
        await pick('Tablet');
        st = await state();
        expect(/Kein Nachher-Bild für Tablet, dunkel/.test(st.miss) && /--widths=768 --themes=dark/.test(st.miss), `Fehlendes Bild nicht gemeldet: ${JSON.stringify(st)}`);
        await pick('Desktop'); await pick('Hell');
        st = await state();
        expect(st.img.includes('light-1440'), `Desktop hell: ${JSON.stringify(st)}`);
        const inner = p.frameLocator('dialog[open] .rv-cmp iframe').locator('#t');
        await inner.waitFor();
        has(await inner.textContent(), 'light 1440', 'Entwurf in gewählter Breite');
        expect(!errs.length, `Fehler auf der Seite: ${errs.join(' | ')}`);
      } finally {
        await br.close();
        w(['board', '--stop'], { ok: false });
      }
    });
  }

  // Discord-Bot works (W-0036) gegen ein nachgebautes Discord im selben Prozess. Die CLI läuft deshalb asynchron:
  // spawnSync würde den Fake blockieren, auf den die CLI wartet.
  const wa = (args, { cwd = proj, input, ok = true, extraEnv = null } = {}) => new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [CLI, ...args], { cwd, env: extraEnv ? { ...env, ...extraEnv } : env, windowsHide: true });
    let out = ''; let err = '';
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => c.kill(), 60000);
    c.on('close', (code) => {
      clearTimeout(timer);
      const res = { code, out: out.trim(), err: err.trim() };
      if (ok && code !== 0) reject(new Error(`works ${args.join(' ')} → Exit ${code}: ${(err || out).split('\n').slice(-3).join(' | ')}`)); else resolve(res);
    });
    c.stdin.end(input || '');
  });
  const DTOKEN = 'MTAwMA.fake-bot-token.0123456789abcdefWXYZ';
  const ddir = path.join(home, '.works', 'discord');
  const dcfg = () => JSON.parse(fs.readFileSync(path.join(ddir, 'config.json'), 'utf8'));
  const dwait = async (fn, what, ms = 25000) => { const until = Date.now() + ms; let last; while (Date.now() < until) { last = await fn(); if (last) return last; await new Promise((r) => setTimeout(r, 100)); } throw new Error(`Zeit abgelaufen: ${what}`); };
  const fromUrl = pathToFileURL(path.join(HERE, 'discord-fake.mjs')).href;
  const { startFakeDiscord } = await import(fromUrl);
  const fake = await startFakeDiscord({ token: DTOKEN });
  // Schnelle Takte für den Test: Bot-Schleife 100 ms, Dashboard frühestens alle 300 ms.
  const denv = { WORKS_DISCORD_API: fake.api, WORKS_DISCORD_FAST: '1' };
  // Gateway nur mit globalem WebSocket (ab Node 22, abschaltbar mit --no-experimental-websocket).
  const hasWs = typeof globalThis.WebSocket === 'function';
  const embedsOf = (ch = '11') => fake.inChannel(ch).map((m) => ({ m, e: m.embeds[0] || {} }));
  const findMsg = (pred, ch) => embedsOf(ch).find(({ m, e }) => pred(e, m));
  // Dashboard (W-0044): eine Nachricht je Kanal für alle Projekte. dashOf(name): das neueste, in dem das Projekt steht
  // (nach einem 403 bleibt das alte stehen, der Bot legt ein neues an).
  const isDash = (e) => /^works · \d+ Projekte?$/.test((e && e.title) || '');
  const dashOf = (name) => embedsOf().filter(({ e }) => isDash(e) && (e.description || '').includes(`**${name}**`)).pop();
  let dprobe = '';

  await step('Discord: Einrichtung, Token nur lokal und nie in der Ausgabe', async () => {
    if (!fs.existsSync(path.join(proj, '.works', 'config.json'))) { w(['init']); w(['new', '--type=chore', '--title=Eins']); w(['new', '--type=chore', '--title=Zwei', '--criteria=Fertig']); }
    let r = await wa(['discord'], { extraEnv: denv });
    has(r.out, 'nicht eingerichtet', 'Status ohne Einrichtung');
    // Gemeinsamer Bot (W-0040): beide Wege im Status, ohne Adresse eine klare Meldung, Adresse nur mit https.
    has(r.out, 'Gemeinsamer Bot', 'Status nennt den gemeinsamen Bot'); has(r.out, 'Eigener Bot', 'Status nennt den eigenen Bot');
    r = await wa(['discord', 'link', 'ABCD-2345'], { extraEnv: denv, ok: false });
    expect(r.code !== 0, 'link ohne Adresse lief durch'); has(r.out + r.err, 'keine Adresse');
    r = await wa(['discord', 'set', 'service=http://example.org'], { extraEnv: denv, ok: false });
    expect(r.code !== 0, 'Dienst ohne https angenommen'); has(r.out + r.err, 'https');
    r = await wa(['discord', 'start'], { extraEnv: denv, ok: false });
    expect(r.code !== 0, 'start ohne Einrichtung lief durch'); has(r.out + r.err, 'nicht eingerichtet');
    expect(!fs.existsSync(path.join(ddir, 'bot.pid')), 'Bot ohne Einrichtung gestartet');
    // Token als Argument landet in der Shell-Historie: abgelehnt.
    r = await wa(['discord', 'token', DTOKEN], { extraEnv: denv, ok: false });
    expect(r.code !== 0, 'Token als Argument angenommen'); expect(!(r.out + r.err).includes(DTOKEN), 'Token in der Ausgabe');
    // Basis-URL nur auf diesem Rechner überschreibbar, sonst ginge das Token an einen fremden Server.
    r = await wa(['discord', 'token'], { input: DTOKEN + '\n', extraEnv: { ...denv, WORKS_DISCORD_API: 'https://example.org/api/v10' }, ok: false });
    expect(r.code !== 0, 'Fremde API-Adresse angenommen'); has(r.out + r.err, '127.0.0.1');
    r = await wa(['discord', 'token'], { input: 'falsch\n', extraEnv: denv, ok: false });
    expect(r.code !== 0, 'Falsches Token angenommen'); has(r.out + r.err, 'ungültig');
    expect(!fs.existsSync(path.join(ddir, 'secret.json')), 'Falsches Token gespeichert');
    r = await wa(['discord', 'token'], { input: DTOKEN + '\n', extraEnv: denv });
    has(r.out, 'works#4821', 'Name des Bots'); has(r.out, 'client_id=1000', 'Einladungslink'); has(r.out, 'permissions=', 'Rechte im Link');
    expect(!(r.out + r.err).includes(DTOKEN), 'Token in der Ausgabe');
    const sec = JSON.parse(fs.readFileSync(path.join(ddir, 'secret.json'), 'utf8'));
    expect(sec.token === DTOKEN, 'Token nicht gespeichert');
    if (process.platform !== 'win32') expect((fs.statSync(path.join(ddir, 'secret.json')).mode & 0o077) === 0, 'secret.json ist für andere lesbar');
    const cfg = dcfg();
    expect(cfg.owner_id === '4242' && cfg.app_id === '1000', `Besitzer oder Anwendung fehlt: ${JSON.stringify(cfg)}`);
    expect(!JSON.stringify(cfg).includes(DTOKEN), 'Token in config.json');
    r = await wa(['discord', 'channel'], { extraEnv: denv });
    has(r.out, '#works'); has(r.out, 'Mein Server'); expect(!r.out.includes('Sprache'), 'Sprachkanal angeboten');
    r = await wa(['discord', 'channel', 'works'], { extraEnv: denv });
    has(r.out, '#works');
    expect(dcfg().channel_id === '11' && dcfg().guild_id === '1', 'Kanal nicht gespeichert');
    r = await wa(['discord'], { extraEnv: denv });
    has(r.out, 'eingerichtet'); has(r.out, DTOKEN.slice(-4), 'maskiertes Token'); expect(!r.out.includes(DTOKEN), 'Token im Status');
    const inProject = fs.readdirSync(path.join(proj, '.works'), { recursive: true }).filter((f) => !String(f).includes('tasks')).some((f) => { try { return fs.readFileSync(path.join(proj, '.works', String(f)), 'utf8').includes(DTOKEN); } catch { return false; } });
    expect(!inProject, 'Token im Projekt');
    // Einstellungen für den Test: ohne Verzögerung und ohne Ruhezeit.
    await wa(['discord', 'set', 'delay.perm=0', 'delay.idle=0', 'quiet.on=false'], { extraEnv: denv });
    expect(dcfg().delays.perm === 0 && dcfg().quiet.on === false, 'set wirkt nicht');
    r = await wa(['discord', 'set', 'quiet.from=25:00'], { extraEnv: denv, ok: false });
    expect(r.code !== 0, 'Ungültige Uhrzeit angenommen');
  });

  await step('Discord: Bot startet einmal, verbindet sich, Dashboard angeheftet und gebündelt bearbeitet', async () => {
    let r = await wa(['discord', 'start'], { extraEnv: denv });
    has(r.out, 'gestartet');
    try {
      if (hasWs) {
        await dwait(() => fake.gateway.identifies.length >= 1, 'Identify am Gateway');
        expect(fake.gateway.identifies[0].token === DTOKEN, 'Identify ohne Token');
      }
      // Anheften ist eine eigene Anfrage nach dem Anlegen: darauf warten, nicht nur auf die Nachricht.
      const st = await dwait(() => { const s = dashOf('projekt'); return s && s.m.pinned ? s : null; }, 'Dashboard mit projekt angeheftet');
      const names = (st.e.fields || []).map((f) => f.name);
      expect(names.includes('Heute'), `Felder fehlen: ${names.join(', ')}`);
      expect(st.m.attachments.some((a) => a.filename === 'works.png'), 'Bild fehlt');
      expect(st.m.flags & 4096, 'Dashboard nicht still');
      r = await wa(['discord', 'start'], { extraEnv: denv });
      has(r.out, 'läuft schon');
      await new Promise((res) => setTimeout(res, 600));
      if (hasWs) expect(fake.gateway.identifies.length === 1, `Zweiter Bot verbunden (${fake.gateway.identifies.length})`);
      has((await wa(['discord'], { extraEnv: denv })).out, 'läuft', 'Status');
      // Mehrere Änderungen kurz nacheinander: höchstens wenige Bearbeitungen, am Ende der neue Stand.
      // Eigene, frische Aufgabe: Im vollen Selbsttest sind die ersten Aufgaben schon in Arbeit oder erledigt.
      const before = st.m.edits;
      dprobe = (w(['new', '--type=chore', '--title=Discord-Probe', '--criteria=Geprüft']).out.match(/W-\d+/) || [])[0];
      w(['start', dprobe, '--force']);
      for (let i = 0; i < 5; i++) w(['log', dprobe, `Schritt ${i}`]);
      await dwait(() => (dashOf('projekt').e.description || '').includes(dprobe), `Dashboard zeigt ${dprobe}`);
      await new Promise((res) => setTimeout(res, 800));
      const edits = dashOf('projekt').m.edits - before;
      expect(edits >= 1 && edits <= 4, `Dashboard ${edits}-mal bearbeitet`);
      expect(fake.inChannel('11').filter((m) => isDash(m.embeds[0])).length === 1, 'Dashboard doppelt');
      expect(!fake.problems.length, `Discord-Grenzen verletzt: ${JSON.stringify(fake.problems)}`);
      expect(fake.requests.every((q) => q.auth === `Bot ${DTOKEN}`), 'Anfrage ohne Token');
      const log = fs.readFileSync(path.join(ddir, 'bot.log'), 'utf8');
      expect(!log.includes(DTOKEN), 'Token im Log');
    } catch (e) { await wa(['discord', 'stop'], { extraEnv: denv, ok: false }); throw e; }
  });

  await step('Discord: Ereignisse mit Feldern, Erwähnung nur bei @, Erledigtes wird bearbeitet', async () => {
    // Eigenständig: Ist ein Schritt davor gescheitert, startet dieser den Bot selbst und legt seine Aufgabe an.
    await wa(['discord', 'start'], { extraEnv: denv, ok: false });
    if (!dprobe) { dprobe = (w(['new', '--type=chore', '--title=Discord-Probe', '--criteria=Geprüft']).out.match(/W-\d+/) || [])[0]; w(['start', dprobe, '--force']); }
    try {
      // Review: still, mit Kriterien.
      w(['set', dprobe, 'status=review']);
      const rv = await dwait(() => findMsg((e) => e.title === `${dprobe} im Review`), 'Nachricht Im Review');
      expect(rv.m.flags & 4096, 'Review nicht still');
      expect(!rv.m.content.includes('<@'), 'Review erwähnt');
      expect((rv.e.fields || []).some((f) => f.name === 'Kriterien'), 'Feld Kriterien fehlt');
      // Freigabe: Erwähnung, Befehl ausgeblendet.
      const known = new Set(fake.messages.keys());
      hook('permission.mjs', { cwd: proj, session_id: 's-d', tool_name: 'Bash', tool_input: { command: 'echo geheim-4711' } });
      const pm = await dwait(() => findMsg((e, m) => e.title === 'Wartet auf deine Freigabe' && !known.has(m.id)), 'Nachricht Freigabe');
      has(pm.m.content, '<@4242>', 'Erwähnung');
      expect(pm.m.allowed_mentions && JSON.stringify(pm.m.allowed_mentions.users) === '["4242"]', `allowed_mentions: ${JSON.stringify(pm.m.allowed_mentions)}`);
      expect(!(pm.m.flags & 4096), 'Freigabe still');
      expect(!JSON.stringify(pm.m).includes('geheim-4711'), 'Befehl trotz Datenschutz gezeigt');
      // Freigabe erledigt: dieselbe Nachricht wird grau, ohne Erwähnung im Text.
      hook('stop-reminder.mjs', { cwd: proj, session_id: 's-d' });
      await dwait(() => /beantwortet/.test(fake.messages.get(pm.m.id).embeds[0].title || ''), 'Freigabe als beantwortet bearbeitet');
      // Fertig und wartet: nach setIdle, Verzögerung 0.
      const fin = await dwait(() => findMsg((e) => e.title === 'Claude ist fertig und wartet auf dich'), 'Nachricht fertig');
      has(fin.m.content, '<@4242>');
      hook('prompt-submit.mjs', { cwd: proj, session_id: 's-d', prompt: 'weiter' });
      await dwait(() => /weiter/i.test(fake.messages.get(fin.m.id).embeds[0].title || ''), 'Fertig-Nachricht nach neuer Anfrage bearbeitet');
      // Review angenommen: Review-Nachricht wird grün bearbeitet statt einer neuen.
      w(['done', dprobe, '--confirm', '--force', '--reason=Selbsttest']);
      await dwait(() => /angenommen/.test(fake.messages.get(rv.m.id).embeds[0].title || ''), 'Review als angenommen bearbeitet');
      // Neue P1.
      w(['new', '--type=bug', '--title=Server brennt', '--priority=P1']);
      await dwait(() => findMsg((e) => /Neue P1/.test(e.title || '') && /Server brennt/.test(JSON.stringify(e))), 'Nachricht Neue P1');
      expect(!fake.problems.length, `Discord-Grenzen verletzt: ${JSON.stringify(fake.problems)}`);
    } catch (e) { await wa(['discord', 'stop'], { extraEnv: denv, ok: false }); throw e; }
  });

  await step('Discord: works ship als eine Nachricht, CI rot mit Bug, Wochenbericht', async () => {
    await wa(['discord', 'start'], { extraEnv: denv, ok: false });
    try {
      const emit = (type, data) => w(['discord', 'emit', type, `--json=${JSON.stringify(data)}`], { extraEnv: denv });
      emit('ship', { id: 'W-0001', step: 'start', run: 'r1' });
      const sh = await dwait(() => findMsg((e) => e.title === 'W-0001 wird ausgeliefert'), 'ship-Nachricht');
      emit('ship', { id: 'W-0001', step: 'merge', run: 'r1' });
      emit('ship', { id: 'W-0001', step: 'push', sha: 'abcdef1234567', run: 'r1' });
      emit('ship', { id: 'W-0001', step: 'ci', ok: true, workflows: 3, run: 'r1' });
      emit('ship', { id: 'W-0001', step: 'done', run: 'r1' });
      await dwait(() => fake.messages.get(sh.m.id).embeds[0].title === 'W-0001 ausgeliefert', 'ship-Nachricht abgeschlossen');
      const d = fake.messages.get(sh.m.id).embeds[0].description;
      expect((d.match(/✓/g) || []).length >= 3, `Schritte nicht abgehakt: ${d}`);
      expect(fake.inChannel('11').filter((m) => /W-0001 (wird )?ausgeliefert/.test((m.embeds[0] || {}).title || '')).length === 1, 'ship als mehrere Nachrichten');
      emit('ci', { ok: false, sha: 'feedbeef1234', failed: 2, total: 6, job: 'test (windows)', error: 'AssertionError: expected 3 to be 4', bug: 'W-0099', url: 'https://github.com/a/b/actions/runs/1' });
      const ci = await dwait(() => findMsg((e) => e.title === 'CI rot für feedbee'), 'CI-Nachricht');
      has(JSON.stringify(ci.e.fields), 'W-0099', 'Bug im Feld');
      expect(ci.m.components.length && ci.m.components[0].components.some((c) => c.style === 5 && c.url === 'https://github.com/a/b/actions/runs/1'), 'Link auf den Lauf fehlt');
      emit('report', { kind: 'woche', title: 'Woche 47', summary: 'Discord-Bot gebaut.', done: 1, lists: { Erledigt: [{ id: 'W-0001', title: 'Eins' }], 'Braucht dich': ['W-0002: offene Frage, Welche Farbe?'] } });
      const wr = await dwait(() => findMsg((e) => /Woche 47/.test(e.title || '')), 'Wochenbericht');
      expect((wr.e.fields || []).some((f) => f.name === 'Erledigt (1)' && f.value.includes('W-0001 Eins')), `Liste im Wochenbericht fehlt: ${JSON.stringify(wr.e.fields)}`);
      await dwait(() => !fs.readdirSync(path.join(ddir, 'outbox')).length, 'outbox geleert');
      expect(!fake.problems.length, `Discord-Grenzen verletzt: ${JSON.stringify(fake.problems)}`);
    } catch (e) { await wa(['discord', 'stop'], { extraEnv: denv, ok: false }); throw e; }
  });

  await step('Discord: nichts geht verloren (Bot aus, 429, 502, gelöschtes Dashboard), Gateway verbindet neu', async () => {
    await wa(['discord', 'start'], { extraEnv: denv, ok: false });
    try {
      if (hasWs) {
        const ids = fake.gateway.identifies.length;
        fake.reconnect();
        await dwait(() => fake.gateway.resumes >= 1 || fake.gateway.identifies.length > ids, 'Neuverbindung nach op 7');
        fake.dropGateway();
        await dwait(() => fake.gateway.sockets.size >= 1, 'Neuverbindung nach Abbruch');
      }
      const r = await wa(['discord', 'stop'], { extraEnv: denv });
      has(r.out, 'gestoppt');
      expect(!fs.existsSync(path.join(ddir, 'bot.pid')), 'bot.pid nach stop');
      // Ohne Bot: Ereignisse landen in der outbox, die CLI wartet nicht auf Discord.
      const t0 = Date.now();
      w(['discord', 'emit', 'report', `--json=${JSON.stringify({ kind: 'woche', title: 'Woche 48', summary: 'Offline geschrieben.' })}`], { extraEnv: denv });
      expect(Date.now() - t0 < 5000, 'emit hat gewartet');
      expect(fs.readdirSync(path.join(ddir, 'outbox')).length === 1, 'Ereignis nicht in der outbox');
      const st = dashOf('projekt');
      fake.deleteMessage(st.m.id);
      fake.limitNext = 2; fake.failNext = 1;
      await wa(['discord', 'start'], { extraEnv: denv });
      await dwait(() => findMsg((e) => /Woche 48/.test(e.title || '')), 'Offline-Ereignis nachgeliefert');
      w(['log', 'W-0001', 'Neuer Stand für das Dashboard']);
      const again = await dwait(() => { const s = dashOf('projekt'); return s && s.m.id !== st.m.id && s.m.pinned ? s : null; }, 'Dashboard neu angelegt und angeheftet');
      expect(again, 'kein neues Dashboard');
      expect(!fake.problems.length, `Discord-Grenzen verletzt: ${JSON.stringify(fake.problems)}`);
    } finally {
      await wa(['discord', 'stop'], { extraEnv: denv, ok: false });
    }
  });

  // Funde aus dem Audit von W-0036.
  await step('Discord: Branch-Wechsel, ship, Bahnen, Sperrdatei, Versionswechsel, Neustart ohne Verluste', async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const nid = (s) => (s.match(/W-\d+/) || [])[0];
    const pidFile = path.join(ddir, 'bot.pid');
    const readPid = () => { try { return JSON.parse(fs.readFileSync(pidFile, 'utf8')); } catch { return null; } };
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
    const p1Msgs = (title) => fake.inChannel('11').filter((m) => /Neue P1/.test((m.embeds[0] || {}).title || '') && ((m.embeds[0] || {}).description || '').includes(title));
    const ob = path.join(ddir, 'outbox');
    const obCount = () => (fs.existsSync(ob) ? fs.readdirSync(ob).filter((f) => f.endsWith('.json')).length : 0);
    // Wochenbericht: die Vorschau mit --no-send legt nichts für den Bot ab (Bot ist hier aus).
    const before = obCount();
    w(['report', '--week', '--no-send']);
    expect(obCount() === before, 'Vorschau des Wochenberichts für den Bot abgelegt');
    w(['report', '--week', '--summary=Selbsttest-Woche']);
    expect(obCount() === before + 1, 'Wochenbericht nicht für den Bot abgelegt');
    // Alte bot.pid, deren PID inzwischen einem anderen Prozess gehört: start startet trotzdem, stop beendet ihn nicht.
    const other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { windowsHide: true, stdio: 'ignore' });
    const stale = () => { fs.writeFileSync(pidFile, JSON.stringify({ pid: other.pid, started: '2026-01-01T00:00:00Z', version: 'alt' })); const t = new Date(Date.now() - 5 * 60000); fs.utimesSync(pidFile, t, t); };
    try {
      stale();
      has((await wa(['discord', 'stop'], { extraEnv: denv })).out, 'lief nicht', 'stop mit fremder PID');
      expect(alive(other.pid), 'stop hat einen fremden Prozess beendet');
      stale();
      has((await wa(['discord', 'start'], { extraEnv: denv })).out, 'gestartet', 'start mit alter bot.pid');
      expect(alive(other.pid), 'start hat einen fremden Prozess beendet');
      const info = await dwait(() => { const i = readPid(); return i && i.pid !== other.pid ? i : null; }, 'neuer Bot in bot.pid');
      // Arbeitsordner des Bots: ~/.works/discord, damit er unter Windows keinen Projektordner oder Worktree sperrt.
      // realpath: Unter macOS ist der Temp-Ordner ein Symlink, process.cwd() liefert den echten Pfad.
      expect(info.cwd && fs.realpathSync(info.cwd).toLowerCase() === fs.realpathSync(ddir).toLowerCase(), `Bot läuft in ${info.cwd}`);
    } finally { other.kill(); }
    try {
      await dwait(() => dashOf('projekt'), 'Dashboard nach Neustart');
      // Ohne Änderung schreibt der Bot seinen Zustand nicht dauernd neu.
      await sleep(800);
      const m0 = fs.statSync(path.join(ddir, 'state.json')).mtimeMs;
      await sleep(1500);
      expect(fs.statSync(path.join(ddir, 'state.json')).mtimeMs === m0, 'state.json ohne Änderung neu geschrieben');
      // Ein Ereignis, an dem die Darstellung scheitert, blockiert die folgenden nicht.
      w(['discord', 'emit', 'report', `--json=${JSON.stringify({ title: 'Kaputt', lists: { A: null } })}`], { extraEnv: denv });
      w(['discord', 'emit', 'report', `--json=${JSON.stringify({ title: 'Nach dem Fehler', summary: 'geht' })}`], { extraEnv: denv });
      await dwait(() => findMsg((e) => e.title === 'Nach dem Fehler'), 'Ereignis nach einem kaputten');
      // Freigabe aus einer parallelen Bahn (activity.lanes).
      const actF = path.join(proj, '.works', 'activity.json');
      // Aufgabe, die schon im Review ist, wenn der Bot sie zum ersten Mal sieht (W-0039: langsame Runner).
      const direct = nid(w(['new', '--type=chore', '--title=Direkt im Review', '--status', 'review']).out);
      await dwait(() => findMsg((e) => e.title === `${direct} im Review`), 'Review einer neuen Aufgabe');
      const lane = nid(w(['new', '--type=chore', '--title=Bahn-Aufgabe']).out);
      const since = new Date().toISOString();
      const act = JSON.parse(fs.readFileSync(actF, 'utf8'));
      act.lanes = { ...(act.lanes || {}), [lane]: { at: since, task: lane, tool: 'Bash', verb: 'Führt aus', what: 'npm test', ok: true, lane: true, running: true, perm: true, permSince: since } };
      // Die Bahn muss in lanes.json stehen: Einträge beendeter Bahnen ignoriert der Bot.
      const lanesF = path.join(proj, '.works', 'lanes.json');
      const lanesBefore = fs.existsSync(lanesF) ? fs.readFileSync(lanesF, 'utf8') : null;
      const lanesNow = lanesBefore ? JSON.parse(lanesBefore) : { lanes: [] };
      lanesNow.lanes = [...(lanesNow.lanes || []), { task: lane, branch: 'feature/bahn', path: path.join(base, 'bahn'), started: since, status: 'läuft' }];
      fs.writeFileSync(lanesF, JSON.stringify(lanesNow));
      fs.writeFileSync(actF, JSON.stringify(act));
      const lp = await dwait(() => findMsg((e) => e.title === 'Wartet auf deine Freigabe' && JSON.stringify(e.fields || []).includes(lane)), 'Freigabe aus der Bahn');
      has(lp.m.content, '<@4242>', 'Erwähnung bei Freigabe aus der Bahn');
      const act2 = JSON.parse(fs.readFileSync(actF, 'utf8'));
      act2.lanes[lane] = { at: new Date().toISOString(), task: lane, tool: 'Bash', verb: 'Führt aus', what: 'npm test', ok: true, lane: true };
      fs.writeFileSync(actF, JSON.stringify(act2));
      await dwait(() => /beantwortet/.test(fake.messages.get(lp.m.id).embeds[0].title || ''), 'Freigabe aus der Bahn beantwortet');
      if (lanesBefore === null) fs.unlinkSync(lanesF); else fs.writeFileSync(lanesF, lanesBefore);
      // Verzögerte Freigabe überlebt einen Neustart des Bots.
      await wa(['discord', 'set', 'delay.perm=3'], { extraEnv: denv });
      await sleep(300);
      hook('permission.mjs', { cwd: proj, session_id: 's-n', tool_name: 'Read', tool_input: { file_path: 'neustart.txt' } });
      await sleep(700);
      await wa(['discord', 'stop'], { extraEnv: denv });
      await wa(['discord', 'start'], { extraEnv: denv });
      const np = await dwait(() => findMsg((e, m) => e.title === 'Wartet auf deine Freigabe' && m.content.includes('(Read)')), 'Freigabe nach Neustart', 12000);
      expect(np, 'Freigabe nach Neustart fehlt');
      await wa(['discord', 'set', 'delay.perm=0'], { extraEnv: denv });
      hook('prompt-submit.mjs', { cwd: proj, session_id: 's-n', prompt: 'weiter' });
      // Dashboard, das der Bot nicht mehr bearbeiten darf (anderer Bot, 403): neu anlegen.
      const old = dashOf('projekt');
      fake.forbidEdit = true;
      w(['new', '--type=chore', '--title=Neuer Stand für 403', '--priority=P2']);
      const fresh = await dwait(() => { const s = dashOf('projekt'); return s && s.m.id !== old.m.id && s.m.pinned ? s : null; }, 'neues Dashboard nach 403');
      expect(fresh, 'kein neues Dashboard');
      fake.forbidEdit = false;
      // Abgeschaltetes Projekt: auch Ereignisse aus der outbox kommen nicht.
      const { rootIdOf } = await import(pathToFileURL(path.join(HERE, 'lib.mjs')).href);
      const cfg0 = dcfg();
      fs.writeFileSync(path.join(ddir, 'config.json'), JSON.stringify({ ...cfg0, projects: { [rootIdOf(proj)]: { enabled: false } } }));
      w(['discord', 'emit', 'report', `--json=${JSON.stringify({ title: 'Projekt ist aus' })}`], { extraEnv: denv });
      await dwait(() => !obCount(), 'outbox nach abgeschaltetem Projekt geleert');
      await sleep(400);
      expect(!findMsg((e) => e.title === 'Projekt ist aus'), 'Ereignis trotz abgeschaltetem Projekt');
      fs.writeFileSync(path.join(ddir, 'config.json'), JSON.stringify(cfg0));
      // Neue Version: Der Sitzungsstart wartet nicht auf den alten Bot, danach läuft genau ein neuer.
      const cur = readPid();
      fs.writeFileSync(pidFile, JSON.stringify({ ...cur, version: 'alt' }));
      const t0 = Date.now();
      spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], { cwd: proj, env: { ...env, ...denv }, input: JSON.stringify({ cwd: proj }), encoding: 'utf8', timeout: 20000, windowsHide: true });
      expect(Date.now() - t0 < 6000, `Sitzungsstart hat ${Date.now() - t0} ms auf den Bot gewartet`);
      await dwait(() => { const i = readPid(); return i && i.pid !== cur.pid && !alive(cur.pid); }, 'alter Bot durch neuen ersetzt');
      if (hasGit) {
        // Branch-Wechsel: Eine P1 vom Branch verschwindet auf main und kommt zurück, gemeldet wird sie einmal.
        const bp = path.join(base, 'dbranch');
        fs.mkdirSync(bp, { recursive: true });
        git(['init', '-q'], bp); git(['symbolic-ref', 'HEAD', 'refs/heads/main'], bp);
        w(['init'], { cwd: bp });
        git(['add', '-A'], bp); git(['commit', '-q', '-m', 'Start'], bp);
        git(['switch', '-q', '-c', 'feature/x'], bp);
        await dwait(() => dashOf('dbranch'), 'Dashboard dbranch');
        w(['new', '--type=bug', '--title=Branch-P1', '--priority=P1'], { cwd: bp });
        await dwait(() => p1Msgs('Branch-P1').length, 'P1 auf dem Branch');
        git(['add', '-A'], bp); git(['commit', '-q', '-m', 'P1'], bp);
        git(['switch', '-q', 'main'], bp); await sleep(700);
        git(['switch', '-q', 'feature/x'], bp); await sleep(1200);
        expect(p1Msgs('Branch-P1').length === 1, `P1 nach Branch-Wechsel ${p1Msgs('Branch-P1').length}-mal gemeldet`);
        // ship: Während des Laufs keine Ereignisse; danach zählt der Vergleich mit dem Stand vor ship.
        const sid = nid(w(['new', '--type=chore', '--title=Ship-Probe'], { cwd: bp }).out);
        w(['set', sid, 'status=review'], { cwd: bp });
        const rv = await dwait(() => findMsg((e) => e.title === `${sid} im Review`), 'Review Ship-Probe');
        const emitB = (data) => w(['discord', 'emit', 'ship', `--json=${JSON.stringify({ id: sid, run: 'b1', ...data })}`], { cwd: bp, extraEnv: denv });
        emitB({ step: 'start' });
        // Erst weiter, wenn der Bot den Start verarbeitet hat (feste Pausen reichen auf langsamen Runnern nicht).
        await dwait(() => findMsg((e) => e.title === `${sid} wird ausgeliefert`), 'ship-Start verarbeitet');
        w(['done', sid, '--confirm', '--force', '--reason=Selbsttest'], { cwd: bp });
        w(['new', '--type=bug', '--title=Während-ship', '--priority=P1'], { cwd: bp });
        await sleep(800);
        expect(!p1Msgs('Während-ship').length, 'Ereignis während ship gemeldet');
        // Nach dem Push sind die Git-Schritte vorbei: Der Bot taut auf, auch wenn ship noch auf die CI wartet.
        emitB({ step: 'push', sha: 'abc1234def' });
        await dwait(() => /angenommen/.test(fake.messages.get(rv.m.id).embeds[0].title || ''), 'Review nach dem Push angenommen');
        await dwait(() => p1Msgs('Während-ship').length, 'P1 aus der Zeit von ship nach dem Push gemeldet');
        emitB({ step: 'done' });
        await sleep(600);
        expect(p1Msgs('Während-ship').length === 1, 'P1 aus ship doppelt');
        expect(!findMsg((e) => e.title === `✓ ${sid} erledigt`), 'Ausgelieferte Aufgabe zusätzlich als erledigt gemeldet');
      }
      expect(!fs.readdirSync(ddir).some((f) => f.endsWith('.tmp')), 'Halbe Zwischendateien im Discord-Ordner');
      expect(!fake.problems.length, `Discord-Grenzen verletzt: ${JSON.stringify(fake.problems)}`);
    } finally {
      fake.forbidEdit = false;
      await wa(['discord', 'stop'], { extraEnv: denv, ok: false });
    }
  });

  await step('Discord: Befehle und Knöpfe nur für den Besitzer, Antworten nur für ihn (W-0037)', async () => {
    const ui = await import(pathToFileURL(path.join(HERE, 'discord-ui.mjs')).href);
    const { loadTasks } = await import('./lib.mjs');
    // Gemeinsames Modul: Befehle englisch mit deutscher Übersetzung, Dialoge zu Knöpfen, custom_id-Schema.
    const own = ui.commands()[0];
    expect(own.options.map((o) => o.name).join() === 'help,status,tasks,new,instruct', `Unterbefehle: ${own.options.map((o) => o.name)}`);
    expect(own.options.find((o) => o.name === 'tasks').name_localizations.de === 'aufgaben', 'Übersetzung fehlt');
    expect(ui.commands({ shared: true })[0].options.some((o) => o.name === 'link'), 'link fehlt beim gemeinsamen Bot');
    expect(JSON.stringify(ui.parseCid('w:acc:0123456789abcdef:W-0012')) === '{"act":"acc","rid":"0123456789abcdef","id":"W-0012"}', 'parseCid');
    expect(ui.parseCid('w:acc:../x:W-1') === null, 'parseCid nimmt Unsinn an');
    const md = ui.modalFor('w:ret:0123456789abcdef:W-0012', 'de');
    expect(md && md.custom_id === 'w:retm:0123456789abcdef:W-0012' && md.title.length <= 45, `Dialog Zurück: ${JSON.stringify(md)}`);
    expect(ui.modalFor('w:acc:0123456789abcdef:W-0012', 'de') === null, 'Annehmen öffnet einen Dialog');
    if (!hasWs) return; // Ohne Gateway kommen keine Interaktionen an.
    await wa(['discord', 'start'], { extraEnv: denv, ok: false });
    try {
      const cmds = await dwait(() => fake.guildCommands.get('1'), 'Befehle für Server 1 registriert');
      expect(cmds[0].name === 'works' && cmds[0].options.length === 5, `Befehle: ${JSON.stringify(cmds).slice(0, 200)}`);
      // w() blockiert diesen Prozess und damit das Fake-Gateway; der Bot verbindet sich dann neu, und ein Klick in
      // dieser Lücke geht verloren (echtes Discord liefert ihn nach). Kommt keine Eingangsbestätigung, noch einmal.
      const send = async (opts, what) => {
        for (let n = 1; ; n++) {
          const id = fake.interact(opts);
          try { await dwait(() => fake.callbacks.get(id), `${what}: Eingang`, 5000); return id; } catch (e) { if (n >= 3) throw e; }
        }
      };
      const ask = async (opts, what) => { const id = await send(opts, what); return dwait(() => fake.answerOf(id), what); };
      const task = (id) => loadTasks(proj).find((t) => t.id === id);
      // Hilfe: sofort, nur für dich, Befehle in der Sprache des Clients.
      let a = await ask({ sub: 'help' }, 'Antwort auf /works help');
      expect(a.type === 4 && a.data.flags & 64, `Hilfe nicht nur für dich: ${JSON.stringify(a).slice(0, 200)}`);
      has(JSON.stringify(a.data), '/works aufgaben', 'Hilfe auf Deutsch');
      has(JSON.stringify((await ask({ sub: 'help', locale: 'en-US' }, 'help in English')).data), '/works tasks', 'Hilfe auf Englisch');
      // Jemand anders: freundliche Absage, nichts passiert.
      const count = loadTasks(proj).length;
      a = await ask({ sub: 'new', user: '777', options: [{ name: 'title', value: 'Fremd' }, { name: 'priority', value: 'P3' }] }, 'Absage für Fremde');
      has(JSON.stringify(a.data), 'Nicht für dich'); expect(a.data.flags & 64, 'Absage für alle sichtbar');
      expect(loadTasks(proj).length === count, 'Fremder hat eine Aufgabe angelegt');
      // Neue Aufgabe vom Handy: erst vorläufig, dann das Ergebnis; Quelle discord, Verlauf mit [Discord].
      const P = { name: 'project', value: 'projekt' };
      const nid = await send({ sub: 'new', options: [{ name: 'title', value: 'Vom Handy notiert' }, { name: 'priority', value: 'P2' }, P] }, '/works neu');
      a = await dwait(() => fake.answerOf(nid), 'Antwort auf /works neu');
      expect(fake.callbacks.get(nid).type === 5 && fake.callbacks.get(nid).data.flags & 64, 'nicht vorläufig oder für alle sichtbar');
      const created = loadTasks(proj).find((t) => t.title === 'Vom Handy notiert');
      expect(created && created.priority === 'P2' && created.source === 'discord', `Aufgabe nicht wie erwartet: ${JSON.stringify(created ? { p: created.priority, s: created.source } : a)}`);
      has(JSON.stringify(a.data), created.id, 'ID in der Antwort');
      has(fs.readFileSync(created._file, 'utf8'), '[Discord]', 'Verlauf mit [Discord]');
      has(JSON.stringify((await ask({ sub: 'status' }, '/works status')).data), 'projekt', 'Status nennt das Projekt');
      has(JSON.stringify((await ask({ sub: 'tasks', options: [P] }, '/works aufgaben')).data), created.id, 'Aufgabenliste');
      // Anweisung an die Aufgabe in Arbeit.
      w(['start', created.id, '--force']);
      has(JSON.stringify((await ask({ sub: 'instruct', options: [{ name: 'text', value: 'Bitte zuerst die Tests.' }, P] }, '/works anweisung')).data), created.id, 'Anweisung an die Aufgabe in Arbeit');
      has(fs.readFileSync(path.join(proj, '.works', 'instructions.json'), 'utf8'), 'Bitte zuerst die Tests.', 'Anweisung gespeichert');
      // Review mit Knöpfen. Zurück an Claude öffnet einen Dialog, die Begründung landet als Kommentar.
      w(['set', created.id, 'status=review']);
      const rv = await dwait(() => findMsg((e) => e.title === `${created.id} im Review`), 'Review-Nachricht');
      const btns = rv.m.components.flatMap((r) => r.components);
      const acc = btns.find((b) => /^w:acc:/.test(b.custom_id || '')); const ret = btns.find((b) => /^w:ret:/.test(b.custom_id || ''));
      expect(acc && ret, `Knöpfe fehlen: ${JSON.stringify(btns)}`);
      has(JSON.stringify((await ask({ type: 3, customId: acc.custom_id, messageId: rv.m.id, user: '777' }, 'Absage für fremden Klick')).data), 'Nicht für dich');
      // Annehmen ohne erfüllte Definition of Done: Hinweis statt Abschluss.
      has(JSON.stringify((await ask({ type: 3, customId: acc.custom_id, messageId: rv.m.id }, 'Annehmen ohne DoD')).data), 'Definition of Done', 'Hinweis auf die DoD');
      expect(task(created.id).status === 'review', 'Trotz offener DoD abgeschlossen');
      const dlg = await ask({ type: 3, customId: ret.custom_id, messageId: rv.m.id }, 'Dialog Zurück an Claude');
      expect(dlg.type === 9 && dlg.data.custom_id === ret.custom_id.replace('w:ret:', 'w:retm:'), `Kein Dialog: ${JSON.stringify(dlg)}`);
      a = await ask({ type: 5, customId: dlg.data.custom_id, messageId: rv.m.id, fields: { text: 'Das Handy-Bild fehlt.' } }, 'Antwort aus dem Dialog');
      has(JSON.stringify(a.data), 'Claude', 'Bestätigung');
      expect(task(created.id).status === 'in-arbeit', 'Aufgabe nicht zurück in Arbeit');
      has(fs.readFileSync(path.join(task(created.id)._dir, 'comments.md'), 'utf8'), 'Das Handy-Bild fehlt.', 'Begründung als Kommentar');
      await dwait(() => !fake.messages.get(rv.m.id).components.length, 'Knöpfe nach der Rückgabe weg');
      // Annehmen mit erfüllter DoD: erledigt, die Review-Nachricht wird grün und verliert die Knöpfe.
      const pid = (w(['new', '--type=chore', '--title=Abnahme-Probe', '--criteria=Geprüft']).out.match(/W-\d+/) || [])[0];
      w(['check', pid, '1', '--section=Akzeptanzkriterien']); w(['set', pid, 'status=review']);
      const rv2 = await dwait(() => findMsg((e) => e.title === `${pid} im Review`), 'Review-Nachricht 2');
      const acc2 = rv2.m.components.flatMap((r) => r.components).find((b) => /^w:acc:/.test(b.custom_id || ''));
      has(JSON.stringify((await ask({ type: 3, customId: acc2.custom_id, messageId: rv2.m.id }, 'Annehmen')).data), 'angenommen');
      expect(task(pid).status === 'erledigt', `Nicht erledigt: ${task(pid).status}`);
      await dwait(() => /angenommen/.test(fake.messages.get(rv2.m.id).embeds[0].title || '') && !fake.messages.get(rv2.m.id).components.length, 'Review-Nachricht angenommen, ohne Knöpfe');
      // Fertig und wartet: Knopf Anweisung an Claude öffnet einen Dialog für die aktive Aufgabe.
      w(['start', created.id, '--force']);
      hook('prompt-submit.mjs', { cwd: proj, session_id: 's-k', prompt: 'los' }); hook('stop-reminder.mjs', { cwd: proj, session_id: 's-k' });
      const fin = await dwait(() => findMsg((e, m) => e.title === 'Claude ist fertig und wartet auf dich' && m.components.length), 'Fertig-Nachricht mit Knopf');
      const ins = fin.m.components.flatMap((r) => r.components).find((b) => /^w:ins:/.test(b.custom_id || ''));
      const dlg2 = await ask({ type: 3, customId: ins.custom_id, messageId: fin.m.id }, 'Dialog Anweisung');
      expect(dlg2.type === 9, 'Anweisung ohne Dialog');
      has(JSON.stringify((await ask({ type: 5, customId: dlg2.data.custom_id, messageId: fin.m.id, fields: { text: 'Mach mit dem Board weiter.' } }, 'Anweisung aus dem Dialog')).data), created.id);
      has(fs.readFileSync(path.join(proj, '.works', 'instructions.json'), 'utf8'), 'Mach mit dem Board weiter.', 'Anweisung aus dem Dialog gespeichert');
      // CI rot mit Bug: Knopf Bug ansehen zeigt den Bug nur dir.
      const bug = (w(['new', '--type=bug', '--title=Test rot unter Windows', '--priority=P2']).out.match(/W-\d+/) || [])[0];
      w(['discord', 'emit', 'ci', `--json=${JSON.stringify({ ok: false, sha: 'c0ffee1234567', failed: 1, total: 3, bug })}`], { extraEnv: denv });
      const ci = await dwait(() => findMsg((e) => e.title === 'CI rot für c0ffee1'), 'CI-Nachricht mit Bug');
      const bb = ci.m.components.flatMap((r) => r.components).find((b) => /^w:bug:/.test(b.custom_id || ''));
      expect(bb, `Knopf Bug ansehen fehlt: ${JSON.stringify(ci.m.components)}`);
      has(JSON.stringify((await ask({ type: 3, customId: bb.custom_id, messageId: ci.m.id }, 'Bug ansehen')).data), 'Test rot unter Windows');
      expect(!fake.problems.length, `Discord-Grenzen verletzt: ${JSON.stringify(fake.problems)}`);
      expect(!fs.readFileSync(path.join(ddir, 'bot.log'), 'utf8').includes('itok-'), 'Interaktions-Token im Log');
    } finally { await wa(['discord', 'stop'], { extraEnv: denv, ok: false }); }
  });

  await step('Discord: Dashboard nach D3 mit Bild und Knöpfen, Status des Bots, der Kanal räumt sich auf (W-0044)', async () => {
    const img = await import(pathToFileURL(path.join(HERE, 'discord-image.mjs')).href);
    const { loadTasks } = await import('./lib.mjs');
    // Bild: jedes Zeichen der Pixelschrift 5x7, gültiges PNG, gleiche Daten ergeben dasselbe Bild.
    for (const [ch, g] of Object.entries(img.GLYPHS)) expect(g.length === 35, `Zeichen ${ch} hat ${g.length} Punkte`);
    const data = { projects: [{ name: 'projekt', done: 3, wip: 1, open: 2, color: 0x8e8cf7 }], days: [{ label: 'MO', counts: [2] }] };
    const png = img.dashboardPng(data);
    expect(png.subarray(1, 4).toString() === 'PNG' && png.length < 100 * 1024, `kein kleines PNG (${png.length} Bytes)`);
    expect(Buffer.compare(png, img.dashboardPng(data)) === 0, 'Bild nicht gleich bei gleichen Daten');
    // Ohne Prozess: Aufräumen löscht eine Nachricht je Durchgang (der gemeinsame Bot erlaubt 60 in der Minute),
    // der Status nennt das zuletzt wartende Projekt, die Zeile nennt bei einer Freigabe die Aufgabe.
    const botM = await import(pathToFileURL(path.join(HERE, 'discord-bot.mjs')).href);
    const uiM = await import(pathToFileURL(path.join(HERE, 'discord-ui.mjs')).href);
    let dels = 0;
    const b = new botM.Bot({ rest: { del: async () => { dels++; } }, log: () => {} });
    const old = new Date(Date.now() - 3 * 86400000).toISOString();
    b.state.msgs = { a: { channel_id: '11', message_id: '1', at: old, done: 1 }, b: { channel_id: '11', message_id: '2', at: old, done: 1 }, c: { channel_id: '11', message_id: '3', at: old, done: 1 } };
    b.state.queue = []; b.state.open = {};
    await b.cleanup(botM.normalizeConfig({}));
    expect(dels === 1, `${dels} Löschungen in einem Durchgang`);
    const snapOf = (name, since) => ({ root: 'x', name, snap: { name, tasks: {}, perm: { since, tool: 'Bash' }, perms: [], busy: true, active: { id: 'W-9', title: 'Probe' } } });
    b.state.projects = { r1: snapOf('alt', '2026-01-01T10:00:00.000Z'), r2: snapOf('neu', '2026-06-01T10:00:00.000Z') };
    expect(b.statusLine(botM.normalizeConfig({})) === 'neu wartet auf deine Freigabe', `Status: ${b.statusLine(botM.normalizeConfig({}))}`);
    expect(botM.stateOf(b.state.projects.r1.snap, botM.normalizeConfig({}), (de) => de)[1].includes('W-9'), 'Freigabe ohne Aufgabe');
    expect(uiM.modalFor('w:ins::', 'de').components.length === 2 && uiM.modalFor('w:ins:0123456789abcdef:W-1', 'de').components.length === 1, 'Dialog Anweisung ohne Projektfeld');
    // Ein früherer Schritt lässt ein Dashboard zurück, das der Bot nach 403 (fremde Anwendung) nicht mehr anfassen darf.
    const dashCount = Math.max(1, fake.inChannel('11').filter((m) => isDash(m.embeds[0])).length);
    await wa(['discord', 'start'], { extraEnv: denv, ok: false });
    try {
      // Eine angeheftete Nachricht mit Bild, still; keine Statusposts je Projekt mehr.
      const d = await dwait(() => { const x = dashOf('projekt'); return x && x.m.pinned && x.m.attachments.length ? x : null; }, 'Dashboard mit Bild');
      const file = d.m.attachments.find((a) => a.filename === 'works.png');
      expect(file && file.data.subarray(1, 4).toString() === 'PNG', 'Bild fehlt oder ist kein PNG');
      expect(d.e.image && d.e.image.url === 'attachment://works.png', 'Bild steht nicht im Dashboard');
      expect(fake.inChannel('11').filter((m) => isDash(m.embeds[0])).length === dashCount, 'Dashboard doppelt');
      expect(!fake.inChannel('11').some((m) => / · Stand$/.test(((m.embeds[0] || {}).author || {}).name || '')), 'alter Statuspost steht noch');
      const comps = d.m.components.flatMap((r) => r.components);
      // Ohne Gateway (Node unter 22) kämen Klicks nicht an: dann keine Knöpfe, alles andere wie sonst (W-0045).
      if (!hasWs) expect(!comps.length, `Knöpfe ohne Gateway: ${JSON.stringify(comps).slice(0, 200)}`);
      if (hasWs) {
        const sel = comps.find((c) => c.type === 3);
        expect(sel && sel.custom_id === 'w:proj::' && sel.options.some((o) => o.label === 'projekt'), `Auswahlmenü fehlt: ${JSON.stringify(comps).slice(0, 300)}`);
        for (const id of ['w:queue::', 'w:ins::', 'w:new::', 'w:help::']) expect(comps.some((c) => c.custom_id === id), `Knopf ${id} fehlt`);
        const send = async (opts, what) => {
          for (let n = 1; ; n++) {
            const id = fake.interact(opts);
            try { await dwait(() => fake.callbacks.get(id), `${what}: Eingang`, 5000); return id; } catch (e) { if (n >= 3) throw e; }
          }
        };
        const ask = async (opts, what) => { const id = await send(opts, what); return dwait(() => fake.answerOf(id), what); };
        // Projekt wählen: Details nur für dich, mit Knöpfen; Aufgaben daraus.
        let a = await ask({ type: 3, customId: 'w:proj::', messageId: d.m.id, values: [sel.options.find((o) => o.label === 'projekt').value] }, 'Projekt wählen');
        has(JSON.stringify(a.data), 'projekt', 'Details zum Projekt');
        const tb = (a.data.components || []).flatMap((r) => r.components).find((c) => /^w:tasks:/.test(c.custom_id || ''));
        expect(tb, `Knopf Aufgaben in den Details fehlt: ${JSON.stringify(a.data.components)}`);
        has(JSON.stringify((await ask({ type: 3, customId: tb.custom_id, messageId: a.data.id }, 'Aufgaben aus den Details')).data), 'offen');
        has(JSON.stringify((await ask({ type: 3, customId: 'w:queue::', messageId: d.m.id }, 'Warteschlange')).data), 'Warteschlange');
        a = await ask({ type: 3, customId: 'w:help::', messageId: d.m.id }, 'Hilfe');
        expect(a.type === 4, 'Hilfe nicht sofort'); has(JSON.stringify(a.data), '/works');
        // Neue Aufgabe aus dem Dashboard: Dialog mit Titel, Priorität und Projekt.
        const nd = await ask({ type: 3, customId: 'w:new::', messageId: d.m.id }, 'Dialog Neue Aufgabe');
        expect(nd.type === 9 && nd.data.components.length === 3, `Dialog ohne Projektfeld: ${JSON.stringify(nd.data && nd.data.components)}`);
        has(JSON.stringify((await ask({ type: 5, customId: nd.data.custom_id, messageId: d.m.id, fields: { title: 'Aus dem Dashboard', priority: 'p3', project: 'projekt' } }, 'Neue Aufgabe aus dem Dashboard')).data), 'angelegt');
        expect(loadTasks(proj).some((t) => t.title === 'Aus dem Dashboard' && t.priority === 'P3'), 'Aufgabe aus dem Dashboard fehlt');
        // Status des Bots: was gerade wichtig ist.
        hook('permission.mjs', { cwd: proj, session_id: 's-p', tool_name: 'Bash', tool_input: { command: 'ls' } });
        await dwait(() => /projekt wartet auf deine Freigabe/.test(JSON.stringify(fake.gateway.presence || {})), 'Status des Bots bei einer Freigabe');
        hook('stop-reminder.mjs', { cwd: proj, session_id: 's-p' });
      }
      // Aufräumen mit kurzer Frist: Infos verschwinden, Offenes bleibt bis zur Erledigung, das Dashboard bleibt.
      await wa(['discord', 'set', 'cleanup.hours=0.0005'], { extraEnv: denv });
      w(['discord', 'emit', 'report', `--json=${JSON.stringify({ title: 'Kurzlebig', summary: 'weg damit' })}`], { extraEnv: denv });
      const info = await dwait(() => findMsg((e) => e.title === 'Kurzlebig'), 'Info-Nachricht');
      const rid = (w(['new', '--type=chore', '--title=Offen im Review', '--criteria=Ja']).out.match(/W-\d+/) || [])[0];
      w(['check', rid, '1', '--section=Akzeptanzkriterien']); w(['set', rid, 'status=review']);
      const rv = await dwait(() => findMsg((e) => e.title === `${rid} im Review`), 'offenes Review');
      await dwait(() => !fake.messages.has(info.m.id), 'Info-Nachricht nach der Frist gelöscht');
      await new Promise((res) => setTimeout(res, 2500));
      expect(fake.messages.has(rv.m.id), 'offenes Review gelöscht');
      w(['done', rid, '--confirm']);
      await dwait(() => !fake.messages.has(rv.m.id), 'Review nach der Erledigung gelöscht');
      expect(fake.messages.has(dashOf('projekt').m.id), 'Dashboard gelöscht');
      expect(!fake.problems.length, `Discord-Grenzen verletzt: ${JSON.stringify(fake.problems)}`);
    } finally {
      await wa(['discord', 'set', 'cleanup.hours=24'], { extraEnv: denv, ok: false });
      await wa(['discord', 'stop'], { extraEnv: denv, ok: false });
    }
  });

  await step('Discord: Start mit Board und Sitzung nur mit Einrichtung, Nachrichten passen in die Grenzen', async () => {
    const bot = await import(pathToFileURL(path.join(HERE, 'discord-bot.mjs')).href);
    const { embedProblems } = await import(fromUrl);
    const long = 'x'.repeat(5000);
    const snap = { name: long, tasks: [{ id: 'W-1', title: long, status: 'in-arbeit', crit: [1, 3] }], active: { id: 'W-1', title: long, crit: [1, 3], since: new Date().toISOString() }, queue: [{ id: 'W-2', title: long }], recent: Array.from({ length: 9 }, () => ({ at: new Date().toISOString(), text: long })), today: { done: 2, cost: '1,20 $' }, ci: null, perm: null };
    const cfg = bot.normalizeConfig({});
    for (const e of bot.renderStatus(snap, cfg).embeds) expect(!embedProblems(e).length, `Statuspost zu lang: ${embedProblems(e)}`);
    const ev = bot.renderEvent({ type: 'review', project: long, id: 'W-1', title: long, crit: [1, 3] }, cfg, { owner: '1' });
    for (const e of ev.embeds) expect(!embedProblems(e).length, `Ereignis zu lang: ${embedProblems(e)}`);
    // Voller Wochenbericht: alles zusammen unter 6000 Zeichen.
    const many = (f) => Array.from({ length: 40 }, (_, i) => f(i));
    const big = bot.renderEvent({ type: 'report_week', project: 'p', title: 'Woche', summary: 'y'.repeat(4000), lists: { Erledigt: many((i) => ({ id: `W-${i}`, title: 'z'.repeat(100) })), 'Braucht dich': many(() => 'q'.repeat(100)), 'Nächste Woche': many((i) => ({ id: `W-${i}`, title: 'n'.repeat(100) })) } }, cfg, {});
    expect(!embedProblems(big.embeds[0]).length, `Wochenbericht zu lang: ${embedProblems(big.embeds[0])}`);
    // Links in fremdem Text (Titel, etwa aus GitHub-Issues) werden nicht klickbar.
    const lk = bot.renderEvent({ type: 'p1', project: 'p', id: 'W-1', title: '[klick](https://evil.example)' }, cfg, {});
    expect(!/(^|[^\\])\[klick\]\(/.test(lk.embeds[0].description || ''), `Link nicht entschärft: ${lk.embeds[0].description}`);
    // Datenschutz: nur IDs, keine Kosten.
    const priv = bot.normalizeConfig({ privacy: { titles: false, costs: false } });
    const s2 = JSON.stringify(bot.renderStatus({ ...snap, name: 'p', active: { ...snap.active, title: 'Geheimer Titel' }, today: { done: 1, cost: '9,99 $' } }, priv));
    expect(!s2.includes('Geheimer Titel') && !s2.includes('9,99'), 'Titel oder Kosten trotz Datenschutz');
    // Ruhezeit über Mitternacht.
    const q = bot.normalizeConfig({ quiet: { on: true, from: '22:00', to: '07:00' } });
    expect(bot.isQuiet(q, new Date(2026, 0, 1, 23, 30)) && bot.isQuiet(q, new Date(2026, 0, 1, 6, 59)) && !bot.isQuiet(q, new Date(2026, 0, 1, 7, 0)), 'Ruhezeit falsch');
    const m = bot.renderEvent({ type: 'perm', project: 'p', id: 'W-1', tool: 'Bash' }, q, { owner: '1', now: new Date(2026, 0, 1, 23, 30) });
    expect(!m.content.includes('<@') && m.flags & 4096, 'Erwähnung in der Ruhezeit');
    // Ohne Einrichtung startet weder das Board noch der Sitzungsstart einen Bot.
    const home2 = path.join(base, 'home-ohne-discord'); fs.mkdirSync(home2, { recursive: true });
    const env2 = { HOME: home2, USERPROFILE: home2 };
    spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], { cwd: proj, env: { ...env, ...env2 }, input: JSON.stringify({ cwd: proj }), encoding: 'utf8', timeout: 20000, windowsHide: true });
    expect(!fs.existsSync(path.join(home2, '.works', 'discord', 'bot.pid')), 'Bot ohne Einrichtung gestartet');
    // Mit Einrichtung startet der Sitzungsstart den Bot.
    try {
      spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], { cwd: proj, env: { ...env, ...denv }, input: JSON.stringify({ cwd: proj }), encoding: 'utf8', timeout: 20000, windowsHide: true });
      await dwait(() => fs.existsSync(path.join(ddir, 'bot.pid')), 'Bot beim Sitzungsstart gestartet');
    } finally { await wa(['discord', 'stop'], { extraEnv: denv, ok: false }); }
    // Ab hier kein Autostart mehr: Spätere Schritte starten Boards, deren Bot sonst das echte Discord fragen würde.
    // Ereignisse landen weiter in der outbox (geprüft bei works ship).
    await wa(['discord', 'set', 'autostart=false'], { extraEnv: denv });
  });

  // Einstellungen im Board (W-0038): eine Kategorie mit Kanal und ein Kanal, in dem der Bot nicht senden darf.
  const g1 = fake.guilds[0];
  if (!g1.channels.some((c) => c.id === '14')) {
    g1.channels.push({ id: '14', name: 'Projekte', type: 4, position: 3 }, { id: '15', name: 'dev', type: 0, position: 0, parent_id: '14' },
      { id: '16', name: 'regeln', type: 0, position: 4, permission_overwrites: [{ id: g1.id, type: 0, allow: '0', deny: String(1n << 11n) }] });
  }
  const boardFor = async () => {
    if (!fs.existsSync(path.join(proj, '.works', 'config.json'))) w(['init']);
    const port = await highPort();
    w(['board', '--serve', '--detach', `--port=${port}`], { extraEnv: denv });
    const url = `http://127.0.0.1:${port}`;
    const token = ((await (await fetch(url + '/')).text()).match(/"token":"([a-f0-9]{20,})"/) || [])[1];
    const call = async (m, p, body, ok = true) => {
      const r = await fetch(url + p, { method: m, headers: { 'X-Works-Token': token, 'Content-Type': 'application/json', Connection: 'close' }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (ok && !r.ok) throw new Error(`${m} ${p} ${body ? body.op : ''}: ${j.error}`);
      return { status: r.status, ...j };
    };
    return { url, token, call };
  };
  const dashIn = (ch) => fake.inChannel(ch).filter((m) => isDash(m.embeds[0]) && m.pinned).pop();
  const botPid = () => { try { return JSON.parse(fs.readFileSync(path.join(ddir, 'bot.pid'), 'utf8')).pid; } catch { return 0; } };

  await step('Discord: Einstellungen im Board über die API, Kanal live wählen, Dashboard ohne Neustart verschieben (W-0038)', async () => {
    const { url, call } = await boardFor();
    try {
      expect((await fetch(url + '/api/discord')).status === 403, '/api/discord ohne Token');
      // Neu einrichten über das Board: falsches Token abgelehnt, das richtige nie zurückgegeben, nur maskiert.
      await call('POST', '/api/discord', { op: 'disconnect' });
      let s = await call('GET', '/api/discord');
      expect(!s.ready && !s.secret, `nach dem Trennen noch eingerichtet: ${JSON.stringify(s).slice(0, 200)}`);
      let r = await call('POST', '/api/discord', { op: 'token', token: 'falsch' }, false);
      expect(r.status === 400 && /ungültig/.test(r.error), `falsches Token: ${r.status} ${r.error}`);
      r = await call('POST', '/api/discord', { op: 'token', token: DTOKEN });
      has(r.invite_url, 'client_id=1000', 'Einladungslink');
      s = await call('GET', '/api/discord');
      expect(s.mode === 'own' && s.secret === `…${DTOKEN.slice(-4)}` && s.bot_name === 'works#4821', `Stand nach dem Token: ${JSON.stringify(s).slice(0, 300)}`);
      for (const x of [r, s]) expect(!JSON.stringify(x).includes(DTOKEN), 'Token in einer Antwort');
      expect(s.events.length === 4 && s.events[0].items.some((e) => e.key === 'perm' && e.at), 'Ereignisse fehlen');
      expect(s.commands.some((c) => c.cmd === '/works status'), `Befehle fehlen: ${JSON.stringify(s.commands)}`);
      const here = s.projects.find((p) => p.here);
      expect(here && here.name === 'projekt', `Projekt fehlt: ${JSON.stringify(s.projects)}`);
      // Kanäle live vom Bot: nach Kategorie, ohne Schreibrecht ausgegraut mit Grund, keine Sprachkanäle und Kategorien.
      const ch = await call('GET', '/api/discord/channels');
      const list = ch.guilds[0].channels;
      expect(ch.guilds[0].name === 'Mein Server' && list.find((c) => c.id === '15').category === 'Projekte', `Kategorie fehlt: ${JSON.stringify(list)}`);
      const reg = list.find((c) => c.id === '16');
      expect(reg && !reg.can && /senden/.test(reg.why), `#regeln nicht ausgegraut: ${JSON.stringify(reg)}`);
      expect(!list.some((c) => c.id === '13' || c.id === '14') && list.find((c) => c.id === '11').can, `Kanalliste: ${JSON.stringify(list)}`);
      r = await call('POST', '/api/discord', { op: 'move', channel_id: '16' }, false);
      expect(r.status === 400 && /senden/.test(r.error), `Kanal ohne Schreibrecht angenommen: ${r.status} ${r.error}`);
      await call('POST', '/api/discord', { op: 'move', channel_id: '11' });
      expect((await call('GET', '/api/discord')).ready && dcfg().channel_id === '11', 'nach der Kanalwahl nicht eingerichtet');
      // Einstellungen über applySetting, falsche Werte abgelehnt, ohne dass etwas halb gespeichert wird.
      await call('POST', '/api/discord', { op: 'set', values: { 'event.ci_red.at': 'an', 'privacy.costs': 'aus', 'cleanup.hours': '12' } });
      expect(dcfg().events.ci_red.at === true && dcfg().privacy.costs === false && dcfg().cleanup.hours === 12, 'Einstellungen nicht gespeichert');
      r = await call('POST', '/api/discord', { op: 'set', values: { 'privacy.costs': 'an', 'quiet.from': '25:00' } }, false);
      expect(r.status === 400 && dcfg().privacy.costs === false, `ungültige Uhrzeit: ${r.status}, costs ${dcfg().privacy.costs}`);
      await call('POST', '/api/discord', { op: 'set', values: { [`project.${here.rid}`]: 'aus' } });
      expect(dcfg().projects[here.rid].enabled === false, 'Projekt nicht abgeschaltet');
      await call('POST', '/api/discord', { op: 'set', values: { [`project.${here.rid}`]: 'an', 'event.ci_red.at': 'aus', 'privacy.costs': 'an', 'cleanup.hours': '24', 'delay.perm': '0', 'delay.idle': '0', 'quiet.on': 'aus' } });
      // Vorschau mit dem ungespeicherten Stand: Erwähnung nur mit @, ohne @ still.
      let pv = await call('POST', '/api/discord', { op: 'preview', type: 'perm' });
      expect(pv.ring && /<@4242>/.test(pv.content) && pv.embeds[0].title === 'Wartet auf deine Freigabe', `Vorschau Freigabe: ${JSON.stringify(pv).slice(0, 300)}`);
      pv = await call('POST', '/api/discord', { op: 'preview', type: 'perm', draft: { 'event.perm.at': 'aus' } });
      expect(!pv.ring && /still/.test(pv.why), `Vorschau ohne @: ${JSON.stringify(pv).slice(0, 300)}`);
      pv = await call('POST', '/api/discord', { op: 'preview', type: 'dashboard' });
      expect(isDash(pv.embeds[0]) && !pv.ring, `Vorschau Dashboard: ${JSON.stringify(pv).slice(0, 300)}`);
      // Kanal wechseln, während der Bot läuft: Dashboard im neuen Kanal, das alte weg, derselbe Prozess.
      await wa(['discord', 'start'], { extraEnv: denv, ok: false });
      const d11 = await dwait(() => dashIn('11'), 'Dashboard in #works');
      const pid = botPid();
      r = await call('POST', '/api/discord', { op: 'move', channel_id: '15' });
      expect(r.channel_name === 'dev' && dcfg().channel_id === '15', `Umzug: ${JSON.stringify(r)}`);
      await dwait(() => dashIn('15'), 'Dashboard in #dev');
      await dwait(() => !fake.messages.has(d11.id), 'altes Dashboard gelöscht');
      expect(botPid() === pid, 'Bot für den Kanalwechsel neu gestartet');
      s = await call('GET', '/api/discord');
      expect(s.channel_name === 'dev' && s.running, `Stand nach dem Umzug: ${JSON.stringify(s).slice(0, 200)}`);
      await call('POST', '/api/discord', { op: 'move', channel_id: '11' });
      await dwait(() => dashIn('11') && !fake.inChannel('15').some((m) => isDash(m.embeds[0])), 'Dashboard zurück in #works');
      expect(!fs.readFileSync(path.join(ddir, 'bot.log'), 'utf8').includes(DTOKEN), 'Token im Log');
      expect(!fake.problems.length, `Discord-Grenzen verletzt: ${JSON.stringify(fake.problems)}`);
    } finally {
      await wa(['discord', 'stop'], { extraEnv: denv, ok: false });
      w(['board', '--stop'], { ok: false });
    }
  });

  if (browser) {
    await step('Discord: Dialog Discord-Bot im Browser mit Reitern, Vorschau, Kanalwahl und Einrichtung (W-0038)', async () => {
      const br = await launchChromium(log);
      if (!br) return;
      const { url, call } = await boardFor();
      try {
        if (!(await call('GET', '/api/discord')).ready) { await call('POST', '/api/discord', { op: 'token', token: DTOKEN }); await call('POST', '/api/discord', { op: 'move', channel_id: '11' }); }
        const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
        const errs = [];
        p.on('pageerror', (e) => errs.push(e.message));
        const noSecret = async (what) => {
          const leak = await p.evaluate((t) => document.documentElement.outerHTML.includes(t) || [...document.querySelectorAll('input')].some((i) => i.value.includes(t)), DTOKEN);
          expect(!leak, `Token im DOM (${what})`);
        };
        const open = async () => {
          await p.goto(url + '/'); await p.waitForSelector('.card');
          await p.click('#btnTools'); await p.waitForSelector('#btnDiscord');
          await p.click('#btnDiscord'); await p.waitForSelector('dialog[open] .dc');
        };
        await open();
        const tabs = await p.$$eval('dialog[open] .dc-tabs [role="tab"]', (b) => b.map((x) => x.textContent.trim()));
        for (const t of ['Verbindung', 'Projekte', 'Ereignisse', 'Befehle', 'Datenschutz']) expect(tabs.some((x) => x.startsWith(t)), `Reiter ${t} fehlt: ${tabs.join(', ')}`);
        has(await p.textContent('dialog[open] .dc-side'), 'Vorschau', 'Vorschau');
        has(await p.textContent('dialog[open] .dc-main'), `…${DTOKEN.slice(-4)}`, 'maskiertes Token');
        await noSecret('verbunden');
        // Kanalwahl: Kategorie, #regeln ausgegraut mit Grund, Verschieben nach #dev und zurück.
        await p.waitForSelector('dialog[open] input[name="dcch"][value="15"]');
        expect(await p.isDisabled('dialog[open] input[name="dcch"][value="16"]'), '#regeln wählbar');
        has(await p.textContent('dialog[open] .dc-list'), 'darf nicht senden', 'Grund bei #regeln');
        has(await p.textContent('dialog[open] .dc-list'), 'Projekte', 'Kategorie');
        await p.check('dialog[open] input[name="dcch"][value="15"]');
        await p.click('dialog[open] #dcMove');
        await dwait(() => dcfg().channel_id === '15', 'Kanal #dev gespeichert', 10000);
        await p.waitForFunction(() => /#dev/.test(document.querySelector('dialog[open] .dc-head small').textContent));
        await call('POST', '/api/discord', { op: 'move', channel_id: '11' });
        // Ereignisse: @ bei CI rot an, die Vorschau folgt dem ungespeicherten Stand, Speichern schreibt config.json.
        await p.click('dialog[open] [data-dc-tab="ereignisse"]');
        await p.click('dialog[open] [data-k="event.ci_red.at"]');
        has(await p.textContent('dialog[open] .dc-dirty'), '1 Änderung', 'Zähler ungespeichert');
        await p.selectOption('dialog[open] #dcPv', 'ci_red');
        await p.waitForFunction(() => /Klingelt/.test(document.querySelector('dialog[open] .dc-cap').textContent));
        await p.click('dialog[open] [data-k="event.ci_red.at"]');
        await p.waitForFunction(() => /still/.test(document.querySelector('dialog[open] .dc-cap').textContent));
        await p.click('dialog[open] [data-dc-tab="datenschutz"]');
        await p.locator('dialog[open] [data-k="privacy.titles"]').setChecked(false, { force: true });
        has(await p.textContent('dialog[open] .dc-dirty'), '1 Änderung', 'Zähler nach Hin und Zurück');
        await p.click('dialog[open] button[value="save"]');
        await dwait(() => dcfg().privacy.titles === false, 'Datenschutz gespeichert', 10000);
        await call('POST', '/api/discord', { op: 'set', values: { 'privacy.titles': 'an' } });
        await p.click('dialog[open] [data-dc-tab="befehle"]');
        has(await p.textContent('dialog[open] .dc-main'), '/works status', 'Befehle');
        // Handy: der Dialog füllt die Breite, nichts ragt heraus.
        await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200);
        const over = await p.evaluate(() => { const d = document.querySelector('dialog[open]'); return d.scrollWidth - d.clientWidth; });
        expect(over <= 1, `Dialog auf 390 px ${over} px zu breit`);
        await p.setViewportSize({ width: 1280, height: 900 });
        // Erstes Mal: Wahl nach R, eigener Bot mit Token (Passwortfeld, danach leer), dann verbunden.
        await call('POST', '/api/discord', { op: 'disconnect' });
        await open();
        await p.waitForSelector('dialog[open] [data-dc-path="shared"]');
        await p.click('dialog[open] [data-dc-path="own"]');
        expect(await p.getAttribute('dialog[open] #dcToken', 'type') === 'password', 'Token-Feld ist kein Passwortfeld');
        await p.fill('dialog[open] #dcToken', DTOKEN);
        await p.click('dialog[open] #dcTokenGo');
        await p.waitForSelector('dialog[open] .dc-conn', { timeout: 15000 });
        await noSecret('nach dem Speichern');
        expect(JSON.parse(fs.readFileSync(path.join(ddir, 'secret.json'), 'utf8')).token === DTOKEN, 'Token aus dem Board nicht gespeichert');
        expect(!errs.length, `Fehler auf der Seite: ${errs.join(' | ')}`);
      } finally {
        await br.close();
        await wa(['discord', 'stop'], { extraEnv: denv, ok: false });
        w(['board', '--stop'], { ok: false });
      }
    });
  }
  await wa(['discord', 'stop'], { extraEnv: denv, ok: false }).catch(() => {});
  await fake.close();

  // works ship (W-0026): Abschluss in einem Rutsch. Eigenes Projekt mit einem lokalen Remote.
  if (hasGit) {
    await step('works ship: anhalten bei offenen Punkten, sonst mergen, abschließen, pushen', async () => {
      const remote = path.join(base, 'ship-remote.git');
      const sp = path.join(base, 'ship');
      fs.mkdirSync(sp);
      git(['init', '-q', '--bare', remote], base);
      git(['init', '-q'], sp); git(['symbolic-ref', 'HEAD', 'refs/heads/main'], sp);
      w(['init'], { cwd: sp });
      fs.writeFileSync(path.join(sp, 'app.txt'), 'eins\n');
      git(['add', '-A'], sp); git(['commit', '-q', '-m', 'Start'], sp);
      git(['remote', 'add', 'origin', remote], sp); git(['push', '-q', '-u', 'origin', 'main'], sp);
      const id = (w(['new', '--type=chore', '--title=Ship-Test', '--priority=P3'], { cwd: sp }).out.match(/W-\d+/) || [])[0];
      // time.jsonl ist wie in echten Projekten im Git; ship setzt sie zurück und muss neue Zeilen behalten.
      fs.appendFileSync(path.join(sp, '.works', 'time.jsonl'), JSON.stringify({ t: new Date().toISOString(), ev: 'turn', task: id, marke: 'alt' }) + '\n');
      git(['add', '-A'], sp); git(['commit', '-q', '-m', `works: ${id} angelegt`], sp);
      git(['switch', '-q', '-c', 'feature/ship-test'], sp);
      w(['start', id], { cwd: sp });
      fs.appendFileSync(path.join(sp, 'app.txt'), 'zwei\n');
      git(['add', 'app.txt'], sp); git(['commit', '-q', '-m', `feat(${id}): zwei`], sp);
      const tdir = path.join(sp, '.works', 'tasks', fs.readdirSync(path.join(sp, '.works', 'tasks')).find((d) => d.startsWith(id)));
      const tf = path.join(tdir, 'task.md');
      const branchNow = () => git(['rev-parse', '--abbrev-ref', 'HEAD'], sp);
      // Offene Kriterien: ship hält vor dem Merge an, nichts wird gepusht.
      const r1 = w(['ship', id], { cwd: sp, ok: false });
      expect(r1.code !== 0 && /Definition of Done/.test(r1.out + r1.err), `ship trotz offener Kriterien: ${r1.code} ${(r1.out + r1.err).slice(0, 300)}`);
      expect(branchNow() === 'feature/ship-test', `ship hat den Branch gewechselt: ${branchNow()}`);
      // Alle Punkte erledigt, aber eine nicht committete Code-Änderung: ship hält an.
      fs.writeFileSync(tf, fs.readFileSync(tf, 'utf8').replace(/^- \[ \] ?$/gm, '- [x] erledigt').replace(/^- \[ \] (.+)$/gm, '- [x] $1'));
      git(['add', '-A'], sp); git(['commit', '-q', '-m', `works: ${id} Kriterien`], sp);
      fs.appendFileSync(path.join(sp, 'app.txt'), 'drei\n');
      fs.writeFileSync(path.join(sp, 'neu.txt'), 'vergessen\n');
      const r2 = w(['ship', id], { cwd: sp, ok: false });
      expect(r2.code !== 0 && /app\.txt/.test(r2.out + r2.err) && /neu\.txt/.test(r2.out + r2.err), `ship trotz nicht committeter oder neuer Datei: ${r2.code} ${(r2.out + r2.err).slice(0, 300)}`);
      git(['checkout', '--', 'app.txt'], sp); fs.rmSync(path.join(sp, 'neu.txt'));
      // Bricht ship nach dem Stoppen des Boards ab (Remote nicht erreichbar), läuft das Board wieder auf demselben Port.
      const bport = portOf(w(['board', '--serve', '--detach', `--port=${await highPort()}`], { cwd: sp }).out);
      const boardPort = () => { const sj = path.join(sp, '.works', 'server.json'); return fs.existsSync(sj) ? String(JSON.parse(fs.readFileSync(sj, 'utf8')).port) : ''; };
      git(['remote', 'set-url', 'origin', path.join(base, 'gibt-es-nicht.git')], sp);
      const rb = w(['ship', id], { cwd: sp, ok: false });
      git(['remote', 'set-url', 'origin', remote], sp);
      expect(rb.code !== 0 && branchNow() === 'feature/ship-test', `ship ohne erreichbaren Remote: ${rb.code} auf ${branchNow()}: ${(rb.out + rb.err).slice(0, 300)}`);
      await waitFor(async () => boardPort() === bport, `Board nach Abbruch wieder auf Port ${bport}`);
      // Liegengebliebene Datei: Unter Windows kann ein Virenscanner frisch geschriebene Dateien kurz sperren, dann löscht
      // git switch sie nicht und der Merge scheitert an "untracked files would be overwritten". Der Hook stellt das nach.
      const tdirRel = path.relative(sp, tdir).split(path.sep).join('/');
      fs.writeFileSync(path.join(tdir, 'anhang.txt'), 'Anhang nur im Branch\n');
      git(['add', '-A'], sp); git(['commit', '-q', '-m', `works: ${id} Anhang`], sp);
      fs.copyFileSync(path.join(tdir, 'anhang.txt'), path.join(base, 'anhang-kopie.txt'));
      const hookPath = path.join(sp, '.git', 'hooks', 'post-checkout');
      fs.writeFileSync(hookPath, `#!/bin/sh\n[ "$3" = 1 ] || exit 0\n[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || exit 0\n[ -f "${tdirRel}/anhang.txt" ] && exit 0\nmkdir -p "${tdirRel}" && cp "${path.join(base, 'anhang-kopie.txt').split(path.sep).join('/')}" "${tdirRel}/anhang.txt"\nexit 0\n`);
      fs.chmodSync(hookPath, 0o755);
      // Neue Zeiten in time.jsonl, noch nicht committet: Sie müssen nach dem Abschluss erhalten bleiben.
      fs.appendFileSync(path.join(sp, '.works', 'time.jsonl'), JSON.stringify({ t: new Date().toISOString(), ev: 'turn', task: id, marke: 'ship-zeit' }) + '\n');
      const r3 = w(['ship', id], { cwd: sp, ok: false });
      expect(r3.code === 0, `ship → Exit ${r3.code}: ${(r3.out + r3.err).slice(0, 500)}`);
      expect(branchNow() === 'main', `Nach ship nicht auf main, sondern ${branchNow()}`);
      has(git(['log', '--merges', '--format=%s', '-1'], sp), "Merge branch 'feature/ship-test'", 'Merge-Commit');
      expect(!git(['branch', '--list', 'feature/ship-test'], sp), 'Feature-Branch nicht gelöscht');
      has(w(['show', id], { cwd: sp }).out, 'erledigt', 'Status nach ship');
      expect(git(['rev-parse', 'main'], remote) === git(['rev-parse', 'HEAD'], sp), 'Remote steht nicht auf dem lokalen Stand');
      expect(!git(['status', '--porcelain', '--untracked-files=no'], sp).split('\n').some((l) => /time\.jsonl|WORKS\.md/.test(l) === false && l.trim()), `Nach ship bleiben Änderungen: ${git(['status', '--porcelain'], sp)}`);
      const marks = fs.readFileSync(path.join(sp, '.works', 'time.jsonl'), 'utf8').split('ship-zeit').length - 1;
      expect(marks === 1, `Neue Zeile in time.jsonl ${marks}-mal statt einmal`);
      has(r3.out, 'CI', 'ship nennt den CI-Schritt');
      // Discord-Bot (W-0036): ship meldet Beginn und Ende als Ereignisse, auch wenn der Bot gerade nicht läuft.
      if (fs.existsSync(path.join(ddir, 'secret.json'))) {
        const ob = path.join(ddir, 'outbox');
        const evs = (fs.existsSync(ob) ? fs.readdirSync(ob) : []).map((f) => JSON.parse(fs.readFileSync(path.join(ob, f), 'utf8'))).filter((e) => e.type === 'ship' && e.data.id === id);
        expect(evs.some((e) => e.data.step === 'start') && evs.some((e) => e.data.step === 'done'), `ship meldet sich nicht beim Discord-Bot: ${JSON.stringify(evs.map((e) => e.data.step))}`);
      }
      await waitFor(async () => boardPort() === bport, `Board nach ship wieder auf Port ${bport}`);
      w(['board', '--stop'], { cwd: sp, ok: false });
    });
  } else {
    skip('works ship', 'Git fehlt');
  }

  const failed = results.filter((r) => !r.ok);
  log(`\n${results.length - failed.length} von ${results.length} Prüfungen bestanden${failed.length ? `, ${failed.length} fehlgeschlagen` : ''}.`);
  if (!keep) { try { cleanupWorktrees(proj); fs.rmSync(base, { recursive: true, force: true }); } catch { /* Windows hält Dateien manchmal kurz fest */ } }
  else log(`Testprojekt bleibt erhalten: ${proj}`);
  return { ok: !failed.length, results };
}

function cleanupWorktrees(proj) { spawnSync('git', ['worktree', 'prune'], { cwd: proj }); }

// Feste freie Ports weit über 4747: Auf 4747 und folgenden können echte Board-Tabs des Nutzers hängen,
// die sich nach dem Ende ihres Boards alle 2 s neu verbinden und dann als offener Tab zählen würden.
async function highPort() { for (let p = 48200 + Math.floor(Math.random() * 300); p < 48600; p++) if (await free(p)) return p; throw new Error('Kein freier Port'); }

function free(port) {
  return import('node:net').then(({ default: net }) => new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  }));
}

// GitHub-Annotation (Workflow-Befehl ::error). Daten kodieren %, Zeilenumbrüche; Eigenschaften zusätzlich : und ,.
export function ghError(title, message) {
  const data = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const prop = (s) => data(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
  return `::error title=${prop(title)}::${data(message)}`;
}

// Chromium aus Playwright, sonst ein installiertes Chrome oder Edge. null, wenn Playwright fehlt.
async function launchChromium(log) {
  let pw;
  try { pw = createRequire(path.join(process.cwd(), 'x.js'))('playwright'); } catch { try { pw = createRequire(import.meta.url)('playwright'); } catch { log('        Playwright nicht gefunden, Browserprüfung übersprungen.'); return null; } }
  for (const opt of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) {
    try { return await pw.chromium.launch(opt); } catch (e) { if (opt.channel === 'msedge') throw e; }
  }
  return null;
}

// between: läuft zwischen Desktop- und Handyprüfung, hier setzt der Stop-Hook Claude auf untätig.
async function browserCheck(url, log, between = async () => {}) {
  const b = await launchChromium(log);
  if (!b) return;
  const errs = [];
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url + '/'); await p.waitForSelector('.card', { timeout: 15000 });
    // Priorität als feine Linie oben an der Karte statt Farbstreifen links (W-0010).
    const prio = await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.card'), '::before'); return { top: s.top, left: s.left, height: s.height }; });
    if (prio.top !== '0px' || prio.height !== '2px' || prio.left === '0px') errs.push(`Board: Linie oben an der Karte fehlt (${JSON.stringify(prio)})`);
    await p.click('.card'); await p.waitForTimeout(500);
    for (const k of ['2', '3', '4', '5', '6', '7', '1']) { await p.keyboard.press('Escape'); await p.keyboard.press(k); await p.waitForTimeout(250); }
    const liveText = async (pg, who) => {
      await pg.keyboard.press('Escape'); await pg.keyboard.press('7'); await pg.waitForTimeout(400);
      const v = await pg.evaluate(() => { const el = document.querySelector('#viewLive'); return { run: !!(el && el.querySelector('.lv-run')), text: el ? el.innerText : '' }; });
      if (!v.run) errs.push(`${who}Live: Tagesliste fehlt`);
      if (/NaN|Schritt 0 von 0/.test(v.text)) errs.push(`${who}Live: NaN oder Schritt 0 von 0`);
      return v.text;
    };
    await liveText(p, '');
    // Liste Heute (W-0019): Erledigtes steckt eingeklappt in einer Zeile, aufgeklappt einzeilig; auf oder zu bleibt gemerkt.
    const fold = () => p.evaluate(async () => {
      const d = await (await fetch('data.json')).json();
      const f = document.querySelector('#viewLive details.lv-fold');
      return {
        done: d.tasks.filter((t) => Array.isArray(t.plan) && t.status === 'erledigt').map((t) => t.id),
        has: !!f, open: f ? f.open : null, sum: f ? f.querySelector('summary').innerText.replace(/\s+/g, ' ') : '',
        mini: [...document.querySelectorAll('#viewLive .lv-mini [data-lv-focus]')].map((x) => x.dataset.lvFocus),
        full: [...document.querySelectorAll('#viewLive .lv-run [data-lv-focus]')].map((x) => x.dataset.lvFocus),
      };
    });
    let fo = await fold();
    if (!fo.done.length) errs.push('Live: Testprojekt hat keine heute erledigte Aufgabe');
    else {
      if (!fo.has || fo.open) errs.push(`Live: Erledigtes ist nicht eingeklappt (${JSON.stringify(fo)})`);
      if (!fo.sum.includes(`${fo.done.length} heute erledigt`)) errs.push(`Live: Zeile zum Aufklappen nennt nicht "${fo.done.length} heute erledigt": ${fo.sum}`);
      if (fo.full.some((id) => fo.done.includes(id))) errs.push('Live: Erledigte stehen noch als volle Einträge in der Liste');
      if (fo.has) {
        await p.click('#viewLive details.lv-fold > summary'); await p.waitForTimeout(250);
        fo = await fold();
        if (!fo.open || fo.mini.length !== fo.done.length) errs.push(`Live: Aufgeklappt fehlen einzeilige Einträge (${fo.mini.length} von ${fo.done.length})`);
        // Das Board merkt sich die Ansicht: nach dem Neuladen ist Live schon offen, die Karten sind verborgen.
        await p.goto(url + '/'); await p.waitForSelector('#viewLive .lv-fold', { timeout: 15000 }); await liveText(p, '');
        fo = await fold();
        if (!fo.open) errs.push('Live: Aufgeklappt wird nach dem Neuladen nicht gemerkt');
        if (fo.has && fo.open) { await p.click('#viewLive details.lv-fold > summary'); await p.waitForTimeout(250); }
      }
    }
    const many = await p.evaluate(() => ({
      groups: [...document.querySelectorAll('#viewLive .lv-errgrp')].map((g) => g.innerText),
      attn: document.querySelectorAll('#viewLive .lv-attn li').length,
    }));
    if (!many.groups.some((g) => /9 Prüfungen/.test(g) && /cannot find the path/.test(g))) errs.push(`Live: keine Fehlergruppe für 9 gleiche Fehlschläge (${many.groups.length} Gruppen)`);
    if (many.attn > 4) errs.push(`Live: Wartet auf dich zeigt ${many.attn} Zeilen statt höchstens 4`);
    // Wackelig und Laufzeit (W-0009): m1 wechselt hin und her, m10 dauert 48 s statt meist 21 s.
    const flk = await p.evaluate(() => ({ fl: [...document.querySelectorAll('#viewLive .lv-names span.fl')].map((s) => s.textContent), info: [...document.querySelectorAll('#viewLive .lv-infoline')].map((x) => x.innerText.replace(/\s+/g, ' ')) }));
    if (!flk.fl.includes('m1') || !flk.info.some((x) => /1 wackelig/.test(x) && /m1/.test(x))) errs.push(`Live: wackelig fehlt (${JSON.stringify(flk)})`);
    if (!flk.info.some((x) => /Langsamer als sonst: m10 48 s statt meist 21 s/.test(x))) errs.push(`Live: Laufzeittrend fehlt (${JSON.stringify(flk.info)})`);
    const perm = await p.evaluate(() => ({
      tile: (document.querySelector('#viewLive .lv-tile.perm') || {}).innerText || '',
      now: !!document.querySelector('#viewLive .lv-now.perm'),
      first: (document.querySelector('#viewLive .lv-attn li') || {}).innerText || '',
      pulse: !!document.querySelector('#livePulse.perm:not([hidden])'),
      title: document.title,
    }));
    if (!/wartet auf deine Freigabe/.test(perm.tile) || !/npm install -D vitest/.test(perm.tile)) errs.push(`Live: Kachel zeigt keine Freigabe (${perm.tile.replace(/\n/g, ' ')})`);
    if (!perm.now) errs.push('Live: Jetzt-Box zeigt keine Freigabe');
    // Verbrauch (W-0008): Der Stop-Hook hat heute Tokens erfasst, die Kachel Fortschritt zeigt sie.
    const use = await p.evaluate(() => (document.querySelector('#viewLive .lv-usage') || {}).innerText || '');
    if (!/Verbrauch heute .*Tokens, ca\. [\d,]+ \$/.test(use.replace(/\s+/g, ' '))) errs.push(`Live: Verbrauch heute fehlt (${use})`);
    if (!/Freigabe für einen Befehl/.test(perm.first)) errs.push(`Live: Freigabe nicht erster Punkt in Wartet auf dich (${perm.first})`);
    if (!perm.pulse || !/^Freigabe/.test(perm.title)) errs.push(`Live: Reiter oder Titel ohne Freigabe (${perm.title})`);
    // Diff im Verlauf (W-0011): Verlauf aller Aufgaben, ein Dateieintrag klappt seinen Diff auf.
    await p.click('#viewLive [data-lv-feed="1"]'); await p.waitForTimeout(300);
    if (!(await p.$('#viewLive [data-lv-diff]'))) errs.push('Live: kein aufklappbarer Dateieintrag im Verlauf');
    else {
      await p.click('#viewLive [data-lv-diff]');
      try { await p.waitForSelector('#viewLive .lv-fdiff .lv-fdiff-head', { timeout: 10000 }); } catch { errs.push('Live: Diff im Verlauf erscheint nicht'); }
    }
    // Erneut prüfen (W-0006): Knopf für alle Fehlschläge und je Gruppe. Der Klick lässt die neun roten Prüfungen neu laufen,
    // sie bestehen diesmal (node -v), die Fehlergruppe verschwindet.
    const rr = await p.evaluate(() => ({ all: (document.querySelector('#viewLive .lv-ckg-acts [data-lv-rerun]') || {}).innerText || '', n: document.querySelectorAll('#viewLive [data-lv-rerun]').length }));
    if (!/Alle 9 fehlgeschlagenen erneut prüfen/.test(rr.all) || rr.n < 2) errs.push(`Live: Knöpfe zum erneuten Prüfen fehlen (${rr.n}, ${rr.all})`);
    else {
      await p.click('#viewLive .lv-ckg-acts [data-lv-rerun]');
      try { await p.waitForFunction(() => !document.querySelector('#viewLive .lv-errgrp:not(.warn)'), null, { timeout: 30000 }); } catch { errs.push('Live: Erneut prüfen hat die Fehlergruppe nicht aufgelöst'); }
    }
    await p.keyboard.press('1'); await p.waitForTimeout(250);
    await p.click('#btnTools'); await p.waitForTimeout(800);
    // Prüfungs-Gesundheit unter Werkzeuge (W-0014): Tabelle da, Sortierung umschaltbar.
    if (!(await p.$$('#hthBox .hth tbody tr')).length) errs.push('Werkzeuge: Prüfungen im Projekt fehlen');
    else {
      await p.evaluate(() => { document.querySelector('#hthBox').closest('details').open = true; });
      await p.click('#hthBox [data-hth="slow"]');
      if (!(await p.$('#hthBox [data-hth="slow"][aria-pressed="true"]'))) errs.push('Werkzeuge: Sortierung Langsam greift nicht');
    }
    // Sichern und Wiederherstellen (W-0021): Knopf unter Werkzeuge, JSON herunterladen, dieselbe Datei wieder einlesen.
    if (!(await p.$('#btnBackup'))) errs.push('Werkzeuge: Knopf Sichern und Wiederherstellen fehlt');
    else {
      await p.click('#btnBackup');
      try {
        await p.waitForSelector('dialog[open] .bk-tabs', { timeout: 5000 });
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click('dialog[open] #bkGo')]);
        const saved = path.join(os.tmpdir(), `works-sicherung-${process.pid}.json`);
        await dl.saveAs(saved);
        const jd = JSON.parse(fs.readFileSync(saved, 'utf8'));
        if (jd.format !== 'works-board' || !jd.tasks.length) errs.push(`Sichern: Datei ist keine Sicherung (${jd.format}, ${jd.tasks && jd.tasks.length} Aufgaben)`);
        await p.click('dialog[open] .bk-tabs [data-bk="import"]');
        await p.setInputFiles('dialog[open] #bkFile', saved);
        await p.waitForSelector('dialog[open] .bk-counts', { timeout: 10000 });
        const chips = (await p.evaluate(() => document.querySelector('dialog[open] .bk-counts').innerText)).replace(/\s+/g, ' ');
        if (!chips.includes(`${jd.tasks.length} gleich`) || !chips.includes('0 neu')) errs.push(`Sichern: eigene Sicherung sollte nur Gleiches zeigen (${chips})`);
        // Schmaler Bildschirm: nichts ragt über den Dialog hinaus (Fuß mit mehreren Knöpfen bricht um).
        await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200);
        const over = await p.evaluate(() => { const f = document.querySelector('dialog[open] form'); return f.scrollWidth - f.clientWidth; });
        if (over > 1) errs.push(`Sichern: Dialog auf 390 px ${over} px zu breit`);
        await p.setViewportSize({ width: 1280, height: 900 });
        fs.rmSync(saved, { force: true });
      } catch (e) { errs.push(`Sichern: ${e.message.split('\n')[0]}`); }
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    }
    await between();
    const m = await b.newPage({ viewport: { width: 390, height: 844 } });
    m.on('pageerror', (e) => errs.push('mobil: ' + e.message));
    await m.goto(url + '/'); await m.waitForSelector('.card');
    const wide = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (wide) errs.push('mobil: seitliches Scrollen');
    const mt = await liveText(m, 'mobil ');
    if (!mt.includes('Claude wartet') || mt.includes('auf deine Freigabe')) errs.push('mobil Live: nach dem Stop-Hook fehlt "Claude wartet" oder die Freigabe steht noch da');
    if (await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) errs.push('mobil Live: seitliches Scrollen');
  } finally { await b.close(); }
  if (errs.length) throw new Error(`Browser: ${errs.join(' | ')}`);
}
