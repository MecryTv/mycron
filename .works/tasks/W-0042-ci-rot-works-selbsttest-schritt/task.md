---
id: W-0042
title: "CI rot: works Selbsttest, Schritt Selbsttest"
type: bug
priority: P2
status: backlog
effort:
risk:
created: 2026-11-23
updated: 2026-11-23
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
Vom CI-Wächter angelegt: CI rot für Commit 166f57f in MecryTv/mycron.

Rote Jobs:
- Node 18 auf macos-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45233267759/job/137898185070

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
Selbsttest: Discord: Branch-Wechsel, ship, Bahnen, Sperrdatei, Versionswechsel, Neustart ohne Verluste: Zeit abgelaufen: Review einer neuen Aufgabe
Selbsttest: Discord: nichts geht verloren (Bot aus, 429, 502, gelöschter Statuspost), Gateway verbindet neu: Ausgabe enthält nicht "gestoppt": Bot lief nicht.
Selbsttest: Discord: works ship als eine Nachricht, CI rot mit Bug, Wochenbericht: Zeit abgelaufen: ship-Nachricht
Selbsttest: Discord: Ereignisse mit Feldern, Erwähnung nur bei @, Erledigtes wird bearbeitet: works set  status=review → Exit 1: Fehler: Aufgabe null nicht gefunden.
Selbsttest: Discord: Bot startet einmal, verbindet sich, Statuspost angeheftet und gebündelt bearbeitet: Statuspost nicht angeheftet
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
- 2026-11-23: Aufgabe angelegt
