// ─────────────────────────────────────────────────────────────────────────────

// OnboardingStep5ResumeUpload.tsx — Step 5: Resume upload + AI parse.

// Rendered inside OnboardingIndex (no outer page wrapper needed).

// Completion is handled by OnboardingIndex.handleFinish — this step just

// calls onNext() / onSkip() to hand off control to the orchestrator.

// ─────────────────────────────────────────────────────────────────────────────



import { fetchEdgeJson } from "@/lib/network/fetchEdge";

import { useState, useRef } from "react";

import { deleteFile, uploadFile, STORAGE_BUCKETS } from "@/lib/supabase/client";

import { resumesDB, resumeVersionsDB } from "@/lib/supabase/database";

import { useAuthStore } from "@/store/authStore";

import { generateId } from "@/lib/utils";

import { normalizeParsedResume } from "@/lib/documents/resumeParse";

import { Button } from "@/components/ui/Button";

import { ProgressBar } from "@/components/ui/ProgressBar";

import {

  Upload, FileText, CheckCircle,

  Loader2, AlertCircle, SkipForward, Trash2,

} from "lucide-react";

import { cn } from "@/lib/utils";

import type { StepProps } from "@/types/onboarding.types";



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

  if (normalized.experience.length > 0) {

    const exp = normalized.experience[0];

    const line = [exp.title, exp.company].filter(Boolean).join(" @ ");

    if (line) parts.push(line);

  }

  return parts.join("\n\n");

}



// ─── Component ───────────────────────────────────────────────────────────────



