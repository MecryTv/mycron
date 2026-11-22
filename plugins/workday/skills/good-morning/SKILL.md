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

1. **Stand lesen**, nur mit diesen Befehlen: `works status`, `works queue`, `works list --status in-arbeit`, `works list --status review`, je Aufgabe in Arbeit `works handoff <ID>`, `git status --short` und der aktuelle Branch. Die task.md nur von der Aufgabe lesen, mit der es weitergeht.
2. **Weiter mit:** die aktive Aufgabe, sonst die Aufgabe in Arbeit mit der höchsten Priorität, sonst die erste startbare Aufgabe der Warteschlange, sonst `works next`. Angefangenes geht vor: Die Warteschlange gilt für die Zeit danach.
3. **Übergabe gegen das Repo prüfen:** Gibt es den Branch aus der Übergabe? Gibt es die genannten Dateien? Weicht etwas ab, nicht raten, sondern die Abweichung in der Nachricht nennen.
4. **Board starten:** `works board --serve --detach --open`. Der Befehl öffnet den Browser selbst, aber nur, wenn das Board dort noch in keinem Tab offen ist. Nicht von Hand nachöffnen. Meldet er „Live-Board läuft bereits“ ohne die Zeile „Im Browser geöffnet“ oder „schon in einem Browser-Tab offen“, ist das works-Plugin älter: dann die URL selbst öffnen (Windows `Start-Process <url>`, macOS `open <url>`, Linux `xdg-open <url>`).
5. **Anfangen oder fragen:**
   - Hat der Nutzer ausdrücklich gesagt weiterzumachen ("mach weiter", "setz um wie besprochen"), blockiert keine offene Frage den nächsten Schritt und passt die Übergabe zum Repo: `works start <ID>`, auf den Branch der Aufgabe wechseln und mit dem nächsten Schritt aus der Übergabe beginnen. Die Nachricht kommt dann vorweg, ohne Frage.
   - Sonst: Nachricht schicken und auf die Antwort warten.

## Nachricht

Kurz, in dieser Form:

- **Gestern:** je Aufgabe in Arbeit ein Satz aus der Übergabe.
- **Heute zuerst:** die Aufgabe aus Schritt 2 und ihr nächster Schritt.
- **Board:** die URL.
- **Wartet auf dich:** offene Fragen, Aufgaben im Review, Abweichungen aus Schritt 3. Zeile weglassen, wenn nichts wartet.

Fängst du nicht an, endet die Nachricht mit den Fragen, die dich blockieren, nummeriert, höchstens drei. Keine Liste der ausgeführten Befehle, keine Nacherzählung von Dateiinhalten.

## Häufige Fehler

| Fehler | Richtig |
|---|---|
| Alle Dateien und Logs durchsuchen | Nur die Befehle aus Schritt 1 |
| Trotz "mach weiter" nur Fragen stellen | Anfangen, wenn nichts blockiert |
| Fehlenden Branch oder fehlende Datei übergehen | Abweichung nennen, nicht raten |
| Board vergessen oder nur die URL nennen | Starten und im Browser öffnen |
| Lange Nachricht mit allen Details | Die vier Zeilen aus der Form |
