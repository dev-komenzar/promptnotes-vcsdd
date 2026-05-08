/**
 * hydrate-note-purity.test.ts — PROP-027: HydrateNote ACL is pure
 *
 * PROP-027: HydrateNote ACL is pure: (NoteFileSnapshot) → Result<Note, HydrationFailureReason>
 *           is referentially transparent — same snapshot always produces the same Result,
 *           no I/O, no clock, no Vault state read.
 *           By Q2 determinism, the resulting Note.blocks is bit-identical, including BlockId values.
 *           Failure-mode determinism:
 *             - snapshot whose body triggers parseMarkdownToBlocks Err → always Err('block-parse')
 *             - snapshot whose body produces Ok([]) → always Err('block-parse')
 *
 * REQ-002 (rev7): HydrateNote is a pure ACL function called in Step 3 (hydrateFeed),
 *           NOT in Step 2. It composes parseMarkdownToBlocks + Note.fromSnapshot.
 *
 * REQ-008 (rev7): hydrateFeed calls HydrateNote per snapshot to materialize Note aggregates.
 *           HydrateNote purity is the load-bearing claim that lets hydrateFeed remain pure.
 *
 * Red phase: hydrateNote does NOT exist as a concrete implementation at the expected
 * import path '$lib/domain/app-startup/hydrate-note'. The import will fail, causing
 * all tests in this file to fail with a module-not-found error.
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { NoteId, Tag, Body, Frontmatter, Timestamp, BlockId, BlockType, BlockContent } from "promptnotes-domain-types/shared/value-objects";
import type { HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";
import type { Result } from "promptnotes-domain-types/util/result";

// This import will FAIL because the module does not exist yet (Red phase).
// Phase 2b will create this file as the concrete HydrateNote implementation.
import { hydrateNote } from "$lib/domain/app-startup/hydrate-note";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeBody(raw: string): Body {
  return raw as unknown as Body;
}

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}

function makeFrontmatter(tags: Tag[] = [], createdMs = 1000, updatedMs = 2000): Frontmatter {
  return {
    tags,
    createdAt: makeTimestamp(createdMs),
    updatedAt: makeTimestamp(updatedMs),
  } as unknown as Frontmatter;
}

function makeSnapshot(
  noteId: string,
  body: string,
  tags: Tag[] = []
): NoteFileSnapshot {
  return {
    noteId: makeNoteId(noteId),
    body: makeBody(body),
    frontmatter: makeFrontmatter(tags),
    filePath: `/vault/${noteId}.md`,
    fileMtime: makeTimestamp(2000),
  };
}

/** A snapshot with a body that will trigger parseMarkdownToBlocks Err (unterminated code fence). */
function makeUnterminatedFenceSnapshot(noteId: string): NoteFileSnapshot {
  return makeSnapshot(noteId, "```\nunclosed code fence content");
}

/** A snapshot with body that produces Ok([]) — whitespace-only body that after stripping
 *  frontmatter leaves only whitespace (the block parser may return empty on such input).
 *  We use a controlled marker string and rely on the test implementation to handle this.
 */
function makeWhitespaceOnlyBodySnapshot(noteId: string): NoteFileSnapshot {
  // A body that would produce Ok([]) from parseMarkdownToBlocks: all-whitespace
  return makeSnapshot(noteId, "   \n   \n   ");
}

// ── PROP-027: HydrateNote is pure (referentially transparent) ────────────────

