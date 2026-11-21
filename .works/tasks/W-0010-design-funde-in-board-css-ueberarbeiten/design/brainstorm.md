# Brainstorming W-0010 Design-Funde in board.css

## Was die Stellen bedeuten
- `.card::before` (Zeile 293): Priorität. Steht zusätzlich als Text oben rechts auf der Karte ("P2"), der Streifen wiederholt die Information nur in Farbe.
- `.flow .seg::before` (Zeile 153): Statusfarbe der Abschnitte im Ablauf, der Abschnitt ist ohnehin farbig hinterlegt.
- `.feed li` (Zeile 431): Art der Änderung im Verlauf (Status, Priorität, verworfen), steht auch als Text darunter.
- `.toast` (Zeile 474): Art der Meldung (normal, Änderung, Fehler).
- `.ms .track span` (Zeile 195): Meilenstein-Balken animiert `width`.
- Schrift Geist (Zeile 2): als verbreitet gemeldet.

## Ansätze
- A Punkte und Chips: Streifen weg. Priorität als Chip mit Farbe und Form (Raute P1, Punkt P2/P3, Ring P4), damit sie nicht nur über Farbe läuft (UX-Regel "Color Only"). P1-Karten mit getönter Kante. Ablauf und Verlauf mit Punkt, Meldungen mit Symbol.
- B Obere Kante: Farbe an die Oberkante verlegen. Ruhiger, aber weiter reine Farbkennung.
- Beibehalten und markieren: verworfen für die Streifen, weil sie die Priorität nur über Farbe zeigen.
- Meilenstein: transform scaleX statt width, ohne sichtbaren Unterschied. Keine Wahl nötig.
- Schrift: Geist behalten und als gewollt markieren (liegt im Plugin, gut lesbar bei kleinen Größen). Alternativen zum Vergleich: Instrument Sans, IBM Plex Sans (beide OFL, müssten als Datei ins Plugin).

## Empfehlung
A Punkte und Chips, Schrift Geist behalten.
