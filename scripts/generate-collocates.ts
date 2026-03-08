/**
 * Generate collocates for vocab words using an LLM.
 *
 * Reads the vocab DB, finds words missing from data/collocates.json,
 * batches them, and asks the LLM for collocates. Saves incrementally.
 *
 * Usage: CLAUDECODE= bun run generate-collocates
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { bootClient, sendPrompt, shutdownClient } from "../server/llm";

const ROOT = join(import.meta.dir, "..");
const COLLOCATES_PATH = join(ROOT, "data", "collocates.json");
const BATCH_SIZE = 50;

interface VocabWord {
  hangul: string;
  name: string;
}

// ─── Load vocab DB ──────────────────────────────────────────────────

function loadVocabWords(): VocabWord[] {
  const defaultPath = join(ROOT, "..", "vibecoded-hangul-fun", "src", "assets", "database", "_database.json");
  const dbPath = process.env.VOCAB_DB || defaultPath;

  const raw = readFileSync(dbPath, "utf-8");
  const db = JSON.parse(raw);
  const words: VocabWord[] = (db.words || [])
    .filter((w: any) => w.hangul)
    .map((w: any) => ({ hangul: w.hangul, name: w.name }));

  // Deduplicate by hangul
  const seen = new Set<string>();
  return words.filter((w) => {
    if (seen.has(w.hangul)) return false;
    seen.add(w.hangul);
    return true;
  });
}

// ─── Load/save collocates ───────────────────────────────────────────

function loadCollocates(): Record<string, string[]> {
  if (!existsSync(COLLOCATES_PATH)) return {};
  try {
    return JSON.parse(readFileSync(COLLOCATES_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveCollocates(collocates: Record<string, string[]>): void {
  const dir = join(ROOT, "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Sort keys for stable diffs
  const sorted: Record<string, string[]> = {};
  for (const key of Object.keys(collocates).sort()) {
    sorted[key] = [...new Set(collocates[key])].sort();
  }
  writeFileSync(COLLOCATES_PATH, JSON.stringify(sorted, null, 2) + "\n");
}

// ─── Prompt & parsing ───────────────────────────────────────────────

function buildPrompt(anchors: VocabWord[], allWords: VocabWord[]): string {
  const vocabLines = allWords.map((w) => `${w.hangul} (${w.name})`).join("\n");
  const anchorLines = anchors.map((a, i) => `${i + 1}. ${a.hangul} (${a.name})`).join("\n");

  return `You are a Korean language teaching assistant helping build a collocate database.

For each anchor word, suggest 3-5 collocate words from the vocabulary list.
Collocates are words that naturally appear together in a Korean SENTENCE.

GOOD collocates (words you'd use together in a sentence):
- 학교 → 학생, 선생님, 가다 (students go to school)
- 노란색 → 원피스, 꽃 (yellow dress, yellow flowers)
- 맛있다 → 음식, 먹다 (delicious food)

BAD collocates (same category — avoid these):
- 노란색 → 주황색, 빨간색 (all just colors)
- 월요일 → 화요일, 수요일 (all just days)
- 사과 → 바나나, 포도 (all just fruits)

Think: what words would a student need to BUILD A SENTENCE with this word?

VOCABULARY LIST (only pick collocates from this list):
<vocab>
${vocabLines}
</vocab>

ANCHOR WORDS:
${anchorLines}

Respond with ONLY numbered lines:
1. anchor_hangul | collocate1, collocate2, collocate3
2. anchor_hangul | collocate1, collocate2, collocate3, collocate4`;
}

function parseResponse(
  text: string,
  anchors: VocabWord[],
  hangulSet: Set<string>
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const anchorHangulSet = new Set(anchors.map((a) => a.hangul));
  const lines = text.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    const match = line.match(/^\d+\.\s*(.+?)\s*\|\s*(.+)/);
    if (!match) {
      if (line.trim()) console.warn(`  skipping unmatched line: ${line.trim()}`);
      continue;
    }

    const anchor = match[1].trim();
    if (!anchorHangulSet.has(anchor)) {
      console.warn(`  unknown anchor: ${anchor}`);
      continue;
    }

    const collocates = match[2]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s !== anchor && hangulSet.has(s));

    if (collocates.length > 0) {
      result[anchor] = collocates;
    }
  }

  return result;
}

// ─── Symmetry pass ──────────────────────────────────────────────────

function enforceSymmetry(collocates: Record<string, string[]>): void {
  for (const [word, partners] of Object.entries(collocates)) {
    for (const partner of partners) {
      if (!collocates[partner]) collocates[partner] = [];
      if (!collocates[partner].includes(word)) {
        collocates[partner].push(word);
      }
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  await bootClient();

  // Load vocab
  const allWords = loadVocabWords();
  const hangulSet = new Set(allWords.map((w) => w.hangul));
  console.log(`Loaded ${allWords.length} vocab words`);

  // Load existing collocates
  const collocates = loadCollocates();
  const existingCount = Object.keys(collocates).length;
  console.log(`Existing collocates: ${existingCount} words`);

  // Find words missing from collocates
  const missing = allWords.filter((w) => !(w.hangul in collocates));
  if (missing.length === 0) {
    console.log("All words have collocates, nothing to do");
    await shutdownClient();
    return;
  }
  console.log(`${missing.length} words need collocates`);

  // Batch and process
  const totalBatches = Math.ceil(missing.length / BATCH_SIZE);
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = missing.slice(i, i + BATCH_SIZE);

    const prompt = buildPrompt(batch, allWords);
    const text = await sendPrompt(prompt, `collocates/batch-${batchNum}`, {
      model: "claude-haiku-4-5-20251001",
      timeout: 300_000,
    });

    const parsed = parseResponse(text, batch, hangulSet);
    const wordCount = Object.keys(parsed).length;
    const collocateCount = Object.values(parsed).reduce((sum, arr) => sum + arr.length, 0);

    // Merge into main map
    for (const [word, partners] of Object.entries(parsed)) {
      if (!collocates[word]) {
        collocates[word] = partners;
      } else {
        collocates[word] = [...new Set([...collocates[word], ...partners])];
      }
    }

    // Enforce symmetry after each batch
    enforceSymmetry(collocates);

    // Save incrementally
    saveCollocates(collocates);

    console.log(`Batch ${batchNum}/${totalBatches}: got ${collocateCount} collocates for ${wordCount} words`);
  }

  // Print summary
  const counts = { zero: 0, low: 0, mid: 0, high: 0 };
  for (const word of allWords) {
    const n = (collocates[word.hangul] || []).length;
    if (n === 0) counts.zero++;
    else if (n <= 2) counts.low++;
    else if (n <= 5) counts.mid++;
    else counts.high++;
  }
  console.log(`\nSummary:`);
  console.log(`  0 collocates: ${counts.zero} words`);
  console.log(`  1-2 collocates: ${counts.low} words`);
  console.log(`  3-5 collocates: ${counts.mid} words`);
  console.log(`  6+ collocates: ${counts.high} words`);
  console.log(`  Total keys: ${Object.keys(collocates).length}`);

  await shutdownClient();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
