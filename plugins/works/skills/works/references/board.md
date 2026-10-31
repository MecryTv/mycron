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

In Claude Code so starten:

```
works board --serve --detach
```

Der Server läuft dann losgelöst im Hintergrund weiter, auch nach dem Ende der Session, und der Befehl gibt die URL aus. Diese dem Nutzer nennen. Läuft für das Projekt schon ein Server mit der aktuellen Version, startet kein zweiter, sondern es wird nur dessen URL ausgegeben. Ein Server einer älteren Version wird beendet und durch die aktuelle ersetzt.

Weitere Befehle:

- `works board --status`: läuft ein Server, welche Version, ist sie aktuell?
- `works board --restart`: Server mit der aktuellen Version neu starten, gleicher Port.
- `works board --stop`: Server beenden.

Ohne `--detach` läuft der Server im Vordergrund, bis er mit Strg+C beendet wird. Das ist für ein eigenes Terminal gedacht. Mit `--open` öffnet sich der Standardbrowser auf dem Rechner, auf dem der Befehl läuft. Bei Remote-SSH kein `--open`, sondern auf die Portweiterleitung des Editors hinweisen; ein anderer lokaler Port ist dabei kein Problem.

Optionen:

- `--port 4800`: fester Port. Ohne Angabe wird ab 4747 der nächste freie Port gesucht.
- `--host 0.0.0.0`: im lokalen Netz erreichbar machen. Nur auf ausdrücklichen Wunsch, weil dann jeder im Netz, der die Seite öffnet, Aufgaben ändern kann.

## Demo zum Ausprobieren

```
works demo --simulate --open
```

Legt im Temp-Ordner ein Beispielprojekt `works-demo` mit elf Aufgaben aller Typen an, mit Bildern, Ideen, zwei Meilensteinen, einer überfälligen und einer blockierten Aufgabe, und startet das Live-Board. Mit `--simulate` folgen im Abstand von `--delay` Sekunden (Standard 6) zehn Änderungen, wie Claude sie macht: Aufgabe starten, Kriterium abhaken, Frage notieren, nach Review verschieben, neue Aufgabe, Priorität anheben, abschließen, Übergabe schreiben, verwerfen. Im Board lässt sich danach alles selbst ausprobieren.

Ein erneuter Aufruf setzt die Demo zurück. `works demo --remove` beendet den Server und löscht den Ordner. Ein Ordner mit echtem `.works` wird nie angefasst; die Demo erkennt ihre eigenen Ordner an `.works/.demo`.

## Aufbau der Oberfläche

- Kopfzeile: Projekt, Verbindungsstatus, Ansicht (Board, Sprint, Warteschlange, Zeitleiste, Abhängigkeiten, Tabelle, Tasten `1` bis `6`), Werkzeuge, Suche (Taste `/`), Nächste Aufgabe, Ideen, Aktivität, Teilen, Farbschema (System, Hell, Dunkel) und Neue Aufgabe (Taste `N`).
- Flussleiste: Verteilung aller Aufgaben auf die Status. Ein Klick springt zur Spalte.
- Hinweise darunter: offene P1, blockierte, überfällige, Aufgaben mit offenen Fragen und unvollständig erfasste. Ein Klick filtert.
- Filter: Priorität, Typ, Tag, Meilenstein, Archiv und Verworfene. Im Meilenstein-Filter lassen sich auch Meilensteine anlegen; ist einer gewählt, erscheint "Meilenstein bearbeiten".
- Fortschritt: Anteil erledigter Aufgaben in Prozent, Balken für erledigt, in Arbeit und Review sowie noch offen, erfüllte Akzeptanzkriterien, Bilanz der letzten 7 Tage, eine Prognose aus dem Tempo der letzten 4 Wochen und ein Verlaufsdiagramm über 8 Wochen (angelegte gegen erledigte Aufgaben). Die Anzeige folgt den Filtern: Ist ein Meilenstein gewählt, zeigt sie dessen Fortschritt samt Zieldatum. Verworfene Aufgaben zählen nicht mit, erledigte im Archiv schon.
- Spalten mit Karten. Karten zeigen ID, Typ, Aufwand, Priorität, Titel, letztes Bild, Fortschritt der Akzeptanzkriterien, Blockaden, Fälligkeit, offene Fragen, Meilenstein und Tags.

## Ansichten

