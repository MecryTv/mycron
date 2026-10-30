# Kanban-Board

Das Board zeigt alle Aufgaben als Spalten nach Status. In der Live-Ansicht kann der Nutzer dort auch selbst arbeiten: Aufgaben anlegen, verschieben, bearbeiten, Bilder ablegen, Ideen und Meilensteine pflegen. Alle Änderungen laufen über dasselbe CLI wie im Terminal, Prüfungen und Verlauf sind also identisch.

## Zwei Varianten

| | Live-Ansicht | Datei |
|---|---|---|
| Befehl | `works board --serve` | `works board` |
| Ergebnis | Lokaler Server, standardmäßig `http://127.0.0.1:4747/` | `.works/board.html` |
| Bearbeiten | Ja | Nein, reine Ansicht mit Hinweis |
| Aktualisierung | Laufend, auch bei manuellen Edits an task.md, ohne Neuladen der Seite | Datei wird nach jedem CLI-Befehl neu erzeugt, im Browser von Hand neu laden |
| Läuft ohne Prozess | Nein | Ja, auch per Doppelklick und offline |

## Live-Ansicht starten

Wenn der Nutzer das Board sehen oder selbst Aufgaben pflegen will, die Live-Ansicht starten.

In Claude Code den Befehl als Hintergrundprozess starten (Bash mit `run_in_background`), damit die Session weiterläuft:

```
works board --serve
```

Danach dem Nutzer die ausgegebene URL nennen. Vorher prüfen, ob bereits ein Server für dieses Projekt läuft, und keinen zweiten starten. Nach einem Plugin-Update den Server neu starten, sonst liefert er die alte Oberfläche aus. Mit `--open` öffnet sich der Standardbrowser auf dem Rechner, auf dem der Befehl läuft. Bei Remote-SSH kein `--open`, sondern auf die Portweiterleitung des Editors hinweisen; ein anderer lokaler Port ist dabei kein Problem.

Optionen:

- `--port 4800`: fester Port. Ohne Angabe wird ab 4747 der nächste freie Port gesucht.
- `--host 0.0.0.0`: im lokalen Netz erreichbar machen. Nur auf ausdrücklichen Wunsch, weil dann jeder im Netz, der die Seite öffnet, Aufgaben ändern kann.

## Aufbau der Oberfläche

- Kopfzeile: Projekt, Verbindungsstatus, Suche (Taste `/`), Nächste Aufgabe, Ideen, Aktivität, Farbschema (System, Hell, Dunkel) und Neue Aufgabe (Taste `N`).
- Flussleiste: Verteilung aller Aufgaben auf die Status. Ein Klick springt zur Spalte.
- Hinweise darunter: offene P1, blockierte, überfällige, Aufgaben mit offenen Fragen und unvollständig erfasste. Ein Klick filtert.
- Filter: Priorität, Typ, Tag, Archiv und Verworfene.
- Meilensteine: Fortschritt, erledigt und offen, Zieldatum. Klick filtert, Rechtsklick bearbeitet, "Meilenstein anlegen" legt einen neuen an.
- Spalten mit Karten. Karten zeigen ID, Typ, Aufwand, Priorität, Titel, letztes Bild, Fortschritt der Akzeptanzkriterien, Blockaden, Fälligkeit, offene Fragen, Meilenstein und Tags.

## Bearbeiten im Board

| Aktion | So geht es | Was dahinter passiert |
|---|---|---|
| Aufgabe anlegen | "Neue Aufgabe" oder `N`: Typ, Titel, Priorität, Spalte, Aufwand, Risiko, Fälligkeit, Meilenstein, Tags, Abhängigkeit, Ziel, Akzeptanzkriterien | `works new`, danach `section` und `item`. Ohne Ziel oder Kriterien wird die Aufgabe als unvollständig markiert |
| Schnell anlegen | `+` in Backlog oder Geplant, Titel eingeben, Enter | `works new` mit Feature und P3 |
| Verschieben | Karte in eine andere Spalte ziehen oder Status im Detailpanel wählen | Siehe Tabelle unten |
| Felder ändern | Detailpanel: Titel, Status, Priorität, Typ, Aufwand, Risiko, Fälligkeit, Meilenstein, Tags | `works set` |
| Inhalte | Ziel und weitere Abschnitte über "Bearbeiten", Markdown, Strg+Enter speichert | `works section` |
| Checklisten | Akzeptanzkriterien und Umsetzungsplan abhaken, ergänzen, entfernen | `works check`, `works item` |
| Offene Fragen | Notieren, mit optionaler Antwort als geklärt markieren | `works question` |
| Übergabe | Lesen und bearbeiten | `works handoff` |
| Bilder | Im Detailpanel mit Strg+V einfügen, hineinziehen oder Datei wählen, Art und Beschreibung angeben | Upload in die Inbox, dann `works asset` |
| Abhängigkeiten | Wartet auf, Blockiert, Verwandt mit einer anderen Aufgabe | `works link`, `works unlink` |
| Verlauf | Notiz schreiben | `works log` |
| Archivieren | Bei erledigten und verworfenen Aufgaben | `works archive` |
| Ideen | Notieren, als Aufgabe übernehmen (Typ und Priorität wählen), verwerfen | `works idea`, `promote`, `idea-drop` |
| Meilensteine | Anlegen und bearbeiten | `works milestone add`, `milestone set` |
| Nächste Aufgabe | Vorschläge mit Begründung, direkt starten | `works next`, `works start` |

