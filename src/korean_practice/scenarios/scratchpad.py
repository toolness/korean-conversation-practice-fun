"""STT Scratchpad — speak and see transcribed text, no evaluation."""

from dataclasses import dataclass

from korean_practice.scenarios import Scenario, register


@register
@dataclass
class ScratchpadScenario(Scenario):
    id: str = "scratchpad"
    unit: int = 0
    title: str = "STT Scratchpad"
    grammar: list = None
    example_conversations: list = None

    def __post_init__(self):
        if self.grammar is None:
            self.grammar = []
        if self.example_conversations is None:
            self.example_conversations = []

    def briefing(self) -> dict:
        return {
            "id": self.id,
            "unit": self.unit,
            "title": self.title,
            "grammar": [],
            "context": {},
            "scratchpad": True,
            "start_hint": "Hold Space and speak — your words will appear as text.",
        }
