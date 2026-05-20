import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  FlaskConical,
  Key,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useAuthStore, type BYOKKeys } from "@/store/authStore";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// SettingsBYOK
//
// Storage model:
// - Keys are encrypted client-side with WebCrypto AES-GCM.
// - Keys are persisted only in local browser storage via byokVault.
// - Keys are hydrated into authStore.byokKeys in memory.
// - apiClient attaches them as x-byok-* headers only for AI requests.
// - Keys are not saved to Supabase profiles/database.
// - Keys are wiped on sign-out by authStore.signOut().
// ─────────────────────────────────────────────────────────────────────────────

type Provider = keyof BYOKKeys;
type TestResult = "pass" | "fail" | null;

type KeyField = {
  id: Provider;
  label: string;
  provider: string;
  placeholder: string;
  helper: string;
  maskPrefix: string;
};

const PROVIDERS: Provider[] = ["openai", "anthropic", "gemini"];

const KEY_FIELDS: KeyField[] = [
  {
    id: "openai",
    label: "OpenAI API Key",
    provider: "OpenAI",
    placeholder: "sk-...",
    helper: "Used for OpenAI-compatible AI calls when supported.",
    maskPrefix: "sk",
  },
  {
    id: "anthropic",
    label: "Anthropic API Key",
    provider: "Anthropic",
    placeholder: "sk-ant-...",
    helper: "Used for Anthropic Claude calls when supported.",
    maskPrefix: "sk-ant",
  },
  {
    id: "gemini",
    label: "Google AI API Key",
    provider: "Google Gemini",
    placeholder: "AIza...",
    helper: "Used for Gemini calls in supported Edge Functions.",
    maskPrefix: "AIza",
  },
];

const EMPTY_KEYS: Record<Provider, string> = {
  openai: "",
  anthropic: "",
  gemini: "",
};

function hasSavedKey(byokKeys: BYOKKeys, provider: Provider): boolean {
  return Boolean(byokKeys?.[provider]?.trim());
}

function getConfiguredCount(byokKeys: BYOKKeys): number {
  return PROVIDERS.filter((provider) => hasSavedKey(byokKeys, provider)).length;
}

function validateKeyFormat(provider: Provider, key: string): boolean {
  const trimmed = key.trim();

  if (!trimmed) {
    return false;
  }

  switch (provider) {
    case "openai":
      return /^sk-[A-Za-z0-9_\-]{20,}$/.test(trimmed);

    case "anthropic":
      return /^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(trimmed);

    case "gemini":
      return /^AIza[A-Za-z0-9_\-]{20,}$/.test(trimmed);

    default:
      return false;
  }
}

function getMaskedLabel(provider: Provider): string {
  const field = KEY_FIELDS.find((item) => item.id === provider);

  if (!field) {
    return "••••••••••••••••";
  }

  return `${field.maskPrefix}••••••••••••••••`;
}

