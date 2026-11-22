# Designentscheidungen: W-0025 Hub: alle offenen Boards in einem Tab

Angelegt am 2026-11-22. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
<!-- Brainstorm-Dokumente, UI UX Pro Max Ausgaben, externe Referenzen. Pflege über `works attach-doc`. -->

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->

## Entscheidungen
### E1: Erste Entwürfe verworfen
- Datum: 2026-11-22
- Quelle: Gespräch
- Kontext:
- Entscheidung: A Startseite und Umschalter, B Seitenleiste, C Projekt-Reiter passen nicht. Gewünscht ist eine eigene Hub-Seite mit besonderem Kopf, darunter alle Boards mit Infos zu jedem Board
- Begründung: Rückmeldung des Nutzers am 2026-11-22: Alle Designs passen nicht
- Verworfene Alternativen:
- Konsequenzen:

### E2: Umsetzung von Variante D
- Datum: 2026-11-22
- Quelle: Umsetzung, freigegeben vom Nutzer („Passt so“)
- Kontext: D ist gewählt. Offen war, wo der Hub läuft und wie der Wechsel funktioniert.
- Entscheidung: Jedes Board liefert den Hub unter `/hub`, `works hub` zeigt dieselbe Seite. Die Board-Seite fragt alle 5 s `/boards` und wechselt nur beim Übergang von einem auf mindestens zwei Boards. Aus dem Hub geöffnete Boards (`?from=hub`) wechseln nie. `--open` zählt die Tabs aller Boards. Knöpfe nur lokal mit Token, ausgeführt über das CLI im Projektordner.
- Begründung: Kein zusätzlicher Server-Prozess, der Tab bleibt auf dem Port, den der Nutzer schon offen hat. Das CLI im Projektordner nutzt dieselbe Logik wie `works board` von Hand (Portwahl, Ersetzen veralteter Server).
- Verworfene Alternativen: Hub als eigener Dauerprozess auf 4740 (ein Prozess mehr, eigener Tab), Wechsel bei jedem neuen Board (reißt aus einem gerade geöffneten Board heraus).
- Konsequenzen: Ohne laufendes Board gibt es den Hub nur über `works hub`. Für das eigene Board fehlt „Stoppen“, damit die Seite nicht ihren eigenen Server beendet. „Projekt hinzufügen“ fragt den Ordner mit dem Browser-Dialog ab.

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
- Gegenüber dem Entwurf angehoben, damit alle Paare mindestens 4,5:1 erreichen: CI-Chips und rote P1/Überfällig-Zahlen mit 65 % Signalfarbe und 35 % Textfarbe, Beschriftungen in den Zahlenkacheln und graue Texte im Kopf mit `--text-2` statt `--muted`. Nachgerechnet für hell und dunkel.
- Alle Bedienelemente sind Links oder Knöpfe, Fokusrahmen aus dem Board-CSS. Die Aktualisierung alle 5 s stellt den Fokus wieder her.
- Kopf als h1 „works HUB“, Abschnitte als h2, Boards als h3.

### Verworfene Varianten
<!-- Was wurde gezeigt oder erwogen und warum nicht genommen? -->

## Gewählter Entwurf

- 2026-11-22: Variante D „Kennzahlen-Kopf und große Karten“ gewählt, Grund: Nutzer am 2026-11-22 im Superpowers-Begleiter: Kennzahlen-Kopf und große Karten. Datei: design/D-kennzahlen-kopf-und-grosse.html. Nicht gewählt: E Aktivitäts-Kopf und Liste, F Vorschau-Kacheln
