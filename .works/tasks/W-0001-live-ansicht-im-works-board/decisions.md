# Designentscheidungen: W-0001 Live-Ansicht im works-Board

Angelegt am 2026-11-20. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
- [Umsetzungsplan](../../../docs/superpowers/plans/2026-11-20-live-tracking.md) (verlinkt am 2026-11-20)

## Brainstorm-Zusammenfassung
Bisher gab es nur die Pille „Claude arbeitet an …“ und einen kleinen Kasten auf der Karte in Arbeit; Prüfungen sah man nur im Abschluss-Dialog. Drei Varianten wurden als klickbarer Entwurf gezeigt: A eigene Live-Ansicht, B Leiste unten im Board, C Monitor-Seite. Gewählt ist A. Ein Gegenleser fand drei Punkte im Code, die das Design geändert haben (siehe E2 bis E4). Vollständiges Design: [Design Live-Ansicht](../../../docs/superpowers/specs/2026-11-20-live-tracking-design.md).

## Entscheidungen

### E1: Variante A, eigener Reiter Live
- Datum: 2026-11-20
- Quelle: Brainstorm
- Entscheidung: Siebter Reiter Live (Taste 7) mit Kacheln, Tagesliste, Fokus-Aufgabe und Prüfungsspalte.
- Begründung: Zeigt am meisten auf einmal, passt ins vorhandene Ansichtssystem.
- Verworfene Alternativen:
  - B Live-Leiste: eingeklappt zu wenig Platz, bei mehreren Agenten eng
  - C Monitor: nur Ansehen, zum Eingreifen zurück ins Board

### E2: PreToolUse-Hook für die Jetzt-Anzeige
- Datum: 2026-11-20
- Quelle: Gespräch (Entscheidung des Nutzers)
- Kontext: PostToolUse meldet erst nach dem Aufruf; während langer Befehle stünde der vorige Aufruf da.
- Entscheidung: Neuer Hook `hooks/pre-tool.mjs` meldet den Start.
- Konsequenzen: ca. 0,2 s mehr pro Werkzeugaufruf (unter Windows gemessen), vom Nutzer akzeptiert.
- Verworfene Alternativen:
  - Ohne Hook „Zuletzt“ anzeigen: ungenau bei langen Befehlen

### E3: Agenten nutzen works checks run, Prüfungen laufen im Worktree
- Datum: 2026-11-20
- Quelle: Gespräch (Entscheidung des Nutzers) und Analyse
- Kontext: Agenten führten Tests direkt aus. `works checks run` aus dem Worktree wäre im Hauptprojekt gelaufen (findRoot folgt .works.link).
- Entscheidung: `checkDir(root, task)` wählt den Worktree, Agenten-Auftrag nennt `works checks run`.
- Verworfene Alternativen:
  - Nur der Verlauf zeigt Agenten-Tests: Prüfungsspalte bliebe bis zum Merge leer

### E4: Phase Prüfungen hängt am laufenden Lauf, nicht am Status
- Datum: 2026-11-20
- Quelle: Analyse
- Kontext: Prüfungen laufen oft erst bei der Abnahme im Review.
- Entscheidung: Phase Prüfungen, solange `checks.running` gesetzt ist, egal bei welchem Status. Skill-Prüfungen bekommen kein „läuft“.

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

- 2026-11-20: Variante A „Live-Ansicht“ gewählt, Grund: Zeigt am meisten auf einmal und passt ins vorhandene Ansichtssystem; Pille im Kopf führt direkt hin. Datei: design/A-live-ansicht.html
