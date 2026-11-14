import { SITE } from '@aihot/industry/site';
import { guardedFetch, type GuardedFetchOptions, type GuardedResponse } from './http-fetch.ts';

export interface RobotsRule {
  allow: boolean;
  path: string;
  regex: RegExp;
  specificity: number;
}

export interface RobotsPolicy {
  rules: RobotsRule[];
  crawlDelayMs: number;
  blocked: boolean;
}

type RobotsCache = { expiresAt: number; promise: Promise<RobotsPolicy> };
const robotsCache = new Map<string, RobotsCache>();
const hostTails = new Map<string, Promise<void>>();
const nextHostRequest = new Map<string, number>();
const hostBackoffCount = new Map<string, number>();

export const DEFAULT_HOST_INTERVAL_MS = 1800;
const ROBOTS_TTL_MS = 6 * 60 * 60 * 1000;
const ERROR_RETRY_MS = 60_000;

export class RobotsDeniedError extends Error {
  constructor(url: string) {
    super(`Robots.txt disallows ${new URL(url).origin}${new URL(url).pathname}`);
    this.name = 'RobotsDeniedError';
  }
}

export interface CrawlerFetchOptions extends GuardedFetchOptions {
  minIntervalMs?: number;
}

function ruleRegex(path: string) {
  const anchored = path.endsWith('$');
  const body = anchored ? path.slice(0, -1) : path;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp('^' + escaped + (anchored ? '$' : ''));
}

export function parseRobots(text: string, userAgent: string): RobotsPolicy {
  const groups: Array<{ agents: string[]; rules: RobotsRule[]; delay: number }> = [];
  let current = { agents: [] as string[], rules: [] as RobotsRule[], delay: 0 };
  const flush = () => {
    if (current.agents.length) groups.push(current);
    current = { agents: [], rules: [], delay: 0 };
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#', 1)[0]!.trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      if (current.rules.length) flush();
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current.agents.length) continue;

    if ((key === 'allow' || key === 'disallow') && value) {
      current.rules.push({
        allow: key === 'allow',
        path: value,
        regex: ruleRegex(value),
        specificity: value.replaceAll('*', '').replace(/\$$/, '').length
      });
    } else if (key === 'crawl-delay' && /^\d+(?:\.\d+)?$/.test(value)) {
      current.delay = Math.max(current.delay, Math.min(60_000, Number(value) * 1000));
    }
  }
  flush();

  const ua = userAgent.toLowerCase();
  const exact = groups.filter((group) => group.agents.some((agent) => agent !== '*' && ua.includes(agent)));
  const chosen = exact.length
    ? exact.filter((group) => group.agents.some((agent) => agent !== '*' && ua.includes(agent)))
    : groups.filter((group) => group.agents.includes('*'));
  const rules = chosen.flatMap((group) => group.rules);
  const crawlDelayMs = Math.max(0, ...chosen.map((group) => group.delay));
  return { rules, crawlDelayMs, blocked: false };
}

async function robotsFor(url: URL): Promise<RobotsPolicy> {
  const key = url.origin;
  const now = Date.now();
  const cached = robotsCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = (async () => {
    try {
      const response = await guardedFetch(new URL('/robots.txt', key).href, {
        timeoutMs: 8000,
        maxBytes: 512_000,
        route: 'egress'
      });
      // RFC 9309: 4xx (except 429) indicates no disallowed rules.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return { rules: [], crawlDelayMs: 0, blocked: false };
      }
      if (response.status >= 400) return { rules: [], crawlDelayMs: 0, blocked: true };
      return parseRobots(response.text(), SITE.crawlerName);
    } catch {
      return { rules: [], crawlDelayMs: 0, blocked: true };
    }
  })();

  const entry = { expiresAt: now + ROBOTS_TTL_MS, promise };
  robotsCache.set(key, entry);
  void promise.then((policy) => {
    if (policy.blocked) entry.expiresAt = Date.now() + ERROR_RETRY_MS;
  });
  return promise;
}

export function robotsAllows(url: string, policy: RobotsPolicy) {
  if (policy.blocked) return false;
  const u = new URL(url);
  const target = u.pathname + u.search;
  const matches = policy.rules
    .filter((rule) => rule.regex.test(target))
    .sort((a, b) => b.specificity - a.specificity);
  if (!matches.length) return true;
  const specificity = matches[0]!.specificity;
  return matches.filter((rule) => rule.specificity === specificity).some((rule) => rule.allow);
}

export async function crawlerRobotsAllows(url: string) {
  try {
    const target = new URL(url);
    return robotsAllows(target.href, await robotsFor(target));
  } catch {
    return false;
  }
}

/**
 * Calculates a smooth, domain-specific base crawl interval to prevent rate-limiting and IP bans.
 * High-sensitivity retail and aggregator domains receive wider intervals.
 */
