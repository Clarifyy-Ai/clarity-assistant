// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { supabase, uploadFile, deleteFile, STORAGE_BUCKETS } from "@/lib/supabase/client";
import { useDocumentStore } from "@/store/documentStore";
import { useAnswerBankStore } from "@/store/answerBankStore";
import { useAuthStore } from "@/store/userStore";
import { callGemini } from "@/lib/ai/geminiClient";
import { generateId } from "@/lib/utils";
import type {
  ResumeDocument,
  ResumeVersion,
  JDDocument,
  JDInputMethod,
  SavedAnswer,
  AnswerCategory,
} from "@/types/document.types";
import type { ParsedResume, ParsedJD } from "@/types/ai.types";

// ─────────────────────────────────────────────────────────────────
// answer_bank table row → SavedAnswer adapter
// answer_bank uses question_text/answer_text; SavedAnswer uses question/title.
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
// useDocuments
// Manages resumes, job descriptions, gap analysis, and answer bank.
// ─────────────────────────────────────────────────────────────────

export function useDocuments() {
  const { user }    = useAuthStore();
  const docStore    = useDocumentStore();
  const answerStore = useAnswerBankStore();
  const [isParsing, setIsParsing] = useState(false);

  // ── Load all documents on mount ───────────────────────────────

  useEffect(() => {
    if (!user) return;
    loadDocuments();
    loadAnswerBank();
  }, [user?.id]);

  async function loadDocuments(): Promise<void> {
    docStore.setIsLoading(true);
    const [resumeRes, jdRes] = await Promise.all([
      supabase
        .from("resumes")
        .select("*, resume_versions(*)")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("job_descriptions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false }),
    ]);

    if (resumeRes.data) docStore.setResumes(resumeRes.data as ResumeDocument[]);
    if (jdRes.data)     docStore.setJDs(jdRes.data as JDDocument[]);
    docStore.setIsLoading(false);
  }

  async function loadAnswerBank(): Promise<void> {
    answerStore.setIsLoading(true);
    const { data } = await supabase
      .from("answer_bank")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (data) answerStore.setAnswers(data.map(mapAnswerBankRowToSavedAnswer));
    answerStore.setIsLoading(false);
  }

  // ── Upload resume ─────────────────────────────────────────────

  const uploadResume = useCallback(async (
    file: File,
    title?: string
  ): Promise<{ resumeId: string | null; error: string | null }> => {
    if (!user) return { resumeId: null, error: "Not authenticated" };

    const resumeId  = generateId();
    const versionId = generateId();
    const path      = `${user.id}/${resumeId}/${versionId}.${file.name.split(".").pop()}`;

    docStore.setUploadProgress(0);

    try {
      // Upload file
      const uploaded = await uploadFile(
        STORAGE_BUCKETS.RESUMES,
        path,
        file,
        (pct) => docStore.setUploadProgress(pct)
      );

      if (!uploaded) throw new Error("Upload failed");

      // Create resume + version records
      const version: Partial<ResumeVersion> = {
        id:              versionId,
        version_number:  1,
        label:           null,
        file_name:       file.name,
        file_size_bytes: file.size,
        file_url:        uploaded.url,
        is_active:       true,
        parsed_data:     null,
        parse_status:    "parsing",
        parse_error:     null,
        uploaded_at:     new Date().toISOString(),
      };

      const resume: Partial<ResumeDocument> = {
        id:                resumeId,
        user_id:           user.id,
        title:             title ?? file.name.replace(/\.[^/.]+$/, ""),
        active_version_id: versionId,
        created_at:        new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      };

      const { error: dbError } = await supabase
        .from("resumes")
        .insert({ ...resume, resume_versions: [version] });

      if (dbError) throw new Error(dbError.message);

      // Trigger async parsing via Edge Function
      parseResume(resumeId, versionId, uploaded.url, file.type);

      await loadDocuments();
      return { resumeId, error: null };

    } catch (err) {
      docStore.setUploadProgress(0);
      return {
        resumeId: null,
        error:    err instanceof Error ? err.message : "Upload failed",
      };
    }
  }, [user]);

  // ── Parse resume via AI ───────────────────────────────────────

  async function parseResume(
    resumeId: string,
    versionId: string,
    fileUrl: string,
    mimeType: string
  ): Promise<void> {
    setIsParsing(true);
    try {
      // Use supabase.functions.invoke so the user's JWT is forwarded automatically,
      // enabling the edge function to verify resume ownership via RLS.
      await supabase.functions.invoke("parse-resume", {
        body: { resume_id: resumeId, version_id: versionId, file_url: fileUrl, mime_type: mimeType },
      });
      await loadDocuments();
    } catch { /* non-fatal */ }
    finally { setIsParsing(false); }
  }

  // ── Delete resume ─────────────────────────────────────────────

  const deleteResume = useCallback(async (resumeId: string): Promise<void> => {
    const resume = docStore.resumes.find((r) => r.id === resumeId);
    if (!resume) return;

    // Delete storage files
    for (const version of resume.versions) {
      const path = new URL(version.file_url).pathname.split("/storage/v1/object/public/resumes/")[1];
      if (path) await deleteFile(STORAGE_BUCKETS.RESUMES, path);
    }

    await supabase.from("resumes").delete().eq("id", resumeId);
    docStore.removeResume(resumeId);
  }, [docStore.resumes]);

  // ── Add Job Description ───────────────────────────────────────

  const addJobDescription = useCallback(async (params: {
    rawText:    string;
    method:     JDInputMethod;
    roleTitle?: string;
    company?:   string;
    fileUrl?:   string;
  }): Promise<{ jdId: string | null; error: string | null }> => {
    if (!user) return { jdId: null, error: "Not authenticated" };

    const jdId: string = generateId();

    const jd: Partial<JDDocument> = {
      id:           jdId,
      user_id:      user.id,
      raw_text:     params.rawText,
      role_title:   params.roleTitle ?? "Unknown Role",
      company_name: params.company   ?? null,
      input_method: params.method,
      file_url:     params.fileUrl   ?? null,
      is_active:    true,
      parse_status: "parsing",
      parsed_data:  null,
      parse_error:  null,
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    };

    const { error } = await supabase.from("job_descriptions").insert(jd);
    if (error) return { jdId: null, error: error.message };

    // Async parse
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

      const text  = await callGemini({ prompt, model: "gemini-1.5-flash" });
      const clean = text.replace(/```json|```/g, "").trim();
      const data: ParsedJD = JSON.parse(clean);

      await supabase
        .from("job_descriptions")
        .update({ parsed_data: data, parse_status: "ready" })
        .eq("id", jdId);

      await loadDocuments();
    } catch {
      await supabase
        .from("job_descriptions")
        .update({ parse_status: "error", parse_error: "Parse failed" })
        .eq("id", jdId);
    }
  }

  // ── Run gap analysis ──────────────────────────────────────────

  const runGapAnalysis = useCallback(async (
    resumeId: string,
    jdId: string
  ): Promise<void> => {
    const resume = docStore.resumes.find((r) => r.id === resumeId);
    const jd     = docStore.jds.find((j) => j.id === jdId);
    if (!resume || !jd) return;

    const activeVersion = resume.versions.find(
      (v) => v.id === resume.active_version_id
    ) ?? resume.versions[0];
    if (!activeVersion?.parsed_data) return;

    try {
      const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      const response  = await fetch(`${EDGE_BASE}/gap-analysis`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          resume_id:         resumeId,
          resume_version_id: activeVersion.id,
          jd_id:             jdId,
        }),
      });

      if (!response.ok) return;
      const gap = await response.json();
      docStore.setGapAnalysis(gap);
    } catch { /* non-fatal */ }
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

    const answer: Partial<SavedAnswer> = {
      id:             generateId(),
      user_id:        user.id,
      title:          params.title,
      question:       params.question,
      answer_text:    params.answerText,
      category:       params.category,
      tags:           params.tags           ?? [],
      company_tags:   params.companyTags    ?? [],
      star_components: null,
      is_favourite:   false,
      times_used:     0,
      last_used_at:   null,
      created_at:     new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    };

    const { data: inserted, error } = await supabase
      .from("answer_bank")
      .insert({
        id:            answer.id,
        user_id:       answer.user_id,
        question_text: answer.question ?? "",
        answer_text:   answer.answer_text ?? "",
        category:      answer.category ?? "general",
        tags:          answer.tags ?? [],
        source:        "manual",
      })
      .select()
      .single();
    if (error) return { error: error.message };

    // Map DB row to SavedAnswer shape before adding to store
    answerStore.addAnswer(mapAnswerBankRowToSavedAnswer(inserted ?? answer));
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
    // State
    resumes:          docStore.resumes,
    jds:              docStore.jds,
    activeContext:    docStore.active_context,
    answers:          answerStore.filtered_answers,
    allAnswers:       answerStore.answers,
    isLoading:        docStore.is_loading,
    uploadProgress:   docStore.upload_progress,
    isParsing,

    // Actions — resumes
    uploadResume,
    deleteResume,
    setActiveResume:  docStore.setActiveResumeId,

    // Actions — JD
    addJobDescription,
    setActiveJD:      docStore.setActiveJDId,
    runGapAnalysis,

    // Actions — answers
    saveAnswer,
    deleteAnswer,
    toggleFavourite,
    incrementUsage:   answerStore.incrementUsageCount,
    setFilter:        answerStore.setFilter,
    setSearch:        answerStore.setSearchQuery,
    activeFilter:     answerStore.active_filter,
    searchQuery:      answerStore.search_query,

    // Reload
    reload: loadDocuments,
  };
}
