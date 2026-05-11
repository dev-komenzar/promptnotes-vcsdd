<script lang="ts">
  /**
   * +page.svelte — Main route.
   *
   * Single-column layout: FeedList fills the full width with in-place editing
   * via FeedRow (CodeMirror embedded per note). EditorPanel has been removed.
   */

  import AppShell from "$lib/ui/app-shell/AppShell.svelte";
  import FeedList from "$lib/feed/FeedList.svelte";
  import { createTauriFeedAdapter } from "$lib/feed/tauriFeedAdapter.js";
  import { createFeedStateChannel } from "$lib/feed/feedStateChannel.js";
  import type { FeedViewState } from "$lib/feed/types.js";
  import { invoke } from "@tauri-apps/api/core";

  // ── Feed adapters ──────────────────────────────────────────────────────
  const feedAdapter = createTauriFeedAdapter();
  const feedStateChannel = createFeedStateChannel();

  // Initial feed view state — loading until feed_initial_state resolves.
  let feedViewState = $state<FeedViewState>({
    editingStatus: "idle",
    editingNoteId: null,
    pendingNextFocus: null,
    visibleNoteIds: [],
    loadingStatus: "loading",
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    noteMetadata: {},
    tagAutocompleteVisibleFor: null,
    activeFilterTags: [],
    allNoteIds: [],
    // ui-filter-search initial values (REQ-FILTER-010)
    searchQuery: "",
    sortDirection: "desc",
  });

  // FIND-S2-01/05/06: Current vault path, resolved once on mount and passed to
  // FeedList so it can forward it to Rust commands that need to emit feed snapshots.
  let currentVaultPath = $state<string>('');

  // REQ-FEED-022: Load initial state from Rust after mount.
  // We use $effect to trigger after the component is attached to the DOM.
  $effect(() => {
    (async () => {
      try {
        // settings_load provides the vault path (configured by ui-app-shell).
        const vaultPath = await invoke<string | null>("settings_load");
        if (vaultPath) {
          currentVaultPath = vaultPath;
          const snapshot = await invoke<{
            editing: { status: string; currentNoteId: string | null; pendingNextFocus: { noteId: string; blockId: string } | null };
            feed: { visibleNoteIds: string[]; filterApplied: boolean };
            delete: { activeDeleteModalNoteId: string | null; lastDeletionError: null };
            noteMetadata: Record<string, { body: string; createdAt: number; updatedAt: number; tags: string[] }>;
            cause: { kind: string };
          }>("feed_initial_state", { vaultPath });

          feedViewState = {
            editingStatus: (snapshot.editing.status as FeedViewState["editingStatus"]) ?? "idle",
            editingNoteId: snapshot.editing.currentNoteId,
            pendingNextFocus: snapshot.editing.pendingNextFocus,
            visibleNoteIds: snapshot.feed.visibleNoteIds,
            allNoteIds: snapshot.feed.visibleNoteIds,
            loadingStatus: "ready",
            activeDeleteModalNoteId: snapshot.delete.activeDeleteModalNoteId,
            lastDeletionError: null,
            noteMetadata: snapshot.noteMetadata,
            tagAutocompleteVisibleFor: feedViewState.tagAutocompleteVisibleFor,
            activeFilterTags: feedViewState.activeFilterTags,
            // ui-filter-search: preserve in-memory search/sort state across initial load
            searchQuery: feedViewState.searchQuery,
            sortDirection: feedViewState.sortDirection,
          };
        } else {
          // Unconfigured: show empty feed as ready (AppShell will redirect to modal)
          feedViewState = { ...feedViewState, loadingStatus: "ready" };
        }
      } catch {
        // If feed_initial_state fails (e.g., vault not yet configured), show ready empty state
        feedViewState = { ...feedViewState, loadingStatus: "ready" };
      }
    })();
  });
</script>

<AppShell>
  <div class="layout">
    <FeedList
      viewState={feedViewState}
      adapter={feedAdapter}
      stateChannel={feedStateChannel}
      vaultPath={currentVaultPath}
    />
  </div>
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

  .layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
</style>
