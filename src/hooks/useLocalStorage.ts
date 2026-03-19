import { useState, useEffect, useCallback, useRef } from "react";

type SetValue<T> = (value: T | ((prev: T) => T)) => void;

interface UseLocalStorageOptions<T> {
  serializer?: (value: T) => string;
  deserializer?: (value: string) => T;
  syncAcrossTabs?: boolean;
  onError?: (error: Error) => void;
}

/**
 * A robust localStorage hook with:
 * - Generic type safety
 * - Cross-tab sync via StorageEvent
 * - Custom serializer/deserializer support
 * - SSR-safe (no window access during SSR)
 * - Error boundary callbacks
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: UseLocalStorageOptions<T> = {}
): [T, SetValue<T>, () => void] {
  const {
    serializer = JSON.stringify,
    deserializer = JSON.parse,
    syncAcrossTabs = true,
    onError,
  } = options;

  // Stable ref for the key to avoid stale closures
  const keyRef = useRef(key);
  keyRef.current = key;

  const readValue = useCallback((): T => {
    if (typeof window === "undefined") return initialValue;

    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? deserializer(raw) : initialValue;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      console.warn(`[useLocalStorage] Failed to read key "${key}":`, err);
      return initialValue;
    }
  }, [key, initialValue, deserializer, onError]);

  const [storedValue, setStoredValue] = useState<T>(readValue);

  const setValue: SetValue<T> = useCallback(
    (value) => {
      if (typeof window === "undefined") {
        console.warn(`[useLocalStorage] Cannot set key "${key}" in SSR context.`);
        return;
      }

      try {
        const newValue =
          value instanceof Function ? value(storedValue) : value;
        window.localStorage.setItem(key, serializer(newValue));
        setStoredValue(newValue);

        // Dispatch custom event to notify same-tab listeners
        window.dispatchEvent(
          new StorageEvent("storage", {
            key,
            newValue: serializer(newValue),
            storageArea: window.localStorage,
          })
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onError?.(err);
        console.warn(`[useLocalStorage] Failed to set key "${key}":`, err);
      }
    },
    [key, serializer, storedValue, onError]
  );

  const removeValue = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          newValue: null,
          storageArea: window.localStorage,
        })
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      console.warn(`[useLocalStorage] Failed to remove key "${key}":`, err);
    }
  }, [key, initialValue, onError]);

  // Re-read when key changes externally
  useEffect(() => {
    setStoredValue(readValue());
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-tab sync
  useEffect(() => {
    if (!syncAcrossTabs) return;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== keyRef.current) return;

      try {
        const newValue =
          event.newValue !== null
            ? deserializer(event.newValue)
            : initialValue;
        setStoredValue(newValue);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onError?.(err);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [syncAcrossTabs, deserializer, initialValue, onError]);

  return [storedValue, setValue, removeValue];
}

// ─── Typed convenience wrappers ───────────────────────────────────────────────

/** Store a simple string value */
export function useLocalStorageString(key: string, initialValue = "") {
  return useLocalStorage<string>(key, initialValue, {
    serializer: (v) => v,
    deserializer: (v) => v,
  });
}

/** Store a boolean flag */
export function useLocalStorageBoolean(key: string, initialValue = false) {
  return useLocalStorage<boolean>(key, initialValue, {
    serializer: (v) => String(v),
    deserializer: (v) => v === "true",
  });
}

/** Store a number */
export function useLocalStorageNumber(key: string, initialValue = 0) {
  return useLocalStorage<number>(key, initialValue, {
    serializer: (v) => String(v),
    deserializer: (v) => Number(v),
  });
}
