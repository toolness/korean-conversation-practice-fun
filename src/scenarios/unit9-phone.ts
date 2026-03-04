/** Unit 9 — Phone Call scenario. */

import {
  type Scenario,
  type ScriptStep,
  type ScenarioContext,
  type Briefing,
  makeStep,
  register,
} from "./index";
import {
  PHONE_ACTIVITIES,
  UNIT9_VERBS,
  UNIT9_NOUNS,
  UNIT9_PHRASES,
  UNIT9_OTHERS,
} from "./vocab";

const EXAMPLE_CONVERSATIONS: [string, string][][] = [
  [
    ["A", "여보세요. 거기 애니 씨 집이지요?"],
    ["B", "네, 그런데요. 실례지만 누구세요?"],
  ],
  [
    ["A", "애니 씨 좀 바꿔 주세요."],
    ["B", "네, 잠깐만 기다리세요."],
    ["B", "애니 씨, 전화 받으세요."],
  ],
  [
    ["A", "재민 씨 좀 바꿔 주세요."],
    ["B", "지금 자고 있어요."],
    ["A", "네, 알겠습니다. 안녕히 계세요."],
  ],
  [
    ["A", "여보세요. 거기 소피아 씨 집이지요?"],
    ["B", "네, 그런데요. 실례지만 누구세요?"],
    ["A", "저는 선우예요."],
    ["B", "잠깐만 기다리세요."],
    ["B", "소피아 씨, 전화 받으세요."],
  ],
  [
    ["A", "여보세요, 피터 씨 집이지요?"],
    ["B", "네, 그런데요."],
    ["A", "피터 씨 좀 바꿔 주세요."],
    ["B", "지금 샤워하고 있어요."],
    ["A", "네, 알겠습니다. 안녕히 계세요."],
  ],
];

function createPhoneCallScenario(role: string): Scenario {
  const scenario: Scenario = {
    id: "unit9_phone",
    unit: 9,
    title: "Phone Call",
    grammar: [
      "(noun)-지요 / -이지요 (confirming facts)",
      "(verb)-아/어 주세요 (polite requests)",
      "(verb)-고 있다 (action in progress)",
    ],
    role,
    context: {},
    exampleConversations: EXAMPLE_CONVERSATIONS,

    roles() {
      return ["caller", "answerer"];
    },

    roleDisplayTitle() {
      if (this.role === "caller") return "Calling Someone's House";
      return "Answering the Phone";
    },

    setup() {
      const available = Math.random() < 0.5;
      const activity = !available
        ? PHONE_ACTIVITIES[Math.floor(Math.random() * PHONE_ACTIVITIES.length)]
        : null;

      this.context = {
        caller_name: "재민",
        friend_name: "유나",
        activity_dict: activity?.[0],
        activity_progressive: activity?.[1],
        activity_english: activity?.[2],
        available,
      };
    },

    learnerSpeaker() {
      return this.role === "caller" ? "A" : "B";
    },

    conversationScript(): ScriptStep[] {
      const c = this.context;
      const steps = [
        makeStep("A", `Greet with 여보세요 and confirm this is ${c.friend_name}'s house using -(이)지요`),
        makeStep("B", "Acknowledge with 네, 그런데요 and ask who is calling: 실례지만 누구세요?"),
        makeStep("A", `Introduce yourself as ${c.caller_name} using 저는 [name]이에요/예요, then ask to speak to ${c.friend_name} using [name] 씨 좀 바꿔 주세요`),
      ];

      if (c.available) {
        steps.push(
          makeStep("B", "Say 네, 잠깐만 기다리세요"),
          makeStep("B", `Call ${c.friend_name} to the phone: [name] 씨, 전화 받으세요`),
        );
      } else {
        steps.push(
          makeStep("B", `Tell caller that ${c.friend_name} is currently ${c.activity_english} using 지금 -고 있어요`),
          makeStep("A", "Acknowledge with 알겠습니다 and say goodbye: 안녕히 계세요"),
        );
      }
      return steps;
    },

    vocabSection() {
      const lines = ["Verbs:"];
      for (const [kr, en] of UNIT9_VERBS) lines.push(`  ${kr} — ${en}`);
      lines.push("\nNouns:");
      for (const [kr, en] of UNIT9_NOUNS) lines.push(`  ${kr} — ${en}`);
      lines.push("\nUseful phrases:");
      for (const [kr, en] of UNIT9_PHRASES) lines.push(`  ${kr} — ${en}`);
      lines.push("\nOthers:");
      for (const [kr, en] of UNIT9_OTHERS) lines.push(`  ${kr} — ${en}`);
      return lines.join("\n");
    },

    formatExamples() {
      if (!this.exampleConversations.length) return "";
      const lines = [
        "Here are example conversations from the textbook. Your conversation",
        "should closely follow these patterns — same grammar, same vocabulary,",
        "same level of complexity. Do not use grammar or vocabulary beyond",
        "what appears in these examples and the vocabulary list.",
        "",
      ];
      for (let i = 0; i < this.exampleConversations.length; i++) {
        lines.push(`Example ${i + 1}:`);
        for (const [speaker, text] of this.exampleConversations[i]) {
          lines.push(`${speaker}: ${text}`);
        }
        lines.push("");
      }
      return lines.join("\n");
    },

    briefing(): Briefing {
      const c = this.context;
      const base: Briefing = {
        id: this.id,
        unit: this.unit,
        title: this.roleDisplayTitle(),
        grammar: this.grammar,
        context: {},
      };

      if (this.role === "caller") {
        base.context = {
          role: `You are ${c.caller_name}`,
          detail: `Calling ${c.friend_name}'s house`,
          caller_name: c.caller_name!,
          friend_name: c.friend_name!,
        };
        base.key_vocab = [
          ["여보세요", "hello (phone)"],
          ["집이지요?", "this is [name]'s house, right?"],
          ["바꿔 주세요", "please put [name] on"],
          ["알겠습니다", "I understand"],
          ["안녕히 계세요", "goodbye"],
        ];
        base.start_hint = "You're making a call and the other side just picked up. Say something!";
      } else {
        const detail = c.available
          ? `Answering a call from ${c.caller_name} — ${c.friend_name} is home`
          : `Answering a call from ${c.caller_name} — ${c.friend_name} is ${c.activity_english}`;
        base.context = {
          role: `Family member at ${c.friend_name}'s house`,
          detail,
          caller_name: c.caller_name!,
          friend_name: c.friend_name!,
        };
        base.key_vocab = [
          ["여보세요", "hello (phone)"],
          ["누구세요?", "who is this?"],
          ["잠깐만 기다리세요", "please wait a moment"],
          ["지금 -고 있어요", "currently doing..."],
          ["실례지만", "excuse me, but"],
        ];
        base.auto_start = true;
        base.start_hint = "The caller is dialing...";
      }
      return base;
    },
  };

  return scenario;
}

register(createPhoneCallScenario);
