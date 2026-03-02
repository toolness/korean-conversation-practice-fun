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
