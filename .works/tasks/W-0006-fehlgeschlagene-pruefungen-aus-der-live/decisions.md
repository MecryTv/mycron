# Entscheidungen W-0006

## Gewählter Entwurf

- 2026-11-21: Variante A „Live-Ansicht Ergänzungen W-0006 bis W-0009“ gewählt, Grund: Nutzer: Beide A (Freigabe A Kacheln, Verbrauch A in Kachel und Kopf), Rest wie im Entwurf. Datei: design/A-live-ansicht-ergaenzungen-w.html

## Entscheidungen

- 2026-11-21: Nutzt `works checks run --only` über die vorhandene API-Aktion checksRun, erweitert um `only` (höchstens 200 Namen, jeder Name wird geprüft). Kein eigener Endpunkt.
- 2026-11-21: Bestandene Ergebnisse bleiben stehen und gelten weiter, auch für die Definition of Done. Sonst müssten nach einem Fix doch wieder alle Prüfungen laufen, was die Aufgabe vermeiden soll.
- 2026-11-21: Doppelte Läufe verhindert das Board: Während eines Laufs (oder bis er beginnt) gibt es keine Knöpfe. Die API selbst sperrt nicht, zwei Browserfenster könnten theoretisch gleichzeitig starten.
- 2026-11-21 (Review): Korrektur. Jedes Ergebnis merkt sich jetzt seinen Codestand (`fp`). Nach einem Teillauf gelten stehengebliebene Ergebnisse nur weiter, solange sich der Code nicht geändert hat; sonst sind sie für die Definition of Done veraltet und `works done` lässt sie neu laufen. Vorher hätte ein Teillauf alte grüne Ergebnisse auf den neuen Stand gestempelt. Skill-Prüfungen bekommen keinen Knopf.
