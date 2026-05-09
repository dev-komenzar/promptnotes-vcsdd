# Spec Review Verdict — edit-past-note-start Sprint 2 Revision 4 (Phase 1c)

**Reviewed by**: vcsdd-adversary (fresh context)
**Reviewed at**: 2026-05-07T03:30:00Z
**Mode**: lean
**Artifacts under review**:
- behavioral-spec.md (Revision 4)
- verification-architecture.md (Revision 4)

## Per-dimension verdicts

| Dimension | Verdict | Notes |
|-----------|---------|-------|
| spec_fidelity | FAIL | `NoteOps.isEmpty` definition diverges from canonical aggregates.md L120/L142 (FIND-001). |
| edge_case_coverage | PASS | All Builder-flagged edge cases enumerated; idempotent re-focus, save-failed × same-note, save-failed × cross-note both succeed and fail, snapshot=null + cross-noteId all present. |
| verification_readiness | FAIL | NoteSaveFailureReason mapping has no enumerative PROP coverage (FIND-005); PROP-EPNS-001 purity claim is structurally unverifiable given the SaveFailedState note-sourcing arrangement (FIND-002). |
| purity_boundary_clarity | FAIL | `classifyCurrentSession` purity claim contradicted by spec's own statement that it accesses an external editing buffer for SaveFailedState `note` (FIND-002); `previousFrontmatter` "side-channel" has no port contract (FIND-004). |
| internal_consistency | FAIL | REQ-EPNS-008 mandates `isDirty=false` and `editing` status unconditionally; REQ-EPNS-005 requires same-note path to preserve dirty status and (on SaveFailedState) preserve `save-failed` status. Direct contradiction (FIND-003). |

## Overall verdict: FAIL

## Findings

### FIND-EPNS-S2-001 (severity: major) — `NoteOps.isEmpty` definition contradicts canonical aggregate spec

- **Dimension**: spec_fidelity
- **Phase rooted**: 1a
- **Where**:
  - behavioral-spec.md REQ-EPNS-002 lines 100-108 ("`NoteOps.isEmpty` definition for EditPastNoteStart scope"); changelog line 24
  - verification-architecture.md port contracts lines 79-85
- **Issue**:
  The spec defines `NoteOps.isEmpty` for "EditPastNoteStart scope" as the *narrow* rule "blocks.length === 1 && blocks[0].type === 'paragraph' && empty content". It then frames CaptureAutoSave as using a "broader" rule. This inverts the canonical relationship:
  - `aggregates.md` L120: "全ブロックが空（または `divider` のみ）の Note はファイル化されない（Capture 側ルール）。判定は `note.isEmpty()` が担う"
  - `aggregates.md` L142: "`note.isEmpty(): boolean` | 全ブロックが空（または divider のみ）か判定"
  - CaptureAutoSave Revision 4 (FIND-012) explicitly aligned to the canonical broad rule including divider-only, divider-and-empty, and multi-empty-paragraph variants.

  `NoteOps.isEmpty` is a SINGLE function on the Shared Kernel `Note` aggregate. It cannot return different values in different workflows for the same input. By defining a "scope-narrow" interpretation of the same name, the spec introduces a definition collision: a Note `[paragraph(""), paragraph("")]` is `isEmpty===true` in CaptureAutoSave but `isEmpty===false` per this spec's REQ-EPNS-002 edge case ("More than one block (even if all empty): NOT classified as empty").

  The verification-architecture acknowledges the issue with the phrase "spec interpretation for this workflow" (line 84). This is not a verifiable port contract — it is a redefinition.

  Additionally, the rationale at REQ-EPNS-002 ("a note with only dividers is intentional user content") directly contradicts the canonical aggregate invariant #4 (aggregates.md L120) which classifies divider-only as discardable.

- **Recommended fix**: Either
  (a) Adopt the canonical broad rule and update REQ-EPNS-002 edge cases (multi-empty-para → empty; divider-only → empty), aligning with CaptureAutoSave; or
  (b) Introduce a workflow-local predicate with a distinct name (e.g., `isFreshUntouchedNote`) and stop calling it `NoteOps.isEmpty`. Document why this workflow's discard heuristic is narrower than the aggregate's `isEmpty`. Update PROP-EPNS-003 and the port contract accordingly.

---

### FIND-EPNS-S2-002 (severity: critical) — `classifyCurrentSession` purity claim is contradicted by spec's own SaveFailedState note-sourcing

