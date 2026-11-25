---
id: W-0052
title: works checks record ohne Namen trägt Prüfung undefined ein
type: bug
priority: P4
status: erledigt
effort: S
risk:
created: 2026-11-24
updated: 2026-11-25
due:
completed: 2026-11-25
milestone:
branch: fix/w-0052-works-checks-record-ohne
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
1. works checks record W-0001 (ohne Namen, oder mit --help).
2. Ausgabe „undefined für W-0001 eingetragen: ok“, checks.json enthält eine Prüfung undefined. Immer.

## Erwartetes Verhalten

## Tatsächliches Verhalten

## Umgebung
<!-- Version, Branch, Betriebssystem, Browser, Node-Version, Konfiguration. -->

## Logs und Fehlermeldungen
<!-- Stacktraces und Logs als Codeblock. Bei langen Logs nur den relevanten Ausschnitt. -->

## Ursache
<!-- Nach der Analyse ausfüllen: Root Cause, nicht nur das Symptom. -->
recordCheck in checks.mjs prüfte den Namen mit NAME_RE.test(name). Für undefined wandelt RegExp.test den Wert in den Text „undefined“ um, der zum Muster passt; das CLI gab den fehlenden Namen ungeprüft weiter.

## Lösung
<!-- Was wurde geändert und warum genau so? -->
recordCheck verlangt einen Text als Namen (gilt für alle Aufrufer), das CLI endet ohne Namen mit der Nutzungszeile „works checks record <ID> <name> --status ok|warn|fail [--note ..]“. Regressionstest „Prüfungen: record ohne Namen schreibt nichts (W-0052)“.

## Akzeptanzkriterien
- [x] Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen
- [x] Regressionstest deckt den Fall ab oder der Verzicht ist begründet
- [x] works checks record <ID> ohne Namen endet mit Fehler und schreibt nichts

## Betroffene Dateien

## Assets
<!-- Screenshots des Fehlers mit --kind fehler, nach dem Fix mit --kind nachher. -->

## Offene Fragen

## Übergabe
Abgeschlossen am 2026-11-25. Keine offene Übergabe.

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-25: Gestartet (Status: backlog → in-arbeit)
- 2026-11-25: Akzeptanzkriterien: "Der Fehler lässt sich mit den Reproduktionsschritten nicht mehr auslösen" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Regressionstest deckt den Fall ab oder der Verzicht ist begründet" abgehakt
- 2026-11-25: Akzeptanzkriterien: "works checks record <ID> ohne Namen endet mit Fehler und schreibt nichts" abgehakt
- 2026-11-25: Übergabe aktualisiert
- 2026-11-25: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
