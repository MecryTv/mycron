# Live-Ansicht im works-Board

Stand: 2026-11-20. Gewählter Entwurf: Variante A, siehe `2026-11-20-live-tracking-entwurf.html` (im Browser öffnen, Reiter „A Live-Ansicht“).

## Worum es geht

Der Nutzer will im Board live mitverfolgen, wie weit Claude mit den Aufgaben ist: an welcher Aufgabe Claude arbeitet, bei welchem Schritt des Umsetzungsplans, was gerade passiert, was parallele Agenten tun und wie die Prüfungen (typecheck, lint, test, build, code-audit) stehen. Heute gibt es dafür nur die Pille „Claude arbeitet an …“ im Kopf und einen kleinen Kasten auf der Karte in Arbeit. Prüfungen sieht man nur im Abschluss-Dialog.

## Ziele

- Neue Ansicht **Live** als siebter Reiter neben Board, Sprint, Warteschlange, Zeitleiste, Abhängigkeiten und Tabelle, erreichbar mit Taste `7`.
- Auf einen Blick: aktuelle Aufgabe und Schritt, was Claude gerade tut, Fortschritt des Tages, parallele Agenten, was auf den Nutzer wartet.
- Prüfungen aller Aufgaben des Tages sind in der Ansicht sichtbar, auch während sie laufen.
- Alles aktualisiert sich ohne Neuladen. Zeitangaben („seit 0:42“) zählen jede Sekunde weiter.

## Nicht-Ziele

- Keine Live-Leiste unten im Board (Variante B) und keine eigene Monitor-Seite (Variante C).
- Keine Kosten- oder Token-Anzeige in der Live-Ansicht. Die gibt es im Reiter Zeit.
- Keine neuen Browser-Benachrichtigungen. Die bestehenden Hinweise unten rechts bleiben, wie sie sind.
- Keine Live-Ansicht in der statischen `board.html` und im Export.
- Keine Änderung am Ablauf Review und Abschluss: Prüfungen laufen weiter bei `works done` oder „Jetzt prüfen“, auch wenn die Aufgabe schon im Review steht.

## Anti-Ziele

- Die Ansicht darf das Board nicht träge machen. `activity.json` ändert sich bei jedem Werkzeugaufruf, deshalb kein `git`-Aufruf und kein Lesen aller Aufgaben-Dateien zusätzlich pro Änderung.
- Status nie nur über Farbe: Jeder Zustand hat ein eigenes Symbol und einen Text.
- Bewegung nur mit Ersatz bei „reduzierte Bewegung“ (pulsierende Punkte und Spinner stehen dann still).

## Ansätze

Drei Varianten wurden als klickbarer Entwurf gezeigt:

| Variante | Kurz | Nachteil |
|---|---|---|
| **A Live-Ansicht** | Eigener Reiter mit Tagesliste, Fokus-Aufgabe und Prüfungsspalte | Man muss in die Ansicht wechseln |
| B Live-Leiste | Leiste unten in jeder Ansicht, Details zum Aufklappen | Eingeklappt wenig Platz, mehrere Agenten werden eng |
| C Monitor | Eigene Seite mit großer Schrift für einen zweiten Bildschirm | Nur Ansehen, zum Eingreifen zurück ins Board |

Der Nutzer hat **A** gewählt. A zeigt am meisten auf einmal und passt in das vorhandene Ansichtssystem des Boards. Die Pille im Kopf führt direkt in die Ansicht, damit sich der Nachteil kaum bemerkbar macht.

## Aufbau der Ansicht

Vorbild ist der Entwurf. Farben, Schrift und Bausteine (`.btn`, `.tag`, `.ck`, Tokens aus `board.css`) kommen aus dem bestehenden Board, nichts davon wird neu erfunden.

