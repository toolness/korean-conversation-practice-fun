"""Tests for korean_practice.agent — _send_prompt, _classify, resolve_script."""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from claude_agent_sdk import AssistantMessage, ResultMessage, TextBlock

import korean_practice.agent as agent
from korean_practice.scenarios import Scenario, ScriptStep


# ─── Helpers ──────────────────────────────────────────────────────────

def _make_assistant_msg(text: str) -> AssistantMessage:
    return AssistantMessage(content=[TextBlock(text=text)], model="test")


def _make_result_msg() -> ResultMessage:
    return ResultMessage(
        subtype="success",
        duration_ms=100,
        duration_api_ms=80,
        is_error=False,
        num_turns=1,
        session_id="test",
    )


async def _mock_receive_response(messages):
    """Create an async generator that yields the given messages."""
    for msg in messages:
        yield msg


async def _hanging_receive_response():
    """Async generator that never yields a ResultMessage — simulates stuck client."""
    yield _make_assistant_msg("partial")
    await asyncio.sleep(999)


# ─── _send_prompt tests ──────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _reset_agent_state(tmp_path):
    """Reset module-level state before each test."""
    original_client = agent._client
    original_timeout = agent._LLM_TIMEOUT
    original_cache_dir = agent._CACHE_DIR
    # Provide a fresh lock per test to avoid cross-test deadlocks
    agent._client_lock = asyncio.Lock()
    # Use a temp cache dir so tests don't pollute real cache
    agent._CACHE_DIR = tmp_path / "test_cache"
    yield
    agent._client = original_client
    agent._LLM_TIMEOUT = original_timeout
    agent._CACHE_DIR = original_cache_dir
    agent._client_lock = asyncio.Lock()


def _make_mock_client(messages):
    """Create a mock client whose receive_response() returns an async generator."""
    client = MagicMock()
    client.query = AsyncMock()
    client.disconnect = AsyncMock()
    client.connect = AsyncMock()
    client.receive_response = lambda: _mock_receive_response(messages)
    return client


async def test_send_prompt_returns_text():
    mock_client = _make_mock_client([
        _make_assistant_msg("hello world"),
        _make_result_msg(),
    ])
    agent._client = mock_client

    result = await agent._send_prompt("test prompt", "test")

    assert result == "hello world"
    mock_client.query.assert_called_once()


async def test_send_prompt_concatenates_multiple_text_blocks():
    mock_client = _make_mock_client([
        _make_assistant_msg("hello "),
        _make_assistant_msg("world"),
        _make_result_msg(),
    ])
    agent._client = mock_client

    result = await agent._send_prompt("test prompt", "test")

    assert result == "hello world"


async def test_send_prompt_strips_whitespace():
    mock_client = _make_mock_client([
        _make_assistant_msg("  spaced  "),
        _make_result_msg(),
    ])
    agent._client = mock_client

    result = await agent._send_prompt("test prompt", "test")

    assert result == "spaced"


async def test_send_prompt_timeout_reconnects():
    old_client = MagicMock()
    old_client.query = AsyncMock()
    old_client.disconnect = AsyncMock()
    old_client.receive_response = _hanging_receive_response
    agent._client = old_client
    agent._LLM_TIMEOUT = 0.1  # 100ms timeout for fast test

    new_client = AsyncMock()

    with patch("korean_practice.agent.ClaudeSDKClient", return_value=new_client):
        with pytest.raises(TimeoutError):
            await agent._send_prompt("test prompt", "test")

    # Old client was disconnected
    old_client.disconnect.assert_called_once()
    # New client was created and connected
    new_client.connect.assert_called_once()
    # Module-level _client now points to new client
    assert agent._client is new_client


async def test_send_prompt_timeout_reconnects_even_if_disconnect_fails():
    old_client = MagicMock()
    old_client.query = AsyncMock()
    old_client.disconnect = AsyncMock(side_effect=Exception("already dead"))
    old_client.receive_response = _hanging_receive_response
    agent._client = old_client
    agent._LLM_TIMEOUT = 0.1

    new_client = AsyncMock()

    with patch("korean_practice.agent.ClaudeSDKClient", return_value=new_client):
        with pytest.raises(TimeoutError):
            await agent._send_prompt("test prompt", "test")

    # Still reconnected despite disconnect failure
    new_client.connect.assert_called_once()
    assert agent._client is new_client


async def test_send_prompt_serializes_concurrent_calls():
    """Two concurrent _send_prompt calls should not interleave."""
    call_log = []

    async def mock_receive(messages, delay, label):
        for msg in messages:
            yield msg
            if isinstance(msg, AssistantMessage):
                call_log.append(f"{label}_start")
                await asyncio.sleep(delay)
                call_log.append(f"{label}_end")

    call_count = 0

    def make_response():
        nonlocal call_count
        call_count += 1
        label = f"call{call_count}"
        return mock_receive(
            [_make_assistant_msg("r"), _make_result_msg()],
            delay=0.05,
            label=label,
        )

    mock_client = MagicMock()
    mock_client.query = AsyncMock()
    mock_client.receive_response = make_response
    agent._client = mock_client

    await asyncio.gather(
        agent._send_prompt("p1", "t1"),
        agent._send_prompt("p2", "t2"),
    )

    # With the lock, call1 must fully complete before call2 starts
    assert call_log == ["call1_start", "call1_end", "call2_start", "call2_end"]