- **Dimension**: purity_boundary_clarity / verification_readiness
- **Phase rooted**: both 1a and 1b
- **Where**:
  - behavioral-spec.md REQ-EPNS-006 lines 216-217 ("Note sourcing for SaveFailedState")
  - behavioral-spec.md REQ-EPNS-007 lines 237-243 (function signature) and lines 267-272 (acceptance "calls no ports", "referentially transparent")
  - verification-architecture.md lines 31, 97-105 (Step 1 classification "Pure core ... no ports, no side effects, deterministic")
  - PROP-EPNS-001 (line 120) declares `(EditingSessionState, BlockFocusRequest)` purity as Tier-1 required obligation
- **Issue**:
  REQ-EPNS-007 asserts the signature `(EditingSessionState, BlockFocusRequest) → CurrentSessionDecision` is referentially transparent and calls no ports. PROP-EPNS-001 makes this a **required:true** Tier-1 obligation.

  However REQ-EPNS-006 line 217 states for `SaveFailedState`:
  > "the function signature `classifyCurrentSession(state: EditingSessionState, request: BlockFocusRequest) => CurrentSessionDecision` accesses the current Note from the editing buffer, not from the state object directly. The dirty decision carries `note: Note` taken from the editing buffer."

  This is a flat contradiction. A pure function cannot "access an editing buffer" that is not in its parameter list. If `classifyCurrentSession` reads from an external buffer to populate the `dirty.note` payload, then:
  - Same `(state, request)` inputs produce different `CurrentSessionDecision.dirty.note` values depending on buffer state → PROP-EPNS-001 fails.
  - PROP-EPNS-019 ("`Clock.now()` is NEVER called inside `classifyCurrentSession`") may hold but the broader purity claim does not.

  This also means PROP-EPNS-001 is structurally unverifiable as written: fast-check cannot generate a "buffer state" that is not in the signature.

- **Recommended fix**: Choose one:
  (a) Widen the signature to `classifyCurrentSession(state: EditingSessionState, request: BlockFocusRequest, currentNote: Note | null) => CurrentSessionDecision`. The application layer passes `null` for `IdleState`, the in-buffer `Note` otherwise. Update workflows.ts (`ClassifyCurrentSession`) accordingly. Re-anchor PROP-EPNS-001 on this widened signature.
  (b) Carry `Note` inside `EditingState` AND `SaveFailedState` (state-machine refactor). Update states.ts.
  (c) Move SaveFailedState's `same-note`/`dirty` decision into the effectful shell (`flushCurrentSession`) and downgrade PROP-EPNS-001 to "purity holds for IdleState/EditingState only", explicitly excluding the buffer-access path. This shrinks the formally-verifiable core claim.

---

### FIND-EPNS-S2-003 (severity: critical) — REQ-EPNS-008 vs REQ-EPNS-005 same-note state-transition contradiction (data-safety risk)

- **Dimension**: internal_consistency
- **Phase rooted**: 1a
- **Where**:
  - behavioral-spec.md REQ-EPNS-008 lines 277-278 (EARS) and lines 301-304 (acceptance)
  - behavioral-spec.md REQ-EPNS-005 lines 188 (EARS), 207 (acceptance: "session is NOT terminated and restarted with a clean dirty flag — it continues from the current dirty status")
  - behavioral-spec.md edge case catalog line 420 ("`SaveFailedState` status PRESERVED (not cleared)")
- **Issue**:
  REQ-EPNS-008 EARS unconditionally says: "transition `EditingSessionState` to `editing(noteId, focusedBlockId: blockId, isDirty: false)`." Acceptance criteria reinforce: "EditingSessionState.status === 'editing'", "EditingSessionState.isDirty === false".

  No scoping language carves out the same-note path or the `SaveFailedState` same-note path. By the literal reading of REQ-EPNS-008:
  - Same-note path on `EditingState` with `isDirty=true` → after workflow, `isDirty=false`. Contradicts REQ-EPNS-005 acceptance line 207 ("continues from the current dirty status") — silent loss of dirty status, leading to a missed auto-save on the next idle tick.
  - Same-note path on `SaveFailedState` → after workflow, `status === 'editing'`. Contradicts REQ-EPNS-005 line 207 (and edge case catalog line 420) which require the save-failed status to be PRESERVED. **Silent clearing of save-failed status loses the underlying SaveError and the user's recovery affordance — this is a data-safety risk.**

  Builder explicitly flagged this concern and the spec only "hints" at the carve-out via Revision 4 changelog ("editing → editing... idle timer も継続") and via REQ-EPNS-005 prose. The `SHALL` in REQ-EPNS-008 is normative and overrides hints.

  No PROP enforces the SaveFailedState preservation invariant for the same-note path *against* REQ-EPNS-008's clearing requirement. PROP-EPNS-018 verifies "SaveFailedState status preserved" — but the spec is internally inconsistent, so PROP-EPNS-018 contradicts PROP coverage of REQ-EPNS-008.