1. **Vier Kacheln oben**
   - *Claude arbeitet gerade*: ID der aktuellen Aufgabe, „Schritt n von m“, aktuelle Aktion (Verb und Datei oder Befehl). Ist Claude nicht aktiv: „Claude wartet seit HH:MM“. Ein Klick wählt diese Aufgabe als Fokus und schaltet das Mitlaufen wieder ein (siehe Fokus).
   - *Fortschritt heute*: „x von y fertig“, wobei fertig Review plus Erledigt heißt. Darunter ein Segmentbalken mit einem Segment je Aufgabe der Tagesliste, eingefärbt nach Phase, und eine Zeile wie „1 erledigt · 1 im Review · 2 in Arbeit · 2 warten“.
   - *Parallel*: Anzahl aktiver Agenten (Aufgaben in `lanes.json`) mit Aufgabe und Phase, sonst „Kein Agent aktiv“.
   - *Wartet auf dich*: Aufgaben im Review, Funde (`warn`) und Fehlschläge (`fail`) in Prüfungen offener Aufgaben, offene Fragen an Aufgaben in Arbeit. Jeder Eintrag ist ein Knopf, der die Aufgabe als Fokus wählt. Leer: „Nichts“. Die Kachel ist bernsteinfarben hinterlegt, sobald etwas wartet.
2. **Links: Tagesliste „Heute“** mit allen Aufgaben, die in Arbeit sind, im Review stehen, in der Warteschlange stehen oder heute erledigt wurden (`completed` = heutiges Datum). Reihenfolge: in Arbeit (die Aufgabe der Hauptsitzung zuerst, dann Agenten), Review, Warteschlange in Queue-Reihenfolge, heute erledigt. Jede Zeile zeigt Symbol, ID, Agent-Etikett, Priorität, Titel, Statuszeile und einen Fortschrittsbalken. Ein Klick wählt die Aufgabe als Fokus.
3. **Mitte: Fokus-Aufgabe**
   - Kopf: ID, Priorität, Typ, Branch, Agent-Etikett, Starttag.
   - Phasenleiste: Gestartet, Umsetzung, Prüfungen, Review, Erledigt. Die aktuelle Phase ist anteilig gefüllt (Schritte bzw. Prüfungen), darunter eine kurze Zeile („3 von 6 Schritten“, „2 von 5“, „wartet auf dich“).
   - Umsetzungsplan als senkrechte Schrittliste: erledigt mit Uhrzeit des Abhakens, aktueller Schritt hervorgehoben mit „seit x min“, offene Schritte grau. Darunter „Akzeptanzkriterien: a von b abgehakt“.
   - „Gerade jetzt“: Verb, Datei oder Befehl, „seit m:ss“ und der aktuelle Schritt (genaue Regeln in 3b). Im Review stattdessen „Claude ist fertig, wartet seit … auf deine Abnahme“ mit Knopf **Abnehmen** (öffnet den vorhandenen Abnahme-Dialog `openReview`).
   - Verlauf mit Umschalter „Diese Aufgabe / Alle“: Werkzeugaufrufe aus `activity.json`, dazu abgehakte Schritte und abgeschlossene Prüfungen, neueste oben, höchstens sieben Einträge.
   - Eingabe „Anweisung an Claude“ wie im Detailpanel, nur mit Bearbeitungsrecht. Darunter der Hinweis, wenn schon eine Anweisung wartet.
   - Aufgaben in der Warteschlange zeigen statt Plan und Verlauf nur „Noch nicht gestartet“ mit ihrem Platz.
4. **Rechts: Prüfungen** für alle Aufgaben der Tagesliste mit eingerichteten Prüfungen, gruppiert je Aufgabe. Reihenfolge: läuft gerade, Fund oder Fehler, noch nicht gelaufen, alles bestanden.
   - Laufende Prüfung: Spinner, „läuft 24 s“ (live).
   - Fund: Hinweistext und die vorhandenen Knöpfe „Claude beheben lassen“ und „Als bekannt markieren“ (gleiche Aktionen wie im Abschluss-Dialog).
   - Fehlgeschlagen: die letzten Zeilen der Ausgabe aufklappbar.
   - Noch nicht gelaufen: eine Zeile „Laufen, sobald Claude die Aufgabe abschließt: typecheck, lint, …“.
   - Alle bestanden: eingeklappt zu „Alle 5 bestanden, HH:MM“.
   - Ohne eingerichtete Prüfungen: Hinweis, dass Prüfungen in den Werkzeugen eingerichtet werden können.
5. **Kopfzeile**: Die vorhandene Pille „Claude arbeitet an …“ öffnet die Live-Ansicht statt die Karte anzusteuern. Der Reiter „Live“ trägt einen pulsierenden Punkt, solange Claude aktiv ist.

Breiten: drei Spalten ab 1280 px, darunter wandert die Prüfungsspalte unter Liste und Fokus, unter 820 px ist alles einspaltig. Kacheln: vier, dann zwei, dann eine je Zeile. Kein seitliches Scrollen der Seite bei 375 px; auf dem Handy zeigt die Phasenleiste nur den Namen der aktuellen Phase.

