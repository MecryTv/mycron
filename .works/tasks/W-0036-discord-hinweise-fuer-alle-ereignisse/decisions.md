# Designentscheidungen: W-0036 Discord: Hinweise für alle Ereignisse per Webhook

Angelegt am 2026-11-23. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
<!-- Brainstorm-Dokumente, UI UX Pro Max Ausgaben, externe Referenzen. Pflege über `works attach-doc`. -->

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->

## Entscheidungen
### E1: Eigener Bot statt Webhook
- Datum: 2026-11-23
- Quelle: Nutzer
- Kontext: Entwürfe A bis E lagen vor, Empfehlung war Webhook mit A und D
- Entscheidung: Eigener Discord-Bot works; Nachrichten als Mischung aus B und C; Einstellungen nach D, komplett überarbeitet; aufgeteilt in W-0036, W-0037, W-0038
- Begründung: Wunsch des Nutzers am 2026-11-23: mehr Freiheiten; der Bot kann den Statuspost anheften und Knöpfe sowie Slash-Befehle anbieten
- Verworfene Alternativen:
  - Webhook allein: kein Anheften
  - kein Rückweg; A kompakt und E Tabelle: vom Nutzer nicht gewählt
- Konsequenzen: Nutzer legt Bot und Token im Entwicklerportal an; ein Bot-Prozess je Rechner, Node 22 oder neuer; Freigaben aus Claude Code bleiben in Claude Code

### E2: Nachrichten nach Entwurf F
- Datum: 2026-11-23
- Quelle: Nutzer
- Kontext:
- Entscheidung: Angehefteter Statuspost je Projekt plus Ereignisse als eigene Nachrichten mit Feldern und Knöpfen (Entwurf F), vom Nutzer gewählt mit dem Wunsch, ihn zu verbessern. Verbesserte Fassung als F2.
- Begründung: Wahl des Nutzers am 2026-11-23: F und J, aber verbessert
- Verworfene Alternativen:
  - G Statuspost mit Thread: nicht gewählt
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
