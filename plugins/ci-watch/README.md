# ci-watch

Ein Skill, der nach einem Push auf den GitHub-Actions-Lauf zum Commit wartet und das Ergebnis meldet. Bei rot nennt er den Job, den Schritt und die Fehlerstelle.

## Installation

```
/plugin marketplace add MecryTv/mycron
/plugin install ci-watch@mycron
```

Braucht Node 18 oder neuer und ein Repo, dessen `origin` auf GitHub zeigt. `gh` ist nicht nötig.

## Auslöser

"Läuft die CI durch?", "sag Bescheid, wenn die Pipeline fertig ist", "ist der Build grün?", oder direkt nach einem Push, wenn du auf das Ergebnis warten willst.

## Was er meldet

- **grün**: welche Workflows durchgelaufen sind
- **rot**: je fehlgeschlagenem Job der Schritt, die Fehler-Annotationen und der Link zum Job. Mit Token zusätzlich ein Auszug aus dem Log um die erste Fehlermeldung
- **kein Lauf**: wenn nach drei Minuten kein Workflow für den Commit gestartet ist, etwa weil die Workflows nur bei bestimmten Pfaden oder Branches laufen
- **Zeitlimit**: nach 20 Minuten ohne Ergebnis, mit den Läufen, die noch nicht fertig sind

## Token und Abfragelimit

Ohne Token reicht das für öffentliche Repos. GitHub erlaubt dann 60 Abfragen pro Stunde, deshalb fragt der Wächter nur einmal pro Minute. Mit `GITHUB_TOKEN` oder `GH_TOKEN` in der Umgebung fragt er alle 30 Sekunden, kommt an private Repos und liest den Log-Auszug. Der Token geht nur in den `Authorization`-Header, nie in eine URL.

## Direkt aufrufen

```
node plugins/ci-watch/skills/ci-watch/scripts/ci-status.mjs [--sha <commit>] [--repo owner/name] [--timeout 20] [--interval 60] [--grace 3]
```

Exit-Code 0 grün, 1 rot, 2 kein Lauf oder Zeitlimit, 3 Fehler (kein GitHub-Repo, Rate-Limit, Repo nicht gefunden).
