import React, { useState, useEffect } from "react";
import { ScenarioSelect } from "./components/scenario-select";
import { Conversation } from "./components/conversation";
import { PictureSpeaking } from "./components/picture-speaking";
import { getScenario, type Briefing, type Scenario } from "./scenarios/index";
import { parseHash, navigate } from "./utils/routing";
import { DEFAULT_WRONG_DAYS } from "./engine/pipeline-types";

const INIT_PARAMS =
  typeof window !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const EASY_MODE_INIT = INIT_PARAMS.has("easy");
const WRONG_DAYS_INIT: number | null =
  INIT_PARAMS.has("wrong") ? (Number(INIT_PARAMS.get("wrong")) || DEFAULT_WRONG_DAYS) : null;

export function App() {
  const initial = parseHash(location.hash);
  const [screen, setScreen] = useState(initial.screen);
  const [scenarioId, setScenarioId] = useState<string | null>(initial.scenarioId);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(!!initial.scenarioId);
  const [easyMode, setEasyMode] = useState(EASY_MODE_INIT);
  const [wrongDays, setWrongDaysState] = useState<number | null>(WRONG_DAYS_INIT);

  function updateQueryString(updater: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(location.search);
    updater(params);
    const qs = params.toString().replace(/=(?=&|$)/g, "");
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }

  function toggleEasyMode() {
    setEasyMode((prev) => {
      const next = !prev;
      updateQueryString((p) => next ? p.set("easy", "") : p.delete("easy"));
      return next;
    });
  }

  function setWrongDays(days: number | null) {
    setWrongDaysState(days);
    updateQueryString((p) => days != null ? p.set("wrong", String(days)) : p.delete("wrong"));
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
    if (briefing.picture_speaking) {
      return (
        <PictureSpeaking
          key={scenarioId}
          briefing={briefing}
          onEnd={handleBack}
          easyMode={easyMode}
          onToggleEasy={toggleEasyMode}
          wrongDays={wrongDays}
          onSetWrongDays={setWrongDays}
        />
      );
    }
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
