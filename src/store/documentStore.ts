import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  DocumentStoreState,
  ResumeDocument,
  JDDocument,
  DocumentGapAnalysis,
  ActiveDocumentContext,
} from "@/types/document.types";

interface DocumentStore extends DocumentStoreState {
  // Resume actions
  setResumes: (resumes: ResumeDocument[]) => void;
  addResume: (resume: ResumeDocument) => void;
  updateResume: (id: string, patch: Partial<ResumeDocument>) => void;
  removeResume: (id: string) => void;
  setActiveResumeId: (id: string | null) => void;

  // JD actions
  setJDs: (jds: JDDocument[]) => void;
  addJD: (jd: JDDocument) => void;
  updateJD: (id: string, patch: Partial<JDDocument>) => void;
  removeJD: (id: string) => void;
  setActiveJDId: (id: string | null) => void;

  // Active context
  setActiveContext: (ctx: Partial<ActiveDocumentContext>) => void;
  setGapAnalysis: (analysis: DocumentGapAnalysis | null) => void;

  // Upload
  setIsLoading: (loading: boolean) => void;
  setUploadProgress: (progress: number) => void;

  // Reset
  resetDocuments: () => void;
}

const INITIAL_STATE: DocumentStoreState = {
  resumes: [],
  jds: [],
  active_resume_id: null,
  active_jd_id: null,
  active_context: {
    resume: null,
    resume_version: null,
    jd: null,
    gap_analysis: null,
    is_loading: false,
  },
  is_loading: false,
  upload_progress: 0,
};

export const useDocumentStore = create<DocumentStore>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_STATE,

    // ── Resume actions ─────────────────────────────────────
    setResumes: (resumes) => set({ resumes }),

    addResume: (resume) =>
      set((s) => ({ resumes: [...s.resumes, resume] })),

    updateResume: (id, patch) =>
      set((s) => ({
        resumes: s.resumes.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      })),

    removeResume: (id) =>
      set((s) => ({
        resumes: s.resumes.filter((r) => r.id !== id),
        active_resume_id: s.active_resume_id === id ? null : s.active_resume_id,
      })),

    setActiveResumeId: (active_resume_id) => {
      const resume = get().resumes.find((r) => r.id === active_resume_id) ?? null;
      const active_version = resume?.versions.find(
        (v) => v.id === resume.active_version_id
      ) ?? resume?.versions[0] ?? null;
      set((s) => ({
        active_resume_id,
        active_context: {
          ...s.active_context,
          resume,
          resume_version: active_version,
        },
      }));
    },

    // ── JD actions ─────────────────────────────────────────
    setJDs: (jds) => set({ jds }),

    addJD: (jd) =>
      set((s) => ({ jds: [...s.jds, jd] })),

    updateJD: (id, patch) =>
      set((s) => ({
        jds: s.jds.map((j) => (j.id === id ? { ...j, ...patch } : j)),
      })),

    removeJD: (id) =>
      set((s) => ({
        jds: s.jds.filter((j) => j.id !== id),
        active_jd_id: s.active_jd_id === id ? null : s.active_jd_id,
      })),

    setActiveJDId: (active_jd_id) => {
      const jd = get().jds.find((j) => j.id === active_jd_id) ?? null;
      set((s) => ({
        active_jd_id,
        active_context: { ...s.active_context, jd },
      }));
    },

    // ── Active context ─────────────────────────────────────
    setActiveContext: (ctx) =>
      set((s) => ({
        active_context: { ...s.active_context, ...ctx },
      })),

    setGapAnalysis: (gap_analysis) =>
      set((s) => ({
        active_context: { ...s.active_context, gap_analysis },
      })),

    // ── Upload ─────────────────────────────────────────────
    setIsLoading: (is_loading) => set({ is_loading }),
    setUploadProgress: (upload_progress) => set({ upload_progress }),

    // ── Reset ──────────────────────────────────────────────
    resetDocuments: () => set(INITIAL_STATE),
  }))
);