- **Board**: Spalten mit Karten wie oben.
- **Sprint**: Zeitraum, Ziel, Kapazität in Punkten, Burndown und Vorschläge zum Einplanen. Siehe planning.md.
- **Abhängigkeiten**: Graph von links nach rechts in Stufen. Der kritische Pfad (längste Kette offener Aufgaben nach Schätzung) ist orange, rechts stehen seine Dauer und die Aufgabe, die am meisten freigibt. Das + an einer Karte auf eine andere ziehen legt "blockiert" an.
- **Warteschlange**: die Reihenfolge, in der Claude arbeiten soll. Aufgaben einreihen (Auswahlfeld, Detailpanel oder Tabelle), per Ziehen oder Pfeilen sortieren, mit × entfernen. Oben steht, was gerade läuft. Rechts die Einstellungen: nach dem Abschluss weitermachen (`auto_next`), vorher nachfragen (`ask_before`), blockierte überspringen (`skip_blocked`), dazu was Claude als Nächstes nimmt und der Aufwand in der Schlange. Erledigte und verworfene fallen automatisch heraus. Im CLI: `works queue`.
- **Zeitleiste**: Wochen mit Kalenderwoche, gruppiert nach Meilenstein. Volle Balken laufen oder sind erledigt, gestrichelt farbig sind geplant mit Fälligkeit, gestrichelt grau sind aus dem Aufwand geschätzt (S 2, M 5, L 10, XL 15 Tage, blockierte beginnen nach ihrer Abhängigkeit). Linie für heute, gestrichelte grüne Linie für das Ziel eines Meilensteins, Überfälliges rot. Das rechte Ende eines Balkens ziehen setzt die Fälligkeit.
- **Tabelle**: alle gefilterten Aufgaben mit sortierbaren Spalten. Priorität, Aufwand und Fälligkeit direkt in der Zeile ändern. Mehrere auswählen (Shift wählt einen Bereich), dann in der Leiste unten Priorität, Status, Meilenstein, Aufwand oder Tags setzen, einreihen, verwerfen oder archivieren. Abschließen geht bewusst nur einzeln über die Definition of Done.

Das Detailpanel hat die Reiter **Übersicht**, **Kommentare** (Gespräch mit Claude, siehe planning.md), **Zeit** (aktive Zeit von Claude, Tage je Status, Sitzungen) und **Code und Commits**. Unten gibt es "Als Vorlage speichern".

Über dem Fortschritt zeigt die Zeile **Ansichten** gespeicherte Filter als Chips; "Aktuelle Filter speichern" erscheint, sobald Filter gesetzt sind. Über der Zeitleiste zeigt "Wie gut passen die Schätzungen?" Schätzung gegen tatsächliche Dauer.

Das Symbol mit den Reglern in der Kopfzeile öffnet die **Werkzeuge**: Wochenbericht (Zeitplan, Discord, Inhalt, Berichte ansehen), Vorlagen (anlegen, bearbeiten, nutzen), Prüfungen vor dem Abschluss und Benachrichtigungen im Browser (Review, Frage oder Kommentar von Claude, neue P1, Blockade aufgelöst, Warteschlange leer, Ton und Zähler im Tab-Titel).

Neue Aufgaben: Gibt es Vorlagen, fragt der Dialog zuerst nach einer Vorlage oder "Leer". Mit Vorlage gibt es die Felder der Vorlage, das freie Feld "Was genau soll passieren?" und die Kriterien zum An- und Abwählen.

Im Detailpanel zeigt der Reiter **Code und Commits** den Branch der Aufgabe (aus dem Feld `branch` oder der ID im Branchnamen), wie weit er dem Hauptbranch voraus ist, einen Pull Request (wenn `gh` angemeldet ist), alle Commits mit der ID in der Nachricht und die geänderten Dateien. Ein Klick auf eine Datei zeigt den Diff. Arbeitet man gerade auf dem Branch, stehen noch nicht committete Änderungen extra.

## Teilen