export default function SettingsBYOK(): JSX.Element {
  const byokKeys = useAuthStore((state) => state.byokKeys);
  const setBYOKKey = useAuthStore((state) => state.setBYOKKey);
  const clearBYOKKey = useAuthStore((state) => state.clearBYOKKey);

  const [keys, setKeys] = useState<Record<Provider, string>>(EMPTY_KEYS);
  const [visible, setVisible] = useState<Record<Provider, boolean>>({
    openai: false,
    anthropic: false,
    gemini: false,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Record<Provider, boolean>>({
    openai: false,
    anthropic: false,
    gemini: false,
  });
  const [testResults, setTestResults] = useState<Record<Provider, TestResult>>({
    openai: null,
    anthropic: null,
    gemini: null,
  });

  const configuredCount = useMemo(
    () => getConfiguredCount(byokKeys),
    [byokKeys]
  );

  function updateKey(provider: Provider, value: string): void {
    setKeys((current) => ({
      ...current,
      [provider]: value,
    }));

    setTestResults((current) => ({
      ...current,
      [provider]: null,
    }));
  }

  function toggleVisibility(provider: Provider): void {
    setVisible((current) => ({
      ...current,
      [provider]: !current[provider],
    }));
  }

  async function handleSave(): Promise<void> {
    setSaving(true);

    try {
      const entries = PROVIDERS.filter((provider) => keys[provider].trim());

      if (entries.length === 0) {
        toast.info("Enter at least one API key to save.");
        return;
      }

      for (const provider of entries) {
        const value = keys[provider].trim();

        if (!validateKeyFormat(provider, value)) {
          const field = KEY_FIELDS.find((item) => item.id === provider);

          toast.error(`${field?.provider ?? provider} key format looks invalid.`);
          return;
        }
      }

      for (const provider of entries) {
        setBYOKKey(provider, keys[provider].trim());
      }

      setKeys(EMPTY_KEYS);
      setTestResults({
        openai: null,
        anthropic: null,
        gemini: null,
      });

      toast.success("API keys encrypted and saved on this device.");
    } catch (error) {
      console.error("[SettingsBYOK] Save failed:", error);
      toast.error("Failed to save API keys.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLocalFormatTest(provider: Provider): Promise<void> {
    const keyToTest = keys[provider].trim();

    if (!keyToTest) {
      toast.error("Enter a new key first to test its format.");
      return;
    }

    setTesting((current) => ({
      ...current,
      [provider]: true,
    }));

    setTestResults((current) => ({
      ...current,
      [provider]: null,
    }));

    try {
      // Local-only validation. We intentionally do not send the key to any
      // validation Edge Function from this settings screen.
      await new Promise((resolve) => window.setTimeout(resolve, 300));

      const valid = validateKeyFormat(provider, keyToTest);

      setTestResults((current) => ({
        ...current,
        [provider]: valid ? "pass" : "fail",
      }));

      if (valid) {
        toast.success("Key format looks valid.");
      } else {
        toast.error("Key format looks invalid.");
      }
    } finally {
      setTesting((current) => ({
        ...current,
        [provider]: false,
      }));
    }
  }

  function handleRemove(provider: Provider): void {
    try {
      clearBYOKKey(provider);

      setKeys((current) => ({
        ...current,
        [provider]: "",
      }));

      setTestResults((current) => ({
        ...current,
        [provider]: null,
      }));

      toast.success(`${provider} key removed from this device.`);
    } catch (error) {
      console.error("[SettingsBYOK] Remove failed:", error);
      toast.error("Failed to remove key.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Bring Your Own Keys
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Use your own provider keys for supported AI calls.
          </p>
        </div>

        <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-500">
          <ShieldCheck className="w-3.5 h-3.5" />
          AES-GCM encrypted on this device
        </span>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />

            <div>
              <p className="text-sm font-medium text-foreground">
                Device-local encrypted storage
              </p>

              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Keys are encrypted in this browser and are not stored in your
                database profile. When you use AI features, supported Edge
                Functions receive the relevant key as a temporary request header.
                Signing out clears the local vault.
              </p>

              <p className="text-xs text-muted-foreground mt-2">
                Configured providers:{" "}
                <span className="font-medium text-foreground">
                  {configuredCount}
                </span>
                /{PROVIDERS.length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {KEY_FIELDS.map((field) => {
        const saved = hasSavedKey(byokKeys, field.id);
        const result = testResults[field.id];
        const isTesting = testing[field.id];

        return (
          <Card key={field.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-muted-foreground" />

                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {field.label}
                    </h3>

                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {field.helper}
                    </p>
                  </div>
                </div>

                {saved && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-500">
                    <CheckCircle className="w-3 h-3" />
                    Configured
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <input
                    type={visible[field.id] ? "text" : "password"}
                    value={keys[field.id]}
                    onChange={(event) =>
                      updateKey(field.id, event.target.value)
                    }
                    placeholder={saved ? getMaskedLabel(field.id) : field.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className={cn(
                      "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground",
                      "placeholder:text-muted-foreground font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/50 pr-10",
                      result === "pass" && "border-emerald-500/60",
                      result === "fail" && "border-red-500/60"
                    )}
                  />

                  <button
                    type="button"
                    onClick={() => toggleVisibility(field.id)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={
                      visible[field.id] ? "Hide API key" : "Show API key"
                    }
                  >
                    {visible[field.id] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="flex gap-2">
                  {keys[field.id].trim() && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleLocalFormatTest(field.id)}
                      disabled={isTesting}
                      leftIcon={
                        isTesting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FlaskConical className="w-3.5 h-3.5" />
                        )
                      }
                      className={cn(
                        result === "pass" && "text-emerald-500",
                        result === "fail" && "text-red-400"
                      )}
                    >
                      {isTesting
                        ? "Checking..."
                        : result === "pass"
                          ? "Looks valid"
                          : result === "fail"
                            ? "Invalid"
                            : "Check"}
                    </Button>
                  )}

                  {saved && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(field.id)}
                      className="text-red-400 hover:text-red-300"
                      leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="md"
          onClick={() => void handleSave()}
          disabled={saving}
          leftIcon={
            saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Key className="w-4 h-4" />
            )
          }
        >
          {saving ? "Saving..." : "Save Keys"}
        </Button>

        <p className="text-[11px] text-muted-foreground">
          Saved keys are available only on this device/browser.
        </p>
      </div>
    </div>
  );
}
