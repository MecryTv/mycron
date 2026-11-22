# Designentscheidungen: W-0020 board --open öffnet nur, wenn noch kein Tab offen ist

Angelegt am 2026-11-22. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
<!-- Brainstorm-Dokumente, UI UX Pro Max Ausgaben, externe Referenzen. Pflege über `works attach-doc`. -->

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->

## Entscheidungen
### E1: Offene Tabs über den Event-Stream zählen
- Datum: 2026-11-22
- Quelle: Gespräch
- Kontext:
- Entscheidung: Der Server zählt Verbindungen zu /events von localhost und meldet die Zahl unter /tabs; --open fragt das ab und wartet nach einem Start bis zu 3 s auf Tabs, die sich neu verbinden
- Begründung: Jeder offene Board-Tab hält diese Verbindung ohnehin; kein neuer Mechanismus nötig. Links von anderen Geräten zählen nicht, damit ein geteilter Link das lokale Öffnen nicht verhindert
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
