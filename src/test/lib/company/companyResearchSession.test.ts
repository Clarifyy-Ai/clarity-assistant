import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  saveActiveCompanyJob,
  loadActiveCompanyJob,
  clearActiveCompanyJob,
} from "@/lib/company/companyResearchSession";

describe("companyResearchSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("saves and loads active job for matching user", () => {
    saveActiveCompanyJob({
      jobId: "job-1",
      company: "Acme Corp",
      role: "Engineer",
      userId: "user-a",
      companyNormalized: "acme corp",
    });
    const loaded = loadActiveCompanyJob("user-a");
    expect(loaded?.jobId).toBe("job-1");
    expect(loaded?.company).toBe("Acme Corp");
    expect(loaded?.companyNormalized).toBe("acme corp");
  });

  it("returns null when user id does not match", () => {
    saveActiveCompanyJob({
      jobId: "job-1",
      company: "Acme",
      role: "",
      userId: "user-a",
    });
    expect(loadActiveCompanyJob("user-b")).toBeNull();
  });

  it("clears stored job", () => {
    saveActiveCompanyJob({
      jobId: "job-1",
      company: "Acme",
      role: "",
      userId: "user-a",
    });
    clearActiveCompanyJob("job-1");
    expect(loadActiveCompanyJob("user-a")).toBeNull();
  });

  it("does not clear when job id differs", () => {
    saveActiveCompanyJob({
      jobId: "job-1",
      company: "Acme",
      role: "",
      userId: "user-a",
    });
    clearActiveCompanyJob("job-other");
    expect(loadActiveCompanyJob("user-a")?.jobId).toBe("job-1");
  });
});
