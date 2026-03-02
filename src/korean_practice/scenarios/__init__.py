from __future__ import annotations

import random
from dataclasses import dataclass, field


STT_CHARITY_ADDENDUM = """\
IMPORTANT: The learner's input comes through speech-to-text (whisper)
and may contain transcription errors. Korean STT often confuses:
- Similar vowels: ㅐ/ㅔ, ㅗ/ㅜ, ㅓ/ㅏ
- Aspirated/tense consonants: ㄱ/ㄲ/ㅋ, ㄷ/ㄸ/ㅌ, ㅂ/ㅃ/ㅍ
- Final consonants (batchim): ㄱ/ㅋ, ㄴ/ㄹ, etc.

Be CHARITABLE when interpreting their speech. If what they said is
phonetically close to a correct response, accept it and continue
the conversation. Only use the correct() tool for clear structural
mistakes: wrong particles, wrong word order, wrong conjugation,
missing grammar elements, or wrong vocabulary. Never correct what
is likely just a transcription error.

CRITICAL: Only use grammar and vocabulary from the examples and
vocabulary list provided below. Do not introduce grammar or words
from higher levels, even if they would make the conversation more
natural. The learner is practicing specific patterns from their
textbook.

HINTS: When using the correct() tool, write hints in ENGLISH with
Korean examples inline. The learner is a beginner and cannot read
long Korean sentences. For example: "When someone tells you their
friend isn't available, you should acknowledge with '네, 알겠습니다'
(I understand) before saying goodbye."
"""


@dataclass
class Scenario:
    id: str
    unit: int
    title: str
    grammar: list[str]
    example_conversations: list[list[tuple[str, str]]]
    _context: dict = field(default_factory=dict, repr=False)

    def setup(self) -> None:
        """Randomize context for this scenario. Override in subclasses."""

    def vocab_section(self) -> str:
        """Return formatted vocabulary for the system prompt. Override in subclasses."""
        return ""

    def scenario_instructions(self) -> str:
        """Return scenario-specific agent instructions. Override in subclasses."""
        return ""

    def system_prompt(self) -> str:
        examples = self._format_examples()
        vocab = self.vocab_section()
        instructions = self.scenario_instructions()

        parts = [
            instructions,
            "",
            STT_CHARITY_ADDENDUM,
        ]
        if vocab:
            parts.extend(["", "=== VOCABULARY ===", vocab])
        if examples:
            parts.extend(["", "=== EXAMPLE CONVERSATIONS ===", examples])
        return "\n".join(parts)

    def briefing(self) -> dict:
        """Return context/vocab/grammar for the briefing screen."""
        return {
            "id": self.id,
            "unit": self.unit,
            "title": self.title,
            "grammar": self.grammar,
            "context": self._context,
        }

    def _format_examples(self) -> str:
        if not self.example_conversations:
            return ""
        lines = [
            "Here are example conversations from the textbook. Your conversation",
            "should closely follow these patterns — same grammar, same vocabulary,",
            "same level of complexity. Do not use grammar or vocabulary beyond",
            "what appears in these examples and the vocabulary list.",
            "",
        ]
        for i, conv in enumerate(self.example_conversations, 1):
            lines.append(f"Example {i}:")
            for speaker, text in conv:
                lines.append(f"{speaker}: {text}")
            lines.append("")
        return "\n".join(lines)


# Registry of all scenarios
_REGISTRY: dict[str, type[Scenario]] = {}


def register(cls: type[Scenario]) -> type[Scenario]:
    instance = cls()
    _REGISTRY[instance.id] = cls
    return cls


def get_scenario(scenario_id: str) -> Scenario:
    cls = _REGISTRY[scenario_id]
    instance = cls()
    instance.setup()
    return instance


def list_scenarios() -> list[dict]:
    result = []
    for cls in _REGISTRY.values():
        s = cls()
        result.append({
            "id": s.id,
            "unit": s.unit,
            "title": s.title,
            "grammar": s.grammar,
        })
    result.sort(key=lambda x: (x["unit"], x["title"]))
    return result


# Import scenario modules to trigger registration
from korean_practice.scenarios import unit9_phone  # noqa: E402, F401
