import { useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Key, Eye, EyeOff, CheckCircle, AlertTriangle, Loader2, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface KeyField {
  id: string;
  label: string;
  provider: string;
  placeholder: string;
  profileField: string;
}

const KEY_FIELDS: KeyField[] = [
  { id: "openai", label: "OpenAI API Key", provider: "OpenAI", placeholder: "sk-...", profileField: "byok_openai" },
  { id: "anthropic", label: "Anthropic API Key", provider: "Anthropic", placeholder: "sk-ant-...", profileField: "byok_anthropic" },
  { id: "gemini", label: "Google AI API Key", provider: "Google", placeholder: "AIza...", profileField: "byok_gemini" },
];

export default function SettingsBYOK() {
  const { profile, updateProfile } = useAuthStore();
  const [keys, setKeys] = useState<Record<string, string>>({
    openai: "",
    anthropic: "",
    gemini: "",
  });
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, "pass" | "fail" | null>>({});

  function hasKey(field: string): boolean {
    if (!profile) return false;
    return !!(profile as Record<string, unknown>)?.[field];
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (keys.openai) updates.byok_openai = keys.openai;
      if (keys.anthropic) updates.byok_anthropic = keys.anthropic;
      if (keys.gemini) updates.byok_gemini = keys.gemini;

      if (Object.keys(updates).length === 0) {
        toast.info("No keys to save.");
        setSaving(false);
        return;
      }

      await updateProfile(updates);
      setKeys({ openai: "", anthropic: "", gemini: "" });
      toast.success("API keys saved securely");
    } catch {
      toast.error("Failed to save keys");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestKey(providerId: string) {
    const key = keys[providerId];
    if (!key) {
      toast.error("Enter a key first to test it.");
      return;
    }
    setTesting((prev) => ({ ...prev, [providerId]: true }));
    setTestResults((prev) => ({ ...prev, [providerId]: null }));
    try {
      const { data, error } = await supabase.functions.invoke("validate-api-key", {
        body: { provider: providerId, api_key: key },
      });
      if (error || !data?.valid) {
        setTestResults((prev) => ({ ...prev, [providerId]: "fail" }));
        toast.error(`${providerId} key validation failed`);
      } else {
        setTestResults((prev) => ({ ...prev, [providerId]: "pass" }));
        toast.success(`${providerId} key is valid!`);
      }
    } catch {
      setTestResults((prev) => ({ ...prev, [providerId]: "fail" }));
      toast.error("Key validation failed");
    } finally {
      setTesting((prev) => ({ ...prev, [providerId]: false }));
    }
  }

  async function handleRemove(id: string, profileField: string) {
    try {
      await updateProfile({ [profileField]: "" } as Record<string, string>);
      toast.success(`${id} key removed`);
    } catch {
      toast.error("Failed to remove key");
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Bring Your Own Keys</h2>

      <Card>
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Use your own API keys</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When you provide your own keys, AI calls are billed directly to your provider account
              instead of using Clarify AI credits. Keys are encrypted and stored securely.
            </p>
          </div>
        </div>
      </Card>

      {KEY_FIELDS.map((field) => {
        const saved = hasKey(field.profileField);
        return (
          <Card key={field.id}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">{field.label}</h3>
              </div>
              {saved && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-500">
                  <CheckCircle className="w-3 h-3" /> Configured
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={visible[field.id] ? "text" : "password"}
                  value={keys[field.id]}
                  onChange={(e) => setKeys((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={saved ? "••••••••••••••••" : field.placeholder}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setVisible((prev) => ({ ...prev, [field.id]: !prev[field.id] }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {visible[field.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {keys[field.id] && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTestKey(field.id)}
                  disabled={testing[field.id]}
                  leftIcon={testing[field.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
                  className={cn(
                    testResults[field.id] === "pass" && "text-emerald-500",
                    testResults[field.id] === "fail" && "text-red-400"
                  )}
                >
                  {testing[field.id] ? "Testing..." : testResults[field.id] === "pass" ? "Valid" : testResults[field.id] === "fail" ? "Invalid" : "Test"}
                </Button>
              )}
              {saved && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(field.id, field.profileField)}
                  className="text-red-400 hover:text-red-300"
                >
                  Remove
                </Button>
              )}
            </div>
          </Card>
        );
      })}

      <Button
        variant="primary"
        size="md"
        onClick={handleSave}
        disabled={saving}
        leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
      >
        {saving ? "Saving..." : "Save Keys"}
      </Button>
    </div>
  );
}
