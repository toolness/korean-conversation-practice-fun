"""Script-driven conversation engine with AI classification."""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from dataclasses import dataclass

from korean_practice.scenarios import STT_CHARITY_ADDENDUM, Scenario, ScriptStep

log = logging.getLogger(__name__)


@dataclass
class AgentEvent:
    type: str  # "speak", "correct", "complete", "done"
    text: str = ""
    hint: str = ""


class ScriptRunner:
    """Runs a scripted conversation, using AI only for resolution and classification."""

    def __init__(self, scenario: Scenario, script: list[ScriptStep]):
        self.scenario = scenario
        self.script = script
        self.step_index = 0
        self.learner_speaker = scenario.learner_speaker()
        self.history: list[tuple[str, str]] = []  # (speaker_label, text) pairs

    @property
    def current_step(self) -> ScriptStep | None:
        if self.step_index < len(self.script):
            return self.script[self.step_index]
        return None

    @property
    def is_complete(self) -> bool:
        return self.step_index >= len(self.script)

    def _is_learner_step(self, step: ScriptStep) -> bool:
        return step.speaker == self.learner_speaker

    async def handle_start(self):
        """Handle [START] trigger — emit any leading partner steps."""
        async for event in self._emit_partner_steps():
            yield event
        yield AgentEvent(type="done")

    async def handle_input(self, text: str):
        """Handle learner input — classify, advance, emit partner steps."""
        step = self.current_step
        if step is None:
            yield AgentEvent(type="done")
            return

        if not self._is_learner_step(step):
            log.warning("Expected learner step at index %d but got partner step", self.step_index)
            yield AgentEvent(type="done")
            return

        # Classify the learner's utterance
        result = await self._classify(text, step)

        if result == "MATCH":
            self.history.append((step.speaker, text))
            self.step_index += 1
            async for event in self._emit_partner_steps():
                yield event
            if self.is_complete:
                yield AgentEvent(type="complete")
        else:
            # result is a hint string
            yield AgentEvent(type="correct", hint=result)

        yield AgentEvent(type="done")

    async def _emit_partner_steps(self):
        """Emit all consecutive partner steps from current position."""
        while self.current_step and not self._is_learner_step(self.current_step):
            step = self.current_step
            yield AgentEvent(type="speak", text=step.resolved_text)
            self.history.append((step.speaker, step.resolved_text))
            self.step_index += 1

    async def _classify(self, utterance: str, step: ScriptStep) -> str:
        """Use AI to classify whether utterance matches the expected step.

        Returns "MATCH" or a hint string.
        """
        os.environ.pop("CLAUDECODE", None)

        from claude_agent_sdk import (
            AssistantMessage,
            ClaudeAgentOptions,
            TextBlock,
            query,
        )

        history_str = ""
        if self.history:
            lines = []
            for speaker, text in self.history:
                label = "Learner" if speaker == self.learner_speaker else "Partner"
                lines.append(f"  {label}: {text}")
            history_str = "Conversation so far:\n" + "\n".join(lines) + "\n\n"

        prompt = f"""\
You are evaluating a Korean language learner's spoken response.

{history_str}The learner was expected to say something like: "{step.resolved_text}"
(Step description: {step.description})

The learner actually said: "{utterance}"

{STT_CHARITY_ADDENDUM}

TASK: Decide if the learner's utterance is close enough to the expected response.
- MATCH: if close enough (same meaning, correct grammar patterns, right vocabulary). \
Accept likely STT transcription errors (phonetically similar sounds).
- HINT: if there's a genuine grammar or vocabulary mistake (wrong particle, word order, \
missing pattern, wrong vocabulary). Write a brief English hint (1-2 sentences) with Korean \
examples inline. Do NOT give away the full answer — use a Socratic approach.
- OFF: if completely wrong or unrelated. Briefly redirect the learner.

Respond with exactly one of:
MATCH
HINT: <your hint>
OFF: <your redirect>"""

        options = ClaudeAgentOptions(
            model="claude-sonnet-4-6",
            system_prompt="You are a Korean language utterance classifier. Respond only with MATCH, HINT: <hint>, or OFF: <redirect>.",
            permission_mode="bypassPermissions",
        )

        try:
            t0 = time.monotonic()
            log.info("_classify: starting SDK query")
            result_text = ""
            first_token = None
            async for message in query(prompt=prompt, options=options):
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            if first_token is None:
                                first_token = time.monotonic()
                                log.info("_classify: first token in %.1fs", first_token - t0)
                            result_text += block.text

            t_done = time.monotonic()
            result_text = result_text.strip()
            log.info("_classify: SDK query done in %.1fs — %s", t_done - t0, result_text[:80])

            if result_text.startswith("MATCH"):
                return "MATCH"
            elif result_text.startswith("HINT:"):
                return result_text[5:].strip()
            elif result_text.startswith("OFF:"):
                return result_text[4:].strip()
            else:
                log.warning("Unexpected classification response: %s", result_text[:100])
                return "Try again — say something closer to the expected response."
        except Exception as e:
            log.error("Classification error: %s", e)
            return "Sorry, there was an error. Please try again."


