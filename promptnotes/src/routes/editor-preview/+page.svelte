<script lang="ts">
  import EditorPanel from "$lib/editor/EditorPanel.svelte";
  import type { EditorIpcAdapter, EditingSessionStateDto } from "$lib/editor/types.js";

  // Dev-only preview route: mocks the IPC layer so the EditorPanel mounts
  // without the Tauri backend. This page is for visual verification only.
  let log = $state<string[]>([]);

  let _stateHandler: ((state: EditingSessionStateDto) => void) | null = null;

  const adapter: EditorIpcAdapter = {
    dispatchFocusBlock: async (p) => { log.push(`focus_block ${JSON.stringify(p)}`); },
    dispatchEditBlockContent: async (p) => { log.push(`edit_block_content ${JSON.stringify(p)}`); },
    dispatchInsertBlockAfter: async (p) => { log.push(`insert_block_after ${JSON.stringify(p)}`); },
    dispatchInsertBlockAtBeginning: async (p) => { log.push(`insert_block_at_beginning ${JSON.stringify(p)}`); },
    dispatchRemoveBlock: async (p) => { log.push(`remove_block ${JSON.stringify(p)}`); },
    dispatchMergeBlocks: async (p) => { log.push(`merge_blocks ${JSON.stringify(p)}`); },
    dispatchSplitBlock: async (p) => { log.push(`split_block ${JSON.stringify(p)}`); },
    dispatchChangeBlockType: async (p) => { log.push(`change_block_type ${JSON.stringify(p)}`); },
    dispatchMoveBlock: async (p) => { log.push(`move_block ${JSON.stringify(p)}`); },
    dispatchTriggerIdleSave: async (p) => { log.push(`trigger_idle_save ${JSON.stringify(p)}`); },
    dispatchTriggerBlurSave: async (p) => { log.push(`trigger_blur_save ${JSON.stringify(p)}`); },
    dispatchRetrySave: async (p) => { log.push(`retry_save ${JSON.stringify(p)}`); },
    dispatchDiscardCurrentSession: async (p) => { log.push(`discard_current_session ${JSON.stringify(p)}`); },
    dispatchCancelSwitch: async (p) => { log.push(`cancel_switch ${JSON.stringify(p)}`); },
    dispatchCopyNoteBody: async (p) => { log.push(`copy_note_body ${JSON.stringify(p)}`); },
    dispatchRequestNewNote: async (p) => { log.push(`request_new_note ${JSON.stringify(p)}`); },
    subscribeToState: (handler) => {
      _stateHandler = handler;
      // Emit an initial editing state so the panel shows content
      setTimeout(() => {
        handler({
          status: 'editing',
          currentNoteId: 'preview-note-1',
          focusedBlockId: 'block-1',
          isDirty: false,
          isNoteEmpty: false,
          lastSaveResult: null,
        });
      }, 0);
      return () => { _stateHandler = null; };
    },
  };

  function emitState(state: EditingSessionStateDto): void {
    _stateHandler?.(state);
  }
</script>

<main class="preview">
  <h1>EditorPanel preview (dev only)</h1>
  <p>This page mounts the EditorPanel with mock adapters so the editor surface can be visually verified without the Tauri backend.</p>

  <div class="controls">
    <button onclick={() => emitState({ status: 'idle' })}>Idle</button>
    <button onclick={() => emitState({ status: 'editing', currentNoteId: 'preview-note-1', focusedBlockId: 'block-1', isDirty: false, isNoteEmpty: false, lastSaveResult: null })}>Editing (clean)</button>
    <button onclick={() => emitState({ status: 'editing', currentNoteId: 'preview-note-1', focusedBlockId: 'block-1', isDirty: true, isNoteEmpty: false, lastSaveResult: null })}>Editing (dirty)</button>
    <button onclick={() => emitState({ status: 'saving', currentNoteId: 'preview-note-1', isNoteEmpty: false })}>Saving</button>
  </div>

  <EditorPanel {adapter} />

  <section class="log">
    <h2>Adapter log</h2>
    <pre>{log.join("\n")}</pre>
  </section>
</main>

<style>
  .preview {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px;
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
    color: #1f1f1f;
  }

  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .controls button {
    padding: 4px 10px;
    font-size: 12px;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.15);
    background: #f6f5f4;
    cursor: pointer;
  }

  .log {
    margin-top: 32px;
    padding: 16px;
    background: #faf9f8;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 8px;
  }
  .log pre {
    font-size: 12px;
    white-space: pre-wrap;
  }
</style>
