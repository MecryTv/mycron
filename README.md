# mycron

Plugins für Claude Code von MecryTv.

```
/plugin marketplace add MecryTv/mycron
/plugin install works@mycron
/plugin install feierabend@mycron
/plugin install ci-waechter@mycron
```

## Plugins

| Plugin | Beschreibung |
|---|---|
| [works](plugins/works/README.md) | Aufgabenverwaltung in `.works/` mit Live-Board, Warteschlange, Sprints, Zeitleiste, Abhängigkeitsgraph, Kommentaren an Claude, Vorlagen, automatischen Prüfungen, Zeiterfassung, Wochenbericht und Teilen im Netzwerk |
| [feierabend](plugins/feierabend/README.md) | Feierabend und Guten Morgen: Übergaben schreiben, `.works` sichern, Board stoppen, Tag zusammenfassen und am nächsten Morgen dort weitermachen (braucht works) |
| [ci-waechter](plugins/ci-waechter/README.md) | Wartet nach einem Push auf den GitHub-Actions-Lauf zum Commit und meldet grün oder rot, bei rot mit Job, Schritt und Fehlerstelle. Ohne `gh`, für öffentliche Repos ohne Token |
