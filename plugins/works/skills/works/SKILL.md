---
name: works
description: Project task management in .works/ with priorities, detailed task files, images, decisions, dependencies, sprints, handoffs and a definition of done. Use as soon as a .works/ folder exists or the user talks about tasks, todos, bugs, features, ideas, backlog, priorities or "what's next", wants something noted down, drops screenshots for a task, starts, finishes or resumes a task, has several tasks worked through (then check for parallel work), wants to import tasks from Trello, Notion, Linear, Excel, Word or lists, asks for a report, or for design tasks (then use UI UX Pro Max and brainstorming and attach the design variants to the task). Also for project knowledge, recurring tasks, costs, GitHub sync and /works with a subcommand.
---

> **Language:** English is the default. If the configured language is German (`works lang` shows `de`, or the SessionStart hook says `Language: de`), read [SKILL.de.md](SKILL.de.md) and the files under `references/de/` instead and answer the user in German. For any other language, use these English docs and answer in that language.

# works

Manages all tasks of a project in `.works/`. Every task has its own folder with a detailed `task.md`, an optional `decisions.md` and an `assets/` folder for images. `WORKS.md` is the generated overview.

```
.works/
  WORKS.md            generated overview, never edit by hand
  config.json         prefix, next ID, milestones, definition of done, settings
  state.json          active task and last handoff (local)
  ideas.md            parking lot for ideas
  board.html          generated Kanban board (local, refreshed after every change)
  inbox/              drop zone for screenshots not yet assigned
  reports/            saved reports
  templates/          templates for new tasks (JSON)
  time.jsonl          time tracking and token usage from the hooks
  activity.json       running and recent tool calls for the live view (local)
  steps.json          time each implementation plan step was checked off (local)
  wissen.md           project knowledge: facts and rules Claude reads before working
  tasks/W-0012-slug/  task.md, decisions.md, comments.md, checks.json, assets/, docs/, design/
  archive/            done and dropped tasks
```

## The CLI

All management steps go through a Node script without dependencies. Below, `works` stands for:

```
node "${CLAUDE_SKILL_DIR}/scripts/works.mjs"
```

Claude Code replaces `${CLAUDE_SKILL_DIR}` with this skill's folder when loading it. If the variable is still there unreplaced, use the skill base directory shown at load time.

`works help` lists all commands. The full reference is in `references/cli.md`.

## Core rules

