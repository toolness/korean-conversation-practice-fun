/** Pure render component for the pipeline drill. */

import React, { useRef, useEffect } from "react";
import Markdown from "react-markdown";
import type { PipelineState, PipelineEvent, WordSession, ThreadMessage } from "../engine/pipeline-types";
import type { Activity } from "../engine/pipeline-types";
import { getNotionPageUrl } from "../utils/notion";

function lastEvalCorrect(activity: Activity): boolean {
  if (!("session" in activity)) return false;
  const thread = activity.session.thread;
  for (let i = thread.length - 1; i >= 0; i--) {
    if (thread[i].kind === "evaluation") return thread[i].feedback.correct;
  }
  return false;
}

interface Props {
  state: PipelineState;
  dispatch: (e: PipelineEvent) => void;
  devMode: boolean;
  onEnd: () => void;
  input: string;
  onInputChange: (value: string) => void;
  easyMode?: boolean;
  onToggleEasy?: () => void;
}

function WordPictures({ session }: { session: WordSession }) {
  return (
    <div className="picture-grid">
      {session.words.map((w) => (
        <div key={w.id} className="picture-card">
          <img
            src={`/api/vocab/assets/${encodeURIComponent(w.pictureFilename)}`}
            alt={w.hangul}
            className="picture-img"
          />
          <a
            href={getNotionPageUrl(w.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="notion-link"
            title={`Open in Notion${w.isTranslation ? ` (${w.name})` : ""}`}
          >
            <svg width="14" height="14" viewBox="0 0 100 100" fill="currentColor">
              <path d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.897 2.723 3.897 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z" />
            </svg>
          </a>
        </div>
      ))}
    </div>
  );
}

function ThreadView({ thread }: { thread: ThreadMessage[] }) {
  if (thread.length === 0) return null;
  return (
    <div className="pipeline-thread">
      {thread.map((msg, i) => {
        switch (msg.kind) {
          case "attempt":
            return (
              <div key={i} className="chat-bubble learner" style={{ display: "inline-block" }}>
                <div className="speaker">You said</div>
                {msg.transcript}
              </div>
            );
          case "evaluation":
            return (
              <div
                key={i}
                className={`picture-feedback ${msg.feedback.correct ? "correct" : "incorrect"}`}
              >
                <div className="feedback-status">
                  {msg.feedback.correct ? "Correct!" : "Needs work"}
                </div>
                <Markdown>{msg.feedback.feedback}</Markdown>
                {msg.feedback.example && (
                  <div className="feedback-example">
                    <span className="wireframe-label" style={{ marginTop: 0 }}>Example</span>
                    <div style={{ fontSize: "1.1rem", margin: "0.25rem 0 0" }}>
                      <Markdown>{msg.feedback.example}</Markdown>
                    </div>
                  </div>
                )}
              </div>
            );
          case "user-chat":
            return (
              <div key={i} className="chat-bubble learner" style={{ display: "inline-block" }}>
                <div className="speaker">You asked</div>
                {msg.text}
              </div>
            );
          case "assistant-chat":
            return (
              <div key={i} className="chat-bubble partner" style={{ display: "inline-block" }}>
                <div className="speaker">Tutor</div>
                <Markdown>{msg.text}</Markdown>
              </div>
            );
        }
      })}
    </div>
  );
}

function StatusHint({ state }: { state: PipelineState }) {
  const { activity } = state;
  const bgCount = state.backgroundEvals.length;
  const queueCount = state.reviewQueue.length;
  const badges: string[] = [];
  if (bgCount > 0) badges.push(`${bgCount} evaluating`);
  if (queueCount > 0) badges.push(`${queueCount} to review`);

  return badges.length > 0 ? (
    <div style={{ fontSize: "0.65rem", color: "var(--muted)", textAlign: "center", marginTop: "0.25rem" }}>
      {badges.join(" · ")}
    </div>
  ) : null;
}

export function PipelineView({ state, dispatch, devMode, onEnd, input, onInputChange, easyMode, onToggleEasy }: Props) {
  const { activity } = state;
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [state]);

  function getSession(): WordSession | null {
    if ("session" in activity) return activity.session;
    return null;
  }

  const session = getSession();

  // Footer content based on activity
  function renderFooter() {
    if (activity.kind === "loading" || activity.kind === "finished") return null;

    if (devMode) {
      return (
        <div>
          <div className="dev-input">
            <input
              type="text"
              value={input}
              onInput={(e) => onInputChange((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const text = input.trim();
                  if (activity.kind === "idle") {
                    if (!text) return;
                    dispatch({ type: "DEV_SUBMIT", text });
                    onInputChange("");
                  } else if (activity.kind === "confirming") {
                    dispatch({ type: "CONFIRM_TRANSCRIPT" });
                  } else if (activity.kind === "reviewing") {
                    if (text) {
                      dispatch({ type: "CHAT_SEND", text });
                      onInputChange("");
                    } else {
                      dispatch({ type: lastEvalCorrect(activity) ? "REVIEW_NEXT" : "REVIEW_RETRY" });
                    }
                  }
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  if (activity.kind === "idle") {
                    dispatch({ type: "REVIEW_NEXT" });
                  } else if (activity.kind === "confirming") {
                    dispatch({ type: "REJECT_TRANSCRIPT" });
                  } else if (activity.kind === "reviewing") {
                    dispatch({ type: lastEvalCorrect(activity) ? "REVIEW_RETRY" : "REVIEW_NEXT" });
                  }
                }
              }}
              placeholder={
                activity.kind === "confirming"
                  ? "Enter to confirm · Esc to redo"
                  : activity.kind === "reviewing"
                    ? lastEvalCorrect(activity)
                      ? "Type to chat · Esc to retry · Enter for next"
                      : "Type to chat · Esc to skip · Enter to retry"
                    : "Type Korean · Esc to skip"
              }
              disabled={activity.kind === "chatting"}
              style={{ flex: 1 }}
            />
            {activity.kind === "idle" && (
              <>
                <button
                  className="btn btn-outline"
                  onClick={() => dispatch({ type: "REVIEW_NEXT" })}
                >
                  Skip
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const text = input.trim();
                    if (text) {
                      dispatch({ type: "DEV_SUBMIT", text });
                      onInputChange("");
                    }
                  }}
                  disabled={!input.trim()}
                >
                  Send
                </button>
              </>
            )}
            {activity.kind === "confirming" && (
              <>
                <button
                  className="btn btn-success"
                  onClick={() => dispatch({ type: "CONFIRM_TRANSCRIPT" })}
                >
                  Confirm
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => dispatch({ type: "REJECT_TRANSCRIPT" })}
                >
                  Redo
                </button>
              </>
            )}
            {activity.kind === "reviewing" && (
              lastEvalCorrect(activity) ? (
                <>
                  <button
                    className="btn btn-outline"
                    onClick={() => dispatch({ type: "REVIEW_RETRY" })}
                  >
                    Retry
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={() => dispatch({ type: "REVIEW_NEXT" })}
                  >
                    Next
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-outline"
                    onClick={() => dispatch({ type: "REVIEW_NEXT" })}
                  >
                    Skip
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={() => dispatch({ type: "REVIEW_RETRY" })}
                  >
                    Retry
                  </button>
                </>
              )
            )}
          </div>
          <StatusHint state={state} />
        </div>
      );
    }

    // Non-dev mode: PTT
    const pttLabel =
      activity.kind === "recording"
        ? "Recording... release Space to send"
        : activity.kind === "transcribing"
          ? "Converting speech..."
          : activity.kind === "confirming"
            ? "Space to confirm · Esc to redo"
            : activity.kind === "reviewing"
              ? lastEvalCorrect(activity)
                ? "Space for next word · Esc to retry"
                : "Hold Space to speak · Esc to skip"
              : activity.kind === "chatting"
                ? "Waiting for tutor..."
                : "Hold Space to speak · Esc to skip";

    const pttClass =
      activity.kind === "recording"
        ? "ptt-recording"
        : activity.kind === "transcribing"
          ? "ptt-processing"
          : "ptt-idle";

    return (
      <div>
        <div className="ptt-bar">
          <span className={`ptt-state ${pttClass}`}>{pttLabel}</span>
          {activity.kind === "recording" && (
            <span style={{ fontSize: "0.75rem", color: "var(--muted)", marginLeft: "0.5rem" }}>
              Esc to cancel
            </span>
          )}
        </div>
        <StatusHint state={state} />
      </div>
    );
  }

  return (
    <div className="conv-layout">
      <div className="conv-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, border: "none", padding: 0, fontSize: "1.1rem" }}>
            Picture Speaking
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {onToggleEasy && (
              <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!easyMode}
                  onChange={onToggleEasy}
                />
                Easy mode
              </label>
            )}
            <button
              className="btn btn-outline"
              style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
              onClick={onEnd}
            >
              End
            </button>
          </div>
        </div>
      </div>

      <div ref={messagesRef} className="conv-messages" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {activity.kind === "loading" ? (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", padding: "2rem 0" }}>
            {state.error || "Loading..."}
          </p>
        ) : activity.kind === "finished" ? (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", padding: "2rem 0" }}>
            Session ended.
          </p>
        ) : (
          <>
            {session && <WordPictures session={session} />}

            {!easyMode && session && session.words.length === 1 && (
              <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                Generating word pairs...
              </p>
            )}

            {state.error && (
              <p style={{ color: "var(--orange)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                {state.error}
              </p>
            )}

            {session && session.thread.length > 0 && (
              <ThreadView thread={session.thread} />
            )}

            {activity.kind === "confirming" && (
              <div style={{ marginTop: "1rem", textAlign: "center", width: "100%" }}>
                <div className="chat-bubble learner" style={{ display: "inline-block" }}>
                  <div className="speaker">You said</div>
                  {activity.transcript}
                </div>
                <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: "0.5rem" }}>
                  Look right? Space to confirm, Esc to redo
                </p>
              </div>
            )}

            {activity.kind === "chatting" && (
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.75rem" }}>
                Tutor is thinking...
              </p>
            )}

            {activity.kind === "idle" && session && session.thread.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", padding: "1rem 0", textAlign: "center" }}>
                {devMode ? "Type a Korean sentence using this word" : "Hold Space to speak"}
              </p>
            )}
          </>
        )}
      </div>

      <div className="conv-footer">
        {renderFooter()}
      </div>
    </div>
  );
}
