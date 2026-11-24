# CLI-Referenz

Aufruf: `node "${CLAUDE_SKILL_DIR}/scripts/works.mjs" <befehl> [argumente]`. Benötigt Node.js 18 oder neuer, keine Abhängigkeiten. Arbeitet im nächstgelegenen Elternordner mit `.works/config.json`.

Werte, die mit `--` beginnen könnten, besser als `--name=wert` übergeben. Ist die Umgebungsvariable `WORKS_ACTOR` gesetzt, wird ihr Wert in eckigen Klammern an jeden Verlaufseintrag angehängt (das Board setzt `Board`).

IDs können kurz angegeben werden: `12`, `w12`, `W-12` und `W-0012` sind gleichwertig. Listen werden mit Komma getrennt. Datumswerte im Format `JJJJ-MM-TT`.

## Einrichtung

| Befehl | Wirkung |
|---|---|
| `init [--gitignore default\|assets\|all\|none] [--prefix W] [--path dir] [--force]` | Legt `.works/` mit allen Unterordnern, config.json, ideas.md und WORKS.md an |
| `install-hooks [--claude] [--git] [--scope user\|project\|local] [--dry-run]` | Richtet die Hooks ein, siehe hooks.md |
| `install-cli [--dir ordner] [--no-path] [--dry-run] [--uninstall]` | Befehl `works` im Terminal ohne Claude: Startscript in `~/.works/bin`, Aufruf in `~/.local/bin` (Windows: `works.cmd` und `works.ps1` in `%USERPROFILE%\.works\bin`), PATH-Eintrag falls nötig. Das Startscript nimmt immer die neueste installierte Version. `works which` zeigt die verwendete Installation |
| `lang [de\|en] [--project] [--reset]` | Sprache von CLI, Hooks, Doku und neuen Aufgaben. `lang` zeigt die eingestellte Sprache, woher sie kommt und die verfügbaren. `lang de` stellt global um (`~/.works/settings.json`), `lang de --project` nur für dieses Projekt (`.works/config.json`), `lang --reset [--project]` entfernt die Einstellung. Vorrang: Umgebungsvariable `WORKS_LANG`, Projekt, global, sonst Englisch. Siehe config.md |
| `version`, `--version` | Version und Pfad des CLI |

## Erfassen

| Befehl | Wirkung |
|---|---|
| `new --type <typ> --title "..." [optionen]` | Neue Aufgabe aus Vorlage. Optionen: `--priority P1..P4` (Standard P3), `--effort S\|M\|L\|XL`, `--risk niedrig\|mittel\|hoch`, `--due`, `--milestone`, `--tags`, `--blocked-by`, `--blocks`, `--related`, `--source`, `--status` (Standard backlog), `--incomplete`, `--decisions` (legt decisions.md an), `--log-file pfad` (Bug-Log), `--context "..."` (Abschnitt Herkunft) |
| `idea "Text" [--tags a,b]` | Idee in ideas.md |
| `ideas` | Offene Ideen anzeigen |
| `promote I-001 [--type ..] [--priority ..] [--title ..]` | Idee wird Aufgabe (unvollständig markiert) |
| `idea-drop I-001 [--reason ..]` | Idee verwerfen |
| `scan [--create] [--marker FIXME,HACK] [--json]` | TODO, FIXME, HACK, XXX im Code finden und optional als Aufgaben anlegen |
| `gh-import [--state open\|closed\|all] [--limit 100] [--dry-run]` | GitHub Issues über die gh CLI importieren |
| `gh-export <ID> [--dry-run]` | Aufgabe als GitHub Issue anlegen (nur mit Zustimmung) |

## Ansehen

