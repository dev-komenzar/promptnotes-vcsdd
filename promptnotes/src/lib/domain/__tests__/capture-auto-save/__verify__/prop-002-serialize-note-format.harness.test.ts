/**
 * PROP-002: serializeNote output matches Obsidian format.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * Property: ∀ ValidatedSaveRequest, output matches /^---\n[\s\S]*\n---\n[\s\S]*$/
 *
 * Obsidian format spec (REQ-006):
 *   - Starts with "---\n"
 *   - Contains YAML frontmatter (tags, createdAt, updatedAt)
 *   - Followed by "---\n" (closing delimiter, always on its own line)
 *   - Followed by the raw note body
 *
 * NOTE: Tags may contain dashes (e.g. "a---"), so we must NOT split the output
 * on every occurrence of "---\n". Instead we parse structure using the regex
 * and locate the YAML/body boundary by finding "\n---\n" after the opening "---\n".
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { serializeNote } from "$lib/domain/capture-auto-save/serialize-note";
import type {
  Body,
  Frontmatter,
  NoteId,
  Tag,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";

// ── Arbitraries ────────────────────────────────────────────────────────────

function arbTimestamp(): fc.Arbitrary<Timestamp> {
  return fc
    .integer({ min: 1_000_000, max: 2_000_000_000 })
    .map((ms) => ({ epochMillis: ms } as unknown as Timestamp));
}

function arbTag(): fc.Arbitrary<Tag> {
  return fc
    .stringMatching(/^[a-z][a-z0-9-]{0,19}$/)
    .map((s) => s as unknown as Tag);
}

function arbFrontmatterWithTags(): fc.Arbitrary<Frontmatter> {
  return fc
    .record({
      tags: fc.array(arbTag(), { maxLength: 5 }),
      createdAt: arbTimestamp(),
      updatedAt: arbTimestamp(),
    })
    .map((fm) => fm as unknown as Frontmatter);
}

function arbBody(): fc.Arbitrary<Body> {
  return fc
    .string({ maxLength: 500 })
    .map((s) => s as unknown as Body);
}

function arbNoteId(): fc.Arbitrary<NoteId> {
  return fc
    .stringMatching(/^[a-z0-9-]{10,30}$/)
    .map((s) => s as unknown as NoteId);
}

function arbValidatedSaveRequest(): fc.Arbitrary<ValidatedSaveRequest> {
  return fc
    .record({
      noteId: arbNoteId(),
      body: arbBody(),
      frontmatter: arbFrontmatterWithTags(),
      trigger: fc.constantFrom("idle" as const, "blur" as const),
      requestedAt: arbTimestamp(),
    })
    .map(
      (r) =>
        ({
          kind: "ValidatedSaveRequest",
          noteId: r.noteId,
          body: r.body,
          frontmatter: r.frontmatter,
          previousFrontmatter: null,
          trigger: r.trigger,
          requestedAt: r.requestedAt,
        }) as ValidatedSaveRequest,
    );
}

/**
 * Parse the Obsidian markdown structure.
 * The format is:  ---\n<yaml>\n---\n<body>
 * The closing "---\n" is identified by finding "\n---\n" after the opening "---\n".
 * Tag values may contain dashes, so we cannot simply split on "---\n".
 */
function parseObsidianMarkdown(output: string): { yaml: string; body: string } | null {
  if (!output.startsWith("---\n")) return null;
  // Find the closing delimiter: a line that is exactly "---" followed by "\n"
  // This appears as "\n---\n" in the output (after the first line).
  const closingMarker = "\n---\n";
  const closingIdx = output.indexOf(closingMarker, 4); // start searching after first "---\n"
  if (closingIdx === -1) return null;
  const yaml = output.slice(4, closingIdx); // content between opening and closing ---
  const body = output.slice(closingIdx + closingMarker.length);
  return { yaml, body };
}

// ── PROP-002 ───────────────────────────────────────────────────────────────

describe("PROP-002: serializeNote output matches Obsidian format", () => {
  test("∀ input: output starts with '---\\n'", () => {
    fc.assert(
      fc.property(arbValidatedSaveRequest(), (request) => {
        const output = serializeNote(request);
        return output.startsWith("---\n");
      }),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ input: output matches /^---\\n[\\s\\S]*\\n---\\n[\\s\\S]*$/", () => {
    const OBSIDIAN_FORMAT = /^---\n[\s\S]*\n---\n[\s\S]*$/;
    fc.assert(
      fc.property(arbValidatedSaveRequest(), (request) => {
        const output = serializeNote(request);
        return OBSIDIAN_FORMAT.test(output);
      }),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ input: YAML section contains 'tags', 'createdAt', 'updatedAt'", () => {
    fc.assert(
      fc.property(arbValidatedSaveRequest(), (request) => {
        const output = serializeNote(request);
        const parsed = parseObsidianMarkdown(output);
        if (parsed === null) return false;
        const { yaml } = parsed;
        return (
          yaml.includes("tags") &&
          yaml.includes("createdAt") &&
          yaml.includes("updatedAt")
        );
      }),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ input: body is preserved verbatim after closing ---\\n separator", () => {
    fc.assert(
      fc.property(arbValidatedSaveRequest(), (request) => {
        const body = request.body as unknown as string;
        const output = serializeNote(request);
        const parsed = parseObsidianMarkdown(output);
        if (parsed === null) return false;
        return parsed.body === body;
      }),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ input with no tags: YAML contains 'tags: []'", () => {
    fc.assert(
      fc.property(
        arbValidatedSaveRequest().map((r) => ({
          ...r,
          frontmatter: {
            ...(r.frontmatter as unknown as object),
            tags: [],
          } as unknown as Frontmatter,
        })),
        (request) => {
          const output = serializeNote(request);
          const parsed = parseObsidianMarkdown(output);
          if (parsed === null) return false;
          return parsed.yaml.includes("tags: []");
        },
      ),
      { numRuns: 100, seed: 99 },
    );
  });
});
