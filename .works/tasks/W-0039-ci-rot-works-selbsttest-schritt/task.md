---
id: W-0039
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
branch: fix/w-0039-ci-rot-works-selbsttest
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
Vom CI-Wächter angelegt: CI rot für Commit fb9e30f in MecryTv/mycron.

Rote Jobs:
- Node 18 auf macos-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45230140085/job/137887143233
- Node 18 auf ubuntu-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45230140085/job/137887143311
- Node 20 auf macos-latest (Schritt Selbsttest): https://github.com/MecryTv/mycron/actions/runs/45230140085/job/137887143467

Die Fehlerstelle steht unter Logs, soweit GitHub sie herausgibt (ohne GITHUB_TOKEN nur die Annotationen). Den ganzen Log zeigen die Links.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. Discord-Bot läuft.
2. `works new --type chore --title X --status review` (oder anlegen und sofort auf review setzen, bevor der Bot einmal hinsieht).
3. Keine Nachricht „X im Review“. Häufigkeit: immer mit `--status review`, auf langsamen Runnern manchmal im Selbsttest.

## Erwartetes Verhalten
Nachricht „<ID> im Review“ wie bei einer Aufgabe, die später ins Review wechselt.

## Tatsächliches Verhalten
Keine Nachricht, der Selbsttest läuft in die Zeitüberschreitung „Review Ship-Probe“.

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->
CI für fb9e30f: rot auf Node 18 macOS, Node 18 Ubuntu, Node 20 macOS; grün auf Windows, Node 22 und Node 20 Ubuntu.

## Logs und Fehlermeldungen
```
Process completed with exit code 1.
Selbsttest: Discord: Branch-Wechsel, ship, Bahnen, Sperrdatei, Versionswechsel, Neustart ohne Verluste: Zeit abgelaufen: Review Ship-Probe
```

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
Der Bot meldete für Aufgaben, die er zum ersten Mal sieht, nur P1. Sah er eine Aufgabe erst, als sie schon im Review war, fehlte die Review-Nachricht. Auf langsamen Runnern lagen `works new` und `works set status=review` im Selbsttest zwischen zwei Blicken des Bots. Das fehlende WebSocket unter Node 18/20 war nicht die Ursache: Lokal mit `--no-experimental-websocket` blieb alles grün.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
discord-bot.mjs meldet neue Aufgaben im Review wie einen Wechsel ins Review (einmal je Aufgabe). Erledigte oder Fragen neuer Aufgaben bleiben still, sonst brächte ein Import Dutzende Nachrichten. Im Selbsttest wartet der ship-Teil auf die verarbeitete Startnachricht statt auf eine feste Pause, und die Gateway-Prüfungen hängen an `typeof WebSocket` statt an der Node-Version.

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
- 2026-11-23: Ursache gefunden und behoben: neue Aufgaben im Review wurden nicht gemeldet. Regressionstest 'Review einer neuen Aufgabe'. Selbsttest Windows 37/37, Discord-Schritte auch ohne WebSocket grün.
