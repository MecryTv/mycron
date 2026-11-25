# Working with other skills and tools

Every integration is optional. If a skill is not installed, skip the step or do it by hand.

## Design with UI UX Pro Max and Superpowers Brainstorming

For design tasks (type design or tag ui, design, ux), Claude works out the design variants itself as soon as one of the two skills is installed. The user does not have to ask. `works start` looks in `~/.claude/skills` and `~/.claude/plugins` for folders named `ui-ux-pro-max` and `brainstorm*` and lists the skills it finds in its output.

Everything goes into the task folder under `design/`, indexed in `design/design.json`. The board shows it in the Design variants tab: colors and fonts, the variants as previews (HTML mockups run in a sandboxed iframe), the brainstorming and the user's choice.

Steps:

1. Start brainstorming (Superpowers) with the task ID, the description and the criteria. Ask the user questions as usual. Attach the result:
   ```
   works design brainstorm W-0006 --file docs/superpowers/specs/2026-10-31-bracket-design.md
   ```
2. Ask UI UX Pro Max with the product type, audience and style wishes from the task. Attach the design direction:
   ```
   works design direction W-0006 --file direction.md --colors "Base #0F1420,Accent #3DD6B5,Live #FF5A5F" --fonts "Space Grotesk,Inter"
   ```
   `--file` is a Markdown text with style, rules and reasoning, `--colors` the palette as `Name #hex`, comma-separated.
3. Build two or three variants as standalone HTML files (everything inline, no external scripts) or as images, and attach each one:
   ```
   works design add W-0006 --name A --title "Classic bracket" --file /tmp/a.html --note "All rounds side by side"
   works design add W-0006 --name B --title "Rounds as tabs" --file /tmp/b.html
   ```
   Names are short (A, B, C). The file is copied as `design/A-classic-bracket.html`.
   The board shows HTML variants in a locked-down iframe that only loads `data:`, `blob:` and `https`. If the variant refers to local CSS, fonts or images (relative or `file://`), `design add` warns and lists the references: they will be missing in the board. Inline them first with the mockups plugin: `entwurf.mjs inline <file> --variant A`.
4. Tell the user the variants are in the board under Design variants, and wait for their choice. They choose in the board with "Use this one" or in the conversation, then `works design choose W-0006 B --reason "..."`. The choice goes into decisions.md under "Chosen design". The session overview reports tasks with design variants but no choice.
5. Only then implement. The chosen variant is the spec. Clear any deviations with the user.
6. Before the review, store a screenshot of the result: `works shot --url <page> --asset W-0006 --kind after --desc "..."` (or an existing image with `works asset W-0006 shot.png --kind after --desc "..."`). The board puts it next to the chosen variant in the acceptance review. For a comparison at the same width and scheme, store one image per combination, for example `works shot --url <page> --widths=1440,390 --themes=light,dark --asset W-0006 --kind after` (names with `-light-1440`, `-dark-390`).

The previous ways remain valid as well: decisions as an E block in `decisions.md` with `--source "UI UX Pro Max"`, rejected variants with a reason. Only link project-wide design systems with `works attach-doc`; do not copy them into a task.

If neither skill is installed, clarify the design with the user as before, and still show at least one variant with `works design add` when visible interfaces are involved.

## Superpowers Brainstorming without design

For brainstorming on architecture or processes, take over the generated document with `attach-doc` instead of modifying the skill:

```
works attach-doc W-0012 docs/superpowers/specs/2026-10-29-login-design.md --label "Brainstorm login"
```

The mode comes from `config.json` under `brainstorm.mode`: `link` (default, links it), `copy` (copy to `tasks/<ID>/docs/`) or `move`. Override per call with `--mode`. Afterwards write the brainstorm summary in `decisions.md`, record decisions as E blocks, and derive criteria and the implementation plan. If several work packages come out of it, create one task each and link them. Attach a Superpowers implementation plan the same way.

## git-workflow

