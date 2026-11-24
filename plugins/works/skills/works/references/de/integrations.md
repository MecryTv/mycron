# Zusammenspiel mit anderen Skills und Werkzeugen

Jede Integration ist optional. Ist ein Skill nicht installiert, den Schritt auslassen oder von Hand erledigen.

## Gestaltung mit UI UX Pro Max und Superpowers Brainstorming

Bei Gestaltungsaufgaben (Typ design oder Tag ui, design, ux) arbeitet Claude die Entwürfe selbst aus, sobald einer der beiden Skills installiert ist. Der Nutzer muss nicht darum bitten. `works start` sucht unter `~/.claude/skills` und `~/.claude/plugins` nach Ordnern namens `ui-ux-pro-max` und `brainstorm*` und nennt die gefundenen Skills in der Ausgabe.

Alles landet im Aufgabenordner unter `design/`, Index in `design/design.json`. Das Board zeigt es im Tab Entwürfe: Farben und Schrift, die Varianten als Vorschau (HTML-Mockups laufen in einem abgeschotteten iframe), das Brainstorming und die Wahl des Nutzers.

Ablauf:

1. Brainstorming (Superpowers) mit der Aufgaben-ID, der Beschreibung und den Kriterien starten. Fragen an den Nutzer wie gewohnt stellen. Das Ergebnis anhängen:
   ```
   works design brainstorm W-0006 --file docs/superpowers/specs/2026-10-31-bracket-design.md
   ```
2. UI UX Pro Max mit Produktart, Zielgruppe und Stilwunsch aus der Aufgabe befragen. Die Designrichtung anhängen:
   ```
   works design direction W-0006 --file richtung.md --colors "Grund #0F1420,Akzent #3DD6B5,Live #FF5A5F" --fonts "Space Grotesk,Inter"
   ```
   `--file` ist ein Markdown-Text mit Stil, Regeln und Begründung, `--colors` die Palette als `Name #hex` mit Komma getrennt.
3. Zwei bis drei Varianten als eigenständige HTML-Datei (alles inline, keine externen Skripte) oder als Bild bauen und einzeln anhängen:
   ```
   works design add W-0006 --name A --title "Klassisches Bracket" --file /tmp/a.html --note "Alle Runden nebeneinander"
   works design add W-0006 --name B --title "Runden als Tabs" --file /tmp/b.html
   ```
   Namen sind kurz (A, B, C). Die Datei wird als `design/A-klassisches-bracket.html` kopiert.
   Das Board zeigt HTML-Entwürfe in einem abgesicherten iframe, das nur `data:`, `blob:` und `https` lädt. Verweist der Entwurf auf lokale CSS, Schriften oder Bilder (relativ oder `file://`), warnt `design add` und nennt die Verweise: Im Board fehlen sie. Vorher einbetten, mit dem Plugin mockups: `entwurf.mjs inline <datei> --variant A`.
4. Dem Nutzer sagen, dass die Entwürfe im Board unter Entwürfe liegen, und auf seine Wahl warten. Er wählt im Board mit "Diese nehmen" oder im Gespräch, dann `works design choose W-0006 B --reason "..."`. Die Wahl landet in decisions.md unter "Gewählter Entwurf". Die Sitzungsübersicht meldet Aufgaben mit Entwürfen ohne Wahl.
5. Erst danach umsetzen. Die gewählte Variante ist die Vorgabe. Abweichungen mit dem Nutzer klären.
6. Vor dem Review einen Screenshot des Ergebnisses ablegen: `works shot --url <seite> --asset W-0006 --kind nachher --desc "..."` (oder ein vorhandenes Bild mit `works asset W-0006 shot.png --kind nachher --desc "..."`). Das Board stellt ihn in der Abnahme neben den gewählten Entwurf. Für den Vergleich in gleicher Breite und gleichem Schema je Kombination ein Bild ablegen, etwa `works shot --url <seite> --widths=1440,390 --themes=light,dark --asset W-0006 --kind nachher` (Namen mit `-light-1440`, `-dark-390`).

Zusätzlich bleiben die bisherigen Wege gültig: Entscheidungen als E-Block in `decisions.md` mit `--source "UI UX Pro Max"`, verworfene Varianten mit Grund. Projektweite Design-Systeme nur mit `works attach-doc` verlinken, nicht in eine Aufgabe kopieren.

Ist keiner der beiden Skills installiert, die Gestaltung wie bisher mit dem Nutzer klären und trotzdem mindestens einen Entwurf mit `works design add` zeigen, wenn es um sichtbare Oberflächen geht.

