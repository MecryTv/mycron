# Live-Ansicht im works-Board: Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein siebter Board-Reiter „Live“ zeigt, an welcher Aufgabe und welchem Schritt Claude arbeitet, was gerade läuft und wie die Prüfungen stehen, auch bei parallelen Agenten.

**Architecture:** Ein neuer PreToolUse-Hook meldet Werkzeugaufrufe beim Start, der PostToolUse-Hook wie bisher beim Ende und stempelt abgehakte Schritte in `.works/steps.json`. `runChecks` schreibt seinen Zwischenstand und läuft für parallele Aufgaben im Worktree. `boardData` liefert Schritte und Prüfungsstand der Tagesliste, das Board rendert die Ansicht clientseitig.

**Tech Stack:** Node ≥ 18 ohne Abhängigkeiten (ESM), Vanilla JS und CSS im Board (`board.js` als IIFE), Selbsttest `scripts/selftest.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-20-live-tracking-design.md`, visuelle Vorlage `docs/superpowers/specs/2026-11-20-live-tracking-entwurf.html` (Reiter A).

Alle Pfade unten relativ zu `plugins/works/skills/works/`, außer `plugins/works/hooks/hooks.json`.

## Global Constraints

- Keine neuen Abhängigkeiten, keine externen Skripte oder Schriften im Board.
- Jeder Prozessstart mit `windowsHide` (der Selbsttest prüft das).
- Hooks und `boardData` laden nie alle Aufgaben zusätzlich und rufen kein `git` auf. Der PreToolUse-Hook schreibt nur `activity.json`.
- Status nie nur über Farbe: Symbol plus Text. Text in `--text-2` oder `--text`, nur Symbole farbig.
- `prefers-reduced-motion`: keine Puls-, Dreh- oder Einblendanimation.
- Kein seitliches Scrollen der Seite bei 375 px.
- Nur Ansehen (`MODE === 'view'`): kein Anweisungsfeld, keine Knöpfe für Funde und Abnahme. Statische `board.html` und Export: kein Reiter Live.
- Veraltet-Grenze für laufende Prüfungen: 11 Minuten.
- `activity.json` behält 40 Einträge in `recent`.
- Texte auf Deutsch, sachlich. Commits im Stil `works: …` mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Claude untätig oder keine `activity.json` (frisches Projekt, `live_activity: false`): Ansicht zeigt „Claude wartet“, keine Konsolenfehler. → Task 5, mobile Browserprüfung nach Stop-Hook.
2. Aufgabe ohne Umsetzungsplan: nirgends „Schritt 0 von 0“ oder `NaN`. → Task 5, Textprüfung in der Browserprüfung (W-0002 hat keinen Plan und ist dort in Arbeit).
3. Abgebrochener Prüfungslauf (`running` bleibt stehen): nach 11 Minuten nicht mehr „läuft“. → Task 4.
4. Projekt ohne eingerichtete Prüfungen: `checks` ist `null`, Spalte zeigt Hinweis. → Task 4.
5. PreToolUse ohne passenden PostToolUse (Aufruf abgelehnt oder abgebrochen): „Gerade jetzt“ zählt nicht ewig weiter. Der nächste Aufruf überschreibt `current`, der Stop-Hook setzt `busy = false`, und die Ansicht wertet `running` nur aus, solange `current.at` jünger als 10 Minuten ist. → Task 5 Step 6; die Browserprüfung nach dem Stop-Hook deckt den untätigen Fall ab.

---

### Task 1: PreToolUse-Hook und genaue Jetzt-Anzeige

**Files:**
- Create: `hooks/pre-tool.mjs`
- Modify: `scripts/live.mjs` (`callTarget`, `recordActivity` mit `running`, `recent` 40)
- Modify: `hooks/post-tool.mjs` (Zuordnung über `callTarget`)
- Modify: `plugins/works/hooks/hooks.json`, `scripts/works.mjs:1709` (`add('PreToolUse', 'pre-tool.mjs')`)
- Test: `scripts/selftest.mjs` (neuer Schritt direkt nach „Hooks: …“)

**Interfaces:**
- Produces:
  - `callTarget(root, input) -> { task: string, lane: object | null }` mit genau der heutigen Logik aus `post-tool.mjs` (Pfad, `cwd` oder Befehl im Worktree → Bahn, sonst `loadState(root).active`).
  - `recordActivity(root, task, tool, input, ok = true, lane = '', { running = false } = {})`: mit `running` nur `current` bzw. `lanes[task]` setzen, Eintrag hat `running: true`, `recent` bleibt unverändert, `busy = true`. Ohne `running` wie bisher, plus `recent` auf 40 begrenzt.

