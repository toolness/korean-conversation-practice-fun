import React, { useState, useEffect } from "react";
import { listScenarios } from "../scenarios/index";
import { EasyModeToggle } from "./easy-mode-toggle";

interface Props {
  onSelect: (id: string) => void;
  easyMode: boolean;
  onToggleEasy: () => void;
}

export function ScenarioSelect({ onSelect, easyMode, onToggleEasy }: Props) {
  const scenarios = listScenarios();

  // Group by unit
  const byUnit: Record<number, typeof scenarios> = {};
  for (const s of scenarios) {
    if (!byUnit[s.unit]) byUnit[s.unit] = [];
    byUnit[s.unit].push(s);
  }

  return (
    <div>
      <h1>Korean Conversation Practice</h1>
      <p className="subtitle">Choose a scenario to practice</p>
      <EasyModeToggle easyMode={easyMode} onToggle={onToggleEasy} />
      {Object.entries(byUnit).map(([unit, items]) => (
        <div key={unit}>
          <div className="wireframe-label">Unit {unit}</div>
          {items.map((s) => (
            <div
              className="scenario-card"
              key={s.id}
              tabIndex={0}
              role="button"
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(s.id);
                }
              }}
            >
              <span className="unit-badge">U{s.unit}</span> {s.title}
              {s.grammar.length > 0 && (
                <div className="grammar-tags">
                  Grammar: {s.grammar.join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
