import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertBillingCspAllowsRazorpay,
} from "@/lib/billing/billingCsp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("billing CSP allowlist", () => {
  it("index.html allows Razorpay checkout and risk-detection scripts", () => {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const missing = assertBillingCspAllowsRazorpay(html);
    expect(missing).toEqual([]);
    expect(html).toContain("cdn.razorpay.com");
    expect(html).toContain("https://*.razorpay.com");
  });
});
