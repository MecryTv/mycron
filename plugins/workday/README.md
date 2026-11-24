# workday

> English. Deutsche Fassung: [README.de.md](README.de.md)

Two skills for projects with [works](../works/README.md): wrap up the workday cleanly and carry on the next morning without searching.

## Installation

```
/plugin marketplace add MecryTv/mycron
/plugin install workday@mycron
```

Needs the works plugin (`/plugin install works@mycron`). Without `.works/` in the project, both skills tell you so instead of changing anything.

## End of day (skill end-of-day)

Triggers: "end of day", "that's it for today", "let's continue tomorrow".

- writes a handoff for every task in progress (what is done, what is open, next step, open questions, branch)
- saves the daily report in `.works/reports/`
- commits `.works` if it is in Git, but never pushes and leaves code changes untouched
- names branches with commits that are not on the remote yet and asks whether to push
- cleans up what Claude started in the background (test servers, Superpowers companion) and stops the live board
- sums up: done today, in progress, waiting for you, first thing tomorrow, today's usage (tokens, cost)

## Good morning (skill good-morning)

Triggers: "good morning", "continue like yesterday", "where did we leave off".

- reads handoffs and yesterday's state
- checks with ci-watch whether CI for the last push was green; red comes before everything else
- names what is due: overdue tasks and tasks due today, upcoming milestones, recurring tasks
- offers updates for your plugins if the marketplace is newer
- starts the live board and opens it in the browser if it is not open in a tab yet
- shows mockups waiting for your choice as screenshots in the Superpowers companion (needs the mockups and superpowers plugins)
- says what comes next, and starts right away if you already said so ("continue like yesterday")