1. Division of labor: the CLI handles everything structural (IDs, folders, frontmatter, status, history, dependencies, assets, index). Claude writes the section content directly into `task.md` and `decisions.md` with Edit. Never change frontmatter by hand, use `works set`.
2. `WORKS.md` and `board.html` are generated. Every writing CLI command refreshes both automatically (board.html only if it exists). After manual edits to a task.md, run `works index` once unless a live view is running.
3. Ask instead of guessing. If details are missing (goal, acceptance criteria, priority when unclear), ask the user. Record questions that can't be settled right away with `works question <ID> "..."`. Don't write assumptions into the task as facts.
4. Run `works start <ID>` before working on a task and `works handoff <ID> --text "..."` at the end of every work phase. That way any new session can pick up where the last one stopped.
5. Commit messages include the task ID, for example `feat(W-0012): add validation`.
6. Always add images with `--desc`. The text description saves later sessions from loading the image.
7. Finish only via `works done`. First check without `--confirm`, actually do the manual items (run tests, run code-audit), then `--confirm`. Skip items with `--force` only when the user explicitly asks for it, and always with `--reason`.
8. Assign priorities by the criteria in `references/priorities.md`. Tell the user about a new P1 right away.
9. Writing style in tasks: factual, concrete, no filler. Acceptance criteria must be checkable with yes or no.
10. The user can also create, move and edit tasks in the live board. Such history entries end with `[Board]`, entries from Discord with `[Discord]`. Re-read a task.md before every edit instead of overwriting it with an older version from your context. Complete new tasks with `source: board` or `source: discord` and `incomplete: true` together with the user at the next suitable moment.
11. The `## Description` section is the central place for everything relevant to a task: what should happen, why, background, details and notes from the user. Read it first and in full before working on a task and treat it as binding, together with the acceptance criteria. When creating new tasks, put all relevant information into the description (`works new --description "..."`) rather than spreading it over other sections. A Goal section is optional and only filled in older tasks. If something in the description contradicts the plan or the code, ask the user instead of overriding it. Don't rewrite the section; your own findings go into other sections or the history.
12. The user's queue (`works queue`, Queue in the board) takes precedence over all your own suggestions. `works next` and `works status` show it first. If the user says "work through the queue" or `auto_next` is on, continue after `works done` with the entry the output names. With `ask_before`, check with the user briefly first. Skip blocked entries while `skip_blocked` is on. Change the order only when the user asks.
13. Comments from the user (`works comments`) are requirements just like the description. Read new comments first and reply briefly with `works comment <ID> "..."`: what is done, what is still open, which decision is needed.
14. Set up checks (`config.checks`) only after asking. They run automatically on `works done`; run `skill:code-audit` entries yourself and record them with `works checks record`. Mark a finding as known only when the user asks.
15. Design tasks (type design or tags ui, design, ux): if UI UX Pro Max and Superpowers Brainstorming are installed, use both on your own, without the user asking. `works start` reports which of the two skills it found. Always attach the results to the task so the user sees them in the board under Design variants: `works design direction` for colors, type and style, `works design add` for each variant as an HTML mockup or image, `works design brainstorm` for the brainstorming document. Then wait for the user's choice (board or `works design choose`) and only implement after that. Process in `references/integrations.md`.
16. Instructions from the board arrive as hook context while you work. Read them, take them into account as soon as it makes sense (usually after the current step, not in the middle of a change), and reply briefly with `works comment <ID> "..."`.
17. Project knowledge (`wissen.md`, `works know`): the session overview lists the areas. Before working in an area, read `works know search <term>`. If you find something later sessions need to know (a trap, a rule, a quirk), propose it with `works know propose --area ".." --title ".." --text ".." --source <ID>`. The user accepts proposals in the board. Entries from the user count like the description.
18. Acceptance review: the user reviews tasks in the board. If they send a task back with text, the text becomes a comment on the task and checked criteria are open again. For UI tasks, add after screenshots with `--kind after` before the review, ideally per width and color scheme (`--widths=1440,390 --themes=light,dark`), so the comparison with the chosen design variant works at the same scale. `works shot --url <page> --asset <ID> --kind before|after --desc ".."` takes before and after shots itself (Playwright with the installed Chrome); look at the images with Read afterwards. `works shot <view|ID>` shows what the works board currently looks like.
19. Working through several tasks (queue, sprint, "do W-12 to W-15"): run `works parallel plan` first. For "parallel", create worktrees with `works parallel start` without asking and start one agent per task with the brief from `works parallel prompt <ID>`, all at the same time. For "sequential", work normally. For "unsure", or if you have doubts yourself (shared interfaces, schema, configuration), ask the user and give the reasons. Process and wrap-up in `references/parallel.md`.
20. If the PostToolUse hook reports that a file was also changed in other tasks, briefly check the decisions it names (`works file <path>`, `works show <ID>`). If the change contradicts a decision, ask the user instead of silently overriding it.
21. If the user hands over a file with tasks (Trello, Notion, Linear, CSV, Excel, Word, Markdown), first run `works import <file>` as a preview, check the mapping, let the user confirm briefly if there are many entries, then `--apply`. Read free text yourself and import it as a JSON list. Details in `references/import.md`.

## When to do what