- `works start <ID>` suggests a branch following the scheme `<prefix>/<id>-<slug>` and writes it into the frontmatter. Prefixes: feature and design → `feature/`, bug → `fix/` (`hotfix/` for P1), refactor and debt → `refactor/`, chore and spike → `chore/`.
- If the git-workflow skill is active, it creates the branch using exactly this name. Otherwise `works start <ID> --git`.
- Commit messages contain the ID: `fix(W-0007): Assign role after captcha`. That lets `works commits <ID>` find all related commits.
- For parallel work, `works parallel start` creates the branches itself, each in its own worktree. The git-workflow skill then does not create another branch. Merge with `works parallel finish <ID> --merge` (also `--no-ff`) or through a pull request.
- After merging via git-workflow, run `works done <ID>`. Conversely: only run `works done --confirm` once the merge has succeeded or the user deliberately wants to do it later.

## code-audit

Part of the Definition of Done by default. Before `works done --confirm`, apply the code-audit skill to the task's changes. High-severity findings are either fixed or recorded as a new task (`works new --type bug ... --related <ID>`). Record deliberately accepted shortcuts as tech debt (type debt).

## responsive-website-check

Applies to tasks with the tag `ui`. Run it before finishing. Fix display bugs right away or record them as a bug with a screenshot (`--kind error`).

## second-brain-sync

When `works done` reports that decisions.md contains decisions, offer the user to copy the important ones into the Second Brain's decision log. Transfer the decision, the reasoning and the rejected alternatives, not the history.

## GitHub

Sync runs automatically through the gh CLI as soon as the project is a GitHub repository and gh is logged in: in the background at session start and every `interval_min` minutes while the board is running. The first run only records the current state and changes nothing. Changes carry `[GitHub]` in the history.

| Event | Result |
|---|---|
| A PR with the ID in its title or branch is opened | Task in progress moves to Review |
| A PR's CI turns green or red | Check `ci` on the task; red blocks completion |
| Review requesting changes | Text arrives as a comment for Claude, task goes back to In progress |
| PR is merged | `works done --confirm` without running the checks again. If the Definition of Done is still open, the task stays in Review and gets a comment listing the open items |
| New issue after the first run | New task, marked incomplete, type and priority from the labels |
| Task created from an issue is done | The issue is closed with a note pointing to the ID |

Commands: `works github status` shows the repository, the last run and events, `works github sync` syncs right away, `works github set issues=false labels=bug,works` changes settings. In the board under Tools, GitHub. Settings in `config.json` under `github_sync`, see config.md.

Still available: `works gh-import` for a one-off import of old issues and `works gh-export <ID>` (only after the user agrees). Label mapping in `config.json` under `github`.

## Discord bot works

Notifications on your phone for all projects, even without an open board. There are two ways; `works discord` shows both (design R from W-0040). Claude never asks for a token, key or code and never prints them.

Shared bot (recommended, W-0040): the service `services/works-bot` runs on a server and is the only thing that knows the token. The user invites the bot with the link from `works discord`, types `/works link` in the desired channel (needs "Manage Server") and enters the code: `works discord link <code>`. works receives a device key (stored only in `~/.works/discord/secret.json`), which lets it write only to that channel and edit only its own messages. The user who ran `/works link` is the one mentioned. The local bot runs as with your own bot, but sends through the service and needs no gateway. Service address: `works discord set service=https://…` (until it is built into the plugin). Disconnect: `works discord unlink`, or `/works unlink` in Discord. Running the service: `services/works-bot/README.md`.

Your own bot, setup (the user, in their own terminal):
1. In the Discord developer portal, create an application with a bot and copy the token.
2. `Get-Clipboard | works discord token` or `works discord token` (asks with hidden input). Checks the token, detects the application owner (who gets mentioned) and prints the invite link with exactly the permissions needed: View Channel, Send Messages, Embed Links, Read Message History, Pin Messages.
3. Invite it, then `works discord channel` and `works discord channel works`.

From then on the bot starts with every board and at session start, one per machine (lock file `bot.pid`); a new works version replaces it. On Node 22 or later it connects to the gateway (visible online, with a status); below that it only sends via REST.

