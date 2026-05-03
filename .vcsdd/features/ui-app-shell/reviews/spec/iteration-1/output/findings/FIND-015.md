# FIND-015: PROP-006 Tier-3 audit cannot detect runtime-injected styles, defeating REQ-019

- **id**: FIND-015
- **severity**: major
- **dimension**: verification_readiness

## citation
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:62` (PROP-006 Tier 3, "スタイル監査")
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:97-100` (PROP-006 Tier 3 details: "Svelte コンポーネントの `<style>` ブロックから hex カラーを抽出し...")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:362-368` (REQ-019 normative: "No hex literal SHALL appear in component source files unless it is the exact value defined in DESIGN.md.")

## description
PROP-006's audit script (`scripts/audit-design-tokens.ts` per line 98) scans Svelte `<style>` blocks for hex literals and px values. This misses:
1. **Inline `style` attributes**: `<div style={`background:${userColor}`}>...` — runtime-built strings escape the `<style>`-block grep.
2. **Tailwind-style class composition** (if the project later adopts arbitrary-value Tailwind, e.g. `bg-[#abcdef]`): values are inside class names, not `<style>` blocks.
3. **CSS-in-JS imports** from third-party libraries that inject runtime stylesheets.
4. **JavaScript `Element.style.setProperty('--accent', '#abcdef')`** at runtime.
5. **Imported CSS modules** outside `*.svelte` files (e.g. `app.css`, design-tokens.css) — the script's scope is "Svelte component `<style>` blocks", which by construction misses non-Svelte CSS files.
6. **Color values declared as JS constants** consumed by inline styles or props (`const ACCENT = '#abcdef'; <Header bg={ACCENT}/>`).

The strict-mode review checklist asks: "Is the strict-mode style audit (PROP-006 token compliance) actually verifiable?" The honest answer here is: only against pure `<style>` blocks. REQ-019's "no hex literal SHALL appear in component source files" is stronger than what PROP-006 actually verifies.

## suggestedRemediation
Either:
- (A) Expand PROP-006's scope: scan all `*.svelte`, `*.ts`, `*.css` files inside `promptnotes/src/lib/ui/app-shell/` for hex regex `#[0-9a-fA-F]{3,8}\b` and `rgba?\(...\)` and px-numeric. Document the false-positive policy (e.g. SVG path fills are exempt only inside `assets/`).
- (B) Narrow REQ-019 to match what PROP-006 verifies ("no hex literal in `<style>` blocks") and add a separate REQ covering inline-style hex literals.

Specify the audit's scope in `verification-architecture.md` with explicit file globs, exempt directories, and false-positive policy.
