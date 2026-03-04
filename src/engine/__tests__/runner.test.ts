import { describe, it, expect, mock, beforeEach } from "bun:test";
import { ScriptRunner, type AgentEvent } from "../runner";
import type { Scenario, ScriptStep } from "../../scenarios/index";

// Helper to collect all events from an async generator
async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

function makeScenario(learnerSpeaker = "A"): Scenario {
  return {
    id: "test",
    unit: 1,
    title: "Test",
    grammar: [],
    role: "",
    context: {},
    exampleConversations: [],
    roles: () => [],
    roleDisplayTitle: () => "Test",
    setup: () => {},
    conversationScript: () => [],
    learnerSpeaker: () => learnerSpeaker,
    vocabSection: () => "",
    formatExamples: () => "",
    briefing: () => ({
      id: "test",
      unit: 1,
      title: "Test",
      grammar: [],
      context: {},
    }),
  };
}

function makeRunner(opts?: {
  easyMode?: boolean;
  learnerSpeaker?: string;
  script?: ScriptStep[];
}): ScriptRunner {
  const { easyMode = false, learnerSpeaker = "A", script } = opts || {};
  const scenario = makeScenario(learnerSpeaker);
  const defaultScript: ScriptStep[] = script || [
    { speaker: "B", description: "partner greets", resolved_text: "여보세요" },
    { speaker: "A", description: "learner responds", resolved_text: "안녕하세요" },
    { speaker: "B", description: "partner asks", resolved_text: "누구세요?" },
    { speaker: "A", description: "learner answers", resolved_text: "저는 재민이에요" },
  ];
  return new ScriptRunner(scenario, defaultScript, easyMode);
}

// Mock the classify module
const mockClassify = mock(() => Promise.resolve("MATCH"));

// We need to mock the classify import
import * as classifyModule from "../classify";
mock.module("../classify", () => ({
  classify: mockClassify,
}));

beforeEach(() => {
  mockClassify.mockClear();
  mockClassify.mockImplementation(() => Promise.resolve("MATCH"));
});

describe("ScriptRunner", () => {
  describe("handleStart", () => {
    it("emits partner steps", async () => {
      const runner = makeRunner();
      const events = await collectEvents(runner.handleStart());
      const types = events.map((e) => e.type);
      expect(types).toContain("speak");
      expect(types).toContain("done");
      expect(events.find((e) => e.type === "speak")!.text).toBe("여보세요");
    });

    it("emits expect in easy mode", async () => {
      const runner = makeRunner({ easyMode: true });
      const events = await collectEvents(runner.handleStart());
      const types = events.map((e) => e.type);
      expect(types).toContain("expect");
      const expectEvent = events.find((e) => e.type === "expect")!;
      expect(expectEvent.text).toBe("안녕하세요");
    });

    it("does not emit expect without easy mode", async () => {
      const runner = makeRunner({ easyMode: false });
      const events = await collectEvents(runner.handleStart());
      const types = events.map((e) => e.type);
      expect(types).not.toContain("expect");
    });
  });

  describe("handleInput", () => {
    it("advances on MATCH", async () => {
      const runner = makeRunner();
      await collectEvents(runner.handleStart());
      // Now at step 1 (learner: 안녕하세요)
      expect(runner.stepIndex).toBe(1);

      const events = await collectEvents(runner.handleInput("안녕하세요"));
      const types = events.map((e) => e.type);
      // Should emit speak (partner step) + done
      expect(types).toContain("speak");
      expect(types).toContain("done");
      expect(runner.stepIndex).toBe(3); // advanced past partner step too
    });

    it("emits correct on hint", async () => {
      const runner = makeRunner();
      await collectEvents(runner.handleStart());

      mockClassify.mockImplementation(() => Promise.resolve("Try using -지요"));

      const events = await collectEvents(runner.handleInput("잘못된 말"));
      const types = events.map((e) => e.type);
      expect(types).toContain("correct");
      const correctEvent = events.find((e) => e.type === "correct")!;
      expect(correctEvent.hint).toBe("Try using -지요");
      expect(runner.stepIndex).toBe(1); // didn't advance
    });

    it("emits complete when conversation ends", async () => {
      const runner = makeRunner({
        script: [
          { speaker: "A", description: "greet", resolved_text: "안녕하세요" },
        ],
      });

      const events = await collectEvents(runner.handleInput("안녕하세요"));
      const types = events.map((e) => e.type);
      expect(types).toContain("complete");
    });

    it("emits expect after match in easy mode", async () => {
      const runner = makeRunner({ easyMode: true });
      await collectEvents(runner.handleStart());

      const events = await collectEvents(runner.handleInput("안녕하세요"));
      const types = events.map((e) => e.type);
      expect(types).toContain("expect");
      const expectEvent = events.find((e) => e.type === "expect")!;
      expect(expectEvent.text).toBe("저는 재민이에요");
    });

    it("emits done when no current step", async () => {
      const runner = makeRunner({
        script: [
          { speaker: "A", description: "greet", resolved_text: "안녕하세요" },
        ],
      });

      // Complete the conversation
      await collectEvents(runner.handleInput("안녕하세요"));
      // Try again after complete
      const events = await collectEvents(runner.handleInput("more"));
      expect(events.map((e) => e.type)).toEqual(["done"]);
    });
  });
});
