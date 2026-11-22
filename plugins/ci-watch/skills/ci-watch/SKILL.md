---
name: ci-watch
description: Verwenden, wenn der Nutzer nach einem Push wissen will, ob die CI durchläuft, ob GitHub Actions grün sind, ob der Build oder die Pipeline fertig ist, oder warum ein Workflow-Lauf rot ist. Auch wenn gh fehlt oder kein Token da ist.
---

# CI-Wächter

Ein Node-Skript wartet auf die GitHub-Actions-Läufe zu einem Commit und meldet das Ergebnis. Es fragt in festen Abständen ab, hält das Abfragelimit ein und holt bei rot die Fehlerstellen. Eigene `curl`-Abfragen an die GitHub-API sind deshalb nicht nötig. Ohne Token kosten sie Abfragelimit (60 pro Stunde), und das Skript fragt dasselbe ab.

## Ablauf

1. **Commit bestimmen.** Standard ist `HEAD`. Mit `git status -sb` prüfen, ob er gepusht ist. Steht dort `ahead`, gibt es auf GitHub noch keinen Lauf: das dem Nutzer sagen, nicht selbst pushen. Gingen mehrere Commits in einem Push raus, startet GitHub den Lauf nur für den letzten davon: diesen prüfen, nicht einen früheren Merge-Commit aus demselben Push.
2. **Skript im Hintergrund starten** (Bash mit `run_in_background: true`, es kann bis zu 20 Minuten laufen):
   ```
   node "${CLAUDE_SKILL_DIR}/scripts/ci-status.mjs"
   ```
   Optionen: `--sha <commit>`, `--repo owner/name` (sonst aus `origin`), `--timeout <Minuten>` (Standard 20), `--grace <Minuten>` (so lange darf noch kein Lauf existieren, Standard 3).
   Dem Nutzer in einem Satz sagen, dass du wartest. Bis zur Meldung des Hintergrundjobs anderes erledigen oder die Runde beenden. Nicht selbst zwischendurch abfragen, kein Monitor, keine `sleep`-Schleifen: Das Ende des Hintergrundjobs wird von selbst gemeldet.
3. **Ergebnis nach Exit-Code melden**, mit der Ausgabe des Skripts als einziger Quelle:

| Exit | Bedeutung | Meldung |
|---|---|---|
| 0 | grün | Ein Satz: grün, welche Workflows. |
| 1 | rot | Aufbau siehe unten. |
| 2 | kein Lauf oder Zeitlimit | Den Satz des Skripts weitergeben. Bei „kein Lauf“ die `on:`-Bedingungen in `.github/workflows/*.yml` lesen und sagen, ob der Commit sie trifft (Pfade, Branches). |
| 3 | Fehler | Die Meldung weitergeben (kein GitHub-Repo, Repo nicht gefunden, Rate-Limit mit Uhrzeit). |

## Meldung bei rot

In dieser Reihenfolge:

1. **Urteil**: „CI rot für `<sha>`“ und der Workflow.
2. **Was scheitert**, gleiche Fehler zusammengefasst: Job (bei Matrix-Jobs welche Kombinationen, und welche grün sind, laut Zeile „x von y Jobs rot. Grün: …“), Schritt, Fehlerstelle aus den Annotationen oder dem Log-Auszug. Jobs mit „keine Fehlerstelle abgefragt“ haben nur deshalb keine Fehlerstelle, nicht weil es keine gibt.
3. **Link** zum ersten fehlgeschlagenen Job.
4. **Nächster Schritt** als Angebot: „Soll ich mir den Schritt `<Name>` im Code ansehen?“ Nicht ungefragt reparieren, committen oder pushen.

Nur melden, was in der Ausgabe steht. Vermutungen zur Ursache (Pfade, Rechte, Zeilenenden) gehören nicht in die Meldung. Wer die Ursache wissen will, bekommt sie nach dem Lesen des Codes oder des Logs.

## Token

Ohne Token: öffentliche Repos, eine Abfrage pro Minute, Annotationen statt Log-Auszug. Fehlt dem Nutzer der Log-Auszug, sagen: „Mit `GITHUB_TOKEN` in der Umgebung liest der Wächter auch den Log-Auszug, sonst steht er hinter dem Link.“

Nie nach dem Token selbst fragen und nie einen Token in den Chat, in eine URL oder in eine Datei im Repo schreiben lassen. Der Nutzer setzt ihn in seiner eigenen Shell. Das Skript schickt ihn nur im `Authorization`-Header.