export default function OnboardingStep5ResumeUpload({ onNext, onBack, onSkip }: StepProps) {

  const { user, profile, updateProfile } = useAuthStore();



  const [file,           setFile]           = useState<File | null>(null);

  const [uploading,      setUploading]      = useState(false);

  const [uploadProgress, setUploadProgress] = useState(0);

  const [parsing,        setParsing]        = useState(false);

  const [done,           setDone]           = useState(false);

  const [error,          setError]          = useState<string | null>(null);

  const [dragOver,       setDragOver]       = useState(false);

  const [resumeId,       setResumeId]       = useState<string | null>(null);

  const [storedPath,     setStoredPath]     = useState<string | null>(null);

  const [extractPreview, setExtractPreview] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);



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

    setExtractPreview(null);

  }



  function resetUploadState() {

    setFile(null);

    setDone(false);

    setResumeId(null);

    setStoredPath(null);

    setExtractPreview(null);

    setUploadProgress(0);

    setError(null);

    if (inputRef.current) inputRef.current.value = "";

  }



  async function handleRemoveUploaded() {

    if (resumeId) {

      try {

        if (storedPath) {

          await deleteFile(STORAGE_BUCKETS.RESUMES, storedPath);

        }

        await resumesDB.delete(resumeId);

      } catch {

        // Non-fatal — allow re-upload anyway

      }

    }

    resetUploadState();

  }



  async function handleUpload() {

    if (!file || !user) return;

    setUploading(true);

    setUploadProgress(0);

    setError(null);



    try {

      const newResumeId = generateId();

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";

      const path = `${user.id}/${newResumeId}.${ext}`;



      const uploaded = await uploadFile(

        STORAGE_BUCKETS.RESUMES,

        path,

        file,

        setUploadProgress,

      );

      if (!uploaded) {

        setError("Upload failed.");

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

        setError("Resume saved but version tracking failed.");

        setResumeId(resumeRecord.id);

        setStoredPath(path);

        setDone(true);

        return;

      }



      setParsing(true);

      try {

        const data = await fetchEdgeJson<{

          parsed?: Record<string, unknown>;

        }>(

          "parse-resume",

          {

            resume_id: resumeRecord.id,

            version_id: versionRecord.id,

            file_path: path,

          },

          { timeoutMs: 60_000 },

        );



        const parsed = data?.parsed;

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

        setError("Resume uploaded but parsing failed. You can retry in Documents.");

      } finally {

        setParsing(false);

      }



      setResumeId(resumeRecord.id);

      setStoredPath(path);

      setDone(true);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Upload failed.");

    } finally {

      setUploading(false);

    }

  }



  return (

    <div className="max-w-lg mx-auto space-y-5">



      <div>

        <h2 className="text-2xl font-bold text-foreground mb-1">

          Upload your resume

        </h2>

        <p className="text-muted-foreground text-sm">

          We parse your resume so every AI answer references your actual experience.

          This makes hints dramatically more relevant.

        </p>

      </div>



      {done ? (

        <div className="flex flex-col items-center gap-4 py-6 text-center">

          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center">

            <CheckCircle className="w-7 h-7 text-emerald-400" />

          </div>

          <div>

            <p className="text-foreground font-semibold">Resume uploaded!</p>

            <p className="text-muted-foreground text-sm mt-1">

              {parsing

                ? "Parsing your resume…"

                : "AI parse complete. Your profile is ready."}

            </p>

            {file && (

              <p className="text-xs text-muted-foreground mt-1">{file.name}</p>

            )}

          </div>



          {extractPreview && !parsing && (

            <div className="w-full text-left bg-secondary border border-border rounded-xl p-3">

              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">

                Extracted preview

              </p>

              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">

                {extractPreview}

              </p>

            </div>

          )}



          {error && (

            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5 w-full">

              <AlertCircle className="w-3.5 h-3.5 shrink-0" />

              {error}

            </div>

          )}



          <div className="flex gap-2 w-full">

            <Button

              variant="ghost"

              size="md"

              onClick={() => void handleRemoveUploaded()}

              disabled={parsing}

              leftIcon={<Trash2 className="w-4 h-4" />}

            >

              Remove & re-upload

            </Button>

            <Button

              variant="primary"

              size="md"

              fullWidth

              onClick={() => onNext({ resumeFileId: resumeId, resumeFileName: file?.name ?? null })}

              disabled={parsing}

              loading={parsing}

            >

              Finish setup →

            </Button>

          </div>

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

              "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3",

              "cursor-pointer transition-all",

              dragOver

                ? "border-primary/60 bg-primary/5"

                : "border-border hover:border-primary/30 bg-secondary/50",

            )}

          >

            {file ? (

              <>

                <FileText className="w-10 h-10 text-primary" />

                <p className="text-sm font-medium text-foreground">{file.name}</p>

                <p className="text-xs text-muted-foreground">

                  {(file.size / 1024).toFixed(0)} KB

                </p>

              </>

            ) : (

              <>

                <Upload className="w-10 h-10 text-muted-foreground" />

                <div className="text-center">

                  <p className="text-sm font-medium text-muted-foreground">

                    Drop your resume here

                  </p>

                  <p className="text-xs text-muted-foreground mt-1">

                    PDF or DOCX · Max 5 MB

                  </p>

                </div>

                <span className="text-xs text-primary underline">

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



          {uploading && (

            <ProgressBar

              value={uploadProgress}

              showLabel

              label="Uploading resume…"

              color="violet"

            />

          )}



          {error && (

            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">

              <AlertCircle className="w-3.5 h-3.5 shrink-0" />

              {error}

            </div>

          )}



          <div className="flex gap-3">

            <Button variant="ghost" size="md" onClick={onBack}>

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

                  uploading

                    ? <Loader2 className="w-4 h-4 animate-spin" />

                    : <Upload className="w-4 h-4" />

                }

              >

                {uploading ? "Uploading…" : parsing ? "Parsing with AI…" : "Upload & parse"}

              </Button>

            ) : (

              <Button

                variant="ghost"

                size="md"

                fullWidth

                onClick={() => onNext({ skipResume: true, resumeFileId: null, resumeFileName: null })}

                rightIcon={<SkipForward className="w-4 h-4" />}

              >

                Skip for now — add later from Documents

              </Button>

            )}

          </div>

        </>

      )}

    </div>

  );

}


