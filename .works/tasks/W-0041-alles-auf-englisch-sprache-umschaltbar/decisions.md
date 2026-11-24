# Designentscheidungen: W-0041 Alles auf Englisch, Sprache umschaltbar

Angelegt am 2026-11-24. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
<!-- Brainstorm-Dokumente, UI UX Pro Max Ausgaben, externe Referenzen. Pflege über `works attach-doc`. -->

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->

## Entscheidungen
### E1: Doku in zwei Fassungen, Sprache global mit Ausnahme je Projekt
- Datum: 2026-11-24
- Quelle: Gespräch
- Kontext:
- Entscheidung: SKILL.md und references gibt es auf Englisch (Standard) und als zweite Fassung auf Deutsch. Die Sprache gilt global (~/.works), ein Projekt kann sie überschreiben. Für den Nutzer selbst wird danach Deutsch eingestellt.
- Begründung: Wahl des Nutzers am 2026-11-24.
- Verworfene Alternativen:
  - Nur englische Doku mit Antwort in der eingestellten Sprache: vom Nutzer nicht gewählt
  - Nur global oder nur je Projekt: vom Nutzer nicht gewählt
- Konsequenzen:

### E2: Alte Spracheinträge entfernen, Projekt-Sprache mit Kennzeichen
- Datum: 2026-11-24
- Quelle: Gespräch
- Kontext:
- Entscheidung: Ältere works init schrieben language: de ungefragt in jedes Projekt. Die Migration language-1 entfernt den Eintrag einmal und setzt ein Kennzeichen; danach gilt eine Projekt-Sprache nur, wenn sie bewusst gesetzt wird (works lang --project oder von Hand). works init setzt das Kennzeichen gleich. Der Sitzungsstart sagt einmal, dass eine alte Sprache entfernt wurde.
- Begründung: Wahl des Nutzers am 2026-11-24; Kennzeichen beim init und Hinweis nach der Code-Durchsicht
- Verworfene Alternativen:
  - Alte Einträge als Projekt-Sprache behalten: dann bliebe jedes alte Projekt deutsch und die globale Einstellung wirkte nicht
- Konsequenzen:

### E3: READMEs englisch mit deutscher Fassung daneben
- Datum: 2026-11-24
- Quelle: Gespräch
- Kontext:
- Entscheidung: README.md jedes Plugins ist englisch, daneben liegt README.de.md mit derselben Gliederung.
- Begründung: Wahl des Nutzers am 2026-11-24
- Verworfene Alternativen:
  - Nur englische README: vom Nutzer nicht gewählt
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
