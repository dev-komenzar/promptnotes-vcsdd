# Phase 1c Spec Review Findings — configure-vault (iteration 1)

**Verdict**: PASS (lean mode; only BLOCKER findings fail a dimension)
**Counts**: 0 BLOCKER / 3 MAJOR / 6 MINOR

---

## FIND-001  MAJOR  spec_fidelity

**Where**: `behavioral-spec.md` REQ-008 (lines 148-163), REQ-012 (lines 208-218); `verification-architecture.md` Type-Level Contracts (lines 234-256).

**Issue**: REQ-008 and REQ-012 reason about a `Vault` aggregate input that does not exist in the actual pipeline shape. The TS pure helper is `validateAndTransitionVault(vaultId, path, now): Vault` (no prior `Vault` parameter), and `ConfigureVaultPorts` (REQ-014) does not include a `Vault`. Consequences:

- REQ-008 acceptance "defined for `Unconfigured` and `Ready` inputs; `Scanning` is a caller precondition violation" describes inputs the function does not receive.
- REQ-008 idempotency clause "Calling `validateAndTransitionVault` on a `Vault` that is already `Ready` transitions it back to `Ready`" is unverifiable — the function has no `Vault` parameter.
- REQ-012 acceptance "The `Vault` aggregate reference passed to the pipeline is structurally unchanged after a failure return" is unverifiable — no aggregate reference is passed.

This diverges from the Rust mirror `configure(vault, path, now) -> DomainResult<Vault, FsError>` (`aggregate.rs` lines 52-58), which does accept a prior `Vault` and is what enables preservation of `Ready { path, last_scanned_at }`. The TS shape silently drops `last_scanned_at` preservation.

**Hint**: In Phase 2a either (a) widen `validateAndTransitionVault` to accept the prior `Vault` (mirroring Rust), or (b) rewrite REQ-008/REQ-012 to drop all "input Vault" wording and explicitly state that this pipeline never reads or returns a `Vault` aggregate (the in-memory aggregate is reconstituted by the next `loadVaultConfig`). Pick one.

---

## FIND-002  MAJOR  spec_fidelity

**Where**: `behavioral-spec.md` Purity Boundary Candidates table (lines 270-281, row `mapStatDirError(fsError)`); contradicts `verification-architecture.md` Pure helper contracts (lines 109-122).

**Issue**: The behavioral spec lists a pure helper `mapStatDirError(fsError) → VaultConfigError` taking only an `FsError`. But REQ-002 collapses `Ok(false)` (which is not an `FsError`) to `path-not-found`, so a function with that signature cannot implement the spec. The verification architecture correctly defines the helper as `mapStatDirResult(Result<boolean, FsError>, pathStr) → Result<void, VaultConfigError>` taking the entire `Result`. The two specs disagree on the pure-core API surface.

**Hint**: Edit `behavioral-spec.md` Purity Boundary Candidates table to rename the row to `mapStatDirResult(statResult, pathStr)` and align with `verification-architecture.md` line 118-122. The architecture file is correct.

---

## FIND-003  MAJOR  verification_readiness

**Where**: `verification-architecture.md` PROP-CV-007 (line 157).

**Issue**: PROP-CV-007 conflates two distinct claims: (1) `VaultConfigError` exhaustiveness in a TypeScript `switch` (Tier 0, type-level) and (2) `unconfigured` is never produced by ConfigureVault (a runtime invariant). A TS `never`-branch switch over `VaultConfigError.kind` proves only that all three variants are *handled*, not that ConfigureVault never *produces* `unconfigured`. The proposed verification plan packages a runtime enumeration into a Tier-0 obligation, which is a tier mismatch and weakens falsifiability.

**Hint**: Split into two obligations. Keep PROP-CV-007 (Tier 0) for compile-time exhaustiveness. Add PROP-CV-007b (Tier 1, spy-based) that runs `configureVault` against a fast-check generator over the cross product of `statDir` outcomes × `settingsSave` outcomes and asserts no error has `kind === "unconfigured"`.

---

## FIND-004  MINOR  verification_readiness

**Where**: `verification-architecture.md` Coverage Matrix (lines 179-194), REQ-012 row.

**Issue**: REQ-012 ("No mutation of input VaultPath or Vault aggregate on failure") is mapped to PROP-CV-004 (transition purity) and PROP-CV-008 (statDir-before-settingsSave ordering). Neither PROP directly verifies that `validateAndTransitionVault` is NOT invoked when `Settings.save` returns `Err(*)`. PROP-CV-008 only constrains `Settings.save` w.r.t. `statDir`, not `validateAndTransitionVault` w.r.t. `Settings.save`.

