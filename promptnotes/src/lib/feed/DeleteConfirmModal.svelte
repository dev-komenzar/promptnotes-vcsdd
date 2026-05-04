<script lang="ts">
  // DeleteConfirmModal.svelte — not implemented (Red phase stub)
  import type { TauriFeedAdapter } from './tauriFeedAdapter.js';

  interface Props {
    noteId: string;
    adapter: TauriFeedAdapter;
    onClose?: () => void;
  }

  let { noteId, adapter, onClose }: Props = $props();
</script>

<!-- not implemented -->
