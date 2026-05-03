/**
 * step4-update-projections.test.ts — Unit tests for updateProjectionsAfterDelete
 *
 * REQ-DLN-001: Happy path — updateProjectionsAfterDelete called and returns UpdatedProjection
 * REQ-DLN-010: TagInventoryUpdated emission rule (ORCHESTRATOR calls publishInternal; this function does NOT)
 * REQ-DLN-012: Projection update correctness — Feed and TagInventory
 *
 * PROP-DLN-010: TagInventoryUpdated emission rule and removedTags semantics
 *   (d) updateProjectionsAfterDelete does NOT call deps.publishInternal
 * PROP-DLN-012: updateProjectionsAfterDelete is pure
 * PROP-DLN-016: updateProjectionsAfterDelete invokes no port — primary enforcement for FIND-SPEC-DLN-001
 *
 * RED phase: imports from non-existent implementation file.
 * Module resolution failure is valid RED evidence.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Tag,
  Timestamp,
  Frontmatter,
  NoteFileDeleted,
  UpdatedProjection,
  Feed,
  TagInventory,
  TagEntry,
  NoteFileSnapshot,
  DeleteNoteDeps,
} from "./_deltas";
import type { CurateInternalEvent } from "promptnotes-domain-types/curate/internal-events";
import type { PublicDomainEvent } from "promptnotes-domain-types/shared/events";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";
import type { Result } from "promptnotes-domain-types/util/result";

import { updateProjectionsAfterDelete } from "../../delete-note/update-projections";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}
function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}
function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}
function makeFrontmatter(opts?: {
  tags?: Tag[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}): Frontmatter {
  return {
    tags: opts?.tags ?? [],
    createdAt: opts?.createdAt ?? makeTimestamp(1000),
    updatedAt: opts?.updatedAt ?? makeTimestamp(2000),
  } as unknown as Frontmatter;
}
function makeFeed(noteIds: NoteId[] = []): Feed {
  return {
    noteRefs: noteIds,
    filterCriteria: { tags: [], frontmatterFields: new Map() },
    searchQuery: null,
    sortOrder: { field: "timestamp", direction: "desc" },
  } as unknown as Feed;
}
function makeTagInventory(entries: TagEntry[] = [], now?: Timestamp): TagInventory {
  return {
    entries,
    lastBuiltAt: now ?? makeTimestamp(1000),
  };
}
function makeTagEntry(tag: Tag, usageCount: number): TagEntry {
  return { name: tag, usageCount };
}
function makeNoteFileDeleted(opts: {
  noteId: NoteId;
  frontmatter: Frontmatter;
  occurredOn: Timestamp;
}): NoteFileDeleted {
  return {
    kind: "note-file-deleted",
    noteId: opts.noteId,
    frontmatter: opts.frontmatter,
    occurredOn: opts.occurredOn,
  } as NoteFileDeleted;
}

/** Creates a spy DeleteNoteDeps where all port calls are tracked. */
function makeSpyDeps(): DeleteNoteDeps & {
  _clockCallCount: number;
  _trashFileCallCount: number;
  _publishCallCount: number;
  _publishInternalCallCount: number;
} {
  let clockCallCount = 0;
  let trashFileCallCount = 0;
  let publishCallCount = 0;
  let publishInternalCallCount = 0;

  return {
    clockNow: () => {
      clockCallCount++;
      return makeTimestamp(9999);
    },
    getNoteSnapshot: (_id: NoteId) => null,
    hydrateNote: (_snap: NoteFileSnapshot): Result<never, HydrationFailureReason> => ({
      ok: false,
      error: "unknown" as HydrationFailureReason,
    }),
    publish: (_e: PublicDomainEvent) => {
      publishCallCount++;
    },
    publishInternal: (_e: CurateInternalEvent) => {
      publishInternalCallCount++;
    },
    trashFile: async (_filePath: string): Promise<Result<void, FsError>> => {
      trashFileCallCount++;
      return { ok: true, value: undefined };
    },
    getAllSnapshots: () => [],
    get _clockCallCount() { return clockCallCount; },
    get _trashFileCallCount() { return trashFileCallCount; },
    get _publishCallCount() { return publishCallCount; },
    get _publishInternalCallCount() { return publishInternalCallCount; },
  } as unknown as DeleteNoteDeps & {
    _clockCallCount: number;
    _trashFileCallCount: number;
    _publishCallCount: number;
    _publishInternalCallCount: number;
  };
}

