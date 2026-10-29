---
name: works
description: Projektbezogene Aufgabenverwaltung in einem .works/ Ordner mit Prioritäten P1 bis P4, ausführlichen Task-Dateien, Bildern, Designentscheidungen, Abhängigkeiten, Meilensteinen, Session-Übergaben und Definition of Done. Diesen Skill nutzen, sobald im Projekt ein .works/ Ordner existiert oder der Nutzer Aufgaben, Todos, Bugs, Features, Ideen, Backlog, Prioritäten, Fortschritt oder "was steht an" anspricht, etwas notiert haben will ("notier dir das", "mach daraus eine Aufgabe"), Screenshots zu einer Aufgabe ablegen will, eine Aufgabe startet, abschließt oder wieder aufnimmt, nach der nächsten Aufgabe fragt, einen Bericht oder Changelog möchte, oder wenn ein Brainstorming oder UI UX Pro Max Ergebnis zu einer Aufgabe festgehalten werden soll. Auch bei /works mit Unterbefehl als Argument.
---

# works

Verwaltet alle Aufgaben eines Projekts in `.works/`. Jede Aufgabe hat einen eigenen Ordner mit ausführlicher `task.md`, optionaler `decisions.md` und einem `assets/` Ordner für Bilder. `WORKS.md` ist die generierte Gesamtübersicht.

```
.works/
  WORKS.md            generierte Übersicht, nie von Hand bearbeiten
  config.json         Präfix, nächste ID, Meilensteine, Definition of Done, Einstellungen
  state.json          aktive Aufgabe und letzte Übergabe (lokal)
  ideas.md            Ideen-Parkplatz
  board.html          generiertes Kanban-Board (lokal)
  inbox/              Ablage für Screenshots, die noch zugeordnet werden
  reports/            gespeicherte Berichte
  tasks/W-0012-slug/  task.md, decisions.md, assets/, docs/
  archive/            erledigte und verworfene Aufgaben
```

## Das CLI

Alle Verwaltungsschritte laufen über ein Node-Script ohne Abhängigkeiten. Das Basisverzeichnis dieses Skills wird beim Laden angezeigt; im Folgenden steht `works` für:

```
node <skill-dir>/scripts/works.mjs
```

`works help` zeigt alle Befehle. Die vollständige Referenz steht in `references/cli.md`.

## Grundregeln

1. Aufgabenteilung: Das CLI erledigt alles Strukturelle (IDs, Ordner, Frontmatter, Status, Verlauf, Abhängigkeiten, Assets, Index). Claude schreibt die Inhalte der Abschnitte per Edit direkt in die `task.md` und `decisions.md`. Frontmatter nie von Hand ändern, sondern `works set`.
2. `WORKS.md` und `board.html` werden generiert. Jeder schreibende CLI-Befehl aktualisiert `WORKS.md` automatisch. Nach manuellen Edits an einer task.md einmal `works index` ausführen.
3. Nachfragen statt raten. Fehlen Angaben (Ziel, Akzeptanzkriterien, Priorität bei Unklarheit), den Nutzer fragen. Fragen, die nicht sofort geklärt werden können, mit `works question <ID> "..."` festhalten. Keine Annahmen als Fakten in die Aufgabe schreiben.
4. Vor der Arbeit an einer Aufgabe `works start <ID>`, am Ende jeder Arbeitsphase `works handoff <ID> --text "..."`. Damit kann jede neue Session nahtlos weitermachen.
5. Commit-Messages enthalten die Task-ID, zum Beispiel `feat(W-0012): Validierung ergänzen`.
6. Bilder immer mit `--desc` ablegen. Die Textbeschreibung erspart späteren Sessions das Laden des Bildes.
7. Abschließen nur über `works done`. Erst ohne `--confirm` prüfen, manuelle Punkte tatsächlich erledigen (Tests laufen lassen, code-audit ausführen), dann `--confirm`. Ein Übergehen mit `--force` nur auf ausdrücklichen Wunsch des Nutzers und mit `--reason`.
8. Prioritäten nach den Kriterien in `references/priorities.md` vergeben. Eine neue P1 dem Nutzer sofort melden.
9. Schreibstil in Aufgaben: sachlich, konkret, ohne Floskeln. Akzeptanzkriterien müssen mit ja oder nein prüfbar sein.

## Wann was tun

