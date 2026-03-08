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

function formatWords(session: WordSession): string {
  return session.words.map((w) => `${w.hangul} (${w.name})`).join(", ");
}

export function buildEvalPrompt(session: WordSession): string {
  const wordsDesc = formatWords(session);
  const lastAttempt = [...session.thread]
    .reverse()
    .find((m) => m.kind === "attempt");
  const transcript = lastAttempt?.kind === "attempt" ? lastAttempt.transcript : "";

  const hasHistory = session.thread.length > 1; // more than just the latest attempt
  const historySection = hasHistory
    ? `\nConversation history (previous attempts and feedback):\n${formatThread(session.thread.slice(0, -1))}\n`
    : "";

  const plural = session.words.length > 1;

  return `You are a Korean language tutor evaluating a student's spoken sentence.

The student was shown ${plural ? "pictures" : "a picture"} representing: ${wordsDesc}
${historySection}
The student's latest attempt: "${transcript}"

Evaluate their sentence:
1. Is it grammatically correct? (particles, conjugation, word order)
2. Does it use the target ${plural ? "vocabulary words" : "vocabulary"}?
3. Brief feedback (1-2 sentences, in English). If the sentence is correct, include an English translation so the student can verify they said what they intended.
4. A natural Korean example sentence using ${plural ? "these words" : "this word"}

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
  const wordsDesc = formatWords(session);
  const plural = session.words.length > 1;

  return `You are a Korean language tutor helping a student practice making sentences.

The student is working with the ${plural ? "words" : "word"}: ${wordsDesc}

Conversation so far:
${formatThread(session.thread)}

The student is asking for help: "${userText}"

Give a brief, helpful response in English with Korean examples inline.
Keep it concise (2-3 sentences max). Focus on practical advice they can
immediately apply to their next attempt.`;
}
