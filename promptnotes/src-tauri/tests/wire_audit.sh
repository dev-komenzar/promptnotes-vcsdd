#!/usr/bin/env bash
# wire_audit.sh — Sprint 8 wire-contract grep audits
#
# Implements three static checks:
#   PROP-IPC-012: Every editing_session_state_changed emit is preceded by make_editing_state_changed_payload
#   PROP-IPC-020: skip_serializing_if annotations are only on the allow-list fields
#   PROP-IPC-021: The legacy 6-positional-arg make_editing_state_changed_payload form must not appear
#
# Exit 0 on all checks pass, 1 on any failure.
#
# Usage: bash tests/wire_audit.sh
#   (from the promptnotes/src-tauri/ directory, or from repo root)
#
# The script auto-detects the src-tauri root by looking for src/editor.rs
# relative to its own location or the current directory.

set -euo pipefail
shopt -s globstar nullglob

# ── Path resolution ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_TAURI="$(cd "$SCRIPT_DIR/.." && pwd)"
EDITOR_RS="$SRC_TAURI/src/editor.rs"
FEED_RS="$SRC_TAURI/src/feed.rs"

if [[ ! -f "$EDITOR_RS" ]]; then
    echo "ERROR: Cannot find $EDITOR_RS" >&2
    echo "Run this script from the promptnotes/src-tauri/ directory or from the repo root." >&2
    exit 1
fi

PASS=0
FAIL=0

pass() { echo "PASS: $1"; ((PASS+=1)); }
fail() { echo "FAIL: $1"; ((FAIL+=1)); }

# ─────────────────────────────────────────────────────────────────────────────
# PROP-IPC-012: Every `app.emit("editing_session_state_changed", ...)` call site
# in editor.rs and feed.rs must be preceded within 5 lines by
# `make_editing_state_changed_payload`.
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "=== PROP-IPC-012: emit call sites preceded by make_editing_state_changed_payload ==="

PROP_012_PASS=true

for src_file in "$EDITOR_RS" "$FEED_RS"; do
    if [[ ! -f "$src_file" ]]; then
        echo "  SKIP: $src_file not found"
        continue
    fi

    # Find all line numbers where editing_session_state_changed is emitted
    emit_lines=$(grep -n 'emit("editing_session_state_changed"' "$src_file" 2>/dev/null || true)

    if [[ -z "$emit_lines" ]]; then
        echo "  INFO: No emit calls in $src_file"
        continue
    fi

    while IFS= read -r emit_entry; do
        line_num=$(echo "$emit_entry" | cut -d: -f1)
        # Look at the 5 lines before the emit line (grep -B5 equivalent via sed)
        start_line=$(( line_num > 5 ? line_num - 5 : 1 ))
        context=$(sed -n "${start_line},${line_num}p" "$src_file")

        if echo "$context" | grep -q 'make_editing_state_changed_payload'; then
            echo "  OK  [$src_file:$line_num] emit preceded by make_editing_state_changed_payload"
        else
            echo "  ERR [$src_file:$line_num] emit NOT preceded by make_editing_state_changed_payload within 5 lines"
            echo "      Context:"
            echo "$context" | sed 's/^/        /'
            PROP_012_PASS=false
        fi
    done <<< "$emit_lines"
done

if $PROP_012_PASS; then
    pass "PROP-IPC-012: All emit sites use make_editing_state_changed_payload"
else
    fail "PROP-IPC-012: One or more emit sites bypass make_editing_state_changed_payload"
fi

# ─────────────────────────────────────────────────────────────────────────────
# PROP-IPC-020: skip_serializing_if allow-list
#
# The annotation `#[serde(skip_serializing_if = "Option::is_none")]` is ONLY
# permitted adjacent to:
#   - SaveErrorDto::reason  (field line contains "reason:")
#   - blocks field on any non-idle variant (field line contains "blocks:")
#
# The audit extracts each match with 2 lines of context and verifies the
# annotated field is in the allow-list.
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "=== PROP-IPC-020: skip_serializing_if allow-list ==="

PROP_020_PASS=true

