import React, { useState, useEffect } from "react";
import { ScenarioSelect } from "./components/scenario-select";
import { Conversation } from "./components/conversation";
import { getScenario, type Briefing, type Scenario } from "./scenarios/index";
import { parseHash, navigate } from "./utils/routing";

const EASY_MODE_INIT =
  typeof window !== "undefined" && new URLSearchParams(location.search).has("easy");

export function App() {
  const initial = parseHash(location.hash);
  const [screen, setScreen] = useState(initial.screen);
  const [scenarioId, setScenarioId] = useState<string | null>(initial.scenarioId);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(!!initial.scenarioId);
  const [easyMode, setEasyMode] = useState(EASY_MODE_INIT);

  function toggleEasyMode() {
    setEasyMode((prev) => {
      const next = !prev;
      const params = new URLSearchParams(location.search);
      if (next) params.set("easy", "");
      else params.delete("easy");
      const qs = params.toString().replace(/=(?=&|$)/g, "");
      history.replaceState(
        null,
        "",
        location.pathname + (qs ? "?" + qs : "") + location.hash
      );
      return next;
    });
  }

  function loadScenario(id: string): { scenario: Scenario; briefing: Briefing } {
    const s = getScenario(id);
    const b = s.briefing();
    b.id = id;
    return { scenario: s, briefing: b };
  }

  // On first load, if URL has a scenario, get its briefing
  useEffect(() => {
    if (initial.scenarioId) {
      const { scenario: s, briefing: b } = loadScenario(initial.scenarioId);
      setScenario(s);
      setBriefing(b);
      setLoading(false);
    }
  }, []);

  // Listen for back/forward navigation
  useEffect(() => {
    function onPopState() {
      const { screen: scr, scenarioId: sid } = parseHash(location.hash);
      setScreen(scr);
      setScenarioId(sid);
      if (sid && (!briefing || briefing.id !== sid)) {
        const { scenario: s, briefing: b } = loadScenario(sid);
        setScenario(s);
        setBriefing(b);
      }
      if (!sid) {
        setScenario(null);
        setBriefing(null);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [briefing]);

  function handleSelect(id: string) {
    const { scenario: s, briefing: b } = loadScenario(id);
    setScenario(s);
    setBriefing(b);
    setScenarioId(id);
    setScreen("conversation");
    navigate("conversation", id);
  }

  function handleBack() {
    setScreen("select");
    setScenario(null);
    setBriefing(null);
    setScenarioId(null);
    navigate("select");
  }

  if (loading) return <p>Loading...</p>;

  if (screen === "conversation" && briefing && scenario && scenarioId) {
    return (
      <Conversation
        key={scenarioId}
        scenario={scenario}
        briefing={briefing}
        onEnd={handleBack}
        easyMode={easyMode}
        onToggleEasy={toggleEasyMode}
      />
    );
  }

  return (
    <ScenarioSelect
      onSelect={handleSelect}
      easyMode={easyMode}
      onToggleEasy={toggleEasyMode}
    />
  );
}
