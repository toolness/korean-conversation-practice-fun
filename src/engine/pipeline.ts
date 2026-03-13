/** Pure state machine for the picture-speaking pipeline drill. */

import type {
  PipelineState,
  PipelineEvent,
  PipelineEffect,
  WordSession,
  VocabItem,
  Feedback,
  Activity,
} from "./pipeline-types";
import { pickNext } from "./word-picker";
import collocatesData from "../../data/collocates.json";

export interface TransitionResult {
  state: PipelineState;
  effects: PipelineEffect[];
}

export function initialState(easyMode = true): PipelineState {
  return {
    activity: { kind: "loading" },
    reviewQueue: [],
    backgroundEvals: [],
    vocabCatalog: [],
    recentWordIds: [],
    easyMode,
    nextAbortId: 1,
    error: null,
  };
}

let _sessionCounter = 0;
export function makeSessionId(): string {
  return `session_${++_sessionCounter}`;
}
/** Reset counter for tests. */
export function _resetSessionCounter(): void {
  _sessionCounter = 0;
}

function makeSession(words: VocabItem[], sessionId?: string): WordSession {
  return { sessionId: sessionId || makeSessionId(), words, thread: [] };
}

const RECENT_CAP = 10;

function appendRecent(recentWordIds: string[], words: VocabItem[]): string[] {
  const updated = [...recentWordIds, ...words.map((w) => w.id)];
  return updated.slice(-RECENT_CAP);
}

/** Pick the next activity. Uses pickNext for word selection. */
function advanceActivity(
  state: PipelineState,
  effects: PipelineEffect[]
): { activity: Activity; recentWordIds: string[] } {
  if (state.reviewQueue.length > 0) {
    return { activity: { kind: "reviewing", session: state.reviewQueue[0] }, recentWordIds: state.recentWordIds };
  }
  if (state.vocabCatalog.length > 0) {
    const words = pickNext(state.vocabCatalog, collocatesData, state.recentWordIds, state.easyMode);
    if (words) {
      return {
        activity: { kind: "idle", session: makeSession(words) },
        recentWordIds: appendRecent(state.recentWordIds, words),
      };
    }
  }
  effects.push({ type: "LOAD_VOCAB" });
  return { activity: { kind: "loading" }, recentWordIds: state.recentWordIds };
}

function shiftReviewQueue(state: PipelineState): PipelineState {
  if (
    state.activity.kind === "reviewing" &&
    state.reviewQueue.length > 0 &&
    state.reviewQueue[0].sessionId === state.activity.session.sessionId
  ) {
    return { ...state, reviewQueue: state.reviewQueue.slice(1) };
  }
  return state;
}

