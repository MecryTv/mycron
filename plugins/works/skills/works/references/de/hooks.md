# Hooks

Ein Skill wird nur geladen, wenn Claude ihn für relevant hält. Hooks sorgen dafür, dass die Aufgaben beim Sessionstart sichtbar sind und die Übergabe nicht vergessen wird. Alle Hooks bleiben still in Projekten ohne `.works/`.

## Installation über das Plugin mycron

Wird works als Plugin aus dem Marketplace mycron installiert, bringt es SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse, SubagentStop und Stop Hook selbst mit (`plugins/works/hooks/hooks.json`). Sie sind aktiv, solange das Plugin aktiviert ist, und werden mit jedem Plugin-Update automatisch aktualisiert. `works install-hooks --claude` ist dann nicht nötig und meldet das auch so.

Pro Projekt einrichten muss man nur den Git pre-commit Hook:

```
works install-hooks --git
```

## Installation als einfacher Skill-Ordner

Liegt der Skill direkt unter `~/.claude/skills/works`, richtet `works install-hooks` die Claude Code Hooks ein. Die Einrichtung ändert Konfigurationsdateien des Nutzers. Vorher fragen und mit `--dry-run` zeigen, was passiert.

```
works install-hooks --dry-run
works install-hooks                     # Claude Code Hooks global plus Git pre-commit im aktuellen Repo
works install-hooks --claude --scope project
works install-hooks --git
```

| Option | Ziel |
|---|---|
| `--scope user` (Standard) | `~/.claude/settings.json`, gilt für alle Projekte |
| `--scope project` | `.claude/settings.json` im Projekt, wird mit dem Repo geteilt |
| `--scope local` | `.claude/settings.local.json`, nur lokal |

Liegt der Skill unter dem Home-Verzeichnis, wird der Pfad als `$HOME/...` eingetragen. Mehrfaches Ausführen legt keine Duplikate an.

Ist das Plugin installiert und der Skill zusätzlich als Ordner vorhanden, die Hooks nur einmal einrichten, sonst laufen sie doppelt.

## SessionStart

Datei: `hooks/session-start.mjs`, Matcher `startup|resume|clear|compact`.

Erzeugt WORKS.md und eine vorhandene board.html neu, ersetzt Board-Server dieses Projekts, die noch mit einer älteren works-Version laufen, und gibt eine Kurzübersicht in den Kontext: Anzahl offener Aufgaben, offene P1 und P2, Überfälliges, die aktive Aufgabe samt Übergabe (gekürzt auf 1500 Zeichen) und offene Fragen, sowie einen Hinweis auf Dateien in der Inbox. Dazu kommen der aktive Sprint, die Warteschlange, neue Kommentare vom Nutzer und ein Hinweis, wenn laut Einstellung ein Wochenbericht fällig ist. Gerade nach `compact` stellt das den Arbeitsstand wieder her.

Außerdem: Das Projekt wird in `~/.works/projects.json` für `works hub` eingetragen, fällige wiederkehrende Aufgaben werden angelegt (Verlauf `[Wiederkehrend]`), und ist der GitHub-Abgleich fällig, startet er im Hintergrund. Die Übersicht nennt die Bereiche des Projektwissens, Vorschläge, die auf den Nutzer warten, und Aufgaben mit Entwürfen ohne Wahl.

Außerdem nennt der Hook Claude die eingestellte Sprache (`works lang`, siehe config.md), etwa `Language: de, answer in German, German docs in SKILL.de.md and references/de/`. Claude antwortet dann in dieser Sprache und liest bei Deutsch die deutsche Fassung der Doku.

Abschalten pro Projekt: `"hooks": { "session_start": false }` in `.works/config.json`.

## Stop

Datei: `hooks/stop-reminder.mjs`.

Läuft, wenn Claude eine Antwort beendet, in dieser Reihenfolge:

1. Zeit und Tokenverbrauch der Antwort der aktiven Aufgabe zuschreiben. Der Hook liest dazu das Transkript ab der zuletzt gelesenen Stelle (`.works/.usage-state.json`), zählt jede Nachricht nur einmal und schreibt `usage`-Zeilen in `time.jsonl`.
2. Warten Anweisungen aus dem Board, die Claude noch nicht bekommen hat, setzt der Hook die Antwort mit diesen Anweisungen fort. Das passiert nur einmal pro Antwort (`stop_hook_active`).
3. Die Anzeige "Claude arbeitet" im Board auf Pause stellen.
4. Ist eine Aufgabe aktiv und wurden laut `git status` seit der letzten Änderung an ihrer task.md Projektdateien geändert, bittet der Hook einmalig, Verlauf, Häkchen und Übergabe zu aktualisieren. Ohne Git-Repository entfällt das.

Reagieren: kurz `works log` und `works handoff` ausführen, Häkchen setzen. Ist nichts Relevantes passiert, einfach fortfahren.

Abschalten der Erinnerung pro Projekt: `"hooks": { "stop_reminder": false }`. Zeit und Verbrauch: `"time_tracking": false`.

## UserPromptSubmit

Datei: `hooks/prompt-submit.mjs`.

Merkt sich für die Zeiterfassung, wann eine Anfrage beginnt, und zeigt im Board "Claude arbeitet". Liegen Anweisungen für die aktive Aufgabe vor, kommen sie als Kontext mit. Nur wenn eine Aufgabe mit `works start` aktiv ist.

## PreToolUse

Datei: `hooks/pre-tool.mjs`, ohne Matcher, Timeout 5 Sekunden.

Meldet jeden Werkzeugaufruf, bevor er läuft: `current` in `.works/activity.json` bekommt den Aufruf mit `running: true`, die Liste der letzten Aufrufe bleibt unverändert. Damit zeigt die Live-Ansicht während eines langen Befehls wie `npm test` den Befehl selbst und seine Laufzeit statt des Aufrufs davor. Der Hook schreibt sonst nichts und gibt nichts aus. Er kostet pro Werkzeugaufruf etwa 0,2 Sekunden (Start von Node, unter Windows gemessen). Abschalten mit `"live_activity": false`.

## PermissionRequest

Datei: `hooks/permission.mjs`, ohne Matcher, Timeout 5 Sekunden.

Läuft, wenn Claude Code den Nutzer gleich um eine Freigabe für einen Werkzeugaufruf bittet. Markiert den laufenden Aufruf in `.works/activity.json` mit `perm: true` und `permSince`, damit die Live-Ansicht "Claude wartet auf deine Freigabe" mit Befehl und Wartezeit zeigt. Der Hook gibt nichts aus und entscheidet nie über die Freigabe, das bleibt beim Nutzer.

Der Zustand endet mit dem nächsten PreToolUse oder PostToolUse desselben Agenten, mit Stop oder UserPromptSubmit. Aufrufe eines anderen Agenten (anderes `agent_id` in der Hook-Eingabe) landen im Verlauf, ersetzen die wartende Freigabe aber nicht. Eine Ablehnung und der Moment der Freigabe selbst melden keinen Hook: Nach einer Freigabe steht die Anzeige deshalb bis zum Ende dieses Aufrufs auf "wartet", nach einer Ablehnung bis zur nächsten Nachricht. Spätestens nach 60 Minuten gilt sie als veraltet. Abschalten mit `"live_activity": false`.

## PostToolUse

Datei: `hooks/post-tool.mjs`, ohne Matcher, Timeout 5 Sekunden.

Schreibt nach jedem Werkzeugaufruf eine kurze Zeile in `.works/activity.json` (zum Beispiel "Bearbeitet src/backup.ts" oder "Befehl npm test"), die das Board auf der aktiven Karte und in der Live-Ansicht zeigt, und hält in `.works/steps.json` fest, wann Schritte des Umsetzungsplans der Aufgabe abgehakt wurden. Inhalte von Dateien oder Befehlsausgaben werden nicht gespeichert, nur Werkzeug, Dateiname oder die ersten Zeichen des Befehls. Liegt eine neue Anweisung des Nutzers vor, kommt sie hier als Kontext an Claude, sodass sie schon während der Antwort ankommt. Claude soll sie berücksichtigen, sobald es sinnvoll ist.