## Phasen

Prüfungen laufen in works bei `works done` oder über „Jetzt prüfen“ im Abschluss-Dialog, also oft erst, wenn die Aufgabe schon im Review steht (Abnahme im Board führt über `openReview` in den Abschluss-Dialog). Die Phase richtet sich deshalb danach, ob gerade eine Prüfung läuft, nicht nur nach dem Status. Geprüft wird in dieser Reihenfolge, die erste passende Zeile gilt:

| Phase | Bedingung |
|---|---|
| Erledigt | Status erledigt |
| Prüfungen | eine Prüfung läuft (`checks.running` gesetzt), egal bei welchem Status |
| Review | Status review |
| Umsetzung | Status in-arbeit |
| Warteschlange | Status geplant oder backlog und in `meta.queue` |

Die Phasenleiste zeigt jeden Abschnitt für sich, nicht als starre Folge:

| Abschnitt | erledigt | aktuell | sonst |
|---|---|---|---|
| Gestartet | Aufgabe ist nicht mehr in der Warteschlange | – | „noch nicht“ |
| Umsetzung | Status review oder erledigt, oder alle Schritte abgehakt | Phase Umsetzung | „n von m Schritten“ |
| Prüfungen | jede eingerichtete Prüfung hat ein Ergebnis `ok` oder `ack` | Phase Prüfungen („2 von 5“) | „1 Fund“, „noch nicht gelaufen“ oder „keine eingerichtet“ |
| Review | Status erledigt | Status review („wartet auf dich“) | leer |
| Erledigt | Status erledigt | – | leer |

Eine Aufgabe ohne Umsetzungsplan zeigt nirgends „Schritt 0 von 0“, sondern nur die Phase.

## Fokus

Die Mitte folgt standardmäßig der Aufgabe, an der Claude gerade arbeitet (`activity.current.task`, sonst die erste Aufgabe in Arbeit, sonst die erste der Tagesliste). Wählt der Nutzer selbst eine Aufgabe, bleibt sie im Fokus, auch wenn Claude wechselt. Ein Klick auf die Kachel „Claude arbeitet gerade“ oder die Pille im Kopf schaltet das Mitlaufen wieder ein. Verschwindet die gewählte Aufgabe aus der Tagesliste, folgt die Ansicht wieder Claude. Gewählte Aufgabe und Verlaufsfilter werden wie andere Ansichtseinstellungen im Browser gemerkt.

## Datenänderungen

### 1. Schritte im Board (`board.mjs`)

Jede Aufgabe der Tagesliste bekommt `plan: [{ text, done, at }]` aus dem ersten nicht leeren Abschnitt von Umsetzungsplan, Vorgehen oder Checkliste (Parser `checkboxes` aus `lib.mjs`). Andere Aufgaben bekommen kein `plan`, damit die Daten klein bleiben.

### 2. Uhrzeit abgehakter Schritte (`steps.json`)

`task.md` speichert nicht, wann ein Häkchen gesetzt wurde. Neue kleine Funktion `stampSteps(root, task)` (in `live.mjs`): Sie vergleicht die abgehakten Schritte mit `.works/steps.json` (`{ "W-0014": { "<Schritttext>": "<ISO-Zeit>" } }`). Neu abgehakte Schritte bekommen die Änderungszeit der `task.md`, wieder geöffnete verlieren ihren Eintrag. Aufgerufen wird sie:

- im PostToolUse-Hook für die Aufgabe, der der Aufruf zugeordnet ist (aktive Aufgabe oder Bahn), damit die Zeit stimmt, auch wenn kein Board läuft;
- in `boardData` für die Aufgaben der Tagesliste, damit Häkchen aus dem Board oder von Hand ebenfalls eine Zeit bekommen.

`steps.json` kommt in die automatisch gepflegte `.gitignore` von `.works/` (wie `activity.json`). Bekannte Grenze: Werden mehrere Schritte zwischen zwei Beobachtungen abgehakt, bekommen sie dieselbe Uhrzeit.

### 3. Zwischenstand der Prüfungen (`checks.mjs`)

`runChecks` schreibt `checks.json` heute erst am Ende. Neu:

- vor jeder Prüfung: `running: "<name>"`, `runningSince: "<ISO-Zeit>"`;
- nach jeder Prüfung: Ergebnis mit eigener Zeit `at`, `running` entfernt;
- am Ende wie bisher `at` und `fingerprint` des Gesamtlaufs.

