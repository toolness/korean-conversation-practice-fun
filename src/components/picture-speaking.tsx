/** Picture-speaking drill — thin shell wiring state machine to UI and effects. */

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Briefing } from "../scenarios/index";
import type { PipelineState, PipelineEvent, Activity } from "../engine/pipeline-types";
import { transition, initialState } from "../engine/pipeline";
import { createEffectExecutor } from "./pipeline-effects";
import { PipelineView } from "./pipeline-view";

const DEV_MODE =
  typeof window !== "undefined" &&
  new URLSearchParams(location.search).has("dev");

interface Props {
  briefing: Briefing;
  onEnd: () => void;
}

function lastEvalCorrect(activity: Activity): boolean {
  if (!("session" in activity)) return false;
  const thread = activity.session.thread;
  for (let i = thread.length - 1; i >= 0; i--) {
    if (thread[i].kind === "evaluation") return thread[i].feedback.correct;
  }
  return false;
}

function mapKeyDown(e: KeyboardEvent, activity: Activity): PipelineEvent | null {
  if (e.key === "Escape") {
    switch (activity.kind) {
      case "idle": return { type: "REVIEW_NEXT" };
      case "recording": return { type: "RECORD_CANCEL" };
      case "confirming": return { type: "REJECT_TRANSCRIPT" };
      case "reviewing": return lastEvalCorrect(activity)
        ? { type: "REVIEW_RETRY" }
        : { type: "REVIEW_NEXT" };
      default: return null;
    }
  }
  if (e.key === " ") {
    switch (activity.kind) {
      case "idle": return { type: "RECORD_START" };
      case "confirming": return { type: "CONFIRM_TRANSCRIPT" };
      case "reviewing": return lastEvalCorrect(activity)
        ? { type: "REVIEW_NEXT" }
        : { type: "RECORD_START" };
      default: return null;
    }
  }
  return null;
}

function mapKeyUp(e: KeyboardEvent, activity: Activity): PipelineEvent | null {
  if (e.key === " " && activity.kind === "recording") {
    return { type: "RECORD_STOP" };
  }
  return null;
}

export function PictureSpeaking({ briefing, onEnd }: Props) {
  const [state, setState] = useState<PipelineState>(initialState);
  const [input, setInput] = useState("");
  const stateRef = useRef(state);
  stateRef.current = state;

  const executeEffectRef = useRef<ReturnType<typeof createEffectExecutor> | null>(null);

  const dispatch = useCallback((event: PipelineEvent) => {
    const result = transition(stateRef.current, event);
    stateRef.current = result.state;
    setState(result.state);
    for (const effect of result.effects) {
      executeEffectRef.current?.(effect);
    }
  }, []);

  // Initialize effect executor and fire INIT
  useEffect(() => {
    executeEffectRef.current = createEffectExecutor(dispatch);
    dispatch({ type: "INIT" });
    return () => {
      dispatch({ type: "END" });
    };
  }, [dispatch]);

  // Keyboard listeners (non-dev mode only)
  useEffect(() => {
    if (DEV_MODE) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      const event = mapKeyDown(e, stateRef.current.activity);
      if (event) {
        e.preventDefault();
        dispatch(event);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      const event = mapKeyUp(e, stateRef.current.activity);
      if (event) {
        e.preventDefault();
        dispatch(event);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [dispatch]);

  function handleEnd() {
    dispatch({ type: "END" });
    onEnd();
  }

  return (
    <PipelineView
      state={state}
      dispatch={dispatch}
      devMode={DEV_MODE}
      onEnd={handleEnd}
      input={input}
      onInputChange={setInput}
    />
  );
}
