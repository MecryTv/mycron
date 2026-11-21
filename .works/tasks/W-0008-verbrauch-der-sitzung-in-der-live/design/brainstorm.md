# Brainstorming W-0006 bis W-0009

Ein gemeinsamer Entwurf, weil alle vier Punkte in der Live-Ansicht landen und sich den Platz teilen.

## W-0007 Freigabe (zu entscheiden: A oder B)
- Auslöser: neuer PermissionRequest-Hook, gibt nichts aus, setzt nur den Wartezustand in activity.json.
- Ende: PreToolUse, PostToolUse, Stop, UserPromptSubmit oder Zeitlimit. Eine Ablehnung meldet kein Hook, deshalb das Zeitlimit.
- A Kacheln: erste Kachel und Jetzt-Box gelb mit Befehl, Freigabe als erster Punkt in „Wartet auf dich", gelber Punkt am Reiter, „Freigabe" im Fenstertitel.
- B Hinweisband: wie A plus Band über der ganzen Ansicht. Auffälliger, schiebt aber alles nach unten.
- Browser-Benachrichtigung bei beiden nur auf Wunsch, Knopf in der Jetzt-Box.
- Empfehlung A: Die Kachel ist ohnehin das Erste, was man ansieht, und das Band würde bei jeder Freigabe das Layout springen lassen.

## W-0008 Verbrauch (zu entscheiden: A oder B)
- A: Zeile „Verbrauch heute" in der Kachel Fortschritt, Stand der Aufgabe im Kopf der Mitte. Kein neuer Platz nötig.
- B: fünfte Kachel mit Kosten, Tokens und Balken je Aufgabe. Macht alle Kacheln schmaler.
- Empfehlung A.

## W-0006 Erneut prüfen
- Knopf an jeder Fehlergruppe, an jeder roten Zeile und einer für alle Fehlschläge (ab zwei).
- Es laufen nur die roten Prüfungen, grüne Ergebnisse bleiben stehen. Nutzt checksRun mit only.

## W-0009 Wackelig und Laufzeit
- checks.json merkt sich je Prüfung die letzten 5 Ergebnisse mit Dauer.
- Wackelig: in den letzten 5 Läufen mindestens ein Erfolg und mindestens zwei Fehlschläge.
- Langsamer: Dauer mindestens 1,5 mal der Median der Läufe davor und mindestens 5 s mehr.
- Zeilen zeigen rechts nur noch die Dauer, der Zustand steckt im Symbol (für Screenreader als versteckter Text).
