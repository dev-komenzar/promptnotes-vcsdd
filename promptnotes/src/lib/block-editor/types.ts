/**
 * types.ts — ui-block-editor type definitions (in-place 編集モデル)
 *
 * Type-only file: no runtime logic. Defines the contracts between the pure
 * blockPredicates / debounceSchedule / timerModule and the effectful shell
 * (BlockElement / SlashMenu / SaveFailureBanner).
 *
 * EditorPane モデル（旧 ui-editor feature）は廃止済み。下記の型は除去された:
 *   - EditingSessionStatus / EditingSessionStateDto / EditorViewState
 *   - EditorAction / EditorCommand
 *   - EditorIpcAdapter（subscribeToState 込みの統合 adapter）
 *
 * 残存しているのは「FeedRow に埋め込まれる block 編集プリミティブ」が必要な型のみ。
 *
 * Source of truth:
 *   - docs/domain/code/ts/src/shared/value-objects.ts (BlockType)
 *   - docs/domain/code/ts/src/shared/errors.ts (SaveError, FsError, SaveValidationError)
 *   - docs/domain/code/ts/src/capture/commands.ts (CaptureCommand shapes)
 *   - docs/domain/code/ts/src/capture/states.ts (EditingState.focusedBlockId, PendingNextFocus)
 *
 * NO forbidden APIs may appear here:
 *   Math.random, crypto, performance, window, globalThis, self, document,
 *   navigator, requestAnimationFrame, requestIdleCallback, localStorage,
 *   sessionStorage, indexedDB, fetch, XMLHttpRequest, setTimeout, setInterval,
 *   clearTimeout, clearInterval, Date.now, Date(, new Date, $state, $effect,
 *   $derived, import.meta, invoke(, @tauri-apps/api
 */

// ── BlockType ─────────────────────────────────────────────────────────────────

/**
 * The 9 BlockType literals from shared/value-objects.ts.
 * Re-exported here for UI-layer use.
 */
export type BlockType =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet'
  | 'numbered'
  | 'code'
  | 'quote'
  | 'divider';

// ── Source literals ──────────────────────────────────────────────────────────

/** Domain enum subset for save-trigger origin (shared/events.ts SaveNoteSource). */
export type EditorCommandSaveSource = 'capture-idle' | 'capture-blur';

/** Source for new-note requests (capture/commands.ts RequestNewNote.source). */
export type NewNoteSource = 'explicit-button' | 'ctrl-N';

// ── SaveError ────────────────────────────────────────────────────────────────

/**
 * FsError variants matching shared/errors.ts.
 * 5 variants: permission, disk-full, lock, not-found, unknown.
 */
export type FsError =
  | { kind: 'permission' }
  | { kind: 'disk-full' }
  | { kind: 'lock' }
  | { kind: 'not-found' }
  | { kind: 'unknown' };

/**
 * SaveValidationError variants from shared/errors.ts.
 */
export type SaveValidationError =
  | { kind: 'empty-body-on-idle' }
  | { kind: 'invariant-violated' };

/**
 * SaveError discriminated union (shared/errors.ts).
 * - `{ kind: 'fs', reason: FsError }` — file-system error; banner shown.
 * - `{ kind: 'validation', reason: SaveValidationError }` — silent; no banner.
 */
export type SaveError =
  | { kind: 'fs'; reason: FsError }
  | { kind: 'validation'; reason: SaveValidationError };

// ── PendingNextFocus ──────────────────────────────────────────────────────────

/** capture/states.ts PendingNextFocus equivalent. */
export type PendingNextFocus = {
  noteId: string;
  blockId: string;
};

// ── DtoBlock ──────────────────────────────────────────────────────────────────

/**
 * Canonical block shape carried in inbound state snapshots.
 * Matches the UI-internal Block shape used by BlockElement.
 *
 * NOTE: ui-block-editor 配下では BlockElement に直接 props として渡される。
 * 旧 EditorViewState は廃止されたため、blocks 配列の保持・購読は
 * 上位レイヤ（FeedRow / FeedReducer）の責務に移管した。
 */
export type DtoBlock = {
  id: string;
  type: BlockType;
  content: string;
};

// ── BlockEditorAdapter ────────────────────────────────────────────────────────

/**
 * Outbound block-level command adapter consumed by BlockElement / SlashMenu /
 * SaveFailureBanner / BlockDragHandle.
 *
 * 旧 `EditorIpcAdapter` は EditorPane 用の subscribeToState を内包していたが、
 * ブロックベース UI へ移行したことで以下に変更した:
 *   - subscribeToState は廃止（FeedRow 側の feedStateChannel が DTO を購読する）
 *   - dispatchXxx の集合は変更なし。これらは Tauri / テスト用ダブルから注入される
 *
 * Pure modules はこの interface を import してはいけない。
 */
export interface BlockEditorAdapter {
  dispatchFocusBlock(payload: { noteId: string; blockId: string; issuedAt: string }): Promise<void>;
  dispatchEditBlockContent(payload: { noteId: string; blockId: string; content: string; issuedAt: string }): Promise<void>;
  dispatchInsertBlockAfter(payload: { noteId: string; prevBlockId: string; type: BlockType; content: string; issuedAt: string }): Promise<void>;
  dispatchInsertBlockAtBeginning(payload: { noteId: string; type: BlockType; content: string; issuedAt: string }): Promise<void>;
  dispatchRemoveBlock(payload: { noteId: string; blockId: string; issuedAt: string }): Promise<void>;
  dispatchMergeBlocks(payload: { noteId: string; blockId: string; issuedAt: string }): Promise<void>;
  dispatchSplitBlock(payload: { noteId: string; blockId: string; offset: number; issuedAt: string }): Promise<void>;
  dispatchChangeBlockType(payload: { noteId: string; blockId: string; newType: BlockType; issuedAt: string }): Promise<void>;
  dispatchMoveBlock(payload: { noteId: string; blockId: string; toIndex: number; issuedAt: string }): Promise<void>;
  dispatchTriggerIdleSave(payload: { source: 'capture-idle'; noteId: string; issuedAt: string }): Promise<void>;
  dispatchTriggerBlurSave(payload: { source: 'capture-blur'; noteId: string; issuedAt: string }): Promise<void>;
  dispatchRetrySave(payload: { noteId: string; issuedAt: string }): Promise<void>;
  dispatchDiscardCurrentSession(payload: { noteId: string; issuedAt: string }): Promise<void>;
  dispatchCancelSwitch(payload: { noteId: string; issuedAt: string }): Promise<void>;
  dispatchCopyNoteBody(payload: { noteId: string; issuedAt: string }): Promise<void>;
  dispatchRequestNewNote(payload: { source: NewNoteSource; issuedAt: string }): Promise<void>;
}
