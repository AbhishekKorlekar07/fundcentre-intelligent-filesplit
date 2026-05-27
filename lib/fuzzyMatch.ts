/**
 * Normalise a string for fuzzy comparison: lowercase, strip punctuation,
 * collapse whitespace. "AD Fund 2, L.P." -> "ad fund 2 lp"
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/** Standard Levenshtein distance, iterative two-row implementation. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Pick the best fuzzy match for `candidate` from `pool`. Returns null when
 * nothing crosses the similarity threshold.
 *
 * Threshold scales with length: short strings need exact match, longer
 * strings tolerate a couple of typos.
 */
/** Compact form: normalized + all whitespace removed. Lets "AD Fund 2 L P" match "adfund2 lp". */
function compact(s: string): string {
  return normalize(s).replace(/\s+/g, '');
}

/**
 * Compare a candidate against a pool item under spaced, compact, and
 * token-subset forms; return the smallest effective distance. The compact
 * form catches whitespace/punctuation drift ("ADFund2 LP" vs "AD Fund 2,
 * L.P."). The token-subset form catches abbreviation ("New York Pension"
 * vs "New York Pension Fund") by counting only tokens that are missing.
 */
function bestDistance(candidate: string, poolName: string): number {
  const aSpaced = normalize(candidate);
  const bSpaced = normalize(poolName);
  const aCompact = compact(candidate);
  const bCompact = compact(poolName);
  const lev = Math.min(levenshtein(aSpaced, bSpaced), levenshtein(aCompact, bCompact));

  const aTokens = aSpaced.split(' ').filter(Boolean);
  const bTokens = bSpaced.split(' ').filter(Boolean);
  // If every token of the shorter side appears (as a token) in the longer,
  // the effective distance is the count of leftover tokens — so "new york
  // pension" vs "new york pension fund" scores 1 instead of 4.
  const [shorter, longer] = aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
  const isSubset = shorter.every((t) => longer.includes(t));
  const tokenDistance = isSubset ? longer.length - shorter.length : Infinity;

  return Math.min(lev, tokenDistance);
}

export function bestFuzzyMatch<T extends { name: string }>(
  candidate: string,
  pool: T[]
): T | null {
  if (!candidate) return null;
  if (!normalize(candidate)) return null;

  let best: { item: T; distance: number } | null = null;
  for (const item of pool) {
    const d = bestDistance(candidate, item.name);
    if (best === null || d < best.distance) {
      best = { item, distance: d };
    }
  }
  if (!best) return null;

  const longer = Math.max(compact(candidate).length, compact(best.item.name).length);
  // Allow 0 typos for <=4 chars, ~20% edit distance otherwise (capped at 4).
  const tolerance = longer <= 4 ? 0 : Math.min(4, Math.floor(longer * 0.2));
  return best.distance <= tolerance ? best.item : null;
}
