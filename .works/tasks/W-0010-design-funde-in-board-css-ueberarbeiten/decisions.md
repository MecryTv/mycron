# Designentscheidungen: W-0010 Design-Funde in board.css überarbeiten

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

- 2026-11-21: Variante A umgesetzt. Die 3 px Streifen links an Karten, Flussleiste, Verlauf und Meldungen sind weg. Priorität als Chip mit Farbe und Form (Raute P1, Punkt P2/P3, Ring P4), P1-Karten mit getönter Kante. Flussleiste und Verlauf mit farbigem Punkt, Meldungen mit Symbol (✓ normal, → Änderung, ! Fehler; Klasse chg setzt toast() bei einer Farbe).
- 2026-11-21: Schrift Geist bleibt (Wunsch des Nutzers) und ist in `.impeccable/config.json` als bewusst gewählt eingetragen.
- 2026-11-21: Der gemeldete Meilenstein-Balken (`.ms .track`) gehört zu einem Block, den das Board nicht mehr verwendet (Meilensteine sind ein Auswahlfeld). Der Block `.milestones`/`.ms` ist gelöscht statt umgebaut.
- 2026-11-21: Die kleinen Quadrate im Prioritätsfilter (`.pdot`) bleiben, sie stehen immer neben dem Text P1 bis P4.

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

- 2026-11-21: Variante A „Feinschliff Board: A Punkte und Chips, B Obere Kante, Schriften“ gewählt, Grund: Nutzer: A und Geist (Streifen durch Punkte und Chips ersetzen, Schrift Geist behalten). Datei: design/A-feinschliff-board-a-punkte.html
