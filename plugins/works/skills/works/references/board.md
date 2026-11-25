# Kanban board

The board shows all tasks as columns by status. In the live view the user can work there too: create tasks, move them, edit them, drop in images, maintain ideas and milestones. All changes go through the same CLI as in the terminal, so checks and history are identical.

## Two variants

| | Live view | File |
|---|---|---|
| Command | `works board --serve` | `works board` |
| Result | Local server, by default `http://127.0.0.1:4747/` | `.works/board.html` |
| Editing | Yes | No, view only with a notice |
| Updates | Continuous, also for manual edits to task.md, without reloading the page | File is regenerated after every CLI command, reload it in the browser by hand |
| Works without a process | No | Yes, also by double-click and offline |

## Starting the live view

When the user wants to see the board or maintain tasks themselves, start the live view.

In Claude Code, start it like this:

```
works board --serve --detach
```

The server then keeps running detached in the background, even after the session ends, and the command prints the URL. Tell the user that URL. If a server with the current version is already running for the project, no second one starts; only its URL is printed. A server of an older version is stopped and replaced by the current one.

More commands:

- `works board --status`: is a server running, which version, is it current?
- `works board --restart`: restart the server with the current version, same port.
- `works board --stop`: stop the server.

Without `--detach` the server runs in the foreground until it is stopped with Ctrl+C. That is meant for a separate terminal. With `--open` the default browser opens on the machine running the command, but only if the board isn't open in any tab there yet: open tabs keep a connection to the server, which it counts under `/tabs` (local only, links from other devices don't count). After a start or restart, `--open` waits up to three seconds, because open tabs then reconnect on their own. This also applies to a board that is already running. The tabs of all running boards are counted: if another project's board is open, `--open` opens nothing, because that tab switches to the hub on its own. With Remote SSH, don't use `--open`; point to the editor's port forwarding instead. A different local port is not a problem there.

Options:

- `--port 4800`: fixed port. Without it the board starts on its last used port (`.works/server-last.json`, local), on the first start on 4747; if that is taken, the next free one is used, also with `--detach`. That way an open tab reconnects after a stop and restart, even if the board starts via the hub. Restarts keep the port of the previous server.
- `--host 0.0.0.0`: make it reachable on the local network. Only when explicitly requested, because then anyone on the network who opens the page can change tasks.

## Demo to try it out

```
works demo --simulate --open
```

Creates a sample project `works-demo` in the temp folder with eleven tasks of all types, with images, ideas, two milestones, one overdue and one blocked task, and starts the live board. With `--simulate`, ten changes follow at intervals of `--delay` seconds (default 6), the way Claude makes them: start a task, tick a criterion, note a question, move to review, new task, raise priority, complete, write a handoff, drop. Afterwards everything can be tried out in the board.

Running it again resets the demo. `works demo --remove` stops the server and deletes the folder. A folder with a real `.works` is never touched; the demo recognizes its own folders by `.works/.demo`.

## Layout of the interface

- Header: project, connection status, view (Board, Sprint, Queue, Timeline, Dependencies, Table, Live, keys `1` to `7`), Tools, Search (key `/`), Next task, Ideas, Activity, Share, color scheme (System, Light, Dark) and New task (key `N`).
- Flow bar: distribution of all tasks across the statuses. A click jumps to the column.
- Notices below: open P1, blocked, overdue, tasks with open questions, incompletely captured ones, open tasks touching the same files (conflict radar: in progress, in review or in the queue, files from commits with the ID, changes in files.jsonl and the task.md, the same detection as `works parallel plan`; label "Same files as W-0015" with the files in the tooltip, in the live view "W-0012 and W-0015 change board.js") and quiet ones (in progress, but for `handoff_stale_days` days no reply, no file change, no ticked step and no change to the task.md). A click filters. Quiet cards carry a label like "Quiet for 4 days, no handoff", in the live view they are listed under "Waiting for you".
- Filters: priority, type, tag, milestone, archive and dropped. The milestone filter can also create milestones; when one is selected, "Edit milestone" appears.
- Progress: share of done tasks in percent, bars for done, in progress and review, and still open, fulfilled acceptance criteria, balance of the last 7 days, a forecast from the pace of the last 4 weeks and a history chart over 8 weeks (created versus done tasks). The display follows the filters: if a milestone is selected, it shows that milestone's progress including its target date. Dropped tasks don't count, done ones in the archive do.
- Columns with cards. Cards show ID, type, effort, priority (as colored text and a thin line at the top of the card), title, latest image, progress of the acceptance criteria, blockers, due date, open questions, milestone and tags.

