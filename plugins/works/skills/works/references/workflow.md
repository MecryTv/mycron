# Workflows

`works` stands for `node "${CLAUDE_SKILL_DIR}/scripts/works.mjs"` (see SKILL.md).

## Setup

Run `works init` only when the user asks for it. Settle first how `.works/` should be handled in Git:

| Option | Effect |
|---|---|
| `--gitignore default` | Everything is committed except `board.html`, `state.json` and the inbox. Recommended for solo projects and team transparency |
| `--gitignore assets` | Also ignore the `assets/` folders. Useful with many large screenshots |
| `--gitignore all` | The whole folder stays local |
| `--gitignore none` | Don't create a `.works/.gitignore` |

Then optionally milestones (`works milestone add M1 --title "Beta" --due 2026-12-01`) and the Git pre-commit hook (`works install-hooks --git`, see hooks.md). With the plugin installation, the Claude Code hooks are already active.

## Session start

1. If the SessionStart hook is active, the overview is already in the context. Otherwise run `works status`.
2. Tell the user about open P1s before starting anything else.
3. If there is an active task with a handoff, read the handoff and tell the user in one or two sentences where work continues. Settle open questions from the handoff first.
4. If something is in the inbox, ask the user which task it belongs to.

## Capturing

### Quick capture

Triggers: "note this down", "put that on the list", "we need to do that later".

```
works new --type bug --title "Avatar not shown on webhook messages" --priority P3 --incomplete
```

Derive type and priority from what was said, P3 when in doubt. Tell the user the ID and your assumptions in one sentence. Don't interrupt the actual work.

### Full capture

1. Settle type, priority and effort. If something essential is missing, ask.
2. `works new --type feature --title "..." --priority P2 --effort M [--tags ui] [--due ...] [--milestone M1] [--blocked-by W-0003]`
3. Open the new task.md with Read and fill in the sections with Edit. Agree on the acceptance criteria with the user.
4. For user interfaces, set `--tags ui` or choose type `design`. Additional DoD checks apply then.
5. If needed, `works decisions <ID>` for a decisions.md.

### From an error message or stack trace

1. Write the log to a file in the scratchpad.
2. `works new --type bug --title "<gist of the error>" --priority <by impact> --source stacktrace --log-file <path>`
3. Add summary, environment and, as far as known, reproduction. Root cause only after analysis.

### From TODO comments

```
works scan                       # shows all markers, new or known
works scan --create --marker FIXME,HACK
```

FIXME and XXX become bugs with P2, HACK becomes tech debt with P3, TODO becomes a chore with P3. All of them are `incomplete` and carry the tag `code-scan`. Show the user the list first and ask which ones to take over. A repeated scan recognizes markers that were already taken over.

### From GitHub issues

```
works gh-import --dry-run
works gh-import --state open --limit 50
```

Needs the `gh` CLI, signed in. Labels are mapped to type and priority via `config.json`. Issues that were already imported are skipped. In the other direction, `works gh-export <ID>` creates an issue; that is a publication and needs the user's explicit consent first.

### Ideas

```
works idea "Leaderboard with weekly ranking" --tags dashboard
works ideas
works promote I-001 --type feature --priority P3
```

Ideas are deliberately non-binding. Promoted ideas are struck through in `ideas.md` and point to the new task.

## Planning

- Order: `works link W-0005 blocked-by W-0003`. Cycles are rejected.
- Related without order: `works link W-0005 related W-0007`.
- Milestones: `works milestone add M2 --title "Release 1.0" --due 2027-01-15`, assign with `works set <ID> milestone=M2`, progress in WORKS.md and `works milestone list`.
- Deadlines: `works set <ID> due=2026-11-15`. Overdue tasks show up in WORKS.md, in the board and in the report.
- Suggest that the user split large tasks (XL).
- Recommendation: run `works next` and pass on its reasoning.

## Working

1. `works start <ID>`. Prints context, acceptance criteria, handoff and asset descriptions and sets the task as active. Blocked tasks only start with `--force` after checking with the user.
2. Branch: the output contains a branch name following the pattern `<prefix>/<id>-<slug>`. If the git-workflow skill is available, use this name there. Otherwise `works start <ID> --git`.
3. For UI tasks, capture the current state before the first change (assets.md).
4. While implementing, check off items in the implementation plan and the acceptance criteria. Record important findings or changes of direction with `works log <ID> "..."`.
5. New findings that are a task of their own go in right away with `works new` instead of silently growing the scope.
6. Record decisions with alternatives in `decisions.md`, not only in the chat.
7. Save questions for the user that aren't answered right away with `works question`.
8. For review by the user: `works set <ID> status=review`.

Keep only one task in progress at a time. If the user switches to another task, write a handoff for the previous one first.

## Handoff

When: at the end of every work phase, before switching tasks, when the user takes a break, when the context is foreseeably running low or could get compacted, and when the Stop hook reminds you.

```
works handoff W-0012 --text "..."
```

The handoff replaces the previous one and contains:

- Done: what was finished since the last handoff
- State: exactly where work continues (file, function, next concrete step)
- Open points and assumptions: what was assumed for now and needs confirmation
- Notes: pitfalls, running processes, temporary changes that need to be reverted

Example:

```
Done: rebuilt the form as a centered layout, created dark mode tokens.
State: src/pages/login.tsx, error states are still missing. Next step: error messages below the fields instead of a toast.
Assumptions: "Forgot password" stays a link, not a button (check with the user).
Notes: in vite.config.ts the proxy is temporarily set to port 4000 for tests.
```

## Finishing

1. `works done <ID>` checks automatically: acceptance criteria, open questions, implementation steps, the root cause for bugs, results and recommendation for spikes, the rollback for refactorings, before and after screenshots plus entries in decisions.md for UI tasks.
2. Actually carry out the manual items from the definition of done: run tests or the build (or `works done <ID> --run` if `dod.commands` is maintained), apply the code-audit skill to the changes, and responsive-website-check for UI.
3. `works done <ID> --confirm`. The handoff is cleared, the status set, and tasks that are now unblocked are listed.
4. Follow the notes in the output, for example taking entries over into the decision log.
5. Now and then `works archive --older-than 14`, and before releases `works changelog --version x.y.z --write`.

If a DoD item can't be met, ask the user. Only with their consent use `--force --reason "..."`; the reason goes into the history.

## Dropping and reopening

```
works drop W-0008 --reason "Covered by W-0003"
works reopen W-0002 --reason "Error comes back after a restart" --status in-progress
```

Reopening brings the task back from the archive and increments `reopened`.

## Reporting

- `works report --days 7 [--write]`: weekly report with what was done, new, blocked, overdue, and milestones
- `works changelog [--since 2026-10-01] [--milestone M1] [--version 1.2.0] [--write]`: grouped into new, fixed, improved, other
- `works commits <ID> [--write]`: all commits with the ID
- `works board --serve`: live Kanban in the browser, see board.md
- `works doctor [--fix]`: consistency check, then go through the warnings with the user
