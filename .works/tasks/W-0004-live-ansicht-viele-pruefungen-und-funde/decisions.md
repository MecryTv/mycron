# Designentscheidungen: W-0004 Live-Ansicht: viele Prüfungen und Funde übersichtlich zeigen

Angelegt am 2026-11-21. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
- [Klickbarer Entwurf (beide Varianten, Zustand nach und während des Laufs)](docs/viele-pruefungen.html) (kopiert am 2026-11-21)

## Brainstorm-Zusammenfassung
Bei 51 Prüfungen und 45 Fehlschlägen listete die Live-Ansicht jeden Eintrag einzeln, in „Wartet auf dich“ und in der Prüfungsspalte. Zwei Ansätze als Entwurf: A gruppiert Fehlschläge nach gleicher Meldung (44 gleiche Pfadfehler werden eine Karte mit einer Aktion), B zeigt alle Prüfungen als Kachelraster mit Filter und Details auf Klick. Für beide: „Wartet auf dich“ fasst je Aufgabe zusammen (höchstens vier Zeilen), kompakte Darstellung erst ab etwa 9 Prüfungen. Empfehlung A, weil die gemeinsame Ursache sofort sichtbar ist. Wahl steht aus.

## Entscheidungen
### E1: Fehlergruppen ab 9 Prüfungen
- Datum: 2026-11-21
- Quelle: Gespräch
- Kontext:
- Entscheidung: Ab 9 Prüfungen je Aufgabe Zusammenfassung mit Zählern, Streifen und Fehlergruppen nach gleicher erster Ausgabezeile; darunter die bisherige Liste
- Begründung: Bei 45 Fehlschlägen mit derselben Ursache ist eine Karte mit einer Aktion lesbarer als 45 Zeilen; kleine Listen bleiben unverändert vertraut
- Verworfene Alternativen:
  - B Prüfmatrix: Ursache erst nach mehreren Klicks sichtbar
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

- 2026-11-21: Variante A „Fehlergruppen“ gewählt, Grund: Gemeinsame Ursache sofort sichtbar, eine Aktion je Fehlergruppe; vom Nutzer gewählt. Datei: design/A-fehlergruppen.png. Nicht gewählt: B Prüfmatrix
