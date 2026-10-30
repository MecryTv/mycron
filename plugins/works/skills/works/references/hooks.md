# Hooks

Ein Skill wird nur geladen, wenn Claude ihn für relevant hält. Hooks sorgen dafür, dass die Aufgaben beim Sessionstart sichtbar sind und die Übergabe nicht vergessen wird. Alle Hooks bleiben still in Projekten ohne `.works/`.

## Installation über das Plugin mycron

Wird works als Plugin aus dem Marketplace mycron installiert, bringt es den SessionStart und den Stop Hook selbst mit (`plugins/works/hooks/hooks.json`). Sie sind aktiv, solange das Plugin aktiviert ist, und werden mit jedem Plugin-Update automatisch aktualisiert. `works install-hooks --claude` ist dann nicht nötig und meldet das auch so.

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

Erzeugt WORKS.md und eine vorhandene board.html neu, ersetzt Board-Server dieses Projekts, die noch mit einer älteren works-Version laufen, und gibt eine Kurzübersicht in den Kontext: Anzahl offener Aufgaben, offene P1 und P2, Überfälliges, die aktive Aufgabe samt Übergabe (gekürzt auf 1500 Zeichen) und offene Fragen, sowie einen Hinweis auf Dateien in der Inbox. Gerade nach `compact` stellt das den Arbeitsstand wieder her.

Abschalten pro Projekt: `"hooks": { "session_start": false }` in `.works/config.json`.

## Stop

Datei: `hooks/stop-reminder.mjs`.

Läuft, wenn Claude eine Antwort beendet. Ist eine Aufgabe aktiv und in Arbeit, und wurden laut `git status` seit der letzten Änderung an ihrer task.md Projektdateien geändert, bittet der Hook Claude einmalig, Verlauf, Häkchen und Übergabe zu aktualisieren. Die Erinnerung kommt pro Änderungsstand nur einmal und nie, wenn der Hook bereits eine Fortsetzung ausgelöst hat (`stop_hook_active`). Ohne Git-Repository bleibt der Hook still.

Reagieren: kurz `works log` und `works handoff` ausführen, Häkchen setzen. Ist nichts Relevantes passiert, einfach fortfahren.

Abschalten pro Projekt: `"hooks": { "stop_reminder": false }`.

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
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/skills/works/hooks/stop-reminder.mjs\"", "timeout": 15 }] }
    ]
  }
}
```

## Entfernen

Plugin: über `/plugin` deaktivieren oder deinstallieren. Skill-Ordner: die beiden Einträge aus der jeweiligen settings.json löschen. In beiden Fällen den Block ab `# works-doctor` aus `.git/hooks/pre-commit` entfernen.
