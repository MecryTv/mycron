# CLI reference

Usage: `node "${CLAUDE_SKILL_DIR}/scripts/works.mjs" <command> [arguments]`. Requires Node.js 18 or newer, no dependencies. Works in the nearest parent folder that has `.works/config.json`.

Values that might start with `--` are best passed as `--name=value`. If the environment variable `WORKS_ACTOR` is set, its value is appended in square brackets to every history entry (the board sets `Board`).

IDs can be given in short form: `12`, `w12`, `W-12` and `W-0012` are equivalent. Lists are comma-separated. Dates use the format `YYYY-MM-DD`.

Status, risk and asset kind accept English input: `planned`, `in-progress`, `done`, `dropped`; `low`, `medium`, `high`; `before`, `after` and so on. The files store the German values (`geplant`, `in-arbeit`, `erledigt`, `verworfen`; `niedrig`, `mittel`, `hoch`), German input works as well.

## Setup

| Command | Effect |
|---|---|
| `init [--gitignore default\|assets\|all\|none] [--prefix W] [--path dir] [--force]` | Creates `.works/` with all subfolders, config.json, ideas.md and WORKS.md |
| `install-hooks [--claude] [--git] [--scope user\|project\|local] [--dry-run]` | Sets up the hooks, see hooks.md |
| `install-cli [--dir folder] [--no-path] [--dry-run] [--uninstall]` | `works` command in the terminal without Claude: launcher in `~/.works/bin`, shim in `~/.local/bin` (Windows: `works.cmd` and `works.ps1` in `%USERPROFILE%\.works\bin`), PATH entry if needed. The launcher always uses the newest installed version. `works which` shows the installation in use |
| `lang [de\|en] [--project] [--reset]` | Language of CLI, hooks, docs and new tasks. `lang` shows the configured language, where it comes from and which ones are available. `lang de` switches globally (`~/.works/settings.json`), `lang de --project` only for this project (`.works/config.json`), `lang --reset [--project]` removes the setting. Precedence: environment variable `WORKS_LANG`, project, global, otherwise English. See config.md |
| `version`, `--version` | Version and path of the CLI |

## Capture

| Command | Effect |
|---|---|
| `new --type <type> --title "..." [options]` | New task from a template. Options: `--priority P1..P4` (default P3), `--effort S\|M\|L\|XL`, `--risk low\|medium\|high`, `--due`, `--milestone`, `--tags`, `--blocked-by`, `--blocks`, `--related`, `--source`, `--status` (default backlog), `--incomplete`, `--decisions` (creates decisions.md), `--log-file path` (bug log), `--context "..."` (Origin section) |
| `idea "Text" [--tags a,b]` | Idea in ideas.md |
| `ideas` | Show open ideas |
| `promote I-001 [--type ..] [--priority ..] [--title ..]` | Idea becomes a task (marked incomplete) |
| `idea-drop I-001 [--reason ..]` | Drop an idea |
| `scan [--create] [--marker FIXME,HACK] [--json]` | Find TODO, FIXME, HACK, XXX in the code and optionally create tasks |
| `gh-import [--state open\|closed\|all] [--limit 100] [--dry-run]` | Import GitHub issues via the gh CLI |
| `gh-export <ID> [--dry-run]` | Create a GitHub issue from a task (only with consent) |

## View

