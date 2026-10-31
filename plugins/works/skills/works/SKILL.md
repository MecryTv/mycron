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
  board.html          generiertes Kanban-Board (lokal, wird nach jeder Änderung aktualisiert)
  inbox/              Ablage für Screenshots, die noch zugeordnet werden
  reports/            gespeicherte Berichte
  tasks/W-0012-slug/  task.md, decisions.md, assets/, docs/
  archive/            erledigte und verworfene Aufgaben
```

## Das CLI

Alle Verwaltungsschritte laufen über ein Node-Script ohne Abhängigkeiten. Im Folgenden steht `works` für:

```
node "${CLAUDE_SKILL_DIR}/scripts/works.mjs"
```

Claude Code ersetzt `${CLAUDE_SKILL_DIR}` beim Laden durch den Ordner dieses Skills. Steht die Variable unersetzt da, den beim Laden angezeigten Basisordner des Skills einsetzen.

`works help` zeigt alle Befehle. Die vollständige Referenz steht in `references/cli.md`.

## Grundregeln

1. Aufgabenteilung: Das CLI erledigt alles Strukturelle (IDs, Ordner, Frontmatter, Status, Verlauf, Abhängigkeiten, Assets, Index). Claude schreibt die Inhalte der Abschnitte per Edit direkt in die `task.md` und `decisions.md`. Frontmatter nie von Hand ändern, sondern `works set`.
2. `WORKS.md` und `board.html` werden generiert. Jeder schreibende CLI-Befehl aktualisiert beide automatisch (board.html nur, wenn sie existiert). Nach manuellen Edits an einer task.md einmal `works index` ausführen, sofern keine Live-Ansicht läuft.
3. Nachfragen statt raten. Fehlen Angaben (Ziel, Akzeptanzkriterien, Priorität bei Unklarheit), den Nutzer fragen. Fragen, die nicht sofort geklärt werden können, mit `works question <ID> "..."` festhalten. Keine Annahmen als Fakten in die Aufgabe schreiben.
4. Vor der Arbeit an einer Aufgabe `works start <ID>`, am Ende jeder Arbeitsphase `works handoff <ID> --text "..."`. Damit kann jede neue Session nahtlos weitermachen.
5. Commit-Messages enthalten die Task-ID, zum Beispiel `feat(W-0012): Validierung ergänzen`.
6. Bilder immer mit `--desc` ablegen. Die Textbeschreibung erspart späteren Sessions das Laden des Bildes.
7. Abschließen nur über `works done`. Erst ohne `--confirm` prüfen, manuelle Punkte tatsächlich erledigen (Tests laufen lassen, code-audit ausführen), dann `--confirm`. Ein Übergehen mit `--force` nur auf ausdrücklichen Wunsch des Nutzers und mit `--reason`.
8. Prioritäten nach den Kriterien in `references/priorities.md` vergeben. Eine neue P1 dem Nutzer sofort melden.
9. Schreibstil in Aufgaben: sachlich, konkret, ohne Floskeln. Akzeptanzkriterien müssen mit ja oder nein prüfbar sein.
10. Der Nutzer kann Aufgaben auch im Live-Board anlegen, verschieben und bearbeiten. Solche Verlaufseinträge enden mit `[Board]`. Vor jedem Edit an einer task.md die Datei neu lesen, statt einen älteren Stand aus dem Kontext zu überschreiben. Neue Aufgaben mit `source: board` und `incomplete: true` beim nächsten passenden Moment mit dem Nutzer vervollständigen.
11. Der Abschnitt `## Beschreibung` ist die zentrale Stelle mit allem Relevanten zu einer Aufgabe: was passieren soll, warum, Hintergrund, Details und Hinweise des Nutzers. Vor der Arbeit an einer Aufgabe zuerst und vollständig lesen und als verbindliche Vorgabe behandeln, zusammen mit den Akzeptanzkriterien. Beim Anlegen neuer Aufgaben alle relevanten Infos in die Beschreibung schreiben (`works new --description "..."`), nicht verteilt auf andere Abschnitte. Ein Abschnitt Ziel ist optional und nur bei älteren Aufgaben gefüllt. Widerspricht etwas darin dem Plan oder dem Code, beim Nutzer nachfragen statt es zu übergehen. Den Abschnitt nicht umschreiben; eigene Erkenntnisse gehören in andere Abschnitte oder den Verlauf.
12. Die Warteschlange des Nutzers (`works queue`, im Board unter Warteschlange) hat Vorrang vor allen eigenen Vorschlägen. `works next` und `works status` zeigen sie zuerst. Sagt der Nutzer "arbeite die Warteschlange ab" oder ist `auto_next` an, nach `works done` mit dem Eintrag weitermachen, den die Ausgabe nennt. Bei `ask_before` vorher kurz nachfragen. Blockierte Einträge überspringen, solange `skip_blocked` an ist. Die Reihenfolge nur auf Wunsch des Nutzers ändern.

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
| Bericht, Changelog | `works report`, `works changelog` | `references/cli.md` |
| Übersicht im Browser, Board, "ich will selbst Aufgaben anlegen" | `works board --serve --detach` und die URL nennen. Läuft schon ein aktueller Server, wird nur seine URL ausgegeben. Dort kann der Nutzer alles selbst bearbeiten. Für eine reine Ansicht `works board` | `references/board.md` |
| Board zeigt altes Design, Board neu starten | `works board --restart` | `references/board.md` |
| "Arbeite die Warteschlange ab", Reihenfolge vorgeben | `works queue` lesen, oberste startbare Aufgabe starten, nach `done` mit der nächsten weitermachen | `references/board.md` |
| Board mit jemandem teilen | Im selben Netzwerk `works board --restart --share`, Leselink aus der Ausgabe nennen. Für Leute außerhalb `works export` und die Datei schicken. Bearbeitungslink nur auf Nachfrage (`works share --owner`) | `references/board.md` |
| Board ausprobieren, Demo, "zeig mir, wie das aussieht" | `works demo --simulate --open` außerhalb echter Projekte. Legt ein Beispielprojekt im Temp-Ordner an und spielt Änderungen vor | `references/board.md` |
| Struktur prüfen, Fehler vermuten | `works doctor`, bei Bedarf `--fix` | `references/cli.md` |
| Hooks einrichten | Bei Plugin-Installation nur `works install-hooks --git`, sonst nach Rückfrage `works install-hooks` | `references/hooks.md` |

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
- `references/board.md`: Kanban-Board, Bearbeiten im Board, Live-Aktualisierung und Sicherheit
- `references/cli.md`: alle Befehle und Optionen
- `references/config.md`: Felder der config.json
- `references/templates/`: Vorlagen für alle Aufgabentypen und decisions.md