Verschieben im Detail:

| Ziel | Verhalten |
|---|---|
| In Arbeit | `works start`. Ist die Aufgabe blockiert, fragt das Board nach und startet nur nach Bestätigung mit `--force` |
| Erledigt | Prüfdialog der Definition of Done: automatische Punkte mit Ergebnis, manuelle Punkte zum Abhaken. Abschließen erst, wenn alle manuellen Punkte bestätigt sind. Fehlen automatische Punkte, nur mit Begründung, die im Verlauf landet |
| Verworfen | Nur mit Begründung |
| Aus Erledigt oder Verworfen zurück | Nur in eine offene Spalte und mit Begründung (`works reopen`) |
| Alle anderen | `works set status=...` |

Jeder Verlaufseintrag aus dem Board endet mit `[Board]`. So ist in der task.md und in der Aktivitätsliste erkennbar, was der Nutzer selbst geändert hat.

## Für Claude wichtig

- Vor jedem Edit an einer task.md die Datei neu lesen. Der Nutzer kann sie inzwischen im Board geändert haben.
- Aufgaben mit `source: board` und `incomplete: true` hat der Nutzer schnell angelegt. Bei passender Gelegenheit Ziel und Akzeptanzkriterien mit ihm klären.
- Offene Fragen, die der Nutzer im Board notiert, sind oft an Claude gerichtet. Beim Start einer solchen Aufgabe zuerst darauf eingehen.
- Bilder, die über das Board kommen, haben eine Beschreibung vom Nutzer. Fehlt sie, das Bild bei Bedarf mit Read ansehen und die Beschreibung ergänzen.

## Live-Aktualisierung

- Der Server prüft jede Sekunde task.md, decisions.md, Assets, config.json, state.json und ideas.md. Bei Änderungen erzeugt er WORKS.md und eine vorhandene board.html neu und meldet sie an alle offenen Tabs.
- Verschobene Karten gleiten in die neue Spalte, die Zielspalte leuchtet kurz auf. Geänderte Karten tragen zehn Sekunden lang ein Etikett wie "In Arbeit → Review" oder "Priorität P3 → P2".
- Änderungen von Claude oder aus dem Terminal erscheinen zusätzlich als Hinweis unten rechts mit dem letzten Verlaufseintrag. Eigene Änderungen im Board bestätigt eine kurze Meldung.
- Die Aktivitätsliste sammelt alle Änderungen mit Uhrzeit und Herkunft und bleibt im Browser gespeichert.
- Während eine Karte gezogen wird, wartet die Aktualisierung bis zum Loslassen. Ist im Detailpanel gerade ein Text in Bearbeitung, wird er nicht überschrieben; stattdessen erscheint "Neu laden".
- Bei reduzierter Bewegung in den Systemeinstellungen entfallen die Animationen.

## Sicherheit

- Der Server bindet standardmäßig nur an 127.0.0.1 und nimmt nur Anfragen mit lokalem Hostnamen an. Das verhindert DNS-Rebinding.
- Jede API-Anfrage braucht ein zufälliges Token, das bei jedem Serverstart neu erzeugt und nur in die ausgelieferte Seite eingebettet wird. Fremde Webseiten können es nicht lesen und deshalb nichts ändern. Ein abweichender Origin wird zusätzlich abgelehnt.
- Alle Eingaben werden geprüft (IDs, Werte, Längen, Bildtypen bis 20 MB) und als einzelne Argumente ohne Shell an das CLI übergeben.
- Ausgeliefert werden nur Board, Daten und Dateien unter `tasks/`, `archive/` und `reports/` sowie WORKS.md und ideas.md. config.json und state.json bleiben gesperrt.
- Temporäre Dateien liegen kurz in `.works/.tmp/` und werden sofort wieder gelöscht.

## Meilensteine

Meilensteine fassen Aufgaben zu einem Ziel zusammen, etwa einem Release oder dem Livegang. Angelegt werden sie im Board oder mit `works milestone add M1 --title "Livegang" --due 2026-11-15`, zugeordnet im Detailpanel oder mit `works set <ID> milestone=M1`. Verworfene Aufgaben zählen nicht mit.

## Darstellung

Die Oberfläche liegt in `scripts/board/` (template.html, board.css, board.js) und wird mit der eingebetteten Schrift Geist (SIL Open Font License, siehe `scripts/board/fonts/Geist-LICENSE.txt`) zu einer einzigen HTML-Seite zusammengesetzt. Es werden keine externen Ressourcen geladen. Mit der Umgebungsvariable `WORKS_DEV=1` liest der Server die Dateien bei jedem Aufruf neu, praktisch beim Anpassen des Designs.
