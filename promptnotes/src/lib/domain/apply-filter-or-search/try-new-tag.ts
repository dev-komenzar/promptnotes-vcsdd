// apply-filter-or-search/try-new-tag.ts
//
// REQ-001, REQ-002, REQ-003
// Pure function. No I/O, no side effects.
//
// Normalization pipeline (in order):
//   1. Trim whitespace.
//   2. Strip leading '#'.
//   3. Lowercase.
// Rejection rules (checked after each step):
//   - Pre-trim was empty string                  → { kind: "empty" }
//   - Post-trim is empty (whitespace-only input) → { kind: "only-whitespace" }
//
// Character-set policy is deferred to a future spec amendment per behavioral-spec.md
// Open Question 4. The canonical TagError from docs/domain/code/ts/src/shared/value-objects.ts
// declares exactly two variants: { kind: "empty" } | { kind: "only-whitespace" }.

import type { Tag, TagError } from "promptnotes-domain-types/shared/value-objects";
import { ok, err } from "promptnotes-domain-types/util/result";
import type { Result } from "promptnotes-domain-types/util/result";

/**
 * Validate and normalize a raw tag string into a Tag value object.
 *
 * Normalization: trim, strip leading '#', lowercase.
 * Returns Err with the canonical TagError shape if the result is empty or was
 * whitespace-only. Character-set validation is deferred per Open Question 4.
 */
export function tryNewTag(raw: string): Result<Tag, TagError> {
  if (raw.length === 0) {
    return err({ kind: "empty" });
  }

  // Normalization pipeline: trim → strip leading '#' → lowercase → trim again
  const trimmed1 = raw.trim();

  if (trimmed1.length === 0) {
    // Pre-trim was non-empty but consists entirely of whitespace
    return err({ kind: "only-whitespace" });
  }

  // Strip leading '#' after trim
  const withoutHash = trimmed1.startsWith("#") ? trimmed1.slice(1) : trimmed1;
  const normalized = withoutHash.toLowerCase().trim();

  if (normalized.length === 0) {
    // Was only a '#' or '#' + whitespace
    return err({ kind: "only-whitespace" });
  }

  return ok(normalized as unknown as Tag);
}
