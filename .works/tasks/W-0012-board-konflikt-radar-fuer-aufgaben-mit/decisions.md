# Designentscheidungen: W-0012 Board: Konflikt-Radar für Aufgaben mit denselben Dateien

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

- 2026-11-21: Gemeinsame Funktion taskFiles in files.mjs (Commits mit der ID, files.jsonl, in der task.md genannte Dateien), genutzt von works parallel plan und dem Board. fileConflicts bildet daraus Paare.
- 2026-11-21: Gezählt werden Aufgaben in Arbeit, im Review und in der Warteschlange; Backlog außerhalb der Warteschlange, erledigte und verworfene nicht.
- 2026-11-21: Hinweis gelb (signal warn), nicht rot wie P1: ein möglicher Konflikt, kein Fehler.

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
