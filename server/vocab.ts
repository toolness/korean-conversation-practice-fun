/** Vocab data loading and API routes for picture-speaking drill. */

import { Hono } from "hono";
import { join } from "path";
import { readFileSync } from "fs";
interface WordPicture {
  type: "local-image" | "emojis";
  filename?: string;
  emojis?: string;
}

interface VocabWord {
  id: string;
  hangul: string;
  name: string;
  isTranslation: boolean;
  picture: WordPicture | null;
  lastIncorrect?: string;
}

export interface VocabItem {
  id: string;
  hangul: string;
  name: string;
  isTranslation: boolean;
  pictureFilename: string;
  lastIncorrect?: string;
}

let vocabItems: VocabItem[] = [];
let assetsDir = "";

export function loadVocab(): boolean {
  const vocabDataDir = process.env.VOCAB_DATA_DIR;
  if (!vocabDataDir) {
    console.log("VOCAB_DATA_DIR not set — picture-speaking drill disabled");
    return false;
  }

  const dbPath = join(vocabDataDir, "src", "assets", "database", "_database.json");
  assetsDir = join(vocabDataDir, "src", "assets", "database");

  try {
    const raw = readFileSync(dbPath, "utf-8");
    const db = JSON.parse(raw);
    const words: VocabWord[] = db.words || [];

    vocabItems = words
      .filter(
        (w) =>
          w.hangul &&
          w.picture &&
          w.picture.type === "local-image" &&
          w.picture.filename
      )
      .map((w) => ({
        id: w.id,
        hangul: w.hangul,
        name: w.name,
        isTranslation: w.isTranslation,
        pictureFilename: w.picture!.filename!,
        lastIncorrect: w.lastIncorrect,
      }));

    console.log(`Loaded ${vocabItems.length} vocab words with pictures`);
    return true;
  } catch (err) {
    console.error("Failed to load vocab data:", err);
    return false;
  }
}

export function getAllVocabItems(): VocabItem[] {
  return vocabItems;
}

export function getVocabItemById(id: string): VocabItem | undefined {
  return vocabItems.find((v) => v.id === id);
}

export const vocabApp = new Hono();

vocabApp.get("/all", (c) => {
  if (vocabItems.length === 0) return c.json({ error: "Vocab data not loaded" }, 503);
  return c.json({ items: vocabItems });
});

vocabApp.get("/assets/:filename", async (c) => {
  const filename = c.req.param("filename");
  const filePath = join(assetsDir, filename);
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return c.json({ error: "Not found" }, 404);
  }

  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
  };

  return new Response(file, {
    headers: { "Content-Type": mimeTypes[ext] || "application/octet-stream" },
  });
});