| Situation | Action | Details |
|---|---|---|
| Session start, .works exists | Read `works status` (the SessionStart hook does this automatically). Note open P1s and the handoff of the active task | `references/workflow.md` |
| Project has no .works yet | `works init` only on request. Ask first whether `.works/` should go into Git (option `--gitignore`) | `references/workflow.md` |
| "Note this down", quick capture | `works new --type ... --title "..." --incomplete`, ask for missing details later | `references/workflow.md` |
| New task with details | Settle type and priority, `works new`, then fill in all sections | `references/task-format.md` |
| Error message or stack trace pasted | Create a bug, take over the log with `--log-file`, add the reproduction | `references/workflow.md` |
| Loose idea | `works idea "..."`, later `works promote I-001` | `references/workflow.md` |
| "What's on?", "What's next?" | `works next`, give the recommendation with its reasons | `references/workflow.md` |
| Screenshot or image for a task | Take it yourself with `works shot --url <page> --asset <ID> --kind before\|after --desc ".."`, otherwise ask for the path or check the inbox and run `works asset` with `--kind` and `--desc` | `references/assets.md` |
| Look at the board yourself, check whether a change in the board is right | `works shot <view\|ID> [--widths 390 --themes dark]`, then look at the image with Read | `references/assets.md` |
| Design task, UI, layout, new page | Use UI UX Pro Max and brainstorming if available, attach the results with `works design`, wait for the user's choice | `references/integrations.md` |
| Brainstorming without design | Attach the document with `works attach-doc` and summarize it in `decisions.md` | `references/integrations.md` |
| Task depends on another | `works link A blocked-by B` | `references/workflow.md` |
| Work begins | `works start <ID>`, pass the branch name from the output to the git-workflow skill | `references/integrations.md` |
| Work phase ends, context is running low, user takes a break | `works handoff <ID> --text "..."` | `references/workflow.md` |
| Task finished | `works done <ID>`, work through the items, then `--confirm`. On a feature branch with merge and push: skill `works:ship` (`works ship`) | `references/workflow.md` |
| Task no longer needed | `works drop <ID> --reason "..."` | `references/workflow.md` |
| Done task needs rework | `works reopen <ID> --reason "..."` | `references/workflow.md` |
| TODO comments in the code, GitHub issues | `works scan`, `works gh-import` | `references/workflow.md` |
| Report, changelog | `works report`, `works changelog` | `references/cli.md` |
| "How far along is Claude?", follow along live, look at checks | Start the live board as below and point to the Live view (Live tab, key 7) | `references/board.md` |
| Overview in the browser, board, "I want to create tasks myself" | `works board --serve --detach --open` and give the URL. If a current server is already running, only its URL is printed. `--open` opens the browser only if the board isn't already open in a tab there, so don't open it again yourself. The user can edit everything there. For a read-only view, `works board` | `references/board.md` |
| Board shows an old design, restart the board | `works board --restart` | `references/board.md` |
| "Work through the queue", set the order | Read `works queue`, start the topmost startable task, continue with the next one after `done` | `references/board.md` |
| Plan a sprint, "what can we get done by ..." | `works sprint start`, add tasks with `works sprint add`, keep an eye on capacity | `references/planning.md` |
| New comments reported | Read `works comments <ID>`, act on them, reply with `works comment <ID> "..."` | `references/planning.md` |
| Task from a template, "as usual for slash commands" | `works template list`, then `works new --template ... --field ... --text "..."` | `references/planning.md` |
| Weekly report due or requested | Summarize the week, `works report --week --summary "..."` | `references/planning.md` |
| Notifications on the phone, Discord, set up a bot | `works discord` shows both ways: the shared bot (`/works link` in Discord, then `works discord link <code>`) or your own (`works discord token`). The user enters the code and token themselves, never in the chat | `references/integrations.md` |
| How long did that take, are the estimates right | `works time <ID>`, `works time` | `references/planning.md` |
| Back up the board, move it to another project, restore an old state | `works export --json`, read it in with `works import <file.json>` (preview, then `--apply` or `--apply --mode=restore`). Restoring replaces the current state, ask the user first | `references/board.md` |
| Share the board with someone | On the same network `works board --restart --share`, give the read-only link from the output. For people outside, `works export` and send the file. Edit link only on request (`works share --owner`) | `references/board.md` |
| Try out the board, demo, "show me what it looks like" | `works demo --simulate --open` outside real projects. Creates a sample project in the temp folder and plays back changes | `references/board.md` |
| "Remember this for the project", found an important quirk | `works know add` (user) or `works know propose` (your own finding) | `references/planning.md` |
| Recurring work, "every Monday", "monthly" | `works recur add --title ".." --every weekly --weekday 1`, creates the tasks on its own | `references/planning.md` |
| PR, CI, GitHub issues | Sync runs automatically, status with `works github status`, sync right away with `works github sync` | `references/integrations.md` |
| What does it cost, tokens, usage | `works time <ID>` or `works time`, costs are estimates based on `config.prices` | `references/planning.md` |
| Changed something in the board by accident | `works undo --list`, then `works undo <key>` | `references/board.md` |
| Dates in the calendar | `works ical --out calendar.ics` or the subscription URL from the board | `references/board.md` |
| Several projects at a glance | If two boards are running, the board tab switches to the hub on its own (`/hub`). Otherwise `works hub` on port 4740 | `references/board.md` |
| Work through several tasks, queue, sprint | `works parallel plan`, then parallel with agents, sequential, or ask | `references/parallel.md` |
| Who last changed this file, what was decided there | `works file <path>`, `works files <ID>` | `references/cli.md` |
| Take over tasks from Trello, Notion, Linear, CSV, Excel, Word, a list | `works import <file>`, check, then `--apply` | `references/import.md` |
| Does works still work, after an update or on errors | `works selftest` | `references/cli.md` |
| Use works without Claude, `works` command in the terminal | `works install-cli`. Changes the PATH (shell configuration or Windows user PATH), say so briefly first. Afterwards `works board --serve --open` in any folder | `references/cli.md` |
| Check the structure, suspect errors | `works doctor`, `--fix` if needed | `references/cli.md` |
| Set up hooks | With the plugin installation only `works install-hooks --git`, otherwise `works install-hooks` after asking | `references/hooks.md` |
| Change the language, "in German", "auf Deutsch" | `works lang` shows the language. `works lang de` switches globally (`~/.works/settings.json`), `works lang de --project` only for this project (`.works/config.json`), `works lang --reset [--project]` removes the setting. Precedence: environment variable `WORKS_LANG`, project, global, English | `references/cli.md` |

