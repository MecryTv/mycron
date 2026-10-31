# Planung, Gespräch und Qualität

Sprint, Kommentare, Vorlagen, gespeicherte Ansichten, Zeiterfassung, automatische Prüfungen und der Wochenbericht. Alles lässt sich im Board und im Terminal nutzen.

## Sprint

Ein Sprint bündelt Aufgaben für einen festen Zeitraum mit einem Ziel. Standard: 14 Tage, Kapazität 20 Punkte, Punkte je Aufwand S 1, M 2, L 4, XL 8. Aufgaben ohne Schätzung zählen wie M. Ändern in `config.json` unter `sprint_settings`.

```
works sprint start --title "Backups live" --goal "Backups sichern Rollen und Rechte" [--days 14] [--capacity 20] [--start 2026-11-02] [--carry]
works sprint add W-0034,W-0016
works sprint remove W-0016
works sprint                  Stand mit Punkten und Aufgaben, --json für Maschinen
works sprint set capacity=24 end=2026-11-16 goal="..."
works sprint close            Ergebnis festhalten, offene Aufgaben merken
works sprint start --carry    offene Aufgaben des letzten Sprints übernehmen
works sprint list
```

Für Claude: Sprint-Aufgaben kommen in `works next` direkt nach der Warteschlange. `works status` nennt Sprint, Ziel und offene Aufgaben. Ist der Sprint überplant, das dem Nutzer sagen statt still weiter einzuplanen.

Im Board: Ansicht Sprint mit Kapazitätsbalken, Burndown mit Ideallinie, Liste der Aufgaben und Vorschlägen mit dem Hinweis, ob sie noch passen. Vorschläge per Ziehen oder + einplanen.

### Rückblick

Im Board öffnet "Sprint abschließen" den Rückblick: Kennzahlen (geschafft, Ziel, dazugekommen, vorheriger Sprint), Auffälligkeiten aus den Daten (schneller oder langsamer als geschätzt, nachträglich dazugekommen, offen geblieben, Verbrauch) und drei Fragen an den Nutzer. Die Antworten stehen danach unter `sprints[].retro`. Kapazität für den nächsten Sprint ist mit dem Mittel der geschafften Punkte vorbelegt. "Abschließen und nächsten planen" startet gleich den nächsten Sprint und übernimmt offene Aufgaben.

Im CLI: `works sprint close --good ".." --bad ".." --change ".." --next-capacity 16`.

Für Claude: Beim Planen des nächsten Sprints `retro.change` des letzten Sprints lesen und umsetzen, zum Beispiel weniger Punkte einplanen oder große Aufgaben vorher teilen.

## Kommentare

Ein Gespräch zwischen Nutzer und Claude pro Aufgabe, gespeichert in `comments.md` neben der task.md. Offene Fragen bleiben ein eigener Bereich mit Häkchen; Kommentare sind für alles andere: Hinweise, Rückfragen, Antworten, Aufträge.

```
works comments                 Aufgaben mit neuen Kommentaren vom Nutzer
works comments W-0034          alle Kommentare lesen (markiert sie als gelesen)
works comment W-0034 "Text"    antworten, Autor ist Claude
works comment W-0034 --file antwort.md
```

Für Claude: `works status` und der SessionStart Hook melden neue Kommentare. Vor der Arbeit an einer solchen Aufgabe zuerst `works comments <ID>` lesen, die Wünsche als Vorgabe behandeln und kurz antworten, was umgesetzt wurde oder was offen ist. Aufträge aus dem Abschluss-Dialog ("Bitte den Fund ... beheben") kommen ebenfalls als Kommentar.

## Gespeicherte Ansichten

Filterkombinationen mit Namen, etwa "Bot dringend" für P1 und P2 mit Tag bot ohne blockierte. Gespeichert in `config.json` unter `views`, damit sie für das ganze Projekt gelten. Im Board als Chips über dem Fortschritt; jeder Chip zeigt, wie viele offene Aufgaben passen. Welche Ansicht beim Öffnen erscheint, merkt sich der Browser.

```
works views                   alle Ansichten
works list --view "Bot dringend"
works views delete "Bot dringend"
```

## Vorlagen

Vorlagen liegen als JSON in `.works/templates/` (Projekt) oder `~/.works/templates/` (alle Projekte). Eine Vorlage hat Name, Titel mit Platzhaltern wie `{Seite}`, Typ, Priorität, Aufwand, Tags, Felder (Text oder Auswahl, Pflicht oder optional), einen Grundtext für die Beschreibung, Akzeptanzkriterien (immer, vorausgewählt oder optional) und Hinweise für Claude.