export function getDomainBaseInterval(hostname: string, customMin?: number, robotsDelay?: number): number {
  const host = hostname.toLowerCase();
  let base = DEFAULT_HOST_INTERVAL_MS;

  // Major retail giants with strict anti-bot systems
  if (/(?:^|\.)(?:amazon\.[a-z.]+|amzn\.to|media-amazon\.com)$/i.test(host)) {
    base = 3500;
  } else if (/(?:^|\.)(?:walmart\.com)$/i.test(host)) {
    base = 3500;
  } else if (/(?:^|\.)(?:bestbuy\.com)$/i.test(host)) {
    base = 3000;
  } else if (/(?:^|\.)(?:target\.com)$/i.test(host)) {
    base = 3000;
  } else if (/(?:^|\.)(?:slickdeals\.net)$/i.test(host)) {
    base = 3000;
  } else if (/(?:^|\.)(?:dealnews\.com|bensbargains\.com|woot\.com|dansdeals\.com|thekrazycouponlady\.com)$/i.test(host)) {
    base = 2800;
  } else if (
    /(?:^|\.)(?:theinventory\.com|mashable\.com|tomshardware\.com|arstechnica\.com|gizmodo\.com|gamespot\.com|zdnet\.com|theverge\.com|tomsguide\.com|cnet\.com|9to5mac\.com|9to5toys\.com)$/i.test(host)
  ) {
    base = 2200;
  }

  if (customMin !== undefined && customMin > base) base = customMin;
  if (robotsDelay !== undefined && robotsDelay > base) base = robotsDelay;
  return base;
}

/**
 * Paces requests to the same host with genuine quiet intervals between completion of request N
 * and start of request N+1, randomized jitter to eliminate mechanical fingerprints, and
 * exponential backoff upon 429/503/403 or network failure.
 */
async function paced<T>(host: string, delayMs: number, minIntervalMs: number, work: () => Promise<T>): Promise<T> {
  const previous = hostTails.get(host) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate, () => gate);
  hostTails.set(host, tail);
  await previous.catch(() => {});

  try {
    const now = Date.now();
    const targetTime = nextHostRequest.get(host) ?? 0;
    const wait = Math.max(0, targetTime - now);
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }

    let result: T;
    try {
      result = await work();
    } catch (err) {
      const streak = (hostBackoffCount.get(host) ?? 0) + 1;
      hostBackoffCount.set(host, streak);
      const penalty = Math.min(180_000, 15_000 * streak + Math.floor(Math.random() * 8_000));
      nextHostRequest.set(host, Date.now() + penalty);
      throw err;
    }

    const baseInterval = getDomainBaseInterval(host, minIntervalMs, delayMs);
    const jitter = 150 + Math.floor(Math.random() * 750);
    let quietMs = baseInterval + jitter;

    if (result && typeof (result as any).status === 'number') {
      const status = (result as any).status as number;
      const headers = (result as any).headers as Headers | undefined;

      if (status === 429) {
        const streak = (hostBackoffCount.get(host) ?? 0) + 1;
        hostBackoffCount.set(host, streak);
        let retrySec = 45 * streak;
        const retryHeader = headers?.get?.('retry-after');
        if (retryHeader) {
          const parsed = Number(retryHeader);
          if (Number.isFinite(parsed) && parsed > 0) {
            retrySec = Math.min(300, Math.max(15, parsed));
          } else {
            const date = Date.parse(retryHeader);
            if (Number.isFinite(date)) {
              retrySec = Math.min(300, Math.max(15, Math.ceil((date - Date.now()) / 1000)));
            }
          }
        }
        quietMs = retrySec * 1000 + Math.floor(Math.random() * 5000);
      } else if (status === 503 || status === 403) {
        const streak = (hostBackoffCount.get(host) ?? 0) + 1;
        hostBackoffCount.set(host, streak);
        const backoffSec = Math.min(120, 25 * streak);
        quietMs = backoffSec * 1000 + Math.floor(Math.random() * 5000);
      } else if (status >= 200 && status < 400) {
        hostBackoffCount.delete(host);
      }
    } else {
      hostBackoffCount.delete(host);
    }

    // Measure the quiet interval from when this request finished
    nextHostRequest.set(host, Date.now() + quietMs);
    return result;
  } finally {
    release();
    if (hostTails.get(host) === tail) hostTails.delete(host);
  }
}

/** Fetches crawler pages only when the site's robots rules allow them and paces requests smoothly per host. */
export async function crawlerFetch(input: string, opts: CrawlerFetchOptions = {}): Promise<GuardedResponse> {
  const route = opts.route ?? 'egress';
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = input;

  for (let hop = 0; ; hop++) {
    const target = new URL(current);
    const policy = await robotsFor(target);
    if (!robotsAllows(target.href, policy)) throw new RobotsDeniedError(target.href);

    const { minIntervalMs = DEFAULT_HOST_INTERVAL_MS, ...fetchOptions } = opts;
    const response = await paced(target.hostname, policy.crawlDelayMs, minIntervalMs, () =>
      guardedFetch(target.href, { ...fetchOptions, route, redirect: 'manual', maxRedirects: 0 })
    );

    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return response;
    if (opts.redirect === 'manual') return response;
    if (hop >= maxRedirects) throw new Error(`Too many redirects for ${input}`);

    const next = new URL(location, target);
    if (
      next.origin !== target.origin &&
      (opts.body !== undefined ||
        Object.keys(opts.headers ?? {}).some((key) =>
          /^(?:authorization|proxy-authorization|cookie|x-api-key)$/i.test(key)
        ))
    ) {
      throw new Error('Authenticated requests cannot redirect to a different origin');
    }
    current = next.href;
  }
}
