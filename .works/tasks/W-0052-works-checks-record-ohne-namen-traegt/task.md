---
id: W-0052
title: works checks record ohne Namen trägt Prüfung undefined ein
type: bug
priority: P4
status: backlog
effort: S
risk:
created: 2026-11-24
updated: 2026-11-24
due:
completed:
milestone:
branch:
tags: [cli]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# works checks record ohne Namen trägt Prüfung undefined ein

## Zusammenfassung
<!-- Ein Satz: Was geht kaputt, wo, mit welcher Auswirkung? -->

## Beschreibung
Aufgefallen am 2026-11-24 bei W-0041: works checks record W-0041 --help (ohne Prüfungsnamen) hat in checks.json der Aufgabe eine Prüfung mit dem Namen undefined und Status ok eingetragen und die Meldung „undefined für W-0041 eingetragen: ok“ ausgegeben. Erwartet: ohne Namen ein Fehler mit kurzer Nutzungszeile, nichts wird geschrieben; --help zeigt die Hilfe zu checks. Der falsche Eintrag wurde von Hand entfernt.

## Reproduktion
<!-- Nummerierte Schritte, die den Fehler zuverlässig auslösen. Häufigkeit angeben (immer, manchmal, einmalig). -->
1. 

## Erwartetes Verhalten

## Tatsächliches Verhalten

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
<!-- Stacktraces und Logs als Codeblock. Bei langen Logs nur den relevanten Ausschnitt. -->

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->

## Lösung
<!-- Was wurde geändert und warum genau so? -->

## Akzeptanzkriterien
- [ ] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [ ] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [ ] works checks record <ID> ohne Namen endet mit Fehler und schreibt nichts

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-24: Aufgabe angelegt