## Superpowers Brainstorming ohne Gestaltung

Für Brainstormings zu Architektur oder Abläufen das erzeugte Dokument mit `attach-doc` übernehmen, statt den Skill umzubauen:

```
works attach-doc W-0012 docs/superpowers/specs/2026-10-29-login-design.md --label "Brainstorm Login"
```

Der Modus kommt aus `config.json` unter `brainstorm.mode`: `link` (Standard, verlinkt), `copy` (Kopie nach `tasks/<ID>/docs/`) oder `move`. Mit `--mode` pro Aufruf überschreibbar. Danach in `decisions.md` die Brainstorm-Zusammenfassung schreiben, Entscheidungen als E-Block festhalten und Kriterien und Umsetzungsplan ableiten. Ergeben sich mehrere Arbeitspakete, je eine Aufgabe anlegen und verknüpfen. Einen Implementierungsplan von Superpowers ebenfalls anhängen.

## git-workflow

- `works start <ID>` schlägt einen Branch nach dem Schema `<präfix>/<id>-<slug>` vor und schreibt ihn ins Frontmatter. Präfixe: feature und design → `feature/`, bug → `fix/` (bei P1 `hotfix/`), refactor und debt → `refactor/`, chore und spike → `chore/`.
- Ist der git-workflow Skill aktiv, legt dieser den Branch an und verwendet dabei genau diesen Namen. Sonst `works start <ID> --git`.
- Commit-Messages enthalten die ID: `fix(W-0007): Rolle nach Captcha vergeben`. Dadurch findet `works commits <ID>` alle zugehörigen Commits.
- Bei Parallelarbeit legt `works parallel start` die Branches selbst an, jeweils in einem eigenen Worktree. Der git-workflow Skill legt dann keinen weiteren Branch an. Gemergt wird mit `works parallel finish <ID> --merge` (ebenfalls `--no-ff`) oder über einen Pull Request.
- Beim Merge über git-workflow anschließend `works done <ID>` ausführen. Umgekehrt gilt: `works done --confirm` erst, wenn der Merge erfolgreich war oder der Nutzer ihn bewusst später machen will.

## code-audit

Steht standardmäßig in der Definition of Done. Vor `works done --confirm` den code-audit Skill auf die Änderungen der Aufgabe anwenden. Funde mit hoher Schwere sind entweder zu beheben oder als neue Aufgabe zu erfassen (`works new --type bug ... --related <ID>`). Bewusst akzeptierte Abkürzungen als technische Schuld (Typ debt) anlegen.

## responsive-website-check

Gilt für Aufgaben mit Tag `ui`. Vor dem Abschluss ausführen. Gefundene Darstellungsfehler entweder direkt beheben oder als Bug mit Screenshot (`--kind fehler`) erfassen.

## second-brain-sync

Meldet `works done`, dass decisions.md Entscheidungen enthält, dem Nutzer anbieten, die wichtigen davon ins Decision Log des Second Brain zu übernehmen. Übertragen werden Entscheidung, Begründung und verworfene Alternativen, nicht der Verlauf.

## GitHub

Der Abgleich läuft automatisch über das gh CLI, sobald das Projekt ein GitHub-Repository ist und gh angemeldet ist: beim Sitzungsstart im Hintergrund und alle `interval_min` Minuten, solange das Board läuft. Der erste Lauf merkt sich nur den Stand und ändert nichts. Änderungen tragen `[GitHub]` im Verlauf.

| Ereignis | Folge |
|---|---|
| PR mit der ID im Titel oder Branch wird geöffnet | Aufgabe in Arbeit geht nach Review |
| CI eines PR wird grün oder rot | Prüfung `ci` an der Aufgabe, rot blockiert den Abschluss |
| Review mit Änderungswünschen | Text als Kommentar an Claude, Aufgabe zurück nach In Arbeit |
| PR wird gemergt | `works done --confirm` ohne erneute Prüfungen. Ist die Definition of Done offen, bleibt die Aufgabe in Review und bekommt einen Kommentar mit den offenen Punkten |
| Neues Issue nach dem ersten Lauf | Neue Aufgabe, unvollständig markiert, Typ und Priorität aus den Labels |
| Aufgabe aus einem Issue ist erledigt | Issue wird mit Hinweis auf die ID geschlossen |

Befehle: `works github status` zeigt Repository, letzten Lauf und Ereignisse, `works github sync` gleicht sofort ab, `works github set issues=false labels=bug,works` ändert Einstellungen. Im Board unter Werkzeuge, GitHub. Einstellungen in `config.json` unter `github_sync`, siehe config.md.