**Hint**: Add a bullet to PROP-CV-008 (or a new PROP-CV-008b): spy `validateAndTransitionVault` and assert call count === 0 on every `Settings.save` failure path.

---

## FIND-005  MINOR  spec_fidelity

**Where**: `behavioral-spec.md` REQ-014 (lines 240-267); contrasted with `load-vault-config.ts` lines 48-50.

**Issue**: REQ-014 mandates a synchronous return type `Result<VaultDirectoryConfigured, VaultConfigError>`. But the cited "nearest-neighbor" `loadVaultConfig` returns `Promise<Result<...>>`. The spec claims to mirror the nearest-neighbor pattern and then explicitly diverges from it without justifying why this pipeline is sync when the precedent is async.

**Hint**: Add one sentence to REQ-014 rationale: "We diverge from `loadVaultConfig`'s `Promise` wrapper because all ConfigureVault ports are synchronous in their TS contracts; the Tauri command boundary wraps the sync pipeline in an async `tauri::command`." Or change the return type to `Promise<Result<...>>` to literally match the precedent.

---

## FIND-006  MINOR  spec_fidelity

**Where**: `behavioral-spec.md` REQ-011 acceptance (line 203); `verification-architecture.md` Port Contracts (lines 93-98).

**Issue**: REQ-011 says the event is emitted via the `EventBus.publish` port. The actual TS port name in `ConfigureVaultPorts` is `emit`. The literal text "EventBus.publish" does not appear in the type contract.

**Hint**: Reword REQ-011 acceptance to: "the event is emitted via the `emit` port (the public-domain-event publish port; equivalent to `EventBus::publish` in the Rust port set in `ports.rs`)."

---

## FIND-007  MINOR  verification_readiness

**Where**: `verification-architecture.md` PROP-CV-005 (line 155); `behavioral-spec.md` REQ-013 budget table (line 230).

**Issue**: REQ-013's `Settings.save Err(*)` budget row aggregates all four `FsError` kinds (`permission`, `disk-full`, `lock`, `unknown`) into one row. PROP-CV-005's verification plan does not specify whether each `FsError` kind needs its own run. Combined with FIND-003, PROP-CV-005 could pass with a single representative example and miss a regression on, e.g., the `disk-full` branch.

**Hint**: Reword PROP-CV-005 verification: "use `fast-check` to enumerate one happy path + every `statDir` failure variant (`Ok(false)`, `Err(not-found)`, `Err(permission)`, `Err(disk-full)`, `Err(lock)`, `Err(unknown)`) + every `settingsSave` failure variant; assert the budget row matching the path on every generated case."

---

## FIND-008  MINOR  verification_readiness

**Where**: `verification-architecture.md` Findings to Carry Forward (lines 275-280).

**Issue**: The "Findings to Carry Forward" table flags three issues for "1c review" but does not record resolutions. Reviewer position recorded here:

- "Settings.save non-permission errors map to path-not-found": **ACCEPTED** for lean MVP. UI message is mildly misleading for `disk-full`/`lock`, but the MVP cost of a new `VaultConfigError` variant outweighs the benefit. Re-open if user reports surface this.
- "Scanning state caller precondition": **ACCEPTED**. UI flow does not allow ConfigureVault while Scanning. No runtime guard required for lean.
- "`VaultId.singleton()` source": **ACCEPTED**. Injecting `vaultId` into `ConfigureVaultPorts` matches the AppStartup precedent of resolving `VaultIdApi.singleton()` at the Tauri command handler boundary.

**Hint**: Edit `verification-architecture.md` "Findings to Carry Forward" with the three resolutions above so Phase 2a does not re-litigate them.

---

## FIND-009  MINOR  spec_fidelity

**Where**: `behavioral-spec.md` REQ-014 (line 254 `vaultId: VaultId`); `verification-architecture.md` line 242.

**Issue**: `vaultId` is a member of `ConfigureVaultPorts`, but it is a *value*, not a port (function). Mixing values and functions in the same record blurs the DI contract. The Rust mirror `ConfigureVaultDeps` (`workflows.rs` lines 57-66) keeps only ports (`SettingsPort`, `FileSystemPort`, `ClockPort`).

**Hint**: Rename the type to `ConfigureVaultDeps` (matching Rust and admitting the record mixes ports and values), or split: keep `ConfigureVaultPorts` for functions only and add a positional argument `vaultId: VaultId` to `configureVault`. Cosmetic but improves symmetry with the Rust contract.
