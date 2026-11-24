# mycron

> English. Deutsche Fassung: [README.de.md](README.de.md)

Plugins for Claude Code by MecryTv.

```
/plugin marketplace add MecryTv/mycron
/plugin install works@mycron
/plugin install workday@mycron
/plugin install ci-watch@mycron
/plugin install mockups@mycron
```

## Plugins

| Plugin | Description |
|---|---|
| [works](plugins/works/README.md) | Task management in `.works/` with live board, queue, sprints, timeline, dependency graph, comments to Claude, templates, automatic checks, time tracking, weekly report and sharing on the network |
| [workday](plugins/workday/README.md) | End of day and good morning: write handoffs, save `.works`, stop the board, sum up the day and pick up there the next morning (needs works) |
| [ci-watch](plugins/ci-watch/README.md) | After a push, waits for the GitHub Actions run for the commit and reports green or red, for red with job, step and error location. Without `gh`, for public repos without a token |
| [mockups](plugins/mockups/README.md) | Variants as HTML mockups with the project's real styles, screenshots at three widths in light and dark, checks for horizontal scrolling and errors, attaching to works tasks |
