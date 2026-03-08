import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  CompanionPool,
  parseCompanionResponse,
  CACHE_VERSION,
  type CompanionGroup,
} from "../companion-pool";
import type { VocabItem } from "../vocab";

function fakeItem(hangul: string, id?: string): VocabItem {
  return {
    id: id ?? hangul,
    hangul,
    name: `name_${hangul}`,
    isTranslation: false,
    pictureFilename: `${hangul}.webp`,
  };
}

const cow = fakeItem("소", "w1");
const mountain = fakeItem("산", "w2");
const eat = fakeItem("먹다", "w3");
const yellow = fakeItem("노란색", "w4");
const dress = fakeItem("원피스", "w5");
const house = fakeItem("집", "w6");

const allItems = [cow, mountain, eat, yellow, dress, house];

describe("parseCompanionResponse", () => {
  it("valid input returns correct pairs", () => {
    const anchors = [cow, yellow];
    const text = "1. 산\n2. 원피스";
    const groups = parseCompanionResponse(text, anchors, allItems);
    expect(groups).toEqual([
      { words: [cow, mountain] },
      { words: [yellow, dress] },
    ]);
  });

  it("missing vocab items are skipped", () => {
    const anchors = [cow, yellow];
    const text = "1. 없는단어\n2. 원피스";
    const groups = parseCompanionResponse(text, anchors, allItems);
    expect(groups).toEqual([{ words: [yellow, dress] }]);
  });

  it("companion same as anchor is skipped", () => {
    const anchors = [cow, yellow];
    const text = "1. 소\n2. 원피스";
    const groups = parseCompanionResponse(text, anchors, allItems);
    expect(groups).toEqual([{ words: [yellow, dress] }]);
  });

  it("malformed lines are skipped", () => {
    const anchors = [cow, yellow, mountain];
    const text = "1. 산\ngarbage line\n3. 집";
    const groups = parseCompanionResponse(text, anchors, allItems);
    // Line 1 matches anchor[0]=cow → companion 산
    // Line 2 "garbage line" doesn't match /^\d+\.\s*/ → skipped but still consumes anchor[1]
    // Line 3 matches anchor[2]=mountain → companion 집
    expect(groups).toEqual([
      { words: [cow, mountain] },
      { words: [mountain, house] },
    ]);
  });
});

describe("CompanionPool", () => {
  it("take returns groups and shrinks pool", async () => {
    const mockGenerate = mock(() =>
      Promise.resolve([
        { words: [cow, mountain] },
        { words: [yellow, dress] },
        { words: [eat, house] },
      ])
    );
    const pool = new CompanionPool({
      generate: mockGenerate,
      getVocabItems: () => allItems,
      targetSize: 3,
      lowWaterMark: 1,
      batchSize: 3,
    });
    pool.warmUp();
    await settled();

    expect(pool.size()).toBe(3);
    const taken = pool.take(2);
    expect(taken.length).toBe(2);
    expect(pool.size()).toBe(1);
  });

  it("empty pool returns empty array", () => {
    const pool = new CompanionPool({
      generate: mock(() => Promise.resolve([])),
      getVocabItems: () => allItems,
      targetSize: 5,
      lowWaterMark: 2,
      batchSize: 5,
    });
    // Don't warm up — pool stays empty
    const taken = pool.take(10);
    expect(taken).toEqual([]);
  });

  it("triggers refill at low water mark", async () => {
    let callCount = 0;
    const mockGenerate = mock(() => {
      callCount++;
      return Promise.resolve([
        { words: [cow, mountain] },
        { words: [yellow, dress] },
        { words: [eat, house] },
      ]);
    });
    const pool = new CompanionPool({
      generate: mockGenerate,
      getVocabItems: () => allItems,
      targetSize: 6,
      lowWaterMark: 4,
      batchSize: 5,
    });
    pool.warmUp();
    await settled();

    // Pool should be at 6 (2 batches of 3 to reach targetSize 6)
    const initialCalls = callCount;
    expect(pool.size()).toBe(6);

    // Take 3 → pool drops to 3, which is < lowWaterMark 4
    pool.take(3);
    await settled();

    // Should have triggered more generate calls
    expect(callCount).toBeGreaterThan(initialCalls);
    expect(pool.size()).toBeGreaterThanOrEqual(4);
  });

  it("no concurrent refills", async () => {
    let activeCount = 0;
    let maxConcurrent = 0;

    const slowGenerate = mock(async () => {
      activeCount++;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      await new Promise((r) => setTimeout(r, 10));
      activeCount--;
      return [{ words: [cow, mountain] }] as CompanionGroup[];
    });

    const pool = new CompanionPool({
      generate: slowGenerate,
      getVocabItems: () => allItems,
      targetSize: 3,
      lowWaterMark: 1,
      batchSize: 5,
    });

    // Trigger two refills concurrently
    pool.maybeRefill();
    pool.maybeRefill();
    await settled();

    expect(maxConcurrent).toBe(1);
  });

  it("loops until target reached", async () => {
    let callCount = 0;
    const mockGenerate = mock(() => {
      callCount++;
      // Return 2 groups per call
      return Promise.resolve([
        { words: [cow, mountain] },
        { words: [yellow, dress] },
      ]);
    });
    const pool = new CompanionPool({
      generate: mockGenerate,
      getVocabItems: () => allItems,
      targetSize: 5,
      lowWaterMark: 1,
      batchSize: 5,
    });
    pool.warmUp();
    await settled();

    // 2 per call, target 5 → needs 3 calls (2+2+2=6 >= 5)
    expect(callCount).toBe(3);
    expect(pool.size()).toBeGreaterThanOrEqual(5);
  });

  it("generate error is caught and refilling flag reset", async () => {
    const mockGenerate = mock(() => Promise.reject(new Error("LLM down")));
    const pool = new CompanionPool({
      generate: mockGenerate,
      getVocabItems: () => allItems,
      targetSize: 5,
      lowWaterMark: 1,
      batchSize: 5,
    });
    pool.warmUp();
    await settled();

    // Pool should be empty but not crashed
    expect(pool.size()).toBe(0);
    expect(pool.isRefilling()).toBe(false);
  });
});