| Befehl | Wirkung |
|---|---|
| `list` | Offene Aufgaben nach Priorität. Filter: `--status`, `--priority`, `--type`, `--tag`, `--milestone`, `--blocked`, `--overdue`, `--incomplete`, `--all` (inklusive erledigter und archivierter), `--json` |
| `show <ID> [--section "Name"]` | Ganze task.md oder einen Abschnitt |
| `next [--n 3]` | Empfehlung für die nächste Aufgabe mit Begründung |
| `status` | Kurzübersicht wie beim Sessionstart |
| `index` | WORKS.md neu erzeugen |
| `board [--open]` | `.works/board.html` erzeugen und optional im Browser öffnen. Danach wird die Datei nach jeder Änderung automatisch neu erzeugt |
| `board --serve [--detach] [--port 4747] [--host 127.0.0.1] [--open]` | Live-Board auf einem lokalen Server, mit `--detach` im Hintergrund. Läuft schon ein aktueller Server, wird nur seine URL ausgegeben, ein veralteter wird ersetzt. Ohne `--port` nimmt es seinen zuletzt genutzten Port (sonst 4747); ist der belegt, den nächsten freien. `--open` öffnet nur, wenn noch kein works-Tab offen ist, auch keiner eines anderen Projekts. Siehe board.md |
| `board --status` / `--restart` / `--stop` | Server abfragen, mit aktueller Version neu starten oder beenden |
| `board --restart --share` / `--private` | Im lokalen Netz teilen (Leselink mit Schlüssel) oder wieder nur lokal |
| `share [--owner] [--rotate]` | Links zum Teilen anzeigen, mit `--owner` auch den Bearbeitungslink, mit `--rotate` neue Schlüssel |
| `export [--out datei.html] [--no-images] [--open-only]` | Schnappschuss als eine HTML-Datei mit Details und eingebetteten Bildern, Standard in `.works/reports/` |
| `export --json [--out datei.json] [--open-only] [--archive] [--images] [--designs] [--checks] [--no-comments] [--no-history] [--no-planning] [--no-knowledge]` | Das Board als JSON-Sicherung (format works-board): Aufgaben als ihre Dateien, Planung aus config.json, Projektwissen und Ideen; Bilder und Entwürfe nur auf Wunsch. Einlesen mit `import` |
| `sprint [start\|add\|remove\|set\|close\|list]` | Sprint planen und verfolgen, siehe planning.md |
| `comments [<ID>]` / `comment <ID> "Text"` | Kommentare lesen (markiert als gelesen) und beantworten |
| `views` / `list --view "Name"` / `views delete "Name"` | Gespeicherte Ansichten |
| `template list\|show\|save\|delete` | Vorlagen verwalten |
| `new --template <slug> --field K=V --text ".." [--criteria 2,3]` | Aufgabe aus einer Vorlage |
| `time [<ID>] [--mode measured\|fixed] [--json]` | Zeiterfassung und Schätzgenauigkeit |
| `time --today [--json]` | Verbrauch von heute: Tokens und geschätzte Kosten |
| `checks [detect [--save]\|set\|remove\|run <ID>\|record\|ack]` | Automatische Prüfungen vor dem Abschluss. `set name=befehl --cwd ordner` legt einen Arbeitsordner relativ zum Projekt fest, `set --file datei.json` setzt mehrere auf einmal (Name zu Befehl oder zu `{ "cmd": "..", "cwd": ".." }`, leerer Wert entfernt) |
| `report --week [--summary ..] [--send]`, `report --settings ..`, `report --webhook URL` | Wochenbericht als Markdown und HTML, optional an Discord |
| `queue` | Warteschlange des Nutzers anzeigen (`--json` für Maschinen) |
| `queue add <ID> [--pos N]` / `remove <ID>` / `move <ID> <N>` / `order A,B,C` / `clear` | Warteschlange bearbeiten |
| `queue set auto_next=true ask_before=true skip_blocked=true` | Ablauf nach dem Abschluss einstellen |
| `demo [--simulate] [--delay 6] [--open] [--port ..] [--path ordner]` | Beispielprojekt anlegen (Standard: Temp-Ordner `works-demo`) und Live-Board starten. `--simulate` spielt zehn typische Änderungen von Claude vor. Überschreibt nie ein echtes `.works` |
| `demo --remove [--path ordner]` | Demo-Server beenden und Demo-Ordner löschen |
| `milestone list` | Meilensteine mit Fortschritt |
| `milestone add M1 --title ".." [--due ..] [--desc ..]` | Meilenstein anlegen |
| `milestone set M1 status=erledigt due=2026-12-20` | Meilenstein ändern |