| Command | Effect |
|---|---|
| `list` | Open tasks by priority. Filters: `--status`, `--priority`, `--type`, `--tag`, `--milestone`, `--blocked`, `--overdue`, `--incomplete`, `--all` (including done and archived), `--json` |
| `show <ID> [--section "Name"]` | Whole task.md or one section |
| `next [--n 3]` | Recommendation for the next task with reasons |
| `status` | Short overview as at session start |
| `index` | Regenerate WORKS.md |
| `board [--open]` | Generate `.works/board.html` and optionally open it in the browser. From then on the file is regenerated after every change |
| `board --serve [--detach] [--port 4747] [--host 127.0.0.1] [--open]` | Live board on a local server, in the background with `--detach`. If an up-to-date server is already running, only its URL is printed; an outdated one is replaced. Without `--port` it uses its last port (otherwise 4747); if that is taken, the next free one. `--open` only opens a tab if no works tab is open yet, including one of another project. If another project's board is already running, no second one starts: the output names that board's hub, where "Open board" starts this one (W-0049); `--no-hub` starts it anyway. Either way, open works tabs of the other running boards switch to the hub right away, also without `--open` (W-0057). See board.md |
| `board --status` / `--restart` / `--stop` | Query the server, restart it with the current version, or stop it |
| `board --restart --share` / `--private` | Share on the local network (read link with key) or go back to local only |
| `share [--owner] [--rotate]` | Show sharing links, with `--owner` also the edit link, with `--rotate` new keys |
| `export [--out file.html] [--no-images] [--open-only]` | Snapshot as a single HTML file with details and embedded images, by default in `.works/reports/` |
| `export --json [--out file.json] [--open-only] [--archive] [--images] [--designs] [--checks] [--no-comments] [--no-history] [--no-planning] [--no-knowledge]` | The board as a JSON backup (format works-board): tasks as their files, planning from config.json, project knowledge and ideas; images and design variants only on request. Read back with `import` |
| `sprint [start\|add\|remove\|set\|close\|list]` | Plan and track a sprint, see planning.md |
| `comments [<ID>]` / `comment <ID> "Text"` | Read comments (marks them as read) and reply |
| `views` / `list --view "Name"` / `views delete "Name"` | Saved views |
| `template list\|show\|save\|delete` | Manage templates |
| `new --template <slug> --field K=V --text ".." [--criteria 2,3]` | Task from a template |
| `time [<ID>] [--mode measured\|fixed] [--json]` | Time tracking and estimation accuracy |
| `time --today [--json]` | Today's usage: tokens and estimated cost |
| `checks [detect [--save]\|set\|remove\|run <ID>\|record\|ack]` | Automatic checks before completion. `set name=command --cwd folder` sets a working folder relative to the project, `set --file file.json` sets several at once (name to command or to `{ "cmd": "..", "cwd": ".." }`, an empty value removes it) |
| `report --week [--summary ..] [--send]`, `report --settings ..`, `report --webhook URL` | Weekly report as Markdown and HTML, optionally to Discord |
| `queue` | Show the user's queue (`--json` for machines) |
| `queue add <ID> [--pos N]` / `remove <ID>` / `move <ID> <N>` / `order A,B,C` / `clear` | Edit the queue |
| `queue set auto_next=true ask_before=true skip_blocked=true` | Set what happens after a task is done |
| `demo [--simulate] [--delay 6] [--open] [--port ..] [--path folder]` | Create a sample project (default: temp folder `works-demo`) and start the live board. `--simulate` plays back ten typical changes by Claude. Never overwrites a real `.works` |
| `demo --remove [--path folder]` | Stop the demo server and delete the demo folder |
| `milestone list` | Milestones with progress |
| `milestone add M1 --title ".." [--due ..] [--desc ..]` | Create a milestone |
| `milestone set M1 status=done due=2026-12-20` | Change a milestone |

## Edit

