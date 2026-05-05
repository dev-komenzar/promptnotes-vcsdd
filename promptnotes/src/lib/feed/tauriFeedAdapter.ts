/**
 * tauriFeedAdapter.ts — OUTBOUND only Tauri IPC adapter.
 *
 * Effectful shell. OUTBOUND only.
 * PROP-FEED-032: IPC boundary — no inbound event subscription here.
 */

import { invoke } from '@tauri-apps/api/core';

const CMD = {
  selectPastNote: 'select_past_note',
  requestNoteDeletion: 'request_note_deletion',
  confirmNoteDeletion: 'confirm_note_deletion',
  cancelNoteDeletion: 'cancel_note_deletion',
  writeFileAtomic: 'write_file_atomic',
} as const;

/**
 * Serialize frontmatter + body to markdown and write atomically via Rust command.
 */
async function tagSaveToFile(
  noteId: string,
  body: string,
  tags: readonly string[],
  createdAt: number,
  updatedAt: number,
): Promise<void> {
  const createdAtIso = new Date(createdAt).toISOString();
  const updatedAtIso = new Date(updatedAt).toISOString();
  const tagsYaml = tags.map((t) => `  - ${t}`).join('\n');
  const markdown = `---\ntags:\n${tagsYaml || '  []'}\ncreatedAt: ${createdAtIso}\nupdatedAt: ${updatedAtIso}\n---\n${body}`;
  return invoke(CMD.writeFileAtomic, { path: noteId, contents: markdown });
}

export function createTauriFeedAdapter(): TauriFeedAdapter {
  return {
    dispatchSelectPastNote(noteId: string, vaultPath: string, issuedAt: string): Promise<void> {
      return invoke(CMD.selectPastNote, { noteId, vaultPath, issuedAt });
    },
    dispatchRequestNoteDeletion(noteId: string, issuedAt: string): Promise<void> {
      return invoke(CMD.requestNoteDeletion, { noteId, issuedAt });
    },
    dispatchConfirmNoteDeletion(noteId: string, filePath: string, vaultPath: string, issuedAt: string): Promise<void> {
      return invoke(CMD.confirmNoteDeletion, { noteId, filePath, vaultPath, issuedAt });
    },
    dispatchCancelNoteDeletion(noteId: string, issuedAt: string): Promise<void> {
      return invoke(CMD.cancelNoteDeletion, { noteId, issuedAt });
    },
    // ui-tag-chip: Tag write operations call the Tauri write command.
    // The domain pipeline (tagChipUpdate) is invoked via the Vault-level adapter
    // which shares the writeFileAtomic handler. Filter operations are pure client-side.
    dispatchAddTagViaChip(
      noteId: string,
      tag: string,
      body: string,
      existingTags: readonly string[],
      createdAt: number,
      updatedAt: number,
      issuedAt: string,
    ): Promise<void> {
      const newTags = [...existingTags, tag];
      return tagSaveToFile(noteId, body, newTags, createdAt, updatedAt);
    },
    dispatchRemoveTagViaChip(
      noteId: string,
      tag: string,
      body: string,
      existingTags: readonly string[],
      createdAt: number,
      updatedAt: number,
      issuedAt: string,
    ): Promise<void> {
      const newTags = existingTags.filter((t) => t !== tag);
      return tagSaveToFile(noteId, body, newTags, createdAt, updatedAt);
    },
    dispatchApplyFilter(_tag: string): void {
      // Pure client-side filter toggle — state updated by reducer.
    },
    dispatchRemoveFilter(_tag: string): void {
      // Pure client-side filter toggle — state updated by reducer.
    },
    dispatchClearFilter(): void {
      // Pure client-side filter clear — state updated by reducer.
    },
  };
}