export function transition(
  state: PipelineState,
  event: PipelineEvent
): TransitionResult {
  const effects: PipelineEffect[] = [];

  switch (event.type) {
    case "INIT": {
      effects.push({ type: "LOAD_VOCAB" });
      return { state: { ...state, activity: { kind: "loading" }, error: null }, effects };
    }

    case "VOCAB_LOADED": {
      const catalog = event.items;
      if (catalog.length === 0) {
        return {
          state: { ...state, error: "No vocabulary words available" },
          effects,
        };
      }
      let nextState = { ...state, vocabCatalog: catalog, error: null };
      if (nextState.activity.kind === "loading") {
        const { activity, recentWordIds } = advanceActivity(nextState, effects);
        nextState = { ...nextState, activity, recentWordIds };
        nextState = shiftReviewQueue(nextState);
      }
      return { state: nextState, effects };
    }

    case "VOCAB_LOAD_FAILED": {
      return { state: { ...state, error: event.error }, effects };
    }

    case "SET_EASY_MODE": {
      let nextState = { ...state, easyMode: event.easyMode };
      if (nextState.activity.kind === "idle") {
        const { activity, recentWordIds } = advanceActivity(nextState, effects);
        nextState = { ...nextState, activity, recentWordIds };
        nextState = shiftReviewQueue(nextState);
      }
      return { state: nextState, effects };
    }

    case "RECORD_START": {
      if (state.activity.kind !== "idle" && state.activity.kind !== "reviewing") return { state, effects };
      effects.push({ type: "START_RECORDING" });
      return {
        state: { ...state, activity: { kind: "recording", session: state.activity.session }, error: null },
        effects,
      };
    }

    case "RECORD_STOP": {
      if (state.activity.kind !== "recording") return { state, effects };
      const session = state.activity.session;
      const sttHint = session.words.map((w) => w.hangul).join(", ") + ". 여보세요, 거기 집이지요? 네, 그런데요.";
      effects.push({ type: "STOP_RECORDING_AND_TRANSCRIBE", sttHint });
      return {
        state: { ...state, activity: { kind: "transcribing", session } },
        effects,
      };
    }

    case "RECORD_CANCEL": {
      if (state.activity.kind !== "recording") return { state, effects };
      effects.push({ type: "CANCEL_RECORDING" });
      return {
        state: { ...state, activity: { kind: "idle", session: state.activity.session }, error: null },
        effects,
      };
    }

    case "STT_RESULT": {
      if (state.activity.kind !== "transcribing") return { state, effects };
      return {
        state: {
          ...state,
          activity: {
            kind: "confirming",
            session: state.activity.session,
            transcript: event.transcript,
          },
        },
        effects,
      };
    }

    case "STT_FAILED": {
      if (state.activity.kind !== "transcribing") return { state, effects };
      return {
        state: {
          ...state,
          activity: { kind: "idle", session: state.activity.session },
          error: event.error,
        },
        effects,
      };
    }

    case "DEV_SUBMIT": {
      if (state.activity.kind !== "idle") return { state, effects };
      return {
        state: {
          ...state,
          activity: {
            kind: "confirming",
            session: state.activity.session,
            transcript: event.text,
          },
        },
        effects,
      };
    }

    case "CONFIRM_TRANSCRIPT": {
      if (state.activity.kind !== "confirming") return { state, effects };
      const { session, transcript } = state.activity;

      const updatedSession: WordSession = {
        ...session,
        thread: [...session.thread, { kind: "attempt", transcript }],
      };

      // Cancel any prior background eval for same session (retry case)
      const priorEvals = state.backgroundEvals.filter(
        (e) => e.sessionId === session.sessionId
      );
      for (const e of priorEvals) {
        effects.push({ type: "ABORT_EVAL", abortId: e.abortId });
      }
      const remainingEvals = state.backgroundEvals.filter(
        (e) => e.sessionId !== session.sessionId
      );

      const abortId = `abort_${state.nextAbortId}`;
      effects.push({ type: "EVALUATE", session: updatedSession, abortId });
      const newBgEval = { sessionId: session.sessionId, abortId, session: updatedSession };

      let nextState: PipelineState = {
        ...state,
        backgroundEvals: [...remainingEvals, newBgEval],
        nextAbortId: state.nextAbortId + 1,
      };

      const { activity, recentWordIds } = advanceActivity(nextState, effects);
      nextState = { ...nextState, activity, recentWordIds };
      nextState = shiftReviewQueue(nextState);

      return { state: nextState, effects };
    }

    case "REJECT_TRANSCRIPT": {
      if (state.activity.kind !== "confirming") return { state, effects };
      return {
        state: {
          ...state,
          activity: { kind: "idle", session: state.activity.session },
        },
        effects,
      };
    }

    case "EVAL_COMPLETE": {
      const bgEval = state.backgroundEvals.find(
        (e) => e.sessionId === event.sessionId
      );
      if (!bgEval) return { state, effects };

      const remainingEvals = state.backgroundEvals.filter(
        (e) => e.abortId !== bgEval.abortId
      );

      const evalMessage = { kind: "evaluation" as const, feedback: event.feedback };

      if (
        (state.activity.kind === "reviewing" || state.activity.kind === "chatting") &&
        state.activity.session.sessionId === event.sessionId
      ) {
        const updatedSession: WordSession = {
          ...state.activity.session,
          thread: [...state.activity.session.thread, evalMessage],
        };
        return {
          state: {
            ...state,
            activity: { ...state.activity, session: updatedSession },
            backgroundEvals: remainingEvals,
          },
          effects,
        };
      }

      const completedSession: WordSession = {
        ...bgEval.session,
        thread: [...bgEval.session.thread, evalMessage],
      };

      const newQueue = [...state.reviewQueue, completedSession];

      if (state.activity.kind === "loading") {
        return {
          state: {
            ...state,
            activity: { kind: "reviewing", session: newQueue[0] },
            reviewQueue: newQueue.slice(1),
            backgroundEvals: remainingEvals,
          },
          effects,
        };
      }

      return {
        state: {
          ...state,
          reviewQueue: newQueue,
          backgroundEvals: remainingEvals,
        },
        effects,
      };
    }

    case "EVAL_FAILED": {
      const syntheticFeedback: Feedback = {
        correct: false,
        feedback: event.error,
        example: "",
      };
      return transition(state, {
        type: "EVAL_COMPLETE",
        sessionId: event.sessionId,
        feedback: syntheticFeedback,
      });
    }

    case "REVIEW_NEXT": {
      if (state.activity.kind !== "reviewing" && state.activity.kind !== "idle") return { state, effects };
      let nextState = { ...state };
      const { activity, recentWordIds } = advanceActivity(nextState, effects);
      nextState = { ...nextState, activity, recentWordIds };
      nextState = shiftReviewQueue(nextState);
      return { state: nextState, effects };
    }

    case "REVIEW_RETRY": {
      if (state.activity.kind !== "reviewing") return { state, effects };
      return {
        state: {
          ...state,
          activity: { kind: "idle", session: state.activity.session },
        },
        effects,
      };
    }

    case "CHAT_SEND": {
      if (state.activity.kind !== "reviewing") return { state, effects };
      const session = state.activity.session;
      const updatedSession: WordSession = {
        ...session,
        thread: [...session.thread, { kind: "user-chat", text: event.text }],
      };
      const abortId = `abort_${state.nextAbortId}`;
      effects.push({ type: "SEND_CHAT", session: updatedSession, text: event.text, abortId });
      return {
        state: {
          ...state,
          activity: { kind: "chatting", session: updatedSession },
          nextAbortId: state.nextAbortId + 1,
        },
        effects,
      };
    }

    case "CHAT_RESPONSE": {
      if (state.activity.kind !== "chatting") return { state, effects };
      if (state.activity.session.sessionId !== event.sessionId) return { state, effects };
      const session = state.activity.session;
      const updatedSession: WordSession = {
        ...session,
        thread: [...session.thread, { kind: "assistant-chat", text: event.text }],
      };
      return {
        state: {
          ...state,
          activity: { kind: "reviewing", session: updatedSession },
        },
        effects,
      };
    }

    case "CHAT_FAILED": {
      if (state.activity.kind !== "chatting") return { state, effects };
      if (state.activity.session.sessionId !== event.sessionId) return { state, effects };
      const session = state.activity.session;
      const updatedSession: WordSession = {
        ...session,
        thread: [
          ...session.thread,
          { kind: "assistant-chat", text: `Error: ${event.error}` },
        ],
      };
      return {
        state: {
          ...state,
          activity: { kind: "reviewing", session: updatedSession },
        },
        effects,
      };
    }

    case "END": {
      for (const e of state.backgroundEvals) {
        effects.push({ type: "ABORT_EVAL", abortId: e.abortId });
      }
      return {
        state: { ...state, activity: { kind: "finished" }, backgroundEvals: [] },
        effects,
      };
    }
  }

  return { state, effects };
}