| Command | Effect |
|---|---|
| `set <ID> field=value [field=value ...] [--reason ".."]` | Change frontmatter fields, adds a history entry. `status=done` only via `done`, `status=dropped` only with `--reason`. Clear with `field=` or `field=-`. Custom fields with `--custom` |
| `log <ID> "Text"` | History entry |
| `section <ID> "Name" --text ".." \| --file path` | Replace the content of a section. Without text the section is printed. History and Assets are excluded |
| `check <ID> <n> [--section "Acceptance criteria"] [--undo]` | Tick a checklist item or reopen it. Counting starts at 1, comments don't count |
| `item <ID> "Text" [--section "Acceptance criteria"]` | Append an item to a checklist. Remove with `--remove <n>`. Sections: Acceptance criteria, Implementation plan, Checklist, Approach |
| `question <ID> "Question"` | Add an open question |
| `question <ID>` | Show open questions, numbered |
| `question <ID> --resolve <n> [--answer ".."]` | Tick a question, append the answer |
| `link <A> blocks\|blocked-by\|related <B>` | Set a relation on both sides, cycles are rejected |
| `unlink <A> <relation> <B>` | Remove a relation |
| `start <ID> [--git] [--force]` | Status in progress, active task, branch suggestion, context output. `--git` checks out the branch, `--force` starts despite a blocker |
| `handoff [<ID>]` | Show the handoff (without ID the active task) |
| `handoff <ID> --text ".." \| --file path` | Replace the handoff |
| `dod <ID> [--json]` | Show the Definition of Done and check the automatic items |
| `done <ID> [--run] [--confirm] [--force --reason ".."] [--no-checks]` | Complete. Without `--confirm` it only checks. Configured checks (`checks`) run automatically if there is no result for the current state. `--run` also runs `dod.commands` |
| `ship [<ID>] [--no-push] [--no-ci] [--no-update] [--no-open]` | Completion in one go on the feature branch: Definition of Done, no uncommitted or new files outside `.works`, stop the board (restarted on the same port on abort and at the end), reset `WORKS.md` and `time.jsonl` (new times are kept), merge with `--no-ff`, `done --confirm`, commit `.works`, push, delete the branch, wait for CI (ci-watch), update plugins in marketplace repos, restart the board. Stops with exit 1 if anything is off. Skill `works:ship` |
| `drop <ID> --reason ".."` | Drop |
| `reopen <ID> --reason ".." [--status backlog\|planned\|in-progress\|review]` | Reopen, brings it back from the archive |
| `archive [<ID> ...] [--all] [--older-than <days>]` | Move done and dropped tasks to `archive/` |

## Assets and decisions

| Command | Effect |
|---|---|
| `asset <ID> <path\|inbox-file> --desc ".." [--kind ..] [--alt ..] [--name ..] [--move] [--compress] [--origin ..]` | Copy a file to assets/ (move it out of the inbox), rename it and add it to the task.md with a description |
| `shot [board\|sprint\|queue\|timeline\|graph\|table\|live\|<ID>] \| --url <address\|file> [--widths 1440,390] [--themes light,dark] [--out folder] [--name ..] [--asset <ID> --kind before\|after --desc ".."]` | Screenshots with the installed Chrome via Playwright: a board view, the detail of a task, or a page of the project. Reports horizontal scrolling and errors (exit 1), exit 2 without Playwright. `--name` sets the file name (`<name>-<scheme>-<width>.png`), otherwise URL, view or ID. With `--asset` attached to the task as an image, the name carries scheme and width (for the comparison in the acceptance review). `--scenario <file.mjs>` sets up a state in throwaway projects first and cleans up afterwards, see `references/scenarios/README.md`. Without a running board server, works starts one and stops it afterwards |
| `inbox [--json]` | Show files in the inbox |
| `compress [<ID>]` | Shrink images with sharp |
| `decisions <ID>` | Create decisions.md if missing and print its path |
| `decisions <ID> --add "Title" [--decision ..] [--why ..] [--rejected "A: reason,B: reason"] [--context ..] [--consequences ..] [--source ..]` | Append a new E block |
| `attach-doc <ID> <path> [--mode link\|copy\|move] [--label ..]` | Link or take over a document, entry under Sources in decisions.md |

## Analysis

