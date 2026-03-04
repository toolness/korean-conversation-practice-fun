/** STT Scratchpad — speak and see transcribed text, no evaluation. */

import { type Scenario, type ScriptStep, type Briefing, type ScenarioContext, register } from "./index";

function createScratchpadScenario(role: string): Scenario {
  return {
    id: "scratchpad",
    unit: 0,
    title: "STT Scratchpad",
    grammar: [],
    role,
    context: {},
    exampleConversations: [],

    roles() { return []; },
    roleDisplayTitle() { return this.title; },
    setup() {},
    conversationScript() { return []; },
    learnerSpeaker() { return "A"; },
    vocabSection() { return ""; },
    formatExamples() { return ""; },

    briefing(): Briefing {
      return {
        id: this.id,
        unit: this.unit,
        title: this.title,
        grammar: [],
        context: {},
        scratchpad: true,
        start_hint: "Hold Space and speak — your words will appear as text.",
      };
    },
  };
}

register(createScratchpadScenario);