- [ ] **Step 1: Failing test** — neuer Schritt `'Live: Jetzt-Anzeige mit PreToolUse'`:

```js
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
```

- [ ] **Step 2: Rot** — `node scripts/works.mjs selftest` → `FEHLER  Live: Jetzt-Anzeige mit PreToolUse` (Datei `pre-tool.mjs` fehlt).
- [ ] **Step 3: `callTarget` und `running` in `live.mjs`**, `post-tool.mjs` auf `callTarget` umstellen (Verhalten unverändert).
- [ ] **Step 4: `hooks/pre-tool.mjs`**: stdin lesen wie die anderen Hooks, `findRoot`, `config.live_activity !== false` prüfen, `callTarget`, `recordActivity(..., { running: true })`, keine Ausgabe, Fehler nach stderr, Exit 0.
- [ ] **Step 5: Registrieren** in `plugins/works/hooks/hooks.json` (`"PreToolUse"`, ohne Matcher, Timeout 5) und in `install-hooks` (`works.mjs:1709`).
- [ ] **Step 6: Grün** — `ok      Live: Jetzt-Anzeige mit PreToolUse`, alle übrigen Schritte `ok`.
- [ ] **Step 7: Commit** `works: Werkzeugaufrufe beim Start melden`

---

### Task 2: Uhrzeit abgehakter Schritte

**Files:**
- Modify: `scripts/live.mjs` (`planOf`, `stampSteps`, `taskDirOf`)
- Modify: `hooks/post-tool.mjs`
- Modify: `scripts/works.mjs:97`, `scripts/server-control.mjs:176`, `scripts/serve.mjs:402` (`steps.json` in die drei gitignore-Listen)
- Test: `scripts/selftest.mjs` (neuer Schritt nach Task 1)

**Interfaces:**
- Consumes: `callTarget` (Task 1).
- Produces:
  - `planOf(task) -> { section: string, items: { text: string, done: boolean }[] }` aus dem ersten nicht leeren Abschnitt von `Umsetzungsplan`, `Vorgehen`, `Checkliste` (`getSection`, `checkboxes` aus `lib.mjs`). Ohne Abschnitt `{ section: '', items: [] }`.
  - `stampSteps(root, tasks, { prune = false } = {}) -> Map<string, { text, done, at }[]>` mit `.works/steps.json` (`{ [id]: { [text]: isoString } }`). Neu abgehakt → `new Date(task._mtime).toISOString()`, wieder geöffnet → Eintrag weg, `at: ''`. `prune` entfernt Aufgaben, die nicht in `tasks` stehen. Schreibt nur bei Änderung. Schlüssel ist der Schritttext (`// ponytail:` gleichlautende Schritte teilen sich eine Uhrzeit).
  - `taskDirOf(root, id) -> string | null`: Ordnername unter `.works/tasks/` mit Präfix `<id>-`, ohne alle Aufgaben zu laden.

- [ ] **Step 1: Failing test** — neuer Schritt `'Live: Uhrzeit abgehakter Schritte'` (W-0001 ist in Arbeit, Umsetzungsplan-Punkt 1 ist „Format festlegen“):

```js
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
```

- [ ] **Step 2: Rot** (`stampSteps` fehlt).
- [ ] **Step 3: Funktionen in `live.mjs`.**
- [ ] **Step 4: Hook** — in `post-tool.mjs` nach `recordActivity`: bei gesetzter Aufgabe und `live_activity !== false` `stampSteps(root, [loadTask(path.join(worksDir(root), 'tasks', dir))])` mit `dir = taskDirOf(root, task)`; Fehler wie die übrigen Teile abfangen.
- [ ] **Step 5: `steps.json` in die drei gitignore-Listen.**
- [ ] **Step 6: Grün** — `ok      Live: Uhrzeit abgehakter Schritte`.
- [ ] **Step 7: Commit** `works: Uhrzeit abgehakter Schritte festhalten`

---

### Task 3: Prüfungen mit Zwischenstand, im Worktree für Agenten

