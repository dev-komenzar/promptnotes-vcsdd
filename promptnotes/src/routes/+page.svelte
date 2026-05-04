<script lang="ts">
  import AppShell from "$lib/ui/app-shell/AppShell.svelte";
  import EditorPane from "$lib/editor/EditorPane.svelte";
  import { createTauriEditorAdapter } from "$lib/editor/tauriEditorAdapter.js";
  import { createEditorStateChannel } from "$lib/editor/editorStateChannel.js";
  import { createDebounceTimer } from "$lib/editor/debounceTimer.js";
  import { createClipboardAdapter } from "$lib/editor/clipboardAdapter.js";

  const clock = { now: () => Date.now() };
  const adapter = createTauriEditorAdapter();
  const stateChannel = createEditorStateChannel();
  const timer = createDebounceTimer(clock);
  const clipboard = createClipboardAdapter();
</script>

<AppShell>
  <!-- Configured 状態のときに表示される本体スロット。
       EditorPane が Vault 設定済み状態でマウントされる。 -->
  <EditorPane
    {adapter}
    {stateChannel}
    {timer}
    {clipboard}
    {clock}
  />
</AppShell>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    background-color: #ffffff;
    height: 100%;
  }

  :global(:root) {
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    font-weight: 400;
    color: #1f1f1f;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
</style>
