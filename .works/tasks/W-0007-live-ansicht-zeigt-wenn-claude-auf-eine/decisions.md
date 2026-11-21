# Entscheidungen W-0007

## Gewählter Entwurf

- 2026-11-21: Variante A „Live-Ansicht Ergänzungen W-0006 bis W-0009“ gewählt, Grund: Nutzer: Beide A (Freigabe A Kacheln, Verbrauch A in Kachel und Kopf), Rest wie im Entwurf. Datei: design/A-live-ansicht-ergaenzungen-w.html

## Entscheidungen

- 2026-11-21: Der Zustand kommt aus einem eigenen PermissionRequest-Hook (`hooks/permission.mjs`), nicht aus der Notification `permission_prompt`. Grund: PermissionRequest feuert sofort, die Notification erst nach einigen Sekunden.
- 2026-11-21: Der Hook gibt nichts aus. Jede Ausgabe könnte von Claude Code als Entscheidung über die Freigabe gelesen werden, die bleibt beim Nutzer.
- 2026-11-21: Ende des Zustands über die vorhandenen Hooks (PreToolUse, PostToolUse, Stop, UserPromptSubmit) plus 60 Minuten Obergrenze. Freigabe und Ablehnung selbst melden keinen Hook. Folge: Nach einer Freigabe steht "wartet" bis zum Ende des Aufrufs, nach einer Ablehnung bis zur nächsten Nachricht. In hooks.md und board.md dokumentiert.
- 2026-11-21: Browser-Benachrichtigung nutzt die vorhandenen Benachrichtigungen unter Werkzeuge (neue Art "Claude wartet auf deine Freigabe"), der Knopf in der Jetzt-Box schaltet sie ein. Kein zweites Einstellungssystem.
- 2026-11-21: Pille im Kopf "Wartet auf deine Freigabe (ID)" statt "Claude wartet ...", weil der längere Text auf dem Handy den Projektnamen verdrängt.
