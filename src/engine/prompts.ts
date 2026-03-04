/** Prompt templates for LLM calls. */

import { STT_CHARITY_ADDENDUM, type Scenario, type ScriptStep } from "../scenarios/index";

export function buildResolvePrompt(scenario: Scenario, script: ScriptStep[]): string {
  const c = scenario.context;

  const stepsDesc = script
    .map((s, i) => `  Step ${i + 1} (Speaker ${s.speaker}): ${s.description}`)
    .join("\n");

  const examples = scenario.formatExamples();
  const vocab = scenario.vocabSection();

  return `\
You produce Korean dialogue sentences. Respond ONLY with a JSON array of strings.

You are generating Korean dialogue for a language practice app.

CONTEXT:
  Caller name: ${c.caller_name || ""}
  Friend name: ${c.friend_name || ""}
  Friend available: ${c.available ?? ""}
  Activity (if unavailable): ${c.activity_progressive || "N/A"}

Speaker A = the caller
Speaker B = the person answering the phone at the friend's house

SCRIPT STEPS (produce one Korean sentence per step):
${stepsDesc}

${examples}

${vocab}

INSTRUCTIONS:
- Produce exactly one Korean sentence per step
- Follow the textbook example patterns closely — same grammar, same vocabulary level
- Use the correct particles and conjugations for the given names
- Keep sentences short and natural, matching the examples
- Respond with a JSON array of strings, one per step, in order

Example response format: ["여보세요. 거기 유나 씨 집이지요?", "네, 그런데요. 실례지만 누구세요?", ...]`;
}

export function buildClassifyPrompt(
  utterance: string,
  step: ScriptStep,
  history: Array<{ speaker: string; text: string }>,
  learnerSpeaker: string
): string {
  let historyStr = "";
  if (history.length > 0) {
    const lines = history.map(({ speaker, text }) => {
      const label = speaker === learnerSpeaker ? "Learner" : "Partner";
      return `  ${label}: ${text}`;
    });
    historyStr = "Conversation so far:\n" + lines.join("\n") + "\n\n";
  }

  return `\
You are a Korean language utterance classifier. Respond only with MATCH, HINT: <hint>, or OFF: <redirect>.

You are evaluating a Korean language learner's spoken response.

${historyStr}The learner was expected to say something like: "${step.resolved_text}"
(Step description: ${step.description})

The learner actually said: "${utterance}"

${STT_CHARITY_ADDENDUM}

TASK: Decide if the learner's utterance is close enough to the expected response.
- MATCH: if close enough (same meaning, correct grammar patterns, right vocabulary). \
Accept likely STT transcription errors (phonetically similar sounds).
- HINT: if there's a genuine grammar or vocabulary mistake (wrong particle, word order, \
missing pattern, wrong vocabulary). Write a brief English hint (1-2 sentences) with Korean \
examples inline. Do NOT give away the full answer — use a Socratic approach.
- OFF: if completely wrong or unrelated. Briefly redirect the learner.

Respond with exactly one of:
MATCH
HINT: <your hint>
OFF: <your redirect>`;
}
