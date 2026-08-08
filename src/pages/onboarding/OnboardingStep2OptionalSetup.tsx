// ─────────────────────────────────────────────────────────────────────────────
// OnboardingStep2OptionalSetup — Step 2: Optional accordion setup.
// Audio test, resume upload, and preferences — each skippable with consequence copy.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic, Monitor, Info, Play, RotateCcw, CheckCircle, AlertCircle,
  Upload, FileText, Loader2, Trash2, SkipForward,
  Brain, Volume2, Settings2,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { deleteFile, uploadFile, STORAGE_BUCKETS } from "@/lib/supabase/client";
import { resumesDB, resumeVersionsDB } from "@/lib/supabase/database";
import { useAuthStore } from "@/store/authStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { generateId, cn } from "@/lib/utils";
import { normalizeParsedResume } from "@/lib/documents/resumeParse";
import {
  MODEL_OPTIONS,
  normalizePreferredModel,
  toDbPreferredModel,
} from "@/lib/ai/modelOptions";
import { normalizeToDisplayTier } from "@/lib/constants/pricing";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import type { StepProps } from "@/types/onboarding.types";
import type { ProfileRow } from "@/types";
import type { PreferredAIModel } from "@/types/user.types";

const RECORD_SECONDS = 3;

const HINT_STYLES = [
  { value: "full_answer", label: "Full Answer", sub: "Complete response" },
  { value: "short_hints", label: "Short Hints", sub: "Talking points" },
  { value: "keywords",    label: "Keywords",    sub: "Key terms only" },
] as const;

const INTERVIEW_STYLES = [
  { value: "behavioral", label: "Behavioral" },
  { value: "technical",  label: "Technical" },
  { value: "case_study", label: "Case study" },
  { value: "mixed",      label: "Mixed" },
] as const;

function buildExtractPreview(parsed: Record<string, unknown> | undefined): string {
  if (!parsed) return "";
  const normalized = normalizeParsedResume(parsed);
  if (!normalized) return "";
  const parts: string[] = [];
  if (normalized.full_name) parts.push(normalized.full_name);
  if (normalized.summary) parts.push(normalized.summary.slice(0, 280));
  if (normalized.skills.length > 0) {
    parts.push(`Skills: ${normalized.skills.slice(0, 12).join(", ")}`);
  }
  return parts.join("\n\n");
}

