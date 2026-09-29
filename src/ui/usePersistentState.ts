import { useEffect, useState } from 'react';

/** Per-viewer UI convenience state in localStorage. Never used for schedule data. */
export function usePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(`cogsworth:${key}`);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`cogsworth:${key}`, JSON.stringify(value));
    } catch {
      // Private mode or blocked storage: the preference just isn't remembered.
    }
  }, [key, value]);
  return [value, setValue];
}
