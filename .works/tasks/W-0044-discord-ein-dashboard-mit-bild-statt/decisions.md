# Entscheidungen W-0044

## Gewählter Entwurf

- 2026-11-23: Variante D3 „Mit Bild“ gewählt, Grund: Wahl des Nutzers. Datei: design/D3-mit-bild.html. Nicht gewählt: D1 Übersicht, Details nur für dich, D2 Umblättern

## Entscheidungen
### E1: Bild bei jeder Bearbeitung hochladen, höchstens alle 5 Minuten neu zeichnen
- Datum: 2026-11-24
- Quelle: Gespräch
- Kontext:
- Entscheidung: Das PNG (gut 3 KB) geht bei jeder Bearbeitung des Dashboards mit (attachments: [{id: 0}]); gezeichnet wird es nur bei geänderten Zahlen und höchstens alle 5 Minuten.
- Begründung: So hängt nichts daran, wie Discord alte Anhänge beim Bearbeiten behandelt; die Last bleibt klein.
- Verworfene Alternativen:
  - Bild nur bei Änderung hochladen: Verweis auf den alten Anhang beim Bearbeiten unsicher
- Konsequenzen:

### E2: Pixelschrift nur in Großbuchstaben, Farben der Reihe nach
- Datum: 2026-11-24
- Quelle: Gespräch
- Kontext:
- Entscheidung: Die eingebaute Schrift kennt Großbuchstaben, Ziffern, Umlaute und wenige Zeichen; Projektnamen stehen im Bild groß. Projektfarben im Bild der Reihe nach aus einer Palette ohne Grün.
- Begründung: Wenig Schriftdaten, gut lesbar auch verkleinert; mit Farben aus dem Namen hatten zwei Projekte dieselbe Farbe, und Grün steht schon für erledigt.
- Verworfene Alternativen:
  - Volle Schrift mit Kleinbuchstaben: doppelt so viele Zeichen ohne Mehrwert
  - Fremder Dienst für Diagramme: nicht gewollt
- Konsequenzen:

### E3: Aufräumen über gemerkte Nachrichten, Status nur beim eigenen Bot
- Datum: 2026-11-24
- Quelle: Gespräch
- Kontext:
- Entscheidung: Der Bot löscht nur Nachrichten, die er sich gemerkt hat (state.msgs mit done), nach cleanup.hours; offene ab ihrer Erledigung. Kein Durchsuchen des Kanalverlaufs. Status in der Mitgliederliste nur beim eigenen Bot; der gemeinsame zeigt /works help.
- Begründung: Alle Nachrichten des Bots sind gemerkt; der gemeinsame Bot ist einer für alle und kann keinen persönlichen Status zeigen.
- Verworfene Alternativen:
  - Kanalverlauf durchsuchen: mehr Rechte und Anfragen für nichts
- Konsequenzen:
