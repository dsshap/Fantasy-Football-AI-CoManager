#!/usr/bin/env bash
set -o pipefail

format_slack_mrkdwn() {
  local input_file="$1"
  local output_file="$2"

  python3 - "$input_file" "$output_file" <<'PY'
import re
import sys

source, dest = sys.argv[1], sys.argv[2]
text = open(source, encoding='utf-8').read()
lines = text.splitlines()
out = []
in_table = False

for line in lines:
    stripped = line.strip()
    is_table = stripped.startswith('|') and stripped.endswith('|')

    if is_table and not in_table:
        out.append('```')
        in_table = True
    elif not is_table and in_table:
        out.append('```')
        in_table = False

    if is_table:
        out.append(line)
        continue

    if re.match(r'^\s*-{3,}\s*$', line):
        out.append('────────')
        continue

    line = re.sub(r'^\s{0,3}#{1,6}\s+(.+)$', r'*\1*', line)
    line = re.sub(r'\*\*([^*\n]+?)\*\*', r'*\1*', line)
    out.append(line)

if in_table:
    out.append('```')

open(dest, 'w', encoding='utf-8').write('\n'.join(out))
PY
}

chunk_slack_text() {
  local input_file="$1"
  local output_file="$2"
  local max_total_length="$3"
  local run_url="$4"

  python3 - "$input_file" "$output_file" "$max_total_length" "$run_url" <<'PY'
import json
import sys

source, dest, max_total, run_url = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
text = open(source, encoding='utf-8').read()
if len(text) > max_total:
    text = text[:max_total] + f'\n\n…(truncated to {max_total} characters; see full run: {run_url})'

chunk_size = 2800
chunks = []
while text:
    if len(text) <= chunk_size:
        chunks.append(text)
        break

    split_at = max(text.rfind('\n\n', 0, chunk_size), text.rfind('\n', 0, chunk_size), text.rfind(' ', 0, chunk_size))
    if split_at < 2000:
        split_at = chunk_size

    chunks.append(text[:split_at].rstrip())
    text = text[split_at:].lstrip()

json.dump(chunks or ['No detailed LLM response or fallback insights were available.'], open(dest, 'w', encoding='utf-8'))
PY
}

send_slack_notification() {
  if [[ -z "${SLACK_WEBHOOK_URL:-}" ]]; then
    echo "::warning::SLACK_WEBHOOK_URL is not configured"
    return 1
  fi

  local status="${STATUS:-⚠️ PARTIAL}"
  local mode="${MODE:-unknown}"
  local week="${WEEK:-unknown}"
  local grade="${GRADE:-N/A}"
  local data_verification="${DATA_VERIFICATION:-Data verification unavailable}"
  local full_response="${FULL_LLM_RESPONSE:-}"
  local fallback_insights="${DESCRIPTION:-}"
  local run_url="${RUN_URL:-${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-unknown/repo}/actions/runs/${GITHUB_RUN_ID:-unknown}}"
  local max_response_length=12000

  if [[ -z "$grade" || "$grade" == "null" ]]; then
    grade="N/A"
  fi

  local response_heading="Full LLM Response"
  local response_body="$full_response"
  if [[ -z "$response_body" || ${#response_body} -le 50 ]]; then
    response_heading="Analysis Insights"
    response_body="$fallback_insights"
  fi

  if [[ -z "$response_body" ]]; then
    response_body="No detailed LLM response or fallback insights were available."
  fi

  local raw_response_file formatted_response_file raw_data_file formatted_data_file chunks_file payload_file response_file
  raw_response_file="$(mktemp)"
  formatted_response_file="$(mktemp)"
  raw_data_file="$(mktemp)"
  formatted_data_file="$(mktemp)"
  chunks_file="$(mktemp)"
  payload_file="$(mktemp)"
  response_file="$(mktemp)"

  cleanup() {
    rm -f "$raw_response_file" "$formatted_response_file" "$raw_data_file" "$formatted_data_file" "$chunks_file" "$payload_file" "$response_file"
  }
  trap cleanup RETURN

  printf '%s' "$response_body" > "$raw_response_file"
  printf '%s' "$data_verification" > "$raw_data_file"
  format_slack_mrkdwn "$raw_response_file" "$formatted_response_file"
  format_slack_mrkdwn "$raw_data_file" "$formatted_data_file"
  chunk_slack_text "$formatted_response_file" "$chunks_file" "$max_response_length" "$run_url"

  local formatted_data
  formatted_data="$(cat "$formatted_data_file")"

  local fallback_text
  printf -v fallback_text 'Phase 4 Advanced Intelligence - %s | Mode: %s | Week: %s | Grade: %s | %s' \
    "$status" "$mode" "$week" "$grade" "$run_url"

  jq -n \
    --arg text "$fallback_text" \
    --arg status "$status" \
    --arg mode "$mode" \
    --arg week "$week" \
    --arg grade "$grade" \
    --arg run_url "$run_url" \
    --arg data "$formatted_data" \
    --arg response_heading "$response_heading" \
    --slurpfile response_chunks "$chunks_file" \
    '{
      text: $text,
      unfurl_links: false,
      unfurl_media: false,
      blocks: (
        [
          {type: "header", text: {type: "plain_text", text: "🧠 Phase 4 Advanced Intelligence", emoji: true}},
          {type: "section", fields: [
            {type: "mrkdwn", text: ("*Status:*\n" + $status)},
            {type: "mrkdwn", text: ("*Mode:*\n" + $mode)},
            {type: "mrkdwn", text: ("*Week:*\n" + $week)},
            {type: "mrkdwn", text: ("*Grade:*\n" + $grade)}
          ]},
          {type: "context", elements: [{type: "mrkdwn", text: ("<" + $run_url + "|View GitHub Actions run>")}]},
          {type: "divider"},
          {type: "section", text: {type: "mrkdwn", text: ("*Data Verification:*\n" + $data)}},
          {type: "divider"},
          {type: "section", text: {type: "mrkdwn", text: ("*" + $response_heading + ":*")}}
        ] + ($response_chunks[0] | map({type: "section", text: {type: "mrkdwn", text: .}}))
      )
    }' > "$payload_file"

  local payload_size
  payload_size=$(wc -c < "$payload_file" | tr -d ' ')
  local http_code

  echo "📨 Sending Slack Block Kit notification ($payload_size bytes)"
  if http_code=$(curl -sS -o "$response_file" -w "%{http_code}" -X POST "$SLACK_WEBHOOK_URL" -H "Content-Type: application/json" --data-binary @"$payload_file"); then
    if [[ "$http_code" =~ ^2 ]]; then
      echo "✅ Slack notification delivered"
      return 0
    fi

    echo "::warning::Slack webhook returned HTTP $http_code: $(cat "$response_file")"
    return 1
  fi

  echo "::warning::Slack webhook request failed: $(cat "$response_file" 2>/dev/null || true)"
  return 1
}

send_slack_notification
