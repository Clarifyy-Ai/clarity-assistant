# Monitoring & alert setup (provider-neutral)

Career Pilot emits structured JSON via `opsLog` and existing Edge Function loggers.

## Wire-up steps (external ops)

1. Attach Supabase Edge Function logs to your drain (Datadog / Grafana Loki / CloudWatch / Axiom).
2. Parse JSON fields: `function_name`, `operation`, `result`, `error_class`, `provider_event_id`, `retryable`.
3. Create monitors from RUNBOOK.md thresholds.
4. Route SEV1 to on-call; SEV2 to engineering Slack.

## Do not log

Access tokens, Authorization headers, raw Stripe/Razorpay secrets, BYOK keys, full webhook payloads, interview transcripts, passwords, service-role keys.
