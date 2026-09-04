// get-user-storage-usage — owner-scoped storage metrics (JWT only; no fabricated GB)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";

type SegmentStatus = "ok" | "unavailable";

type StorageSegment = {
  count: number;
  bytes: number | null;
  status: SegmentStatus;
  reason?: string;
};

function jsonResponse(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function estimateRowsBytes(rows: unknown[]): number {
  let total = 0;
  for (const row of rows) {
    try {
      total += utf8Bytes(JSON.stringify(row));
    } catch {
      total += 256;
    }
  }
  return total;
}

function okSegment(count: number, bytes: number): StorageSegment {
  return { count, bytes, status: "ok" };
}

function unavailableSegment(reason: string, count = 0): StorageSegment {
  return { count, bytes: null, status: "unavailable", reason };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const userId = auth.context.user.id;
    const db = createServiceClient();

    let sessions: StorageSegment;
    try {
      const { data, error } = await db
        .from("sessions")
        .select("id, title, summary, session_type, status, created_at, duration_seconds")
        .eq("user_id", userId);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      sessions = okSegment(rows.length, estimateRowsBytes(rows));
    } catch (err) {
      sessions = unavailableSegment(
        err instanceof Error ? err.message : "Sessions could not be measured.",
      );
    }

    let transcripts: StorageSegment;
    try {
      const [st, tr] = await Promise.all([
        db
          .from("session_transcripts")
          .select("id, session_id, content, created_at")
          .eq("user_id", userId),
        db
          .from("transcripts")
          .select("id, session_id, content, created_at")
          .eq("user_id", userId),
      ]);
      if (st.error && tr.error) {
        throw st.error ?? tr.error;
      }
      const rows = [
        ...(Array.isArray(st.data) ? st.data : []),
        ...(Array.isArray(tr.data) ? tr.data : []),
      ];
      transcripts = okSegment(rows.length, estimateRowsBytes(rows));
    } catch (err) {
      transcripts = unavailableSegment(
        err instanceof Error ? err.message : "Transcripts could not be measured.",
      );
    }

    let documents: StorageSegment;
    try {
      const { data: docs, error: docsError } = await db
        .from("personal_library_documents")
        .select("id, storage_path, file_size, title, created_at")
        .eq("owner_id", userId);
      if (docsError) throw docsError;
      const rows = Array.isArray(docs) ? docs : [];

      let bytesFromDb = 0;
      let hasDbSize = false;
      for (const row of rows) {
        const size = Number((row as { file_size?: unknown }).file_size);
        if (Number.isFinite(size) && size >= 0) {
          bytesFromDb += size;
          hasDbSize = true;
        }
      }

      let bytesFromStorage: number | null = null;
      try {
        const { data: listed, error: listError } = await db.storage
          .from("documents")
          .list(userId, { limit: 1000, offset: 0 });
        if (listError) throw listError;
        bytesFromStorage = (listed ?? []).reduce((sum, item) => {
          const meta = item.metadata as { size?: unknown } | null;
          const size = Number(meta?.size);
          return sum + (Number.isFinite(size) && size >= 0 ? size : 0);
        }, 0);
      } catch {
        bytesFromStorage = null;
      }

      if (bytesFromStorage != null) {
        documents = okSegment(rows.length, bytesFromStorage);
      } else if (hasDbSize) {
        documents = okSegment(rows.length, bytesFromDb);
      } else if (rows.length === 0) {
        documents = okSegment(0, 0);
      } else {
        documents = unavailableSegment(
          "Document file sizes are not available from storage metadata.",
          rows.length,
        );
      }
    } catch (err) {
      documents = unavailableSegment(
        err instanceof Error ? err.message : "Documents could not be measured.",
      );
    }

    const segments = [sessions, transcripts, documents];
    const allOk = segments.every((s) => s.status === "ok");
    const anyBytes = segments
      .map((s) => s.bytes)
      .filter((b): b is number => typeof b === "number");
    const totalCount = segments.reduce((n, s) => n + s.count, 0);
    const total: StorageSegment = allOk
      ? okSegment(
          totalCount,
          anyBytes.reduce((a, b) => a + b, 0),
        )
      : {
          count: totalCount,
          bytes: anyBytes.length === segments.length
            ? anyBytes.reduce((a, b) => a + b, 0)
            : null,
          status: "unavailable",
          reason: "One or more storage segments could not be fully measured.",
        };

    return jsonResponse(req, 200, {
      success: true,
      sessions,
      transcripts,
      documents,
      total,
      measured_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[get-user-storage-usage]", err);
    return jsonResponse(req, 500, {
      success: false,
      code: "STORAGE_USAGE_FAILED",
      error: "Storage usage could not be loaded.",
    });
  }
});