## Bearbeiten

| Befehl | Wirkung |
|---|---|
| `set <ID> feld=wert [feld=wert ...] [--reason ".."]` | Frontmatter-Felder ändern, Eintrag im Verlauf. `status=erledigt` nur über `done`, `status=verworfen` nur mit `--reason`. Leeren mit `feld=` oder `feld=-`. Eigene Felder mit `--custom` |
| `log <ID> "Text"` | Verlaufseintrag |
| `section <ID> "Name" --text ".." \| --file pfad` | Inhalt eines Abschnitts ersetzen. Ohne Text wird der Abschnitt ausgegeben. Verlauf und Assets sind ausgenommen |
| `check <ID> <Nr> [--section Akzeptanzkriterien] [--undo]` | Punkt einer Checkliste abhaken oder wieder öffnen. Gezählt wird ab 1, Kommentare zählen nicht |
| `item <ID> "Text" [--section Akzeptanzkriterien]` | Punkt an eine Checkliste anhängen. Mit `--remove <Nr>` entfernen. Abschnitte: Akzeptanzkriterien, Umsetzungsplan, Checkliste, Vorgehen |
| `question <ID> "Frage"` | Offene Frage hinzufügen |
| `question <ID>` | Offene Fragen nummeriert anzeigen |
| `question <ID> --resolve <Nr> [--answer ".."]` | Frage abhaken, Antwort anhängen |
| `link <A> blocks\|blocked-by\|related <B>` | Beziehung beidseitig setzen, Zyklen werden abgelehnt |
| `unlink <A> <beziehung> <B>` | Beziehung entfernen |
| `start <ID> [--git] [--force]` | Status in-arbeit, aktive Aufgabe, Branchvorschlag, Kontextausgabe. `--git` checkt den Branch aus, `--force` startet trotz Blockade |
| `handoff [<ID>]` | Übergabe anzeigen (ohne ID die aktive Aufgabe) |
| `handoff <ID> --text ".." \| --file pfad` | Übergabe ersetzen |
| `dod <ID> [--json]` | Definition of Done anzeigen und automatische Punkte prüfen |
| `done <ID> [--run] [--confirm] [--force --reason ".."] [--no-checks]` | Abschließen. Ohne `--confirm` nur prüfen. Eingerichtete Prüfungen (`checks`) laufen automatisch, wenn es für den aktuellen Stand kein Ergebnis gibt. `--run` führt zusätzlich `dod.commands` aus |
| `ship [<ID>] [--no-push] [--no-ci] [--no-update] [--no-open]` | Abschluss in einem Rutsch auf dem Feature-Branch: Definition of Done, keine offenen oder neuen Dateien außerhalb von `.works`, Board stoppen (bei Abbruch und am Ende auf demselben Port neu gestartet), `WORKS.md` und `time.jsonl` zurücksetzen (neue Zeiten bleiben erhalten), Merge mit `--no-ff`, `done --confirm`, `.works` committen, pushen, Branch löschen, CI abwarten (ci-watch), in Marketplace-Repos Plugins aktualisieren, Board neu starten. Hält mit Exit 1 an, wenn etwas nicht stimmt. Skill `works:ship` |
| `drop <ID> --reason ".."` | Verwerfen |
| `reopen <ID> --reason ".." [--status backlog\|geplant\|in-arbeit\|review]` | Wiedereröffnen, holt aus dem Archiv zurück |
| `archive [<ID> ...] [--all] [--older-than <Tage>]` | Erledigte und verworfene Aufgaben nach `archive/` verschieben |

## Assets und Entscheidungen

