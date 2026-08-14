// src/hooks/useDocuments.ts
import { EDGE_BASE } from "@/lib/env";
import { fetchEdge, fetchEdgeJson } from "@/lib/network/fetchEdge";
import { documentParseIdempotencyKey } from "@/lib/network/idempotency";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, uploadFile, deleteFile, STORAGE_BUCKETS } from "@/lib/supabase/client";
import { answerBankDB, documentsDB, jobDescriptionsDB, resumesDB } from "@/lib/supabase/database";
import { useDocumentStore } from "@/store/documentStore";
import { useAnswerBankStore } from "@/store/answerBankStore";
import { useAuthStore } from "@/store/userStore";
import { callGemini } from "@/lib/ai/geminiClient";
import { generateId } from "@/lib/utils";
import { getMimeType } from "@/lib/utils/fileUtils";
import { sha256, sha256Buffer } from "@/lib/utils/hashUtils";
import { toast } from "sonner";
import type {
  ResumeDocument,
  JDDocument,
  JDInputMethod,
  SavedAnswer,
  AnswerCategory,
} from "@/types/document.types";
import type { ParsedJD } from "@/types/ai.types";
import type { Tables } from "@/integrations/supabase";
import type { Json } from "@/integrations/supabase/types";

// ─────────────────────────────────────────────────────────────────
// answer_bank row → SavedAnswer adapter
// ─────────────────────────────────────────────────────────────────

function mapAnswerBankRowToSavedAnswer(row: Tables<"answer_bank">): SavedAnswer {
  return {
    id:              row.id,
    user_id:         row.user_id,
    title:           row.question_text ?? "",
    question:        row.question_text ?? "",
    answer_text:     row.answer_text   ?? "",
    category:        (row.category as AnswerCategory) ?? "general",
    tags:            row.tags          ?? [],
    company_tags:    [],
    star_components: null,
    is_favourite:    row.is_favourite   ?? false,
    times_used:      row.times_used     ?? 0,
    last_used_at:    row.last_used_at   ?? null,
    created_at:      row.created_at,
    updated_at:      row.updated_at,
  };
}

// ─────────────────────────────────────────────────────────────────
// useDocuments — adapted to match actual DB schema
// ─────────────────────────────────────────────────────────────────

type UseDocumentsOptions = {
  /** When true, skip auto-load on mount (parent page already loaded). */
  skipInitialLoad?: boolean;
};

