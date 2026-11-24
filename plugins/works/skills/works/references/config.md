# config.json

Lives at `.works/config.json`. Missing fields are filled with defaults, so the file only needs to contain what differs. The CLI takes care of changes to `next_id` and `milestones`.

| Field | Default | Meaning |
|---|---|---|
| `language` | not set | Language for this project (`en`, `de`), takes precedence over `~/.works/settings.json`. Set with `works lang de --project`, see below |
| `id_prefix` | `"W"` | Prefix of the IDs, can be set at init with `--prefix` |
| `id_digits` | `4` | Digits of the number |
| `next_id` | `1` | Next free number (maintained automatically, `doctor --fix` corrects it) |
| `next_idea_id` | `1` | Next idea number |
| `milestones` | `[]` | List of `{ id, title, due, description, status }` |
| `dod.global` | see below | Manual DoD items for all tasks |
| `dod.by_type` | see below | Additional manual items per type |
| `dod.by_tag` | `{ "ui": [...] }` | Additional manual items per tag |
| `dod.commands` | `[]` | Shell commands that `works done --run` runs, for example `["npm run build", "npm test"]` |
| `assets.max_width` | `2400` | Maximum image width when compressing |
| `assets.quality` | `82` | Quality when compressing |
| `assets.compress_on_add` | `false` | Compress new images automatically (needs sharp) |
| `brainstorm.mode` | `"link"` | Default for `attach-doc`: link, copy or move |
| `github.label_priority` | mapping | Labels to P1, P2, P4 (everything else becomes P3) |
| `github.label_type` | mapping | Labels to types (default feature) |
| `scan.markers` | `["TODO","FIXME","HACK","XXX"]` | Markers to search for |
| `scan.ignore` | common build folders | Ignored folders, in addition to .gitignore |
| `hooks.session_start` | `true` | SessionStart hook active in this project |
| `hooks.stop_reminder` | `true` | Stop hook active in this project |
| `report.days` | `7` | Default period for `works report` |
| `handoff_stale_days` | `3` | When `doctor` reports a task in progress without updates and the board shows it as quiet (notice "quiet for 3 days", label on the card, item under Waiting for you). In the board, replies, file changes, ticked steps and changes to the task.md count as activity. `0` turns the notice off in the board |
| `queue`, `queue_settings` | `[]`, see board.md | The user's queue and what happens after a task (`auto_next`, `ask_before`, `skip_blocked`) |
| `sprints` | `[]` | Sprints with `id`, `title`, `goal`, `start`, `end`, `capacity`, `status`, `tasks`, after closing `result` and `carry` |
| `sprint_settings` | `{ "length_days": 14, "capacity": 20, "points": { "S": 1, "M": 2, "L": 4, "XL": 8 } }` | Default length, capacity and points per effort |
| `views` | `[]` | Views saved in the board: `name`, `filter`, `view`, `sort` |
| `checks` | `{}` | Checks before completion, name to command, `skill:code-audit` for skills. Instead of the command also `{ "cmd": "npm run check", "cwd": "Discord Bot" }` with a working folder relative to the project (relative to the worktree for parallel tasks), never outside of it |
| `checks_by_type` | `{}` | Which checks apply per type, all of them without an entry |
| `time_tracking` | `true` | Time tracking via the hooks |
| `effort_mode` | `"fixed"` | `measured` makes timeline, graph and sprint calculate with measured durations |
| `effort_days` | `{ "S": 2, "M": 5, "L": 10, "XL": 15 }` | Fixed duration per effort in calendar days |
| `report.enabled`, `report.weekday`, `report.time` | `false`, `5`, `"16:00"` | Weekly report due automatically, weekday 1 to 7 and time |
| `report.destinations` | `{ "file": true, "discord": false }` | Destinations of the weekly report. The Discord URL is only stored in `report.local.json` |
| `report.include` | all `true` | Sections: `done`, `attention`, `next`, `milestones` |
| `live_activity` | `true` | The board shows what Claude is doing right now, and instructions arrive while Claude is still answering |
| `recurring` | `[]` | Rules for recurring tasks, see below |
| `github_sync` | see below | Automatic sync with GitHub |
| `prices` | see below | Prices for the cost estimate |
| `parallel` | `{ "max": 3, "dir": "", "min_effort": "M" }` | Maximum number of concurrent lanes, folder for worktrees (default `<project>.works-lanes` next to the project), from which effort parallel work pays off |
| `file_tracking` | `true` | Remember files per task and show notices on edit |
| `cleanup_ignore` | `[]` | Pairs like `["W-0016", "W-0017"]` that cleanup no longer reports as duplicates |
| `sprints[].retro` | | Answers from the sprint retrospective: `good`, `bad`, `change` |