| Situation | Vorgehen | Details |
|---|---|---|
| Sessionbeginn, .works vorhanden | `works status` lesen (macht der SessionStart Hook automatisch). Offene P1 und die Übergabe der aktiven Aufgabe beachten | `references/workflow.md` |
| Projekt hat noch kein .works | Nur auf Wunsch `works init`. Vorher fragen, ob `.works/` ins Git soll (Option `--gitignore`) | `references/workflow.md` |
| "Notier dir das", schnelle Erfassung | `works new --type ... --title "..." --incomplete`, fehlende Details später erfragen | `references/workflow.md` |
| Neue Aufgabe mit Details | Typ und Priorität klären, `works new`, dann alle Abschnitte ausfüllen | `references/task-format.md` |
| Fehlermeldung oder Stacktrace eingefügt | Bug anlegen, Log über `--log-file` übernehmen, Reproduktion ergänzen | `references/workflow.md` |
| Lose Idee | `works idea "..."`, später `works promote I-001` | `references/workflow.md` |
| "Was steht an?", "Was als Nächstes?" | `works next`, Empfehlung mit Begründung nennen | `references/workflow.md` |
| Screenshot oder Bild zu einer Aufgabe | Pfad erfragen oder Inbox prüfen, `works asset` mit `--kind` und `--desc` | `references/assets.md` |
| Brainstorming oder UI UX Pro Max zu einer Aufgabe | Ergebnis mit `works attach-doc` anhängen und in `decisions.md` zusammenfassen | `references/integrations.md` |
| Aufgabe hängt von anderer ab | `works link A blocked-by B` | `references/workflow.md` |
| Arbeit beginnt | `works start <ID>`, Branchname aus der Ausgabe an den git-workflow Skill geben | `references/integrations.md` |
| Arbeitsphase endet, Kontext wird knapp, Nutzer macht Pause | `works handoff <ID> --text "..."` | `references/workflow.md` |
| Aufgabe fertig | `works done <ID>`, Punkte abarbeiten, dann `--confirm` | `references/workflow.md` |
| Aufgabe wird nicht mehr gebraucht | `works drop <ID> --reason "..."` | `references/workflow.md` |
| Erledigte Aufgabe muss nachgebessert werden | `works reopen <ID> --reason "..."` | `references/workflow.md` |
| TODO-Kommentare im Code, GitHub Issues | `works scan`, `works gh-import` | `references/workflow.md` |
| Bericht, Changelog, Übersicht im Browser | `works report`, `works changelog`, `works board` | `references/cli.md` |
| Struktur prüfen, Fehler vermuten | `works doctor`, bei Bedarf `--fix` | `references/cli.md` |
| Hooks einrichten | Nach Rückfrage `works install-hooks` | `references/hooks.md` |

## Ablauf einer typischen Aufgabe

1. Erfassen: `works new --type feature --title "..." --priority P2 --effort M --tags ui`
2. Ausfüllen: Ziel, Kontext, Akzeptanzkriterien, Umsetzungsplan in der task.md
3. Klären: Offene Punkte mit dem Nutzer besprechen, bei Bedarf Brainstorming, Ergebnis in `decisions.md`
4. Starten: `works start W-0012`, Branch anlegen, Ist-Zustand als Screenshot mit `--kind vorher`
5. Umsetzen: Häkchen im Umsetzungsplan setzen, relevante Schritte mit `works log` festhalten
6. Übergeben: Bei jeder Unterbrechung `works handoff`
7. Abschließen: `works done W-0012`, Nachher-Screenshot, Tests, code-audit, dann `--confirm`
8. Nacharbeiten: Changelog, gegebenenfalls Decision Log, später `works archive`

## Referenzen

Nur die Datei laden, die für den aktuellen Schritt gebraucht wird.

- `references/priorities.md`: Prioritäten, Status-Lebenszyklus, Aufwand und Risiko
- `references/task-format.md`: Ordnerstruktur, Frontmatter-Felder, Abschnitte je Typ, Schreibregeln
- `references/workflow.md`: Abläufe für Erfassen, Planen, Arbeiten, Übergabe, Abschluss
- `references/assets.md`: Bilder speichern, Inbox, Screenshots, Benennung, Komprimierung
- `references/integrations.md`: Superpowers Brainstorming, UI UX Pro Max, git-workflow, code-audit, responsive-website-check, second-brain-sync, GitHub
- `references/hooks.md`: SessionStart, Stop und pre-commit Hook
- `references/cli.md`: alle Befehle und Optionen
- `references/config.md`: Felder der config.json
- `references/templates/`: Vorlagen für alle Aufgabentypen und decisions.md