Beim Anlegen aus einer Vorlage füllt der Nutzer die Felder aus und beschreibt in "Was genau soll passieren?" mit eigenen Worten das Ziel. Dieser Text steht in der Beschreibung oben und hat Vorrang vor dem Grundtext der Vorlage, der darunter folgt.

```
works template list
works template show neuer-slash-befehl
works template save --from W-0034 --name "Backup-Feature" [--scope user]
works template save --file vorlage.json
works template delete neuer-slash-befehl
works new --template neuer-slash-befehl --field Befehl=backup --field Rechte=Admins --text "Was genau passieren soll" [--criteria 2,3]
```

`--criteria` wählt die Nummern (ab 0) der vorausgewählten und optionalen Kriterien; ohne die Angabe gelten alle außer den optionalen.

Für Claude: Ähneln sich mehrere neue Aufgaben stark, dem Nutzer eine Vorlage vorschlagen und sie nach Zustimmung mit `works template save --from <ID>` anlegen.

## Zeiterfassung

Der UserPromptSubmit Hook schreibt beim Absenden einer Anfrage einen Start, der Stop Hook beim Ende der Antwort einen Stop in `.works/time.jsonl`, jeweils für die aktive Aufgabe aus `works start`. Daraus entstehen:

- aktive Zeit von Claude je Aufgabe, zu Sitzungen gruppiert (Pausen über 20 Minuten trennen, eine einzelne Anfrage zählt höchstens 3 Stunden)
- Tage je Status aus dem Verlauf
- Schätzgenauigkeit: Kalendertage vom Start bis zum Abschluss je Aufwandsgröße

```
works time W-0034              Zeit und Sitzungen einer Aufgabe
works time                     Schätzung gegen tatsächliche Dauer
works time --mode measured     Zeitleiste und Sprint rechnen mit gemessenen Dauern (ab 3 Aufgaben je Größe)
works time --mode fixed        zurück zu festen Werten (S 2, M 5, L 10, XL 15 Tage, änderbar unter effort_days)
```

### Tokens und Kosten

Der Stop Hook liest nach jeder Antwort die neuen Einträge im Transkript und rechnet Eingabe, Ausgabe, Cache-Schreiben und Cache-Lesen der aktiven Aufgabe zu. Daraus schätzt works die Kosten nach `config.prices` (Standard sind die öffentlichen API-Preise je Million Tokens, siehe config.md).

`works time W-0034` zeigt Tokens und geschätzte Kosten der Aufgabe, `works time` den Verbrauch der letzten 30 Tage je Typ und die teuersten Aufgaben. Im Board: Tab Zeit einer Aufgabe und Werkzeuge, Verbrauch. Verbrauch ohne aktive Aufgabe wird gesondert ausgewiesen. Es sind Schätzungen, keine Abrechnung; bei einem Abo zeigen sie, wofür das Kontingent verbraucht wurde.

Abschalten: `"time_tracking": false` in `config.json`.

## Projektwissen

`.works/wissen.md` sammelt, was jede Session über das Projekt wissen muss: Fallen, Regeln, Eigenheiten, Zugänge ohne Geheimnisse. Bereiche sind `##`-Überschriften, Einträge `###` mit einer Kommentarzeile für ID, Autor, Quelle, Datum und Status (ok, vorschlag, veraltet). Die Datei gehört ins Git.

```
works know                     alles nach Bereich
works know search prisma       vor Arbeit in einem Bereich lesen
works know add --area "Datenbank" --title "Nur migrate deploy" --text "migrate dev löscht Daten"
works know propose --area ".." --title ".." --text ".." --source W-0013    Vorschlag von Claude
works know accept <kid> | flag <kid> | edit <kid> --text ".." | remove <kid>
```

Für Claude: Vorschläge machen, wenn etwas Zeit gekostet hat oder schiefgehen kann, nicht für Allgemeinwissen. Ein Eintrag ist kurz und konkret. Widerspricht ein Eintrag dem Code, mit `works know flag` markieren und den Nutzer fragen. Im Board unter Werkzeuge, Projektwissen: Vorschläge übernehmen, bearbeiten, ablehnen, suchen.

## Wiederkehrende Aufgaben

```
works recur add --title "Abhängigkeiten aktualisieren ({Monat})" --every monthly --nth 1 --weekday 1 --type chore --due_days 7
works recur add --title "Backup testen" --every daily --queue
works recur add --title "Logs prüfen" --every days:3 --template wartung
works recur                    Regeln mit den nächsten Terminen
works recur set R1 active=false
works recur run                fällige Regeln sofort anlegen
works recur remove R1
```

Angelegt wird beim Sitzungsstart und, solange das Board läuft, jede Minute. Ist die vorige Aufgabe einer Regel noch offen, entsteht keine zweite. Mit `--queue` kommt die neue Aufgabe in die Warteschlange, mit `--sprint` in den laufenden Sprint. Die Termine erscheinen auch im Kalenderexport mit `works ical --recurring`.

