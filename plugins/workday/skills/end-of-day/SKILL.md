---
name: end-of-day
description: Verwenden, wenn der Nutzer den Arbeitstag in einem Projekt beendet, etwa mit "Feierabend", "Schluss für heute", "wir machen morgen weiter", "für heute reicht's" oder "Board stoppen, morgen geht's weiter".
---

# Feierabend

Schließt den Tag so ab, dass der Skill good-morning am nächsten Tag ohne Rückfragen weitermachen kann: Übergaben für alles in Arbeit, Stand gesichert, Board aus, kurze Bilanz.

Braucht das works-Plugin. `works` steht unten für das works-CLI, aufgerufen wie im works-Skill beschrieben (Skill works:works), immer im Projektordner.

## Ohne works

Hat das Projekt kein `.works/`: sagen, dass Feierabend Übergaben und Board nur mit works kennt, offene Code-Änderungen nennen (`git status --short`) und anbieten, sie zu committen. Sonst nichts tun.

## Ablauf

Alle sechs Schritte, in dieser Reihenfolge:

1. **Stand erheben:** `works status`, `works list --status in-arbeit`, `works report --days 1` (nur lesen, ohne `--write`), `git status --short` und der aktuelle Branch.
2. **Übergabe je Aufgabe in Arbeit:** `works handoff <ID> --text "..."`. Inhalt jeder Übergabe:
   - was erledigt ist,
   - was offen ist,
   - der nächste konkrete Schritt (Datei, Funktion, Befehl),
   - offene Fragen an den Nutzer,
   - Branch und ob dort Code uncommittet liegt.

   Die aktive Aufgabe (aus `works status`) als letzte schreiben: `works handoff` macht die Aufgabe, deren Übergabe es schreibt, zur aktiven.
3. **Code nicht ungefragt committen:** Uncommittete Änderungen außerhalb von `.works` bleiben liegen und kommen in die Nachricht (Dateien, Branch).
4. **`.works` sichern:** Liefert `git ls-files .works` etwas, nur `.works` committen: `git add .works` und `git commit -m "works: Feierabend <Datum>"`. Nie pushen. Liegt `.works` nicht im Git, nichts committen.
5. **Board stoppen:** `works board --stop`.
6. **Nachricht an den Nutzer** in der Form unten.

## Nachricht

Kurz, in dieser Form:

- **Heute erledigt:** Aufgaben aus dem Tagesbericht, sonst "nichts abgeschlossen".
- **In Arbeit:** je Aufgabe ID, Titel und der nächste Schritt aus der Übergabe.
- **Wartet auf dich:** Aufgaben im Review und offene Fragen. Zeile weglassen, wenn nichts wartet.
- **Morgen zuerst:** eine Aufgabe mit einem Satz Begründung. Reihenfolge: die aktive Aufgabe, dann andere Aufgaben in Arbeit nach Priorität, dann die Warteschlange des Nutzers (`works queue`), dann `works next`.
- **Gesichert:** was committet wurde, was uncommittet liegen bleibt, Board gestoppt.

Liegen uncommittete Code-Änderungen vor, endet die Nachricht mit genau einer Frage: ob sie als Zwischenstand auf dem Branch committet werden sollen. Sonst endet sie ohne Frage.

## Häufige Fehler

| Fehler | Richtig |
|---|---|
| Übergabe nur für die aktive Aufgabe | Für jede Aufgabe mit Status in Arbeit |
| Aktive Aufgabe wechselt still | Ihre Übergabe als letzte schreiben |
| `.works` nicht gesichert, stattdessen nachgefragt | Committen, wenn `.works` im Git liegt |
| Gepusht | Nie pushen, auch nicht bei grünem Stand |
| Bilanz ohne Erledigtes | Tagesbericht lesen, Erledigtes nennen |
