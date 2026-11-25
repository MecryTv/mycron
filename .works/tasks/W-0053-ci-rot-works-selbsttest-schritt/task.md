---
id: W-0053
title: "CI rot: works Selbsttest, Schritt Selbsttest mit Browser, Selbsttest"
type: bug
priority: P4
status: backlog
effort:
risk:
created: 2026-11-24
updated: 2026-11-25
due:
completed:
milestone:
branch: fix/w-0053-ci-rot-works-selbsttest
tags: []
blocked_by: []
blocks: []
related: [W-0062]
source: ci-watch
incomplete: false
---

# CI rot: works Selbsttest, Schritt Selbsttest mit Browser, Selbsttest

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Vom CI-Wächter angelegt: CI rot für Commit 85ecc2a in MecryTv/mycron.

Rote Jobs:
- Board im Browser (Schritt Selbsttest mit Browser): https://github.com/MecryTv/mycron/actions/runs/45486887051/job/138774531223
- Node 22 auf macos-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45486887051/job/138774531625

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
Selbsttest: Discord: Dialog Discord-Bot im Browser mit Reitern, Vorschau, Kanalwahl und Einrichtung (W-0038): Unexpected end of JSON input
Selbsttest: Board merkt sich seinen Port: Neustart ohne --port, belegter Port weicht aus: Belegter letzter Port nicht ausgewichen: Live-Board läuft: http://127.0.0.1:48488/
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
Stand: 2026-11-25 19:04

Diagnose im Selbsttest (Schritt „Board merkt sich seinen Port“) eingebaut und lokal nach main gemergt, geht mit dem nächsten ship hoch. Browser-Teil des ursprünglichen Fehlers war die halbe Datei aus writeJson (W-0060, behoben). Offen: einmaliger macOS-Fehler; tritt er wieder auf, die Meldung mit Blocker, server.json und server.log auswerten.

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-25: Annotationen der beiden roten Jobs (85ecc2a) gelesen: Der Browser-Job scheiterte an „Unexpected end of JSON input“, das ist die halbe Datei aus writeJson und mit W-0060 behoben. Offen bleibt nur macOS: „Belegter letzter Port nicht ausgewichen: Live-Board läuft: http://127.0.0.1:48488/“, einmal in sechs CI-Läufen, seither grün. Lokal nicht nachzustellen; die Ursache ist aus den Annotationen nicht zu erkennen.
- 2026-11-25: Priorität: P2 → P4
- 2026-11-25: Nutzer: Diagnose in den Test einbauen (server.json und Ende von server.log bei einem Fehler) und auf P4, bis es wieder auftritt.
- 2026-11-25: Gestartet (Status: backlog → in-arbeit)
- 2026-11-25: Diagnose eingebaut (test(W-0053) auf main): Bei einem Fehler nennt der Port-Schritt Blocker-Zustand, server.json und die letzten 8 Zeilen von server.log. Aufgabe bleibt offen (P4), bis der Fehler wieder auftritt; dann die Meldung aus der CI auswerten.
- 2026-11-25: Status: in-arbeit → backlog (Grund: Diagnose eingebaut, wartet auf erneutes Auftreten)
- 2026-11-25: Übergabe aktualisiert
- 2026-11-25: Beziehung: W-0062 related
