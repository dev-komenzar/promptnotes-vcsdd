# FIND-002: §6 forbidden list omits the canonical-pattern token `invoke(`

**Severity**: minor
**Category**: purity_boundary
**Dimension**: structural_integrity
**Location**: `.vcsdd/features/ui-editor/contracts/sprint-1.md` lines 158-172 (§6 Forbidden in This Sprint)

## Issue

The canonical purity-audit grep pattern in `verification-architecture.md §2` is:

```
Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now|Date\(|new Date|\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api
```

This pattern lists `invoke\(` and `@tauri-apps/api` as **two separate** tokens. The intent is clear: even if a module somehow obtained an `invoke` reference without an `@tauri-apps/api` import (e.g., re-export, dynamic require, alias), the grep would still catch it.

The contract's §6 forbidden list ("MUST NOT appear in any file authored during Sprint 1") includes `@tauri-apps/api` but does **not** explicitly call out `invoke(` as a forbidden token. §7 DoD item 4 says "Phase 5 canonical purity grep ... returns zero hits", which implicitly enforces the canonical pattern, but the human-readable §6 list (which the sprint adversary uses to check test files for accidental impure imports) is incomplete relative to the canonical pattern.

## Required Remediation

Add `invoke(` (or a phrasing such as "any direct `invoke()` call") to the §6 forbidden list, mirroring the canonical purity-audit pattern. This eliminates the reliance on the `@tauri-apps/api` import ban catching it indirectly and removes the divergence between §6 and the canonical pattern in `verification-architecture.md §2`.