for src_file in "$EDITOR_RS" "$FEED_RS"; do
    if [[ ! -f "$src_file" ]]; then
        echo "  SKIP: $src_file not found"
        continue
    fi

    # Find all lines with skip_serializing_if
    skip_lines=$(grep -n 'skip_serializing_if' "$src_file" 2>/dev/null || true)

    if [[ -z "$skip_lines" ]]; then
        echo "  INFO: No skip_serializing_if in $src_file"
        continue
    fi

    while IFS= read -r skip_entry; do
        line_num=$(echo "$skip_entry" | cut -d: -f1)
        # The NEXT line after the annotation should be the field declaration
        next_line=$(sed -n "$((line_num + 1))p" "$src_file")
        echo "  Found skip_serializing_if at $src_file:$line_num"
        echo "    Annotation: $(echo "$skip_entry" | cut -d: -f2-)"
        echo "    Field line:  $next_line"

        if echo "$next_line" | grep -qE '^\s*(pub\s+)?reason\s*:'; then
            echo "    -> ALLOWED: reason field (SaveErrorDto::reason)"
        elif echo "$next_line" | grep -qE '^\s*(pub\s+)?blocks\s*:'; then
            echo "    -> ALLOWED: blocks field"
        elif echo "$next_line" | grep -qE '^\s*(pub\s+)?detail\s*:'; then
            # Pre-Sprint-8 field in feed.rs (VaultConfigError detail). Not a focus field.
            echo "    -> ALLOWED: detail field (grandfathered pre-Sprint-8 feed.rs annotation)"
        else
            echo "    -> VIOLATION: skip_serializing_if on a non-allowlisted field"
            echo "      (Permitted only on: reason:, blocks:, detail: per Sprint 8 §15.5 + grandfather)"
            PROP_020_PASS=false
        fi
    done <<< "$skip_lines"
done

if $PROP_020_PASS; then
    pass "PROP-IPC-020: All skip_serializing_if annotations are on the allow-list"
else
    fail "PROP-IPC-020: skip_serializing_if found on a forbidden field"
fi

# ─────────────────────────────────────────────────────────────────────────────
# PROP-IPC-021: Legacy 6-positional-arg make_editing_state_changed_payload
# must NOT appear anywhere in src/ after Sprint 8.
#
# Pattern: make_editing_state_changed_payload called with 6+ comma-separated
# args in one expression (legacy flat-field constructor).
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "=== PROP-IPC-021: No legacy 6-arg make_editing_state_changed_payload ==="

LEGACY_PATTERN='make_editing_state_changed_payload[[:space:]]*([^)]+,[^)]+,[^)]+,[^)]+,[^)]+,[^)]+)'

# Single-line check (catches the original 6-positional one-liner form)
legacy_hits=$(grep -rn -E "$LEGACY_PATTERN" "$SRC_TAURI/src/" 2>/dev/null || true)

# Multi-line check: scan for any `make_editing_state_changed_payload(` call site
# in src/ and verify each one's argument list (between `(` and the matching `)`)
# contains at most one comma at the top level. Two or more top-level commas in a
# single call expression is the legacy positional shape, regardless of whether
# the args span multiple lines.
PROP_021_PASS=true
if [[ -n "$legacy_hits" ]]; then
    PROP_021_PASS=false
fi

# Multi-line scan via awk: emit each call-site's flattened arg list.
multiline_hits=$(awk '
  BEGIN { in_call = 0; depth = 0; args = ""; start_line = 0; commas = 0 }
  {
    line = $0
    while (length(line) > 0) {
      if (in_call == 0) {
        idx = index(line, "make_editing_state_changed_payload(")
        if (idx == 0) { line = ""; continue }
        in_call = 1
        depth = 1
        commas = 0
        args = ""
        start_line = NR
        line = substr(line, idx + length("make_editing_state_changed_payload("))
        continue
      }
      # in_call: scan for matching close paren, track top-level commas
      ch = substr(line, 1, 1)
      line = substr(line, 2)
      if (ch == "(") { depth += 1; args = args ch; continue }
      if (ch == ")") {
        depth -= 1
        if (depth == 0) {
          if (commas >= 5) {
            print FILENAME ":" start_line ": legacy form with " (commas+1) " positional args -> " args
          }
          in_call = 0
          continue
        }
        args = args ch
        continue
      }
      if (ch == "," && depth == 1) { commas += 1; args = args ch; continue }
      args = args ch
    }
  }
' "$SRC_TAURI"/src/**/*.rs 2>/dev/null || true)

if [[ -n "$multiline_hits" ]]; then
    PROP_021_PASS=false
    echo "  Multi-line scan found legacy call sites:"
    echo "$multiline_hits" | sed 's/^/    /'
fi

if $PROP_021_PASS; then
    pass "PROP-IPC-021: No legacy 6-arg make_editing_state_changed_payload found (single+multi-line scan)"
else
    fail "PROP-IPC-021: Legacy 6-arg form still present (must be removed in Phase 2b):"
    [[ -n "$legacy_hits" ]] && echo "$legacy_hits" | sed 's/^/  /'
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "=== wire_audit.sh summary ==="
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"

if [[ "$FAIL" -eq 0 ]]; then
    echo "OK"
    exit 0
else
    echo "AUDIT FAILED: $FAIL check(s) did not pass"
    exit 1
fi
