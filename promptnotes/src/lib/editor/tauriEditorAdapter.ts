/**
 * tauriEditorAdapter.ts — OUTBOUND IPC adapter (effectful shell, Sprint 7)
 *
 * Implements EditorIpcAdapter (outbound only): 16 dispatch* methods.
 * Each wraps Tauri invoke() with the corresponding snake_case command name.
 *
 * Wire-boundary source erasure (RD-016 / verification-architecture.md §10):
 * dispatchTriggerIdleSave and dispatchTriggerBlurSave forward only noteId + issuedAt
 * over the wire — the 'source' label is impure-shell-only and is NOT sent to Rust.
 *
 * OUTBOUND only: does NOT call @tauri-apps/api/event listen().
 * Does NOT subscribe to state events.
 */

import { invoke } from '@tauri-apps/api/core';
import type { EditorIpcAdapter, BlockType, NewNoteSource, EditingSessionStateDto } from './types.js';

/** Rust command names for all 16 outbound dispatch methods. */
const CMD = {
  focusBlock: 'focus_block',
  editBlockContent: 'edit_block_content',
  insertBlock: 'insert_block',
  removeBlock: 'remove_block',
  mergeBlocks: 'merge_blocks',
  splitBlock: 'split_block',
  changeBlockType: 'change_block_type',
  moveBlock: 'move_block',
  triggerIdleSave: 'trigger_idle_save',
  triggerBlurSave: 'trigger_blur_save',
  copyNoteBody: 'copy_note_body',
  requestNewNote: 'request_new_note',
  retrySave: 'retry_save',
  discardCurrentSession: 'discard_current_session',
  cancelSwitch: 'cancel_switch',
} as const;

/**
 * Construct a concrete EditorIpcAdapter that forwards to Tauri IPC.
 * The subscribeToState method is NOT implemented here — use editorStateChannel.ts
 * for inbound state subscriptions.
 *
 * Including a stub subscribeToState so the returned object conforms to
 * EditorIpcAdapter. In production, EditorPanel composes this adapter with
 * editorStateChannel via the subscribeToState field.
 */
export function createTauriEditorAdapter(
  subscribeToState: (handler: (state: EditingSessionStateDto) => void) => () => void = () => () => {}
): EditorIpcAdapter {
  return {
    dispatchFocusBlock(payload: { noteId: string; blockId: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.focusBlock, payload);
    },

    dispatchEditBlockContent(payload: { noteId: string; blockId: string; content: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.editBlockContent, payload);
    },

    /**
     * InsertBlock decomposition rule (verification-architecture.md §10):
     * insert-block-after and insert-block-at-beginning merge into a single
     * invoke('insert_block', { atBeginning, ... }) payload.
     */
    dispatchInsertBlockAfter(payload: { noteId: string; prevBlockId: string; type: BlockType; content: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.insertBlock, {
        noteId: payload.noteId,
        prevBlockId: payload.prevBlockId,
        type: payload.type,
        content: payload.content,
        issuedAt: payload.issuedAt,
        atBeginning: false,
      });
    },

    dispatchInsertBlockAtBeginning(payload: { noteId: string; type: BlockType; content: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.insertBlock, {
        noteId: payload.noteId,
        type: payload.type,
        content: payload.content,
        issuedAt: payload.issuedAt,
        atBeginning: true,
      });
    },

    dispatchRemoveBlock(payload: { noteId: string; blockId: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.removeBlock, payload);
    },

    dispatchMergeBlocks(payload: { noteId: string; blockId: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.mergeBlocks, payload);
    },

    dispatchSplitBlock(payload: { noteId: string; blockId: string; offset: number; issuedAt: string }): Promise<void> {
      return invoke(CMD.splitBlock, payload);
    },

    dispatchChangeBlockType(payload: { noteId: string; blockId: string; newType: BlockType; issuedAt: string }): Promise<void> {
      return invoke(CMD.changeBlockType, payload);
    },

    dispatchMoveBlock(payload: { noteId: string; blockId: string; toIndex: number; issuedAt: string }): Promise<void> {
      return invoke(CMD.moveBlock, payload);
    },

    /**
     * Wire-boundary source erasure: source field is NOT forwarded to Rust.
     * Only noteId and issuedAt cross the wire boundary.
     */
    dispatchTriggerIdleSave(payload: { source: 'capture-idle'; noteId: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.triggerIdleSave, {
        noteId: payload.noteId,
        issuedAt: payload.issuedAt,
      });
    },

    dispatchTriggerBlurSave(payload: { source: 'capture-blur'; noteId: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.triggerBlurSave, {
        noteId: payload.noteId,
        issuedAt: payload.issuedAt,
      });
    },

    dispatchRetrySave(payload: { noteId: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.retrySave, payload);
    },

    dispatchDiscardCurrentSession(payload: { noteId: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.discardCurrentSession, payload);
    },

    dispatchCancelSwitch(payload: { noteId: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.cancelSwitch, payload);
    },

    dispatchCopyNoteBody(payload: { noteId: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.copyNoteBody, payload);
    },

    dispatchRequestNewNote(payload: { source: NewNoteSource; issuedAt: string }): Promise<void> {
      return invoke(CMD.requestNewNote, payload);
    },

    subscribeToState,
  };
}
