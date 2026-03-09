/** Pure word selection with collocate pairing. */

import type { VocabItem } from "./pipeline-types";

export type CollocateMap = Record<string, string[]>;

let hangulIndex: Map<string, VocabItem> | null = null;
let lastCatalog: VocabItem[] | null = null;

function getHangulIndex(catalog: VocabItem[]): Map<string, VocabItem> {
  if (hangulIndex && lastCatalog === catalog) return hangulIndex;
  hangulIndex = new Map();
  for (const item of catalog) {
    hangulIndex.set(item.hangul, item);
  }
  lastCatalog = catalog;
  return hangulIndex;
}

function pickRandomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomWord(catalog: VocabItem[], excludeIds: Set<string>): VocabItem | null {
  const candidates = catalog.filter((w) => !excludeIds.has(w.id));
  return candidates.length > 0 ? pickRandomFrom(candidates) : null;
}

function pickPair(
  catalog: VocabItem[],
  collocates: CollocateMap,
  excludeIds: Set<string>
): VocabItem[] | null {
  const index = getHangulIndex(catalog);

  // Anchors: words that have collocates
  const anchors = catalog.filter(
    (w) => !excludeIds.has(w.id) && collocates[w.hangul]?.length > 0
  );
  if (anchors.length === 0) return null;

  // Shuffle anchors and try to find a valid pair
  const shuffled = [...anchors].sort(() => Math.random() - 0.5);
  for (const anchor of shuffled) {
    const collocateHanguls = collocates[anchor.hangul];
    // Filter to collocates that exist in catalog and aren't excluded
    const validCollocates = collocateHanguls
      .map((h) => index.get(h))
      .filter((item): item is VocabItem => item != null && item.id !== anchor.id && !excludeIds.has(item.id));
    if (validCollocates.length > 0) {
      return [anchor, pickRandomFrom(validCollocates)];
    }
  }
  return null;
}

/**
 * Pick the next word(s) for the drill.
 * Easy mode: 1 random word. Normal mode: collocate pair (falls back to single).
 * Returns null if catalog is empty.
 */
export function pickNext(
  catalog: VocabItem[],
  collocates: CollocateMap,
  recentIds: string[],
  easyMode: boolean
): VocabItem[] | null {
  if (catalog.length === 0) return null;
  const excludeIds = new Set(recentIds);

  if (easyMode) {
    const word = pickRandomWord(catalog, excludeIds);
    return word ? [word] : [pickRandomFrom(catalog)];
  }

  const pair = pickPair(catalog, collocates, excludeIds);
  if (pair) return pair;

  // Fall back to single word
  const word = pickRandomWord(catalog, excludeIds);
  return word ? [word] : [pickRandomFrom(catalog)];
}