`running` gilt als veraltet, wenn `runningSince` älter als die Zeitgrenze einer Prüfung (10 Minuten) plus eine Minute ist, etwa nach einem abgebrochenen Prozess. Das entscheidet `boardData`, nicht der Browser. Skill-Prüfungen wie code-audit haben kein „läuft“: Der Skill-Aufruf ist sofort fertig, die eigentliche Prüfung besteht aus vielen einzelnen Aufrufen. Sie zeigen wie bisher „trägt Claude ein“, bis Claude das Ergebnis mit `works checks record` einträgt.

### 3a. Prüfungen paralleler Aufgaben laufen im Worktree (`checks.mjs`, `parallel.mjs`)

Entscheidung des Nutzers: Agenten lassen die eingerichteten Prüfungen über works laufen, damit sie live erscheinen. Heute würde `works checks run` aus einem Worktree im Hauptprojekt laufen, weil `findRoot` über `.works.link` dorthin zeigt. Neu:

- Neue Funktion `checkDir(root, task)` in `checks.mjs`: Pfad des Worktrees, wenn die Aufgabe in `lanes.json` steht und der Ordner existiert, sonst `root`.
- `runChecks`, `recordCheck` und `checkItems` nutzen `checkDir` für das Arbeitsverzeichnis der Befehle und für `workFingerprint`.
- Regel 6 im Agenten-Auftrag (`lanePrompt` in `parallel.mjs`): Sind Prüfungen eingerichtet, `works checks run <ID>` ausführen, Fehler und Funde beheben und erneut laufen lassen, Skill-Prüfungen selbst ausführen und mit `works checks record` eintragen. Ohne eingerichtete Prüfungen bleibt der bisherige Satz.

### 3b. Genaue Jetzt-Anzeige mit PreToolUse-Hook

Entscheidung des Nutzers: Ein neuer Hook `hooks/pre-tool.mjs` meldet jeden Werkzeugaufruf beim Start. Kosten: etwa 0,2 Sekunden pro Aufruf (gemessen unter Windows).

- `recordActivity` bekommt die Option `running`. Mit `running: true` setzt sie nur `current` (bzw. `lanes[task]`) mit `running: true`, ohne einen Eintrag in `recent`. Der PostToolUse-Hook schreibt wie bisher den fertigen Aufruf nach `recent` und setzt `current` mit `running: false`.
- Die Zuordnung eines Aufrufs zu Aufgabe und Worktree, die heute im PostToolUse-Hook steht, wandert als `callTarget(root, input)` nach `live.mjs`. Beide Hooks nutzen sie.
- Der PreToolUse-Hook macht sonst nichts: keine Anweisungen, keine Dateien, keine Schritte. Er beachtet `live_activity: false`.
- Eingetragen in `plugins/works/hooks/hooks.json` (Timeout 5 Sekunden) und in `works install-hooks`.
- Anzeige: Läuft der Aufruf noch, heißt die Kachel „Gerade jetzt“ mit „seit m:ss“ ab Start. Ist er fertig und Claude noch aktiv, steht dort „Claude denkt nach“ und darunter „Zuletzt: …, vor m:ss“.

### 4. Prüfungen im Board (`board.mjs`)

Jede Aufgabe der Tagesliste bekommt `checks: { list: [{ name, cmd, skill }], results, running, runningSince, at }` aus `checksFor` und `loadResults`. Keine Neuberechnung von „veraltet“ über `workFingerprint` (das wäre ein `git diff` pro Werkzeugaufruf). Die Ansicht zeigt stattdessen die Uhrzeit des letzten Laufs. Ob ein Ergebnis zum aktuellen Stand passt, prüft weiterhin der Abschluss-Dialog.

### 5. Verlauf (`live.mjs`, `board.mjs`)

`activity.json` behält künftig die letzten 40 statt 24 Aufrufe, und das Board bekommt alle statt 12. Einträge für abgehakte Schritte und fertige Prüfungen baut das Board selbst aus `plan[].at` und den Prüfungszeiten, es gibt dafür keine zweite Liste.

### 6. Server

Keine neue Route. `serve.mjs` beobachtet `checks.json` und `activity.json` schon und schickt bei Änderungen neue Daten. `steps.json` muss nicht in die Signatur, weil es sich nur zusammen mit einer `task.md` oder `activity.json` ändert.

