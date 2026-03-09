/** Side-effect executor for the pipeline state machine. */

import type { PipelineEvent, PipelineEffect, Feedback } from "../engine/pipeline-types";
import { buildEvalPrompt, buildChatPrompt } from "../engine/pipeline-prompts";
import { downsample, encodeWAV } from "../utils/audio";

interface RecordingState {
  stream: MediaStream;
  audioCtx: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  chunks: Float32Array[];
}

export function parseFeedback(text: string): Feedback {
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

async function transcribeAudio(blob: Blob, prompt?: string): Promise<string> {
  const form = new FormData();
  form.append("file", blob, "recording.wav");
  if (prompt) form.append("prompt", prompt);
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  const data = await res.json();
  return data.text;
}

export function createEffectExecutor(dispatch: (e: PipelineEvent) => void) {
  const abortControllers = new Map<string, AbortController>();
  let recording: RecordingState | null = null;

  return function executeEffect(effect: PipelineEffect) {
    switch (effect.type) {
      case "LOAD_VOCAB": {
        fetch("/api/vocab/all")
          .then((r) => r.json())
          .then((data) => {
            dispatch(
              data.items
                ? { type: "VOCAB_LOADED", items: data.items }
                : { type: "VOCAB_LOAD_FAILED", error: "No vocabulary available" }
            );
          })
          .catch(() => {
            dispatch({ type: "VOCAB_LOAD_FAILED", error: "Could not load vocabulary" });
          });
        break;
      }

      case "START_RECORDING": {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(stream);
            const processor = audioCtx.createScriptProcessor(4096, 1, 1);
            const chunks: Float32Array[] = [];

            processor.onaudioprocess = (e) => {
              chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
            };

            source.connect(processor);
            processor.connect(audioCtx.destination);

            recording = { stream, audioCtx, source, processor, chunks };
          })
          .catch((err) => {
            console.error("Mic access error:", err);
            dispatch({ type: "STT_FAILED", error: "Microphone access denied" });
          });
        break;
      }

      case "STOP_RECORDING_AND_TRANSCRIBE": {
        const rec = recording;
        if (!rec) return;

        const sampleRate = rec.audioCtx.sampleRate;
        rec.processor.disconnect();
        rec.source.disconnect();
        rec.audioCtx.close();
        rec.stream.getTracks().forEach((t) => t.stop());
        recording = null;

        const totalLen = rec.chunks.reduce((sum, c) => sum + c.length, 0);
        const merged = new Float32Array(totalLen);
        let offset = 0;
        for (const chunk of rec.chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }

        if (totalLen < sampleRate * 0.3) {
          dispatch({ type: "STT_FAILED", error: "Recording too short" });
          return;
        }

        const targetRate = 16000;
        const downsampled = downsample(merged, sampleRate, targetRate);
        const wavBlob = encodeWAV(downsampled, targetRate);
        transcribeAudio(wavBlob, effect.sttHint)
          .then((text) => {
            if (text && text.trim()) {
              dispatch({ type: "STT_RESULT", transcript: text.trim() });
            } else {
              dispatch({ type: "STT_FAILED", error: "No speech detected" });
            }
          })
          .catch(() => {
            dispatch({ type: "STT_FAILED", error: "Transcription failed" });
          });
        break;
      }

      case "CANCEL_RECORDING": {
        if (recording) {
          recording.processor.disconnect();
          recording.source.disconnect();
          recording.audioCtx.close();
          recording.stream.getTracks().forEach((t) => t.stop());
          recording = null;
        }
        break;
      }

      case "EVALUATE": {
        const controller = new AbortController();
        abortControllers.set(effect.abortId, controller);
        const prompt = buildEvalPrompt(effect.session);
        fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        })
          .then((r) => r.json())
          .then((data) => {
            abortControllers.delete(effect.abortId);
            if (data.text) {
              dispatch({
                type: "EVAL_COMPLETE",
                sessionId: effect.session.sessionId,
                feedback: parseFeedback(data.text),
              });
            } else {
              dispatch({
                type: "EVAL_FAILED",
                sessionId: effect.session.sessionId,
                error: "LLM returned empty response",
              });
            }
          })
          .catch((err) => {
            abortControllers.delete(effect.abortId);
            if (err instanceof DOMException && err.name === "AbortError") return;
            dispatch({
              type: "EVAL_FAILED",
              sessionId: effect.session.sessionId,
              error: "LLM evaluation failed",
            });
          });
        break;
      }

      case "ABORT_EVAL": {
        abortControllers.get(effect.abortId)?.abort();
        abortControllers.delete(effect.abortId);
        break;
      }

      case "SEND_CHAT": {
        const controller = new AbortController();
        abortControllers.set(effect.abortId, controller);
        const prompt = buildChatPrompt(effect.session, effect.text);
        fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        })
          .then((r) => r.json())
          .then((data) => {
            abortControllers.delete(effect.abortId);
            dispatch({
              type: "CHAT_RESPONSE",
              sessionId: effect.session.sessionId,
              text: data.text || "No response",
            });
          })
          .catch((err) => {
            abortControllers.delete(effect.abortId);
            if (err instanceof DOMException && err.name === "AbortError") return;
            dispatch({
              type: "CHAT_FAILED",
              sessionId: effect.session.sessionId,
              error: "Chat request failed",
            });
          });
        break;
      }
    }
  };
}
