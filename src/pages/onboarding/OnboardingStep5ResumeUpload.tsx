// @ts-nocheck
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { recordReferral } from "@/lib/referrals";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { Button } from "@/components/ui/Button";
import {
  Upload, FileText, CheckCircle,
  Loader2, AlertCircle, SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Step 5 — Resume upload + AI parse
// ─────────────────────────────────────────────────────────────────

export default function OnboardingStep5ResumeUpload() {
  const navigate  = useNavigate();
  const { user, profile, setProfile } = useAuthStore();

  const [file,      setFile]      = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsing,   setParsing]   = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [dragOver,  setDragOver]  = useState(false);
  const inputRef   = useRef<HTMLInputElement>(null);

  // ── Handle file selection ──────────────────────────────────────

  function onFileChange(f: File) {
    if (f.type !== "application/pdf" && !f.name.endsWith(".docx")) {
      setError("Please upload a PDF or DOCX file.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("File must be under 5 MB.");
      return;
    }
    setError(null);
    setFile(f);
  }

  // ── Upload + trigger AI parse ──────────────────────────────────

  async function handleUpload() {
    if (!file || !user) return;
    setUploading(true);
    setError(null);

    // 1. Upload to Supabase Storage
    const path = `${user.id}/resumes/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(path, file);

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    // 2. Get public URL
    const { data: urlData } = supabase.storage
      .from("resumes")
      .getPublicUrl(path);

    // 3. Create resume record in DB
    const { data: resumeRecord, error: dbError } = await supabase
      .from("resumes")
      .insert({
        user_id:   user.id,
        file_name: file.name,
        file_url:  urlData.publicUrl,
        file_size: file.size,
        is_active: true,
      })
      .select()
      .single();

    setUploading(false);

    if (dbError) { setError(dbError.message); return; }

    // 4. Trigger AI parse via Edge Function
    setParsing(true);
    const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
    const res = await fetch(`${EDGE_BASE}/parse-resume`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ resume_id: resumeRecord.id, file_url: urlData.publicUrl }),
    });

    setParsing(false);

    if (!res.ok) {
      // Parse failed — non-fatal, continue
      setError("Resume uploaded but parsing failed. You can retry in Documents.");
    }

    setDone(true);
  }

  // ── Complete onboarding ────────────────────────────────────────

  async function completeOnboarding() {
    if (!user) return;

    await recordReferral(user.id, profile?.referred_by);

    const { data } = await supabase
      .from("profiles")
      .update({ onboarding_complete: true, onboarding_step: 5 })
      .eq("id", user.id)
      .select()
      .single();

    if (data) setProfile(data);
    navigate("/app");
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">

        <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center mb-8">
          <span className="text-white text-sm font-bold">CQ</span>
        </div>

        <OnboardingProgress current={5} />

        <h2 className="text-2xl font-bold text-white mb-1">Upload your resume</h2>
        <p className="text-gray-400 text-sm mb-8">
          We parse your resume so every AI answer references your actual experience.
          This makes hints dramatically more relevant.
        </p>

        <div className="space-y-5">

          {done ? (
            /* ── Success state ───────────────────────── */
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <p className="text-white font-semibold">Resume uploaded!</p>
                <p className="text-gray-400 text-sm mt-1">
                  {parsing ? "Parsing your resume…" : "AI parse complete. Your profile is ready."}
                </p>
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={completeOnboarding}
                disabled={parsing}
                loading={parsing}
              >
                Go to Dashboard →
              </Button>
            </div>

          ) : (
            <>
              {/* ── Drop zone ─────────────────────────── */}
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) onFileChange(f);
                }}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3",
                  "cursor-pointer transition-all",
                  dragOver
                    ? "border-violet-500/60 bg-violet-500/5"
                    : "border-white/15 hover:border-white/25 bg-white/3"
                )}
              >
                {file ? (
                  <>
                    <FileText className="w-10 h-10 text-violet-400" />
                    <p className="text-sm font-medium text-white">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-gray-600" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-300">
                        Drop your resume here
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        PDF or DOCX · Max 5 MB
                      </p>
                    </div>
                    <span className="text-xs text-violet-400 underline">
                      or click to browse
                    </span>
                  </>
                )}
              </div>

              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFileChange(f);
                }}
              />

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => navigate("/onboarding/step-4")}
                >
                  ← Back
                </Button>

                {file ? (
                  <Button
                    variant="primary"
                    size="md"
                    fullWidth
                    loading={uploading || parsing}
                    onClick={handleUpload}
                    leftIcon={
                      uploading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                      <Upload className="w-4 h-4" />
                    }
                  >
                    {uploading ? "Uploading…" : parsing ? "Parsing with AI…" : "Upload & parse"}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="md"
                    fullWidth
                    onClick={completeOnboarding}
                    rightIcon={<SkipForward className="w-4 h-4" />}
                  >
                    Skip for now
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
