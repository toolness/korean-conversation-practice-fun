# Korean Conversation Practice

A local web app for practicing Korean conversations tied to the [Active Korean](https://press.snu.ac.kr) workbook series. You speak Korean, the app transcribes your speech, and an AI conversation partner responds in character — correcting grammar mistakes along the way.

## How it works

- **Frontend**: React + TypeScript, bundled with Bun. Owns all conversation state — scenarios, script runner, and prompt building all run in the browser.
- **Backend**: Hono server on Bun. Thin proxy with two endpoints: `/api/llm` (Claude via Agent SDK) and `/api/transcribe` (whisper-cli).
- **AI partner**: Claude (via the Claude Agent SDK) plays the conversation partner, staying within textbook grammar and vocabulary
- **Speech-to-text**: whisper.cpp (`whisper-cli`) transcribes your Korean speech
- **Text-to-speech**: Browser SpeechSynthesis reads the partner's responses aloud (works best with the "Yuna" Korean voice on macOS)
- **Dev mode**: Add `?dev` to the URL to type instead of speak — useful for testing without a microphone

## Prerequisites

### Bun

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

### whisper.cpp (for speech-to-text)

```bash
# macOS (Homebrew)
brew install whisper-cpp
```

You also need a whisper model file. The app looks for it in `whisper-models/` in the project directory by default. Browse available models at https://huggingface.co/ggerganov/whisper.cpp/tree/main.

```bash
# Download the recommended model (~1.5 GB)
mkdir -p whisper-models
curl -L -o whisper-models/ggml-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
```

Or point to a model elsewhere:

```bash
export WHISPER_MODEL=/path/to/your/ggml-model.bin
```

### Anthropic API key

The AI conversation partner uses Claude. You need an API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Setup

```bash
git clone <repo-url>
cd korean-conversation-practice-fun

# Install dependencies
bun install

# Build frontend
bun run build
```

## Running

```bash
bun run start
```

Then open http://localhost:8000 in your browser.

### Options

```
bun run start --port 9000      # custom port
```

### Dev mode

Open http://localhost:8000/?dev to use text input instead of voice. This is useful for:

- Testing without a microphone
- Debugging conversation flow
- Working on the frontend

## Usage

1. **Select a scenario** — currently Unit 9 (phone calls) + STT Scratchpad
2. **Read the briefing** — your role, grammar points, key vocabulary
3. **Start the conversation** — hold Space to speak, release to send
4. Press **Escape** while recording to cancel

## Adding new scenarios

Create a new file in `src/scenarios/` following the pattern in `unit9-phone.ts`:

1. Define a factory function that returns a `Scenario` object
2. Call `register(factory)` at module level
3. Import the module in `src/scenarios/registry.ts` (in `ensureScenariosLoaded`)

Each scenario defines:
- `id`, `unit`, `title`, `grammar` — metadata
- `roles()` — for multi-role scenarios (e.g., caller/answerer)
- `setup()` — randomize context
- `conversationScript()` — sequence of `ScriptStep` objects
- `briefing()` — context shown to the learner

## Project structure

```
server/
  index.ts              — Hono server, static files, CLI
  llm.ts                — /api/llm endpoint + Claude SDK client
  stt.ts                — /api/transcribe endpoint + whisper-cli
  cache.ts              — file-based LLM cache
  mutex.ts              — async mutex for serializing LLM calls
src/
  index.tsx             — React entry
  app.tsx               — Router, global state
  components/
    scenario-select.tsx — Scenario list with unit grouping
    conversation.tsx    — Chat UI, message list, input handling
    easy-mode-toggle.tsx
  engine/
    runner.ts           — ScriptRunner (conversation state machine)
    resolve.ts          — resolveScript (LLM call)
    classify.ts         — classify utterance (LLM call)
    prompts.ts          — prompt templates
  scenarios/
    index.ts            — types, re-exports
    registry.ts         — scenario registry
    vocab.ts            — vocabulary data
    unit9-phone.ts      — Unit 9 phone call scenario
    scratchpad.ts       — STT scratchpad
  utils/
    audio.ts            — downsample, WAV encoding
    routing.ts          — hash router
    tts.ts              — text-to-speech
    hangul.ts           — Korean text utilities
public/
  index.html
  style.css
```
