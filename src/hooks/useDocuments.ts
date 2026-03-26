// @ts-nocheck
// src/hooks/useDocuments.ts
import { EDGE_BASE } from "@/lib/env";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, uploadFile, deleteFile, STORAGE_BUCKETS } from "@/lib/supabase/client";
import { useDocumentStore } from "@/store/documentStore";
import { useAnswerBankStore } from "@/store/answerBankStore";
import { useAuthStore } from "@/store/userStore";
import { callGemini } from "@/lib/ai/geminiClient";
import { generateId } from "@/lib/utils";
import type {
  ResumeDocument,
  JDDocument,
  JDInputMethod,
  SavedAnswer,
  AnswerCategory,
} from "@/types/document.types";
import type { ParsedJD } from "@/types/ai.types";

// ─────────────────────────────────────────────────────────────────
// answer_bank row → SavedAnswer adapter
// ─────────────────────────────────────────────────────────────────

function mapAnswerBankRowToSavedAnswer(row: any): SavedAnswer {
  return {
    id:              row.id,
    user_id:         row.user_id,
    title:           row.question_text ?? "",
    question:        row.question_text ?? "",
    answer_text:     row.answer_text   ?? "",
    category:        (row.category as AnswerCategory) ?? "general",
    tags:            row.tags          ?? [],
    company_tags:    [],
    star_components: row.star_breakdown ?? null,
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

export function useDocuments() {
  const { user }    = useAuthStore();
  const docStore    = useDocumentStore();
  const answerStore = useAnswerBankStore();
  const [isParsing, setIsParsing] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    loadDocuments();
    loadAnswerBank();
  }, [user?.id]);

  // ── Load documents ────────────────────────────────────────────

  async function loadDocuments(): Promise<void> {
    if (!user) return;
    docStore.setIsLoading(true);
    try {
      const [resumeRes, jdRes] = await Promise.all([
        supabase
          .from("resumes")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("job_descriptions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      if (!mountedRef.current) return;

      // Map DB schema → frontend expected shape
      if (resumeRes.data) {
        const mapped = resumeRes.data.map((r: any) => ({
          ...r,
          title: r.name ?? r.title ?? "Untitled",
        }));
        docStore.setResumes(mapped as ResumeDocument[]);
      }
      if (jdRes.data) {
        const mapped = jdRes.data.map((j: any) => ({
          ...j,
          role_title:   j.target_role ?? j.role_title ?? "Unknown Role",
          company_name: j.company ?? j.company_name ?? null,
          raw_text:     j.content ?? j.raw_text ?? "",
        }));
        docStore.setJDs(mapped as JDDocument[]);
      }
    } catch (err) {
      console.error("[useDocuments] loadDocuments failed:", err);
    } finally {
      if (mountedRef.current) docStore.setIsLoading(false);
    }
  }

  async function loadAnswerBank(): Promise<void> {
    if (!user) return;
    answerStore.setIsLoading(true);
    try {
      const { data } = await supabase
        .from("answer_bank")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!mountedRef.current) return;
      if (data) answerStore.setAnswers(data.map(mapAnswerBankRowToSavedAnswer));
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
    const ext      = file.name.split(".").pop() ?? "pdf";
    const path     = `${user.id}/${resumeId}.${ext}`;

    docStore.setUploadProgress(0);

    try {
      const uploaded = await uploadFile(
        STORAGE_BUCKETS.RESUMES,
        path,
        file,
        (pct) => docStore.setUploadProgress(pct)
      );
      if (!uploaded) throw new Error("Upload failed");

      const { error: resumeErr } = await supabase.from("resumes").insert({
        id:        resumeId,
        user_id:   user.id,
        name:      title ?? file.name.replace(/\.[^/.]+$/, ""),
        file_path: path,
        url:       uploaded.url,
        content:   null,
        is_primary: false,
      });
      if (resumeErr) throw new Error(resumeErr.message);

      // Fire-and-forget parse
      parseResume(resumeId, uploaded.url, file.type);

      await loadDocuments();
      return { resumeId, error: null };

    } catch (err) {
      docStore.setUploadProgress(0);
      return {
        resumeId: null,
        error: err instanceof Error ? err.message : "Upload failed",
      };
    }
  }, [user]);

  // ── Parse resume via Edge Function ────────────────────────────

  async function parseResume(
    resumeId: string,
    fileUrl: string,
    mimeType: string
  ): Promise<void> {
    if (!mountedRef.current) return;
    setIsParsing(true);
    try {
      const { data } = await supabase.functions.invoke("parse-resume", {
        body: { resume_id: resumeId, file_url: fileUrl, mime_type: mimeType },
      });
      // Update content if parsed
      if (data?.content) {
        await supabase.from("resumes").update({ content: data.content }).eq("id", resumeId);
      }
      if (mountedRef.current) await loadDocuments();
    } catch (err) {
      console.error("[useDocuments] parseResume failed:", err);
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

    await supabase.from("resumes").delete().eq("id", resumeId);
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

    const { error } = await supabase.from("job_descriptions").insert({
      id:           jdId,
      user_id:      user.id,
      title:        params.roleTitle ?? "Unknown Role",
      target_role:  params.roleTitle ?? "Unknown Role",
      company:      params.company   ?? null,
      content:      params.rawText,
      url:          params.fileUrl   ?? null,
      input_method: params.method,
      file_url:     params.fileUrl   ?? null,
      is_active:    true,
      parse_status: "parsing",
      parsed_data:  null,
      parse_error:  null,
    });

    if (error) return { jdId: null, error: error.message };

    parseJobDescription(jdId, params.rawText);
    await loadDocuments();
    return { jdId, error: null };
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

      const text  = await callGemini({ prompt, model: "gemini-2.0-flash", maxOutputTokens: 2048 });
      const clean = text.replace(/```json|```/g, "").trim();
      const data: ParsedJD = JSON.parse(clean);

      await supabase
        .from("job_descriptions")
        .update({ parsed_data: data, parse_status: "ready", parse_error: null })
        .eq("id", jdId);

      if (mountedRef.current) await loadDocuments();
    } catch (err) {
      console.error("[useDocuments] parseJD failed:", err);
      await supabase
        .from("job_descriptions")
        .update({ parse_status: "error", parse_error: String(err) })
        .eq("id", jdId);
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
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`${EDGE_BASE}/gap-analysis`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          resume_id: resumeId,
          jd_id:     jdId,
        }),
      });

      if (!response.ok) {
        console.error("[useDocuments] gap-analysis failed:", response.status);
        return;
      }
      const gap = await response.json();
      if (mountedRef.current) docStore.setGapAnalysis(gap);
    } catch (err) {
      console.error("[useDocuments] runGapAnalysis failed:", err);
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

    const { data: inserted, error } = await supabase
      .from("answer_bank")
      .insert({
        id:            generateId(),
        user_id:       user.id,
        question_text: params.question,
        answer_text:   params.answerText,
        category:      params.category ?? "general",
        tags:          params.tags     ?? [],
        source:        "manual",
      })
      .select()
      .single();

    if (error) return { error: error.message };
    answerStore.addAnswer(mapAnswerBankRowToSavedAnswer(inserted));
    return { error: null };
  }, [user]);

  const deleteAnswer = useCallback(async (answerId: string): Promise<void> => {
    await supabase.from("answer_bank").delete().eq("id", answerId);
    answerStore.removeAnswer(answerId);
  }, []);

  const toggleFavourite = useCallback(async (answerId: string): Promise<void> => {
    const answer = answerStore.answers.find((a) => a.id === answerId);
    if (!answer) return;
    const newFav = !answer.is_favourite;
    await supabase
      .from("answer_bank")
      .update({ is_favourite: newFav, updated_at: new Date().toISOString() })
      .eq("id", answerId);
    answerStore.toggleFavourite(answerId);
  }, [answerStore.answers]);

  return {
    resumes:        docStore.resumes,
    jds:            docStore.jds,
    activeContext:  docStore.active_context,
    answers:        answerStore.filtered_answers,
    allAnswers:     answerStore.answers,
    isLoading:      docStore.is_loading,
    uploadProgress: docStore.upload_progress,
    isParsing,

    uploadResume,
    deleteResume,
    setActiveResume: docStore.setActiveResumeId,

    addJobDescription,
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
