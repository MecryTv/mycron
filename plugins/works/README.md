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
- [Gestaltung mit UI UX Pro Max und Brainstorming](#gestaltung-mit-ui-ux-pro-max-und-brainstorming)
- [Projektwissen](#projektwissen)
- [GitHub](#github)
- [Mehrere Aufgaben parallel](#mehrere-aufgaben-parallel)
- [Import](#import)
- [Qualität vor dem Abschluss](#qualität-vor-dem-abschluss)
- [Zeit, Kosten und Schätzungen](#zeit-kosten-und-schätzungen)
- [Berichte](#berichte)
- [Teilen](#teilen)
- [Kalender und alle Projekte](#kalender-und-alle-projekte)
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
| Was hat W-0034 gekostet? | zeigt Tokens und geschätzte Kosten der Aufgabe |
| Bau die Turnierseite für Mobilgeräte. | arbeitet bei einer Gestaltungsaufgabe mit UI UX Pro Max und Brainstorming Entwürfe aus, hängt sie an die Aufgabe und wartet auf deine Wahl |
| Merk dir für das Projekt: Prisma nur mit migrate deploy. | trägt das ins Projektwissen ein, das jede Sitzung liest |
| Jeden ersten Montag im Monat Abhängigkeiten aktualisieren. | legt eine wiederkehrende Aufgabe an |
| Arbeite den Sprint ab. | prüft, ob sich Aufgaben parallel mit Agenten erledigen lassen, und fragt nach, wenn es unsicher ist |
| Hier ist unser Trello-Export. | zeigt eine Vorschau der Aufgaben und übernimmt sie nach deinem Okay |

Beim Start jeder Sitzung bekommt Claude automatisch eine Kurzübersicht: offene P1, Überfälliges, Warteschlange, Sprint, neue Kommentare von dir, die Bereiche des Projektwissens, Entwürfe, die auf deine Wahl warten, und die Übergabe der aktiven Aufgabe. So macht jede neue Sitzung dort weiter, wo die letzte aufgehört hat.

## Aufbau einer Aufgabe

```
.works/
  WORKS.md            generierte Übersicht
  config.json         Einstellungen, Meilensteine, Warteschlange, Sprints, Ansichten, Prüfungen, wiederkehrende Aufgaben
  wissen.md           Projektwissen, das Claude vor der Arbeit liest
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
    design/           Designrichtung, Entwürfe und Brainstorming
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

Solange Claude arbeitet, steht oben "Claude arbeitet an W-0003, seit 6 min". Die aktive Karte zeigt den aktuellen Schritt, etwa "Bearbeitet src/backup.ts" oder "Befehl npm test", und die drei davor. Über "Anweisung an Claude" schickst du mitten in der Arbeit einen Hinweis. Claude bekommt ihn beim nächsten Schritt und berücksichtigt ihn, sobald es sinnvoll ist.

Jede Änderung im Board lässt sich zurücknehmen: über "Rückgängig" in der Meldung, mit Strg+Z oder in den Werkzeugen unter Letzte Änderungen.

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

Ein Klick auf eine Karte öffnet die Aufgabe mit diesen Reitern:

- **Übersicht:** alle Felder, Beschreibung, Kriterien zum Abhaken, Fragen, Übergabe, Bilder per Einfügen oder Ziehen, Abhängigkeiten, Verlauf
- **Entwürfe:** bei Gestaltungsaufgaben Farben, Schrift, die Varianten als Vorschau und das Brainstorming. Hier wählst du die Variante, die Claude umsetzen soll
- **Kommentare:** das Gespräch mit Claude zu dieser Aufgabe
- **Zeit:** aktive Zeit von Claude, Tage je Status, Sitzungen, Tokens und geschätzte Kosten
- **Code und Commits:** Branch, Vorsprung gegenüber dem Hauptbranch, Pull Requests, Commits mit der Aufgaben-ID, geänderte Dateien mit Diff

Aufgaben in Review haben den Knopf **Abnehmen**: Der gewählte Entwurf oder der Vorher-Screenshot steht neben dem Ergebnis, darunter die Akzeptanzkriterien zum Gegenprüfen. Annehmen führt zum Abschluss. "Zurück an Claude" braucht einen kurzen Text, was fehlt; er landet als Kommentar bei Claude, und Kriterien, die du abwählst, sind wieder offen.

### Werkzeuge

Das Symbol mit den Reglern in der Kopfzeile öffnet Wochenbericht, Vorlagen, Prüfungen, Projektwissen, Aufräumen, wiederkehrende Aufgaben, GitHub, Kalender, Verbrauch, Letzte Änderungen und Benachrichtigungen.

### Tastatur

| Taste | Wirkung |
|---|---|
| rechte Shift oder Strg+K | Schnellsuche nach Aufgaben, mit `#` nach Tags, mit `>` nach Befehlen |
| N | neue Aufgabe |
| / | Suche |
| 1 bis 6 | Ansicht wechseln |
| Esc | Panel oder Dialog schließen |
| Strg+Z | letzte Änderung im Board zurücknehmen |

Das Farbschema folgt dem System oder lässt sich auf Hell oder Dunkel festlegen.

## Planen

### Warteschlange

Du reihst Aufgaben ein und sortierst sie per Ziehen. Claude nimmt sie in genau dieser Reihenfolge, vor allen eigenen Vorschlägen. Drei Schalter steuern den Ablauf: nach dem Abschluss weitermachen, vorher nachfragen und blockierte überspringen. Erledigte Aufgaben fallen von selbst heraus.

### Sprint

Ein Sprint hat Titel, Ziel, Zeitraum und eine Kapazität in Punkten. Standard sind 14 Tage und 20 Punkte, je Aufwand S 1, M 2, L 4 und XL 8 Punkte. Die Sprint-Ansicht zeigt, wie viel verplant, in Arbeit und erledigt ist, einen Burndown mit Ideallinie und Vorschläge mit dem Hinweis, ob sie noch in die Kapazität passen. Beim Abschluss öffnet sich ein Rückblick: was geschafft wurde, ob das Ziel erreicht ist, welche Aufgaben länger dauerten als geschätzt, was nachträglich dazukam und was es gekostet hat. Dazu drei kurze Fragen an dich. Claude nutzt die Antworten beim Planen des nächsten Sprints. Offene Aufgaben lassen sich gleich übernehmen.

### Vorlagen

Für Aufgaben, die immer ähnlich aussehen, etwa ein neuer Slash-Befehl oder eine neue Dashboard-Seite. Eine Vorlage legt Typ, Priorität, Aufwand, Tags, Felder, einen Grundtext und Akzeptanzkriterien fest. Beim Anlegen füllst du die Felder aus und beschreibst im Feld "Was genau soll passieren?" mit eigenen Worten, worum es geht. Dein Text hat Vorrang vor dem Grundtext.

Eigene Vorlagen erstellst du in den Werkzeugen oder im Detailpanel einer bestehenden Aufgabe mit "Als Vorlage speichern". Sie gelten für das Projekt oder für alle deine Projekte.

### Wiederkehrende Aufgaben

Regeln wie "täglich", "jeden Montag", "jeden ersten Montag im Monat" oder "alle 3 Tage" legen Aufgaben selbst an, auch aus einer Vorlage. Platzhalter `{Datum}` und `{Monat}` im Titel werden ersetzt. Ist die vorige Aufgabe einer Regel noch offen, entsteht keine zweite. Auf Wunsch kommen neue Aufgaben direkt in die Warteschlange oder den Sprint.

### Aufräumen

Werkzeuge, Aufräumen, bewertet den Backlog von 0 bis 100 und listet, was Pflege braucht: Aufgaben, die festhängen, Entwürfe ohne deine Wahl, unvollständige Aufgaben, vermutliche Duplikate und alte, unberührte Einträge. Zu jedem Punkt gibt es die passende Aktion, etwa zusammenführen oder zur Idee machen. Schon beim Anlegen warnt works, wenn es eine ähnliche offene Aufgabe gibt, und bietet an, dein Anliegen dort als Kommentar anzuhängen.

### Gespeicherte Ansichten

Setz Filter, etwa P1 und P2 mit Tag bot, und speichere sie als "Bot dringend". Die Ansicht erscheint als Chip über dem Board, mit der Zahl passender offener Aufgaben. Claude kann sie mit `works list --view "Bot dringend"` nutzen.

### Meilensteine

Meilensteine bündeln Aufgaben zu einem Ziel mit Datum, etwa einem Release. Du legst sie im Meilenstein-Filter an. Zeitleiste und Fortschritt zeigen ihren Stand.

## Zusammenarbeit mit Claude

**Kommentare:** Du schreibst im Reiter Kommentare, was dir wichtig ist. Claude sieht neue Kommentare beim nächsten Sitzungsstart, setzt sie um und antwortet dort.

**Offene Fragen:** Fragen, die vor der Arbeit geklärt sein müssen. Du beantwortest sie im Detailpanel. Solange eine offen ist, lässt sich die Aufgabe nicht abschließen.

**Benachrichtigungen:** Ist der Board-Tab im Hintergrund, meldet sich der Browser, wenn eine Aufgabe in Review kommt, Claude dir eine Frage stellt oder kommentiert, eine neue P1 auftaucht, eine Blockade aufgelöst ist oder die Warteschlange leer gelaufen ist. Dazu optional ein Ton und ein Zähler im Tab-Titel. Einstellen in den Werkzeugen.

**Ideen:** Lose Gedanken landen in `ideas.md` und lassen sich später mit einem Klick zur Aufgabe machen.

## Gestaltung mit UI UX Pro Max und Brainstorming

Sind die Skills [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) und das Brainstorming aus [Superpowers](https://github.com/obra/superpowers) installiert, nutzt Claude sie bei Gestaltungsaufgaben von sich aus. Als Gestaltungsaufgabe gilt Typ Design oder ein Tag ui, design oder ux.

1. Brainstorming mit dir, das Ergebnis hängt an der Aufgabe.
2. UI UX Pro Max liefert die Designrichtung: Farben, Schrift, Stil und Regeln.
3. Claude baut zwei bis drei Varianten als HTML-Mockup oder Bild und hängt sie an.
4. Du siehst alles im Reiter Entwürfe und wählst mit "Diese nehmen". Die Karte zeigt so lange "2 Entwürfe zur Wahl".
5. Erst dann setzt Claude um. Die Wahl steht in `decisions.md`.
6. In der Abnahme liegt der gewählte Entwurf neben dem Screenshot des Ergebnisses.

Alles liegt im Aufgabenordner unter `design/`. Ohne die beiden Skills klärt Claude die Gestaltung wie gewohnt mit dir und zeigt trotzdem einen Entwurf.

## Projektwissen

`.works/wissen.md` hält fest, was jede Sitzung über das Projekt wissen muss, etwa "Rollen-Änderungen laufen über rateQueue" oder "Prisma nur mit migrate deploy". Einträge sind nach Bereichen sortiert. Claude liest die passenden vor der Arbeit. Findet Claude selbst etwas Wichtiges heraus, schlägt es einen Eintrag vor; du übernimmst, bearbeitest oder lehnst ihn in den Werkzeugen unter Projektwissen ab. Die Datei gehört ins Git, damit alle denselben Stand haben.

## GitHub

Ist das Projekt ein GitHub-Repository und das [gh CLI](https://cli.github.com/) angemeldet, gleicht works automatisch ab, beim Sitzungsstart und alle zwei Minuten, solange das Board läuft:

- Ein Pull Request mit der Aufgaben-ID im Titel oder Branch schiebt die Aufgabe nach Review.
- Das Ergebnis der CI wird zur Prüfung `ci`. Rot verhindert den Abschluss.
- Änderungswünsche im Review landen als Kommentar bei Claude, die Aufgabe geht zurück nach In Arbeit.
- Ein Merge schließt die Aufgabe ab, wenn die Definition of Done erfüllt ist. Sonst bleibt sie in Review mit einem Hinweis, was fehlt.
- Neue Issues werden zu Aufgaben, und eine erledigte Aufgabe schließt ihr Issue.

Jeder Teil lässt sich in den Werkzeugen unter GitHub abschalten. Der erste Abgleich merkt sich nur den Stand und ändert nichts.

## Mehrere Aufgaben parallel

Sollen mehrere Aufgaben erledigt werden, prüft Claude zuerst mit `works parallel plan`, ob sie sich gegenseitig stören: Hängen sie voneinander ab, ändern sie dieselben Dateien oder liegen sie im selben Bereich? Ergebnis ist parallel, nacheinander oder unsicher.

- **Parallel:** Claude legt für jede Aufgabe einen eigenen Git-Worktree mit Branch an, neben deinem Projekt im Ordner `<projekt>.works-lanes`, und startet je Aufgabe einen Agenten. Die Agenten tragen ihren Fortschritt in dieselben Aufgaben ein, die du im Board siehst.
- **Nacheinander:** Claude arbeitet wie gewohnt eine Aufgabe nach der anderen, etwa weil sie dieselben Dateien ändern oder zu klein sind, um den Aufwand zu lohnen.
- **Unsicher:** Claude nennt dir die Gründe und fragt.

Unvollständige Aufgaben, offene Fragen und Gestaltung ohne gewählten Entwurf gibt Claude nie an einen Agenten. Wenn ein Agent fertig ist, prüft Claude das Ergebnis, entfernt den Worktree und lässt den Branch für Review oder Pull Request stehen. Gemergt wird nur, wenn du es willst. Bis zu drei Aufgaben laufen gleichzeitig, einstellbar unter `parallel.max`.

Im Board tragen diese Karten "Parallel" und zeigen, was ihr Agent gerade tut. Werkzeuge, Parallelarbeit zeigt laufende Bahnen und wie Claude die nächsten Aufgaben einschätzt.

**Dateien und Aufgaben:** works merkt sich, welche Aufgabe welche Datei geändert hat, aus Commits mit der Aufgaben-ID und aus den Änderungen während der Arbeit. Ändert Claude eine Datei, an der schon eine andere Aufgabe mit Entscheidungen gearbeitet hat, bekommt es einen Hinweis darauf. `works file src/backup.ts` zeigt alle Aufgaben zu einer Datei, der Reiter Code und Commits die Dateien, die auch andere Aufgaben berührt haben.

## Import

Aufgaben aus anderen Werkzeugen übernimmst du in den Werkzeugen unter Importieren oder indem du Claude die Datei gibst:

| Woher | Datei |
|---|---|
| Trello | JSON-Export des Boards |
| Notion | CSV-, Markdown- oder ZIP-Export einer Datenbank |
| Linear | CSV-Export |
| Jira, Asana, eigene Tabellen | CSV oder TSV |
| Excel | .xlsx |
| Word | .docx mit Listen, Kontrollkästchen oder Tabellen |
| Notizen | Markdown oder Text mit Listen und `- [ ]` |

Spalten werden über ihre Namen zugeordnet, auf Deutsch und Englisch. Status, Priorität, Aufwand und Datum werden übersetzt, Checklisten werden zu Akzeptanzkriterien. Du siehst vorher eine Vorschau und wählst aus. Duplikate und Erledigtes sind abgewählt, und ein zweiter Import derselben Datei legt nichts doppelt an. Protokolle oder Fließtext liest Claude selbst und schlägt die Aufgaben vor. Ein Import lässt sich wie jede Änderung im Board rückgängig machen.

## Qualität vor dem Abschluss

In den Werkzeugen oder mit `works checks detect` schlägt works Prüfungen aus deinem Projekt vor, etwa TypeScript, Lint, Tests und Build aus der `package.json`. Gespeichert wird erst, wenn du zustimmst.

Danach laufen die Prüfungen bei jedem Abschluss automatisch, sobald es für den aktuellen Stand des Codes noch kein Ergebnis gibt. Der Abschluss-Dialog zeigt jede Prüfung mit Ergebnis und Dauer:

- **grün:** bestanden
- **rot:** fehlgeschlagen, mit den letzten Zeilen der Ausgabe, verhindert den Abschluss
- **gelb:** ein Fund, etwa aus dem Code-Audit. Du entscheidest: "Claude beheben lassen" schreibt Claude einen Auftrag als Kommentar, "Als bekannt markieren" quittiert den Fund.

Den Code-Audit führt Claude selbst aus und trägt das Ergebnis ein. Welche Prüfungen für welchen Typ gelten, legst du in `checks_by_type` fest, etwa nur Lint für Chores.

## Zeit, Kosten und Schätzungen

Zwei Hooks messen, wie lange Claude an der aktiven Aufgabe arbeitet: vom Absenden einer Anfrage bis zum Ende der Antwort. Pausen über 20 Minuten trennen Sitzungen. Der Reiter Zeit zeigt die Summe, die Sitzungen und wie viele Tage die Aufgabe in welchem Status war.

Dazu zählt der Stop Hook die Tokens jeder Antwort: Eingabe, Ausgabe, Cache-Schreiben und Cache-Lesen. works rechnet daraus geschätzte Kosten nach den Preisen in `config.json` unter `prices` (Standard sind die API-Preise je Million Tokens). Der Reiter Zeit zeigt Tokens und Kosten je Aufgabe und Tag, die Werkzeuge unter Verbrauch die letzten 30 Tage je Typ und die teuersten Aufgaben. Es bleibt eine Schätzung, keine Abrechnung. Mit einem Abo siehst du daran, wofür dein Kontingent draufgeht.

Über der Zeitleiste steht, wie gut die Schätzungen passen: geschätzte gegen tatsächliche Dauer je Aufwandsgröße. Dauern M-Aufgaben bei dir im Schnitt sieben statt fünf Tage, kannst du Zeitleiste, Graph und Sprint mit den gemessenen Werten rechnen lassen.

## Berichte

**Wochenbericht:** Zusammenfassung, Zahlen, Erledigtes, was dich braucht und der Plan für die nächste Woche, als Markdown und HTML in `.works/reports/`. Die HTML-Fassung folgt deinem Farbschema. In den Werkzeugen legst du Wochentag und Uhrzeit fest. Ist der Bericht fällig, erinnert der Hook Claude beim nächsten Sitzungsstart, die Woche zusammenzufassen. Mit einem Discord-Webhook geht der Bericht zusätzlich in einen Kanal deiner Wahl.

**Bericht über einen Zeitraum:** `works report --days 14 --write`.

**Changelog:** `works changelog --milestone M1` aus den erledigten Aufgaben.

## Teilen

**Im selben Netzwerk:** Teilen in der Kopfzeile, dann "Im Netzwerk freigeben". Du bekommst einen Link wie `http://192.168.1.20:4747/?view=...`. Wer ihn hat, sieht das Board live, kann aber nichts ändern. Ein zweiter Link mit Bearbeitungsrechten ist für deine eigenen anderen Geräte gedacht. Links lassen sich jederzeit erneuern, dann funktionieren die alten nicht mehr.

**Schnappschuss:** eine einzige HTML-Datei mit allen Aufgaben, Details und Bildern. Sie öffnet sich ohne Server und ohne Internet und eignet sich für Mail oder Chat. Im Teilen-Dialog oder mit `works export`.

## Kalender und alle Projekte

**Kalender:** Werkzeuge, Kalender, gibt dir eine Adresse zum Abonnieren in Google Kalender, Outlook oder Apple Kalender mit Fälligkeiten, Meilensteinen und Sprints. Kalender im Internet erreichen deinen Rechner nicht; dann lädst du die Datei herunter (`works ical --out termine.ics`) und importierst sie.

**Alle Projekte:** `works hub` öffnet auf `http://127.0.0.1:4740/` eine Übersicht über alle Projekte mit works: offene Aufgaben, P1 über alle Projekte, Review, Überfälliges, Sprint oder Meilenstein, woran Claude gerade arbeitet, und ein Knopf, um das Board eines Projekts zu öffnen oder zu starten.

## Befehle im Terminal

Claude ruft die Befehle selbst auf. Du kannst sie auch direkt nutzen:

```
node "<Pfad zum Skill>/scripts/works.mjs" <befehl>
```

Den Pfad nennt dir Claude auf Nachfrage. Unter Windows funktioniert derselbe Aufruf in PowerShell.

| Bereich | Befehle |
|---|---|
| Einrichten | `init`, `doctor [--fix]`, `install-hooks`, `demo`, `selftest` |
| Erfassen | `new`, `idea`, `promote`, `scan`, `gh-import`, `recur`, `import` |
| Ansehen | `list`, `show`, `next`, `status`, `views` |
| Arbeiten | `start`, `set`, `section`, `check`, `item`, `log`, `question`, `link`, `handoff`, `asset`, `decisions`, `design`, `know`, `instruct` |
| Abschließen | `dod`, `done`, `drop`, `reopen`, `archive` |
| Planen | `queue`, `sprint`, `milestone`, `template`, `parallel` |
| Gespräch | `comments`, `comment` |
| Qualität | `checks` |
| Auswertung | `time`, `report`, `changelog`, `commits`, `ical`, `file`, `files` |
| GitHub | `github sync`, `github status`, `github set` |
| Board | `board [--serve] [--detach] [--restart] [--stop] [--status] [--share] [--private]`, `share`, `export`, `undo`, `hub` |

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
| `time_tracking` | Zeit- und Tokenerfassung an oder aus |
| `prices` | Preise für die Kostenschätzung |
| `recurring` | wiederkehrende Aufgaben |
| `github_sync` | was der GitHub-Abgleich tun darf |
| `live_activity` | Anzeige "Claude arbeitet" und Anweisungen während der Arbeit |
| `parallel` | Höchstzahl paralleler Aufgaben und Ordner für die Worktrees |
| `file_tracking` | Dateien je Aufgabe merken und Hinweise beim Bearbeiten |
| `hooks.session_start`, `hooks.stop_reminder` | Hooks pro Projekt abschalten |

Alle Felder erklärt `skills/works/references/config.md`.

## Hooks

Das Plugin bringt fünf Hooks mit, die automatisch aktiv sind:

| Hook | Wofür |
|---|---|
| SessionStart | Kurzübersicht für Claude, Board und Server auf die neue Version bringen, fällige wiederkehrende Aufgaben anlegen, GitHub abgleichen, Erinnerung an fällige Wochenberichte |
| UserPromptSubmit | Beginn einer Anfrage für die Zeiterfassung, Anzeige "Claude arbeitet" |
| PostToolUse | aktueller Schritt für das Board, geänderte Dateien je Aufgabe, Hinweis auf frühere Entscheidungen, Anweisungen von dir während der Arbeit |
| SubagentStop | Tokens und Kosten von Agenten der richtigen Aufgabe zuordnen |
| Stop | Ende einer Anfrage, Tokens und Kosten, offene Anweisungen, Erinnerung an Verlauf und Übergabe |

Optional richtet `works install-hooks --git` einen pre-commit Hook ein, der die Struktur von `.works/` prüft.

## Sicherheit und Datenschutz

- Das Board läuft nur auf deinem Rechner (127.0.0.1), solange du es nicht teilst. Jede Änderung braucht ein Token, das nur die ausgelieferte Seite kennt.
- Beim Teilen brauchen alle Zugriffe von außen einen geheimen Schlüssel aus dem Link. Lesende bekommen ein eigenes Token, mit dem der Server nur Lesezugriffe annimmt. Export und Freigabe bleiben dem Besitzer vorbehalten.
- HTML-Dateien aus `.works/`, auch die Entwürfe, laufen im Browser in einer Sandbox ohne Zugriff auf das Board.
- Die Anzeige "Claude arbeitet" speichert nur Werkzeug und Dateiname oder den Anfang eines Befehls, keine Inhalte und keine Ausgaben.
- Der GitHub-Abgleich nutzt dein angemeldetes gh CLI und lässt sich nur direkt am Rechner steuern, nicht über einen geteilten Link.
- Prüfungen führen nur Befehle aus, die in deiner `config.json` stehen. Ausführen, Ändern der Befehle und das Setzen des Discord-Webhooks gehen nur direkt am eigenen Rechner, nicht über einen geteilten Link.
- Die Discord-Webhook-URL und die Teilen-Schlüssel liegen nur lokal und sind vom Git ausgenommen.
- Nichts verlässt deinen Rechner, außer du schickst einen Bericht an Discord, teilst das Board oder der GitHub-Abgleich ist aktiv (dann schließt er Issues und liest PRs).

## Was ins Git gehört

`works init` legt eine `.works/.gitignore` an. Ins Repository gehören Aufgaben samt Entwürfen, Vorlagen, Berichte, `config.json`, `wissen.md`, `ideas.md` und `WORKS.md`. Lokal bleiben `state.json`, `board.html`, `server.json`, `server.log`, `share.json`, `report.local.json`, `activity.json`, `instructions.json`, `github.json`, `.usage-state.json`, `lanes.json`, `files.jsonl`, `.filemap.json`, `.undo/`, `.tmp/` und die Inbox. Ältere `.gitignore`-Dateien ergänzt works von selbst. Willst du `.works/` gar nicht im Git haben, richtet `works init --gitignore` das so ein.

## Probleme lösen

**Das Board sieht alt aus oder reagiert komisch.** Sag Claude "Starte das Board neu" oder führe `works board --restart` aus. Offene Tabs laden sich von selbst neu.

**Das Board startet nicht.** `works board --status` zeigt, ob und wo es läuft. Details stehen in `.works/server.log`. Ist der Port belegt, nimmt works den nächsten freien oder du wählst einen mit `--port`.

**Claude arbeitet gerade, und ich will das Board neu starten.** Das geht jederzeit. Der Server wartet, bis laufende Änderungen fertig sind, und offene Tabs verbinden sich danach neu.

**Funktioniert noch alles?** `works selftest` legt ein Wegwerfprojekt an und prüft CLI, Hooks, Import, Parallelarbeit, Board und API. Dasselbe läuft bei jedem Push im Repo mycron als GitHub Action auf Linux, macOS und Windows mit Node 18, 20 und 22.

**Ein paralleler Worktree hängt.** `works parallel status` zeigt alle Bahnen, `works parallel abort <ID>` räumt auf. Commits im Branch bleiben dabei erhalten.

**Ich habe im Board etwas versehentlich geändert.** Strg+Z oder Werkzeuge, Letzte Änderungen. Im Terminal `works undo --list` und `works undo <key>`.

**Der GitHub-Abgleich tut nichts.** `works github status` nennt den Grund, meist ist gh nicht installiert oder nicht angemeldet (`gh auth login`).

**Die Struktur ist durcheinander.** `works doctor` findet Fehler, `works doctor --fix` behebt die meisten.

**Benachrichtigungen kommen nicht an.** In den Werkzeugen einschalten, dann "Testmeldung senden". Fragt der Browser nicht nach, sind Benachrichtigungen für die Seite blockiert und lassen sich in den Seiteneinstellungen erlauben.