| Command | Effect |
|---|---|
| `commits <ID> [--write]` | Commits with the ID, with `--write` as a section in the task.md |
| `changelog [--since ..] [--until ..] [--milestone ..] [--version ..] [--include-internal] [--write]` | Changelog from done tasks, with `--write` at the top of CHANGELOG.md |
| `report [--days 7] [--write]` | Report, with `--write` to `.works/reports/` |
| `doctor [--fix] [--strict] [--quiet]` | Consistency check. `--fix` corrects next_id, one-sided dependencies and an invalid active task. `--strict` treats warnings as errors |

## Design variants

| Command | Effect |
|---|---|
| `design [show] <ID> [--json]` | Show design direction, variants, brainstorming and choice |
| `design direction <ID> [--file path] [--text ..] [--colors "Name #hex,.."] [--fonts "A,B"] [--source ui-ux-pro-max]` | Save the design direction |
| `design add <ID> --name A --title ".." --file path [--note ..] [--source ..]` | Attach a variant as HTML, image or file. Warns if an HTML variant loads local files the board doesn't show |
| `design brainstorm <ID> --file path [--title ..] [--source superpowers]` | Attach a brainstorming document |
| `design choose <ID> <Name> [--reason ..]` | Choose a variant, goes into decisions.md |
| `design remove <ID> <Name>` | Remove a variant |

## Project knowledge, instructions, recurring tasks

| Command | Effect |
|---|---|
| `know [list] [--json]`, `know search <Text>` | Read project knowledge |
| `know add --area ".." --title ".." --text ".." [--file path]` | Create an entry |
| `know propose --area ".." --title ".." --text ".." [--source W-0013]` | Proposal for the user to accept |
| `know accept\|flag\|remove\|reject <kid>`, `know edit <kid> [--title] [--text] [--area] [--ok]` | Maintain entries |
| `instruct <ID> "Text"` | Instruction for the ongoing work, also added as a comment |
| `recur [list]` | Rules with the next three dates |
| `recur add --title ".." --every daily\|weekly\|monthly\|days:N [--weekday 1-7] [--nth 1-5] [--day 1-31] [--interval N] [--start YYYY-MM-DD] [--template slug] [--type ..] [--priority ..] [--effort ..] [--tags ..] [--description ..] [--status planned\|backlog] [--due_days N] [--queue] [--sprint]` | Create a rule |
| `recur set R1 field=value ...`, `recur remove R1`, `recur run` | Change a rule, delete it, create due tasks right away |
| `sprint close [--good ..] [--bad ..] [--change ..] [--next-capacity N]` | Close a sprint with a retrospective |

## GitHub, calendar, undo, overview

| Command | Effect |
|---|---|
| `github [sync] [--quiet]` | Sync with PRs, CI, reviews and issues |
| `github status` | Repository, last run, recent events, settings |
| `github set enabled=false issues=false labels=bug,works interval_min=5` | Settings under `github_sync` |
| `ical [--out file.ics] [--recurring]` | Calendar with due dates, milestones, sprints, optionally upcoming recurring tasks |
| `undo --list`, `undo [<key>]` | Undo changes made in the board, without a key the last one |
| `hub [--port 4740]`, `hub --list` | Hub with all projects in the browser (the same page as `/hub` on every board) or as text |
| `time [<ID>]` | also tokens and estimated cost |

## Discord bot works

One bot per machine for all projects. Everything lives in `~/.works/discord`, never in the project. Details in integrations.md.

