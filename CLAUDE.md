# Korean Conversation Practice

## Architecture

- **Frontend** (React + TypeScript): Owns all conversation state. Scenarios, script runner, and prompt building all live in the browser.
- **Backend** (Hono + Bun): Thin proxy — two endpoints (`/api/llm` for Claude, `/api/transcribe` for whisper-cli). No conversation state, no sessions.

## Running the server

```
bun run build && bun run start              # default: port 8000
bun run start --port 8001                   # custom port
```

Add `?dev` to the URL for dev mode (text input instead of voice).

## Development

When testing the server (e.g. via curl or Chrome DevTools MCP), use port **8001** to avoid conflicting with the user's instance on port 8000:

```
CLAUDECODE= bun run build && CLAUDECODE= bun run start --port 8001
```

The `CLAUDECODE=` prefix is needed to avoid "cannot launch inside another Claude Code session" errors from the Claude Agent SDK.

After making frontend changes, run `bun run build` to rebundle.

## Testing

All tests use Bun's built-in test runner:

```
bun test
```

Test locations:
- `server/__tests__/` — backend (cache, etc.)
- `src/engine/__tests__/` — conversation engine (runner, classify)
- `src/scenarios/__tests__/` — scenario definitions
- `src/utils/__tests__/` — utilities (audio, routing, hangul)

When adding or changing logic, add tests. Mock `classify` for runner tests, mock `fetch` for resolve/classify tests.

### Verifying behavior with Chrome DevTools MCP

After implementing new or changed behavior, use Chrome DevTools MCP to verify it works end-to-end in the browser. Start a test server on port 8001 and interact with it to confirm the changes work as expected.
