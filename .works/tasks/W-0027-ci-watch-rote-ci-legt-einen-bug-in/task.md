---
id: W-0027
title: "ci-watch: rote CI legt einen Bug in works an"
type: feature
priority: P3
status: erledigt
effort: S
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed: 2026-11-22
milestone:
branch: feature/w-0027-ci-watch-rote-ci-legt-einen
tags: [ci, github]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# ci-watch: rote CI legt einen Bug in works an

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Vorschlag vom 2026-11-22, vom Nutzer gewünscht (alles einbauen, P3). Ist die CI für einen Commit rot, legt ci-watch in einem Projekt mit .works gleich einen Bug an: fehlgeschlagener Job und Schritt, Ausschnitt aus dem Log, Commit und Link zum Lauf. Heute steht das Rot nur in der Ausgabe des Wächters. Kein doppelter Bug für denselben Commit oder denselben fehlgeschlagenen Schritt; ist ein passender Bug noch offen, dort einen Verlaufseintrag ergänzen. Ohne .works oder ohne Zugriff auf die Logs (Rate-Limit ohne Token) nur melden.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [x] Ist die CI eines Commits rot und hat das Projekt .works, legt ci-watch einen Bug mit Job, Schritt, Log-Ausschnitt, Commit und Link zum Lauf an
- [x] Für denselben Commit und Schritt entsteht kein zweiter Bug; ist ein passender Bug offen, bekommt er einen Verlaufseintrag
- [x] Ohne .works oder ohne Zugriff auf die Logs meldet ci-watch nur, wie bisher
- [x] Test deckt rote CI, doppelte Meldung und fehlendes .works ab

## Umsetzungsplan
- [x] test.mjs: bugFor (Titel je Workflow und Schritt, Beschreibung mit Commit, Repo, Jobs, Links, Log), fileBug (neu, ergänzt, bekannt, ohne .works)
- [x] ci-status.mjs: bugFor, findWorksCli, fileBug, Aufruf bei rot, --no-bug
- [x] works-Selbsttest meldet rote Schritte in GitHub Actions als ::error-Annotation (ghError), damit der Bug ohne Token die echte Fehlerstelle enthält
- [x] Echter Durchlauf gegen den roten Lauf a5cfc20 in einer Wegwerf-Kopie: Bug angelegt
- [x] Doku: ci-watch SKILL.md und README, ship SKILL.md

## Betroffene Dateien
- plugins/ci-watch/skills/ci-watch/scripts/ci-status.mjs: Bug in works bei rot
- plugins/ci-watch/skills/ci-watch/scripts/test.mjs: Tests
- plugins/ci-watch/skills/ci-watch/SKILL.md, plugins/ci-watch/README.md: Doku
- plugins/works/skills/works/scripts/selftest.mjs: ghError, Annotation bei roten Schritten
- plugins/works/skills/ship/SKILL.md: Verweis auf den angelegten Bug

## Designentscheidungen
<!-- Kurzfassung der wichtigsten Entscheidungen. Details in decisions.md (works decisions <ID>). -->

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
Abgeschlossen am 2026-11-22. Keine offene Übergabe.

## Verlauf
- 2026-11-22: Aufgabe angelegt
- 2026-11-22: Gestartet (Status: backlog → in-arbeit)
- 2026-11-22: Abgeschlossen (Status: in-arbeit → erledigt), DoD bestätigt