Enthält die Antwort des Werkzeugs eine `backgroundTaskId` (Befehl mit `run_in_background` oder nach seinem Timeout in den Hintergrund verschoben), läuft der Befehl nach dem Aufruf weiter. Der Hook trägt ihn dann zusätzlich unter `background` in `.works/activity.json` ein: ID, Aufgabe, Werkzeug, Beschreibung (`description`, sonst die ersten Zeichen des Befehls), Start (bei einem verschobenen Befehl um `timedOutAfterMs` früher) und den Pfad der Ausgabedatei, den er unter `<tmp>/claude/*/<session_id>/tasks/<id>.output` sucht. Findet er keine Datei, fehlt der Pfad. Höchstens zehn Einträge, der neueste zuerst; fertige, deren Ende mehr als eine Stunde zurückliegt, fallen weg. Ob ein Befehl läuft oder mit welchem Exit-Code er endete, liest das Board aus dem Ende dieser Datei (board.md, Live-Ansicht).

Außerdem merkt sich der Hook bei Edit, Write und NotebookEdit, welche Datei für welche Aufgabe geändert wurde (`.works/files.jsonl`, lokal). Wird eine Datei in einer Sitzung zum ersten Mal geändert und haben andere Aufgaben dort Entscheidungen getroffen oder laufen gerade, bekommt Claude einmalig einen Hinweis mit den Aufgaben und ihren Entscheidungen.

Bei Parallelarbeit erkennt der Hook am Pfad, zu welchem Worktree ein Aufruf gehört. Aktivität, Dateien und Anweisungen gehen dann an diese Aufgabe, nicht an die aktive Aufgabe der Hauptsitzung.

Abschalten: `"live_activity": false` in `.works/config.json` (Anweisungen kommen dann erst über den Stop Hook), `"file_tracking": false` für Dateien und Hinweise.

## SubagentStop

Datei: `hooks/subagent-stop.mjs`.

Rechnet den Tokenverbrauch eines Agenten aus dessen eigenem Transkript (`agent_transcript_path`) der passenden Aufgabe zu: der Aufgabe seines Worktrees bei Parallelarbeit, sonst der aktiven Aufgabe. Ältere Claude Code Versionen ohne eigenes Agenten-Transkript zählen den Verbrauch im Stop Hook mit.

## Git pre-commit

Wird an `.git/hooks/pre-commit` angehängt (vorhandene Inhalte bleiben erhalten). Werden Dateien aus `.works/` committet, läuft `works doctor --quiet`. Bei Fehlern (nicht bei Warnungen) wird der Commit abgebrochen. Bei der Plugin-Installation sucht der Hook den aktuellen Pfad des CLI zur Laufzeit, weil sich der Installationsordner bei Updates ändert. Wird das CLI nicht gefunden, wird die Prüfung übersprungen statt den Commit zu blockieren. Umgehen im Notfall mit `git commit --no-verify`.

## Manuell eintragen

Nur für die Installation als Skill-Ordner:

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "startup|resume|clear|compact",
        "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/session-start.mjs\"", "timeout": 15 }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/prompt-submit.mjs\"", "timeout": 10 }] }
    ],
    "PreToolUse": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/pre-tool.mjs\"", "timeout": 5 }] }
    ],
    "PermissionRequest": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/permission.mjs\"", "timeout": 5 }] }
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/post-tool.mjs\"", "timeout": 5 }] }
    ],
    "SubagentStop": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/subagent-stop.mjs\"", "timeout": 10 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/stop-reminder.mjs\"", "timeout": 15 }] }
    ]
  }
}
```

## Entfernen

Plugin: über `/plugin` deaktivieren oder deinstallieren. Skill-Ordner: die works-Einträge aus der jeweiligen settings.json löschen. In beiden Fällen den Block ab `# works-doctor` aus `.git/hooks/pre-commit` entfernen.
