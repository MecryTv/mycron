# Designentscheidungen: W-0014 Werkzeuge: Prüfungs-Gesundheit über alle Aufgaben

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

- 2026-11-21: checkHealth in checks.mjs wertet die checks.json aller Aufgaben aus (auch archivierte); ohne hist zählt das letzte Ergebnis als ein Lauf. Skill-Prüfungen zählen nicht. Neuer GET-Endpunkt /api/check-health.
- 2026-11-21: Werkzeuge liegen in einer schmalen Seitenleiste, nicht wie im Entwurf über die volle Breite. Deshalb vier statt sechs Spalten: Läufe als Tooltip an Rot, wackelig als Abzeichen am Namen, lange Namen mit Auslassung.
- 2026-11-21: Wackelig über alle Aufgaben: wahr, wenn der Verlauf einer Aufgabe nach flakyOf wackelig ist.

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
