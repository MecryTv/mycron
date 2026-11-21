# Designentscheidungen: W-0015 Neues Plugin: Feierabend und Guten Morgen

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

- 2026-11-21: Eigenes Plugin feierabend mit zwei Skills (feierabend, guten-morgen), Wunsch des Nutzers. Beide rufen das works-CLI über den works-Skill auf und haben keine eigenen Skripte.
- 2026-11-21: Feierabend committet nur .works und nur, wenn es im Git liegt; Code bleibt liegen und wird mit genau einer Frage angesprochen. Nie pushen. Die Übergabe der aktiven Aufgabe kommt zuletzt, weil works handoff die aktive Aufgabe umstellt.
- 2026-11-21: Reihenfolge für weiter: aktive Aufgabe, dann andere in Arbeit nach Priorität, dann Warteschlange, dann works next. Die Warteschlange gilt für die Zeit nach dem Angefangenen.
- 2026-11-21: Guten Morgen fängt bei ausdrücklichem Weiter ohne Rückfrage an, wenn keine offene Frage blockiert und die Übergabe zum Repo passt; sonst höchstens drei nummerierte Fragen.
- 2026-11-21: Getestet mit Subagenten in Kopien eines Testprojekts, ohne Board (Nutzerwunsch: keine zusätzlichen Boards). Baseline ohne Skill und drei Läufe mit Skill; Lücken (Review-Aufgaben in Guten Morgen, Reihenfolge) nachgeschärft.

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
