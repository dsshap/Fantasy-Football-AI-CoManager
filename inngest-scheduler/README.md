# Inngest Scheduler

This package replaces unreliable native GitHub `schedule` events with Inngest cron functions that call the original repository's already-working `workflow_dispatch` endpoint.

It dispatches the workflow in:

```text
dsshap/Fantasy-Football-AI-CoManager
```

so ESPN, LLM, Slack, and league secrets stay in the original GitHub repository.

## Scheduled functions

| Function | Inngest cron | GitHub input |
| --- | --- | --- |
| Daily full analysis | `17 13 * * *` | `intelligence_mode=full` |
| Game-day realtime monitoring | `23 0,4,8,12,16,20 * * 0,1,4` | `intelligence_mode=realtime` |
| Tuesday waiver analytics | `29 14 * * 2` | `intelligence_mode=analytics` |

The functions run only during September-January unless `DISABLE_NFL_SEASON_GATE=true` is set.

## Deploy

A simple deployment path is Vercel:

1. Import the original GitHub repo into Vercel.
2. Set the Vercel project **Root Directory** to `inngest-scheduler`.
3. Add environment variables:

```text
GITHUB_DISPATCH_TOKEN=...      # fine-grained PAT; Actions: read/write, Contents: read
INNGEST_SIGNING_KEY=...        # from Inngest Cloud
INNGEST_EVENT_KEY=...          # from Inngest Cloud
```

Optional overrides:

```text
GITHUB_OWNER=dsshap
GITHUB_REPO=Fantasy-Football-AI-CoManager
GITHUB_WORKFLOW_ID=fantasy-phase4-intelligence.yml
GITHUB_WORKFLOW_REF=main
FANTASY_SCHEDULER_DRY_RUN=false
DISABLE_NFL_SEASON_GATE=false
```

4. In Inngest Cloud, sync the app URL:

```text
https://<your-vercel-domain>/api/inngest
```

## GitHub token

Create a fine-grained personal access token scoped to `dsshap/Fantasy-Football-AI-CoManager` with:

- **Actions**: Read and write
- **Contents**: Read

No ESPN, LLM, FantasyPros, or Slack secrets are needed in Vercel/Inngest.
