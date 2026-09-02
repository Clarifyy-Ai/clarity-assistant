import { describe, expect, it } from "vitest";
import {
  getOrLoadPublicContent,
  invalidatePublicContentCache,
  publicContentCacheGeneration,
} from "@/lib/cms/publicContentCache";

describe("publicContentCache", () => {
  it("returns cached value until invalidate", async () => {
    invalidatePublicContentCache();
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return { slug: "credits" };
    };
    const a = await getOrLoadPublicContent("help:list", loader, 60_000);
    const b = await getOrLoadPublicContent("help:list", loader, 60_000);
    expect(a).toEqual(b);
    expect(loads).toBe(1);

    const gen = publicContentCacheGeneration();
    invalidatePublicContentCache("help");
    expect(publicContentCacheGeneration()).toBe(gen + 1);

    await getOrLoadPublicContent("help:list", loader, 60_000);
    expect(loads).toBe(2);
  });
});
