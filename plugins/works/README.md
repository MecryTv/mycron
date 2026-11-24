# works

> English. Deutsche Fassung: [README.de.md](README.de.md)

works is a task manager for Claude Code. All tasks of a project live as Markdown in the `.works/` folder, each with its own file for description, acceptance criteria, history, handoff, images and design decisions. Claude creates tasks, works through them and records where to pick up next. You follow everything on a live board in the browser, create tasks there yourself and tell Claude what comes next.

All it needs is Node.js 18 or newer: no database, no account and no other packages.

## Contents

- [Installation](#installation)
- [Getting started](#getting-started)
- [How you work with Claude](#how-you-work-with-claude)
- [Structure of a task](#structure-of-a-task)
- [The live board](#the-live-board)
- [Planning](#planning)
- [Collaborating with Claude](#collaborating-with-claude)
- [Design with UI UX Pro Max and Brainstorming](#design-with-ui-ux-pro-max-and-brainstorming)
- [Project knowledge](#project-knowledge)
- [GitHub](#github)
- [Several tasks in parallel](#several-tasks-in-parallel)
- [Import](#import)
- [Quality before closing](#quality-before-closing)
- [Time, cost and estimates](#time-cost-and-estimates)
- [Reports](#reports)
- [Sharing](#sharing)
- [Calendar and all projects](#calendar-and-all-projects)
- [Commands in the terminal and without Claude](#commands-in-the-terminal)
- [Settings](#settings)
- [Hooks](#hooks)
- [Security and privacy](#security-and-privacy)
- [What belongs in Git](#what-belongs-in-git)
- [Troubleshooting](#troubleshooting)

## Installation

In Claude Code:

```
/plugin marketplace add MecryTv/mycron
/plugin install works@mycron
```

Then restart Claude Code. You get updates with `/plugin marketplace update mycron`. Running boards switch to the new version on their own, and open tabs reload.

**Language:** works uses English by default (CLI, hooks, docs and new tasks). `works lang` shows the configured language. `works lang de` switches to German globally (`~/.works/settings.json`), `works lang de --project` only for this project (`.works/config.json`), and `works lang --reset [--project]` removes the setting again. The environment variable `WORKS_LANG` takes precedence, then the project, then the global setting, otherwise English applies. workday, ci-watch and mockups follow the same setting.

## Getting started

In your project, tell Claude something like:

> Set up works in this project and open the board.

Claude runs `works init` and first asks whether `.works/` should go into Git. Then it starts the live board and gives you the address, usually `http://127.0.0.1:4747/`.

To try it without a real project, use the demo:

> Show me the works demo.

The demo creates a sample project in the temp folder, with tasks, a sprint, comments, a template, time tracking and checks. With `--simulate` it plays back ten typical changes by Claude so you can see the board move live.

## How you work with Claude

You just talk normally. A few examples and what happens:

| You say | Claude does |
|---|---|
| Make a note that login is flaky on mobile. | quickly creates a bug and asks for the details later |
| Turn that into a task with P2, effort M. | creates the task with description and acceptance criteria |
| What's next? | names the next sensible task and why |
| Work through the queue. | starts the top task in your queue and carries on afterwards |
| Here's a screenshot for W-0012. | stores the image with a description in the task |
| Plan a sprint until Friday next week. | starts a sprint and suggests tasks that fit the capacity |
| I want to share the board with Lukas. | shares the board on the network and gives you the read-only link |
| How long did W-0034 take? | shows active time, sessions and days per status |
| What did W-0034 cost? | shows tokens and estimated cost of the task |
| Build the tournament page for mobile. | for a design task, works out mockups with UI UX Pro Max and Brainstorming, attaches them to the task and waits for your choice |
| Remember for this project: Prisma only with migrate deploy. | adds it to the project knowledge that every session reads |
| Update dependencies every first Monday of the month. | creates a recurring task |
| Work through the sprint. | checks whether tasks can be done in parallel with agents, and asks if unsure |
| Here's our Trello export. | shows a preview of the tasks and takes them over after your okay |

At the start of every session Claude automatically gets a short overview: open P1s, overdue items, queue, sprint, new comments from you, the areas of the project knowledge, mockups waiting for your choice, and the handoff of the active task. So every new session picks up where the last one stopped.

## Structure of a task

```
.works/
  WORKS.md            generated overview
  config.json         settings, milestones, queue, sprints, views, checks, recurring tasks
  wissen.md           project knowledge Claude reads before working
  state.json          active task (local)
  ideas.md            ideas that are not a task yet
  templates/          templates
  reports/            reports and snapshots
  inbox/              images not yet assigned
  tasks/W-0012-slug/
    task.md           description, criteria, plan, questions, handoff, history
    decisions.md      design decisions
    comments.md       conversation between you and Claude
    checks.json       results of the checks
    assets/           images
    design/           design direction, mockups and brainstorming
  archive/            done and dropped tasks
```

**Types:** Feature, Bug, Refactor, Spike, Chore, Design, Tech debt. Each type brings matching sections, a bug for example Reproduction, Root cause and Solution.

**Priorities:** P1 Critical, P2 High, P3 Medium, P4 Low.

**Status:** Backlog, Planned, In progress, Review, Done, Dropped. The files store the values `backlog`, `geplant`, `in-arbeit`, `review`, `erledigt` and `verworfen`; the English inputs `planned`, `in-progress`, `done` and `dropped` are accepted as well (for example `works set W-0012 status=in-progress`).

**Description:** the central section. Everything you consider important about a task belongs here. Claude reads it in full before working and treats it as a requirement.

**Definition of Done:** A task can only be closed when all criteria are checked, no questions are open and the type-specific sections are filled in. On top of that come manual items and, if set up, automatic checks. Anyone who closes it anyway has to give a reason, which goes into the history.

**Handoff:** At the end of each work phase Claude writes where to pick up. A Stop hook reminds it when files were changed but the task was not.

## The live board

Claude starts it with `works board --serve --detach`, or you say "Open the board". It runs in the background and refreshes every second. When Claude moves a card, it slides into the new column, and the bottom right shows what happened and why.

While Claude is working, the top bar says "Claude is working on W-0003, for 6 min". Clicking it opens the Live view: there you see the task with its implementation plan, the command currently running with its runtime, parallel agents, what is waiting for you, and all checks with runtime and findings. The active card shows the current step, for example "Editing src/backup.ts" or "Command npm test", and the three before it. With "Instruction for Claude" you send a hint in the middle of the work. Claude gets it at the next step and takes it into account as soon as it makes sense.

Every change on the board can be undone: with "Undo" in the notification, with Ctrl+Z or in Tools under Recent changes.

### Views

| View | Key | What for |
|---|---|---|
| Board | 1 | Columns by status, move cards by dragging |
| Sprint | 2 | Period, goal, capacity, burndown, suggestions for planning in |
| Queue | 3 | Order in which Claude should work |
| Timeline | 4 | Weeks and milestones, due date by dragging the end of the bar |
| Dependencies | 5 | Graph with critical path and the task with the most leverage |
| Table | 6 | Sort, edit inline, change several tasks at once |
| Live | 7 | What Claude is doing right now, which step is next, how far today's tasks are and how the checks stand |

Above the columns, the progress shows the share of done tasks, the last seven days, a forecast and the trend of the last eight weeks. With a milestone selected, everything applies to that milestone only.

### Detail panel

Clicking a card opens the task with these tabs:

- **Overview:** all fields, description, criteria to check off, questions, handoff, images by pasting or dragging, dependencies, history
- **Design variants:** for design tasks, colors, fonts, the variants as a preview and the brainstorming. Here you choose the variant Claude should build
- **Comments:** the conversation with Claude about this task
- **Time:** Claude's active time, days per status, sessions, tokens and estimated cost
- **Code and commits:** branch, how far it is ahead of the main branch, pull requests, commits with the task ID, changed files with diff

Tasks in Review have the **Accept** button: the chosen mockup or the before screenshot sits next to the result, with the acceptance criteria below for cross-checking. Accepting leads to closing the task. "Back to Claude" needs a short text about what is missing; it reaches Claude as a comment, and criteria you uncheck are open again.

### Tools

The icon with the sliders in the header opens weekly report, templates, checks, project knowledge, cleanup, recurring tasks, GitHub, calendar, usage, recent changes and notifications.

### Keyboard

| Key | Effect |
|---|---|
| right Shift or Ctrl+K | quick search for tasks, with `#` for tags, with `>` for commands |
| N | new task |
| / | search |
| 1 to 6 | switch view |
| Esc | close panel or dialog |
| Ctrl+Z | undo the last change on the board |

The color scheme follows the system or can be fixed to light or dark.

## Planning

### Queue

You add tasks to the queue and sort them by dragging. Claude takes them in exactly this order, before any suggestions of its own. Three switches control the flow: carry on after closing a task, ask first, and skip blocked tasks. Done tasks drop out on their own.

### Sprint

A sprint has a title, goal, period and a capacity in points. The default is 14 days and 20 points, with effort S 1, M 2, L 4 and XL 8 points. The Sprint view shows how much is planned, in progress and done, a burndown with an ideal line, and suggestions with a note on whether they still fit into the capacity. When the sprint closes, a retrospective opens: what was achieved, whether the goal was reached, which tasks took longer than estimated, what was added along the way and what it cost. Plus three short questions for you. Claude uses the answers when planning the next sprint. Open tasks can be carried over right away.

### Templates

For tasks that always look similar, such as a new slash command or a new dashboard page. A template sets type, priority, effort, tags, fields, a base text and acceptance criteria. When creating a task you fill in the fields and describe in your own words, in the field "What exactly should happen?", what it is about. Your text takes precedence over the base text.

You create your own templates in Tools or in the detail panel of an existing task with "Save as template". They apply to the project or to all your projects.

### Recurring tasks

Rules such as "daily", "every Monday", "every first Monday of the month" or "every 3 days" create tasks on their own, also from a template. The placeholders `{Datum}` (date) and `{Monat}` (month) in the title are replaced. If the previous task of a rule is still open, no second one is created. If you like, new tasks go straight into the queue or the sprint.

### Cleanup

Cleanup in Tools rates the backlog from 0 to 100 and lists what needs attention: tasks that are stuck, mockups without your choice, incomplete tasks, likely duplicates and old, untouched entries. Each item comes with the matching action, such as merge or turn into an idea. Already when you create a task, works warns you if there is a similar open task and offers to attach your request there as a comment.

### Saved views

Set filters, for example P1 and P2 with tag bot, and save them as "Bot urgent". The view appears as a chip above the board, with the number of matching open tasks. Claude can use it with `works list --view "Bot urgent"`.

### Milestones

Milestones group tasks towards a goal with a date, such as a release. You create them in the milestone filter. Timeline and progress show where they stand.

## Collaborating with Claude

**Comments:** In the Comments tab you write what matters to you. Claude sees new comments at the next session start, acts on them and replies there.

**Open questions:** Questions that have to be settled before the work. You answer them in the detail panel. As long as one is open, the task cannot be closed.

**Notifications:** When the board tab is in the background, the browser notifies you when a task moves to Review, Claude asks you a question or comments, a new P1 shows up, a blocker is resolved or the queue has run empty. Optionally with a sound and a counter in the tab title. Set it up in Tools.

**Ideas:** Loose thoughts go into `ideas.md` and can later be turned into a task with one click.

## Design with UI UX Pro Max and Brainstorming

If the skills [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) and Brainstorming from [Superpowers](https://github.com/obra/superpowers) are installed, Claude uses them for design tasks on its own. A design task is one of type Design or with a tag ui, design or ux.

1. Brainstorming with you; the result is attached to the task.
2. UI UX Pro Max provides the design direction: colors, fonts, style and rules.
3. Claude builds two to three variants as an HTML mockup or image and attaches them.
4. You see everything in the Design variants tab and choose with "Take this one". Until then the card shows "2 mockups to choose from".
5. Only then does Claude build it. The choice is recorded in `decisions.md`.
6. In the acceptance review, the chosen mockup sits next to the screenshot of the result.

Everything lives in the task folder under `design/`. Without the two skills, Claude settles the design with you as usual and still shows a mockup.

## Project knowledge

`.works/wissen.md` records what every session needs to know about the project, for example "Role changes go through rateQueue" or "Prisma only with migrate deploy". Entries are sorted by area. Claude reads the relevant ones before working. If Claude finds out something important itself, it suggests an entry; you accept, edit or reject it in Tools under Project knowledge. The file belongs in Git so everyone has the same state.

## GitHub

If the project is a GitHub repository and the [gh CLI](https://cli.github.com/) is logged in, works syncs automatically, at session start and every two minutes while the board is running:

- A pull request with the task ID in its title or branch moves the task to Review.
- The CI result becomes the check `ci`. Red prevents closing.
- Change requests in a review reach Claude as a comment, and the task goes back to In progress.
- A merge closes the task if the Definition of Done is met. Otherwise it stays in Review with a note about what is missing.
- New issues become tasks, and a done task closes its issue.

Each part can be turned off in Tools under GitHub. The first sync only records the current state and changes nothing.

## Several tasks in parallel

When several tasks are to be done, Claude first checks with `works parallel plan` whether they get in each other's way: do they depend on each other, do they change the same files, or are they in the same area? The result is parallel, one after another, or unsure.

- **Parallel:** Claude creates a separate Git worktree with a branch for each task, next to your project in the folder `<project>.works-lanes`, and starts one agent per task. The agents record their progress in the same tasks you see on the board.
- **One after another:** Claude works as usual, one task after the other, for example because they change the same files or are too small to be worth the overhead.
- **Unsure:** Claude tells you the reasons and asks.

Claude never hands incomplete tasks, open questions or design without a chosen mockup to an agent. When an agent is done, Claude checks the result, removes the worktree and leaves the branch for review or a pull request. Merging only happens if you want it. Up to three tasks run at the same time, configurable under `parallel.max`.

On the board these cards carry "Parallel" and show what their agent is doing right now. Parallel work in Tools shows running lanes and how Claude rates the next tasks.

**Files and tasks:** works remembers which task changed which file, from commits with the task ID and from the changes made during the work. If Claude changes a file that another task with decisions has already worked on, it gets a hint about it. `works file src/backup.ts` shows all tasks for a file, and the Code and commits tab shows the files that other tasks have touched too.

## Import

You take over tasks from other tools in Tools under Import, or by giving Claude the file:

| From | File |
|---|---|
| Trello | JSON export of the board |
| Notion | CSV, Markdown or ZIP export of a database |
| Linear | CSV export |
| Jira, Asana, your own spreadsheets | CSV or TSV |
| Excel | .xlsx |
| Word | .docx with lists, checkboxes or tables |
| Notes | Markdown or text with lists and `- [ ]` |

Columns are mapped by their names, in German and English. Status, priority, effort and date are translated, and checklists become acceptance criteria. You see a preview first and pick what to take. Duplicates and done items are deselected, and a second import of the same file does not create anything twice. Claude reads meeting notes or free text itself and suggests the tasks. An import can be undone like any change on the board.

## Quality before closing

In Tools or with `works checks detect`, works suggests checks from your project, such as TypeScript, lint, tests and build from the `package.json`. Nothing is saved until you agree.

After that the checks run automatically every time a task is closed, as long as there is no result yet for the current state of the code. The closing dialog shows each check with result and duration:

- **green:** passed
- **red:** failed, with the last lines of the output; prevents closing
- **yellow:** a finding, for example from the code audit. You decide: "Let Claude fix it" writes Claude an assignment as a comment, "Mark as known" acknowledges the finding.

Claude runs the code audit itself and records the result. Which checks apply to which type is set in `checks_by_type`, for example only lint for chores.

## Time, cost and estimates

Two hooks measure how long Claude works on the active task: from sending a request to the end of the response. Breaks over 20 minutes separate sessions. The Time tab shows the total, the sessions and how many days the task spent in which status.

On top of that, the Stop hook counts the tokens of every response: input, output, cache writes and cache reads. From these works calculates an estimated cost based on the prices in `config.json` under `prices` (the default is the API prices per million tokens). The Time tab shows tokens and cost per task and day, and Usage in Tools shows the last 30 days per type and the most expensive tasks. It remains an estimate, not a bill. With a subscription it shows you what your quota goes into.

Above the timeline you see how well the estimates fit: estimated versus actual duration per effort size. If your M tasks take seven instead of five days on average, you can have timeline, graph and sprint calculated with the measured values.

## Reports

**Weekly report:** summary, numbers, what got done, what needs you and the plan for the next week, as Markdown and HTML in `.works/reports/`. The HTML version follows your color scheme. In Tools you set the weekday and time. When the report is due, the hook reminds Claude at the next session start to sum up the week. With a Discord webhook the report also goes to a channel of your choice.

**Report for a period:** `works report --days 14 --write`.

**Changelog:** `works changelog --milestone M1` from the done tasks.

## Sharing

**On the same network:** Share in the header, then "Share on network". You get a link like `http://192.168.1.20:4747/?view=...`. Whoever has it sees the board live but cannot change anything. A second link with edit rights is meant for your own other devices. Links can be renewed at any time; the old ones then stop working.

**Snapshot:** a single HTML file with all tasks, details and images. It opens without a server and without internet and works well for mail or chat. In the Share dialog or with `works export`.

## Calendar and all projects

**Calendar:** Calendar in Tools gives you an address to subscribe to in Google Calendar, Outlook or Apple Calendar, with due dates, milestones and sprints. Calendars on the internet cannot reach your computer; in that case you download the file (`works ical --out termine.ics`) and import it.

**All projects:** `works hub` opens an overview of all projects with works on `http://127.0.0.1:4740/`: open tasks, P1 across all projects, Review, overdue items, sprint or milestone, what Claude is working on right now, and a button to open or start a project's board.

## Commands in the terminal

Claude calls the commands itself. But you can also use works entirely without Claude. Set it up once, for example by telling Claude "Set up the works command", or yourself:

```
node "<path to the skill>/scripts/works.mjs" install-cli
```

After that the `works` command is available in every terminal and every folder:

```
works init                          set up works in the current folder
works board --serve --open          start the live board and open it in the browser
works new --type bug --title "..."  create a task
works list                          open tasks
works hub                           all projects
works help                          all commands
```

On the board you create, edit, sort and import tasks as usual. When Claude later works in the project, it sees everything you created without Claude.

What `install-cli` does:

- A launcher script in `~/.works/bin` that looks for the newest installed works version on every call. So after a plugin update the new version applies right away.
- Linux and macOS: the command in `~/.local/bin/works`. If the folder is not in the PATH, `install-cli` adds a line to `.bashrc` or `.zshrc`.
- Windows: `works.cmd` and `works.ps1` in `%USERPROFILE%\.works\bin`. The folder is added to your user PATH. Open a new terminal afterwards.

With `--no-path` the PATH stays unchanged, with `--dir` you choose your own folder, and with `--uninstall` you remove everything again. `works which` shows which installation is in use, `works version` the version.

Without Claude only the hooks are missing: time, tokens and the "Claude is working" display only come from sessions with Claude.

| Area | Commands |
|---|---|
| Setup | `init`, `lang`, `doctor [--fix]`, `install-hooks`, `install-cli`, `demo`, `selftest`, `version` |
| Capture | `new`, `idea`, `promote`, `scan`, `gh-import`, `recur`, `import` |
| View | `list`, `show`, `next`, `status`, `views` |
| Work | `start`, `set`, `section`, `check`, `item`, `log`, `question`, `link`, `handoff`, `asset`, `decisions`, `design`, `know`, `instruct` |
| Close | `dod`, `done`, `drop`, `reopen`, `archive` |
| Plan | `queue`, `sprint`, `milestone`, `template`, `parallel` |
| Conversation | `comments`, `comment` |
| Quality | `checks` |
| Analysis | `time`, `report`, `changelog`, `commits`, `ical`, `file`, `files` |
| GitHub | `github sync`, `github status`, `github set` |
| Board | `board [--serve] [--detach] [--restart] [--stop] [--status] [--share] [--private]`, `share`, `export`, `undo`, `hub` |

`works help` shows all commands with options. The full reference is in `skills/works/references/cli.md`.

## Settings

Everything is in `.works/config.json`. The file only needs to contain what differs from the default. The most important fields:

| Field | What for |
|---|---|
| `id_prefix` | prefix of the IDs, default `W` |
| `language` | language for this project only (`en`, `de`), easiest with `works lang de --project` |
| `dod` | manual Definition of Done items, global, per type and per tag |
| `checks`, `checks_by_type` | automatic checks |
| `sprint_settings` | length, capacity and points per effort |
| `effort_mode`, `effort_days` | fixed or measured duration per effort |
| `report` | weekly report: schedule, targets, content |
| `time_tracking` | time and token tracking on or off |
| `prices` | prices for the cost estimate |
| `recurring` | recurring tasks |
| `github_sync` | what the GitHub sync is allowed to do |
| `live_activity` | "Claude is working" display and instructions during the work |
| `parallel` | maximum number of parallel tasks and folder for the worktrees |
| `file_tracking` | remember files per task and give hints when editing |
| `hooks.session_start`, `hooks.stop_reminder` | turn off hooks per project |

All fields are explained in `skills/works/references/config.md`.

## Hooks

The plugin comes with five hooks that are active automatically:

| Hook | What for |
|---|---|
| SessionStart | short overview for Claude, bring board and server to the new version, create due recurring tasks, sync GitHub, reminder about due weekly reports |
| UserPromptSubmit | start of a request for time tracking, "Claude is working" display |
| PostToolUse | current step for the board, changed files per task, hint about earlier decisions, your instructions during the work |
| SubagentStop | assign tokens and cost of agents to the right task |
| Stop | end of a request, tokens and cost, pending instructions, reminder about history and handoff |

Optionally, `works install-hooks --git` sets up a pre-commit hook that checks the structure of `.works/`.

## Security and privacy

- The board only runs on your computer (127.0.0.1) unless you share it. Every change needs a token that only the served page knows.
- When sharing, all access from outside needs a secret key from the link. Readers get their own token with which the server only accepts read access. Export and sharing remain reserved for the owner.
- HTML files from `.works/`, including the mockups, run in the browser in a sandbox without access to the board.
- The "Claude is working" display only stores the tool and file name or the beginning of a command, no contents and no output.
- The GitHub sync uses your logged-in gh CLI and can only be controlled directly at the computer, not through a shared link.
- Checks only run commands that are in your `config.json`. Running them, changing the commands and setting the Discord webhook only work directly on your own computer, not through a shared link.
- The Discord webhook URL and the sharing keys are stored only locally and excluded from Git.
- Nothing leaves your computer unless you send a report to Discord, share the board or the GitHub sync is active (it then closes issues and reads PRs).

## What belongs in Git

`works init` creates a `.works/.gitignore`. The repository should contain tasks including mockups, templates, reports, `config.json`, `wissen.md`, `ideas.md` and `WORKS.md`. These stay local: `state.json`, `board.html`, `server.json`, `server.log`, `share.json`, `report.local.json`, `activity.json`, `instructions.json`, `github.json`, `.usage-state.json`, `lanes.json`, `files.jsonl`, `.filemap.json`, `.undo/`, `.tmp/` and the inbox. works adds to older `.gitignore` files on its own. If you do not want `.works/` in Git at all, `works init --gitignore` sets it up that way.

## Troubleshooting

**The board looks outdated or behaves oddly.** Tell Claude "Restart the board" or run `works board --restart`. Open tabs reload on their own.

**The board does not start.** `works board --status` shows whether and where it is running. Details are in `.works/server.log`. If the port is taken, works uses the next free one, or you choose one with `--port`.

**Claude is working right now and I want to restart the board.** That works at any time. The server waits until running changes are finished, and open tabs reconnect afterwards.

**Is everything still working?** `works selftest` creates a throwaway project and checks CLI, hooks, import, parallel work, board and API. The same runs on every push in the mycron repo as a GitHub Action on Linux, macOS and Windows with Node 18, 20 and 22.

**A parallel worktree is stuck.** `works parallel status` shows all lanes, `works parallel abort <ID>` cleans up. Commits in the branch are kept.

**I changed something on the board by accident.** Ctrl+Z or Tools, Recent changes. In the terminal `works undo --list` and `works undo <key>`.

**The GitHub sync does nothing.** `works github status` names the reason; usually gh is not installed or not logged in (`gh auth login`).

**The structure is messed up.** `works doctor` finds errors, `works doctor --fix` fixes most of them.

**Notifications do not arrive.** Turn them on in Tools, then "Send test notification". If the browser does not ask, notifications are blocked for the page and can be allowed in the site settings.
