<script lang="ts">
  import AppShell from "$lib/ui/app-shell/AppShell.svelte";
</script>

<AppShell>
  <!-- Configured 状態のときに表示される本体スロット。
       後続 feature (ui-feed-list-actions, ui-editor 等) でフィード行・エディタ等を埋める。 -->
  <div class="placeholder">
    <p>PromptNotes — Vault が設定されました。</p>
    <p style="opacity: 0.6">フィード一覧やエディタは後続 feature で実装されます。</p>
  </div>
</AppShell>

<style>
  .placeholder {
    padding: 24px;
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
    color: #1f1f1f;
  }

  :global(html, body) {
    margin: 0;
    padding: 0;
    background-color: #ffffff;
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
