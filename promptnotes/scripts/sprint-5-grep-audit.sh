#!/usr/bin/env bash
#
# sprint-5-grep-audit.sh — Sprint 5 grep / filesystem audit gates
# Implements PROP-FEED-S5-001, S5-003, S5-004, S5-012, S5-014, S5-015, S5-017, S5-021.
#
# Run from promptnotes/ directory. Exits non-zero on first failure.

set -uo pipefail

# Resolve repo root: this script lives in promptnotes/scripts/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PASS=0
FAIL=0
results=""

assert_pass() {
  local name="$1"
  local detail="${2:-}"
  PASS=$((PASS + 1))
  results+="  [PASS] ${name}${detail:+ — $detail}"$'\n'
}

assert_fail() {
  local name="$1"
  local detail="$2"
  FAIL=$((FAIL + 1))
  results+="  [FAIL] ${name} — ${detail}"$'\n'
}

# ── PROP-FEED-S5-001: +page.svelte forbidden identifiers grep ────────────────

PAGE_SVELTE="src/routes/+page.svelte"
if [ -f "$PAGE_SVELTE" ]; then
  hits=$(grep -nE 'EditorPanel|editorStateChannel|tauriEditorAdapter|editor-main|feed-sidebar|grid-template-columns' "$PAGE_SVELTE" || true)
  if [ -z "$hits" ]; then
    assert_pass "PROP-FEED-S5-001" "no forbidden identifiers in +page.svelte"
  else
    assert_fail "PROP-FEED-S5-001" "forbidden identifiers in +page.svelte:\n$hits"
  fi
else
  assert_fail "PROP-FEED-S5-001" "$PAGE_SVELTE not found"
fi

# ── PROP-FEED-S5-002 (grep portion): +page.svelte must declare height:100vh ──

if [ -f "$PAGE_SVELTE" ]; then
  hits=$(grep -cE 'height:[[:space:]]*100vh' "$PAGE_SVELTE" || true)
  if [ "$hits" -ge 1 ]; then
    assert_pass "PROP-FEED-S5-002 (grep)" "height: 100vh present in +page.svelte"
  else
    assert_fail "PROP-FEED-S5-002 (grep)" "height: 100vh missing from +page.svelte"
  fi
else
  assert_fail "PROP-FEED-S5-002 (grep)" "$PAGE_SVELTE not found"
fi

# ── PROP-FEED-S5-003: editing_session_state_changed listener exactly 1 ──────

count=$(grep -rnE "listen\((['\"])editing_session_state_changed\1" \
  src/lib/ src/routes/ \
  --include='*.ts' --include='*.svelte' \
  --exclude-dir=__tests__ \
  2>/dev/null | wc -l)
count="${count// /}"
if [ "$count" = "1" ]; then
  # also assert location is editingSessionChannel.ts
  loc_hit=$(grep -nE "listen\((['\"])editing_session_state_changed\1" \
    src/lib/feed/editingSessionChannel.ts 2>/dev/null || true)
  if [ -n "$loc_hit" ]; then
    assert_pass "PROP-FEED-S5-003" "exactly 1 listener in editingSessionChannel.ts"
  else
    assert_fail "PROP-FEED-S5-003" "1 listener but not in editingSessionChannel.ts"
  fi
else
  assert_fail "PROP-FEED-S5-003" "expected 1 listener; found $count"
fi

# ── PROP-FEED-S5-004: no editorStateChannel reference in production code ─────

hits=$(grep -rnE "\beditorStateChannel\b" \
  src/lib/feed/ src/routes/+page.svelte \
  --include='*.ts' --include='*.svelte' 2>/dev/null \
  | grep -vE '/__tests__/|\.test\.|\.vitest\.|^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*)' \
  || true)
if [ -z "$hits" ]; then
  assert_pass "PROP-FEED-S5-004" "no editorStateChannel in production code"
else
  assert_fail "PROP-FEED-S5-004" "editorStateChannel found:\n$hits"
fi

# ── PROP-FEED-S5-012: editingSessionChannel handler synchronous ──────────────

