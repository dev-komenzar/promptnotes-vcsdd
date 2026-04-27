// Phase 11 — シナリオ 1 / 2: AppStartup 型レベル検証
//
// 対応シナリオ:
//   - validation.md「シナリオ 1: 初回起動：vault 未設定」
//   - validation.md「シナリオ 2: 通常起動：フィード復元と新規ノート自動生成」
// 対応ワークフロー: workflows.md Workflow 1 (AppStartup)
// 自動生成: 2026-04-28
//
// 検証目的:
//   1. VaultScanned → HydratedFeed → InitialUIState の段階遷移が Phase 10 の型で表現可能
//   2. corruptedFiles の伝搬経路が型上で連結している
//   3. Vault.allocateNoteId 経由で初期 NoteId が生成される

import type { Result } from "../util/result.js";
import { ok, err } from "../util/result.js";
import type {
  AppStartupError,
} from "../shared/errors.js";
import type {
  VaultDirectoryConfigured,
  VaultDirectoryNotConfigured,
  VaultScanned,
} from "../shared/events.js";
import type { Feed, FilterCriteria } from "../curate/aggregates.js";
import type { TagInventory } from "../curate/read-models.js";
import type {
  HydratedFeed,
  InitialUIState,
} from "../curate/stages.js";
import type {
  HydrateFeed,
  InitializeCaptureSession,
} from "../curate/workflows.js";
import type { CurateDeps } from "../curate/ports.js";
import { assertType, assertKind } from "./_assert.js";
import {
  mockNoteId,
  mockTag,
  mockTimestamp,
  mockVaultId,
  mockVaultPath,
} from "./_mock.js";

// ──────────────────────────────────────────────────────────────────────
// シナリオ 1: 初回起動 — vault 未設定
// Given: VaultDirectoryNotConfigured が発行される
// When/Then: ConfigureVault → VaultScanned(snapshots=[]) → HydratedFeed(空)
// ──────────────────────────────────────────────────────────────────────

const t0 = mockTimestamp(1_700_000_000_000);
const vaultId = mockVaultId("vault-singleton");
const vaultPath = mockVaultPath("/home/user/vault");

const unconfigured: VaultDirectoryNotConfigured = {
  kind: "vault-directory-not-configured",
  occurredOn: t0,
};
assertType<VaultDirectoryNotConfigured>(unconfigured);

const configured: VaultDirectoryConfigured = {
  kind: "vault-directory-configured",
  vaultId,
  path: vaultPath,
  occurredOn: t0,
};
assertType<VaultDirectoryConfigured>(configured);

const emptyScanned: VaultScanned = {
  kind: "vault-scanned",
  vaultId,
  snapshots: [],
  corruptedFiles: [],
  occurredOn: t0,
};

// ──────────────────────────────────────────────────────────────────────
// HydrateFeed スタブ — pure（Curate Context 内）
// ──────────────────────────────────────────────────────────────────────

const emptyFilterCriteria: FilterCriteria = {
  tags: [],
  frontmatterFields: new Map<string, string>(),
};

const emptyFeed: Feed = {
  noteRefs: [],
  filterCriteria: emptyFilterCriteria,
  searchQuery: null,
  sortOrder: { field: "timestamp", direction: "desc" },
};

const emptyTagInventory: TagInventory = {
  entries: [],
  lastBuiltAt: t0,
};

const hydrateFeedStub: HydrateFeed = (_deps) => (event) => ({
  kind: "HydratedFeed",
  feed: { ...emptyFeed, noteRefs: event.snapshots.map((s) => s.noteId) },
  tagInventory: emptyTagInventory,
  corruptedFiles: event.corruptedFiles,
});

// ──────────────────────────────────────────────────────────────────────
// InitializeCaptureSession スタブ — Vault.allocateNoteId に委譲
// ──────────────────────────────────────────────────────────────────────

const initializeCaptureSessionStub: InitializeCaptureSession = (
  _deps,
  allocateNoteId,
) => (hydrated) => {
  const initialNoteId = allocateNoteId(t0);
  return {
    kind: "InitialUIState",
    feed: hydrated.feed,
    tagInventory: hydrated.tagInventory,
    corruptedFiles: hydrated.corruptedFiles,
    initialNoteId,
  };
};

// ──────────────────────────────────────────────────────────────────────
// 実行: シナリオ 1（vault 未設定 → 設定後の空起動）
// ──────────────────────────────────────────────────────────────────────

const curateDeps: CurateDeps = {
  clockNow: () => t0,
  hydrateNote: () => err("yaml-parse"),
  getNoteSnapshot: () => null,
  publish: (_e) => {
    /* noop */
  },
};

const allocateNoteIdStub = (_preferred: typeof t0) =>
  mockNoteId("2026-04-28-153045-001");

const hydrated1 = hydrateFeedStub(curateDeps)(emptyScanned);
const initial1: InitialUIState = initializeCaptureSessionStub(
  curateDeps,
  allocateNoteIdStub,
)(hydrated1);

assertKind("InitialUIState")(initial1);
assertType<HydratedFeed>(hydrated1);

// シナリオ 1 の事後条件: corruptedFiles=[], noteRefs=[], 初期 NoteId が確定
const _scenario1Empty: number = initial1.feed.noteRefs.length;
const _scenario1NoCorruption: number = initial1.corruptedFiles.length;
const _scenario1HasInitialNote: typeof initial1.initialNoteId =
  initial1.initialNoteId;
void _scenario1Empty;
void _scenario1NoCorruption;
void _scenario1HasInitialNote;

// ──────────────────────────────────────────────────────────────────────
// シナリオ 2: 通常起動 — 47 件 + draft タグ 5 件
// ──────────────────────────────────────────────────────────────────────

const populatedScanned: VaultScanned = {
  kind: "vault-scanned",
  vaultId,
  snapshots: Array.from({ length: 47 }).map((_, i) => ({
    noteId: mockNoteId(`2026-04-${String(i + 1).padStart(2, "0")}-100000-001`),
    body: "body" as never,
    frontmatter: {
      tags: [mockTag("draft")],
      createdAt: t0,
      updatedAt: t0,
    } as never,
    filePath: `/home/user/vault/2026-04-${i + 1}.md`,
    fileMtime: t0,
  })),
  corruptedFiles: [],
  occurredOn: t0,
};

const hydrated2 = hydrateFeedStub(curateDeps)(populatedScanned);
const initial2 = initializeCaptureSessionStub(
  curateDeps,
  allocateNoteIdStub,
)(hydrated2);

const _scenario2HasNotes = initial2.feed.noteRefs.length > 0;

// ──────────────────────────────────────────────────────────────────────
// 失敗パス: AppStartupError は Result の Err 側に乗せて返せる
// ──────────────────────────────────────────────────────────────────────

const startupError: AppStartupError = {
  kind: "config",
  reason: { kind: "unconfigured" },
};

const failedAppStartup: Result<InitialUIState, AppStartupError> =
  err(startupError);
const succeededAppStartup: Result<InitialUIState, AppStartupError> =
  ok(initial2);

assertType<Result<InitialUIState, AppStartupError>>(failedAppStartup);
assertType<Result<InitialUIState, AppStartupError>>(succeededAppStartup);
