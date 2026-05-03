# FIND-011: NEG-REQ-005 brand allow-list is incomplete — `VaultId` and `Timestamp` brands are not forbidden from TS-side construction

- **id**: FIND-011
- **severity**: major
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:411-415` (NEG-REQ-005: "any branded value object (`VaultPath`, `Body`, `Tag`, `Frontmatter`, `NoteId`)")

## referenceCitation
- `docs/domain/code/ts/src/shared/value-objects.ts:31` — `Timestamp = Brand<{ readonly epochMillis: number }, "Timestamp">`.
- `docs/domain/code/ts/src/shared/value-objects.ts:106` — `VaultId = Brand<string, "VaultId">`.
- `docs/domain/ui-fields.md:14-25` — "Smart Constructor は Rust 側" lists `Timestamp` as a UI-uninstantiable type alongside `VaultPath`, `Tag`, `Body`, `Frontmatter`, `NoteId`.

## description
The shared-kernel value-objects file declares six branded types: `NoteId`, `Timestamp`, `Tag`, `Body`, `Frontmatter`, `VaultPath`, `VaultId`. NEG-REQ-005 enumerates only five (`VaultPath`, `Body`, `Tag`, `Frontmatter`, `NoteId`). `VaultId` and `Timestamp` are missing. While `ui-app-shell` does not directly construct timestamps for events, `InitialUIState.editingSessionState.now` and the `Timestamp` displayed for `corruptedFiles` (if any) flow through TS. A sloppy implementation could reasonably do `{ epochMillis: Date.now() } as Timestamp` for a "loading" state placeholder without any spec violation. Same for `VaultId.singleton()` if reimplemented in TS.

## suggestedRemediation
Extend NEG-REQ-005 to: "any branded value object (`VaultPath`, `Body`, `Tag`, `Frontmatter`, `NoteId`, **`VaultId`, `Timestamp`**)". Update the AC bullet to include `as VaultId`, `as Timestamp`. Update PROP-002's verification (after FIND-008 remediation) to cover the full set.
