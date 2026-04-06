import { useState, useCallback } from 'react';
import { z, ZodTypeAny } from 'zod';

/**
 * React hook for type-safe, schema-validated localStorage access.
 * Replaces direct localStorage.getItem/setItem calls outside Zustand.
 *
 * @param key          - localStorage key
 * @param schema       - Zod schema for validation and parse
 * @param defaultValue - Value returned when key is absent or parse fails
 *
 * @example
 * const [theme, setTheme] = useLocalStorage('__MW::theme', z.string(), 'default');
 */
export function useLocalStorage<T>(
  key: string,
  schema: ZodTypeAny,
  defaultValue: T,
): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return schema.parse(JSON.parse(raw)) as T;
    } catch {
      // Malformed data or schema mismatch — return default and leave storage intact
      return defaultValue;
    }
  });

  const setValue = useCallback(
    (value: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage full or private mode — state still updates in memory
      }
      setState(value);
    },
    [key],
  );

  return [state, setValue];
}

/**
 * Non-hook version for use outside React components (e.g. in store initializers).
 */
export function getLocalStorageItem<T>(
  key: string,
  schema: ZodTypeAny,
  defaultValue: T,
): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return schema.parse(JSON.parse(raw)) as T;
  } catch {
    return defaultValue;
  }
}