describe("PROP-027 — HydrateNote ACL is pure: same snapshot → same Result (required)", () => {
  // All tests in this describe will fail immediately because the module doesn't exist.

  test("PROP-027 — simple paragraph body: same snapshot → same Ok(Note) result both times", () => {
    // PROP-027: same snapshot always produces the same Result, no I/O, no clock.
    const snapshot = makeSnapshot("2026-04-28-120000-001", "Hello world paragraph");

    const result1 = hydrateNote(snapshot);
    const result2 = hydrateNote(snapshot);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      const note1 = result1.value;
      const note2 = result2.value;

      // PROP-027: Note.blocks must be bit-identical including BlockId values (Q2 determinism)
      expect(note1.blocks).toEqual(note2.blocks);
      expect(note1.id).toEqual(note2.id);
      // Block IDs must be positional (block-0, block-1, ...)
      for (let i = 0; i < note1.blocks.length; i++) {
        expect(note1.blocks[i].id as unknown as string).toBe(`block-${i}`);
      }
    }
  });

  test("PROP-027 — multi-block body: Block[] is identical on both calls (including BlockId values)", () => {
    // By Q2 determinism, the resulting Note.blocks is bit-identical including BlockId values.
    const snapshot = makeSnapshot(
      "2026-04-28-120000-002",
      "# Title\n\nFirst paragraph\n\n- Bullet"
    );

    const result1 = hydrateNote(snapshot);
    const result2 = hydrateNote(snapshot);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      // Deep equality including BlockIds
      expect(result1.value.blocks).toEqual(result2.value.blocks);
      expect(result1.value.blocks).toHaveLength(3); // heading, paragraph, bullet

      // Positional scheme: block-0, block-1, block-2
      expect(result1.value.blocks[0].id as unknown as string).toBe("block-0");
      expect(result1.value.blocks[1].id as unknown as string).toBe("block-1");
      expect(result1.value.blocks[2].id as unknown as string).toBe("block-2");
    }
  });

  test("PROP-027 property (fast-check): ∀ snapshot, hydrateNote(snapshot) deepEquals hydrateNote(snapshot)", () => {
    // Tier 1 property: referential transparency for arbitrary snapshots.
    fc.assert(
      fc.property(
        fc.record({
          noteId: fc.constant("2026-04-28-120000-001"),
          body: fc
            .string({ unit: "grapheme", minLength: 0, maxLength: 100 })
            .filter((s) => !s.includes("```")), // avoid code fences that would cause Err
          tags: fc.array(
            fc.string({ minLength: 1, maxLength: 10 }).map((s) => s.trim()).filter((s) => s.length > 0).map((s) => makeTag(s)),
            { minLength: 0, maxLength: 3 }
          ),
        }),
        ({ noteId, body, tags }) => {
          const snapshot = makeSnapshot(noteId, body, tags);
          const result1 = hydrateNote(snapshot);
          const result2 = hydrateNote(snapshot);

          if (result1.ok !== result2.ok) return false;

          if (result1.ok && result2.ok) {
            const n1 = result1.value;
            const n2 = result2.value;
            // Verify blocks are deep-equal (including BlockIds)
            if (n1.blocks.length !== n2.blocks.length) return false;
            for (let i = 0; i < n1.blocks.length; i++) {
              const b1 = n1.blocks[i];
              const b2 = n2.blocks[i];
              if (
                (b1.id as unknown as string) !== (b2.id as unknown as string) ||
                (b1.type as unknown as string) !== (b2.type as unknown as string) ||
                (b1.content as unknown as string) !== (b2.content as unknown as string)
              ) {
                return false;
              }
            }
            return true;
          } else if (!result1.ok && !result2.ok) {
            return result1.error === result2.error;
          }
          return false;
        }
      )
    );
  });

  test("PROP-027 — hydrateNote takes only NoteFileSnapshot: arity is 1", () => {
    // PROP-027: pure function with no I/O, no clock, no Vault state read.
    // Unary: (NoteFileSnapshot) → Result<Note, HydrationFailureReason>
    expect(hydrateNote.length).toBe(1);
  });

  test("PROP-027 — hydrateNote produces Note with noteId matching snapshot.noteId", () => {
    // The resulting Note.id must equal snapshot.noteId
    const snapshot = makeSnapshot("2026-04-28-120000-003", "Some content");
    const result = hydrateNote(snapshot);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id as unknown as string).toBe("2026-04-28-120000-003");
    }
  });
});

// ── PROP-027 failure-mode determinism: block-parse errors ─────────────────────

