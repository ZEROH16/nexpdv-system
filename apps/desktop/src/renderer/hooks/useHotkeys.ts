import { useEffect } from "react";

type HotkeyAction = (event: KeyboardEvent) => void;

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
};

export const useHotkeys = (bindings: Record<string, HotkeyAction>) => {
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
        const isFunctionKey = /^F\d{1,2}$/.test(event.key);
        if (isEditableTarget(event.target) && !isFunctionKey && event.key !== "Escape") return;
        event.preventDefault();
        action(event);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bindings]);
};
