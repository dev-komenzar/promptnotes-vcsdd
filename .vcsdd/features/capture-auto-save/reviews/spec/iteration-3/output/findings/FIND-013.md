# FIND-013: PROP-024 cannot enforce body/blocks coherence at type level — construction sites unspecified

**Dimension**: verification_readiness
**Severity**: major

## Location
- `behavioral-spec.md` REQ-018 (lines 363-377), Acceptance criterion #1
- `verification-architecture.md` PROP-024 (line 143), L29 (Cross-cutting invariant note)
- `stages.ts` ValidatedSaveRequest type (lines 40-50)
- `events.ts` SaveNoteRequested (L115-125), NoteFileSaved (L52-66)

## Evidence

REQ-018 acceptance criterion #1 (`behavioral-spec.md` L372) states:

> "At every construction site of `ValidatedSaveRequest`, the producer SHALL compute `body = serializeBlocksToMarkdown(blocks)` and assign both fields atomically. **There is no public constructor that accepts `blocks` and `body` independently.**"

But the type `ValidatedSaveRequest` in `stages.ts` L40-50 is a structural record type with public readonly fields:

```typescript
export type ValidatedSaveRequest = {
  readonly kind: "ValidatedSaveRequest";
  readonly noteId: NoteId;
  readonly blocks: ReadonlyArray<Block>;
  readonly body: Body;
  // ...
};
```

Any code can construct this with mismatched `blocks` and `body`:

```typescript
const bad: ValidatedSaveRequest = {
  kind: "ValidatedSaveRequest",
  noteId, blocks: [],
  body: "totally unrelated string" as Body,
  /* ... */
};
```

The "no public constructor that accepts blocks and body independently" guarantee is therefore aspirational — TypeScript does not enforce it. The spec does not specify HOW the invariant is mechanically enforced:

1. Is there a smart-constructor function (e.g., `ValidatedSaveRequest.from(blocks, frontmatter, ...)`) that the spec is committing to add? It is not enumerated as a function in stages.ts or workflows.ts.
2. Does `PrepareSaveRequest` (L50-58 of workflows.ts) re-assert the invariant at runtime? The signature does not promise this.
3. The Vault-side construction of `NoteFileSaved` happens in **Rust** (per stages.ts comment L23 "SerializedMarkdown 以降は Vault Context（Rust）の責務"). PROP-024 is a TypeScript fast-check property — it cannot exercise the Rust-side construction. How is `NoteFileSaved.body === serializeBlocksToMarkdown(NoteFileSaved.blocks)` enforced when `serializeBlocksToMarkdown` is a TypeScript function and the event is constructed in Rust?

Verification-architecture.md L29 simply says "implementation MUST guarantee" without describing the mechanism.

## Recommended fix

1. Add to REQ-018 an explicit list of construction sites and the function/constructor responsible at each:
   - `ValidatedSaveRequest`: built only by `PrepareSaveRequest` (Capture, TS).
   - `SaveNoteRequested`: built only by `BuildSaveNoteRequested(request)` (Capture, TS).
   - `NoteFileSaved`: built by Vault (Rust); the Rust-side equivalent of `serializeBlocksToMarkdown` MUST produce byte-identical output, OR the Vault must echo back the `body` it received in `SaveNoteRequested` without recomputing.

2. State explicitly which strategy NoteFileSaved uses (echo vs recompute). The current "Vault does not transform body" sentence (L374) implies echo, but the `blocks` field on NoteFileSaved is also independent — so there is still a drift risk if Vault accidentally re-serializes blocks differently.

3. Add a PROP that asserts no public smart constructor exists OR that there IS a smart constructor and it is the only construction site (TypeScript module structure assertion). PROP-024's current fast-check property only verifies that one specific code path produces a coherent record; it does not prevent unsafe construction elsewhere.

4. Add to PROP-024 description an explicit note: this property cannot prove cross-language (Rust→TS) coherence; declare a Tier-3 integration test as a separate proof obligation that verifies an emitted NoteFileSaved (originating from a real Vault save) satisfies the equation.