- **Recommended fix**: Rewrite REQ-EPNS-008 EARS as path-conditional. Explicitly: "WHEN `FlushedCurrentSession.result ∈ {no-op, discarded, saved}` THEN transition to `editing(noteId, focusedBlockId: blockId, isDirty: false)`. WHEN `FlushedCurrentSession.result === 'same-note-skipped'` AND prior state was `EditingState` THEN update `state.focusedBlockId := request.blockId` only; preserve `isDirty` and idle timer. WHEN `FlushedCurrentSession.result === 'same-note-skipped'` AND prior state was `SaveFailedState` THEN update only `state.focusedBlockId` (if state shape permits) or take a no-op state path; PRESERVE `status === 'save-failed'`, `lastSaveError`, and `pendingNextFocus`."

  Note: `SaveFailedState` per `states.ts` lines 70-75 has no `focusedBlockId` field. If same-note focus must persist in save-failed, the state shape may need extension OR the focus-only update must be considered out-of-state-machine (UI-only). Resolve this explicitly.

---

### FIND-EPNS-S2-004 (severity: major) — `previousFrontmatter` delivery mechanism is underspecified

- **Dimension**: purity_boundary_clarity
- **Phase rooted**: 1b
- **Where**:
  - behavioral-spec.md line 68 ("via `CaptureDeps` context or equivalent ... a side-channel from the Capture editing buffer")
  - verification-architecture.md port contract `BlurSave(noteId, note, previousFrontmatter)` lines 68-72
- **Issue**:
  `BlurSave` requires `previousFrontmatter: Frontmatter | null`. The behavioral spec excludes it from `BlockFocusRequest` and says it is delivered via "CaptureDeps context or equivalent" — described as a "side-channel from the Capture editing buffer". `CaptureDeps` is conventionally the dependency-injection bag for ports (Clock, BlurSave, emit), not for in-memory mutable state. There is no formal port contract for "editing buffer access".

  This leaves `flushCurrentSession`'s dirty-path with an unbound input. PROP-EPNS-008 and PROP-EPNS-015 will exercise the dirty-success path, but they cannot witness the previousFrontmatter being passed correctly without a defined channel. A reviewer cannot tell whether the implementation reads from a closure, a parameter, a side-channel port, or a global.

  This is the same channel the SaveFailedState classification (FIND-002) leans on. Underspecifying it leaves both purity and verification claims fragile.

- **Recommended fix**: Define the channel explicitly. Options:
  (a) Add a `getEditingBuffer: () => { note: Note; previousFrontmatter: Frontmatter | null } | null` port to the verification-architecture port contracts.
  (b) Pass `previousFrontmatter` (and `currentNote` for SaveFailedState) as additional explicit parameters to the `EditPastNoteStart` workflow signature.
  (c) Document a typed editing-buffer struct that is passed alongside `current: EditingSessionState` (e.g., widen the workflow signature to `(deps, current, buffer, request)`).

  Whichever choice, update `workflows.ts` `EditPastNoteStart` and `ClassifyCurrentSession` types accordingly. Add a PROP that asserts the previousFrontmatter forwarded to BlurSave equals the buffer's previousFrontmatter on the dirty-cross-note path.

---

### FIND-EPNS-S2-005 (severity: major) — NoteSaveFailureReason mapping has no enumerative PROP coverage

- **Dimension**: verification_readiness
- **Phase rooted**: 1b
- **Where**:
  - behavioral-spec.md REQ-EPNS-004 lines 164-170 (mapping table: 6 SaveError kinds → 4 NoteSaveFailureReason values)
  - verification-architecture.md PROP-EPNS-009, PROP-EPNS-023 (only Tier-2 example-based, single-instance)
  - Coverage matrix line 172: `REQ-EPNS-004 | PROP-EPNS-009, PROP-EPNS-023`
