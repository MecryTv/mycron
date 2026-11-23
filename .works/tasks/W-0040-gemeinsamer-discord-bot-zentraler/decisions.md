# Designentscheidungen: W-0040 Gemeinsamer Discord-Bot: zentraler Dienst auf dem VPS

Angelegt am 2026-11-23. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
- [Konzept: gemeinsamer Bot (Ablauf, Sicherheit, Kosten)](docs/konzept.md) (kopiert am 2026-11-23)

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->
Das Token eines gemeinsamen Bots kann nicht ins Plugin (Übernahme, Sperre durch Discord). Deshalb ein Dienst auf dem VPS des Nutzers (Docker), der als einziger das Token hat. works koppelt sich mit einem einmaligen Code und bekommt einen Geräteschlüssel, der nur in die gekoppelten Kanäle schreiben und nur eigene Nachrichten bearbeiten darf. Der lokale Bot aus W-0036 bleibt (Ereignisse, F2, Statuspost) und schickt statt an Discord an den Dienst. Offen für den Nutzer: Kopplung P (Code aus Discord) oder Q (Code aus works), Einrichtung R, eigener Bot als Option (Empfehlung ja), Domain.

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
