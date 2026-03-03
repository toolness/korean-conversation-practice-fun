# Korean Conversation Practice

## Running the server

```
uv run start                          # default: 127.0.0.1:8000
uv run start --port 8001 --reload     # custom port with auto-reload
uv run start --help                   # show all options
```

Add `?dev` to the URL for dev mode (text input instead of voice).

## Development

When testing the server (e.g. via curl or Chrome DevTools MCP), use port **8001** to avoid conflicting with the user's instance on port 8000:

```
CLAUDECODE= uv run start --port 8001
```

The `CLAUDECODE=` prefix is needed to avoid "cannot launch inside another Claude Code session" errors from the Claude Agent SDK.

## Testing

### Backend tests

Always add or update backend tests when making backend changes. Tests live in `tests/` and use pytest + pytest-asyncio.

```
uv run pytest
```

Follow the patterns in `tests/test_agent.py` — mock `_send_prompt` for classify/resolve tests, mock the client for `_send_prompt` tests.

### Frontend tests

Pure utility functions live in `static/utils.js` and are tested with Node's built-in test runner:

```
node --test static/utils.test.js
```

When adding or changing pure logic (non-DOM, non-Preact), extract it to `utils.js` and add tests.

### Verifying behavior with Chrome DevTools MCP

After implementing new or changed behavior, use Chrome DevTools MCP to verify it works end-to-end in the browser. Start a test server on port 8001 and interact with it to confirm the changes work as expected.
