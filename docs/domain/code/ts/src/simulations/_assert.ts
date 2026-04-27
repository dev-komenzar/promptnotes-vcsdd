// Phase 11 simulations — 型レベル検証ユーティリティ
//
// vitest 等のランタイムテストフレームワークは導入しない。
// 「シナリオが Phase 10 の型で組み立てられること」を tsc --noEmit で検証する。

/** 値が `T` 型を満たすことをコンパイル時に強制する。 */
export const assertType = <T>(value: T): T => value;

/** 2 つの型が同一であることを表す型レベル等価判定。 */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
    ? true
    : false;

/** `T` が `true` であることを保証する型レベル expect。 */
export type Expect<T extends true> = T;

/** `kind` discriminator を引数に narrowing するヘルパー。 */
export const assertKind =
  <K extends string>(expected: K) =>
  <T extends { readonly kind: string }>(value: T): T & { readonly kind: K } => {
    if (value.kind !== expected) {
      throw new Error(
        `[simulation] expected kind=${expected}, got kind=${value.kind}`,
      );
    }
    return value as T & { readonly kind: K };
  };