| Befehl | Wirkung |
|---|---|
| `asset <ID> <pfad\|inbox-datei> --desc ".." [--kind ..] [--alt ..] [--name ..] [--move] [--compress] [--origin ..]` | Datei nach assets/ kopieren (aus der Inbox verschieben), umbenennen und mit Beschreibung in die task.md eintragen |
| `shot [board\|sprint\|queue\|timeline\|graph\|table\|live\|<ID>] \| --url <adresse\|datei> [--widths 1440,390] [--themes light,dark] [--out ordner] [--name ..] [--asset <ID> --kind vorher\|nachher --desc ".."]` | Screenshots mit dem installierten Chrome über Playwright: eine Board-Ansicht, das Detail einer Aufgabe oder eine Seite des Projekts. Meldet seitliches Scrollen und Fehler (Exit 1), ohne Playwright Exit 2. `--name` bestimmt den Dateinamen (`<name>-<schema>-<breite>.png`), sonst URL, Ansicht oder ID. Mit `--asset` als Bild an die Aufgabe, der Name trägt Schema und Breite (für den Vergleich in der Abnahme). `--scenario <datei.mjs>` stellt vorher einen Zustand in Wegwerf-Projekten her und räumt danach auf, siehe `references/de/scenarios/README.md`. Ohne laufenden Board-Server startet works einen und beendet ihn danach |
| `inbox [--json]` | Dateien in der Inbox anzeigen |
| `compress [<ID>]` | Bilder mit sharp verkleinern |
| `decisions <ID>` | decisions.md anlegen, falls nicht vorhanden, und Pfad ausgeben |
| `decisions <ID> --add "Titel" [--decision ..] [--why ..] [--rejected "A: Grund,B: Grund"] [--context ..] [--consequences ..] [--source ..]` | Neuen E-Block anhängen |
| `attach-doc <ID> <pfad> [--mode link\|copy\|move] [--label ..]` | Dokument verlinken oder übernehmen, Eintrag unter Quellen in decisions.md |

## Auswertung

| Befehl | Wirkung |
|---|---|
| `commits <ID> [--write]` | Commits mit der ID, mit `--write` als Abschnitt in die task.md |
| `changelog [--since ..] [--until ..] [--milestone ..] [--version ..] [--include-internal] [--write]` | Changelog aus erledigten Aufgaben, mit `--write` oben in CHANGELOG.md |
| `report [--days 7] [--write]` | Bericht, mit `--write` nach `.works/reports/` |
| `doctor [--fix] [--strict] [--quiet]` | Konsistenzprüfung. `--fix` korrigiert next_id, einseitige Abhängigkeiten und ungültige aktive Aufgabe. `--strict` wertet Warnungen als Fehler |

## Entwürfe

| Befehl | Wirkung |
|---|---|
| `design [show] <ID> [--json]` | Designrichtung, Varianten, Brainstorming und Wahl anzeigen |
| `design direction <ID> [--file pfad] [--text ..] [--colors "Name #hex,.."] [--fonts "A,B"] [--source ui-ux-pro-max]` | Designrichtung speichern |
| `design add <ID> --name A --title ".." --file pfad [--note ..] [--source ..]` | Variante als HTML, Bild oder Datei anhängen. Warnt, wenn ein HTML-Entwurf lokale Dateien lädt, die das Board nicht anzeigt |
| `design brainstorm <ID> --file pfad [--title ..] [--source superpowers]` | Brainstorming-Dokument anhängen |
| `design choose <ID> <Name> [--reason ..]` | Variante wählen, landet in decisions.md |
| `design remove <ID> <Name>` | Variante entfernen |

## Projektwissen, Anweisungen, Wiederkehrendes

