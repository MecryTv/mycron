# Parallel work with agents

Several tasks run at the same time, each in its own Git worktree with its own branch and its own agent. Claude decides on its own whether that is worth it. If it is unsure, it asks the user.

## When to check

Whenever more than one task is up and the user has not explicitly asked for a specific one: "work through the queue", "do the sprint", "get W-0012 to W-0015 done", `auto_next` after a completion. Not for a single task.

```
works parallel plan                  queue, sprint and the top suggestions
works parallel plan W-0012,W-0015    only these
```

The output has one of three results:

| Result | Meaning | What to do |
|---|---|---|
| parallel | At least two tasks ready to start, no shared files, no dependencies, large enough | Start them in parallel without asking, tell the user in one sentence which tasks run at the same time |
| sequential | Too few ready to start, conflicts over files or dependencies, or only small tasks | Work normally in this session, one after the other |
| unsure | Same folder, same area without known files, marked as related, or uncommitted changes | Give the user the reasons from the output and ask: parallel or sequential |

Your own judgment applies on top. Even with "parallel", work sequentially if the tasks will foreseeably change the same interface, the same database schema, shared configuration or `package.json`, or if one task lays the groundwork for the other. When in doubt, ask.

Unsuitable for agents and therefore left out: incomplete tasks, open questions, missing acceptance criteria, design without a chosen variant, blocked tasks. These stay with Claude in the main session or wait for the user.

## Steps

1. Start:
   ```
   works parallel start W-0012,W-0015
   ```
   Creates a worktree per task next to the project (`<project>.works-lanes/W-0012-...`) with the branch from the naming scheme of `works start`, sets the task to In progress and puts `.works.link` into the worktree. That way the works CLI there always writes to the main project's `.works`. The main session's active task stays unchanged.
2. Get the brief for each task and start an agent, all in the same reply so they run at the same time:
   ```
   works parallel prompt W-0012
   ```
   Pass the text unchanged as the agent's brief. It contains worktree, branch, description, criteria, plan, handoff, project knowledge and the rules for the agent. Do not additionally use the Agent tool's worktree isolation; the worktree already exists.
3. While the agents run: `works parallel status` shows commits and uncommitted files per lane. User instructions from the board go to the agent of the respective task. If checks are set up, the agent runs them as its brief says with `works checks run <ID>`; they run in its worktree, and the live view shows their state.
4. Review the result when an agent is done: read its answer, `works show <ID>` (checkmarks, handoff, questions), look at the diff in the branch. If the agent noted questions, ask the user.
5. Finish each task:
   ```
   works parallel finish W-0012            worktree removed, branch stays for review or a pull request
   works parallel finish W-0012 --merge    additionally merge into the base branch with --no-ff
   ```
   Only merge if the user wants it or the git-workflow skill calls for it. A merge with conflicts is aborted and the worktree stays. Then merge the base branch into the worktree, resolve the conflicts and finish again. After that, `works done <ID>` with checks and Definition of Done as usual.
6. Abort: `works parallel abort W-0012` removes the worktree. If the branch has commits, it is kept. Discard uncommitted changes only with `--force`, and only if the user asks for it.

## Rules for the main session

- At most `parallel.max` lanes at the same time (default 3).
- The working state should be committed before starting. Worktrees start at the last commit.
- Do not work on a task in the main session while it runs in parallel. `works start` and `works done` refuse as long as the worktree exists.
- Keep an eye on cost: every agent uses its own tokens. The SubagentStop hook attributes them to the task.
- At the end, summarize for the user: which tasks are done, which questions are open, what is merged and what is waiting as a branch.

## What the board shows

Cards of running lanes carry "Parallel" and show the agent's current step. The header shows "2 agents in parallel". The Code and commits tab lists the worktree with commits and uncommitted files. Under Tools, Parallel work you find the running lanes and the assessment for the next tasks.
