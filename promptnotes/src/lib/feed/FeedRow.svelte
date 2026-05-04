<script lang="ts">
  // FeedRow.svelte — not implemented (Red phase stub)
  import type { TauriFeedAdapter } from './tauriFeedAdapter.js';
  import type { FeedViewState } from './types.js';

  interface Props {
    noteId: string;
    body: string;
    createdAt: number;
    updatedAt: number;
    tags: readonly string[];
    viewState: FeedViewState;
    adapter: TauriFeedAdapter;
    onDeleteRequest?: (noteId: string) => void;
  }

  let { noteId, body, createdAt, updatedAt, tags, viewState, adapter, onDeleteRequest }: Props = $props();
</script>

<!-- not implemented -->
