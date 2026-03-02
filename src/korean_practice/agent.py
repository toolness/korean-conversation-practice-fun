"""Claude Agent SDK conversation manager with speak/correct tools."""

from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    create_sdk_mcp_server,
    tool,
)

from korean_practice.scenarios import Scenario

log = logging.getLogger(__name__)


@tool("speak", "Say text aloud as the conversation partner", {"text": str})
async def speak_tool(args: dict[str, Any]) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": f"Speaking: {args['text']}"}]}


@tool("correct", "Give a Socratic hint about a grammar or vocabulary mistake", {"hint": str})
async def correct_tool(args: dict[str, Any]) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": f"Correction noted: {args['hint']}"}]}


practice_server = create_sdk_mcp_server(
    name="korean-practice",
    version="1.0.0",
    tools=[speak_tool, correct_tool],
)


@dataclass
class AgentEvent:
    type: str  # "speak", "correct", "done"
    text: str = ""
    hint: str = ""


class ConversationManager:
    """Manages a multi-turn conversation with Claude using the Agent SDK."""

    def __init__(self):
        self._clients: dict[str, ClaudeSDKClient] = {}

    async def start(self, scenario: Scenario) -> str:
        """Start a new conversation session. Returns session ID."""
        os.environ.pop("CLAUDECODE", None)

        options = ClaudeAgentOptions(
            model="claude-sonnet-4-6",
            system_prompt=scenario.system_prompt(),
            mcp_servers={"practice": practice_server},
            allowed_tools=["mcp__practice__speak", "mcp__practice__correct"],
            permission_mode="bypassPermissions",
        )
        client = ClaudeSDKClient(options=options)
        await client.connect()

        sid = uuid.uuid4().hex[:12]
        self._clients[sid] = client
        log.info("Started session %s", sid)
        return sid

    async def send(self, session_id: str, text: str) -> list[AgentEvent]:
        """Send learner text and return collected agent events."""
        client = self._clients.get(session_id)
        if client is None:
            log.warning("No client for session %s", session_id)
            return [AgentEvent(type="done")]

        log.info("Sending to session %s: %s", session_id, text[:50])
        events: list[AgentEvent] = []

        await client.query(text)

        try:
            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        cls = type(block).__name__
                        if cls == "ToolUseBlock":
                            if block.name == "mcp__practice__speak":
                                t = block.input.get("text", "")
                                if t:
                                    events.append(AgentEvent(type="speak", text=t))
                            elif block.name == "mcp__practice__correct":
                                h = block.input.get("hint", "")
                                if h:
                                    events.append(AgentEvent(type="correct", hint=h))
                elif isinstance(message, ResultMessage):
                    log.info("Session %s turn done (turns=%d)", session_id, message.num_turns)
        except Exception as e:
            log.error("Error in session %s: %s", session_id, e)

        events.append(AgentEvent(type="done"))
        return events

    async def cleanup(self, session_id: str):
        """Disconnect a session."""
        client = self._clients.pop(session_id, None)
        if client:
            try:
                await client.disconnect()
            except Exception:
                pass


conversation_manager = ConversationManager()