## Views

- **Board**: columns with cards as above.
- **Sprint**: period, goal, capacity in points, burndown and suggestions for planning in. See planning.md.
- **Dependencies**: graph from left to right in stages. The critical path (longest chain of open tasks by estimate) is orange; on the right are its duration and the task that unblocks the most. Dragging the + on a card onto another one creates "blocked".
- **Queue**: the order in which Claude should work. Add tasks to the queue (dropdown, detail panel or table), sort by dragging or with arrows, remove with ×. At the top is what is running right now. On the right the settings: continue after completion (`auto_next`), ask first (`ask_before`), skip blocked ones (`skip_blocked`), plus what Claude takes next and the effort in the queue. Done and dropped tasks drop out automatically. In the CLI: `works queue`.
- **Timeline**: weeks with calendar week number, grouped by milestone. Solid bars are running or done, dashed colored ones are planned with a due date, dashed gray ones are estimated from the effort (S 2, M 5, L 10, XL 15 days, blocked ones start after their dependency). Line for today, dashed green line for a milestone's target, overdue in red. Dragging the right end of a bar sets the due date.
- **Table**: all filtered tasks with sortable columns. Change priority, effort and due date directly in the row. Select several (Shift selects a range), then in the bar at the bottom set priority, status, milestone, effort or tags, add to the queue, drop or archive. Completing deliberately only works one at a time via the Definition of Done.
- **Live**: what Claude is doing right now and how far the day's tasks are. Only in the live board, not in `board.html` and the export. Layout in the section Live view.

## Live view

Four tiles at the top:

- **Claude is working**: task, step in the implementation plan and the running tool call with its runtime, for example "Command npm test, for 1:12". Between two calls it says "Claude is thinking" with the last call, after a reply ends "Claude waiting since 14:03". If Claude asks for an approval, the tile turns yellow and shows "Claude is waiting for your approval" with command and waiting time. A click makes the view follow Claude again.
- **Progress today**: how many tasks of the day list are finished (review or done), with one segment per task. Below it "Usage today" with tokens and estimated cost of the day, as soon as the Stop hook has recorded something.
- **Parallel**: agents in their own worktrees and what they are working on.
- **Waiting for you**: pending approvals (always first, "W-0152: approval for a command"), tasks in review, findings and failures in checks, open questions on tasks in progress, one line per task and kind ("W-0152: 45 checks failed"), at most four lines, below them "and N more items". A click selects the task.

Below that, on the left, the day list: tasks in progress (the main session's first, then agents), in review, in the queue and done today. In the middle the selected task with its usage so far in the header (tokens and estimated cost), phase bar (Started, Implementation, Checks, Review, Done), implementation plan with the time each step was ticked, acceptance criteria, "Right now", history (this task or all; entries with a changed file expand their diff on click: uncommitted state against the last commit, for parallel tasks from their worktree, new files with their whole content, otherwise the task's changes; not in the read link) and the field "Instruction for Claude". On the right all checks of the day list: running ones with runtime, findings with "Let Claude fix it" and "Mark as known", failures with the last lines of output, not yet run ones as a short line, passed ones collapsed.

**In the background**: above the checks are commands Claude started with `run_in_background` or that moved to the background after their timeout, a long selftest for example. Each one shows task and description (without a description the start of the command), while it runs with its runtime, afterwards with exit code and duration, green for 0, red otherwise. At most ten, newest on top. Finished ones disappear an hour after they ended; anything still "running" after twelve hours counts as orphaned (for example when the session ended without an exit line) and drops out as well. Without such commands the section is missing.

If a task has more than 8 checks, the column shows a summary instead of one line per check: counters (failed, finding, passed, running, pending) and a strip with one mark per check, below it the check currently running with its runtime. Failures with the same first output line are grouped on one card ("44 checks, same message") with the first ten names, the output of the first one and a button "Let Claude fix it" that writes one comment for the whole group. Findings are listed individually, passed ones as one line. "Show all N checks" expands the complete list.

