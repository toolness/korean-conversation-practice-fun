import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Briefing } from "../scenarios/index";
import { getNotionPageUrl } from "../utils/notion";
import { downsample, encodeWAV } from "../utils/audio";

const DEV_MODE =
  typeof window !== "undefined" &&
  new URLSearchParams(location.search).has("dev");

interface VocabItem {
  id: string;
  hangul: string;
  name: string;
  isTranslation: boolean;
  pictureFilename: string;
}

interface Feedback {
  correct: boolean;
  feedback: string;
  example: string;
  raw?: string;
}

interface Props {
  briefing: Briefing;
  onEnd: () => void;
}

async function transcribeAudio(blob: Blob, prompt?: string): Promise<string> {
  const form = new FormData();
  form.append("file", blob, "recording.wav");
  if (prompt) form.append("prompt", prompt);
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  const data = await res.json();
  return data.text;
}

function parseFeedback(text: string): Feedback {
  const correctMatch = text.match(/CORRECT:\s*(yes|no)/i);
  const feedbackMatch = text.match(/FEEDBACK:\s*(.+?)(?=\nEXAMPLE:|$)/s);
  const exampleMatch = text.match(/EXAMPLE:\s*(.+)/s);
  return {
    correct: correctMatch ? correctMatch[1].toLowerCase() === "yes" : false,
    feedback: feedbackMatch ? feedbackMatch[1].trim() : text,
    example: exampleMatch ? exampleMatch[1].trim() : "",
    raw: text,
  };
}

