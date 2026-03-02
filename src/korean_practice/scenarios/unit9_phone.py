"""Unit 9 — Phone Call scenario."""

from __future__ import annotations

import random

from korean_practice.scenarios import Scenario, register
from korean_practice.scenarios.vocab import (
    KOREAN_NAMES,
    PHONE_ACTIVITIES,
    UNIT9_NOUNS,
    UNIT9_OTHERS,
    UNIT9_PHRASES,
    UNIT9_VERBS,
)

EXAMPLE_CONVERSATIONS = [
    [
        ("A", "여보세요. 거기 애니 씨 집이지요?"),
        ("B", "네, 그런데요. 실례지만 누구세요?"),
    ],
    [
        ("A", "애니 씨 좀 바꿔 주세요."),
        ("B", "네, 잠깐만 기다리세요."),
        ("B", "애니 씨, 전화 받으세요."),
    ],
    [
        ("A", "재민 씨 좀 바꿔 주세요."),
        ("B", "지금 자고 있어요."),
        ("A", "네, 알겠습니다. 안녕히 계세요."),
    ],
    [
        ("A", "여보세요. 거기 소피아 씨 집이지요?"),
        ("B", "네, 그런데요. 실례지만 누구세요?"),
        ("A", "저는 선우예요."),
        ("B", "잠깐만 기다리세요."),
        ("B", "소피아 씨, 전화 받으세요."),
    ],
    [
        ("A", "여보세요, 피터 씨 집이지요?"),
        ("B", "네, 그런데요."),
        ("A", "피터 씨 좀 바꿔 주세요."),
        ("B", "지금 샤워하고 있어요."),
        ("A", "네, 알겠습니다. 안녕히 계세요."),
    ],
]


@register
class PhoneCallScenario(Scenario):
    def __init__(self):
        super().__init__(
            id="unit9_phone",
            unit=9,
            title="Calling Someone's House",
            grammar=[
                "(noun)-지요 / -이지요 (confirming facts)",
                "(verb)-아/어 주세요 (polite requests)",
                "(verb)-고 있다 (action in progress)",
            ],
            example_conversations=EXAMPLE_CONVERSATIONS,
        )

    def setup(self):
        available = random.choice([True, False])
        activity = random.choice(PHONE_ACTIVITIES) if not available else None
        self._context = {
            "caller_name": "재민",
            "friend_name": "유나",
            "activity_dict": activity[0] if activity else None,
            "activity_progressive": activity[1] if activity else None,
            "activity_english": activity[2] if activity else None,
            "available": available,
        }

    def vocab_section(self) -> str:
        lines = ["Verbs:"]
        for kr, en in UNIT9_VERBS:
            lines.append(f"  {kr} — {en}")
        lines.append("\nNouns:")
        for kr, en in UNIT9_NOUNS:
            lines.append(f"  {kr} — {en}")
        lines.append("\nUseful phrases:")
        for kr, en in UNIT9_PHRASES:
            lines.append(f"  {kr} — {en}")
        lines.append("\nOthers:")
        for kr, en in UNIT9_OTHERS:
            lines.append(f"  {kr} — {en}")
        return "\n".join(lines)

    def scenario_instructions(self) -> str:
        c = self._context
        available_str = (
            "The friend IS available — after the learner asks, say "
            '"잠깐만 기다리세요" and then "[friend name] 씨, 전화 받으세요."'
            if c["available"]
            else f'The friend is NOT available — they are currently '
            f'{c["activity_english"]} ({c["activity_progressive"]}). '
            f'Tell the learner: "지금 {c["activity_progressive"]}."'
        )

        return f"""\
You are playing the role of a family member who answers the phone at \
{c["friend_name"]}'s house. The learner is calling and their name is \
{c["caller_name"]}.

The learner should:
1. Greet you and confirm this is {c["friend_name"]}'s house using -지요
2. When asked who they are, introduce themselves
3. Ask to speak to {c["friend_name"]} using "바꿔 주세요"
4. Respond appropriately to whether {c["friend_name"]} is available

{available_str}

Follow the conversation patterns from the example dialogues closely. \
Respond naturally but stay within the textbook patterns. Keep your \
responses short — one or two sentences at a time, just like in the examples.

IMPORTANT: You speak FIRST by answering the phone — but actually the \
learner is the one calling, so WAIT for them to speak first. The learner \
initiates with "여보세요".

Use the speak() tool for every line of dialogue you say. \
Use the correct() tool only if the learner makes a clear grammar or \
vocabulary mistake (not a transcription error)."""

    def briefing(self) -> dict:
        b = super().briefing()
        c = self._context
        b["context"] = {
            "role": f"You are {c['caller_name']}",
            "detail": f"Calling {c['friend_name']}'s house",
            "caller_name": c["caller_name"],
            "friend_name": c["friend_name"],
        }
        b["key_vocab"] = [
            ("여보세요", "hello (phone)"),
            ("집이지요?", "this is [name]'s house, right?"),
            ("바꿔 주세요", "please put [name] on"),
            ("알겠습니다", "I understand"),
            ("안녕히 계세요", "goodbye"),
        ]
        return b
