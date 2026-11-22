# Designentscheidungen: W-0024 works: Playwright-Unterstützung mit works shot

Angelegt am 2026-11-22. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
<!-- Brainstorm-Dokumente, UI UX Pro Max Ausgaben, externe Referenzen. Pflege über `works attach-doc`. -->

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->

## Entscheidungen
### E1: works shot statt Abhängigkeit zum Plugin mockups
- Datum: 2026-11-22
- Quelle: Gespräch
- Kontext:
- Entscheidung: works bekommt einen eigenen Befehl shot mit Playwright (gesucht im Projekt, neben works, über NODE_PATH oder global; Chrome, dann Edge, dann Chromium). Board-Ansichten über die Tasten des Boards, eine Aufgabe über Klick auf ihre Karte und nur den sichtbaren Bereich; --asset ruft works asset auf
- Begründung: works soll ohne weitere Plugins Vorher- und Nachher-Bilder machen und das eigene Board ansehen können; die Asset-Logik bleibt an einer Stelle
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
