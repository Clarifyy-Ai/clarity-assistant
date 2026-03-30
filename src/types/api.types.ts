// src/types/api.types.ts
export type HTTPMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type HTTPStatus =
  | 200
  | 201
  | 204
  | 400
  | 401
  | 402
  | 403
  | 404
  | 409
  | 422
  | 429
  | 500
  | 502
  | 503;

export interface APISuccess<T = unknown> {
  success: true;
  data: T;
  message?: string;
  meta?: ResponseMeta;
}

export interface APIError {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
  status?: HTTPStatus;
}

export type APIResponse<T = unknown> = APISuccess<T> | APIError;

export interface ResponseMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
  cursor?: string;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  cursor?: string;
}

export type SortDirection = "asc" | "desc";

export interface SortParams {
  sortBy?: string;
  sortDir?: SortDirection;
}

export interface DateRangeFilter {
  from?: string;
  to?: string;
}

export interface FilterParams extends PaginationParams, SortParams {
  search?: string;
  dateRange?: DateRangeFilter;
  [key: string]: unknown;
}

export interface RequestOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface EdgeFunctionOptions extends RequestOptions {
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  onComplete?: (full: string) => void;
  onError?: (error: Error) => void;
}

/* =========================
   Mock Test Types
   ========================= */

export interface DifficultyDistribution {
  EASY: number;
  MEDIUM: number;
  HARD: number;
}

export interface YearRange {
  min: number | null;
  max: number | null;
}

export interface MockTestConfig {
  exam_type: string;
  test_name: string;
  subjects: string[];
  topics: string[];
  source_types: string[];
  year_range: YearRange | null;
  difficulty_distribution: DifficultyDistribution;
  question_count: number;
  duration_minutes: number;
  marks_positive: number;
  marks_negative: number;
  randomize_order: boolean;
  shuffle_options: boolean;
}

export interface SelectTestQuestionsRequest {
  config: MockTestConfig;
}

export interface SelectTestQuestionsResponse {
  question_ids: string[];
  count: number;
  ai_generated_count: number;
  warning?: string;
}

export interface CreateTestRequest {
  test_name?: string;
  config: MockTestConfig;
  question_ids: string[];
}

export interface CreateTestResponse {
  test_id: string;
  test: Record<string, unknown>;
  question_count: number;
}

export interface ParseQuestionPdfResponse {
  questions: Array<Record<string, unknown>>;
  summary?: string;
  mode?: "manual" | "ocr" | "ai";
}