What it sends (design F2 from W-0036, dashboard after D3 from W-0044, since W-0050 panel after P2 and one card per task after I3):
- The only permanent message in the channel is the dashboard (panel): one pinned message for all projects reporting to this channel. At the top a summary ("2 waiting for you · 1 working · 7 done today", plus the day's costs only with `privacy.costs`), one line per project with a traffic light (🟢 working, 🟠 waiting for you, ⚪ quiet, plus 🔴 CI), the state, the tool for an approval and the task, below it the field Up next. Plus an image works draws itself (`discord-image.mjs`; pixel font in capitals only, PNG via zlib, no external service): progress per project with traffic light and task at the bar, LAST 24 HOURS with one track per project from the history (one dot per message, green result, orange waited for you, red CI red, blue start and ship) and the tasks done in the last 7 days, today highlighted, with the total. Below it the "Pick a project" menu (details only for you, with the buttons Tasks and Instruction) and the buttons Queue, Instruction for Claude, New task, History, Help. The dashboard is edited in batches (at most every 10 s), the image redrawn at most every 5 minutes and uploaded with every edit. If it is deleted or can no longer be edited, the bot creates a new one. It deletes per-project status posts from older versions. It shows only projects whose folder has a `.works/config.json` and that are listed in `~/.works/projects.json`; a project missing for more than a minute (folder deleted, `.works` removed) drops out of the dashboard, the bot status and `/works status`, together with its state in `state.json` (W-0051). A project that is unreadable only briefly, for example during a branch switch, stays.
- One card per task (W-0050, design I3): everything that belongs to a task (start when it switches to in progress, question, approval, Claude done and waiting, review, returned, done, shipping with works ship, new P1) lives in exactly one message that is edited at every step: project, task, a state line from the newest open step and an image with the task's timeline (steps as squares, waiting times as a bar until the answer, times below, on the right minutes, steps of the implementation plan and criteria). The image is redrawn at every step, otherwise at most every 5 minutes while the task runs. When the card needs you (approval, question, review, Claude done), it comes back as a new message at the bottom and the old version is deleted, so Discord notifies you. Buttons for review and "done" as before. Messages without a task (CI without a task, reports, queue empty, done without a task) stay single messages.
- Cleanup: the bot deletes all other messages after `cleanup.seconds` seconds (default 3600, that is 1 hour; 0 means never). Cards stay while the task is open or a step waits for you and disappear after the period from completion or shipping; messages without a task after the period from sending, open ones only from when they are handled. An older `cleanup.hours` no longer applies.
- History (W-0050, design P2): the History button on the panel and `/works history` (verlauf), replies only for you. Each entry with symbol, project, text and time, 10 per page, buttons Newer and Older; the select "View an entry" shows the message with all fields, plus selects for project and period (24 h, 3 days, 7 days). The bot keeps the newest version of every message and every card step in `state.json`, at most 7 days and 300 entries; so the history survives a restart.
- Bot status (own bot only, with gateway): the most important thing across all projects, such as "Trainingsplan is waiting for you", "working on W-0040 (mycron)" or "watching 3 projects". The shared bot is one for everyone and shows "/works help".
- Events: task started, approval waiting (after 30 s), Claude done (after 120 s), question, review, accepted, returned, done, works ship, CI red with a bug and green again, new P1, queue empty, weekly report.
- Handled items are edited afterwards: the card shows the next state, a finished task with ✓ and in grey.
- Only events with `at` mention the user (default: the three under "Claude needs you"); everything else arrives silently. During quiet hours (default 22:00 to 7:00) those arrive silently too.
- Commands from approvals are only included with `privacy.commands=on`. Links only to GitHub, never to the local board.

How events come about: the bot reads the state of the registered projects (tasks, queue, `activity.json`) and compares it with the previous one. Hooks do nothing extra for this. ship, ci-watch and `report --week` put events into `~/.works/discord/outbox` with `works discord emit`; if the bot is not running, it picks them up on its next start. Discord errors (429, 5xx, network) are retried later; nothing gets lost.

How it avoids duplicate messages: when the branch changes, it takes over the state without comparing; during `works ship` it freezes the state and compares with the state before at the end; it reports a P1, a completion or a question at most once a day per task. It reports approvals from parallel lanes like those of the main session, as long as the lane is listed in `lanes.json`.

Process: `bot.pid` is the lock file; the bot renews it every 5 s. An old file whose PID now belongs to another process does not count; `stop` never ends a foreign process. The working directory is `~/.works/discord`, so no project or worktree folder stays locked. A new works version replaces the bot without the board or session start having to wait. If the token switches to a different bot application, the bot starts over with new status posts.

Commands and buttons (W-0037, design HS): `/works help` (German: hilfe), `status`, `tasks` (aufgaben), `new` (neu; title and priority), `instruct` (anweisung; to the task in progress or with `task`), `history` (verlauf; with `project` only one project); with the shared bot also `link` (verbinden) and `unlink` (trennen). With the shared bot, `/works history` appears only after the service has been restarted, because it registers the commands at start; the History button on the panel works right away. English names, German in a German Discord client; replies follow the language of the Discord client. With several projects, name it with `project` (the start of the name is enough). Buttons: review with "Accept" and "Back to Claude" (a dialog for the reason, which arrives as a comment), "Claude is done" with "Instruction for Claude" (dialog), CI red with "View bug". After accepting or returning, the buttons disappear. Only the registered user (the application owner with your own bot, whoever ran `/works link` with the shared one) can trigger anything; others get a refusal. Only the person who clicked sees the replies. The bot does not grant approvals from Claude Code. Actions go through the same API as the board: history entries with `[Discord]`, undo in the board, new tasks with `source: discord` and `incomplete: true` (complete them with the user at the next suitable moment). Accept works like `works done --confirm`; if the Definition of Done is not met, the bot says so instead of finishing.

How clicks arrive: your own bot registers `/works` for the channel's server and receives clicks through its gateway (Node 22 or later, otherwise there are no buttons). With the shared bot, the service answers immediately with a provisional reply, opens dialogs itself and puts the request into an inbox of the device that wrote the message (commands: the caller's most recently active device in the channel). The local bot fetches it by long poll, acknowledges it with the next poll (otherwise it arrives again) and replies through the service; the interaction token stays in the service. If the device is off, the service says so after 10 s; if it runs a works version without commands, the service suggests an update.

