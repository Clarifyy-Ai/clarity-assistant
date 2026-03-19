// ─────────────────────────────────────────────────────────────────────────────
// useLocalStorage.test.ts — Tests for the useLocalStorage hook:
// read, write, default values, JSON serialization, SSR safety,
// cross-tab sync via storage events, and error resilience.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act }                                  from "@testing-library/react";
import { useLocalStorage }                                  from "@/hooks/useLocalStorage";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

// ─── Basic read / write ───────────────────────────────────────────────────────

describe("useLocalStorage — basic read/write", () => {
  it("returns the default value when key does not exist", () => {
    const { result } = renderHook(() =>
      useLocalStorage("nonexistent-key", "default-value")
    );
    expect(result.current[0]).toBe("default-value");
  });

  it("reads an existing value from localStorage", () => {
    localStorage.setItem("test-key", JSON.stringify("stored-value"));
    const { result } = renderHook(() =>
      useLocalStorage("test-key", "default")
    );
    expect(result.current[0]).toBe("stored-value");
  });

  it("writes a new value to localStorage", () => {
    const { result } = renderHook(() =>
      useLocalStorage("write-key", "initial")
    );

    act(() => { result.current[1]("updated"); });

    expect(result.current[0]).toBe("updated");
    expect(JSON.parse(localStorage.getItem("write-key")!)).toBe("updated");
  });

  it("updates state when setter is called with a function", () => {
    const { result } = renderHook(() =>
      useLocalStorage("counter", 0)
    );

    act(() => { result.current[1]((prev) => prev + 1); });
    act(() => { result.current[1]((prev) => prev + 1); });

    expect(result.current[0]).toBe(2);
  });
});

// ─── Data types ───────────────────────────────────────────────────────────────

describe("useLocalStorage — data types", () => {
  it("handles object values with deep equality", () => {
    const initial = { name: "Alice", age: 30 };
    const { result } = renderHook(() =>
      useLocalStorage("obj-key", initial)
    );

    act(() => {
      result.current[1]({ name: "Bob", age: 25 });
    });

    expect(result.current[0]).toEqual({ name: "Bob", age: 25 });
    expect(JSON.parse(localStorage.getItem("obj-key")!)).toEqual({ name: "Bob", age: 25 });
  });

  it("handles array values", () => {
    const { result } = renderHook(() =>
      useLocalStorage<string[]>("arr-key", [])
    );

    act(() => { result.current[1](["a", "b", "c"]); });

    expect(result.current[0]).toEqual(["a", "b", "c"]);
  });

  it("handles boolean values", () => {
    const { result } = renderHook(() =>
      useLocalStorage("bool-key", false)
    );

    act(() => { result.current[1](true); });

    expect(result.current[0]).toBe(true);
    expect(JSON.parse(localStorage.getItem("bool-key")!)).toBe(true);
  });

  it("handles null values", () => {
    const { result } = renderHook(() =>
      useLocalStorage<string | null>("null-key", "default")
    );

    act(() => { result.current[1](null); });

    expect(result.current[0]).toBeNull();
  });

  it("handles number values including 0", () => {
    const { result } = renderHook(() =>
      useLocalStorage("num-key", 99)
    );

    act(() => { result.current[1](0); });

    expect(result.current[0]).toBe(0);
  });
});

// ─── Default values ───────────────────────────────────────────────────────────

describe("useLocalStorage — default values", () => {
  it("does not write default value to storage on init", () => {
    renderHook(() => useLocalStorage("init-key", "default"));
    expect(localStorage.getItem("init-key")).toBeNull();
  });

  it("uses the latest default if key is missing after clear", () => {
    const { result } = renderHook(() =>
      useLocalStorage("missing-key", 42)
    );
    expect(result.current[0]).toBe(42);
  });
});

// ─── Remove ───────────────────────────────────────────────────────────────────

describe("useLocalStorage — remove", () => {
  it("exposes a removeValue helper that clears the key", () => {
    const { result } = renderHook(() =>
      useLocalStorage("remove-key", "value")
    );

    act(() => { result.current[1]("stored"); });
    expect(localStorage.getItem("remove-key")).not.toBeNull();

    // Third tuple element is removeValue
    act(() => { result.current[2]?.(); });

    expect(localStorage.getItem("remove-key")).toBeNull();
    expect(result.current[0]).toBe("value"); // reverts to default
  });
});

// ─── Storage event (cross-tab sync) ─────────────────────────────────────────

describe("useLocalStorage — cross-tab storage event", () => {
  it("updates state when a storage event fires for the same key", () => {
    const { result } = renderHook(() =>
      useLocalStorage("sync-key", "initial")
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key:      "sync-key",
          newValue: JSON.stringify("from-other-tab"),
        })
      );
    });

    expect(result.current[0]).toBe("from-other-tab");
  });

  it("ignores storage events for different keys", () => {
    const { result } = renderHook(() =>
      useLocalStorage("my-key", "mine")
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key:      "other-key",
          newValue: JSON.stringify("other-value"),
        })
      );
    });

    expect(result.current[0]).toBe("mine");
  });

  it("reverts to default when storage event newValue is null (key deleted)", () => {
    const { result } = renderHook(() =>
      useLocalStorage("deleted-key", "fallback")
    );

    act(() => { result.current[1]("set-value"); });

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key:      "deleted-key",
          newValue: null,
        })
      );
    });

    expect(result.current[0]).toBe("fallback");
  });
});

// ─── Error resilience ─────────────────────────────────────────────────────────

describe("useLocalStorage — error resilience", () => {
  it("falls back to default when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new Error("Storage unavailable");
    });

    const { result } = renderHook(() =>
      useLocalStorage("error-key", "safe-default")
    );

    expect(result.current[0]).toBe("safe-default");
  });

  it("falls back to default when stored value is corrupt JSON", () => {
    localStorage.setItem("corrupt-key", "{ not valid json }}}");

    const { result } = renderHook(() =>
      useLocalStorage("corrupt-key", "default")
    );

    expect(result.current[0]).toBe("default");
  });

  it("does not throw when localStorage.setItem throws (quota exceeded)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("QuotaExceededError");
    });

    const { result } = renderHook(() =>
      useLocalStorage("quota-key", "initial")
    );

    expect(() => {
      act(() => { result.current[1]("new-value"); });
    }).not.toThrow();
  });
});
