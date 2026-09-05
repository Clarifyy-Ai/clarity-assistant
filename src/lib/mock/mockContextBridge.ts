/**
 * Mock session frozen context bridge — readable by useSessionOrchestrator without overlay.
 */
import type { InterviewContextSnapshot } from "@/lib/mock/interviewContext";

let activeSnapshot: InterviewContextSnapshot | null = null;

export function setMockInterviewContext(snapshot: InterviewContextSnapshot | null): void {
  activeSnapshot = snapshot;
}

export function getMockInterviewContext(): InterviewContextSnapshot | null {
  return activeSnapshot;
}

export function clearMockInterviewContext(): void {
  activeSnapshot = null;
}
