import { useEffect } from "react";

export const useHotkeys = (bindings: Record<string, () => void>) => {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const key = [
        event.ctrlKey ? "Ctrl" : "",
        event.altKey ? "Alt" : "",
        event.shiftKey ? "Shift" : "",
        event.key
      ]
        .filter(Boolean)
        .join("+");
      const action = bindings[key] ?? bindings[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bindings]);
};
