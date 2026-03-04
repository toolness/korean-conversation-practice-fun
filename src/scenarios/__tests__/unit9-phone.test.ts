import { describe, it, expect } from "bun:test";
import { getScenario, listScenarios } from "../index";

describe("unit9-phone scenario", () => {
  it("registers caller and answerer roles", () => {
    const scenarios = listScenarios();
    const phoneScenarios = scenarios.filter((s) => s.id.startsWith("unit9_phone"));
    expect(phoneScenarios.length).toBe(2);
    expect(phoneScenarios.map((s) => s.id).sort()).toEqual([
      "unit9_phone_answerer",
      "unit9_phone_caller",
    ]);
  });

  it("caller has correct display title", () => {
    const scenarios = listScenarios();
    const caller = scenarios.find((s) => s.id === "unit9_phone_caller")!;
    expect(caller.title).toBe("Calling Someone's House");
  });

  it("answerer has correct display title", () => {
    const scenarios = listScenarios();
    const answerer = scenarios.find((s) => s.id === "unit9_phone_answerer")!;
    expect(answerer.title).toBe("Answering the Phone");
  });

  it("caller scenario has conversation script", () => {
    const scenario = getScenario("unit9_phone_caller");
    const script = scenario.conversationScript();
    expect(script.length).toBeGreaterThanOrEqual(4);
    // First step is always the caller greeting
    expect(script[0].speaker).toBe("A");
  });

  it("answerer scenario sets learner as speaker B", () => {
    const scenario = getScenario("unit9_phone_answerer");
    expect(scenario.learnerSpeaker()).toBe("B");
  });

  it("caller briefing has start_hint", () => {
    const scenario = getScenario("unit9_phone_caller");
    const b = scenario.briefing();
    expect(b.start_hint).toBeTruthy();
    expect(b.key_vocab!.length).toBeGreaterThan(0);
  });

  it("answerer briefing has auto_start", () => {
    const scenario = getScenario("unit9_phone_answerer");
    const b = scenario.briefing();
    expect(b.auto_start).toBe(true);
  });

  it("setup randomizes context", () => {
    const scenario = getScenario("unit9_phone_caller");
    expect(scenario.context.caller_name).toBe("재민");
    expect(scenario.context.friend_name).toBe("유나");
    expect(typeof scenario.context.available).toBe("boolean");
  });

  it("vocab section is non-empty", () => {
    const scenario = getScenario("unit9_phone_caller");
    expect(scenario.vocabSection().length).toBeGreaterThan(0);
  });

  it("format examples is non-empty", () => {
    const scenario = getScenario("unit9_phone_caller");
    expect(scenario.formatExamples().length).toBeGreaterThan(0);
  });

  it("grammar list has 3 patterns", () => {
    const scenario = getScenario("unit9_phone_caller");
    expect(scenario.grammar.length).toBe(3);
  });
});

describe("scratchpad scenario", () => {
  it("registers without roles", () => {
    const scenarios = listScenarios();
    const scratchpad = scenarios.find((s) => s.id === "scratchpad");
    expect(scratchpad).toBeTruthy();
  });

  it("briefing has scratchpad flag", () => {
    const scenario = getScenario("scratchpad");
    const b = scenario.briefing();
    expect(b.scratchpad).toBe(true);
  });
});
