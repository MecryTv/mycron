# Designentscheidungen: W-0040 Gemeinsamer Discord-Bot: zentraler Dienst auf dem VPS

Angelegt am 2026-11-23. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
- [Konzept: gemeinsamer Bot (Ablauf, Sicherheit, Kosten)](docs/konzept.md) (kopiert am 2026-11-23)

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->
Das Token eines gemeinsamen Bots kann nicht ins Plugin (Übernahme, Sperre durch Discord). Deshalb ein Dienst auf dem VPS des Nutzers (Docker), der als einziger das Token hat. works koppelt sich mit einem einmaligen Code und bekommt einen Geräteschlüssel, der nur in die gekoppelten Kanäle schreiben und nur eigene Nachrichten bearbeiten darf. Der lokale Bot aus W-0036 bleibt (Ereignisse, F2, Statuspost) und schickt statt an Discord an den Dienst. Offen für den Nutzer: Kopplung P (Code aus Discord) oder Q (Code aus works), Einrichtung R, eigener Bot als Option (Empfehlung ja), Domain.

## Entscheidungen
### E1: Einrichtung nach Entwurf R
- Datum: 2026-11-23
- Quelle: Nutzer
- Kontext:
- Entscheidung: Beim ersten Einrichten zuerst die Wahl: gemeinsamer Bot (empfohlen, Einladen und Code) oder eigener Bot (Token wie W-0036). Darunter der ehrliche Hinweis, was über den Dienst läuft. Der eigene Bot bleibt damit als Option.
- Begründung: Wahl des Nutzers am 2026-11-23: R finde ich nicht schlecht
- Verworfene Alternativen:
- Konsequenzen:

### E2: Dienst bildet die Discord-Routen nach
- Datum: 2026-11-23
- Quelle: Claude
- Kontext:
- Entscheidung: works-bot bietet /v1/users/@me, /v1/channels/:id/messages, …/pins wie Discord an; der lokale Bot aus W-0036 spricht ihn mit Bearer-Schlüssel statt Bot-Token an und braucht im gemeinsamen Modus kein Gateway.
- Begründung: Ein Codepfad für beide Wege: Ereignisse, Statuspost und Tests aus W-0036 gelten unverändert.
- Verworfene Alternativen:
- Konsequenzen:

### E3: Kaputte Kopplungen und Schutz des gemeinsamen Bots
- Datum: 2026-11-23
- Quelle: Audit
- Kontext:
- Entscheidung: Verweigert Discord den Kanal (50001, 50013, 10003, Kanal gelöscht, Bot vom Server entfernt), wird die Kopplung als kaputt markiert und works bekommt 410; sein Bot hört auf. Dazu: Code nur, wenn der Bot im Kanal posten kann, höchstens 20 Geräte je Server, 300 gemerkte Nachrichten je Gerät, Ablauf nach 90 Tagen ohne Nutzung, gemeinsamer Takt 40/s und Pause über 5000 Fehlantworten in 10 Minuten.
- Begründung: Audit: 403-Lawinen aus verwaisten oder böswilligen Kopplungen könnten Discord dazu bringen, die IP des Dienstes für alle zu sperren.
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

- 2026-11-23: Variante P „Kopplung: Code aus Discord“ gewählt, Grund: Wahl des Nutzers: Code aus Discord. Datei: design/P-kopplung-code-aus-discord.html. Nicht gewählt: Q Kopplung: Code aus works, R Einrichtung: gemeinsam oder eigener Bot
