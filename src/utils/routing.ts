/** Hash-based routing utilities. */

export interface RouteState {
  screen: string;
  scenarioId: string | null;
}

export function parseHash(hash: string): RouteState {
  const h = hash.replace(/^#\/?/, "");
  if (!h) return { screen: "select", scenarioId: null };
  const [screen, scenarioId] = h.split("/");
  const s = screen || "select";
  return {
    screen: s === "briefing" ? "conversation" : s,
    scenarioId: scenarioId || null,
  };
}

export function navigate(screen: string, scenarioId?: string): void {
  if (screen === "select") {
    history.pushState(null, "", location.pathname + location.search);
  } else {
    history.pushState(
      null,
      "",
      location.pathname + location.search + `#${screen}/${scenarioId}`
    );
  }
}