Log in `~/.works/discord/bot.log` (without the token).

Settings in the board (W-0038, design J2): Tools, "Discord bot" opens a dialog with the tabs Connection, Projects, Events (on and @ per event, quiet hours, delays, deletion period), Commands and Privacy, and on the right a preview of the message as in Discord and as it appears on the lock screen. The preview already uses the unsaved changes; saving writes `config.json` with the same keys as `works discord set`. The first time, the Connection tab guides through the choice from design R: shared bot with a code or own bot with a token. The token sits in a password field that is emptied after saving; token, key and code never appear in a board response, only `…abcd` is shown. Token, code and disconnecting only work directly on the computer, not via a shared link.

Channel choice (design K): the Connection tab reads servers and text channels live from the bot, by category. Whether the bot may write in a channel, works computes like Discord from roles and overwrites (view, send, embed links); channels without this permission are greyed out, with the reason. With the shared bot these are the channels of the linked server, the service checks the permission itself. "Move here" sets `channel_id` (with the shared bot the service moves the link first). The running bot reads `config.json` on every pass, creates the dashboard in the new channel, pins it and deletes the old one. Neither this nor any other setting needs a restart. In the terminal it works with `works discord channel`, for both ways.

Commands and buttons switch (W-0046): `commands` (default on), in the board on the Commands tab or with `works discord set commands=off`. When off, the bot shows no buttons and no select menu any more, on the dashboard (edited right away) and on new messages; older messages keep their buttons. The own bot unregisters `/works` for the server (empty list), even without a gateway. With the shared bot `/works` stays registered, because the service is one for everyone; the device then answers commands with a short note, as does the own bot for clicks on old buttons. On again: `/works` is registered, the buttons come back. Both without a restart.

Channel per project (W-0046, own bot only): on the Projects tab every project has a channel choice from the same list from the bot, the default is the channel above; channels without write permission cannot be chosen. Stored as `projects.<rootId>.channel_id` and `channel_name` in `config.json`, in the terminal with `works discord set project.<id>.channel=<channel id>` (empty: back to the default channel); works checks the channel and the write permission. Every project appears in the dashboard of its channel, and its notices go there too. When a project changes channel, the running bot creates a dashboard there, removes the project from the old one and deletes a dashboard that no longer has any project. The shared bot writes to exactly one channel, the linked one: there the choice is locked, `works discord set` refuses it, and own channels from the time with an own bot do not apply. The preview in the dialog names the project's channel.

## Playwright and browser tools

For before and after screenshots, see assets.md.
