import { join } from "path";
import { tmpdir } from "os";
import { writeFileSync, readFileSync, unlinkSync } from "fs";

const PROJECT_ROOT = join(import.meta.dir, "..");

const MODEL_PATH =
  process.env.WHISPER_MODEL ||
  join(PROJECT_ROOT, "whisper-models", "ggml-large-v3-turbo.bin");

const DEFAULT_PROMPT = "여보세요, 거기 집이지요? 네, 그런데요. 실례지만 누구세요?";

export async function transcribe(
  audioBytes: Uint8Array,
  prompt?: string
): Promise<string> {
  const tmpPath = join(tmpdir(), `whisper_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);

  writeFileSync(tmpPath, audioBytes);

  try {
    const proc = Bun.spawn(
      [
        "whisper-cli",
        "--language", "ko",
        "--model", MODEL_PATH,
        "--file", tmpPath,
        "--output-txt",
        "--no-prints",
        "--prompt", prompt || DEFAULT_PROMPT,
      ],
      { stdout: "pipe", stderr: "pipe" }
    );

    await proc.exited;

    // whisper-cli writes output to {input_file}.txt
    const txtPath = tmpPath + ".txt";
    const text = readFileSync(txtPath, "utf-8").trim();

    try { unlinkSync(txtPath); } catch { /* ignore */ }

    return text;
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
