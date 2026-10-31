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

  // ---------- Server und API ----------
  let port = 0;
  await step('Live-Board: Start, Seite, Daten, API, Rückgängig, Stopp', async () => {
    for (let p = 47900 + Math.floor(Math.random() * 80); p < 48000 && !port; p++) port = await free(p) ? p : 0;
    expect(port, 'Kein freier Port');
    has(w(['board', '--serve', '--detach', `--port=${port}`]).out, `:${port}`);
    const url = `http://127.0.0.1:${port}`;
    const html = await (await fetch(url + '/')).text();
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
    if (browser) await browserCheck(url, log);
  });
  w(['board', '--stop'], { ok: false });

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

async function browserCheck(url, log) {
  let pw;
  try { pw = createRequire(path.join(process.cwd(), 'x.js'))('playwright'); } catch { try { pw = createRequire(import.meta.url)('playwright'); } catch { log('        Playwright nicht gefunden, Browserprüfung übersprungen.'); return; } }
  const b = await pw.chromium.launch();
  const errs = [];
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url + '/'); await p.waitForSelector('.card', { timeout: 15000 });
    await p.click('.card'); await p.waitForTimeout(500);
    for (const k of ['2', '3', '4', '5', '6', '1']) { await p.keyboard.press('Escape'); await p.keyboard.press(k); await p.waitForTimeout(250); }
    await p.click('#btnTools'); await p.waitForTimeout(800);
    const m = await b.newPage({ viewport: { width: 390, height: 844 } });
    m.on('pageerror', (e) => errs.push('mobil: ' + e.message));
    await m.goto(url + '/'); await m.waitForSelector('.card');
    const wide = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (wide) errs.push('mobil: seitliches Scrollen');
  } finally { await b.close(); }
  if (errs.length) throw new Error(`Browser: ${errs.join(' | ')}`);
}
