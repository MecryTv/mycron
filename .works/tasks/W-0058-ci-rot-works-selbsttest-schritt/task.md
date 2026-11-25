---
id: W-0058
title: "CI rot: works Selbsttest, Schritt Selbsttest"
type: bug
priority: P2
status: in-arbeit
effort:
risk:
created: 2026-11-25
updated: 2026-11-25
due:
completed:
milestone:
branch: fix/w-0058-ci-rot-works-selbsttest
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
Vom CI-Wächter angelegt: CI rot für Commit dcfad25 in MecryTv/mycron.

Rote Jobs:
- Node 18 auf ubuntu-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45641032271/job/139299412762
- Node 22 auf macos-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45641032271/job/139299413001

Die Fehlerstelle steht unter Logs, soweit GitHub sie herausgibt (ohne GITHUB_TOKEN nur die Annotationen). Den ganzen Log zeigen die Links.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. Aufgabe im Review, Karte zeigt „Im Review“.
2. ship start, dann Aufgabe erledigt, dann ship push.
3. Der Bot verarbeitet den Push und vergleicht im selben Durchgang die Aufgaben: ship-Eintrag und Annahme des Reviews bekommen denselben Zeitstempel (dieselbe Millisekunde). Häufigkeit: auf schnellen Linux- und macOS-Runnern regelmäßig, unter Windows selten. Im Selbsttest jetzt immer, mit festgehaltener Uhr.

## Erwartetes Verhalten
Die Karte zeigt nach dem Push „Erledigt · angenommen“.

## Tatsächliches Verhalten
Die Karte bleibt bei „Wird ausgeliefert · ✓ gepusht“, bis ship endet.

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->
CI: Node 18 auf ubuntu-latest, Node 22 auf macos-latest; lokal Windows mit Node 24 grün.

## Logs und Fehlermeldungen
```
Process completed with exit code 1.
Selbsttest: Discord: Branch-Wechsel, ship, Bahnen, Sperrdatei, Versionswechsel, Neustart ohne Verluste: Zeit abgelaufen: Review nach dem Push angenommen
```

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
cardState() in discord-bot.mjs nimmt als Zustand den Karteneintrag mit dem größten Zeitstempel u, bei Gleichstand den späteren in der Reihenfolge des Objekts. u war Date.now(); der Review-Eintrag liegt im Objekt vor dem ship-Eintrag, weil er früher angelegt wurde. Kommen ship push und die Annahme in derselben Millisekunde, gewinnt deshalb ship.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
upsert() vergibt u streng steigend (lastU, mindestens Date.now()). So ist der zuletzt eingetragene Schritt immer der jüngste, unabhängig von der Uhrauflösung. Eine Stelle für alle Karteneinträge statt einer Sonderregel für ship. Regressionstest „Karte zeigt bei gleicher Zeit den späteren Schritt (W-0058)“ mit festgehaltener Uhr.

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe
Stand: 2026-11-25 16:38

Fix: streng steigender Zeitstempel je Karteneintrag in upsert() (discord-bot.mjs), Regressionstest mit festgehaltener Uhr. Tests: mit Browser 59/59, ohne WebSocket 52/52, works-bot grün. Code-Audit: eine Zeile, kein Fund.

## Verlauf
- 2026-11-25: Aufgabe angelegt
- 2026-11-25: Gestartet (Status: backlog → in-arbeit)
- 2026-11-25: Ursache gefunden: cardState wählt den Eintrag mit dem jüngsten Zeitstempel u (Date.now()); nach dem Push kommen ship-Schritt und Annahme des Reviews im selben Durchgang, bei gleicher Millisekunde gewinnt der zuerst angelegte ship-Eintrag und die Karte bleibt bei „Wird ausgeliefert“. Test „Karte zeigt bei gleicher Zeit den späteren Schritt“ ist rot mit genau diesem Bild.
- 2026-11-25: Akzeptanzkriterien: "Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Regressionstest deckt den Fall ab oder der Verzicht ist begründet" abgehakt
- 2026-11-25: Übergabe aktualisiert
