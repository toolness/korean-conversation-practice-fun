/** Pure prompt builders for the pipeline drill. */

import type { WordSession, ThreadMessage } from "./pipeline-types";

function formatThread(thread: ThreadMessage[]): string {
  const lines: string[] = [];
  for (const msg of thread) {
    switch (msg.kind) {
      case "attempt":
        lines.push(`Student said: "${msg.transcript}"`);
        break;
      case "evaluation":
        lines.push(`Tutor feedback: ${msg.feedback.feedback}`);
        if (msg.feedback.example) {
          lines.push(`Example: ${msg.feedback.example}`);
        }
        break;
      case "user-chat":
        lines.push(`Student asked: "${msg.text}"`);
        break;
      case "assistant-chat":
        lines.push(`Tutor replied: ${msg.text}`);
        break;
    }
  }
  return lines.join("\n");
}

export function buildEvalPrompt(session: WordSession): string {
  const word = session.word;
  const lastAttempt = [...session.thread]
    .reverse()
    .find((m) => m.kind === "attempt");
  const transcript = lastAttempt?.kind === "attempt" ? lastAttempt.transcript : "";

  const hasHistory = session.thread.length > 1; // more than just the latest attempt
  const historySection = hasHistory
    ? `\nConversation history (previous attempts and feedback):\n${formatThread(session.thread.slice(0, -1))}\n`
    : "";

  return `You are a Korean language tutor evaluating a student's spoken sentence.

The student was shown a picture representing: ${word.hangul} (${word.name})
${historySection}
The student's latest attempt: "${transcript}"

Evaluate their sentence:
1. Is it grammatically correct? (particles, conjugation, word order)
2. Does it use the target vocabulary?
3. Brief feedback (1-2 sentences, in English)
4. A natural Korean example sentence using this word

IMPORTANT: The student's input comes through speech-to-text and may contain
transcription errors. Be charitable with phonetically close interpretations.
Focus on structural issues: wrong particles, word order, conjugation, missing
grammar elements.${hasHistory ? "\n\nNote: You've given feedback before on this word. Build on your previous advice rather than repeating it." : ""}

Respond in this exact format:
CORRECT: yes/no
FEEDBACK: ...
EXAMPLE: ...`;
}

export function buildChatPrompt(session: WordSession, userText: string): string {
  const word = session.word;

  return `You are a Korean language tutor helping a student practice making sentences.

The student is working with the word: ${word.hangul} (${word.name})

Conversation so far:
${formatThread(session.thread)}

The student is asking for help: "${userText}"

Give a brief, helpful response in English with Korean examples inline.
Keep it concise (2-3 sentences max). Focus on practical advice they can
immediately apply to their next attempt.`;
}
