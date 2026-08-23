#!/usr/bin/env bash
# smoke-edge.sh — Post-deploy smoke test for critical Supabase edge functions.
#
# Usage:
#   SUPABASE_URL=https://xxxx.supabase.co \
#   ANON_KEY=eyJ... \
#   bash scripts/smoke-edge.sh
#
# Optional: pass a user JWT to test auth-gated endpoints.
#   USER_JWT=eyJ... bash scripts/smoke-edge.sh
#
# Exit code: 0 = all pass, 1 = one or more failed.

set -euo pipefail

BASE="${SUPABASE_URL:?SUPABASE_URL is required}/functions/v1"
ANON_AUTH="Authorization: Bearer ${ANON_KEY:?ANON_KEY is required}"
USER_AUTH="Authorization: Bearer ${USER_JWT:-$ANON_KEY}"

PASS=0
FAIL=0

check_anon() {
  local fn="$1"
  local body="${2:-{}}"
  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$BASE/$fn" \
    -H "$ANON_AUTH" \
    -H "Content-Type: application/json" \
    -d "$body" \
    --max-time 15)
  if [ "$http_status" -lt 500 ]; then
    echo "  OK   ($http_status)  $fn"
    PASS=$((PASS + 1))
  else
    echo "  FAIL ($http_status)  $fn"
    FAIL=$((FAIL + 1))
  fi
}

check_auth() {
  local fn="$1"
  local body="${2:-{}}"
  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$BASE/$fn" \
    -H "$USER_AUTH" \
    -H "Content-Type: application/json" \
    -d "$body" \
    --max-time 15)
  # 400/401/402 are expected for missing params/credits — still means the function responded
  if [ "$http_status" -lt 500 ]; then
    echo "  OK   ($http_status)  $fn"
    PASS=$((PASS + 1))
  else
    echo "  FAIL ($http_status)  $fn"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "Smoke testing: $BASE"
echo "──────────────────────────────────────────────"

# Public / anon-accessible (ping = real health; health = thin alias)
check_anon  "ping"                          '{}'
check_anon  "health"                        '{}'

# Auth-gated (expect 400/401 without a real session, not 500)
check_auth  "deepgram-token"                '{}'
check_auth  "generate-hint"                 '{"question":"test","session_id":"00000000-0000-0000-0000-000000000000"}'
check_auth  "generate-debrief"              '{"session_id":"00000000-0000-0000-0000-000000000000"}'
check_auth  "prep-tool"                     '{"tool_id":"rephrase","input":"test"}'
check_auth  "select-test-questions"         '{"config":{"exam_type":"JEE_MAIN","question_count":5}}'
check_auth  "generate-star-answer"          '{"questionText":"Tell me about yourself"}'
check_auth  "analytics-dashboard"           '{}'
check_auth  "compare-sessions"              '{"session_a_id":"00000000-0000-0000-0000-000000000000","session_b_id":"11111111-1111-1111-1111-111111111111"}'
check_auth  "ai-coach-chat"                 '{"message":"hello","history":[]}'

echo "──────────────────────────────────────────────"
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
