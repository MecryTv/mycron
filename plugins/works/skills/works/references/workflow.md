# Abläufe

`works` steht für `node <skill-dir>/scripts/works.mjs`.

## Einrichtung

`works init` nur auf Wunsch des Nutzers. Vorher klären, wie `.works/` mit Git umgehen soll:

| Option | Wirkung |
|---|---|
| `--gitignore default` | Alles wird committet außer `board.html`, `state.json` und der Inbox. Empfohlen für Einzelprojekte und Team-Transparenz |
| `--gitignore assets` | Zusätzlich die `assets/` Ordner ignorieren. Sinnvoll bei vielen großen Screenshots |
| `--gitignore all` | Der ganze Ordner bleibt lokal |
| `--gitignore none` | Keine `.works/.gitignore` anlegen |

Danach optional Meilensteine (`works milestone add M1 --title "Beta" --due 2026-12-01`) und Hooks (`works install-hooks`, siehe hooks.md).

## Sessionbeginn

1. Wenn der SessionStart Hook aktiv ist, steht die Übersicht bereits im Kontext. Sonst `works status` ausführen.
2. Offene P1 dem Nutzer nennen, bevor mit etwas anderem begonnen wird.
3. Gibt es eine aktive Aufgabe mit Übergabe, die Übergabe lesen und dem Nutzer in ein bis zwei Sätzen sagen, wo es weitergeht. Offene Fragen aus der Übergabe zuerst klären.
4. Liegt etwas in der Inbox, den Nutzer fragen, zu welcher Aufgabe es gehört.

## Erfassen

### Schnellerfassung

Auslöser: "notier dir das", "pack das auf die Liste", "das müssen wir später machen".

```
works new --type bug --title "Avatar wird bei Webhook-Nachrichten nicht angezeigt" --priority P3 --incomplete
```

Typ und Priorität aus dem Gesagten ableiten, im Zweifel P3. Dem Nutzer ID und Annahmen in einem Satz nennen. Die eigentliche Arbeit nicht unterbrechen.

### Vollständige Erfassung

1. Typ, Priorität, Aufwand klären. Fehlt etwas Wesentliches, nachfragen.
2. `works new --type feature --title "..." --priority P2 --effort M [--tags ui] [--due ...] [--milestone M1] [--blocked-by W-0003]`
3. Die angelegte task.md mit Read öffnen und die Abschnitte per Edit füllen. Akzeptanzkriterien mit dem Nutzer abstimmen.
4. Bei Oberflächen `--tags ui` setzen oder Typ `design` wählen. Dann gelten zusätzliche DoD-Prüfungen.
5. Bei Bedarf `works decisions <ID>` für eine decisions.md.

### Aus Fehlermeldung oder Stacktrace

1. Log in eine Datei im Scratchpad schreiben.
2. `works new --type bug --title "<Kernaussage des Fehlers>" --priority <nach Auswirkung> --source stacktrace --log-file <pfad>`
3. Zusammenfassung, Umgebung und, soweit bekannt, Reproduktion ergänzen. Ursache erst nach Analyse.

### Aus TODO-Kommentaren

```
works scan                       # zeigt alle Marker, neu oder bekannt
works scan --create --marker FIXME,HACK
```

FIXME und XXX werden Bugs mit P2, HACK wird technische Schuld mit P3, TODO wird Chore mit P3. Alle sind `incomplete` und tragen den Tag `code-scan`. Dem Nutzer vorher die Liste zeigen und fragen, welche übernommen werden sollen. Ein erneuter Scan erkennt bereits übernommene Marker.

### Aus GitHub Issues

```
works gh-import --dry-run
works gh-import --state open --limit 50
```

Benötigt die `gh` CLI mit Anmeldung. Labels werden über `config.json` auf Typ und Priorität abgebildet. Bereits importierte Issues werden übersprungen. In die andere Richtung legt `works gh-export <ID>` ein Issue an; das ist eine Veröffentlichung und braucht vorher die ausdrückliche Zustimmung des Nutzers.

### Ideen

```
works idea "Leaderboard mit Wochenranking" --tags dashboard
works ideas
works promote I-001 --type feature --priority P3
```

Ideen sind bewusst unverbindlich. Übernommene Ideen werden in `ideas.md` durchgestrichen und verweisen auf die neue Aufgabe.

## Planen

- Reihenfolge: `works link W-0005 blocked-by W-0003`. Zyklen werden abgelehnt.
- Verwandtschaft ohne Reihenfolge: `works link W-0005 related W-0007`.
- Meilensteine: `works milestone add M2 --title "Release 1.0" --due 2027-01-15`, Zuordnung mit `works set <ID> milestone=M2`, Fortschritt in WORKS.md und `works milestone list`.
- Fristen: `works set <ID> due=2026-11-15`. Überfällige Aufgaben erscheinen in WORKS.md, im Board und im Bericht.
- Große Aufgaben (XL) dem Nutzer zum Aufteilen vorschlagen.
- Empfehlung: `works next` und die Begründung wiedergeben.

