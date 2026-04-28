// src/lib/audio/deepgramClient.ts
//
// FIX: The original file was a dead stub — connect() was empty and nothing
// in the codebase used it. The real Deepgram integration lives in
// deepgramStream.ts (DeepgramStreamClient with token refresh, reconnect
// backoff, filler detection, majority-vote diarization).
//
// This file re-exports the real client so any legacy import paths still resolve.

export { DeepgramStreamClient, DeepgramStreamOptions } from "./deepgramStream";

// Alias for any code that still references the old class name.
export { DeepgramStreamClient as DeepgramClient } from "./deepgramStream";