async def resolve_script(scenario: Scenario) -> list[ScriptStep]:
    """Use LLM to resolve script step descriptions into actual Korean sentences."""
    os.environ.pop("CLAUDECODE", None)

    from claude_agent_sdk import (
        AssistantMessage,
        ClaudeAgentOptions,
        TextBlock,
        query,
    )

    script = scenario.conversation_script()
    context_info = scenario._context

    steps_desc = "\n".join(
        f"  Step {i + 1} (Speaker {s.speaker}): {s.description}"
        for i, s in enumerate(script)
    )

    examples = scenario._format_examples()
    vocab = scenario.vocab_section()

    prompt = f"""\
You are generating Korean dialogue for a language practice app.

CONTEXT:
  Caller name: {context_info.get('caller_name', '')}
  Friend name: {context_info.get('friend_name', '')}
  Friend available: {context_info.get('available', '')}
  Activity (if unavailable): {context_info.get('activity_progressive', 'N/A')}

Speaker A = the caller
Speaker B = the person answering the phone at the friend's house

SCRIPT STEPS (produce one Korean sentence per step):
{steps_desc}

{examples}

{vocab}

INSTRUCTIONS:
- Produce exactly one Korean sentence per step
- Follow the textbook example patterns closely — same grammar, same vocabulary level
- Use the correct particles and conjugations for the given names
- Keep sentences short and natural, matching the examples
- Respond with a JSON array of strings, one per step, in order

Example response format: ["여보세요. 거기 유나 씨 집이지요?", "네, 그런데요. 실례지만 누구세요?", ...]"""

    options = ClaudeAgentOptions(
        model="claude-sonnet-4-6",
        system_prompt="You produce Korean dialogue sentences. Respond ONLY with a JSON array of strings.",
        permission_mode="bypassPermissions",
    )

    try:
        t0 = time.monotonic()
        log.info("resolve_script: starting SDK query (%d steps)", len(script))
        result_text = ""
        first_token = None
        async for message in query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        if first_token is None:
                            first_token = time.monotonic()
                            log.info("resolve_script: first token in %.1fs", first_token - t0)
                        result_text += block.text

        t_done = time.monotonic()
        log.info("resolve_script: SDK query done in %.1fs (%.1fs to first token)", t_done - t0, (first_token or t_done) - t0)

        result_text = result_text.strip()
        # Strip markdown code fences if present
        if result_text.startswith("```"):
            result_text = result_text.split("\n", 1)[1] if "\n" in result_text else result_text[3:]
            if result_text.endswith("```"):
                result_text = result_text[:-3].strip()

        # Extract just the JSON array — LLM sometimes appends extra text
        start = result_text.index("[")
        depth = 0
        for i in range(start, len(result_text)):
            if result_text[i] == "[":
                depth += 1
            elif result_text[i] == "]":
                depth -= 1
                if depth == 0:
                    result_text = result_text[start:i + 1]
                    break

        sentences = json.loads(result_text)
        if len(sentences) != len(script):
            log.error("Resolution returned %d sentences for %d steps", len(sentences), len(script))
            raise ValueError("Sentence count mismatch")

        for step, sentence in zip(script, sentences):
            step.resolved_text = sentence

        log.info("resolve_script: total %.1fs — %s", time.monotonic() - t0, [s.resolved_text for s in script])
        return script

    except Exception as e:
        log.error("Script resolution failed: %s", e)
        raise


class ConversationManager:
    """Manages scripted conversation sessions."""

    def __init__(self):
        self._runners: dict[str, ScriptRunner] = {}

    async def start(self, scenario: Scenario) -> str:
        """Start a new conversation session. Returns session ID."""
        t0 = time.monotonic()
        script = await resolve_script(scenario)
        runner = ScriptRunner(scenario, script)

        sid = uuid.uuid4().hex[:12]
        self._runners[sid] = runner
        log.info("Started session %s with %d steps in %.1fs", sid, len(script), time.monotonic() - t0)
        return sid

    async def stream(self, session_id: str, text: str):
        """Send learner text and yield agent events as they arrive."""
        runner = self._runners.get(session_id)
        if runner is None:
            log.warning("No runner for session %s", session_id)
            yield AgentEvent(type="done")
            return

        log.info("Session %s input: %s", session_id, text[:50])

        if text == "[START]":
            async for event in runner.handle_start():
                yield event
        else:
            async for event in runner.handle_input(text):
                yield event

    async def cleanup(self, session_id: str):
        """Clean up a session."""
        self._runners.pop(session_id, None)


conversation_manager = ConversationManager()
