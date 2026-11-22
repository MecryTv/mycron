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
- committet `.works`, wenn es im Git liegt, pusht aber nie und lässt Code-Änderungen unangetastet
- stoppt das Live-Board
- fasst zusammen: heute erledigt, in Arbeit, wartet auf dich, morgen zuerst

## Guten Morgen (Skill good-morning)

Auslöser: "Guten Morgen", "weiter wie gestern", "wo waren wir stehen geblieben".

- liest Übergaben und Stand von gestern
- startet das Live-Board und öffnet es im Browser
- nennt, womit es weitergeht, und fängt an, wenn du das schon gesagt hast ("mach weiter wie gestern")
