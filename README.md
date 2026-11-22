# mycron

Plugins für Claude Code von MecryTv.

```
/plugin marketplace add MecryTv/mycron
/plugin install works@mycron
/plugin install workday@mycron
/plugin install ci-watch@mycron
/plugin install mockups@mycron
```

## Plugins

| Plugin | Beschreibung |
|---|---|
| [works](plugins/works/README.md) | Aufgabenverwaltung in `.works/` mit Live-Board, Warteschlange, Sprints, Zeitleiste, Abhängigkeitsgraph, Kommentaren an Claude, Vorlagen, automatischen Prüfungen, Zeiterfassung, Wochenbericht und Teilen im Netzwerk |
| [workday](plugins/workday/README.md) | Feierabend und Guten Morgen: Übergaben schreiben, `.works` sichern, Board stoppen, Tag zusammenfassen und am nächsten Morgen dort weitermachen (braucht works) |
| [ci-watch](plugins/ci-watch/README.md) | Wartet nach einem Push auf den GitHub-Actions-Lauf zum Commit und meldet grün oder rot, bei rot mit Job, Schritt und Fehlerstelle. Ohne `gh`, für öffentliche Repos ohne Token |
| [mockups](plugins/mockups/README.md) | Varianten als HTML-Entwurf mit den echten Styles des Projekts, Screenshots in drei Breiten hell und dunkel, Prüfung auf seitliches Scrollen und Fehler, Anhängen an works-Aufgaben |
