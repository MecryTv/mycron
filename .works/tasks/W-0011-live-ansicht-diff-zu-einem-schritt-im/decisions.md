# Designentscheidungen: W-0011 Live-Ansicht: Diff zu einem Schritt im Verlauf

Angelegt am 2026-11-21. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
<!-- Brainstorm-Dokumente, UI UX Pro Max Ausgaben, externe Referenzen. Pflege über `works attach-doc`. -->

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->

## Entscheidungen
<!-- Pro Entscheidung ein Block. Neue Blöcke mit `works decisions <ID> --add "Titel" ...` oder von Hand im gleichen Format:

### E1: Titel
- Datum:
- Quelle: Brainstorm | UI UX Pro Max | Gespräch | Analyse
- Kontext:
- Entscheidung:
- Begründung:
- Verworfene Alternativen:
  - Alternative: Grund
- Konsequenzen:
-->

- 2026-11-21: Vorhandene Schnittstelle /api/diff um live=1 erweitert (liveFileDiff in git.mjs), kein neuer Endpunkt. Reihenfolge: uncommitteter Stand gegen HEAD im Worktree der Aufgabe (checkDir), neue unverfolgte Datei mit ganzem Inhalt, sonst der Diff der Aufgabe wie im Reiter Code.
- 2026-11-21: Nur relative Pfade ohne .., Live-Diff nur mit Bearbeitungsrecht (403 im Leselink), weil er auch Uncommittetes zeigt.
- 2026-11-21: Aufklappbar sind Einträge der Werkzeuge Edit, MultiEdit, Write und NotebookEdit; der Schalter ist ein echter Button (Tastatur). Aufgeklappte Diffs bleiben beim Neuzeichnen offen.

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

- 2026-11-21: Variante A „Board-Erweiterungen W-0011 bis W-0014“ gewählt, Grund: Nutzer: A (Diff klappt unter dem Eintrag auf), Rest passt. Datei: design/A-board-erweiterungen-w-0011.html
