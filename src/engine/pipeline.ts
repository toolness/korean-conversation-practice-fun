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

export interface TransitionResult {
  state: PipelineState;
  effects: PipelineEffect[];
}

export function initialState(): PipelineState {
  return {
    activity: { kind: "loading" },
    reviewQueue: [],
    backgroundEvals: [],
    wordPool: [],
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

function makeSession(word: VocabItem, sessionId?: string): WordSession {
  return { sessionId: sessionId || makeSessionId(), word, thread: [] };
}

/** Pick the next activity after sending an item to background eval. */
function advanceActivity(
  state: PipelineState,
  effects: PipelineEffect[]
): Activity {
  if (state.reviewQueue.length > 0) {
    return { kind: "reviewing", session: state.reviewQueue[0] };
  }
  if (state.wordPool.length > 0) {
    return { kind: "idle", session: makeSession(state.wordPool[0]) };
  }
  effects.push({ type: "FETCH_WORDS", count: 5 });
  return { kind: "loading" };
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

function shiftWordPool(state: PipelineState): PipelineState {
  if (
    state.activity.kind === "idle" &&
    state.wordPool.length > 0 &&
    state.wordPool[0].id === state.activity.session.word.id
  ) {
    return { ...state, wordPool: state.wordPool.slice(1) };
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
      effects.push({ type: "FETCH_WORDS", count: 5 });
      return { state: { ...state, activity: { kind: "loading" }, error: null }, effects };
    }

    case "WORDS_LOADED": {
      const pool = [...state.wordPool, ...event.words];
      if (state.activity.kind === "loading") {
        if (pool.length === 0) {
          return {
            state: { ...state, error: "No vocabulary words available" },
            effects,
          };
        }
        const [first, ...rest] = pool;
        return {
          state: {
            ...state,
            activity: { kind: "idle", session: makeSession(first) },
            wordPool: rest,
            error: null,
          },
          effects,
        };
      }
      return { state: { ...state, wordPool: pool }, effects };
    }

    case "WORDS_LOAD_FAILED": {
      return { state: { ...state, error: event.error }, effects };
    }

    case "RECORD_START": {
      if (state.activity.kind !== "idle") return { state, effects };
      effects.push({ type: "START_RECORDING" });
      return {
        state: { ...state, activity: { kind: "recording", session: state.activity.session } },
        effects,
      };
    }

    case "RECORD_STOP": {
      if (state.activity.kind !== "recording") return { state, effects };
      const session = state.activity.session;
      effects.push({ type: "STOP_RECORDING_AND_TRANSCRIBE", sttHint: `${session.word.hangul}. 여보세요, 거기 집이지요? 네, 그런데요.` });
      return {
        state: { ...state, activity: { kind: "transcribing", session } },
        effects,
      };
    }

    case "RECORD_CANCEL": {
      if (state.activity.kind !== "recording") return { state, effects };
      effects.push({ type: "CANCEL_RECORDING" });
      return {
        state: { ...state, activity: { kind: "idle", session: state.activity.session } },
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

      // Append attempt to thread
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

      // Start background evaluation
      const abortId = `abort_${state.nextAbortId}`;
      effects.push({ type: "EVALUATE", session: updatedSession, abortId });
      const newBgEval = { sessionId: session.sessionId, abortId, session: updatedSession };

      // Determine next activity
      let nextState: PipelineState = {
        ...state,
        backgroundEvals: [...remainingEvals, newBgEval],
        nextAbortId: state.nextAbortId + 1,
      };

      const nextActivity = advanceActivity(nextState, effects);
      nextState = { ...nextState, activity: nextActivity };
      nextState = shiftReviewQueue(nextState);
      nextState = shiftWordPool(nextState);

      // If pool is getting low, prefetch more
      if (nextState.wordPool.length <= 2 && !effects.some(e => e.type === "FETCH_WORDS")) {
        effects.push({ type: "FETCH_WORDS", count: 5 });
      }

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
      // Remove from background evals
      const bgEval = state.backgroundEvals.find(
        (e) => e.sessionId === event.sessionId
      );
      if (!bgEval) return { state, effects }; // already cancelled

      const remainingEvals = state.backgroundEvals.filter(
        (e) => e.abortId !== bgEval.abortId
      );

      const evalMessage = { kind: "evaluation" as const, feedback: event.feedback };

      // If user is currently reviewing or chatting about THIS session, update in-place
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

      // Build the completed session from the snapshot stored in backgroundEvals
      const completedSession: WordSession = {
        ...bgEval.session,
        thread: [...bgEval.session.thread, evalMessage],
      };

      const newQueue = [...state.reviewQueue, completedSession];

      // If loading (no words to show), pop to reviewing immediately
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
      if (state.activity.kind !== "reviewing") return { state, effects };
      let nextState = { ...state };
      const nextActivity = advanceActivity(nextState, effects);
      nextState = { ...nextState, activity: nextActivity };
      nextState = shiftReviewQueue(nextState);
      nextState = shiftWordPool(nextState);
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
