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

### E3: Ereignisse aus dem Stand der Projekte
- Datum: 2026-11-23
- Quelle: Claude
- Kontext:
- Entscheidung: Der Bot vergleicht je Projekt Aufgaben, Warteschlange und activity.json mit dem letzten Stand und leitet daraus die Ereignisse ab. Nur ship, ci-watch und der Wochenbericht legen Ereignisse in ~/.works/discord/outbox.
- Begründung: Hooks bleiben unverändert schnell, Änderungen aus Board, CLI und Hooks werden gleich behandelt, und nach einem Neustart erkennt der Bot verpasste Wechsel am gespeicherten Stand.
- Verworfene Alternativen:
  - Jeder Hook schreibt Ereignisse: mehr Arbeit in jedem Hook und doppelte Logik zum Board
- Konsequenzen:

### E4: Gateway ab Node 22, Nachrichten auch darunter
- Datum: 2026-11-23
- Quelle: Claude
- Kontext:
- Entscheidung: Unter Node 22 verbindet sich der Bot mit dem Gateway (online, Grundlage für W-0037). Darunter und wenn das Gateway nicht erreichbar ist, schickt er weiter über REST.
- Begründung: works läuft in der CI auf Node 18 bis 22; die Hinweise sollen überall funktionieren, das globale WebSocket gibt es erst ab Node 22.
- Verworfene Alternativen:
  - Bot nur ab Node 22: ältere Installationen bekämen gar keine Hinweise
- Konsequenzen:

### E5: Rechte und Verzögerungen
- Datum: 2026-11-23
- Quelle: Claude, Discord-Doku
- Kontext:
- Entscheidung: Einladung nur mit Kanal sehen, senden, Links einbetten, Verlauf lesen und PIN_MESSAGES (1 << 51), angeheftet über PUT /channels/{id}/messages/pins/{id}. Freigabe meldet sich nach 30 s, fertig nach 120 s, Ruhezeit 22 bis 7 Uhr; alles per works discord set änderbar.
- Begründung: Nachrichten verwalten wäre ein viel breiteres Recht. Ohne Verzögerung klingelt das Handy bei jeder Freigabe, die du am Rechner sofort erteilst.
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

## Gewählter Entwurf

- 2026-11-23: Variante F2 „F verbessert“ gewählt, Grund: Wahl des Nutzers: F verbessert. Datei: design/F2-f-verbessert.html. Nicht gewählt: F Statuspost und Nachrichten mit Knöpfen, G Statuspost mit Thread
