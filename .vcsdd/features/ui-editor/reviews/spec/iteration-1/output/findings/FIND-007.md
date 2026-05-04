---
id: FIND-007
severity: major
dimension: verification_readiness
targets: ["verification-architecture.md §7 Phase 5 gate purity audit", "verification-architecture.md §2 forbidden APIs"]
---

## Observation

`verification-architecture.md §7` Phase 5 gate (line 289) defines the purity audit grep as:

```
setTimeout|setInterval|Date\.now|window\.|document\.|navigator\.|invoke\(|@tauri-apps/api
```

`verification-architecture.md §2` (lines 28-30) forbids on each pure-tier row a slightly different and larger set:

```
setTimeout, clearTimeout, Date.now, window, document, navigator, invoke, @tauri-apps/api, $state, $effect
```

The grep at §7 omits `clearTimeout`, `$state`, `$effect` from §2's list, and neither list catches obvious additional impurities the project must guard against:

- `Math.random` (mentioned in §2 prose at line 22 as forbidden but not in either explicit list)
- `performance.now`
- `crypto.randomUUID` / `crypto.getRandomValues`
- `requestAnimationFrame` / `requestIdleCallback`
- `localStorage` / `sessionStorage`
- `fetch` / `XMLHttpRequest`
- `import.meta.env` (vite runtime injection)
- `process.env` / `import.meta`

The §2 prose at line 22 ("does not call ... `Math.random`, `window.*`, `document.*`, `navigator.*`...") is also not enforceable; it only catches `window.foo` not `globalThis.foo` or `self.foo`.

## Why it fails

The Phase 5 grep is the only mechanical enforcement of the purity boundary. Anything not in the regex is invisible to the audit. A pure module could embed `Math.random()` to seed a debounce jitter and Phase 5 would pass green. In strict mode the audit pattern must be (i) consistent with the §2 forbidden lists, and (ii) exhaustive against the standard library surface that defeats determinism.

## Concrete remediation

Replace the §7 grep regex with a single canonical regex maintained beside §2's table, including at minimum: `setTimeout|setInterval|clearTimeout|clearInterval|Date\.now|Date\(|new Date|Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|fetch\(|XMLHttpRequest|invoke\(|@tauri-apps/api|\$state\b|\$effect\b|\$derived\b|import\.meta`. Add a one-line spec note that `editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts` must also pass `tsc` with `noUncheckedIndexedAccess` and the deterministic-by-default tsconfig flags so accidental impurity (e.g. iterating `Object.keys` order) is caught.
