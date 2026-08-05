// @ts-nocheck
import { useState, useCallback } from "react";
import { callGemini } from "@/lib/ai/geminiClient";
import { callOpenAI } from "@/lib/ai/openaiClient";
import { useAuthStore } from "@/store/authStore";
import { useDocuments } from "./useDocuments";
import type { STARComponents, SavedAnswer, AnswerCategory } from "@/types/document.types";

// ─────────────────────────────────────────────────────────────────
// useSTARBuilder
// AI-powered STAR answer construction, analysis, and saving.
// Helps users build compelling behavioural answers.
// ─────────────────────────────────────────────────────────────────

interface STARBuilderState {
  question:       string;
  components:     Partial<STARComponents>;
  isGenerating:   boolean;
  isAnalysing:    boolean;
  generatedAnswer: string | null;
  analysis:       STARAnalysis | null;
  isSaving:       boolean;
  error:          string | null;
}

interface STARAnalysis {
  overall_score:        number;
  situation_score:      number;
  task_score:           number;
  action_score:         number;
  result_score:         number;
  has_quantified_result: boolean;
  action_specificity:   "vague" | "moderate" | "specific";
  missing_elements:     string[];
  strengths:            string[];
  suggestions:          string[];
  improved_result:      string | null;
}

const INITIAL_STATE: STARBuilderState = {
  question:        "",
  components:      { situation: "", task: "", action: "", result: "" },
  isGenerating:    false,
  isAnalysing:     false,
  generatedAnswer: null,
  analysis:        null,
  isSaving:        false,
  error:           null,
};

