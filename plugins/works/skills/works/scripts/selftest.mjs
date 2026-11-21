// Selbsttest: legt ein Wegwerfprojekt an und prüft CLI, Hooks, Import, Dateien, Parallelarbeit, Server und API.
// Läuft lokal mit works selftest und in der GitHub Action des Repos mycron. Ohne Abhängigkeiten;
// mit --browser zusätzlich das Board in Chromium, wenn Playwright installiert ist.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

export async function selftest({ keep = false, browser = false, verbose = false, log = (s) => process.stdout.write(s + '\n') } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'works-selftest-'));
  const proj = path.join(base, 'projekt');
  const home = path.join(base, 'home');
  fs.mkdirSync(proj, { recursive: true }); fs.mkdirSync(home, { recursive: true });
  const env = { ...process.env, HOME: home, USERPROFILE: home, WORKS_ACTOR: '', GIT_AUTHOR_NAME: 'works', GIT_AUTHOR_EMAIL: 'works@test', GIT_COMMITTER_NAME: 'works', GIT_COMMITTER_EMAIL: 'works@test' };
  const results = [];
  const hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

  const w = (args, { cwd = proj, input, ok = true } = {}) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: 'utf8', input, timeout: 60000 });
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
    const t0 = Date.now();
    try { await fn(); results.push({ name, ok: true }); log(`ok      ${name}${verbose ? ` (${Date.now() - t0} ms)` : ''}`); }
    catch (e) { results.push({ name, ok: false, error: e.message }); log(`FEHLER  ${name}\n        ${e.message.split('\n').join('\n        ')}`); }
  };
  const skip = (name, why) => { results.push({ name, ok: true, skipped: true }); log(`--      ${name} (übersprungen: ${why})`); };

  log(`works Selbsttest in ${base}\nNode ${process.version}, ${process.platform}${hasGit ? '' : ', ohne Git'}\n`);

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
    w(['design', 'add', 'W-0004', '--name=A', '--title=Klassisch', `--file=${f}`]);
    has(w(['design', 'show', 'W-0004']).out, 'Noch keine Variante gewählt');
    w(['design', 'choose', 'W-0004', 'A', '--reason=Test']);
    has(w(['design', 'show', 'W-0004']).out, 'Gewählt: A');
  });

  // Git mit core.autocrlf=true checkt .works unter Windows mit CRLF aus. works muss das genauso lesen wie LF.
  // W-0001 hat Kriterien und einen Kommentar, W-0004 ist eine Gestaltungsaufgabe (dort prüft die DoD decisions.md).
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
    const h = (s) => [...s].map((x) => ({ s: x === 'o' ? 'ok' : 'fail', ms: 1000 }));
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
    cj.results.hx = { ...cj.results.hx, status: 'fail', hist: [...h('ofoo'), { s: 'fail', ms: 900 }] };
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
    const badOnly = await fetch(url + '/api/action', { method: 'POST', headers: { 'X-Works-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'checksRun', id: 'W-0001', only: ['../x'] }) });
    expect(badOnly.status === 400, `Ungültiger Name in only: ${badOnly.status}`);
    await api('POST', '/api/action', { action: 'checksSave', checks: {} });
    // W-0002 hat keinen Umsetzungsplan: Die Live-Ansicht darf dafür kein NaN oder "Schritt 0 von 0" zeigen.
    w(['start', 'W-0002']);
    // Viele Prüfungen: zehn eingerichtet, neun mit derselben Meldung fehlgeschlagen. Die Live-Ansicht fasst sie zusammen.
    const many = Array.from({ length: 10 }, (_, i) => `m${i + 1}`);
    w(['checks', 'set', ...many.map((n) => `${n}=node -v`)]);
    const d2 = path.join(proj, '.works', 'tasks', fs.readdirSync(path.join(proj, '.works', 'tasks')).find((x) => x.startsWith('W-0002-')));
    const at = new Date().toISOString();
    fs.writeFileSync(path.join(d2, 'checks.json'), JSON.stringify({ at, fingerprint: '', results: Object.fromEntries(many.map((n, i) => [n, i < 9
      ? { status: 'fail', cmd: 'node -v', ms: 40, output: 'The system cannot find the path specified.\n', at, ...(i === 0 ? { hist: ['ok', 'fail', 'ok', 'fail'].map((s) => ({ s, ms: 40, at })) } : {}) }
      // m10 bestanden, aber deutlich langsamer als sonst (W-0009).
      : { status: 'ok', cmd: 'node -v', ms: 48000, output: '', at, hist: [21000, 22000, 20000, 48000].map((ms) => ({ s: 'ok', ms, at })) }])) }));
    // Claude wartet auf eine Freigabe für W-0002: Desktop zeigt das, der Stop-Hook beendet es vor der Handyprüfung.
    hook('permission.mjs', { cwd: proj, session_id: 's9', tool_name: 'Bash', tool_input: { command: 'npm install -D vitest' } });
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
      expect(port && port !== '4747', `Start bei belegtem Port 4747: ${out.split('\n')[0]}`);
      has(w(['board', '--restart']).out, `:${port}/`, 'Neustart behält den Port');
      w(['board', '--stop']);
      const fixed = w(['board', '--serve', '--detach', '--port=4747'], { ok: false });
      expect(fixed.code !== 0, `Belegter ausdrücklicher Port wurde nicht abgelehnt: ${fixed.out.split('\n')[0]}`);
    } finally {
      blocker.close();
      w(['board', '--stop'], { ok: false });
    }
  });

  const failed = results.filter((r) => !r.ok);
  log(`\n${results.length - failed.length} von ${results.length} Prüfungen bestanden${failed.length ? `, ${failed.length} fehlgeschlagen` : ''}.`);
  if (!keep) { try { cleanupWorktrees(proj); fs.rmSync(base, { recursive: true, force: true }); } catch { /* Windows hält Dateien manchmal kurz fest */ } }
  else log(`Testprojekt bleibt erhalten: ${proj}`);
  return { ok: !failed.length, results };
}

function cleanupWorktrees(proj) { spawnSync('git', ['worktree', 'prune'], { cwd: proj }); }

function free(port) {
  return import('node:net').then(({ default: net }) => new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  }));
}

// between: läuft zwischen Desktop- und Handyprüfung, hier setzt der Stop-Hook Claude auf untätig.
async function browserCheck(url, log, between = async () => {}) {
  let pw;
  try { pw = createRequire(path.join(process.cwd(), 'x.js'))('playwright'); } catch { try { pw = createRequire(import.meta.url)('playwright'); } catch { log('        Playwright nicht gefunden, Browserprüfung übersprungen.'); return; } }
  // Ohne heruntergeladene Playwright-Browser auf ein installiertes Chrome oder Edge ausweichen.
  let b = null;
  for (const opt of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) {
    try { b = await pw.chromium.launch(opt); break; } catch (e) { if (opt.channel === 'msedge') throw e; }
  }
  const errs = [];
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url + '/'); await p.waitForSelector('.card', { timeout: 15000 });
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