| Befehl | Wirkung |
|---|---|
| `know [list] [--json]`, `know search <Text>` | Projektwissen lesen |
| `know add --area ".." --title ".." --text ".." [--file pfad]` | Eintrag anlegen |
| `know propose --area ".." --title ".." --text ".." [--source W-0013]` | Vorschlag, den der Nutzer übernimmt |
| `know accept\|flag\|remove\|reject <kid>`, `know edit <kid> [--title] [--text] [--area] [--ok]` | Einträge pflegen |
| `instruct <ID> "Text"` | Anweisung für die laufende Arbeit, zusätzlich als Kommentar |
| `recur [list]` | Regeln mit den nächsten drei Terminen |
| `recur add --title ".." --every daily\|weekly\|monthly\|days:N [--weekday 1-7] [--nth 1-5] [--day 1-31] [--interval N] [--start JJJJ-MM-TT] [--template slug] [--type ..] [--priority ..] [--effort ..] [--tags ..] [--description ..] [--status geplant\|backlog] [--due_days N] [--queue] [--sprint]` | Regel anlegen |
| `recur set R1 feld=wert ...`, `recur remove R1`, `recur run` | Regel ändern, löschen, fällige sofort anlegen |
| `sprint close [--good ..] [--bad ..] [--change ..] [--next-capacity N]` | Sprint mit Rückblick abschließen |

## GitHub, Kalender, Rückgängig, Übersicht

| Befehl | Wirkung |
|---|---|
| `github [sync] [--quiet]` | Abgleich mit PRs, CI, Reviews und Issues |
| `github status` | Repository, letzter Lauf, letzte Ereignisse, Einstellungen |
| `github set enabled=false issues=false labels=bug,works interval_min=5` | Einstellungen unter `github_sync` |
| `ical [--out datei.ics] [--recurring]` | Kalender mit Fälligkeiten, Meilensteinen, Sprints, optional kommende wiederkehrende Aufgaben |
| `undo --list`, `undo [<key>]` | Änderungen aus dem Board zurücknehmen, ohne Key die letzte |
| `hub [--port 4740]`, `hub --list` | Hub mit allen Projekten im Browser (dieselbe Seite wie `/hub` an jedem Board) oder als Text |
| `time [<ID>]` | zusätzlich Tokens und geschätzte Kosten |

## Discord-Bot works

Ein Bot je Rechner für alle Projekte. Alles liegt in `~/.works/discord`, nie im Projekt. Details in integrations.md.

| Befehl | Wirkung |
|---|---|
| `discord` | Stand und nächster Schritt der Einrichtung (gemeinsamer oder eigener Bot), Token und Schlüssel nur maskiert |
| `discord link <Code>` | Mit dem gemeinsamen Bot koppeln. Den Code gibt `/works verbinden` in Discord, im Kanal, in den works schreiben soll |
| `discord unlink` | Kopplung lösen: Schlüssel beim Dienst widerrufen und lokal löschen, Bot stoppen |
| `discord token` | Token prüfen und speichern. Liest von der Eingabe (versteckt) oder aus einer Pipe, nie als Argument: `Get-Clipboard \| works discord token`. Gibt den Einladungslink aus |
| `discord channel [name\|id]` | Textkanäle live vom Bot zeigen (ohne Schreibrecht mit Grund) oder den Kanal für Dashboard und Hinweise wählen. Beim gemeinsamen Bot die Kanäle des gekoppelten Servers. Ein laufender Bot zieht das Dashboard ohne Neustart um |
| `discord set k=v ..` | `service` (Adresse des gemeinsamen Bots, nur https), `autostart`, `auto_enroll`, `delay.perm`, `delay.idle` (Sekunden), `quiet.on`, `quiet.from`, `quiet.to` (HH:MM), `privacy.commands\|costs\|ci_error\|titles`, `cleanup.hours` (Nachrichten außer dem Dashboard nach so vielen Stunden löschen, Standard 24, 0 nie), `event.<name>` und `event.<name>.at` (Erwähnung), `project.<id>` (Hinweise eines Projekts an oder aus; die id setzt das Board im Dialog Discord-Bot) |
| `discord test` | Testnachricht in den Kanal |
| `discord start\|stop\|restart` | Bot-Prozess; startet sonst mit dem Board und beim Sitzungsstart |
| `discord emit <ship\|ci\|report> --json '{..}'` | Ereignis in die outbox legen (für ship, ci-watch, Berichte). Ohne Einrichtung passiert nichts |
| `discord disconnect` | Token löschen und Bot stoppen |

