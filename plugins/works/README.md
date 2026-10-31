# works

works ist eine Aufgabenverwaltung für Claude Code. Alle Aufgaben eines Projekts liegen als Markdown im Ordner `.works/`, jede mit eigener Datei für Beschreibung, Akzeptanzkriterien, Verlauf, Übergabe, Bilder und Designentscheidungen. Claude legt Aufgaben an, arbeitet sie ab und hält fest, wo es weitergeht. Du verfolgst alles in einem Live-Board im Browser, legst dort selbst Aufgaben an und sagst Claude, was als Nächstes kommt.

Es braucht nur Node.js 18 oder neuer, keine Datenbank, keinen Account und keine weiteren Pakete.

## Inhalt

- [Installation](#installation)
- [Erste Schritte](#erste-schritte)
- [So arbeitest du mit Claude](#so-arbeitest-du-mit-claude)
- [Aufbau einer Aufgabe](#aufbau-einer-aufgabe)
- [Das Live-Board](#das-live-board)
- [Planen](#planen)
- [Zusammenarbeit mit Claude](#zusammenarbeit-mit-claude)
- [Qualität vor dem Abschluss](#qualität-vor-dem-abschluss)
- [Zeit und Schätzungen](#zeit-und-schätzungen)
- [Berichte](#berichte)
- [Teilen](#teilen)
- [Befehle im Terminal](#befehle-im-terminal)
- [Einstellungen](#einstellungen)
- [Hooks](#hooks)
- [Sicherheit und Datenschutz](#sicherheit-und-datenschutz)
- [Was ins Git gehört](#was-ins-git-gehört)
- [Probleme lösen](#probleme-lösen)

## Installation

In Claude Code:

```
/plugin marketplace add MecryTv/mycron
/plugin install works@mycron
```

Danach Claude Code neu starten. Updates holst du mit `/plugin marketplace update mycron`. Laufende Boards stellen sich dabei von selbst auf die neue Version um, offene Tabs laden sich neu.

## Erste Schritte

Sag Claude in deinem Projekt zum Beispiel:

> Richte works in diesem Projekt ein und öffne das Board.

Claude führt `works init` aus und fragt vorher, ob `.works/` ins Git soll. Danach startet es das Live-Board und nennt dir die Adresse, normalerweise `http://127.0.0.1:4747/`.

Ausprobieren ohne echtes Projekt geht mit der Demo:

> Zeig mir die works Demo.

Die Demo legt ein Beispielprojekt im Temp-Ordner an, mit Aufgaben, Sprint, Kommentaren, Vorlage, Zeiterfassung und Prüfungen. Mit `--simulate` spielt sie zehn typische Änderungen von Claude vor, damit du siehst, wie sich das Board live bewegt.

## So arbeitest du mit Claude

Du sprichst ganz normal. Ein paar Beispiele und was dann passiert:

| Du sagst | Claude macht |
|---|---|
| Notier dir, dass der Login auf dem Handy hakt. | legt schnell einen Bug an und fragt später die Details nach |
| Mach daraus eine Aufgabe mit P2, Aufwand M. | legt die Aufgabe mit Beschreibung und Akzeptanzkriterien an |
| Was steht an? | nennt die nächste sinnvolle Aufgabe mit Begründung |
| Arbeite die Warteschlange ab. | startet die oberste Aufgabe deiner Warteschlange und macht danach weiter |
| Hier ein Screenshot zu W-0012. | legt das Bild mit Beschreibung in der Aufgabe ab |
| Plane einen Sprint bis Freitag nächster Woche. | startet einen Sprint und schlägt Aufgaben passend zur Kapazität vor |
| Ich will das Board mit Lukas teilen. | gibt das Board im Netzwerk frei und nennt dir den Leselink |
| Wie lange hat W-0034 gedauert? | zeigt aktive Zeit, Sitzungen und Tage je Status |

Beim Start jeder Sitzung bekommt Claude automatisch eine Kurzübersicht: offene P1, Überfälliges, Warteschlange, Sprint, neue Kommentare von dir und die Übergabe der aktiven Aufgabe. So macht jede neue Sitzung dort weiter, wo die letzte aufgehört hat.

## Aufbau einer Aufgabe

```
.works/
  WORKS.md            generierte Übersicht
  config.json         Einstellungen, Meilensteine, Warteschlange, Sprints, Ansichten, Prüfungen
  state.json          aktive Aufgabe (lokal)
  ideas.md            Ideen, die noch keine Aufgabe sind
  templates/          Vorlagen
  reports/            Berichte und Schnappschüsse
  inbox/              Bilder, die noch zugeordnet werden
  tasks/W-0012-slug/
    task.md           Beschreibung, Kriterien, Plan, Fragen, Übergabe, Verlauf
    decisions.md      Designentscheidungen
    comments.md       Gespräch zwischen dir und Claude
    checks.json       Ergebnis der Prüfungen
    assets/           Bilder
  archive/            erledigte und verworfene Aufgaben
```

**Typen:** Feature, Bug, Refactoring, Spike, Chore, Design, Technische Schuld. Jeder Typ bringt passende Abschnitte mit, ein Bug etwa Reproduktion, Ursache und Lösung.

**Prioritäten:** P1 Kritisch, P2 Hoch, P3 Mittel, P4 Niedrig.

**Status:** Backlog, Geplant, In Arbeit, Review, Erledigt, Verworfen.

**Beschreibung:** der zentrale Abschnitt. Alles, was du zu einer Aufgabe wichtig findest, gehört hierhin. Claude liest ihn vor der Arbeit vollständig und behandelt ihn als Vorgabe.

**Definition of Done:** Abschließen geht nur, wenn alle Kriterien abgehakt sind, keine Fragen offen sind und die typbezogenen Abschnitte gefüllt sind. Dazu kommen manuelle Punkte und, wenn eingerichtet, automatische Prüfungen. Wer trotzdem abschließt, muss einen Grund angeben, der im Verlauf landet.

**Übergabe:** Am Ende jeder Arbeitsphase schreibt Claude, wo es weitergeht. Ein Stop Hook erinnert daran, wenn Dateien geändert wurden, die Aufgabe aber nicht.

## Das Live-Board

Claude startet es mit `works board --serve --detach`, oder du sagst "Öffne das Board". Es läuft im Hintergrund und aktualisiert sich jede Sekunde. Wenn Claude eine Karte verschiebt, gleitet sie in die neue Spalte, und unten rechts erscheint, was passiert ist und warum.

### Ansichten

| Ansicht | Taste | Wofür |
|---|---|---|
| Board | 1 | Spalten nach Status, Karten per Ziehen verschieben |
| Sprint | 2 | Zeitraum, Ziel, Kapazität, Burndown, Vorschläge zum Einplanen |
| Warteschlange | 3 | Reihenfolge, in der Claude arbeiten soll |
| Zeitleiste | 4 | Wochen und Meilensteine, Fälligkeit per Ziehen am Balkenende |
| Abhängigkeiten | 5 | Graph mit kritischem Pfad und der Aufgabe mit dem größten Hebel |
| Tabelle | 6 | Sortieren, direkt bearbeiten, mehrere Aufgaben auf einmal ändern |

Über den Spalten zeigt der Fortschritt den Anteil erledigter Aufgaben, die letzten sieben Tage, eine Prognose und den Verlauf der letzten acht Wochen. Mit gewähltem Meilenstein gilt alles nur für ihn.

### Detailpanel

Ein Klick auf eine Karte öffnet die Aufgabe mit vier Reitern:

- **Übersicht:** alle Felder, Beschreibung, Kriterien zum Abhaken, Fragen, Übergabe, Bilder per Einfügen oder Ziehen, Abhängigkeiten, Verlauf
- **Kommentare:** das Gespräch mit Claude zu dieser Aufgabe
- **Zeit:** aktive Zeit von Claude, Tage je Status, Sitzungen
- **Code und Commits:** Branch, Vorsprung gegenüber dem Hauptbranch, Pull Request, Commits mit der Aufgaben-ID, geänderte Dateien mit Diff

### Werkzeuge

Das Symbol mit den Reglern in der Kopfzeile öffnet Wochenbericht, Vorlagen, Prüfungen und Benachrichtigungen.

### Tastatur

| Taste | Wirkung |
|---|---|
| rechte Shift oder Strg+K | Schnellsuche nach Aufgaben, mit `#` nach Tags, mit `>` nach Befehlen |
| N | neue Aufgabe |
| / | Suche |
| 1 bis 6 | Ansicht wechseln |
| Esc | Panel oder Dialog schließen |

Das Farbschema folgt dem System oder lässt sich auf Hell oder Dunkel festlegen.

## Planen

### Warteschlange

Du reihst Aufgaben ein und sortierst sie per Ziehen. Claude nimmt sie in genau dieser Reihenfolge, vor allen eigenen Vorschlägen. Drei Schalter steuern den Ablauf: nach dem Abschluss weitermachen, vorher nachfragen und blockierte überspringen. Erledigte Aufgaben fallen von selbst heraus.

### Sprint

Ein Sprint hat Titel, Ziel, Zeitraum und eine Kapazität in Punkten. Standard sind 14 Tage und 20 Punkte, je Aufwand S 1, M 2, L 4 und XL 8 Punkte. Die Sprint-Ansicht zeigt, wie viel verplant, in Arbeit und erledigt ist, einen Burndown mit Ideallinie und Vorschläge mit dem Hinweis, ob sie noch in die Kapazität passen. Beim Abschluss merkt sich works, was offen blieb, und der nächste Sprint kann es übernehmen.

### Vorlagen

Für Aufgaben, die immer ähnlich aussehen, etwa ein neuer Slash-Befehl oder eine neue Dashboard-Seite. Eine Vorlage legt Typ, Priorität, Aufwand, Tags, Felder, einen Grundtext und Akzeptanzkriterien fest. Beim Anlegen füllst du die Felder aus und beschreibst im Feld "Was genau soll passieren?" mit eigenen Worten, worum es geht. Dein Text hat Vorrang vor dem Grundtext.

Eigene Vorlagen erstellst du in den Werkzeugen oder im Detailpanel einer bestehenden Aufgabe mit "Als Vorlage speichern". Sie gelten für das Projekt oder für alle deine Projekte.

### Gespeicherte Ansichten

Setz Filter, etwa P1 und P2 mit Tag bot, und speichere sie als "Bot dringend". Die Ansicht erscheint als Chip über dem Board, mit der Zahl passender offener Aufgaben. Claude kann sie mit `works list --view "Bot dringend"` nutzen.

### Meilensteine

Meilensteine bündeln Aufgaben zu einem Ziel mit Datum, etwa einem Release. Du legst sie im Meilenstein-Filter an. Zeitleiste und Fortschritt zeigen ihren Stand.

## Zusammenarbeit mit Claude

**Kommentare:** Du schreibst im Reiter Kommentare, was dir wichtig ist. Claude sieht neue Kommentare beim nächsten Sitzungsstart, setzt sie um und antwortet dort.

**Offene Fragen:** Fragen, die vor der Arbeit geklärt sein müssen. Du beantwortest sie im Detailpanel. Solange eine offen ist, lässt sich die Aufgabe nicht abschließen.

**Benachrichtigungen:** Ist der Board-Tab im Hintergrund, meldet sich der Browser, wenn eine Aufgabe in Review kommt, Claude dir eine Frage stellt oder kommentiert, eine neue P1 auftaucht, eine Blockade aufgelöst ist oder die Warteschlange leer gelaufen ist. Dazu optional ein Ton und ein Zähler im Tab-Titel. Einstellen in den Werkzeugen.

**Ideen:** Lose Gedanken landen in `ideas.md` und lassen sich später mit einem Klick zur Aufgabe machen.

## Qualität vor dem Abschluss

In den Werkzeugen oder mit `works checks detect` schlägt works Prüfungen aus deinem Projekt vor, etwa TypeScript, Lint, Tests und Build aus der `package.json`. Gespeichert wird erst, wenn du zustimmst.

Danach laufen die Prüfungen bei jedem Abschluss automatisch, sobald es für den aktuellen Stand des Codes noch kein Ergebnis gibt. Der Abschluss-Dialog zeigt jede Prüfung mit Ergebnis und Dauer:

- **grün:** bestanden
- **rot:** fehlgeschlagen, mit den letzten Zeilen der Ausgabe, verhindert den Abschluss
- **gelb:** ein Fund, etwa aus dem Code-Audit. Du entscheidest: "Claude beheben lassen" schreibt Claude einen Auftrag als Kommentar, "Als bekannt markieren" quittiert den Fund.

Den Code-Audit führt Claude selbst aus und trägt das Ergebnis ein. Welche Prüfungen für welchen Typ gelten, legst du in `checks_by_type` fest, etwa nur Lint für Chores.

## Zeit und Schätzungen

Zwei Hooks messen, wie lange Claude an der aktiven Aufgabe arbeitet: vom Absenden einer Anfrage bis zum Ende der Antwort. Pausen über 20 Minuten trennen Sitzungen. Der Reiter Zeit zeigt die Summe, die Sitzungen und wie viele Tage die Aufgabe in welchem Status war.

Über der Zeitleiste steht, wie gut die Schätzungen passen: geschätzte gegen tatsächliche Dauer je Aufwandsgröße. Dauern M-Aufgaben bei dir im Schnitt sieben statt fünf Tage, kannst du Zeitleiste, Graph und Sprint mit den gemessenen Werten rechnen lassen.

## Berichte

**Wochenbericht:** Zusammenfassung, Zahlen, Erledigtes, was dich braucht und der Plan für die nächste Woche, als Markdown und HTML in `.works/reports/`. Die HTML-Fassung folgt deinem Farbschema. In den Werkzeugen legst du Wochentag und Uhrzeit fest. Ist der Bericht fällig, erinnert der Hook Claude beim nächsten Sitzungsstart, die Woche zusammenzufassen. Mit einem Discord-Webhook geht der Bericht zusätzlich in einen Kanal deiner Wahl.

**Bericht über einen Zeitraum:** `works report --days 14 --write`.

**Changelog:** `works changelog --milestone M1` aus den erledigten Aufgaben.

## Teilen

**Im selben Netzwerk:** Teilen in der Kopfzeile, dann "Im Netzwerk freigeben". Du bekommst einen Link wie `http://192.168.1.20:4747/?view=...`. Wer ihn hat, sieht das Board live, kann aber nichts ändern. Ein zweiter Link mit Bearbeitungsrechten ist für deine eigenen anderen Geräte gedacht. Links lassen sich jederzeit erneuern, dann funktionieren die alten nicht mehr.

**Schnappschuss:** eine einzige HTML-Datei mit allen Aufgaben, Details und Bildern. Sie öffnet sich ohne Server und ohne Internet und eignet sich für Mail oder Chat. Im Teilen-Dialog oder mit `works export`.

## Befehle im Terminal

Claude ruft die Befehle selbst auf. Du kannst sie auch direkt nutzen:

```
node "<Pfad zum Skill>/scripts/works.mjs" <befehl>
```

Den Pfad nennt dir Claude auf Nachfrage. Unter Windows funktioniert derselbe Aufruf in PowerShell.

| Bereich | Befehle |
|---|---|
| Einrichten | `init`, `doctor [--fix]`, `install-hooks`, `demo` |
| Erfassen | `new`, `idea`, `promote`, `scan`, `gh-import` |
| Ansehen | `list`, `show`, `next`, `status`, `views` |
| Arbeiten | `start`, `set`, `section`, `check`, `item`, `log`, `question`, `link`, `handoff`, `asset`, `decisions` |
| Abschließen | `dod`, `done`, `drop`, `reopen`, `archive` |
| Planen | `queue`, `sprint`, `milestone`, `template` |
| Gespräch | `comments`, `comment` |
| Qualität | `checks` |
| Auswertung | `time`, `report`, `changelog`, `commits` |
| Board | `board [--serve] [--detach] [--restart] [--stop] [--status] [--share] [--private]`, `share`, `export` |

`works help` zeigt alle Befehle mit Optionen. Die vollständige Referenz steht in `skills/works/references/cli.md`.

## Einstellungen

Alles steht in `.works/config.json`. Die Datei muss nur enthalten, was vom Standard abweicht. Die wichtigsten Felder:

| Feld | Wofür |
|---|---|
| `id_prefix` | Präfix der IDs, Standard `W` |
| `dod` | manuelle Punkte der Definition of Done, global, je Typ und je Tag |
| `checks`, `checks_by_type` | automatische Prüfungen |
| `sprint_settings` | Länge, Kapazität und Punkte je Aufwand |
| `effort_mode`, `effort_days` | feste oder gemessene Dauer je Aufwand |
| `report` | Wochenbericht: Zeitplan, Ziele, Inhalt |
| `time_tracking` | Zeiterfassung an oder aus |
| `hooks.session_start`, `hooks.stop_reminder` | Hooks pro Projekt abschalten |

Alle Felder erklärt `skills/works/references/config.md`.

## Hooks

Das Plugin bringt drei Hooks mit, die automatisch aktiv sind:

| Hook | Wofür |
|---|---|
| SessionStart | Kurzübersicht für Claude, Board und Server auf die neue Version bringen, Erinnerung an fällige Wochenberichte |
| UserPromptSubmit | Beginn einer Anfrage für die Zeiterfassung |
| Stop | Ende einer Anfrage für die Zeiterfassung, Erinnerung an Verlauf und Übergabe |

Optional richtet `works install-hooks --git` einen pre-commit Hook ein, der die Struktur von `.works/` prüft.

## Sicherheit und Datenschutz

- Das Board läuft nur auf deinem Rechner (127.0.0.1), solange du es nicht teilst. Jede Änderung braucht ein Token, das nur die ausgelieferte Seite kennt.
- Beim Teilen brauchen alle Zugriffe von außen einen geheimen Schlüssel aus dem Link. Lesende bekommen ein eigenes Token, mit dem der Server nur Lesezugriffe annimmt. Export und Freigabe bleiben dem Besitzer vorbehalten.
- HTML-Dateien aus `.works/` laufen im Browser in einer Sandbox ohne Zugriff auf das Board.
- Prüfungen führen nur Befehle aus, die in deiner `config.json` stehen. Ausführen, Ändern der Befehle und das Setzen des Discord-Webhooks gehen nur direkt am eigenen Rechner, nicht über einen geteilten Link.
- Die Discord-Webhook-URL und die Teilen-Schlüssel liegen nur lokal und sind vom Git ausgenommen.
- Nichts verlässt deinen Rechner, außer du schickst einen Bericht an Discord oder teilst das Board.

## Was ins Git gehört

`works init` legt eine `.works/.gitignore` an. Ins Repository gehören Aufgaben, Vorlagen, Berichte, `config.json`, `ideas.md` und `WORKS.md`. Lokal bleiben `state.json`, `board.html`, `server.json`, `server.log`, `share.json`, `report.local.json`, `.tmp/` und die Inbox. Willst du `.works/` gar nicht im Git haben, richtet `works init --gitignore` das so ein.

## Probleme lösen

**Das Board sieht alt aus oder reagiert komisch.** Sag Claude "Starte das Board neu" oder führe `works board --restart` aus. Offene Tabs laden sich von selbst neu.

**Das Board startet nicht.** `works board --status` zeigt, ob und wo es läuft. Details stehen in `.works/server.log`. Ist der Port belegt, nimmt works den nächsten freien oder du wählst einen mit `--port`.

**Claude arbeitet gerade, und ich will das Board neu starten.** Das geht jederzeit. Der Server wartet, bis laufende Änderungen fertig sind, und offene Tabs verbinden sich danach neu.

**Die Struktur ist durcheinander.** `works doctor` findet Fehler, `works doctor --fix` behebt die meisten.

**Benachrichtigungen kommen nicht an.** In den Werkzeugen einschalten, dann "Testmeldung senden". Fragt der Browser nicht nach, sind Benachrichtigungen für die Seite blockiert und lassen sich in den Seiteneinstellungen erlauben.
