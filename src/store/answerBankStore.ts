import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  AnswerBankStoreState,
  SavedAnswer,
  AnswerCategory,
} from "@/types/document.types";

interface AnswerBankStore extends AnswerBankStoreState {
  // CRUD
  setAnswers: (answers: SavedAnswer[]) => void;
  addAnswer: (answer: SavedAnswer) => void;
  updateAnswer: (id: string, patch: Partial<SavedAnswer>) => void;
  removeAnswer: (id: string) => void;
  toggleFavourite: (id: string) => void;
  incrementUsageCount: (id: string) => void;

  // Filtering
  setFilter: (filter: AnswerCategory | "all") => void;
  setSearchQuery: (query: string) => void;
  applyFilters: () => void;

  // Loading
  setIsLoading: (loading: boolean) => void;

  // Reset
  resetAnswerBank: () => void;
}

const INITIAL_STATE: AnswerBankStoreState = {
  answers: [],
  filtered_answers: [],
  active_filter: "all",
  search_query: "",
  is_loading: false,
};

function applyFiltersToAnswers(
  answers: SavedAnswer[],
  filter: AnswerCategory | "all",
  query: string
): SavedAnswer[] {
  let result = [...answers];

  // Category filter
  if (filter !== "all") {
    result = result.filter((a) => a.category === filter);
  }

  // Search filter — title, question, tags
  if (query.trim()) {
    const q = query.toLowerCase();
    result = result.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.question.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q)) ||
        a.company_tags.some((c) => c.toLowerCase().includes(q))
    );
  }

  // Sort: favourites first, then by last_used, then created_at
  result.sort((a, b) => {
    if (a.is_favourite !== b.is_favourite) return a.is_favourite ? -1 : 1;
    if (a.last_used_at && b.last_used_at)
      return new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime();
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return result;
}

export const useAnswerBankStore = create<AnswerBankStore>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_STATE,

    setAnswers: (answers) =>
      set((s) => ({
        answers,
        filtered_answers: applyFiltersToAnswers(answers, s.active_filter, s.search_query),
      })),

    addAnswer: (answer) =>
      set((s) => {
        const answers = [answer, ...s.answers];
        return {
          answers,
          filtered_answers: applyFiltersToAnswers(answers, s.active_filter, s.search_query),
        };
      }),

    updateAnswer: (id, patch) =>
      set((s) => {
        const answers = s.answers.map((a) =>
          a.id === id ? { ...a, ...patch, updated_at: new Date().toISOString() } : a
        );
        return {
          answers,
          filtered_answers: applyFiltersToAnswers(answers, s.active_filter, s.search_query),
        };
      }),

    removeAnswer: (id) =>
      set((s) => {
        const answers = s.answers.filter((a) => a.id !== id);
        return {
          answers,
          filtered_answers: applyFiltersToAnswers(answers, s.active_filter, s.search_query),
        };
      }),

    toggleFavourite: (id) =>
      set((s) => {
        const answers = s.answers.map((a) =>
          a.id === id ? { ...a, is_favourite: !a.is_favourite } : a
        );
        return {
          answers,
          filtered_answers: applyFiltersToAnswers(answers, s.active_filter, s.search_query),
        };
      }),

    incrementUsageCount: (id) =>
      set((s) => {
        const answers = s.answers.map((a) =>
          a.id === id
            ? { ...a, times_used: a.times_used + 1, last_used_at: new Date().toISOString() }
            : a
        );
        return {
          answers,
          filtered_answers: applyFiltersToAnswers(answers, s.active_filter, s.search_query),
        };
      }),

    setFilter: (active_filter) =>
      set((s) => ({
        active_filter,
        filtered_answers: applyFiltersToAnswers(s.answers, active_filter, s.search_query),
      })),

    setSearchQuery: (search_query) =>
      set((s) => ({
        search_query,
        filtered_answers: applyFiltersToAnswers(s.answers, s.active_filter, search_query),
      })),

    applyFilters: () =>
      set((s) => ({
        filtered_answers: applyFiltersToAnswers(s.answers, s.active_filter, s.search_query),
      })),

    setIsLoading: (is_loading) => set({ is_loading }),

    resetAnswerBank: () => set(INITIAL_STATE),
  }))
);
