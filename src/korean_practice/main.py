import asyncio
import json
import logging
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from korean_practice.agent import boot_client, conversation_manager, shutdown_client
from korean_practice.scenarios import get_scenario, list_scenarios
from korean_practice.stt import transcribe

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static"

# Keep track of which scenario is active per session
_active_scenarios: dict[str, object] = {}

app = FastAPI()


@app.on_event("startup")
async def startup():
    await boot_client()


@app.on_event("shutdown")
async def shutdown():
    await shutdown_client()


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/scenarios")
async def scenarios():
    return list_scenarios()


@app.post("/api/scenarios/{scenario_id}/start")
async def start_scenario(scenario_id: str):
    scenario = get_scenario(scenario_id)
    # Store the scenario so /api/chat can use it for first message
    _active_scenarios[scenario_id] = scenario
    b = scenario.briefing()
    b["id"] = scenario_id  # use registry key, not base class id
    return b


@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    text = body.get("text", "")
    session_id = body.get("session_id")
    scenario_id = body.get("scenario_id")
    easy_mode = body.get("easy_mode", False)

    log.info("chat request: session_id=%r scenario_id=%r text=%s", session_id, scenario_id, text[:50])

    # If no session exists, start a new one
    if not session_id:
        # Prefer the already-setup scenario from _active_scenarios (matches briefing context)
        if scenario_id and scenario_id in _active_scenarios:
            scenario = _active_scenarios[scenario_id]
        elif scenario_id:
            scenario = get_scenario(scenario_id)
        elif _active_scenarios:
            scenario_id = list(_active_scenarios.keys())[-1]
            scenario = _active_scenarios[scenario_id]
        else:
            async def empty():
                yield 'data: {"type": "done"}\n\n'
            return StreamingResponse(empty(), media_type="text/event-stream")
        session_id = await conversation_manager.start(scenario, easy_mode=easy_mode)

    async def generate():
        yield f"data: {json.dumps({'type': 'session_id', 'session_id': session_id})}\n\n"
        async for event in conversation_manager.stream(session_id, text):
            if event.type == "speak":
                yield f"data: {json.dumps({'type': 'speak', 'text': event.text})}\n\n"
            elif event.type == "correct":
                yield f"data: {json.dumps({'type': 'correct', 'hint': event.hint})}\n\n"
            elif event.type == "expect":
                yield f"data: {json.dumps({'type': 'expect', 'text': event.text})}\n\n"
            elif event.type == "complete":
                yield f'data: {{"type": "complete"}}\n\n'
            elif event.type == "done":
                yield f'data: {{"type": "done"}}\n\n'

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/transcribe")
async def transcribe_audio(request: Request):
    form = await request.form()
    file = form["file"]
    audio_bytes = await file.read()
    prompt = form.get("prompt")
    # Save for debugging
    debug_path = STATIC_DIR.parent / "last_utterance.wav"
    debug_path.write_bytes(audio_bytes)
    log.info("Saved %d bytes to %s", len(audio_bytes), debug_path)
    loop = asyncio.get_event_loop()
    text = await loop.run_in_executor(None, transcribe, audio_bytes, prompt)
    return {"text": text}


# Static files must be mounted last (catch-all)
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


def run():
    import argparse
    parser = argparse.ArgumentParser(description="Korean Conversation Practice server")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload on file changes")
    args = parser.parse_args()
    uvicorn.run("korean_practice.main:app", host=args.host, port=args.port, reload=args.reload)
