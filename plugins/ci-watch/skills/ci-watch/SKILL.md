---
name: ci-watch
description: Use when the user wants to know after a push whether CI passes, whether GitHub Actions are green, whether the build or pipeline is finished, or why a workflow run is red. Also when gh is missing or there is no token.
---

> **Language:** English is the default. If the configured language is German (`works lang` shows `de`, or the SessionStart hook says `Language: de`; without works: `"language": "de"` in `.works/config.json` or `~/.works/settings.json`), read [SKILL.de.md](SKILL.de.md) instead and answer the user in German. For any other language, use these English docs and answer in that language.

# CI watch

A Node script waits for the GitHub Actions runs for a commit and reports the result. It polls at fixed intervals, respects the rate limit and fetches the error locations when a run is red. So there is no need for your own `curl` calls to the GitHub API. Without a token they cost rate limit (60 per hour), and the script asks for the same thing.

## Steps

1. **Pick the commit.** The default is `HEAD`. Check with `git status -sb` whether it is pushed. If it says `ahead`, there is no run on GitHub yet: tell the user, do not push yourself. If several commits went out in one push, GitHub only starts the run for the last of them: check that one, not an earlier merge commit from the same push.
2. **Start the script in the background** (Bash with `run_in_background: true`; it can run for up to 20 minutes):
   ```
   node "${CLAUDE_SKILL_DIR}/scripts/ci-status.mjs"
   ```
   Options: `--sha <commit>`, `--repo owner/name` (otherwise from `origin`), `--timeout <minutes>` (default 20), `--grace <minutes>` (how long there may be no run yet, default 3), `--no-bug` (do not create a bug in works when red).
   Tell the user in one sentence that you are waiting. Until the background job reports, do other work or end the turn. Do not poll in between, no Monitor, no `sleep` loops: the end of the background job is reported automatically.
3. **Report the result by exit code**, with the script's output as the only source:

| Exit | Meaning | Report |
|---|---|---|
| 0 | green | One sentence: green, which workflows. |
| 1 | red | Structure see below. |
| 2 | no run or timeout | Pass on the script's sentence. For "no run", read the `on:` conditions in `.github/workflows/*.yml` and say whether the commit matches them (paths, branches). |
| 3 | error | Pass on the message (not a GitHub repo, repo not found, rate limit with time). |

## Report when red

In this order:

1. **Verdict**: "CI red for `<sha>`" and the workflow.
2. **What fails**, with identical errors grouped: job (for matrix jobs, which combinations, and which are green, per the line "x of y jobs red. Green: …"), step, error location from the annotations or the log excerpt. Jobs marked "no error location fetched" lack an error location only for that reason, not because there is none.
3. **Link** to the first failed job.
4. **Bug**: if the project has `.works`, the script creates a P2 bug ("Bug W-… created") or adds to the open bug for the same workflow and step ("updated"). Give the ID. If the user does not want that, start with `--no-bug` next time.
5. **Next step** as an offer: "Shall I look at the step `<name>` in the code?" Do not fix, commit or push unasked.

Only report what is in the output. Guesses about the cause (paths, permissions, line endings) do not belong in the report. Whoever wants to know the cause gets it after reading the code or the log.

## Token

Without a token: public repos, one request per minute, annotations instead of a log excerpt. If the user misses the log excerpt, say: "With `GITHUB_TOKEN` in the environment the watcher also reads the log excerpt; otherwise it is behind the link."

Never ask for the token yourself, and never let a token be written into the chat, a URL or a file in the repo. The user sets it in their own shell. The script only sends it in the `Authorization` header.