## Dateien, Parallelarbeit, Import, Selbsttest

| Befehl | Wirkung |
|---|---|
| `file <pfad> [--json]` | Aufgaben, die die Datei geändert haben (Commits mit ID und Edits während einer aktiven Aufgabe), mit Status und Entscheidungen |
| `files [<ID>] [--json]` | Dateien einer Aufgabe und welche anderen Aufgaben sie ebenfalls geändert haben |
| `parallel plan [A,B] [--max 3] [--json]` | Einschätzung: parallel, nacheinander oder unsicher, mit Gründen, Bahnen, Aufgaben für danach und ungeeigneten Aufgaben |
| `parallel start A,B [--force]` | Worktree und Branch je Aufgabe, Status In Arbeit |
| `parallel prompt <ID>` | Auftrag für den Agenten dieser Bahn |
| `parallel status [--json]` | Bahnen mit Branch, Commits, offenen Dateien |
| `parallel finish <ID> [--merge] [--force]` | Worktree entfernen, mit `--merge` in den Basis-Branch mergen. Status geht nach Review |
| `parallel abort <ID> [--force]` | Worktree entfernen, Branch ohne Commits löschen, Status zurück nach Geplant |
| `import <datei> [--format ..] [--map feld=Spalte,..] [--sheet ..] [--json] [--all]` | Vorschau mit Duplikaten, siehe import.md |
| `import <sicherung.json> [--apply] [--mode merge\|restore] [--only 1,4]` | works-Sicherung aus `export --json`: Vorschau mit neu, geändert, gleich, nur hier. `--apply` führt zusammen (neue Aufgaben mit freien IDs, gewählte geänderte übernehmen), `--mode=restore` ersetzt den Stand und sichert ihn vorher in `.works/backups/`. Beides mit `undo` rückgängig |
| `import <datei> --apply [--only 1,4] [--skip 3] [--status geplant] [--tags ..] [--include-done] [--keep-dups] [--include-archived]` | Anlegen |
| `selftest [--browser] [--keep] [--verbose] [--only <text>]` | Prüft CLI, Hooks, Import, Dateien, Parallelarbeit, Server und API in einem Wegwerfprojekt. Exit 1 bei Fehlern. `--only` führt nur Schritte aus, deren Name den Text enthält (für eigenständige Schritte wie `works ship`) |

Im Worktree einer parallelen Aufgabe (erkennbar an `.works.link`) arbeitet das CLI auf der `.works` des Hauptprojekts. `start` ändert dort die aktive Aufgabe nicht, `done` ist gesperrt.

## Was doctor prüft

Fehler: ungültiges oder fehlendes Frontmatter, fehlende Pflichtfelder, ungültige Werte, Ordnername passt nicht zur ID, doppelte IDs, offene Aufgaben im Archiv, Verweise auf unbekannte Aufgaben, Zyklen, zu kleine next_id, fehlende Bilder und verlinkte Dateien.

Warnungen: Beschreibung nicht im Hauptabschnitt des Typs oder fehlende Vorlagenabschnitte (`--fix` übernimmt die Beschreibung und ergänzt die Abschnitte, Inhalte bleiben erhalten; das passiert auch einmal automatisch beim Sessionstart), fehlender Aufwand, unbekannter Meilenstein, fehlende Akzeptanzkriterien, erledigt mit offenen Kriterien, laufende Aufgabe ohne oder mit veralteter Übergabe, unvollständige Aufgaben, Bilder ohne Alternativtext oder Beschreibungszeile, nicht referenzierte Assets, einseitige Abhängigkeiten, Dateien in der Inbox, ungültige aktive Aufgabe.

## Exit-Codes

`0` Erfolg, `1` Fehler oder nicht erfüllte Definition of Done. Fehlermeldungen gehen auf stderr und beginnen mit `Fehler:`, Hinweise mit `Hinweis:`.
