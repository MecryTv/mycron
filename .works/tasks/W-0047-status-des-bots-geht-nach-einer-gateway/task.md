---
id: W-0047
title: Status des Bots geht nach einer Gateway-Fortsetzung verloren
type: bug
priority: P2
status: erledigt
effort: S
risk:
created: 2026-11-24
updated: 2026-11-24
due:
completed: 2026-11-24
milestone:
branch: fix/w-0047-status-des-bots-geht-nach
tags: [discord]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Status des Bots geht nach einer Gateway-Fortsetzung verloren

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->
Ändert sich der Status des Bots, während das Gateway neu verbindet, kommt er nach einer Fortsetzung (Resume) nie bei Discord an.

## Beschreibung
Gefunden bei der Prüfung von W-0038 am 2026-11-24: Der Selbsttest-Schritt zu W-0044 (Status des Bots bei einer Freigabe) lief einmal in die Zeit. Vermutete Ursache: Gateway.setStatus schickt den neuen Status nur, wenn die Verbindung bereit ist; sonst merkt er ihn sich für das nächste Identify. Verbindet der Bot per Resume neu (kein Identify), geht der geänderte Status verloren, bis er sich wieder ändert. Im Selbsttest löst das blockierende w() (spawnSync) solche Neuverbindungen aus; beim echten Discord passiert es bei jedem kurzen Abbruch. (Text beim Anlegen an den Anführungszeichen abgeschnitten, hier vollständig.)

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. Gateway verbinden, Discord verlangt eine Neuverbindung (op 7).
2. Während der Trennung setStatus aufrufen.
3. Nach RESUMED steht bei Discord weiter der alte Status. Immer.

## Erwartetes Verhalten
Der neue Status kommt nach der Fortsetzung an.

## Tatsächliches Verhalten
Er geht verloren, bis sich der Status das nächste Mal ändert.

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
<!-- Stacktraces und Logs als Codeblock. Bei langen Logs nur den relevanten Ausschnitt. -->

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
Bestätigt mit dem Test: Gateway.setStatus sendet op 3 nur bei bereiter Verbindung und verlässt sich sonst auf das nächste Identify. Eine Fortsetzung schickt aber kein Identify, sondern nur Resume.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
setStatus merkt sich bei getrennter Verbindung, dass der Status noch aussteht; bei RESUMED sendet handle() ihn nach, bei READY ist er mit dem Identify schon unterwegs. Regressionstest: Selbsttest-Schritt „Status des Bots übersteht eine Gateway-Fortsetzung (W-0047)“.

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [x] Ein während der Trennung geänderter Status wird nach RESUMED gesendet

## Betroffene Dateien
- plugins/works/skills/works/scripts/discord-api.mjs: Gateway.setStatus und RESUMED
- plugins/works/skills/works/scripts/selftest.mjs: neuer Schritt

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe
Abgeschlossen am 2026-11-24. Keine offene Übergabe.

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-24: Gestartet (Status: backlog → in-arbeit)
- 2026-11-24: Akzeptanzkriterien: "Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen" abgehakt
- 2026-11-24: Akzeptanzkriterien: "Regressionstest deckt den Fall ab oder der Verzicht ist begründet" abgehakt
- 2026-11-24: Akzeptanzkriterien: "Ein während der Trennung geänderter Status wird nach RESUMED gesendet" abgehakt
- 2026-11-24: Übergabe aktualisiert
- 2026-11-24: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
