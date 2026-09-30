export type Fetched<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };
