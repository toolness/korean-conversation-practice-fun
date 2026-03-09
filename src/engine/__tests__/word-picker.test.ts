import { describe, it, expect } from "bun:test";
import { pickNext, type CollocateMap } from "../word-picker";
import type { VocabItem } from "../pipeline-types";

const cow: VocabItem = { id: "w1", hangul: "소", name: "Cow", isTranslation: true, pictureFilename: "cow.webp" };
const mountain: VocabItem = { id: "w2", hangul: "산", name: "Mountain", isTranslation: true, pictureFilename: "mountain.webp" };
const eat: VocabItem = { id: "w3", hangul: "먹다", name: "To eat", isTranslation: true, pictureFilename: "eat.webp" };
const yellow: VocabItem = { id: "w4", hangul: "노란색", name: "Yellow", isTranslation: true, pictureFilename: "yellow.webp" };

const catalog = [cow, mountain, eat, yellow];

const collocates: CollocateMap = {
  "소": ["산", "먹다"],
  "산": ["소"],
};

describe("pickNext", () => {
  it("returns null for empty catalog", () => {
    expect(pickNext([], collocates, [], true)).toBeNull();
  });

  it("easy mode returns array of 1", () => {
    const result = pickNext(catalog, collocates, [], true);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    expect(catalog).toContainEqual(result![0]);
  });

  it("normal mode with collocates returns array of 2", () => {
    // Run multiple times to account for randomness
    let gotPair = false;
    for (let i = 0; i < 20; i++) {
      const result = pickNext(catalog, collocates, [], false);
      expect(result).not.toBeNull();
      if (result!.length === 2) {
        gotPair = true;
        // The pair should be a valid collocate relationship
        const [anchor, partner] = result!;
        const anchorCollocates = collocates[anchor.hangul];
        expect(anchorCollocates).toContain(partner.hangul);
        break;
      }
    }
    expect(gotPair).toBe(true);
  });

  it("falls back to single word when no collocate match exists", () => {
    const lonelyWord: VocabItem = { id: "w5", hangul: "혼자", name: "Alone", isTranslation: true, pictureFilename: "alone.webp" };
    const result = pickNext([lonelyWord], collocates, [], false);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    expect(result![0]).toEqual(lonelyWord);
  });

  it("excludes recent IDs", () => {
    const smallCatalog = [cow, mountain];
    // Exclude cow, should always get mountain in easy mode
    for (let i = 0; i < 10; i++) {
      const result = pickNext(smallCatalog, collocates, ["w1"], true);
      expect(result).not.toBeNull();
      expect(result![0].id).toBe("w2");
    }
  });

  it("falls back when all words are recent", () => {
    const result = pickNext(catalog, collocates, ["w1", "w2", "w3", "w4"], true);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    // Should still pick something even if all are recent
    expect(catalog).toContainEqual(result![0]);
  });

  it("normal mode excludes recent IDs from both anchor and collocate", () => {
    // Only cow and mountain in catalog, cow→산 collocate
    const smallCatalog = [cow, mountain];
    // Exclude mountain — cow can't find a valid collocate partner
    const result = pickNext(smallCatalog, collocates, ["w2"], false);
    expect(result).not.toBeNull();
    // With mountain excluded, cow can't pair, so should fall back to single word (cow)
    expect(result!.length).toBe(1);
    expect(result![0].id).toBe("w1");
  });
});
