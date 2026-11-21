# Entscheidungen W-0008

## Gewählter Entwurf

- 2026-11-21: Variante A „Live-Ansicht Ergänzungen W-0006 bis W-0009“ gewählt, Grund: Nutzer: Beide A (Freigabe A Kacheln, Verbrauch A in Kachel und Kopf), Rest wie im Entwurf. Datei: design/A-live-ansicht-ergaenzungen-w.html

## Entscheidungen

- 2026-11-21: Variante A: "Verbrauch heute" als Zeile in der Kachel Fortschritt, der Verbrauch der gewählten Aufgabe (bisher, alle Tage) im Kopf der Mitte. Keine fünfte Kachel.
- 2026-11-21: Daten aus den usage-Einträgen in time.jsonl. liveUsage merkt sich das Ergebnis und rechnet nur neu, wenn sich Größe oder Änderungszeit der Datei, der Tag oder config.prices ändern. Das Board fragt data.json bei jeder Aktualisierung ab, gelesen wird time.jsonl aber nur nach einer neuen Antwort.
- 2026-11-21: "Heute" ist der lokale Tag (ab Mitternacht Ortszeit), wie meta.today.
- 2026-11-21: Export und Schnappschuss enthalten keinen Verbrauch (meta.usage und task.usage werden entfernt), wie die übrigen Live-Daten.
- 2026-11-21: Ohne erfassten Verbrauch (Stop Hook nicht aktiv oder noch nichts gelaufen) erscheint keine Zeile, statt "0 Tokens" anzuzeigen.
