# works

Claude Code Skill für projektbezogene Aufgabenverwaltung im Ordner `.works/`.

## Funktionen

- Eigener Ordner je Aufgabe mit ausführlicher `task.md`, `decisions.md` und `assets/`
- Sieben Aufgabentypen mit eigenen Vorlagen: feature, bug, refactor, spike, chore, design, debt
- Prioritäten P1 Kritisch bis P4 Niedrig, Status-Lebenszyklus, Aufwand S bis XL, Risiko
- Generierte Übersicht `WORKS.md` und Kanban-Board `board.html`
- Bilder über Dateipfad oder Inbox, automatische Benennung, Textbeschreibungen, optionale Komprimierung
- Designentscheidungen mit verworfenen Alternativen, Anbindung an Superpowers Brainstorming und UI UX Pro Max
- Abhängigkeiten mit Zykluserkennung, Meilensteine mit Fortschritt, Fristen
- Empfehlung der nächsten Aufgabe
- Session-Übergaben und offene Fragen je Aufgabe
- Definition of Done mit automatischen und manuellen Punkten
- Schnellerfassung, Ideen-Parkplatz, Import aus TODO-Kommentaren und GitHub Issues
- Changelog, Berichte, Commit-Verknüpfung über die Task-ID
- Hooks für Sessionstart, Übergabe-Erinnerung und pre-commit Validierung
- Konsistenzprüfung mit `doctor`

## Installation

```
cp -r works ~/.claude/skills/
```

Voraussetzung ist Node.js 18 oder neuer. Optional: `gh` für GitHub, `sharp` für Bildkomprimierung (`cd ~/.claude/skills/works && npm i sharp`).

Im Projekt:

```
node ~/.claude/skills/works/scripts/works.mjs init
node ~/.claude/skills/works/scripts/works.mjs install-hooks
```

Praktisch ist ein Alias in der Shell:

```
alias works='node ~/.claude/skills/works/scripts/works.mjs'
```

## Aufbau

```
works/
  SKILL.md
  README.md
  scripts/
    works.mjs     CLI mit allen Befehlen
    lib.mjs       Frontmatter, Abschnitte, Konfiguration
    views.mjs     WORKS.md, Empfehlung, Definition of Done, Statusübersicht
    board.mjs     Kanban-Board
  hooks/
    session-start.mjs
    stop-reminder.mjs
  references/
    priorities.md task-format.md workflow.md assets.md
    integrations.md hooks.md cli.md config.md
    templates/    Vorlagen je Typ, decisions.md, ideas.md
```
