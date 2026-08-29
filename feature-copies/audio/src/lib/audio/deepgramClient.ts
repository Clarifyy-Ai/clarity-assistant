// src/lib/audio/deepgramClient.ts
//
// This file re-exports the real client so any legacy import paths still resolve.

export { DeepgramStreamClient } from "./deepgramStream";
export type { DeepgramStreamOptions } from "./deepgramStream";

// Alias for any code that still references the old class name.
export { DeepgramStreamClient as DeepgramClient } from "./deepgramStream";