**Files:**
- Modify: `scripts/checks.mjs` (`checkDir`, `runChecks`, `recordCheck`, `checkItems`)
- Modify: `scripts/parallel.mjs` (`lanePrompt`, Regel 6)
- Test: `scripts/selftest.mjs` (neuer Schritt nach Task 2, Ergänzung im Schritt „Parallelarbeit“)

**Interfaces:**
- Produces:
  - `checkDir(root, task) -> string`: `lane.path` aus `loadLanes(root)`, wenn die Aufgabe dort steht und der Ordner existiert, sonst `root`. Import von `parallel.mjs` in `checks.mjs` auf Zyklen prüfen; bei Zyklus `lanes.json` direkt lesen.
  - `checks.json` während eines Laufs mit `running: string`, `runningSince: isoString`; jedes Befehlsergebnis mit `at: isoString`; nach dem Lauf ohne `running`/`runningSince`.
  - `runOne` und `workFingerprint` laufen in `checkDir(root, task)`; `recordCheck` und `checkItems` berechnen den Fingerabdruck ebenfalls dort.
  - `lanePrompt`: Regel 6 lautet bei eingerichteten Prüfungen (`checksFor(config, t).length > 0`): „Prüfungen mit `works checks run <ID>` ausführen (sie laufen in diesem Worktree). Fehler und Funde beheben und erneut prüfen. Skill-Prüfungen selbst ausführen und mit `works checks record <ID> <name> --status=ok|warn|fail --note=\"...\"` eintragen.“ Ohne Prüfungen bleibt der bisherige Satz.

- [ ] **Step 1: Failing tests**

Neuer Schritt `'Live: Zwischenstand der Prüfungen'`:

```js
const dir = path.join('.works', 'tasks', fs.readdirSync(path.join(proj, '.works', 'tasks')).find((d) => d.startsWith('W-0001-')));
fs.writeFileSync(path.join(proj, 'peek.js'), "process.stdout.write(require('fs').readFileSync(process.argv[2], 'utf8'))\n");
w(['checks', 'set', `peek=node peek.js ${path.join(dir, 'checks.json')}`]);
w(['checks', 'run', 'W-0001']);
const res = JSON.parse(fs.readFileSync(path.join(proj, dir, 'checks.json'), 'utf8'));
expect(/"running":\s*"peek"/.test(res.results.peek.output), `running fehlt während des Laufs: ${res.results.peek.output.slice(0, 200)}`);
expect(!('running' in res) && res.results.peek.at, 'running nach dem Lauf nicht entfernt oder at fehlt');
```

Der Befehl liest `checks.json` während seiner eigenen Prüfung; die Datei muss also vor dem Start geschrieben sein, auch beim allerersten Lauf.

Im Schritt „Parallelarbeit“ nach `w(['log', nid, 'Aus dem Worktree'], { cwd: l2.path })`:

```js
w(['checks', 'set', 'where=node -p process.cwd()']);
has(w(['parallel', 'prompt', nid]).out, 'checks run', 'Agenten-Auftrag');
w(['checks', 'run', nid], { cwd: l2.path });
const nd = fs.readdirSync(path.join(proj, '.works', 'tasks')).find((d) => d.startsWith(nid));
const wr = JSON.parse(fs.readFileSync(path.join(proj, '.works', 'tasks', nd, 'checks.json'), 'utf8')).results.where.output.trim();
expect(fs.realpathSync(wr) === fs.realpathSync(l2.path), `Prüfung lief in ${wr} statt im Worktree`);
w(['checks', 'remove', 'where']);
```

- [ ] **Step 2: Rot** (beide Prüfungen schlagen fehl).
- [ ] **Step 3: `runChecks` schreibt** vor jedem Befehl `{ at: prev.at || jetzt, fingerprint: prev.fingerprint || '', results, running, runningSince }` und nach jedem Befehl das Ergebnis mit `at`; Ende wie bisher. Skill-Prüfungen setzen kein `running`.
- [ ] **Step 4: `checkDir`** einbauen in `runChecks`, `recordCheck`, `checkItems`.
- [ ] **Step 5: Regel 6 in `lanePrompt(root, t, lane, cli)`**; `config` dort mit `loadConfig(root)` holen (schon aus `lib.mjs` importiert).
- [ ] **Step 6: Grün** — `ok      Live: Zwischenstand der Prüfungen` und `ok      Parallelarbeit: …`.
- [ ] **Step 7: Commit** `works: Prüfungen melden Zwischenstand und laufen für Agenten im Worktree`

---

### Task 4: Live-Daten in `boardData`

