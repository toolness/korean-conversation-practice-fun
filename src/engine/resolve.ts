/** resolveScript — calls /api/llm to fill in Korean sentences for script steps. */

import type { Scenario, ScriptStep } from "../scenarios/index";
import { buildResolvePrompt } from "./prompts";

async function callLLM(prompt: string): Promise<string> {
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
  const data = await res.json();
  return data.text;
}

export async function resolveScript(scenario: Scenario): Promise<ScriptStep[]> {
  const script = scenario.conversationScript();
  const prompt = buildResolvePrompt(scenario, script);

  let resultText = await callLLM(prompt);

  // Strip markdown code fences if present
  if (resultText.startsWith("```")) {
    resultText = resultText.includes("\n")
      ? resultText.split("\n").slice(1).join("\n")
      : resultText.slice(3);
    if (resultText.endsWith("```")) {
      resultText = resultText.slice(0, -3).trim();
    }
  }

  // Extract just the JSON array — LLM sometimes appends extra text
  const start = resultText.indexOf("[");
  if (start === -1) throw new Error("No JSON array found in LLM response");

  let depth = 0;
  for (let i = start; i < resultText.length; i++) {
    if (resultText[i] === "[") depth++;
    else if (resultText[i] === "]") {
      depth--;
      if (depth === 0) {
        resultText = resultText.slice(start, i + 1);
        break;
      }
    }
  }

  const sentences: string[] = JSON.parse(resultText);
  if (sentences.length !== script.length) {
    throw new Error(`Sentence count mismatch: got ${sentences.length}, expected ${script.length}`);
  }

  for (let i = 0; i < script.length; i++) {
    script[i].resolved_text = sentences[i];
  }

  return script;
}

// Exported for testing
export { callLLM as _callLLM };
