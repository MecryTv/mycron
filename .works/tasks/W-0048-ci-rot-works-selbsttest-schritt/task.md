---
id: W-0048
title: "CI rot: works Selbsttest, Schritt Selbsttest mit Browser, Selbsttest"
type: bug
priority: P2
status: in-arbeit
effort:
risk:
created: 2026-11-24
updated: 2026-11-24
due:
completed:
milestone:
branch: fix/w-0048-ci-rot-works-selbsttest
tags: []
blocked_by: []
blocks: []
related: []
source: ci-watch
incomplete: false
---

# CI rot: works Selbsttest, Schritt Selbsttest mit Browser, Selbsttest

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->
Der neue Selbsttest-Schritt zu W-0047 wartete auf das kurze Fenster, in dem das Gateway getrennt ist; auf den CI-Rechnern war es vorbei, bevor der Test hinsah, und der Schritt lief in die Zeit.

## Beschreibung
Vom CI-Wächter angelegt: CI rot für Commit 6d748e2 in MecryTv/mycron.

Rote Jobs:
- Board im Browser (Schritt Selbsttest mit Browser): https://github.com/MecryTv/mycron/actions/runs/45428467314/job/138566857057
- Node 22 auf ubuntu-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45428467314/job/138566857465
- Node 22 auf macos-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45428467314/job/138566857475

Die Fehlerstelle steht unter Logs, soweit GitHub sie herausgibt (ohne GITHUB_TOKEN nur die Annotationen). Den ganzen Log zeigen die Links.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. Gateway verbunden, Discord verlangt eine Neuverbindung (op 7).
2. In den ersten 200 ms danach (bis connect neu läuft) gilt die Verbindung noch als bereit; ein setStatus geht dann ins Leere.
3. Der Test wartete von außen auf „nicht bereit“ und verpasste das Fenster auf schnellen Rechnern. Manchmal (CI).

## Erwartetes Verhalten

## Tatsächliches Verhalten

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
```
Process completed with exit code 1.
Selbsttest: Discord: Status des Bots übersteht eine Gateway-Fortsetzung (W-0047): Zeit abgelaufen: Gateway trennt für die Fortsetzung
```

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
Zwei Dinge: Der Test hing an einem Zeitfenster, das er nur zufällig sah. Und Gateway.reconnect setzte ready erst in connect() zurück, 200 ms nach der Trennung; ein Status aus dieser Lücke wurde an eine geschlossene Verbindung geschickt und ging verloren, statt nach der Fortsetzung nachzukommen.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
reconnect setzt ready sofort auf false, damit setStatus den Status für RESUMED vormerkt. Der Test löst die Trennung selbst aus (g.reconnect(true)) und prüft direkt danach, dass das Gateway nicht mehr als bereit gilt; kein Warten auf ein Zeitfenster mehr.

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [x] Der Schritt hängt an keinem Zeitfenster mehr und läuft lokal mehrmals hintereinander grün

## Betroffene Dateien
- plugins/works/skills/works/scripts/discord-api.mjs: Gateway.reconnect
- plugins/works/skills/works/scripts/selftest.mjs: Schritt zu W-0047

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe
Stand: 2026-11-24 16:50

Behoben: Gateway gilt ab der Trennung als nicht bereit; Test löst die Trennung selbst aus. Schritt 3x grün, Discord-Schritte 11/11 mit und ohne WebSocket, Dienst-Test grün. Code-Audit: kleine Änderung, nichts gefunden.

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-24: Gestartet (Status: backlog → in-arbeit)
- 2026-11-24: Akzeptanzkriterien: "Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen" abgehakt
- 2026-11-24: Akzeptanzkriterien: "Regressionstest deckt den Fall ab oder der Verzicht ist begründet" abgehakt
- 2026-11-24: Akzeptanzkriterien: "Der Schritt hängt an keinem Zeitfenster mehr und läuft lokal mehrmals hintereinander grün" abgehakt
- 2026-11-24: Übergabe aktualisiert