**Files:**
- Modify: `scripts/board.mjs` (`boardData`)
- Test: `scripts/selftest.mjs` (neuer Schritt nach Task 3)

**Interfaces:**
- Consumes: `stampSteps` (Task 2), Zwischenstand in `checks.json` (Task 3), `checksFor`, `loadResults`, `today`.
- Produces in `data.json`:
  - Tagesliste = Status `in-arbeit` oder `review`, offen und in `meta.queue`, oder `erledigt` mit `completed === today()`. Nur diese Aufgaben haben `plan` und `checks`.
  - `task.plan: { text, done, at }[]`.
  - `task.checks: { list: { name, cmd, skill }[], results: object, running: string, runningSince: string, at: string } | null`; `null` ohne eingerichtete Prüfungen, `results: {}` vor dem ersten Lauf, `running`/`runningSince` als `''`, wenn älter als 11 Minuten.
  - `meta.today` (`today()`), `meta.activity.recent` vollständig (bis 40), `meta.activity.current.running` wird durchgereicht.
  - `stampSteps(root, tagesliste, { prune: true })` einmal pro `boardData`.

- [ ] **Step 1: Failing test** — neuer Schritt `'Live: Daten im Board'`:

```js
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
w(['checks', 'remove', 'peek']);
expect(boardData(proj).tasks.find((t) => t.id === 'W-0001').checks === null, 'ohne Prüfungen ist checks nicht null');
```

- [ ] **Step 2: Rot.**
- [ ] **Step 3: Felder in `boardData`** wie unter Interfaces, ohne `workFingerprint`.
- [ ] **Step 4: Grün** — `ok      Live: Daten im Board`.
- [ ] **Step 5: Commit** `works: Schritte und Prüfungsstand im Board`

---

### Task 5: Ansicht Live im Board

**Files:**
- Modify: `scripts/board/template.html`, `scripts/board/board.js` (neuer Abschnitt `// ---------- Live-Ansicht ----------`), `scripts/board/board.css` (neuer Abschnitt `/* Live-Ansicht */`)
- Test: `scripts/selftest.mjs` (Schritt „Live-Board“ und `browserCheck`)

**Interfaces:**
- Consumes: Felder aus Task 4, `meta.lanes`, `meta.queue`, `meta.instructions`; vorhandene Board-Funktionen `setView`, `sendInstruction(id, text)`, `act(name, body)`, `run(fn, msg)`, `openReview(id)`, `store`, `esc`, `toast`.
- Produces (nur in `board.js`): `phaseOf(t)` nach der Phasentabelle im Spec, `liveTasks()` (Tagesliste in Spec-Reihenfolge), `renderLive()`.

Markup und Klassen aus dem Entwurf übernehmen (`.lv`, `.lv-sum`, `.tile`, `.lv-grid`, `.run`, `.focus`, `.phases`, `.steps`, `.now`, `.feed`, `.ck-group`), nur vorhandene Tokens. Die `.ck`-Regeln des Abschluss-Dialogs wiederverwenden, nur `.ck.run` und `.ck.flash` ergänzen.

- [ ] **Step 1: Failing test**

Im Schritt „Live-Board“ nach dem Laden der Seite:

```js
has(html, 'data-view="live"', 'Seite'); has(html, 'id="viewLive"', 'Seite');
```

`browserCheck(url, log, between)` bekommt einen dritten Parameter. Auf der Desktop-Seite `p` nach der bestehenden Tastenfolge (die nun `'7'` vor `'1'` enthält): `await p.keyboard.press('7')`, `#viewLive .run` muss existieren, `innerText` von `#viewLive` darf weder `NaN` noch `Schritt 0 von 0` enthalten. Dann `await between()`; der Aufrufer übergibt `() => hook('stop-reminder.mjs', { cwd: proj, session_id: 's9', stop_hook_active: true })`, damit Claude als untätig gilt. Die mobile Seite `m` lädt danach, drückt `7`, prüft wieder `NaN`/`Schritt 0 von 0`, dass „Claude wartet“ im Text steht, und `scrollWidth > innerWidth + 1` → Fehler `mobil Live: seitliches Scrollen`. Vor dem Browsertest `w(['start', 'W-0002'])`, damit eine Aufgabe ohne Umsetzungsplan in Arbeit ist (W-0002 hat keinen Plan-Punkt).

