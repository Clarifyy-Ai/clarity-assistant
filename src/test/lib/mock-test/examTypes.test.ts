import { describe, expect, it } from "vitest";
import { registryCodeForConfigId } from "@/lib/mock-test/examTypes";

describe("registryCodeForConfigId", () => {
  it("returns null for CUSTOM, empty, and unregistered codes", () => {
    expect(registryCodeForConfigId("CUSTOM")).toBeNull();
    expect(registryCodeForConfigId("")).toBeNull();
    expect(registryCodeForConfigId("   ")).toBeNull();
    expect(registryCodeForConfigId("not-an-exam")).toBeNull();
  });

  it("maps known config ids to registry codes (identity where they match)", () => {
    expect(registryCodeForConfigId("JEE_MAIN")).toBe("JEE_MAIN");
    expect(registryCodeForConfigId("JEE_ADV")).toBe("JEE_ADV");
    expect(registryCodeForConfigId("NEET")).toBe("NEET");
    expect(registryCodeForConfigId("HPCL_ENGINEER")).toBe("HPCL_ENGINEER");
    expect(registryCodeForConfigId("PSU")).toBe("PSU");
    expect(registryCodeForConfigId("SSC_CGL")).toBe("SSC_CGL");
    expect(registryCodeForConfigId("IBPS_PO")).toBe("IBPS_PO");
    expect(registryCodeForConfigId("RRB_NTPC")).toBe("RRB_NTPC");
  });

  it("maps UPSC and APPSC aliases onto seeded registry codes", () => {
    expect(registryCodeForConfigId("UPSC")).toBe("UPSC_CSE_PRELIMS");
    expect(registryCodeForConfigId("UPSC_CSE_PRELIMS")).toBe("UPSC_CSE_PRELIMS");
    expect(registryCodeForConfigId("APPSC_GROUP")).toBe("APPSC_GROUP2");
    expect(registryCodeForConfigId("APPSC_GROUP2")).toBe("APPSC_GROUP2");
    expect(registryCodeForConfigId("TSPSC")).toBe("TSPSC_GROUP2");
    expect(registryCodeForConfigId("TSPSC_GROUP")).toBe("TSPSC_GROUP2");
    expect(registryCodeForConfigId("TSPSC_GROUP2")).toBe("TSPSC_GROUP2");
  });

  it("maps storage / display labels used in questions.exam_type", () => {
    expect(registryCodeForConfigId("JEE Main")).toBe("JEE_MAIN");
    expect(registryCodeForConfigId("JEE Advanced")).toBe("JEE_ADV");
    expect(registryCodeForConfigId("NEET UG")).toBe("NEET");
    expect(registryCodeForConfigId("HPCL Engineer")).toBe("HPCL_ENGINEER");
    expect(registryCodeForConfigId("UPSC CSE")).toBe("UPSC_CSE_PRELIMS");
    expect(registryCodeForConfigId("SSC Exams (CGL/CHSL)")).toBe("SSC_CGL");
    expect(registryCodeForConfigId("Banking (IBPS/SBI/RBI)")).toBe("IBPS_PO");
    expect(registryCodeForConfigId("RRB NTPC")).toBe("RRB_NTPC");
    expect(registryCodeForConfigId("APPSC (Group 1/2/3/4)")).toBe("APPSC_GROUP2");
    expect(registryCodeForConfigId("TSPSC (Group 1/2/3/4)")).toBe("TSPSC_GROUP2");
  });
});