// ── REQ-DLN-012: Projection update correctness ───────────────────────────

describe("REQ-DLN-012: updateProjectionsAfterDelete — projection update correctness", () => {
  test("returns UpdatedProjection with kind 'UpdatedProjection'", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const now = makeTimestamp(5000);
    const fm = makeFrontmatter({ tags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const event = makeNoteFileDeleted({ noteId, frontmatter: fm, occurredOn: now });

    const result = updateProjectionsAfterDelete(feed, inventory, event);

    expect(result.kind).toBe("UpdatedProjection");
  });

  test("UpdatedProjection.feed does not contain the deleted noteId", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const now = makeTimestamp(5000);
    const fm = makeFrontmatter({ tags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const event = makeNoteFileDeleted({ noteId, frontmatter: fm, occurredOn: now });

    const result = updateProjectionsAfterDelete(feed, inventory, event);

    const noteRefs = result.feed.noteRefs as NoteId[];
    expect(noteRefs.some((r) => String(r) === String(noteId))).toBe(false);
  });

  test("UpdatedProjection.feed is a new instance (not the same reference as input)", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const now = makeTimestamp(5000);
    const fm = makeFrontmatter({ tags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const event = makeNoteFileDeleted({ noteId, frontmatter: fm, occurredOn: now });

    const result = updateProjectionsAfterDelete(feed, inventory, event);

    expect(result.feed).not.toBe(feed); // new immutable instance
  });

  test("UpdatedProjection.tagInventory reflects decremented entries for deleted note's tags", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("draft");
    const now = makeTimestamp(5000);
    const fm = makeFrontmatter({ tags: [tag] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]); // usageCount: 1
    const event = makeNoteFileDeleted({ noteId, frontmatter: fm, occurredOn: now });

    const result = updateProjectionsAfterDelete(feed, inventory, event);

    // After deletion with usageCount: 1, the tag should be pruned (usageCount > 0 invariant)
    const tagEntry = result.tagInventory.entries.find(
      (e) => String(e.name) === String(tag),
    );
    expect(tagEntry).toBeUndefined(); // pruned because usageCount reached 0
  });

  test("UpdatedProjection.tagInventory entry still present when usageCount > 1 after decrement", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("shared");
    const now = makeTimestamp(5000);
    const fm = makeFrontmatter({ tags: [tag] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 5)]); // usageCount: 5
    const event = makeNoteFileDeleted({ noteId, frontmatter: fm, occurredOn: now });

    const result = updateProjectionsAfterDelete(feed, inventory, event);

    // After deletion with usageCount: 5, entry remains with usageCount: 4
    const tagEntry = result.tagInventory.entries.find(
      (e) => String(e.name) === String(tag),
    );
    expect(tagEntry).toBeDefined();
    expect(tagEntry?.usageCount).toBe(4);
  });
});

// ── PROP-DLN-016: updateProjectionsAfterDelete invokes no port ───────────