export function PictureSpeaking({ briefing, onEnd }: Props) {
  const [words, setWords] = useState<VocabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [userText, setUserText] = useState<string | null>(null);
  const [pttState, setPttState] = useState<"idle" | "recording" | "processing">("idle");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<{
    stream: MediaStream;
    audioCtx: AudioContext;
    source: MediaStreamAudioSourceNode;
    processor: ScriptProcessorNode;
    chunks: Float32Array[];
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchWords = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    setUserText(null);
    setError(null);
    try {
      const res = await fetch("/api/vocab/random?count=1");
      const data = await res.json();
      if (data.items) {
        setWords(data.items);
      } else {
        setError("Could not load vocabulary. Is VOCAB_DATA_DIR set?");
      }
    } catch {
      setError("Could not load vocabulary. Is the server running?");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchWords();
  }, [fetchWords]);

  function cancelEvaluation() {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setUserText(null);
    setFeedback(null);
  }

  async function evaluate(spokenText: string) {
    setUserText(spokenText);
    setSending(true);
    setFeedback(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const wordList = words
      .map((w) => `- ${w.hangul} (${w.name})`)
      .join("\n");

    const prompt = `You are a Korean language tutor evaluating a student's spoken sentence.

The student was shown pictures representing these Korean words:
${wordList}

The student said: "${spokenText}"

Evaluate their sentence:
1. Is it grammatically correct? (particles, conjugation, word order)
2. Does it use the target vocabulary?
3. Brief feedback (1-2 sentences, in English)
4. A natural Korean example sentence using these words

IMPORTANT: The student's input comes through speech-to-text and may contain
transcription errors. Be charitable with phonetically close interpretations.
Focus on structural issues: wrong particles, word order, conjugation, missing
grammar elements.

Respond in this exact format:
CORRECT: yes/no
FEEDBACK: ...
EXAMPLE: ...`;

    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.text) {
        setFeedback(parseFeedback(data.text));
      } else {
        setError("LLM evaluation failed");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("LLM evaluation failed. Is the server running?");
    }
    abortRef.current = null;
    setSending(false);
  }

  // PTT recording
  async function startRecording() {
    setPttState("recording");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];

      processor.onaudioprocess = (e) => {
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      recRef.current = { stream, audioCtx, source, processor, chunks };
    } catch (err) {
      console.error("Mic access error:", err);
      setPttState("idle");
    }
  }

  function cancelRecording() {
    const rec = recRef.current;
    if (rec) {
      rec.processor.disconnect();
      rec.source.disconnect();
      rec.audioCtx.close();
      rec.stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
    }
    setPttState("idle");
  }

  async function stopAndSendRecording() {
    const rec = recRef.current;
    if (!rec) return;

    const sampleRate = rec.audioCtx.sampleRate;
    rec.processor.disconnect();
    rec.source.disconnect();
    rec.audioCtx.close();
    rec.stream.getTracks().forEach((t) => t.stop());
    recRef.current = null;

    const totalLen = rec.chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of rec.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    if (totalLen < sampleRate * 0.3) {
      setPttState("idle");
      return;
    }

    setPttState("processing");

    try {
      const targetRate = 16000;
      const downsampled = downsample(merged, sampleRate, targetRate);
      const wavBlob = encodeWAV(downsampled, targetRate);
      const hint = words.map((w) => w.hangul).join(", ");
      const text = await transcribeAudio(wavBlob, hint);
      setPttState("idle");
      if (text && text.trim()) {
        evaluate(text.trim());
      }
    } catch (err) {
      console.error("Transcription error:", err);
      setPttState("idle");
    }
  }

  // Keyboard listeners
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      if (e.key === "Escape" && sending) {
        // Esc while evaluating = cancel and retry
        e.preventDefault();
        cancelEvaluation();
      } else if (
        !DEV_MODE &&
        e.key === " " &&
        pttState === "idle" &&
        !sending &&
        !loading &&
        feedback
      ) {
        // Space with feedback showing = next word
        e.preventDefault();
        fetchWords();
      } else if (
        !DEV_MODE &&
        e.key === "Escape" &&
        pttState === "idle" &&
        !sending &&
        !loading &&
        feedback
      ) {
        // Esc with feedback showing = retry same word
        e.preventDefault();
        setFeedback(null);
        setUserText(null);
      } else if (
        !DEV_MODE &&
        e.key === " " &&
        pttState === "idle" &&
        !sending &&
        !loading
      ) {
        // Space with no feedback = start recording
        e.preventDefault();
        startRecording();
      } else if (!DEV_MODE && e.key === "Escape" && pttState === "recording") {
        e.preventDefault();
        cancelRecording();
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (!DEV_MODE && e.key === " " && pttState === "recording") {
        e.preventDefault();
        stopAndSendRecording();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [pttState, sending, loading, feedback]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        evaluate(input.trim());
        setInput("");
      }
    }
  }

  const pttLabel =
    pttState === "recording"
      ? "Recording... release Space to send"
      : pttState === "processing"
        ? "Converting speech..."
        : feedback
          ? "Space for next word · Esc to retry"
          : "Hold Space to speak";
  const pttClass =
    pttState === "recording"
      ? "ptt-recording"
      : pttState === "processing"
        ? "ptt-processing"
        : "ptt-idle";

  return (
    <div className="conv-layout">
      <div className="conv-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, border: "none", padding: 0, fontSize: "1.1rem" }}>
            {briefing.title}
          </h2>
          <button
            className="btn btn-outline"
            style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
            onClick={onEnd}
          >
            End
          </button>
        </div>
      </div>

      <div className="conv-messages" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {loading ? (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Loading pictures...</p>
        ) : error ? (
          <p style={{ color: "var(--orange)", fontSize: "0.85rem" }}>{error}</p>
        ) : (
          <>
            <div className="picture-grid">
              {words.map((w) => (
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
                      <path d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.897 2.723 3.897 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z"/>
                    </svg>
                  </a>
                </div>
              ))}
            </div>

            {userText && (
              <div style={{ marginTop: "1rem", textAlign: "center", width: "100%" }}>
                <div className="chat-bubble learner" style={{ display: "inline-block", marginLeft: "auto", marginRight: "auto" }}>
                  <div className="speaker">You said</div>
                  {userText}
                </div>
              </div>
            )}

            {sending && (
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.75rem" }}>
                Evaluating...{" "}
                <span style={{ fontSize: "0.7rem" }}>(Esc to cancel)</span>
              </p>
            )}

            {feedback && (
              <div className={`picture-feedback ${feedback.correct ? "correct" : "incorrect"}`}>
                <div className="feedback-status">
                  {feedback.correct ? "Correct!" : "Needs work"}
                </div>
                <p>{feedback.feedback}</p>
                {feedback.example && (
                  <div className="feedback-example">
                    <span className="wireframe-label" style={{ marginTop: 0 }}>Example</span>
                    <p style={{ fontSize: "1.1rem", margin: "0.25rem 0 0" }}>{feedback.example}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="conv-footer">
        {DEV_MODE ? (
          <div className="dev-input">
            <input
              type="text"
              value={input}
              onInput={(e) => setInput((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              placeholder="Type Korean here (dev mode)..."
              disabled={sending}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary"
              onClick={() => {
                if (input.trim()) {
                  evaluate(input.trim());
                  setInput("");
                }
              }}
              disabled={sending || !input.trim()}
            >
              Send
            </button>
            {feedback && (
              <>
                <button
                  className="btn btn-outline"
                  onClick={() => { setFeedback(null); setUserText(null); }}
                >
                  Retry
                </button>
                <button
                  className="btn btn-success"
                  onClick={fetchWords}
                  disabled={loading}
                >
                  Next
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="ptt-bar">
            <span className={`ptt-state ${pttClass}`}>{pttLabel}</span>
            {pttState === "recording" && (
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--muted)",
                  marginLeft: "0.5rem",
                }}
              >
                Esc to cancel
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
