import { Hono } from "hono";
import { join } from "path";
import { writeFileSync } from "fs";
import { bootClient, sendPrompt, shutdownClient } from "./llm";
import { bootWhisperServer, shutdownWhisperServer, transcribe } from "./stt";
import { loadVocab, vocabApp } from "./vocab";

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

app.route("/api/vocab", vocabApp);

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

const USAGE = `\
Usage: bun run server/index.ts [options]

Options:
  --port <n>             Web server port (default: 8000). Whisper-server
                         spawns on port + 1000 unless an external URL is set.
  --whisper-url <url>    Use a pre-existing whisper-server at <url> instead
                         of spawning one. Equivalent to WHISPER_URL env var;
                         the flag wins if both are set.
  --verbose              Stream whisper-server stdout/stderr to the console.
  --help, -h             Show this help and exit.

Environment:
  WHISPER_URL            Same as --whisper-url.
  WHISPER_MODEL          Path to the whisper model file (default:
                         whisper-models/ggml-large-v3-turbo.bin). Ignored
                         when --whisper-url / WHISPER_URL is set.
  VOCAB_DATA_DIR         Path to a Vibe-coded Hangul Fun checkout for the
                         picture-speaking vocab data.`;

function parseArgs(): { port: number; verbose: boolean; whisperUrl?: string } {
  const args = process.argv.slice(2);
  let port = 8000;
  let verbose = false;
  let whisperUrl: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--verbose") {
      verbose = true;
    } else if (args[i] === "--whisper-url" && args[i + 1]) {
      whisperUrl = args[i + 1];
      i++;
    } else {
      console.error(`Unknown argument: ${args[i]}\n`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { port, verbose, whisperUrl };
}

const { port, verbose, whisperUrl } = parseArgs();
const externalWhisperUrl = whisperUrl ?? process.env.WHISPER_URL;

// Boot LLM client, whisper server, and load vocab data, then start server
await bootClient();
await bootWhisperServer(port, verbose, externalWhisperUrl);
loadVocab();

// ─── Static file serving via Bun.serve ──────────────────────────────

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
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
  await shutdownWhisperServer();
  await shutdownClient();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdownWhisperServer();
  await shutdownClient();
  process.exit(0);
});
