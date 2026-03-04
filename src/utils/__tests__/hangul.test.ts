import { describe, it, expect } from "bun:test";
import { stripToHangul } from "../hangul";

describe("stripToHangul", () => {
  it("removes punctuation and spaces", () => {
    expect(stripToHangul("안녕하세요!")).toBe("안녕하세요");
    expect(stripToHangul("네, 그런데요.")).toBe("네그런데요");
  });

  it("removes non-Korean characters", () => {
    expect(stripToHangul("hello 안녕")).toBe("안녕");
  });

  it("returns empty for non-Korean input", () => {
    expect(stripToHangul("")).toBe("");
    expect(stripToHangul("...!? ")).toBe("");
  });
});
