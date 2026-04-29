# @agent-memory/supabase

Reference Supabase implementation of `@agent-memory/core`. **Not published to npm.** Copy what you need into your project.

## Contents

```
migrations/
  001_agent_memory.sql      — agent_memory + action_reflections tables
  002_memory_compaction.sql — summary, merged_into, token_estimate columns
  003_risk_settings.sql     — generic risk_settings + risk_state tables
  004_compliance_log.sql    — append-only audit log

functions/
  auto-reflect/   — hourly outcome→confidence loop + compaction trigger
  compact-memory/ — summarize + cluster + merge memories
  list-ai-models/ — pure router; takes apiKeys per request, no DB lookup
```

## Apply migrations

```bash
# from your Supabase project root
cp packages/supabase/migrations/*.sql ./supabase/migrations/
supabase db push
```

## Deploy edge functions

```bash
cp -r packages/supabase/functions/* ./supabase/functions/
supabase functions deploy auto-reflect
supabase functions deploy compact-memory
supabase functions deploy list-ai-models
```

## Required env vars (edge functions)

| Var                     | Used by                | Purpose                          |
| ----------------------- | ---------------------- | -------------------------------- |
| `SUPABASE_URL`          | all                    | Project URL                      |
| `SUPABASE_SERVICE_ROLE_KEY` | all                | Service role for DB writes       |
| `SUMMARIZER_API_KEY`    | compact-memory         | OpenAI-compatible LLM API key    |
| `SUMMARIZER_API_BASE`   | compact-memory         | Base URL (default OpenAI)        |
| `SUMMARIZER_MODEL`      | compact-memory         | Model name (default gpt-4o-mini) |
| `ALLOWED_ORIGIN`        | all                    | CORS allowlist                   |

## Schedule auto-reflect

Add a `pg_cron` row to run `auto-reflect` hourly:

```sql
SELECT cron.schedule(
  'auto-reflect-hourly',
  '0 * * * *',
  $$ SELECT net.http_post(
    url := 'https://YOUR-PROJECT.supabase.co/functions/v1/auto-reflect',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ); $$
);
```
