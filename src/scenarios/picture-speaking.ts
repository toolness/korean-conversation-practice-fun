/** Picture-speaking drill scenario — construct Korean sentences from picture prompts. */

import type { Briefing, Scenario } from "./index";
import { register } from "./registry";

function createPictureSpeakingScenario(role: string): Scenario {
  return {
    id: "picture_speaking",
    unit: 0,
    title: "Picture Speaking",
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
    promptContext() { return ""; },

    briefing(): Briefing {
      return {
        id: this.id,
        unit: this.unit,
        title: this.title,
        grammar: [],
        context: {},
        picture_speaking: true,
        start_hint: "Pictures will appear above. Speak a Korean sentence using those words.",
      } as Briefing;
    },
  };
}

register(createPictureSpeakingScenario);