Weiterhin verfügbar: `works gh-import` für einen einmaligen Import alter Issues und `works gh-export <ID>` (nur nach Zustimmung). Label-Zuordnung in `config.json` unter `github`.

## Discord-Bot works

Hinweise aufs Handy für alle Projekte, auch ohne offenes Board. Zwei Wege, `works discord` zeigt beide (Entwurf R aus W-0040). Claude fragt nie nach Token, Schlüssel oder Code und gibt sie nie aus.

Gemeinsamer Bot (empfohlen, W-0040): Der Dienst `services/works-bot` läuft auf einem Server und kennt als einziger das Token. Der Nutzer lädt den Bot mit dem Link aus `works discord` ein, tippt im gewünschten Kanal `/works verbinden` (braucht „Server verwalten“) und trägt den Code ein: `works discord link <Code>`. works bekommt einen Geräteschlüssel (nur in `~/.works/discord/secret.json`), darf damit nur in diesen Kanal schreiben und nur eigene Nachrichten bearbeiten. Erwähnt wird, wer `/works verbinden` ausgeführt hat. Der lokale Bot läuft wie beim eigenen Bot, schickt aber über den Dienst und braucht kein Gateway. Adresse des Dienstes: `works discord set service=https://…` (bis sie im Plugin hinterlegt ist). Trennen: `works discord unlink` oder in Discord `/works trennen`. Betrieb des Dienstes: `services/works-bot/README.md`.

Eigener Bot, Einrichtung (der Nutzer im eigenen Terminal):
1. Im Discord-Entwicklerportal eine Anwendung mit Bot anlegen und das Token kopieren.
2. `Get-Clipboard | works discord token` oder `works discord token` (fragt versteckt). Prüft das Token, erkennt den Besitzer der Anwendung (der wird erwähnt) und gibt den Einladungslink mit genau den nötigen Rechten aus: Kanal sehen, Nachrichten senden, Links einbetten, Verlauf lesen, Nachrichten anheften.
3. Einladen, dann `works discord channel` und `works discord channel works`.

Danach startet der Bot mit jedem Board und beim Sitzungsstart, einer je Rechner (Sperrdatei `bot.pid`); eine neue works-Version ersetzt ihn. Unter Node 22 verbindet er sich mit dem Gateway (online sichtbar, mit Status), darunter schickt er nur über REST.

Was er schickt (Entwurf F2 aus W-0036, Dashboard nach D3 aus W-0044):
- Dauerhaft im Kanal steht nur das Dashboard: eine angeheftete Nachricht für alle Projekte, die in diesen Kanal melden. Je Projekt eine Zeile mit Ampel (🟢 arbeitet, 🟠 wartet auf dich, ⚪ ruhig, dazu 🔴 CI), Felder Heute, Wartet auf dich, Als Nächstes, und ein Bild, das works selbst zeichnet (`discord-image.mjs`: Fortschritt je Projekt, erledigte Aufgaben der letzten 7 Tage; Pixelschrift nur in Großbuchstaben, PNG über zlib, kein fremder Dienst). Darunter das Auswahlmenü „Projekt wählen“ (Details nur für dich, mit Knöpfen Aufgaben und Anweisung) und die Knöpfe Warteschlange, Anweisung an Claude, Neue Aufgabe, Hilfe. Das Dashboard wird gebündelt bearbeitet (höchstens alle 10 s), das Bild höchstens alle 5 Minuten neu gezeichnet und bei jeder Bearbeitung mit hochgeladen. Wird es gelöscht oder ist es nicht mehr bearbeitbar, legt der Bot ein neues an. Statusposts je Projekt aus älteren Versionen löscht er. Es zeigt nur Projekte, deren Ordner eine `.works/config.json` hat und die in `~/.works/projects.json` stehen; fehlt ein Projekt länger als eine Minute (Ordner gelöscht, `.works` entfernt), fällt es aus Dashboard, Status des Bots und `/works status`, samt seinem Stand in `state.json` (W-0051). Ein Projekt, das nur kurz nicht lesbar ist, etwa beim Branch-Wechsel, bleibt.
- Aufräumen: Alle anderen Nachrichten löscht der Bot nach `cleanup.hours` Stunden (Standard 24, 0 heißt nie). Nachrichten, die auf dich warten (Freigabe, Claude fertig, Review, Frage), bleiben, solange sie offen sind; die Frist läuft ab ihrer Erledigung. Eine beantwortete Frage wird grau.
- Status des Bots (nur eigener Bot, mit Gateway): das Wichtigste über alle Projekte, etwa „Trainingsplan wartet auf dich“, „arbeitet an W-0040 (mycron)“ oder „3 Projekte im Blick“. Der gemeinsame Bot ist einer für alle und zeigt „/works help“.
- Ereignisse mit Feldern: Freigabe wartet (nach 30 s), Claude fertig (nach 120 s), Frage, Review, angenommen, zurückgegeben, erledigt, works ship als eine Nachricht mit Schritten, CI rot mit Bug und wieder grün, neue P1, Warteschlange leer, Wochenbericht.
- Erledigtes wird nachträglich bearbeitet: Freigabe beantwortet wird grau, Review angenommen grün.
- Nur Ereignisse mit `at` erwähnen den Nutzer (Standard: die drei aus „Claude braucht dich“), alles andere kommt still. In der Ruhezeit (Standard 22 bis 7 Uhr) kommt auch das still.
- Befehle aus Freigaben gehen nur mit `privacy.commands=an` mit. Links nur auf GitHub, nie auf das lokale Board.

