import { Hono } from "hono";
import { join } from "path";
import { writeFileSync } from "fs";
import { bootClient, sendPrompt, shutdownClient } from "./llm";
import { transcribe } from "./stt";

const app = new Hono();
const DIST_DIR = join(import.meta.dir, "..", "dist");

// ─── API routes ─────────────────────────────────────────────────────

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.post("/api/llm", async (c) => {
  const { prompt } = await c.req.json<{ prompt: string }>();
  if (!prompt) return c.json({ error: "prompt required" }, 400);
  try {
    const text = await sendPrompt(prompt, "api/llm");
    return c.json({ text });
  } catch (err) {
    console.error("LLM error:", err);
    return c.json({ error: "LLM request failed" }, 500);
  }
});

app.post("/api/transcribe", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");
  const prompt = formData.get("prompt") as string | null;

  if (!file || !(file instanceof File)) {
    return c.json({ error: "file required" }, 400);
  }

  const audioBytes = new Uint8Array(await file.arrayBuffer());

  // Save for debugging
  const debugPath = join(import.meta.dir, "..", "last_utterance.wav");
  writeFileSync(debugPath, audioBytes);
  console.log(`Saved ${audioBytes.length} bytes to ${debugPath}`);

  try {
    const text = await transcribe(audioBytes, prompt || undefined);
    return c.json({ text });
  } catch (err) {
    console.error("Transcription error:", err);
    return c.json({ error: "Transcription failed" }, 500);
  }
});

// ─── CLI ────────────────────────────────────────────────────────────

function parseArgs(): { port: number } {
  const args = process.argv.slice(2);
  let port = 8000;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    }
  }
  return { port };
}

const { port } = parseArgs();

// Boot LLM client then start server
await bootClient();

// ─── Static file serving via Bun.serve ──────────────────────────────

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function mimeType(path: string): string {
  const ext = path.slice(path.lastIndexOf("."));
  return MIME[ext] || "application/octet-stream";
}

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // API routes go through Hono
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(req);
    }

    // Static files from dist/
    const fileName = url.pathname === "/" ? "index.html" : url.pathname;
    const filePath = join(DIST_DIR, fileName);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file, {
        headers: { "Content-Type": mimeType(filePath) },
      });
    }

    // SPA fallback
    return new Response(Bun.file(join(DIST_DIR, "index.html")), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`Server running at http://localhost:${server.port}`);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await shutdownClient();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdownClient();
  process.exit(0);
});
