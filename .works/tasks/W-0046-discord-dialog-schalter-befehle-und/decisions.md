# Designentscheidungen: W-0046 Discord-Dialog: Schalter Befehle und Knöpfe, Kanal je Projekt

Angelegt am 2026-11-24. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
<!-- Brainstorm-Dokumente, UI UX Pro Max Ausgaben, externe Referenzen. Pflege über `works attach-doc`. -->

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->

## Entscheidungen
### E1: Schalter Befehle und Knöpfe, Kanal je Projekt
- Datum: 2026-11-24
- Quelle: Gespräch
- Kontext:
- Entscheidung: commands (Standard an) gilt je Durchgang ohne Neustart; aus: keine Knöpfe und kein Auswahlmenü an Dashboard und neuen Nachrichten, der eigene Bot meldet /works mit leerer Liste ab, Befehle und alte Knöpfe bekommen einen kurzen Hinweis. Kanal je Projekt nur beim eigenen Bot, gegen die Kanalliste des Bots geprüft; beim gemeinsamen Bot gesperrt.
- Begründung: Der gemeinsame Bot schreibt in genau einen gekoppelten Kanal; ältere Nachrichten nachträglich zu bearbeiten wäre viel Last für wenig Nutzen.
- Verworfene Alternativen:
  - Alte Nachrichten beim Ausschalten bearbeiten: viele Anfragen an Discord
  - Kanal je Projekt beim gemeinsamen Bot: der Dienst erlaubt nur den gekoppelten Kanal
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
