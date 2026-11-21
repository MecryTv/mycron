# Viele Prüfungen und Funde in der Live-Ansicht

Anlass: RL Nexus mit 51 Prüfungen, ein Lauf mit 45 Fehlschlägen, davon 44 mit derselben Meldung („The system cannot find the path specified.“). Die Kachel „Wartet auf dich“ listete 48 Zeilen und zog alle Kacheln auf Bildschirmhöhe, die Prüfungsspalte zeigte 51 Zeilen mit je einem Aufklapper.

## Für beide Varianten gleich

- „Wartet auf dich“ fasst je Aufgabe und Art zusammen („W-0152 45 Prüfungen fehlgeschlagen“, „W-0152 Fund in audit“), höchstens vier Zeilen, dann „und N weitere“.
- Ab etwa 9 Prüfungen je Aufgabe kompakte Darstellung, darunter bleibt die bisherige Liste.
- Oben in jeder Gruppe Zähler (fehlgeschlagen, Fund, bestanden, läuft, offen) und ein Streifen mit einem Strich je Prüfung.

## Variante A: Fehlergruppen (Empfehlung)

Fehlschläge gruppiert nach gleicher erster Zeile der Ausgabe: eine Karte je Meldung mit Anzahl, Meldung, den ersten zehn Namen und „+N weitere“, Knöpfe „Claude beheben lassen“ (ein Kommentar für die ganze Gruppe) und „Ausgabe ansehen“. Funde einzeln. Bestandene als eine Zeile. „Alle 51 Prüfungen anzeigen“ klappt eine zweispaltige, scrollbare Liste auf. Während eines Laufs nur die laufende Prüfung und eine Zeile zu den bestandenen, der Rest steckt im Streifen.

Stärke: zeigt sofort die gemeinsame Ursache und erlaubt eine Aktion für alle. Schwäche: einzelne Namen erst auf Klick.

## Variante B: Prüfmatrix

Jede Prüfung als kleine Kachel in einem Raster, Filter nach Zustand, ein Klick zeigt Befehl, Meldung und Knöpfe darunter.

Stärke: alle Namen auf einen Blick. Schwäche: die gemeinsame Ursache sieht man erst nach mehreren Klicks, das Raster braucht bei 51 Prüfungen rund 13 Zeilen.
