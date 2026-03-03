import { h, render } from './vendor/preact.mjs';
import { useState, useEffect, useRef } from './vendor/preact-hooks.mjs';
import htm from './vendor/htm.mjs';

const html = htm.bind(h);

const DEV_MODE = new URLSearchParams(location.search).has('dev');

// ─── TTS ───────────────────────────────────────────────────────────────
const VOICE_PRIORITY = [
  /^yuna.*premium/i,
  /^yuna.*enhanced/i,
  /premium/i,
  /enhanced/i,
  /^yuna/i,
];

let _koreanVoice = null;

function findBestKoreanVoice() {
  const korean = speechSynthesis.getVoices().filter(v => v.lang.startsWith('ko'));
  for (const regex of VOICE_PRIORITY) {
    for (const v of korean) {
      if (regex.test(v.name)) return v;
    }
  }
  return korean[0] || null;
}

// Voices load async in Chrome; Firefox needs the load event
if ('speechSynthesis' in window) {
  const update = () => { _koreanVoice = findBestKoreanVoice(); };
  update();
  window.addEventListener('load', update);
  speechSynthesis.addEventListener('voiceschanged', update);
}

function speak(text) {
  if (DEV_MODE) {
    const log = document.getElementById('tts-log');
    if (log) {
      const entry = document.createElement('div');
      entry.textContent = `🔊 ${text}`;
      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;
    }
    return;
  }
  if (!_koreanVoice) _koreanVoice = findBestKoreanVoice();
  // Split into sentences to avoid browser TTS cutoff bugs
  const parts = text.split(/(?<=[.?!。])\s*/).filter(s => s.trim());
  for (const part of parts) {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = 'ko-KR';
    if (_koreanVoice) u.voice = _koreanVoice;
    speechSynthesis.speak(u);
  }
}

function replay(text) {
  speechSynthesis.cancel();
  speak(text);
}

// ─── API helpers ───────────────────────────────────────────────────────
async function fetchScenarios() {
  const res = await fetch('/api/scenarios');
  return res.json();
}

async function startScenario(id) {
  const res = await fetch(`/api/scenarios/${id}/start`, { method: 'POST' });
  return res.json();
}

async function sendChat(text, sessionId, signal, onEvent) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, session_id: sessionId }),
    signal,
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop();
    for (const part of parts) {
      if (part.startsWith('data: ')) {
        onEvent(JSON.parse(part.slice(6)));
      }
    }
  }
}

async function transcribeAudio(blob, prompt) {
  const form = new FormData();
  form.append('file', blob, 'recording.wav');
  if (prompt) form.append('prompt', prompt);
  const res = await fetch('/api/transcribe', { method: 'POST', body: form });
  const data = await res.json();
  return data.text;
}

// ─── Audio helpers ────────────────────────────────────────────────────
function downsample(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const newLen = Math.round(samples.length / ratio);
  const result = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    result[i] = samples[Math.round(i * ratio)];
  }
  return result;
}

function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  function writeStr(offset, str) { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); }
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// ─── Scenario Select Screen ───────────────────────────────────────────
function ScenarioSelect({ onSelect }) {
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScenarios().then(s => { setScenarios(s); setLoading(false); });
  }, []);

  if (loading) return html`<p>Loading scenarios...</p>`;

  // Group by unit
  const byUnit = {};
  for (const s of scenarios) {
    if (!byUnit[s.unit]) byUnit[s.unit] = [];
    byUnit[s.unit].push(s);
  }

  return html`
    <div>
      <h1>Korean Conversation Practice</h1>
      <p class="subtitle">Choose a scenario to practice</p>
      ${Object.entries(byUnit).map(([unit, items]) => html`
        <div key=${unit}>
          <div class="wireframe-label">Unit ${unit}</div>
          ${items.map(s => html`
            <div class="scenario-card" key=${s.id} onClick=${() => onSelect(s.id)}>
              <span class="unit-badge">U${s.unit}</span> ${s.title}
              <div class="grammar-tags">Grammar: ${s.grammar.join(', ')}</div>
            </div>
          `)}
        </div>
      `)}
    </div>
  `;
}


