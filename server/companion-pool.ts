/** Server-side pool of pre-generated companion word pairs. */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { VocabItem } from "./vocab";
import { sendPrompt } from "./llm";

export const CACHE_VERSION = 1;

export interface CompanionGroup {
  words: VocabItem[];
}

export type GenerateFn = (
  anchors: VocabItem[],
  allItems: VocabItem[]
) => Promise<CompanionGroup[]>;

/** Parse the numbered-list LLM response into companion groups. Pure logic, no I/O. */
export function parseCompanionResponse(
  text: string,
  anchors: VocabItem[],
  allItems: VocabItem[]
): CompanionGroup[] {
  const groups: CompanionGroup[] = [];
  const lines = text.split("\n").filter((l) => l.trim());
  for (let i = 0; i < lines.length && i < anchors.length; i++) {
    const match = lines[i].match(/^\d+\.\s*(.+)/);
    if (!match) continue;
    const companionHangul = match[1].trim();
    const companion = allItems.find((v) => v.hangul === companionHangul);
    if (companion && companion.id !== anchors[i].id) {
      groups.push({ words: [anchors[i], companion] });
    }
  }
  return groups;
}

/** Real generate function that calls the LLM via sendPrompt. */
export async function generateCompanionGroups(
  anchors: VocabItem[],
  allItems: VocabItem[]
): Promise<CompanionGroup[]> {
  const allWords = allItems.map((w) => `${w.hangul} (${w.name})`).join("\n");
  const anchorList = anchors
    .map((a, i) => `${i + 1}. ${a.hangul} (${a.name})`)
    .join("\n");

  const prompt = `You are a Korean language teaching assistant. Given a vocabulary list and a set of anchor words, pick one companion word for each anchor. The companion should pair naturally with the anchor so a student can construct a sentence using both words together (e.g. "yellow" + "dress", "big" + "house", "to eat" + "rice").

FULL VOCABULARY LIST:
${allWords}

ANCHOR WORDS (pick one companion for each from the vocabulary list above):
${anchorList}

Rules:
- The companion MUST be a different word from the anchor
- The companion MUST exist in the vocabulary list above
- Pick companions that create natural, useful pairings for Korean sentence practice
- Vary the types of pairings (adjective+noun, verb+noun, etc.)

Respond with ONLY numbered lines in this exact format (hangul only, no English):
1. companion_hangul
2. companion_hangul
...`;

  const text = await sendPrompt(prompt, "companion-pool/generate", {
    model: "claude-haiku-4-5-20251001",
    timeout: 90_000,
  });
  return parseCompanionResponse(text, anchors, allItems);
}

export class CompanionPool {
  private pool: CompanionGroup[] = [];
  private refilling = false;
  private readonly targetSize: number;
  private readonly lowWaterMark: number;
  private readonly batchSize: number;
  private readonly generate: GenerateFn;
  private readonly getVocabItems: () => VocabItem[];
  private readonly cachePath: string | null;

  constructor(opts: {
    generate: GenerateFn;
    getVocabItems: () => VocabItem[];
    targetSize?: number;
    lowWaterMark?: number;
    batchSize?: number;
    cachePath?: string;
  }) {
    this.generate = opts.generate;
    this.getVocabItems = opts.getVocabItems;
    this.targetSize = opts.targetSize ?? 50;
    this.lowWaterMark = opts.lowWaterMark ?? 15;
    this.batchSize = opts.batchSize ?? 25;
    this.cachePath = opts.cachePath ?? null;

    this._loadFromDisk();
  }

  /** Synchronously drain up to `count` groups. Triggers background refill if low. */
  take(count: number): CompanionGroup[] {
    const groups = this.pool.splice(0, count);
    this.maybeRefill();
    return groups;
  }

  /** Current pool size. */
  size(): number {
    return this.pool.length;
  }

  /** Whether a refill is currently in progress. */
  isRefilling(): boolean {
    return this.refilling;
  }

  /** Start background refill. Called at startup and after take(). */
  maybeRefill(): void {
    if (this.refilling) return;
    if (this.pool.length >= this.lowWaterMark) return;

    const allItems = this.getVocabItems();
    if (allItems.length === 0) return;

    this.refilling = true;
    console.log(`companions: pool at ${this.pool.length}, refilling...`);
    this._refillLoop(allItems);
  }

  private async _refillLoop(allItems: VocabItem[]): Promise<void> {
    try {
      while (this.pool.length < this.targetSize) {
        const anchors = this._pickRandom(allItems, this.batchSize);
        const groups = await this.generate(anchors, allItems);
        if (groups.length === 0) {
          console.log("companions: generate returned 0 groups, stopping refill");
          break;
        }
        this.pool.push(...groups);
        console.log(
          `companions: pool now ${this.pool.length} (added ${groups.length})`
        );
        this._saveToDisk();
      }
    } catch (err) {
      console.error("companions: refill failed:", err);
    } finally {
      this.refilling = false;
    }
  }

  /** Fire-and-forget startup. */
  warmUp(): void {
    this.maybeRefill();
  }

  private _loadFromDisk(): void {
    if (!this.cachePath) return;
    try {
      if (!existsSync(this.cachePath)) return;
      const raw = readFileSync(this.cachePath, "utf-8");
      const data = JSON.parse(raw);
      if (data.version !== CACHE_VERSION) {
        console.log(`companions: cache version mismatch (got ${data.version}, want ${CACHE_VERSION}), ignoring`);
        return;
      }
      if (Array.isArray(data.groups) && data.groups.length > 0) {
        this.pool = data.groups;
        console.log(`companions: loaded ${this.pool.length} groups from cache`);
      }
    } catch (err) {
      console.error("companions: failed to load cache:", err);
    }
  }

  private _saveToDisk(): void {
    if (!this.cachePath) return;
    try {
      const dir = dirname(this.cachePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(
        this.cachePath,
        JSON.stringify({ version: CACHE_VERSION, groups: this.pool })
      );
    } catch (err) {
      console.error("companions: failed to save cache:", err);
    }
  }

  private _pickRandom(items: VocabItem[], count: number): VocabItem[] {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }
}
