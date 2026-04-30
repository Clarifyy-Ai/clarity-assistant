// Private Mode hook — covers Settings/Privacy P1
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  usePrivateMode,
  getPrivateMode,
  setPrivateMode,
} from "@/hooks/usePrivateMode";

describe("usePrivateMode", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to disabled", () => {
    const { result } = renderHook(() => usePrivateMode());
    expect(result.current.enabled).toBe(false);
  });

  it("toggle flips state and persists", () => {
    const { result } = renderHook(() => usePrivateMode());
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
    expect(getPrivateMode()).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
  });

  it("set(true) directly", () => {
    const { result } = renderHook(() => usePrivateMode());
    act(() => result.current.set(true));
    expect(result.current.enabled).toBe(true);
  });

  it("syncs across hook instances via custom event", () => {
    const { result: a } = renderHook(() => usePrivateMode());
    const { result: b } = renderHook(() => usePrivateMode());
    act(() => setPrivateMode(true));
    expect(a.current.enabled).toBe(true);
    expect(b.current.enabled).toBe(true);
  });
});
