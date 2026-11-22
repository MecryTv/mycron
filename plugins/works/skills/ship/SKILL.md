---
name: ship
description: Verwenden, wenn eine Aufgabe aus .works auf ihrem Feature-Branch fertig ist und mit Merge und Push abgeschlossen werden soll, etwa mit "ship", "abschließen und pushen", "mergen und hochladen" oder "Abschluss wie immer".
---

# ship

Schließt eine works-Aufgabe in einem Rutsch ab. Das CLI:

```
node "${CLAUDE_SKILL_DIR}/../works/scripts/works.mjs" ship [<ID>] [--no-push] [--no-ci] [--no-update] [--no-open]
```

Claude Code ersetzt `${CLAUDE_SKILL_DIR}` durch den Ordner dieses Skills. Ohne ID nimmt ship die aktive Aufgabe.

## Vor dem Aufruf

1. Code, Tests und Doku der Aufgabe sind auf dem Feature-Branch committet.
2. Tests und Prüfungen sind gelaufen, code-audit ist eingetragen, Akzeptanzkriterien und Umsetzungsplan sind abgehakt, Verlauf und Übergabe sind aktuell. Bei Oberflächen liegt ein Nachher-Screenshot an der Aufgabe.
3. ship mergt und pusht. Das ist nur dann schon beauftragt, wenn der Nutzer Merge oder Push verlangt hat („ship“, „abschließen und pushen“, „Abschluss wie immer“). Sagt er nur, die Aufgabe sei fertig, vorher fragen.

## Was ship tut

Der Reihe nach, mit einer Zeile `ok` je Schritt:

1. Definition of Done prüfen (`works done` ohne `--confirm`).
2. Nicht committete Änderungen und neue, nicht verfolgte Dateien außerhalb von `.works` ablehnen.
3. Laufendes Board stoppen.
4. `WORKS.md` und `time.jsonl` zurücksetzen, neue Zeiten aufheben, übrige `.works`-Änderungen auf dem Branch committen.
5. Hauptbranch vorspulen, Feature-Branch mit `--no-ff` mergen.
6. `works done --confirm`, `.works` committen (die aufgehobenen Zeiten gehen mit).
7. Pushen, Feature-Branch lokal und auf dem Remote löschen.
8. Bei GitHub auf die CI des gepushten Commits warten (Plugin ci-watch).
9. Ist das Repo ein Marketplace (`.claude-plugin/marketplace.json`): Marketplace und alle installierten Plugins daraus aktualisieren.
10. Board mit der neuesten Version auf demselben Port neu starten, wenn es lief. `--open` öffnet nur ohne offenen works-Tab.

## Wenn ship anhält

ship endet mit Exit 1 und sagt, was los ist. Vor Schritt 5 ist am Repo nichts verändert außer dem Commit aus Schritt 4. Ein gestopptes Board startet ship bei jedem Abbruch wieder.

| Meldung | Vorgehen |
|---|---|
| Definition of Done nicht erfüllt | Die genannten Punkte erledigen und ship erneut aufrufen. Nicht mit `works done --force` umgehen, außer der Nutzer will es ausdrücklich. |
| Nicht committete Änderungen | Gehören sie zur Aufgabe, committen (auch neue Dateien, mit `??` markiert). Sonst den Nutzer fragen, nicht verwerfen oder löschen. |
| Merge hat Konflikte | Auf dem Feature-Branch `git merge <hauptbranch>`, die Konflikte dem Nutzer erklären und seine Entscheidung abwarten. Danach ship erneut. |
| Hauptbranch lässt sich nicht vorspulen | Der Remote hat Commits, die lokal fehlen. Dem Nutzer melden, nicht force-pushen. |
| works done --confirm fehlgeschlagen | Der Merge ist lokal und nicht gepusht. Fehler beheben, dann `works done <ID> --confirm`, `.works` committen und pushen. |
| Push fehlgeschlagen | Alles ist lokal committet. Ursache nennen (Rechte, Netz, Remote weiter), nie force-pushen. |
| CI rot | Gepusht ist schon, nicht zurücknehmen. Fehler aus der Meldung lesen und dem Nutzer nennen. Fragen, ob du einen Bug anlegst (`works new --type bug`, mit Priorität) oder ihn gleich auf einem neuen Branch behebst; nicht eigenmächtig anfangen. Plugins sind dann nicht aktualisiert; das holt der nächste ship nach. |

## Danach

Dem Nutzer kurz melden: gemergter Branch, Commit, CI-Ergebnis, aktualisierte Plugins und die Board-URL.
