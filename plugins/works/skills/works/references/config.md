# config.json

Liegt unter `.works/config.json`. Fehlende Felder werden mit Standardwerten ergänzt, die Datei muss also nur enthalten, was abweicht. Änderungen an `next_id` und `milestones` übernimmt das CLI.

| Feld | Standard | Bedeutung |
|---|---|---|
| `id_prefix` | `"W"` | Präfix der IDs, beim Init mit `--prefix` setzbar |
| `id_digits` | `4` | Stellen der Nummer |
| `next_id` | `1` | Nächste freie Nummer (wird automatisch gepflegt, `doctor --fix` korrigiert) |
| `next_idea_id` | `1` | Nächste Ideen-Nummer |
| `milestones` | `[]` | Liste aus `{ id, title, due, description, status }` |
| `dod.global` | siehe unten | Manuelle DoD-Punkte für alle Aufgaben |
| `dod.by_type` | siehe unten | Zusätzliche manuelle Punkte je Typ |
| `dod.by_tag` | `{ "ui": [...] }` | Zusätzliche manuelle Punkte je Tag |
| `dod.commands` | `[]` | Shell-Befehle, die `works done --run` ausführt, zum Beispiel `["npm run build", "npm test"]` |
| `assets.max_width` | `2400` | Maximale Bildbreite beim Komprimieren |
| `assets.quality` | `82` | Qualität beim Komprimieren |
| `assets.compress_on_add` | `false` | Neue Bilder automatisch komprimieren (braucht sharp) |
| `brainstorm.mode` | `"link"` | Standard für `attach-doc`: link, copy oder move |
| `github.label_priority` | Zuordnung | Labels zu P1, P2, P4 (alles andere wird P3) |
| `github.label_type` | Zuordnung | Labels zu Typen (Standard feature) |
| `scan.markers` | `["TODO","FIXME","HACK","XXX"]` | Gesuchte Marker |
| `scan.ignore` | übliche Build-Ordner | Ignorierte Ordner, zusätzlich zur .gitignore |
| `hooks.session_start` | `true` | SessionStart Hook in diesem Projekt aktiv |
| `hooks.stop_reminder` | `true` | Stop Hook in diesem Projekt aktiv |
| `report.days` | `7` | Standardzeitraum für `works report` |
| `handoff_stale_days` | `3` | Ab wann `doctor` eine laufende Aufgabe ohne Aktualisierung meldet |
| `queue`, `queue_settings` | `[]`, siehe board.md | Warteschlange des Nutzers und Ablauf danach (`auto_next`, `ask_before`, `skip_blocked`) |
| `sprints` | `[]` | Sprints mit `id`, `title`, `goal`, `start`, `end`, `capacity`, `status`, `tasks`, nach Abschluss `result` und `carry` |
| `sprint_settings` | `{ "length_days": 14, "capacity": 20, "points": { "S": 1, "M": 2, "L": 4, "XL": 8 } }` | Standardlänge, Kapazität und Punkte je Aufwand |
| `views` | `[]` | Gespeicherte Ansichten aus dem Board: `name`, `filter`, `view`, `sort` |
| `checks` | `{}` | Prüfungen vor dem Abschluss, Name zu Befehl, `skill:code-audit` für Skills |
| `checks_by_type` | `{}` | Welche Prüfungen je Typ gelten, ohne Eintrag alle |
| `time_tracking` | `true` | Zeiterfassung über die Hooks |
| `effort_mode` | `"fixed"` | `measured` lässt Zeitleiste, Graph und Sprint mit gemessenen Dauern rechnen |
| `effort_days` | `{ "S": 2, "M": 5, "L": 10, "XL": 15 }` | Feste Dauer je Aufwand in Kalendertagen |
| `report.enabled`, `report.weekday`, `report.time` | `false`, `5`, `"16:00"` | Wochenbericht automatisch fällig, Wochentag 1 bis 7 und Uhrzeit |
| `report.destinations` | `{ "file": true, "discord": false }` | Ziele des Wochenberichts. Die Discord-URL steht nur in `report.local.json` |
| `report.include` | alle `true` | Abschnitte: `done`, `attention`, `next`, `milestones` |

## Definition of Done

Die automatischen Prüfungen sind fest eingebaut (Akzeptanzkriterien, offene Fragen, Umsetzungsschritte, typbezogene Abschnitte, Screenshots und decisions.md bei UI). Die Listen in `dod` sind Punkte, die Claude selbst prüfen und bestätigen muss.

Standard:

```json
"dod": {
  "global": [
    "Build und Tests laufen ohne Fehler",
    "code-audit Skill wurde für die Änderungen ausgeführt",
    "Verlauf ist aktuell und Designentscheidungen sind dokumentiert"
  ],
  "by_type": {
    "bug": ["Regressionstest vorhanden oder Verzicht begründet"],
    "refactor": ["Verhalten nach außen unverändert"],
    "spike": ["Folgeaufgaben sind angelegt"],
    "debt": ["Schuld ist vollständig getilgt oder die verbleibenden Folgekosten sind dokumentiert"]
  },
  "by_tag": {
    "ui": ["responsive-website-check wurde ausgeführt"]
  },
  "commands": []
}
```

Projektspezifische Punkte einfach ergänzen, zum Beispiel `"Discord Slash Commands neu registriert"` für einen Bot oder `"Migration auf Staging getestet"`.
