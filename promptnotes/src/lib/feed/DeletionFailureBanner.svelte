<script lang="ts">
  // DeletionFailureBanner.svelte — not implemented (Red phase stub)
  import type { TauriFeedAdapter } from './tauriFeedAdapter.js';
  import type { NoteDeletionFailureReason } from './types.js';

  interface Props {
    reason: NoteDeletionFailureReason;
    detail?: string;
    noteId: string;
    adapter: TauriFeedAdapter;
  }

  let { reason, detail, noteId, adapter }: Props = $props();
</script>

<!-- not implemented -->