describe("CompanionPool disk cache", () => {
  let tmpDir: string;
  let cachePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "companion-pool-test-"));
    cachePath = join(tmpDir, "companion_pool.json");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads from disk with matching version", () => {
    const groups = [{ words: [cow, mountain] }, { words: [yellow, dress] }];
    writeFileSync(cachePath, JSON.stringify({ version: CACHE_VERSION, groups }));

    const pool = new CompanionPool({
      generate: mock(() => Promise.resolve([])),
      getVocabItems: () => allItems,
      cachePath,
      targetSize: 5,
      lowWaterMark: 1,
    });

    expect(pool.size()).toBe(2);
  });

  it("ignores cache with stale version", () => {
    const groups = [{ words: [cow, mountain] }];
    writeFileSync(cachePath, JSON.stringify({ version: CACHE_VERSION + 1, groups }));

    const pool = new CompanionPool({
      generate: mock(() => Promise.resolve([])),
      getVocabItems: () => allItems,
      cachePath,
      targetSize: 5,
      lowWaterMark: 1,
    });

    expect(pool.size()).toBe(0);
  });

  it("no error when cache file does not exist", () => {
    const pool = new CompanionPool({
      generate: mock(() => Promise.resolve([])),
      getVocabItems: () => allItems,
      cachePath: join(tmpDir, "nonexistent.json"),
      targetSize: 5,
      lowWaterMark: 1,
    });

    expect(pool.size()).toBe(0);
  });

  it("saves to disk after refill", async () => {
    const mockGenerate = mock(() =>
      Promise.resolve([
        { words: [cow, mountain] },
        { words: [yellow, dress] },
      ])
    );
    const pool = new CompanionPool({
      generate: mockGenerate,
      getVocabItems: () => allItems,
      cachePath,
      targetSize: 2,
      lowWaterMark: 1,
      batchSize: 5,
    });
    pool.warmUp();
    await settled();

    expect(existsSync(cachePath)).toBe(true);
    const data = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(data.version).toBe(CACHE_VERSION);
    expect(data.groups.length).toBe(2);
    expect(data.groups[0].words[0].hangul).toBe("소");
  });
});

/** Wait for pending microtasks/timers to flush. */
function settled(): Promise<void> {
  return new Promise((r) => setTimeout(r, 50));
}
