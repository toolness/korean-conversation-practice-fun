import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(import.meta.dir, "..", ".llm_cache");

function cachePath(prompt: string): string {
  const hash = new Bun.CryptoHasher("sha256").update(prompt).digest("hex");
  return join(CACHE_DIR, hash);
}

export function cacheGet(prompt: string): string | null {
  const path = cachePath(prompt);
  if (existsSync(path)) {
    return readFileSync(path, "utf-8");
  }
  return null;
}

export function cachePut(prompt: string, response: string): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  writeFileSync(cachePath(prompt), response);
}

export function cacheDelete(prompt: string): void {
  const path = cachePath(prompt);
  try {
    unlinkSync(path);
  } catch {
    // file didn't exist, that's fine
  }
}
