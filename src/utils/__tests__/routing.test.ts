import { describe, it, expect } from "bun:test";
import { parseHash } from "../routing";

describe("parseHash", () => {
  it("returns select screen for empty hash", () => {
    expect(parseHash("")).toEqual({ screen: "select", scenarioId: null });
    expect(parseHash("#")).toEqual({ screen: "select", scenarioId: null });
  });

  it("parses conversation screen with scenario id", () => {
    expect(parseHash("#conversation/unit9_phone_caller")).toEqual({
      screen: "conversation",
      scenarioId: "unit9_phone_caller",
    });
  });

  it("maps briefing to conversation", () => {
    expect(parseHash("#briefing/unit9_phone_caller")).toEqual({
      screen: "conversation",
      scenarioId: "unit9_phone_caller",
    });
  });

  it("handles hash with leading slash", () => {
    expect(parseHash("#/conversation/unit9_phone_caller")).toEqual({
      screen: "conversation",
      scenarioId: "unit9_phone_caller",
    });
  });

  it("returns null scenarioId when no id in hash", () => {
    expect(parseHash("#select")).toEqual({
      screen: "select",
      scenarioId: null,
    });
  });
});
