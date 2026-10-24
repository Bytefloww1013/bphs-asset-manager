/** A value made on first use, not as its file loads: the modules are installed only once every file has loaded (`main.tsx`). */
export function once<T>(make: () => T): () => T {
  let made: { value: T } | undefined
  return () => (made ??= { value: make() }).value
}