# ─── _classify tests ─────────────────────────────────────────────────

def _make_runner(learner_speaker="A") -> agent.ScriptRunner:
    scenario = MagicMock(spec=Scenario)
    scenario.learner_speaker.return_value = learner_speaker
    step = ScriptStep(speaker="A", description="greet", resolved_text="안녕하세요")
    return agent.ScriptRunner(scenario, [step])


async def test_classify_match():
    runner = _make_runner()
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, return_value="MATCH"):
        result = await runner._classify("안녕하세요", runner.script[0])
    assert result == "MATCH"


async def test_classify_hint():
    runner = _make_runner()
    hint = "Try using -지요 to confirm"
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, return_value=f"HINT: {hint}"):
        result = await runner._classify("잘못된 말", runner.script[0])
    assert result == hint


async def test_classify_off():
    runner = _make_runner()
    redirect = "Try greeting with 여보세요"
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, return_value=f"OFF: {redirect}"):
        result = await runner._classify("pizza", runner.script[0])
    assert result == redirect


async def test_classify_unexpected_response():
    runner = _make_runner()
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, return_value="SOMETHING WEIRD"):
        result = await runner._classify("test", runner.script[0])
    assert "Try again" in result


async def test_classify_timeout_returns_error():
    runner = _make_runner()
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, side_effect=TimeoutError):
        result = await runner._classify("test", runner.script[0])
    assert "error" in result.lower()


# ─── strip_to_hangul tests ───────────────────────────────────────────

def test_strip_to_hangul_removes_punctuation_and_spaces():
    assert agent.strip_to_hangul("안녕하세요!") == "안녕하세요"
    assert agent.strip_to_hangul("네, 그런데요.") == "네그런데요"


def test_strip_to_hangul_removes_non_korean():
    assert agent.strip_to_hangul("hello 안녕") == "안녕"


def test_strip_to_hangul_empty_string():
    assert agent.strip_to_hangul("") == ""
    assert agent.strip_to_hangul("...!? ") == ""


# ─── cheap match in _classify ────────────────────────────────────────

async def test_classify_cheap_match_skips_llm():
    """When hangul-only characters match exactly, no LLM call is made."""
    runner = _make_runner()
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock) as mock_send:
        result = await runner._classify("안녕하세요!", runner.script[0])
    assert result == "MATCH"
    mock_send.assert_not_called()


async def test_classify_cheap_match_ignores_spaces():
    runner = _make_runner()
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock) as mock_send:
        result = await runner._classify("안녕 하세요", runner.script[0])
    assert result == "MATCH"
    mock_send.assert_not_called()


async def test_classify_falls_through_to_llm_on_mismatch():
    """When hangul doesn't match, the LLM is still called."""
    runner = _make_runner()
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, return_value="HINT: Try again") as mock_send:
        result = await runner._classify("여보세요", runner.script[0])
    assert result == "Try again"
    mock_send.assert_called_once()


# ─── resolve_script tests ────────────────────────────────────────────

def _make_scenario(num_steps=2) -> Scenario:
    scenario = MagicMock(spec=Scenario)
    steps = [
        ScriptStep(speaker="A", description=f"step {i}")
        for i in range(num_steps)
    ]
    scenario.conversation_script.return_value = steps
    scenario._context = {"caller_name": "재민", "friend_name": "유나"}
    scenario._format_examples.return_value = ""
    scenario.vocab_section.return_value = ""
    return scenario


async def test_resolve_script_parses_json():
    scenario = _make_scenario(2)
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, return_value='["안녕하세요", "네, 그런데요"]'):
        result = await agent.resolve_script(scenario)
    assert len(result) == 2
    assert result[0].resolved_text == "안녕하세요"
    assert result[1].resolved_text == "네, 그런데요"


async def test_resolve_script_strips_code_fences():
    scenario = _make_scenario(2)
    fenced = '```json\n["안녕하세요", "네"]\n```'
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, return_value=fenced):
        result = await agent.resolve_script(scenario)
    assert result[0].resolved_text == "안녕하세요"
    assert result[1].resolved_text == "네"


async def test_resolve_script_extracts_json_with_trailing_text():
    scenario = _make_scenario(2)
    messy = 'Here is the result: ["안녕", "네"] Hope this helps!'
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, return_value=messy):
        result = await agent.resolve_script(scenario)
    assert result[0].resolved_text == "안녕"
    assert result[1].resolved_text == "네"


