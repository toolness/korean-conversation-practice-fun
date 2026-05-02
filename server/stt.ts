import { join } from "path";
import { Subprocess } from "bun";

const PROJECT_ROOT = join(import.meta.dir, "..");

const MODEL_PATH =
  process.env.WHISPER_MODEL ||
  join(PROJECT_ROOT, "whisper-models", "ggml-large-v3-turbo.bin");

const DEFAULT_PROMPT = "여보세요, 거기 집이지요? 네, 그런데요. 실례지만 누구세요?";

let whisperProc: Subprocess | null = null;
let whisperBaseUrl = "";

export async function bootWhisperServer(
  webServerPort: number,
  verbose = false,
  externalUrl?: string,
): Promise<void> {
  if (externalUrl) {
    whisperBaseUrl = externalUrl.replace(/\/$/, "");
    console.log(`Using external whisper-server at ${whisperBaseUrl}`);
  } else {
    const port = webServerPort + 1000;
    whisperBaseUrl = `http://127.0.0.1:${port}`;
    const stdio = verbose ? "inherit" as const : "ignore" as const;
    whisperProc = Bun.spawn(
      [
        "whisper-server",
        "--language", "ko",
        "--model", MODEL_PATH,
        "--port", String(port),
        "--host", "127.0.0.1",
      ],
      { stdout: stdio, stderr: stdio }
    );
  }

  // Poll until the server responds
  const url = `${whisperBaseUrl}/inference`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url);
      if (!externalUrl) console.log(`whisper-server ready at ${whisperBaseUrl}`);
      return;
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error(`whisper-server at ${whisperBaseUrl} did not respond within 10s`);
}

export async function shutdownWhisperServer(): Promise<void> {
  if (whisperProc) {
    whisperProc.kill();
    await whisperProc.exited;
    whisperProc = null;
    console.log("whisper-server stopped");
  }
}

export async function transcribe(
  audioBytes: Uint8Array,
  prompt?: string
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([audioBytes], { type: "audio/wav" }),
    "audio.wav"
  );
  form.append("response_format", "text");
  form.append("prompt", prompt || DEFAULT_PROMPT);

  const res = await fetch(
    `${whisperBaseUrl}/inference`,
    { method: "POST", body: form }
  );

  if (!res.ok) {
    throw new Error(`whisper-server returned ${res.status}: ${await res.text()}`);
  }

  return (await res.text()).trim();
}
