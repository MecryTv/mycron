---
id: W-0050
title: "Discord: Nachrichten nach 10 s löschen, Verlauf im Dashboard"
type: feature
priority: P2
status: in-arbeit
effort: M
risk:
created: 2026-11-24
updated: 2026-11-25
due:
completed:
milestone:
branch: feature/w-0050-discord-nachrichten-nach-10-s
tags: [discord]
blocked_by: [W-0041]
blocks: []
related: []
source: manuell
incomplete: false
---

# Discord: Nachrichten nach 10 s löschen, Verlauf im Dashboard

## Ziel
<!-- Was ist nach Abschluss anders? Ein bis drei Sätze, aus Sicht des Ergebnisses formuliert. -->

## Beschreibung
Wunsch des Nutzers am 2026-11-24: Nachrichten sollen nicht erst nach 24 h, sondern nach etwa 10 Sekunden gelöscht werden, deutlich schneller als bisher (W-0044). Dazu ein Verlauf zum Nachschauen. Entscheidungen des Nutzers: Nachrichten, die auf ihn warten (Freigabe, Review mit Knöpfen, Frage von Claude), bleiben stehen, bis sie erledigt sind, und verschwinden 10 s danach; alles andere außer dem Dashboard nach 10 s. Der Verlauf liegt hinter einem Knopf Verlauf im Dashboard und dem Befehl /works verlauf (englisch /works history), nur für ihn sichtbar, nach Projekt filterbar; der Kanal selbst bleibt leer. Standard der Frist wird 10 s, weiter einstellbar (Einheit Sekunden statt nur Stunden). Gestaltung des Verlaufs vorher als Entwurf zeigen. Priorität P2, direkt nach W-0041 (das gerade die Discord-Dateien übersetzt), vor W-0049.

## Kontext und Problem
<!-- Warum ist das nötig? Aktueller Zustand, Auslöser, Einschränkungen. -->

## Nutzerperspektive
<!-- Wer profitiert und wie? Optional: Als <Rolle> möchte ich <Fähigkeit>, damit <Nutzen>. -->

## Akzeptanzkriterien
- [x] Je Aufgabe genau eine Nachricht (Karte nach Entwurf I3), die bei jedem Schritt bearbeitet wird: Start, Frage, Freigabe, fertig und wartet, Review, zurückgegeben, erledigt, Auslieferung (Wunsch des Nutzers vom 2026-11-24, ersetzt „nach 10 s löschen“)
- [x] Braucht die Karte den Nutzer (Freigabe, Frage, Review, fertig und wartet), kommt sie als neue Nachricht nach unten, damit Discord benachrichtigt; die alte Fassung wird gelöscht
- [x] Karten bleiben, solange die Aufgabe offen ist, und verschwinden nach der Frist ab Erledigung; Nachrichten ohne Aufgabe nach der Frist ab Senden
- [x] Knopf Verlauf im Discord-Panel (der angehefteten Dashboard-Nachricht nach D3, neben Warteschlange, Anweisung an Claude, Neue Aufgabe, Hilfe) und /works verlauf zeigen die letzten Nachrichten nur dem Aufrufer, nach Projekt filterbar
- [x] Der Verlauf übersteht einen Neustart des Bots und ist begrenzt (Anzahl oder Alter)
- [x] Frist einstellbar in Sekunden (Dialog im Board, works discord set), Standard 1 Std. (3600 s)
- [ ] Geht beim eigenen und beim gemeinsamen Bot, Tests ohne echtes Discord, auch ohne WebSocket
- [x] Panel-Text nach Entwurf P2: Zusammenfassung oben (wartet, arbeitet, heute erledigt, Kosten), Zeile je Projekt mit Ampel, Zustand und Aufgabe, darunter Als Nächstes
- [x] Panel-Bild nach P2: Fortschritt mit Ampel und Aufgabe je Balken, letzte 24 Stunden je Projekt als Spur (ein Punkt je Nachricht in der Farbe ihrer Art), Woche mit heute hervorgehoben
- [x] Verlauf-Ansicht nach P2: Einträge mit Symbol, Projekt, Text und relativer Zeit, Eintrag ansehen mit allen Feldern, Filter Projekt und Zeitraum, Ältere

