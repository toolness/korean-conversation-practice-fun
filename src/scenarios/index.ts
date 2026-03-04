/** Scenario framework — types, registry, helpers. */

export const STT_CHARITY_ADDENDUM = `\
IMPORTANT: The learner's input comes through speech-to-text (whisper)
and may contain transcription errors. Korean STT often confuses:
- Similar vowels: ㅐ/ㅔ, ㅗ/ㅜ, ㅓ/ㅏ
- Aspirated/tense consonants: ㄱ/ㄲ/ㅋ, ㄷ/ㄸ/ㅌ, ㅂ/ㅃ/ㅍ
- Final consonants (batchim): ㄱ/ㅋ, ㄴ/ㄹ, etc.

Be CHARITABLE when interpreting their speech. If what they said is
phonetically close to a correct response, accept it and continue
the conversation. Only use the correct() tool for clear structural
mistakes: wrong particles, wrong word order, wrong conjugation,
missing grammar elements, or wrong vocabulary. Never correct what
is likely just a transcription error.

CRITICAL: Only use grammar and vocabulary from the examples and
vocabulary list provided below. Do not introduce grammar or words
from higher levels, even if they would make the conversation more
natural. The learner is practicing specific patterns from their
textbook.

HINTS: When using the correct() tool, write hints in ENGLISH with
Korean examples inline. The learner is a beginner and cannot read
long Korean sentences. For example: "When someone tells you their
friend isn't available, you should acknowledge with '네, 알겠습니다'
(I understand) before saying goodbye."`;

export interface ScriptStep {
  speaker: string; // "A" or "B"
  description: string;
  resolved_text: string;
}

export function makeStep(speaker: string, description: string): ScriptStep {
  return { speaker, description, resolved_text: "" };
}

export interface Briefing {
  id: string;
  unit: number;
  title: string;
  grammar: string[];
  context: Record<string, string>;
  key_vocab?: [string, string][];
  start_hint?: string;
  auto_start?: boolean;
  scratchpad?: boolean;
}

export interface ScenarioContext {
  caller_name?: string;
  friend_name?: string;
  activity_dict?: string;
  activity_progressive?: string;
  activity_english?: string;
  available?: boolean;
  [key: string]: unknown;
}

export interface Scenario {
  id: string;
  unit: number;
  title: string;
  grammar: string[];
  role: string;
  context: ScenarioContext;
  exampleConversations: [string, string][][];

  roles(): string[];
  roleDisplayTitle(): string;
  setup(): void;
  conversationScript(): ScriptStep[];
  learnerSpeaker(): string;
  vocabSection(): string;
  formatExamples(): string;
  briefing(): Briefing;
}

// ─── Registry ───────────────────────────────────────────────────────

export { register, getScenario, listScenarios, ensureScenariosLoaded } from "./registry";