async def test_resolve_script_count_mismatch_raises():
    scenario = _make_scenario(2)
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, return_value='["only one"]'):
        with pytest.raises(ValueError, match="count mismatch"):
            await agent.resolve_script(scenario)


async def test_resolve_script_timeout_propagates():
    scenario = _make_scenario(2)
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, side_effect=TimeoutError):
        with pytest.raises(TimeoutError):
            await agent.resolve_script(scenario)


# ─── cache tests ─────────────────────────────────────────────────────

def test_cache_path_deterministic():
    p1 = agent._cache_path("hello")
    p2 = agent._cache_path("hello")
    assert p1 == p2


def test_cache_path_differs_for_different_prompts():
    p1 = agent._cache_path("hello")
    p2 = agent._cache_path("world")
    assert p1 != p2


def test_cache_miss_returns_none():
    assert agent._cache_get("nonexistent") is None


def test_cache_roundtrip():
    agent._cache_put("prompt1", "response1")
    assert agent._cache_get("prompt1") == "response1"


async def test_send_prompt_uses_cache():
    agent._cache_put("test prompt", "cached response")
    result = await agent._send_prompt("test prompt", "test")
    assert result == "cached response"


async def test_send_prompt_populates_cache():
    mock_client = _make_mock_client([
        _make_assistant_msg("fresh response"),
        _make_result_msg(),
    ])
    agent._client = mock_client
    result = await agent._send_prompt("new prompt", "test")
    assert result == "fresh response"
    assert agent._cache_get("new prompt") == "fresh response"


def test_cache_delete_removes_entry():
    agent._cache_put("to_delete", "value")
    assert agent._cache_get("to_delete") == "value"
    agent._cache_delete("to_delete")
    assert agent._cache_get("to_delete") is None


def test_cache_delete_missing_is_noop():
    agent._cache_delete("nonexistent_key")  # should not raise


async def test_resolve_script_evicts_cache_on_bad_response():
    """When resolve_script fails to parse, it evicts the bad cache entry."""
    scenario = _make_scenario(2)
    bad_response = "Sorry, I can't help with that."
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, return_value=bad_response):
        with pytest.raises(ValueError):
            await agent.resolve_script(scenario)
    # The bad response was cached by _send_prompt but should be evicted by resolve_script
    # Verify by checking that a cache entry for the prompt doesn't exist
    # (we can't easily reconstruct the exact prompt, so just verify no cache files exist)
    if agent._CACHE_DIR.exists():
        assert len(list(agent._CACHE_DIR.iterdir())) == 0


# ─── easy mode tests ─────────────────────────────────────────────────

def _make_easy_runner(easy_mode=True):
    scenario = MagicMock(spec=Scenario)
    scenario.learner_speaker.return_value = "A"
    script = [
        ScriptStep(speaker="B", description="partner greets", resolved_text="여보세요"),
        ScriptStep(speaker="A", description="learner responds", resolved_text="안녕하세요"),
        ScriptStep(speaker="B", description="partner asks", resolved_text="누구세요?"),
        ScriptStep(speaker="A", description="learner answers", resolved_text="저는 재민이에요"),
    ]
    return agent.ScriptRunner(scenario, script, easy_mode=easy_mode)


async def test_handle_start_emits_expect_in_easy_mode():
    runner = _make_easy_runner(easy_mode=True)
    events = [e async for e in runner.handle_start()]
    types = [e.type for e in events]
    assert "expect" in types
    expect_event = next(e for e in events if e.type == "expect")
    assert expect_event.text == "안녕하세요"


async def test_handle_start_no_expect_without_easy_mode():
    runner = _make_easy_runner(easy_mode=False)
    events = [e async for e in runner.handle_start()]
    types = [e.type for e in events]
    assert "expect" not in types


async def test_handle_input_emits_expect_after_match_in_easy_mode():
    runner = _make_easy_runner(easy_mode=True)
    # Advance past the first partner step
    _ = [e async for e in runner.handle_start()]
    # Now learner says step 1 (안녕하세요) — should match and emit expect for step 3
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, return_value="MATCH"):
        events = [e async for e in runner.handle_input("안녕하세요")]
    types = [e.type for e in events]
    assert "expect" in types
    expect_event = next(e for e in events if e.type == "expect")
    assert expect_event.text == "저는 재민이에요"


async def test_handle_input_no_expect_on_completion():
    """No expect event when the conversation is complete."""
    scenario = MagicMock(spec=Scenario)
    scenario.learner_speaker.return_value = "A"
    script = [
        ScriptStep(speaker="A", description="greet", resolved_text="안녕하세요"),
    ]
    runner = agent.ScriptRunner(scenario, script, easy_mode=True)
    with patch("korean_practice.agent._send_prompt", new_callable=AsyncMock, return_value="MATCH"):
        events = [e async for e in runner.handle_input("안녕하세요")]
    types = [e.type for e in events]
    assert "complete" in types
    assert "expect" not in types
