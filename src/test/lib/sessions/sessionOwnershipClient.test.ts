import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("session ownership — client defense in depth", () => {
  it("useScorecard scopes reads to the authenticated user", () => {
    const hook = read("src/hooks/useScorecard.ts");
    expect(hook).toContain("getBySessionIdForUser(sessionId, userId)");
    expect(hook).toContain("listBySessionIdForUser(sessionId, userId)");
    expect(hook).toContain("markShared(sessionId, userId, token)");
    expect(hook).not.toContain("getBySessionId(sessionId)");
    expect(hook).not.toContain("listBySessionId(sessionId)");
  });

  it("DebriefDetail scopes transcript reads and share updates to the owner", () => {
    const page = read("src/pages/app/debrief/DebriefDetail.tsx");
    expect(page).toContain("sessionDebriefsDB.getByIdForUser(id, user.id)");
    expect(page).toContain("sessionsDB.getByIdForUser(id, user.id)");
    expect(page).toContain("getBySessionIdForUser(");
    expect(page).toContain("listSegmentsBySessionIdForUser(");
    expect(page).toContain("markShared(debrief.session_id, user.id, token)");
    expect(page).not.toContain("sessionTranscriptsDB.getBySessionId(");
    expect(page).not.toContain("sessionTranscriptsDB.listSegmentsBySessionId(");
  });

  it("SessionDetail loads through owner-scoped RPC with user_id fallback", () => {
    const page = read("src/pages/app/sessions/SessionDetail.tsx");
    const loader = read("src/lib/sessions/ownedSessionDetail.ts");
    expect(page).toContain("loadOwnedSessionDetail(id, user.id)");
    expect(loader).toContain("get_owned_session_detail");
    expect(loader).toContain("getByIdForUser(sessionId, userId)");
    expect(loader).toContain("listBySessionIdForUser(sessionId, userId)");
  });

  it("sessionTranscriptsDB exposes owner-scoped read helpers", () => {
    const db = read("src/lib/supabase/database.ts");
    expect(db).toContain("async getBySessionIdForUser(sessionId: string, userId: string)");
    expect(db).toContain("async listSegmentsBySessionIdForUser(");
    expect(db).toMatch(/markShared\(sessionId: string, userId: string, token: string\)/);
  });

  it("MockSession checkpoints use updateForUser", () => {
    const page = read("src/pages/app/mock/MockSession.tsx");
    expect(page).toContain("sessionsDB.updateForUser(sessionId, userId,");
    expect(page).toContain("sessionsDB.updateForUser(dbSessionId, userId,");
    expect(page).toContain("sessionsDB.getByIdForUser(sessionIdFromRoute!, profile.id)");
  });
});

describe("session ownership — RLS migration contract", () => {
  it("session_answers and session_transcripts writes require owned session_id", () => {
    const sql = read(
      "supabase/migrations/20260902260000_session_artifact_session_ownership_rls.sql",
    );
    expect(sql).toContain("session_answers_own_insert");
    expect(sql).toContain("session_transcripts_own_insert");
    expect(sql).toContain("FROM public.sessions s");
    expect(sql).toContain("s.user_id = auth.uid()");
    expect(sql).not.toMatch(/service_role/i);
  });
});

describe("session ownership — edge functions", () => {
  it("start-exam and save-test-answer enforce mock_tests ownership", () => {
    const startExam = read("supabase/functions/start-exam/index.ts");
    const saveAnswer = read("supabase/functions/save-test-answer/index.ts");
    expect(startExam).toContain('.eq("user_id", user.id)');
    expect(startExam).toContain("start_owned_mock_test");
    expect(saveAnswer).toContain("save_owned_test_answer");
    expect(saveAnswer).toContain("createUserScopedClient");
  });

  it("generate-debrief verifies session ownership server-side", () => {
    const fn = read("supabase/functions/generate-debrief/index.ts");
    expect(fn).toContain("enforceAiSessionAccess");
    expect(fn).toContain('.eq("user_id", user.id)');
  });
});

describe("session ownership — route guards", () => {
  it("App shell routes require onboarded + verified auth", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("<ProtectedRoute requireOnboarded requireEmailVerification />");
    expect(app).toContain('path: "debriefs/:id"');
    expect(app).toContain('path: "sessions/:id"');
    expect(app).toContain('path: "scorecard/:sessionId"');
  });

  it("ProtectedRoute always enforces email verification for authenticated users", () => {
    const guard = read("src/components/layout/ProtectedRoute.tsx");
    expect(guard).toContain("if (!isUserEmailConfirmed(user))");
    expect(guard).not.toMatch(/requireEmailVerification && !isUserEmailConfirmed/);
  });
});
