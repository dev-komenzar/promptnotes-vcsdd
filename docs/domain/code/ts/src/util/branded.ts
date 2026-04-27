// Brand 型ユーティリティ。DMMF Simple 型（newtype）の TS 表現。
// Smart Constructor を経由しない限り原始型から代入できない。

declare const __brand: unique symbol;
export type Brand<T, K extends string> = T & { readonly [__brand]: K };
