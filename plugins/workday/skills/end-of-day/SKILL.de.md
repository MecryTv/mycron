---
name: end-of-day
description: Verwenden, wenn der Nutzer den Arbeitstag in einem Projekt beendet, etwa mit "Feierabend", "Schluss für heute", "wir machen morgen weiter", "für heute reicht's" oder "Board stoppen, morgen geht's weiter".
---

> Deutsche Fassung. Sie gilt, wenn die Sprache Deutsch ist (`works lang`). Die englische Fassung steht in SKILL.md.

# Feierabend

Schließt den Tag so ab, dass der Skill good-morning am nächsten Tag ohne Rückfragen weitermachen kann: Übergaben für alles in Arbeit, Stand gesichert, Board aus, kurze Bilanz.

Braucht das works-Plugin. `works` steht unten für das works-CLI, aufgerufen wie im works-Skill beschrieben (Skill works:works), immer im Projektordner.

## Ohne works

Hat das Projekt kein `.works/`: sagen, dass Feierabend Übergaben und Board nur mit works kennt, offene Code-Änderungen nennen (`git status --short`) und anbieten, sie zu committen. Sonst nichts tun.

## Ablauf

Alle neun Schritte, in dieser Reihenfolge:

1. **Stand erheben:** `works status`, `works list --status in-arbeit`, `works report --days 1`, `works time --today` (Verbrauch von heute), `git status --short` und der aktuelle Branch.
2. **Übergabe je Aufgabe in Arbeit:** `works handoff <ID> --text "..."`. Inhalt jeder Übergabe:
   - was erledigt ist,
   - was offen ist,
   - der nächste konkrete Schritt (Datei, Funktion, Befehl),
   - offene Fragen an den Nutzer,
   - Branch und ob dort Code uncommittet liegt.

   Die aktive Aufgabe (aus `works status`) als letzte schreiben: `works handoff` macht die Aufgabe, deren Übergabe es schreibt, zur aktiven.
3. **Code nicht ungefragt committen:** Uncommittete Änderungen außerhalb von `.works` bleiben liegen und kommen in die Nachricht (Dateien, Branch).
4. **Tagesbericht speichern:** `works report --days 1 --write`, die Ausgabe nennt die Datei in `.works/reports/`.
5. **`.works` sichern:** Liefert `git ls-files .works` etwas, nur `.works` committen: `git add .works` und `git commit -m "works: Feierabend <Datum>"`. Nie pushen. Liegt `.works` nicht im Git, nichts committen.
6. **Nicht Gepushtes ermitteln:** `git for-each-ref --format="%(refname:short) %(upstream:short) %(upstream:track)" refs/heads`. Zweige mit `ahead` haben Commits, die noch nicht auf dem Remote sind, der Feierabend-Commit aus Schritt 5 meist mit dabei. Zweige ohne Upstream zählen mit, wenn `git log --oneline origin/HEAD..<zweig>` etwas liefert (der Hauptbranch des Remotes; ein lokaler `main` muss nicht existieren). Nichts pushen, nur in die Nachricht nehmen.
7. **Hintergrund aufräumen:** Was du in dieser Sitzung im Hintergrund gestartet hast und nicht mehr gebraucht wird, beenden: Test-Server (etwa ein Board aus einer Kopie auf einem anderen Port), Watcher, laufende Hintergrund-Befehle. Laufende Superpowers-Begleiter finden sich als Ordner unter `.superpowers/brainstorm/` mit `state/server-info` und ohne `state/server-stopped`; beenden mit `stop-server.sh <Sitzungsordner>` aus dem Skill superpowers:brainstorming. Prozesse, die der Nutzer selbst gestartet hat, und Programme wie Docker Desktop nicht anfassen.
8. **Board stoppen:** `works board --stop`.
9. **Nachricht an den Nutzer** in der Form unten.

## Nachricht

Kurz, in dieser Form:

- **Heute erledigt:** Aufgaben aus dem Tagesbericht, sonst "nichts abgeschlossen".
- **In Arbeit:** je Aufgabe ID, Titel und der nächste Schritt aus der Übergabe.
- **Wartet auf dich:** Aufgaben im Review und offene Fragen. Zeile weglassen, wenn nichts wartet.
- **Morgen zuerst:** eine Aufgabe mit einem Satz Begründung. Reihenfolge: die aktive Aufgabe, dann andere Aufgaben in Arbeit nach Priorität, dann die Warteschlange des Nutzers (`works queue`), dann `works next`.
- **Verbrauch heute:** Tokens und geschätzte Kosten aus `works time --today`.
- **Gesichert:** was committet wurde, der gespeicherte Tagesbericht, was uncommittet liegen bleibt, welche Zweige wie viele Commits vor dem Remote liegen, was aufgeräumt wurde, Board gestoppt.

Die Nachricht endet mit höchstens zwei nummerierten Fragen, nur wenn es den Anlass gibt: ob uncommittete Code-Änderungen als Zwischenstand auf dem Branch committet werden sollen, und ob die nicht gepushten Commits gepusht werden sollen. Sonst endet sie ohne Frage.

## Häufige Fehler

| Fehler | Richtig |
|---|---|
| Übergabe nur für die aktive Aufgabe | Für jede Aufgabe mit Status in Arbeit |
| Aktive Aufgabe wechselt still | Ihre Übergabe als letzte schreiben |
| `.works` nicht gesichert, stattdessen nachgefragt | Committen, wenn `.works` im Git liegt |
| Gepusht | Nie pushen, auch nicht bei grünem Stand; nur nennen und fragen |
| Bilanz ohne Erledigtes | Tagesbericht lesen, Erledigtes nennen |
| Tagesbericht nur gelesen | Mit `--write` speichern |
| Prozesse des Nutzers beendet | Nur beenden, was du in dieser Sitzung gestartet hast |
