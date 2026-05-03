# FIND-016: Source-of-truth list at top of behavioral-spec contains a stale `EditingSessionState` reference for an out-of-scope feature

- **id**: FIND-016
- **severity**: minor
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:12` ("`docs/domain/code/ts/src/capture/states.ts` (`EditingSessionState`)")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:18` ("Scope: UI シェル層のみ。ドメインパイプライン (`app-startup`, `configure-vault`) の再実装は一切行わない")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:374-380` (NEG-REQ-001 forbids editor)

## description
The "Source of truth" header lists `capture/states.ts` (`EditingSessionState`), but `EditingSessionState` belongs to the editor feature explicitly excluded by NEG-REQ-001 ("THE SYSTEM SHALL NOT implement the note editor textarea..."). `ui-app-shell` does not use `EditingSessionState` anywhere in its REQs (the `InitialUIState.editingSessionState` field passes through, but the spec never reads or branches on its content). Including it in the source-of-truth header invites scope creep — an implementer may read this and decide that some `editingSessionState` UI rendering belongs in `ui-app-shell`.

## suggestedRemediation
Remove `EditingSessionState` from the source-of-truth header, OR add an explicit note: "`InitialUIState.editingSessionState` is passed through to the editor feature; `ui-app-shell` SHALL NOT inspect or render its content (see NEG-REQ-001)." Cross-check every entry in the source-of-truth header against the actual REQ usage to remove other dead references.
