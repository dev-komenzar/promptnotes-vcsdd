<script lang="ts">
  import EditorPane from "$lib/editor/EditorPane.svelte";
  import type { TauriEditorAdapter } from "$lib/editor/tauriEditorAdapter";
  import type { EditorStateChannel } from "$lib/editor/editorStateChannel";
  import type { DebounceTimer } from "$lib/editor/debounceTimer";
  import type { ClipboardAdapter } from "$lib/editor/clipboardAdapter";
  import type { EditorViewState } from "$lib/editor/types";

  // Dev-only preview route: mocks the IPC layer so the EditorPane mounts
  // without the Tauri backend. This page is for visual verification only.
  let log = $state<string[]>([]);

  const adapter: TauriEditorAdapter = {
    dispatchEditNoteBody: async (p) => { log.push(`edit_note_body ${JSON.stringify(p)}`); },
    dispatchTriggerIdleSave: async (p) => { log.push(`trigger_idle_save ${JSON.stringify(p)}`); },
    dispatchTriggerBlurSave: async (p) => { log.push(`trigger_blur_save ${JSON.stringify(p)}`); },
    dispatchRetrySave: async (p) => { log.push(`retry_save ${JSON.stringify(p)}`); },
    dispatchDiscardCurrentSession: async (p) => { log.push(`discard_current_session ${JSON.stringify(p)}`); },
    dispatchCancelSwitch: async (p) => { log.push(`cancel_switch ${JSON.stringify(p)}`); },
    dispatchCopyNoteBody: async (p) => { log.push(`copy_note_body ${JSON.stringify(p)}`); },
    dispatchRequestNewNote: async (p) => { log.push(`request_new_note ${JSON.stringify(p)}`); },
  };

  const stateChannel: EditorStateChannel = {
    subscribe: (_handler) => () => {},
  };

  const timer: DebounceTimer = {
    scheduleIdleSave: (_at, _cb) => { log.push(`scheduleIdleSave at=${_at}`); },
    cancel: () => { log.push(`timer.cancel`); },
  };

  const clipboard: ClipboardAdapter = {
    write: async (text) => { log.push(`clipboard.write ${text.slice(0, 32)}`); },
  };

  const clock = { now: () => Date.now() };

  const initialState: EditorViewState = {
    status: "editing",
    isDirty: false,
    currentNoteId: "preview-note-1",
    body: "",
    pendingNextNoteId: null,
    lastError: null,
    pendingNewNoteIntent: null,
  };
</script>

<main class="preview">
  <h1>EditorPane preview (dev only)</h1>
  <p>This page mounts the EditorPane with mock adapters so the editor surface can be visually verified without the Tauri backend.</p>

  <EditorPane
    {adapter}
    {stateChannel}
    {timer}
    {clipboard}
    {clock}
    {initialState}
  />

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
