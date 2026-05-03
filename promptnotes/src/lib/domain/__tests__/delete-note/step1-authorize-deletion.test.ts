/**
 * step1-authorize-deletion.test.ts — Unit tests for authorizeDeletionPure
 *
 * REQ-DLN-002: Authorization Error — editing-in-progress
 * REQ-DLN-003: Authorization Error — note not in Feed (+ snapshot-missing variant)
 * REQ-DLN-006: frontmatter sourcing invariant — Curate snapshot at authorization time
 *
 * PROP-DLN-001: authorizeDeletionPure is pure (referentially transparent)
 * PROP-DLN-002: authorization rules — four-branch enumeration
 *   (a) editing-in-progress
 *   (b) not-in-feed (Feed.hasNote returns false)
 *   (c) snapshot === null with Feed.hasNote true → not-in-feed + cause: 'snapshot-missing'
 *   (d) all three preconditions hold → Ok(AuthorizedDeletion)
 * PROP-DLN-004: frontmatter sourcing invariant — AuthorizedDeletion.frontmatter === snapshot.frontmatter
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
  NoteFileSnapshot,
  Feed,
  AuthorizedDeletion,
  DeletionErrorDelta,
  AuthorizationErrorDelta,
  Result,
} from "./_deltas";

import { authorizeDeletionPure } from "../../delete-note/authorize-deletion-pure";

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
function makeSnapshot(noteId: NoteId, fm?: Frontmatter): NoteFileSnapshot {
  return {
    noteId,
    filePath: `/vault/${String(noteId)}.md`,
    frontmatter: fm ?? makeFrontmatter(),
    body: "snapshot body",
    fileMtime: makeTimestamp(2000),
  } as unknown as NoteFileSnapshot;
}
function makeFeed(noteIds: NoteId[] = []): Feed {
  return {
    noteRefs: noteIds,
    filterCriteria: { tags: [], frontmatterFields: new Map() },
    searchQuery: null,
    sortOrder: { field: "timestamp", direction: "desc" },
  } as unknown as Feed;
}

// ── PROP-DLN-002(a): editing-in-progress branch ──────────────────────────

describe("PROP-DLN-002(a): authorizeDeletionPure — editing-in-progress branch", () => {
  test("returns Err with kind 'editing-in-progress' when editingCurrentNoteId === noteId", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const snapshot = makeSnapshot(noteId);
    const feed = makeFeed([noteId]);
    const editingCurrentNoteId = noteId; // same as the note to delete

    const result = authorizeDeletionPure(noteId, editingCurrentNoteId, feed, snapshot);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as DeletionErrorDelta;
    expect(error.kind).toBe("authorization");
    if (error.kind !== "authorization") return;
    expect(error.reason.kind).toBe("editing-in-progress");
  });

  test("error.reason.noteId matches the target noteId", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const snapshot = makeSnapshot(noteId);
    const feed = makeFeed([noteId]);

    const result = authorizeDeletionPure(noteId, noteId, feed, snapshot);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as DeletionErrorDelta;
    if (error.kind !== "authorization") return;
    if (error.reason.kind !== "editing-in-progress") return;
    expect(String(error.reason.noteId)).toBe(String(noteId));
  });

  test("editing-in-progress fires even when note is in feed", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const feed = makeFeed([noteId]); // note IS in feed
    const snapshot = makeSnapshot(noteId);

    const result = authorizeDeletionPure(noteId, noteId, feed, snapshot);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as DeletionErrorDelta;
    if (error.kind !== "authorization") return;
    expect(error.reason.kind).toBe("editing-in-progress");
  });
});

// ── PROP-DLN-002(b): not-in-feed branch ──────────────────────────────────

describe("PROP-DLN-002(b): authorizeDeletionPure — not-in-feed branch (Feed.hasNote returns false)", () => {
  test("returns Err with kind 'not-in-feed' when note not in Feed", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const snapshot = makeSnapshot(noteId);
    const feed = makeFeed([]); // note NOT in feed
    const editingCurrentNoteId = null; // not currently editing

    const result = authorizeDeletionPure(noteId, editingCurrentNoteId, feed, snapshot);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as DeletionErrorDelta;
    expect(error.kind).toBe("authorization");
    if (error.kind !== "authorization") return;
    expect(error.reason.kind).toBe("not-in-feed");
  });

  test("PROP-DLN-002(b): not-in-feed error has NO cause field when Feed.hasNote is false", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const snapshot = makeSnapshot(noteId);
    const feed = makeFeed([]);

    const result = authorizeDeletionPure(noteId, null, feed, snapshot);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as DeletionErrorDelta;
    if (error.kind !== "authorization") return;
    if (error.reason.kind !== "not-in-feed") return;
    expect(error.reason.cause).toBeUndefined();
  });

  test("note is not in Feed → error even when editingCurrentNoteId is different note", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const otherNoteId = makeNoteId("2026-04-30-120000-002");
    const snapshot = makeSnapshot(noteId);
    const feed = makeFeed([otherNoteId]); // target note NOT in feed

    const result = authorizeDeletionPure(noteId, null, feed, snapshot);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as DeletionErrorDelta;
    if (error.kind !== "authorization") return;
    expect(error.reason.kind).toBe("not-in-feed");
  });
});

// ── PROP-DLN-002(c): snapshot-missing branch ─────────────────────────────

describe("PROP-DLN-002(c): authorizeDeletionPure — snapshot-missing branch (Feed.hasNote=true, snapshot=null)", () => {
  test("returns Err with kind 'not-in-feed' and cause 'snapshot-missing' when snapshot is null", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const feed = makeFeed([noteId]); // note IS in feed
    const snapshot = null; // but snapshot is absent (Feed/snapshot inconsistency)
    const editingCurrentNoteId = null;

    const result = authorizeDeletionPure(noteId, editingCurrentNoteId, feed, snapshot);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as DeletionErrorDelta;
    expect(error.kind).toBe("authorization");
    if (error.kind !== "authorization") return;
    expect(error.reason.kind).toBe("not-in-feed");
    if (error.reason.kind !== "not-in-feed") return;
    expect(error.reason.cause).toBe("snapshot-missing");
  });

  test("snapshot-missing cause is distinct from ordinary not-in-feed (no cause field)", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const inFeedWithNullSnapshot = authorizeDeletionPure(noteId, null, makeFeed([noteId]), null);
    const notInFeedWithSnapshot = authorizeDeletionPure(noteId, null, makeFeed([]), makeSnapshot(noteId));

    expect(inFeedWithNullSnapshot.ok).toBe(false);
    expect(notInFeedWithSnapshot.ok).toBe(false);

    if (inFeedWithNullSnapshot.ok || notInFeedWithSnapshot.ok) return;

    const withCause = inFeedWithNullSnapshot.error as DeletionErrorDelta;
    const withoutCause = notInFeedWithSnapshot.error as DeletionErrorDelta;

    if (withCause.kind !== "authorization" || withCause.reason.kind !== "not-in-feed") return;
    if (withoutCause.kind !== "authorization" || withoutCause.reason.kind !== "not-in-feed") return;

    expect(withCause.reason.cause).toBe("snapshot-missing");
    expect(withoutCause.reason.cause).toBeUndefined();
  });
});

// ── PROP-DLN-002(d): happy path branch ───────────────────────────────────

describe("PROP-DLN-002(d): authorizeDeletionPure — Ok branch (all three preconditions hold)", () => {
  test("returns Ok(AuthorizedDeletion) when all preconditions pass", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const snapshot = makeSnapshot(noteId);
    const feed = makeFeed([noteId]);
    const editingCurrentNoteId = null; // not editing this note

    const result = authorizeDeletionPure(noteId, editingCurrentNoteId, feed, snapshot);

    expect(result.ok).toBe(true);
  });

  test("PROP-DLN-002(d): Ok result has kind 'AuthorizedDeletion'", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const snapshot = makeSnapshot(noteId);
    const feed = makeFeed([noteId]);

    const result = authorizeDeletionPure(noteId, null, feed, snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const auth = result.value as AuthorizedDeletion;
    expect(auth.kind).toBe("AuthorizedDeletion");
  });

  test("PROP-DLN-004: AuthorizedDeletion.frontmatter === snapshot.frontmatter", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fm = makeFrontmatter({ tags: [makeTag("typescript"), makeTag("svelte")] });
    const snapshot = makeSnapshot(noteId, fm);
    const feed = makeFeed([noteId]);

    const result = authorizeDeletionPure(noteId, null, feed, snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const auth = result.value as AuthorizedDeletion;
    expect(auth.frontmatter).toEqual(fm);
  });

  test("Ok when editingCurrentNoteId is a different note (not the target)", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const otherNoteId = makeNoteId("2026-04-30-120000-002");
    const snapshot = makeSnapshot(noteId);
    const feed = makeFeed([noteId]);

    // editing a different note — should still allow deletion of the target
    const result = authorizeDeletionPure(noteId, otherNoteId, feed, snapshot);

    expect(result.ok).toBe(true);
  });
});

// ── PROP-DLN-001: authorizeDeletionPure is pure ───────────────────────────

describe("PROP-DLN-001: authorizeDeletionPure is pure (referentially transparent)", () => {
  test("same inputs always produce same Ok result", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const snapshot = makeSnapshot(noteId);
    const feed = makeFeed([noteId]);

    const result1 = authorizeDeletionPure(noteId, null, feed, snapshot);
    const result2 = authorizeDeletionPure(noteId, null, feed, snapshot);

    expect(result1.ok).toBe(result2.ok);
    if (!result1.ok || !result2.ok) return;
    expect(result1.value).toEqual(result2.value);
  });

  test("same inputs always produce same Err result", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const snapshot = makeSnapshot(noteId);
    const feed = makeFeed([]);

    const result1 = authorizeDeletionPure(noteId, null, feed, snapshot);
    const result2 = authorizeDeletionPure(noteId, null, feed, snapshot);

    expect(result1.ok).toBe(result2.ok);
    if (result1.ok || result2.ok) return;
    expect(result1.error).toEqual(result2.error);
  });

  test("PROP-DLN-001: property-based — identical inputs produce identical results (editing-in-progress)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        (idStr) => {
          const noteId = makeNoteId(idStr);
          const snapshot = makeSnapshot(noteId);
          const feed = makeFeed([noteId]);
          const r1 = authorizeDeletionPure(noteId, noteId, feed, snapshot);
          const r2 = authorizeDeletionPure(noteId, noteId, feed, snapshot);
          expect(r1.ok).toBe(r2.ok);
          if (!r1.ok && !r2.ok) {
            expect(r1.error).toEqual(r2.error);
          }
        },
      ),
    );
  });

  test("PROP-DLN-004: property-based — Ok result frontmatter deepEquals snapshot.frontmatter", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.array(fc.string({ minLength: 1, maxLength: 15 }), { maxLength: 5 }),
        (idStr, tags) => {
          const noteId = makeNoteId(idStr);
          const fm = makeFrontmatter({ tags: tags.map(makeTag) });
          const snapshot = makeSnapshot(noteId, fm);
          const feed = makeFeed([noteId]);
          const result = authorizeDeletionPure(noteId, null, feed, snapshot);
          // Fail fast on unexpected Err — property must not be vacuous (FIND-IMPL-DLN-005).
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const auth = result.value as AuthorizedDeletion;
          expect(auth.frontmatter).toEqual(fm);
        },
      ),
    );
  });
});
