import { describe, it, expect } from "bun:test";
import { getScenario, listScenarios } from "../index";

describe("book2-unit2-directions scenario", () => {
  it("registers asker and guide roles", () => {
    const scenarios = listScenarios();
    const directionsScenarios = scenarios.filter((s) =>
      s.id.startsWith("book2_unit2_directions"),
    );
    expect(directionsScenarios.length).toBe(2);
    expect(directionsScenarios.map((s) => s.id).sort()).toEqual([
      "book2_unit2_directions_asker",
      "book2_unit2_directions_guide",
    ]);
  });

  it("asker has correct display title", () => {
    const scenarios = listScenarios();
    const asker = scenarios.find((s) => s.id === "book2_unit2_directions_asker")!;
    expect(asker.title).toBe("Asking for Directions");
  });

  it("guide has correct display title", () => {
    const scenarios = listScenarios();
    const guide = scenarios.find((s) => s.id === "book2_unit2_directions_guide")!;
    expect(guide.title).toBe("Giving Directions");
  });

  it("scenarios appear under unit 202 (Book 2 Unit 2)", () => {
    const scenarios = listScenarios();
    const asker = scenarios.find((s) => s.id === "book2_unit2_directions_asker")!;
    expect(asker.unit).toBe(202);
  });

  it("asker scenario script starts with speaker A", () => {
    const scenario = getScenario("book2_unit2_directions_asker");
    const script = scenario.conversationScript();
    expect(script.length).toBeGreaterThanOrEqual(7);
    expect(script[0].speaker).toBe("A");
  });

  it("asker is speaker A, guide is speaker B", () => {
    expect(getScenario("book2_unit2_directions_asker").learnerSpeaker()).toBe("A");
    expect(getScenario("book2_unit2_directions_guide").learnerSpeaker()).toBe("B");
  });

  it("asker briefing has start_hint", () => {
    const scenario = getScenario("book2_unit2_directions_asker");
    const b = scenario.briefing();
    expect(b.start_hint).toBeTruthy();
    expect(b.key_vocab!.length).toBeGreaterThan(0);
  });

  it("guide briefing has auto_start", () => {
    const scenario = getScenario("book2_unit2_directions_guide");
    const b = scenario.briefing();
    expect(b.auto_start).toBe(true);
  });

  it("setup populates context", () => {
    const scenario = getScenario("book2_unit2_directions_asker");
    const c = scenario.context;
    expect(c.destination_kr).toBeTruthy();
    expect(c.mode === "subway" || c.mode === "bus").toBe(true);
    expect(typeof c.needs_transfer).toBe("boolean");
    expect(c.get_off_station_kr).toBeTruthy();
  });

  it("transfer only happens on subway", () => {
    // Run setup many times to be confident the invariant holds
    for (let i = 0; i < 50; i++) {
      const scenario = getScenario("book2_unit2_directions_asker");
      if (scenario.context.needs_transfer) {
        expect(scenario.context.mode).toBe("subway");
      }
    }
  });

  it("vocab section is non-empty", () => {
    const scenario = getScenario("book2_unit2_directions_asker");
    expect(scenario.vocabSection().length).toBeGreaterThan(0);
  });

  it("format examples is non-empty", () => {
    const scenario = getScenario("book2_unit2_directions_asker");
    expect(scenario.formatExamples().length).toBeGreaterThan(0);
  });

  it("promptContext mentions both speakers", () => {
    const scenario = getScenario("book2_unit2_directions_asker");
    const ctx = scenario.promptContext();
    expect(ctx).toContain("Speaker A");
    expect(ctx).toContain("Speaker B");
    expect(ctx).toContain("CONTEXT:");
  });

  it("script branches by mode (subway gets line, bus gets number)", () => {
    // Run setup until we see both branches
    let sawSubway = false;
    let sawBus = false;
    for (let i = 0; i < 100 && !(sawSubway && sawBus); i++) {
      const scenario = getScenario("book2_unit2_directions_asker");
      const script = scenario.conversationScript();
      const allText = script.map((s) => s.description).join(" ");
      if (scenario.context.mode === "subway") {
        sawSubway = true;
        expect(allText).toContain("호선");
      } else {
        sawBus = true;
        expect(allText).toContain("번 버스");
      }
    }
    expect(sawSubway).toBe(true);
    expect(sawBus).toBe(true);
  });

  it("grammar list has 4 patterns", () => {
    const scenario = getScenario("book2_unit2_directions_asker");
    expect(scenario.grammar.length).toBe(4);
  });
});

describe("unit9-phone promptContext (regression)", () => {
  it("returns the phone-scenario CONTEXT block", () => {
    const scenario = getScenario("unit9_phone_caller");
    const ctx = scenario.promptContext();
    expect(ctx).toContain("CONTEXT:");
    expect(ctx).toContain("Caller name:");
    expect(ctx).toContain("Speaker A = the caller");
    expect(ctx).toContain("Speaker B = the person answering");
  });
});