CHANNEL="src/lib/feed/editingSessionChannel.ts"
if [ -f "$CHANNEL" ]; then
  # Track listen() callback body only, by counting brace depth.
  # in_block starts on the line with listen('editing_session_state_changed', ...) at
  # the moment we see "=>" (arrow function open). It ends when the depth returns to 0.
  forbidden=$(awk '
    BEGIN { depth = 0; in_block = 0 }
    /listen\(.editing_session_state_changed./ { saw_listen = 1 }
    saw_listen && /=>[[:space:]]*\{/ { in_block = 1; saw_listen = 0; depth = 1; next }
    in_block {
      # count opens/closes on this line
      n_open = gsub(/\{/, "{", $0)
      n_close = gsub(/\}/, "}", $0)
      depth += n_open - n_close
      if (/(\bawait\b|\.then\(|setTimeout\(|setInterval\(|queueMicrotask\()/) {
        # ignore lines that are pure comments (start with //, *, or /*)
        line_body = $0
        sub(/^[[:space:]]*/, "", line_body)
        if (line_body !~ /^(\/\/|\*|\/\*)/) {
          print NR ": " $0
          found = 1
        }
      }
      if (depth <= 0) { in_block = 0 }
    }
    END { if (found) exit 1 }
  ' "$CHANNEL" || true)
  if [ -z "$forbidden" ]; then
    assert_pass "PROP-FEED-S5-012" "handler is async-free"
  else
    assert_fail "PROP-FEED-S5-012" "async pattern in handler:\n$forbidden"
  fi
else
  assert_fail "PROP-FEED-S5-012" "$CHANNEL not found"
fi

# ── PROP-FEED-S5-014: forbidden EditorPane identifiers in production ─────────

hits=$(grep -rnE '\b(EditorPanel|editorStateChannel|tauriEditorAdapter|editorReducer|editorPredicates|EditorViewState|EditorAction|EditorCommand|EditorIpcAdapter)\b' \
  src/lib/feed/ src/routes/+page.svelte src/lib/block-editor/ \
  --include='*.ts' --include='*.svelte' 2>/dev/null \
  | grep -vE '/__tests__/|\.test\.|\.vitest\.|^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*)' \
  || true)
if [ -z "$hits" ]; then
  assert_pass "PROP-FEED-S5-014" "no EditorPane forbidden identifiers in production"
else
  assert_fail "PROP-FEED-S5-014" "forbidden identifiers found:\n$hits"
fi

# ── PROP-FEED-S5-015: src/lib/editor/ does not exist ─────────────────────────

if [ ! -d "src/lib/editor" ]; then
  assert_pass "PROP-FEED-S5-015" "src/lib/editor/ does not exist"
else
  assert_fail "PROP-FEED-S5-015" "src/lib/editor/ exists (should have been deleted)"
fi

# ── PROP-FEED-S5-017: createBlockEditorAdapter wire mapping ──────────────────

ADAPTER="src/lib/block-editor/createBlockEditorAdapter.ts"
if [ -f "$ADAPTER" ]; then
  # Count actual invoke() calls (exclude comment lines starting with //, *, or /*).
  invoke_count=$(grep -nE 'invoke\(' "$ADAPTER" \
    | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' \
    | wc -l)
  invoke_count="${invoke_count// /}"
  if [ "$invoke_count" = "16" ]; then
    expected_set=$(printf 'cancel_switch\ncopy_note_body\ndiscard_current_session\neditor_change_block_type\neditor_edit_block_content\neditor_focus_block\neditor_insert_block_after\neditor_insert_block_at_beginning\neditor_merge_blocks\neditor_move_block\neditor_remove_block\neditor_split_block\nrequest_new_note\nretry_save\ntrigger_blur_save\ntrigger_idle_save\n' | sort -u)
    actual_set=$(grep -oE "invoke\((['\"])([a-z_]+)\1" "$ADAPTER" \
      | sed -E "s/invoke\((['\"])([a-z_]+)(['\"]).*/\2/" \
      | sort -u)
    if [ "$expected_set" = "$actual_set" ]; then
      issuedAt_count=$(grep -cE 'issuedAt' "$ADAPTER" || true)
      if [ "$issuedAt_count" -ge 16 ]; then
        assert_pass "PROP-FEED-S5-017" "16 invokes, command set matches, issuedAt count=$issuedAt_count"
      else
        assert_fail "PROP-FEED-S5-017" "issuedAt count=$issuedAt_count (need >= 16)"
      fi
    else
      diff_out=$(diff <(echo "$expected_set") <(echo "$actual_set") || true)
      assert_fail "PROP-FEED-S5-017" "command name set mismatch:\n$diff_out"
    fi
  else
    assert_fail "PROP-FEED-S5-017" "expected 16 invokes; found $invoke_count"
  fi
else
  assert_fail "PROP-FEED-S5-017" "$ADAPTER not found"
fi

# ── PROP-FEED-S5-021: editingSessionChannel.ts INBOUND only ──────────────────

if [ -f "$CHANNEL" ]; then
  # Exclude comment lines (lines starting with //, *, or /* after optional whitespace).
  invoke_hits=$(grep -nE '\binvoke\(' "$CHANNEL" \
    | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' \
    | wc -l)
  invoke_hits="${invoke_hits// /}"
  core_hits=$(grep -nE '@tauri-apps/api/core' "$CHANNEL" \
    | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' \
    | wc -l)
  core_hits="${core_hits// /}"
  if [ "$invoke_hits" = "0" ] && [ "$core_hits" = "0" ]; then
    assert_pass "PROP-FEED-S5-021" "INBOUND only (no invoke / no core import)"
  else
    assert_fail "PROP-FEED-S5-021" "invoke=$invoke_hits, core=$core_hits (must both be 0)"
  fi
else
  assert_fail "PROP-FEED-S5-021" "$CHANNEL not found"
fi

# ── PROP-FEED-S5-013 (positive evidence): Sprint-4 baseline emit lines unchanged ──

BASELINE_TAG="vcsdd/ui-feed-list-actions/sprint-4-baseline"
if git rev-parse --verify "$BASELINE_TAG" >/dev/null 2>&1; then
  diff_emit=$(git diff "$BASELINE_TAG"..HEAD -- \
    src-tauri/src/editor.rs src-tauri/src/feed.rs 2>/dev/null \
    | grep -E '^[+-].*emit\(.(editing_session_state_changed|feed_state_changed).' \
    | grep -vE '^(\+\+\+|---)' \
    || true)
  if [ -z "$diff_emit" ]; then
    assert_pass "PROP-FEED-S5-013" "Sprint-4 emit-order baseline preserved"
  else
    assert_fail "PROP-FEED-S5-013" "emit lines changed since $BASELINE_TAG:\n$diff_emit"
  fi
else
  assert_fail "PROP-FEED-S5-013" "baseline tag $BASELINE_TAG not found"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo "Sprint 5 grep audit results:"
printf '%s' "$results"
echo "----"
echo "Pass: $PASS  Fail: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
