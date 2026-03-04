import {
  query,
  type Options,
  type SDKAssistantMessage,
  type SDKResultMessage,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { cacheGet, cachePut } from "./cache";
import { Mutex } from "./mutex";

const LLM_OPTIONS: Options = {
  model: "claude-sonnet-4-6",
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
  tools: [],
  maxTurns: 1,
};

const mutex = new Mutex();
const LLM_TIMEOUT = 30_000; // ms
const LOG_PROMPTS = !!process.env.LOG_PROMPTS;

export async function bootClient(): Promise<void> {
  delete process.env.CLAUDECODE;
  console.log("boot: Claude Agent SDK ready (stateless query mode)");
}

export async function shutdownClient(): Promise<void> {
  // No persistent client to disconnect in the new SDK
}

export async function sendPrompt(prompt: string, label: string): Promise<string> {
  // Check cache before acquiring lock
  const cached = cacheGet(prompt);
  if (cached !== null) {
    console.log(`${label}: cache hit (${cached.length} chars)`);
    return cached;
  }

  return mutex.run(async () => {
    // Double-check cache inside lock
    const cached2 = cacheGet(prompt);
    if (cached2 !== null) {
      console.log(`${label}: cache hit (${cached2.length} chars)`);
      return cached2;
    }

    const t0 = performance.now();
    console.log(`${label}: sending prompt (${prompt.length} chars)`);
    if (LOG_PROMPTS) {
      console.log(`${label} prompt:\n${prompt}`);
    }

    try {
      const result = await Promise.race([
        doQuery(prompt, label, t0),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("LLM timeout")), LLM_TIMEOUT)
        ),
      ]);
      return result;
    } catch (err) {
      if (err instanceof Error && err.message === "LLM timeout") {
        console.error(`${label}: timed out after ${LLM_TIMEOUT / 1000}s`);
      }
      throw err;
    }
  });
}

async function doQuery(prompt: string, label: string, t0: number): Promise<string> {
  const stream = query({ prompt, options: LLM_OPTIONS });

  let resultText = "";
  let firstToken: number | null = null;

  for await (const message of stream) {
    if (message.type === "assistant") {
      const assistantMsg = message as SDKAssistantMessage;
      // Extract text from the BetaMessage content blocks
      for (const block of assistantMsg.message.content) {
        if (block.type === "text") {
          if (firstToken === null) {
            firstToken = performance.now();
            console.log(`${label}: first token in ${((firstToken - t0) / 1000).toFixed(1)}s`);
          }
          resultText += block.text;
        }
      }
    } else if (message.type === "result") {
      const resultMsg = message as SDKResultMessage;
      if (resultMsg.subtype === "success") {
        console.log(`${label}: usage=${JSON.stringify(resultMsg.usage)}`);
        // The result field has the final text too — use it if we didn't get streaming content
        if (!resultText && "result" in resultMsg) {
          resultText = resultMsg.result;
        }
      }
    }
  }

  const tDone = performance.now();
  resultText = resultText.trim();
  console.log(`${label}: done in ${((tDone - t0) / 1000).toFixed(1)}s — ${resultText.slice(0, 80)}`);
  cachePut(prompt, resultText);
  return resultText;
}