export default function OnboardingStep2OptionalSetup({
  data,
  onNext,
  onBack,
}: StepProps) {
  const { user, profile, setProfile, updateProfile, planId } = useAuthStore();
  const audio = useAudioCapture();
  const isPro = normalizeToDisplayTier(planId) !== "free";

  // ── Audio state ───────────────────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [micOk, setMicOk] = useState(data.audioVerified);
  const [audioSkipped, setAudioSkipped] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState(data.selectedMicId);
  const [level, setLevel] = useState(0);

  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // ── Resume state ──────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [resumeDone, setResumeDone] = useState(Boolean(data.resumeFileId));
  const [resumeSkipped, setResumeSkipped] = useState(data.skipResume);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(data.resumeFileId);
  const [storedPath, setStoredPath] = useState<string | null>(null);
  const [extractPreview, setExtractPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Preferences state ─────────────────────────────────────────────────────
  const existingStyles = (() => {
    const prefs = profile?.notification_prefs as { interview_styles?: string[] } | null;
    return Array.isArray(prefs?.interview_styles) ? prefs.interview_styles : data.interviewTypes;
  })();

  const [hintStyle, setHintStyle] = useState(
    (profile?.response_style as string) ?? "short_hints",
  );
  const [model, setModel] = useState<PreferredAIModel>(
    normalizePreferredModel(data.preferredModel ?? profile?.preferred_model),
  );
  const [styles, setStyles] = useState<string[]>(existingStyles);
  const [prefsSkipped, setPrefsSkipped] = useState(false);

  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      ctxRef.current?.close();
      recorderRef.current?.stop();
      audio.stopAll();
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopVisualizer() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    ctxRef.current?.close();
    ctxRef.current = null;
  }

  function startVisualizer(stream: MediaStream) {
    const ctx = new AudioContext();
    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 256;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyserNode);
    ctxRef.current = ctx;
    const buf = new Float32Array(analyserNode.frequencyBinCount);
    function loop() {
      analyserNode.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
      setLevel(Math.min(1, rms * 8));
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  function resetRecording() {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    stopVisualizer();
    recorderRef.current?.stop();
    recorderRef.current = null;
    chunksRef.current = [];
    audio.stopAll();
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    setPlaybackUrl(null);
    setRecording(false);
    setRecordSecs(0);
    setMicOk(false);
    setLevel(0);
    setAudioSkipped(false);
  }

  async function startMicTest() {
    setTestError(null);
    resetRecording();
    const { error } = await audio.startMic();
    if (error) {
      setTestError(error);
      return;
    }
    const stream = audio.micStream;
    if (!stream) {
      setTestError("Microphone stream not available. Please try again.");
      return;
    }
    const trackDeviceId = stream.getAudioTracks()[0]?.getSettings()?.deviceId?.trim() || "default";
    setSelectedDeviceId(trackDeviceId);
    startVisualizer(stream);
    setRecording(true);
    setRecordSecs(RECORD_SECONDS);
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stopVisualizer();
      audio.stopAll();
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (blob.size > 0) {
        setPlaybackUrl(URL.createObjectURL(blob));
        setMicOk(true);
      } else {
        setTestError("No audio captured. Please try again.");
      }
      setRecording(false);
      setRecordSecs(0);
    };
    recorder.start();
    recordTimerRef.current = setInterval(() => {
      setRecordSecs((prev) => {
        if (prev <= 1) {
          if (recordTimerRef.current) clearInterval(recordTimerRef.current);
          recorderRef.current?.stop();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function playRecording() {
    if (!playbackUrl) return;
    audioElRef.current?.pause();
    const el = new Audio(playbackUrl);
    audioElRef.current = el;
    void el.play();
  }

  function skipAudio() {
    resetRecording();
    setAudioSkipped(true);
    setMicOk(false);
  }

  function onFileChange(f: File) {
    const name = f.name.toLowerCase();
    const okExt =
      name.endsWith(".pdf") ||
      name.endsWith(".docx") ||
      name.endsWith(".doc") ||
      name.endsWith(".txt");
    const okMime =
      f.type === "application/pdf" ||
      f.type === "application/msword" ||
      f.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      f.type === "text/plain" ||
      !f.type;
    if (!okExt || !okMime) {
      setResumeError("Please upload a PDF, DOCX, DOC, or TXT file.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setResumeError("File must be under 5 MB.");
      return;
    }
    setResumeError(null);
    setFile(f);
    setExtractPreview(null);
    setResumeSkipped(false);
  }

  function resetUploadState() {
    setFile(null);
    setResumeDone(false);
    setResumeId(null);
    setStoredPath(null);
    setExtractPreview(null);
    setUploadProgress(0);
    setResumeError(null);
    setResumeSkipped(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleRemoveUploaded() {
    if (resumeId) {
      try {
        if (storedPath) await deleteFile(STORAGE_BUCKETS.RESUMES, storedPath);
        await resumesDB.delete(resumeId);
      } catch {
        // non-fatal
      }
    }
    resetUploadState();
  }

  async function handleUpload() {
    if (!file || !user) return;
    setUploading(true);
    setUploadProgress(0);
    setResumeError(null);
    try {
      const newResumeId = generateId();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const path = `${user.id}/${newResumeId}.${ext}`;
      const uploaded = await uploadFile(STORAGE_BUCKETS.RESUMES, path, file, setUploadProgress);
      if (!uploaded) {
        setResumeError("Upload failed.");
        return;
      }
      const resumeRecord = await resumesDB.create({
        id: newResumeId,
        user_id: user.id,
        name: file.name.replace(/\.[^/.]+$/, "") || file.name,
        file_path: path,
        url: uploaded.url,
        content: null,
        is_primary: true,
      });
      let versionRecord;
      try {
        versionRecord = await resumeVersionsDB.create({
          resume_id: resumeRecord.id,
          parse_status: "pending",
        });
      } catch {
        setResumeError("Resume saved but version tracking failed.");
        setResumeId(resumeRecord.id);
        setStoredPath(path);
        setResumeDone(true);
        return;
      }
      setParsing(true);
      try {
        const parsedData = await fetchEdgeJson<{ parsed?: Record<string, unknown> }>(
          "parse-resume",
          { resume_id: resumeRecord.id, version_id: versionRecord.id, file_path: path },
          { timeoutMs: 60_000, headers: { "x-clarify-onboarding-parse": "1" } },
        );
        const parsed = parsedData?.parsed;
        if (parsed) {
          setExtractPreview(buildExtractPreview(parsed));
          const experience = Array.isArray(parsed.experience) ? parsed.experience : [];
          const headline =
            (typeof parsed.headline === "string" ? parsed.headline : null)
            ?? (experience[0] && typeof experience[0] === "object" && experience[0] !== null
              && "title" in experience[0]
              ? String((experience[0] as { title?: string }).title ?? "")
              : null);
          const skills = Array.isArray(parsed.skills)
            ? parsed.skills.map((s) => String(s)).slice(0, 50)
            : [];
          const profileFields = profile as {
            headline?: string | null;
            target_role?: string | null;
            interview_strengths?: string[] | null;
          } | null;
          const profilePatch: Record<string, unknown> = {};
          if (!profileFields?.headline && headline) profilePatch.headline = headline.slice(0, 200);
          if (!profileFields?.target_role && headline) profilePatch.target_role = headline.slice(0, 120);
          if (skills.length > 0 && !profileFields?.interview_strengths?.length) {
            profilePatch.interview_strengths = skills;
          }
          if (Object.keys(profilePatch).length > 0) {
            await updateProfile(profilePatch as Parameters<typeof updateProfile>[0]);
          }
        }
      } catch {
        setResumeError("Resume uploaded but parsing failed. You can retry in Documents.");
      } finally {
        setParsing(false);
      }
      setResumeId(resumeRecord.id);
      setStoredPath(path);
      setResumeDone(true);
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function skipResume() {
    resetUploadState();
    setResumeSkipped(true);
  }

  function toggleStyle(value: string) {
    setStyles((prev) => {
      if (prev.includes(value)) {
        return prev.length > 1 ? prev.filter((s) => s !== value) : prev;
      }
      return [...prev, value];
    });
    setPrefsSkipped(false);
  }

  function skipPreferences() {
    setPrefsSkipped(true);
    setHintStyle("short_hints");
    setModel("gemini-flash");
    setStyles(["behavioral"]);
  }

  const handleFinish = useCallback(async () => {
    if (!user) return;
    setFinishing(true);
    setFinishError(null);

    try {
      if (micOk && !audioSkipped) {
        const { data: audioRow } = await supabase
          .from("profiles")
          .update({
            audio_input_device: selectedDeviceId || "default",
            auto_transcript: true,
            noise_suppression: true,
          })
          .eq("id", user.id)
          .select()
          .maybeSingle();
        if (audioRow) setProfile(audioRow as unknown as ProfileRow);
      }

      if (!prefsSkipped) {
        const existingPrefs =
          (profile?.notification_prefs as Record<string, unknown> | null) ?? {};
        const prefsPatch = {
          response_style: hintStyle,
          coach_tone: "encouraging" as const,
          preferred_model: toDbPreferredModel(model),
          notification_prefs: { ...existingPrefs, interview_styles: styles },
          onboarding_step: 2,
        };
        const { data: prefsRow } = await supabase
          .from("profiles")
          // Generated Database types can pin update payloads to never for JSON columns.
          .update(prefsPatch as never)
          .eq("id", user.id)
          .select()
          .maybeSingle();
        if (prefsRow) {
          setProfile(prefsRow as unknown as ProfileRow);
          useOverlayStore.getState().setActiveModel(normalizePreferredModel(model));
        }
      }

      onNext({
        preferredModel: model,
        interviewTypes: styles,
        selectedMicId: selectedDeviceId,
        audioVerified: micOk && !audioSkipped,
        resumeFileId: resumeSkipped ? null : resumeId,
        resumeFileName: resumeSkipped ? null : file?.name ?? data.resumeFileName,
        skipResume: resumeSkipped || (!resumeDone && !resumeId),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save setup.";
      setFinishError(message);
      toast.error(message);
    } finally {
      setFinishing(false);
    }
  }, [
    user, micOk, audioSkipped, selectedDeviceId, prefsSkipped, hintStyle, model,
    styles, profile, resumeSkipped, resumeId, resumeDone, file, data.resumeFileName,
    onNext, setProfile,
  ]);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">
          Optional setup
        </h2>
        <p className="text-muted-foreground text-sm">
          Tune Practice Coach now or skip — you can change everything later in Settings.
        </p>
      </div>

      <Accordion type="multiple" defaultValue={["audio"]} className="rounded-xl border border-border px-4">
        {/* ── Audio ──────────────────────────────────────────────────────── */}
        <AccordionItem value="audio">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Mic className="h-4 w-4 text-primary" />
              Microphone test
              {micOk && !audioSkipped && (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 ml-1" />
              )}
              {audioSkipped && (
                <span className="text-[10px] font-normal text-muted-foreground ml-1">skipped</span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Verify your mic so live transcription works during practice sessions.
            </p>
            <div className="bg-secondary border border-border rounded-xl p-4">
              <div className="h-2 bg-background rounded-full overflow-hidden mb-3">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-75",
                    micOk ? "bg-emerald-500" : "bg-primary",
                  )}
                  style={{ width: `${level * 100}%` }}
                />
              </div>
              {testError && (
                <div className="flex items-center gap-2 text-xs text-red-400 mb-3">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {testError}
                </div>
              )}
              {recording ? (
                <p className="text-xs text-muted-foreground animate-pulse">
                  Recording {recordSecs}s — speak a few words
                </p>
              ) : micOk ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={playRecording} leftIcon={<Play className="w-3.5 h-3.5" />}>
                    Play sample
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void startMicTest()} leftIcon={<RotateCcw className="w-3.5 h-3.5" />}>
                    Re-record
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => void startMicTest()} leftIcon={<Mic className="w-3.5 h-3.5" />}>
                  Record {RECORD_SECONDS}s test
                </Button>
              )}
            </div>
            <div className="flex items-start gap-2 bg-muted/40 rounded-lg px-3 py-2">
              <Monitor className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground">
                System audio (Zoom/Meet) is configured when you start a live session.
              </p>
            </div>
            {!micOk && (
              <>
                <Button variant="ghost" size="sm" onClick={skipAudio} leftIcon={<SkipForward className="w-3.5 h-3.5" />}>
                  Skip microphone test
                </Button>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Skipping means Practice Coach may fail to hear you until you verify your microphone in Settings → Audio.
                </p>
              </>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* ── Resume ─────────────────────────────────────────────────────── */}
        <AccordionItem value="resume">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-primary" />
              Resume upload
              {resumeDone && !resumeSkipped && (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 ml-1" />
              )}
              {resumeSkipped && (
                <span className="text-[10px] font-normal text-muted-foreground ml-1">skipped</span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Upload your CV so AI hints reference your real experience.
            </p>
            {resumeDone && !resumeSkipped ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle className="h-4 w-4" />
                  {file?.name ?? "Resume uploaded"}
                </div>
                {extractPreview && !parsing && (
                  <div className="text-left bg-secondary border border-border rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Extracted preview
                    </p>
                    <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                      {extractPreview}
                    </p>
                  </div>
                )}
                <Button variant="ghost" size="sm" onClick={() => void handleRemoveUploaded()} disabled={parsing} leftIcon={<Trash2 className="w-4 h-4" />}>
                  Remove & re-upload
                </Button>
              </div>
            ) : (
              <>
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
                    "border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer transition-all",
                    dragOver ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/30 bg-secondary/50",
                  )}
                >
                  {file ? (
                    <>
                      <FileText className="w-8 h-8 text-primary" />
                      <p className="text-sm font-medium">{file.name}</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">PDF, DOCX, or TXT · Max 5 MB</p>
                    </>
                  )}
                </div>
                <input ref={inputRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFileChange(f);
                }} />
                {uploading && <ProgressBar value={uploadProgress} showLabel label="Uploading…" color="violet" />}
                {file && (
                  <Button variant="primary" size="sm" fullWidth loading={uploading || parsing} onClick={() => void handleUpload()} leftIcon={uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}>
                    {uploading ? "Uploading…" : parsing ? "Parsing…" : "Upload & parse"}
                  </Button>
                )}
                {!file && (
                  <>
                    <Button variant="ghost" size="sm" onClick={skipResume} leftIcon={<SkipForward className="w-3.5 h-3.5" />}>
                      Skip resume upload
                    </Button>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Skipping means Practice Coach won&apos;t personalize answers from your resume until you upload one in Documents.
                    </p>
                  </>
                )}
              </>
            )}
            {resumeError && (
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {resumeError}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* ── Preferences ────────────────────────────────────────────────── */}
        <AccordionItem value="preferences">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Settings2 className="h-4 w-4 text-primary" />
              Coaching preferences
              {!prefsSkipped && (
                <Brain className="h-3.5 w-3.5 text-muted-foreground ml-1 opacity-60" />
              )}
              {prefsSkipped && (
                <span className="text-[10px] font-normal text-muted-foreground ml-1">defaults</span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Interview styles</p>
              <div className="flex flex-wrap gap-2">
                {INTERVIEW_STYLES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleStyle(s.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                      styles.includes(s.value)
                        ? "bg-primary/20 border-primary/40 text-primary"
                        : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Hint style</p>
              <div className="grid grid-cols-3 gap-2">
                {HINT_STYLES.map((h) => (
                  <button
                    key={h.value}
                    type="button"
                    onClick={() => { setHintStyle(h.value); setPrefsSkipped(false); }}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-all",
                      hintStyle === h.value
                        ? "bg-primary/20 border-primary/50"
                        : "bg-secondary/50 border-border hover:border-primary/30",
                    )}
                  >
                    <Volume2 className="h-4 w-4 text-primary" />
                    <span className="text-[10px] font-semibold">{h.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">AI model</p>
              <div className="space-y-1.5">
                {MODEL_OPTIONS.slice(0, 3).map((m) => {
                  const locked = !m.free && !isPro;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      disabled={locked}
                      onClick={() => { if (!locked) { setModel(m.value); setPrefsSkipped(false); } }}
                      className={cn(
                        "w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all text-sm",
                        model === m.value && !locked ? "bg-primary/20 border-primary/50" : "bg-secondary/50 border-border",
                        locked && "opacity-40 cursor-not-allowed",
                      )}
                    >
                      <span className={cn("font-medium", model === m.value && !locked ? "text-primary" : "text-muted-foreground")}>
                        {m.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{m.badge}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={skipPreferences} leftIcon={<SkipForward className="w-3.5 h-3.5" />}>
              Use default preferences
            </Button>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Defaults: Gemini Flash, short hints, behavioral interviews. Change anytime in Settings → AI.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Everything here is optional. Hit Start Practice to jump into your first session — we&apos;ll remember what you set up.
        </p>
      </div>

      {finishError && <p className="text-xs text-red-400">{finishError}</p>}

      <div className="flex gap-3">
        <Button variant="ghost" size="md" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="primary"
          size="md"
          fullWidth
          loading={finishing}
          onClick={() => void handleFinish()}
        >
          Start Practice
        </Button>
      </div>
    </div>
  );
}
