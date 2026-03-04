import React, { useState, useEffect } from "react";
import { ScenarioSelect } from "./components/scenario-select";
import { Conversation } from "./components/conversation";
import { getScenario, type Briefing } from "./scenarios/index";
import { parseHash, navigate } from "./utils/routing";

const EASY_MODE_INIT =
  typeof window !== "undefined" && new URLSearchParams(location.search).has("easy");

export function App() {
  const initial = parseHash(location.hash);
  const [screen, setScreen] = useState(initial.screen);
  const [scenarioId, setScenarioId] = useState<string | null>(initial.scenarioId);
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

  function loadScenario(id: string) {
    const scenario = getScenario(id);
    return scenario.briefing();
  }

  // On first load, if URL has a scenario, get its briefing
  useEffect(() => {
    if (initial.scenarioId) {
      const b = loadScenario(initial.scenarioId);
      b.id = initial.scenarioId; // use registry key
      setBriefing(b);
      setLoading(false);
    }
  }, []);

  // Listen for back/forward navigation
  useEffect(() => {
    function onPopState() {
      const { screen: s, scenarioId: sid } = parseHash(location.hash);
      setScreen(s);
      setScenarioId(sid);
      if (sid && (!briefing || briefing.id !== sid)) {
        const b = loadScenario(sid);
        b.id = sid;
        setBriefing(b);
      }
      if (!sid) setBriefing(null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [briefing]);

  function handleSelect(id: string) {
    const b = loadScenario(id);
    b.id = id;
    setBriefing(b);
    setScenarioId(id);
    setScreen("conversation");
    navigate("conversation", id);
  }

  function handleBack() {
    setScreen("select");
    setBriefing(null);
    setScenarioId(null);
    navigate("select");
  }

  if (loading) return <p>Loading...</p>;

  if (screen === "conversation" && briefing && scenarioId) {
    return (
      <Conversation
        key={scenarioId}
        scenarioId={scenarioId}
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