## Arbeiten

1. `works start <ID>`. Gibt Kontext, Akzeptanzkriterien, Übergabe und Asset-Beschreibungen aus und setzt die Aufgabe als aktiv. Blockierte Aufgaben starten nur mit `--force` nach Rücksprache.
2. Branch: Die Ausgabe enthält einen Branchnamen nach dem Schema `<präfix>/<id>-<slug>`. Ist der git-workflow Skill verfügbar, diesen Namen dort verwenden. Sonst `works start <ID> --git`.
3. Bei UI-Aufgaben vor der ersten Änderung den Ist-Zustand festhalten (assets.md).
4. Während der Umsetzung Häkchen im Umsetzungsplan und bei den Akzeptanzkriterien setzen. Wichtige Erkenntnisse oder Richtungswechsel mit `works log <ID> "..."` dokumentieren.
5. Neue Erkenntnisse, die eine eigene Aufgabe sind, sofort mit `works new` erfassen statt den Umfang still zu erweitern.
6. Entscheidungen mit Alternativen in `decisions.md` festhalten, nicht nur im Chat.
7. Fragen an den Nutzer, die nicht sofort beantwortet werden, mit `works question` speichern.
8. Zur Prüfung durch den Nutzer: `works set <ID> status=review`.

Nur eine Aufgabe gleichzeitig in Arbeit halten. Wechselt der Nutzer zu einer anderen Aufgabe, zuerst eine Übergabe für die bisherige schreiben.

## Übergabe

Wann: am Ende jeder Arbeitsphase, vor einem Aufgabenwechsel, wenn der Nutzer Pause macht, wenn der Kontext absehbar knapp wird oder komprimiert werden könnte, und wenn der Stop Hook daran erinnert.

```
works handoff W-0012 --text "..."
```

Die Übergabe ersetzt die vorherige und enthält:

- Erledigt: was seit der letzten Übergabe fertig wurde
- Stand: wo genau weitergemacht wird (Datei, Funktion, nächster konkreter Schritt)
- Offene Punkte und Annahmen: was vorläufig angenommen wurde und bestätigt werden muss
- Hinweise: Fallstricke, laufende Prozesse, temporäre Änderungen, die zurückgenommen werden müssen

Beispiel:

```
Erledigt: Formular auf zentriertes Layout umgebaut, Dark-Mode-Tokens angelegt.
Stand: src/pages/login.tsx, Fehlerzustände fehlen noch. Nächster Schritt: Fehlermeldungen unter den Feldern statt als Toast.
Annahmen: Passwort vergessen bleibt als Link, nicht als Button (mit Nutzer klären).
Hinweise: In vite.config.ts ist der Proxy für Tests temporär auf Port 4000 gestellt.
```

## Abschließen

1. `works done <ID>` prüft automatisch: Akzeptanzkriterien, offene Fragen, Umsetzungsschritte, bei Bugs die Ursache, bei Spikes Ergebnis und Empfehlung, bei Refactorings den Rollback, bei UI-Aufgaben Vorher und Nachher Screenshots sowie Einträge in decisions.md.
2. Manuelle Punkte aus der Definition of Done wirklich ausführen: Tests oder Build starten (oder `works done <ID> --run`, wenn `dod.commands` gepflegt ist), code-audit Skill auf die Änderungen anwenden, bei UI den responsive-website-check.
3. `works done <ID> --confirm`. Die Übergabe wird geleert, der Status gesetzt, freigewordene Aufgaben werden genannt.
4. Hinweise aus der Ausgabe beachten, etwa die Übernahme ins Decision Log.
5. Gelegentlich `works archive --older-than 14` und vor Releases `works changelog --version x.y.z --write`.

Kann ein DoD-Punkt nicht erfüllt werden, den Nutzer fragen. Nur mit seiner Zustimmung `--force --reason "..."`; der Grund landet im Verlauf.

## Verwerfen und Wiedereröffnen

```
works drop W-0008 --reason "Durch W-0003 abgedeckt"
works reopen W-0002 --reason "Fehler tritt bei Neustart wieder auf" --status in-arbeit
```

Wiedereröffnen holt die Aufgabe aus dem Archiv zurück und zählt `reopened` hoch.

## Auswertung

- `works report --days 7 [--write]`: Wochenbericht mit Erledigtem, Neuem, Blockiertem, Überfälligem und Meilensteinen
- `works changelog [--since 2026-10-01] [--milestone M1] [--version 1.2.0] [--write]`: gruppiert nach Neu, Behoben, Verbessert, Sonstiges
- `works commits <ID> [--write]`: alle Commits mit der ID
- `works board [--open]`: Kanban im Browser
- `works doctor [--fix]`: Konsistenzprüfung, danach Warnungen mit dem Nutzer durchgehen
