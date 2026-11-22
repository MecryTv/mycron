---
name: good-morning
description: Verwenden, wenn der Nutzer einen neuen Arbeitstag in einem Projekt beginnt oder nach einer Pause wieder einsteigt, etwa mit "Guten Morgen", "weiter wie gestern", "mach weiter wie besprochen", "setz das um wie gestern besprochen" oder "wo waren wir stehen geblieben".
---

# Guten Morgen

Gegenstück zum Skill end-of-day: liest den Stand von gestern, startet das Board und macht dort weiter, wo die Übergabe aufgehört hat.

Braucht das works-Plugin. `works` steht unten für das works-CLI, aufgerufen wie im works-Skill beschrieben (Skill works:works), immer im Projektordner.

## Ohne works

Hat das Projekt kein `.works/`: Branch, letzte Commits (`git log --oneline -5`) und `git status --short` nennen und fragen, woran es weitergehen soll.

## Ablauf

1. **Stand lesen**, nur mit diesen Befehlen: `works status`, `works queue`, `works list --status in-arbeit`, `works list --status review`, je Aufgabe in Arbeit `works handoff <ID>`, `works list --overdue`, `works list --json` (nur für Fälligkeiten), `works milestone list`, `works recur list`, `git status --short`, der aktuelle Branch und `git rev-parse @{u}` (letzter gepushter Commit). Die task.md nur von der Aufgabe lesen, mit der es weitergeht.
2. **CI des letzten Pushes:** Zeigt `origin` auf GitHub und gibt es den Skill ci-watch (ci-watch:ci-watch), dessen Skript für den Commit aus `git rev-parse @{u}` mit `--sha <commit> --grace 0` im Hintergrund starten und weitermachen. Das Ergebnis in die Nachricht nehmen; kommt es erst danach, nachreichen. Bei „kein Lauf“ den Grund in ein paar Worten nennen, wie ci-watch es beschreibt (der Commit trifft die Pfade oder Branches der Workflows nicht). Ohne Upstream, ohne GitHub oder ohne ci-watch: Schritt auslassen.
3. **Weiter mit:** die aktive Aufgabe, sonst die Aufgabe in Arbeit mit der höchsten Priorität, sonst die erste startbare Aufgabe der Warteschlange, sonst `works next`. Angefangenes geht vor: Die Warteschlange gilt für die Zeit danach. Ist die CI des letzten Pushes rot, geht sie allem vor: Heute zuerst ist dann, den roten Schritt anzusehen (als Angebot, nicht ungefragt reparieren).
4. **Übergabe gegen das Repo prüfen:** Gibt es den Branch aus der Übergabe? Gibt es die genannten Dateien? Weicht etwas ab, nicht raten, sondern die Abweichung in der Nachricht nennen.
5. **Plugin-Updates:** `claude plugin marketplace update`, dann `claude plugin list --json`. Je installiertem Plugin die Version mit dem Stand seines Marketplace vergleichen: Ist die Version ein gekürzter Commit-Hash (Plugins ohne eigene Versionsnummer), liefert den Stand `git -C ~/.claude/plugins/marketplaces/<marketplace> rev-parse --short=12 HEAD`. Plugins mit Versionsnummer (etwa 1.4.0) so nicht vergleichen. Weicht er ab, das Update unter Wartet auf dich anbieten (`claude plugin update <plugin>@<marketplace>`). Marketplaces ohne Git-Ordner lassen sich so nicht vergleichen: auslassen, nicht raten. Nicht ungefragt aktualisieren.
6. **Board starten:** `works board --serve --detach --open`. Der Befehl öffnet den Browser selbst, aber nur, wenn das Board dort noch in keinem Tab offen ist. Nicht von Hand nachöffnen. Meldet er „Live-Board läuft bereits“ ohne die Zeile „Im Browser geöffnet“ oder „schon in einem Browser-Tab offen“, ist das works-Plugin älter: dann die URL selbst öffnen (Windows `Start-Process <url>`, macOS `open <url>`, Linux `xdg-open <url>`).
7. **Entwürfe ohne Wahl zeigen:** Nennt `works status` Aufgaben mit Entwürfen ohne Wahl, die Varianten als Screenshots im Superpowers-Begleiter zeigen:
   - Screenshots mit dem Skill mockups (mockups:mockups): `shots` auf die HTML-Dateien in `design/` der Aufgabe, je Variante 1440 hell und 390 dunkel, mit `--out` direkt in den content-Ordner des Begleiters. Nie in `design/` oder sonst in `.works` ablegen, sonst landen die Bilder im Git. Varianten, die schon Bilder sind, in den content-Ordner kopieren.
   - Den Begleiter starten, wie der Skill superpowers:brainstorming in `visual-companion.md` beschreibt, vorher in einem Satz sagen, dass sich ein Browser-Tab öffnet. Eine Seite mit einer Karte je Variante zum Anklicken, die Bilder über `/files/`, je Aufgabe ein Abschnitt.
   - Die Wahl des Nutzers danach mit `works design choose <ID> <Variante> --reason "..."` festhalten.
   - Fehlt mockups oder Superpowers: auf den Board-Reiter Entwürfe verweisen.
8. **Anfangen oder fragen:**
   - Hat der Nutzer ausdrücklich gesagt weiterzumachen ("mach weiter", "setz um wie besprochen"), blockiert keine offene Frage den nächsten Schritt und passt die Übergabe zum Repo: `works start <ID>`, auf den Branch der Aufgabe wechseln und mit dem nächsten Schritt aus der Übergabe beginnen. Die Nachricht kommt dann vorweg, ohne Frage.
   - Sonst: Nachricht schicken und auf die Antwort warten.

## Nachricht

Kurz, in dieser Form:

- **Gestern:** je Aufgabe in Arbeit ein Satz aus der Übergabe, dazu die CI des letzten Pushes in einem Halbsatz (grün, rot, kein Lauf, läuft noch).
- **Heute zuerst:** die Aufgabe aus Schritt 3 und ihr nächster Schritt.
- **Fällig:** überfällige und heute fällige Aufgaben, Meilensteine mit Termin in den nächsten sieben Tagen, wiederkehrende Aufgaben mit Termin heute. Zeile weglassen, wenn nichts fällig ist.
- **Board:** die URL, dazu die URL des Begleiters, wenn Entwürfe offen sind.
- **Wartet auf dich:** rote CI (Job und Schritt), Entwürfe ohne Wahl, Plugin-Updates, offene Fragen, Aufgaben im Review, Abweichungen aus Schritt 4. Zeile weglassen, wenn nichts wartet.

Fängst du nicht an, endet die Nachricht mit den Fragen, die dich blockieren, nummeriert, höchstens drei. Keine Liste der ausgeführten Befehle, keine Nacherzählung von Dateiinhalten.

## Häufige Fehler

| Fehler | Richtig |
|---|---|
| Alle Dateien und Logs durchsuchen | Nur die Befehle aus Schritt 1 |
| Trotz "mach weiter" nur Fragen stellen | Anfangen, wenn nichts blockiert |
| Fehlenden Branch oder fehlende Datei übergehen | Abweichung nennen, nicht raten |
| Board vergessen oder nur die URL nennen | Starten und im Browser öffnen |
| Auf die CI warten, bevor die Nachricht kommt | Im Hintergrund prüfen, Ergebnis nachreichen |
| Plugins ungefragt aktualisiert | Nur anbieten |
| Entwürfe nur erwähnt | Im Begleiter zeigen, Wahl mit `works design choose` festhalten |
| Lange Nachricht mit allen Details | Die Zeilen aus der Form |
