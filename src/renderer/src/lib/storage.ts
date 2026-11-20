/** localStorage wrappers for per-viewer UI conveniences; failures are ignored. */
export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`axistree:${key}`)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`axistree:${key}`, JSON.stringify(value))
  } catch {
    // storage unavailable: preference simply is not remembered
  }
}
