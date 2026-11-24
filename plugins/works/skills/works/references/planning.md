# Planning, conversation and quality

Sprint, comments, templates, saved views, time tracking, automatic checks and the weekly report. Everything works in the board and in the terminal.

## Sprint

A sprint bundles tasks for a fixed period with a goal. Defaults: 14 days, capacity 20 points, points per effort S 1, M 2, L 4, XL 8. Tasks without an estimate count as M. Change this in `config.json` under `sprint_settings`.

```
works sprint start --title "Backups live" --goal "Backups save roles and permissions" [--days 14] [--capacity 20] [--start 2026-11-02] [--carry]
works sprint add W-0034,W-0016
works sprint remove W-0016
works sprint                  state with points and tasks, --json for machines
works sprint set capacity=24 end=2026-11-16 goal="..."
works sprint close            record the result, remember open tasks
works sprint start --carry    take over open tasks from the last sprint
works sprint list
```

For Claude: sprint tasks come right after the queue in `works next`. `works status` names sprint, goal and open tasks. If the sprint is overplanned, tell the user instead of quietly adding more.

In the board: Sprint view with a capacity bar, burndown with an ideal line, and a list of tasks and suggestions noting whether they still fit. Schedule suggestions by dragging or with +.

### Retrospective

In the board, "Close sprint" opens the retrospective: key figures (completed, goal, added, previous sprint), observations from the data (faster or slower than estimated, added later, left open, usage) and three questions for the user. The answers end up under `sprints[].retro`. Capacity for the next sprint is prefilled with the average of completed points. "Close and plan next" starts the next sprint right away and takes over open tasks.

In the CLI: `works sprint close --good ".." --bad ".." --change ".." --next-capacity 16`.

For Claude: when planning the next sprint, read `retro.change` of the last sprint and act on it, for example plan fewer points or split large tasks beforehand.

## Comments

A conversation between the user and Claude per task, stored in `comments.md` next to the task.md. Open questions stay a separate area with checkboxes; comments are for everything else: notes, questions back, answers, instructions.

```
works comments                 tasks with new comments from the user
works comments W-0034          read all comments (marks them as read)
works comment W-0034 "Text"    reply, author is Claude
works comment W-0034 --file reply.md
```

For Claude: `works status` and the SessionStart hook report new comments. Before working on such a task, read `works comments <ID>` first, treat the requests as requirements and reply briefly with what was done or what is still open. Instructions from the completion dialog ("Please fix the finding ...") also arrive as comments.

## Saved views

Named filter combinations, for example "Bot urgent" for P1 and P2 with tag bot, without blocked tasks. Stored in `config.json` under `views` so they apply to the whole project. In the board they appear as chips above the progress bar; each chip shows how many open tasks match. The browser remembers which view appears on opening.

```
works views                   all views
works list --view "Bot urgent"
works views delete "Bot urgent"
```

## Templates

Templates are JSON files in `.works/templates/` (project) or `~/.works/templates/` (all projects). A template has a name, a title with placeholders such as `{Page}`, type, priority, effort, tags, fields (text or choice, required or optional), a base text for the description, acceptance criteria (always, preselected or optional) and notes for Claude.

When creating a task from a template, the user fills in the fields and describes the goal in their own words under "What exactly should happen?". This text goes at the top of the description and takes precedence over the template's base text, which follows below.

```
works template list
works template show new-slash-command
works template save --from W-0034 --name "Backup feature" [--scope user]
works template save --file template.json
works template delete new-slash-command
works new --template new-slash-command --field Command=backup --field Permissions=Admins --text "What exactly should happen" [--criteria 2,3]
```

`--criteria` picks the numbers (starting at 0) of the preselected and optional criteria; without it, all criteria except the optional ones apply.

For Claude: if several new tasks are very similar, suggest a template to the user and create it with `works template save --from <ID>` once they agree.

## Time tracking

The UserPromptSubmit hook writes a start to `.works/time.jsonl` when a request is sent, and the Stop hook writes a stop when the response ends, each for the active task from `works start`. From this works derives:

- Claude's active time per task, grouped into sessions (breaks over 20 minutes split sessions, a single request counts for at most 3 hours)
- days per status from the history
- estimate accuracy: calendar days from start to finish per effort size

```
works time W-0034              time and sessions of a task
works time                     estimate versus actual duration
works time --mode measured     timeline and sprint use measured durations (from 3 tasks per size)
works time --mode fixed        back to fixed values (S 2, M 5, L 10, XL 15 days, changeable under effort_days)
```

### Tokens and costs

After every response, the Stop hook reads the new entries in the transcript and assigns input, output, cache writes and cache reads to the active task. From that, works estimates the costs based on `config.prices` (the default is the public API prices per million tokens, see config.md).

`works time W-0034` shows tokens and estimated costs of the task, `works time` the usage of the last 30 days per type and the most expensive tasks. In the board: the Time tab of a task and Tools, Usage. Usage without an active task is listed separately. These are estimates, not billing; on a subscription they show what the quota was spent on.

Turn it off: `"time_tracking": false` in `config.json`.

## Project knowledge