## Umsetzungsplan
<!-- Konkrete Schritte in sinnvoller Reihenfolge. Unteraufgaben gehören hierher, nicht in eigene Ordner. -->
- [x] Frist in Sekunden: cleanup.seconds (Standard 3600, 0 nie) statt cleanup.hours in discord.mjs (DEFAULTS, normalizeConfig, works discord set, Liste der Schlüssel), Bot cleanup() und prune(), Board-Dialog (Feld in Sekunden), Tests zuerst
- [x] Karte je Aufgabe: Ereignisse mit Aufgaben-ID (neues Ereignis start beim Wechsel auf in Arbeit, perm, idle mit Aufgabe, question, review, returned, done, ship, p1) laufen in upsert() in eine Karte card:<rid>:<id> mit Einträgen je ursprünglichem Schlüssel; Zustand aus dem jüngsten offenen Eintrag; neue wartende Einträge senden die Karte neu (alte löschen, Erwähnung wie bisher je Ereignis); Knöpfe Annehmen und Zurückgeben im Review wie bisher
- [x] Kartenbild nach Entwurf I3 (der Nutzer fand I4 schlechter): Zeitachse der Aufgabe mit Uhrzeiten, rechts Minuten, Schritte, Kriterien, Legende; Bild bei Ereignissen neu, sonst höchstens alle 5 Minuten
- [x] Verlauf speichern: jede gesendete oder bearbeitete Nachricht als Eintrag (Schlüssel, Projekt, Art, Zeit, Ereignis) in state.history, neueste Fassung je Schlüssel, höchstens 7 Tage und 300 Einträge, übersteht Neustart
- [x] Verlauf zeigen: Knopf Verlauf (w:hist) im Dashboard und /works verlauf (history) mit Option project, nur für den Aufrufer; Liste mit Symbol je Art, Projekt, Text, relativer Zeit; Auswahl „Eintrag ansehen“ holt die Nachricht mit allen Feldern; Auswahl Projekt und Zeitraum (24 Std., 3 Tage, 7 Tage), Knopf Ältere; custom_ids passen zu CID_RE (Dienst des gemeinsamen Bots)
- [x] Panel-Text nach P2: Zusammenfassung oben, Zeile je Projekt mit Ampel, Zustand, Werkzeug bei Freigabe und Aufgabe, Feld Als Nächstes; Kosten in der Zusammenfassung nur mit privacy.costs
- [x] Panel-Bild nach P2: Ampel und Aufgabe je Balken, Abschnitt LETZTE 24 STUNDEN mit Spur je Projekt aus state.history (Farbe nach Art), Woche einfarbig mit heute hervorgehoben und Summe
- [ ] Doku (integrations.md, cli.md, beide Sprachen), Hilfe im Discord, Katalog de.json; Selbsttest mit und ohne WebSocket, Dienst-Test

## Betroffene Dateien
<!-- Pfade mit kurzer Notiz, was dort passiert. -->

## Designentscheidungen
<!-- Kurzfassung der wichtigsten Entscheidungen. Details in decisions.md (works decisions <ID>). -->

## Assets
<!-- Wird über `works asset` gepflegt. Jedes Bild hat eine Beschreibungszeile. -->

## Offene Fragen
<!-- Fragen an den Nutzer, die Claude nicht selbst klären kann. Format: - [ ] Frage -->

## Übergabe
Stand: 2026-11-24 22:51

Stand: Noch kein Code geändert, Worktree sauber, daher kein wip-Commit. Gelesen und durchgeplant: discord-bot.mjs, discord-image.mjs, discord-ui.mjs, discord.mjs, discord-fake.mjs, services/works-bot/server.mjs, Discord-Schritte in selftest.mjs, Entwürfe I3 und P2. Kartenbild nach Nutzerkorrektur: I3 (nicht I4), 640 px, Aussehen wie I3, Farben aus I3 (Grund 0x1e1f2a, Spur 0x262938, Raster 0x343748, Text 0xe9eaf2, gedämpft 0x9aa0b8).

Tests: Ausgangslage des Branches mit --only "init, new, list|Discord|Sprache": 20 von 20 grün, 113 s.