export function useSTARBuilder() {
  const { profile }        = useAuthStore();
  const { saveAnswer }     = useDocuments();
  const [state, setState]  = useState<STARBuilderState>(INITIAL_STATE);

  // ── Set question ──────────────────────────────────────────────

  const setQuestion = useCallback((question: string) => {
    setState((s) => ({ ...s, question, analysis: null, generatedAnswer: null }));
  }, []);

  // ── Update component ──────────────────────────────────────────

  const updateComponent = useCallback((
    key: keyof STARComponents,
    value: string
  ) => {
    setState((s) => ({
      ...s,
      components: { ...s.components, [key]: value },
      analysis:   null,
    }));
  }, []);

  // ── Generate STAR answer from question ────────────────────────

  const generateFromQuestion = useCallback(async (
    question: string,
    context?: string
  ): Promise<void> => {
    if (!question.trim()) return;

    setState((s) => ({ ...s, isGenerating: true, error: null }));

    const prompt = `You are an expert career coach. Generate a STAR answer framework.
Question: "${question}"
${context ? `Candidate context: ${context}` : ""}
${profile?.role ? `Role: ${profile.role}` : ""}

Generate realistic STAR components. Return ONLY valid JSON:
{
  "situation": "2-3 sentence context",
  "task": "1-2 sentence responsibility",
  "action": "3-4 sentences of specific actions taken (use I, not we)",
  "result": "1-2 sentences with quantified outcome"
}`;

    try {
      const text  = await callGemini({ prompt, model: "gemini-1.5-flash" });
      const clean = text.replace(/```json|```/g, "").trim();
      const components: STARComponents = JSON.parse(clean);

      setState((s) => ({
        ...s,
        question,
        components,
        isGenerating: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isGenerating: false,
        error: "Failed to generate STAR answer",
      }));
    }
  }, [profile]);

  // ── Analyse existing STAR answer ──────────────────────────────

  const analyseAnswer = useCallback(async (): Promise<void> => {
    const { question, components } = state;
    if (!components.situation || !components.action || !components.result) return;

    setState((s) => ({ ...s, isAnalysing: true, error: null }));

    const fullAnswer = formatSTARAnswer(components as STARComponents);

    const prompt = `You are an expert interview coach. Analyse this STAR answer.
Question: "${question}"
Answer:
Situation: ${components.situation}
Task: ${components.task}
Action: ${components.action}
Result: ${components.result}

Return ONLY valid JSON:
{
  "overall_score": number (0-100),
  "situation_score": number (0-100),
  "task_score": number (0-100),
  "action_score": number (0-100),
  "result_score": number (0-100),
  "has_quantified_result": boolean,
  "action_specificity": "vague" | "moderate" | "specific",
  "missing_elements": string[],
  "strengths": string[],
  "suggestions": string[],
  "improved_result": string | null (improved result sentence if result is weak)
}`;

    try {
      const text  = await callGemini({ prompt, model: "gemini-1.5-flash" });
      const clean = text.replace(/```json|```/g, "").trim();
      const analysis: STARAnalysis = JSON.parse(clean);

      setState((s) => ({
        ...s,
        isAnalysing:     false,
        analysis,
        generatedAnswer: fullAnswer,
      }));
    } catch {
      setState((s) => ({
        ...s,
        isAnalysing: false,
        error: "Failed to analyse answer",
      }));
    }
  }, [state]);

  // ── Polish answer with AI ─────────────────────────────────────

  const polishAnswer = useCallback(async (): Promise<void> => {
    const { components, question } = state;
    if (!components.action) return;

    setState((s) => ({ ...s, isGenerating: true }));

    const messages = [
      {
        role: "system" as const,
        content: "You are an expert career coach who polishes interview answers to be concise, specific, and impactful.",
      },
      {
        role: "user" as const,
        content: `Polish this STAR answer. Keep all four components but make them sharper and more specific.
Question: "${question}"

Current answer:
Situation: ${components.situation}
Task: ${components.task}
Action: ${components.action}
Result: ${components.result}

Return ONLY valid JSON with the same structure: { situation, task, action, result }`,
      },
    ];

    try {
      const text  = await callOpenAI({ messages, model: "gpt-4o", max_tokens: 600 });
      const clean = text.replace(/```json|```/g, "").trim();
      const polished: STARComponents = JSON.parse(clean);

      setState((s) => ({
        ...s,
        components:   polished,
        isGenerating: false,
        analysis:     null,
      }));
    } catch {
      setState((s) => ({ ...s, isGenerating: false }));
    }
  }, [state]);

  // ── Save to answer bank ───────────────────────────────────────

  const saveToBank = useCallback(async (params: {
    title:      string;
    category:   AnswerCategory;
    tags?:      string[];
    companies?: string[];
  }): Promise<{ error: string | null }> => {
    const { question, components } = state;
    if (!question || !components.action) {
      return { error: "Question and action are required" };
    }

    setState((s) => ({ ...s, isSaving: true }));

    const result = await saveAnswer({
      title:       params.title,
      question,
      answerText:  formatSTARAnswer(components as STARComponents),
      category:    params.category,
      tags:        params.tags,
      companyTags: params.companies,
    });

    setState((s) => ({ ...s, isSaving: false }));
    return result;
  }, [state, saveAnswer]);

  // ── Reset ─────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  // ── Format complete answer ────────────────────────────────────

  const formattedAnswer = state.components.situation
    ? formatSTARAnswer(state.components as STARComponents)
    : null;

  return {
    // State
    question:        state.question,
    components:      state.components,
    isGenerating:    state.isGenerating,
    isAnalysing:     state.isAnalysing,
    isSaving:        state.isSaving,
    analysis:        state.analysis,
    generatedAnswer: state.generatedAnswer,
    formattedAnswer,
    error:           state.error,

    // Actions
    setQuestion,
    updateComponent,
    generateFromQuestion,
    analyseAnswer,
    polishAnswer,
    saveToBank,
    reset,
  };
}

// ─────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────

function formatSTARAnswer(components: STARComponents): string {
  const parts: string[] = [];
  if (components.situation) parts.push(`Situation: ${components.situation}`);
  if (components.task)      parts.push(`Task: ${components.task}`);
  if (components.action)    parts.push(`Action: ${components.action}`);
  if (components.result)    parts.push(`Result: ${components.result}`);
  return parts.join("\n\n");
}
