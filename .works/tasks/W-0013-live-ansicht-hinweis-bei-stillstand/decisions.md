# Designentscheidungen: W-0013 Live-Ansicht: Hinweis bei Stillstand einer Aufgabe

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

- 2026-11-21: Schwelle aus der vorhandenen Einstellung handoff_stale_days (Standard 3), die auch works doctor nutzt, statt einer neuen Einstellung. 0 schaltet den Hinweis im Board ab.
- 2026-11-21: Aktivität = Antworten (time.jsonl), Dateiänderungen (files.jsonl), abgehakte Schritte (steps.json), updated und Änderungszeit der task.md. Gelesen wird time.jsonl/files.jsonl nur bei Änderung (Cache wie beim Verbrauch).
- 2026-11-21: Keine Übergabe = Abschnitt Übergabe leer.

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
