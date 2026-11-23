---
id: W-0042
title: "CI rot: works Selbsttest, Schritt Selbsttest"
type: bug
priority: P2
status: in-arbeit
effort:
risk:
created: 2026-11-23
updated: 2026-11-23
due:
completed:
milestone:
branch: fix/w-0042-ci-rot-works-selbsttest
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
1. Discord-Bot läuft, `works discord emit ship --json '{"id":"W-1","step":"start","run":"x"}'`, danach kein Ende (ship hart abgebrochen).
2. Eine Aufgabe ins Review setzen: keine Nachricht für bis zu 30 Minuten. Immer.
3. Im Selbsttest (langsamer Runner): Statuspost angelegt, aber noch nicht angeheftet, als der Test prüfte. Manchmal.

## Erwartetes Verhalten
Der Bot meldet wieder, sobald die Git-Schritte von ship vorbei sind; ein abgebrochener Lauf hält ihn nicht lange auf. Der Test wartet auf das Anheften.

## Tatsächliches Verhalten
Projekt bis zu 30 Minuten eingefroren; im Selbsttest eine Kette von Folgefehlern, weil der erste gescheiterte Schritt den Bot stoppte.

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->
CI für 166f57f: nur Node 18 auf macOS rot, alle anderen 9 Jobs grün.

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
Zwei Teile. Erstens prüfte der Test „angeheftet“, sobald der Statuspost da war; Anheften ist eine eigene Anfrage danach. Auf dem langsamen Runner kam der Test dazwischen, der Schritt stoppte den Bot, die folgenden scheiterten mit. Zweitens, echt im Bot: Ein ship-Start ohne Ende (hier, weil der Test abbrach; im Alltag bei einem harten Abbruch) fror das Projekt 30 Minuten ein, also keine Ereignisse.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
Der Bot taut schon nach dem Push auf (die Git-Schritte sind dann vorbei, das Warten auf die CI braucht kein Einfrieren), ohne Remote beim Ende oder Abbruch; ein hängender Lauf hält höchstens 10 Minuten. Im Test: auf das Anheften warten, jeder Discord-Schritt startet den Bot selbst, Wartezeit 25 s. Nebenbei einmal rot gesehen und einzeln dreimal grün: „Board merkt sich seinen Port“ (belegter Port) unter Windows, vermutlich ein seltener Wackler ohne Bezug zum Bot.

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-23: Aufgabe angelegt
- 2026-11-23: Gestartet (Status: backlog → in-arbeit)
- 2026-11-23: Behoben: Auftauen nach dem Push, Einfrieren höchstens 10 Minuten, Discord-Tests robust gegen langsame Runner. Selbsttest Windows grün (Discord 7/7 mit und ohne WebSocket).
