// Phase 11 — シナリオ 8: 不要なノートを削除 (DeleteNote)
//
// 対応シナリオ: validation.md「シナリオ 8」
// 対応ワークフロー: workflows.md Workflow 5 (DeleteNote)
// 自動生成: 2026-04-28
//
// 検証目的:
//   1. DeletionConfirmed → AuthorizedDeletion → TrashedFile → UpdatedProjection
//   2. AuthorizationError（編集中 / Feed 不在）が型に表現されている
//   3. NoteFileDeleted → TagInventory.applyNoteDeleted の連結

import type { Result } from "../util/result.js";
import { ok, err } from "../util/result.js";
import type { DeletionError } from "../shared/errors.js";
import type {
  DeleteNoteRequested,
  NoteFileDeleted,
} from "../shared/events.js";
import type { Feed, FilterCriteria } from "../curate/aggregates.js";
import type { TagInventory } from "../curate/read-models.js";
import type {
  AuthorizedDeletion,
  DeletionConfirmed,
  UpdatedProjection,
} from "../curate/stages.js";
import type {
  AuthorizeDeletion,
  BuildDeleteNoteRequested,
  DeleteNote,
  UpdateProjectionsAfterDelete,
} from "../curate/workflows.js";
import type { CurateDeps } from "../curate/ports.js";
import { assertType } from "./_assert.js";
import {
  mockFrontmatter,
  mockNoteId,
  mockTag,
  mockTimestamp,
} from "./_mock.js";

// ──────────────────────────────────────────────────────────────────────
// Given: N456 が Feed 上に存在、tags=[draft, scratch]、scratch は他に未使用
// ──────────────────────────────────────────────────────────────────────

const t0 = mockTimestamp(1_700_000_000_000);
const targetId = mockNoteId("2026-04-25-100000-456");
const otherId = mockNoteId("2026-04-25-100000-001");

const draftTag = mockTag("draft");
const scratchTag = mockTag("scratch");

const targetFm = mockFrontmatter([draftTag, scratchTag], t0, t0);

const filterCriteria: FilterCriteria = {
  tags: [],
  frontmatterFields: new Map(),
};

const feedBefore: Feed = {
  noteRefs: [otherId, targetId],
  filterCriteria,
  searchQuery: null,
  sortOrder: { field: "timestamp", direction: "desc" },
};

const inventoryBefore: TagInventory = {
  entries: [
    { name: draftTag, usageCount: 5 },
    { name: scratchTag, usageCount: 1 },
  ],
  lastBuiltAt: t0,
};

const confirmed: DeletionConfirmed = {
  kind: "DeletionConfirmed",
  noteId: targetId,
};

const curateDeps: CurateDeps = {
  clockNow: () => t0,
  hydrateNote: () => err("yaml-parse"),
  getNoteSnapshot: () => null,
  publish: () => {
    /* noop */
  },
};

// ──────────────────────────────────────────────────────────────────────
// authorizeDeletion スタブ: 編集中 / Feed 不在の両エラーを表現
// ──────────────────────────────────────────────────────────────────────

const authorize: AuthorizeDeletion = (_deps, feed, editingCurrentNoteId) =>
  (input) => {
    if (editingCurrentNoteId === input.noteId) {
      return err({
        kind: "authorization",
        reason: { kind: "editing-in-progress", noteId: input.noteId },
      });
    }
    if (!feed.noteRefs.includes(input.noteId)) {
      return err({
        kind: "authorization",
        reason: { kind: "not-in-feed", noteId: input.noteId },
      });
    }
    return ok({
      kind: "AuthorizedDeletion",
      noteId: input.noteId,
      frontmatter: targetFm,
    });
  };

const authResult: Result<AuthorizedDeletion, DeletionError> = authorize(
  curateDeps,
  feedBefore,
  null,
)(confirmed);

if (!authResult.ok) {
  throw new Error("simulation: authorize must succeed");
}
const authorized = authResult.value;
assertType<AuthorizedDeletion>(authorized);

// 編集中ガード（負例）の型表現
const _authEditing: Result<AuthorizedDeletion, DeletionError> = authorize(
  curateDeps,
  feedBefore,
  targetId,
)(confirmed);
void _authEditing;

// Feed 不在ガード（負例）
const _authNotInFeed: Result<AuthorizedDeletion, DeletionError> = authorize(
  curateDeps,
  { ...feedBefore, noteRefs: [] },
  null,
)(confirmed);
void _authNotInFeed;

// ──────────────────────────────────────────────────────────────────────
// BuildDeleteNoteRequested: 純粋構築
// ──────────────────────────────────────────────────────────────────────

const buildDeleteRequest: BuildDeleteNoteRequested = (auth, now) => ({
  kind: "delete-note-requested",
  noteId: auth.noteId,
  occurredOn: now,
});

const deleteRequest: DeleteNoteRequested = buildDeleteRequest(authorized, t0);
assertType<DeleteNoteRequested>(deleteRequest);

// ──────────────────────────────────────────────────────────────────────
// DeleteNote 全体スタブ: TrashedFile を擬似的に NoteFileDeleted で表現
// ──────────────────────────────────────────────────────────────────────

const updateProjectionsStub: UpdateProjectionsAfterDelete =
  (_deps) => (feed, inventory, event) => ({
    kind: "UpdatedProjection",
    feed: { ...feed, noteRefs: feed.noteRefs.filter((n) => n !== event.noteId) },
    tagInventory: {
      ...inventory,
      entries: inventory.entries
        .map((e) =>
          (event.frontmatter.tags as readonly typeof draftTag[]).includes(e.name)
            ? { ...e, usageCount: e.usageCount - 1 }
            : e,
        )
        .filter((e) => e.usageCount > 0),
    },
  });

const fileDeleted: NoteFileDeleted = {
  kind: "note-file-deleted",
  noteId: targetId,
  frontmatter: targetFm,
  occurredOn: t0,
};

const projUpdated: UpdatedProjection = updateProjectionsStub(curateDeps)(
  feedBefore,
  inventoryBefore,
  fileDeleted,
);
assertType<UpdatedProjection>(projUpdated);

// scratch が消える / draft が usageCount 4 に減る期待値（型レベル）
const _afterFeedHasNoTarget: boolean = !projUpdated.feed.noteRefs.includes(
  targetId,
);
const _afterInventoryShrunk: boolean =
  projUpdated.tagInventory.entries.length <= inventoryBefore.entries.length;
void _afterFeedHasNoTarget;
void _afterInventoryShrunk;

// ──────────────────────────────────────────────────────────────────────
// 全体 DeleteNote スタブ
// ──────────────────────────────────────────────────────────────────────

const deleteNoteStub: DeleteNote = (_deps) => async (auth) =>
  ok({
    kind: "UpdatedProjection",
    feed: feedBefore,
    tagInventory: inventoryBefore,
  } satisfies UpdatedProjection);

const _deletePromise: Promise<Result<UpdatedProjection, DeletionError>> =
  deleteNoteStub(curateDeps)(authorized);
void _deletePromise;
