/**
 * parse-filter-input.test.ts — Example-based tests for parseFilterInput.
 *
 * REQ-001: Happy path produces AppliedFilter
 * REQ-002: Tag normalization via Tag Smart Constructor (tryNewTag)
 * REQ-003: Invalid tag produces Err (fail-fast)
 * REQ-004: Empty tagsRaw produces empty criteria.tags
 * REQ-005: searchTextRaw normalization
 * REQ-006: sortOrder passthrough
 */

import { describe, test, expect } from "bun:test";
import type { Tag, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { SortOrder } from "promptnotes-domain-types/curate/aggregates";
import type { UnvalidatedFilterInput } from "promptnotes-domain-types/curate/stages";
import { parseFilterInput } from "$lib/domain/apply-filter-or-search/parse-filter-input";

// ── Helpers ───────────────────────────────────────────────────────────────────

const sortDesc: SortOrder = { field: "timestamp", direction: "desc" };
const sortAsc: SortOrder = { field: "timestamp", direction: "asc" };

function makeInput(
  overrides: Partial<Omit<UnvalidatedFilterInput, "kind">>,
): UnvalidatedFilterInput {
  return {
    kind: "UnvalidatedFilterInput",
    tagsRaw: overrides.tagsRaw ?? [],
    fieldsRaw: overrides.fieldsRaw ?? new Map(),
    searchTextRaw: overrides.searchTextRaw ?? null,
    sortOrder: overrides.sortOrder ?? sortDesc,
  };
}

// ── REQ-001: Happy path ────────────────────────────────────────────────────────

describe("REQ-001: parseFilterInput happy path produces AppliedFilter", () => {
  test("returns Ok with kind=AppliedFilter for valid input", () => {
    const input = makeInput({ tagsRaw: ["draft"] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("AppliedFilter");
  });

  test("criteria.tags contains normalized Tag for each valid tagsRaw entry", () => {
    const input = makeInput({ tagsRaw: ["draft", "review"] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.tags.length).toBe(2);
    expect(result.value.criteria.tags[0]).toBe("draft" as unknown as Tag);
    expect(result.value.criteria.tags[1]).toBe("review" as unknown as Tag);
  });

  test("criteria.frontmatterFields equals fieldsRaw by structural equality", () => {
    const fields = new Map([["status", "open"], ["priority", "high"]]);
    const input = makeInput({ fieldsRaw: fields });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.frontmatterFields).toEqual(fields);
  });

  test("sortOrder passes through verbatim", () => {
    const input = makeInput({ sortOrder: sortAsc });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sortOrder).toEqual(sortAsc);
  });

  test("dedup: tagsRaw with three equivalent entries produces criteria.tags with one entry", () => {
    // REQ-001 dedup rule: ["claude-code", "Claude-Code", "  claude-code  "] → one Tag
    const input = makeInput({
      tagsRaw: ["claude-code", "Claude-Code", "  claude-code  "],
    });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.tags.length).toBe(1);
    expect(result.value.criteria.tags[0]).toBe("claude-code" as unknown as Tag);
  });

  test("dedup: tagsRaw=[draft, review, Draft] → criteria.tags=[draft, review] (first-occurrence order)", () => {
    const input = makeInput({ tagsRaw: ["draft", "review", "Draft"] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.tags.length).toBe(2);
    expect(result.value.criteria.tags[0]).toBe("draft" as unknown as Tag);
    expect(result.value.criteria.tags[1]).toBe("review" as unknown as Tag);
  });
});

// ── REQ-002: Tag normalization ─────────────────────────────────────────────────

describe("REQ-002: tag normalization via tryNewTag", () => {
  test("leading/trailing whitespace and mixed case → normalized to lowercase trimmed", () => {
    const input = makeInput({ tagsRaw: ["  Claude-Code  "] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.tags[0]).toBe("claude-code" as unknown as Tag);
  });

  test("leading # is removed during normalization", () => {
    const input = makeInput({ tagsRaw: ["#review"] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.tags[0]).toBe("review" as unknown as Tag);
  });

  test("already-normalized tag passes through unchanged", () => {
    const input = makeInput({ tagsRaw: ["draft"] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.tags[0]).toBe("draft" as unknown as Tag);
  });

  test("normalization is idempotent: applying twice yields same Tag", () => {
    const input1 = makeInput({ tagsRaw: ["  Draft  "] });
    const input2 = makeInput({ tagsRaw: ["draft"] });
    const r1 = parseFilterInput(input1);
    const r2 = parseFilterInput(input2);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value.criteria.tags[0]).toBe(r2.value.criteria.tags[0]);
  });

  test("tagsRaw=[claude-code, Claude-Code, claude-code] → exactly one Tag (dedup)", () => {
    const input = makeInput({
      tagsRaw: ["claude-code", "Claude-Code", "  claude-code  "],
    });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Should contain claude-code exactly once
    const tags = result.value.criteria.tags as readonly string[];
    expect(tags.filter((t) => t === "claude-code").length).toBe(1);
  });

  test("tagsRaw=[draft, review, Draft] → [draft, review] (second Draft deduplicated)", () => {
    const input = makeInput({ tagsRaw: ["draft", "review", "Draft"] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tags = result.value.criteria.tags as readonly string[];
    expect(tags).toEqual(["draft", "review"]);
  });
});

// ── REQ-003: Invalid tag → Err (fail-fast) ────────────────────────────────────

describe("REQ-003: invalid tag produces Err", () => {
  test("tagsRaw=[''] → Err({ kind: 'invalid-tag', raw: '' })", () => {
    const input = makeInput({ tagsRaw: [""] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid-tag");
    expect(result.error.raw).toBe("");
  });

  test("tagsRaw=['   '] → Err with raw='   ' (whitespace-only)", () => {
    const input = makeInput({ tagsRaw: ["   "] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid-tag");
    expect(result.error.raw).toBe("   ");
  });

  test("raw field preserves the original pre-normalization string verbatim", () => {
    const raw = "   "; // whitespace-only, must appear verbatim in error
    const input = makeInput({ tagsRaw: [raw] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.raw).toBe(raw);
  });

  test("fail-fast: tagsRaw=['valid-tag', ''] → Err on second entry", () => {
    const input = makeInput({ tagsRaw: ["valid-tag", ""] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid-tag");
    expect(result.error.raw).toBe("");
  });

  test("fail-fast: tagsRaw=['', 'valid-tag'] → Err on first entry", () => {
    const input = makeInput({ tagsRaw: ["", "valid-tag"] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid-tag");
    expect(result.error.raw).toBe("");
  });

  test("AppliedFilter is never returned when any tag is invalid", () => {
    const input = makeInput({ tagsRaw: ["good", ""] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(false);
    if (result.ok) {
      // Force test failure if somehow Ok was returned
      expect(result.value).toBeUndefined();
    }
  });
});

// ── REQ-004: Empty tagsRaw ────────────────────────────────────────────────────

describe("REQ-004: empty tagsRaw produces empty criteria.tags", () => {
  test("tagsRaw=[] → Ok(AppliedFilter) with criteria.tags=[]", () => {
    const input = makeInput({ tagsRaw: [] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.tags).toEqual([]);
  });

  test("no Err is produced for an empty tagsRaw array", () => {
    const input = makeInput({ tagsRaw: [] });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
  });

  test("criteria.frontmatterFields and query are still set correctly when tagsRaw=[]", () => {
    const fields = new Map([["status", "open"]]);
    const input = makeInput({
      tagsRaw: [],
      fieldsRaw: fields,
      searchTextRaw: "hello",
    });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.tags).toEqual([]);
    expect(result.value.criteria.frontmatterFields).toEqual(fields);
    expect(result.value.query).not.toBeNull();
  });
});

// ── REQ-005: searchTextRaw normalization ──────────────────────────────────────

describe("REQ-005: searchTextRaw normalization", () => {
  test("searchTextRaw=null → query=null", () => {
    const input = makeInput({ searchTextRaw: null });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.query).toBeNull();
  });

  test("searchTextRaw='' → query=null", () => {
    const input = makeInput({ searchTextRaw: "" });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.query).toBeNull();
  });

  test("searchTextRaw='   ' (whitespace-only) → query=null", () => {
    const input = makeInput({ searchTextRaw: "   " });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.query).toBeNull();
  });

  test("searchTextRaw='middleware' → query={ text: 'middleware', scope: 'body+frontmatter' }", () => {
    const input = makeInput({ searchTextRaw: "middleware" });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.query).toEqual({
      text: "middleware",
      scope: "body+frontmatter",
    });
  });

  test("searchTextRaw='  middleware  ' → query.text='  middleware  ' (verbatim, NOT trimmed)", () => {
    const input = makeInput({ searchTextRaw: "  middleware  " });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.query?.text).toBe("  middleware  ");
  });

  test("scope is always 'body+frontmatter' (MVP fixed)", () => {
    const input = makeInput({ searchTextRaw: "test" });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.query?.scope).toBe("body+frontmatter");
  });
});

// ── REQ-006: sortOrder passthrough ────────────────────────────────────────────

describe("REQ-006: sortOrder passthrough", () => {
  test("sortOrder desc passes through verbatim", () => {
    const input = makeInput({ sortOrder: sortDesc });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sortOrder).toEqual(sortDesc);
  });

  test("sortOrder asc passes through verbatim", () => {
    const input = makeInput({ sortOrder: sortAsc });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sortOrder).toEqual(sortAsc);
  });

  test("parseFilterInput does not synthesize or override sortOrder", () => {
    const customSort: SortOrder = { field: "timestamp", direction: "asc" };
    const input = makeInput({ sortOrder: customSort });
    const result = parseFilterInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Structural deep equality
    expect(result.value.sortOrder.field).toBe("timestamp");
    expect(result.value.sortOrder.direction).toBe("asc");
  });
});