Plan für die Umsetzung (alles offen, Reihenfolge wie Umsetzungsplan):
1. discord.mjs: DEFAULTS.cleanup={seconds:3600}; normalizeConfig setzt cleanup nur aus seconds (hours verworfen); applySetting cleanup.seconds ganzzahlig 0..2592000, leer ablehnen; Liste in der Fehlermeldung; EVENT_GROUPS results um start vorn; eventNames start: tr('Task started'). board.js dcValues/num auf cleanup.seconds (Einheit tr('seconds, 0 never')), de.json ergänzen, alte hours-Texte raus. Bot cleanup()/prune() auf Sekunden. Tests: W-0038-Schritt (cleanup.seconds 12 statt hours), W-0044-Schritt (cleanup.seconds=2 statt hours=0.0005, finally 3600), Einheit: normalizeConfig({cleanup:{hours:5}}) ergibt seconds 3600.
2. Karte: in discord-bot.mjs Konstanten CARD (start, perm, idle, question, review, returned, done, p1, ship), WAITS (perm, idle, question, review), waiting(ev). upsert(): remember() für den Verlauf; hat ev.id und Typ in CARD und gibt es noch keine Einzelnachricht msgs[key] (alte Nachrichten laufen so weiter), dann state.cards['card:rid:id'].entries[key] = {...ev, t0: prev.t0||since||started||at, u: Date.now()}, höchstens 40 Einträge; Queue-Eintrag {key: cardKey, card: true, resend}, resend = neuer wartender Eintrag (OR mit altem Queue-Eintrag). flush(): Karte aus state.cards rendern, bei resend erst alte Nachricht mit remove() löschen, dann neu posten; Bild immer als works.png mitschicken (attachments [{id:0}]); Hash des Körpers in msgs[key].h, gleiche Fassung nicht erneut patchen; done = cardWaits() ? 0 : jetzt. cardWaits: offener wartender Eintrag oder Aufgabe im Snapshot in OPEN_STATUSES. cleanup(): Karten ohne Warten bekommen done; beim Löschen auch state.cards und Bild-Cache weg. prune(): wartende Karten behalten, Karten ohne msgs und ohne Queue löschen. diffTasks: start bei Wechsel auf in-arbeit, nicht aus review oder in-arbeit; review-Auflösung mit until. renderEvent und RECENT um start. Zustand der Karte: Eintrag mit größtem u unter den offenen wartenden, sonst größtes u insgesamt; Aufgabe erledigt/verworfen ohne offenen Eintrag überschreibt (außer ship). renderCard(card, cfg, {owner, interactive, lang, task:{title,status,steps,crit,cost}}) exportieren: author Projekt, Titel (✓ bei erledigt) ID+Titel, Beschreibung Ampel-Emoji und fette Zustandszeile, Bild attachment://works.png, Fußzeile (Freigeben in Claude Code / Kosten · Abnehmen … / Minuten · Kosten · verschwindet in …), Knöpfe acc/ret bei offenem Review, ins bei idle, Commit-Link aus ship; Erwähnung wie renderEvent (Text perm/idle/question, cfg.events[type].at, Ruhezeit). tasksPart: steps = checkboxes(getSection(body,'Umsetzungsplan')) je Aufgabe. snapshotOf: today.value und today.currency für die Kostensumme.
3. discord-image.mjs: raster(h, w=W), text(..., k=S), width(s,k), png(px,h,w); cardPng({start,end,events:[{at,until,color}],right:['18 MIN','SCHRITTE 3/5','KRITERIEN 2/5'],legend}) nach I3: Spur links mit 1/6-Raster, Quadrate 12 px, Wartestrich 4 px bis Antwort (offen bis jetzt), Uhrzeiten darunter (erste, letzte, Mitte nur mit Platz), rechte Spalte (erste Zeile Schrift 3x), Legende START/SHIP blau, WARTET AUF DICH orange, TESTS/REVIEW grün. Bot: cardImageData(); Bild bei Ereignis (Signatur der Einträge) sofort, sonst höchstens alle 5 Min (CARD_IMAGE_MIN fest 300000, auch im FAST-Takt, sonst schreibt der Bot state.json dauernd und der Test 'state.json ohne Änderung' fällt); refreshCards() im tick nur für aktive Karten (offener Eintrag oder Aufgabe in-arbeit/review).
4. Verlauf: state.history [{k, rid, at, ev}], neueste Fassung je Schlüssel, sortiert nach at, 7 Tage und 300 Einträge, mit state.json gespeichert (emptyState um cards, history). historyView(cfg,t,{rid,range,page}) mit custom_ids w:histv:<rid>:d-0 (Optionen value = sha1(k) 12 Zeichen), w:histp::d-0 (Projekt, value all oder rid), w:histr:<rid>:d-0 (d/t/w), Knöpfe w:hist:<rid>:d-1 Ältere und Neuere; 10 Einträge je Seite, Zeile: Symbol je Typ, Projekt, Zusammenfassung (Titel aus renderEvent), <t:R>. historyEntry: renderEvent ohne Knöpfe und ohne content, mit timestamp. In act() vor pick(): sub history (Option project) und alle hist*-Aktionen. discord-ui.mjs: commands() um history/verlauf mit project (am Ende, Tests erwarten dann help,status,tasks,new,instruct,history und 6 Optionen), helpMessage Zeile und Knöpfe-Text.
5. Panel P2: stateOf mit Werkzeug und Aufgaben-ID ohne Titel, projectLineOf ohne Fortschritt; renderDashboard: fette Zusammenfassung (N warten auf dich · N arbeitet · heute N erledigt · Kostensumme nur mit privacy.costs), nur Feld Als Nächstes, Knopf Verlauf w:hist:: vor Hilfe. Tests anpassen: Feld Heute → Als Nächstes, Sprachtest fields[0] 'Up next'.
6. Panel-Bild: dashImageData(list, t, history, now) mit Ampel je Projekt (orange/grün/grau), Aufgabe rechts am Balken (Balken 236 px), Spuren LETZTE 24 STUNDEN aus history (Zeitfenster auf 5 Min gerundet, damit der Hash stabil bleibt), Legende darunter, Woche einfarbig 0x216944 mit heute 0x23a55a, weißem Rand und HEUTE, Summe rechts. dashboardPng zeichnet in ein großes Raster und schneidet unten ab.
7. Selbsttest-Anpassungen: Helfer cardOf(id) und cardSays(id, re) (Titel beginnt mit ID, Zustand in der Beschreibung); Schritte Ereignisse, ship, Branch-Wechsel (p1Msgs über Beschreibung, Bahn-Freigabe als Karte, done-Eintrag in state.json statt Titel prüfen), Befehle und Knöpfe, W-0044 umschreiben; neuer Schritt Verlauf (Knopf, /works verlauf, Auswahl Projekt/Zeitraum/Eintrag, Neustart). services/works-bot/test.mjs prüfen, ob Befehlszahl oder Titel betroffen sind.
8. Doku integrations.md und cli.md (beide Sprachen): cleanup.seconds, Karte je Aufgabe, Verlauf; /works verlauf beim gemeinsamen Bot erst nach Neustart des Dienstes. Board-Vorschau bleibt bei renderEvent (als offener Punkt nennen).

