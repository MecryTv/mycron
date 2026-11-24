---
name: good-morning
description: Use when the user starts a new workday in a project or picks it up again after a break, for example with "good morning", "continue from yesterday", "carry on as discussed", "implement it the way we discussed yesterday" or "where did we leave off" (also the German "Guten Morgen", "weiter wie gestern", "mach weiter wie besprochen").
---

> **Language:** English is the default. If the configured language is German (`works lang` shows `de`, or the SessionStart hook says `Language: de`; without works: `"language": "de"` in `.works/config.json` or `~/.works/settings.json`), read [SKILL.de.md](SKILL.de.md) instead and answer the user in German. For any other language, use these English docs and answer in that language.

# Good morning

Counterpart to the end-of-day skill: reads yesterday's state, starts the board and continues where the handoff left off.

Requires the works plugin. `works` below stands for the works CLI, called as described in the works skill (skill works:works), always in the project folder.

## Without works

If the project has no `.works/`: give the branch, the last commits (`git log --oneline -5`) and `git status --short`, and ask what to continue with.

## Steps

1. **Read the state**, only with these commands: `works status`, `works queue`, `works list --status in-progress`, `works list --status review`, `works handoff <ID>` for each task in progress, `works list --overdue`, `works list --json` (only for due dates), `works milestone list`, `works recur list`, `git status --short`, the current branch and `git rev-parse @{u}` (last pushed commit). Task files store the status as `in-arbeit`; the English input `in-progress` works too. Only read the task.md of the task you continue with.
2. **CI of the last push:** if `origin` points to GitHub and the ci-watch skill (ci-watch:ci-watch) is available, start its script for the commit from `git rev-parse @{u}` with `--sha <commit> --grace 0` in the background and carry on. Include the result in the message; if it only arrives afterwards, follow up with it. For "no run", give the reason in a few words, as ci-watch describes it (the commit does not match the paths or branches of the workflows). Without an upstream, without GitHub or without ci-watch: skip this step.
3. **Continue with:** the active task, otherwise the task in progress with the highest priority, otherwise the first startable task in the queue, otherwise `works next`. Work already started comes first: the queue applies to what comes after. If the CI of the last push is red, it comes before everything: first today is then looking at the red step (as an offer, do not fix it unasked).
4. **Check the handoff against the repo:** does the branch from the handoff exist? Do the files it names exist? If something differs, do not guess; name the difference in the message.
5. **Plugin updates:** `claude plugin marketplace update`, then `claude plugin list --json`. For each installed plugin, compare its version with the state of its marketplace: if the version is a shortened commit hash (plugins without their own version number), the state comes from `git -C ~/.claude/plugins/marketplaces/<marketplace> rev-parse --short=12 HEAD`. Do not compare plugins with a version number (such as 1.4.0) this way. If it differs, offer the update under Waiting for you (`claude plugin update <plugin>@<marketplace>`). Marketplaces without a Git folder cannot be compared this way: skip them, do not guess. Do not update unasked.
6. **Start the board:** `works board --serve --detach --open`. The command opens the browser itself, but only if the board is not already open in a tab there. Do not open it again by hand. If it reports that the live board is already running ("Live-Board läuft bereits") without a line saying it opened the browser or that the board is already open in a browser tab, the works plugin is older: then open the URL yourself (Windows `Start-Process <url>`, macOS `open <url>`, Linux `xdg-open <url>`).
7. **Show design variants without a choice:** if `works status` lists tasks with design variants but no choice, show the variants as screenshots in the Superpowers companion:
   - Screenshots with the mockups skill (mockups:mockups): `shots` on the HTML files in the task's `design/`, per variant 1440 light and 390 dark, with `--out` straight into the companion's content folder. Never store them in `design/` or anywhere else in `.works`, otherwise the images end up in Git. Copy variants that are already images into the content folder.
   - Start the companion as the superpowers:brainstorming skill describes in `visual-companion.md`; say in one sentence beforehand that a browser tab will open. One page with a clickable card per variant, the images via `/files/`, one section per task.
   - Afterwards record the user's choice with `works design choose <ID> <variant> --reason "..."`.
   - Without mockups or Superpowers: point to the Design variants tab in the board.
8. **Start or ask:**
   - If the user explicitly said to continue ("carry on", "implement as discussed"), no open question blocks the next step and the handoff matches the repo: `works start <ID>`, switch to the task's branch and begin with the next step from the handoff. The message then comes first, without a question.
   - Otherwise: send the message and wait for the answer.

## Message

Short, in this form:

- **Yesterday:** one sentence from the handoff per task in progress, plus the CI of the last push in half a sentence (green, red, no run, still running).
- **First today:** the task from step 3 and its next step.
- **Due:** overdue tasks and tasks due today, milestones dated within the next seven days, recurring tasks dated today. Leave the line out if nothing is due.
- **Board:** the URL, plus the companion's URL if design variants are open.
- **Waiting for you:** red CI (job and step), design variants without a choice, plugin updates, open questions, tasks in review, differences from step 4. Leave the line out if nothing is waiting.

If you do not start, the message ends with the questions blocking you, numbered, at most three. No list of the commands you ran, no retelling of file contents.

## Common mistakes

| Mistake | Instead |
|---|---|
| Searching all files and logs | Only the commands from step 1 |
| Only asking questions despite "carry on" | Start if nothing blocks |
| Ignoring a missing branch or file | Name the difference, do not guess |
| Forgetting the board or only giving the URL | Start it and open it in the browser |
| Waiting for the CI before sending the message | Check in the background, follow up with the result |
| Updating plugins unasked | Only offer |
| Only mentioning design variants | Show them in the companion, record the choice with `works design choose` |
| Long message with every detail | The lines from the form |
