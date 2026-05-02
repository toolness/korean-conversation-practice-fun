/** Book 2 Unit 2 — Asking for Directions / Transportation scenario. */

import {
  type Scenario,
  type ScriptStep,
  type Briefing,
  makeStep,
  register,
} from "./index";
import {
  BOOK2_UNIT2_VERBS,
  BOOK2_UNIT2_TRANSPORT,
  BOOK2_UNIT2_OTHERS,
  BOOK2_UNIT2_PHRASES,
  BOOK2_UNIT2_PLACES,
  BOOK2_UNIT2_STATIONS,
  SINO_NUMBERS_1_TO_9,
} from "./vocab";

const EXAMPLE_CONVERSATIONS: [string, string][][] = [
  [
    ["A", "인사동에 어떻게 가요?"],
    ["B", "지하철을 타세요."],
    ["A", "몇 호선을 타야 돼요?"],
    ["B", "사 호선을 타세요."],
    ["A", "어디에서 갈아타요?"],
    ["B", "교대역에서 삼 호선으로 갈아타세요."],
  ],
  [
    ["A", "남대문시장에 어떻게 가요?"],
    ["B", "버스를 타세요."],
    ["A", "몇 번 버스를 타야 돼요?"],
    ["B", "오 번 버스를 타야 돼요."],
    ["A", "어디에서 내려요?"],
    ["B", "회현역에서 내리세요."],
    ["A", "네, 알겠습니다."],
  ],
  [
    ["A", "명동에 어떻게 가요?"],
    ["B", "지하철을 타세요."],
    ["A", "몇 호선을 타야 돼요?"],
    ["B", "사 호선을 타세요."],
    ["A", "어디에서 내려요?"],
    ["B", "명동역에서 내리세요."],
  ],
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createDirectionsScenario(role: string): Scenario {
  const scenario: Scenario = {
    id: "book2_unit2_directions",
    unit: 202,
    title: "Asking for Directions",
    grammar: [
      "N에 어떻게 가요? (asking how to get somewhere)",
      "N을/를 타다 / N에서 내리다 (getting on / off transport)",
      "N에서 N(으)로 갈아타다 (transferring)",
      "V-아야/어야 되다 (should / must)",
    ],
    role,
    context: {},
    exampleConversations: EXAMPLE_CONVERSATIONS,

    roles() {
      return ["asker", "guide"];
    },

    roleDisplayTitle() {
      if (this.role === "asker") return "Asking for Directions";
      return "Giving Directions";
    },

    setup() {
      const destination = pick(BOOK2_UNIT2_PLACES);
      const mode = Math.random() < 0.5 ? "subway" : "bus";
      const getOff = pick(BOOK2_UNIT2_STATIONS);
      const needsTransfer = mode === "subway" && Math.random() < 0.5;

      // Subway lines 1–5
      const lineChoices = SINO_NUMBERS_1_TO_9.slice(0, 5);
      const lineNum = pick(lineChoices);
      const transferLine = pick(lineChoices.filter(([n]) => n !== lineNum[0]));
      const transferStation = pick(
        BOOK2_UNIT2_STATIONS.filter(([kr]) => kr !== getOff[0]),
      );

      // Bus numbers 1–9 (single Sino-Korean digit)
      const busNum = pick(SINO_NUMBERS_1_TO_9);

      this.context = {
        destination_kr: destination[0],
        destination_en: destination[1],
        mode,
        mode_kr: mode === "subway" ? "지하철" : "버스",
        get_off_station_kr: getOff[0],
        get_off_station_en: getOff[1],
        needs_transfer: needsTransfer,
        line_number_kr: lineNum[1],
        line_number_en: lineNum[0],
        transfer_line_kr: transferLine[1],
        transfer_line_en: transferLine[0],
        transfer_station_kr: transferStation[0],
        transfer_station_en: transferStation[1],
        bus_number_kr: busNum[1],
        bus_number_en: busNum[0],
      };
    },

    learnerSpeaker() {
      return this.role === "asker" ? "A" : "B";
    },

    conversationScript(): ScriptStep[] {
      const c = this.context;
      const isSubway = c.mode === "subway";

      const specifierQ = isSubway
        ? "몇 호선을 타야 돼요?"
        : "몇 번 버스를 타야 돼요?";
      const specifierA = isSubway
        ? `${c.line_number_kr} 호선을 타세요`
        : `${c.bus_number_kr} 번 버스를 타세요`;

      const steps = [
        makeStep("A", `Ask how to get to ${c.destination_kr} using "${c.destination_kr}에 어떻게 가요?"`),
        makeStep("B", `Tell them to take the ${c.mode}: "${c.mode_kr}을/를 타세요"`),
        makeStep("A", `Ask which ${isSubway ? "subway line" : "bus number"} they should take: "${specifierQ}"`),
        makeStep("B", `Answer with "${specifierA}"`),
      ];

      if (c.needs_transfer) {
        steps.push(
          makeStep("A", `Ask where to transfer: "어디에서 갈아타요?"`),
          makeStep(
            "B",
            `Tell them to transfer at ${c.transfer_station_kr} to line ${c.transfer_line_en}: "${c.transfer_station_kr}에서 ${c.transfer_line_kr} 호선으로 갈아타세요"`,
          ),
        );
      } else {
        steps.push(
          makeStep("A", `Ask where to get off: "어디에서 내려요?"`),
          makeStep(
            "B",
            `Tell them to get off at ${c.get_off_station_kr}: "${c.get_off_station_kr}에서 내리세요"`,
          ),
        );
      }

      steps.push(makeStep("A", `Acknowledge with "네, 알겠습니다"`));
      return steps;
    },

    vocabSection() {
      const lines = ["Verbs:"];
      for (const [kr, en] of BOOK2_UNIT2_VERBS) lines.push(`  ${kr} — ${en}`);
      lines.push("\nTransport:");
      for (const [kr, en] of BOOK2_UNIT2_TRANSPORT) lines.push(`  ${kr} — ${en}`);
      lines.push("\nUseful phrases:");
      for (const [kr, en] of BOOK2_UNIT2_PHRASES) lines.push(`  ${kr} — ${en}`);
      lines.push("\nOthers:");
      for (const [kr, en] of BOOK2_UNIT2_OTHERS) lines.push(`  ${kr} — ${en}`);
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

    promptContext() {
      const c = this.context;
      const transferLine = c.needs_transfer
        ? `\n  Transfer at: ${c.transfer_station_kr} to ${c.transfer_line_kr} 호선 (line ${c.transfer_line_en})`
        : "";
      const modeSpecific =
        c.mode === "subway"
          ? `  Subway line: ${c.line_number_kr} 호선 (line ${c.line_number_en})`
          : `  Bus number: ${c.bus_number_kr} 번 (number ${c.bus_number_en})`;

      return `\
CONTEXT:
  Destination: ${c.destination_kr} (${c.destination_en})
  Mode of transport: ${c.mode_kr} (${c.mode})
${modeSpecific}
  Get off at: ${c.get_off_station_kr} (${c.get_off_station_en})
  Needs transfer: ${c.needs_transfer}${transferLine}

Speaker A = a visitor in Seoul asking how to reach the destination
Speaker B = a helpful local giving directions

Use Sino-Korean digits (일, 이, 삼, 사, 오, 육, 칠, 팔, 구) for line and bus numbers.
The exact Sino-Korean form for this conversation's number is given above — use it verbatim.`;
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

      if (this.role === "asker") {
        base.context = {
          role: "You're a visitor in Seoul",
          detail: `You want to get to ${c.destination_kr} (${c.destination_en})`,
          destination: c.destination_kr as string,
        };
        base.key_vocab = [
          ["어떻게 가요?", "how do I get there?"],
          ["몇 호선", "which subway line"],
          ["몇 번 버스", "what number bus"],
          ["타야 돼요?", "should I take?"],
          ["어디에서 내려요?", "where do I get off?"],
          ["어디에서 갈아타요?", "where do I transfer?"],
        ];
        base.start_hint = `You need to get to ${c.destination_kr}. Approach a local and ask for directions!`;
      } else {
        const lineOrBus =
          c.mode === "subway"
            ? `${c.line_number_kr} 호선 (line ${c.line_number_en})`
            : `${c.bus_number_kr} 번 버스 (number ${c.bus_number_en})`;
        const lastLeg = c.needs_transfer
          ? `transfer at ${c.transfer_station_kr} to ${c.transfer_line_kr} 호선`
          : `get off at ${c.get_off_station_kr}`;
        const detail = `${c.destination_kr} via ${lineOrBus} — ${lastLeg}`;
        base.context = {
          role: "You're a helpful local in Seoul",
          detail,
          destination: c.destination_kr as string,
        };
        base.key_vocab = [
          ["타세요", "please take (transport)"],
          ["호선", "subway line"],
          ["번 버스", "number bus"],
          ["내리세요", "please get off"],
          ["갈아타세요", "please transfer"],
          ["(으)로", "to (with line number)"],
        ];
        base.auto_start = true;
        base.start_hint = "A visitor is approaching to ask for directions...";
      }
      return base;
    },
  };

  return scenario;
}

register(createDirectionsScenario);