- **Im Netzwerk, live und nur lesen**: Im Board auf Teilen, dann "Im Netzwerk freigeben", oder `works board --restart --share`. Der Server hört dann auf allen Adressen und gibt einen Link wie `http://192.168.1.20:4747/?view=SCHLÜSSEL` aus. Wer ihn öffnet, sieht Board, Zeitleiste, Tabelle, Details und Code live, kann aber nichts ändern. Ohne Schlüssel gibt es keinen Zugriff.
- **Eigene andere Geräte**: Der Bearbeitungslink (`?key=…`, im Teilen-Dialog unter "Link mit Bearbeitungsrechten" oder `works share --owner`) erlaubt alles. Nicht weitergeben.
- **Links erneuern**: `works share --rotate` oder im Dialog. Alte Links funktionieren danach nicht mehr. Die Schlüssel liegen in `.works/share.json` und sind von Git ausgenommen.
- **Freigabe beenden**: `works board --restart --private` oder im Dialog.
- **Schnappschuss**: `works export` oder im Dialog. Eine HTML-Datei mit allen Aufgaben, Details und eingebetteten Bildern, öffnet sich ohne Server und ohne Internet. Ideal für Leute außerhalb des Netzwerks.
- Ein Hosting im Internet ist noch nicht eingebaut. Den Port nicht einfach ins Internet weiterleiten; Tunnel und Reverse Proxys werden als fremde Zugriffe behandelt und brauchen ebenfalls einen Schlüssel.

## Schnellsuche

Rechte Shift-Taste kurz drücken und loslassen, oder Strg+K (auf dem Mac Cmd+K), öffnet eine Suche wie bei GitHub.

- Ohne Eingabe: offene Aufgaben nach Wichtigkeit und häufige Befehle.
- Text: sucht in ID, Titel, Tags, Typ und Meilenstein. Enter öffnet die Aufgabe.
- `#`: Tags, Enter filtert danach.
- `>`: Befehle, etwa Neue Aufgabe, Ideen, Farbschema, Filter nach Priorität oder Meilenstein, Zu Spalte springen.
- Pfeiltasten wählen, Esc schließt.

Beim Tippen von Großbuchstaben mit der rechten Shift-Taste öffnet sich nichts, weil dabei eine weitere Taste gedrückt wird. In Eingabefeldern ist die Shift-Abkürzung aus; Strg+K funktioniert dort weiterhin.

## Bearbeiten im Board

| Aktion | So geht es | Was dahinter passiert |
|---|---|---|
| Aufgabe anlegen | "Neue Aufgabe" oder `N`: Typ, Titel, Priorität, Spalte, Aufwand, Risiko, Fälligkeit, Meilenstein, Tags, Abhängigkeit, Beschreibung mit allem Relevanten, Akzeptanzkriterien | `works new`, danach `section` und `item`. Ohne Beschreibung oder Kriterien wird die Aufgabe als unvollständig markiert |
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
| Meilensteine | Im Meilenstein-Filter anlegen, gewählten Meilenstein bearbeiten, oder über die Schnellsuche | `works milestone add`, `milestone set` |
| Nächste Aufgabe | Vorschläge mit Begründung, direkt starten | `works next`, `works start` |
| Entwürfe wählen | Tab Entwürfe einer Gestaltungsaufgabe: Designrichtung, Varianten als Vorschau, "Groß ansehen", "Diese nehmen" mit optionalem Grund | `works design choose` |
| Abnehmen | In Review "Abnehmen": gewählter Entwurf oder Vorher neben dem Ergebnis, Kriterien gegenprüfen. "Annehmen" öffnet die Definition of Done, "Zurück an Claude" verlangt einen Text | Kommentar an Claude, abgewählte Kriterien wieder offen, Status In Arbeit |
| Anweisung an Claude | Auf der aktiven Karte oder in der Übersicht einer Aufgabe in Arbeit | `works instruct`, Claude bekommt sie über den PostToolUse oder Stop Hook |
| Rückgängig | Meldung nach jeder Änderung mit "Rückgängig", `Strg+Z` außerhalb von Textfeldern, Liste unter Werkzeuge, Letzte Änderungen | `works undo` |
| Projektwissen, Aufräumen | Werkzeuge, oben | `works know`, siehe planning.md |
| Wiederkehrend, GitHub, Kalender, Verbrauch | Abschnitte unter Werkzeuge | `works recur`, `works github`, `kalender.ics`, `works time` |

Verschieben im Detail:

| Ziel | Verhalten |
|---|---|
| In Arbeit | `works start`. Ist die Aufgabe blockiert, fragt das Board nach und startet nur nach Bestätigung mit `--force` |
| Erledigt | Prüfdialog der Definition of Done: automatische Punkte mit Ergebnis, manuelle Punkte zum Abhaken. Abschließen erst, wenn alle manuellen Punkte bestätigt sind. Fehlen automatische Punkte, nur mit Begründung, die im Verlauf landet |
| Verworfen | Nur mit Begründung |
| Aus Erledigt oder Verworfen zurück | Nur in eine offene Spalte und mit Begründung (`works reopen`) |
| Alle anderen | `works set status=...` |

