---
id: W-0033
title: CI auch für ci-watch und mockups
type: chore
priority: P3
status: backlog
effort: S
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch:
tags: [ci, github]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# CI auch für ci-watch und mockups

## Beschreibung
Vorschlag vom 2026-11-22, vom Nutzer gewünscht (P3). Die CI läuft nur bei Änderungen unter plugins/works. Die Tests von ci-watch (scripts/test.mjs, seit W-0027 mit Bug-Anlage über das works-CLI) und eventuelle Prüfungen von mockups laufen nur lokal. Gewünscht: Workflow-Jobs für ci-watch und mockups, die bei Änderungen in ihren Ordnern laufen, auf Linux, macOS und Windows wie der works-Selbsttest.

## Checkliste
- [ ] 

## Akzeptanzkriterien
- [ ] Änderungen unter plugins/ci-watch lösen einen CI-Lauf mit dessen Tests auf Linux, macOS und Windows aus
- [ ] Änderungen unter plugins/mockups lösen einen CI-Lauf mit dessen Prüfungen aus
- [ ] Ein absichtlich roter Test macht den jeweiligen Lauf rot

## Betroffene Dateien

## Assets

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-22: Aufgabe angelegt
