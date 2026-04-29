import { useState } from "react";

/**
 * Like useState, but persists the value in localStorage under the given key.
 */
export function useStickyState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored !== null ? stored : defaultValue;
  });

  function set(next) {
    setValue((prev) => {
      const val = typeof next === "function" ? next(prev) : next;
      localStorage.setItem(key, val);
      return val;
    });
  }

  return [value, set];
}