- [ ] **Step 2: Rot** (`has(html, 'data-view="live"')`).
- [ ] **Step 3: Template** — letzter Knopf in `#views`: `<button data-view="live" aria-pressed="false" data-live><i class="pdot" id="livePulse" hidden aria-hidden="true"></i>Live</button>`; `<main class="view live-view" id="viewLive" tabindex="-1" data-only="live" hidden></main>` nach `#viewTable`; `<div class="sr" aria-live="polite" id="liveSay"></div>` vor den Skripten.
- [ ] **Step 4: Ansichtssystem** — `VIEWS`/`VIEW_LABEL` um `live`; Tasten `/^[1-7]$/`; `setView('live')` ohne `LIVE` ignorieren, beim Wiederherstellen `live` ohne `LIVE` → `board`; `renderAll` ruft `renderLive()`; Pille im Kopf mit `LIVE`: `liveFollow = true; setView('live')`; `#livePulse` sichtbar, solange die Pille sichtbar ist.
- [ ] **Step 5: `phaseOf`, `liveTasks`, Fokus** — Fokusregel und Speicherung unter `'works-live-' + meta.project` (`{ focus, feedAll }`) wie im Spec.
- [ ] **Step 6: `renderLive()`** mit Kacheln, Tagesliste, Fokus, Prüfungsspalte nach Spec „Aufbau der Ansicht“ und Entwurf. Festgelegt:
  - Jetzt-Kachel nach Spec 3b: `current.running` und frisch (< 10 min) → „Gerade jetzt … seit“; `busy` ohne `running` → „Claude denkt nach“, darunter „Zuletzt: …, vor …“; sonst „Claude wartet seit HH:MM“ (`idleSince`). Für Agenten dasselbe mit `activity.lanes[id]`.
  - Schrittzeilen nur bei `plan.length > 0`, sonst „Kein Umsetzungsplan“.
  - Verlauf: `activity.recent` plus „Schritt erledigt“ aus `plan[].at` und „Prüfung <name> bestanden|Fund|fehlgeschlagen“ aus `checks.results[*].at`, absteigend, höchstens 7.
  - Fund-Knöpfe nur mit `EDIT`: „Claude beheben lassen“ → `act('comment', { id, text })` mit dem Text aus `bindChecks`; „Als bekannt markieren“ → `act('checksAck', { id, name })`. „Abnehmen“ → `openReview(id)`. Anweisung → `sendInstruction(id, text)`.
  - Beim Neuzeichnen Fokus (`data-k`) und Text im Anweisungsfeld erhalten wie `render()` im Entwurf.
- [ ] **Step 7: Takt und Ansagen** — ein `setInterval` (1 s, nur mit `LIVE`) aktualisiert `[data-since]` in `#viewLive` und `#busy`. `renderLive` vergleicht je Aufgabe erledigte Schritte, fertige Prüfungen und Status mit dem vorigen Stand und schreibt bei Änderung einen Satz in `#liveSay`, nur in der Ansicht Live und nicht beim ersten Rendern.
- [ ] **Step 8: CSS** aus dem Entwurf, Breakpoints 1280/820/560 px, `prefers-reduced-motion` für `.pdot`, `.si.run`, `.feed li.new`, `.steps li.fresh`.
- [ ] **Step 9: Grün** — Selbsttest, mit Playwright zusätzlich `--browser`. Von Hand: `node scripts/works.mjs demo --simulate --open`, Ansicht Live in hell und dunkel, keine Konsolenfehler.
- [ ] **Step 10: Commit** `works: Live-Ansicht im Board`

---

### Task 6: Dokumentation

**Files:**
- Modify: `references/board.md` (Tasten `1` bis `7`, Ansichtenliste, Abschnitt „Live-Ansicht“)
- Modify: `references/hooks.md` (Abschnitt PreToolUse, PostToolUse stempelt Schritte, Plugin-Liste und Beispielkonfiguration)
- Modify: `references/parallel.md`, `references/planning.md` (Prüfungen paralleler Aufgaben laufen im Worktree)
- Modify: `SKILL.md` (Zeile „Live verfolgen, wie weit Claude ist“ → Reiter Live, Taste 7; `steps.json` in der Ordnerübersicht)
- Modify: `plugins/works/README.md` (ein Satz)

- [ ] **Step 1: Texte schreiben.**
- [ ] **Step 2: Gesamter Selbsttest grün** (`node scripts/works.mjs selftest`).
- [ ] **Step 3: Commit** `works: Live-Ansicht dokumentiert`