Jeder Verlaufseintrag aus dem Board endet mit `[Board]`. So ist in der task.md und in der Aktivitätsliste erkennbar, was der Nutzer selbst geändert hat.

## Updates

Nach einem Plugin-Update stellt sich alles selbst auf die neue Version um:

| Stelle | Was passiert |
|---|---|
| Laufender Server | Prüft alle 30 Sekunden, ob eine neuere Version installiert ist (über `~/.claude/plugins/installed_plugins.json`, sonst die Plugin-Ordner). Ist sie bei zwei Prüfungen hintereinander gleich, startet er die neue Version auf demselben Port und beendet sich |
| Sessionstart | Der SessionStart Hook ersetzt Server mit veralteter Version, auch solche aus works-Versionen vor dieser Funktion, und erzeugt WORKS.md und eine vorhandene board.html neu |
| Offene Tabs | Erkennen die neue Version, merken sich Suche, Filter, geöffnete Aufgabe und Scrollposition und laden sich einmal neu. Ist gerade ein Text in Bearbeitung, wartet das Neuladen bis nach dem Speichern |
| board.html | Wird beim Sessionstart und nach jedem schreibenden Befehl mit der neuen Version erzeugt. Ein bereits geöffneter Tab der Datei muss von Hand neu geladen werden |

Die Version ist ein Hash über alle Skripte und Board-Dateien. Sie ändert sich also mit jedem Update, auch ohne Versionsnummer in plugin.json. Registriert wird der Server in `.works/server.json` (PID, Port, Version), Ausgaben landen in `.works/server.log`. Beide stehen in `.works/.gitignore` und werden dort bei Bedarf ergänzt.

Tabs, die mit einer works-Version ohne diese Funktion geöffnet wurden, kennen das automatische Neuladen noch nicht. Sie brauchen nach dem Update einmal F5.

## Claude arbeitet gerade

Solange Claude an einer Aufgabe arbeitet, zeigt der Kopf "Claude arbeitet an W-0003, seit 6 min" (Klick springt zur Karte). Die aktive Karte zeigt den aktuellen Schritt und die letzten drei, zum Beispiel "Bearbeitet src/backup.ts" oder "Befehl npm test", dazu den Knopf "Anweisung an Claude". Die Daten kommen aus dem PostToolUse Hook (`.works/activity.json`, lokal). Nach zehn Minuten ohne Werkzeugaufruf verschwindet die Anzeige.

Anweisungen landen in `.works/instructions.json` und als Kommentar an der Aufgabe. Claude bekommt sie beim nächsten Werkzeugaufruf als Kontext, spätestens am Ende der Antwort, und liest sie, wenn es sinnvoll ist. Bis dahin zeigt das Board "wartet".

## Rückgängig

Vor jeder Änderung aus dem Board sichert works die betroffenen Dateien in `.works/.undo/` (lokal, die letzten 50). Rückgängig stellt sie wieder her, holt archivierte Ordner zurück und entfernt Aufgaben, die erst durch die Änderung entstanden sind (sie landen in `.undo/entfernt/`). Änderungen von Claude oder aus dem Terminal laufen nicht über diesen Weg; dafür gibt es Git. `works undo --list` und `works undo <key>` machen dasselbe im Terminal.

## Kalender

`http://127.0.0.1:4747/kalender.ics` liefert Fälligkeiten, Meilensteine und Sprints als Kalender zum Abonnieren, mit `?recurring=1` auch kommende wiederkehrende Aufgaben. Im geteilten Modus gibt es dieselbe Adresse mit Leseschlüssel (`?key=`). Kalender im Internet wie Google Kalender erreichen den Rechner nicht; dafür `works ical --out termine.ics` und die Datei importieren.

## Alle Projekte

`works hub` startet auf Port 4740 eine Übersicht über alle Projekte, in denen works eingerichtet ist oder eine Sitzung lief (`~/.works/projects.json`). Je Projekt: offene Aufgaben, P1, Review, Überfälliges, Sprint oder nächster Meilenstein, was Claude gerade tut und ob das Board läuft. Oben stehen alle P1 über alle Projekte. "Board starten" startet das Board eines Projekts. `works hub --list` gibt dasselbe als Text aus. Die Übersicht ist nur auf diesem Rechner erreichbar.

## Für Claude wichtig

