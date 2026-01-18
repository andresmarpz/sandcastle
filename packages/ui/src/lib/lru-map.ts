/**
 * LRU (Least Recently Used) Map implementation.
 * Automatically evicts the oldest entries when capacity is exceeded.
 */
export class LRUMap<K, V> {
  private cache = new Map<K, V>()
  private readonly maxSize: number

  constructor(maxSize: number) {
    if (maxSize < 1) {
      throw new Error("LRUMap maxSize must be at least 1")
    }
    this.maxSize = maxSize
  }

  /**
   * Get a value by key, marking it as recently used.
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  /**
   * Set a value, evicting the oldest entry if over capacity.
   * Returns the evicted key if one was evicted.
   */
  set(key: K, value: V): K | undefined {
    // If key exists, delete it first to refresh order
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }

    this.cache.set(key, value)

    // Evict oldest if over capacity
    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
        return oldestKey
      }
    }

    return undefined
  }

  /**
   * Delete an entry by key.
   */
  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  /**
   * Check if a key exists.
   */
  has(key: K): boolean {
    return this.cache.has(key)
  }

  /**
   * Get the current size.
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Get all keys (oldest first).
   */
  keys(): IterableIterator<K> {
    return this.cache.keys()
  }

  /**
   * Get all values (oldest first).
   */
  values(): IterableIterator<V> {
    return this.cache.values()
  }

  /**
   * Get all entries (oldest first).
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries()
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Iterate over entries (oldest first).
   */
  forEach(callback: (value: V, key: K, map: LRUMap<K, V>) => void): void {
    this.cache.forEach((value, key) => callback(value, key, this))
  }
}
