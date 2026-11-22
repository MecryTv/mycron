# workday

Zwei Skills für Projekte mit [works](../works/README.md): Den Arbeitstag sauber abschließen und am nächsten Morgen ohne Suchen weitermachen.

## Installation

```
/plugin marketplace add MecryTv/mycron
/plugin install workday@mycron
```

Braucht das Plugin works (`/plugin install works@mycron`). Ohne `.works/` im Projekt sagen beide Skills Bescheid, statt etwas zu verändern.

## Feierabend (Skill end-of-day)

Auslöser: "Feierabend", "Schluss für heute", "wir machen morgen weiter".

- schreibt für jede Aufgabe in Arbeit eine Übergabe (was erledigt ist, was offen ist, nächster Schritt, offene Fragen, Branch)
- speichert den Tagesbericht in `.works/reports/`
- committet `.works`, wenn es im Git liegt, pusht aber nie und lässt Code-Änderungen unangetastet
- nennt Zweige mit Commits, die noch nicht auf dem Remote sind, und fragt, ob gepusht werden soll
- räumt auf, was Claude im Hintergrund gestartet hat (Test-Server, Superpowers-Begleiter), und stoppt das Live-Board
- fasst zusammen: heute erledigt, in Arbeit, wartet auf dich, morgen zuerst, Verbrauch von heute (Tokens, Kosten)

## Guten Morgen (Skill good-morning)

Auslöser: "Guten Morgen", "weiter wie gestern", "wo waren wir stehen geblieben".

- liest Übergaben und Stand von gestern
- prüft mit ci-watch, ob die CI des letzten Pushes grün war; rot kommt vor allem anderen
- nennt Fälliges: überfällige und heute fällige Aufgaben, nahe Meilensteine, wiederkehrende Aufgaben
- bietet Updates deiner Plugins an, wenn der Marketplace neuer ist
- startet das Live-Board und öffnet es im Browser, wenn es noch in keinem Tab offen ist
- zeigt Entwürfe, die auf deine Wahl warten, als Screenshots im Superpowers-Begleiter (braucht die Plugins mockups und superpowers)
- nennt, womit es weitergeht, und fängt an, wenn du das schon gesagt hast ("mach weiter wie gestern")
