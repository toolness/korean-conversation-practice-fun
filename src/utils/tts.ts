/** Text-to-speech utilities for Korean. */

const VOICE_PRIORITY = [
  /^yuna.*premium/i,
  /^yuna.*enhanced/i,
  /premium/i,
  /enhanced/i,
  /^yuna/i,
];

let koreanVoice: SpeechSynthesisVoice | null = null;

function findBestKoreanVoice(): SpeechSynthesisVoice | null {
  const korean = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("ko"));
  for (const regex of VOICE_PRIORITY) {
    for (const v of korean) {
      if (regex.test(v.name)) return v;
    }
  }
  return korean[0] || null;
}

// Voices load async in Chrome; Firefox needs the load event
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  const update = () => {
    koreanVoice = findBestKoreanVoice();
  };
  update();
  window.addEventListener("load", update);
  speechSynthesis.addEventListener("voiceschanged", update);
}

export function getVoiceName(): string {
  return koreanVoice?.name || "none found";
}

export function speak(text: string, devMode = false): void {
  if (devMode) {
    const log = document.getElementById("tts-log");
    if (log) {
      const entry = document.createElement("div");
      entry.textContent = `🔊 ${text}`;
      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;
    }
    return;
  }
  if (!koreanVoice) koreanVoice = findBestKoreanVoice();
  // Split into sentences to avoid browser TTS cutoff bugs
  const parts = text.split(/(?<=[.?!。])\s*/).filter((s) => s.trim());
  for (const part of parts) {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = "ko-KR";
    if (koreanVoice) u.voice = koreanVoice;
    speechSynthesis.speak(u);
  }
}

export function replay(text: string, devMode = false): void {
  speechSynthesis.cancel();
  speak(text, devMode);
}
