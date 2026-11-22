# Designentscheidungen: W-0032 Hub: Projekte aus der Liste nehmen

Angelegt am 2026-11-22. Diese Datei hält fest, was entschieden wurde, warum, und welche Alternativen verworfen wurden.

## Quellen
<!-- Brainstorm-Dokumente, UI UX Pro Max Ausgaben, externe Referenzen. Pflege über `works attach-doc`. -->

## Brainstorm-Zusammenfassung
<!-- Kernaussagen aus dem Brainstorming in eigenen Worten: Problemverständnis, betrachtete Ansätze, Ergebnis. -->

## Entscheidungen
### E1: Nur laufende Boards statt Knopf
- Datum: 2026-11-22
- Quelle: Nutzer
- Kontext: Für das Entfernen gestoppter Projekte lagen drei Knopf-Entwürfe vor
- Entscheidung: Der Hub zeigt nur laufende Boards; bei einem verbliebenen Board schließt er sich, bei zwei oder mehr erscheint er wieder. Gestoppt-Liste, Board starten im Hub und Projekt hinzufügen entfallen
- Begründung: Idee des Nutzers am 2026-11-22: Boards sollen automatisch und live aus der Liste verschwinden
- Verworfene Alternativen:
  - A Knopf je Zeile
  - B × mit Rückgängig
  - C Liste bearbeiten: alle durch die automatische Lösung überflüssig
- Konsequenzen: Gestoppte Projekte startet man im Projekt (works board --serve) oder aus einem verwaisten Tab; die Registrierung in projects.json bleibt für verwaiste Tabs

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
