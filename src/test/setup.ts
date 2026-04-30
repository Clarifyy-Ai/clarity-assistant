import "@testing-library/jest-dom";
import { vi, beforeEach } from "vitest";

// matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// ResizeObserver / IntersectionObserver polyfills
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = "";
  thresholds = [];
}
// @ts-ignore
globalThis.ResizeObserver = globalThis.ResizeObserver || RO;
// @ts-ignore
globalThis.IntersectionObserver = globalThis.IntersectionObserver || IO;

// crypto.randomUUID for jsdom
if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = {};
}
if (!globalThis.crypto.randomUUID) {
  // @ts-ignore
  globalThis.crypto.randomUUID = (() =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    })) as any;
}

// URL.createObjectURL
if (!URL.createObjectURL) {
  // @ts-ignore
  URL.createObjectURL = () => "blob:mock";
}
if (!URL.revokeObjectURL) {
  // @ts-ignore
  URL.revokeObjectURL = () => {};
}

// localStorage scoping helper - clear between tests
beforeEach(() => {
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
});

// Silence noisy console in tests unless explicitly checked
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});