## Typical task flow

1. Capture: `works new --type feature --title "..." --priority P2 --effort M --tags ui`
2. Fill in: description, acceptance criteria and implementation plan in the task.md, check similar open tasks (`works new` reports them)
3. Clarify: discuss open points with the user, for design work attach design variants and wait for the choice, record the outcome in `decisions.md`
4. Start: `works start W-0012`, create the branch, capture the current state as a screenshot: `works shot --url <page> --asset W-0012 --kind before --desc ".."`
5. Implement: check off steps in the implementation plan, record relevant steps with `works log`
6. Hand off: `works handoff` at every interruption
7. Finish: `works done W-0012`, after screenshot, tests, code-audit, then `--confirm`
8. Follow up: changelog, decision log if needed, later `works archive`

## References

Load only the file the current step needs.

- `references/priorities.md`: priorities, status lifecycle, effort and risk
- `references/task-format.md`: folder structure, frontmatter fields, sections per type, writing rules
- `references/workflow.md`: processes for capturing, planning, working, handoff, finishing
- `references/assets.md`: saving images, inbox, screenshots, naming, compression
- `references/integrations.md`: Superpowers Brainstorming, UI UX Pro Max, git-workflow, code-audit, responsive-website-check, second-brain-sync, GitHub, Discord bot
- `references/hooks.md`: SessionStart, Stop, UserPromptSubmit, PostToolUse, SubagentStop and pre-commit hook
- `references/board.md`: Kanban board, views, editing in the board, acceptance review, undo, calendar, project overview, sharing and security
- `references/planning.md`: sprint and retrospective, comments, views, templates, time and cost, checks, weekly report, project knowledge, recurring tasks, cleanup
- `references/parallel.md`: several tasks at once with worktrees and agents, decision and process
- `references/import.md`: import from Trello, Notion, Linear, CSV, Excel, Word and Markdown
- `references/cli.md`: all commands and options, including `works lang`
- `references/config.md`: fields of config.json
- `references/templates/`: templates for all task types and decisions.md
- `references/de/`: German versions of SKILL.md and all references, used when the language is German
