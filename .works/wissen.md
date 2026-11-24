# Projektwissen

Was Claude in diesem Projekt wissen muss. Claude liest die passenden Einträge vor der Arbeit. Bearbeiten im Board unter Wissen oder mit works know.

## Selbsttest

### Discord-Schritte auch ohne WebSocket prüfen
<!-- k:id=20f11a by=Claude source=W-0045 date=2026-11-24 status=vorschlag -->
Die CI testet Node 18, 20 und 22. Unter 18 und 20 gibt es kein globales WebSocket: Der Discord-Bot läuft ohne Gateway, ohne Knöpfe, Befehle und Status. Lokal läuft Node 24. Vor dem Abschluss einer Discord-Änderung die Schritte zusätzlich mit NODE_OPTIONS=--no-experimental-websocket laufen lassen (works selftest --only Discord); Prüfungen, die das Gateway brauchen, hinter hasWs.
