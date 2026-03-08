import { describe, it, expect, beforeEach } from "bun:test";
import {
  transition,
  initialState,
  makeSessionId,
  _resetSessionCounter,
} from "../pipeline";
import type {
  PipelineState,
  PipelineEvent,
  PipelineEffect,
  VocabItem,
  WordSession,
  WordGroup,
  Feedback,
} from "../pipeline-types";

const word1: VocabItem = {
  id: "w1", hangul: "소", name: "Cow", isTranslation: true, pictureFilename: "cow.webp",
};
const word2: VocabItem = {
  id: "w2", hangul: "산", name: "Mountain", isTranslation: true, pictureFilename: "mountain.webp",
};
const word3: VocabItem = {
  id: "w3", hangul: "먹다", name: "To eat", isTranslation: true, pictureFilename: "eat.webp",
};
const word4: VocabItem = {
  id: "w4", hangul: "노란색", name: "Yellow", isTranslation: true, pictureFilename: "yellow.webp",
};
const word5: VocabItem = {
  id: "w5", hangul: "원피스", name: "Dress", isTranslation: true, pictureFilename: "dress.webp",
};

const goodFeedback: Feedback = {
  correct: true, feedback: "Great job!", example: "소가 풀을 먹어요.", raw: "CORRECT: yes\nFEEDBACK: Great job!\nEXAMPLE: 소가 풀을 먹어요.",
};
const badFeedback: Feedback = {
  correct: false, feedback: "Use 에 instead of 에서", example: "소가 풀에 잤어요.",
};

function fire(state: PipelineState, ...events: PipelineEvent[]): { state: PipelineState; effects: PipelineEffect[] } {
  let allEffects: PipelineEffect[] = [];
  for (const event of events) {
    const result = transition(state, event);
    state = result.state;
    allEffects = [...allEffects, ...result.effects];
  }
  return { state, effects: allEffects };
}

/** Get to idle state with word1 showing. */
function idleWithWord1(): PipelineState {
  const { state } = fire(initialState(), { type: "INIT" }, { type: "WORDS_LOADED", words: [word1, word2, word3] });
  return state;
}

/** Get to confirming state with word1 and a transcript. */
function confirmingWord1(transcript = "소가 잤어요"): PipelineState {
  const state = idleWithWord1();
  return fire(state, { type: "DEV_SUBMIT", text: transcript }).state;
}

beforeEach(() => {
  _resetSessionCounter();
});

