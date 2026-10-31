# CLI-Referenz

Aufruf: `node "${CLAUDE_SKILL_DIR}/scripts/works.mjs" <befehl> [argumente]`. Benötigt Node.js 18 oder neuer, keine Abhängigkeiten. Arbeitet im nächstgelegenen Elternordner mit `.works/config.json`.

Werte, die mit `--` beginnen könnten, besser als `--name=wert` übergeben. Ist die Umgebungsvariable `WORKS_ACTOR` gesetzt, wird ihr Wert in eckigen Klammern an jeden Verlaufseintrag angehängt (das Board setzt `Board`).

IDs können kurz angegeben werden: `12`, `w12`, `W-12` und `W-0012` sind gleichwertig. Listen werden mit Komma getrennt. Datumswerte im Format `JJJJ-MM-TT`.

## Einrichtung

| Befehl | Wirkung |
|---|---|
| `init [--gitignore default\|assets\|all\|none] [--prefix W] [--path dir] [--force]` | Legt `.works/` mit allen Unterordnern, config.json, ideas.md und WORKS.md an |
| `install-hooks [--claude] [--git] [--scope user\|project\|local] [--dry-run]` | Richtet die Hooks ein, siehe hooks.md |

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
| `board --serve [--detach] [--port 4747] [--host 127.0.0.1] [--open]` | Live-Board auf einem lokalen Server, mit `--detach` im Hintergrund. Läuft schon ein aktueller Server, wird nur seine URL ausgegeben, ein veralteter wird ersetzt. Ist der Standardport belegt, wird der nächste freie genommen. Siehe board.md |
| `board --status` / `--restart` / `--stop` | Server abfragen, mit aktueller Version neu starten oder beenden |
| `board --restart --share` / `--private` | Im lokalen Netz teilen (Leselink mit Schlüssel) oder wieder nur lokal |
| `share [--owner] [--rotate]` | Links zum Teilen anzeigen, mit `--owner` auch den Bearbeitungslink, mit `--rotate` neue Schlüssel |
| `export [--out datei.html] [--no-images] [--open-only]` | Schnappschuss als eine HTML-Datei mit Details und eingebetteten Bildern, Standard in `.works/reports/` |
| `sprint [start\|add\|remove\|set\|close\|list]` | Sprint planen und verfolgen, siehe planning.md |
| `comments [<ID>]` / `comment <ID> "Text"` | Kommentare lesen (markiert als gelesen) und beantworten |
| `views` / `list --view "Name"` / `views delete "Name"` | Gespeicherte Ansichten |
| `template list\|show\|save\|delete` | Vorlagen verwalten |
| `new --template <slug> --field K=V --text ".." [--criteria 2,3]` | Aufgabe aus einer Vorlage |
| `time [<ID>] [--mode measured\|fixed] [--json]` | Zeiterfassung und Schätzgenauigkeit |
| `checks [detect [--save]\|set\|remove\|run <ID>\|record\|ack]` | Automatische Prüfungen vor dem Abschluss |
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
| `drop <ID> --reason ".."` | Verwerfen |
| `reopen <ID> --reason ".." [--status backlog\|geplant\|in-arbeit\|review]` | Wiedereröffnen, holt aus dem Archiv zurück |
| `archive [<ID> ...] [--all] [--older-than <Tage>]` | Erledigte und verworfene Aufgaben nach `archive/` verschieben |

## Assets und Entscheidungen

| Befehl | Wirkung |
|---|---|
| `asset <ID> <pfad\|inbox-datei> --desc ".." [--kind ..] [--alt ..] [--name ..] [--move] [--compress] [--origin ..]` | Datei nach assets/ kopieren (aus der Inbox verschieben), umbenennen und mit Beschreibung in die task.md eintragen |
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

## Was doctor prüft

Fehler: ungültiges oder fehlendes Frontmatter, fehlende Pflichtfelder, ungültige Werte, Ordnername passt nicht zur ID, doppelte IDs, offene Aufgaben im Archiv, Verweise auf unbekannte Aufgaben, Zyklen, zu kleine next_id, fehlende Bilder und verlinkte Dateien.

Warnungen: Beschreibung nicht im Hauptabschnitt des Typs oder fehlende Vorlagenabschnitte (`--fix` übernimmt die Beschreibung und ergänzt die Abschnitte, Inhalte bleiben erhalten; das passiert auch einmal automatisch beim Sessionstart), fehlender Aufwand, unbekannter Meilenstein, fehlende Akzeptanzkriterien, erledigt mit offenen Kriterien, laufende Aufgabe ohne oder mit veralteter Übergabe, unvollständige Aufgaben, Bilder ohne Alternativtext oder Beschreibungszeile, nicht referenzierte Assets, einseitige Abhängigkeiten, Dateien in der Inbox, ungültige aktive Aufgabe.

## Exit-Codes

`0` Erfolg, `1` Fehler oder nicht erfüllte Definition of Done. Fehlermeldungen gehen auf stderr und beginnen mit `Fehler:`, Hinweise mit `Hinweis:`.