export function useDocuments(options?: UseDocumentsOptions) {
  const { user }    = useAuthStore();
  const docStore    = useDocumentStore();
  const answerStore = useAnswerBankStore();
  const [isParsing, setIsParsing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!user || options?.skipInitialLoad) return;
    loadDocuments();
    loadAnswerBank();
  }, [user?.id, options?.skipInitialLoad]);

  // ── Load documents ────────────────────────────────────────────

  async function loadDocuments(): Promise<void> {
    if (!user) return;
    docStore.setIsLoading(true);
    try {
      const [resumeRows, jdRows] = await Promise.all([
        resumesDB.listByUserId(user.id),
        jobDescriptionsDB.listByUserId(user.id),
      ]);
      if (!mountedRef.current) return;

      // Map DB schema → frontend expected shape
      {
        const mapped = resumeRows.map((r) => ({
          ...r,
          title: r.name ?? "Untitled",
          resume_versions: [],
          active_version_id: null,
          updated_at: r.created_at,
        }));
        docStore.setResumes(mapped as ResumeDocument[]);
        const activeId = docStore.active_resume_id;
        if (activeId) {
          docStore.setActiveResumeId(activeId);
        } else if (mapped.length === 1) {
          docStore.setActiveResumeId(mapped[0].id);
        }
      }
      {
        const mapped = jdRows.map((j) => ({
          ...j,
          title: j.target_role ?? j.company ?? "Untitled JD",
          role_title:   j.target_role ?? "Unknown Role",
          company_name: j.company ?? null,
          raw_text:     j.content ?? "",
          input_method: (j.input_method ?? "paste") as JDInputMethod,
          is_active: j.is_active ?? true,
          parse_status: (j.parse_status ?? "ready") as JDDocument["parse_status"],
          updated_at: j.updated_at ?? j.created_at,
        }));
        docStore.setJDs(mapped as unknown as JDDocument[]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load documents";
      console.error("[useDocuments] loadDocuments failed:", err);
      if (mountedRef.current) setLoadError(msg);
    } finally {
      if (mountedRef.current) docStore.setIsLoading(false);
    }
  }

  async function loadAnswerBank(): Promise<void> {
    if (!user) return;
    answerStore.setIsLoading(true);
    try {
      const data = await answerBankDB.listByUserId(user.id);
      if (!mountedRef.current) return;
      answerStore.setAnswers(data.map(mapAnswerBankRowToSavedAnswer));
    } catch (err) {
      console.error("[useDocuments] loadAnswerBank failed:", err);
    } finally {
      if (mountedRef.current) answerStore.setIsLoading(false);
    }
  }

  // ── Upload resume (adapted to actual resumes table: name, file_path, url, content, is_primary) ──

  const uploadResume = useCallback(async (
    file: File,
    title?: string
  ): Promise<{ resumeId: string | null; error: string | null }> => {
    if (!user) return { resumeId: null, error: "Not authenticated" };

    const resumeId = generateId();
    const ext      = (file.name.split(".").pop() ?? "pdf").toLowerCase();
    const path     = `${user.id}/${resumeId}.${ext}`;
    const mimeType =
      (file.type && file.type !== "application/octet-stream"
        ? file.type
        : getMimeType(file.name)) || "application/octet-stream";

    docStore.setUploadProgress(0);

    try {
      const contentHash = await sha256Buffer(await file.arrayBuffer());
      const existing = await resumesDB.getByContentHash(user.id, contentHash);
      if (existing) {
        const { toast: notify } = await import("sonner");
        notify.message("This file was already uploaded. Opening the existing document — no extra charge.");
        await loadDocuments();
        docStore.setActiveResumeId(existing.id);
        return { resumeId: existing.id, error: null };
      }
      const uploaded = await uploadFile(
        STORAGE_BUCKETS.RESUMES,
        path,
        file,
        (pct) => docStore.setUploadProgress(pct)
      );
      if (!uploaded) throw new Error("Upload failed");

      await resumesDB.create({
        id:        resumeId,
        user_id:   user.id,
        name:      title ?? file.name.replace(/\.[^/.]+$/, ""),
        file_path: path,
        url:       uploaded.url,
        content:   null,
        content_hash: contentHash,
        is_primary: false,
      });

      // Fire-and-forget XP award
      // XP handled by useGamification / useXPSystem at call sites

      // Await parse so callers can open the detail page with extracted data (QA-114/116).
      // Parse failures are toasted inside parseResume; upload still succeeds.
      try {
        await parseResume(resumeId, path, mimeType);
      } catch {
        // keep resumeId — detail page shows Needs parse / error state
      }

      await loadDocuments();
      if (!docStore.active_resume_id) {
        docStore.setActiveResumeId(resumeId);
      }
      return { resumeId, error: null };

    } catch (err) {
      docStore.setUploadProgress(0);
      return {
        resumeId: null,
        error: err instanceof Error ? err.message : "Upload failed",
      };
    }
  }, [user]);

  const uploadCoverLetter = useCallback(
    async (file: File): Promise<{ documentId: string | null; error: string | null }> => {
      if (!user) return { documentId: null, error: "Not authenticated" };

      const documentId = generateId();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const path = `${user.id}/cover-letters/${documentId}.${ext}`;
      const mimeType =
        ext === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      docStore.setUploadProgress(0);
      try {
        const uploaded = await uploadFile(
          STORAGE_BUCKETS.DOCUMENTS,
          path,
          file,
          (pct) => docStore.setUploadProgress(pct)
        );
        if (!uploaded) throw new Error("Upload failed");

        await documentsDB.clearPrimaryCoverLetters(user.id);

        await documentsDB.create({
          id: documentId,
          user_id: user.id,
          type: "cover_letter",
          title: file.name.replace(/\.[^/.]+$/, "") || "Cover Letter",
          file_name: file.name,
          file_url: uploaded.url,
          mime_type: mimeType,
          content: null,
          parsed_summary: null,
          is_primary: true,
          is_active: true,
        });

        let parseError: string | null = null;
        try {
          await fetchEdgeJson(
            "parse-document",
            {
              document_id: documentId,
              file_path: path,
              mime_type: mimeType,
            },
            {
              headers: {
                "x-idempotency-key": documentParseIdempotencyKey(
                  "parse-document",
                  documentId,
                  path,
                ),
              },
            },
          );
        } catch (parseErr) {
          console.warn("[useDocuments] parse-document:", parseErr);
          parseError =
            "File uploaded but text extraction failed. Retry or paste text manually.";
        }

        return {
          documentId,
          error: parseError,
        };
      } catch (err) {
        return {
          documentId: null,
          error: err instanceof Error ? err.message : "Upload failed",
        };
      } finally {
        docStore.setUploadProgress(0);
      }
    },
    [user]
  );

  // ── Parse resume via Edge Function ────────────────────────────

  async function parseResume(
    resumeId: string,
    filePath: string,
    mimeType: string
  ): Promise<void> {
    if (!mountedRef.current) return;
    setIsParsing(true);
    try {
      const data = await fetchEdgeJson<{ parsed?: Record<string, unknown>; content?: string; duplicate?: boolean }>(
        "parse-resume",
        {
          resume_id: resumeId,
          file_path: filePath,
          mime_type: mimeType,
        },
        {
          timeoutMs: 90_000,
          headers: {
            "x-idempotency-key": documentParseIdempotencyKey(
              "parse-resume",
              resumeId,
              filePath,
            ),
          },
        },
      );
      if (data?.parsed) {
        await resumesDB.update(resumeId, { content: JSON.stringify(data.parsed) });
      } else if (data?.content) {
        await resumesDB.update(resumeId, { content: data.content });
      }
      if (mountedRef.current) {
        await loadDocuments();
        docStore.setActiveResumeId(resumeId);
        if ((data as { duplicate?: boolean })?.duplicate) {
          const { toast } = await import("sonner");
          toast.message("This file was already parsed. Reusing the existing document — no extra charge.");
        }
      }
    } catch (err) {
      console.error("[useDocuments] parseResume failed:", err);
      const code = (err as { code?: string })?.code;
      if (code === "DUPLICATE_DOCUMENT") {
        const { toast } = await import("sonner");
        toast.message("This file was already uploaded. Opening the existing document — no extra charge.");
        if (mountedRef.current) await loadDocuments();
        return;
      }
      const message =
        err instanceof Error ? err.message : "Resume parsing failed. Please try again.";
      try {
        await resumesDB.update(resumeId, {
          content: JSON.stringify({ _parse_error: message }),
        });
      } catch {
        // best-effort: status flip still surfaces via toast
      }
      toast.error(message);
      if (mountedRef.current) {
        await loadDocuments();
      }
      throw err instanceof Error ? err : new Error(message);
    } finally {
      if (mountedRef.current) setIsParsing(false);
    }
  }

  // ── Delete resume ─────────────────────────────────────────────

  const deleteResume = useCallback(async (resumeId: string): Promise<void> => {
    const resume = docStore.resumes.find((r) => r.id === resumeId);
    if (!resume) return;

    // Delete file from storage
    if ((resume as any).file_path) {
      try {
        await deleteFile(STORAGE_BUCKETS.RESUMES, (resume as any).file_path);
      } catch (err) {
        console.warn("[useDocuments] deleteFile failed:", err);
      }
    }

    await resumesDB.delete(resumeId);
    docStore.removeResume(resumeId);
  }, [docStore.resumes]);

  // ── Add Job Description (adapted to actual DB columns) ────────

  const addJobDescription = useCallback(async (params: {
    rawText:    string;
    method:     JDInputMethod;
    roleTitle?: string;
    company?:   string;
    fileUrl?:   string;
  }): Promise<{ jdId: string | null; error: string | null }> => {
    if (!user) return { jdId: null, error: "Not authenticated" };

    const jdId = generateId();
    const contentHash = params.rawText.trim()
      ? await sha256(params.rawText.trim())
      : null;

    try {
      if (contentHash) {
        const existing = await jobDescriptionsDB.getByContentHash(user.id, contentHash);
        if (existing) {
          const { toast: notify } = await import("sonner");
          notify.message("This job description was already saved. Opening the existing document.");
          await loadDocuments();
          return { jdId: existing.id, error: null };
        }
      }

      await jobDescriptionsDB.create({
      id:           jdId,
      user_id:      user.id,
      title:        params.roleTitle ?? "Unknown Role",
      target_role:  params.roleTitle ?? "Unknown Role",
      company:      params.company   ?? null,
      content:      params.rawText,
      content_hash: contentHash,
      url:          params.fileUrl   ?? null,
      input_method: params.method,
      file_url:     params.fileUrl   ?? null,
      is_active:    true,
      parse_status: "parsing",
      parsed_data:  null,
      parse_error:  null,
      });
    } catch (err) {
      return {
        jdId: null,
        error: err instanceof Error ? err.message : "Failed to save job description",
      };
    }

    parseJobDescription(jdId, params.rawText);
    await loadDocuments();
    return { jdId, error: null };
  }, [user]);

  const addJobDescriptionFromFile = useCallback(async (params: {
    file: File;
    roleTitle?: string;
    company?: string;
  }): Promise<{ jdId: string | null; error: string | null }> => {
    if (!user) return { jdId: null, error: "Not authenticated" };

    const jdId = generateId();
    const ext = (params.file.name.split(".").pop() ?? "pdf").toLowerCase();
    const mimeType =
      (params.file.type && params.file.type !== "application/octet-stream"
        ? params.file.type
        : getMimeType(params.file.name)) || "application/pdf";
    const path = `${user.id}/job-descriptions/${jdId}.${ext}`;

    try {
      const contentHash = await sha256Buffer(await params.file.arrayBuffer());
      const existing = await jobDescriptionsDB.getByContentHash(user.id, contentHash);
      if (existing) {
        toast.message("This job description was already saved. Opening the existing document.");
        await loadDocuments();
        return { jdId: existing.id, error: null };
      }

      await jobDescriptionsDB.create({
        id: jdId,
        user_id: user.id,
        title: params.roleTitle ?? params.file.name.replace(/\.[^/.]+$/, "") ?? "Unknown Role",
        target_role: params.roleTitle ?? "Unknown Role",
        company: params.company ?? null,
        content: `[Uploaded file: ${params.file.name}]`,
        content_hash: contentHash,
        input_method: "upload",
        file_url: null,
        is_active: true,
        parse_status: "parsing",
        parsed_data: null,
        parse_error: null,
      });

      const uploaded = await uploadFile(STORAGE_BUCKETS.DOCUMENTS, path, params.file);
      if (!uploaded) throw new Error("Upload failed");
      await jobDescriptionsDB.update(jdId, { file_url: uploaded.url });

      const parsed = await fetchEdgeJson<{ content?: string }>(
        "parse-document",
        { jd_id: jdId, mime_type: mimeType },
        {
          timeoutMs: 90_000,
          headers: {
            "x-idempotency-key": documentParseIdempotencyKey(
              "parse-document",
              jdId,
              contentHash,
            ),
          },
        },
      );

      const extracted = parsed.content?.trim() ?? "";
      if (extracted.length >= 20) {
        parseJobDescription(jdId, extracted);
      }
      await loadDocuments();
      return { jdId, error: null };
    } catch (err) {
      return {
        jdId,
        error:
          err instanceof Error
            ? err.message
            : "File uploaded but text extraction failed. Paste the job description text if needed.",
      };
    }
  }, [user]);

  // ── Parse JD via AI ───────────────────────────────────────────

  async function parseJobDescription(jdId: string, rawText: string): Promise<void> {
    try {
      const prompt = `Extract structured data from this job description.
Return ONLY valid JSON matching this schema:
{
  "role_title": string,
  "company_name": string | null,
  "required_skills": string[],
  "preferred_skills": string[],
  "responsibilities": string[],
  "experience_required": string,
  "education_required": string | null,
  "seniority_level": "junior" | "mid" | "senior" | "lead" | "manager" | "director" | "unknown",
  "key_phrases": string[],
  "salary_range": string | null,
  "location": string | null,
  "is_remote": boolean
}

Job description:
${rawText.slice(0, 4000)}`;

      const text  = await callGemini({ prompt, model: "gemini-2.0-flash", max_tokens: 2048 });
      const clean = text.replace(/```json|```/g, "").trim();
      const data: ParsedJD = JSON.parse(clean);

      await jobDescriptionsDB.update(jdId, {
        parsed_data: data as unknown as Json,
        parse_status: "ready",
        parse_error: null,
      });

      if (mountedRef.current) await loadDocuments();
    } catch (err) {
      console.error("[useDocuments] parseJD failed:", err);
      await jobDescriptionsDB.update(jdId, {
        parse_status: "error",
        parse_error: String(err),
      });
    }
  }

  // ── Gap analysis ──────────────────────────────────────────────

  const runGapAnalysis = useCallback(async (
    resumeId: string,
    jdId: string
  ): Promise<void> => {
    const resume = docStore.resumes.find((r) => r.id === resumeId);
    const jd     = docStore.jds.find((j) => j.id === jdId);
    if (!resume || !jd) return;

    try {
      const gap = await fetchEdgeJson<Record<string, unknown>>(
        "gap-analysis",
        { resume_id: resumeId, jd_id: jdId },
        {
          headers: {
            "x-idempotency-key": documentParseIdempotencyKey(
              "gap-analysis",
              `${resumeId}:${jdId}`,
            ),
          },
        },
      );
      if (mountedRef.current) {
        docStore.setGapAnalysis({
          id: crypto.randomUUID(),
          user_id: "",
          resume_id: resumeId,
          resume_version_id: "",
          jd_id: jdId,
          result: gap as never,
          generated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("[useDocuments] runGapAnalysis failed:", err);
      throw err;
    }
  }, [docStore.resumes, docStore.jds]);

  // ── Answer Bank CRUD ──────────────────────────────────────────

  const saveAnswer = useCallback(async (params: {
    title:        string;
    question:     string;
    answerText:   string;
    category:     AnswerCategory;
    tags?:        string[];
    companyTags?: string[];
  }): Promise<{ error: string | null }> => {
    if (!user) return { error: "Not authenticated" };

    try {
      const inserted = await answerBankDB.create(user.id, {
        id:            generateId(),
        question_text: params.question,
        answer_text:   params.answerText,
        category:      params.category ?? "general",
        tags:          params.tags     ?? [],
        source:        "manual",
      });
      answerStore.addAnswer(mapAnswerBankRowToSavedAnswer(inserted));
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to save answer" };
    }
  }, [user]);

  const setActiveResume = useCallback(async (resumeId: string): Promise<void> => {
    if (!user) return;

    try {
      await supabase
        .from("resumes")
        .update({ is_primary: false })
        .eq("user_id", user.id);

      await resumesDB.update(resumeId, { is_primary: true });

      docStore.setResumes(
        docStore.resumes.map((r) => ({
          ...r,
          is_primary: r.id === resumeId,
        })) as ResumeDocument[],
      );
      docStore.setActiveResumeId(resumeId);
    } catch (err) {
      console.error("[useDocuments] setActiveResume failed:", err);
      throw err;
    }
  }, [user, docStore]);

  const deleteAnswer = useCallback(async (answerId: string): Promise<void> => {
    if (!user?.id) return;
    await answerBankDB.delete(user.id, answerId);
    answerStore.removeAnswer(answerId);
  }, [user?.id]);

  const toggleFavourite = useCallback(async (answerId: string): Promise<void> => {
    const answer = answerStore.answers.find((a) => a.id === answerId);
    if (!answer) return;
    const newFav = !answer.is_favourite;
    if (!user?.id) return;
    await answerBankDB.update(user.id, answerId, { is_favourite: newFav });
    answerStore.toggleFavourite(answerId);
  }, [answerStore.answers, user?.id]);

  return {
    resumes:        docStore.resumes,
    jds:            docStore.jds,
    activeContext:  docStore.active_context,
    answers:        answerStore.filtered_answers,
    allAnswers:     answerStore.answers,
    isLoading:      docStore.is_loading,
    loadError,
    uploadProgress: docStore.upload_progress,
    isParsing,

    uploadResume,
    uploadCoverLetter,
    deleteResume,
    setActiveResume,

    addJobDescription,
    addJobDescriptionFromFile,
    setActiveJD:     docStore.setActiveJDId,
    runGapAnalysis,

    saveAnswer,
    deleteAnswer,
    toggleFavourite,
    incrementUsage:  answerStore.incrementUsageCount,
    setFilter:       answerStore.setFilter,
    setSearch:       answerStore.setSearchQuery,
    activeFilter:    answerStore.active_filter,
    searchQuery:     answerStore.search_query,

    reload: loadDocuments,
  };
}