| Command | Effect |
|---|---|
| `discord` | State and next setup step (shared or own bot), token and key only masked |
| `discord link <Code>` | Pair with the shared bot. `/works link` in Discord gives the code, in the channel works should post to |
| `discord unlink` | Unpair: revoke the key at the service and delete it locally, stop the bot |
| `discord token` | Check and save a token. Reads from input (hidden) or from a pipe, never as an argument: `Get-Clipboard \| works discord token`. Prints the invite link |
| `discord channel [name\|id]` | Show the text channels live from the bot (without write permission, with the reason) or choose the channel for dashboard and notices. With the shared bot, the channels of the linked server. A running bot moves the dashboard without a restart |
| `discord set k=v ..` | `service` (address of the shared bot, https only), `autostart`, `auto_enroll`, `commands` (commands and buttons, default on; off: no buttons, the own bot unregisters `/works`), `delay.perm`, `delay.idle` (seconds), `quiet.on`, `quiet.from`, `quiet.to` (HH:MM), `privacy.commands\|costs\|ci_error\|titles`, `cleanup.seconds` (delete messages other than the dashboard after this many seconds, task cards counted from completion, default 3600, 0 never, at most 2592000), `event.<name>` (including `event.start`, task started) and `event.<name>.at` (mention), `project.<id>` (notices for one project on or off; the board sets the id in the Discord bot dialog), `project.<id>.channel=<channel id>` (own channel for the project, own bot only, checked for write permission; empty: default channel) |
| `discord test` | Test message to the channel |
| `discord start\|stop\|restart` | Bot process; otherwise starts with the board and at session start |
| `discord emit <ship\|ci\|report> --json '{..}'` | Put an event into the outbox (for ship, ci-watch, reports). Does nothing without setup |
| `discord disconnect` | Delete the token and stop the bot |

## Files, parallel work, import, self-test

| Command | Effect |
|---|---|
| `file <path> [--json]` | Tasks that changed the file (commits with the ID and edits during an active task), with status and decisions |
| `files [<ID>] [--json]` | Files of a task and which other tasks changed them too |
| `parallel plan [A,B] [--max 3] [--json]` | Assessment: parallel, sequential or unclear, with reasons, lanes, tasks for afterwards and unsuitable tasks |
| `parallel start A,B [--force]` | Worktree and branch per task, status In progress |
| `parallel prompt <ID>` | Brief for this lane's agent |
| `parallel status [--json]` | Lanes with branch, commits, uncommitted files |
| `parallel finish <ID> [--merge] [--force]` | Remove the worktree, with `--merge` merge into the base branch. Status goes to Review |
| `parallel abort <ID> [--force]` | Remove the worktree, delete the branch if it has no commits, status back to Planned |
| `import <file> [--format ..] [--map field=Column,..] [--sheet ..] [--json] [--all]` | Preview with duplicates, see import.md |
| `import <backup.json> [--apply] [--mode merge\|restore] [--only 1,4]` | works backup from `export --json`: preview with new, changed, same, only here. `--apply` merges (new tasks get free IDs, selected changed ones are taken over), `--mode=restore` replaces the state and backs it up first in `.works/backups/`. Both can be reverted with `undo` |
| `import <file> --apply [--only 1,4] [--skip 3] [--status planned] [--tags ..] [--include-done] [--keep-dups] [--include-archived]` | Create |
| `selftest [--browser] [--keep] [--verbose] [--only <text>]` | Checks CLI, hooks, import, files, parallel work, server and API in a throwaway project. Exit 1 on errors. `--only` runs only steps whose name contains the text (for standalone steps like `works ship`); several parts separated by `\|`, e.g. `--only "init, new\|Discord"` |

In the worktree of a parallel task (recognizable by `.works.link`), the CLI works on the `.works` of the main project. `start` doesn't change the active task there, `done` is blocked.

## What doctor checks

Errors: invalid or missing frontmatter, missing required fields, invalid values, folder name doesn't match the ID, duplicate IDs, open tasks in the archive, references to unknown tasks, cycles, next_id too small, missing images and linked files.

Warnings: description not in the main section of the type or missing template sections (`--fix` moves the description and adds the sections, content is kept; this also happens once automatically at session start), missing effort, unknown milestone, missing acceptance criteria, done with open criteria, task in progress without a handoff or with an outdated one, incomplete tasks, images without alt text or description line, unreferenced assets, one-sided dependencies, files in the inbox, invalid active task.

## Exit codes

`0` success, `1` error or unmet Definition of Done. Error messages go to stderr and start with `Error:`, notes with `Note:` (in German `Fehler:` and `Hinweis:`).
