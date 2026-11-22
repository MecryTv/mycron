---
id: W-0022
title: Plugins und Skills auf englische Namen umstellen
type: chore
priority: P2
status: in-arbeit
effort: S
risk:
created: 2026-11-22
updated: 2026-11-22
due:
completed:
milestone:
branch: chore/w-0022-plugins-und-skills-auf
tags: [plugin, skill]
blocked_by: []
blocks: []
related: []
source: manuell
incomplete: false
---

# Plugins und Skills auf englische Namen umstellen

## Beschreibung
Wunsch des Nutzers vom 2026-11-22: Alle Skill-Namen sollen englisch sein, Plugins ebenso (Variante Plugins und Skills gewählt). feierabend wird workday mit den Skills end-of-day und good-morning, ci-waechter wird ci-watch, entwurf wird mockups. works bleibt. Inhalte und Auslöser (Feierabend, Guten Morgen, CI, Entwurf) bleiben deutsch. Marketplace, READMEs, Querverweise (works: Hinweis auf das Plugin entwurf) anpassen. Beim Nutzer die alten Plugins deinstallieren und die neuen installieren.

## Checkliste
- [ ] 

## Akzeptanzkriterien
- [x] Skills heißen workday:end-of-day, workday:good-morning, ci-watch:ci-watch, mockups:mockups
- [x] Marketplace und alle Plugins sind gültig (claude plugin validate), Tests der Plugins grün
- [ ] Beim Nutzer sind die neuen Plugins installiert und die alten entfernt

## Betroffene Dateien
- `plugins/feierabend` → `plugins/workday` (Skills end-of-day, good-morning)
- `plugins/ci-waechter` → `plugins/ci-watch` (Skill ci-watch; SKILL.md: Lauf bei mehreren Commits in einem Push)
- `plugins/entwurf` → `plugins/mockups` (Skill mockups; Skriptname entwurf.mjs bleibt)
- `.claude-plugin/marketplace.json`, `README.md`
- `plugins/works/skills/works/scripts/works.mjs`, `references/integrations.md`: Hinweis auf das Plugin mockups

## Assets

## Offene Fragen

## Übergabe

## Verlauf
- 2026-11-22: Aufgabe angelegt
- 2026-11-22: Gestartet (Status: backlog → in-arbeit)
- 2026-11-22: Ordner und Namen umgestellt: workday (end-of-day, good-morning), ci-watch, mockups. Validierung und Tests grün, works-Selbsttest 26 von 26.
