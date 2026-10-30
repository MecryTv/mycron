# Kanban-Board

Das Board zeigt alle Aufgaben als Spalten nach Status: Backlog, Geplant, In Arbeit, Review, Erledigt und optional Verworfen. Karten sind nach Priorität eingefärbt und zeigen Typ, Aufwand, Fälligkeit, Meilenstein, Tags, Fortschritt der Akzeptanzkriterien, Blockaden, offene Fragen und das zuletzt hinzugefügte Bild. Ein Klick auf eine Karte öffnet Details mit Ziel, Fragen, Bild und Link zur task.md. Oben stehen Suche, Prioritätsfilter, Typfilter und der Fortschritt der Meilensteine.

## Zwei Varianten

| | Datei | Live-Ansicht |
|---|---|---|
| Befehl | `works board` | `works board --serve` |
| Ergebnis | `.works/board.html` | Lokaler Server, standardmäßig `http://127.0.0.1:4747/` |
| Aktualisierung der Daten | Automatisch nach jedem schreibenden CLI-Befehl und beim Sessionstart, sobald die Datei einmal existiert | Laufend, auch bei manuellen Edits an task.md oder decisions.md |
| Aktualisierung im Browser | Von Hand neu laden | Automatisch innerhalb von etwa einer Sekunde, ohne Neuladen der Seite |
| Filter und offene Details | Gehen beim Neuladen verloren | Bleiben erhalten |
| Läuft ohne Prozess | Ja | Nein, der Server muss laufen |

## Live-Ansicht starten

Wenn der Nutzer das Board sehen will, die Live-Ansicht bevorzugen.

In Claude Code den Befehl als Hintergrundprozess starten (Bash mit `run_in_background`), damit die Session weiterläuft:

```
works board --serve
```

Danach dem Nutzer die ausgegebene URL nennen. Vorher prüfen, ob bereits ein Server für dieses Projekt läuft, und keinen zweiten starten. Mit `--open` öffnet sich der Standardbrowser auf dem Rechner, auf dem der Befehl läuft. Bei Remote-SSH-Sitzungen kein `--open` verwenden, sondern auf die Portweiterleitung des Editors hinweisen.

Der Nutzer kann den Server auch selbst in einem eigenen Terminal starten und mit Strg+C beenden.

Optionen:

- `--port 4800`: fester Port. Ohne Angabe wird ab 4747 der nächste freie Port gesucht.
- `--host 0.0.0.0`: im lokalen Netz erreichbar machen, etwa für ein Tablet. Nur auf Wunsch des Nutzers, weil dann jeder im Netz die Aufgaben sehen kann.

## Was die Live-Ansicht tut

- Prüft jede Sekunde, ob sich task.md, decisions.md, Assets, config.json, state.json oder ideas.md geändert haben.
- Bei einer Änderung werden WORKS.md und eine vorhandene board.html neu erzeugt, und alle offenen Browser-Tabs laden die Daten nach.
- Verschobene Karten gleiten sichtbar von der alten in die neue Spalte. Die Zielspalte leuchtet kurz auf, ihr Zähler springt.
- Geänderte Karten tragen zehn Sekunden lang einen farbigen Rahmen und ein Etikett wie "In Arbeit → Review", "Priorität P3 → P2" oder "neu angelegt in Backlog". Die Farbe entspricht der Zielspalte.
- Jede Änderung erscheint zusätzlich unten rechts als Hinweis mit dem letzten Verlaufseintrag als Begründung. Ein Klick darauf springt zur Karte und öffnet die Details.
- Der Knopf "Aktivität" oben rechts zählt ungesehene Änderungen und öffnet eine Liste aller Änderungen mit Uhrzeit. Die Liste bleibt im Browser gespeichert, auch nach dem Neuladen, und lässt sich leeren.
- Oben zeigt ein grüner Punkt die Verbindung und die Uhrzeit der letzten Aktualisierung. Rot bedeutet, dass der Server nicht erreichbar ist; der Browser versucht es automatisch weiter und holt verpasste Änderungen nach.
- Bei der Systemeinstellung für reduzierte Bewegung entfallen die Animationen, Rahmen und Hinweise bleiben.
- Ausgeliefert werden nur das Board, seine Daten und Dateien unter `tasks/`, `archive/` und `reports/` sowie WORKS.md und ideas.md. Der Server bindet standardmäßig nur an 127.0.0.1.

## Meilensteine

Meilensteine fassen Aufgaben zu einem Ziel zusammen, etwa einem Release oder dem Livegang. Sie werden mit `works milestone add M1 --title "Livegang" --due 2026-11-15` angelegt und Aufgaben mit `works set <ID> milestone=M1` zugeordnet. Das Board zeigt je Meilenstein, wie viele Aufgaben erledigt und offen sind, das Zieldatum und einen Fortschrittsbalken. Verworfene Aufgaben zählen nicht mit. Ein Klick auf einen Meilenstein filtert das Board auf dessen Aufgaben, ein zweiter Klick hebt den Filter auf.

## Statische Datei

`works board` erzeugt `.works/board.html`. Die Datei funktioniert ohne Server per Doppelklick und eignet sich zum Weitergeben. Sie steht standardmäßig in `.works/.gitignore`. Existiert sie, hält das CLI sie automatisch aktuell; im Browser muss sie aber neu geladen werden. Wer die automatische Aktualisierung nicht möchte, löscht die Datei einfach wieder.
