import React from "react";

interface Props {
  easyMode: boolean;
  onToggle: () => void;
}

export function EasyModeToggle({ easyMode, onToggle }: Props) {
  return (
    <label className="easy-mode-toggle">
      <input type="checkbox" checked={easyMode} onChange={onToggle} />
      Easy mode{" "}
      <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
        — shows what to say next
      </span>
    </label>
  );
}
