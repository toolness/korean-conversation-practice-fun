/** classify — calls /api/llm to classify learner utterance. */

import type { ScriptStep } from "../scenarios/index";
import { buildClassifyPrompt } from "./prompts";
import { stripToHangul } from "../utils/hangul";

async function callLLM(prompt: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
  const data = await res.json();
  return data.text;
}

/**
 * Classify a learner's utterance against the expected step.
 * Returns "MATCH" or a hint string.
 */
export async function classify(
  utterance: string,
  step: ScriptStep,
  history: Array<{ speaker: string; text: string }>,
  learnerSpeaker: string,
  signal?: AbortSignal
): Promise<string> {
  // Cheap exact match: compare hangul-only characters
  if (stripToHangul(utterance) === stripToHangul(step.resolved_text)) {
    return "MATCH";
  }

  const prompt = buildClassifyPrompt(utterance, step, history, learnerSpeaker);

  try {
    const resultText = await callLLM(prompt, signal);

    if (resultText.startsWith("MATCH")) return "MATCH";
    if (resultText.startsWith("HINT:")) return resultText.slice(5).trim();
    if (resultText.startsWith("OFF:")) return resultText.slice(4).trim();

    console.warn("Unexpected classification response:", resultText.slice(0, 100));
    return "Try again — say something closer to the expected response.";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    console.error("Classification error:", err);
    return "Sorry, there was an error. Please try again.";
  }
}
