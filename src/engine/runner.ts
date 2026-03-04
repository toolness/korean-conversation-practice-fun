/** ScriptRunner — conversation state machine, runs entirely on the frontend. */

import type { Scenario, ScriptStep } from "../scenarios/index";
import { classify } from "./classify";

export interface AgentEvent {
  type: "speak" | "correct" | "expect" | "complete" | "done";
  text?: string;
  hint?: string;
}

export class ScriptRunner {
  scenario: Scenario;
  script: ScriptStep[];
  stepIndex = 0;
  learnerSpeaker: string;
  history: Array<{ speaker: string; text: string }> = [];
  easyMode: boolean;

  constructor(scenario: Scenario, script: ScriptStep[], easyMode = false) {
    this.scenario = scenario;
    this.script = script;
    this.learnerSpeaker = scenario.learnerSpeaker();
    this.easyMode = easyMode;
  }

  get currentStep(): ScriptStep | null {
    return this.stepIndex < this.script.length ? this.script[this.stepIndex] : null;
  }

  get isComplete(): boolean {
    return this.stepIndex >= this.script.length;
  }

  private isLearnerStep(step: ScriptStep): boolean {
    return step.speaker === this.learnerSpeaker;
  }

  /** Handle [START] trigger — emit any leading partner steps. */
  async *handleStart(): AsyncGenerator<AgentEvent> {
    yield* this.emitPartnerSteps();
    const expect = this.maybeExpectEvent();
    if (expect) yield expect;
    yield { type: "done" };
  }

  /** Handle learner input — classify, advance, emit partner steps. */
  async *handleInput(text: string, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const step = this.currentStep;
    if (!step) {
      yield { type: "done" };
      return;
    }

    if (!this.isLearnerStep(step)) {
      console.warn(`Expected learner step at index ${this.stepIndex} but got partner step`);
      yield { type: "done" };
      return;
    }

    const result = await classify(text, step, this.history, this.learnerSpeaker, signal);

    if (result === "MATCH") {
      this.history.push({ speaker: step.speaker, text });
      this.stepIndex++;
      yield* this.emitPartnerSteps();
      if (this.isComplete) {
        yield { type: "complete" };
      } else {
        const expect = this.maybeExpectEvent();
        if (expect) yield expect;
      }
    } else {
      yield { type: "correct", hint: result };
    }

    yield { type: "done" };
  }

  /** Emit all consecutive partner steps from current position. */
  private async *emitPartnerSteps(): AsyncGenerator<AgentEvent> {
    while (this.currentStep && !this.isLearnerStep(this.currentStep)) {
      const step = this.currentStep;
      yield { type: "speak", text: step.resolved_text };
      this.history.push({ speaker: step.speaker, text: step.resolved_text });
      this.stepIndex++;
    }
  }

  /** If in easy mode and next step is a learner step, return an expect event. */
  maybeExpectEvent(): AgentEvent | null {
    if (this.easyMode && this.currentStep && this.isLearnerStep(this.currentStep)) {
      return { type: "expect", text: this.currentStep.resolved_text };
    }
    return null;
  }
}