// ─── Conversation Screen ──────────────────────────────────────────────
function Conversation({ briefing, onEnd }) {
  // Messages: { role, text, hints? }
  // Hints are attached to the learner message they pertain to
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [pttState, setPttState] = useState('idle');
  const [completed, setCompleted] = useState(false);
  const [awaitingStart, setAwaitingStart] = useState(!!briefing.auto_start);
  const awaitingStartRef = useRef(!!briefing.auto_start);
  const pendingTTSRef = useRef([]);
  const chatEndRef = useRef(null);
  const recRef = useRef(null);
  const abortRef = useRef(null);

  // Smooth scroll to bottom when messages change
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, sending]);

  // Keyboard listeners
  useEffect(() => {
    function onKeyDown(e) {
      if (e.repeat) return;
      if (e.key === 'Escape' && sending) {
        e.preventDefault();
        cancelSend();
      } else if (!DEV_MODE && e.key === ' ' && pttState === 'idle' && !sending) {
        e.preventDefault();
        startRecording();
      } else if (!DEV_MODE && e.key === 'Escape' && pttState === 'recording') {
        e.preventDefault();
        cancelRecording();
      }
    }

    function onKeyUp(e) {
      if (!DEV_MODE && e.key === ' ' && pttState === 'recording') {
        e.preventDefault();
        stopAndSendRecording();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [pttState, sending, sessionId]);

  // Auto-start: trigger agent to speak first for agent-initiated roles
  useEffect(() => {
    if (briefing.auto_start) {
      handleSend('[START]');
    }
  }, []);

  function cancelSend() {
    if (abortRef.current) abortRef.current.abort();
    // Remove the last learner message
    setMessages(prev => {
      const last = prev.length - 1;
      if (last >= 0 && prev[last].role === 'learner') return prev.slice(0, last);
      return prev;
    });
    setSending(false);
  }

  function handleAutoStart() {
    awaitingStartRef.current = false;
    setAwaitingStart(false);
    for (const text of pendingTTSRef.current) {
      speak(text);
    }
    pendingTTSRef.current = [];
  }

  async function startRecording() {
    setPttState('recording');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      const chunks = [];

      processor.onaudioprocess = (e) => {
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      recRef.current = { stream, audioCtx, source, processor, chunks };
    } catch (err) {
      console.error('Mic access error:', err);
      setPttState('idle');
    }
  }

  function cancelRecording() {
    const rec = recRef.current;
    if (rec) {
      rec.processor.disconnect();
      rec.source.disconnect();
      rec.audioCtx.close();
      rec.stream.getTracks().forEach(t => t.stop());
      recRef.current = null;
    }
    setPttState('idle');
  }

  async function stopAndSendRecording() {
    const rec = recRef.current;
    if (!rec) return;

    const sampleRate = rec.audioCtx.sampleRate;

    rec.processor.disconnect();
    rec.source.disconnect();
    rec.audioCtx.close();
    rec.stream.getTracks().forEach(t => t.stop());
    recRef.current = null;

    const totalLen = rec.chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of rec.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    if (totalLen < sampleRate * 0.3) {
      setPttState('idle');
      return;
    }

    setPttState('processing');

    try {
      const targetRate = 16000;
      const downsampled = downsample(merged, sampleRate, targetRate);
      const wavBlob = encodeWAV(downsampled, targetRate);
      const names = [briefing.context.caller_name, briefing.context.friend_name].filter(Boolean).join(', ');
      const prompt = `여보세요, 거기 ${briefing.context.friend_name || ''} 씨 집이지요? ${names}`;
      const text = await transcribeAudio(wavBlob, prompt);
      setPttState('idle');
      if (text && text.trim()) {
        handleSend(text.trim());
      }
    } catch (err) {
      console.error('Transcription error:', err);
      setPttState('idle');
    }
  }

  function addHintToLastLearner(hint) {
    setMessages(prev => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'learner') {
          copy[i] = { ...copy[i], hints: [...(copy[i].hints || []), hint] };
          break;
        }
      }
      return copy;
    });
  }

  async function handleSend(text) {
    if (!text.trim() || sending) return;
    const userText = text.trim();
    setInput('');
    setSending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Don't show [START] trigger as a learner message
    if (userText !== '[START]') {
      setMessages(prev => [...prev, { role: 'learner', text: userText, hints: [] }]);
    }

    try {
      await sendChat(userText, sessionId, controller.signal, (event) => {
        if (event.type === 'session_id') {
          setSessionId(event.session_id);
        } else if (event.type === 'speak') {
          setMessages(prev => [...prev, { role: 'partner', text: event.text }]);
          if (awaitingStartRef.current) {
            pendingTTSRef.current.push(event.text);
          } else {
            speak(event.text);
          }
        } else if (event.type === 'correct') {
          addHintToLastLearner(event.hint);
        } else if (event.type === 'complete') {
          setCompleted(true);
        }
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { role: 'partner', text: '(Connection error — try again)' }]);
    }
    abortRef.current = null;
    setSending(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  }

  const pttLabel = pttState === 'recording' ? 'Recording... release Space to send'
    : pttState === 'processing' ? 'Converting speech...'
    : 'Hold Space to speak';
  const pttClass = pttState === 'recording' ? 'ptt-recording'
    : pttState === 'processing' ? 'ptt-processing'
    : 'ptt-idle';

  return html`
    <div class="conv-layout">
      <div class="conv-header">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; border: none; padding: 0; font-size: 1.1rem;">${briefing.title}</h2>
          <button class="btn btn-outline" style="padding: 0.3rem 0.75rem; font-size: 0.8rem;" onClick=${onEnd}>End</button>
        </div>
        <div class="context-bar">
          <strong>${briefing.context.role}</strong> — ${briefing.context.detail}
        </div>
        <details class="briefing-details">
          <summary>Briefing</summary>
          <div class="wireframe-label">Grammar points</div>
          <p style="font-size: 0.85rem; margin: 0.25rem 0 0;">${briefing.grammar.join(' · ')}</p>
          ${briefing.key_vocab && html`
            <div>
              <div class="wireframe-label">Key vocabulary</div>
              <div>
                ${briefing.key_vocab.map(([kr, en]) => html`
                  <span class="vocab-pill" key=${kr}>${kr} — ${en}</span>
                `)}
              </div>
            </div>
          `}
        </details>
      </div>

      <div class="conv-messages">
        ${messages.length === 0 && !sending && html`
          <p style="color: var(--muted); font-size: 0.85rem; text-align: center; padding: 2rem 0;">
            ${briefing.start_hint || 'Start the conversation!'}
          </p>
        `}
        ${messages.map((m, i) => html`
          <div key=${i}>
            <div class="chat-bubble ${m.role}">
              <div class="speaker">${m.role === 'partner' ? 'Partner' : 'You'}</div>
              ${m.text}
              ${m.role === 'partner' && html`
                <button class="replay-btn" onClick=${() => replay(m.text)} title="Replay">${"\u25B6"}</button>
              `}
            </div>
            ${m.hints && m.hints.length > 0 && html`
              <div class="correction-panel">
                <div class="correction-title">Hint</div>
                ${m.hints.map((h, j) => html`<p key=${j}>${h}</p>`)}
              </div>
            `}
          </div>
        `)}
        ${sending && html`
          <div style="color: var(--muted); font-size: 0.8rem; padding: 0.25rem 0.5rem;">Thinking... <span style="font-size: 0.7rem;">(Esc to cancel)</span></div>
        `}
        <div ref=${chatEndRef}></div>
      </div>

      <div class="conv-footer">
        ${completed ? html`
          <div style="text-align: center; padding: 1rem 0;">
            <div style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem;">Conversation complete!</div>
            <div style="font-size: 0.85rem; color: var(--muted);">Nice work. Choose another scenario to keep practicing.</div>
          </div>
        ` : awaitingStart ? html`
          <div style="text-align: center; padding: 1rem 0;">
            <button
              class="btn btn-success"
              style="font-size: 1rem; padding: 0.5rem 1.5rem;"
              autoFocus
              onClick=${handleAutoStart}
            >Start</button>
          </div>
        ` : DEV_MODE ? html`
          <div class="dev-input">
            <input
              type="text"
              value=${input}
              onInput=${e => setInput(e.target.value)}
              onKeyDown=${handleKeyDown}
              placeholder="Type Korean here (dev mode)..."
              disabled=${sending}
              style="flex: 1;"
            />
            <button
              class="btn btn-primary"
              onClick=${() => handleSend(input)}
              disabled=${sending || !input.trim()}
            >Send</button>
          </div>
        ` : html`
          <div class="ptt-bar">
            <span class="ptt-state ${pttClass}">${pttLabel}</span>
            ${pttState === 'recording' && html`
              <span style="font-size: 0.75rem; color: var(--muted); margin-left: 0.5rem;">Esc to cancel</span>
            `}
          </div>
        `}

        ${DEV_MODE && html`
          <div class="tts-log-container">
            <div class="wireframe-label">TTS Log (dev mode)</div>
            <div id="tts-log"></div>
          </div>
        `}
        <div style="margin-top: 0.5rem;">
          <button class="btn btn-outline" style="font-size: 0.6rem; padding: 0.15rem 0.5rem;"
            onClick=${() => {
              console.log('TTS test. Voice:', _koreanVoice?.name || 'none found', 'Voices:', speechSynthesis.getVoices().filter(v => v.lang.startsWith('ko')).map(v => v.name));
              replay('안녕하세요. 테스트입니다.');
            }}>Test TTS</button>
          <span style="font-size: 0.6rem; color: var(--muted); margin-left: 0.5rem;">Voice: ${_koreanVoice ? _koreanVoice.name : 'none found'}</span>
        </div>
      </div>
    </div>
  `;
}

