/**
 * createBlockEditorAdapter.ts — Factory producing a BlockEditorAdapter wired to
 * Tauri invoke for all 16 dispatch methods (Sprint 5, REQ-FEED-030).
 *
 * Effectful shell. OUTBOUND only — does not subscribe to any event.
 * Group split (Sprint 5):
 *   Group A (7 methods, existing Rust handlers):
 *     trigger_idle_save, trigger_blur_save, retry_save, discard_current_session,
 *     cancel_switch, copy_note_body, request_new_note
 *   Group B (9 methods, Sprint 5 deferred — Rust handler not implemented):
 *     editor_focus_block, editor_edit_block_content, editor_insert_block_after,
 *     editor_insert_block_at_beginning, editor_remove_block, editor_merge_blocks,
 *     editor_split_block, editor_change_block_type, editor_move_block
 *
 * Group B invocations are expected to reject with `command not found` until the
 * corresponding Rust handlers exist; callers (FeedRow) wrap each await in
 * try/catch (REQ-FEED-031).
 *
 * Wire mapping is enforced by PROP-FEED-S5-017 (16 invokes, command set, issuedAt).
 * Each dispatch site explicitly destructures issuedAt and re-includes it in the
 * payload sent to Tauri so the audit can confirm it travels through.
 */

import { invoke } from '@tauri-apps/api/core';
import type { BlockEditorAdapter } from './types.js';

export function createBlockEditorAdapter(): BlockEditorAdapter {
  return {
    // ── Group B: block-structure mutation (Rust handlers Sprint 5 deferred) ──
    dispatchFocusBlock: ({ noteId, blockId, issuedAt }) =>
      invoke('editor_focus_block', { noteId, blockId, issuedAt }),
    dispatchEditBlockContent: ({ noteId, blockId, content, issuedAt }) =>
      invoke('editor_edit_block_content', { noteId, blockId, content, issuedAt }),
    dispatchInsertBlockAfter: ({ noteId, prevBlockId, type, content, issuedAt }) =>
      invoke('editor_insert_block_after', { noteId, prevBlockId, type, content, issuedAt }),
    dispatchInsertBlockAtBeginning: ({ noteId, type, content, issuedAt }) =>
      invoke('editor_insert_block_at_beginning', { noteId, type, content, issuedAt }),
    dispatchRemoveBlock: ({ noteId, blockId, issuedAt }) =>
      invoke('editor_remove_block', { noteId, blockId, issuedAt }),
    dispatchMergeBlocks: ({ noteId, blockId, issuedAt }) =>
      invoke('editor_merge_blocks', { noteId, blockId, issuedAt }),
    dispatchSplitBlock: ({ noteId, blockId, offset, issuedAt }) =>
      invoke('editor_split_block', { noteId, blockId, offset, issuedAt }),
    dispatchChangeBlockType: ({ noteId, blockId, newType, issuedAt }) =>
      invoke('editor_change_block_type', { noteId, blockId, newType, issuedAt }),
    dispatchMoveBlock: ({ noteId, blockId, toIndex, issuedAt }) =>
      invoke('editor_move_block', { noteId, blockId, toIndex, issuedAt }),
    // ── Group A: save / session / new-note (existing Rust handlers) ──
    dispatchTriggerIdleSave: ({ source, noteId, issuedAt }) =>
      invoke('trigger_idle_save', { source, noteId, issuedAt }),
    dispatchTriggerBlurSave: ({ source, noteId, issuedAt }) =>
      invoke('trigger_blur_save', { source, noteId, issuedAt }),
    dispatchRetrySave: ({ noteId, issuedAt }) =>
      invoke('retry_save', { noteId, issuedAt }),
    dispatchDiscardCurrentSession: ({ noteId, issuedAt }) =>
      invoke('discard_current_session', { noteId, issuedAt }),
    dispatchCancelSwitch: ({ noteId, issuedAt }) =>
      invoke('cancel_switch', { noteId, issuedAt }),
    dispatchCopyNoteBody: ({ noteId, issuedAt }) =>
      invoke('copy_note_body', { noteId, issuedAt }),
    dispatchRequestNewNote: ({ source, issuedAt }) =>
      invoke('request_new_note', { source, issuedAt }),
  };
}