Wie Ereignisse entstehen: Der Bot liest den Stand der angemeldeten Projekte (Aufgaben, Warteschlange, `activity.json`) und vergleicht ihn mit dem letzten. Hooks tun dafür nichts zusätzlich. ship, ci-watch und `report --week` legen Ereignisse mit `works discord emit` in `~/.works/discord/outbox`; läuft der Bot nicht, holt er sie beim nächsten Start ab. Fehler bei Discord (429, 5xx, Netz) werden später wiederholt, nichts geht verloren.

Doppelmeldungen vermeidet er so: Wechselt der Branch, übernimmt er den Stand ohne Vergleich; während `works ship` friert er ihn ein und vergleicht am Ende mit dem Stand davor; P1, Erledigung und Fragen meldet er je Aufgabe höchstens einmal am Tag. Freigaben aus parallelen Bahnen meldet er wie die der Hauptsitzung, solange die Bahn in `lanes.json` steht.

Prozess: `bot.pid` ist die Sperrdatei, der Bot erneuert sie alle 5 s. Eine alte Datei, deren PID inzwischen ein anderer Prozess hat, zählt nicht; `stop` beendet nie einen fremden Prozess. Arbeitsordner ist `~/.works/discord`, damit kein Projekt- oder Worktree-Ordner gesperrt bleibt. Eine neue works-Version ersetzt den Bot, ohne dass Board oder Sitzungsstart warten. Wechselt das Token auf eine andere Bot-Anwendung, beginnt der Bot mit neuen Statusposts.

Befehle und Knöpfe (W-0037, Entwurf HS): `/works help` (hilfe), `status`, `tasks` (aufgaben), `new` (neu, Titel und Priorität), `instruct` (anweisung, an die Aufgabe in Arbeit oder mit `task`); beim gemeinsamen Bot dazu `link` (verbinden) und `unlink` (trennen). Englische Namen, im deutschen Discord deutsch; die Antworten folgen der Sprache des Discord-Clients. Bei mehreren Projekten nennt man es mit `project` (der Anfang des Namens reicht). Knöpfe: Review mit „Annehmen“ und „Zurück an Claude“ (Dialog für die Begründung, die als Kommentar ankommt), „Claude ist fertig“ mit „Anweisung an Claude“ (Dialog), CI rot mit „Bug ansehen“. Nach Annahme oder Rückgabe verschwinden die Knöpfe. Nur der eingetragene Nutzer (Besitzer der Anwendung beim eigenen Bot, wer `/works verbinden` ausgeführt hat beim gemeinsamen) darf etwas auslösen, andere bekommen eine Absage; alle Antworten sieht nur, wer geklickt hat. Freigaben aus Claude Code erteilt der Bot nicht. Aktionen laufen über dieselbe API wie das Board: Verlaufseinträge mit `[Discord]`, Rückgängig im Board, neue Aufgaben mit `source: discord` und `incomplete: true` (beim nächsten passenden Moment mit dem Nutzer vervollständigen). Annehmen läuft wie `works done --confirm`; ist die Definition of Done nicht erfüllt, sagt der Bot das, statt abzuschließen.