## Aufräumen

Im Board unter Werkzeuge, Aufräumen. Bewertet den Backlog mit einer Zahl von 0 bis 100 und listet:

- Hängt fest: lange ohne Bewegung in Arbeit oder Review. Aktionen: Übergabe anfordern (Kommentar an Claude), abnehmen, zurück ins Backlog
- Entwürfe ohne Wahl: Gestaltungsaufgaben, bei denen Claude auf den Nutzer wartet
- Unvollständig: ohne Beschreibung oder Kriterien, dazu Aufgaben ohne Aufwand
- Vermutlich doppelt: ähnliche offene Aufgaben nach Titel, Tags und Beschreibung. Zusammenführen verwirft eine und übernimmt ihre Beschreibung und offenen Kriterien als Kommentar in die andere
- Alt und unberührt: über 60 Tage im Backlog. Aktion: zu Idee machen

Schon beim Anlegen prüft works auf ähnliche offene Aufgaben: `works new` gibt einen Hinweis aus, das Board warnt im Dialog und bietet an, das Anliegen als Kommentar an die vorhandene Aufgabe zu hängen. Für Claude: Meldet `works new` eine ähnliche Aufgabe, kurz prüfen und den Nutzer fragen, ob es dieselbe ist.

## Automatische Prüfungen

Befehle, die vor dem Abschluss laufen, in `config.json` unter `checks`. `checks_by_type` legt fest, welche für welchen Typ gelten; ohne Eintrag gelten alle.

```json
"checks": {
  "typecheck": "npx tsc --noEmit",
  "lint": "npm run lint",
  "test": "npm test",
  "build": "npm run build",
  "audit": "skill:code-audit"
},
"checks_by_type": { "chore": ["typecheck", "lint"], "spike": [] }
```

```
works checks detect            Vorschlag aus package.json und tsconfig.json
works checks detect --save     Vorschlag speichern, nur nach Rückfrage beim Nutzer
works checks set test="npm test" build=     setzen oder mit leerem Wert entfernen
works checks run W-0034        alle Prüfungen ausführen, Ergebnis in checks.json der Aufgabe
works checks record W-0034 audit --status warn --note "restore.ts:88 ..."
works checks ack W-0034 audit --reason "bewusst so gelassen"
```

`works done` startet die Prüfungen selbst, wenn es für den aktuellen Stand (HEAD plus nicht committete Änderungen) noch kein Ergebnis gibt. Rot (`fail`) verhindert den Abschluss. Ein Fund (`warn`) braucht eine Entscheidung: beheben oder als bekannt markieren. Einträge mit `skill:` führt Claude aus, etwa den code-audit Skill, und trägt das Ergebnis mit `works checks record` ein: `ok` ohne Funde, `warn` mit kurzer Beschreibung der Funde, `fail` bei kritischen Funden.

Für Claude: Prüfungen nie ohne Zustimmung einrichten. Beim ersten Abschluss in einem Projekt ohne `checks` den Vorschlag aus `works checks detect` zeigen und fragen.

Im Board zeigt der Abschluss-Dialog jede Prüfung mit Ergebnis, Dauer und bei Fehlern die letzten Zeilen der Ausgabe. "Claude beheben lassen" schreibt einen Kommentar an Claude, "Als bekannt markieren" quittiert einen Fund.

## Wochenbericht

```
works report --week [--summary "zwei bis vier Sätze"] [--summary-file datei] [--send | --no-send]
works report --settings enabled=true weekday=5 time=16:00 discord=true
works report --webhook https://discord.com/api/webhooks/...     nur lokal gespeichert
works report --webhook                                         Webhook entfernen
```

Der Bericht landet als `reports/2026-KW44.md` und `.html` in `.works/`. Inhalt: Zusammenfassung, Zahlen (erledigt, begonnen, neu, überfällig), Erledigtes, was den Nutzer braucht (offene Fragen, Reviews, Überfälliges, Kommentare von Claude), der Plan für nächste Woche aus Warteschlange oder offenen Aufgaben, Meilensteine. Die HTML-Fassung folgt dem Farbschema des Boards, also hell oder dunkel.

Mit Discord eingeschaltet geht der Bericht als Embed an den hinterlegten Webhook. Die URL liegt nur in `.works/report.local.json` und ist von Git ausgenommen.

Für Claude: Ist ein Bericht fällig, meldet das der SessionStart Hook. Dann die Woche aus `works report --week --no-send` (Vorschau) und dem Verlauf in zwei bis vier sachlichen Sätzen zusammenfassen und `works report --week --summary "..."` ausführen.
