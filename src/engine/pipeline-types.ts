/** Types for the picture-speaking pipeline state machine. */

// ─── Vocabulary ─────────────────────────────────────────────────────

export interface VocabItem {
  id: string;
  hangul: string;
  name: string;
  isTranslation: boolean;
  pictureFilename: string;
}

export interface Feedback {
  correct: boolean;
  feedback: string;
  example: string;
  raw?: string;
}

export interface WordGroup {
  words: VocabItem[];
}

// ─── Thread Messages ────────────────────────────────────────────────

export type ThreadMessage =
  | { kind: "attempt"; transcript: string }
  | { kind: "evaluation"; feedback: Feedback }
  | { kind: "user-chat"; text: string }
  | { kind: "assistant-chat"; text: string };

// ─── Word Session ───────────────────────────────────────────────────

export interface WordSession {
  sessionId: string;
  words: VocabItem[];
  thread: ThreadMessage[];
}

// ─── Activity: What the user is currently doing ─────────────────────

export type Activity =
  | { kind: "loading" }
  | { kind: "idle"; session: WordSession }
  | { kind: "recording"; session: WordSession }
  | { kind: "transcribing"; session: WordSession }
  | { kind: "confirming"; session: WordSession; transcript: string }
  | { kind: "reviewing"; session: WordSession }
  | { kind: "chatting"; session: WordSession }
  | { kind: "finished" };

// ─── Background Work ────────────────────────────────────────────────

export interface BackgroundEval {
  sessionId: string;
  abortId: string;
  session: WordSession;
}

// ─── Top-Level State ────────────────────────────────────────────────

export interface PipelineState {
  activity: Activity;
  reviewQueue: WordSession[];
  backgroundEvals: BackgroundEval[];
  wordPool: VocabItem[];
  groupPool: WordGroup[];
  easyMode: boolean;
  nextAbortId: number;
  error: string | null;
}

// ─── Events ─────────────────────────────────────────────────────────

export type PipelineEvent =
  | { type: "INIT" }
  | { type: "WORDS_LOADED"; words: VocabItem[] }
  | { type: "WORDS_LOAD_FAILED"; error: string }
  | { type: "GROUPS_LOADED"; groups: WordGroup[] }
  | { type: "GROUPS_LOAD_FAILED"; error: string }
  | { type: "SET_EASY_MODE"; easyMode: boolean }
  | { type: "RECORD_START" }
  | { type: "RECORD_STOP" }
  | { type: "RECORD_CANCEL" }
  | { type: "STT_RESULT"; transcript: string }
  | { type: "STT_FAILED"; error: string }
  | { type: "DEV_SUBMIT"; text: string }
  | { type: "CONFIRM_TRANSCRIPT" }
  | { type: "REJECT_TRANSCRIPT" }
  | { type: "EVAL_COMPLETE"; sessionId: string; feedback: Feedback }
  | { type: "EVAL_FAILED"; sessionId: string; error: string }
  | { type: "REVIEW_NEXT" }
  | { type: "REVIEW_RETRY" }
  | { type: "CHAT_SEND"; text: string }
  | { type: "CHAT_RESPONSE"; sessionId: string; text: string }
  | { type: "CHAT_FAILED"; sessionId: string; error: string }
  | { type: "END" };

// ─── Effects ────────────────────────────────────────────────────────

export type PipelineEffect =
  | { type: "FETCH_WORDS"; count: number }
  | { type: "START_RECORDING" }
  | { type: "STOP_RECORDING_AND_TRANSCRIBE"; sttHint: string }
  | { type: "CANCEL_RECORDING" }
  | { type: "EVALUATE"; session: WordSession; abortId: string }
  | { type: "ABORT_EVAL"; abortId: string }
  | { type: "SEND_CHAT"; session: WordSession; text: string; abortId: string };
