---
id: W-0043
title: works.ps1 reicht Pipe-Eingaben nicht an Node weiter
type: bug
priority: P2
status: erledigt
effort: S
risk:
created: 2026-11-23
updated: 2026-11-23
due:
completed: 2026-11-23
milestone:
branch: fix/w-0043-works-ps1-reicht-pipe
tags: []
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# works.ps1 reicht Pipe-Eingaben nicht an Node weiter

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Gefunden am 2026-11-23 beim Prüfen der Discord-Einrichtung: Get-Clipboard | works discord token kommt über das PowerShell-Startskript ~/.works/bin/works.ps1 leer bei Node an, weil ein Skript seine Pipeline nicht an native Befehle weitergibt. works discord empfiehlt genau diesen Aufruf. Lösung: Pipeline nur weiterreichen, wenn es eine gibt ($MyInvocation.ExpectingInput), sonst bleibt die versteckte Abfrage im Terminal erhalten.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. Windows, `works install-cli` eingerichtet.
2. In PowerShell: `Get-Clipboard | works discord token`.
3. Ausgabe „Kein Token eingegeben“. Immer.

## Erwartetes Verhalten
Das Token aus der Zwischenablage kommt bei works an.

## Tatsächliches Verhalten
Node bekommt eine leere Eingabe.

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->
Windows 10, PowerShell, Startskript ~/.works/bin/works.ps1 aus install-cli.

## Logs und Fehlermeldungen
<!-- Stacktraces und Logs als Codeblock. Bei langen Logs nur den relevanten Ausschnitt. -->
```
Fehler: Kein Token eingegeben.
```

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
Ein PowerShell-Skript gibt seine Pipeline nicht von selbst an einen nativen Befehl weiter. works.ps1 rief Node ohne `$input` auf.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
cli-install.mjs schreibt works.ps1 so, dass es mit Pipe (`$MyInvocation.ExpectingInput`) `$input` an Node reicht, ohne Pipe Node wie bisher aufruft. Immer `$input` weiterzureichen ginge nicht: Node bekäme dann eine leere Pipe statt des Terminals, und die versteckte Abfrage von works discord token fiele weg. Bestehende Installationen brauchen einmal `works install-cli --no-path`, um das Skript neu zu schreiben.

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [x] Get-Clipboard | works discord token kommt bei Node an
- [x] works discord token ohne Pipe fragt weiter versteckt im Terminal (unveränderter Aufruf ohne Pipe)
- [x] Selbsttest prüft die Pipe unter Windows

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe
Abgeschlossen am 2026-11-23. Keine offene Übergabe.

## Verlauf
- 2026-11-23: Aufgabe angelegt
- 2026-11-23: Gestartet (Status: backlog → in-arbeit)
- 2026-11-23: works.ps1 reicht Pipe an Node weiter; Test im Selbsttest (Windows). Bestehende Installation mit works install-cli --no-path auffrischen.
- 2026-11-23: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