**History, flaky, runtime**: `checks.json` remembers the last five runs per check with result and duration (`hist`); a changed command starts from scratch. In a check's row, small marks show these runs (newest on the right); on the right only the duration is shown, since the state is already in the icon. "flaky, 2 of 5 red" appears when a check switched between passed and failed at least twice in these runs without the code changing in between (same fingerprint). Broken and then fixed is therefore not flaky. An arrow at the duration marks a clearly slower (↑) or faster (↓) run: at least 1.5 times as long or short as the median of the passed runs before it, and at least 5 seconds difference. With many checks, flaky names are marked with "~" in the failure group, below that one line each for "N flaky" and "Slower than usual".

**Re-run**: every failure group has a "Re-run" button next to "Let Claude fix it", every red row a link for it, and from two failures on there is "Re-run all N failed" above the list. Only these checks run (`works checks run <ID> --only ...`), passed results stay. Every result remembers the code state it ran on: if the code has changed since, the remaining results count as outdated for the Definition of Done, and `works done` runs them again. Skill checks like code-audit get no button, Claude enters those. The run can be watched live; while it runs there are no buttons. Only in the local board, not in the read link. Expanded output and lists stay open across updates.

The phase "Checks" depends on whether a check is running right now, not on the status. Checks often only run during the acceptance review in Review.

The middle follows the task Claude is working on. If you select a task yourself, it stays until it drops out of the day list or the view should follow Claude again (tile or pill in the header). The browser remembers the selected task and the history filter. With a shared read link, the instruction field, acceptance review and the buttons on findings are missing. With reduced motion, dots and spinners stand still; screen readers announce when a step is done, checks are finished, a task is waiting for acceptance review or Claude needs an approval.

When Claude is waiting for an approval, the task's Right now box and its row in the day list show it too. The Live tab gets a calm yellow dot instead of the pulsing one, the pill in the header says "Waiting for your approval (W-0152)" and the window title gets "Approval" at the front, also in the other views. Approving or denying only works in the Claude window. "Notify me in the browser" in the Right now box turns on the browser notification for it (remembered in the browser, like the other notifications under Tools). After an approval the display stays until the call ends, because Claude Code doesn't report the moment of approval.

