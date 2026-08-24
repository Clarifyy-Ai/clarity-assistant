import type { PreferredAIModel } from "@/types/user.types";
import { useSyncExternalStore } from "react";
import { EDGE_BASE, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";
import { isModelAvailableForPlan, normalizePreferredModel } from "./modelOptions";

export type AiProviderId = "gemini" | "openai" | "anthropic" | "deepgram";

export interface ProviderFlags {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
  deepgram: boolean;
}

const DEFAULT_FLAGS: ProviderFlags = {
  gemini: true,
  openai: false,
  anthropic: false,
  deepgram: true,
};

let flags: ProviderFlags = { ...DEFAULT_FLAGS };
let loaded = false;
let inFlight: Promise<ProviderFlags> | null = null;
const listeners = new Set<() => void>();

export function getProviderFlags(): ProviderFlags {
  return flags;
}

export function subscribeProviderFlags(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function providerForModel(
  model: PreferredAIModel | string | null | undefined,
): AiProviderId {
  const slug = normalizePreferredModel(model);
  if (slug.startsWith("gpt")) return "openai";
  if (slug.startsWith("claude")) return "anthropic";
  return "gemini";
}

export function isProviderConfigured(id: AiProviderId): boolean {
  return flags[id] !== false;
}

export function markProviderUnavailable(id: AiProviderId): void {
  if (flags[id] === false) return;
  flags = { ...flags, [id]: false };
  emit();
}

export function providerUnavailableReason(id: AiProviderId): string {
  switch (id) {
    case "openai":
      return "ChatGPT / OpenAI is not available (missing key or no credits).";
    case "anthropic":
      return "Claude is not available (API key not configured).";
    case "deepgram":
      return "Live transcription is not available.";
    default:
      return "Gemini is not available (API key not configured).";
  }
}

function pingUrl(): string {
  const base = String(EDGE_BASE ?? "").replace(/\/+$/, "");
  if (base.endsWith("/functions/v1")) return `${base}/ping`;
  if (base.includes("/functions/v1/")) {
    return `${base.replace(/\/functions\/v1\/.*/, "/functions/v1")}/ping`;
  }
  return `${base}/functions/v1/ping`;
}

export async function refreshProviderAvailability(): Promise<ProviderFlags> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch(pingUrl(), {
        method: "GET",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const json = (await res.json().catch(() => null)) as
        | { status?: string; providers?: unknown }
        | null;
      // Public /ping is liveness only and must never leak provider inventory.
      // Keep last-known flags; operation errors update availability via
      // noteProviderFailureFromError. start-session.readiness is authoritative.
      if (json && typeof json === "object" && "providers" in json && json.providers) {
        console.warn("[providerAvailability] ignoring public provider inventory");
      }
      // Liveness is not provider inventory. Keep provider availability
      // unknown until an authenticated operation reports a concrete result.
      loaded = false;
      emit();
    } catch {
      // Keep last known flags — do not mark Gemini down on a probe failure.
    } finally {
      inFlight = null;
    }
    return flags;
  })();
  return inFlight;
}

export function hasLoadedProviderFlags(): boolean {
  return loaded;
}

/** Test-only: reset in-memory provider flags. */
export function resetProviderFlagsForTests(next?: Partial<ProviderFlags>): void {
  flags = { ...DEFAULT_FLAGS, ...next };
  loaded = Boolean(next);
}

export function noteProviderFailureFromError(err: unknown): void {
  const text = (
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err ?? "")
  ).toLowerCase();
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: string }).code ?? "").toLowerCase()
      : "";
  if (
    text.includes("openai") ||
    text.includes("gpt-") ||
    text.includes("insufficient_quota") ||
    text.includes("credit_balance") ||
    code.includes("insufficient_quota")
  ) {
    markProviderUnavailable("openai");
  }
  if (text.includes("anthropic") || text.includes("claude")) {
    markProviderUnavailable("anthropic");
  }
  if (text.includes("gemini") && (text.includes("api key") || text.includes("not configured"))) {
    markProviderUnavailable("gemini");
  }
  if (text.includes("deepgram") || text.includes("transcription")) {
    markProviderUnavailable("deepgram");
  }
}

export function isModelProviderAvailable(
  model: PreferredAIModel | string | null | undefined,
): boolean {
  if (!loaded) return true;
  return isProviderConfigured(providerForModel(model));
}

export type ModelLockReason = "plan" | "provider" | null;

export function getModelLockReason(
  model: PreferredAIModel | string | null | undefined,
  planId: string | null | undefined,
): ModelLockReason {
  if (!isModelAvailableForPlan(model, planId)) return "plan";
  if (!isModelProviderAvailable(model)) return "provider";
  return null;
}

export function useProviderFlags(): ProviderFlags {
  return useSyncExternalStore(subscribeProviderFlags, getProviderFlags, getProviderFlags);
}
