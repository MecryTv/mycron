# Designentscheidungen: W-0021 Board als JSON exportieren und importieren

Angelegt am 2026-11-22. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
<!-- Brainstorm-Dokumente, UI UX Pro Max Ausgaben, externe Referenzen. Pflege über `works attach-doc`. -->

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->

## Entscheidungen
### E1: Verhalten von Export und Import (vom Nutzer am 2026-11-22 freigegeben: Passt so)
- Datum: 2026-11-22
- Quelle: Analyse
- Kontext: Variante B gewählt. Offen war, was genau gesichert und eingelesen wird.
- Entscheidung:
  - Format: eine JSON-Datei mit format "works-board", version 1, Projektname, Zeitpunkt, gewähltem Umfang, Planung aus config.json (Meilensteine, Sprints, Warteschlange, Wiederkehrendes), wissen.md, ideas.md und je Aufgabe den Dateien task.md, decisions.md, comments.md, checks.json als Text. Bilder und Entwürfe nur auf Wunsch, als base64.
  - Abgleich je Aufgabe: gleiche ID und gleicher Titel gilt als dieselbe Aufgabe (gleich oder geändert, mit den geänderten Feldern Status, Priorität, Titel, Kommentare, gewählter Entwurf). Gleicher Titel unter anderer ID ebenso. Alles andere ist neu und bekommt eine freie ID; blocked_by, blocks und related werden mit umgestellt.
  - Zusammenführen: legt die gewählten neuen Aufgaben an und übernimmt die gewählten geänderten. Was nur hier steht, bleibt. Planung und Projektwissen bleiben unverändert. Rückgängig über das bestehende Rückgängig des Boards.
  - Wiederherstellen: sichert zuerst den ganzen jetzigen Stand mit Bildern als JSON in .works/backups/, ersetzt dann Aufgaben, Archiv, Planung, Projektwissen und Ideen durch die Datei. Aufgaben, die nur hier stehen, verschwinden dabei (stecken aber in der Sicherung). Rückgängig spielt die Sicherung wieder ein.
  - CLI: works export --json [--out datei] [--images] [--designs] [--archive] und works import <datei.json> [--mode merge|restore] mit Vorschau, --apply übernimmt.
  - Board: Werkzeuge, Knopf Sichern und Wiederherstellen, dazu in der Befehlspalette; Dialog wie Entwurf B.
- Begründung: Dateien als Text übernehmen ergibt nach Export und Import denselben Stand, ohne jedes Feld einzeln abzubilden. Zusammenführen ist der sichere Normalfall, Wiederherstellen der Notfall mit Sicherung.
- Verworfene Alternativen:
  - Feldweise Abbildung aller Aufgabenfelder: viel Code, verliert Abschnitte, die es noch nicht gibt
  - Planung beim Zusammenführen mischen: unklar bei widersprüchlichen Meilensteinen und Sprints
- Konsequenzen: Eine Sicherung mit Bildern kann groß werden (beim Board mycron rund 2,6 MB).

### E2: Fuß der Dialoge bricht um
- Datum: 2026-11-22
- Quelle: Analyse (Screenshots 390 px)
- Kontext: Drei Knöpfe im Fuß eines Dialogs (etwa in der Import-Vorschau) passen auf dem Handy nicht nebeneinander und ziehen das ganze Formular über den Dialogrand.
- Entscheidung: dialog .foot bekommt flex-wrap: wrap, dialog form > .imp-wrap min-width: 0, Dialogtitel brechen um.
- Begründung: Behebt die bestehende Import-Vorschau gleich mit.
- Verworfene Alternativen: keine
- Konsequenzen: keine

### E3: Export ohne Verlauf überschreibt keinen Verlauf
- Datum: 2026-11-22
- Quelle: Gespräch
- Kontext:
- Entscheidung: Ist in der Sicherung history aus, vergleicht der Abgleich task.md ohne Verlauf und Übergabe, und beim Zusammenführen bleiben diese Abschnitte aus dem Board erhalten
- Begründung: Sonst gälte jede Aufgabe als geändert, und Übernehmen hätte den Verlauf im Board gelöscht (Fund aus dem code-audit)
- Verworfene Alternativen:
- Konsequenzen:

## UI und UX
<!-- Nur bei Oberflächen. Leere Unterabschnitte dürfen bleiben. -->

### Stil
<!-- Gewählte Stilrichtung, Stimmung, Begründung. -->

### Farbpalette
| Rolle | Wert | Verwendung |
|---|---|---|
| Primär | | |
| Hintergrund | | |
| Text | | |
| Akzent | | |
| Fehler | | |

### Typografie
<!-- Schriftfamilien, Größenskala, Zeilenhöhen, Gewichte. -->

### Layout und Abstände
<!-- Raster, Breakpoints, Abstandsskala. -->

### Komponenten
<!-- Verwendete oder neue Komponenten und ihre Zustände. -->

### Barrierefreiheit
<!-- Kontraste, Fokuszustände, Tastaturbedienung, Screenreader. -->

### Verworfene Varianten
<!-- Was wurde gezeigt oder erwogen und warum nicht genommen? -->

## Gewählter Entwurf

- 2026-11-22: Variante B „Eigener Dialog Sichern und Wiederherstellen“ gewählt, Grund: Nutzer am 2026-11-22 im Superpowers-Begleiter: eigener Dialog Sichern und Wiederherstellen. Datei: design/B-eigener-dialog-sichern-und.html. Nicht gewählt: A An Teilen und Import andocken