- Sagt der Nutzer, das Board sehe alt aus oder verhalte sich falsch, zuerst `works board --status`, dann `works board --restart` und den Nutzer bitten, einen Tab, der noch eine sehr alte Version zeigt, einmal neu zu laden.
- Vor jedem Edit an einer task.md die Datei neu lesen. Der Nutzer kann sie inzwischen im Board geändert haben.
- Aufgaben mit `source: board` und `incomplete: true` hat der Nutzer schnell angelegt. Bei passender Gelegenheit Ziel und Akzeptanzkriterien mit ihm klären.
- Offene Fragen, die der Nutzer im Board notiert, sind oft an Claude gerichtet. Beim Start einer solchen Aufgabe zuerst darauf eingehen.
- Die Warteschlange ist ein Auftrag des Nutzers. Beim Abarbeiten immer die oberste startbare Aufgabe nehmen und die Einstellungen `auto_next` und `ask_before` beachten.
- Beim Teilen den Leselink nennen, den Bearbeitungslink nur, wenn der Nutzer ausdrücklich danach fragt.
- Gibt der Nutzer eine Aufgabe in der Abnahme zurück, den Kommentar wie eine Vorgabe behandeln, umsetzen und mit `works comment` antworten.
- Eine Anweisung während der Arbeit nicht ignorieren, auch wenn sie nicht sofort passt. Spätestens nach dem aktuellen Schritt aufgreifen und kurz antworten.
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
- Beim Teilen (`--share`) bekommen nur lokale Anfragen ohne Proxy-Header automatisch volle Rechte. Alle anderen brauchen den Lese- oder Bearbeitungsschlüssel aus dem Link; er wird danach als HttpOnly-Cookie mitgeschickt. Lesende erhalten ein eigenes Token, mit dem der Server nur GET-Anfragen annimmt. Export und Freigabe-Einstellungen sind dem Besitzer vorbehalten. Prüfungen ausführen oder ändern und den Discord-Webhook setzen geht nur bei lokalen Anfragen, auch nicht mit dem Bearbeitungslink.
- Jede API-Anfrage braucht ein zufälliges Token, das bei jedem Serverstart neu erzeugt und nur in die ausgelieferte Seite eingebettet wird. Fremde Webseiten können es nicht lesen und deshalb nichts ändern. Ein abweichender Origin wird zusätzlich abgelehnt.
- Alle Eingaben werden geprüft (IDs, Werte, Längen, Bildtypen bis 20 MB) und als einzelne Argumente ohne Shell an das CLI übergeben.
- Ausgeliefert werden nur Board, Daten und Dateien unter `tasks/`, `archive/` und `reports/` sowie WORKS.md und ideas.md. config.json, state.json, share.json, activity.json, instructions.json, github.json und `.undo/` bleiben gesperrt.
- Git wird ohne Shell mit festen Argumenten und Zeitlimit aufgerufen, Diffs nur für Dateien, die zur Aufgabe gehören, und gekürzt auf 400 Zeilen.
- Temporäre Dateien liegen kurz in `.works/.tmp/` und werden sofort wieder gelöscht.
- HTML-Mockups aus `design/` laufen in einem iframe mit `sandbox="allow-scripts"` und eigener Content-Security-Policy. Sie haben keinen Zugriff auf das Board, seine Tokens oder Cookies und dürfen nicht in fremde Seiten eingebettet werden.
- GitHub-Abgleich und seine Einstellungen gehen nur bei lokalen Anfragen, weil sie über das gh CLI mit den Rechten des Nutzers handeln. Die Kalenderadresse braucht im geteilten Modus den Leseschlüssel.
- Die Projektübersicht `works hub` bindet nur an 127.0.0.1, prüft den Hostnamen und startet Boards nur mit einem Token aus der eigenen Seite.

## Meilensteine

Meilensteine fassen Aufgaben zu einem Ziel zusammen, etwa einem Release oder dem Livegang. Im Board erscheinen sie als Filter; mit gewähltem Meilenstein zeigt die Fortschrittsanzeige dessen Stand. Angelegt werden sie im Board oder mit `works milestone add M1 --title "Livegang" --due 2026-11-15`, zugeordnet im Detailpanel oder mit `works set <ID> milestone=M1`. Verworfene Aufgaben zählen nicht mit.

## Darstellung

Die Oberfläche liegt in `scripts/board/` (template.html, board.css, board.js) und wird mit der eingebetteten Schrift Geist (SIL Open Font License, siehe `scripts/board/fonts/Geist-LICENSE.txt`) zu einer einzigen HTML-Seite zusammengesetzt. Es werden keine externen Ressourcen geladen. Mit der Umgebungsvariable `WORKS_DEV=1` liest der Server die Dateien bei jedem Aufruf neu, praktisch beim Anpassen des Designs.
