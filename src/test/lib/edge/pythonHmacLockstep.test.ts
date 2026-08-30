import { createHash, createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const sharedDir = path.join(root, "supabase/functions/_shared");

const GOLDEN = {
  secret: "a".repeat(32),
  method: "POST",
  path: "/internal/gov-exams/availability",
  timestamp: "1700000000",
  requestId: "edge-testreq01",
  body: '{"job_id":"1"}',
  bodyDigest: "00b5fec95baaef2391377f8b4bbf4d8a78f0e6f577e123dbf25516cb2385999c",
  signature: "5ab85a6bbb6582b8a39d3cae81a6441f9530156adaf4e6876857e2bce5705778",
};

function signInternalHeaders(
  secret: string,
  method: string,
  pathName: string,
  timestamp: string,
  requestId: string,
  body: string,
): Record<string, string> {
  const normalized = pathName.startsWith("/") ? pathName : `/${pathName}`;
  const bodyDigest = createHash("sha256").update(body, "utf8").digest("hex");
  const message = [method.toUpperCase(), normalized, timestamp, requestId, bodyDigest].join("\n");
  const signature = createHmac("sha256", secret).update(message).digest("hex");
  return {
    "X-Internal-Timestamp": timestamp,
    "X-Request-ID": requestId,
    "X-Internal-Signature": `sha256=${signature}`,
  };
}

describe("Edge Python HMAC lockstep", () => {
  it("gov-exam client signs via pythonClient.signInternalRequest", () => {
    const gov = fs.readFileSync(path.join(sharedDir, "pythonGovExamClient.ts"), "utf8");
    const client = fs.readFileSync(path.join(sharedDir, "pythonClient.ts"), "utf8");
    expect(gov).toContain('from "./pythonClient.ts"');
    expect(gov).toContain("signInternalRequest");
    expect(gov).not.toMatch(/async function hmacSha256Hex/);
    expect(gov).not.toMatch(/const canonical = \[method/);
    expect(client).toContain("export async function signInternalRequest");
    expect(client).toContain("export function canonicalInternalAuthMessage");
  });

  it("canonical message + HMAC matches the Python FastAPI fixture", () => {
    const headers = signInternalHeaders(
      GOLDEN.secret,
      GOLDEN.method,
      GOLDEN.path,
      GOLDEN.timestamp,
      GOLDEN.requestId,
      GOLDEN.body,
    );
    const digest = createHash("sha256").update(GOLDEN.body, "utf8").digest("hex");
    expect(digest).toBe(GOLDEN.bodyDigest);
    expect(headers["X-Internal-Signature"]).toBe(`sha256=${GOLDEN.signature}`);
    expect(headers["X-Internal-Timestamp"]).toBe(GOLDEN.timestamp);
    expect(headers["X-Request-ID"]).toBe(GOLDEN.requestId);
  });
});
