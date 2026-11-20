/** Pending-write registry: everything that must be saved before closing or switching workspaces. */
type Flusher = () => Promise<void>
const flushers = new Set<Flusher>()

export function registerFlusher(fn: Flusher): () => void {
  flushers.add(fn)
  return () => flushers.delete(fn)
}

export async function flushAll(): Promise<void> {
  await Promise.all([...flushers].map((fn) => fn().catch((err) => console.error('[flush]', err))))
}
