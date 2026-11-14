export interface MemoryCacheEntry<T> {
  freshUntil: number;
  staleUntil: number;
  value: T;
}

interface SavlumeMemoryCache {
  shoppingFeeds: Map<string, MemoryCacheEntry<unknown>>;
  shoppingFeedPending: Map<string, Promise<unknown>>;
  publicApiFeeds: Map<string, MemoryCacheEntry<unknown>>;
  publicApiFeedPending: Map<string, Promise<unknown>>;
  bestPages: Map<string, MemoryCacheEntry<unknown>>;
  bestPagePending: Map<string, Promise<unknown>>;
  seoCatalogs: Map<string, MemoryCacheEntry<unknown>>;
  seoCatalogPending: Map<string, Promise<unknown>>;
}

const root = globalThis as typeof globalThis & { __savlumeCache?: SavlumeMemoryCache };
export const savlumeCache = root.__savlumeCache ??= {
  shoppingFeeds: new Map(), shoppingFeedPending: new Map(),
  publicApiFeeds: new Map(), publicApiFeedPending: new Map(),
  bestPages: new Map(), bestPagePending: new Map(),
  seoCatalogs: new Map(), seoCatalogPending: new Map(),
};

/** Serve fresh entries immediately and stale entries while a single background refresh runs. */
export async function staleWhileRevalidate<T>(opts: {
  cache: Map<string, MemoryCacheEntry<unknown>>;
  pending: Map<string, Promise<unknown>>;
  key: string;
  load: () => Promise<T>;
  freshMs: number;
  staleMs: number;
  maxEntries?: number;
}): Promise<T> {
  const now = Date.now();
  const hit = opts.cache.get(opts.key) as MemoryCacheEntry<T> | undefined;
  if (hit && hit.freshUntil > now) {
    opts.cache.delete(opts.key);
    opts.cache.set(opts.key, hit as MemoryCacheEntry<unknown>);
    return hit.value;
  }

  const refresh = () => {
    const running = opts.pending.get(opts.key) as Promise<T> | undefined;
    if (running) return running;
    const promise = opts.load().then((value) => {
      const stored: MemoryCacheEntry<T> = { freshUntil: Date.now() + opts.freshMs, staleUntil: Date.now() + opts.freshMs + opts.staleMs, value };
      while (opts.cache.size >= (opts.maxEntries ?? 128)) opts.cache.delete(opts.cache.keys().next().value!);
      opts.cache.delete(opts.key);
      opts.cache.set(opts.key, stored as MemoryCacheEntry<unknown>);
      return value;
    }).finally(() => opts.pending.delete(opts.key));
    opts.pending.set(opts.key, promise);
    return promise;
  };

  if (hit && hit.staleUntil > now) {
    if (!opts.pending.has(opts.key)) void refresh().catch(() => {});
    return hit.value;
  }
  return refresh();
}
