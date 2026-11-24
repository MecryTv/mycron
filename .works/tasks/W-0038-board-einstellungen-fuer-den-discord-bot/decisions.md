# Designentscheidungen: W-0038 Board: Einstellungen für den Discord-Bot

Angelegt am 2026-11-23. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
<!-- Brainstorm-Dokumente, UI UX Pro Max Ausgaben, externe Referenzen. Pflege über `works attach-doc`. -->

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->

## Entscheidungen
### E1: Einstellungen nach Entwurf J
- Datum: 2026-11-23
- Quelle: Nutzer
- Kontext:
- Entscheidung: Eigener Dialog mit Reitern und Vorschau (Entwurf J), vom Nutzer gewählt mit dem Wunsch, ihn zu verbessern. Verbesserte Fassung als J2, mit der Einrichtung aus K im Reiter Verbindung.
- Begründung: Wahl des Nutzers am 2026-11-23: F und J, aber verbessert
- Verworfene Alternativen:
  - I Seitenleiste: nicht gewählt
- Konsequenzen:

### E2: Schreibrecht im Kanal lokal berechnet
- Datum: 2026-11-24
- Quelle: Agent
- Kontext:
- Entscheidung: works rechnet das Recht des Bots wie Discord aus Rollen und Overwrites (sehen, senden, Links einbetten), eine Funktion in discord-api.mjs für Plugin und Dienst. Ausgegraute Kanäle tragen den Grund.
- Begründung: Discord liefert das effektive Recht je Kanal nicht über REST; mit einer gemeinsamen Funktion sagen Board, CLI und Dienst dasselbe.
- Verworfene Alternativen:
  - Ausprobieren mit einer Testnachricht: hinterlässt Nachrichten und braucht je Kanal einen Aufruf
- Konsequenzen:

### E3: Umzug der Kopplung beim gemeinsamen Bot
- Datum: 2026-11-24
- Quelle: Agent
- Kontext:
- Entscheidung: POST /v1/link/channel zieht die Kopplung in einen anderen Kanal desselben Servers, nur wenn der Bot dort schreiben darf. In den bis zu fünf verlassenen Kanälen darf das Gerät nur eigene Nachrichten bearbeiten und löschen, nichts Neues schreiben.
- Begründung: Sonst bliebe das alte Dashboard stehen, weil der Dienst Löschen außerhalb des gekoppelten Kanals ablehnte.
- Verworfene Alternativen:
  - Neu koppeln mit /works verbinden: der Nutzer wollte die Wahl im Board
  - Dienst löscht das alte Dashboard selbst: er weiß nicht
  - welche Nachricht das Dashboard ist
- Konsequenzen:

### E4: Token, Code und Trennen nur am Rechner
- Datum: 2026-11-24
- Quelle: Agent
- Kontext:
- Entscheidung: /api/discord nur mit Besitzer-Level edit; token, link und disconnect zusätzlich nur bei lokalen Anfragen. Antworten enthalten Token und Schlüssel nur maskiert.
- Begründung: Über einen geteilten Bearbeitungslink ginge das Token unverschlüsselt durchs Netz.
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

- 2026-11-23: Variante J2 „J verbessert“ gewählt, Grund: Wahl des Nutzers (J verbessert), dazu K für die Kanalwahl. Datei: design/J2-j-verbessert.html. Nicht gewählt: I Seitenleiste Discord-Bot, J Dialog mit Vorschau, K Kanal im Board wählen

- 2026-11-23: Variante J2 „J verbessert“ gewählt, Grund: Wahl des Nutzers: J verbessert. Datei: design/J2-j-verbessert.html. Nicht gewählt: I Seitenleiste Discord-Bot, J Dialog mit Vorschau, K Einrichtung in Schritten