So kommen Klicks an: Der eigene Bot registriert `/works` für den Server des Kanals und bekommt Klicks über sein Gateway (ab Node 22, sonst gibt es keine Knöpfe). Beim gemeinsamen Bot antwortet der Dienst sofort vorläufig, öffnet Dialoge selbst und legt die Anfrage in eine Inbox des Geräts, das die Nachricht geschrieben hat (Befehle: das zuletzt aktive Gerät des Aufrufers im Kanal). Der lokale Bot holt sie mit Long-Poll ab, bestätigt sie mit der nächsten Abfrage (sonst kommen sie noch einmal) und antwortet über den Dienst; das Token der Interaktion bleibt im Dienst. Ist das Gerät aus, sagt der Dienst das nach 10 s; läuft dort ein works ohne Befehle, rät er zum Update.

Schalter Befehle und Knöpfe (W-0046): `commands` (Standard an), im Board im Reiter Befehle oder mit `works discord set commands=aus`. Ausgeschaltet zeigt der Bot keine Knöpfe und kein Auswahlmenü mehr, am Dashboard (wird gleich bearbeitet) und an neuen Nachrichten; ältere Nachrichten behalten ihre Knöpfe. Der eigene Bot meldet `/works` für den Server ab (leere Liste), auch ohne Gateway. Beim gemeinsamen Bot bleibt `/works` registriert, weil der Dienst einer für alle ist; das Gerät beantwortet Befehle dann mit einem kurzen Hinweis, ebenso Klicks auf alte Knöpfe beim eigenen Bot. Wieder an: `/works` wird registriert, die Knöpfe kommen zurück. Beides ohne Neustart.

Protokoll in `~/.works/discord/bot.log` (ohne Token).

Einstellungen im Board (W-0038, Entwurf J2): Werkzeuge, „Discord-Bot“ öffnet einen Dialog mit den Reitern Verbindung, Projekte, Ereignisse (an und @ je Ereignis, Ruhezeit, Verzögerungen, Frist zum Löschen), Befehle und Datenschutz, rechts eine Vorschau der Nachricht wie in Discord und wie sie auf dem Sperrbildschirm erscheint. Die Vorschau rechnet schon mit den ungespeicherten Änderungen; Speichern schreibt `config.json` mit denselben Schlüsseln wie `works discord set`. Beim ersten Mal führt der Reiter Verbindung durch die Wahl nach Entwurf R: gemeinsamer Bot mit Code oder eigener Bot mit Token. Das Token steht in einem Passwortfeld, das nach dem Speichern leer wird; Token, Schlüssel und Code kommen in keiner Antwort des Boards vor, gezeigt wird nur `…abcd`. Token, Code und Trennen gehen nur direkt am Rechner, nicht über einen geteilten Link.

Kanalwahl (Entwurf K): Der Reiter Verbindung liest Server und Textkanäle live vom Bot, nach Kategorie. Ob der Bot in einem Kanal schreiben darf, rechnet works wie Discord aus Rollen und Overwrites (sehen, senden, Links einbetten); Kanäle ohne dieses Recht sind ausgegraut, mit Grund. Beim gemeinsamen Bot sind es die Kanäle des gekoppelten Servers, der Dienst prüft das Recht selbst. „Hierher verschieben“ setzt `channel_id` (beim gemeinsamen Bot zieht vorher der Dienst die Kopplung um). Der laufende Bot liest `config.json` bei jedem Durchgang, legt das Dashboard im neuen Kanal an, heftet es an und löscht das alte. Einen Neustart braucht weder das noch eine andere Einstellung. Im Terminal geht es mit `works discord channel`, für beide Wege.

Kanal je Projekt (W-0046, nur eigener Bot): Im Reiter Projekte hat jedes Projekt eine Kanalwahl aus derselben Liste vom Bot, Standard ist der Kanal oben; Kanäle ohne Schreibrecht sind nicht wählbar. Gespeichert als `projects.<rootId>.channel_id` und `channel_name` in `config.json`, im Terminal mit `works discord set project.<id>.channel=<Kanal-ID>` (leer: zurück in den Standardkanal); works prüft dabei Kanal und Schreibrecht. Jedes Projekt erscheint im Dashboard seines Kanals, dort gehen auch seine Hinweise hin. Wechselt ein Projekt den Kanal, legt der laufende Bot dort ein Dashboard an, nimmt das Projekt aus dem alten und löscht ein Dashboard, zu dem kein Projekt mehr gehört. Der gemeinsame Bot schreibt in genau einen Kanal, den gekoppelten: Dort ist die Wahl gesperrt, `works discord set` lehnt sie ab, und eigene Kanäle aus der Zeit mit eigenem Bot gelten nicht. Die Vorschau im Dialog nennt den Kanal des Projekts.

## Playwright und Browser-Werkzeuge

Für Vorher- und Nachher-Screenshots, siehe assets.md.