- **Issue**:
  REQ-EPNS-004 specifies a 6-entry mapping from `SaveError` discriminants to `NoteSaveFailureReason` values:
  - permission → "permission"
  - disk-full → "disk-full"
  - lock → "lock"
  - not-found → "unknown"
  - fs/unknown → "unknown"
  - validation/* → "unknown"

  This is exactly the kind of finite mapping table that begs a Tier-1 (fast-check or table-driven) enumerative PROP — generate every `SaveError` variant and assert the mapping. Currently:
  - PROP-EPNS-009 is a single example-based test (one error case).
  - PROP-EPNS-023 verifies `pendingNextFocus` shape, not the reason mapping.

  As written, an implementation that incorrectly maps `not-found → "permission"` could pass both PROPs.

- **Recommended fix**: Add a new Tier-1 obligation, e.g.,
  > **PROP-EPNS-026**: For every `SaveError` discriminant `e`, the emitted `NoteSaveFailed.reason` matches the table in REQ-EPNS-004. (fast-check arbitrary over `SaveError`, or table-driven test enumerating all 6 cases.)

  Cite REQ-EPNS-004 in the coverage matrix. This is canonical mapping correctness — losing or mis-routing reasons silently breaks the UI's failure-mode disambiguation.

---

### FIND-EPNS-S2-006 (severity: minor) — `parseMarkdownToBlocks` failure on cross-note hydration is "undefined" with no PROP and no port-level test hook

- **Dimension**: edge_case_coverage / verification_readiness
- **Phase rooted**: 1a / 1b
- **Where**:
  - behavioral-spec.md REQ-EPNS-008 line 280 ("treated as a contract violation ... behavior is undefined by this spec and the implementation should throw with an internal error")
  - verification-architecture.md ParseMarkdownToBlocks contract lines 87-95 ("Failure on pre-validated snapshots is treated as a contract violation")
- **Issue**:
  `parseMarkdownToBlocks` returns `Result<Block[], BlockParseError>`. The spec relies on a caller-side invariant (snapshots pre-validated at vault scan) and declares the failure path "undefined". No PROP forces the implementation to handle this path (throw, log, or otherwise). A regression that swallows BlockParseError silently would not be caught.

  Additionally, "snapshot=null + cross-noteId" is similarly declared a "caller precondition violation" with undefined behavior (line 415). Two undefined-behavior paths on the same workflow leave a gap.

- **Recommended fix**: At minimum, add a PROP that asserts the implementation throws (or returns a typed internal error) on parse failure, so CI catches accidental silent fallback to an empty Note. Optionally, define an explicit `ContractViolation` error path rather than "undefined".

---

### FIND-EPNS-S2-007 (severity: minor) — Same-note idempotent re-focus has no dedicated PROP

- **Dimension**: edge_case_coverage
- **Phase rooted**: 1b
- **Where**:
  - behavioral-spec.md REQ-EPNS-005 line 195 ("idempotent re-focus")
  - behavioral-spec.md edge case catalog line 417
- **Issue**:
  Idempotent re-focus (`request.noteId === state.currentNoteId && request.blockId === state.focusedBlockId`) is enumerated as an edge case but no PROP asserts: running the workflow twice with identical inputs produces the same final `EditingSessionState` and exactly two `BlockFocused` emissions (one per call). PROP-EPNS-010 covers same-note in general; PROP-EPNS-018 covers SaveFailedState same-note status preservation. Neither isolates the idempotent same-block case.

- **Recommended fix**: Add a Tier-2 example-based PROP: "WHEN classify+flush+startNewSession is invoked twice with `request.noteId === state.currentNoteId && request.blockId === state.focusedBlockId`, both invocations succeed; cumulative emit count for BlockFocused is exactly 2; final state equals the state after the first call (idempotent fixed point)."

---

### FIND-EPNS-S2-008 (severity: minor) — PROP-EPNS-024 dirty-fail Clock budget claim lacks code-path derivation

- **Dimension**: verification_readiness
- **Phase rooted**: 1b
- **Where**:
  - behavioral-spec.md REQ-EPNS-012 budget table lines 362-369 (Dirty, save fails: 1 Clock call)
  - verification-architecture.md PROP-EPNS-024 line 143
- **Issue**:
  The budget table claims `dirty-fail` consumes exactly 1 `Clock.now()` call attributed to `flushCurrentSession` for `NoteSaveFailed.occurredOn`. The spec assumes `flushCurrentSession` (not `CaptureAutoSave`) is responsible for emitting `NoteSaveFailed`. This is plausible because `BlurSave: ... => Promise<Result<NoteFileSaved, SaveError>>` returns `SaveError`, leaving `NoteSaveFailed` event construction outside the BlurSave port. However the spec does not anchor this claim against a workflow-step contract: REQ-EPNS-004 mentions `NoteSaveFailed` is emitted but does not say which step does it or which Clock call stamps `occurredOn`.

  Without that traceability, PROP-EPNS-024's `dirty-fail=1` cell is asserted without a derivation. A future refactor that moves the emission inside `BlurSave` (where CaptureAutoSave handles its own timestamps, like dirty-success) would silently break the Clock count.

- **Recommended fix**: Add a sentence in REQ-EPNS-004 acceptance criteria stating: "`NoteSaveFailed.occurredOn` is set by `flushCurrentSession` via a single `Clock.now()` call after BlurSave returns `Err`. CaptureAutoSave/BlurSave does not emit `NoteSaveFailed`." Cross-reference from the Clock budget table.
