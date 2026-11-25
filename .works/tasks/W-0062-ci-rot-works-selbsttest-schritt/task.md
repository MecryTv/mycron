---
id: W-0062
title: "CI rot: works Selbsttest, Schritt Selbsttest"
type: bug
priority: P2
status: backlog
effort:
risk:
created: 2026-11-25
updated: 2026-11-25
due:
completed:
milestone:
branch:
tags: []
blocked_by: []
blocks: []
related: []
source: ci-watch
incomplete: false
---

# CI rot: works Selbsttest, Schritt Selbsttest

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Vom CI-Wächter angelegt: CI rot für Commit efa3113 in MecryTv/mycron.

Rote Jobs:
- Node 18 auf windows-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45678612590/job/139432804251

Die Fehlerstelle steht unter Logs, soweit GitHub sie herausgibt (ohne GITHUB_TOKEN nur die Annotationen). Den ganzen Log zeigen die Links.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. 

## Erwartetes Verhalten

## Tatsächliches Verhalten

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
```
Process completed with exit code 1.
Selbsttest: Board merkt sich seinen Port: Neustart ohne --port, belegter Port weicht aus: Belegter letzter Port nicht ausgewichen: Live-Board läuft: http://127.0.0.1:48259/ | Blocker: {"address":"127.0.0.1","family":"IPv4","port":48259} | server.json: { "pid": 7544, "port": 48260, "host": "127.0.0.1", "version": "7157e6ba9e48", "cli": "D:\\a\\mycron\\mycron\\plugins\\works\\skills\\works\\scripts\\works.mjs", "started": "2026-11-25T18:48:11.384Z" } | server.log: Beobachte C:\Users\RUNNER~1\AppData\Local\Temp\works-selftest-XX8kKF\projekt\.works / Beenden mit Strg+C. / Live-Board läuft: http://127.0.0.1:48259/ / Beobachte C:\Users\RUNNER~1\AppData\Local\Temp\works-selftest-XX8kKF\projekt\.works / Beenden mit Strg+C. / Live-Board läuft: http://127.0.0.1:48260/ / Beobachte C:\Users\RUNNER~1\AppData\Local\Temp\works-selftest-XX8kKF\projekt\.works / Beenden mit Strg+C.
```

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->

## Lösung
<!-- Was wurde geändert und warum genau so? -->

## Akzeptanzkriterien
- [ ] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [ ] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [ ] 

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-25: Aufgabe angelegt