`.works/wissen.md` collects what every session needs to know about the project: traps, rules, quirks, access details without secrets. Areas are `##` headings, entries are `###` with a comment line for ID, author, source, date and status (`ok`, `vorschlag` for a proposal, `veraltet` for outdated). The file belongs in Git.

```
works know                     everything by area
works know search prisma       read before working in an area
works know add --area "Database" --title "Only migrate deploy" --text "migrate dev deletes data"
works know propose --area ".." --title ".." --text ".." --source W-0013    proposal from Claude
works know accept <kid> | flag <kid> | edit <kid> --text ".." | remove <kid>
```

For Claude: make proposals when something cost time or can go wrong, not for general knowledge. An entry is short and concrete. If an entry contradicts the code, mark it with `works know flag` and ask the user. In the board under Tools, Project knowledge: accept, edit, reject and search proposals.

## Recurring tasks

```
works recur add --title "Update dependencies ({Monat})" --every monthly --nth 1 --weekday 1 --type chore --due_days 7
works recur add --title "Test backup" --every daily --queue
works recur add --title "Check logs" --every days:3 --template maintenance
works recur                    rules with their next dates
works recur set R1 active=false
works recur run                create due rules right away
works recur remove R1
```

`{Monat}` in the title is replaced with month and year, `{Datum}` with the date.

Tasks are created at session start and, while the board is running, every minute. If the previous task of a rule is still open, no second one is created. With `--queue` the new task goes into the queue, with `--sprint` into the running sprint. The dates also appear in the calendar export with `works ical --recurring`.

## Cleanup

In the board under Tools, Cleanup. Rates the backlog with a score from 0 to 100 and lists:

- Stuck: in progress or review for a long time without movement. Actions: request a handoff (comment to Claude), accept, back to the backlog
- Design variants without a choice: design tasks where Claude is waiting for the user
- Incomplete: without description or criteria, plus tasks without effort
- Probably duplicates: similar open tasks by title, tags and description. Merging drops one and adds its description and open criteria as a comment to the other
- Old and untouched: more than 60 days in the backlog. Action: turn into an idea

works already checks for similar open tasks when one is created: `works new` prints a note, and the board warns in the dialog and offers to attach the request as a comment to the existing task. For Claude: if `works new` reports a similar task, check briefly and ask the user whether it is the same one.

## Automatic checks

Commands that run before finishing a task, in `config.json` under `checks`. `checks_by_type` sets which ones apply to which type; without an entry, all apply.

```json
"checks": {
  "typecheck": "npx tsc --noEmit",
  "lint": "npm run lint",
  "test": "npm test",
  "build": "npm run build",
  "audit": "skill:code-audit"
},
"checks_by_type": { "chore": ["typecheck", "lint"], "spike": [] }
```

```
works checks detect            suggestion from package.json and tsconfig.json
works checks detect --save     save the suggestion, only after asking the user
works checks set test="npm test" build=     set, or remove with an empty value
works checks set bot="npm run check" --cwd "Discord Bot"     with a working folder relative to the project, instead of "cd ... &&" in the command
works checks run W-0034        run all checks, result in the task's checks.json
works checks record W-0034 audit --status warn --note "restore.ts:88 ..."
works checks ack W-0034 audit --reason "left as is on purpose"
```

`works done` starts the checks itself if there is no result yet for the current state (HEAD plus uncommitted changes). Red (`fail`) blocks finishing. A finding (`warn`) needs a decision: fix it or mark it as known. Claude runs entries with `skill:` itself, such as the code-audit skill, and records the result with `works checks record`: `ok` without findings, `warn` with a short description of the findings, `fail` for critical findings.

For Claude: never set up checks without consent. On the first finish in a project without `checks`, show the suggestion from `works checks detect` and ask.

If the task runs in parallel in a worktree, its checks run there and not in the main project, even when `works checks run` is called in the main project. The fingerprint of the working state then also comes from the worktree.

During a run, `checks.json` records which check is currently running (`running`, `runningSince`), and every result has its time (`at`). The live view uses this to show running checks with their duration.

In the board, the completion dialog shows every check with result, duration and, on errors, the last lines of output. "Let Claude fix it" writes a comment to Claude, "Mark as known" acknowledges a finding. The same buttons exist in the live view in the Checks column.

## Weekly report

```
works report --week [--summary "two to four sentences"] [--summary-file file] [--send | --no-send]
works report --settings enabled=true weekday=5 time=16:00 discord=true
works report --webhook https://discord.com/api/webhooks/...     stored locally only
works report --webhook                                         remove the webhook
```

The report is saved as `reports/2026-KW44.md` and `.html` in `.works/`. Content: summary, numbers (done, started, new, overdue), what was done, what needs the user (open questions, reviews, overdue items, comments from Claude), the plan for next week from the queue or open tasks, milestones. The HTML version follows the board's color scheme, light or dark.

With Discord turned on, the report goes as an embed to the stored webhook. The URL is kept only in `.works/report.local.json` and is excluded from Git.

For Claude: when a report is due, the SessionStart hook says so. Then summarize the week from `works report --week --no-send` (preview) and the history in two to four factual sentences and run `works report --week --summary "..."`.