Where the data comes from: tool calls from the PreToolUse, PermissionRequest and PostToolUse hooks (`activity.json`), times of ticked steps from `steps.json` (the task.md doesn't store them; several ticks between two observations get the same time), check state from the task's `checks.json`, usage from the usage entries in `time.jsonl` (the Stop hook writes them after every reply, the board only rereads the file when it has changed; cost according to `config.prices`, see planning.md). A check run that has been "running" for more than 11 minutes counts as aborted. Background commands are entered in `activity.json` by the PostToolUse hook (`background`); whether one is still running and which exit code it ended with, the board reads from the last bytes of its output file, which Claude Code writes to `<tmp>/claude/<project>/<session>/tasks/<id>.output` and closes with "[exited with code N]". Only files there that end in `.output` are read, and only the exit line; neither path nor output reach the board, the read link included. If the file is missing, the command counts as ended without exit code. If the hook found no file at the start, the state stays unknown. When a command ends, the board reloads by itself.

The detail panel has the tabs **Overview**, **Comments** (conversation with Claude, see planning.md), **Time** (Claude's active time, days per status, sessions) and **Code and commits**. At the bottom there is "Save as template".

Above the progress, the **Views** row shows saved filters as chips; "Save current filters" appears as soon as filters are set. Above the timeline, "How good are the estimates?" shows estimate versus actual duration.

The icon with the sliders in the header opens the **Tools**: weekly report (schedule, Discord, content, view reports), templates (create, edit, use), checks before completion, checks in the project (per check across all tasks: share of red with runs in the tooltip, median runtime with an arrow for clear deviations, recent runs and flaky; sortable by often red, slow, flaky; the first ten, the rest expandable) and browser notifications (approval, review, question or comment from Claude, new P1, blocker resolved, queue empty, sound and counter in the tab title).

At the top of Tools, **Discord bot** (only in the live board with editing) opens the dialog for the bot from design J2: tabs Connection (state, first-time setup with the shared bot and a code or an own bot and a token, channel choice live from the bot with "Move here"), Projects (notices per project on or off, with an own bot one channel per project; locked with a note for the shared bot), Events (on and @ per event, quiet hours, delays, deletion period), Commands (switch "Allow commands and buttons", when off without buttons and without `/works`) and Privacy. On the right is a preview of the selected message as in Discord and as it appears on the lock screen, already with the unsaved changes. At the bottom the dialog counts the changes; saving takes effect without restarting the bot. Token and keys are only shown masked. Details in integrations.md.

New tasks: if there are templates, the dialog first asks for a template or "Blank". With a template there are the template's fields, the free field "What exactly should happen?" and the criteria to select and deselect.

In the detail panel, the **Code and commits** tab shows the task's branch (from the `branch` field or the ID in the branch name), how far it is ahead of the main branch, a pull request (if `gh` is logged in), all commits with the ID in the message and the changed files. A click on a file shows the diff. If you are currently on the branch, uncommitted changes are listed separately.

## Sharing

- **On the network, live and read-only**: in the board click Share, then "Share on network", or `works board --restart --share`. The server then listens on all addresses and prints a link like `http://192.168.1.20:4747/?view=KEY`. Whoever opens it sees board, timeline, table, details and code live, but can't change anything. Without a key there is no access.
- **Your own other devices**: the edit link (`?key=…`, in the Share dialog under "Link with edit rights" or `works share --owner`) allows everything. Don't pass it on.
- **Renew links**: `works share --rotate` or in the dialog. Old links stop working afterwards. The keys are stored in `.works/share.json` and excluded from Git.
- **Stop sharing**: `works board --restart --private` or in the dialog.
- **Snapshot**: `works export` or in the dialog. A single HTML file with all tasks, details and embedded images that opens without a server and without internet. Ideal for people outside the network.
- Hosting on the internet is not built in yet. Don't simply forward the port to the internet; tunnels and reverse proxies are treated as external access and also need a key.

## Quick search

Briefly pressing and releasing the right Shift key, or Ctrl+K (Cmd+K on the Mac), opens a search like on GitHub.

- Without input: open tasks by importance and frequent commands.
- Text: searches ID, title, tags, type and milestone. Enter opens the task.
- `#`: tags, Enter filters by them.
- `>`: commands, such as New task, Ideas, Color scheme, filter by priority or milestone, Jump to column.
- Arrow keys select, Esc closes.

Typing capital letters with the right Shift key opens nothing, because another key is pressed at the same time. In input fields the Shift shortcut is off; Ctrl+K still works there.

## Editing in the board

| Action | How | What happens behind it |
|---|---|---|
| Create a task | "New task" or `N`: type, title, priority, column, effort, risk, due date, milestone, tags, dependency, description with everything relevant, acceptance criteria | `works new`, then `section` and `item`. Without a description or criteria the task is marked incomplete |
| Quick create | `+` in Backlog or Planned, enter a title, Enter | `works new` with feature and P3 |
| Move | Drag the card into another column or choose the status in the detail panel | See table below |
| Change fields | Detail panel: title, status, priority, type, effort, risk, due date, milestone, tags | `works set` |
| Content | Goal and other sections via "Edit", Markdown, Ctrl+Enter saves | `works section` |
| Checklists | Tick, add and remove acceptance criteria and implementation plan items | `works check`, `works item` |
| Open questions | Note them, mark as resolved with an optional answer | `works question` |
| Handoff | Read and edit | `works handoff` |
| Images | In the detail panel paste with Ctrl+V, drag in or choose a file, give kind and description | Upload to the inbox, then `works asset` |
| Dependencies | Waiting for, Blocks, Related to another task | `works link`, `works unlink` |
| History | Write a note | `works log` |
| Archive | For done and dropped tasks | `works archive` |
| Ideas | Note them, turn them into a task (choose type and priority), drop them | `works idea`, `promote`, `idea-drop` |
| Milestones | Create in the milestone filter, edit the selected milestone, or via the quick search | `works milestone add`, `milestone set` |
| Next task | Suggestions with reasons, start directly | `works next`, `works start` |
| Choose design variants | Design variants tab of a design task: design direction, variants as preview, "View large", "Pick this one" with an optional reason | `works design choose` |
| Acceptance review | In Review "Acceptance review": chosen variant or Before next to the result, check the criteria. For variant versus result, width (Desktop, Tablet, Phone) and scheme (light, dark) apply to both sides: the variant renders that way, next to it the After image with `-light-1440`, `-dark-390` etc. in its name; if it is missing, the command to create it is shown there. "Accept" opens the Definition of Done, "Back to Claude" requires a text | Comment to Claude, deselected criteria reopened, status In progress |
| Instruction for Claude | On the active card or in the overview of a task in progress | `works instruct`, Claude receives it via the PostToolUse or Stop hook |
| Undo | Message after every change with "Undo", `Ctrl+Z` outside text fields, list under Tools, Recent changes | `works undo` |
| Project knowledge, cleanup | Tools, at the top | `works know`, see planning.md |
| Import | Tools, at the top, or quick search: choose a file, preview with selection, column and tags for all | `works import --apply --only`, see import.md |
| View parallel work | Tools, Parallel work: running lanes and the assessment for the next tasks | `works parallel status`, `works parallel plan` |
| Recurring, GitHub, calendar, usage | Sections under Tools | `works recur`, `works github`, `kalender.ics`, `works time` |

Moving in detail:

| Target | Behavior |
|---|---|
| In progress | `works start`. If the task is blocked, the board asks and only starts after confirmation with `--force` |
| Done | Definition of Done dialog: automatic items with result, manual items to tick. Completing only once all manual items are confirmed. If automatic items are missing, only with a reason, which goes into the history |
| Dropped | Only with a reason |
| Back from Done or Dropped | Only into an open column and with a reason (`works reopen`) |
| All others | `works set status=...` |

Every history entry from the board ends with `[Board]`. That way the task.md and the activity list show what the user changed themselves.

## Updates

After a plugin update everything switches to the new version on its own:

| Where | What happens |
|---|---|
| Running server | Checks every 30 seconds whether a newer version is installed (via `~/.claude/plugins/installed_plugins.json`, otherwise the plugin folders). If it is the same in two checks in a row, it starts the new version on the same port and exits |
| Session start | The SessionStart hook replaces servers with an outdated version, including those from works versions before this feature, and regenerates WORKS.md and an existing board.html |
| Open tabs | Detect the new version, remember search, filters, opened task and scroll position, and reload once. If a text is being edited, the reload waits until it is saved or discarded |
| board.html | Generated with the new version at session start and after every writing command. A tab that already has the file open must be reloaded by hand |

The version is a hash over all scripts and board files. So it changes with every update, even without a version number in plugin.json. The server is registered in `.works/server.json` (PID, port, version), output goes to `.works/server.log`. Both are listed in `.works/.gitignore` and added there if needed.

Tabs opened with a works version without this feature don't know the automatic reload yet. They need F5 once after the update.

## Claude is working

While Claude works on a task, the header shows "Claude is working on W-0003, for 6 min" (a click opens the live view, in the static board it jumps to the card), and the Live tab carries a pulsing dot. The active card shows the current step and the last three, for example "Edited src/backup.ts" or "Command npm test", plus the button "Instruction for Claude". If Claude is waiting for an approval, it says "Waiting for your approval (W-0003)" and the dot on the tab doesn't pulse. The data comes from the hooks PreToolUse (call starts), PermissionRequest (approval needed) and PostToolUse (call finished) in `.works/activity.json` (local). After ten minutes without a tool call the display disappears, a pending approval after 60 minutes.

Instructions go to `.works/instructions.json` and as a comment on the task. Claude receives them as context with the next tool call, at the latest at the end of the reply, and reads them when it makes sense. Until then the board shows "waiting".

## Files and parallel work

The Code and commits tab shows, under "Also in other tasks", files that other tasks changed as well, with a jump there. If the task runs in parallel, its worktree is shown there too, with commits and uncommitted files. Cards of parallel tasks carry "Parallel" and show the current step of their agent.

## Backup and restore

Under Tools (and in the command palette), "Backup and restore" opens a dialog with two tabs:

- **Export:** download the board as one JSON file. You can choose open, done and archived tasks, comments and decisions, history and handoffs, check results, planning (milestones, sprints, queue, recurring), project knowledge and ideas, and images and design variants. The file size is shown alongside. Tasks are contained as their files verbatim, so export and import produce the same state.
- **Import:** choose such a file. The board shows where it comes from and the comparison: new, changed, same, only here. Same means same ID and same title (or same title under a different ID).
  - **Merge** creates the selected new tasks with free IDs (references like blocked_by are updated accordingly) and takes over the selected changed ones. What exists only here stays, planning and project knowledge stay unchanged.
  - **Restore** first backs up the entire current state including images in `.works/backups/` and then replaces tasks, archive, planning, project knowledge and ideas with the file. Tasks that existed only here are gone afterwards, but are kept in the backup.

Both can be reverted with Undo; after a restore, Undo brings back the backup from `.works/backups/`. In the terminal: `works export --json` and `works import <file.json>` (see cli.md).

## Undo

Before every change from the board, works backs up the affected files in `.works/.undo/` (local, the last 50). Undo restores them, brings back archived folders and removes tasks that only came into existence through the change (they go to `.undo/entfernt/`). Changes by Claude or from the terminal don't go through this path; that's what Git is for. `works undo --list` and `works undo <key>` do the same in the terminal.

## Calendar

`http://127.0.0.1:4747/kalender.ics` provides due dates, milestones and sprints as a calendar to subscribe to, with `?recurring=1` also upcoming recurring tasks. In shared mode the same address works with the read key (`?key=`). Internet calendars like Google Calendar can't reach the machine; for those, use `works ical --out dates.ics` and import the file.

## All projects

The hub shows all running boards of the projects registered in `~/.works/projects.json` (at init, at session start and when a board starts), and below them the stopped projects with "Open board". Every running board serves it under `/hub`, `works hub` shows the same page on port 4740.

- Header: totals across the running boards (open tasks, P1, pending approvals, review, usage today in money and tokens).
- Stopped projects (W-0049) as narrow rows: name, path, last opened, "Open board". The button starts the board on a free port (its last one first) and shows it in the same tab.
- Running boards as large cards: live line (Claude is working, waiting for approval, in progress), open, in progress, review, P1, overdue, progress (sprint or overall), next up, usage today, running since and port, CI from the GitHub sync, whether the version is current.
- Buttons: Open (in the same tab), In new tab, Restart, Stop.
- The page fetches its content again every 5 seconds. When a board ends, it disappears from the list.
- Notifications for pending approvals: below the header, a bar asks once whether the hub should notify (Turn on, Not now). After that only the bell "Notifications on/off" is shown there. If Claude is waiting for an approval in a project and the hub tab is in the background, a browser notification with project and command appears, exactly once per approval; a click opens the board. What is already waiting when the page loads is not reported. The choice is stored in the browser (`works-hub-notify`).

Hub as the entry point (W-0049): if a board of another project is already running, `works board --serve` (also with `--detach` and at session start) starts no second server but prints the address of that board's hub; there "Open board" starts this project. Open works tabs of the running boards switch to the hub right away, also without `--open` (W-0057); if none is open, `--open` opens the hub in a new tab. `--port`, `--restart`, `--takeover`, `--share` and `--no-hub` start the board directly as before.

Automatic behavior: with only one board running, the hub only shows up when it is called (to reach the stopped projects). When another board starts (with `--no-hub`, `--port`, via "Open board" in the hub or any other way), its server notifies the other running boards right away, and their open works tabs switch to `/hub`, including tabs that were opened from the hub (W-0057). If an unsaved input is open in a tab (title, section, comment, file), its switch waits like the reload after an update until the input is saved or discarded; the header says so. A restart of the same board (`--restart`, new version) is not another board and switches nothing. As a fallback, the board page asks `/boards` every 5 seconds and switches as soon as a board shows up that wasn't running at its first query; a board that was missing for less than two minutes counts as restarted. So a tab that was just opened for the new board, for example from the hub, stays on it. If the hub goes from two or more running boards down to one, it closes and the tab shows that board; if the board serving the hub ends, the tab switches to the remaining one after about 15 seconds without a response. At the top left the board shows `← Hub (N boards)` as long as at least two are running.

Orphaned tabs: if a board ends and another project starts on its port, the old tab reconnects but doesn't silently show the other board. Every page knows its project (`meta.rootId`, a hash of the path). If it doesn't match, a bar appears at the top saying "<project> is no longer running here" with "Start <project>", "To hub" and "View <other project>"; the last state stays grayed out and locked. The tab closes its connection and doesn't count as open at the other board (so `--open` opens its own tab there). When its own board runs again, it switches there on its own. For this, `/boards` returns, next to the running boards, the registered projects with path and the token, local only.

`/boards`, `/hub` and the buttons (`POST /api/hub` with token) only work directly on the machine, not via shared links. The buttons run `works board --serve --detach --no-hub`, `--stop` or `--restart` in the project folder; "Open board" waits until the board runs and returns its address. `works hub --list` prints the projects as text.

## Important for Claude

- If the user says the board looks old or behaves wrongly, first `works board --status`, then `works board --restart`, and ask the user to reload once any tab that still shows a very old version.
- Reread a task.md before every edit to it. The user may have changed it in the board in the meantime.
- Tasks with `source: board` or `source: discord` and `incomplete: true` were created quickly by the user. At a suitable moment, clarify goal and acceptance criteria with them.
- Open questions the user notes in the board are often addressed to Claude. When starting such a task, address them first.
- The queue is an assignment from the user. When working through it, always take the topmost startable task and respect the settings `auto_next` and `ask_before`.
- When sharing, give the read link; give the edit link only if the user explicitly asks for it.
- If the user sends a task back in the acceptance review, treat the comment as a requirement, implement it and reply with `works comment`.
- Don't ignore an instruction during the work, even if it doesn't fit right away. Pick it up after the current step at the latest and reply briefly.
- Images that come in via the board have a description from the user. If it is missing, look at the image with Read if needed and add the description.

## Live updates

- The server checks task.md, decisions.md, assets, config.json, state.json and ideas.md every second. On changes it regenerates WORKS.md and an existing board.html and reports them to all open tabs.
- Moved cards slide into the new column, the target column lights up briefly. Changed cards carry a label like "In progress → Review" or "Priority P3 → P2" for ten seconds.
- Changes by Claude or from the terminal also appear as a notice at the bottom right with the latest history entry. Your own changes in the board are confirmed by a short message.
- The activity list collects all changes with time and origin and stays stored in the browser.
- While a card is being dragged, the update waits until it is dropped. If a text is being edited in the detail panel, it isn't overwritten; instead "Reload" appears.
- With reduced motion in the system settings, animations are off.

## Security

- By default the server binds only to 127.0.0.1 and only accepts requests with a local host name. This prevents DNS rebinding.
- When sharing (`--share`), only local requests without proxy headers automatically get full rights. All others need the read or edit key from the link; after that it is sent along as an HttpOnly cookie. Readers get their own token with which the server only accepts GET requests. Export and sharing settings are reserved for the owner. Running or changing checks and setting the Discord webhook only work for local requests, not even with the edit link.
- Every API request needs a random token that is generated at every server start and only embedded in the delivered page. Other websites can't read it and therefore can't change anything. A different origin is rejected as well.
- All input is validated (IDs, values, lengths, image types up to 20 MB) and passed to the CLI as individual arguments without a shell.
- Only the board, data and files under `tasks/`, `archive/` and `reports/` as well as WORKS.md and ideas.md are served. config.json, state.json, share.json, activity.json, instructions.json, github.json and `.undo/` stay blocked.
- Git is called without a shell with fixed arguments and a time limit, diffs only for files that belong to the task, and cut to 400 lines.
- Temporary files sit briefly in `.works/.tmp/` and are deleted right away.
- HTML mockups from `design/` run in an iframe with `sandbox="allow-scripts"` and their own Content Security Policy. They have no access to the board, its tokens or cookies and must not be embedded in other pages.
- Only the owner may configure the Discord bot (`/api/discord`). Token, code and disconnecting only work for local requests, so the token never travels unencrypted over the network; token, device key and codes appear in no response, only masked.
- The GitHub sync and its settings only work for local requests, because they act via the gh CLI with the user's rights. The calendar address needs the read key in shared mode.
- The hub (`/hub` on the board, `works hub`) is only reachable locally, checks the host name and starts, stops or restarts boards only with the token from its own page, and only for registered projects.

## Milestones

Milestones group tasks toward a goal, such as a release or a launch. In the board they appear as a filter; with a milestone selected, the progress display shows its state. They are created in the board or with `works milestone add M1 --title "Launch" --due 2026-11-15`, assigned in the detail panel or with `works set <ID> milestone=M1`. Dropped tasks don't count.

## Appearance

The interface lives in `scripts/board/` (template.html, board.css, board.js) and is combined with the embedded font Geist (SIL Open Font License, see `scripts/board/fonts/Geist-LICENSE.txt`) into a single HTML page. No external resources are loaded. With the environment variable `WORKS_DEV=1` the server rereads the files on every request, handy when adjusting the design.
