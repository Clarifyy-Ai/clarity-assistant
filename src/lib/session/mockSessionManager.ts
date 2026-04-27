// src/lib/session/mockSessionManager.ts
// Core orchestration for mock sessions: duration, personality, recording, metrics. [file:1][file:3]

import { SessionRecorder } from "./sessionRecorder";
import {
  InterviewerPersonality,
  getPersonalityById,
  getPanelPersonalityForIndex,
  PersonalityId,
} from "./interviewerPersonality";
import { SpeechMetricsCalculator, SpeechMetrics } from "@/lib/audio/speechMetricsCalculator";
import { generateInterviewerQuestion, scoreAnswer } from "@/lib/ai/mockSessionAi";
import { v4 as uuidv4 } from "uuid";

export interface MockSessionConfig {
  durationMinutes: number;      // 15–45 [file:1]
  questionCount: number;        // 5–20 [file:1]
  personalityType: PersonalityId; // "strict" | "friendly" | "neutral" | "panel"
  enableRecording: boolean;
  enableTranscription: boolean;
  enableMetrics: boolean;
}

export interface QuestionFeedback {
  score: number;                // 0-100
  notes: string;
  metricsSnapshot?: SpeechMetrics;
}

export interface SessionScorecard {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  totalQuestions: number;
  answeredQuestions: number;
  averageScore: number;
  metrics: SpeechMetrics | null;
}

export class MockSessionManager {
  private sessionId: string;
  private config: MockSessionConfig;
  private startTime: number = 0;
  private endTime?: number;
  private currentQuestionIndex = 0;

  private recorder?: SessionRecorder;
  private metrics?: SpeechMetricsCalculator;

  constructor(config: MockSessionConfig) {
    this.validateConfig(config);
    this.config = config;
    this.sessionId = uuidv4();
  }

  get id(): string {
    return this.sessionId;
  }

  get currentIndex(): number {
    return this.currentQuestionIndex;
  }

  get isComplete(): boolean {
    return this.currentQuestionIndex >= this.config.questionCount;
  }

  get elapsedSeconds(): number {
    if (!this.startTime) return 0;
    const end = this.endTime ?? Date.now();
    return Math.floor((end - this.startTime) / 1000);
  }

  get remainingSeconds(): number {
    const total = this.config.durationMinutes * 60;
    return Math.max(0, total - this.elapsedSeconds);
  }

  /* ──────────────────────────────────────────────────────────── */
  /* Lifecycle                                                    */
  /* ──────────────────────────────────────────────────────────── */

  async initialize(): Promise<void> {
    this.startTime = Date.now();

    if (this.config.enableRecording) {
      this.recorder = new SessionRecorder(this.sessionId, {
        encrypted: true,
        format: "webm-opus",
      });
      await this.recorder.start();
    }

    if (this.config.enableMetrics) {
      this.metrics = new SpeechMetricsCalculator((_metrics) => {
        // Hook for UI/store; you can inject a callback later if needed.
      });
      this.metrics.calibrate();
    }
  }

  async getNextQuestion(): Promise<string> {
    if (this.isComplete) {
      return "Thank you for your time. Do you have any questions for us?";
    }

    const personality = this.selectPersonality();

    const question = await generateInterviewerQuestion({
      sessionId: this.sessionId,
      questionIndex: this.currentQuestionIndex,
      personality,
    });

    this.currentQuestionIndex += 1;

    return question;
  }

  async submitAnswer(answer: string): Promise<QuestionFeedback> {
    const metricsSnapshot =
      this.metrics?.getMetrics() ?? undefined;

    const feedback = await scoreAnswer({
      sessionId: this.sessionId,
      questionIndex: this.currentQuestionIndex - 1,
      answer,
      metrics: metricsSnapshot,
    });

    return {
      score: feedback.score,
      notes: feedback.notes,
      metricsSnapshot,
    };
  }

  async end(): Promise<SessionScorecard> {
    this.endTime = Date.now();

    let finalAudioBlob: Blob | null = null;
    if (this.recorder) {
      finalAudioBlob = await this.recorder.stop();
      // You can pass this blob to an upload pipeline if needed.
    }

    const metrics = this.metrics?.getMetrics() ?? null;

    const scorecard: SessionScorecard = {
      sessionId: this.sessionId,
      startedAt: this.startTime,
      endedAt: this.endTime,
      totalQuestions: this.config.questionCount,
      answeredQuestions: this.currentQuestionIndex,
      averageScore: 0, // populated by backend debrief later [file:1][file:3]
      metrics,
    };

    // TODO: Call start-session / end-session edge functions here or from the caller.

    return scorecard;
  }

  /* ──────────────────────────────────────────────────────────── */
  /* Personality selection                                        */
  /* ──────────────────────────────────────────────────────────── */

  private selectPersonality(): InterviewerPersonality {
    if (this.config.personalityType === "panel") {
      return getPanelPersonalityForIndex(this.currentQuestionIndex);
    }

    const p = getPersonalityById(this.config.personalityType);
    if (!p) {
      return getPanelPersonalityForIndex(this.currentQuestionIndex);
    }
    return p;
  }

  /* ──────────────────────────────────────────────────────────── */
  /* Validation                                                   */
  /* ──────────────────────────────────────────────────────────── */

  private validateConfig(config: MockSessionConfig) {
    if (config.durationMinutes < 15 || config.durationMinutes > 45) {
      throw new Error("durationMinutes must be between 15 and 45.");
    }
    if (config.questionCount < 5 || config.questionCount > 20) {
      throw new Error("questionCount must be between 5 and 20.");
    }
  }
}