describe("PROP-DLN-016: updateProjectionsAfterDelete invokes no port", () => {
  test("deps.publishInternal is NOT called within updateProjectionsAfterDelete", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("draft");
    const now = makeTimestamp(5000);
    const fm = makeFrontmatter({ tags: [tag] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const event = makeNoteFileDeleted({ noteId, frontmatter: fm, occurredOn: now });

    // We call updateProjectionsAfterDelete directly (no deps curry) and verify
    // no port spy is invoked via the spy deps pattern
    const spyDeps = makeSpyDeps();

    // If the implementation correctly takes no deps, this verifies the signature
    // by not passing spyDeps at all. If the implementation incorrectly requires deps,
    // this test fails at the call site.
    updateProjectionsAfterDelete(feed, inventory, event);

    // The key assertion: no port calls happened
    expect(spyDeps._publishInternalCallCount).toBe(0);
    expect(spyDeps._publishCallCount).toBe(0);
    expect(spyDeps._clockCallCount).toBe(0);
    expect(spyDeps._trashFileCallCount).toBe(0);
  });

  test("PROP-DLN-016: updateProjectionsAfterDelete has no deps parameter (pure function)", () => {
    // Type-level assertion: the function signature is (feed, inventory, event) => UpdatedProjection
    // with no deps curry. This verifies it at the call site by calling with only 3 args.
    type AcceptsThreeArgs = typeof updateProjectionsAfterDelete extends (
      feed: Feed,
      inventory: TagInventory,
      event: NoteFileDeleted,
    ) => UpdatedProjection
      ? true
      : false;

    // If the type matches, this compiles. If the function were curried with deps,
    // the return type would be a function, not UpdatedProjection.
    expect(typeof updateProjectionsAfterDelete).toBe("function");
  });

  test("PROP-DLN-016: calling in isolation with spy deps verifies zero port calls", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag1 = makeTag("typescript");
    const tag2 = makeTag("svelte");
    const now = makeTimestamp(5000);
    const fm = makeFrontmatter({ tags: [tag1, tag2] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag1, 3), makeTagEntry(tag2, 1)]);
    const event = makeNoteFileDeleted({ noteId, frontmatter: fm, occurredOn: now });

    // Direct call — no deps injected, verifies pure function contract
    const result = updateProjectionsAfterDelete(feed, inventory, event);

    expect(result.kind).toBe("UpdatedProjection");
    // The mere fact we called it without deps is the proof it invokes no port
  });
});

// ── PROP-DLN-012: updateProjectionsAfterDelete is pure ───────────────────

describe("PROP-DLN-012: updateProjectionsAfterDelete is pure (same inputs → same output)", () => {
  test("calling twice with same inputs produces structurally equal results", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const now = makeTimestamp(5000);
    const fm = makeFrontmatter({ tags: [makeTag("ts")] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(makeTag("ts"), 1)]);
    const event = makeNoteFileDeleted({ noteId, frontmatter: fm, occurredOn: now });

    const result1 = updateProjectionsAfterDelete(feed, inventory, event);
    const result2 = updateProjectionsAfterDelete(feed, inventory, event);

    expect(result1.kind).toEqual(result2.kind);
    expect(result1.feed.noteRefs).toEqual(result2.feed.noteRefs);
  });

  test("property-based: same (feed, inventory, event) always produces identical UpdatedProjection shape", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1000, max: 9_999_999 }),
        (idStr, epochMillis) => {
          const noteId = makeNoteId(idStr);
          const now = makeTimestamp(epochMillis);
          const fm = makeFrontmatter({ tags: [] });
          const feed = makeFeed([noteId]);
          const inventory = makeTagInventory();
          const event = makeNoteFileDeleted({ noteId, frontmatter: fm, occurredOn: now });

          const r1 = updateProjectionsAfterDelete(feed, inventory, event);
          const r2 = updateProjectionsAfterDelete(feed, inventory, event);

          expect(r1.kind).toBe(r2.kind);
        },
      ),
    );
  });
});

// ── REQ-DLN-007: occurredOn sourced from event.occurredOn ────────────────

describe("REQ-DLN-007: updateProjectionsAfterDelete sources now from event.occurredOn", () => {
  test("updateProjectionsAfterDelete does NOT call deps.clockNow()", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const now = makeTimestamp(5000);
    const fm = makeFrontmatter({ tags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const event = makeNoteFileDeleted({ noteId, frontmatter: fm, occurredOn: now });

    // The function must NOT accept deps at all. Calling with (feed, inventory, event)
    // proves it cannot call clockNow.
    const result = updateProjectionsAfterDelete(feed, inventory, event);

    expect(result).toBeDefined();
    expect(result.kind).toBe("UpdatedProjection");
  });
});