## Rechte

- Nur ansehen (geteilter Link, `MODE === 'view'`): Ansicht sichtbar, ohne Anweisungsfeld und ohne Knöpfe für Funde und Abnahme.
- Statische `board.html` und Export: kein Reiter Live (wie die anderen `data-live`-Elemente).
- Prüfungen ausführen bleibt wie bisher lokalen Anfragen vorbehalten. Die Live-Ansicht startet selbst keine Prüfungen.

## Barrierefreiheit

- Statussymbole mit Form und Text, Kontrast mindestens 4,5:1 für Text (Statustexte in `--text-2`, nur Symbole farbig).
- Unsichtbarer Bereich mit `aria-live="polite"` sagt an: Schritt erledigt, Prüfung fertig (mit Ergebnis), Aufgabe wartet auf Abnahme. Keine Ansage für jeden Werkzeugaufruf.
- Tastatur: Tagesliste und Knöpfe in „Wartet auf dich“ sind echte Knöpfe, Fokusrahmen wie im Board. Beim Aktualisieren bleiben Fokus und Text im Anweisungsfeld erhalten.
- `prefers-reduced-motion`: keine Puls- und Drehanimation, keine Einblendung neuer Verlaufseinträge.

## Prüfen

- Selbsttest (`selftest.mjs`) um drei Punkte erweitern:
  1. `boardData` liefert `plan` mit Zeit für einen per `works check <ID> <Nr> --section Umsetzungsplan` abgehakten Schritt. Nach `--undo` ist die Zeit weg.
  2. Während eines Prüfungslaufs steht `running` in `checks.json`. Prüfbar mit einer Prüfung, deren Befehl die eigene `checks.json` ausgibt: Ihre Ausgabe muss `"running"` mit ihrem Namen enthalten. Nach dem Lauf fehlt `running`, und jedes Ergebnis hat `at`.
  3. Die gerenderte Board-Seite enthält den Reiter Live und `#viewLive`.
  4. PreToolUse-Hook setzt `current.running`, ohne `recent` zu verlängern; der PostToolUse-Hook danach setzt `running: false` und hängt den Aufruf an `recent`.
  5. `works checks run` für eine parallele Aufgabe läuft im Worktree (Prüfbefehl gibt sein Arbeitsverzeichnis aus).
- Mit `--browser` (Playwright, falls installiert): Ansicht Live öffnen, keine Konsolenfehler, kein seitliches Scrollen bei 375 px.
- Von Hand: `works demo --simulate --open`, Ansicht Live, hell und dunkel.

## Dokumentation

- `references/board.md`: Ansichtenliste (Tasten `1` bis `7`), neuer Abschnitt Live-Ansicht.
- `references/hooks.md`: neuer Abschnitt PreToolUse, PostToolUse stempelt abgehakte Schritte, Beispielkonfiguration und Plugin-Liste um PreToolUse ergänzt.
- `references/parallel.md` und `references/planning.md` (Abschnitt Prüfungen): Prüfungen paralleler Aufgaben laufen im Worktree.
- `SKILL.md`: Zeile in „Wann was tun“ für „Live verfolgen, wie weit Claude ist“.
- `README.md` des Plugins: ein Satz zur Live-Ansicht.

## Entscheidungen nach dem Gegenlesen

Vom Nutzer entschieden: PreToolUse-Hook für eine genaue Jetzt-Anzeige (3b), Agenten nutzen `works checks run` im Worktree (3a).

Selbst entschieden, weil sie nichts am Ergebnis für den Nutzer ändern:

- Phase „Prüfungen“ hängt am laufenden Prüfungslauf statt am Status, weil Prüfungen oft erst im Review laufen. Der Ablauf Review und Abschluss bleibt unverändert.
- Skill-Prüfungen bekommen kein „läuft“, weil es dafür kein verlässliches Signal gibt.
- Ob `running` veraltet ist, entscheidet `boardData`, damit es im Selbsttest prüfbar ist.

## Dem Umsetzer überlassen

- Aufteilung des Codes in `board.js` (eigener Abschnitt „Live-Ansicht“ wie bei den anderen Ansichten).
- Ob `works demo --simulate` ein paar Werkzeugaufrufe und einen Prüfungslauf vorspielt, damit die Ansicht in der Demo lebt.
- Genaue Texte für leere Zustände, solange sie konkret sagen, was fehlt.