Nächster konkreter Schritt: discord.mjs DEFAULTS/normalizeConfig/applySetting auf cleanup.seconds samt Test im W-0046-Schritt, dann Bot cleanup().

## Verlauf
- 2026-11-24: Aufgabe angelegt
- 2026-11-24: Beziehung: blocked-by W-0041
- 2026-11-24: Nutzer am 2026-11-24: Knopf Verlauf auch im Discord-Panel (Dashboard-Nachricht in Discord)
- 2026-11-24: Entwurf V1 „Liste, neueste zuerst“ angehängt
- 2026-11-24: Entwurf V2 „Nach Tagen, Eintrag aufklappen“ angehängt
- 2026-11-24: Entwurf V3 „Filter nach Art“ angehängt
- 2026-11-24: Nutzer am 2026-11-24 zu V1 bis V3: bitte besser machen, gern auch mit Bild-Design
- 2026-11-24: Entwurf B1 „Zeitstrahl als Bild“ angehängt
- 2026-11-24: Entwurf B2 „Karten wie im Kanal“ angehängt
- 2026-11-24: Entwurf B3 „Tagesbild und Liste“ angehängt
- 2026-11-24: Nutzer am 2026-11-24 (mit Bild seines Panels): Das Bild im Panel soll bleiben, aber verbessert oder weiterentwickelt werden, ebenso der Text oben im Panel. Entwürfe darauf aufbauen statt das Panel zu ersetzen.
- 2026-11-24: Entwurf P1 „Panel im Feinschliff“ angehängt
- 2026-11-24: Entwurf P2 „Panel weiterentwickelt mit 24-Stunden-Spuren“ angehängt
- 2026-11-24: Entwurf P2 „Panel weiterentwickelt mit 24-Stunden-Spuren“ gewählt. Grund: Nutzer am 2026-11-24: P2 mit Spuren. Panel bleibt, Bild bekommt die letzten 24 Stunden je Projekt als Spur, Text knapper, Verlauf-Ansicht wie gezeigt
- 2026-11-24: Nutzer wählt P2 (Panel mit 24-Stunden-Spuren); Akzeptanzkriterien für Panel-Text, Bild und Verlauf-Ansicht ergänzt
- 2026-11-24: Nutzer am 2026-11-24, neuer Wunsch: Discord-Nachrichten länger als 10 s zeigen, aber kompakter: je Aufgabe nur eine Nachricht, die bei jedem Schritt bearbeitet wird, statt vieler einzelner. Erst Entwürfe zeigen. Panel P2 und Verlauf bleiben gewählt.
- 2026-11-24: Entwurf K1 „Kompakte Karte je Aufgabe“ angehängt
- 2026-11-24: Entwurf K2 „Karte mit Zeitleiste“ angehängt
- 2026-11-24: Entwurf K3 „Eine Zeile je Aufgabe“ angehängt
- 2026-11-24: Nutzer zu K1 bis K3: Nachrichten gern mit Bildern, wenn das besser aussieht; für die Gestaltung gern Fable 5.2 nutzen. Bildvarianten folgen.
- 2026-11-24: Entwurf I1 „Karte mit Vorschaubild“ angehängt
- 2026-11-24: Entwurf I2 „Karte mit Phasenstreifen“ angehängt
- 2026-11-24: Entwurf I3 „Karte mit Zeitachse“ angehängt
- 2026-11-24: Entwurf I3 „Karte mit Zeitachse“ gewählt. Grund: Nutzer am 2026-11-24: „L3 verbessert“, gemeint ist I3 (Karte mit Zeitachse) in verbesserter Fassung: auf dem Handy lesbar, Bild nur bei Ereignissen neu
- 2026-11-24: Parallel gestartet im Worktree W-0050-discord-nachrichten (Status: backlog → in-arbeit)
- 2026-11-24: Entwurf I4 „Zeitachse verbessert“ angehängt
- 2026-11-24: Entwurf I4 „Zeitachse verbessert“ gewählt. Grund: Verbesserte Fassung von I3 nach dem Wunsch des Nutzers „I3 verbessert“ vom 2026-11-24
- 2026-11-24: Entwurf I3 „Karte mit Zeitachse“ gewählt. Grund: Nutzer am 2026-11-24: I4 sieht schlecht aus, die alte Fassung I3 war deutlich besser. I3 wird wie im Entwurf gebaut.
- 2026-11-24: Nutzer zu I4: gefällt nicht, I3 war deutlich besser. Kartenbild wird nach I3 gebaut, Bild bei Ereignissen neu, sonst höchstens alle 5 Minuten.
- 2026-11-24: Übergabe aktualisiert
- 2026-11-24: Kartenbild nach Korrektur des Nutzers nach I3 statt I4; Plan für alle Schritte in der Übergabe, noch kein Code (Feierabend). Ausgangslage Discord-Selbsttests 20 von 20 grün.
- 2026-11-25: Akzeptanzkriterien: "Frist einstellbar in Sekunden (Dialog im Board, works discord set), Standard 1 Std. (3600 s)" abgehakt
- 2026-11-25: Umsetzungsplan: "Frist in Sekunden: cleanup.seconds (Standard 3600, 0 nie) statt cleanup.hours in discord.mjs (DEFAULTS, normalizeConfig, works discord set, Liste der Schlüssel), Bot cleanup() und prune(), Board-Dialog (Feld in Sekunden), Tests zuerst" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Je Aufgabe genau eine Nachricht (Karte nach Entwurf I3), die bei jedem Schritt bearbeitet wird: Start, Frage, Freigabe, fertig und wartet, Review, zurückgegeben, erledigt, Auslieferung (Wunsch des Nutzers vom 2026-11-24, ersetzt „nach 10 s löschen“)" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Braucht die Karte den Nutzer (Freigabe, Frage, Review, fertig und wartet), kommt sie als neue Nachricht nach unten, damit Discord benachrichtigt; die alte Fassung wird gelöscht" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Karten bleiben, solange die Aufgabe offen ist, und verschwinden nach der Frist ab Erledigung; Nachrichten ohne Aufgabe nach der Frist ab Senden" abgehakt
- 2026-11-25: Umsetzungsplan: "Karte je Aufgabe: Ereignisse mit Aufgaben-ID (neues Ereignis start beim Wechsel auf in Arbeit, perm, idle mit Aufgabe, question, review, returned, done, ship, p1) laufen in upsert() in eine Karte card:<rid>:<id> mit Einträgen je ursprünglichem Schlüssel; Zustand aus dem jüngsten offenen Eintrag; neue wartende Einträge senden die Karte neu (alte löschen, Erwähnung wie bisher je Ereignis); Knöpfe Annehmen und Zurückgeben im Review wie bisher" abgehakt
- 2026-11-25: Umsetzungsplan: "Kartenbild nach Entwurf I3 (der Nutzer fand I4 schlechter): Zeitachse der Aufgabe mit Uhrzeiten, rechts Minuten, Schritte, Kriterien, Legende; Bild bei Ereignissen neu, sonst höchstens alle 5 Minuten" abgehakt
- 2026-11-25: Karte je Aufgabe umgesetzt: Zustand aus dem jüngsten offenen Eintrag, eine nach dem Review begonnene Auslieferung zeigt die Karte statt des Reviews; fertig und wartet geht an die Aufgabe, an der Claude zuletzt war (auch im Review). Einzelnachrichten von vor dem Update bleiben einzeln.
- 2026-11-25: Akzeptanzkriterien: "Knopf Verlauf im Discord-Panel (der angehefteten Dashboard-Nachricht nach D3, neben Warteschlange, Anweisung an Claude, Neue Aufgabe, Hilfe) und /works verlauf zeigen die letzten Nachrichten nur dem Aufrufer, nach Projekt filterbar" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Der Verlauf übersteht einen Neustart des Bots und ist begrenzt (Anzahl oder Alter)" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Verlauf-Ansicht nach P2: Einträge mit Symbol, Projekt, Text und relativer Zeit, Eintrag ansehen mit allen Feldern, Filter Projekt und Zeitraum, Ältere" abgehakt
- 2026-11-25: Umsetzungsplan: "Verlauf speichern: jede gesendete oder bearbeitete Nachricht als Eintrag (Schlüssel, Projekt, Art, Zeit, Ereignis) in state.history, neueste Fassung je Schlüssel, höchstens 7 Tage und 300 Einträge, übersteht Neustart" abgehakt
- 2026-11-25: Umsetzungsplan: "Verlauf zeigen: Knopf Verlauf (w:hist) im Dashboard und /works verlauf (history) mit Option project, nur für den Aufrufer; Liste mit Symbol je Art, Projekt, Text, relativer Zeit; Auswahl „Eintrag ansehen“ holt die Nachricht mit allen Feldern; Auswahl Projekt und Zeitraum (24 Std., 3 Tage, 7 Tage), Knopf Ältere; custom_ids passen zu CID_RE (Dienst des gemeinsamen Bots)" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Panel-Text nach Entwurf P2: Zusammenfassung oben (wartet, arbeitet, heute erledigt, Kosten), Zeile je Projekt mit Ampel, Zustand und Aufgabe, darunter Als Nächstes" abgehakt
- 2026-11-25: Akzeptanzkriterien: "Panel-Bild nach P2: Fortschritt mit Ampel und Aufgabe je Balken, letzte 24 Stunden je Projekt als Spur (ein Punkt je Nachricht in der Farbe ihrer Art), Woche mit heute hervorgehoben" abgehakt
- 2026-11-25: Umsetzungsplan: "Panel-Text nach P2: Zusammenfassung oben, Zeile je Projekt mit Ampel, Zustand, Werkzeug bei Freigabe und Aufgabe, Feld Als Nächstes; Kosten in der Zusammenfassung nur mit privacy.costs" abgehakt
- 2026-11-25: Umsetzungsplan: "Panel-Bild nach P2: Ampel und Aufgabe je Balken, Abschnitt LETZTE 24 STUNDEN mit Spur je Projekt aus state.history (Farbe nach Art), Woche einfarbig mit heute hervorgehoben und Summe" abgehakt
- 2026-11-25: Panel nach P2 und Verlauf umgesetzt. Entscheidungen: Spuren im Panel-Bild enden an einer 5-Minuten-Grenze, damit das Bild nicht bei jedem Durchgang neu gezeichnet wird; Kartenbild höchstens alle 5 Minuten auch im Testtakt; Board-Vorschau zeigt weiter die Einzelnachricht (offener Punkt).
- 2026-11-25: Dienst-Test angepasst: /works verlauf in der Befehlsliste, Karte mit Bild und Verlauf mit Auswahl über den Dienst.
