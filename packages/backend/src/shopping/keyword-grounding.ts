import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../config.ts';

interface KeywordBank {
  version: number;
  modifiers: string[];
  categoryPhrases: Record<string, string[]>;
  brandPatterns: string[];
  genericPromotionPrefixes: string[];
}

let cachedBank: KeywordBank | null = null;
const suggestionCache = new Map<string, { expiresAt: number; values: string[] }>();

function bank(): KeywordBank {
  cachedBank ??= JSON.parse(readFileSync(path.join(REPO_ROOT, 'data/us-keyword-bank.json'), 'utf8')) as KeywordBank;
  return cachedBank;
}

function normalized(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hasPhrase(haystack: string, phrase: string) {
  const value = normalized(phrase);
  return value.length > 0 && ` ${haystack} `.includes(` ${value} `);
}

export function keywordBankMatches(input: { title: string; category?: string | null; limit?: number }): string[] {
  const data = bank();
  const haystack = normalized(input.title);
  const categoryPhrases = input.category ? data.categoryPhrases[input.category] ?? [] : [];
  const matched = [
    ...data.modifiers.filter(value => hasPhrase(haystack, value)),
    ...categoryPhrases.filter(value => hasPhrase(haystack, value)),
    ...data.brandPatterns.filter(value => hasPhrase(haystack, value)),
  ];
  return [...new Set(matched)].slice(0, Math.max(1, input.limit ?? 12));
}

export function keywordBankProductPhrases(input: { title: string; category?: string | null }): string[] {
  const data = bank();
  const haystack = normalized(input.title);
  const categoryPhrases = input.category ? data.categoryPhrases[input.category] ?? [] : [];
  return [...new Set([
    ...categoryPhrases.filter(value => hasPhrase(haystack, value)),
    ...data.brandPatterns.filter(value => hasPhrase(haystack, value)),
  ])];
}

export function googleAutocompleteQuery(title: string): string {
  return title
    .replace(/\$\s*\d[\d,]*(?:\.\d{1,2})?/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*%\s*(?:off|savings?)?/gi, ' ')
    .replace(/\b(?:deal|deals|sale|clearance|promo|promotion|coupon|expired|reported|listed)\b/gi, ' ')
    .replace(/\b(?:at|from|on)\s+(?:amazon|walmart|target|best buy|costco|woot|home depot|lowes)\b/gi, ' ')
    .replace(/[|·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join(' ')
    .slice(0, 80);
}

export async function googleAutocomplete(rawQuery: string): Promise<string[]> {
  const query = googleAutocompleteQuery(rawQuery);
  if (!query || process.env.NODE_TEST_CONTEXT || process.env.COLLECT_ENABLED === 'false') return [];
  const key = normalized(query);
  const now = Date.now();
  const cached = suggestionCache.get(key);
  if (cached && cached.expiresAt > now) return cached.values;
  try {
    const url = new URL('https://suggestqueries.google.com/complete/search');
    url.searchParams.set('client', 'firefox');
    url.searchParams.set('gl', 'us');
    url.searchParams.set('hl', 'en');
    url.searchParams.set('q', query);
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 Savlume keyword grounding' },
      signal: AbortSignal.timeout(1500),
      redirect: 'error',
    });
    if (!response.ok) return [];
    const payload = await response.json() as unknown;
    const values = Array.isArray(payload) && Array.isArray(payload[1])
      ? payload[1].filter((value): value is string => typeof value === 'string').map(value => value.replace(/\s+/g, ' ').trim().slice(0, 90)).filter(Boolean).slice(0, 5)
      : [];
    suggestionCache.set(key, { expiresAt: now + 24 * 3600_000, values });
    return values;
  } catch {
    suggestionCache.set(key, { expiresAt: now + 30 * 60_000, values: [] });
    return [];
  }
}

export async function searchGrounding(input: { title: string; category?: string | null }) {
  const suggestions = await googleAutocomplete(input.title);
  return {
    googleSuggestions: suggestions,
    localKeywordMatches: keywordBankMatches(input),
  };
}
