# Korean Conversation Practice

A local web app for practicing Korean conversations tied to the [Active Korean](https://press.snu.ac.kr) workbook series. You speak Korean, the app transcribes your speech, and an AI conversation partner responds in character — correcting grammar mistakes along the way.

## How it works

- **Backend**: FastAPI serves a Preact frontend and handles API requests
- **AI partner**: Claude (via the Claude Agent SDK) plays the conversation partner, staying within textbook grammar and vocabulary
- **Speech-to-text**: whisper.cpp (`whisper-cli`) transcribes your Korean speech
- **Text-to-speech**: Browser SpeechSynthesis reads the partner's responses aloud (works best with the "Yuna" Korean voice on macOS)
- **Dev mode**: Add `?dev` to the URL to type instead of speak — useful for testing without a microphone

## Prerequisites

### Python 3.11+

```bash
# macOS (Homebrew)
brew install python@3.12
```

### uv (Python package manager)

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
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

# Install dependencies (creates .venv automatically)
uv sync
```

## Running

```bash
uv run start
```

Then open http://127.0.0.1:8000 in your browser.

### Options

```
uv run start --help           # show all options
uv run start --port 9000      # custom port
uv run start --reload         # auto-reload on file changes
```

### Dev mode

Open http://127.0.0.1:8000/?dev to use text input instead of voice. This is useful for:

- Testing without a microphone
- Debugging conversation flow
- Working on the frontend

## Usage

1. **Select a scenario** — currently Unit 9 (phone calls)
2. **Read the briefing** — your role, grammar points, key vocabulary
3. **Start the conversation** — hold Space to speak, release to send
4. Press **Escape** while recording to cancel, or while waiting for a response to retry

## Project structure

```
├── CLAUDE.md                          # Development notes
├── pyproject.toml                     # Python project config
├── src/korean_practice/
│   ├── main.py                        # FastAPI app + server entry point
│   ├── agent.py                       # Claude Agent SDK conversation manager
│   ├── stt.py                         # whisper-cli wrapper
│   └── scenarios/
│       ├── __init__.py                # Scenario base class + registry
│       ├── vocab.py                   # Vocabulary pools from Active Korean
│       └── unit9_phone.py             # Unit 9: phone call scenario
├── static/
│   ├── index.html
│   ├── app.js                         # Preact app (no build step)
│   ├── style.css
│   └── vendor/                        # Vendored Preact + htm ESM bundles
├── active-korean-vocabulary.md        # Vocabulary reference
└── project-brief.html                 # Original design brief
```
