---
id: W-0015
title: "Neues Plugin: Feierabend und Guten Morgen"
type: feature
priority: P2
status: in-arbeit
effort: M
risk:
created: 2026-11-21
updated: 2026-11-21
due:
completed:
milestone:
branch: feature/w-0015-neues-plugin-feierabend-und
tags: [skill, plugin]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Neues Plugin: Feierabend und Guten Morgen

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Neuer Skill 1 vom 2026-11-21, vom Nutzer gewünscht, als eigenes Plugin im Marketplace mycron (plugins/feierabend o. ä.). Hintergrund: Der Nutzer beendet Arbeitstage mit "Board stoppen, wir machen morgen weiter" und beginnt mit "setz das um, wie wir gestern besprochen haben". "Feierabend": für jede Aufgabe in Arbeit eine Übergabe schreiben (works handoff), .works committen (nur wenn das Projekt .works im Git hat), das Board stoppen und kurz zusammenfassen, was heute erledigt wurde und was morgen ansteht. "Guten Morgen": Übergaben und Zusammenfassung von gestern lesen, das Board starten und im Browser öffnen, die wichtigste Aufgabe nennen und auf Wunsch beginnen. Funktioniert nur in Projekten mit .works; ohne works einen klaren Hinweis geben.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [x] "Feierabend" schreibt Übergaben für alle Aufgaben in Arbeit, stoppt das Board und fasst den Tag zusammen
- [x] "Guten Morgen" liest den Stand von gestern, startet das Board und nennt die nächste Aufgabe
- [x] Ohne .works im Projekt gibt es einen verständlichen Hinweis statt eines Fehlers
- [x] Das Plugin steht im Marketplace mycron und lässt sich installieren
- [x] Nichts wird ungefragt gepusht

## Umsetzungsplan
- [x] Ablauf und Auslöser festlegen (Skill-Beschreibung)
- [x] Plugin-Gerüst im Marketplace mycron
- [x] Skill Feierabend
- [x] Skill Guten Morgen
- [x] Test in einem Testprojekt, Doku, README

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
Details und verworfene Alternativen: [decisions.md](decisions.md)

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
Stand: 2026-11-21 14:53

Branch feature/w-0015-feierabend. Fertig: plugins/feierabend (plugin.json, README, skills/feierabend/SKILL.md), Eintrag in .claude-plugin/marketplace.json. Läuft: Test von feierabend mit Skill in scratchpad/fa-skill, Baseline guten-morgen ohne Skill in scratchpad/gm-base (beide ohne Board). Nächster Schritt: Testergebnisse auswerten, skills/guten-morgen/SKILL.md schreiben und testen, README angleichen, dann done, Merge, Push. Wichtig: Test-Agenten dürfen kein Board starten (Nutzerwunsch).

## Verlauf
- 2026-11-21: Aufgabe angelegt
- 2026-11-21: decisions.md angelegt
- 2026-11-21: Gestartet (Status: backlog → in-arbeit)
- 2026-11-21: Umsetzungsplan: "Ablauf und Auslöser festlegen (Skill-Beschreibung)" abgehakt
- 2026-11-21: Umsetzungsplan: "Plugin-Gerüst im Marketplace mycron" abgehakt
- 2026-11-21: Baseline ohne Skill: Feierabend schreibt Übergaben, sichert .works nicht, ignoriert Board, nennt Erledigtes nicht; works handoff stellt die aktive Aufgabe um. Plugin-Gerüst, Marketplace-Eintrag, README und Skill feierabend geschrieben.
- 2026-11-21: Übergabe aktualisiert
- 2026-11-21: Test feierabend mit Skill: alle sechs Schritte eingehalten (Übergaben inkl. aktiver zuletzt, nur .works committet, kein Push, Board gestoppt, Nachricht in der Form, eine Frage zu uncommittetem Code). Reihenfolge für Morgen zuerst danach korrigiert: aktive Aufgabe vor Warteschlange.
- 2026-11-21: Test guten-morgen mit Skill, Übergabe passt nicht zum Repo: Abweichung (fehlender Branch, fehlende Datei) genannt, nicht angefangen, zwei nummerierte Fragen, Nachricht in der Form.
- 2026-11-21: Test guten-morgen mit Skill, Übergabe passt: ohne Rückfrage W-0003 gestartet, Branch passte, Nachricht in der Form. Lücke: Aufgabe im Review übersehen, weil Schritt 1 sie nicht abfragte; works list --status review ergänzt.
- 2026-11-21: Umsetzungsplan: "Skill Feierabend" abgehakt
- 2026-11-21: Umsetzungsplan: "Skill Guten Morgen" abgehakt
- 2026-11-21: Umsetzungsplan: "Test in einem Testprojekt, Doku, README" abgehakt
- 2026-11-21: Akzeptanzkriterien: ""Feierabend" schreibt Übergaben für alle Aufgaben in Arbeit, stoppt das Board und fasst den Tag zusammen" abgehakt
- 2026-11-21: Akzeptanzkriterien: ""Guten Morgen" liest den Stand von gestern, startet das Board und nennt die nächste Aufgabe" abgehakt
- 2026-11-21: Akzeptanzkriterien: "Ohne .works im Projekt gibt es einen verständlichen Hinweis statt eines Fehlers" abgehakt
- 2026-11-21: Akzeptanzkriterien: "Das Plugin steht im Marketplace mycron und lässt sich installieren" abgehakt
- 2026-11-21: Akzeptanzkriterien: "Nichts wird ungefragt gepusht" abgehakt
