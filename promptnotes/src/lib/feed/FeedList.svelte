<script lang="ts">
  // FeedList.svelte — not implemented (Red phase stub)
  import type { TauriFeedAdapter } from './tauriFeedAdapter.js';
  import type { FeedStateChannel } from './feedStateChannel.js';
  import type { FeedViewState } from './types.js';

  interface Props {
    viewState: FeedViewState;
    adapter: TauriFeedAdapter;
    stateChannel: FeedStateChannel;
  }

  let { viewState, adapter, stateChannel }: Props = $props();
</script>

<!-- not implemented -->