// ─── Hash Router ──────────────────────────────────────────────────────
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  if (!h) return { screen: 'select', scenarioId: null };
  const [screen, scenarioId] = h.split('/');
  const s = screen || 'select';
  return { screen: s === 'briefing' ? 'conversation' : s, scenarioId: scenarioId || null };
}

function navigate(screen, scenarioId) {
  if (screen === 'select') {
    history.pushState(null, '', location.pathname + location.search);
  } else {
    history.pushState(null, '', location.pathname + location.search + `#${screen}/${scenarioId}`);
  }
}

function App() {
  const initial = parseHash();
  const [screen, setScreen] = useState(initial.screen);
  const [scenarioId, setScenarioId] = useState(initial.scenarioId);
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(!!initial.scenarioId);

  // On first load, if URL has a scenario, fetch its briefing
  useEffect(() => {
    if (initial.scenarioId) {
      startScenario(initial.scenarioId).then(b => {
        setBriefing(b);
        setLoading(false);
      });
    }
  }, []);

  // Listen for back/forward navigation
  useEffect(() => {
    function onPopState() {
      const { screen: s, scenarioId: sid } = parseHash();
      setScreen(s);
      setScenarioId(sid);
      if (sid && (!briefing || briefing.id !== sid)) {
        startScenario(sid).then(b => setBriefing(b));
      }
      if (!sid) setBriefing(null);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [briefing]);

  async function handleSelect(id) {
    const b = await startScenario(id);
    setBriefing(b);
    setScenarioId(id);
    setScreen('conversation');
    navigate('conversation', id);
  }

  function handleBack() {
    setScreen('select');
    setBriefing(null);
    setScenarioId(null);
    navigate('select');
  }

  if (loading) return html`<p>Loading...</p>`;

  let content;
  switch (screen) {
    case 'select':
      content = html`<${ScenarioSelect} onSelect=${handleSelect} />`;
      break;
    case 'conversation':
      content = html`<${Conversation} briefing=${briefing} onEnd=${handleBack} />`;
      break;
  }

  return content;
}

render(html`<${App} />`, document.getElementById('app'));
