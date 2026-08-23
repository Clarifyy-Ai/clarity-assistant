import { describe, expect, it } from "vitest";
import { validateSystemDesignOutput } from "@/lib/prep/systemDesignOutput";

describe("validateSystemDesignOutput", () => {
  it("accepts a well-formed multi-section design", () => {
    const text = `
## 1. Requirements
Need low latency reads and durable writes for a social feed.

## 2. High-level architecture
Clients talk to API gateway, then feed service and media store.

## 3. Data model
Posts table with user_id, content, created_at; fan-out cache.

## 4. Scaling
Shard by user, CDN for media, read replicas for feed queries.

## 5. Tradeoffs
Consistency vs fan-out cost; eventual consistency for likes.
`;
    expect(validateSystemDesignOutput(text).ok).toBe(true);
  });

  it("rejects empty or short output", () => {
    expect(validateSystemDesignOutput("").ok).toBe(false);
    expect(validateSystemDesignOutput("too short").ok).toBe(false);
  });

  it("rejects output missing core sections", () => {
    const text = "Just some prose without any design structure at all. ".repeat(10);
    expect(validateSystemDesignOutput(text).ok).toBe(false);
  });
});
