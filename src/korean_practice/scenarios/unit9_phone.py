"""Unit 9 — Phone Call scenario."""

from __future__ import annotations

import random

from korean_practice.scenarios import Scenario, ScriptStep, register
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
            title="Phone Call",
            grammar=[
                "(noun)-지요 / -이지요 (confirming facts)",
                "(verb)-아/어 주세요 (polite requests)",
                "(verb)-고 있다 (action in progress)",
            ],
            example_conversations=EXAMPLE_CONVERSATIONS,
        )

    @classmethod
    def roles(cls) -> tuple[str, ...]:
        return ("caller", "answerer")

    def role_display_title(self) -> str:
        if self.role == "caller":
            return "Calling Someone's House"
        return "Answering the Phone"

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

    def learner_speaker(self) -> str:
        return "A" if self.role == "caller" else "B"

    def conversation_script(self) -> list[ScriptStep]:
        c = self._context
        steps = [
            ScriptStep("A", f"Greet with 여보세요 and confirm this is {c['friend_name']}'s house using -(이)지요"),
            ScriptStep("B", "Acknowledge with 네, 그런데요 and ask who is calling: 실례지만 누구세요?"),
            ScriptStep("A", f"Introduce yourself as {c['caller_name']} using 저는 [name]이에요/예요, then ask to speak to {c['friend_name']} using [name] 씨 좀 바꿔 주세요"),
        ]
        if c["available"]:
            steps.extend([
                ScriptStep("B", "Say 네, 잠깐만 기다리세요"),
                ScriptStep("B", f"Call {c['friend_name']} to the phone: [name] 씨, 전화 받으세요"),
            ])
        else:
            steps.extend([
                ScriptStep("B", f"Tell caller that {c['friend_name']} is currently {c['activity_english']} using 지금 -고 있어요"),
                ScriptStep("A", "Acknowledge with 알겠습니다 and say goodbye: 안녕히 계세요"),
            ])
        return steps

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

    def briefing(self) -> dict:
        b = super().briefing()
        c = self._context
        if self.role == "caller":
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
            b["start_hint"] = "You're making a call and the other side just picked up. Say something!"
        else:
            if c["available"]:
                detail = f"Answering a call from {c['caller_name']} — {c['friend_name']} is home"
            else:
                detail = (f"Answering a call from {c['caller_name']} — "
                          f"{c['friend_name']} is {c['activity_english']}")
            b["context"] = {
                "role": f"Family member at {c['friend_name']}'s house",
                "detail": detail,
                "caller_name": c["caller_name"],
                "friend_name": c["friend_name"],
            }
            b["key_vocab"] = [
                ("여보세요", "hello (phone)"),
                ("누구세요?", "who is this?"),
                ("잠깐만 기다리세요", "please wait a moment"),
                ("지금 -고 있어요", "currently doing..."),
                ("실례지만", "excuse me, but"),
            ]
            b["auto_start"] = True
            b["start_hint"] = "The caller is dialing..."
        return b