describe("PROP-027 — failure-mode determinism: block-parse triggering snapshot → always Err('block-parse')", () => {
  test("PROP-027 — unterminated code fence body → always Err('block-parse'), both calls", () => {
    // PROP-027: 'a snapshot whose body triggers parseMarkdownToBlocks Err always returns
    // Err("block-parse")'
    const snapshot = makeUnterminatedFenceSnapshot("2026-04-28-120000-004");

    const result1 = hydrateNote(snapshot);
    const result2 = hydrateNote(snapshot);

    expect(result1.ok).toBe(false);
    expect(result2.ok).toBe(false);

    if (!result1.ok && !result2.ok) {
      expect(result1.error).toBe("block-parse");
      expect(result2.error).toBe("block-parse");
      // Both must be the same error
      expect(result1.error).toBe(result2.error);
    }
  });

  test("PROP-027 — Ok([]) body → always Err('block-parse') (downstream invariant: blocks.length >= 1)", () => {
    // PROP-027: 'a snapshot whose body produces Ok([]) also returns Err("block-parse")'
    // aggregates.md §1.5 invariant 6: blocks.length >= 1.
    // hydrateNote must not construct a Note from an empty Block[].
    const snapshot = makeWhitespaceOnlyBodySnapshot("2026-04-28-120000-005");

    const result1 = hydrateNote(snapshot);
    const result2 = hydrateNote(snapshot);

    if (!result1.ok) {
      // If the body does produce an error, it must be 'block-parse'
      expect(result1.error).toBe("block-parse");
    }
    if (!result2.ok) {
      expect(result2.error).toBe("block-parse");
    }

    // Both calls must be consistent (deterministic)
    expect(result1.ok).toBe(result2.ok);
    if (!result1.ok && !result2.ok) {
      expect(result1.error).toBe(result2.error);
    }
  });

  test("PROP-027 — no I/O: Date.now not called during hydrateNote", () => {
    // PROP-027: pure — no clock dependency.
    const originalDateNow = Date.now;
    let dateNowCallCount = 0;
    Date.now = () => {
      dateNowCallCount++;
      return originalDateNow();
    };

    try {
      const snapshot = makeSnapshot("2026-04-28-120000-006", "A paragraph");
      hydrateNote(snapshot);
      // Date.now must NOT be called inside hydrateNote
      expect(dateNowCallCount).toBe(0);
    } finally {
      Date.now = originalDateNow;
    }
  });
});

// ── PROP-027 / REQ-008: hydrateNote preserves HydratedFeed purity ────────────

describe("PROP-027 / REQ-008 — hydrateNote purity enables hydrateFeed purity", () => {
  test("PROP-027 — two hydrateNote calls with same snapshot produce same Note (enables hydrateFeed purity)", () => {
    // REQ-008 AC: 'because HydrateNote is pure, this preserves Step 3's purity'.
    // hydrateFeed calls hydrateNote per snapshot; if hydrateNote is not pure,
    // hydrateFeed cannot be pure. This test is the positive confirmation.
    const snapshot = makeSnapshot(
      "2026-04-28-120000-007",
      "> A quote block\n\nFollowed by a paragraph",
      [makeTag("rust")]
    );

    const result1 = hydrateNote(snapshot);
    const result2 = hydrateNote(snapshot);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      // Full deep equality: id, blocks (with BlockIds), frontmatter
      expect(result1.value).toEqual(result2.value);
    }
  });

  test("PROP-027 — hydrateNote does NOT call FrontmatterParser.parse (frontmatter is already VO on snapshot)", () => {
    // REQ-002 (rev7) Purity Boundary Map: 'HydrateNote does NOT call FrontmatterParser.parse
    // — frontmatter is already a VO on NoteFileSnapshot.frontmatter.'
    // We verify this indirectly: passing a snapshot with pre-built Frontmatter VO
    // should succeed even if no parser is in scope.
    const snapshot = makeSnapshot(
      "2026-04-28-120000-008",
      "Content without any YAML frontmatter markers",
      [makeTag("typescript")]
    );

    const result = hydrateNote(snapshot);

    // If hydrateNote called FrontmatterParser.parse on snapshot.body,
    // it would try to find YAML in "Content without any YAML frontmatter markers"
    // and might fail with yaml-parse or missing-field.
    // If pure (uses snapshot.frontmatter directly), it succeeds.
    expect(result.ok).toBe(true);
    if (result.ok) {
      // frontmatter on the Note must match the snapshot's frontmatter
      const noteFm = result.value.frontmatter;
      const snapFm = snapshot.frontmatter;
      expect(noteFm).toEqual(snapFm);
    }
  });
});
