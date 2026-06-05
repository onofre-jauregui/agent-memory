# @agent-memory/supabase

Reference Supabase implementation of `agent-memory-core`. **Not published to npm.** Copy what you need into your project.

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

## Security

> **Warning — tighten RLS policies before going to production.**

The reference migrations include Row Level Security policies that use `WITH CHECK (true)`, which permits any authenticated user to write to any row. This is intentional for the reference implementation (it keeps the migrations readable), but it is **not safe for multi-tenant production use**.

Before deploying to production, replace the open `WITH CHECK (true)` clauses with user-scoped checks. Example for `agent_memory`:

```sql
-- Drop the open policy
DROP POLICY IF EXISTS "allow_all_authenticated" ON agent_memory;

-- Replace with a user-scoped policy
CREATE POLICY "users_own_memories"
  ON agent_memory
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Apply the same pattern to `risk_settings`, `risk_state`, and `compliance_log`. For service-role edge functions (like `auto-reflect`), pass the service role key — it bypasses RLS by design.

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
