---
name: end-of-day
description: Use when the user ends the workday in a project, for example with "end of day", "done for today", "let's continue tomorrow", "that's enough for today" or "stop the board, we'll continue tomorrow" (also the German "Feierabend", "Schluss für heute", "wir machen morgen weiter").
---

> **Language:** English is the default. If the configured language is German (`works lang` shows `de`, or the SessionStart hook says `Language: de`; without works: `"language": "de"` in `.works/config.json` or `~/.works/settings.json`), read [SKILL.de.md](SKILL.de.md) instead and answer the user in German. For any other language, use these English docs and answer in that language.

# End of day

Wraps up the day so the good-morning skill can continue the next day without asking: handoffs for everything in progress, state saved, board off, a short summary.

Requires the works plugin. `works` below stands for the works CLI, called as described in the works skill (skill works:works), always in the project folder.

## Without works

If the project has no `.works/`: say that end of day only knows handoffs and the board with works, name uncommitted code changes (`git status --short`) and offer to commit them. Do nothing else.

## Steps

All nine steps, in this order:

1. **Gather the state:** `works status`, `works list --status in-progress`, `works report --days 1`, `works time --today` (today's usage), `git status --short` and the current branch. Task files store the status as `in-arbeit`; the English input `in-progress` works too.
2. **Handoff for each task in progress:** `works handoff <ID> --text "..."`. Each handoff contains:
   - what is done,
   - what is open,
   - the next concrete step (file, function, command),
   - open questions for the user,
   - the branch and whether uncommitted code is lying there.

   Write the active task (from `works status`) last: `works handoff` makes the task whose handoff it writes the active one.
3. **Do not commit code unasked:** uncommitted changes outside `.works` stay where they are and go into the message (files, branch).
4. **Save the daily report:** `works report --days 1 --write`; the output names the file in `.works/reports/`.
5. **Save `.works`:** if `git ls-files .works` returns something, commit only `.works`: `git add .works` and `git commit -m "works: end of day <date>"`. Never push. If `.works` is not in Git, commit nothing.
6. **Find what is not pushed:** `git for-each-ref --format="%(refname:short) %(upstream:short) %(upstream:track)" refs/heads`. Branches with `ahead` have commits that are not on the remote yet, usually including the end-of-day commit from step 5. Branches without an upstream count if `git log --oneline origin/HEAD..<branch>` returns something (the remote's main branch; a local `main` does not have to exist). Push nothing, only include it in the message.
7. **Clean up the background:** stop whatever you started in the background in this session and no longer need: test servers (such as a board from a copy on a different port), watchers, running background commands. Running Superpowers companions show up as folders under `.superpowers/brainstorm/` with `state/server-info` and without `state/server-stopped`; stop them with `stop-server.sh <session folder>` from the superpowers:brainstorming skill. Do not touch processes the user started themselves, or programs like Docker Desktop.
8. **Stop the board:** `works board --stop`.
9. **Message to the user** in the form below.

## Message

Short, in this form:

- **Done today:** tasks from the daily report, otherwise "nothing finished".
- **In progress:** per task the ID, title and the next step from the handoff.
- **Waiting for you:** tasks in review and open questions. Leave the line out if nothing is waiting.
- **First tomorrow:** one task with one sentence of reasoning. Order: the active task, then other tasks in progress by priority, then the user's queue (`works queue`), then `works next`.
- **Usage today:** tokens and estimated cost from `works time --today`.
- **Saved:** what was committed, the saved daily report, what stays uncommitted, which branches are how many commits ahead of the remote, what was cleaned up, board stopped.

The message ends with at most two numbered questions, only when there is a reason: whether uncommitted code changes should be committed on the branch as work in progress, and whether the unpushed commits should be pushed. Otherwise it ends without a question.

## Common mistakes

| Mistake | Instead |
|---|---|
| Handoff only for the active task | For every task with status in progress |
| Active task changes silently | Write its handoff last |
| `.works` not saved, asked instead | Commit if `.works` is in Git |
| Pushed | Never push, not even when everything is green; only name it and ask |
| Summary without what got done | Read the daily report, name what is done |
| Daily report only read | Save it with `--write` |
| Stopped the user's processes | Only stop what you started in this session |