## Language

The language determines the output of CLI and hooks, which version of the docs applies (English: SKILL.md and references/, German: SKILL.de.md and references/de/) and the headings of new tasks. Stored values such as status and priority stay the same, existing tasks in the other language stay valid.

It is stored in the field `language`, globally in `~/.works/settings.json` or for one project in `.works/config.json`:

```json
{ "language": "de" }
```

The environment variable `WORKS_LANG` takes precedence, then the project, then the global setting, otherwise English (`en`) applies. The easiest way is `works lang` (show), `works lang de` (global), `works lang de --project` and `works lang --reset [--project]` (remove the setting).

## Recurring tasks

```json
"recurring": [
  { "id": "R1", "title": "Update dependencies ({Monat})", "kind": "monthly", "nth": 1, "weekday": 1,
    "template": "", "type": "chore", "priority": "P3", "status": "geplant", "due_days": 7, "queue": false, "sprint": false, "active": true }
]
```

`kind` is `daily`, `weekly` (with `weekday` 1 Monday to 7 Sunday and `interval` in weeks), `monthly` (`nth` 1 to 5 for the nth weekday, 5 means last, or `day` for a fixed day) or `days` (with `interval`). `{Datum}` (date) and `{Monat}` (month) in the title are replaced. If the task last created by a rule is still open, no second one is created. works maintains `last` and `lastTask` itself. Easiest via `works recur` or the board under Tools.

## GitHub sync

```json
"github_sync": { "enabled": true, "pr_review": true, "merge_done": true, "ci_checks": true, "review_comments": true,
  "issues": true, "labels": [], "close_issues": true, "interval_min": 2 }
```

`labels` limits the import of new issues to these labels, empty means all. The sync state is stored locally in `.works/github.json`.

## Prices

```json
"prices": { "currency": "USD", "models": { "opus": { "input": 5, "output": 25 }, "sonnet": { "input": 3, "output": 15 },
  "haiku": { "input": 1, "output": 5 }, "default": { "input": 3, "output": 15 } },
  "cache_write_factor": 1.25, "cache_read_factor": 0.1 }
```

Dollars per million tokens. The model is matched by its name in the transcript (if it contains opus, sonnet or haiku). Cache writes cost the factor times the input price, cache reads likewise. The values are estimates; with a subscription or other terms, enter your own values.

## Definition of Done

The automatic checks are built in (acceptance criteria, open questions, implementation steps, type-specific sections, screenshots and decisions.md for UI). The lists in `dod` are items Claude has to check and confirm itself.

Default:

```json
"dod": {
  "global": [
    "Build and tests run without errors",
    "code-audit skill was run for the changes",
    "History is up to date and design decisions are documented"
  ],
  "by_type": {
    "bug": ["Regression test exists or skipping it is justified"],
    "refactor": ["External behavior unchanged"],
    "spike": ["Follow-up tasks are created"],
    "debt": ["Debt is fully repaid or the remaining follow-up costs are documented"]
  },
  "by_tag": {
    "ui": ["responsive-website-check was run"]
  },
  "commands": []
}
```

Simply add project-specific items, for example `"Discord slash commands re-registered"` for a bot or `"Migration tested on staging"`.