describe("pipeline state machine", () => {
  describe("initialState", () => {
    it("defaults to easyMode: true", () => {
      expect(initialState().easyMode).toBe(true);
    });

    it("initialState(false) returns easyMode: false", () => {
      expect(initialState(false).easyMode).toBe(false);
    });
  });

  describe("initialization", () => {
    it("INIT emits FETCH_WORDS and sets activity to loading", () => {
      const { state, effects } = transition(initialState(), { type: "INIT" });
      expect(state.activity.kind).toBe("loading");
      expect(effects).toContainEqual({ type: "FETCH_WORDS", count: 5 });
    });

    it("WORDS_LOADED transitions from loading to idle with first word", () => {
      const { state: s1 } = transition(initialState(), { type: "INIT" });
      const { state: s2 } = transition(s1, { type: "WORDS_LOADED", words: [word1, word2] });
      expect(s2.activity.kind).toBe("idle");
      if (s2.activity.kind === "idle") {
        expect(s2.activity.session.words).toEqual([word1]);
      }
      expect(s2.wordPool).toEqual([word2]);
    });

    it("WORDS_LOADED with empty array stays loading with error", () => {
      const { state: s1 } = transition(initialState(), { type: "INIT" });
      const { state: s2 } = transition(s1, { type: "WORDS_LOADED", words: [] });
      expect(s2.activity.kind).toBe("loading");
      expect(s2.error).toBeTruthy();
    });

    it("WORDS_LOAD_FAILED sets error", () => {
      const { state: s1 } = transition(initialState(), { type: "INIT" });
      const { state: s2 } = transition(s1, { type: "WORDS_LOAD_FAILED", error: "Network error" });
      expect(s2.error).toBe("Network error");
    });
  });

  describe("recording flow", () => {
    it("RECORD_START from idle transitions to recording with START_RECORDING effect", () => {
      const state = idleWithWord1();
      const { state: s2, effects } = transition(state, { type: "RECORD_START" });
      expect(s2.activity.kind).toBe("recording");
      expect(effects).toContainEqual({ type: "START_RECORDING" });
    });

    it("RECORD_STOP transitions to transcribing with STT effect", () => {
      const state = idleWithWord1();
      const { state: s2 } = transition(state, { type: "RECORD_START" });
      const { state: s3, effects } = transition(s2, { type: "RECORD_STOP" });
      expect(s3.activity.kind).toBe("transcribing");
      expect(effects).toContainEqual(
        expect.objectContaining({ type: "STOP_RECORDING_AND_TRANSCRIBE", sttHint: expect.stringContaining("소") })
      );
    });

    it("RECORD_CANCEL returns to idle with CANCEL_RECORDING effect", () => {
      const state = idleWithWord1();
      const { state: s2 } = transition(state, { type: "RECORD_START" });
      const { state: s3, effects } = transition(s2, { type: "RECORD_CANCEL" });
      expect(s3.activity.kind).toBe("idle");
      expect(effects).toContainEqual({ type: "CANCEL_RECORDING" });
    });

    it("RECORD_START from non-idle is a no-op", () => {
      const state = confirmingWord1();
      const { state: s2, effects } = transition(state, { type: "RECORD_START" });
      expect(s2).toEqual(state);
      expect(effects).toEqual([]);
    });

    it("STT_RESULT transitions from transcribing to confirming", () => {
      const state = idleWithWord1();
      const { state: s2 } = fire(state, { type: "RECORD_START" }, { type: "RECORD_STOP" });
      const { state: s3 } = transition(s2, { type: "STT_RESULT", transcript: "소가 잤어요" });
      expect(s3.activity.kind).toBe("confirming");
      if (s3.activity.kind === "confirming") {
        expect(s3.activity.transcript).toBe("소가 잤어요");
      }
    });

    it("STT_FAILED returns to idle with error", () => {
      const state = idleWithWord1();
      const { state: s2 } = fire(state, { type: "RECORD_START" }, { type: "RECORD_STOP" });
      const { state: s3 } = transition(s2, { type: "STT_FAILED", error: "Mic error" });
      expect(s3.activity.kind).toBe("idle");
      expect(s3.error).toBe("Mic error");
    });
  });

  describe("dev mode", () => {
    it("DEV_SUBMIT from idle transitions to confirming", () => {
      const state = idleWithWord1();
      const { state: s2 } = transition(state, { type: "DEV_SUBMIT", text: "소가 먹어요" });
      expect(s2.activity.kind).toBe("confirming");
      if (s2.activity.kind === "confirming") {
        expect(s2.activity.transcript).toBe("소가 먹어요");
      }
    });

    it("DEV_SUBMIT from non-idle is a no-op", () => {
      const state = confirmingWord1();
      const { state: s2 } = transition(state, { type: "DEV_SUBMIT", text: "ignored" });
      expect(s2).toEqual(state);
    });
  });

  describe("confirm / reject", () => {
    it("CONFIRM appends attempt to thread and emits EVALUATE", () => {
      const state = confirmingWord1("소가 잤어요");
      const { state: s2, effects } = transition(state, { type: "CONFIRM_TRANSCRIPT" });
      const evalEffect = effects.find((e) => e.type === "EVALUATE");
      expect(evalEffect).toBeTruthy();
      if (evalEffect && evalEffect.type === "EVALUATE") {
        const thread = evalEffect.session.thread;
        expect(thread).toContainEqual({ kind: "attempt", transcript: "소가 잤어요" });
      }
    });

    it("CONFIRM advances to new word when reviewQueue empty and pool has words", () => {
      const state = confirmingWord1();
      const { state: s2 } = transition(state, { type: "CONFIRM_TRANSCRIPT" });
      expect(s2.activity.kind).toBe("idle");
      if (s2.activity.kind === "idle") {
        expect(s2.activity.session.words).toEqual([word2]);
      }
      expect(s2.backgroundEvals.length).toBe(1);
    });

    it("CONFIRM advances to queued review when reviewQueue non-empty", () => {
      const state = confirmingWord1();
      const reviewSession: WordSession = {
        sessionId: "old-session",
        words: [word3],
        thread: [
          { kind: "attempt", transcript: "먹었어요" },
          { kind: "evaluation", feedback: goodFeedback },
        ],
      };
      const stateWithQueue = { ...state, reviewQueue: [reviewSession] };
      const { state: s2 } = transition(stateWithQueue, { type: "CONFIRM_TRANSCRIPT" });
      expect(s2.activity.kind).toBe("reviewing");
      if (s2.activity.kind === "reviewing") {
        expect(s2.activity.session.sessionId).toBe("old-session");
      }
      expect(s2.reviewQueue.length).toBe(0);
    });

    it("CONFIRM goes to loading when pool and queue both empty", () => {
      const state = confirmingWord1();
      const emptyPoolState = { ...state, wordPool: [] };
      const { state: s2, effects } = transition(emptyPoolState, { type: "CONFIRM_TRANSCRIPT" });
      expect(s2.activity.kind).toBe("loading");
      expect(effects.some((e) => e.type === "FETCH_WORDS")).toBe(true);
    });

    it("CONFIRM cancels prior background eval for same session (retry)", () => {
      const state = confirmingWord1();
      // Simulate a prior eval in flight for the same session
      const sessionId = (state.activity as any).session.sessionId;
      const stateWithPrior = {
        ...state,
        backgroundEvals: [{ sessionId, abortId: "abort_old", session: (state.activity as any).session }],
      };
      const { effects } = transition(stateWithPrior, { type: "CONFIRM_TRANSCRIPT" });
      expect(effects).toContainEqual({ type: "ABORT_EVAL", abortId: "abort_old" });
    });

    it("REJECT returns to idle with same session", () => {
      const state = confirmingWord1();
      const sessionId = (state.activity as any).session.sessionId;
      const { state: s2 } = transition(state, { type: "REJECT_TRANSCRIPT" });
      expect(s2.activity.kind).toBe("idle");
      if (s2.activity.kind === "idle") {
        expect(s2.activity.session.sessionId).toBe(sessionId);
      }
    });
  });

  describe("background eval completion", () => {
    it("EVAL_COMPLETE pushes to reviewQueue when user is on different word", () => {
      // Confirm word1 → moves to word2 idle → eval for word1 completes
      const state = confirmingWord1("소가 잤어요");
      const { state: s2 } = transition(state, { type: "CONFIRM_TRANSCRIPT" });
      expect(s2.activity.kind).toBe("idle"); // on word2

      const bgSessionId = s2.backgroundEvals[0].sessionId;
      const { state: s3 } = transition(s2, {
        type: "EVAL_COMPLETE",
        sessionId: bgSessionId,
        feedback: goodFeedback,
      });
      expect(s3.reviewQueue.length).toBe(1);
      expect(s3.reviewQueue[0].sessionId).toBe(bgSessionId);
      expect(s3.backgroundEvals.length).toBe(0);
    });

    it("EVAL_COMPLETE updates session in-place when user is reviewing that session", () => {
      // Get a session into reviewing state, then fire eval complete for it
      const state = confirmingWord1("소가 잤어요");
      const { state: s2 } = transition(state, { type: "CONFIRM_TRANSCRIPT" });
      const bgSessionId = s2.backgroundEvals[0].sessionId;

      // Simulate: user confirms word2 too, and word1 eval arrives, goes to queue
      const s3 = fire(s2,
        { type: "DEV_SUBMIT", text: "산에 갔어요" },
        { type: "CONFIRM_TRANSCRIPT" },
      ).state;

      // Now word1 eval completes → goes to reviewQueue
      const { state: s4 } = transition(s3, {
        type: "EVAL_COMPLETE",
        sessionId: bgSessionId,
        feedback: goodFeedback,
      });

      // But if user is ALREADY reviewing that session (e.g. from the queue),
      // test the in-place update path. Let's construct it directly:
      const reviewingState: PipelineState = {
        ...s2,
        activity: { kind: "reviewing", session: s2.backgroundEvals[0].session },
      };
      const { state: s5 } = transition(reviewingState, {
        type: "EVAL_COMPLETE",
        sessionId: bgSessionId,
        feedback: badFeedback,
      });
      expect(s5.activity.kind).toBe("reviewing");
      if (s5.activity.kind === "reviewing") {
        const evalMsgs = s5.activity.session.thread.filter((m) => m.kind === "evaluation");
        expect(evalMsgs.length).toBe(1);
        expect((evalMsgs[0] as any).feedback).toEqual(badFeedback);
      }
    });

    it("EVAL_COMPLETE removes entry from backgroundEvals", () => {
      const state = confirmingWord1();
      const { state: s2 } = transition(state, { type: "CONFIRM_TRANSCRIPT" });
      expect(s2.backgroundEvals.length).toBe(1);

      const { state: s3 } = transition(s2, {
        type: "EVAL_COMPLETE",
        sessionId: s2.backgroundEvals[0].sessionId,
        feedback: goodFeedback,
      });
      expect(s3.backgroundEvals.length).toBe(0);
    });

    it("EVAL_COMPLETE pops from reviewQueue when activity is loading", () => {
      // Contrived: activity is loading, no words, bg eval completes
      const state = confirmingWord1();
      const { state: s2 } = transition(state, { type: "CONFIRM_TRANSCRIPT" });
      const loadingState: PipelineState = {
        ...s2,
        activity: { kind: "loading" },
        wordPool: [],
      };
      const { state: s3 } = transition(loadingState, {
        type: "EVAL_COMPLETE",
        sessionId: s2.backgroundEvals[0].sessionId,
        feedback: goodFeedback,
      });
      expect(s3.activity.kind).toBe("reviewing");
    });

    it("EVAL_FAILED creates synthetic failure feedback", () => {
      const state = confirmingWord1();
      const { state: s2 } = transition(state, { type: "CONFIRM_TRANSCRIPT" });
      const { state: s3 } = transition(s2, {
        type: "EVAL_FAILED",
        sessionId: s2.backgroundEvals[0].sessionId,
        error: "LLM down",
      });
      expect(s3.reviewQueue.length).toBe(1);
      const thread = s3.reviewQueue[0].thread;
      const evalMsg = thread.find((m) => m.kind === "evaluation");
      expect(evalMsg).toBeTruthy();
      if (evalMsg && evalMsg.kind === "evaluation") {
        expect(evalMsg.feedback.correct).toBe(false);
        expect(evalMsg.feedback.feedback).toBe("LLM down");
      }
    });

    it("two EVAL_COMPLETEs while user is on a fresh word both land in reviewQueue", () => {
      // Confirm word1 → idle word2 → confirm word2 → idle word3
      const state = idleWithWord1();
      let s = state;

      // Confirm word1
      s = fire(s, { type: "DEV_SUBMIT", text: "소가 잤어요" }, { type: "CONFIRM_TRANSCRIPT" }).state;
      const bg1SessionId = s.backgroundEvals[0].sessionId;

      // Confirm word2
      s = fire(s, { type: "DEV_SUBMIT", text: "산에 갔어요" }, { type: "CONFIRM_TRANSCRIPT" }).state;
      const bg2SessionId = s.backgroundEvals.find((e) => e.sessionId !== bg1SessionId)?.sessionId;

      // Both evals complete
      s = transition(s, { type: "EVAL_COMPLETE", sessionId: bg1SessionId, feedback: goodFeedback }).state;
      s = transition(s, { type: "EVAL_COMPLETE", sessionId: bg2SessionId!, feedback: badFeedback }).state;

      expect(s.reviewQueue.length).toBe(2);
    });

    it("EVAL_COMPLETE for unknown sessionId is a no-op", () => {
      const state = idleWithWord1();
      const { state: s2 } = transition(state, {
        type: "EVAL_COMPLETE",
        sessionId: "nonexistent",
        feedback: goodFeedback,
      });
      expect(s2).toEqual(state);
    });
  });

  describe("review", () => {
    it("REVIEW_NEXT pops from reviewQueue if non-empty", () => {
      const session1: WordSession = {
        sessionId: "s1", words: [word1],
        thread: [{ kind: "attempt", transcript: "소" }, { kind: "evaluation", feedback: goodFeedback }],
      };
      const session2: WordSession = {
        sessionId: "s2", words: [word2],
        thread: [{ kind: "attempt", transcript: "산" }, { kind: "evaluation", feedback: badFeedback }],
      };
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "reviewing", session: session1 },
        reviewQueue: [session2],
        wordPool: [word3],
      };
      const { state: s2 } = transition(state, { type: "REVIEW_NEXT" });
      expect(s2.activity.kind).toBe("reviewing");
      if (s2.activity.kind === "reviewing") {
        expect(s2.activity.session.sessionId).toBe("s2");
      }
      expect(s2.reviewQueue.length).toBe(0);
    });

    it("REVIEW_NEXT creates new word from pool if queue empty", () => {
      const session: WordSession = {
        sessionId: "s1", words: [word1],
        thread: [{ kind: "attempt", transcript: "소" }, { kind: "evaluation", feedback: goodFeedback }],
      };
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "reviewing", session },
        reviewQueue: [],
        wordPool: [word2, word3],
      };
      const { state: s2 } = transition(state, { type: "REVIEW_NEXT" });
      expect(s2.activity.kind).toBe("idle");
      if (s2.activity.kind === "idle") {
        expect(s2.activity.session.words).toEqual([word2]);
      }
    });

    it("REVIEW_NEXT goes to loading if both empty", () => {
      const session: WordSession = {
        sessionId: "s1", words: [word1],
        thread: [{ kind: "attempt", transcript: "소" }, { kind: "evaluation", feedback: goodFeedback }],
      };
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "reviewing", session },
        reviewQueue: [],
        wordPool: [],
      };
      const { state: s2, effects } = transition(state, { type: "REVIEW_NEXT" });
      expect(s2.activity.kind).toBe("loading");
      expect(effects).toContainEqual({ type: "FETCH_WORDS", count: 5 });
    });

    it("REVIEW_RETRY returns to idle with same session, thread preserved", () => {
      const session: WordSession = {
        sessionId: "s1", words: [word1],
        thread: [
          { kind: "attempt", transcript: "소가 잤에서요" },
          { kind: "evaluation", feedback: badFeedback },
        ],
      };
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "reviewing", session },
        wordPool: [word2],
      };
      const { state: s2 } = transition(state, { type: "REVIEW_RETRY" });
      expect(s2.activity.kind).toBe("idle");
      if (s2.activity.kind === "idle") {
        expect(s2.activity.session.sessionId).toBe("s1");
        expect(s2.activity.session.thread.length).toBe(2);
      }
    });

    it("REVIEW_RETRY then full cycle adds second attempt to same thread", () => {
      const session: WordSession = {
        sessionId: "s1", words: [word1],
        thread: [
          { kind: "attempt", transcript: "소가 잤에서요" },
          { kind: "evaluation", feedback: badFeedback },
        ],
      };
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "reviewing", session },
        wordPool: [word2, word3],
      };

      // Retry → idle → dev submit → confirming → confirm
      const { state: s2, effects } = fire(state,
        { type: "REVIEW_RETRY" },
        { type: "DEV_SUBMIT", text: "소가 잤어요" },
        { type: "CONFIRM_TRANSCRIPT" },
      );

      // The EVALUATE effect should have a thread with both attempts
      const evalEffect = effects.find((e) => e.type === "EVALUATE");
      expect(evalEffect).toBeTruthy();
      if (evalEffect && evalEffect.type === "EVALUATE") {
        const attempts = evalEffect.session.thread.filter((m) => m.kind === "attempt");
        expect(attempts.length).toBe(2);
        expect((attempts[0] as any).transcript).toBe("소가 잤에서요");
        expect((attempts[1] as any).transcript).toBe("소가 잤어요");
      }
    });
  });

  describe("chat", () => {
    it("CHAT_SEND from reviewing appends user-chat, transitions to chatting, emits SEND_CHAT", () => {
      const session: WordSession = {
        sessionId: "s1", words: [word1],
        thread: [
          { kind: "attempt", transcript: "소가 잤어요" },
          { kind: "evaluation", feedback: badFeedback },
        ],
      };
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "reviewing", session },
      };
      const { state: s2, effects } = transition(state, { type: "CHAT_SEND", text: "How do I use 에?" });
      expect(s2.activity.kind).toBe("chatting");
      if (s2.activity.kind === "chatting") {
        const chatMsgs = s2.activity.session.thread.filter((m) => m.kind === "user-chat");
        expect(chatMsgs.length).toBe(1);
      }
      expect(effects.some((e) => e.type === "SEND_CHAT")).toBe(true);
    });

    it("CHAT_RESPONSE appends assistant-chat and returns to reviewing", () => {
      const session: WordSession = {
        sessionId: "s1", words: [word1],
        thread: [
          { kind: "attempt", transcript: "소가 잤어요" },
          { kind: "evaluation", feedback: badFeedback },
          { kind: "user-chat", text: "How do I use 에?" },
        ],
      };
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "chatting", session },
      };
      const { state: s2 } = transition(state, {
        type: "CHAT_RESPONSE",
        sessionId: "s1",
        text: "Use 에 for location of a state.",
      });
      expect(s2.activity.kind).toBe("reviewing");
      if (s2.activity.kind === "reviewing") {
        const assistMsgs = s2.activity.session.thread.filter((m) => m.kind === "assistant-chat");
        expect(assistMsgs.length).toBe(1);
      }
    });

    it("CHAT_FAILED appends error and returns to reviewing", () => {
      const session: WordSession = {
        sessionId: "s1", words: [word1],
        thread: [{ kind: "user-chat", text: "help" }],
      };
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "chatting", session },
      };
      const { state: s2 } = transition(state, {
        type: "CHAT_FAILED",
        sessionId: "s1",
        error: "Network error",
      });
      expect(s2.activity.kind).toBe("reviewing");
      if (s2.activity.kind === "reviewing") {
        const last = s2.activity.session.thread[s2.activity.session.thread.length - 1];
        expect(last.kind).toBe("assistant-chat");
        expect((last as any).text).toContain("Network error");
      }
    });

    it("CHAT_SEND from non-reviewing is a no-op", () => {
      const state = idleWithWord1();
      const { state: s2 } = transition(state, { type: "CHAT_SEND", text: "hello" });
      expect(s2).toEqual(state);
    });

    it("EVAL_COMPLETE for different session during chat goes to reviewQueue", () => {
      const session: WordSession = {
        sessionId: "s1", words: [word1],
        thread: [{ kind: "user-chat", text: "help" }],
      };
      const bgSession: WordSession = {
        sessionId: "s2", words: [word2],
        thread: [{ kind: "attempt", transcript: "산에 갔어요" }],
      };
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "chatting", session },
        backgroundEvals: [{ sessionId: "s2", abortId: "a1", session: bgSession }],
      };
      const { state: s2 } = transition(state, {
        type: "EVAL_COMPLETE",
        sessionId: "s2",
        feedback: goodFeedback,
      });
      expect(s2.activity.kind).toBe("chatting"); // didn't interrupt
      expect(s2.reviewQueue.length).toBe(1);
      expect(s2.reviewQueue[0].sessionId).toBe("s2");
    });
  });

  describe("end", () => {
    it("END aborts all background evals and sets activity to finished", () => {
      const state: PipelineState = {
        ...idleWithWord1(),
        backgroundEvals: [
          { sessionId: "s1", abortId: "a1", session: { sessionId: "s1", words: [word1], thread: [] } },
          { sessionId: "s2", abortId: "a2", session: { sessionId: "s2", words: [word2], thread: [] } },
        ],
      };
      const { state: s2, effects } = transition(state, { type: "END" });
      expect(s2.activity.kind).toBe("finished");
      expect(s2.backgroundEvals.length).toBe(0);
      expect(effects).toContainEqual({ type: "ABORT_EVAL", abortId: "a1" });
      expect(effects).toContainEqual({ type: "ABORT_EVAL", abortId: "a2" });
    });
  });

  describe("edge cases", () => {
    it("WORDS_LOADED while not loading just grows the pool", () => {
      const state = idleWithWord1();
      const poolBefore = state.wordPool.length;
      const { state: s2 } = transition(state, { type: "WORDS_LOADED", words: [word3] });
      expect(s2.wordPool.length).toBe(poolBefore + 1);
      expect(s2.activity.kind).toBe("idle"); // unchanged
    });

    it("confirm drains pool; when pool runs low, FETCH_WORDS is emitted", () => {
      // Start with pool of 2 words (word2 and word3, word1 is active)
      const state = idleWithWord1();
      expect(state.wordPool).toEqual([word2, word3]);

      // Confirm word1 → now on word2, pool = [word3] — low!
      const s2 = fire(state, { type: "DEV_SUBMIT", text: "test" }, { type: "CONFIRM_TRANSCRIPT" });
      // Pool should be [word3], which is ≤2, so FETCH_WORDS should be emitted
      const fetchEffects = s2.effects.filter((e) => e.type === "FETCH_WORDS");
      expect(fetchEffects.length).toBeGreaterThan(0);
    });
  });

  describe("groupPool and companions", () => {
    const group1: WordGroup = { words: [word4, word5] };
    const group2: WordGroup = { words: [word1, word3] };

    it("advanceActivity prefers groupPool when !easyMode", () => {
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "loading" },
        wordPool: [word1, word2],
        groupPool: [group1, group2],
        easyMode: false,
      };
      const effects: PipelineEffect[] = [];
      // Simulate WORDS_LOADED to get to idle
      const { state: s2 } = transition(state, { type: "WORDS_LOADED", words: [] });
      // Should have used group1
      expect(s2.activity.kind).toBe("idle");
      if (s2.activity.kind === "idle") {
        expect(s2.activity.session.words).toEqual([word4, word5]);
      }
    });

    it("advanceActivity falls back to wordPool when groupPool empty", () => {
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "loading" },
        wordPool: [word1, word2],
        groupPool: [],
        easyMode: false,
      };
      const { state: s2 } = transition(state, { type: "WORDS_LOADED", words: [] });
      expect(s2.activity.kind).toBe("idle");
      if (s2.activity.kind === "idle") {
        expect(s2.activity.session.words).toEqual([word1]);
      }
    });

    it("advanceActivity ignores groupPool in easyMode", () => {
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "loading" },
        wordPool: [word1, word2],
        groupPool: [group1],
        easyMode: true,
      };
      const { state: s2 } = transition(state, { type: "WORDS_LOADED", words: [] });
      expect(s2.activity.kind).toBe("idle");
      if (s2.activity.kind === "idle") {
        expect(s2.activity.session.words).toEqual([word1]);
      }
    });

    it("GROUPS_LOADED appends to groupPool and clears companionFetchInFlight", () => {
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "idle", session: { sessionId: "s1", words: [word1], thread: [] } },
        companionFetchInFlight: true,
        groupPool: [group1],
      };
      const { state: s2 } = transition(state, { type: "GROUPS_LOADED", groups: [group2] });
      expect(s2.groupPool).toEqual([group1, group2]);
      expect(s2.companionFetchInFlight).toBe(false);
    });

    it("GROUPS_LOADED while loading transitions to idle with group words", () => {
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "loading" },
        companionFetchInFlight: true,
      };
      const { state: s2 } = transition(state, { type: "GROUPS_LOADED", groups: [group1, group2] });
      expect(s2.activity.kind).toBe("idle");
      if (s2.activity.kind === "idle") {
        expect(s2.activity.session.words).toEqual([word4, word5]);
      }
      expect(s2.groupPool).toEqual([group2]);
      expect(s2.companionFetchInFlight).toBe(false);
    });

    it("GROUPS_LOAD_FAILED clears inFlight flag with no user error", () => {
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "idle", session: { sessionId: "s1", words: [word1], thread: [] } },
        companionFetchInFlight: true,
      };
      const { state: s2 } = transition(state, { type: "GROUPS_LOAD_FAILED", error: "oops" });
      expect(s2.companionFetchInFlight).toBe(false);
      expect(s2.error).toBeNull();
    });

    it("SET_EASY_MODE updates state", () => {
      const state = initialState();
      const { state: s2 } = transition(state, { type: "SET_EASY_MODE", easyMode: false });
      expect(s2.easyMode).toBe(false);
    });

    it("SET_EASY_MODE to normal triggers FETCH_COMPANIONS when groupPool empty", () => {
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "idle", session: { sessionId: "s1", words: [word1], thread: [] } },
        groupPool: [],
        companionFetchInFlight: false,
      };
      const { state: s2, effects } = transition(state, { type: "SET_EASY_MODE", easyMode: false });
      expect(effects).toContainEqual({ type: "FETCH_COMPANIONS" });
      expect(s2.companionFetchInFlight).toBe(true);
    });

    it("FETCH_COMPANIONS emitted when groupPool <= 5 in normal mode on CONFIRM", () => {
      // Setup: normal mode, groupPool has 4 groups (will be 3 after popping one)
      const groups = [group1, group2, { words: [word2, word3] }, { words: [word1, word2] }];
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "confirming", session: { sessionId: "s1", words: [word1], thread: [] }, transcript: "test" },
        easyMode: false,
        groupPool: groups,
        wordPool: [word2, word3],
        companionFetchInFlight: false,
      };
      const { effects } = transition(state, { type: "CONFIRM_TRANSCRIPT" });
      expect(effects.some((e) => e.type === "FETCH_COMPANIONS")).toBe(true);
    });

    it("FETCH_COMPANIONS not emitted when already in flight", () => {
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "idle", session: { sessionId: "s1", words: [word1], thread: [] } },
        easyMode: false,
        groupPool: [],
        companionFetchInFlight: true,
      };
      const { effects } = transition(state, { type: "SET_EASY_MODE", easyMode: false });
      expect(effects.some((e) => e.type === "FETCH_COMPANIONS")).toBe(false);
    });

    it("session.words length 2 from groupPool", () => {
      // Normal mode, confirm → advance picks from groupPool
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "confirming", session: { sessionId: "s1", words: [word1], thread: [] }, transcript: "test" },
        easyMode: false,
        groupPool: [group1],
        wordPool: [word2, word3],
        companionFetchInFlight: true, // prevent companion fetch noise
      };
      const { state: s2 } = transition(state, { type: "CONFIRM_TRANSCRIPT" });
      expect(s2.activity.kind).toBe("idle");
      if (s2.activity.kind === "idle") {
        expect(s2.activity.session.words.length).toBe(2);
        expect(s2.activity.session.words).toEqual([word4, word5]);
      }
    });

    it("session.words length 1 from wordPool", () => {
      // Normal mode but no groups → falls back to wordPool
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "confirming", session: { sessionId: "s1", words: [word1], thread: [] }, transcript: "test" },
        easyMode: false,
        groupPool: [],
        wordPool: [word2, word3],
        companionFetchInFlight: true,
      };
      const { state: s2 } = transition(state, { type: "CONFIRM_TRANSCRIPT" });
      expect(s2.activity.kind).toBe("idle");
      if (s2.activity.kind === "idle") {
        expect(s2.activity.session.words.length).toBe(1);
        expect(s2.activity.session.words).toEqual([word2]);
      }
    });

    it("sttHint joins all words hangul", () => {
      const session: WordSession = {
        sessionId: "s1",
        words: [word4, word5],
        thread: [],
      };
      const state: PipelineState = {
        ...initialState(),
        activity: { kind: "recording", session },
      };
      const { effects } = transition(state, { type: "RECORD_STOP" });
      const sttEffect = effects.find((e) => e.type === "STOP_RECORDING_AND_TRANSCRIBE");
      expect(sttEffect).toBeTruthy();
      if (sttEffect && sttEffect.type === "STOP_RECORDING_AND_TRANSCRIBE") {
        expect(sttEffect.sttHint).toContain("노란색");
        expect(sttEffect.sttHint).toContain("원피스");
      }
    });
  });
});
