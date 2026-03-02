"""Speech-to-text via whisper-cli (whisper.cpp)."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import os

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

MODEL_PATH = Path(os.environ.get(
    "WHISPER_MODEL",
    _PROJECT_ROOT / "whisper-models/ggml-large-v3-turbo.bin",
))


DEFAULT_PROMPT = "여보세요, 거기 집이지요? 네, 그런데요. 실례지만 누구세요?"


def transcribe(audio_bytes: bytes, prompt: str | None = None) -> str:
    """Transcribe audio bytes (WAV) to Korean text using whisper-cli."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        subprocess.run(
            [
                "whisper-cli",
                "--language", "ko",
                "--model", str(MODEL_PATH),
                "--file", tmp_path,
                "--output-txt",
                "--no-prints",
                "--prompt", prompt or DEFAULT_PROMPT,
            ],
            capture_output=True,
            check=True,
        )
        # whisper-cli writes output to {input_file}.txt
        txt_path = tmp_path + ".txt"
        text = Path(txt_path).read_text().strip()
        Path(txt_path).unlink(missing_ok=True)
        return text
    finally:
        Path(tmp_path).unlink(missing_ok=True)
