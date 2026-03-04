import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Briefing } from "../scenarios/index";
import type { AgentEvent } from "../engine/runner";
import { ScriptRunner } from "../engine/runner";
import { resolveScript } from "../engine/resolve";
import { getScenario } from "../scenarios/index";
import { EasyModeToggle } from "./easy-mode-toggle";
import { speak, replay, getVoiceName } from "../utils/tts";
import { downsample, encodeWAV } from "../utils/audio";

const DEV_MODE = typeof window !== "undefined" && new URLSearchParams(location.search).has("dev");

interface Message {
  role: "partner" | "learner";
  text: string;
  hints?: string[];
}

interface Props {
  scenarioId: string;
  briefing: Briefing;
  onEnd: () => void;
  easyMode: boolean;
  onToggleEasy: () => void;
}

async function transcribeAudio(blob: Blob, prompt?: string): Promise<string> {
  const form = new FormData();
  form.append("file", blob, "recording.wav");
  if (prompt) form.append("prompt", prompt);
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  const data = await res.json();
  return data.text;
}

export function Conversation({
  scenarioId,
  briefing,
  onEnd,
  easyMode,
  onToggleEasy,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pttState, setPttState] = useState<"idle" | "recording" | "processing">("idle");
  const [expectedText, setExpectedText] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [awaitingStart, setAwaitingStart] = useState(!!briefing.auto_start);
  const [loading, setLoading] = useState(true);
  const awaitingStartRef = useRef(!!briefing.auto_start);
  const pendingTTSRef = useRef<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<{
    stream: MediaStream;
    audioCtx: AudioContext;
    source: MediaStreamAudioSourceNode;
    processor: ScriptProcessorNode;
    chunks: Float32Array[];
  } | null>(null);
  const runnerRef = useRef<ScriptRunner | null>(null);

  // Initialize: resolve script and create runner
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const scenario = getScenario(scenarioId);
      // Override context from briefing (the briefing was already setup with randomized context)
      const script = await resolveScript(scenario);
      if (cancelled) return;
      const runner = new ScriptRunner(scenario, script, easyMode);
      runnerRef.current = runner;
      setLoading(false);

      // Auto-start or easy mode: trigger [START]
      if (briefing.auto_start || easyMode) {
        await processEvents(runner.handleStart());
      }
    }

    init().catch(console.error);
    return () => { cancelled = true; };
  }, [scenarioId]);

  async function processEvents(gen: AsyncGenerator<AgentEvent>) {
    setSending(true);
    for await (const event of gen) {
      if (event.type === "speak") {
        setExpectedText(null);
        setMessages((prev) => [...prev, { role: "partner", text: event.text! }]);
        if (awaitingStartRef.current) {
          pendingTTSRef.current.push(event.text!);
        } else {
          speak(event.text!, DEV_MODE);
        }
      } else if (event.type === "correct") {
        addHintToLastLearner(event.hint!);
      } else if (event.type === "expect") {
        setExpectedText(event.text!);
      } else if (event.type === "complete") {
        setExpectedText(null);
        setCompleted(true);
      }
    }
    setSending(false);
  }

  // Smooth scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // Keyboard listeners
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      if (e.key === "Escape" && sending) {
        e.preventDefault();
        // Cancel not applicable in frontend-driven model
      } else if (
        !DEV_MODE &&
        e.key === " " &&
        pttState === "idle" &&
        !sending &&
        !awaitingStartRef.current &&
        !loading
      ) {
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
  }, [pttState, sending, loading]);

  function handleAutoStart() {
    awaitingStartRef.current = false;
    setAwaitingStart(false);
    for (const text of pendingTTSRef.current) {
      speak(text, DEV_MODE);
    }
    pendingTTSRef.current = [];
  }

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
      const ctx = briefing.context || {};
      const names = [ctx.caller_name, ctx.friend_name].filter(Boolean).join(", ");
      const prompt = names
        ? `여보세요, 거기 ${ctx.friend_name || ""} 씨 집이지요? ${names}`
        : "한국어";
      const text = await transcribeAudio(wavBlob, prompt);
      setPttState("idle");
      if (text && text.trim()) {
        handleSend(text.trim());
      }
    } catch (err) {
      console.error("Transcription error:", err);
      setPttState("idle");
    }
  }

  function addHintToLastLearner(hint: string) {
    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "learner") {
          copy[i] = { ...copy[i], hints: [...(copy[i].hints || []), hint] };
          break;
        }
      }
      return copy;
    });
  }

  async function handleSend(text: string) {
    if (!text.trim() || sending || !runnerRef.current) return;
    const userText = text.trim();
    setInput("");

    // Scratchpad: just display transcribed text
    if (briefing.scratchpad) {
      setMessages((prev) => [...prev, { role: "learner", text: userText, hints: [] }]);
      return;
    }

    setMessages((prev) => [...prev, { role: "learner", text: userText, hints: [] }]);
    await processEvents(runnerRef.current.handleInput(userText));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  }

  const pttLabel =
    pttState === "recording"
      ? "Recording... release Space to send"
      : pttState === "processing"
        ? "Converting speech..."
        : "Hold Space to speak";
  const pttClass =
    pttState === "recording"
      ? "ptt-recording"
      : pttState === "processing"
        ? "ptt-processing"
        : "ptt-idle";

  if (loading) {
    return <p style={{ textAlign: "center", padding: "2rem 0", color: "var(--muted)" }}>Loading conversation...</p>;
  }

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
        <EasyModeToggle easyMode={easyMode} onToggle={onToggleEasy} />
        {!briefing.scratchpad && (
          <>
            <div className="context-bar">
              <strong>{briefing.context.role}</strong> — {briefing.context.detail}
            </div>
            <details className="briefing-details">
              <summary>Briefing</summary>
              <div className="wireframe-label">Grammar points</div>
              <p style={{ fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
                {briefing.grammar.join(" · ")}
              </p>
              {briefing.key_vocab && (
                <div>
                  <div className="wireframe-label">Key vocabulary</div>
                  <div>
                    {briefing.key_vocab.map(([kr, en]) => (
                      <span className="vocab-pill" key={kr}>
                        {kr} — {en}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </details>
          </>
        )}
      </div>

      <div className="conv-messages">
        {messages.length === 0 && !sending && (
          <p
            style={{
              color: "var(--muted)",
              fontSize: "0.85rem",
              textAlign: "center",
              padding: "2rem 0",
            }}
          >
            {briefing.start_hint || "Start the conversation!"}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <div className={`chat-bubble ${m.role}`}>
              <div className="speaker">{m.role === "partner" ? "Partner" : "You"}</div>
              {m.text}
              {m.role === "partner" && (
                <button
                  className="replay-btn"
                  onClick={() => replay(m.text, DEV_MODE)}
                  title="Replay"
                >
                  {"\u25B6"}
                </button>
              )}
            </div>
            {m.hints && m.hints.length > 0 && (
              <div className="correction-panel">
                <div className="correction-title">Hint</div>
                {m.hints.map((h, j) => (
                  <p key={j}>{h}</p>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div
            style={{
              color: "var(--muted)",
              fontSize: "0.8rem",
              padding: "0.25rem 0.5rem",
            }}
          >
            Thinking...
          </div>
        )}
        <div ref={chatEndRef}></div>
      </div>

      <div className="conv-footer">
        {easyMode && expectedText && (
          <div
            style={{
              background: "var(--bg-alt, #f0f4f8)",
              border: "1px solid var(--border, #ddd)",
              borderRadius: "0.5rem",
              padding: "0.5rem 0.75rem",
              marginBottom: "0.5rem",
            }}
          >
            <div className="wireframe-label">Say this:</div>
            <div
              style={{
                fontSize: "1.3rem",
                textAlign: "center",
                padding: "0.25rem 0",
                fontWeight: 500,
              }}
            >
              {expectedText}
            </div>
          </div>
        )}
        {completed && !briefing.scratchpad ? (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.25rem" }}>
              Conversation complete!
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Nice work. Choose another scenario to keep practicing.
            </div>
          </div>
        ) : awaitingStart ? (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <button
              className="btn btn-success"
              style={{ fontSize: "1rem", padding: "0.5rem 1.5rem" }}
              autoFocus
              onClick={handleAutoStart}
            >
              Start
            </button>
          </div>
        ) : DEV_MODE ? (
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
              onClick={() => handleSend(input)}
              disabled={sending || !input.trim()}
            >
              Send
            </button>
          </div>
        ) : sending && !runnerRef.current ? (
          <div
            style={{
              textAlign: "center",
              padding: "1rem 0",
              fontSize: "0.85rem",
              color: "var(--muted)",
            }}
          >
            Loading conversation...
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

        {DEV_MODE && (
          <div className="tts-log-container">
            <div className="wireframe-label">TTS Log (dev mode)</div>
            <div id="tts-log"></div>
          </div>
        )}
        <div style={{ marginTop: "0.5rem" }}>
          <button
            className="btn btn-outline"
            style={{ fontSize: "0.6rem", padding: "0.15rem 0.5rem" }}
            onClick={() => {
              console.log("TTS test. Voice:", getVoiceName());
              replay("안녕하세요. 테스트입니다.", DEV_MODE);
            }}
          >
            Test TTS
          </button>
          <span
            style={{
              fontSize: "0.6rem",
              color: "var(--muted)",
              marginLeft: "0.5rem",
            }}
          >
            Voice: {getVoiceName()}
          </span>
        </div>
      </div>
    </div>
  );
}
