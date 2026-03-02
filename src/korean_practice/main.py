import asyncio
import json
import logging
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from korean_practice.agent import conversation_manager
from korean_practice.scenarios import get_scenario, list_scenarios
from korean_practice.stt import transcribe

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static"

# Keep track of which scenario is active per session
_active_scenarios: dict[str, object] = {}

app = FastAPI()


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
    return scenario.briefing()


@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    text = body.get("text", "")
    session_id = body.get("session_id")

    log.info("chat request: session_id=%r text=%s", session_id, text[:50])

    # If no session exists, start a new one with the most recently started scenario
    if not session_id:
        if not _active_scenarios:
            async def empty():
                yield 'data: {"type": "done"}\n\n'
            return StreamingResponse(empty(), media_type="text/event-stream")
        scenario_id = list(_active_scenarios.keys())[-1]
        scenario = _active_scenarios[scenario_id]
        session_id = await conversation_manager.start(scenario)

    async def generate():
        yield f"data: {json.dumps({'type': 'session_id', 'session_id': session_id})}\n\n"
        async for event in conversation_manager.stream(session_id, text):
            if event.type == "speak":
                yield f"data: {json.dumps({'type': 'speak', 'text': event.text})}\n\n"
            elif event.type == "correct":
                yield f"data: {json.dumps({'type': 'correct', 'hint': event.hint})}\n\n"
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
