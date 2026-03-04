/** Scenario registry — separate module to avoid circular initialization issues. */

import type { Scenario } from "./index";

type ScenarioFactory = (role: string) => Scenario;

const REGISTRY = new Map<string, { factory: ScenarioFactory; role: string }>();

export function register(factory: ScenarioFactory): void {
  const base = factory("");
  const roles = base.roles();
  if (roles.length > 0) {
    for (const role of roles) {
      REGISTRY.set(`${base.id}_${role}`, { factory, role });
    }
  } else {
    REGISTRY.set(base.id, { factory, role: "" });
  }
}

export function getScenario(scenarioId: string): Scenario {
  ensureScenariosLoaded();
  const entry = REGISTRY.get(scenarioId);
  if (!entry) throw new Error(`Unknown scenario: ${scenarioId}`);
  const instance = entry.factory(entry.role);
  instance.setup();
  return instance;
}

export function listScenarios(): Array<{
  id: string;
  unit: number;
  title: string;
  grammar: string[];
}> {
  ensureScenariosLoaded();
  const result: Array<{ id: string; unit: number; title: string; grammar: string[] }> = [];
  for (const [id, { factory, role }] of REGISTRY) {
    const s = factory(role);
    result.push({
      id,
      unit: s.unit,
      title: s.roleDisplayTitle(),
      grammar: s.grammar,
    });
  }
  result.sort((a, b) => a.unit - b.unit || a.title.localeCompare(b.title));
  return result;
}

let _loaded = false;

export function ensureScenariosLoaded(): void {
  if (_loaded) return;
  _loaded = true;
  // Dynamic requires to avoid circular initialization
  require("./unit9-phone");
  require("./scratchpad");
}
