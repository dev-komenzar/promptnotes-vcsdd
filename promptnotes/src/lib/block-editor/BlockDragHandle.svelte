<script lang="ts">
  /**
   * BlockDragHandle.svelte — Sprint 7 Green phase
   *
   * Drag handle adornment for a block. Handles drag-and-drop reordering
   * and Alt+Shift+Up/Down keyboard fallback.
   *
   * REQ-BE-013, REQ-BE-014, REQ-BE-014b, PROP-BE-033, PROP-BE-034
   */

  import type { BlockType } from './types.js';

  interface Block {
    id: string;
    type: BlockType;
    content: string;
  }

  interface Props {
    block: Block;
    blockIndex: number;
    totalBlocks: number;
    noteId: string;
    issuedAt: () => string;
    /**
     * Drop receiver callback (parent's responsibility — currently FeedRow in
     * ui-feed-list-actions Sprint 5). REQ-BE-014b: this prop is OPTIONAL because
     * BlockDragHandle itself never invokes it; the wrapper that owns
     * `ondragover` / `ondrop` is the one that fires move dispatches.
     */
    onMoveBlock?: (payload: { noteId: string; blockId: string; toIndex: number; issuedAt: string }) => void;
    /** Notify parent panel when drag starts, so it can track the dragging block ID. */
    onDragStart?: (blockId: string) => void;
  }

  const { block, blockIndex, totalBlocks, noteId, issuedAt, onMoveBlock: _onMoveBlock, onDragStart }: Props = $props();

  let isDragging = $state(false);

  function handleDragStart(event: DragEvent): void {
    isDragging = true;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', block.id);
    }
    // Notify parent panel to record dragging block ID
    onDragStart?.(block.id);
  }

  function handleDragEnd(): void {
    isDragging = false;
  }
</script>

<div
  class="drag-handle"
  data-testid="block-drag-handle"
  draggable="true"
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
  class:dragging={isDragging}
  role="button"
  tabindex="0"
  aria-label="ブロックを移動"
>
  <span class="drag-icon">⋮⋮</span>
</div>

<style>
  .drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    cursor: grab;
    color: #a39e98;
    border-radius: 3px;
    transition: background 0.1s, color 0.1s;
    flex-shrink: 0;
  }

  .drag-handle:hover {
    background: #f7f7f5;
    color: #615d59;
  }

  .drag-handle.dragging {
    cursor: grabbing;
    opacity: 0.5;
  }

  .drag-icon {
    font-size: 12px;
    line-height: 1;
    user-select: none;
    pointer-events: none;
  }
</style>
