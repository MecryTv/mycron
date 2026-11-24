# ci-watch

> English. Deutsche Fassung: [README.de.md](README.de.md)

A skill that waits for the GitHub Actions run for a commit after a push and reports the result. When red, it names the job, the step and the error location.

## Installation

```
/plugin marketplace add MecryTv/mycron
/plugin install ci-watch@mycron
```

Needs Node 18 or newer and a repo whose `origin` points to GitHub. `gh` is not required.

## Triggers

"Does CI pass?", "let me know when the pipeline is done", "is the build green?", or right after a push when you want to wait for the result.

## What it reports

- **green**: which workflows passed
- **red**: for each failed job the step, the error annotations and the link to the job. With a token, also a log excerpt around the first error message. If the project has `.works` (works plugin), the watcher creates a P2 bug or adds to the open bug for the same workflow and step; `--no-bug` turns that off
- **no run**: when no workflow has started for the commit after three minutes, for example because the workflows only run for certain paths or branches
- **timeout**: after 20 minutes without a result, with the runs that are not finished yet

## Token and rate limit

Without a token this works for public repos. GitHub then allows 60 requests per hour, so the watcher only asks once a minute. With `GITHUB_TOKEN` or `GH_TOKEN` in the environment it asks every 30 seconds, can reach private repos and reads the log excerpt. The token only goes into the `Authorization` header, never into a URL.

## Run it directly

```
node plugins/ci-watch/skills/ci-watch/scripts/ci-status.mjs [--sha <commit>] [--repo owner/name] [--timeout 20] [--interval 60] [--grace 3] [--no-bug]
```

Exit code 0 green, 1 red, 2 no run or timeout, 3 error (not a GitHub repo, rate limit, repo not found).
